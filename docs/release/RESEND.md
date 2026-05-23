# Resend の設定（お問い合わせメール送信）

[← インデックス](./README.md)

---

## 1. 概要

Resend は、お問い合わせフォーム（`/contact`）からの送信内容を運用側のメールアドレスへ通知するために使う。Next.js (Vercel) のサーバーサイドからのみ呼び出し、Railway (FastAPI) 側では使わない。

| 項目 | 内容 |
|---|---|
| 用途 | お問い合わせフォームの内容を `support@shupass.jp` 宛に通知 |
| 使用箇所 | Next.js (Vercel)。実装は `src/lib/mail/contact-notifications.ts` |
| 重要度 | **任意**（未設定でもアプリは起動する） |
| 呼び出し方式 | Resend REST API (`POST https://api.resend.com/emails`) を `fetch` で直接呼ぶ |

### 未設定時の挙動（fallback 動作）

- `RESEND_API_KEY` が未設定の場合、`sendContactNotification()` が `RESEND_API_KEY is not configured` を投げ、**メール通知が送られない**。お問い合わせ送信導線が機能しなくなるため、本番では設定を推奨する。
- `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` は未設定でもよい。どちらも未設定なら、コード内のデフォルト `support@shupass.jp` を送受信に使う（`DEFAULT_CONTACT_TO_EMAIL` / `DEFAULT_CONTACT_FROM_EMAIL`）。
- 送信元の表示名は `就活Pass` 固定で、`reply_to` には問い合わせ者のメールアドレスが入る（運用側はそのまま返信できる）。

> **重要**: 送信元アドレス（`CONTACT_FROM_EMAIL`）のドメインは、Resend で**ドメイン認証（DNS）が済んでいるドメイン**でなければ送信が拒否される。本番では `shupass.jp`（または `send.shupass.jp` サブドメイン）の認証が前提になる。詳細は [§4](#4-送信ドメインの認証dns)。

---

## 2. 前提 CLI

Resend には公式 CLI (`resend-cli`) があり、API キー作成・ドメイン管理・テスト送信まで CLI で完結できる。

> 公式: 公式 CLI。参考: https://github.com/resend/resend-cli

```bash
# インストール（いずれか 1 つ）
brew install resend/cli/resend          # macOS / Linux (Homebrew)
npm install -g resend-cli               # npm
curl -fsSL https://resend.com/install.sh | bash   # cURL

# バージョン確認
resend --version
```

ログイン（API キーを OS のキーチェーンに保存する）:

```bash
# 対話モード（ブラウザでキー作成 → CLI に貼り付け）
resend login

# 非対話モード（CI / スクリプト）。キーを直接渡す
resend login --key re_xxxxxxxxxxxxxxxxxxxx
```

> 公式: 認証は `--api-key` フラグ → 環境変数 `RESEND_API_KEY` → `resend login --key` の config ファイル、の優先順で解決される。参考: https://github.com/resend/resend-cli

環境の健全性確認（ドメイン認証状況も表示される）:

```bash
resend doctor
```

---

## 3. アカウント作成・API キーの取得

### アカウント作成

https://resend.com/signup でアカウントを作成する。Google / GitHub でのサインアップにも対応する。

> 公式: 料金・プラン。参考: https://resend.com/pricing

### API キーの作成（CLI 推奨）

```bash
# 送信専用キー（推奨。最小権限）
resend api-keys create --name "career-compass-production"

# 既存キーの一覧 / 削除
resend api-keys list
resend api-keys delete --id <key-id>
```

作成されたキー（`re_` で始まる）を控える。**作成時に一度しか表示されない**ため、安全に保管する。

> 公式: API キー作成。参考: https://resend.com/docs/api-reference/api-keys/create-api-key

### API キーの作成（REST / curl — CLI が使えない場合）

既存の `re_` キー（または管理用キー）を持っている場合、REST で作成できる。`permission` は `sending_access`（送信のみ）と `full_access`（全リソース操作）の 2 値。送信用途では `sending_access` を選ぶ。

```bash
curl -X POST 'https://api.resend.com/api-keys' \
  -H 'Authorization: Bearer re_xxxxxxxxxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{"name": "career-compass-production", "permission": "sending_access"}'
```

レスポンスの `token`（`re_...`）が新しい API キー。

> 公式: `POST /api-keys`。`permission` は `full_access` / `sending_access`。参考: https://resend.com/docs/api-reference/api-keys/create-api-key

### API キーの作成（Dashboard — fallback）

1. https://resend.com/api-keys にアクセス
2. **Create API Key**
3. Name に `career-compass-production`、Permission は **Sending access** を選ぶ
4. 表示された `re_...` を控える（再表示されない）

---

## 4. 送信ドメインの認証（DNS）

メール送信元（`CONTACT_FROM_EMAIL`）のドメインは Resend でドメイン認証する必要がある。これは **本番ドメイン `shupass.jp` 固有の作業**で、API キーのように環境間で流用できない（§7 参照）。`shupass.jp` の DNS は Cloudflare が authoritative なため、レコード追加は Cloudflare 側で行う。

> DNS の編集先・既存のメール用レコード（Google Workspace の MX / SPF / DKIM / DMARC）は [`DOMAIN_OPERATIONS.md`](./DOMAIN_OPERATIONS.md) を正本とする。本節は Resend 送信用に追加するレコードのみを扱う。

### 推奨: 送信専用サブドメイン `send.shupass.jp` を使う

Resend は送信用に専用サブドメイン（例: `send.shupass.jp`）を推奨する。これにより、Google Workspace が apex (`shupass.jp`) で使う既存の SPF / DKIM / DMARC と衝突しない。

> **注意**: apex (`shupass.jp`) の SPF / MX を Resend 用に書き換えると、[`DOMAIN_OPERATIONS.md`](./DOMAIN_OPERATIONS.md) で定義した Google Workspace のメール受信・送信が壊れる。Resend 用は必ずサブドメインに分離する。

### ドメイン追加（CLI 推奨）

```bash
# 送信専用サブドメインを追加
resend domains create --name send.shupass.jp

# 追加済みドメインの一覧（認証状況の確認）
resend domains list

# DNS レコード設定後に認証を実行
resend domains verify --id <domain-id>
```

ドメイン追加（REST / curl）:

```bash
curl -X POST 'https://api.resend.com/domains' \
  -H 'Authorization: Bearer re_xxxxxxxxxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{"name": "send.shupass.jp"}'
```

> 公式: ドメイン管理。参考: https://resend.com/docs/dashboard/domains/introduction

### ドメイン追加（Dashboard — fallback）

1. https://resend.com/domains → **Add Domain**
2. ドメイン名に `send.shupass.jp` を入力
3. 表示される **MX / TXT (SPF) / TXT (DKIM)** レコードを控える

### Cloudflare に追加する DNS レコード

Resend がドメイン追加時に提示するレコードを Cloudflare DNS に登録する。**実際の値（特に DKIM 公開鍵）は Resend の管理画面が発行する値を正本とする**。以下は典型的な形式の参考。

| Type | Name（Cloudflare の Name 欄） | Value（例） | 備考 |
|---|---|---|---|
| `MX` | `send` | `feedback-smtp.<region>.amazonses.com`（Resend 提示値） | バウンス受信用。Priority は提示値 |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | 送信用 SPF |
| `TXT` | `resend._domainkey` | `p=...`（Resend が発行する DKIM 公開鍵） | 送信用 DKIM |

> Cloudflare の Name 欄には `send` のようにラベルだけを入力すれば、`send.shupass.jp` として登録される（Cloudflare がゾーン名を自動補完する）。
>
> **重要**: Resend 経由のメールに Cloudflare の Email Routing / プロキシ（オレンジ雲）を適用しない。これらの DNS レコードは「DNS only」（グレー雲）で登録する。

### DMARC（任意）

SPF / DKIM の認証後、必要に応じて DMARC を追加できる。apex の `_dmarc` は [`DOMAIN_OPERATIONS.md`](./DOMAIN_OPERATIONS.md) で Google Workspace 用に `p=none` 設定済みのため、サブドメイン送信ではその設定が継承される。専用に分ける場合のみ追加する。

| Type | Name | Value（例） |
|---|---|---|
| `TXT` | `_dmarc.send` | `v=DMARC1; p=none; rua=mailto:support@shupass.jp` |

> 公式: SPF と DKIM の 2 レコードが認証に必須、DMARC は任意。参考: https://resend.com/docs/dashboard/domains/introduction

### 認証の確認

レコード追加後、Resend 側で認証する（CLI: `resend domains verify --id <domain-id>` / Dashboard: 対象ドメインの **Verify DNS Records**）。DNS 伝播に最大 24 時間かかる場合がある。Cloudflare 側からは `dig` で確認できる。

```bash
dig send.shupass.jp txt +short            # => "v=spf1 include:amazonses.com ~all"
dig resend._domainkey.send.shupass.jp txt +short   # => "p=..."（DKIM）
dig send.shupass.jp mx +short             # => 提示された feedback-smtp ホスト
```

認証が `Verified`（緑）になれば、`CONTACT_FROM_EMAIL` に `support@send.shupass.jp` のような同ドメインのアドレスを使って送信できる。

---

## 5. キーの制限・セキュリティ

| 項目 | 推奨 |
|---|---|
| 権限 | **Sending access**（送信専用）。`full_access` は使わない |
| 利用箇所 | サーバー専用。`RESEND_API_KEY` はクライアントへ露出させない（`src/env/server.ts` の server schema で管理） |
| ドメイン制限 | `sending_access` キーは `domain_id` で送信元ドメインを限定できる |
| キー保管 | 正本は repo local `.secrets/`。漏洩したキーは Resend 側で削除し、新規発行して差し替える |
| ローテーション | チャット・ログ・issue 等に貼ったキーは漏洩済みとして無効化する |

> `RESEND_API_KEY` は server-only の secret。Next.js の `NEXT_PUBLIC_` prefix を付けない。参考: `src/env/server.ts`

---

## 6. 環境変数マッピング表

| 変数名 | 設定先 | 重要度 | 環境 |
|---|---|---|---|
| `RESEND_API_KEY` | `.env.local`（ローカル） / Vercel (`nextjs.env`) | `[任意]` | `[共通可]` |
| `CONTACT_TO_EMAIL` | `.env.local`（ローカル） / Vercel (`nextjs.env`) | `[任意]` | `[共通可]` |
| `CONTACT_FROM_EMAIL` | `.env.local`（ローカル） / Vercel (`nextjs.env`) | `[任意]` | `[共通可]` |

- 3 変数とも server-side（`src/env/server.ts`）。`CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL` は email 形式でバリデーションされる。
- 変数の意味の SSOT は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)。本文書には取得手順のみを置く。

### env 反映

ローカル（`.env.local` に追記）:

```dotenv
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
CONTACT_TO_EMAIL=support@shupass.jp
CONTACT_FROM_EMAIL=support@send.shupass.jp
```

Vercel（`vercel env add` で対話的に値を入力）:

```bash
# 環境を指定して追加（production / preview / development）
vercel env add RESEND_API_KEY production
vercel env add CONTACT_TO_EMAIL production
vercel env add CONTACT_FROM_EMAIL production
```

> 就活Pass の標準フローでは、secrets 正本（repo local `.secrets/`）に値を入れてから `zsh scripts/release/sync-career-compass-secrets.sh` で Vercel に同期する。個別に入れる場合のみ上記 `vercel env add` を使う。解決順は [`operations/production/SECRETS_MANAGEMENT.md`](../operations/production/SECRETS_MANAGEMENT.md) を参照。

```bash
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production
```

---

## 7. ローカル値の流用可否

| 変数 | 流用可否 | 理由 |
|---|---|---|
| `RESEND_API_KEY` | **流用可**（`[共通可]`） | 外部 API キーで環境分離の境界ではない。`.env.local` の値をそのまま staging / production に貼ってよい。漏洩時の影響範囲を分けたい場合のみ環境別に発行する |
| `CONTACT_TO_EMAIL` | **流用可**（`[共通可]`） | 公開連絡先で環境差がない。全環境 `support@shupass.jp` でよい |
| `CONTACT_FROM_EMAIL` | **流用可**（`[共通可]`） | 同上。ただし送信元ドメインは認証済みドメインに限る（下記） |

> **送信ドメイン認証（DNS）は流用と別物**: API キー値は流用してよいが、`CONTACT_FROM_EMAIL` で使う**送信元ドメインの DNS 認証（§4）は本番ドメイン `shupass.jp` 固有**であり、環境間で「コピペ」できない。staging で別ドメインを使う場合は、そのドメインの SPF / DKIM を別途認証する必要がある。本番では `shupass.jp`（`send.shupass.jp`）の認証を正本とする。

---

## 8. コスト目安・動作確認

### コスト目安

> 公式: 料金。参考: https://resend.com/pricing

| プラン | 月額（目安） | 送信量（目安） | ドメイン | ログ保持 |
|---|---|---|---|---|
| Free | 無料 | 月 3,000 通 / 日 100 通 | 1 ドメイン | 30 日 |
| Pro | $20 / 月（目安） | 月 50,000 通（超過 $0.90 / 1,000 通） | 10 ドメイン | 30 日 |

- 就活Pass のお問い合わせ通知は送信頻度が低いため、**Free プラン（月 3,000 通）で十分**な想定。
- 料金・無料枠は変動するため、契約時に公式 https://resend.com/pricing で最新を確認する。

> 公式: アカウントの quota / 制限。参考: https://resend.com/docs/knowledge-base/account-quotas-and-limits

### 動作確認

CLI でテスト送信（Resend のテスト宛先 `delivered@resend.dev` は認証不要で受信できる）:

```bash
resend emails send \
  --from "support@send.shupass.jp" \
  --to "delivered@resend.dev" \
  --subject "Resend test from career-compass" \
  --text "テスト送信"
```

REST（実装と同じ経路）で確認:

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_xxxxxxxxxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "就活Pass <support@send.shupass.jp>",
    "to": ["support@shupass.jp"],
    "subject": "[就活Pass] お問い合わせ（テスト）",
    "text": "テスト送信"
  }'
```

アプリ側の動作確認:

1. ローカルで `.env.local` に 3 変数を設定し、開発サーバーを起動
2. `/contact` からお問い合わせを送信
3. `CONTACT_TO_EMAIL`（既定 `support@shupass.jp`）の受信箱に通知が届くことを確認
4. 通知メールに **返信**すると、`reply_to`（問い合わせ者のアドレス）宛に返せることを確認

> 受信先 `support@shupass.jp` は Google Workspace の alias 運用。受信できないときの確認順は [`DOMAIN_OPERATIONS.md`](./DOMAIN_OPERATIONS.md) §3-5 を参照。
