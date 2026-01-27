# MCPサーバー設定ガイド

このプロジェクトで使用する各種サービスのMCP（Model Context Protocol）サーバーの導入ガイドです。

## 目次
1. [Stripe MCP Server](#stripe-mcp-server)
2. [Google Calendar MCP Server](#google-calendar-mcp-server)
3. [Database MCP Server](#database-mcp-server)
4. [GitHub MCP Server](#github-mcp-server)
5. [Web Scraping MCP Server](#web-scraping-mcp-server)

---

## Stripe MCP Server

Stripe決済機能の開発・デバッグに使用します。

### インストール

Claude Codeのプラグインとして既に利用可能です。

### 設定

`~/.claude/settings.json` または プロジェクトの `.mcp.json`:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@anthropic/claude-code-stripe-mcp"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

### 利用可能なツール
- `search_stripe_documentation` - Stripeドキュメント検索
- `list_customers` - 顧客一覧
- `list_products` - 商品一覧
- `list_prices` - 価格一覧
- `list_subscriptions` - サブスクリプション一覧
- `retrieve_balance` - 残高確認
- `stripe_integration_recommender` - 実装ガイド

### 使用例
```
# ドキュメント検索
/stripe:search_stripe_documentation "webhook signature verification"

# 顧客確認
/stripe:list_customers limit=10
```

---

## Google Calendar MCP Server

カレンダー連携機能の開発に使用します。

### インストール

```bash
# 公式MCPサーバー
npm install -g @anthropic/mcp-server-google-calendar
```

### Google Cloud Console 設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成（または既存を選択）
3. Google Calendar API を有効化:
   - APIs & Services > Library
   - "Google Calendar API" を検索して有効化
4. OAuth 2.0 認証情報を作成:
   - APIs & Services > Credentials
   - Create Credentials > OAuth client ID
   - Application type: Desktop app
   - `client_secret.json` をダウンロード

### MCP設定

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "mcp-server-google-calendar",
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/api/auth/callback/google"
      }
    }
  }
}
```

### スコープ設定（最小権限）

アプリケーションで必要なスコープ:
```
https://www.googleapis.com/auth/calendar.readonly    # カレンダー一覧取得
https://www.googleapis.com/auth/calendar.freebusy    # 空き時間参照
https://www.googleapis.com/auth/calendar.events      # 予定作成/更新/削除
```

### 利用可能なツール
- `list_calendars` - カレンダー一覧
- `get_freebusy` - 空き時間取得
- `create_event` - 予定作成
- `update_event` - 予定更新
- `delete_event` - 予定削除

---

## Database MCP Server (Turso/SQLite)

データベース操作の開発・デバッグに使用します。

### インストール

```bash
npm install -g @anthropic/mcp-server-sqlite
```

### 設定

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "mcp-server-sqlite",
      "args": ["--db-url", "libsql://your-db.turso.io"],
      "env": {
        "TURSO_AUTH_TOKEN": "your-auth-token"
      }
    }
  }
}
```

### ローカル開発用（SQLite直接）

```json
{
  "mcpServers": {
    "sqlite-local": {
      "command": "mcp-server-sqlite",
      "args": ["--db-path", "./local.db"]
    }
  }
}
```

### 利用可能なツール
- `execute_query` - SQLクエリ実行
- `list_tables` - テーブル一覧
- `describe_table` - テーブル構造

---

## GitHub MCP Server

GitHub連携（Issue、PR管理）に使用します。

### インストール

```bash
npm install -g @anthropic/mcp-server-github
```

### GitHub Personal Access Token 作成

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. 必要なスコープを選択:
   - `repo` - リポジトリアクセス
   - `read:org` - 組織読み取り

### 設定

```json
{
  "mcpServers": {
    "github": {
      "command": "mcp-server-github",
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

### 利用可能なツール
- `create_issue` - Issue作成
- `list_issues` - Issue一覧
- `create_pull_request` - PR作成
- `list_pull_requests` - PR一覧

---

## Web Scraping MCP Server

企業情報取得（公式採用ページスクレイピング）に使用します。

### インストール

```bash
npm install -g @anthropic/mcp-server-puppeteer
```

### 設定

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "mcp-server-puppeteer",
      "args": ["--headless"]
    }
  }
}
```

### 利用可能なツール
- `navigate` - ページ移動
- `screenshot` - スクリーンショット
- `get_content` - ページコンテンツ取得
- `click` - クリック操作
- `type` - テキスト入力

### 企業情報取得での使用

```python
# backend/app/services/scraper.py での使用想定
async def fetch_company_info(url: str):
    # MCPサーバー経由でページを取得
    # LLMで構造化データに変換
    pass
```

---

## 全体設定ファイル例

プロジェクトルートに `.mcp.json` を作成:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@anthropic/claude-code-stripe-mcp"],
      "env": {
        "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"
      }
    },
    "github": {
      "command": "mcp-server-github",
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "sqlite": {
      "command": "mcp-server-sqlite",
      "args": ["--db-url", "${TURSO_DATABASE_URL}"],
      "env": {
        "TURSO_AUTH_TOKEN": "${TURSO_AUTH_TOKEN}"
      }
    }
  }
}
```

---

## トラブルシューティング

### MCP サーバーが起動しない

1. Node.js バージョン確認: `node -v` (18以上推奨)
2. パッケージ再インストール: `npm install -g @anthropic/mcp-server-xxx`
3. 権限確認: `chmod +x $(which mcp-server-xxx)`

### 認証エラー

1. 環境変数が正しく設定されているか確認
2. トークンの有効期限を確認
3. 必要なスコープ/権限が付与されているか確認

### 接続タイムアウト

1. ネットワーク接続を確認
2. ファイアウォール設定を確認
3. MCPサーバーのログを確認: `DEBUG=* mcp-server-xxx`

---

## 参考リンク

- [MCP公式ドキュメント](https://modelcontextprotocol.io/)
- [Claude Code MCP設定](https://docs.anthropic.com/claude-code/mcp)
- [Stripe API ドキュメント](https://stripe.com/docs/api)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Turso ドキュメント](https://docs.turso.tech/)
