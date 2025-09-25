const moment = require('moment-timezone');
const { EmbedBuilder } = require('discord.js');

class ReminderScheduler {
    constructor(client) {
        this.client = client;
        this.timers = new Map();
    }

    async init() {
        try {
            const reminders = await this.client.database.getPendingScheduledReminders();
            for (const r of reminders) {
                this._scheduleTimer(r);
            }
            console.log(`🔔 スケジュール登録完了: ${reminders.length}件`);
        } catch (e) {
            console.error('スケジューラ初期化エラー:', e);
        }
    }

    async scheduleFromData({ guildId, channelId, pollId, message, remindAt, createdBy }) {
        const id = await this.client.database.createScheduledReminder({
            guildId,
            channelId,
            pollId,
            message,
            remindAt,
            createdBy
        });
        const row = {
            id,
            guild_id: guildId,
            channel_id: channelId,
            poll_id: pollId,
            message,
            remind_at: remindAt,
            created_by: createdBy,
            status: 'pending'
        };
        this._scheduleTimer(row);
        return id;
    }

    cancel(reminderId) {
        const t = this.timers.get(reminderId);
        if (t) {
            clearTimeout(t);
            this.timers.delete(reminderId);
        }
    }

    _scheduleTimer(reminderRow) {
        const when = moment.tz(reminderRow.remind_at, 'Asia/Tokyo');
        const now = moment.tz('Asia/Tokyo');
        let delay = when.diff(now);
        if (delay < 0) delay = 0;

        const timer = setTimeout(async () => {
            try {
                await this._sendReminder(reminderRow);
                await this.client.database.markReminderAsSent(reminderRow.id);
            } catch (e) {
                console.error('リマインド送信エラー:', e);
            } finally {
                this.timers.delete(reminderRow.id);
            }
        }, delay);

        this.timers.set(reminderRow.id, timer);
    }

    async _sendReminder(reminderRow) {
        const channel = await this.client.channels.fetch(reminderRow.channel_id).catch(() => null);
        if (!channel) return;

        const poll = await this.client.database.getPollById(reminderRow.poll_id);
        if (!poll) return;

        const votes = await this.client.database.getVotes(poll.id);
        const uniqueVoters = [...new Set(votes.map(v => v.user_id))];
        if (uniqueVoters.length === 0) return;

        const mentionText = uniqueVoters.map(id => `<@${id}>`).join(' ');
        // 送信予定の日時（remind_at）をJSTでフォーマット
        let when = reminderRow.remind_at;
        try {
            const m = moment.tz(reminderRow.remind_at, 'Asia/Tokyo');
            if (m.isValid()) {
                when = m.minute() === 0 ? `${m.year()}年${m.month() + 1}月${m.date()}日${m.hour()}時` : `${m.year()}年${m.month() + 1}月${m.date()}日${m.format('H時mm分')}`;
            }
        } catch {}

        const body = `${mentionText}\n${when}\n${(reminderRow.message || 'リマインダーです！')}`.trim();
        await channel.send({ content: body });
    }
}

module.exports = ReminderScheduler;


