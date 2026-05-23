# Logo.dev の本番設定

[← インデックス](./README.md)

Logo.dev は企業アイコンの実ロゴ取得に使う**任意（optional）**の外部サービスです。Next.js (Vercel) 側のみで使用し、バックエンド (Railway) には設定不要です。

未設定でもアプリは動作します。`LOGO_DEV_TOKEN` が無い場合、ロゴ取得はスキップされ、UI は企業名の頭文字を使った avatar にフォールバックします。fallback プロバイダの Brandfetch については [`BRANDFETCH.md`](./BRANDFETCH.md) を参照してください（`auto` プロバイダは Logo.dev → Brandfetch の順で試行します）。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 用途 | 企業アイコンの実ロゴ取得（企業ロゴ表示） |
| 必須度 | 任意（未設定時は頭文字 avatar にフォールバック） |
| 使用箇所 | Next.js (Vercel) のサーバーサイド（`src/app/api/company-logos/route.ts`） |
| 未設定時の挙動 | `LOGO_DEV_TOKEN` 無し → ロゴ取得スキップ。`LOGO_DEV_SECRET_KEY` 無し → 企業名からの domain 解決をスキップし、ドメイン既知のロゴのみ取得 |

就活Pass は 2 種類のキーを使い分けます。

| キー | プレフィックス | 用途 | 呼び出し先 |
|---|---|---|---|
| `LOGO_DEV_TOKEN` | `pk_`（publishable key） | 実ロゴ画像の取得 | `https://img.logo.dev/<domain>` / `https://img.logo.dev/name/<name>` に `?token=` で付与 |
| `LOGO_DEV_SECRET_KEY` | `sk_`（secret key） | 企業名から domain を解決（Brand Search） | `https://api.logo.dev/search` に `Authorization: Bearer` で付与 |

> 公式: publishable key は `img.logo.dev` 専用、secret key は `search` / `describe` などのサーバー API 用。参考: https://www.logo.dev/docs/platform/api-keys

`LOGO_DEV_SECRET_KEY` を別途設定しない場合でも、`LOGO_DEV_TOKEN` が `sk_` プレフィックスのキーであれば、それが Brand Search 用 secret として流用されます（`getLogoDevSearchSecret()` の挙動）。ただし publishable key (`pk_`) と secret key (`sk_`) は別物なので、両機能を使うなら 2 つとも設定するのが確実です。

---

## 2. 前提 CLI

**Logo.dev に CLI はありません。** キーの作成・確認・無効化はすべて Web ダッシュボードで行います。env への反映は Vercel CLI と `.env.local` で行います。

> 公式: キー管理は Logo.dev dashboard でのみ実施（`https://www.logo.dev/dashboard/api-keys`）。CLI の記載なし。キーのローテーションは `support@logo.dev` への連絡が必要。参考: https://www.logo.dev/docs/platform/api-keys

env 反映に使う Vercel CLI:

```bash
# 未インストールなら
npm i -g vercel

# ログイン
vercel login

# 対象プロジェクトに紐付け（リポジトリ直下で実行）
vercel link
```

---

## 3. キー取得（Dashboard）

CLI が無いため、キー取得は Web ダッシュボードで行います。

### 3-1. アカウント作成

1. https://www.logo.dev/ にアクセスし、Sign up でアカウントを作成する（登録は無料）。
2. ログイン後、ダッシュボード https://www.logo.dev/dashboard/api-keys を開く。

> 公式: ロゴ画像 API は登録すれば無料で使える。参考: https://www.logo.dev/

### 3-2. publishable token（`LOGO_DEV_TOKEN`）の取得

1. ダッシュボードの **API keys** → **Publishable key** をコピーする（`pk_` で始まる）。
2. これを `LOGO_DEV_TOKEN` に設定する。実ロゴ画像の取得（`img.logo.dev`）に使う。

publishable key は client-side でも使える設計だが、就活Pass では **サーバーサイド（`/api/company-logos`）からのみ**呼び出し、ブラウザに露出させない（後述の `NEXT_PUBLIC_*` は退役済み）。

### 3-3. secret key（`LOGO_DEV_SECRET_KEY`）の取得

1. 同じダッシュボードの **API keys** → **Secret key** をコピーする（`sk_` で始まる）。
2. これを `LOGO_DEV_SECRET_KEY` に設定する。企業名から domain を解決する Brand Search (`api.logo.dev/search`) に使う。

> 公式: secret key は server-side 専用。`search`・`describe` などのエンドポイントに必須で、絶対に公開しない。参考: https://www.logo.dev/docs/platform/api-keys

> **注意**: secret key は外部に漏らさないこと。漏洩した場合は `support@logo.dev` に連絡してローテーションする（ダッシュボード上の self-service ローテーションは提供されていない）。

---

## 4. キーの制限・セキュリティ

| キー | 設置場所 | 制限 |
|---|---|---|
| `LOGO_DEV_TOKEN` (`pk_`) | サーバー専用（Vercel 環境変数）。`NEXT_PUBLIC_*` には置かない | publishable だが就活Pass ではサーバー経由でのみ使用 |
| `LOGO_DEV_SECRET_KEY` (`sk_`) | サーバー専用（Vercel 環境変数） | 絶対にクライアントへ渡さない |

publishable key には任意で **domain 制限（Referer ベース）** を掛けられます。就活Pass はサーバーサイドからの呼び出しのため Referer 制限を有効化すると弾かれる可能性があります。有効化する場合は本番ドメイン（`shupass.jp`）の挙動を確認してから設定してください。

> 公式: publishable key は domain 制限を有効化すると、一致する `Referer` ヘッダのリクエストのみ許可される。`example.com`（完全一致）/ `*.example.com`（サブドメイン）形式。参考: https://www.logo.dev/docs/platform/api-keys

退役済みの変数（新規設定しない）:

- `NEXT_PUBLIC_LOGO_DEV_TOKEN` — server-only 名 `LOGO_DEV_TOKEN` に統一済み。互換 fallback もコードから除去済み。

---

## 5. 環境変数マッピング表

| 変数名 | 設定先 | 重要度 | 環境 |
|---|---|---|---|
| `LOGO_DEV_TOKEN` | `.env.local` / Vercel（nextjs.env） | 任意 | 共通可 |
| `LOGO_DEV_SECRET_KEY` | `.env.local` / Vercel（nextjs.env） | 任意 | 共通可 |

変数の意味の正本は [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) です。この文書では変数カタログを複製しません。

### env への反映（Vercel CLI）

`.env.local` の値をそのまま staging / production に流用できます（次節参照）。Vercel への反映は CLI で行います。

staging と production は別の Vercel project（`career-compass-staging` / `career-compass`）で、どちらも **Production env scope** を使う（`preview` scope は使わない。詳細は [`VERCEL.md`](./VERCEL.md) と [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md) §3）。直接 `vercel env add` で入れる場合は、対象 project に `vercel link` した状態で Production scope に追加する。

```bash
# 対象 project に link 済みの状態で（staging も production も Production scope）
vercel env add LOGO_DEV_TOKEN production
vercel env add LOGO_DEV_SECRET_KEY production
```

> `vercel env add` は値を対話的に貼り付ける。実キーをコマンド履歴やファイルに残さない。

就活Pass の標準運用では、値の正本は repo local `.secrets/<env>/nextjs.env` に置き、`sync-career-compass-secrets.sh` で対象 project に同期する（解決順は [operations/production/SECRETS_MANAGEMENT.md](../operations/production/SECRETS_MANAGEMENT.md) を参照）。

```bash
# production（career-compass project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-production --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-production --vercel-env production

# staging（career-compass-staging project）
zsh scripts/release/sync-career-compass-secrets.sh --check --target vercel-staging --vercel-env production
zsh scripts/release/sync-career-compass-secrets.sh --apply --target vercel-staging --vercel-env production
```

---

## 6. ローカル値の流用可否

`LOGO_DEV_TOKEN` と `LOGO_DEV_SECRET_KEY` はどちらも **`[共通可]`** の外部 API キーです。

- **`.env.local` の値をそのまま staging / production に貼ってよい。** Logo.dev のキーは環境分離の境界ではなく、Stripe や OAuth client のように環境ごとに発行を分ける必要はありません。
- ただし、本番でリクエスト数の使用状況を分離して把握したい場合は、環境別に別キーを発行して上書きしてもかまいません（任意。Logo.dev は環境別キーを必須としません）。

> 正本: `[共通可]`（同値でもよい）として `ENVIRONMENT_VARIABLES.md` に明記。参考: [`operations/platform/ENVIRONMENT_VARIABLES.md`](../operations/platform/ENVIRONMENT_VARIABLES.md)

---

## 7. コスト目安

Logo.dev は無料枠で開始できます。料金は変動するため、最新は公式 pricing を確認してください。以下は目安です（年額請求）。

| プラン | 月間リクエスト数（目安） | 料金（目安・年額） | 備考 |
|---|---|---|---|
| Community（無料） | 約 500K req/mo | $0 | **attribution（クレジット表示）が必要** |
| Startup | 約 1M req/mo | 約 $280 / 年 | attribution 不要・メールサポート |
| Pro | 約 5M req/mo | 約 $1,260 / 年 | 優先サポート・self-hosting オプション |
| Enterprise | 無制限（目安） | $2,800〜 / 年 | カスタム規約・専用エンドポイント |

- レート制限は**月間リクエスト数のみ**で、burst（秒間）制限はありません。上限に近づくとメール通知が来ます。少し超過しても fair use の範囲なら即座に止まることはありません。
- 就活Pass の用途（企業ロゴ表示）では Community 無料枠の 500K req/mo で十分なことが多いですが、無料枠は attribution が必要な点に注意してください。

> 公式: Community $0（500K req/mo・attribution required）/ Startup（1M）/ Pro（5M）/ Enterprise。参考: https://www.logo.dev/pricing
> 公式: 月間制限のみで burst 制限なし。参考: https://www.logo.dev/docs/platform/rate-limits

---

## 8. 動作確認

env 反映後、`/api/company-logos` 経由でロゴが取得できるか確認します（実キーはコマンド履歴に残さないよう注意）。

```bash
# domain 指定でロゴ取得（200 + image/png なら OK）
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" \
  "http://localhost:3000/api/company-logos?provider=logo-dev&domain=mitsui.com"

# 企業名指定（LOGO_DEV_SECRET_KEY が設定されていれば domain 解決を経由）
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" \
  "http://localhost:3000/api/company-logos?provider=logo-dev-name&name=Sagawa%20Express"
```

- 200 + `image/*` が返ればロゴ取得が機能しています。
- 404（miss）が返る場合、`LOGO_DEV_TOKEN` 未設定、または該当ドメインのロゴが存在しないケースです。UI 側は頭文字 avatar にフォールバックします。
