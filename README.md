## デプロイ / 公開手順

1) 依存インストール

```
npm ci
```

2) 環境変数を設定（.env を作成）

`.env` ファイルをプロジェクト直下に作成し、以下を設定します。

```
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
CLIENT_ID=YOUR_DISCORD_CLIENT_ID
DATABASE_PATH=./database/database.db
DEFAULT_TIMEZONE=Asia/Tokyo
```

3) コマンドをデプロイ（必要な場合）

```
node deploy-commands.js
```

4) 本番起動（例: PM2）

```
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 招待リンク（権限）
- 管理者で簡単に運用する場合（permissions=8）
  - `https://discord.com/api/oauth2/authorize?client_id=＜CLIENT_ID＞&permissions=8&scope=bot%20applications.commands`
- 最小権限で運用する場合（例: 268782656 など）
  - View Channels / Send Messages / Read Message History / Manage Roles / Embed Links / Add Reactions / Use External Emojis

### Windows での常駐運用（PM2）
1) 常駐起動
```
pm2 start index.js --name discord-schedule-bot
pm2 save
```
2) 自動起動（権限不要なユーザーRun方式）
```
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v PM2ResurrectDiscordBot /t REG_SZ /d "cmd /c pm2 resurrect" /f
```
3) 状態確認
```
pm2 ls
```
4) 更新時の再起動
```
pm2 restart discord-schedule-bot
pm2 save
```

### 環境変数の注意
- トークンやクライアントIDはリポジトリに含めないでください
- `.env` は `.gitignore` に含めて管理外にしてください

# Discord 日程調整Bot

Discordで日程調整を簡単に行えるbotです。3つのモードで柔軟な日程調整をサポートします。

## 機能

### 📅 4つの投票モード

1. **`/schedule`** - カレンダー形式の日程調整（新機能！）
   - カレンダー表示で日付を選択
   - 24時間検索バー形式の時間選択
   - 詳細設定で分単位指定可能
   - 最も使いやすいUI

2. **`/allday`** - 日付調整
   - 指定した期間の日付から選択
   - デフォルトで7日間の候補日

3. **`/halfday`** - 日付+時間帯調整
   - 日付と時間帯（午前/午後/夜）の組み合わせ
   - より詳細な時間調整が可能

4. **`/specif`** - 具体的時間指定
   - ユーザーが指定した具体的な日時
   - 完全にカスタマイズ可能

### 🔧 管理機能

5. **`/stats`** - 投票統計情報
   - 期間別の投票統計
   - 投票タイプ別の分析
   - 最も人気の投票表示

6. **`/list`** - 投票一覧表示
   - アクティブ/期限切れ投票の表示
   - ページネーション対応
   - 詳細な投票情報

7. **`/delete`** - 投票削除
   - 作成者のみが削除可能
   - 確認ダイアログ付き
   - メッセージも同時削除

### 🎨 画期的なUI機能

- **カレンダー表示**: 直感的な日付選択
- **24時間検索バー**: 時間を簡単に選択
- **詳細設定モーダル**: 分単位での時間指定
- **リアルタイム投票結果表示**: 投票と同時に結果が更新
- **プログレスバー**: 視覚的な投票結果表示（`█████░░░░░`）
- **インタラクティブボタン**: ワンクリックで投票
- **美しいEmbed**: 見やすい投票表示
- **投票者一覧**: 誰が投票したかが分かる
- **最多得票ハイライト**: 人気の選択肢を強調表示
- **自動期限管理**: 設定した時間で投票終了

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 設定ファイルの編集

`config.js` ファイルを編集して、Discord Bot Tokenを設定してください：

```javascript
module.exports = {
    DISCORD_TOKEN: 'your_actual_bot_token_here',
    CLIENT_ID: 'your_actual_client_id_here',
    // ... その他の設定
};
```

### 3. Botの起動

```bash
npm start
```

開発モード（自動再起動）：
```bash
npm run dev
```

## 使用方法

### 基本的なコマンド

#### `/schedule` - カレンダー形式の日程調整（推奨）
```
/schedule title:会議の日程調整 description:重要な会議です
```

#### `/allday` - 日付調整
```
/allday title:会議の日程調整 start_date:2024/01/15 days:5
```

#### `/halfday` - 日付+時間帯調整
```
/halfday title:打ち合わせの時間調整 start_date:2024/01/15 days:3
```

#### `/specif` - 具体的時間指定
```
/specif title:プロジェクト会議 times:2024/01/15 14:00,2024/01/16 10:00,2024/01/17 16:30
```

#### `/remind` - 投票者全員にメンション
```
/remind datetime:09191800 message:投票の時間です！
```

#### `/add role` - 投票者にロール付与
```
/add role role_name:role0919 datetime:1800 date:0919
```

#### `/stats` - 投票統計情報表示
```
/stats period:week
```

#### `/list` - 投票一覧表示
```
/list status:active limit:10
```

#### `/delete` - 投票削除
```
/delete poll_id:1234567890123456789
```

### オプション

- `title`: 投票のタイトル（必須）
- `description`: 投票の説明（任意）
- `start_date`: 開始日（YYYY/MM/DD形式）
- `days`: 候補日数（1-14日）
- `expire_hours`: 投票期限（1-168時間）
- `times`: 具体的な時間（カンマ区切り）
- `datetime`: 日時（MMDDHHMM形式、例：09191800）
- `role_name`: ロール名
- `date`: 日付（MMDD形式、例：0919）

## 特徴

### 🚀 高性能
- SQLiteデータベースによる永続化
- リアルタイム投票更新
- 効率的なメモリ使用

### 🎯 ユーザーフレンドリー
- 直感的なコマンド
- 分かりやすいエラーメッセージ
- 日本語対応

### 🔒 セキュア
- 投票作成者のみが投票終了可能
- 期限切れ投票の自動処理
- 重複投票の防止

## 技術スタック

- **Node.js**: ランタイム環境
- **discord.js**: Discord API クライアント
- **SQLite3**: データベース
- **Moment.js**: 日時処理

### 🎯 特に画期的なUI機能

1. **カレンダー表示**: 直感的な日付選択で使いやすさが向上
2. **24時間検索バー**: 時間を簡単に選択できる検索バー形式
3. **詳細設定モーダル**: 分単位での時間指定が可能
4. **プログレスバー表示**: 投票結果を視覚的に表示（`█████░░░░░`）
5. **リアルタイム更新**: 投票と同時に結果が更新される
6. **投票者表示**: 誰がどの選択肢に投票したかが分かる
7. **最多得票ハイライト**: 人気の選択肢を🏆で強調表示
8. **美しいEmbed**: カラフルで見やすい投票表示
9. **ワンクリック投票**: ボタンで簡単に投票
10. **リマインダー機能**: 投票者全員にメンションで通知
11. **ロール付与機能**: 投票者に自動でロールを付与

このbotは、従来のテキストベースの投票とは異なり、視覚的でインタラクティブなUIを提供し、日程調整をより効率的で楽しいものにします！

### 🆕 新機能の使い方

#### カレンダー形式の日程調整
1. `/schedule`コマンドでカレンダーを表示
2. 日付を選択（複数選択可能）
3. 時間を選択（24時間検索バー形式）
4. 詳細設定で分単位指定も可能
5. 投票を作成

#### リマインダー機能
- `/remind 09191800` で9月19日18時に投票した人全員にメンション
- カスタムメッセージも指定可能

#### ロール付与機能
- `/add role role0919 1800` で18時に投票した人に「role0919」ロールを付与
- 日付も指定可能（省略時は今日）

## ライセンス

MIT License

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
