# Firecrawl の設定

[← インデックス](./README.md)

Firecrawl は、選考スケジュール等の Web ページから HTML を抽出するために使う外部サービスです。FastAPI バックエンド（Railway）側でのみ使用します。フロントエンド（Vercel）には Firecrawl 関連の設定は不要です。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 用途 | 選考スケジュール等の Web ページ HTML 抽出（企業情報の取得経路の一部） |
| 重要度 | **任意** |
| 未設定時の挙動 | `FIRECRAWL_API_KEY` が空のとき、Firecrawl 呼び出しはスキップされ、HTML+LLM による直接抽出にフォールバックする |
| 設定先 | FastAPI（Railway）の `fastapi.env`。ローカルは `.env.local` |

実装上、`FIRECRAWL_API_KEY` が空文字のときは `scrape_url_with_schema()` が `firecrawl_not_configured` を返して即座に false になり、呼び出し元が HTML+LLM 抽出に切り替えます（`backend/app/utils/firecrawl.py`）。そのため、Firecrawl を使わない構成でもアプリは動作します。

Firecrawl API への呼び出しは `{FIRECRAWL_BASE_URL}/v1/scrape` に対して行い、`Authorization: Bearer <FIRECRAWL_API_KEY>` ヘッダを付けます。`onlyMainContent` / `parsePDF` / `jsonOptions`（スキーマ抽出）を有効にして構造化データを取得します。

> 公式: Firecrawl（Search, Scrape, and Clean the Web for AI Agents）。参考: https://www.firecrawl.dev/

---

## 2. 前提 CLI

Firecrawl には公式 CLI（`firecrawl-cli`）があります。ただし **CLI はアカウント作成と API キーの発行（取得）には使えません**（既存キーでの認証専用）。キー発行は Dashboard でのみ行います（後述）。

CLI を使うのは任意です。手元で疎通確認やクレジット残量確認をしたい場合にだけ入れてください。アプリ側はキーを `fastapi.env` / `.env.local` から読むため、CLI のローカル認証状態には依存しません。

```bash
# グローバルインストール（任意）
npm install -g firecrawl-cli

# 取得済みの API キーで認証（ローカル動作確認用）
firecrawl login --api-key fc-YOUR-API-KEY
# もしくは環境変数で渡す
export FIRECRAWL_API_KEY=fc-YOUR-API-KEY

# クレジット残量の確認
firecrawl credit-usage

# 単一 URL の疎通確認
firecrawl scrape https://example.com
```

> 公式: CLI のインストール・`login --api-key`・`FIRECRAWL_API_KEY` 環境変数・`credit-usage` / `scrape` 等のサブコマンド。参考: https://docs.firecrawl.dev/sdks/cli

---

## 3. アカウント作成と API キー取得

**API キーの発行は Dashboard のみ**で行います。公式 CLI はキーの作成・取得に対応していないため、ここは GUI 手順が正です。発行後の env 反映は CLI で行います（次節）。

### 3-1. アカウント作成（Dashboard）

1. https://www.firecrawl.dev/app にアクセスする
2. サインアップする（Google / GitHub / メールのいずれか）。クレジットカードは不要

> 公式: アプリ（Dashboard）のエントリポイント。参考: https://www.firecrawl.dev/app

### 3-2. API キーの発行（Dashboard）

1. ログイン後、上部ナビの **Dashboard** を開く
2. https://www.firecrawl.dev/app/api-keys（**API Keys** ページ）を開く
3. **Create** をクリックし、キー名を付けて発行する（用途別に分けたい場合は名前で区別する）
4. 表示された `fc-...` 形式のキーを控える

> **重要**: API キーは原則として発行時に一度だけ全体表示されます。安全に保管してください（パスワードマネージャ等）。漏洩した場合は再利用せず、Dashboard で削除・無効化して新規発行します。

> 公式: API キーは Firecrawl Dashboard の API Keys ページで確認・発行する（`Authorization: Bearer fc-...`）。参考: https://docs.firecrawl.dev/api-reference/v2-introduction

### 3-3. 環境別キーの方針

`FIRECRAWL_API_KEY` は `[共通可]` の外部 API キーです。環境ごとに分ける必須要件はありません。利用量を環境別に把握したい場合だけ、staging / production で別キーを発行してください（任意）。

---

## 4. キーの制限・セキュリティ

| 項目 | 方針 |
|---|---|
| 保管場所 | サーバー専用。FastAPI の `fastapi.env`、ローカルは `.env.local`。ブラウザ（クライアント）には絶対に出さない |
| 形式 | `fc-...`（Bearer トークンとして送信） |
| 漏洩時 | Dashboard で対象キーを削除・無効化 → 新規発行 → env 再同期。露出したキーは再利用しない |
| URL 検証 | アプリ側で `validate_public_url()` により SSRF を防止（内部・非公開アドレスへの scrape を拒否） |

> 公式: API キーは Bearer 認証で送信し、サーバー側で安全に管理する。参考: https://docs.firecrawl.dev/api-reference/v2-introduction

---

## 5. 環境変数マッピング

変数の意味・必須性の正本は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) です。この文書では取得・反映手順を扱います。

| 変数名 | 設定先 | 重要度 | 環境 | 既定値 | 説明 |
|---|---|---|---|---|---|
| `FIRECRAWL_API_KEY` | fastapi.env / `.env.local` | `[任意]` | `[共通可]` | （空） | Firecrawl API キー（`fc-...`）。空のとき HTML+LLM 抽出にフォールバック |
| `FIRECRAWL_BASE_URL` | fastapi.env / `.env.local` | `[任意]` | `[共通可]` | `https://api.firecrawl.dev` | Firecrawl API のベース URL。通常は既定のまま |
| `FIRECRAWL_TIMEOUT_SECONDS` | fastapi.env / `.env.local` | `[任意]` | `[共通可]` | `30` | scrape のタイムアウト（秒）。`*1000` して Firecrawl 側 `timeout`(ms) にも渡す |

### env への反映（CLI）

値の正本は repo local の `.secrets/` bundle です。Railway への反映は repo script を使います（変数カタログをここに複製しない）。

```bash
# 差分確認 → 反映
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-production

# staging の場合
zsh scripts/release/sync-career-compass-secrets.sh --check --target railway-staging
zsh scripts/release/sync-career-compass-secrets.sh --apply --target railway-staging
```

Railway の単一変数だけを CLI で直接設定したい場合（fallback）:

```bash
# 対象サービスにリンク済みの状態で（個別反映の正本は RAILWAY.md。秘匿値は stdin で渡す）
printf '%s' "fc-YOUR-API-KEY" | railway variable set FIRECRAWL_API_KEY --stdin
```

ローカルは `.env.local` に追記します（`.env.example` の該当行を参照）。

```env
FIRECRAWL_API_KEY=fc-YOUR-API-KEY
FIRECRAWL_BASE_URL=https://api.firecrawl.dev
FIRECRAWL_TIMEOUT_SECONDS=30
```

> **注意**: 変数変更は稼働中のデプロイに即時反映されません。Railway 側は保存後に Redeploy（または再起動）してください。

---

## 6. ローカル値の流用可否

`FIRECRAWL_API_KEY` は `[共通可]` の外部 API キーです。**`.env.local` の値をそのまま staging / production に貼ってよい**です（webhook endpoint やドメインのような環境依存要素を持たないため）。

- `FIRECRAWL_BASE_URL` / `FIRECRAWL_TIMEOUT_SECONDS` も `[共通可]`。通常は全環境で同じ既定値を使います。
- 環境別に利用量を分けて把握したい場合のみ、staging / production で別キーを発行して使い分けます（任意）。

---

## 7. コスト目安

> コストは目安です。最新の正確な料金は公式の料金ページで確認してください。

Firecrawl はクレジット制です。`scrape` は **1 ページあたり 1 クレジット**消費します。無料枠は **月 1,000 クレジット（= 約 1,000 ページ）** で、これを超えなければ無料です。

| プラン | 月額（年払い） | クレジット/月 | 目安 |
|---|---|---|---|
| Free | $0 | 1,000 | 約 1,000 ページ/月まで無料 |
| Hobby | $16 | 5,000 | 約 5,000 ページ/月 |
| Standard | $83 | 100,000 | 約 100,000 ページ/月 |
| Growth | $333 | 500,000 | 約 500,000 ページ/月 |
| Scale | $599 | 1,000,000 | 約 1,000,000 ページ/月 |
| Enterprise | カスタム | カスタム | 大規模・要問い合わせ |

1 回の抽出（1 URL の scrape）あたりの実コストの目安:

- **無料枠内（月 1,000 ページまで）: 実質 $0**
- 有料プラン換算: 概ね **$0.001〜$0.003/回**（Hobby: $16 ÷ 5,000 ≈ $0.0032、Standard: $83 ÷ 100,000 ≈ $0.0008）

> 旧記述の「約 $0.01〜0.05/回」は、公式の現行料金（scrape 1 クレジット/ページ・無料枠 1,000/月）と照らすと過大です。本番でも選考スケジュール抽出の頻度であれば、多くの場合は無料枠内に収まります。`search`(10 件で 2 クレジット) や `interact`(ブラウザ 1 分で 2 クレジット) 等、scrape 以外の機能を使うとクレジット消費が変わる点に注意してください（本アプリが使うのは `scrape` です）。
>
> 公式: 料金プランとクレジット消費（scrape は 1 クレジット/ページ、無料枠 1,000 クレジット/月）。参考: https://www.firecrawl.dev/pricing

利用量は Firecrawl Dashboard で監視してください。CLI を入れている場合は `firecrawl credit-usage` でも残量を確認できます。

---

## 8. 動作確認

`FIRECRAWL_API_KEY` を設定後、以下で疎通を確認します。

```bash
# CLI を入れている場合（最も手軽）
firecrawl scrape https://example.com

# CLI を使わない場合は REST を直接叩く（v1 scrape）
curl -X POST "https://api.firecrawl.dev/v1/scrape" \
  -H "Authorization: Bearer fc-YOUR-API-KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","onlyMainContent":true,"formats":["markdown"]}'
```

200 応答かつ `data.markdown` 等が返れば疎通 OK です。アプリ側では、企業情報の選考スケジュール取得経路で Firecrawl が呼ばれ、失敗時は HTML+LLM 抽出へ自動フォールバックします。

> 公式: scrape エンドポイントの認証は `Authorization: Bearer fc-...`。参考: https://docs.firecrawl.dev/api-reference/v2-introduction
