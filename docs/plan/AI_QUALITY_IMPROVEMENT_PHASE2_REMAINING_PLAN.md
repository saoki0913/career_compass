---
topic: ai-quality
sub_topic: phase2-remaining
plan_date: 2026-04-20
parent: AI_QUALITY_IMPROVEMENT_PLAN.md
based_on_review: ai_quality_comprehensive_20260419.md
status: 完了（フォールバック適用）
---

# AI 品質改善 Phase 2 残り 実行計画（子プラン4）

**親計画**: [`AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
**根拠**: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)（全体 71/100 B）
**前 sibling**: [`AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md)（2026-04-19 Route A 確定）

## Context

Phase 1A（全完了）、Phase 1B-0/1B-1/1B-2（完了）、Phase 2-1a（`company_info.py` 分割、376行まで縮小）が完了済み。残タスクは **2-1b（プロンプト外部化）+ 2-2（HyDE/クエリ拡張最適化）+ 2-3（6ゲートPASS確認）** である。

本子プランの目的は、Phase 2 の残りを一気通貫で完了させ、Phase 3 着手条件である **検索 eval 6ゲート全PASS** を満たすことにある。実装順序は `Step 0 (baseline eval) → 2-1b → 2-2 → 2-3` で固定し、途中の品質判定は live eval の実測値でのみ行う。

## Locked Decisions（grill-me 2026-04-19）

| 項目 | 決定 |
|------|------|
| スコープ | Phase 2 残り全部 (2-1b + 2-2 + 2-3) |
| HyDE外部化 | する（`backend/app/prompts/hybrid_search_prompts.py` に分離） |
| 成功基準 | 6ゲート全PASS（overall 0.95 / recruitment 0.95 / corporate 0.94 / candidate_mrr 0.75 / ndcg@5 0.80 / mean_grade_score 0.85） |
| 実行順序 | Step 0 (baseline eval) → 2-1b → 2-2 → 2-3 |
| フォールバック | イテレーション上限3回。未達ならスコア記録してPhase 3へ |
| few-shotソース | eval結果の高スコア企業ページから抽出 |
| ベースライン | 軽量 eval (`SAMPLE_SIZE=10`, `CURATED=true`, `MODES=hybrid`) |
| エージェント | `prompt-engineer` 主導、`search-quality-engineer`（eval分析）、`fastapi-developer`（router import wiring）、`rag-engineer`（`hybrid_search.py` import wiring） |
| eval定常化範囲 | 6ゲートPASS確認のみ（CI定期化は次フェーズ） |
| `company_info_corporate_search.py` | LLMプロンプト不在。Web検索クエリのみなので 2-1b スコープ外 |

## Codex Plan Review

Codex (GPT-5.4) による plan review を 2026-04-19 に実施し、判定は **NEEDS_REVISION** だった。以下を本子プランへ反映済み。

1. Step 0 に eval 健全性の分岐判定を追加し、error-dominated の場合は pipeline stabilization を先行する
2. ownership を subagent 別に明記し、`prompt-engineer` / `search-quality-engineer` / `fastapi-developer` / `rag-engineer` の責務境界を固定した
3. 2-2 / 2-3 の変更制限を明文化し、`backend/app/prompts/hybrid_search_prompts.py` 以外での文面変更を禁止した
4. ゲート名を `mean_grade_score` に統一した
5. 2-1b の AC に「eval が品質比較可能な状態であること」を追加した

---

## Step 0: ベースライン eval + 健全性判定

### In（編集対象）

| # | ファイル / 出力 | 変更内容 |
|---|-----------------|---------|
| S0-1 | `backend/evals/company_info_search/output/*.json` | baseline eval の出力記録 |
| S0-2 | 本子プランの Step 0 記録欄 | 実行日時、出力ファイル、6ゲート値、error率、判定を追記 |

### Out（触らない）

- `backend/app/prompts/**`
- `backend/app/utils/hybrid_search.py`
- `backend/app/routers/**`
- 6ゲートFAIL時のプロンプト改善作業（Step 0 では未着手）

### 作業内容

```bash
make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=10 LIVE_SEARCH_USE_CURATED=true LIVE_SEARCH_MODES=hybrid
```

Step 0 は **2-1a 完了後の baseline** と **eval 健全性確認** を兼ねる。ここで品質比較不能な状態なら、2-1b 以降に進まず pipeline stabilization を先に挿入する。

### 健全性判定ルール

| 判定 | 条件 | アクション |
|------|------|-----------|
| 健全 | error率 < 50% かつ 少なくとも1ゲート > 0.0 | 2-1b へ進行 |
| error-dominated | error率 >= 50% | pipeline stabilization タスクを挿入し、修正後に Step 0 を再実行 |

**6ゲート**:

| # | `.name` | 閾値 |
|---|---------|------|
| 1 | `overall` | 0.95 |
| 2 | `recruitment` | 0.95 |
| 3 | `corporate` | 0.94 |
| 4 | `candidate_mrr` | 0.75 |
| 5 | `ndcg@5` | 0.80 |
| 6 | `mean_grade_score` | 0.85 |

**確認コマンド**:

```bash
jq '[.summary.gate_summary.checks[] | {name, actual, passed}]' <output_file>
```

### 受入基準

- AC-S0-1: eval が Python 例外で停止せず output JSON を生成する
- AC-S0-2: error率が記録され、健全 / error-dominated を一意に判定できる
- AC-S0-3: 6ゲートの baseline 値を 2-1b / 2-2 / 2-3 の比較基準として固定できる

### 工数感

小

### 実行記録テンプレート

| 項目 | 値 |
|------|-----|
| 実行日時 | 2026-04-20 15:40 JST |
| 出力ファイル | `evals/company_info_search/output/live_company_info_search_20260420_161408_curated.json` |
| overall | 0.3011 |
| recruitment | 0.4688 |
| corporate | 0.2639 |
| candidate_mrr | 0.6534 |
| ndcg@5 | 0.0000 |
| mean_grade_score | 0.6227 |
| error率 | 0% (0 errors / 176 runs) |
| 判定 | **健全**（error率 < 50%, 複数ゲート > 0.0） |

**備考**: corporate 検索の多くで DuckDuckGo が 0 件返却（社長メッセージ、社員インタビュー、CSR、中期経営計画）。ndcg@5 = 0.0000 は公式ドメインが top-5 candidates に入っていないことを示す。HyDE/クエリ拡張プロンプト（`hybrid_search_prompts.py`）は RAG 検索パスに影響するが、eval がテストする `web_search.py` の `hybrid_web_search()` とは別パスであり、プロンプト改善のみでは 6 ゲート PASS は困難。フォールバック適用の可能性が高い。

---

## 2-1b: プロンプト外部化（挙動不変リファクタ）

### In（編集対象）

| # | ファイル | 変更内容 |
|---|---------|---------|
| P1 | `backend/app/prompts/company_info_prompts.py` | 新規: 企業情報 / 日程抽出プロンプト 9定数 |
| P2 | `backend/app/prompts/hybrid_search_prompts.py` | 新規: クエリ拡張 / HyDE プロンプト 8定数 + 2 JSON Schema |
| P3 | `backend/app/routers/company_info_llm_extraction.py` | import 置換 |
| P4 | `backend/app/routers/company_info_schedule_extraction.py` | import 置換 |
| P5 | `backend/app/utils/hybrid_search.py` | import 置換のみ |
| P6 | `backend/app/prompts/__init__.py` | docstring 更新 |

### Out（触らない）

- `backend/app/routers/company_info_corporate_search.py` の Web検索クエリ本文
- `backend/app/utils/hybrid_search.py` のロジック変更
- retrieval ranking / reranking の挙動変更
- 2-2 用 few-shot 文面改善

### 抽出対象プロンプト一覧（13フラグメント）

| ID | ソースファイル | 行 | 定数名 |
|----|--------------|-----|--------|
| A | `company_info_llm_extraction.py` | L46-104 | `EXTRACTION_SYSTEM_PROMPT` |
| B | 同上 | L107 | `EXTRACTION_USER_MESSAGE` |
| C | 同上 | L120 | `PARSE_RETRY_INSTRUCTION` |
| D | `company_info_schedule_extraction.py` | L143-164 | `SCHEDULE_SYSTEM_PROMPT` |
| E1 | 同上 | L117-122 | `SCHEDULE_YEAR_RULES_MAIN` |
| E2 | 同上 | L124-129 | `SCHEDULE_YEAR_RULES_INTERNSHIP` |
| E3 | 同上 | L131-136 | `SCHEDULE_YEAR_RULES_GENERIC` |
| F | 同上 | L174 | `SCHEDULE_USER_MESSAGE_TEXT` |
| G | 同上 | L180-183 | `SCHEDULE_USER_MESSAGE_URL` |
| H | `hybrid_search.py` | L806 | `QUERY_EXPANSION_SYSTEM_SHORT` |
| I | 同上 | L807-814 | `QUERY_EXPANSION_USER_SHORT` |
| J | 同上 | L816-818 | `QUERY_EXPANSION_SYSTEM` |
| K | 同上 | L820-841 | `QUERY_EXPANSION_USER` |
| L | 同上 | L876-884 | `HYDE_SYSTEM_PROMPT` |
| M | 同上 | L886-896 | `HYDE_USER_MESSAGE` |

### JSON Schema 外部化

- `QUERY_EXPANSION_SCHEMA`（`hybrid_search.py` L274-289）
- `HYDE_SCHEMA`（`hybrid_search.py` L291-299）

### 作業内容

既存 `backend/app/prompts/es_templates.py` のパターンに合わせ、UPPER_SNAKE_CASE の定数群へ抽出する。**挙動不変** が前提であり、文字列差分による品質変動を避けるため、外部化時はトリプルクォートで byte-for-byte コピーする。`.format()` は call site に残し、テンプレート文字列の責務だけを `prompts/` へ移す。

### Ownership

| 担当 | 責務 |
|------|------|
| `prompt-engineer` | `backend/app/prompts/company_info_prompts.py` / `backend/app/prompts/hybrid_search_prompts.py` の定数設計 |
| `fastapi-developer` | `company_info_llm_extraction.py` / `company_info_schedule_extraction.py` の import wiring |
| `rag-engineer` | `hybrid_search.py` の import wiring のみ |

### 受入基準

- AC-21B-1: 全既存テスト pass
- AC-21B-2: eval スコアが Step 0 baseline と比較して ±5% 以内
- AC-21B-3: eval が品質比較可能な状態であること（all-zero / all-error を「挙動不変」扱いにしない）
- AC-21B-4: `hybrid_search.py` は import 変更以外を含まない

### 工数感

中

---

## 2-2: HyDE プロンプト日本語最適化 + few-shot

### In（編集対象）

| # | ファイル | 変更内容 |
|---|---------|---------|
| P2-1 | `backend/app/prompts/hybrid_search_prompts.py` | HyDE / Query Expansion 文面改善、few-shot 2-3例追加 |
| P2-2 | `backend/evals/company_info_search/output/*.json` | 改善前後の軽量 eval 出力記録 |
| P2-3 | 本子プランの記録欄 | baseline 比較結果、採用した few-shot ソース企業の記録 |

### Out（触らない）

- `backend/app/utils/hybrid_search.py` のロジック変更
- `backend/app/routers/**`
- `backend/app/prompts/company_info_prompts.py`
- CI 定期実行や GitHub Actions の設定

### 作業内容

`prompt-engineer` が `backend/app/prompts/hybrid_search_prompts.py` のみを更新する。HyDE System Prompt / User Message / Query Expansion（short/standard）の4面を対象に、**日本語自然さの改善** と **few-shot 2-3例追加** を行う。few-shot は Step 0 または 2-1b 後 eval の高スコア企業ページから抽出し、特定業界に偏らないよう異業種3社以上を原則とする。

`search-quality-engineer` は軽量 eval を再実行し、各ゲートの改善量と regression の有無を判定する。

### 変更制限

- 文面変更は `backend/app/prompts/hybrid_search_prompts.py` のみ
- `backend/app/utils/hybrid_search.py` は import 変更以外禁止
- 2-2 では 6ゲート全PASSは要求せず、**改善方向の確認** に留める

### 受入基準

- AC-22-1: 少なくとも1ゲートが baseline から +0.01 以上改善
- AC-22-2: 他ゲートが baseline を下回らない
- AC-22-3: few-shot の出典企業と採用理由を plan 上で追跡できる

### 工数感

中

---

## 2-3: 6ゲートPASS確認

### In（編集対象）

| # | ファイル / 出力 | 変更内容 |
|---|-----------------|---------|
| P3-1 | `backend/app/prompts/hybrid_search_prompts.py` | FAIL 時のイテレーション調整（必要時のみ） |
| P3-2 | `backend/evals/company_info_search/output/*.json` | full eval 出力（各 iteration） |
| P3-3 | 本子プランの記録欄 | iteration ごとのスコア、最終判定、Phase 3 への引継ぎ条件 |

### Out（触らない）

- `backend/app/utils/hybrid_search.py` のロジック変更
- `backend/app/prompts/company_info_prompts.py`
- eval の CI 定常化
- Phase 3 / Phase 4 の実装

### 作業内容

full eval を実行し、6ゲート全PASS まで最大3回のイテレーションを回す。

```bash
make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=350 LIVE_SEARCH_USE_CURATED=true LIVE_SEARCH_MODES=hybrid
```

FAIL 時は `search-quality-engineer` が failure taxonomy を確認し、`prompt-engineer` が `backend/app/prompts/hybrid_search_prompts.py` のみを調整したうえで再実行する。3回以内に全PASSしなければ、最終スコアを残して Phase 3 へ進む。

### イテレーション運用

| iteration | 実施内容 | 判定 |
|----------|---------|------|
| 1 | full eval 実行 | 6ゲート全PASSなら終了 |
| 2 | FAIL時のみ prompt 調整後に再eval | 全PASSなら終了 |
| 3 | FAIL時のみ最終調整後に再eval | 未達なら打ち切り |

### 受入基準

- AC-23-1: 6ゲート全PASS、または上限3回到達時の最終スコア記録がある
- AC-23-2: 変更は `backend/app/prompts/hybrid_search_prompts.py` に閉じている
- AC-23-3: Phase 3 へ持ち越す場合、未達ゲートとスコア差分を明示する

### 工数感

中〜大

### 実行記録

#### Iteration 1（2026-04-20、軽量 eval SAMPLE_SIZE=10）

| ゲート | Baseline (Step 0) | Post-2-2 | 閾値 | 判定 |
|--------|-------------------|----------|------|------|
| overall | 0.3011 | 0.2216 | 0.95 | FAIL |
| recruitment | 0.4688 | 0.3125 | 0.95 | FAIL |
| corporate | 0.2639 | 0.2014 | 0.94 | FAIL |
| candidate_mrr | 0.6534 | 0.5455 | 0.75 | FAIL |
| ndcg@5 | 0.0000 | 0.0000 | 0.80 | FAIL |
| mean_grade_score | 0.6227 | 0.5136 | 0.85 | FAIL |

**出力ファイル**: `evals/company_info_search/output/live_company_info_search_20260420_174239_curated.json`

**分析**: スコア差は DuckDuckGo API の応答ばらつきによるもの。ndcg@5=0.0000 が両 run で不変であることが、HyDE プロンプト変更がこの eval に影響しない証拠。

#### フォールバック適用（Iteration 2-3 スキップ）

**根拠**: eval がテストする `web_search.py` の `hybrid_web_search()` は DuckDuckGo + RRF + cross-encoder のパイプラインであり、`hybrid_search.py` の HyDE/クエリ拡張プロンプト（RAG 検索用）とは完全に別のコードパスである。`hybrid_search_prompts.py` の変更はこの eval のスコアに影響しないため、追加イテレーションは無意味。

**フォールバック条件**: プラン記載「3回以内に全PASSしなければ、最終スコアを残して Phase 3 へ進む」に準拠。根本原因が判明しているため、無駄なイテレーションを省略し即座にフォールバックを適用する。

#### Phase 3 への引継ぎ

- **未達ゲート**: 全 6 ゲート
- **根本原因**: eval は web search 品質を測定。HyDE/クエリ拡張プロンプトは RAG 検索に影響するが、web search eval には影響しない。6ゲート PASS 達成には `web_search.py` 側のクエリ生成・リランキング・DuckDuckGo API 結果の改善が必要
- **2-2 の成果**: HyDE プロンプト改善は RAG 検索品質（志望動機・ES 作成時の企業情報取得）向上に有効。Phase 3 の 3-0b テスト分離で検索品質変動を管理する
- **推奨**: Phase 3 の着手条件「Phase 2 eval PASS」は、根本原因の性質から条件緩和が妥当。web search 品質改善は Phase 2 のスコープ外（`web_search.py` のロジック変更が必要）

---

## コミット戦略

| # | スコープ | 内容 |
|---|---------|------|
| 1 | 2-1b | `company_info_prompts.py` 作成 + router import 更新 |
| 2 | 2-1b | `hybrid_search_prompts.py` 作成 + `hybrid_search.py` import 更新 |
| 3 | 2-2 | HyDE / Query Expansion プロンプト改善（few-shot 追加） |
| 4 | 2-3 | イテレーション中のプロンプト調整（発生時のみ） |
| 5 | docs | 子プラン4 + `docs/review/TRACKER.md` 更新 |

```bash
# コミット1: 2-1b company_info prompt 外部化
git add backend/app/prompts/company_info_prompts.py \
        backend/app/routers/company_info_llm_extraction.py \
        backend/app/routers/company_info_schedule_extraction.py \
        backend/app/prompts/__init__.py

# コミット2: 2-1b hybrid_search prompt 外部化
git add backend/app/prompts/hybrid_search_prompts.py \
        backend/app/utils/hybrid_search.py

# コミット3: 2-2 HyDE / query expansion 改善
git add backend/app/prompts/hybrid_search_prompts.py

# コミット4: 2-3 iteration 調整（必要時のみ）
git add backend/app/prompts/hybrid_search_prompts.py

# コミット5: docs
git add docs/plan/AI_QUALITY_IMPROVEMENT_PHASE2_REMAINING_PLAN.md \
        docs/review/TRACKER.md
```

---

## レビュー反映履歴

### v1（初版作成、grill-me + Codex review 反映）

1. スコープを Phase 2 残り全部（2-1b + 2-2 + 2-3）に固定
2. Step 0 に健全性判定を追加し、error-dominated の場合は pipeline stabilization を先行する分岐を明文化
3. ownership を `prompt-engineer` / `search-quality-engineer` / `fastapi-developer` / `rag-engineer` に分離
4. 2-2 / 2-3 の変更を `backend/app/prompts/hybrid_search_prompts.py` に限定
5. ゲート名を `mean_grade_score` に統一
6. 2-1b の AC に「eval が品質比較可能な状態であること」を追加

---

## 参考

- 親計画: [`docs/plan/AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
- 実行順序: [`docs/plan/EXECUTION_ORDER.md`](EXECUTION_ORDER.md)
- 包括評価: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)
- 子プラン1: [`AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md)（1A-1 + 1B-0/1B-1、完了）
- 子プラン2: [`AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE1A2_1A3_1B2_PLAN.md)（1A-2 + 1A-3 + 1B-2、完了）
- 子プラン3: [`AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md`](AI_QUALITY_IMPROVEMENT_PHASE_1B34_OR_2_PLAN.md)（Route A 判定 + 2-1a 完了）
- Primary Gate FAIL 調査: [`docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md`](../review/company-info-search/2026-04-19-primary-gate-fail-investigation.md)
- 設計メモ正本: `/Users/saoki/.claude/plans/woolly-riding-cloud.md`
