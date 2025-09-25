const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');

const commands = [];

// コマンドファイルを読み込み
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ コマンド読み込み完了: ${command.data.name}`);
    } else {
        console.log(`⚠️ コマンドファイルに必要なプロパティが不足: ${filePath}`);
    }
}

// RESTインスタンスを作成
const rest = new REST().setToken(config.DISCORD_TOKEN);

// コマンドを登録
(async () => {
    try {
        console.log(`🔄 ${commands.length}個のスラッシュコマンドを登録中...`);

        // グローバルコマンドとして登録
        const data = await rest.put(
            Routes.applicationCommands(config.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ ${data.length}個のスラッシュコマンドが正常に登録されました！`);
    } catch (error) {
        console.error('❌ コマンド登録エラー:', error);
    }
})();
