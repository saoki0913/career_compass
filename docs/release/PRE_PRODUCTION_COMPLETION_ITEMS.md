# 本番リリース前に完成させるべき項目

最終更新: 2026-05-04 JST

この文書は、`docs/SPEC.md` の要求一覧ではなく、現在の実装・テスト成果物・release gate・運用ドキュメントを見て、本番公開前に完成または明確化しておくべき項目を整理するためのものです。

## 判断基準

- 本番公開時にユーザーのデータ、課金、選考機会、信頼、運用復旧に影響する項目を優先する。
- 仕様書上の未実装を機械的に拾うのではなく、現状のコードと gate から事故につながる可能性があるものを採用する。
- 各項目は実装タスクの細分化ではなく、リリース前に完了状態を判断すべき領域として記録する。
- secrets の実値確認は行わず、key inventory と実動作 smoke で確認する。

現時点の機械判定では、`node tools/check-plan-release-readiness.mjs --json` が `ready=false` を返し、`ops-release-check` の passed evidence 不足を blocker としている。これは本番前の最優先確認項目として扱う。

## 現状根拠

主に次の現実装・成果物を根拠にする。

- `docs/release/PRODUCTION.md`: 標準 release、post deploy、rollback、DB drift 確認。
- `scripts/release/release-career-compass.sh`: staging、production、promotion の実行順。
- `Makefile`: `ops-release-check`、`deploy`、AI Live、release smoke、security scan。
- `docs/ops/SECURITY.md`: CSRF、CSP、principal、rate limit、payload size、LLM token limit。
- `docs/ops/OBSERVABILITY.md`: 現状は RAG metrics 中心で、全体監視は薄い。
- `docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md`: 特商法、Stripe、個人事業主運用。
- `docs/review/TRACKER.md`: セキュリティ、AI品質、RAG、保守性、pre-release foundation の状態。
- `backend/tests/output/local_ai_live/status/*.json`: 現在の AI Live / functional status。

AI Live status の現状では、`calendar` と `rag-ingest` が `failed`、AI系の `judgeStatus` は多くが `not_run` である。Playwright smoke が通っていても、品質判定まで完了しているとは見なさない。

## Release / Ops

### Release gate の整合

本番前に `ops-release-check`、plan readiness、release blocker evidence、dirty worktree の扱いを揃える。

必要な理由:

- release gate が `ready=false` のままでは、本番公開可否の説明責任を果たせない。
- 現状は `PLAN_EXECUTION_TASKS.json` 上の track が完了でも、global gate の evidence 不足が残っている。

確認方法:

- `node tools/check-plan-release-readiness.mjs --json`
- `make ops-release-check`
- `git status --short`

### デプロイ手順

`make deploy` の標準フローで、local gate、develop push、Develop CI、staging check、main promotion、production readonly smoke まで通せる状態にする。

必要な理由:

- 本番公開は手作業の成功体験ではなく、再現可能な release script に乗せる必要がある。
- `E2E_PRODUCTION_COMPANY_ID`、Google auth state、provider auth が不足すると、昇格直前で止まる。

確認方法:

- `make ops-release-check`
- `zsh scripts/release/post-deploy-playwright.sh staging`
- `E2E_PRODUCTION_COMPANY_ID=<uuid> zsh scripts/release/post-deploy-playwright.sh production`

### Rollback

Vercel / Railway / Supabase の rollback target、承認者、復旧後確認を事前に決める。

必要な理由:

- 現状の rollback entrypoint は dry-run と計画確認が中心で、実行は明示承認前提。
- 障害時に provider ごとの target を探しながら判断すると復旧が遅れる。

確認方法:

- `make rollback-prod TARGET=<deployment-id-or-commit-sha>`
- `vercel ls --prod`
- `railway logs --tail 200`

### DB migration / drift

本番 DB が schema と migration journal より遅れていないこと、drift 検出と migrate 手順を確認する。

必要な理由:

- JSONB migration、interview v2、deadline/task loader など、DB状態が古いと実装済み機能が壊れる。
- secrets 実ファイルを読まない運用と、`DIRECT_URL` を使う drift check の運用を矛盾なく整理する必要がある。

確認方法:

- `npm run check:prod-db-drift`
- `make deploy-migrate`
- release PR の GitHub checks

### 環境変数・外部サービス

Vercel、Railway、Supabase、Stripe、Google OAuth、AI provider、Upstash の key inventory と実動作を確認する。

必要な理由:

- inventory check は key set の存在確認であり、実値の妥当性までは保証しない。
- OAuth callback、Stripe webhook、AI provider、Redis/Upstash は実 smoke でしか検出しづらい誤設定がある。

確認方法:

- `make ops-secrets-sync`
- `TARGET=vercel-production make ops-secrets-sync`
- `TARGET=railway-production make ops-secrets-sync`
- staging functional smoke

## Security / Privacy

### CSRF / Origin / state-changing API

`POST`、`PUT`、`PATCH`、`DELETE` の全 API で Origin と CSRF の例外範囲を確認する。

必要な理由:

- Webhook や Better Auth catch-all のような正当な例外があるため、例外範囲が広がると攻撃面になる。
- guest migration や課金関連 API は CSRF 成功時の影響が大きい。

確認方法:

- `node scripts/security/check-api-route-csrf.mjs`
- `npm run test:release-critical`
- `bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical`

### guest / user owner 境界

`userId` と `guestId` の排他性、`guest_device_token` cookie 正本、browser-visible `x-device-token` 非信頼を確認する。

必要な理由:

- guest データ移行、企業、ES、締切、RAG source は所有権境界をまたぐと重大な情報漏洩になる。
- browser-visible header を正本に戻す変更は guest なりすましにつながる。

確認方法:

- `src/bff/identity/request-identity.ts`
- `src/bff/identity/owner-access.ts`
- `src/app/api/guest/migrate/route.ts`
- auth boundary E2E

### BFF to FastAPI principal

RAG / company-info / AI stream proxy で、owner 検証済み companyId と actor を `X-Career-Principal` に署名し、FastAPI 側で scope / company 不一致を拒否する。

必要な理由:

- Postgres の owner 制約は Chroma / BM25 には効かない。
- service JWT だけでは「どのユーザーがどの company を扱えるか」を表現できない。

確認方法:

- `docs/security/principal_spec.md`
- `backend/app/security/career_principal.py`
- principal 関連 pytest
- RAG tenant isolation tests

### Rate limit / token limit / fail-open 運用

AI、guest migration、Stripe操作、company-info、RAG ingest の rate limit と日次 token limit を確認する。

必要な理由:

- Upstash / Redis 障害時に fail-open する設計は、可用性を優先する一方で cost spike を招く。
- 429 と `Retry-After` が UX と監視に出ないと、過負荷時に原因を切り分けにくい。

確認方法:

- `src/lib/rate-limit.ts`
- `src/lib/llm-cost-limit.ts`
- FastAPI limiter
- 429 response contract tests

### ログ秘匿と公開素材

PII、API key、Bearer token、Stripe signature、guest token、ES本文がレスポンスやログに露出しないことを確認する。

必要な理由:

- ES、志望動機、ガクチカは学生本人の選考情報そのもの。
- 公開LPやモックに実名・顔写真・個人連絡先が混入すると信用と法務面のリスクになる。

確認方法:

- `src/lib/logger.ts`
- `docs/ops/SECURITY.md`
- `public/marketing/**`
- production / staging logs の spot check

## Billing / Legal

### Stripe webhook と entitlement

Stripe webhook の署名検証、冪等性、unknown price rejection、duplicate / delayed event、subscription status 反映を確認する。

必要な理由:

- plan / credits は Stripe 署名済み webhook からのみ更新されるべき。
- 未課金 entitlement 拡大は本番公開前に再発防止として残すべきリスク。

確認方法:

- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/webhooks/stripe/route.test.ts`
- `npm run stripe:check-live-readiness`

### 成功時のみクレジット消費

ES添削、志望動機、ガクチカ、面接、企業情報取得、RAG ingest で、成功時のみ消費されることを確認する。

必要な理由:

- 課金不信に直結する。
- SSE / cancel / timeout / partial success は通常の成功/失敗より漏れやすい。

確認方法:

- `src/lib/credits/reservations.ts`
- `src/lib/credits/*.test.ts`
- AI stream route tests
- billing AI Live

### 料金・クレジット表示整合

LP、pricing、Stripe Checkout、Customer Portal、アプリ内 credits 表示、legal 表記の価格・付与量・上限をコード正本に合わせる。

必要な理由:

- 料金や付与 credit の表示差異は返金、問い合わせ、特商法上の誤認リスクに直結する。
- ドキュメントが古くても、公開画面と決済画面は一致している必要がある。

確認方法:

- `src/lib/stripe/config.ts`
- `src/lib/marketing/pricing-plans.ts`
- `src/app/(marketing)/pricing/page.tsx`
- Stripe Dashboard 商品・Price

### 特商法 / Terms / Privacy / Commerce Disclosure

`/legal`、`/terms`、`/privacy`、Stripe Commerce Disclosure、Checkout legal settings、Customer Portal の表示を完成させる。

必要な理由:

- 有料サブスクリプションでは最終確認画面、解約条件、問い合わせ先、返金方針の明確化が必要。
- Stripe 審査やユーザー問い合わせで差し戻し・停止になり得る。

確認方法:

- `docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md`
- `src/app/(marketing)/legal/page.tsx`
- Stripe Dashboard legal settings

## AI Quality / RAG

### AI品質 evidence

ES添削、志望動機、ガクチカ、面接対策の deterministic checks と LLM judge evidence を current snapshot で揃える。

必要な理由:

- `judgeStatus: not_run` は品質合格ではなく、未判定を意味する。
- AI機能は本プロダクトの価値の中心で、公開後に品質崩れが起きると継続率と返金リスクに直結する。

確認方法:

- `backend/tests/conversation/llm_judge.py`
- `backend/tests/output/local_ai_live/status/*.json`
- `make test-quality-all`

### AI Live failed status の解消

`calendar` と `rag-ingest` の failed status を本番前に再実行または原因を記録して解消する。

必要な理由:

- `calendar` は締切管理の信頼に関わる。
- `rag-ingest` は企業情報・ES企業接続評価の根拠に関わる。

確認方法:

- `make test-e2e-functional-local-calendar`
- `make test-e2e-functional-local-rag-ingest`
- `backend/tests/output/local_ai_live/status/calendar.json`
- `backend/tests/output/local_ai_live/status/rag-ingest.json`

### RAG tenant isolation / metadata

Chroma、BM25、metadata、tenant key、Reference ES consent、source URL を確認する。

必要な理由:

- RAG は Postgres 外の永続化領域を持つため、DB owner 制約だけでは漏洩を防げない。
- 企業別情報や参考ESが別ユーザーに混ざると重大事故になる。

確認方法:

- RAG eval tests
- tenant isolation tests
- `docs/ops/OBSERVABILITY.md`
- `docs/review/TRACKER.md`

### Contextual Retrieval default-off 判断

Contextual Retrieval は ctx collection が未充足の間 default-on にしない判断を release note に残す。

必要な理由:

- metrics が良く見えても、ctx collection 0 件では実質的に base collection 評価になり得る。
- 本番で default-on すると品質劣化時の切り戻しが難しくなる。

確認方法:

- `backend/evals/rag/compare_contextual_retrieval.py`
- `docs/plan/RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md`

## Core Product UX

### 初回 Activation

初回導線を「企業1社登録 -> AI体験 -> プロフィール補完」へ自然に接続し、guest / login / paid の分岐で文言と制限が破綻しないようにする。

必要な理由:

- ターゲットユーザーは迷わず進める管理体験を求めている。
- 初回で何をすべきかわからない状態は離脱につながる。

確認方法:

- guest major E2E
- user major E2E
- onboarding / dashboard / companies new の Playwright確認

### 企業情報取得・締切承認 UX

公式URL、根拠URL、信頼度、締切候補、低信頼度初期OFF、部分成功表示を公開前に確認する。

必要な理由:

- 締切誤登録はユーザーの選考機会損失に直結する。
- 自動抽出を勝手に確定しないことは信頼訴求そのもの。

確認方法:

- company-info-search AI Live
- selection-schedule AI Live
- `DeadlineApprovalModal`

### 非同期 UX と通知履歴

AI実行、企業情報取得、カレンダー書き込みで、開始、成功、失敗、消費0、再実行導線を確認する。

必要な理由:

- 成功時のみ消費のルールは、UI上で履歴として見えなければユーザーに伝わらない。
- 外部I/O失敗時に何をすればよいかが不明だと問い合わせが増える。

確認方法:

- notifications AI Live
- tasks-deadlines AI Live
- API error response contract tests

### ESエディタ安全UX

添削中ロック、反映確認、Undo、版復元、ゴミ箱復元、モバイル縦積みを確認する。

必要な理由:

- AI添削中に本文や対象 section がずれると、誤反映やデータ損失につながる。
- ES本文はユーザーが長時間編集する重要データ。

確認方法:

- ES review Playwright
- ES editor unit tests
- mobile viewport UI review

## Integrations

### Google Calendar

OAuth、追加先カレンダー、freebusy、作業ブロック、外部削除同期、リトライ、同意説明を完成させる。

必要な理由:

- カレンダー権限は心理的ハードルが高く、説明不足は連携率を下げる。
- 同期失敗や外部削除の扱いが曖昧だと、締切管理の信頼が落ちる。

確認方法:

- calendar AI Live
- Google OAuth state capture
- calendar sync cron logs

### Stripe Checkout / Portal

Checkout、Portal、subscription cancel、payment failure、plan update の一連の動作を確認する。

必要な理由:

- 本番 production gate では原則 write request を避けるため、staging / test mode / Stripe live readiness で補完する必要がある。

確認方法:

- `npm run stripe:check-live-readiness`
- billing AI Live
- webhook tests

### SEO / Domain

Search Console、verification token、sitemap、robots、canonical、OGP、Cloudflare DNS、apex redirect、SSL を確認する。

必要な理由:

- SEO は公開直後に取り返しにくい。
- canonical や domain 設定の誤りはクロール・共有・ログイン callback に影響する。

確認方法:

- `curl -I https://www.shupass.jp`
- `curl -I https://shupass.jp`
- `dig www.shupass.jp cname +short`
- Search Console sitemap submission

### Cron / background jobs

Vercel daily notifications、GitHub Actions calendar sync、notification cleanup の実行履歴を確認する。

必要な理由:

- ユーザーが直接操作しない機能は失敗に気づきにくい。
- `CRON_SECRET` や provider plan 要件の不備で本番だけ動かないことがある。

確認方法:

- Vercel Cron logs
- `gh run list --workflow "Calendar Sync Cron" --limit 10`

## Observability / Support

### 監視とアラート

health、5xx、Stripe webhook失敗、Cron失敗、Railway volume、AI provider error、LLM fallback、SSE cancel、RAG tenant mismatch を追える状態にする。

必要な理由:

- 現状の観測性ドキュメントは RAG metrics 中心で、プロダクト全体の alert runbook は薄い。
- AI / SSE / provider連携の失敗はユーザー報告だけでは切り分けが遅い。

確認方法:

- `docs/ops/OBSERVABILITY.md`
- provider logs
- requestId 付き API logs

### サポート運用

`support@shupass.jp` の受信、返金例外、AI出力不満、企業情報誤抽出、決済問い合わせの一次対応を用意する。

必要な理由:

- 法務ページだけでは実運用にならない。
- 公開直後は問い合わせの型が固まっておらず、対応品質が信頼に直結する。

確認方法:

- `src/app/(marketing)/contact/page.tsx`
- Google Workspace / mail routing
- Stripe support contact

## Maintainability / Documentation

### 大型ファイル・境界 lint

大型ファイルへの追加抑制、BFF / feature / backend service の境界 lint、次変更前の分割候補を維持する。

必要な理由:

- 本番直前の修正で大型ファイルに追加を続けると、回帰の範囲が読めなくなる。
- release blocker 修正は短時間で行われがちなので、境界の崩れが入りやすい。

確認方法:

- `npm run lint:architecture`
- backend architecture pytest
- `knip` / deadcode gate

### ドキュメント正本化

release docs、ops docs、tracker、plan status の状態を現実装に合わせる。

必要な理由:

- 本番公開判断では、古い仕様メモより現実装と gate evidence が重要。
- `status: 進行中` と JSON 上 `done` のようなズレは、公開可否判断を曖昧にする。

確認方法:

- `bash scripts/test-review-tracker.sh`
- `node tools/check-plan-release-readiness.mjs --json`
- release PR body

### Dirty worktree の扱い

本番前の release 判断では、未コミット変更、生成物、docs-only、verification file、large asset を分類する。

必要な理由:

- 現状の worktree は多数の変更と未追跡ファイルを含む。
- release gate は snapshot hash と staged diff に依存するため、対象外ファイルを曖昧にすると E2E evidence が stale になる。

確認方法:

- `git status --short`
- `git diff --numstat`
- `node scripts/git-hooks/check-git-hygiene.mjs --staged`

## 完了判定

本ドキュメント上の項目は、次のどちらかを満たしたときに本番前確認済みとみなす。

1. 対応する gate / smoke / test / provider check が passed evidence として残っている。
2. 本番前に実施しない判断を release note に明記し、影響範囲、切り戻し方法、公開後の対応期限が決まっている。

「未実施だが問題なさそう」は完了とはみなさない。
