const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('投票統計情報を表示します')
        .addStringOption(option =>
            option.setName('period')
                .setDescription('統計期間')
                .setRequired(false)
                .addChoices(
                    { name: '今日', value: 'today' },
                    { name: '今週', value: 'week' },
                    { name: '今月', value: 'month' },
                    { name: '全期間', value: 'all' }
                )),

    async execute(interaction) {
        try {
            const period = interaction.options.getString('period') || 'week';

            // 期間の計算
            let startDate;
            const now = moment().tz('Asia/Tokyo');
            
            switch (period) {
                case 'today':
                    startDate = now.clone().startOf('day');
                    break;
                case 'week':
                    startDate = now.clone().startOf('week');
                    break;
                case 'month':
                    startDate = now.clone().startOf('month');
                    break;
                case 'all':
                    startDate = null;
                    break;
                default:
                    startDate = now.clone().startOf('week');
            }

            // データベースから投票データを取得
            const polls = await interaction.client.database.getActivePolls(interaction.guild.id);
            
            // 期間でフィルタリング
            let filteredPolls = polls;
            if (startDate) {
                filteredPolls = polls.filter(poll => {
                    const pollDate = moment(poll.created_at).tz('Asia/Tokyo');
                    return pollDate.isSameOrAfter(startDate);
                });
            }

            // 統計情報を計算
            const totalPolls = filteredPolls.length;
            const pollTypes = {};
            const totalVotes = {};
            let mostPopularPoll = null;
            let maxVotes = 0;

            for (const poll of filteredPolls) {
                // 投票タイプ別の集計
                pollTypes[poll.poll_type] = (pollTypes[poll.poll_type] || 0) + 1;
                
                // 投票数を計算
                const votes = await interaction.client.database.getVotes(poll.id);
                const voteCount = votes.length;
                totalVotes[poll.poll_type] = (totalVotes[poll.poll_type] || 0) + voteCount;
                
                // 最も人気の投票を特定
                if (voteCount > maxVotes) {
                    maxVotes = voteCount;
                    mostPopularPoll = poll;
                }
            }

            // Embedを作成
            const embed = new EmbedBuilder()
                .setTitle('📊 投票統計情報')
                .setColor(0x00AE86)
                .setTimestamp();

            // 期間情報
            let periodText;
            switch (period) {
                case 'today':
                    periodText = '今日';
                    break;
                case 'week':
                    periodText = '今週';
                    break;
                case 'month':
                    periodText = '今月';
                    break;
                case 'all':
                    periodText = '全期間';
                    break;
            }
            
            embed.setDescription(`📅 統計期間: ${periodText}`);

            // 基本統計
            embed.addFields({
                name: '📈 基本統計',
                value: `総投票数: ${totalPolls}件\n総投票者数: ${Object.values(totalVotes).reduce((sum, count) => sum + count, 0)}票`,
                inline: false
            });

            // 投票タイプ別統計
            if (Object.keys(pollTypes).length > 0) {
                const typeStats = Object.entries(pollTypes).map(([type, count]) => {
                    const typeNames = {
                        'schedule': '📅 カレンダー形式',
                        'all_day': '📆 日付調整',
                        'half_day': '⏰ 日付+時間帯',
                        'specific': '🎯 具体的時間'
                    };
                    const votes = totalVotes[type] || 0;
                    return `${typeNames[type] || type}: ${count}件 (${votes}票)`;
                }).join('\n');

                embed.addFields({
                    name: '📋 投票タイプ別',
                    value: typeStats,
                    inline: false
                });
            }

            // 最も人気の投票
            if (mostPopularPoll && maxVotes > 0) {
                embed.addFields({
                    name: '🏆 最も人気の投票',
                    value: `**${mostPopularPoll.title}**\n投票数: ${maxVotes}票\n作成日: ${moment(mostPopularPoll.created_at).tz('Asia/Tokyo').format('MM/DD HH:mm')}`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🏆 最も人気の投票',
                    value: '該当する投票がありません',
                    inline: false
                });
            }

            // 期間別の比較（今週と先週）
            if (period === 'week') {
                const lastWeekStart = now.clone().subtract(1, 'week').startOf('week');
                const lastWeekEnd = now.clone().subtract(1, 'week').endOf('week');
                
                const lastWeekPolls = polls.filter(poll => {
                    const pollDate = moment(poll.created_at).tz('Asia/Tokyo');
                    return pollDate.isSameOrAfter(lastWeekStart) && pollDate.isSameOrBefore(lastWeekEnd);
                });

                const lastWeekVotes = await Promise.all(
                    lastWeekPolls.map(poll => interaction.client.database.getVotes(poll.id))
                );
                const lastWeekTotalVotes = lastWeekVotes.reduce((sum, votes) => sum + votes.length, 0);

                const currentWeekVotes = await Promise.all(
                    filteredPolls.map(poll => interaction.client.database.getVotes(poll.id))
                );
                const currentWeekTotalVotes = currentWeekVotes.reduce((sum, votes) => sum + votes.length, 0);

                const voteChange = currentWeekTotalVotes - lastWeekTotalVotes;
                const changeEmoji = voteChange > 0 ? '📈' : voteChange < 0 ? '📉' : '➡️';
                const changeText = voteChange > 0 ? `+${voteChange}` : voteChange.toString();

                embed.addFields({
                    name: '📊 週間比較',
                    value: `今週: ${currentWeekTotalVotes}票\n先週: ${lastWeekTotalVotes}票\n${changeEmoji} ${changeText}票`,
                    inline: true
                });
            }

            await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('statsコマンドエラー:', error);
            await interaction.reply({
                content: '❌ 統計情報の取得中にエラーが発生しました。',
                flags: 64
            });
        }
    },
};

