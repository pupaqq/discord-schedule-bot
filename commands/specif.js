const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment-timezone');
const PollUtils = require('../utils/pollUtils');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('specif')
        .setDescription('カレンダー形式で日程調整投票を作成します')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('投票のタイトル')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('投票の説明（任意）')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description') || '';

            // セッションデータを初期化
            if (!interaction.client.scheduleSessions) {
                interaction.client.scheduleSessions = new Map();
            }

            const sessionData = {
                title: title,
                description: description,
                selectedDates: [],
                selectedTimes: [],
                candidates: [],
                creatorId: interaction.user.id,
                messageId: null
            };

            interaction.client.scheduleSessions.set(interaction.message?.id || 'temp', sessionData);

            // 調整さん風のEmbedを作成
            const scheduleEmbed = new EmbedBuilder()
                .setTitle(`📅 ${title}`)
                .setDescription(description || '日程調整投票')
                .setColor(0x00AE86)
                .setTimestamp();

            // 現在の月を表示
            const currentMonth = moment().tz(config.DEFAULT_TIMEZONE);
            scheduleEmbed.addFields({
                name: `📆 ${currentMonth.format('YYYY年MM月')} の日程選択`,
                value: '日付と時間を選択してください',
                inline: false
            });

            // 月選択ボタンを作成
            const monthButtons = createMonthButtons(currentMonth);
            const monthRow = new ActionRowBuilder().addComponents(...monthButtons);

            // 日付選択（ページング: 1–15 / 16–31）
            const page = 1;
            const dateButtons = createDateButtonsForMonth(currentMonth, page);
            const dateRows = [];
            for (let i = 0; i < dateButtons.length; i += 5) {
                const buttonRow = dateButtons.slice(i, i + 5);
                if (buttonRow.length > 0) {
                    dateRows.push(new ActionRowBuilder().addComponents(...buttonRow));
                }
            }

            // 時間選択メニューは初期表示では省略（行数を5以内に収めるため）

            // 候補追加 + ページングボタン（同一行に設置）
            const addCandidateButton = new ButtonBuilder()
                .setCustomId('specif_add_candidate')
                .setLabel('候補を追加')
                .setStyle(ButtonStyle.Success)
                .setEmoji('➕');

            const hasSecondPage = currentMonth.daysInMonth() > 15;
            const prevBtn = new ButtonBuilder()
                .setCustomId('specif_page_1')
                .setLabel('1–15')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);
            const nextBtn = new ButtonBuilder()
                .setCustomId('specif_page_2')
                .setLabel('16–31')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!hasSecondPage);

            const addRow = new ActionRowBuilder().addComponents(addCandidateButton, prevBtn, nextBtn);

            // コンポーネントを最大5行に制限
            const allComponents = [monthRow, ...dateRows, addRow];
            const limitedComponents = allComponents.slice(0, 5);

            // メッセージを送信
            const sent = await interaction.editReply({
                embeds: [scheduleEmbed],
                components: limitedComponents
            });

            // セッションに現在月とページを保存（メッセージIDキー）
            interaction.client.scheduleSessions.set(sent.id, {
                ...sessionData,
                currentMonth: currentMonth.format('YYYY-MM'),
                page: 1
            });

            // specif用セッション（タイトル・説明を保持して投票作成時に使用）
            if (!interaction.client.specifSessions) interaction.client.specifSessions = new Map();
            interaction.client.specifSessions.set(sent.id, {
                title,
                description,
                selectedDates: [],
                selectedTimes: [],
                candidates: []
            });

        } catch (error) {
            console.error('specifコマンドエラー:', error);
            
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

// 月選択ボタン作成関数
function createMonthButtons(currentMonth) {
    const prev = currentMonth.clone().add(-1, 'month');
    const curr = currentMonth.clone();
    const next = currentMonth.clone().add(1, 'month');

    return [
        new ButtonBuilder()
            .setCustomId(`specif_month_${prev.format('YYYY-MM')}`)
            .setLabel(`${prev.format('M月')}`)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`specif_month_${curr.format('YYYY-MM')}`)
            .setLabel(`${curr.format('M月')}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`specif_month_${next.format('YYYY-MM')}`)
            .setLabel(`${next.format('M月')}`)
            .setStyle(ButtonStyle.Secondary)
    ];
}

// 月の日付ボタン作成関数（ページング対応）
function createDateButtonsForMonth(month, page = 1) {
    const buttons = [];
    const today = moment().tz(config.DEFAULT_TIMEZONE);
    const daysInMonth = month.daysInMonth();
    const startDay = page === 1 ? 1 : 16;
    const endDay = page === 1 ? Math.min(15, daysInMonth) : daysInMonth;

    for (let day = startDay; day <= endDay; day++) {
        const date = month.clone().date(day);
        const dateStr = date.format('YYYY-MM-DD');
        const isToday = date.isSame(today, 'day');
        const isPast = date.isBefore(today, 'day');
        
        let style = ButtonStyle.Primary;
        let label = day.toString();
        
        if (isToday) {
            style = ButtonStyle.Success;
            label = `[${day}]`;
        } else if (isPast) {
            style = ButtonStyle.Secondary;
            label = `~~${day}~~`;
        }
        
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`specif_date_${dateStr}`)
                .setLabel(label)
                .setStyle(style)
                .setDisabled(isPast)
        );
    }
    
    return buttons;
}

// 時間選択メニュー作成関数
function createTimeSelectMenu() {
    const timeOptions = [
        { label: '🌅 午前 (9:00-12:00)', value: 'morning', description: '午前中の時間帯' },
        { label: '☀️ 午後 (13:00-17:00)', value: 'afternoon', description: '午後の時間帯' },
        { label: '🌙 夜 (18:00-21:00)', value: 'evening', description: '夜の時間帯' },
        { label: '🌃 深夜 (22:00-24:00)', value: 'night', description: '深夜の時間帯' },
        { label: '🌄 早朝 (6:00-9:00)', value: 'early', description: '早朝の時間帯' }
    ];
    
    return new StringSelectMenuBuilder()
        .setCustomId('specif_time_select')
        .setPlaceholder('時間帯を選択してください（複数選択可能）')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(timeOptions);
}
