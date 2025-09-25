const Database = require('better-sqlite3');
const path = require('path');

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('データベース接続エラー:', err);
                    reject(err);
                } else {
                    console.log('データベースに接続しました');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        return new Promise((resolve, reject) => {
            const createPollsTable = `
                CREATE TABLE IF NOT EXISTS polls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT UNIQUE NOT NULL,
                    channel_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    creator_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    poll_type TEXT NOT NULL,
                    options TEXT NOT NULL,
                    votes TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME,
                    is_active BOOLEAN DEFAULT 1
                )
            `;

            const createVotesTable = `
                CREATE TABLE IF NOT EXISTS votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    poll_id INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    option_index INTEGER NOT NULL,
                    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (poll_id) REFERENCES polls (id),
                    UNIQUE(poll_id, user_id, option_index)
                )
            `;

            const createScheduledRemindersTable = `
                CREATE TABLE IF NOT EXISTS scheduled_reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    channel_id TEXT NOT NULL,
                    poll_id INTEGER NOT NULL,
                    message TEXT,
                    remind_at DATETIME NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sent_at DATETIME,
                    status TEXT DEFAULT 'pending',
                    FOREIGN KEY (poll_id) REFERENCES polls (id)
                )
            `;

            this.db.exec(createPollsTable, (err) => {
                if (err) {
                    console.error('pollsテーブル作成エラー:', err);
                    reject(err);
                } else {
                    console.log('pollsテーブルを作成/確認しました');
                    this.db.exec(createVotesTable, (err) => {
                        if (err) {
                            console.error('votesテーブル作成エラー:', err);
                            reject(err);
                        } else {
                            console.log('votesテーブルを作成/確認しました');
                            this.db.exec(createScheduledRemindersTable, (err) => {
                                if (err) {
                                    console.error('scheduled_remindersテーブル作成エラー:', err);
                                    reject(err);
                                } else {
                                    console.log('scheduled_remindersテーブルを作成/確認しました');
                                    resolve();
                                }
                            });
                        }
                    });
                }
            });
        });
    }

    async createPoll(pollData) {
        return new Promise((resolve, reject) => {
            const { messageId, channelId, guildId, creatorId, title, description, pollType, options, expiresAt } = pollData;
            
            const sql = `
                INSERT INTO polls (message_id, channel_id, guild_id, creator_id, title, description, poll_type, options, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;
            
            this.db.run(sql, [messageId, channelId, guildId, creatorId, title, description, pollType, JSON.stringify(options), expiresAt], function(err) {
                if (err) {
                    console.error('createPoll エラー:', err);
                    reject(err);
                } else {
                    console.log('createPoll 成功:', {
                        lastID: this.lastID,
                        messageId: messageId,
                        title: title
                    });
                    resolve(this.lastID);
                }
            });
        });
    }

    async getPoll(messageId) {
        return new Promise((resolve, reject) => {
            console.log('getPoll 呼び出し:', { messageId, dbPath: this.dbPath });
            
            const sql = 'SELECT * FROM polls WHERE message_id = ? AND is_active = 1';
            
            this.db.get(sql, [messageId], (err, row) => {
                if (err) {
                    console.error('getPoll エラー:', err);
                    reject(err);
                } else {
                    console.log('getPoll 結果:', { messageId, row });
                    if (row) {
                        row.options = JSON.parse(row.options);
                        row.votes = JSON.parse(row.votes);
                    }
                    resolve(row);
                }
            });
        });
    }

    async addVote(pollId, userId, optionIndex) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO votes (poll_id, user_id, option_index)
                VALUES (?, ?, ?)
            `;
            
            this.db.run(sql, [pollId, userId, optionIndex], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getVotes(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM votes WHERE poll_id = ?';
            
            this.db.all(sql, [pollId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async deleteUserVote(pollId, userId, optionIndex) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM votes WHERE poll_id = ? AND user_id = ? AND option_index = ?';
            this.db.run(sql, [pollId, userId, optionIndex], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteUserVotes(pollId, userId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM votes WHERE poll_id = ? AND user_id = ?';
            
            this.db.run(sql, [pollId, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async updatePollVotes(pollId, votes) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE polls SET votes = ? WHERE id = ?';
            
            this.db.run(sql, [JSON.stringify(votes), pollId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deactivatePoll(messageId) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE polls SET is_active = 0 WHERE message_id = ?';
            
            this.db.run(sql, [messageId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deactivatePollById(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE polls SET is_active = 0 WHERE id = ?';
            this.db.run(sql, [pollId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteVotesByPollId(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM votes WHERE poll_id = ?';
            this.db.run(sql, [pollId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deletePollById(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM polls WHERE id = ?';
            this.db.run(sql, [pollId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteScheduledRemindersByPollId(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM scheduled_reminders WHERE poll_id = ?';
            this.db.run(sql, [pollId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getActivePolls(guildId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM polls WHERE guild_id = ? AND is_active = 1';
            
            this.db.all(sql, [guildId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const polls = rows.map(row => {
                        row.options = JSON.parse(row.options);
                        row.votes = JSON.parse(row.votes);
                        return row;
                    });
                    resolve(polls);
                }
            });
        });
    }

    async getPollById(pollId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM polls WHERE id = ?';
            
            this.db.get(sql, [pollId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    row.options = JSON.parse(row.options);
                    row.votes = JSON.parse(row.votes);
                    resolve(row);
                }
            });
        });
    }

    async createScheduledReminder(data) {
        return new Promise((resolve, reject) => {
            const { guildId, channelId, pollId, message, remindAt, createdBy } = data;
            const sql = `
                INSERT INTO scheduled_reminders (guild_id, channel_id, poll_id, message, remind_at, created_by, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `;
            this.db.run(sql, [guildId, channelId, pollId, message || null, remindAt, createdBy], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getPendingScheduledReminders(nowIso) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM scheduled_reminders
                WHERE status = 'pending' AND (sent_at IS NULL) AND datetime(remind_at) >= datetime('1970-01-01')
            `;
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async markReminderAsSent(reminderId) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE scheduled_reminders
                SET status = 'sent', sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            this.db.run(sql, [reminderId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async deleteScheduledReminder(reminderId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM scheduled_reminders WHERE id = ?';
            this.db.run(sql, [reminderId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('データベースクローズエラー:', err);
                } else {
                    console.log('データベース接続を閉じました');
                }
            });
        }
    }
}

module.exports = Database;
