const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoremind')
        .setDescription('投票参加者へ指定日時に自動リマインダーを送信します'),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: 64 });

            const polls = await interaction.client.database.getActivePolls(interaction.guild.id);
            if (!polls || polls.length === 0) {
                await interaction.editReply({ content: '❌ アクティブな投票が見つかりません。' });
                return;
            }

            const options = polls.map(p => ({
                label: p.title.length > 100 ? p.title.slice(0, 97) + '...' : p.title,
                value: p.id.toString(),
                description: `投票ID: ${p.id}`
            }));

            const select = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('autoremind_poll_select')
                    .setPlaceholder('自動リマインドする投票を選択')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(options)
            );

            const embed = new EmbedBuilder()
                .setTitle('⏰ 自動リマインド設定')
                .setDescription('投票を選択後、日時とメッセージを入力してください。')
                .setColor(0x32CD32)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], components: [select] });
        } catch (error) {
            console.error('autoremindコマンドエラー:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: '❌ 自動リマインド設定中にエラーが発生しました。' });
            } else {
                await interaction.reply({ content: '❌ 自動リマインド設定中にエラーが発生しました。', flags: 64 });
            }
        }
    }
};




