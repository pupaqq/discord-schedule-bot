const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment-timezone');
const PollUtils = require('../utils/pollUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('日付範囲と時間帯を指定して日程調整投票を作成します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('投票のタイトル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('開始日（YYYY/MM/DD形式）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('終了日（YYYY/MM/DD形式）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('times')
                .setDescription('時間（スラッシュ区切り、例：1800/1930/2045）')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('投票の説明（任意）')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('expire_hours')
                .setDescription('投票期限（時間、デフォルトは24時間）')
                .setMinValue(1)
                .setMaxValue(168)
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const title = interaction.options.getString('title');
            const fromDate = interaction.options.getString('from');
            const toDate = interaction.options.getString('to');
            const timesInput = interaction.options.getString('times');
            const description = interaction.options.getString('description') || '';
            const expireHours = interaction.options.getInteger('expire_hours') || 24;

            // 日付のパースと検証
            const fromMoment = moment(fromDate, 'YYYY/MM/DD');
            const toMoment = moment(toDate, 'YYYY/MM/DD');

            if (!fromMoment.isValid() || !toMoment.isValid()) {
                await interaction.editReply({
                    content: '❌ 日付の形式が正しくありません。YYYY/MM/DD形式で入力してください。'
                });
                return;
            }

            if (fromMoment.isAfter(toMoment)) {
                await interaction.editReply({
                    content: '❌ 開始日が終了日より後になっています。'
                });
                return;
            }

            // 時間のパース
            const timeStrings = timesInput.split('/').map(t => t.trim());
            const validTimes = [];
            const invalidTimes = [];

            for (const timeStr of timeStrings) {
                // HHMM形式の時間をパース
                const timeMatch = timeStr.match(/^(\d{1,2})(\d{2})$/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    
                    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                        validTimes.push({
                            hours: hours,
                            minutes: minutes,
                            display: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                        });
                    } else {
                        invalidTimes.push(timeStr);
                    }
                } else {
                    invalidTimes.push(timeStr);
                }
            }

            if (invalidTimes.length > 0) {
                await interaction.editReply({
                    content: `❌ 以下の時間形式が正しくありません：\n${invalidTimes.join('\n')}\n\n正しい形式：HHMM（例：1800, 1930, 2045）`
                });
                return;
            }

            if (validTimes.length === 0) {
                await interaction.editReply({
                    content: '❌ 有効な時間がありません。HHMM形式で入力してください（例：1800/1930/2045）。'
                });
                return;
            }

            // 候補を生成
            const candidates = [];
            const currentDate = fromMoment.clone();
            
            console.log('候補生成開始:', {
                fromDate: fromMoment.format('YYYY-MM-DD'),
                toDate: toMoment.format('YYYY-MM-DD'),
                validTimes: validTimes.length
            });
            
            while (currentDate.isSameOrBefore(toMoment)) {
                for (const time of validTimes) {
                    // 日本語の曜日マッピング
                    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                    const dayOfWeek = dayNames[currentDate.day()];
                    
                    const candidate = {
                        date: currentDate.format('YYYY-MM-DD'),
                        time: time,
                        displayText: `${currentDate.format('MM/DD')} (${dayOfWeek}) ${time.display}`,
                        id: `${currentDate.format('YYYY-MM-DD')}_${time.hours}${time.minutes.toString().padStart(2, '0')}`
                    };
                    candidates.push(candidate);
                }
                currentDate.add(1, 'day');
            }
            
            console.log('候補生成完了:', {
                candidatesCount: candidates.length,
                firstCandidate: candidates[0]
            });

            // 候補数が多すぎる場合の警告
            if (candidates.length > 50) {
                await interaction.editReply({
                    content: `❌ 候補が多すぎます（${candidates.length}個）。日付範囲を狭めるか時間帯を減らしてください。`
                });
                return;
            }

            // 時間をソート
            candidates.sort((a, b) => {
                const dateA = moment(a.date);
                const dateB = moment(b.date);
                if (dateA.isSame(dateB)) {
                    // 同じ日付の場合は時間順でソート
                    const timeA = a.time.hours * 60 + a.time.minutes;
                    const timeB = b.time.hours * 60 + b.time.minutes;
                    return timeA - timeB;
                }
                return dateA.diff(b.date);
            });

            // 投票期限を計算
            const expiresAt = moment().add(expireHours, 'hours').toISOString();

            // Embedを作成
            const embed = new EmbedBuilder()
                .setTitle(`📅 ${title}`)
                .setDescription(description || '日程調整投票')
                .setColor(0x00AE86)
                .setTimestamp();

            // 候補を表示（ページネーション対応）
            const candidatesPerPage = 20;
            const totalPages = Math.ceil(candidates.length / candidatesPerPage);
            const currentPage = 1;
            const startIndex = (currentPage - 1) * candidatesPerPage;
            const endIndex = Math.min(startIndex + candidatesPerPage, candidates.length);
            const pageCandidates = candidates.slice(startIndex, endIndex);

            embed.addFields({
                name: `📅 候補日程 (${currentPage}/${totalPages})`,
                value: pageCandidates.map((candidate, index) => 
                    `${startIndex + index + 1}. ${candidate.displayText}`
                ).join('\n'),
                inline: false
            });

            // 複数選択用のSelectMenuを作成
            const selectOptions = pageCandidates.map((candidate, index) => ({
                label: `${startIndex + index + 1}. ${candidate.displayText}`.substring(0, 100), // 100文字制限
                value: candidate.id, // これは '2024-01-15_1800' 形式
                description: `候補 ${startIndex + index + 1}`.substring(0, 100) // 100文字制限
            }));
            
            console.log('SelectMenu作成:', {
                pageCandidatesCount: pageCandidates.length,
                selectOptionsCount: selectOptions.length,
                candidatesTotal: candidates.length,
                firstOption: selectOptions[0]
            });

            const voteRows = [];
            
            // SelectMenuが空でない場合のみ作成
            if (selectOptions.length > 0) {
                console.log('SelectMenu構築開始:', {
                    selectOptionsLength: selectOptions.length,
                    maxValues: Math.min(selectOptions.length, 25),
                    customId: 'schedule_multi_select'
                });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('schedule_multi_select')
                    .setPlaceholder('候補を選択してください（複数選択可能）')
                    .setMinValues(1)
                    .setMaxValues(Math.min(selectOptions.length, 25)) // Discordの制限
                    .addOptions(selectOptions);

                console.log('SelectMenu構築完了:', {
                    componentsCount: 1,
                    optionsCount: selectOptions.length
                });

                voteRows.push(new ActionRowBuilder().addComponents(selectMenu));
                
                // 投票確定ボタンを追加
                const confirmButton = new ButtonBuilder()
                    .setCustomId('schedule_confirm_vote')
                    .setLabel('✅ 投票を確定')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅');
                
                const cancelButton = new ButtonBuilder()
                    .setCustomId('schedule_cancel_vote')
                    .setLabel('❌ 投票をキャンセル')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌');
                
                voteRows.push(new ActionRowBuilder().addComponents(confirmButton, cancelButton));
            } else {
                // 候補がない場合のエラーメッセージ
                await interaction.editReply({
                    content: '❌ 候補が生成されませんでした。日付範囲と時間を確認してください。'
                });
                return;
            }

            // ページネーションボタン（複数ページの場合）
            if (totalPages > 1) {
                const paginationButtons = [];
                if (currentPage > 1) {
                    paginationButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`schedule_page_${currentPage - 1}`)
                            .setLabel('◀️ 前のページ')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                if (currentPage < totalPages) {
                    paginationButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`schedule_page_${currentPage + 1}`)
                            .setLabel('次のページ ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                
                if (paginationButtons.length > 0) {
                    voteRows.push(new ActionRowBuilder().addComponents(...paginationButtons));
                }
            }

            // ActionRowの数を最大5個に制限
            const limitedVoteRows = voteRows.slice(0, 5);

            // 投票メッセージを送信
            let pollMessage;
            try {
                pollMessage = await interaction.editReply({
                    embeds: [embed],
                    components: limitedVoteRows
                });
            } catch (replyError) {
                console.error('メッセージ送信エラー:', replyError);
                // editReplyが失敗した場合は新しく送信
                pollMessage = await interaction.followUp({
                    embeds: [embed],
                    components: limitedVoteRows
                });
            }

            // データベースに投票を保存（messageIdを含む）
            console.log('データベース保存前:', {
                messageId: pollMessage.id,
                channelId: interaction.channel.id,
                guildId: interaction.guild.id,
                creatorId: interaction.user.id,
                title: title,
                candidatesCount: candidates.length
            });
            
            const pollId = await interaction.client.database.createPoll({
                messageId: pollMessage.id,
                channelId: interaction.channel.id,
                guildId: interaction.guild.id,
                creatorId: interaction.user.id,
                title: title,
                description: description,
                pollType: 'schedule',
                options: candidates.map(c => c.displayText),
                expiresAt: expiresAt
            });
            
            console.log('データベース保存後:', {
                pollId: pollId,
                messageId: pollMessage.id
            });

            // 成功メッセージ
            await interaction.followUp({
                content: `✅ 日程調整投票「${title}」を作成しました！\n📅 ${candidates.length}個の候補から選択してください。\n\n💡 SelectMenuで候補を選択してから「投票を確定」ボタンを押してください。`,
                flags: 64
            });

        } catch (error) {
            console.error('scheduleコマンドエラー:', error);
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ 日程調整作成中にエラーが発生しました。'
                    });
                } else {
                    await interaction.reply({
                        content: '❌ 日程調整作成中にエラーが発生しました。',
                        flags: 64
                    });
                }
            } catch (replyError) {
                console.error('エラーレスポンス送信失敗:', replyError);
            }
        }
    },
};



