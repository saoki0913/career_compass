# 環境変数 SSOT（唯一の正本）

**この文書の役割**: 就活Pass の環境変数を「環境ごとに変えるか / 全環境共通か」「どこに設定するか」「どう環境判定するか」「必須か任意か」の順に、迷わず引けるようにした唯一の正本（SSOT）です。まず冒頭の **A 早見表** を見れば設定の大半は解決します。

**真実の源泉はコード**: 変数の実在・必須性・型・別名（alias）の正本は常にコード（下表）。この文書はコードを後追いで解説するもので、食い違う場合は**コードが正**（更新トリガーは F）。整合は `npm run check:env-drift` が機械検査し、現状 "no drift detected"（56 server + 5 client = 61 T3 / 137 backend）。

| 層 | 正本ファイル | 役割 |
|---|---|---|
| コード | `src/env/server.ts` / `src/env/client.ts` | Next.js server / client（`NEXT_PUBLIC_*`）変数の型・必須性（T3 Env / Zod） |
| コード | `src/env/deployment.ts` | **環境判定 SSOT**。`resolveAppEnvironment()` が `APP_ENV` を解釈（local/staging/production） |
| コード | `src/env/capabilities.ts` | 起動時 capability 検証（deployed 必須セット・trusted origins） |
| コード | `backend/app/config.py` | FastAPI 設定の型・別名（Pydantic v2 `AliasChoices`） |
| テンプレ | `scripts/release/secrets-examples/**` | provider 同期テンプレ（key・形式のみ。実値なし） |
| テンプレ | `.env.example` | ローカル開発テンプレ（`cp .env.example .env.local`） |

**secret 実値はこの文書に書きません**: 実値の正本は `.secrets/`（gitignored）、fallback `codex-company/.secrets/career_compass/`。実 `*.env` は読まない・転記しない。key set 確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみ。

> **外部参照は §番号ではなく見出しキーワード（A/B/C/D/E/F）で行います**（旧 §1〜§10 の番号は廃止）。迷ったら **C 判断フロー** の決定木で「どのファイルに何を書くか」が一意に辿れます。

---

## A 早見表（最初にここを見る）

### A-1 環境ごとに値が変わる変数（これだけが環境差。他は全環境共通）

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

> `BETTER_AUTH_SECRET` 等の鍵は「名前は共通・実値は環境ごとに別」。上表は**設定する値が環境で意味的に変わる**ものに限定。CI 列「fixture」は `develop-ci.yml` frontend job の意図的ダミー（**実 secret ではない**。E の CI fixture 参照）。

### A-2 全環境で共通の変数（値の意味を変えない）

- 内部署名鍵: `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`（環境内で BFF/FastAPI 同値。`shared.env`。実値は環境別）
- 認証/暗号: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`
- LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, モデル設定 `MODEL_*` / `CLAUDE_*` / `GPT_*` / `GEMINI_*`
- チューニング（デフォルトで動作）: `RAG_*`, `PDF_OCR_*`, `MOTIVATION_*`, `RERANKER_*`, `GAKUCHIKA_*`, `LLM_PRICE_OVERRIDES_JSON`, `LLM_CALL_BUDGET_OVERRIDES_JSON`
- 法令表記（未設定ならコード default。本番は実値を設定）: `LEGAL_*`（D 参照）

### A-3 どこに設定するか（場所と正本）

| 設定場所 | 対象環境 | 正本か | 反映方法 |
|---|---|---|---|
| `.env.local`（個人ファイル、gitignored） | local | 個人の正本 | `cp .env.example .env.local` |
| `.secrets/{staging,production}/{shared,nextjs,fastapi,supabase}.env` | staging / production | **secret 実値の正本** | `secrets-examples/{env}/*.example` をコピー・編集 |
| `.secrets/ci/github-actions.env` | CI（実 staging E2E） | CI secret の正本 | `secrets-examples/ci/github-actions.env.example` から |
| Vercel Project env（**staging も Production scope**） | staging / production の Next.js | 反映先（正本は `.secrets/`） | `make ops-secrets-sync` |
| Railway Service env | staging / production の FastAPI | 反映先（正本は `.secrets/`） | `make ops-secrets-sync` |
| GitHub Secrets | CI | 反映先（正本は `.secrets/ci/`） | `make ops-secrets-sync` |
| Supabase（Dashboard / CLI） | staging / production（**別 project**） | bootstrap key の反映先 | `secrets-examples/{env}/supabase.env.example` ＋ Supabase CLI |

**運用注記（loss-less）**:
- `shared.env` の変数を `nextjs.env`/`fastapi.env` に**重複定義しない**（sync が shared→service の順でマージ。両方にあり値不一致だと sync がエラー中断）。
- `BACKEND_TRUSTED_HOSTS` は本番 host を含める。未設定だと `/health` は通っても通常 API が host check で落ちる。
- DB migration は Transaction Pooler `6543` 不可。Direct/Session `5432`（`DIRECT_URL`）を使う。production migration は raw `db:push` ではなく `make deploy-migrate` / `make db-migrate-check`。
- Supabase は staging=`career-compass-staging`（ref `vbjykhkyhmxickxcgvdh`）/ production=`career-compass-db` の**別 project**。app table は各 project の `public` schema。

```bash
zsh scripts/release/sync-career-compass-secrets.sh --check --target all --skip-provider-drift  # key set 整合のみ
zsh scripts/release/sync-career-compass-secrets.sh --check --target all                        # provider key drift（CLI 認証要）
SYNC_MODE=--apply TARGET=all make ops-secrets-sync                                             # provider へ実反映
```
`--check` は key の追加/削除のみ判定（secret 値は比較しない）。

---

## B 環境判定モデル（3 層・APP_ENV が唯一の正）

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

- staging は **Vercel の Production env scope に乗せたうえで `APP_ENV=staging`** を設定して区別する（`preview` scope は使わない）。
- **backend の `ENVIRONMENT` / `RAILWAY_ENVIRONMENT_NAME` は deprecated な後方互換 fallback**。`config.py` は `AliasChoices("APP_ENV","ENVIRONMENT","RAILWAY_ENVIRONMENT_NAME")` で当面受理するが、`APP_ENV` 未設定で旧名から解決した場合は `DeprecationWarning` を出す。正本は `APP_ENV`。`RAILWAY_ENVIRONMENT_NAME` は Railway CLI の sync メタキーとしては引き続き必要。
- **リリースB（ENVIRONMENT 完全撤去）runbook**: ① 運用者が Railway/Vercel 実環境に `APP_ENV` を設定 → ② `sync-career-compass-secrets.sh --check` で provider へ APP_ENV 反映を確認 → ③ `fastapi.env.example` から `ENVIRONMENT=` 削除 ＋ `config.py` の `ENVIRONMENT`/`RAILWAY_ENVIRONMENT_NAME` alias 撤去 ＋ drift checker の APP_ENV 直接参照検出を error 昇格。ロールバックは全て git revert で完結（実 secret は触らない）。

---

## C 判断フロー（新規変数を追加するとき）

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

> **C1/C3 のみ ERROR**（pre-commit/CI を止める）。C2/C4/C5 は WARN。詳細は E。
> 机上トレース例: 「ローカルで FastAPI のデバッグログ任意フラグ `MY_DEBUG_LOG` を追加」→ FastAPI 面・任意 → **B-opt** → `config.py` に default `False` フィールド ＋ `.env.example` に `# MY_DEBUG_LOG="false"` の comment 行のみ。`server.ts`/`client.ts`/CI には触らない。一意に解決。

---

## D 変数リファレンス（索引）

**全量の正本はコード**。この索引は「どこを見るか」と運用上重要な変数のみ示す。

### D-1 正本ファイル

| 面 | 正本 | 必須性の見分け方 |
|---|---|---|
| Next.js server | `src/env/server.ts` | `server:` ブロックの各エントリ。`.optional()`/`.default()` 無し＝**required** |
| Next.js client | `src/env/client.ts` | `NEXT_PUBLIC_*`。ブラウザに inline。秘匿値は置かない |
| FastAPI | `backend/app/config.py` | `validation_alias=AliasChoices(...)` 明示＝**Tier 1**（旧名 fallback）。無し＝**Tier 2**（`field.upper()` が暗黙の env 名） |

### D-2 Next.js server / client（機能ブロック・運用要点のみ）

「環境差あり」の値は **A-1** が唯一の正（ここでは再掲しない）。生成/取得は要点のみ。

- **Database**: `DATABASE_URL`(required), `DIRECT_URL`(optional, migration 5432), `DATABASE_POOL_SIZE`(optional)
- **Auth**: `BETTER_AUTH_SECRET`(required, `openssl rand -base64 32`), `BETTER_AUTH_URL`/`BETTER_AUTH_TRUSTED_ORIGINS`(optional, deployed で HTTPS 必須・production は 2 origin を `capabilities.ts` が検証), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`(required, OAuth redirect `<base>/api/auth/callback/google`)
- **Stripe**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`(required), `STRIPE_PRICE_{STANDARD,PRO}_{MONTHLY,ANNUAL}` / `STRIPE_PORTAL_CONFIGURATION_ID`(optional。**production profile では `capabilities.ts` が必須化**)
- **Security**: `ENCRYPTION_KEY`(required, 64桁hex `openssl rand -hex 32`), `CRON_SECRET`(required)
- **Internal API（BFF↔FastAPI）**: `INTERNAL_API_JWT_SECRET`/`CAREER_PRINCIPAL_HMAC_SECRET`(required, 32+, `shared.env`), `TENANT_KEY_SECRET`(deployed で必須・**環境別値**), `FASTAPI_URL`/`BACKEND_URL`(optional, deployed で必須化)
- **Redis（Upstash）**: `UPSTASH_REDIS_REST_URL`/`_TOKEN`(optional), `UPSTASH_REDIS_NAMESPACE`(`APP_ENV` と同値)。FastAPI 側 Redis は別正本 `REDIS_URL`（D-3）
- **Mail / Logo / Sentry（server）**: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` / `LOGO_DEV_TOKEN`, `LOGO_DEV_SECRET_KEY`, `BRANDFETCH_CLIENT_ID` / `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_NEXTJS_DSN`（全 optional）
- **Legal / Commerce disclosure**（全 optional・未設定ならコード default。本番は実値を設定）: `LEGAL_SALES_URL`, `LEGAL_SUPPORT_EMAIL`, `LEGAL_SUPPORT_URL`, `LEGAL_REFUND_POLICY_URL`, `LEGAL_DISCLOSURE_REQUEST_EMAIL`, `LEGAL_DISCLOSURE_REQUEST_NOTICE`, `LEGAL_HEAD_OF_OPERATIONS`, `LEGAL_BUSINESS_NAME`, `LEGAL_REPRESENTATIVE_NAME`, `LEGAL_BUSINESS_ADDRESS`, `LEGAL_PHONE_NUMBER`（`serverEnv` 経由・特商法表記）
- **CI/E2E**: `CI_E2E_AUTH_ENABLED`/`_SECRET`/`_ALLOWED_HOSTS`（optional, staging test auth 用。production は無効）
- **Feature**: `DISABLE_TOKEN_LIMIT`(optional)
- **環境判定**: `APP_ENV`（server）/ `NEXT_PUBLIC_APP_ENV`（client）。deployed では `validateAppEnvironmentConfiguration()` が必須化＋一致強制（B 参照）
- **client その他**: `NEXT_PUBLIC_APP_URL`(required), `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_SENTRY_DSN`（optional）
- **退役（新規設定しない）**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_LOGO_DEV_TOKEN`, `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID`（server-only 名に統一済み。互換 fallback も**コードから除去済み**）

### D-3 FastAPI（正本＝`backend/app/config.py`。運用で確認が要るもののみ）

- **環境判定**: `APP_ENV`（正）。`ENVIRONMENT` / `RAILWAY_ENVIRONMENT_NAME` は deprecated 後方互換 alias（B 参照）
- **deployed 必須**（`validate_deployed_requirements` が fail-fast）: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_JWT_SECRET`, `CAREER_PRINCIPAL_HMAC_SECRET`, `TENANT_KEY_SECRET`, `CORS_ORIGINS`（localhost/`*` 不可）, `BACKEND_TRUSTED_HOSTS`, `REDIS_URL`
- **主要 optional・別名あり**: `FRONTEND_URL`(alias `NEXT_PUBLIC_APP_URL`), `REDIS_NAMESPACE`(未設定時 `APP_ENV` から導出), `SENTRY_DSN`(alias `SENTRY_FASTAPI_DSN`/`BACKEND_SENTRY_DSN`), `SENTRY_ENVIRONMENT`(未設定→ environment), `SENTRY_RELEASE`(alias `RAILWAY_GIT_COMMIT_SHA`), モデル ID 群 `CLAUDE_*`/`GPT_*`/`GEMINI_*`/`MODEL_*`（一部 alias あり）, OCR/抽出 `GOOGLE_DOCUMENT_AI_*`/`MISTRAL_API_KEY`/`FIRECRAWL_*`
- **チューニング（全環境共通・default で動作）**: `RAG_*`, `PDF_OCR_*`, `MOTIVATION_*`, `USE_HYBRID_SEARCH`, `RERANKER_VARIANT`/`RERANKER_AB_TUNED_RATIO`/`RERANKER_BASE_MODEL`/`RERANKER_TUNED_MODEL_PATH`, `GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY`/`GAKUCHIKA_FORCE_DRAFT_READY_AFTER`/`GAKUCHIKA_LOOP_SIMILARITY_THRESHOLD`, `LLM_PRICE_OVERRIDES_JSON`/`LLM_CALL_BUDGET_OVERRIDES_JSON`, `LLM_USAGE_COST_LOG` 系, `LIVE_ES_REVIEW_CAPTURE_DEBUG`（deployed では使用不可＝fail-fast 対象）
- backend の後方互換 alias（`ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`, `CLAUDE_MODEL`, `GPT_FAST_MODEL`, `OPENAI_MODEL`, `GOOGLE_MODEL` 等）は `BACKEND_ALIAS_ALLOWLIST`（`check-env-var-drift.mjs`）に登録され `.env.example` 未文書化でも C4 を出さない

### D-4 CI メタ / sync メタ（アプリは読まない・`server.ts`/`config.py` に追加しない）

- Vercel: `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`
- Railway: `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_NAME`, `RAILWAY_ENVIRONMENT_NAME`（sync メタ。config.py の deprecated alias でもある）
- Supabase: `SUPABASE_{STAGING,PRODUCTION}_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID`
- CI 実行制御（`CI_META_PATTERNS` で drift 抽出除外）: `PLAYWRIGHT_*`, `SECURITY_SCAN_*`, `RUN_LIVE_ES_REVIEW`, `LIVE_AI_CONVERSATION_*`, `AI_LIVE_*`
- **T3 Env 統合済みの CI helper**（型安全のため `server.ts` 登録・`serverEnv` 経由）: `CI_E2E_TEST_EMAIL`/`_NAME`/`_PLAN`, `LOCAL_AI_LIVE_PREFLIGHT_ENABLED`, `ALLOW_COMPANY_SEARCH_MOCK_FALLBACK`, `CI_ALLOW_TEST_STRIPE_KEYS`

---

## E drift 不変条件 ＋ 検証

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

---

## F 保守運用

### 更新トリガー（同一 PR でこの文書も更新する。コードが先・doc が後追い）

| 変更 | 更新する箇所 |
|---|---|
| `src/env/server.ts` / `client.ts`（追加・必須性・型） | D-2 |
| `src/env/deployment.ts`（環境判定・`APP_ENVIRONMENTS`） | 冒頭トポロジ / B / A-1 |
| `src/env/capabilities.ts`（deployed 必須・origin 要件） | D-2 の必須化注記 |
| `backend/app/config.py`（追加・alias 変更） | D-3 |
| `scripts/release/secrets-examples/**`（key 増減） | A-3 |
| 環境構成（URL・branch→deploy・provider scope） | 冒頭トポロジ / A-1 / A-3 |
| `.github/workflows/*.yml` の CI fixture | E の CI fixture |

### drift checker との分担

- **`check-env-var-drift.mjs`（機械）**: コード ↔ `.env.example`/CI の key 整合（C1-C5）を pre-commit/CI で自動検出。
- **この文書（人間）**: 環境差・設定場所・生成/取得・必須性の意味・既知課題など機械で表せない運用知識。
- コード変更時は `npm run check:env-drift` が green であることを確認してから本文書を更新する。

### 既知の課題（事実のみ）

- **[Medium] backend `config.py` の責務肥大**: 多数の関心（CORS/Sentry/LLM/RAG/OCR/フロント URL/チューニング）が同居。behavior-preserving な分割設計は RFC `docs/plan/backend-config-env-consolidation-improvement-plan.md` に集約予定。
- **[運用] ENVIRONMENT/RAILWAY_ENVIRONMENT_NAME の deprecated alias**: `APP_ENV` 正本化は完了。完全撤去（リリースB）は B の runbook 参照。
- **[Resolved] billing/security の production 判定は APP_ENV SSOT**: Stripe config / portal API は `resolveAppEnvironment()` に統一。staging は Vercel Production scope でも `APP_ENV=staging` で production hard gate に入らない。`VERCEL_ENV` は provider metadata 用途のみに限定。

### 関連 doc（環境変数の記述は本 SSOT に集約）

- `docs/release/setup/ENV_REFERENCE.md`: 純 redirect（本文書 E の Verification へ）
- `docs/setup/DEVELOPMENT_AND_ENV.md`: 重複表は削除し本文書（A 早見表 / D 変数リファレンス / C 判断フロー）へ誘導
- `docs/INDEX.md`: 「環境変数 SSOT」として本文書へ
- `scripts/release/secrets-examples/README.md`: provider 同期テンプレの操作 how-to の正本（本文書は変数の意味の正本）
- 参照のみ（変更しない）: `docs/release/ops/RUNBOOK.md`, `docs/release/ops/SECRETS_MANAGEMENT.md`, `docs/setup/DB_SUPABASE.md`

> 冒頭の「役割／真実の源泉はコード／secret 実値非転記／確定トポロジ」ブロックは常に先頭に維持すること。これがこの文書を SSOT として機能させる前提です。
