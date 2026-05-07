# テスト・品質ゲート改善計画

作成日: 2026-05-05 JST

## 1. 目的

就活Pass のテスト・品質ゲートシステムを包括的に監査し、3 つの課題を解決する改善タスクを体系化する。

1. **カバレッジの抜け穴** — 未テスト領域の可視化と優先的な拡充
2. **ゲートの過剰ブロック** — 偽陽性の排除と段階的ゲートアーキテクチャの導入
3. **全体像の不明確さ** — テスト戦略の体系化とカバレッジ可視化基盤の構築

ユーザー確認済みの方針:

- P0 はカバレッジ拡大とゲートアーキテクチャ再設計の 2 領域。
- LLM Judge 安定化は P1（Python + TypeScript 両方を対象）。
- 計画書は戦略レベル + 戦術レベルの両方を含む。
- 本タスクの完了条件は計画書作成であり、コード実装は行わない。
- 2026-05-05 実装フェーズ追記: 本番前の #15 P0 実装では、Coverage 基盤と BFF 課金境界テストを完了し、Gate P0 は Shadow/Advisory utility までに留める。既存 blocking gate は弱めない。

## 2. 調査範囲

以下のサブエージェントと調査観点で網羅的に監査した。

- `Explore (test infrastructure)`: E2E テストシステム（14 feature, 3-layer model）、Vitest/pytest 構成、LLM Judge 実装、テストユーティリティ、マニフェストシステム
- `Explore (quality gates)`: 25 hook スクリプト、diff-snapshot チェックポイント、CI/CD ワークフロー、Codex post_review、lint/静的解析
- `Explore (existing plans)`: 既存 10 計画書のフォーマット、Makefile 70+ テストターゲット、package.json 56 テストスクリプト
- `Plan (coverage strategy)`: カバレッジギャップ分析フレームワーク、Frontend/Backend 拡充計画、E2E ジャーニーマッピング
- `Plan (gate architecture)`: LLM Judge 安定化、ゲート合理化、段階的ゲート設計、監視基盤
- `Plan (LLM Judge analysis)`: 根本原因 6 件の深掘り、安定化技術の優先順位付け、閾値再設計
- `Codex plan_review`: 5 件の指摘（Medium 3, Low 2）+ リスク 3 件を反映

## 3. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/test-quality-gate-plan.md` が存在する。
2. カバレッジ・ゲート・LLM Judge の 3 領域にわたる課題分析、設計方針、タスク一覧が記録されている。
3. `Task Board` は `Status / Priority / Area / Task / Evidence / Acceptance Criteria / Updated At` を持つ Markdown table で管理されている。
4. 実装フェーズで Status を更新するルールが明記されている。
5. P0 タスクは、後続実装者が追加判断なしで着手できる粒度になっている。

2026-05-05 の実装フェーズ完了条件は次のとおり。

1. `docs/plan/test-quality-gate-tasks.json` を SSOT として P0 実装タスク状態を管理できる。
2. `make test-coverage` が Vitest coverage (text/json/html) を生成して pass する。
3. `make backend-test-coverage` が決定的 backend tests の coverage (term/html/json) を生成して pass する。
4. BFF 課金境界テストが ES Review / Motivation / Company Fetch / LLM cost guard をカバーする。
5. Gate 改善は Shadow/Advisory utility としてテストされ、既存 blocking gate の条件変更は行わない。

## 4. タスク状態更新ルール

実装フェーズでは、完了条件を満たすまで次のループを続ける。

1. `Task Board` から `Todo` の最上位 Priority を 1 件選ぶ。
2. 着手時に `Status` を `Doing` へ変え、作業内容を記録する。
3. 実装または検証でブロックしたら `Blocked` にし、必要な判断を明記する。
4. 受け入れ条件を満たしたら `Review` にし、実行したテストと差分確認結果を書く。
5. レビュー後に `Done` へ変える。
6. `Todo / Doing / Blocked / Review` が残る場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `Doing`: 実装中
- `Blocked`: 判断待ちまたは環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

実装フェーズの状態管理 SSOT は `docs/plan/test-quality-gate-tasks.json` とし、更新は次のコマンドで行う。

```bash
node scripts/plan/update-test-quality-task-status.mjs --id F1 --status Doing --notes "作業メモ"
```

---

## 5. 現状評価

### 5.1 カバレッジ実態

#### Frontend (Next.js / Vitest)

| 領域 | ソースファイル | テストファイル | カバレッジ率 | 主な未テスト |
|---|---|---|---|---|
| `src/app/api/` (API routes) | 107 | 52 | 48.6% | cron/*, calendar/*, gakuchika/*/stream, documents/*/review/stream |
| `src/bff/` (BFF 境界層) | 35 | 6 | 17.1% | billing/es-review-stream-policy, billing/motivation-stream-policy, billing/company-fetch-policy, identity/llm-cost-guard |
| `src/hooks/` | 29 | 14 | 48.3% | useESReview, useDocuments, useNotifications, useDeadlines, useTasks 等 15 件 |
| `src/components/` | 202 | 70 | 34.7% | ダッシュボード系、チャット系 |
| `src/features/` | 38 | 6 | 15.8% | company-info controllers, client-api |
| `src/lib/` | 169 | 105 | 62.1% | — |
| **Frontend 合計** | **~670** | **279** | **41.6%** | — |

**重大な構造問題**: `vitest.config.ts` に coverage 設定が存在しない。`@vitest/coverage-v8` 未導入、閾値未設定、CI レポートなし。カバレッジの現状を数値で把握する手段がない。

#### Backend (FastAPI / pytest)

| 領域 | テストファイル数 | CI 実行数 | CI カバレッジ率 | 備考 |
|---|---|---|---|---|
| es_review | 13 | 部分的 | — | integration + live gate |
| gakuchika | 15 | 部分的 | — | golden set + live |
| motivation | 14+ | 部分的 | — | contract + live |
| interview | 14+ | 部分的 | — | calibration + live |
| company_info | 19 | 部分的 | — | search + RAG + schedule |
| shared | 22+ | 部分的 | — | principal, llm_client, rate_limiter |
| conversation | 9 | 部分的 | — | runner, judge, sampling |
| architecture | 4 | 未実行 | — | 境界テスト（CI 対象外） |
| contracts | 1 | 未実行 | — | BFF-FastAPI 契約（CI 対象外） |
| security | 1 | 未実行 | — | テナント分離（CI 対象外） |
| **合計** | **115** | **27** | **23.5%** | `run-backend-deterministic.sh` が絞り込み |

**重大な構造問題**: `pytest-cov` 未導入。CI deterministic テストが 115 中 27 ファイルのみ（23.5%）。architecture, contracts, security テストが CI 対象外。

#### E2E (Playwright)

| レイヤー | テストファイル | 対象 | ブロック力 |
|---|---|---|---|
| Functional (14 features) | 17 spec files | 機能スモーク | Hard block (pre-commit) |
| Live-smoke | 3 spec files | AI 会話品質 | Soft + opt-in Judge |
| Auth / Regression | 4 spec files | 認証・回帰 | CI blocking (main-promotion) |

**ギャップ**: クロスフィーチャージャーニーテストなし（企業登録 → 情報取得 → RAG → ES レビューの一連フロー）。Guest → authenticated 移行テストなし。

### 5.2 ゲート構造マップ

#### ゲート一覧（25 hook スクリプト）

```
Tier 0 (即時, パターン照合, 常時実行):
  secrets-guard.sh          — 機密ファイルアクセスをブロック
  destructive-rm-guard.sh   — rm -rf をブロック
  git-push-guard.sh         — push をユーザー確認で管理
  release-provider-guard.sh — deploy/release を管理

Tier 1 (高速, 決定的, 条件付きブロック):
  bandaid-guard.sh          — @ts-ignore, as any, console.log 等を検出
  tdd-enforcement-guard.sh  — テストファースト強制
  file-changed-lint.sh      — 設定ファイル変更時の lint (advisory)

Tier 2 (チェックポイント, 人間の判断を要求):
  commit-codex-gate.sh      — 大規模変更のレビューチェックポイント
  test-category-gate.sh     — テストカテゴリ選択の強制
  impl-start-codex-gate.sh  — 実装委譲判断の強制
  prompt-edit-confirm-guard.sh — プロンプト編集確認
  playwright-confirm-guard.sh  — Playwright 実行確認

Tier 3 (評価, 非決定的, 低速):
  LLM Judge (Python)        — 会話品質採点 (temperature=0.1)
  LLM Judge (TypeScript)    — 会話品質採点 (temperature=0.2)
  E2E Functional            — 14 feature のスモークテスト
  AI Live                   — 全 feature 品質テスト

ライフサイクル (非ブロッキング):
  session-orientation.sh, user-prompt-submit-router.sh
  post-edit-dispatcher.sh, stop-summary.sh, session-end-cleanup.sh
  subagent-start-log.sh, post-tool-failure-triage.sh
  permission-request-guard.sh, ui-preflight-reminder.sh
  stop-plaintext-confirm-guard.sh, exit-plan-codex-gate.sh
```

#### カスケーディング・ブロック問題

現在の `pre-tool-dispatcher.sh` は Edit/Write に対してガードを**逐次実行**する。1 つ目のガードを解決しても次のガードがブロックするため、最悪のケースでは 1 回の Edit に対して 4 回のブロック → 確認サイクルが発生する。

```
Edit/Write 操作
  ├─ impl-start-codex-gate (BLOCK → AskUserQuestion → 委譲判断)
  ├─ prompt-edit-confirm-guard (BLOCK → AskUserQuestion → 承認)
  ├─ bandaid-guard (BLOCK → AskUserQuestion → 承認)
  └─ tdd-enforcement-guard (BLOCK → AskUserQuestion → テスト作成)
```

#### チェックポイント一括無効化問題

`diff-snapshot.mjs` の verify コマンドは `HEAD SHA + staged diff` の SHA256 ハッシュを再計算する。追加のファイルを staging すると、全ての既存チェックポイント（commit-codex-gate, test-category-gate 等）が一括で無効化される。チェックポイント作成 → 軽微な修正 → 再 staging → 全チェックポイント再作成が必要。

### 5.3 LLM Judge 根本原因分析

#### 不安定性の 6 つの根本原因

| # | 原因 | 影響度 | ファイル |
|---|---|---|---|
| 1 | `temperature=0.1` + `seed` パラメータ未使用 | 最大 | `llm_judge.py:372`, `llm.py` に seed パラメータなし |
| 2 | `response_format="json_object"` — スキーマ強制なし | 高 | `llm_judge.py:375` — 軸欠落時に score=0 になる |
| 3 | ルーブリック 3/4 境界の曖昧さ | 高 | `llm_judge.py:53-232` — 「1 element slightly abstract」vs「1-2 elements abstract」 |
| 4 | キャリブレーション・アンカー不在 | 中 | `gakuchika_golden_set.py` は入力にのみ使用、judge プロンプトに未注入 |
| 5 | 二重閾値が分散を増幅 | 中 | `llm_judge.py:289-303` — `all≥3 AND avg≥3.5` で 5 軸中 1 軸が 2 なら即失敗 |
| 6 | トランスクリプト切り詰めによる情報損失 | 低 | `llm_judge.py:269-287` — 24000字/12000字の上限 |

**TypeScript 側の追加問題** (Codex レビューで発見):
- `src/lib/testing/live-ai-conversation-llm-judge.ts:114` — `temperature: 0.2`、`json_object` を直接 OpenAI API に送信
- Python 側のみ修正すると二重基準が残る

#### 閾値の統計的問題

5 軸で各軸が 10% の確率で境界ゾーン（2 or 3）に入ると仮定した場合:
- 少なくとも 1 軸が境界に入る確率: `1 - (1 - 0.10)^5 = 41%`
- 実際の偽陽性率はこれに `temperature` ノイズが加わり、さらに高い

---

## 6. 設計方針

### 6a. カバレッジ基盤（P0）

#### 6a-1. Coverage 計測基盤の導入

**Frontend**: `vitest.config.ts` に `@vitest/coverage-v8` を追加。初期閾値は現状ベースライン（計測後に設定）。HTML + JSON reporter で開発者がローカルで確認可能にする。

**Backend**: `pytest-cov` を `requirements.txt` に追加。`backend/pytest.ini` に `--cov=app --cov-report=term-missing --cov-report=json:coverage.json` を設定。

**Make ターゲット**: `make test-coverage`（frontend）と `make backend-test-coverage`（backend）を追加。

#### 6a-2. BFF テスト拡充戦略

BFF 層は owner 判定・課金境界・CSRF 検証・guest/user 排他を担う最重要テスト対象。テストマトリクスは以下を網羅する:

| テスト軸 | 検証項目 |
|---|---|
| 成功時のみ消費 | credit reservation → LLM 成功 → confirm / LLM 失敗 → cancel |
| guest/user dual path | userId のみ、guestId のみ、両方欠損のケース |
| CSRF 検証 | mutation に CSRF トークン必須 |
| owner 検証 | 他ユーザーのリソースへのアクセス拒否 |
| guest_device_token | cookie から正しく解決されること |

優先テスト対象（`gakuchika-stream-policy.test.ts` のパターンを踏襲）:

1. `src/bff/billing/es-review-stream-policy.ts` — ES レビューのクレジット消費
2. `src/bff/billing/motivation-stream-policy.ts` — 志望動機のクレジット消費
3. `src/bff/billing/company-fetch-policy.ts` — 企業情報取得のクレジット消費
4. `src/bff/identity/llm-cost-guard.ts` — LLM コスト上限ガード

### 6b. 段階的ゲートアーキテクチャ（P0）

#### 6b-1. 変更パス分類

全ての変更を 4 つのパスに自動分類する。分類ロジックは `command-classifier.mjs` を SSOT とし、`pre-tool-dispatcher.sh` が参照する。

| パス | 条件 | 適用ゲート |
|---|---|---|
| **FAST_PATH** | 全ファイルが `*.md`, `*.txt`, `*.json`, `*.yml`, `*.yaml`, `*.css`, `*.svg` かつ `.claude/`, `.codex/`, `.github/`, `scripts/harness/` を含まない | Tier 0 のみ。TDD/bandaid スキップ |
| **INFRA_PATH** | `.claude/hooks/`, `.codex/hooks/`, `.github/workflows/`, `scripts/harness/`, `scripts/codex/` の変更を含む | Tier 0 + Tier 1。ゲート自体の変更は通常パスより慎重に扱う |
| **STANDARD_PATH** | 通常のコード変更。ファイル数 < 10 かつ行数 < 500 かつ hotspot なし | Tier 0 + Tier 1。TDD + bandaid 有効 |
| **EXTENDED_PATH** | ファイル数 >= 10 OR 行数 >= 500 OR hotspot ファイルを含む | Tier 0 + Tier 1 + Tier 2。フルチェックポイント |

**hotspot ファイル** (SSOT: `skill-recommender.sh`):
- `backend/app/routers/company_info.py`, `backend/app/routers/es_review.py`
- `backend/app/utils/llm.py`
- `src/components/es/ReviewPanel.tsx`, `src/hooks/useESReview.ts`
- `src/components/companies/CorporateInfoSection.tsx`
- `src/lib/server/app-loaders.ts`

#### 6b-2. カスケーディング・ブロックの解消

`pre-tool-dispatcher.sh` を改修し、ガード失敗を**一括集約**して 1 つのメッセージで提示する。

```
改善前: Edit → BLOCK1 → 解決 → Edit → BLOCK2 → 解決 → Edit → BLOCK3
改善後: Edit → [BLOCK1, BLOCK2, BLOCK3] を一括提示 → 全て解決 → Edit 成功
```

#### 6b-3. チェックポイント一括検証

`diff-snapshot.mjs` に batch verify コマンドを追加。セッション内の全アクティブ・チェックポイントを 1 回のハッシュ計算で検証し、無効化されたものを一覧で報告。個別ガードが独立して verify を呼ぶ現状の重複計算を排除。

#### 6b-4. ゲート配線の一体設計（Codex レビュー指摘反映）

以下の 5 ファイルを一体で設計する。`pre-tool-dispatcher.sh` 単体の改修では不十分。

1. `scripts/harness/command-classifier.mjs` — 変更パス分類ロジック（SSOT）
2. `scripts/harness/diff-snapshot.mjs` — batch verify + checkpoint schema
3. `.claude/hooks/pre-tool-dispatcher.sh` — 分類結果に基づくガード選択 + 一括集約
4. `.claude/hooks/test-category-gate.sh` — パス別テストカテゴリ要件
5. `.githooks/pre-commit` — 最終 enforcement（enforce-local-ai-e2e + security scan）

### 6c. LLM Judge 安定化（P1）

4 段階の改善を Python + TypeScript の両方に適用する。

#### Phase A: 決定的基盤（最大効果・ゼロ追加コスト）

1. **temperature=0.0 + seed パラメータ**: `call_llm_with_error()` に `seed: int | None = None` を追加。provider routing で OpenAI API に seed を透過。Claude/Gemini provider では無視（エラーにしない）。Judge 呼び出しを `temperature=0.0, seed=42` に変更。
2. **json_schema 強制**: `calibration_judge.py` のパターン（`response_format="json_schema"` + strict schema）を conversation judge に適用。軸欠落によるスコア 0 を構造的に排除。

対象ファイル:
- `backend/app/utils/llm.py` — seed パラメータ追加（provider routing 対応確認が必要）
- `backend/tests/conversation/llm_judge.py` — temperature, response_format, schema 定義
- `src/lib/testing/live-ai-conversation-llm-judge.ts` — 同等の変更

#### Phase B: ルーブリック改善（高効果・低コスト）

3. **境界基準の具体化**: 3/4 境界を機械的に判定可能な基準に書き換える（例: `star_completeness` の 3→4 を「result に数値的な成果が含まれている」に変更）。
4. **キャリブレーション・アンカー注入**: `gakuchika_golden_set.py` から代表例を 2 つ選び、judge system prompt の末尾に「スコア 3 の例」「スコア 4 の例」として埋め込む。追加トークン: ~500-800/call。

#### Phase C: 信頼区間ベース判定（中効果・低コスト）

5. **ボーダーライン再評価**: 初回判定で境界ゾーン（任意の軸が 2-3 or 平均 3.0-3.8）の場合のみ追加 2 回実行し、中央値を採用。非境界ケースは追加コストゼロ。
6. **既存インフラ活用**: `judge_sampling.py::run_judge_pointwise_n()` を CI パスに接続。CI 集計責務は新規モジュール `judge_ci_aggregator.py` に分離（`judge_sampling.py` は 545 行のため 500 行超回避）。

#### Phase D: 軸別閾値（中効果・ゼロコスト）

7. **Hard 軸 / Soft 軸の分離**:
   - Hard 軸（事実検証可能）: `user_fact_preservation`, `star_completeness`, `logical_flow` → min 3
   - Soft 軸（主観的、高分散）: `naturalness`, `question_depth` → min 2
   - 加重平均閾値: hard 軸 x1.2, soft 軸 x0.8 で重み付け

### 6d. カバレッジ可視化システム（P2）

1. **ローカル可視化**: `make test-coverage` で HTML レポート生成（`coverage/` gitignored）
2. **CI delta reporting**: PR コメントにカバレッジ差分を表示
3. **Coverage drift detection**: 変更したファイルのカバレッジが 30% 未満の場合に warning
4. **Coverage map**: `scripts/metrics/generate-coverage-map.mjs` で自動生成する `docs/metrics/COVERAGE_MAP.md`

---

## 7. Task Board

### 7.1 P0: カバレッジ基盤整備

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Done | P0 | Infra | F1: `@vitest/coverage-v8` 導入 + `vitest.config.ts` に coverage 設定追加 | `make test-coverage` pass: 290 files / 1297 tests。text/json/html coverage 生成 | `npx vitest run --coverage` が JSON + HTML レポートを生成する。初期閾値はベースライン計測後に設定 | 2026-05-05 |
| Done | P0 | Infra | B1: `pytest-cov` 導入 + `backend/pytest.ini` に coverage 設定追加 | `make backend-test-coverage` pass: 1477 passed, 42 deselected。term/html/json coverage 生成 | 決定的 backend tests が coverage レポートを出力する | 2026-05-05 |
| Done | P0 | Infra | V1: `make test-coverage` / `make backend-test-coverage` ターゲット追加 | `Makefile` に両ターゲット追加。coverage 生成物は `.gitignore` 済み | 両ターゲットが HTML レポートを `coverage/` / `backend/htmlcov/` に生成する | 2026-05-05 |
| Done | P0 | Frontend | F2-1: BFF `es-review-stream-policy.ts` テスト作成 | `npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts` pass | credit reservation の confirm/cancel、guest/user 境界、不足時 402 をカバー | 2026-05-05 |
| Done | P0 | Frontend | F2-2: BFF `motivation-stream-policy.ts` テスト作成 | `npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts` pass | 成功時のみ consumeCredits し、非 billable / failure では消費しないことをカバー | 2026-05-05 |
| Done | P0 | Frontend | F2-3: BFF `company-fetch-policy.ts` テスト作成 | `npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts` pass | free quota reservation と credit reservation の precheck/reserve/confirm/cancel をカバー | 2026-05-05 |
| Done | P0 | Frontend | F2-4: BFF `llm-cost-guard.ts` テスト作成 | `npx vitest run src/bff/billing/ src/bff/identity/llm-cost-guard.test.ts` pass | ガード発動、パススルー、guest/user plan、Retry-After header をカバー | 2026-05-05 |

### 7.2 P0: ゲートアーキテクチャ再設計

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Done | P0 | Gate | G1: 変更パス分類ロジックを `command-classifier.mjs` に Shadow/Advisory utility として実装 | `node --test scripts/harness/command-classifier.test.mjs scripts/harness/diff-snapshot.test.mjs` pass | `classify-change-path` CLI が FAST/INFRA/STANDARD/EXTENDED を返す。既存 blocking gate は変更しない | 2026-05-05 |
| Blocked | P1 | Gate | G2: `pre-tool-dispatcher.sh` にパス分類連携 + ガード一括集約を実装 | 本番前は blocking gate を弱めない方針で合意 | Shadow データ収集後、post-release で blocking 経路への接続可否を判断する | 2026-05-05 |
| Done | P0 | Gate | G3: `diff-snapshot.mjs` に batch verify コマンド追加 | `node --test scripts/harness/command-classifier.test.mjs scripts/harness/diff-snapshot.test.mjs` pass | `diff-snapshot.mjs batch-verify --file ...` が複数 checkpoint を一括検証し、無効化リストを JSON で報告する | 2026-05-05 |
| Blocked | P1 | Gate | G4: `test-category-gate.sh` をパス分類対応に改修 | 本番前は test-category hard block 条件を変更しない方針で合意 | Shadow データ収集後、FAST/STANDARD/EXTENDED 別の要件を再評価する | 2026-05-05 |
| Blocked | P1 | Gate | G5: `bandaid-guard.sh` を FAST_PATH で advisory 化 + テストファイルで緩和 | 本番前は bandaid hard block 条件を変更しない方針で合意 | Shadow データ収集後、advisory 化の false positive 実績を見て判断する | 2026-05-05 |

### 7.3 P1: LLM Judge 安定化

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | Judge | J1: `call_llm_with_error()` に `seed` パラメータ追加 + provider routing 対応確認 | `llm.py` に seed パラメータなし | `seed: int \| None = None` を追加。OpenAI provider で API に透過。Claude/Gemini provider では無視（エラーにしない） | 2026-05-05 |
| Todo | P1 | Judge | J2: Python Judge — `temperature=0.0` + `seed=42` + `json_schema` 強制 | `llm_judge.py:372` — temperature=0.1, response_format="json_object" | `temperature=0.0, seed=42, response_format="json_schema"` に変更。`_judge_output_schema(axes)` 関数で strict schema 定義。`calibration_judge.py` パターン踏襲 | 2026-05-05 |
| Todo | P1 | Judge | J3: TypeScript Judge — 同等の安定化（temperature=0.0, structured output） | `live-ai-conversation-llm-judge.ts:114` — temperature=0.2, json_object | Python 側と同一の temperature, response_format, schema を適用 | 2026-05-05 |
| Todo | P1 | Judge | J4: ルーブリック 3/4 境界の具体化 | 3/4 境界が主観的記述 | 全 5 軸 x 3 feature の 3/4 境界を、数値・具体例ベースの機械的基準に書き換え | 2026-05-05 |
| Todo | P1 | Judge | J5: キャリブレーション・アンカーを judge system prompt に注入 | golden set は judge に見せていない | `gakuchika_golden_set.py` から代表 2 例を system prompt 末尾に追加。「スコア 3 の例」「スコア 4 の例」を明示 | 2026-05-05 |
| Todo | P1 | Judge | J6: Hard 軸 / Soft 軸の分離 + 軸別閾値 | 全軸一律 `min_score=3` | Hard 軸（fact_preservation, star_completeness, logical_flow）: min 3。Soft 軸（naturalness, question_depth）: min 2。加重平均で overall 判定 | 2026-05-05 |
| Todo | P1 | Judge | J7: ボーダーライン再評価ロジック（N-sample CI 接続） | `judge_sampling.py` の N-sample は手動評価のみ使用 | 初回判定が境界ゾーンの場合のみ追加 2 回実行し中央値採用。CI 集計は新規 `judge_ci_aggregator.py` に分離（`judge_sampling.py` 500 行超回避） | 2026-05-05 |

### 7.4 P1: CI テスト拡張 + API ルートテスト

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | Backend | B2: `run-backend-deterministic.sh` 対象を 27 → 42+ に拡大 | CI が 115 中 27 ファイルのみ実行 | 追加対象: architecture (4), contracts (1), security (1), interview-deterministic (1), prompt shapes (3), shared utilities (5)。選定基準: 外部 API 不要 + 実行 30 秒以内 + flake history なし | 2026-05-05 |
| Todo | P1 | Backend | B3: RAG 検索品質の回帰検知閾値導入 | MRR@5, NDCG@5 の自動閾値監視なし | `backend/tests/rag_eval/baselines/` にベースライン JSON を格納。CI で 5% 以上の低下を検出したら失敗 | 2026-05-05 |
| Todo | P1 | Frontend | F3-1: Revenue-critical API ルートテスト — `documents/[id]/review/stream` | ES レビューストリームのテストなし | SSE イベント、エラーレスポンス、認証チェックをカバー | 2026-05-05 |
| Todo | P1 | Frontend | F3-2: Revenue-critical API ルートテスト — `cron/daily-notifications`, `cron/calendar-sync`, `cron/hourly-daily-summary` | cron ルート 3 件テストなし | 各 cron の実行条件、エラーハンドリング、冪等性をカバー | 2026-05-05 |
| Todo | P1 | Frontend | F3-3: Data-integrity API ルートテスト — `deadlines/*`, `notifications/*`, `tasks/[id]` | deadlines 3 件、notifications 4 件、tasks 1 件テストなし | CRUD 操作、owner 検証、guest/user 両パスをカバー | 2026-05-05 |
| Todo | P1 | Frontend | F4-1: Hook テスト — `useESReview`, `useDocuments`, `useNotifications` | 15 hooks テストなし（blast radius 上位 3 件） | SWR mock パターンで状態遷移と mutation をカバー | 2026-05-05 |
| Todo | P1 | Frontend | F4-2: Hook テスト — `useDeadlines`, `useDeadlinesDashboard`, `useTasks`, `useCalendar` | blast radius 中位 | 同上 | 2026-05-05 |

### 7.5 P2: カバレッジ可視化 + E2E + 監視

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Todo | P2 | Visibility | V2: CI coverage delta reporting（PR コメント） | カバレッジ差分の可視化なし | PR に coverage delta を自動コメント。JSON summary を Actions artifact に保存 | 2026-05-05 |
| Todo | P2 | Visibility | V3: Coverage drift detection | 変更ファイルのカバレッジが低くても警告なし | 変更ファイルのカバレッジ < 30% で warning。30 日後に blocker 化の閾値を評価 | 2026-05-05 |
| Todo | P2 | Visibility | V4: Coverage map 自動生成 | カバレッジの全体像が一目でわからない | `scripts/metrics/generate-coverage-map.mjs` が `docs/metrics/COVERAGE_MAP.md` を生成。Area 別のテスト率テーブル | 2026-05-05 |
| Todo | P2 | E2E | E1: Cross-feature journey テスト | 各 E2E feature は独立。データフロー連結テストなし | 企業登録 → 情報取得 → RAG ingest → ES レビューの一連フローを 1 spec でカバー | 2026-05-05 |
| Todo | P2 | E2E | E2: Guest → authenticated 移行ジャーニーテスト | ゲスト作成データの移行テストなし | ゲストでガクチカ完了 → サインアップ → データ永続性確認 | 2026-05-05 |
| Todo | P2 | E2E | E3: BFF → FastAPI principal header 準拠テスト | BFF の FastAPI 呼び出しに X-Career-Principal が含まれるか自動チェックなし | スクリプトが BFF ソースをスキャンし、全 FastAPI 呼び出しに principal header 付与を検証 | 2026-05-05 |
| Todo | P2 | Gate | G6: ゲート監視基盤 — JSONL ログ + 集計スクリプト | ゲートの block rate, false positive rate が不明 | 各ゲートが `gate-log-{date}.jsonl` に結果を記録（secrets/URL はサニタイズ）。`scripts/harness/gate-report.mjs` が週次レポートを生成 | 2026-05-05 |
| Todo | P2 | Gate | G7: ゲートの shadow mode 基盤 | 新規ゲートの影響を事前評価する手段なし | `GATE_SHADOW_MODE=1` で新規/修正ゲートが結果を記録するが exit 0 を返す。2 週間のデータ収集後に blocking 化判断 | 2026-05-05 |
| Todo | P2 | Frontend | F3-4: Feature 系 API ルートテスト — `gakuchika/*/stream`, `motivation/*/stream`, `interview/drill/*` | AI 会話系ストリームルートのテストなし | SSE イベント、タイムアウト、エラーレスポンスをカバー | 2026-05-05 |
| Todo | P2 | Frontend | F3-5: Calendar API ルートテスト (7 件) | calendar/ 配下全 7 ルートテストなし | Google Calendar OAuth フロー、同期、切断をカバー | 2026-05-05 |
| Todo | P2 | Frontend | F4-3: Hook テスト — 残り 8 件（useSearch, useApplications, usePins, useMediaQuery, useSubmissions, useStreamingTextPlayback, useCompanyDeadlines, useCompanySuggestions） | blast radius 下位 | 基本的な SWR パターンテスト | 2026-05-05 |
| Todo | P2 | Frontend | F5: Feature 層機能テスト（`src/features/`） | 38 ソース / 6 テスト (15.8%) | company-info controllers, client-api, pdf-upload のテスト作成 | 2026-05-05 |

---

## 8. 検証方法

### 8.1 カバレッジ基盤

```bash
# F1 完了後
make test-coverage
# JSON + HTML レポートが生成されること

# B1 完了後
make backend-test-coverage
# カバレッジレポートが出力されること
```

### 8.2 BFF テスト

```bash
npx vitest run src/bff/billing/
# es-review, motivation, company-fetch, llm-cost-guard の全テストが pass
```

### 8.3 ゲートアーキテクチャ

```bash
# G1: 分類ロジックのテスト
node scripts/harness/command-classifier.mjs --test

# G2: docs のみの変更で TDD/bandaid がスキップされること（手動確認）
# G5: テストファイル内の console.log がブロックされないこと（手動確認）
```

### 8.4 LLM Judge 安定化

```bash
# J2 完了後: 同一入力で 3 回実行し、全て同一スコアであること
cd backend && python -m pytest tests/conversation/test_conversation_runner.py -k "judge" --count 3

# J7 完了後: ボーダーラインケースで再評価が発動すること
```

### 8.5 CI テスト拡張

```bash
# B2 完了後
bash scripts/ci/run-backend-deterministic.sh
# 42+ テストファイルが実行され、全 pass
```

---

## 9. 未テスト API ルート全一覧（参考）

55 件の未テスト API ルート。Priority 列は Task Board のバッチに対応。

| Priority | Path | 機能領域 |
|---|---|---|
| P1 (F3-1) | `documents/[id]/review/stream` | ES レビュー SSE |
| P1 (F3-2) | `cron/daily-notifications` | 日次通知 |
| P1 (F3-2) | `cron/calendar-sync` | カレンダー同期 |
| P1 (F3-2) | `cron/hourly-daily-summary` | 日次サマリ |
| P1 (F3-3) | `deadlines` | 締切 CRUD |
| P1 (F3-3) | `deadlines/[id]/status` | 締切ステータス |
| P1 (F3-3) | `deadlines/export` | 締切エクスポート |
| P1 (F3-3) | `notifications/[id]` | 通知 CRUD |
| P1 (F3-3) | `notifications/[id]/read` | 既読 |
| P1 (F3-3) | `notifications/delete` | 削除 |
| P1 (F3-3) | `notifications/read-all` | 全既読 |
| P1 (F3-3) | `tasks/[id]` | タスク CRUD |
| P2 (F3-4) | `gakuchika/[id]` | ガクチカ詳細 |
| P2 (F3-4) | `gakuchika/[id]/conversation` | 会話取得 |
| P2 (F3-4) | `gakuchika/[id]/conversation/new` | 会話開始 |
| P2 (F3-4) | `gakuchika/[id]/conversation/stream` | 会話 SSE |
| P2 (F3-4) | `gakuchika/reorder` | 並び替え |
| P2 (F3-4) | `gakuchika/summaries` | サマリ一覧 |
| P2 (F3-4) | `motivation/[companyId]/conversation` | 志望動機会話 |
| P2 (F3-4) | `motivation/[companyId]/conversation/start` | 志望動機開始 |
| P2 (F3-4) | `motivation/[companyId]/conversation/stream` | 志望動機 SSE |
| P2 (F3-4) | `companies/[id]/interview/drill/start` | 面接ドリル開始 |
| P2 (F3-4) | `companies/[id]/interview/drill/score` | 面接ドリル採点 |
| P2 (F3-4) | `companies/[id]/interview/feedback/satisfaction` | 面接満足度 |
| P2 (F3-4) | `interview/dashboard` | 面接ダッシュボード |
| P2 (F3-5) | `calendar/calendars` | カレンダー一覧 |
| P2 (F3-5) | `calendar/connect` | カレンダー接続 |
| P2 (F3-5) | `calendar/connect/callback` | OAuth コールバック |
| P2 (F3-5) | `calendar/connection-status` | 接続状態 |
| P2 (F3-5) | `calendar/disconnect` | 切断 |
| P2 (F3-5) | `calendar/events/[id]` | イベント詳細 |
| P2 (F3-5) | `calendar/google` | Google 連携 |
| P2 (F3-5) | `calendar/sync-retry` | 同期リトライ |
| P2 | `activation` | アクティベーション |
| P2 | `applications/[id]/job-types` | 職種タイプ |
| P2 | `applications/[id]/submissions` | 提出物 |
| P2 | `auth/[...all]` | Better Auth ルート |
| P2 | `auth/plan` | プラン取得 |
| P2 | `companies/[id]/credentials` | 認証情報 |
| P2 | `companies/[id]/deadlines` | 企業別締切 |
| P2 | `companies/[id]/deadlines/check-duplicates` | 重複チェック |
| P2 | `companies/[id]/delete-corporate-urls` | URL 削除 |
| P2 | `companies/[id]/es-review-status` | ES レビュー状態 |
| P2 | `companies/[id]/es-role-options` | 職種選択肢 |
| P2 | `companies/[id]/fetch-corporate-upload/estimate` | 取得見積 |
| P2 | `companies/[id]/search-corporate-pages` | ページ検索 |
| P2 | `companies/[id]/source-compliance/check` | ソース準拠 |
| P2 | `companies/suggestions` | 企業候補 |
| P2 | `dashboard/incomplete` | 未完了一覧 |
| P2 | `documents/[id]/permanent` | 永久保存 |
| P2 | `documents/[id]/restore` | 復元 |
| P2 | `documents/[id]/threads/[threadId]` | スレッド |
| P2 | `documents/[id]/versions` | バージョン |
| P2 | `documents/new` | 新規作成 |
| P2 | `submissions/[id]` | 提出物詳細 |

---

## 10. 未テスト hooks 全一覧（参考）

15 件。Priority 列は Task Board のバッチに対応。

| Priority | Hook | 複雑度 | 備考 |
|---|---|---|---|
| P1 (F4-1) | `useESReview.ts` | 高 | ストリーミング状態機械 |
| P1 (F4-1) | `useDocuments.ts` | 中 | CRUD + SWR |
| P1 (F4-1) | `useNotifications.ts` | 中 | SWR + mutation |
| P1 (F4-2) | `useDeadlines.ts` | 中 | SWR + 日付ロジック |
| P1 (F4-2) | `useDeadlinesDashboard.ts` | 中 | SWR + 日付ロジック |
| P1 (F4-2) | `useTasks.ts` | 中 | SWR + mutation |
| P1 (F4-2) | `useCalendar.ts` | 中 | Google Calendar 連携 |
| P2 (F4-3) | `useSearch.ts` | 低-中 | SWR + debounce |
| P2 (F4-3) | `useApplications.ts` | 低 | SWR |
| P2 (F4-3) | `usePins.ts` | 低 | SWR + mutation |
| P2 (F4-3) | `useMediaQuery.ts` | 低 | window listener |
| P2 (F4-3) | `useSubmissions.ts` | 低 | SWR |
| P2 (F4-3) | `useStreamingTextPlayback.ts` | 中 | テキスト表示アニメーション |
| P2 (F4-3) | `useCompanyDeadlines.ts` | 低 | SWR |
| P2 (F4-3) | `useCompanySuggestions.ts` | 低 | SWR |
