const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const express = require('express');

// 設定ファイルの読み込み
const config = require('./config.js');

// Discordクライアントの作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers  // add roleコマンド用
    ]
});

// コマンドコレクション
client.commands = new Collection();

// コマンドファイルの読み込み
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ コマンド読み込み完了: ${command.data.name}`);
        } else {
            console.log(`⚠️ コマンドファイルに必要なプロパティが不足: ${filePath}`);
        }
    }
}

// イベントハンドラーの読み込み
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`✅ イベント読み込み完了: ${event.name}`);
    }
}

// データベース初期化
const Database = require('./database/database.js');
const db = new Database(config.DATABASE_PATH);

// データベース初期化
db.init().then(() => {
    console.log('✅ データベース初期化完了');
}).catch(err => {
    console.error('❌ データベース初期化エラー:', err);
});

// クライアントにデータベースを追加
client.database = db;

// Express サーバーの設定（Renderの無料プラン対策）
const app = express();
const PORT = process.env.PORT || 3000;

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running', 
        timestamp: new Date().toISOString(),
        guilds: client.guilds.cache.size,
        uptime: process.uptime()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', bot: 'online' });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`🌐 Server bound to 0.0.0.0:${PORT}`);
});

// ボットの起動
client.login(config.DISCORD_TOKEN).catch(err => {
    console.error('❌ ログインエラー:', err);
});

// エラーハンドリング
process.on('unhandledRejection', error => {
    console.error('未処理のPromise拒否:', error);
});

process.on('uncaughtException', error => {
    console.error('未捕捉の例外:', error);
    process.exit(1);
});
