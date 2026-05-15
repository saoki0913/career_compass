# 19 カテゴリ計画書 - 実行順序（Codex レビュー反映版）

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


## Context

就活Pass の品質改善計画 19 カテゴリの最適な実行順序を決定する。全カテゴリの計画書は作成済み（#6, #10 を除く）。2026-05-05 時点で #17 監視 Phase 0 の repo 内 P0 は実装済み、外部ダッシュボード設定は運用手順化済み。2-3 並列トラック、品質優先、期限なし。

**Codex レビュー (2026-05-05) の主要修正:**
- Phase 0: PII scrub → Sentry の順序制約を反映
- Phase 2: Track A を sequential sub-phases に分割（ファイル競合回避）
- #14 Legal: Phase 0 から docs-first で開始（外部確認待ち考慮）
- #5 DB/RLS: Release 前必須 vs Release 後に明確分離
- #1 Security: sub-phase 構造を明示

## 依存関係の全体像

```
#17 P0 (Sentry-first external monitoring) → PII scrub → Sentry
                    ↘
#14 Legal (docs-first) ─────────────────────────────→ Release Gate

#1 Security (2-3w) → #3 Auth (2w) → #4 Billing (2w) → #7 LLM/RAG (1-2w)
                                                         ↘ (all four) → #2 Personal Data
                     #3 Auth → #5 DB/RLS pre-release (3w) → #5 post-release (3-4w) → #19 Maint

#8 Company (P0) ──────────────────────────────────────→ #9 Task/Calendar
#11 UI/UX ────────────────────────────────────────────→ #13 SEO
```

**ハード依存（A 完了が B の前提条件）:**
1. #1 Security → #3 Auth (CSRF hardening)
2. #1 Security → #4 Billing (payment_failed downgrade)
3. #1 Security → #7 LLM/RAG (SSRF validation)
4. #3 Auth → #4 Billing (owner boundary affects credit owner check)
5. #3 Auth → #5 DB/RLS (owner boundary for RLS policies)
6. #1 + #3 + #4 + #7 → #2 Personal Data (全セキュリティ基盤が前提)
7. #5 DB pre-release → #19 Maintainability P1+ (schema stability)
8. #8 Company Info → #9 Task/Calendar (extraction quality)
9. #11 UI/UX → #13 SEO (font migration, visual regression)
10. #14 Legal → Release (法務はリリース前必須)
11. PII scrub allowlist → Sentry integration (PII が外部送信されないことが前提)

---

## 実行計画

### Phase 0: 可観測性 + 法務 docs-first + テスト基盤（1 週間）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | #17 監視 Phase 0 | **Done (repo)**: PII scrub allowlist, TS/Python shared sanitizer, Sentry privacy-first init, `/health/ready` 公開情報削減、Sentry-first 監視手順化。**External**: Sentry 必須 3 monitors と backend event 到達確認は dashboard 手作業。UptimeRobot は任意冗長監視。 | 完了 |
| B | #15 テスト P0 infra | **Done (repo)**: Vitest / pytest-cov coverage 基盤、coverage Make targets、BFF 課金境界テスト、Gate Shadow/Advisory utilities。**Deferred**: blocking gate への接続は release 後に shadow data を見て判断。 | 完了 |
| C | #14 法務 docs-first | **Done (repo)**: AI copyright / AI免責 / 返金例外文言を `/terms` と Stripe 表示に反映、課金 P0 の transaction / past_due gate / refund-dispute webhook / billing hold / アプリ内通知を実装済み。**External**: AI著作権・返金例外条項の外部確認待ち。**Ops Done**: Stripe live webhook endpoint / Billing Portal Terms URL 設定済み。Cookie consent は P1 へ継続。 | 完了 |

**理由**: Sentry-first で監視・trace・error capture を集約し、PII scrub allowlist を先に定義することで外部送信を安全にする。法務は外部確認に待ち時間が発生するため docs-first で先行開始。

**Gate**: #17 は focused sanitizer / Sentry scrub / health tests、`tsc`、lint、security static、`git diff --check` pass。Sentry 必須 3 monitors の green と backend event 到達は外部 dashboard で完了確認する。#15 は coverage レポート生成可能、#14 は法務ドラフト外部確認に送付済み。

**#17 Phase 0 実装メモ (2026-05-05)**:
- 2026-05-13 以降、状態管理の正本は統合 `docs/plan/plan-tasks.json` に移行した。旧 `scripts/plan/update-monitoring-task-status.mjs` は互換 wrapper として統合 JSON を更新する。
- `src/lib/sanitize.ts` / `backend/app/utils/sanitizer.py` を追加し、logger と Sentry beforeSend の共通 scrubber とした。
- Sentry は Replay 完全 OFF、`sendDefaultPii=false`、DSN 未設定 no-op。Next.js と FastAPI の初期化を追加済み。
- `/health/ready` は provider key configured boolean を返さない。
- `docs/ops/MONITORING_SETUP.md` と `docs/release/EXTERNAL_SERVICES.md` に Sentry-first 監視手順を追加した。UptimeRobot は任意冗長監視として扱う。
- SSL expiry monitor、cron heartbeat / Sentry Crons、Loki / Grafana、`/health/deep`、Drizzle slow query logger は Phase 1+ へ延期する。

**#15 P0 実装メモ (2026-05-05)**:
- 2026-05-13 以降、状態管理の正本は統合 `docs/plan/plan-tasks.json`。旧 `scripts/plan/update-test-quality-task-status.mjs` は互換 wrapper として統合 JSON を更新する。
- `@vitest/coverage-v8` と `pytest-cov` を導入し、`make test-coverage` / `make backend-test-coverage` で HTML + JSON coverage を生成できる。
- `backend/pytest.ini` は `pythonpath = . ..` とし、`app.*` / `backend.app.*` の既存 import 混在に対応した。
- `backend-test-coverage` は決定的テストを対象にし、`integration / golden_eval / llm_judge / calibration` は除外する。外部接続を伴う品質評価は P1+ の Quality gate で扱う。
- BFF 課金境界テストを追加し、ES Review reserve/confirm/cancel、Motivation 成功時のみ消費、Company Fetch free quota/credit reservation、LLM daily token guard をカバーした。
- Gate P0 は `command-classifier.mjs classify-change-path` と `diff-snapshot.mjs batch-verify` を Shadow/Advisory utility として追加した。`pre-tool-dispatcher.sh` / `test-category-gate.sh` / `bandaid-guard.sh` の blocking 条件は変更していない。
- 検証: `make test-coverage` pass (290 files / 1297 tests), `make backend-test-coverage` pass (1477 passed / 42 deselected), focused BFF Vitest pass, harness node tests pass。

**#14 Phase 0 実装メモ (2026-05-06)**:
- 2026-05-13 以降、状態管理の正本は統合 `docs/plan/plan-tasks.json`。旧 `scripts/plan/update-legal-commercial-task-status.mjs` は互換 wrapper として統合 JSON を更新する。
- `/terms` に AI生成物の権利と責任、AI機能の免責、返金例外・損害賠償制限を追加した。AIプロバイダの学習不使用は断定せず、管理API利用・契約設定の範囲に限定した。
- Stripe Checkout 表示と `managed-config.json` の返金・解約短文を `/terms#billing` と整合させた。
- 課金 P0 として `consumeCredits` transaction 化、plan allocation 差分更新、past_due/dispute hold の credit-layer gate、`charge.refunded` / `charge.dispute.created` / `charge.dispute.closed` webhook、billing status アプリ内通知を追加した。
- `charge.refunded` は全額返金のみ Free 降格、部分返金は自動降格せず通知のみ。`charge.dispute.created` は新規 AI credit 消費を停止し、`closed/won` で解除、lost 系は Free 降格する。
- 2026-05-07: Stripe live webhook endpoint `we_1TU7jPBxfIrGtqi5E6HvjaV9` を `https://www.shupass.jp/api/webhooks/stripe` に作成し、`checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.payment_succeeded` / `invoice.payment_failed` / `charge.refunded` / `charge.dispute.created` / `charge.dispute.closed` を有効化した。Billing Portal configuration `bpc_1TU7jkBxfIrGtqi5sTCEbndg` を作成し、Terms URL を `https://www.shupass.jp/terms` に設定した。

---

### Phase 1: セキュリティ基盤 + Sentry 導入 + 企業情報 Critical Fix（3 週間）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | **#1 セキュリティ** (sub-phases) | Week 1: Auth系 (CSRF, guest migration, webhook idempotency). Week 2: Backend系 (SSRF, SSE concurrency, PDF/URL validation). Week 3: Billing系 (payment_failed downgrade, race conditions, DB owner integrity) | 2-3w |
| B | #8 企業情報 Phase 0 + #17 P0b | **Done (repo/CLI baseline/frontend monitor)**: #8 5 Critical bugs 解消。#17 は Sentry-first 監視手順化、Vercel/Sentry/secrets/公開 health の CLI baseline 確認済み。Sentry frontend uptime は Dashboard で `Uptime` / `200` check-in まで確認済み。**Deferred manual**: backend Sentry uptime は `*.railway.app` domain-wide limit により最後に回し、独自 backend domain 設定後に作成する。backend Sentry event 到達確認も最後の手作業。UptimeRobot は任意冗長監視。 | 完了 |
| C | #17 P1+P2, #15 P0 tests | **Release minimum Done**: frontend/product/global error boundary の Sentry capture と Sentry scrub allowlist 強化。**Deferred**: Loki, rollback provider 実行化, Sentry Crons / cron monitoring, `/health/deep`, Drizzle slow query logger, coverage gap 分析。 | release minimum 完了 / P1+ deferred |

**理由**: #1 を sub-phase 化し auth/backend/billing の領域ごとに進める。Sentry は Phase 0 で PII scrub が整ったため安全に導入可能。#8 P0 は独立した critical bug。

**#1 Security sub-phase 構造:**
- Week 1 (Auth): CSRF hardening, guest migration atomic claim, webhook idempotency → #3 Auth の前提を先に固める
- Week 2 (Backend): SSRF/redirect validation, SSE concurrency lease, PDF size cap, URL scheme validation → #7 LLM/RAG の前提
- Week 3 (Billing): payment_failed → free plan downgrade, company fetch concurrent race, RAG monthly usage atomic → #4 Billing の前提

**完了実績:**
- 2026-05-07: **Track A #1 Security 全 20 タスク完了**（3 sub-phase: Auth Week 1, Backend Week 2, Billing Week 3）
- 2026-05-07: **Track B #8 P0 全 5 Critical bugs 解消** — T-01 JST基準違反一掃 (5箇所)、T-02 KeyError crash修正、T-03 タスク生成冪等性保証、T-04 タスク巻き戻しバグ修正、T-05 HTML テーブル構造保持
- 2026-05-09: **#17 監視 release minimum 完了** — product/global error boundary の Sentry capture、Sentry event scrub allowlist 強化、Vercel/Sentry/secrets/公開 health の CLI baseline を記録した。frontend Sentry は First Event 到達済み、backend Sentry は project active だが No events yet のため手動 follow-up とする。2026-05-13 以降の状態管理は統合 `docs/plan/plan-tasks.json` を正本とする。
- 2026-05-10: **Sentry-first 外部監視の現状整理** — frontend uptime monitor は Dashboard で `Uptime` / `200` check-in まで確認済み。backend uptime は Sentry の `*.railway.app` domain-wide limit により Railway 生成ドメインでは作成できないため、`api.shupass.jp` などの独自 backend domain 設定後の最後の手作業に回す。
- 2026-05-10: **Phase 2 Track A #3 Auth P0 release hardening 完了** — guest migration の CSRF / owner table 棚卸し / atomic claim を現状同期し、migration 衝突時の user-wins 処理、owner-conditioned mutation helper、`submissions/[id]` / `deadlines/[id]` / `calendar/events/[id]` の id+owner mutation、外部 sync の local mutation 成功後実行、高リスク mutation の session 解決例外 `503` fail-closed を実装した。#3 の P1（Owner Access Facade の広域展開、structured error 全面統一、FastAPI principal inventory）は残タスクとして継続する。
- 2026-05-11: **Phase 2 Track A #3 Auth P1 release-final 完了** — Owner Access facade、applications / notifications の structured error と owner-conditioned mutation、production/staging company search fallback の `503` fail-closed、company search / fetch-schedule / Gakuchika JSON AI / interview drill の `X-Career-Principal` 必須化、企業 RAG / PDF upload の usage reservation + owner-conditioned persistence service を実装した。DB migration を伴う index / partial unique / RLS policy は #5 DB/RLS pre-release に送る。

**Gate**: 全 15 セキュリティタスク完了（sub-phase ごとに検証）、#8 の 5 Critical bugs 解消、Sentry で frontend エラー捕捉確認、監視 release minimum 完了。Loki / Sentry Crons / rollback provider 実行化 / `/health/deep` / slow query logger は本番リリース後の P1+ として扱う。

---

### Phase 2: 認証 → 課金 → LLM（sequential）+ UI/UX + 法務実装（4 週間）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | **#3 Auth → #4 Billing → #7 LLM/RAG (sequential sub-phases)** | Sub-1 (2w): #3 owner-access, RequestIdentity統一, guest migration atomic, FastAPI principal. Sub-2 (1-2w): #4 reserve/consume transaction safety, credit audit trail, reservation TTL. Sub-3 (1w): #7 prompt injection, output leakage, rate limiting | 4w total |
| B | #11 UI/UX + #12 Accessibility | viewport-fit, touch targets 44px, breakpoint normalization, typography tokens, axe-core | 2-3w |
| C | #14 法務 P0 実装 + #16 Release P0 + #6/#10 計画書作成 | 法務: Phase 0 ドラフト確定分を実装 (cookie consent, AI 免責, 特商法). Release: rollback script, health deep, secrets audit. Plans: #6 AI品質 + #10 実用性の計画書ドラフト | 3-4w |

**Track A sequential の理由 (Codex 指摘反映):**
- #3 Auth と #4 Billing は `src/lib/credits/*`、`src/bff/identity/`、owner condition ロジックで **ファイルレベルの競合** が発生する
- #3 の RequestIdentity 統一が完了してから #4 の credit owner check を安全に修正できる
- #7 は FastAPI 側 (`backend/app/`) が主で、#3/#4 のフロントエンド BFF とは競合しにくいが、#1 SSRF 修正の安定を待つ

**Gate**: RequestIdentity 統一完了（#3 Auth P1 release-final 完了）、credit race condition 解消、LLM output scanning 動作、UI touch targets 全対応、法務 P0 実装完了（cookie, AI免責, 特商法）、#6/#10 計画書ドラフト完成。

---

### Phase 3: DB/RLS (pre-release) + 個人情報 + 企業情報続行（4 週間）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | **#5 DB/RLS pre-release** | Phase 0: identity source audit. Phase 1: owner integrity constraints + composite FK. Phase 2: 5 indexes 追加 + 4 redundant 削除. Phase 3: JSONB CHECK constraints. Phase 4: migration framework validation script | 3-4w |
| B | #2 個人情報 + #9 Task/Calendar | #2: PII allowlist enforcement, 外部送信最小化, 削除検証, ログ PII 除去 (17 items P0-P1). #9: Critical/High bug fix + Calendar sync 安定化 (depends on #8 P0) | #2: 2-3w, #9: 2-3w |
| C | #8 P1-P3 | structure/quality/performance/infra phases (残り 30 tasks) | 4-5w |

**#5 DB/RLS の分離 (Codex 指摘反映):**
- **Pre-release 必須 (この Phase)**: owner integrity, indexes, JSONB constraints, migration safety
- **Post-release (Phase 6)**: RLS policy 定義 (38 tables), role migration (app_role/auth_role切替) — architecture gate + RFC が前提

**理由**: #5 pre-release は #3 Auth 完了が前提（owner boundary）。#2 は #1+#3+#4+#7 全完了が前提。#9 は #8 P0 完了が前提。

**#9 Task/Calendar release-final 実装メモ (2026-05-14)**:
- 本番リリース前の安定化として、締切・タスク・カレンダー同期の Critical/High 改善を実装した。Google Calendar eventId の URL encode、即時削除同期の retry queue 失敗時 fail-closed、未確認締切の calendar feed 除外、task/deadline status 更新の transaction 化、依存タスク解除の複数 successor 対応、通知 batch の `CRON_SECRET` fail-closed、company deadline API の structured error / identity 一回解決を反映済み。
- 新機能・DB migration・RLS 変更は実施していない。nudges / timeline / M-12 の deadline 完了時 task 自動完了など挙動変更が大きい項目は、ユーザー承認が必要な後続タスクとして残す。
- 集中検証: #9 関連 Vitest 13 files / 50 tests pass、`npx tsc --noEmit` pass、`npm run lint` pass (warnings only)、`npm run test:security:static` pass。

**Gate**: Owner integrity constraints deployed、index optimization confirmed (pg_stat)、PII inventory 完了 + 削除 workflow 動作、#8 extraction accuracy 改善確認。

---

### Phase 4: SEO + リリース準備 + テスト拡充（3-4 週間）= Release Gate

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | #13 SEO | title dedup, canonical, sitemap, structured data, CWV (font optimization), GA4, content optimization | 2-4w |
| B | #14 法務 P1+P2 + #16 Release P1+P2 | 法務: account deletion 完成, data export API, SLA, refund/dispute webhook. Release: DR strategy, backup validation, secrets rotation, vulnerability scanning | 2-3w |
| C | #15 Test P1+P2 + #6/#10 P0 実装 | LLM Judge 安定化, cross-feature journey tests, coverage threshold 強制. #6/#10 P0 実装 | 3-4w |

**Release Gate Checklist (Codex 推奨: 明文化):**
- [ ] #14 Legal P0+P1 全要件充足（特商法, AI 免責, cookie consent, account deletion）
- [ ] PII scrub + Sentry 安全運用確認（release minimum repo 対応済み: Replay off, `sendDefaultPii=false`, scrub allowlist, frontend First Event / uptime 200 check-in 確認。frontend alert final check、backend event 到達、backend uptime monitor は最後の手作業）
- [ ] Rollback / incident runbook / backup 動作確認（rollback は dry-run 正本。provider 実行化と backup validation は #16 P1+）
- [ ] 「成功時のみ消費」ビジネスルール全 API で検証済み
- [ ] 全 21 ページ SEO audit pass
- [ ] LLM Judge false positive rate 目標達成
- [ ] Security chain (#1→#3→#4→#7) 全完了 + regression test pass

**Gate (= Release Gate)**: 上記 Checklist 全項目 pass。

---

### Phase 5: リリース後安定化 + 機能品質（2-3 週間）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | #6 AI 品質 P1+ / #10 実用性 P1+ | LLM failure rate reduction, core feature usability improvements | 2-3w |
| B | #15 P2 + #5 DB Phases 3-4 (index tuning) | coverage threshold CI 強制, index optimization (production query patterns), migration framework hardening | 2-3w |

**理由**: リリース後のユーザーフィードバックとプロダクション observability data を活用。

**Gate**: AI failure rate 改善確認、coverage threshold CI enforced、DB index optimized (production metrics)。

---

### Phase 6: 大規模リファクタ + RLS 完全化（4-8 週間、継続的）

| Track | Category | Scope | 工数 |
|-------|----------|-------|------|
| A | #18 パフォーマンス | prompt caching, model routing, ISR, image optimization, RAG pipeline efficiency (20 tasks P0-P3) | 4-8w |
| B | #19 保守性 P1+ + #5 DB/RLS post-release | #19: BFF/FastAPI boundary, dead code elimination, route splitting, Clean Architecture. #5: RLS policy 定義 (38 tables), role migration (app_role/auth_role) | 4-6w |

**理由**: blast radius 大の独立案件は最後（ユーザー feedback）。#19 は #5 pre-release stability が前提。#18 は production observability data が必要。RLS full rollout は architecture gate / RFC を経てから。

**Gate**: LLM API cost 目標達成、月額 5,000 円以内維持、error rate 増加なし、RLS integration test pass。

---

## サマリーテーブル

| Phase | 期間 | Categories | 性質 |
|-------|------|-----------|------|
| 0 | 1w | #17 P0a (Sentry-first monitoring), #15 infra, #14 docs-first | 可観測性 + 法務先行 |
| 1 | 3w | **#1** (sub-phases), #8 P0, #17 P0b (Sentry), #17 P1+P2, #15 P0 | セキュリティ基盤 |
| 2 | 4w | **#3→#4→#7** (sequential), #11+#12, #14 P0 impl, #16 P0, #6/#10 plans | データ整合性 + UI + 法務 |
| 3 | 4w | **#5 pre-release**, #2, #9, #8 P1-P3 | DB + 個人情報 + 機能 |
| 4 | 3-4w | #13, #14 P1+P2, #16 P1+P2, #15 P1+P2, #6/#10 P0 | **Release Gate** |
| 5 | 2-3w | #6/#10 P1+, #15 P2, #5 index tuning | 安定化 |
| 6 | 4-8w | #18, #19 P1+, #5 RLS post-release | 大規模改善 |

**リリースまでの Critical Path**: ~15 週間（Phase 0-4）
**全体完了**: ~22-30 週間

---

## Hotspot 事前分割（Codex 指摘: LOW）

Phase 2-3 で以下の 500 行超ファイルに変更が入る場合、事前に architect gate で分割判定を行う:
- `backend/app/routers/es_review.py` (1340 行)
- `backend/app/utils/llm.py` (986 行)
- `src/components/es/ReviewPanel.tsx` (1400 行)

---

## 重要な設計判断

1. **PII scrub → Sentry の順序**: 外部送信する監視ツールは PII sanitizer が整ってから導入
2. **Phase 2 Track A sequential**: #3→#4→#7 は同一ファイル競合回避のため直列実行
3. **#14 Legal docs-first**: 外部確認待ちが発生するため Phase 0 から文書作成開始
4. **#5 DB/RLS 分離**: pre-release (owner integrity, indexes) と post-release (full RLS) を明確分離
5. **#6/#10 の位置**: Phase 2 で計画書作成 → Phase 4 で P0 実装 → Phase 5 で P1+
6. **#12 Accessibility**: #11 UI/UX に内包（axe-core + WCAG は #11 のタスク）
7. **Release Gate Checklist 明文化**: 法務/PII/rollback/成功時のみ消費/SEO/LLM Judge/Security chain
8. **#17 を force multiplier として活用**: Sentry-first 監視を正とし、UptimeRobot は任意の外部冗長監視に留める

---

## Verification

実行開始時:
1. 各 Phase の Gate criteria を満たしてから次 Phase に進む
2. Phase 内の Track は独立並行（相互依存なし）
3. 各タスク完了時は該当計画書のチェックリストを消化
4. regression は #17 Sentry + #15 coverage で検知
5. 500 行超ファイルへの新規責務追加は architect gate を通す
