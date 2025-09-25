// 設定ファイル - .env / 環境変数から読み取り
// 注意: 本番公開時は必ず .env にトークン等を保存し、レポジトリに含めないこと
require('dotenv').config();

function required(name) {
    const val = process.env[name];
    if (!val || val.trim().length === 0) {
        throw new Error(`環境変数 ${name} が未設定です。READMEの「デプロイ手順」を参照して設定してください。`);
    }
    return val;
}

module.exports = {
    // Discord Bot Token / Client ID
    DISCORD_TOKEN: required('DISCORD_TOKEN'),
    CLIENT_ID: required('CLIENT_ID'),

    // Database Path
    DATABASE_PATH: process.env.DATABASE_PATH || './database/database.db',

    // Default Timezone
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Tokyo',

    // Bot Settings
    PREFIX: process.env.PREFIX || '!',

    // Poll Settings
    POLL_TIMEOUT: Number(process.env.POLL_TIMEOUT || (24 * 60 * 60 * 1000)), // ms
    MAX_OPTIONS: Number(process.env.MAX_OPTIONS || 10)
};