---
name: improve-search
description: 検索精度の自律改善ループ。テスト結果分析→仮説生成→実装→フルテスト→評価を反復実行。
user-invocable: true
language: ja
---

# Skill: /improve-search - 検索精度自律改善

## Description

企業検索（hybrid/legacy）の精度・網羅性を自律的に改善するスキル。
既存テスト結果の履歴分析、失敗パターンの体系的分類、修正実装、フルテスト実行、回帰テスト評価を反復実行する。

**重要**: このスキルはPC スリープに耐性がある。`caffeinate` でスリープを防止し、万が一中断されてもキャッシュ利用で高速リスタートする。状態ファイルにより中断ポイントから自動復帰する。

## Trigger

- `/improve-search` -- 新規改善サイクルを開始（または中断サイクルを再開）
- `/improve-search status` -- 現在の改善状態・テスト進捗を表示
- `/improve-search report` -- 最新の改善レポートを表示
- `/improve-search revert` -- 現イテレーションの変更を取り消し

## Arguments: $ARGUMENTS

- **引数なし**: 新規サイクル開始 or 中断再開（自動判定）
- `status`: 現在の状態確認のみ（テストPID確認、ログ進捗表示）
- `report`: 最新レポートの表示のみ
- `revert`: 現イテレーションの変更をgit revertし、状態ファイルを更新

---

## State Management

### 状態ファイル

**場所**: `backend/tests/output/improve_search_state.json`

```json
{
  "version": 1,
  "status": "analyzing|planning|implementing|testing|evaluating|completed|blocked",
  "started_at": "ISO timestamp",
  "last_checkpoint": "ISO timestamp",
  "cycle": 1,
  "baseline": {
    "report_file": "live_company_info_search_YYYYMMDD_HHMMSS_seedN.json",
    "git_commit": "hash",
    "metrics": {
      "hybrid_overall_rate": 0.0,
      "legacy_overall_rate": 0.0,
      "by_content_type": {},
      "by_industry": {},
      "top_failures": [],
      "failing_companies": []
    }
  },
  "iterations": [
    {
      "iteration": 1,
      "started_at": "ISO",
      "completed_at": "ISO or null",
      "status": "in_progress|completed|reverted",
      "hypothesis": "description",
      "root_cause_bucket": "A|B|C|D|E|F",
      "changes": [
        {
          "file": "relative path",
          "param": "parameter name",
          "old_value": "before",
          "new_value": "after",
          "rationale": "why"
        }
      ],
      "test": {
        "report_file": "filename or null",
        "pid": null,
        "started_at": "ISO or null",
        "completed_at": "ISO or null",
        "exit_code": null
      },
      "metrics": {},
      "delta": {},
      "decision": "merged|reverted|iterating"
    }
  ],
  "active_test": {
    "pid_file": "/tmp/improve_search_test.pid",
    "log_file": "backend/tests/output/improve_search_test.log",
    "started_at": "ISO or null",
    "caffeinate_pid_file": "/tmp/improve_search_caffeinate.pid"
  },
  "seed_rotation": {
    "current_seed": 6,
    "seed_sequence": [6, 1, 42, 15, 3, 2, 4, 5, 9, 7],
    "completed_seeds": [],
    "auto_rotate": true
  },
  "parameter_changelog": []
}
```

#### seed_rotation フィールド

| フィールド | 説明 |
|-----------|------|
| `current_seed` | 現在のサイクルで使用中のシード |
| `seed_sequence` | テストするシードの順番リスト |
| `completed_seeds` | merge完了済みのシード（そのシードでのテストが成功裏に完了したもの） |
| `auto_rotate` | サイクル完了時に自動的に次シードへ切り替えるか |

**ローテーションルール**: merge承認後、`current_seed` を `completed_seeds` に追加し、`seed_sequence` の中で未完了の次のシードに切り替える。全シード完了時は `completed_seeds` をリセットして再ローテーション。

### チェックポイントプロトコル

各フェーズの開始・完了時に `improve_search_state.json` を更新する。
これにより、セッション中断後の再開時に正確な復帰ポイントを特定できる。

---

## Workflow

### Phase 0: コンテキスト読込 & 状態復帰

**目的**: プロジェクトコンテキストを読み込み、前回の中断ポイントがあれば復帰する。

**常に最初に実行すること**:

1. `CLAUDE.md` を読み込む
2. `backend/tests/output/improve_search_state.json` の存在をチェック

**状態ファイルが存在しない場合** → Phase 1 へ進む（新規開始）

**状態ファイルが存在する場合** → 復帰プロトコルを実行:

```bash
# Step 1: PID確認（テスト実行中か？）
PID=$(cat /tmp/improve_search_test.pid 2>/dev/null)
if [ -n "$PID" ]; then
  ps -p $PID -o pid= 2>/dev/null && echo "RUNNING" || echo "DEAD"
fi

# Step 2: 完了確認
cat /tmp/improve_search_exit_code 2>/dev/null

# Step 3: ログ進捗確認
grep -c "^\[live-search\]" backend/tests/output/improve_search_test.log 2>/dev/null
```

**復帰判定**:

| state.status | PID状態 | exit_code | アクション |
|-------------|---------|-----------|-----------|
| `testing` | RUNNING | - | 「テスト実行中（N/30社完了）。`/improve-search status` で確認」 |
| `testing` | DEAD | 0 | テスト完了。出力ファイルを検索し Phase 6 へ |
| `testing` | DEAD | non-0 | テスト失敗。ログ末尾を確認し原因報告 |
| `testing` | DEAD | なし | テスト中断（スリープ等）。キャッシュ利用リスタートを提案 |
| `analyzing` | - | - | Phase 1 を再実行 |
| `planning` | - | - | Phase 2 を再実行 |
| `implementing` | - | - | Phase 3 を再実行 |
| `evaluating` | - | - | Phase 6 を再実行 |
| `completed` | - | - | 前回結果を表示し、新サイクル開始を提案。`seed_rotation.auto_rotate=true` なら次シード情報も表示 |

**中断テストのリスタート**:
```bash
# キャッシュ利用で高速リスタート（34h → 2-3h）
# テスト中断時、DuckDuckGoの結果キャッシュが残っていれば再利用する
LIVE_SEARCH_CACHE_MODE=use
```

### Phase 1: 履歴分析

**目的**: 全テスト出力ファイルを読み、失敗パターンを体系的に特定する。

**状態更新**: `status: "analyzing"`

#### Step 1.1: テスト結果の収集

1. `backend/tests/output/live_company_info_search_*.json` を全て列挙
2. 各ファイルを読み込み、`runs` 配列からメトリクスを算出:
   - 各runの `judgment.passed` でpass/fail集計
   - mode別（hybrid/legacy）に分けて集計
   - content_type別、industry別にも集計
3. 最新の完全なレポートをベースラインとして選定

#### Step 1.2: 失敗パターンの分析

以下の観点で集約分析を行う:

**a) 慢性的失敗企業** -- 複数seedで繰り返し失敗する企業
```
全レポートで company_name ごとの fail 回数を集計
fail率が50%以上の企業をリストアップ
```

**b) コンテンツタイプ弱点** -- 成功率が低いコンテンツタイプ
```
content_type別の pass率を計算
recruitment_main, recruitment_intern, content_type:* の各カテゴリ
```

**c) 業界パターン** -- 業界別成功率の偏り
```
industry別の pass率を計算
特定業界に偏った失敗がないか確認
```

**d) 失敗理由分布** -- 最も多い失敗理由
```
judgment.failure_reasons の頻度カウント
no_candidates, no_official_found, source_type_wrong 等
```

**e) モード比較** -- hybrid vs legacy の成績差
```
同じ企業・コンテンツタイプで hybrid のみ失敗 / legacy のみ失敗のケースを特定
```

#### Step 1.3: スキル委任

分析結果の解釈に以下のスキルを活用する:

- **`/hybrid-search-implementation`** を参照 → RRF/リランク関連の失敗パターン解釈
- **`/similarity-search-patterns`** を参照 → スコアリング・類似度検索問題の分析

### Phase 2: 仮説生成

**目的**: 失敗分析に基づき、改善仮説を優先度付きで生成する。

**状態更新**: `status: "planning"`

#### 根本原因バケット

失敗を以下の6つのバケットに分類する:

| バケット | 症状 | 診断方法 | 修正対象ファイル |
|---------|------|---------|----------------|
| **A: クエリ品質** | `no_candidates` (結果0件) | candidatesが空 | `web_search.py` のクエリ生成 |
| **B: ランキング/スコア** | 公式ドメインがtop-5外 | raw resultsに公式ドメインあるが上位に来ない | `web_search.py` のスコア重み |
| **C: ドメインマッピング** | `is_official=False` 全件 | raw results全てで `is_official=False` | `company_mappings.json` |
| **D: メタデータ分類** | `source_type_correct=False` | 公式ページなのに `source_type="other"` | `company_info.py` の `_classify_source_type()` |
| **E: コンテンツタイプ特化** | `url_pattern_match=False` | ジェネリックなページが上位に来る | コンテンツタイプ別クエリテンプレート |
| **F: テスト判定基準** | 系統的な偽陽性/偽陰性 | 手動確認でテスト基準に問題 | `search_expectations.py` |

#### 仮説の優先度付け

各仮説を以下の式でランク付け:

```
priority = impact / (effort × risk)
```

- **impact**: 修正で改善されるfail件数（推定）
- **effort**: low=1 (パラメータ変更), medium=2 (アルゴリズム変更), high=3 (新機能)
- **risk**: low=1 (回帰リスク小), medium=2, high=3

上位1-3件の仮説を選択して実装する。

#### スキル委任

仮説のバケットに応じて以下のスキルを活用する:

| バケット | 委任先スキル | 活用方法 |
|---------|-------------|---------|
| A: クエリ品質 | `prompt-engineer` | クエリ生成プロンプトの改善提案 |
| B: ランキング/スコア | `similarity-search-patterns` | スコアリング重みの最適化戦略 |
| C: ドメインマッピング | `rag-engineer` | ドメインパターンマッチング戦略 |
| D: メタデータ分類 | `rag-implementation` | 分類ロジックの改善 |
| E: コンテンツタイプ | `prompt-engineer` | コンテンツタイプ別クエリの最適化 |
| 全般 | `senior-ml-engineer` | モデル選択、パイプライン最適化 |

### Phase 3: 実装

**目的**: 選択した仮説に基づき変更を実装する。

**状態更新**: `status: "implementing"`

#### Step 3.1: Git ブランチ作成

```bash
git checkout -b improve-search/cycle-{N} develop
```

#### Step 3.2: 変更の実装

選択したバケットに応じて対象ファイルを修正する。

**チューニング可能パラメータマップ**:

| パラメータ | ファイル | 現在値 | 探索範囲 |
|-----------|--------|--------|---------|
| `WEIGHT_RERANK` | `backend/app/utils/web_search.py` | 0.45 | 0.20-0.60 |
| `WEIGHT_INTENT` | `backend/app/utils/web_search.py` | 0.40 | 0.20-0.60 |
| `WEIGHT_RRF` | `backend/app/utils/web_search.py` | 0.15 | 0.05-0.30 |
| `WEB_SEARCH_MAX_QUERIES` | `backend/app/utils/web_search.py` | 10 | 4-10 |
| `WEB_SEARCH_RESULTS_PER_QUERY` | `backend/app/utils/web_search.py` | 12 | 8-15 |
| `WEB_SEARCH_RERANK_TOP_K` | `backend/app/utils/web_search.py` | 30 | 15-50 |
| `WEB_SEARCH_RRF_K` | `backend/app/utils/web_search.py` | 60 | 30-100 |
| `INTENT_GATE_THRESHOLD` | `backend/app/utils/web_search.py` | 0.7 | 0.5-0.9 |
| `INTENT_SCORE_BIAS` | `backend/app/utils/web_search.py` | 0.1 | 0.0-0.3 |
| Cross-encoder model | `backend/app/utils/reranker.py` | `hotchpotch/japanese-reranker-small-v2` | small/base |
| `CONTENT_TYPE_BOOSTS` | `backend/app/utils/hybrid_search.py` | 4プロファイル | 0.7-2.0 |
| `DEFAULT_MMR_LAMBDA` | `backend/app/utils/hybrid_search.py` | 0.5 | 0.3-0.7 |
| `company_mappings.json` | `backend/data/company_mappings.json` | ~100+社 | ドメイン追加 |

**修正対象ファイル一覧**（バケット別）:

- **バケットA/E**: `backend/app/utils/web_search.py` (クエリ生成), `backend/app/routers/company_info.py` (CONTENT_TYPE_SEARCH_INTENT)
- **バケットB**: `backend/app/utils/web_search.py` (スコア重み), `backend/app/utils/hybrid_search.py` (RRF, MMR)
- **バケットC**: `backend/data/company_mappings.json` (ドメインパターン)
- **バケットD**: `backend/app/routers/company_info.py` (`_classify_source_type`)
- **バケットF**: `backend/tests/fixtures/search_expectations.py` (判定基準)

#### Step 3.3: 構文検証

```bash
cd backend && python -c "import app.utils.web_search" && echo "OK"
cd backend && python -c "import app.routers.company_info" && echo "OK"
cd backend && python -c "import app.utils.hybrid_search" && echo "OK"
```

構文エラーがあれば即座に修正する。

#### Step 3.4: 変更の記録

`improve_search_state.json` の `iterations[current].changes` と `parameter_changelog` に変更内容を記録する。

### Phase 4: フルテスト実行

**目的**: 30社フルテスト（hybrid + legacy両モード）を実行する。

**状態更新**: `status: "testing"`

#### Step 4.1: テスト開始（バックグラウンド + caffeinate）

**重要**: シード値は `improve_search_state.json` の `seed_rotation.current_seed` から取得する。

```bash
# 状態ファイルからシードを取得
SEED=$(python3 -c "import json; d=json.load(open('backend/tests/output/improve_search_state.json')); print(d.get('seed_rotation',{}).get('current_seed',6))" 2>/dev/null || echo 6)

nohup bash -c "
  cd /Users/saoki/work/career_compass && \
  RUN_LIVE_SEARCH=1 \
  LIVE_SEARCH_SAMPLE_SIZE=30 \
  LIVE_SEARCH_MODES=hybrid,legacy \
  LIVE_SEARCH_CACHE_MODE=bypass \
  LIVE_SEARCH_SAMPLE_SEED=$SEED \
  LIVE_SEARCH_TOKENS_PER_SECOND=1.0 \
  LIVE_SEARCH_MAX_TOKENS=1.0 \
  python -m pytest backend/tests/test_live_company_info_search_report.py -v -s -m 'integration' \
  2>&1 | tee backend/tests/output/improve_search_test.log; \
  echo \$? > /tmp/improve_search_exit_code
" > /dev/null 2>&1 &
TEST_PID=$!
echo $TEST_PID > /tmp/improve_search_test.pid

# スリープ防止（macOS）
caffeinate -dims -w $TEST_PID > /dev/null 2>&1 &
echo $! > /tmp/improve_search_caffeinate.pid
```

**重要**: Bashツールの `run_in_background` パラメータを使用してバックグラウンド実行すること。

#### Step 4.2: 状態ファイル更新

- `status` を `"testing"` に更新
- `active_test.started_at` に現在時刻を記録
- `active_test.pid_file`, `active_test.log_file` を記録

#### Step 4.3: ユーザー通知

```
テストを開始しました。
- 30社 × 2モード × 11種 = 660検索
- 推定所要時間: ~34時間（レート制限: 1 req/sec）
- caffeinate でスリープ防止中
- `/improve-search status` で進捗確認可能
- テスト完了後、`/improve-search` で評価を再開してください
```

### Phase 5: テスト中断時の復帰

**目的**: テストが中断された場合、効率的にリスタートする。

テスト中断を検知した場合（Phase 0 の復帰プロトコルで判定）:

#### Step 5.1: 進捗確認

```bash
# ログから完了済み企業数を取得
grep -c "^\[live-search\]" backend/tests/output/improve_search_test.log
```

#### Step 5.2: リスタート判断

ユーザーに報告:
```
テストが中断されました（N/30社完了、約X時間経過）。

キャッシュ利用でリスタートすると、DuckDuckGoの結果を再利用して
約2-3時間で完了します（vs 通常34時間）。

リスタートしますか？
```

#### Step 5.3: キャッシュ利用リスタート

```bash
# 状態ファイルからシードを取得
SEED=$(python3 -c "import json; d=json.load(open('backend/tests/output/improve_search_state.json')); print(d.get('seed_rotation',{}).get('current_seed',6))" 2>/dev/null || echo 6)

nohup bash -c "
  cd /Users/saoki/work/career_compass && \
  RUN_LIVE_SEARCH=1 \
  LIVE_SEARCH_SAMPLE_SIZE=30 \
  LIVE_SEARCH_MODES=hybrid,legacy \
  LIVE_SEARCH_CACHE_MODE=use \
  LIVE_SEARCH_SAMPLE_SEED=$SEED \
  python -m pytest backend/tests/test_live_company_info_search_report.py -v -s -m 'integration' \
  2>&1 | tee backend/tests/output/improve_search_test.log; \
  echo \$? > /tmp/improve_search_exit_code
" > /dev/null 2>&1 &
TEST_PID=$!
echo $TEST_PID > /tmp/improve_search_test.pid
caffeinate -dims -w $TEST_PID > /dev/null 2>&1 &
echo $! > /tmp/improve_search_caffeinate.pid
```

### Phase 6: 評価 & レポート

**目的**: テスト結果をベースラインと比較し、改善/回帰を判定する。

**状態更新**: `status: "evaluating"`

#### Step 6.1: テスト出力の取得

```bash
# 最新の出力ファイルを特定
ls -t backend/tests/output/live_company_info_search_*.json | head -1
```

テスト出力JSONを読み込み、metricsを算出する。

#### Step 6.2: ベースライン比較

以下のデルタを計算する:

| メトリクス | ベースライン | 今回 | デルタ |
|-----------|------------|------|-------|
| Hybrid Overall Rate | X% | Y% | +/-Zpp |
| Legacy Overall Rate | X% | Y% | +/-Zpp |
| 各 content_type 別 | ... | ... | ... |
| 各 industry 別 | ... | ... | ... |

**新規PASS/新規FAIL** も特定する:
- 前回FAILで今回PASS → 改善された検索
- 前回PASSで今回FAIL → 回帰

#### Step 6.3: 回帰判定

| ルール | 条件 | アクション |
|-------|------|-----------|
| **ハードゲート** | 全体率が2pp以上低下 | リバート推奨 |
| **ソフトゲート** | 個別content_typeが10pp以上低下 | 警告 & ユーザー確認 |
| **改善確認** | 全体率が1pp以上向上 & 回帰なし | コミット推奨 |

#### Step 6.4: レポート生成

`backend/tests/output/improvement_report_cycle{N}.md` を生成:

```markdown
# Search Improvement Report - Cycle {N}

## Summary
- Hypothesis: {description}
- Root Cause Bucket: {bucket}
- Result: {improved/regressed/neutral}

## Metrics Comparison
| Metric | Baseline | Current | Delta |
|--------|----------|---------|-------|
| ... | ... | ... | ... |

## Changes Made
| File | Parameter | Old | New |
|------|-----------|-----|-----|
| ... | ... | ... | ... |

## Newly Passing
- {company}: {content_type} (mode: {mode})

## Regressions
- {company}: {content_type} (mode: {mode})

## Recommendation
{merge/revert/iterate}
```

#### Step 6.5: スキル委任

- **`/hybrid-search-implementation`** を参照 → 結果のアーキテクチャ整合性を検証

### Phase 7: コミット & 次サイクル

**目的**: 改善結果に基づきコミットまたはリバートし、次サイクルの判断を行う。

#### 改善あり & 回帰なしの場合

1. ユーザーに改善サマリーを提示
2. 承認を得たら `/commit-develop` でコミット
3. 状態ファイルの `iterations[current].decision` を `"merged"` に更新
4. ベースラインメトリクスを今回の結果で更新

#### 回帰ありの場合

1. 変更をリバート:
   ```bash
   git checkout develop -- {changed_files}
   ```
2. 状態ファイルの `iterations[current].decision` を `"reverted"` に更新
3. 別の仮説で Phase 2 からやり直し

#### シードローテーション（merge後に自動実行）

merge承認後、`seed_rotation.auto_rotate` が `true` の場合、以下を自動実行する:

**Step 7.1**: 現在のシードを完了済みに追加
```python
state["seed_rotation"]["completed_seeds"].append(state["seed_rotation"]["current_seed"])
```

**Step 7.2**: 次のシードを決定
```python
seq = state["seed_rotation"]["seed_sequence"]
done = state["seed_rotation"]["completed_seeds"]
remaining = [s for s in seq if s not in done]

if remaining:
    next_seed = remaining[0]
else:
    # 全シード完了 → リセットして再ローテーション
    state["seed_rotation"]["completed_seeds"] = []
    next_seed = seq[0]

state["seed_rotation"]["current_seed"] = next_seed
```

**Step 7.3**: 新シードのベースライン検索
```bash
# 新シードの既存テスト結果を探す
ls backend/tests/output/live_company_info_search_*_seed{next_seed}.json 2>/dev/null
```

- **見つかった場合**: 最新のファイルをベースラインとして採用
- **見つからない場合**: ベースラインは `null` — 次サイクルの最初のテストがベースラインとなる

**Step 7.4**: 状態ファイル更新
- `seed_rotation.current_seed` を新シードに更新
- `baseline` を新シードのベースラインで更新（なければ `null`）

#### 次サイクルの判断

ユーザーに確認:
```
改善サイクル{N}が完了しました。

結果:
- Hybrid: {old}% → {new}% ({delta}pp)
- Legacy: {old}% → {new}% ({delta}pp)

シードローテーション: seed {current} → seed {next}
  完了済みシード: [{completed_seeds}]
  次の企業セット: 30社（seed {next} でサンプリング）
  ベースライン: {baseline_file or "なし（初回テストがベースラインになります）"}

次の改善サイクルを開始しますか？
```

YES の場合 → `cycle` をインクリメントし Phase 1 へ

---

## Sub-Command Implementations

### `/improve-search status`

```
1. improve_search_state.json を読み込む
2. テストPID確認（実行中/完了/中断）
3. ログ進捗確認（N/30社）
4. 現在のフェーズ、サイクル番号、最新メトリクスを表示
```

表示例:
```
Improve-Search Status:
- Cycle: 2
- Phase: testing (フルテスト実行中)
- Seed: 6 (completed: [], next: 1)
- Progress: 18/30 companies completed
- Elapsed: 20h 15m
- Baseline: hybrid 72.0%, legacy 65.0%
- Branch: improve-search/cycle-2
```

### `/improve-search report`

```
1. backend/tests/output/improvement_report_cycle*.md の最新を表示
2. 状態ファイルから累計改善量を計算
```

### `/improve-search revert`

```
1. 状態ファイルから current iteration の changes を取得
2. 各変更ファイルを git checkout で復元:
   git checkout develop -- {file}
3. テストPIDが生存していれば kill
4. caffeinate PIDが生存していれば kill
5. 状態ファイルの iteration.decision を "reverted" に更新
```

---

## Targeted Testing Support

特定企業のみテストしたい場合は `LIVE_SEARCH_COMPANIES` 環境変数を使用:

```bash
LIVE_SEARCH_COMPANIES="三菱商事,Apple,安川電機" make backend-test-live-search
```

これにより seed/sample_size ベースのサンプリングをオーバーライドし、
指定企業のみを対象にテストを実行する。

**活用場面**:
- 特定の失敗企業の修正を検証する際
- ドメインマッピング追加後の即時確認
- 回帰テストで特定のエッジケースを確認する際

---

## Key File Reference

### 検索パイプライン

| ファイル | 役割 | 主要パラメータ |
|---------|------|--------------|
| `backend/app/utils/web_search.py` | Web検索パイプライン | WEIGHT_RERANK, WEIGHT_INTENT, WEIGHT_RRF, クエリ生成 |
| `backend/app/utils/hybrid_search.py` | RAGハイブリッド検索 | CONTENT_TYPE_BOOSTS, RRF k, MMR lambda |
| `backend/app/utils/reranker.py` | クロスエンコーダ | モデル選択, top_k |
| `backend/app/utils/bm25_store.py` | キーワード検索 | BM25パラメータ |
| `backend/app/utils/vector_store.py` | ChromaDB操作 | embedding設定, context length |
| `backend/app/routers/company_info.py` | APIルーター | source_type分類, CONTENT_TYPE_SEARCH_INTENT |
| `backend/app/utils/content_classifier.py` | コンテンツ分類 | 分類ルール |

### データ

| ファイル | 役割 |
|---------|------|
| `backend/data/company_mappings.json` | 企業ドメインパターン |
| `backend/data/chroma/` | ChromaDB永続ストレージ |
| `backend/data/bm25/` | BM25インデックス |

### テスト

| ファイル | 役割 |
|---------|------|
| `backend/tests/test_live_company_info_search_report.py` | メインテスト (1300+ lines) |
| `backend/tests/fixtures/search_expectations.py` | 判定基準・pass/failロジック |
| `backend/tests/utils/rate_limiter.py` | 分散レートリミッター |
| `backend/tests/output/` | テスト出力・状態ファイル |

---

## Skill Delegation Map

このスキルは分析・実装の各フェーズで以下の専門スキルを活用する。
スキルの知識は参照として活用し、実装判断に反映させる。

| フェーズ | 条件 | 委任先スキル | 活用方法 |
|---------|------|-------------|---------|
| Phase 1 (分析) | 常時 | `hybrid-search-implementation` | RRF/リランク失敗パターンの解釈フレームワーク |
| Phase 1 (分析) | 常時 | `similarity-search-patterns` | スコアリング問題の分析パターン |
| Phase 2 (仮説) | バケットA,E | `prompt-engineer` | クエリ生成・プロンプト改善のベストプラクティス |
| Phase 2 (仮説) | バケットB | `similarity-search-patterns` | ランキング・スコアリング最適化戦略 |
| Phase 3 (実装) | アルゴリズム変更 | `rag-engineer` | RAGパイプライン修正のガイダンス |
| Phase 3 (実装) | リランカー変更 | `senior-ml-engineer` | モデル選択・推論最適化 |
| Phase 3 (実装) | 実装全般 | `rag-implementation` | 実装ベストプラクティス |
| Phase 6 (評価) | 常時 | `hybrid-search-implementation` | アーキテクチャ整合性の検証 |

---

## Important Notes

### テスト所要時間
- フルテスト（30社 × 2モード × 11種）: 約34時間（レート制限 1 req/sec）
- `LIVE_SEARCH_COMPANIES` 指定（5社）: 約6時間
- キャッシュ利用リスタート: 約2-3時間

### 回帰防止
- **ハードゲート**: 全体成功率が2pp以上低下 → 自動リバート推奨
- **ソフトゲート**: 個別content_typeが10pp以上低下 → 警告
- 全変更は `parameter_changelog` に記録され、監査可能

### スリープ耐性
- `caffeinate -dims -w $PID` でmacOSスリープを防止
- 万が一中断された場合は `LIVE_SEARCH_CACHE_MODE=use` で高速リスタート
- 状態ファイル (`improve_search_state.json`) で中断ポイントを記録
- `/improve-search` 再実行で自動的に適切なフェーズから復帰
