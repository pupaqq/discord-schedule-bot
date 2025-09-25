const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const moment = require('moment-timezone');

class PollUtils {
    static createPollText(poll, votes = {}) {
        const lines = [];
        lines.push(`📅 ${poll.title}`);
        if (poll.description) lines.push(poll.description);
        lines.push('');
        const totalVotes = Object.values(votes).reduce((sum, arr) => sum + arr.length, 0);
        const mkBar = (pct) => {
            const len = 10;
            const filled = Math.round((pct / 100) * len);
            const fillChar = '▰'; // 視認性の高い濃色ブロック
            const emptyChar = '▱'; // 薄いアウトラインブロック
            return fillChar.repeat(filled) + emptyChar.repeat(len - filled);
        };
        poll.options.forEach((opt, idx) => {
            const arr = votes[idx] || [];
            const pct = totalVotes > 0 ? Math.round((arr.length / totalVotes) * 100) : 0;
            lines.push(`${idx + 1}. ${opt}`);
            lines.push(`   ${mkBar(pct)} ${arr.length}票 (${pct}%)`);
        });
        lines.push('');
        let footer = `投票ID: ${poll.id ?? ''}`.trim();
        if (poll.expires_at) {
            const expiryTime = moment(poll.expires_at).tz('Asia/Tokyo');
            footer += ` ｜ ⏰ ${expiryTime.format('YYYY/MM/DD HH:mm')} まで`;
        }
        lines.push(footer);
        return lines.join('\n');
    }
    static createPollEmbed(poll, votes = {}) {
        const embed = new EmbedBuilder()
            .setTitle(`📅 ${poll.title}`)
            .setColor(0x00AE86)
            .setTimestamp();

        if (poll.description) {
            embed.setDescription(poll.description);
        }

        // 投票結果の表示
        const totalVotes = Object.values(votes).reduce((sum, voters) => sum + voters.length, 0);
        
        if (totalVotes > 0) {
            embed.addFields({
                name: `📊 投票結果 (${totalVotes}票)`,
                value: this.formatVoteResults(poll.options, votes),
                inline: false
            });
            
            // 最多得票の選択肢をハイライト
            let maxVotes = 0;
            let winningOptions = [];
            
            Object.entries(votes).forEach(([index, voters]) => {
                if (voters.length > maxVotes) {
                    maxVotes = voters.length;
                    winningOptions = [poll.options[index]];
                } else if (voters.length === maxVotes && maxVotes > 0) {
                    winningOptions.push(poll.options[index]);
                }
            });

            if (winningOptions.length > 0 && maxVotes > 0) {
                embed.addFields({
                    name: '🏆 最多得票',
                    value: winningOptions.join(', '),
                    inline: false
                });
            }
        } else {
            embed.addFields({
                name: '📋 選択肢',
                value: this.formatOptions(poll.options),
                inline: false
            });
        }

        // フッター（投票IDは常時表示、期限があれば併記）
        let footerText = `投票ID: ${poll.id}`;
        if (poll.expires_at) {
            const expiryTime = moment(poll.expires_at).tz('Asia/Tokyo');
            footerText += ` ｜ ⏰ 投票期限: ${expiryTime.format('YYYY/MM/DD HH:mm')} JST`;
        }
        embed.setFooter({ text: footerText });

        return embed;
    }

    static formatOptions(options) {
        return options.map((option, index) => {
            const emoji = this.getOptionEmoji(index);
            return `${emoji} **${option}**`;
        }).join('\n');
    }

    static formatVoteResults(options, votes) {
        const totalVotes = Object.values(votes).reduce((sum, voters) => sum + voters.length, 0);
        
        return options.map((option, index) => {
            const emoji = this.getOptionEmoji(index);
            const voters = votes[index] || [];
            const percentage = totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0;
            const bar = this.createProgressBar(percentage);
            
            // 投票者一覧を表示（最大5名まで）
            const voterList = voters.length > 0 ? 
                `\n👥 ${this.formatVotersList(voters)}` : 
                '\n👥 投票者なし';
            
            return `${emoji} **${option}**\n${bar} ${voters.length}票 (${percentage}%)${voterList}`;
        }).join('\n\n');
    }

    static createProgressBar(percentage, length = 10) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    static getOptionEmoji(index) {
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        return emojis[index] || '❓';
    }

    static createPollButtons(pollType, options, selectedIndices = []) {
        const rows = [];
        let currentRow = new ActionRowBuilder();
        options.forEach((option, index) => {
            const button = new ButtonBuilder()
                .setCustomId(`poll_vote_${index}`)
                .setLabel(option.length > 23 ? option.slice(0, 22) + '…' : option)
                .setStyle(selectedIndices.includes(index) ? ButtonStyle.Success : ButtonStyle.Secondary);
            currentRow.addComponents(button);
            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });
        if (currentRow.components.length > 0) rows.push(currentRow);

        // 最後の行に「投票終了」を追加（5個になっていれば新しい行を作る）
        const endButton = new ButtonBuilder()
            .setCustomId('poll_end')
            .setLabel('投票終了')
            .setStyle(ButtonStyle.Danger);
        if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
            const endRow = new ActionRowBuilder().addComponents(endButton);
            rows.push(endRow);
        } else {
            rows[rows.length - 1].addComponents(endButton);
        }

        // 最大5行まで（Discord制限）
        return rows.slice(0, 5);
    }

    static createDateOptions(startDate, days = 7) {
        const options = [];
        const start = moment(startDate).tz('Asia/Tokyo');
        
        for (let i = 0; i < days; i++) {
            const date = start.clone().add(i, 'days');
            options.push(date.format('MM/DD (ddd)'));
        }
        
        return options;
    }

    static createHalfDayOptions(startDate, days = 7) {
        const options = [];
        const start = moment(startDate).tz('Asia/Tokyo');
        const timeSlots = ['午前', '午後', '夜'];
        
        for (let i = 0; i < days; i++) {
            const date = start.clone().add(i, 'days');
            timeSlots.forEach(slot => {
                options.push(`${date.format('MM/DD (ddd)')} ${slot}`);
            });
        }
        
        return options;
    }

    static createSpecificTimeOptions(times) {
        return times.map(time => {
            const momentTime = moment(time).tz('Asia/Tokyo');
            return momentTime.format('MM/DD (ddd) HH:mm');
        });
    }

    static parseTimeInput(input) {
        // "2024/01/15 14:30" 形式の文字列をパース
        const momentTime = moment(input, 'YYYY/MM/DD HH:mm').tz('Asia/Tokyo');
        return momentTime.isValid() ? momentTime : null;
    }

    static formatVotersList(voters) {
        if (voters.length === 0) return '投票者なし';
        if (voters.length <= 5) return voters.join(', ');
        return `${voters.slice(0, 5).join(', ')} 他${voters.length - 5}名`;
    }
}

module.exports = PollUtils;
