# 本番リリース前 完成項目リスト

**作成日**: 2026-05-04  
**対象**: 就活Pass (`career_compass`)  
**基準**: 公開直前基準。初回の実ユーザー、有料課金、AI利用、個人情報入力が来ても重大事故が起きにくい状態を目指す。  
**範囲**: 実装前に完成させるべき大項目の洗い出し。個別修正タスクや実装手順ではなく、完了すべき品質領域を定義する。

---

## 前提

- 本文書は「何を完成させるべきか」のリストであり、コード変更の計画書ではない。
- 正しい動作の一次情報はコードと release / testing / security docs とする。
- secret 実値や `.env` 実ファイルは参照しない。環境変数の棚卸しは `scripts/release/sync-career-compass-secrets.sh --check` 系のみを使う。
- 公開ドメインは `www.shupass.jp`、本番構成は Vercel + Railway + Supabase + Stripe + Google OAuth / Calendar を前提にする。
- 初回公開時点で、有料課金、AI添削、志望動機、ガクチカ、面接、企業情報取得、締切/タスク/カレンダー導線を提供する前提で分類する。

## 項目一覧

| No. | 項目 | 優先度 |
|---:|---|---|
| 1 | [セキュリティの脆弱性](#1-セキュリティの脆弱性) | P0 |
| 2 | [個人情報・機密情報保護](#2-個人情報機密情報保護) | P0 |
| 3 | [認証・ゲスト/ユーザー所有権](#3-認証ゲストユーザー所有権) | P0 |
| 4 | [課金・クレジット整合性](#4-課金クレジット整合性) | P0 |
| 5 | [DB設計・マイグレーション・RLS](#5-db設計マイグレーションrls) | P0 |
| 6 | [AI品質・失敗率低減](#6-ai品質失敗率低減) | P0 |
| 7 | [LLM/RAGセキュリティ](#7-llmragセキュリティ) | P0 |
| 8 | [企業情報取得・締切抽出](#8-企業情報取得締切抽出) | P0 |
| 9 | [タスク・締切・カレンダー連携](#9-タスク締切カレンダー連携) | P0 |
| 10 | [主要機能の実用性](#10-主要機能の実用性) | P0 |
| 11 | [UI/UX・レスポンシブ品質](#11-uiuxレスポンシブ品質) | P1 |
| 12 | [アクセシビリティ](#12-アクセシビリティ) | P1 |
| 13 | [SEO・公開ページ品質](#13-seo公開ページ品質) | P1 |
| 14 | [法務・商取引・サポート](#14-法務商取引サポート) | P0 |
| 15 | [テスト・品質ゲート](#15-テスト品質ゲート) | P0 |
| 16 | [リリース・インフラ運用](#16-リリースインフラ運用) | P0 |
| 17 | [監視・ログ・障害対応](#17-監視ログ障害対応) | P1 |
| 18 | [パフォーマンス・コスト](#18-パフォーマンスコスト) | P1 |
| 19 | [保守性・デッドコード](#19-保守性デッドコード) | P1 |

## 優先度

| 優先度 | 意味 |
|---|---|
| P0 | 公開前必須。未完了なら本番公開を止めるべき項目。 |
| P1 | 初回公開までに強く推奨。未完了でも限定公開は可能だが、ユーザー体験・運用品質・信頼性に影響する項目。 |
| P2 | 公開後改善可。公開前にリスクとして把握し、ロードマップへ載せる項目。 |

## 外部基準

| 基準 | 本文書での使い方 |
|---|---|
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | 認証、認可、セッション、入力検証、エラー処理、ログ、データ保護の公開前確認観点。 |
| [OWASP Top 10](https://owasp.org/www-project-top-ten/) | Broken Access Control、Injection、Security Misconfiguration、SSRF などの Web アプリ脆弱性の観点。 |
| [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | prompt injection、機密情報漏洩、不安全な出力処理、RAG / agent 境界の観点。 |
| [Stripe Go-live checklist](https://docs.stripe.com/get-started/checklist/go-live) | 本番 API key、webhook、Customer Portal、事業者情報、決済導線、テスト決済の確認観点。 |
| [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) | RLS、API公開範囲、バックアップ、接続方式、migration drift の確認観点。 |
| [Vercel production checklist](https://vercel.com/docs/production-checklist) | 環境変数、ドメイン、security header、build、observability、rollback の確認観点。 |
| [Google Search Central](https://developers.google.com/search/docs) | canonical、robots、sitemap、構造化データ、Search Console、公開ページ品質の確認観点。 |

---

## 完成項目一覧

### 1. セキュリティの脆弱性

**優先度**: P0

**なぜ必要か**: 認可漏れ、CSRF、XSS、Injection、SSRF、過大 payload、ログ漏洩は、就活生の個人情報・ES本文・企業アカウント情報・課金情報に直結する。

**完了条件**

- state-changing API が CSRF / Origin / trusted origin の境界を通る。
- すべての主要 API が `getRequestIdentity()` と owner check を通し、他人の企業・ES・締切・タスク・会話・課金情報へアクセスできない。
- JSON / multipart / PDF upload のサイズ上限、URL fetch の public URL guard、SSRF 対策、rate limit が本番構成で有効。
- CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy が本番ドメインで期待どおり付与される。
- raw error、stack trace、secret、token、cookie、Stripe署名、メールアドレスが本番ログ・UI・レスポンスに露出しない。

**根拠パス**

- `src/proxy.ts`
- `src/lib/security/csp.ts`
- `src/lib/rate-limit.ts`
- `src/lib/logger.ts`
- `docs/ops/SECURITY.md`
- `scripts/security/check-api-route-csrf.mjs`
- `scripts/security/check-raw-error-responses.mjs`

### 2. 個人情報・機密情報保護

**優先度**: P0

**なぜ必要か**: ES本文、ガクチカ、志望動機、企業マイページ認証情報、Google refresh token、Stripe customer/subscription 情報は漏洩時の被害が大きい。

**完了条件**

- ES本文、AI会話、企業メモ、マイページID/パスワード、Google token、Stripe情報の保存・表示・ログ出力範囲が整理されている。
- 暗号化が必要な値は暗号化され、復号キー・secret は provider env と canonical bundle で管理される。
- AI provider へ送る情報の範囲が機能ごとに説明でき、不要な個人情報や他社データを送らない。
- contact / support / legal / privacy の記載が、実際のデータ利用と矛盾しない。
- アカウント削除、ゲスト保持期限、ログ保持、問い合わせ対応時の個人情報取扱いが明文化される。

**根拠パス**

- `src/lib/crypto.ts`
- `src/lib/calendar/`
- `src/lib/stripe/`
- `src/lib/db/schema.ts`
- `docs/features/AUTH.md`
- `docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md`
- `docs/release/ENV_REFERENCE.md`

### 3. 認証・ゲスト/ユーザー所有権

**優先度**: P0

**なぜ必要か**: 就活Pass はログインユーザーとゲストの両方を扱うため、owner 判定の破綻がそのままテナント越境になる。

**完了条件**

- Better Auth session と `guest_device_token` cookie の解決順序が統一されている。
- browser-visible header を guest 正本にせず、HttpOnly cookie から内部 header を再構成する。
- DB の owner XOR 制約とアプリ側 owner check が企業、応募枠、締切、タスク、通知、ES、ガクチカ、志望動機、面接で整合する。
- ゲストからログインへの移行で、他端末・他ユーザーのデータを巻き込まない。
- AI利用がログイン必須である機能は、UI/API の両方で拒否される。

**根拠パス**

- `src/bff/identity/request-identity.ts`
- `src/bff/identity/owner-access.ts`
- `src/lib/db/schema.ts`
- `src/app/api/auth/guest/route.ts`
- `src/app/api/guest/migrate/route.ts`
- `docs/features/AUTH.md`

### 4. 課金・クレジット整合性

**優先度**: P0

**なぜ必要か**: 有料課金と AI クレジットは直接の金銭価値を持つため、二重消費、失敗時消費、無料枠誤消費、webhook重複処理を防ぐ必要がある。

**完了条件**

- Stripe Checkout / Portal / webhook が本番 price ID、Commerce Disclosure、Terms、Privacy、support と整合する。
- webhook は署名検証、冪等性、重複イベント、順不同イベント、キャンセル、支払い失敗、プラン変更を安全に扱う。
- ES添削、志望動機、ガクチカ、面接、企業情報取得、RAG/PDF ingest が「成功時のみ消費」を満たす。
- reserve / confirm / cancel の状態遷移がテストされ、stream中断や FastAPI 失敗で予約が確定しない。
- クレジット履歴・通知・ユーザー表示が、実際の消費量と一致する。

**根拠パス**

- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`
- `src/lib/credits/`
- `src/bff/es-review/handle-review-stream.ts`
- `docs/architecture/BILLING_STATE_MACHINE.md`
- `docs/features/CREDITS.md`
- `docs/release/STRIPE.md`

### 5. DB設計・マイグレーション・RLS

**優先度**: P0

**なぜ必要か**: 本番公開後の schema drift、不要カラム、index不足、RLS未整備、バックアップ不備は、データ破損・性能劣化・情報漏洩につながる。

**完了条件**

- `src/lib/db/schema.ts` と `drizzle_pg/` の migration が一致し、本番 DB が drift していない。
- owner XOR、FK、unique index、検索/一覧/締切/通知/課金で必要な index が実クエリと整合している。
- 未使用テーブル・未使用カラム・旧仕様カラムを洗い出し、公開前に削除またはリスクとして記録する。
- Supabase Data API の露出、RLS deny-all、grant revoke、GraphQL無効化、バックアップ/復元手順を確認する。
- migration 実行、rollback、staging/prod 差分確認の手順が release docs と一致する。

**根拠パス**

- `src/lib/db/schema.ts`
- `drizzle_pg/`
- `docs/architecture/DATABASE.md`
- `docs/setup/DB_SUPABASE.md`
- `docs/release/SUPABASE.md`
- `scripts/dev/check-prod-db-drift.mjs`

### 6. AI品質・失敗率低減

**優先度**: P0

**なぜ必要か**: 就活Pass の中核価値は AI 出力品質であり、ES添削・志望動機・ガクチカ・面接の品質不足は、そのままプロダクト価値の毀損になる。

**完了条件**

- ES添削は文字数、文体、設問正対、自然さ、事実保持、企業根拠、retry収束、fallback頻度を固定ケースと live で確認する。
- 志望動機は企業理解、自己接続、差別化、会話記憶、draft再生成、深掘り継続の品質を確認する。
- ガクチカは会話履歴、序盤事実、数値、結果/学びの文末、ready判定、ES/面接準備の任意生成を確認する。
- 面接は質問品質、講評根拠、設問の重複、設定反映、会話ログ保存、最終講評の信頼性を確認する。
- LLM Judge とプロ視点の評価差を calibration し、偽 green を防ぐ。

**根拠パス**

- `backend/app/prompts/`
- `backend/app/routers/es_review*.py`
- `backend/app/routers/motivation*.py`
- `backend/app/routers/gakuchika.py`
- `backend/app/routers/_interview/`
- `backend/tests/es_review/`
- `backend/tests/motivation/`
- `backend/tests/gakuchika/`
- `backend/tests/interview/`
- `docs/quality/es-review-quality-assessment-2026-04-30.md`
- `docs/testing/ES_REVIEW_QUALITY.md`

### 7. LLM/RAGセキュリティ

**優先度**: P0

**なぜ必要か**: 外部Webページ、PDF、RAG、ユーザー入力、AI会話を扱うため、prompt injection、tenant越境、根拠偽装、機密情報出力を防ぐ必要がある。

**完了条件**

- BFF から FastAPI へ `X-Career-Principal` が渡り、RAG company scope と actor scope が検証される。
- RAG / BM25 / Chroma の metadata に tenant key / company id が入り、別ユーザー/別企業の検索結果が混ざらない。
- 外部ページやPDFに含まれる命令文を system instruction として扱わない。
- AI出力に secret、token、内部変数、開発者向けエラー、未検証情報が出ない。
- 根拠URLは公式/信頼ソース優先で、信頼度と取得時刻をユーザーが確認できる。

**根拠パス**

- `src/lib/fastapi/career-principal.ts`
- `backend/app/security/career_principal.py`
- `backend/app/rag/`
- `backend/app/routers/company_info_*.py`
- `docs/architecture/BFF_FASTAPI_CONTRACT.md`
- `docs/architecture/TENANT_ISOLATION_AUDIT.md`
- `docs/features/COMPANY_RAG.md`

### 8. 企業情報取得・締切抽出

**優先度**: P0

**なぜ必要か**: 「締切を落とさない」は主要価値であり、候補提示が遅い、締切抽出が弱い、誤った締切を自動確定する状態では公開品質に届かない。

**完了条件**

- 採用ページ候補提示までの latency、検索候補品質、fallback導線を測定する。
- 選考スケジュール取得は、公式採用ページに存在する締切を高い再現性で抽出する。
- 自動抽出結果は必ずユーザー承認を経て確定し、未承認の締切が通知/タスク/カレンダーに流れない。
- 部分成功、締切なし、低信頼度、候補なし、FastAPI失敗時のUXが明確で、失敗時は無料枠/クレジットを消費しない。
- token量、検索段数、LLM呼び出し回数のコスト削減余地を洗い出す。

**根拠パス**

- `backend/app/routers/company_info_schedule*.py`
- `backend/app/routers/company_info_search.py`
- `src/app/api/companies/[id]/fetch-info/route.ts`
- `src/components/companies/DeadlineApprovalModal.tsx`
- `docs/features/COMPANY_INFO_FETCH.md`
- `docs/features/DEADLINES.md`

### 9. タスク・締切・カレンダー連携

**優先度**: P0

**なぜ必要か**: 就活Pass の管理体験は、締切、タスク、通知、Google Calendar が一体で動いて初めて価値になる。

**完了条件**

- JST 基準で締切、日次通知、月次無料枠、今日のタスクが計算される。
- 締切承認/手動作成からテンプレートタスク生成、依存チェーン、今日のタスク、通知まで一貫する。
- Google Calendar 連携は明示操作のみで有効化され、target calendar / freebusy / sync job / retry / disconnect が安全に動く。
- Google token refresh は競合に強く、同期失敗時は通知と再試行導線がある。
- 本番で「タスク・締切が読めない」「企業詳細へ遷移できない」などの既知症状が再現しないことを staging smoke で確認する。

**根拠パス**

- `src/lib/calendar/`
- `src/lib/server/task-generation.ts`
- `src/lib/server/task-dependency.ts`
- `src/app/api/calendar/`
- `src/app/api/tasks/`
- `src/app/api/deadlines/`
- `docs/features/CALENDAR.md`
- `docs/features/TASKS.md`
- `docs/features/DEADLINES.md`

### 10. 主要機能の実用性

**優先度**: P0

**なぜ必要か**: 公開後の初回利用で主要導線が壊れると、AI品質以前に離脱と問い合わせが発生する。

**完了条件**

- ダッシュボード、企業一覧/詳細、企業登録、締切/タスク、ES一覧/編集、ES添削、志望動機、ガクチカ、面接、検索、通知、設定、プロフィール、課金導線が staging で通る。
- guest と logged-in user の両方で、利用可能機能とログイン必須機能の境界が分かりやすい。
- API 失敗、AI失敗、クレジット不足、rate limit、外部サービス失敗時に、ユーザーが次に何をすればよいか分かる。
- 既知の本番症状を E2E / release smoke / readonly production test に落とし込む。

**根拠パス**

- `src/app/(product)/`
- `src/app/api/`
- `e2e/functional/`
- `docs/testing/E2E.md`
- `docs/release/PRODUCTION.md`

### 11. UI/UX・レスポンシブ品質

**優先度**: P1

**なぜ必要か**: 就活生向けの初回信頼と継続利用は、レスポンシブ崩れ、読み込み中の不安、モーダルの見づらさ、進捗UIのズレで大きく損なわれる。

**完了条件**

- LP、オンボーディング、ダッシュボード、各一覧、企業詳細、AI会話、ES生成モーダル、進捗UIを 320 / 390 / 768 / 1024 / 1440px で確認する。
- 横スクロール、要素の重なり、3行化したバー、途中で変わる進捗レイアウト、モーダルの狭さを潰す。
- loading / empty / error / success / processing / disabled state が主要画面に揃う。
- LP は実装済み機能だけを訴求し、画像やアセットの配置が design docs と整合する。
- UI変更時は guardrails と Playwright screenshot review の証跡を残す。

**根拠パス**

- `src/components/landing/`
- `src/components/dashboard/`
- `src/components/skeletons/`
- `src/components/shared/`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`
- `docs/testing/UI_PLAYWRIGHT_VERIFICATION.md`
- `tools/run-ui-review.mjs`
- `tools/check-ui-guardrails.mjs`

### 12. アクセシビリティ

**優先度**: P1

**なぜ必要か**: 基本的なキーボード操作、フォームラベル、読上げ、コントラストが不足すると、実用性と信頼性を損なう。

**完了条件**

- フォーム、モーダル、タブ、メニュー、チェックボックス、トースト、AI会話がキーボードで操作できる。
- 入力項目に label / aria があり、エラーと説明文が支援技術に伝わる。
- LPや公開ページの主要テキストは画像内だけに閉じず、HTMLテキストとして存在する。
- 色だけに依存した状態表示を避ける。
- フォーカスリング、モーダル focus trap、escape / close 操作が確認済み。

**根拠パス**

- `src/components/ui/`
- `src/components/seo/`
- `DESIGN.md`
- `docs/architecture/FRONTEND_UI_GUIDELINES.md`

### 13. SEO・公開ページ品質

**優先度**: P1

**なぜ必要か**: Google検索に出ない状態は、公開後の自然流入と信頼形成を阻害する。公開ページは実装済み機能と法令表現に制約される。

**完了条件**

- canonical、sitemap、robots、metadata、OGP、FAQ JSON-LD、Breadcrumb JSON-LD が公開URLと一致する。
- product / auth / api は noindex で、marketing / tools / templates / legal は必要に応じて index 可能。
- Search Console 所有権確認、sitemap送信、URL検査、主要KWの初期モニタリング手順がある。
- 「就活」「ES添削」「就活AI」「就活パス」「ES AI」などの意図に対し、実装済み機能だけでページ訴求が整理されている。
- 内定率、通過率、無制限無料、根拠なきランキング/口コミなど、優良誤認につながる表現を使わない。

**根拠パス**

- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `src/lib/marketing/`
- `src/components/seo/`
- `docs/marketing/README.md`
- `docs/marketing/LP.md`
- `docs/ops/SEO_GOOGLE_SEARCH_CONSOLE.md`

### 14. 法務・商取引・サポート

**優先度**: P0

**なぜ必要か**: 有料サブスクを公開するには、特商法、返金・解約、プライバシー、問い合わせ、Stripe審査の整合が必要。

**完了条件**

- `/legal`、`/terms`、`/privacy`、`/contact`、`/pricing` の販売事業者、運営責任者、サポートメール、返金、解約、課金周期が一致する。
- Stripe Commerce Disclosure、Customer Portal、明細書表記、support URL / email がサイト表記と一致する。
- 所在地・電話番号の請求時開示運用が、実際に対応可能な手順として整っている。
- Google OAuth / Calendar の利用目的と privacy 表記が矛盾しない。
- 問い合わせ通知、返信SLA、障害時の連絡手段が決まっている。

**根拠パス**

- `src/app/(marketing)/legal/page.tsx`
- `src/app/(marketing)/privacy/page.tsx`
- `src/app/(marketing)/terms/page.tsx`
- `src/app/(marketing)/contact/page.tsx`
- `docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md`
- `docs/release/STRIPE.md`

### 15. テスト・品質ゲート

**優先度**: P0

**なぜ必要か**: AI機能と課金機能は手動確認だけでは回帰を止めにくい。公開前に blocking / non-blocking の境界を明確にする必要がある。

**完了条件**

- `npm run test:release-critical`、CSRF/raw error/security scan、Stripe/credits/identity/API route 重点テストが通る。
- E2E Functional の対象 feature が staged diff / release scope と連動し、必要な local manifest が揃う。
- AI Live は偽 green を避け、failed/degraded/report-only の扱いを公開前基準で整理する。
- UI変更は `npm run lint:ui:guardrails` と `npm run test:ui:review -- <route>` の証跡を残す。
- flaky、auth不備、cleanup失敗、timeout、品質失敗を区別して調査できる。

**根拠パス**

- `package.json`
- `.githooks/pre-commit`
- `scripts/ci/`
- `scripts/security/`
- `security/scan/run-lightweight-scan.sh`
- `e2e/functional/`
- `backend/tests/`
- `docs/testing/AI_LIVE.md`
- `docs/ops/TEST_HARNESS.md`

### 16. リリース・インフラ運用

**優先度**: P0

**なぜ必要か**: provider env、secret、DB migration、health check、rollback、staging/prod確認が崩れると、本番復旧が困難になる。

**完了条件**

- `make ops-release-check` で provider auth、infra bootstrap、secret inventory、provider key drift、branch前提を確認する。
- Vercel、Railway、Supabase、Stripe、Google OAuth / Calendar、Upstash の env key set が release docs と一致する。
- staging health、guest/user/regression Playwright、full functional smoke、production readonly Playwright が実行可能。
- migration、deploy、release PR、main promotion、tag、rollback dry-run の手順が明確。
- 本番 write を伴う確認と readonly production smoke の境界が守られる。

**根拠パス**

- `Makefile`
- `scripts/release/release-career-compass.sh`
- `scripts/release/sync-career-compass-secrets.sh`
- `scripts/release/post-deploy-playwright.sh`
- `docs/release/PRODUCTION.md`
- `docs/release/ENV_REFERENCE.md`
- `docs/release/VERCEL.md`
- `docs/release/RAILWAY.md`

### 17. 監視・ログ・障害対応

**優先度**: P1

**なぜ必要か**: 公開後は「壊れているか」より「どこが、誰に、どの requestId で壊れたか」を追えることが重要になる。

**完了条件**

- API error response に `requestId` があり、本番ログから追跡できる。
- FastAPI / RAG / AI Live / Stripe webhook / cron の失敗を調査できるログと report がある。
- RAG metrics、tenant boundary alert、retrieval latency、reranker latency、backend health の監視観点がある。
- daily notifications / calendar sync cron の成功・失敗ログを確認できる。
- 障害時の triage、rollback、ユーザー告知、再発防止メモの置き場所が決まっている。

**根拠パス**

- `src/bff/api/error-response.ts`
- `src/lib/api-errors.ts`
- `backend/app/rag/telemetry.py`
- `backend/app/rag/metrics_exporter.py`
- `docs/ops/OBSERVABILITY.md`
- `scripts/ci/write-ai-live-summary.mjs`
- `scripts/release/rollback-career-compass.sh`

### 18. パフォーマンス・コスト

**優先度**: P1

**なぜ必要か**: AI/RAG/検索/画像/DB/外部APIは、遅延とコストがユーザー体験と収益性に直結する。

**完了条件**

- Dashboard、企業一覧、ES一覧、通知、検索、企業詳細の初期表示で不要な本文取得・重複 fetch・waterfall を避ける。
- RAG retrieval、BM25、rerank、企業情報検索、選考スケジュール抽出の p95 latency を測定できる。
- AI token量、retry回数、fallback頻度、モデル別コスト、月次無料枠消費を見積もる。
- LP / dashboard / 画像 assets のサイズ、LCP、CLS、モバイル表示を確認する。
- Vercel、Railway、Supabase、Upstash、Stripe、OpenAI、Anthropic、Google API の初期運用コストを見積もる。

**根拠パス**

- `docs/architecture/ARCHITECTURE.md`
- `docs/ops/OBSERVABILITY.md`
- `backend/app/rag/telemetry.py`
- `src/lib/ai/cost-summary-log.ts`
- `src/components/landing/`
- `public/marketing/`

### 19. 保守性・デッドコード

**優先度**: P1

**なぜ必要か**: 公開前に旧実装、巨大ファイル、未使用コード、重複責務、古いドキュメントを放置すると、公開後のバグ修正速度が落ちる。

**完了条件**

- 500行超の hotspot、router/service 未分離、旧 component / hook / bff の互換 entrypoint を把握する。
- `knip`、deadcode、lint、architecture lint、import-linter で不要コードと境界違反を洗い出す。
- 未使用の migration repair scripts、古い docs、古い改善メモ、現行仕様と矛盾する説明を整理する。
- 新しい修正で `as any`、空 catch、skip test、console.log、TODO/FIXME/HACK を増やさない。
- `AGENTS.md` と `CLAUDE.md` の内容が同期され、AI開発ハーネスの guard が過剰にノイズ化していない。

**根拠パス**

- `docs/architecture/ARCHITECTURE.md`
- `docs/ops/AI_DEVELOPMENT_PRINCIPLES.md`
- `knip.config.ts`
- `package.json`
- `backend/tests/architecture/`
- `AGENTS.md`
- `CLAUDE.md`

---

## Assumptions

- 初回公開では、無料ユーザーだけでなく有料課金ユーザーが発生しうる。
- 初回公開では、AI添削、志望動機、ガクチカ、面接、企業情報取得、締切/タスク/カレンダーの主要導線を見せる。
- 本番公開前の最終判定は `make ops-release-check`、release-critical tests、staging smoke、production readonly smoke を通したうえで行う。
- 本文書の項目は「完了領域」のリストであり、各項目の実装順・担当・見積もりは別の実装計画に分解する。
