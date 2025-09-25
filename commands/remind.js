const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('投票に参加した人全員にリマインダーを送信します'),

    async execute(interaction) {
        try {
            console.log('remindコマンド実行開始:', { userId: interaction.user.id, guildId: interaction.guild.id });

            // アクティブな投票を取得
            const polls = await interaction.client.database.getActivePolls(interaction.guild.id);
            
            if (polls.length === 0) {
                await interaction.reply({
                    content: '❌ アクティブな投票が見つかりませんでした。',
                    flags: 64
                });
                return;
            }

            // 投票選択用のSelectMenuを作成
            const selectOptions = polls.map((poll, index) => ({
                label: poll.title.length > 100 ? poll.title.substring(0, 97) + '...' : poll.title,
                value: poll.id.toString(),
                description: `投票ID: ${poll.id}`
            }));

            const selectMenu = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('remind_poll_select')
                        .setPlaceholder('リマインダーを送信する投票を選択してください')
                        .setMinValues(1)
                        .setMaxValues(1)
                        .addOptions(selectOptions)
                );

            const embed = new EmbedBuilder()
                .setTitle('⏰ リマインダー送信')
                .setDescription('リマインダーを送信する投票を選択してください。\n選択した投票に参加した人全員に即座にリマインダーが送信されます。')
                .setColor(0xFFA500)
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                components: [selectMenu],
                flags: 64
            });

            console.log('remindコマンド実行完了');

        } catch (error) {
            console.error('remindコマンドエラー:', error);
            await interaction.reply({
                content: '❌ リマインダー送信中にエラーが発生しました。',
                flags: 64
            });
        }
    },
};
