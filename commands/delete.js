const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('投票を削除します（作成者のみ）')
        .addIntegerOption(option =>
            option.setName('poll_id')
                .setDescription('削除する投票ID（Embedフッター参照）')
                .setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const pollId = interaction.options.getInteger('poll_id');
            
            // データベースから投票を取得
            const poll = await interaction.client.database.getPollById(pollId);
            
            if (!poll) {
                await interaction.editReply({ content: '❌ 指定された投票が見つかりませんでした。' });
                return;
            }

            // 作成者チェック
            if (poll.creator_id !== interaction.user.id) {
                await interaction.editReply({ content: '❌ 投票の作成者のみが削除できます。' });
                return;
            }

            // 確認用のEmbedを作成
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ 投票削除の確認')
                .setDescription(`以下の投票を削除しますか？\n\n**${poll.title}**（投票ID: ${poll.id}）`)
                .setColor(0xFF6B6B)
                .addFields(
                    {
                        name: '📊 投票タイプ',
                        value: getPollTypeName(poll.poll_type),
                        inline: true
                    },
                    {
                        name: '🗳️ 投票数',
                        value: `${Object.values(poll.votes).reduce((sum, voters) => sum + voters.length, 0)}票`,
                        inline: true
                    },
                    {
                        name: '📅 作成日',
                        value: moment(poll.created_at).tz('Asia/Tokyo').format('YYYY/MM/DD HH:mm'),
                        inline: true
                    }
                )
                .setTimestamp();

            // 確認ボタンを作成
            const confirmButton = new ButtonBuilder()
                .setCustomId(`delete_confirm_${poll.id}`)
                .setLabel('削除する')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️');

            const cancelButton = new ButtonBuilder()
                .setCustomId(`delete_cancel_${poll.id}`)
                .setLabel('キャンセル')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❌');

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

        } catch (error) {
            console.error('deleteコマンドエラー:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ 投票削除処理中にエラーが発生しました。' });
                } else {
                    await interaction.reply({ content: '❌ 投票削除処理中にエラーが発生しました。', flags: 64 });
                }
            } catch {}
        }
    },
};

// 投票タイプ名を取得する関数
function getPollTypeName(type) {
    const typeNames = {
        'schedule': '📅 カレンダー形式',
        'all_day': '📆 日付調整',
        'half_day': '⏰ 日付+時間帯',
        'specific': '🎯 具体的時間'
    };
    return typeNames[type] || type;
}
