# 環境変数 SSOT（唯一の正本）

**この文書の役割**: 就活Pass の環境変数を「どの順番で設定するか」「環境で共通か / 分けるか」「どこに設定するか」「どう環境判定するか」「必須か任意か」の順に、迷わず引けるようにした唯一の正本（SSOT）です。初めての人は **§0 ナビ** から自分の用途へ辿ってください。

**真実の源泉はコード**: 変数の実在・必須性・型・別名（alias）の正本は常にコード（下表）。この文書はコードを後追いで解説するもので、食い違う場合は**コードが正**（更新トリガーは §4-5）。整合は `npm run check:env-drift` が機械検査し、現状 "no drift detected"（56 server + 5 client = 61 T3 / 135 backend）。

| 層 | 正本ファイル | 役割 |
|---|---|---|
| コード | `src/env/server.ts` / `src/env/client.ts` | Next.js server / client（`NEXT_PUBLIC_*`）変数の型・必須性（T3 Env / Zod） |
| コード | `src/env/deployment.ts` | **環境判定 SSOT**。`resolveAppEnvironment()` が `APP_ENV` を解釈（local/staging/production） |
| コード | `src/env/capabilities.ts` | 起動時 capability 検証（deployed 必須セット・trusted origins） |
| コード | `backend/app/config.py` | FastAPI 設定の型・別名（Pydantic v2 `AliasChoices`） |
| テンプレ | `scripts/release/secrets-examples/**` | provider 同期テンプレ（key・形式のみ。実値なし） |
| テンプレ | `.env.example` | ローカル開発テンプレ（`cp .env.example .env.local`） |

**secret 実値はこの文書に書きません**: 実値の正本は `.secrets/`（gitignored）、fallback `codex-company/.secrets/career_compass/`。実 `*.env` は読まない・転記しない。key set 確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみ。

> **外部からの参照はファイルパス（このファイル）で行うのが安全です**。文書内の節は番号＋見出しキーワード（例: §2 共通か / 環境ごとか、§4-3 判断フロー）で示します。迷ったら §0 のナビから自分の用途へ辿ってください。

---

## 0. この文書の使い方（30秒ナビ）

| やりたいこと | 行き先 |
|---|---|
| **ローカルで動かしたい** | **§1-1 ローカル最小セット**（外部サービスの取得手順は [`docs/setup/DEVELOPMENT_AND_ENV.md`](../../setup/DEVELOPMENT_AND_ENV.md)） |
| **staging / 本番に設定したい** | **§1-2 → §1-3**（テンプレ操作の how-to は [`secrets-examples/README.md`](../../../scripts/release/secrets-examples/README.md)） |
| この変数は**共通でよい? 環境ごとに分ける?** | **§2 共通か / 環境ごとか（2軸モデル）** |
| 環境判定（`APP_ENV`）の仕組みを知りたい | **§3 環境判定モデル** |
| 変数が**どこに定義され、必須か**を調べたい | **§4-2 変数索引** |
| **新しい変数を追加**する | **§4-3 判断フロー** |
| drift 検査・保守ルール | **§4-4 / §4-5** |

> この文書は上から「順番に設定する手順（§1）→ 共通/環境別の考え方（§2）→ 環境判定（§3）」までが**初見向け**、§4 以降が**保守者向けリファレンス**です。最初は §1〜§3 だけ読めば足ります。

---

## 1. セットアップ手順（順番に設定する）

### 1-1 ローカル最小セット（これだけで起動する）

```bash
cp .env.example .env.local   # 1. テンプレをコピー
# 2. 下の最小必須を .env.local に埋める（npm run dev の preflight が不足項目を表示）
make db-up                   # 3. ローカル Docker postgres を起動
npm run db:push              # 4. スキーマ適用
npm run dev                  # 5. 開発サーバー起動
```

**ローカル最小必須（コードの required と一致）** — Next.js（`src/env/server.ts` / `client.ts`）:

| 変数 | 役割 | 生成 / 取得 |
|---|---|---|
| `DATABASE_URL` | DB 接続 | ローカル Docker postgres の接続文字列 |
| `BETTER_AUTH_SECRET` | セッション署名 | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | Google Cloud Console（redirect `<base>/api/auth/callback/google`） |
| `STRIPE_SECRET_KEY` | 決済 | Stripe test key（`sk_test_`） |
| `STRIPE_WEBHOOK_SECRET` | webhook 検証 | `stripe listen` が出力（`whsec_`） |
| `ENCRYPTION_KEY` | 暗号化 | `openssl rand -hex 32`（64 桁 hex） |
| `CRON_SECRET` | 内部 cron 認証 | `openssl rand -base64 32` |
| `INTERNAL_API_JWT_SECRET` | BFF↔FastAPI 署名 | `openssl rand -base64 32`（32 文字以上） |
| `CAREER_PRINCIPAL_HMAC_SECRET` | 認証ヘッダ署名 | `openssl rand -base64 32`（32 文字以上） |
| `NEXT_PUBLIC_APP_URL` | アプリ URL（client） | `http://localhost:3000` |

FastAPI（`backend/app/config.py`。BFF と同じ secret を共有）:

| 変数 | 役割 | 生成 / 取得 |
|---|---|---|
| `INTERNAL_API_JWT_SECRET` | Next.js と**同値** | 上で生成した値 |
| `CAREER_PRINCIPAL_HMAC_SECRET` | Next.js と**同値** | 上で生成した値 |
| `TENANT_KEY_SECRET` | テナント隔離 | `openssl rand -base64 32`（32 文字以上） |
| `OPENAI_API_KEY` | LLM | OpenAI |
| `ANTHROPIC_API_KEY` | LLM | Anthropic |

> `CORS_ORIGINS` / `FRONTEND_URL` はローカルでは default（`http://localhost:3000`）で動くため設定不要。Redis（`UPSTASH_*` / `REDIS_URL`）も任意で、未設定ならキャッシュ無効で動作する。
> **外部サービスの取得手順**（Supabase project 作成・Google OAuth console・Stripe アカウント）は [`docs/setup/DEVELOPMENT_AND_ENV.md`](../../setup/DEVELOPMENT_AND_ENV.md) に集約。ここでは複製しない。

### 1-2 staging / production を環境別に設定する

```bash
# 1. テンプレをコピー
cp scripts/release/secrets-examples/staging/*.example    .secrets/staging/
cp scripts/release/secrets-examples/production/*.example .secrets/production/
# 2. .example 拡張子を外す
for f in .secrets/**/*.example; do mv "$f" "${f%.example}"; done
# 3. 次の順番で編集する
```

**編集順（必ずこの順）**: `shared.env` → `nextjs.env` → `fastapi.env` → `supabase.env`

| ファイル | 主に入れる変数 |
|---|---|
| **`shared.env`** | `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`, `TENANT_KEY_SECRET`（BFF↔FastAPI で同値・**ここにだけ**書く） |
| **`nextjs.env`**（Vercel） | Vercel メタ（`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`）／`APP_ENV`, `NEXT_PUBLIC_APP_ENV`／`DATABASE_URL`, `DIRECT_URL`／`BETTER_AUTH_*`, `GOOGLE_*`／`STRIPE_*`／`ENCRYPTION_KEY`, `CRON_SECRET`／`FASTAPI_URL`／`UPSTASH_REDIS_*`／`NEXT_PUBLIC_APP_URL` |
| **`fastapi.env`**（Railway） | Railway メタ（`RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_NAME`, `RAILWAY_ENVIRONMENT_NAME`）／`APP_ENV`／`CORS_ORIGINS`／`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`／`REDIS_URL`／`FRONTEND_URL`, `BACKEND_TRUSTED_HOSTS` |
| **`supabase.env`** | `SUPABASE_STAGING_PROJECT_REF` / `SUPABASE_PRODUCTION_PROJECT_REF`（bootstrap 専用） |

**deployed（staging / production 共通）で追加必須**（`capabilities.ts` / `config.py` が fail-fast）:
`FASTAPI_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`（HTTPS 強制）, `REDIS_URL`, `CORS_ORIGINS`（localhost / `*` 不可）, `BACKEND_TRUSTED_HOSTS`。

**production 限定で追加必須**（`capabilities.ts` の production profile）:
`STRIPE_PRICE_{STANDARD,PRO}_{MONTHLY,ANNUAL}`, `STRIPE_PORTAL_CONFIGURATION_ID`（`bpc_`）, さらに `BETTER_AUTH_TRUSTED_ORIGINS` に `https://www.shupass.jp,https://shupass.jp` を含めること。

**設定時の注意（loss-less）**:
- `shared.env` の変数を `nextjs.env`/`fastapi.env` に**重複定義しない**（値が同じでも sync がエラー中断）。
- `BACKEND_TRUSTED_HOSTS` は本番 host を含める。未設定だと `/health` は通っても通常 API が host check で落ちる。
- DB migration は Transaction Pooler `6543` 不可。Direct/Session `5432`（`DIRECT_URL`）を使う。production migration は raw `db:push` ではなく `make deploy-migrate` / `make db-migrate-check`。
- Supabase は staging / production を**別 project**に分ける。project ref は実 secret と同じ扱いで `.secrets/` に置き、公開サンプルには書かない。app table は各 project の `public` schema。

> CI（GitHub Actions・実 staging E2E 用）の secret は `scripts/release/secrets-examples/ci/github-actions.env.example` から `.secrets/ci/github-actions.env` を作る。`CI_E2E_*` は staging のみで production には入れない。テンプレ操作の詳細は [`secrets-examples/README.md`](../../../scripts/release/secrets-examples/README.md)。

### 1-3 provider へ反映する（sync コマンドの順番）

```bash
# Step 1: ローカル bundle の形式検査（provider 接続不要）
zsh scripts/release/sync-career-compass-secrets.sh --check --target all --skip-provider-drift
# Step 2: provider との key 差分確認（CLI 認証が必要）
zsh scripts/release/sync-career-compass-secrets.sh --check --target all
# Step 3: provider へ実反映（Vercel / Railway / GitHub / Supabase）
SYNC_MODE=--apply TARGET=all make ops-secrets-sync
```

`--check` は provider drift では key の追加/削除のみを判定し、secret 値は表示しない。ローカル bundle については、同期前事故を防ぐため `APP_ENV`、Stripe key prefix、namespace、provider project ID の重複などの形式検査だけ行う（§3-1 参照）。

---

## 2. 共通か / 環境ごとか（2軸モデル）

**核心**: ほとんどの変数は**全環境（local / staging / production）に存在する**。「共通か」の本当の問いは「**値を環境間で同じにしてよいか / 分けるべきか**」です。**既定は分ける**。同じ値でよいのは組織 ID・公開情報・モデル名など限定的なものだけです。「全環境で共通」は**変数名と用途が共通**という意味で、secret 実値を同じにしてよいという意味ではありません。

### 2-1 軸1: その変数は全環境に存在するか / 特定環境だけか

- **全環境に存在（大多数）**: 認証/暗号鍵、LLM キー、内部署名鍵、DB/Redis 接続、チューニング値など。名前と用途は全環境で共通（値の扱いは §2-2）。
- **特定環境だけに存在**:
  - `CI_E2E_AUTH_ENABLED` / `CI_E2E_AUTH_SECRET` 系 — **staging / CI のみ**。production には入れない。
  - `STRIPE_PRICE_{STANDARD,PRO}_{MONTHLY,ANNUAL}` / `STRIPE_PORTAL_CONFIGURATION_ID` — **production で必須**（staging では任意）。
  - `DIRECT_URL`、ローカル便宜フラグなど — 環境により設定有無が変わる。

### 2-2 軸2: 値を環境間で同じにしてよいか

| 分類 | 変数例 | staging / production の同値 | 理由 / 検査 |
|---|---|---|---|
| **必ず別値** | `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `DATABASE_URL`, `DIRECT_URL`, `FASTAPI_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `BACKEND_TRUSTED_HOSTS`, `UPSTASH_REDIS_NAMESPACE`, `REDIS_NAMESPACE`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_PORTAL_CONFIGURATION_ID`, `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_PRODUCTION_PROJECT_REF`, `VERCEL_PROJECT_ID`, `RAILWAY_PROJECT_ID` | **不可** | 論理環境、接続先、URL、課金、project 分離そのものを表す。sync は `APP_ENV`、namespace、Stripe prefix、provider project ID 重複を検査する。 |
| **同一環境内は同値・環境間は別値** | `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`, `TENANT_KEY_SECRET` | **不可** | BFF と FastAPI の間では同じ値が必要なため `shared.env` に置く。ただし staging と production では別 secret にする。service env への重複定義は sync が拒否する。 |
| **原則別値** | `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN` | 原則不可 | 漏洩時の影響範囲、権限、quota、監査を分けるため。dev/staging の LLM key 共有などコスト都合で例外にする場合も production は分ける。 |
| **同値でもよい** | `VERCEL_TEAM_ID`, `SUPABASE_ORG_ID`, `SENTRY_ORG`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `LEGAL_*`, `LOGO_DEV_TOKEN`, `LOGO_DEV_SECRET_KEY`, `BRANDFETCH_CLIENT_ID`, モデル ID / チューニング値 | 可 | 組織 ID、公開連絡先、法令表示、モデル名などは環境分離の境界ではない。必要に応じて環境別に上書きしてよい。 |
| **CI / sync メタ** | `CI_E2E_AUTH_SECRET`, `CI_E2E_AUTH_ENABLED`, `PLAYWRIGHT_BASE_URL`, `RAILWAY_ENVIRONMENT_NAME` | 用途限定 | `CI_E2E_*` は staging E2E 用で production には入れない。`RAILWAY_ENVIRONMENT_NAME` は別 Railway project 構成では staging / production とも `production` でよい。 |

**「全環境に存在し名前が共通」の主なグループ**（値の扱いは上表）:
- 内部署名鍵: `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`（環境内で BFF/FastAPI 同値。`shared.env`）
- 認証/暗号: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`
- LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, モデル設定 `MODEL_*` / `CLAUDE_*` / `GPT_*` / `GEMINI_*`
- チューニング（default で動作）: `RAG_*`, `PDF_OCR_*`, `MOTIVATION_*`, `RERANKER_*`, `GAKUCHIKA_*`, `LLM_PRICE_OVERRIDES_JSON`, `LLM_CALL_BUDGET_OVERRIDES_JSON`
- 法令表記（未設定ならコード default。本番は実値を設定）: `LEGAL_*`（§4-2 参照）

### 2-3 環境ごとに具体値が変わる変数の早見表

「必ず別値」のうち、設定する具体値が環境で意味的に変わるものを一覧にする。

| 変数 | local | CI（GitHub Actions） | staging | production |
|---|---|---|---|---|
| `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | 未設定（→ `local`） | 未設定（test 経路） | `staging` | `production` |
| `NODE_ENV`（自動） | `development` | `test` | `production` | `production` |
| `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` | `http://localhost:3000` | `https://stg.shupass.jp`（fixture） | `https://stg.shupass.jp` | `https://www.shupass.jp` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | `https://stg.shupass.jp`（fixture） | `https://stg.shupass.jp`（1 origin） | `https://www.shupass.jp,https://shupass.jp`（2 origin） |
| `DATABASE_URL` / `DIRECT_URL` | local Docker postgres | local fixture | `career-compass-staging` Supabase | `career-compass-db` Supabase |
| `STRIPE_SECRET_KEY` | `sk_test_` | `sk_test_ci`（fixture） | `sk_test_` | `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_`（CLI） | `whsec_ci`（fixture） | `whsec_` | `whsec_` |
| `UPSTASH_REDIS_NAMESPACE` / `REDIS_NAMESPACE` | 任意 | 未設定 | `staging` | `production` |
| `CORS_ORIGINS`（FastAPI） | `["http://localhost:3000"]` | local | `["https://stg.shupass.jp"]` | `["https://www.shupass.jp","https://shupass.jp"]` |
| `SENTRY_ENVIRONMENT`（FastAPI） | 未設定（→ APP_ENV） | 未設定 | `staging` | `production` |
| `FASTAPI_URL` / `BACKEND_URL` | `http://localhost:8000`（任意） | `https://stg-api.shupass.jp`（fixture） | staging FastAPI URL | production FastAPI URL |
| `CI_E2E_AUTH_ENABLED` / `CI_E2E_AUTH_SECRET` | 未設定 / wrapper 一時生成 | `1` / GitHub Secrets | `1` / secret | 未設定（無効） |
| `TENANT_KEY_SECRET` | local 値 | — | **staging 専用値** | **production 専用値** |

> `BETTER_AUTH_SECRET` 等の鍵は「名前は共通・実値は環境ごとに別」（§2-2 の「原則別値」）。CI 列「fixture」は `develop-ci.yml` frontend job の意図的ダミー（**実 secret ではない**。§4-4 の CI fixture 参照）。

---

## 3. 環境判定モデル（APP_ENV が唯一の正）

環境判定の正本は **`APP_ENV` ∈ {local, staging, production}** ただ 1 つ。`NODE_ENV`/`VERCEL_ENV`/`RAILWAY_ENVIRONMENT_NAME` はプラットフォームが自動設定する信号で、**アプリの環境分岐に使わない**。

| 層 | 変数 | 役割 | app 分岐に使うか |
|---|---|---|---|
| 正（SSOT） | `APP_ENV` | `resolveAppEnvironment()` の第一入力。deploy 環境で明示設定。`preview` は不可 | **使う（唯一の正）** |
| クライアント鏡像 | `NEXT_PUBLIC_APP_ENV` | ブラウザバンドルに server-only env は inline されないため、`APP_ENV` をクライアントに届ける**唯一の機構**。`validateAppEnvironmentConfiguration()` が `APP_ENV` との不一致を fatal 検出 | 使う（server 値の鏡） |
| 自動/インフラ信号 | `NODE_ENV` / `VERCEL_ENV` / `RAILWAY_ENVIRONMENT_NAME` | ツール/プラットフォームが自動設定。`NODE_ENV=production` 非 VITEST 時の fail-safe fallback のみ例外 | **使わない（分岐禁止）** |

> `NEXT_PUBLIC_APP_ENV` は冗長コピーではなく Next.js アーキ上の必然です（server-only 変数はクライアントに出ない／`NODE_ENV`・`VERCEL_ENV` では staging/production を区別できない）。

```mermaid
flowchart LR
  A["APP_ENV"] -->|有| R(("実効環境"))
  A -->|無| NP["NEXT_PUBLIC_APP_ENV"]
  NP -->|有| R
  NP -->|無 & NODE_ENV=production 非VITEST| PRD["production（fail-safe）"]
  NP -->|無 & それ以外| LOC["local"]
  NODE["NODE_ENV / VERCEL_ENV / RAILWAY_ENVIRONMENT_NAME"] -. 参考のみ・分岐禁止 .-> R
```

- staging は **staging 専用 Vercel project の Production env scope に乗せたうえで `APP_ENV=staging`** を設定して区別する（`preview` scope は使わない）。
- backend の環境判定も `APP_ENV` のみを正本にする。`ENVIRONMENT` は新規設定しない。`RAILWAY_ENVIRONMENT_NAME=production` は staging/production どちらにもあり得る Railway CLI 同期メタキーで、アプリの環境分岐には使わない。
- `APP_ENV` 未設定の deploy は設定不備として扱う。`sync-career-compass-secrets.sh --check` で provider へ `APP_ENV` が反映されていることを確認する。

### 3-1 ブランチ / project / env scope 対応

| 対象 | Git branch | Vercel Project | Vercel env scope | Railway project | Railway environment | Supabase Project | アプリ論理環境 |
|---|---|---|---|---|---|---|---|
| staging | `develop` | `career-compass-staging` | `production` | staging 専用 project | `production` | `career-compass-staging` | `APP_ENV=staging` |
| production | `main` | `career-compass` | `production` | production 専用 project | `production` | `career-compass-db` | `APP_ENV=production` |

Vercel/Railway/Supabase は **staging / production は別 project** で分離する。Vercel/Railway の環境名はどちらも production 系を使い、アプリの分岐は `APP_ENV` だけで行う。`sync-career-compass-secrets.sh --check` は `APP_ENV`、Redis namespace、Stripe key prefix、provider project ID の重複を同期前に検査する。

---

## 4. リファレンス（保守者向け・必要時のみ）

ここから下は保守者向け。日常の設定は §1〜§3 で足ります。

### 4-1 設定場所と正本

| 設定場所 | 対象環境 | 正本か | 反映方法 |
|---|---|---|---|
| `.env.local`（個人ファイル、gitignored） | local | 個人の正本 | `cp .env.example .env.local` |
| `.secrets/{staging,production}/{shared,nextjs,fastapi,supabase}.env` | staging / production | **secret 実値の正本** | `secrets-examples/{env}/*.example` をコピー・編集 |
| `.secrets/ci/github-actions.env` | CI（実 staging E2E） | CI secret の正本 | `secrets-examples/ci/github-actions.env.example` から |
| Vercel Project env（**staging も Production scope**） | staging / production の Next.js | 反映先（正本は `.secrets/`） | `make ops-secrets-sync` |
| Railway Service env | staging / production の FastAPI | 反映先（正本は `.secrets/`） | `make ops-secrets-sync` |
| GitHub Secrets | CI | 反映先（正本は `.secrets/ci/`） | `make ops-secrets-sync` |
| Supabase（Dashboard / CLI） | staging / production（**別 project**） | bootstrap key の反映先 | `secrets-examples/{env}/supabase.env.example` ＋ Supabase CLI |

### 4-2 変数索引

**全量の正本はコード**。この索引は「どこを見るか」と運用上重要な変数のみ示す。

#### 4-2-1 正本ファイル

| 面 | 正本 | 必須性の見分け方 |
|---|---|---|
| Next.js server | `src/env/server.ts` | `server:` ブロックの各エントリ。`.optional()`/`.default()` 無し＝**required** |
| Next.js client | `src/env/client.ts` | `NEXT_PUBLIC_*`。ブラウザに inline。秘匿値は置かない |
| FastAPI | `backend/app/config.py` | `validation_alias=AliasChoices(...)` 明示＝**Tier 1**（旧名 fallback）。無し＝**Tier 2**（`field.upper()` が暗黙の env 名） |

#### 4-2-2 Next.js server / client（機能ブロック・運用要点のみ）

「環境差あり」の値は **§2-3** が唯一の正（ここでは再掲しない）。生成/取得は要点のみ。

- **Database**: `DATABASE_URL`(required), `DIRECT_URL`(optional, migration 5432), `DATABASE_POOL_SIZE`(optional)
- **Auth**: `BETTER_AUTH_SECRET`(required, `openssl rand -base64 32`), `BETTER_AUTH_URL`/`BETTER_AUTH_TRUSTED_ORIGINS`(optional, deployed で HTTPS 必須・production は 2 origin を `capabilities.ts` が検証), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`(required, OAuth redirect `<base>/api/auth/callback/google`)
- **Stripe**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`(required), `STRIPE_PRICE_{STANDARD,PRO}_{MONTHLY,ANNUAL}` / `STRIPE_PORTAL_CONFIGURATION_ID`(optional。**production profile では `capabilities.ts` が必須化**)
- **Security**: `ENCRYPTION_KEY`(required, 64桁hex `openssl rand -hex 32`), `CRON_SECRET`(required)
- **Internal API（BFF↔FastAPI）**: `INTERNAL_API_JWT_SECRET`/`CAREER_PRINCIPAL_HMAC_SECRET`(required, 32+, `shared.env`), `TENANT_KEY_SECRET`(deployed で必須・**環境別値**), `FASTAPI_URL`/`BACKEND_URL`(optional, deployed で必須化)
- **Redis（Upstash）**: `UPSTASH_REDIS_REST_URL`/`_TOKEN`(optional), `UPSTASH_REDIS_NAMESPACE`(`APP_ENV` と同値)。FastAPI 側 Redis は別正本 `REDIS_URL`（4-2-3）
- **Mail / Logo / Sentry（server）**: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` / `LOGO_DEV_TOKEN`, `LOGO_DEV_SECRET_KEY`, `BRANDFETCH_CLIENT_ID` / `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_NEXTJS_DSN`（全 optional）
- **Legal / Commerce disclosure**（全 optional・未設定ならコード default。本番は実値を設定）: `LEGAL_SALES_URL`, `LEGAL_SUPPORT_EMAIL`, `LEGAL_SUPPORT_URL`, `LEGAL_REFUND_POLICY_URL`, `LEGAL_DISCLOSURE_REQUEST_EMAIL`, `LEGAL_DISCLOSURE_REQUEST_NOTICE`, `LEGAL_HEAD_OF_OPERATIONS`, `LEGAL_BUSINESS_NAME`, `LEGAL_REPRESENTATIVE_NAME`, `LEGAL_BUSINESS_ADDRESS`, `LEGAL_PHONE_NUMBER`（`serverEnv` 経由・特商法表記）
- **CI/E2E**: `CI_E2E_AUTH_ENABLED`/`_SECRET`/`_ALLOWED_HOSTS`（optional, staging test auth 用。production は無効）
- **Feature**: `DISABLE_TOKEN_LIMIT`(optional)
- **環境判定**: `APP_ENV`（server）/ `NEXT_PUBLIC_APP_ENV`（client）。deployed では `validateAppEnvironmentConfiguration()` が必須化＋一致強制（§3 参照）
- **client その他**: `NEXT_PUBLIC_APP_URL`(required), `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_SENTRY_DSN`（optional）
- **退役（新規設定しない）**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_LOGO_DEV_TOKEN`, `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`（server-only 名に統一済み。互換 fallback も**コードから除去済み**）

#### 4-2-3 FastAPI（正本＝`backend/app/config.py`。運用で確認が要るもののみ）

- **環境判定**: `APP_ENV`（正）。`ENVIRONMENT` は退役済み。`RAILWAY_ENVIRONMENT_NAME` は Railway 同期メタキーであり、環境判定には使わない。
- **deployed 必須**（`validate_deployed_requirements` が fail-fast）: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`, `TENANT_KEY_SECRET`, `CORS_ORIGINS`（localhost/`*` 不可）, `BACKEND_TRUSTED_HOSTS`, `REDIS_URL`
- **主要 optional・別名あり**: `FRONTEND_URL`(alias `NEXT_PUBLIC_APP_URL`), `REDIS_NAMESPACE`(未設定時 `APP_ENV` から導出), `SENTRY_DSN`(alias `SENTRY_FASTAPI_DSN`/`BACKEND_SENTRY_DSN`), `SENTRY_ENVIRONMENT`(未設定→ `APP_ENV`), `SENTRY_RELEASE`(alias `RAILWAY_GIT_COMMIT_SHA`), モデル ID 群 `CLAUDE_*`/`GPT_*`/`GEMINI_*`/`MODEL_*`（一部 alias あり）, OCR/抽出 `GOOGLE_DOCUMENT_AI_*`/`MISTRAL_API_KEY`/`FIRECRAWL_*`
- **チューニング（全環境共通・default で動作）**: `RAG_*`, `PDF_OCR_*`, `MOTIVATION_*`, `USE_HYBRID_SEARCH`, `RERANKER_VARIANT`/`RERANKER_AB_TUNED_RATIO`/`RERANKER_BASE_MODEL`/`RERANKER_TUNED_MODEL_PATH`, `GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY`/`GAKUCHIKA_FORCE_DRAFT_READY_AFTER`/`GAKUCHIKA_LOOP_SIMILARITY_THRESHOLD`, `LLM_PRICE_OVERRIDES_JSON`/`LLM_CALL_BUDGET_OVERRIDES_JSON`, `LLM_USAGE_COST_LOG` 系, `LIVE_ES_REVIEW_CAPTURE_DEBUG`（deployed では使用不可＝fail-fast 対象）
- backend の後方互換 alias（`CLAUDE_MODEL`, `GPT_FAST_MODEL`, `OPENAI_MODEL`, `GOOGLE_MODEL` 等）は `BACKEND_ALIAS_ALLOWLIST`（`check-env-var-drift.mjs`）に登録され `.env.example` 未文書化でも C4 を出さない

#### 4-2-4 CI メタ / sync メタ（アプリは読まない・`server.ts`/`config.py` に追加しない）

- Vercel: `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
- Railway: `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_NAME`, `RAILWAY_ENVIRONMENT_NAME`（sync メタ。別 project 構成では staging/production とも `production`）
- Supabase: `SUPABASE_{STAGING,PRODUCTION}_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`
- CI 実行制御（`CI_META_PATTERNS` で drift 抽出除外）: `PLAYWRIGHT_*`, `SECURITY_SCAN_*`, `RUN_LIVE_ES_REVIEW`, `LIVE_AI_CONVERSATION_*`, `AI_LIVE_*`
- **T3 Env 統合済みの CI helper**（型安全のため `server.ts` 登録・`serverEnv` 経由）: `CI_E2E_TEST_EMAIL`/`_NAME`/`_PLAN`, `LOCAL_AI_LIVE_PREFLIGHT_ENABLED`, `ALLOW_COMPANY_SEARCH_MOCK_FALLBACK`, `CI_ALLOW_TEST_STRIPE_KEYS`

### 4-3 新規変数を追加するときの判断フロー

```mermaid
flowchart TD
  START([新規変数]) --> Q1{どの面で読むか}
  Q1 -->|Next.js server<br/>serverEnv 経由| Q2{deploy 環境で必須か}
  Q1 -->|Next.js client<br/>NEXT_PUBLIC_*| TD["終端 D"]
  Q1 -->|FastAPI<br/>settings 経由| Q2F{起動/機能に必須か}
  Q1 -->|CI / sync メタ<br/>アプリ非機能| TC["終端 C"]
  Q2 -->|必須| TAREQ["終端 A-req"]
  Q2 -->|任意/デフォルト有| TAOPT["終端 A-opt"]
  Q2F -->|必須| TBREQ["終端 B-req"]
  Q2F -->|任意/デフォルト有| TBOPT["終端 B-opt"]
```

| 終端 | 触るファイル | drift 影響 |
|---|---|---|
| **A-req**（Next server・必須） | `src/env/server.ts`（`.optional()` 無し ＋ `runtimeEnv`）／`.env.example`（**active** 行）／`secrets-examples/{env}/nextjs.env.example`／CI workflow（fixture か `secrets.X`、CI 不要なら `CI_ALLOWLIST_PATTERNS`） | C1=ERROR・C3=ERROR |
| **A-opt**（Next server・任意） | `src/env/server.ts`（`.optional()` ＋ `runtimeEnv`）／`.env.example`（**comment** 行可）／必要なら secrets-examples | C2=WARN・C5=WARN |
| **B-req**（FastAPI・必須） | `backend/app/config.py`（旧名あれば `AliasChoices`、deploy 必須なら `validate_deployed_requirements`）／`.env.example`／`secrets-examples/{env}/fastapi.env.example` | C4=WARN・C5=WARN |
| **B-opt**（FastAPI・任意） | `backend/app/config.py`（default 付きフィールド）／`.env.example`（comment 行可） | C4=WARN・C5=WARN |
| **C**（CI / sync メタ） | 対象 workflow / 同期スクリプト / `secrets-examples/{ci,infra}/*`。`server.ts`/`config.py` には**追加しない**。必要なら `CI_META_PATTERNS` | `.env.example` の active 行に書かない（C5 回避） |
| **D**（Next client） | `src/env/client.ts`（`client:` ＋ `experimental__runtimeEnv`）／`.env.example`／`secrets-examples/{env}/nextjs.env.example` | required は C1/C3=ERROR |

> **C1/C3 のみ ERROR**（pre-commit/CI を止める）。C2/C4/C5 は WARN。詳細は §4-4。
> 机上トレース例: 「ローカルで FastAPI のデバッグログ任意フラグ `MY_DEBUG_LOG` を追加」→ FastAPI 面・任意 → **B-opt** → `config.py` に default `False` フィールド ＋ `.env.example` に `# MY_DEBUG_LOG="false"` の comment 行のみ。`server.ts`/`client.ts`/CI には触らない。一意に解決。

### 4-4 drift 不変条件と検証

`scripts/git-hooks/check-env-var-drift.mjs`（`npm run check:env-drift`）がコード ↔ テンプレの key 整合を機械検査する。現状 "no drift detected"。

| ID | 不変条件 | 重大度 |
|---|---|---|
| **C1** | `server.ts`/`client.ts` の **required** は `.env.example` に **active** 行で存在 | **ERROR** |
| **C2** | **optional** は `.env.example` に文書化（comment 行可） | WARN |
| **C3** | required は CI workflow に存在（`CI_ALLOWLIST_PATTERNS` 該当は除外） | **ERROR** |
| **C4** | `config.py` の **Tier 1** は `.env.example` に文書化（`BACKEND_ALIAS_ALLOWLIST` 該当は除外） | WARN |
| **C5** | `.env.example` の **active** は `server.ts`/`client.ts`/`config.py` のいずれかに存在（orphan 検出） | WARN |

> CI メタ（`CI_META_PATTERNS`）は抽出除外。`NODE_ENV`/`VITEST`/`SKIP_ENV_VALIDATION`/`NEXT_RUNTIME` は直 `process.env` の許可例外。さらに `src/**` の `APP_ENV`/`NEXT_PUBLIC_APP_ENV` 直接参照は `findDirectProcessEnvUsage()` が **WARN** で検出（resolver=`src/env/deployment.ts` 経由を促す。`src/env/**`・`*.test.ts` は除外。リリースB で error 昇格）。

```mermaid
flowchart LR
  CODE["コード（server.ts/client.ts/deployment.ts/config.py）= 真実"] -->|C1/C3/C4| E[".env.example / CI"]
  E -->|C5 orphan| CODE
  E --> SE["secrets-examples/**"] --> PV["Vercel / Railway / GH Secrets"]
  CODE -.後追い解説.-> DOC["この文書"]
```

矢印はコード → テンプレ → provider の一方向。この文書はすべて後追いで、コードが正。doc 変更は drift に影響しない。

**CI fixture**: `develop-ci.yml` の `frontend` job `env:` ブロックの値は**ビルド/型/lint を通すための意図的ダミーで実 secret ではない**（実 staging E2E は別 job が `secrets.*` を使用）。例: `STRIPE_SECRET_KEY=sk_test_ci`, `OPENAI_API_KEY=sk-ci-openai`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`。実 staging URL（`NEXT_PUBLIC_APP_URL=https://stg.shupass.jp` 等）は公開情報。**全値の正本は workflow YAML**。ローテーション不要・漏洩対象外。

**検証コマンド**:

```bash
zsh scripts/release/sync-career-compass-secrets.sh --check --target all --skip-provider-drift
npm run check:env-drift
make ops-secrets-sync
make ops-release-check
make db-migrate-check
make stripe-preflight
```

### 4-5 保守運用

#### 更新トリガー（同一 PR でこの文書も更新する。コードが先・doc が後追い）

| 変更 | 更新する箇所 |
|---|---|
| `src/env/server.ts` / `client.ts`（追加・必須性・型） | §4-2-2 |
| `src/env/deployment.ts`（環境判定・`APP_ENVIRONMENTS`） | 冒頭トポロジ / §3 / §2-3 |
| `src/env/capabilities.ts`（deployed 必須・origin 要件） | §4-2-2 の必須化注記 / §1-2 |
| `backend/app/config.py`（追加・alias 変更） | §4-2-3 |
| `scripts/release/secrets-examples/**`（key 増減） | §1-2 / §4-1 |
| 環境構成（URL・branch→deploy・provider scope） | 冒頭トポロジ / §2-3 / §3-1 / §4-1 |
| `.github/workflows/*.yml` の CI fixture | §4-4 の CI fixture |

#### drift checker との分担

- **`check-env-var-drift.mjs`（機械）**: コード ↔ `.env.example`/CI の key 整合（C1-C5）を pre-commit/CI で自動検出。
- **この文書（人間）**: 環境差・設定場所・生成/取得・必須性の意味・既知課題など機械で表せない運用知識。
- コード変更時は `npm run check:env-drift` が green であることを確認してから本文書を更新する。

#### 既知の課題（事実のみ）

- **[Medium] backend `config.py` の責務肥大**: 多数の関心（CORS/Sentry/LLM/RAG/OCR/フロント URL/チューニング）が同居。behavior-preserving な分割設計は RFC `docs/plan/backend-config-env-consolidation-improvement-plan.md` に集約予定。
- **[Resolved] ENVIRONMENT/RAILWAY_ENVIRONMENT_NAME の環境判定 alias**: `APP_ENV` 正本化は完了。`RAILWAY_ENVIRONMENT_NAME` は Railway 同期メタキーとしてのみ残す。
- **[Resolved] billing/security の production 判定は APP_ENV SSOT**: Stripe config / portal API は `resolveAppEnvironment()` に統一。staging は Vercel Production scope でも `APP_ENV=staging` で production hard gate に入らない。`VERCEL_ENV` は provider metadata 用途のみに限定。

#### 関連 doc（環境変数の記述は本 SSOT に集約）

- `docs/setup/DEVELOPMENT_AND_ENV.md`: ローカル開発の Quick Start と外部サービス取得手順（Supabase / OAuth / Stripe）。変数一覧は持たず本文書（§1 / §2 / §4-2）へ誘導。
- `scripts/release/secrets-examples/README.md`: provider 同期テンプレの操作 how-to の正本（本文書は変数の意味の正本）。
- `docs/release/setup/ENV_REFERENCE.md`: 純 redirect（本文書へ）。
- `docs/INDEX.md`: 「環境変数 SSOT」として本文書へ。
- 参照のみ（変更しない）: `docs/operations/production/RUNBOOK.md`, `docs/operations/production/SECRETS_MANAGEMENT.md`, `docs/setup/DB_SUPABASE.md`

> 冒頭の「役割／真実の源泉はコード／secret 実値非転記」ブロックと §0 ナビは常に先頭に維持すること。これがこの文書を SSOT として機能させる前提です。
