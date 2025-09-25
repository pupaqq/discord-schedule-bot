const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('指定した日時の投票者にロールを付与します')
        .addSubcommand(subcommand =>
            subcommand
                .setName('role')
                .setDescription('投票者にロールを付与します')
                .addIntegerOption(option =>
                    option.setName('poll_id')
                        .setDescription('投票ID（Embedフッター参照）')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role_name')
                        .setDescription('ロール（オートコンプリート可）')
                        .setRequired(true)
                        .setAutocomplete(true))),

    async execute(interaction) {
        try {
            // サブコマンドの確認
            if (interaction.options.getSubcommand() !== 'role') {
                await interaction.reply({
                    content: '❌ 無効なサブコマンドです。',
                    flags: 64
                });
                return;
            }

            const pollId = interaction.options.getInteger('poll_id');
            const roleInput = interaction.options.getString('role_name');

            // ロール存在確認 & 権限チェック
            let role = interaction.guild.roles.cache.get(roleInput);
            if (!role) {
                role = interaction.guild.roles.cache.find(r => r.name === roleInput);
            }
            if (!role) {
                await interaction.reply({ content: `❌ ロールが見つかりませんでした。入力: ${roleInput}`, flags: 64 });
                return;
            }
            if (!interaction.guild.members.me.permissions.has('ManageRoles')) {
                await interaction.reply({ content: '❌ ロールを管理する権限がありません。', flags: 64 });
                return;
            }

            // 投票取得
            const poll = await interaction.client.database.getPollById(pollId);
            if (!poll) {
                await interaction.reply({ content: '❌ 指定の投票が見つかりません。', flags: 64 });
                return;
            }

            // セッション保存
            if (!interaction.client.addRoleSessions) {
                interaction.client.addRoleSessions = new Map();
            }
            interaction.client.addRoleSessions.set(interaction.user.id, {
                pollId: poll.id,
                roleId: role.id,
                roleName: role.name,
                ts: Date.now()
            });

            // remindと同様に候補選択のセレクトメニューを表示
            const options = poll.options.map((opt, idx) => ({
                label: opt.length > 100 ? opt.substring(0, 97) + '...' : opt,
                value: idx.toString(),
                description: `候補 #${idx + 1}`
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('addrole_option_select')
                    .setPlaceholder('ロールを付与する対象日時を選択してください')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(options)
            );

            await interaction.reply({
                content: `🎭 ロール付与: 「${role.name}」\n投票ID: ${poll.id} から対象日時を選択してください。`,
                components: [row],
                flags: 64
            });
            return;
        } catch (error) {
            console.error('addコマンドエラー:', error);
            try {
                await interaction.reply({ content: '❌ ロール付与開始中にエラーが発生しました。', flags: 64 });
            } catch {}
        }
    },
};
