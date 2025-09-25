const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ ${client.user.tag} がログインしました！`);
        console.log(`📊 ${client.guilds.cache.size}個のサーバーで稼働中`);
        console.log(`👥 ${client.users.cache.size}人のユーザーと接続中`);
        
        // ボットのステータスを設定
        client.user.setActivity('日程調整をサポート中 📅', { type: 'WATCHING' });
        
        // リマインダースケジューラ初期化
        try {
            if (!client.reminderScheduler) {
                const ReminderScheduler = require('../utils/reminderScheduler');
                client.reminderScheduler = new ReminderScheduler(client);
            }
            client.reminderScheduler.init();
        } catch (e) {
            console.error('スケジューラ起動時エラー:', e);
        }

        console.log('🎉 ボットが正常に起動しました！');
    },
};
