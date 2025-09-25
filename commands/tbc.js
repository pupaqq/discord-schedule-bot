const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tbc')
        .setDescription('投票結果を公開して日程を確定します')
        .addIntegerOption(option =>
            option.setName('poll_id')
                .setDescription('投票ID（Embedフッター参照）')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const pollId = interaction.options.getInteger('poll_id');
            const poll = await interaction.client.database.getPollById(pollId);

            if (!poll) {
                await interaction.editReply({ content: '❌ 投票が見つかりません。' });
                return;
            }

            // 投票結果を取得
            const votes = await interaction.client.database.getVotes(poll.id);

            if (votes.length === 0) {
                await interaction.editReply({
                    content: '❌ まだ投票がありません。'
                });
                return;
            }

            // 投票結果を集計
            const voteCounts = {};
            const userVotes = {};

            for (const vote of votes) {
                const optionIndex = vote.option_index;
                const userId = vote.user_id;
                
                if (!voteCounts[optionIndex]) {
                    voteCounts[optionIndex] = 0;
                }
                voteCounts[optionIndex]++;

                if (!userVotes[userId]) {
                    userVotes[userId] = [];
                }
                userVotes[userId].push(optionIndex);
            }

            // 結果をソート（投票数順）
            const sortedResults = Object.entries(voteCounts)
                .map(([optionIndex, count]) => ({
                    optionIndex: parseInt(optionIndex),
                    count: count,
                    option: poll.options[parseInt(optionIndex)]
                }))
                .sort((a, b) => b.count - a.count);

            // Embedを作成
            const embed = new EmbedBuilder()
                .setTitle(`📊 投票結果: ${poll.title}`)
                .setDescription((poll.description || '日程調整投票の結果') + `\n投票ID: ${poll.id}`)
                .setColor(0x00AE86)
                .setTimestamp();

            // 結果を表示
            let resultText = '';
            sortedResults.forEach((result, index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📅';
                resultText += `${emoji} **${result.option}** - ${result.count}票\n`;
            });

            embed.addFields({
                name: '📈 投票結果',
                value: resultText || '結果なし',
                inline: false
            });

            // 参加者一覧
            let participantsText = '';
            Object.entries(userVotes).forEach(([userId, optionIndices]) => {
                const selectedOptions = optionIndices.map(idx => poll.options[idx]).join(', ');
                participantsText += `👤 <@${userId}>: ${selectedOptions}\n`;
            });

            if (participantsText) {
                embed.addFields({
                    name: '👥 参加者の選択',
                    value: participantsText,
                    inline: false
                });
            }

            // 確定ボタン
            const confirmButton = new ButtonBuilder()
                .setCustomId('tbc_confirm')
                .setLabel('✅ 日程を確定')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('tbc_cancel')
                .setLabel('❌ キャンセル')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('tbcコマンドエラー:', error);
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ 投票結果取得中にエラーが発生しました。'
                    });
                } else {
                    await interaction.reply({
                        content: '❌ 投票結果取得中にエラーが発生しました。',
                        flags: 64
                    });
                }
            } catch (replyError) {
                console.error('エラーレスポンス送信失敗:', replyError);
            }
        }
    },
};
