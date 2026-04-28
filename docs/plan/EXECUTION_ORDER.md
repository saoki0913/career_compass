# プラン実行順序

**最終更新**: 2026-04-27
**進捗追跡**: [docs/review/TRACKER.md](../review/TRACKER.md)
**この文書の役割**: 「`docs/plan` を実行して」と依頼されたときに、次セッションが迷わず並列開発を始めるための正本入口。

---

## 0. 実行方針

本リポジトリの計画書は、完了済みの品質改善計画と、まだ実装・検証が残る計画が混在している。以後はこの文書を入口にし、各計画書の詳細手順へリンクして実装する。

**基本方針**:

- 安全優先で進める。依存ゲートを飛ばして大きな PR にまとめない。
- 完了済み計画は再実装しない。必要なら smoke / regression gate だけ再確認する。
- 未完了計画は「実装完了、検証完了、計画書・TRACKER の状態更新」までを完了条件にする。
- `CLEAN_ARCHITECTURE_REFACTORING.md` は superseded。正本は `MAINTAINABILITY_IMPROVEMENT_PLAN.md`。
- DB の破壊的 migration は最後に別スプリントで扱う。ただし低リスク DB タスクは先行可能。

---

## 1. 現状サマリ

### 1.1 完了済み・再実装しない計画

| 計画書 | 状態 | 扱い |
|---|---:|---|
| [AI_QUALITY_IMPROVEMENT_PLAN.md](AI_QUALITY_IMPROVEMENT_PLAN.md) | 完了 | 子プラン含め close。RAG 残件は RAG 計画側で扱う |
| [AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md](AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md) | 完了 | 再実装しない |
| [AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md](AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md) | 完了 | 再実装しない |
| [AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md](AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md) | 完了 | 再実装しない |
| [AI_QUALITY_IMPROVEMENT_PHASE2_REMAINING_PLAN.md](AI_QUALITY_IMPROVEMENT_PHASE2_REMAINING_PLAN.md) | 完了（フォールバック適用） | 6ゲート未達の根本対応は RAG 側で扱う |
| [SECURITY_HOTFIX_PLAN.md](SECURITY_HOTFIX_PLAN.md) | 完了 | 再実装しない。ただし security gate は維持 |
| [LLM_COST_CONTROL_PLAN.md](LLM_COST_CONTROL_PLAN.md) | 完了 | 再実装しない |
| [ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md](ES_REVIEW_QUALITY_IMPROVEMENT_PLAN.md) | 完了 | 新規安全改善は ES roadmap 側で扱う |
| [MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md](MOTIVATION_QUALITY_IMPROVEMENT_PLAN.md) | 完了 | 再実装しない |
| [GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md](GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md) | 完了 | 再実装しない |
| [INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md](INTERVIEW_QUALITY_IMPROVEMENT_PLAN.md) | Phase 3 完了 | 再実装しない。残差分は TRACKER で確認 |
| [HARNESS_IMPROVEMENT_PLAN.md](HARNESS_IMPROVEMENT_PLAN.md) | 完了 | 再実装しない |
| [LP_IMPROVEMENT_PLAN.md](LP_IMPROVEMENT_PLAN.md) | 完了 | 再実装しない |
| [CLEAN_ARCHITECTURE_REFACTORING.md](CLEAN_ARCHITECTURE_REFACTORING.md) | superseded | `MAINTAINABILITY_IMPROVEMENT_PLAN.md` を正本にする |

### 1.2 未完了・実装対象の計画

| 優先 | 計画書 | 現状態 | 次にやること |
|---:|---|---|---|
| 1 | [RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md](RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md) | P0-1検証完了、P0-3/P2残件あり | Contextual Retrieval dual-write 健全性修正、評価、P0-3 dashboard |
| 2 | [ES_REVIEW_ROADMAP_IMPROVEMENT_PLAN.md](ES_REVIEW_ROADMAP_IMPROVEMENT_PLAN.md) | planned | P0 の安全性、課金、RAG信頼境界、誤反映防止 |
| 3 | [MAINTAINABILITY_IMPROVEMENT_PLAN.md](MAINTAINABILITY_IMPROVEMENT_PLAN.md) | M系 + CA-0 完了、CA-1着手 | CA-1 motivation pilot 継続 |
| 4 | [DB_REDESIGN_PLAN.md](DB_REDESIGN_PLAN.md) | 未着手 | DB-4/DB-1/DB-2/DB-8準備を先行。DB-5〜DB-7は最後 |

---

## 2. 次の推奨順序

### Step 0: Preflight

各セッション開始時に必ず行う。

```bash
git status --short
bash scripts/test-review-tracker.sh
```

確認すること:

- 既存 dirty worktree の範囲を把握し、無関係な変更を戻さない。
- 対象計画が `docs/review/TRACKER.md` に載っていることを確認する。
- secrets 実ファイルは読まない。必要な場合は `scripts/release/sync-career-compass-secrets.sh --check` のみ使う。

### Step 1: RAG default-on 判断の前提を固める

**担当**: `rag-engineer`
**正本**: [RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md](RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md)

最初にやること:

1. `CONTEXTUAL_RETRIEVAL_DUAL_WRITE=true` の ingest 経路をテストで固定する。
2. `valid_contextual_docs` 周辺の未定義参照や ctx collection 書き込み失敗を修正する。
3. 同一 golden set で `CONTEXTUAL_RETRIEVAL_ENABLED=false/true` の before/after を比較する。
4. P0-3 closeout として `docs/ops/OBSERVABILITY.md` と `docs/ops/grafana/rag-dashboard.json` を作る。

進めてよい並列作業:

- P0-3 docs / Grafana dashboard 作成。
- Reference ES ingest CLI / eval set の設計・実装。
- Contextual Retrieval 評価 runner 整備。

禁止:

- eval gate 前に `CONTEXTUAL_RETRIEVAL_ENABLED` を default-on にしない。
- Reference ES の eval / 漏洩テスト前に `REFERENCE_ES_RAG_ENABLED` を default-on にしない。

Gate:

```bash
pytest backend/tests/rag_eval -q
python backend/evals/rag/evaluate_retrieval.py --input backend/evals/rag/golden/company_info_v1.jsonl --top-k 5
```

default-on 判断基準:

- `nDCG@5(src)` baseline から -2% 以内。
- `MRR(src)` baseline から -3% 以内。
- `Hit@5(src)` baseline から -2% 以内。
- Contextual Retrieval は `nDCG@10 +5pt`、多文書企業 subset `Recall@10 +10pp`、ingest p95 `+200ms` 以内、検索 p95 不変を目安にする。

### Step 2: ES Review P0 を安全ゲートとして実装する

**担当**: `security-auditor` 起点、実装は `fastapi-developer` / `nextjs-developer` / `ui-designer`
**正本**: [ES_REVIEW_ROADMAP_IMPROVEMENT_PLAN.md](ES_REVIEW_ROADMAP_IMPROVEMENT_PLAN.md)

P0 は以下の順で進める。

1. サーバ側入力バリデーションを正本化する。
2. RAG 信頼境界をサーバ側へ寄せる。
3. テンプレート別の業界・職種必須条件にする。
4. キャンセルと成功時のみ消費を固定する。
5. 誤反映防止を生成時スナップショットで守る。
6. 合否誤認を避ける品質表示へ変更する。

特に守ること:

- `complete` 未受信、HTTP 非2xx、FastAPI `error`、ブラウザ切断、`onComplete` 失敗、malformed result payload は予約 cancel。
- `confirmReservation` は valid `complete` event と valid result payload の後だけ到達可能にする。
- ブラウザ由来の `hasCompanyRag` は実行判断に使わない。
- `user_provided_corporate_urls` は所有権検証済み company row から再構成する。

Gate:

```bash
npm run test:unit -- src/lib/fastapi/sse-proxy.test.ts
npm run test:unit -- src/hooks/es-review/transport.test.ts
npm run test:unit -- src/app/api/documents/_services/handle-review-stream.test.ts
pytest backend/tests/es_review -k "validation or rag or company_rag or cancel or stream" -v
```

UI を触った場合:

```bash
npm run lint:ui:guardrails
npm run test:ui:review -- <ES editor route>
```

P0 完了後にだけ P1 の SSE 契約、出典カテゴリ、prompt / rubric 構造化へ進む。

### Step 3: CA-1 motivation pilot を完了させる

**担当**: `architect` 起点、実装は `fastapi-developer` / `nextjs-developer`
**正本**: [MAINTAINABILITY_IMPROVEMENT_PLAN.md](MAINTAINABILITY_IMPROVEMENT_PLAN.md)

CA 系は基本直列。CA-1 内だけ限定並列を許可する。

CA-1A backend:

- `backend/app/services/motivation/` を stream だけでなく next-question / draft / profile-draft use case へ広げる。
- `stream_service.py` から router private 関数依存を減らす。
- `backend/app/routers/motivation.py` を 200 行以下にする。

CA-1B BFF:

- `src/app/api/motivation/**` の identity / owner / FastAPI proxy / billing 寄り処理を `src/bff/motivation/` と `src/bff/identity/` へ段階移動する。
- `src/shared/` に request-context 依存の auth / billing policy を置かない。

CA-1C frontend feature:

- `src/features/motivation/` を作る。
- まず hook / application / domain から移し、UI component の一括移動は最後にする。

CA-1 closeout gate:

- `backend/app/routers/motivation.py` 200 行以下。
- `src/features/motivation/` と `src/bff/motivation/` が存在。
- `features/*` から `bff/*` へ直接 import しない。
- CA-0 契約テスト、motivation unit、targeted pytest、motivation Playwright guest / logged-in / draft success / draft failure が PASS。

CA-1 が完了するまで CA-2 に進まない。

### Step 4: DB 低リスク作業だけ先行する

**担当**: `database-engineer`
**正本**: [DB_REDESIGN_PLAN.md](DB_REDESIGN_PLAN.md)

先行してよい順序:

1. DB-4: gakuchika 二重 `JSON.stringify` 修正。ただし既存 stringified data の読み取り互換を先に確認する。
2. DB-1 → DB-2: Drizzle relations 追加と schema merge。owner 境界 (`userId` / `guestId`) を FK 実体と照合する。
3. DB-8: deadline-loaders 最適化の旧新結果比較テストとクエリ形を固める。
4. DB-3: DB-8 の EXPLAIN 結果を見て、必要な index だけ追加する。

並列可:

- DB-1 relations 作成と DB-4 調査・テスト追加。
- DB-8 の旧新結果比較テストと DB-3 の index 必要性調査。
- DB-5〜DB-7 の read/write 箇所棚卸しと検証 SQL 作成。

禁止:

- `schema.ts` 変更と migration 手編集の並列実行。
- text→jsonb migration と app read/write 変更の大きな一括 PR。
- 同じテーブルを触る `notifications.data` と `notificationSettings.*` の同時変更。

Gate:

```bash
npm run build
npm run test:unit
```

DB-5〜DB-7 は最後に別スプリントで行う。安全な順序は、互換読み取り追加 → migration → fallback 削除。

---

## 3. 並列セッション起動表

「`docs/plan` を実行して」と依頼されたら、次の単位でセッションを分ける。

| Session | Agent | Scope | 触ってよい範囲 | 完了条件 |
|---|---|---|---|---|
| A | `rag-engineer` | RAG dual-write / eval | `backend/app/rag/**`, `backend/evals/rag/**`, `backend/tests/rag_eval/**`, RAG docs | RAG eval gate PASS、default-on 判断記録 |
| B | `security-auditor` | ES P0設計・レビュー | ES review P0 security / billing / RAG boundary | 成功時のみ消費、RAG偽装不可、cancel gate PASS |
| C | `fastapi-developer` | CA-1 backend | `backend/app/services/motivation/**`, `backend/app/routers/motivation.py` | router 200行以下、service逆依存解消 |
| D | `nextjs-developer` | CA-1 frontend/BFF | `src/features/motivation/**`, `src/bff/motivation/**`, motivation API route | motivation unit / Playwright gate PASS |
| E | `database-engineer` | DB低リスク | DB-4/DB-1/DB-2/DB-8調査 | build/unit PASS、migrationなし or SQL review済み |
| F | `ui-designer` | ES P0 UI | ES review UI表示、cancel/stale/score wording | UI guardrails + UI review PASS |

同時に開いてよい組み合わせ:

- A + C + D + E は原則並列可。ただし同じファイルを触る場合は止める。
- B は ES P0 の gate 定義・レビューを先に行い、実装 worker に範囲を渡す。
- F は ES P0 の UI task だけ。RAG / CA / DB には触らない。

同時に開かない組み合わせ:

- CA-2 と CA-1。
- DB-5〜DB-7 と他の `schema.ts` / migration 作業。
- ES prompt/rubric 改善と ES P0 safety 修正。
- RAG default-on 切替と RAG eval 基盤修正。

---

## 4. 横断ゲート

### 4.1 共通の静的確認

```bash
npx tsc --noEmit
npm run lint
bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical
```

### 4.2 E2E / AI Live

機能実装完了後は staged files を基準に E2E scope を判定する。`resolveE2EFunctionalScope()` の結果で対象 feature が出た場合は、該当 feature の E2E Functional を実行する。

代表コマンド:

```bash
make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=<features>
```

### 4.3 Code Review

以下のいずれかに該当する場合は commit 前に code review を行う。

- 変更ファイル数 10 以上。
- 追加 + 削除 500 行以上。
- hotspot ファイルを含む。
- セキュリティ、課金、RAG tenant boundary、prompt を触る。

### 4.4 Docs closeout

各 track が完了したら以下を更新する。

- 対象 plan の status / checkbox / 実行記録。
- [docs/review/TRACKER.md](../review/TRACKER.md) の status と notes。
- 必要な場合のみ `AGENTS.md` / `CLAUDE.md` / `ARCHITECTURE.md`。途中 PR で過剰更新しない。

---

## 5. 完了条件

`docs/plan` 全体を完了状態にする条件は以下。

- RAG: P0-3 closeout、Reference ES eval、Contextual Retrieval default-on 判断が完了し、`RAG_ARCHITECTURE_IMPROVEMENT_PLAN.md` と TRACKER が更新済み。
- ES roadmap: P0 safety 完了、P1/P2 を実装するか次期計画として明示分離し、`ES_REVIEW_ROADMAP_IMPROVEMENT_PLAN.md` と TRACKER が更新済み。
- Maintainability: CA-1〜CA-5 完了、全体 lint / docs 同期 / 旧残骸削除まで完了。
- DB: DB-1〜DB-8 完了。DB-5〜DB-7 は staging migration、rollback SQL、smoke、TRACKER 更新まで完了。
- superseded 計画: `CLEAN_ARCHITECTURE_REFACTORING.md` は superseded のまま維持し、完了対象に数えない。

---

## 6. 新しい Phase の追加

新しい計画を追加する場合:

1. `docs/plan/*_PLAN.md` を作成する。
2. [docs/review/TRACKER.md](../review/TRACKER.md) に行を追加する。
3. この文書の「未完了・実装対象の計画」または「完了済み・再実装しない計画」に分類する。
4. `bash scripts/test-review-tracker.sh` を実行する。
