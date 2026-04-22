---
topic: ai-quality
sub_topic: phase1a1-1b01
plan_date: 2026-04-19
parent: AI_QUALITY_IMPROVEMENT_PLAN.md
based_on_review: ai_quality_comprehensive_20260419.md
status: 完了
---

# AI 品質改善 Phase 1A-1 + 1B-0/1B-1 実行計画（子プラン）

**親計画**: [`AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
**根拠**: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)（全体 71/100 B）

本子プランは親計画の Phase 1A-1（cross-provider fallback + 観測性）と Phase 1B-0/1B-1（Primary Gate FAIL 再現手順固定 + 原因調査）を 1 セッションで完走するための実装ガイド。

## Context

親計画が示す通り、全体 71/100 B の AI 品質改善でブロッカー級 2 件が存在する。

1. **LLM 基盤 cross-provider fallback 二重問題**: `backend/app/utils/llm_model_routing.py:149-151` の `_feature_cross_fallback_model(feature, provider)` が stub。`backend/app/utils/llm.py` の 2 箇所（L1252 JSON 経路 / L1459 テキスト経路）が `network` / `rate_limit` を fallback 対象外
2. **企業情報検索 Primary Gate FAIL**: 全 3,850 クエリ（hybrid+legacy で 7,700）が `empty_response` で 6 ゲート全て 0.0000。直近 `backend/evals/company_info_search/output/live_company_info_search_20260418_142454_curated.json` (12M) に既にログあり

本計画は今セッションで (A) 1A-1 の実装と (B) 1B-0/1B-1 の調査を完走する。ブランチは切らず develop 上で作業し、最後に 2 コミットに論理分割（push はしない）。

## Locked Decisions（grill-me 2026-04-19）

| 項目 | 決定 |
|------|------|
| ゴール | 1A-1 実装 + 1B-0/1B-1 調査完走 |
| 1B 実行方法 | 既存 output JSON (2026-04-18 14:24 curated) の静的分析のみ。`make backend-test-live-search` は走らせない |
| 記録先 | `docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md`（新規） |
| 観測性 | `backend/app/utils/secure_logger.py` 経由の JSON 構造化ログのみ。OTel / Prometheus は親計画の v5 候補 |
| Fallback mapping | capability class ベース（Claude Sonnet ↔ GPT-5.4/`gpt`、Claude Haiku ↔ GPT-mini） |
| Commit | 素の git で 2 コミット。`git push` は実行しない |

## コードレビュー反映履歴

本計画は策定中に 3 回のコードレビューを経ている。

### v2（一次レビュー、7 件反映）
- シグネチャ 2 引数 `(feature: str, provider: LLMProvider)` に統一
- feature キー名は `"es_review"`（`"es_review_main"` 存在せず）
- CircuitBreaker 二重状態（`llm.py` モジュールローカル vs `llm_client_registry.py` registry）の単一化
- `half_open` は未実装のためログスキーマから除外
- イベント配置分離（`llm.fallback.triggered` は `llm.py` 側、`llm.circuit.*` は CircuitBreaker 側）
- `_attempted_models` は存在せず、`disable_fallback=True` 再帰で 1 段 fallback
- Branch B の JSON ルートは object、結果は `.runs`、`RunRecord` に `company_id` なし

### v3（二次レビュー、9 件反映）
- A3 は 2 箇所（`call_llm_with_error:1252` と `call_llm_text_with_error:1459`）で統一
- A5 のログもテキスト経路が必要
- 裸 alias `"gpt"`（`model_interview_plan` 既定）を capability class で捕捉
- テストの feature 名は `gakuchika`（`gakuchika_question` 存在せず）
- `is_open()` 内の timeout reset も `llm.circuit.reset` ログ対象
- fallback 先 provider の `get_circuit_breaker(target).is_open()` チェック追加
- `pytest` の範囲を shared/llm 系に絞る
- failure_taxonomy の `A.1:empty_response` は DDG 由来と注記
- `commit-develop` skill は push を含むため素の git で実施

### v4（三次レビュー、設計簡素化）
- `backend/app/utils/llm_streaming.py:325, 436` も CircuitBreaker 呼び出し経路。wrapper 方式だと streaming 経路で観測性が漏れる
- **対応**: `CircuitBreaker` 自体に `provider: Optional[str]` と `was_open: bool` を持たせ、`record_failure` / `reset` 内で直接ログ。これで `llm.py` / `llm_streaming.py` 両方の既存呼び出しから自動で log が出る。streaming 側ファイルは変更不要
- A1 疑似コードの演算子優先度を括弧で明示、重複条件除去
- A5 `circuit_state` は「primary 側プロバイダの breaker 状態」と明記
- AC の grep assertion は誤検知しない表現に修正
- 子プラン docs/plan/ 保存を最初のタスクとして追加

## スコープ

### In（編集対象）

| # | ファイル | 変更内容 |
|---|---------|---------|
| A1 | `backend/app/utils/llm_model_routing.py` | `_capability_class(model)` 追加 |
| A2 | `backend/app/utils/llm_model_routing.py:149-151` | `_feature_cross_fallback_model(feature, provider)` を stub 解除 |
| A3-a | `backend/app/utils/llm.py:1252` | error_type filter を `{"billing"}` のみ除外に |
| A3-b | `backend/app/utils/llm.py:1459` | 同上（テキスト経路） |
| A4-a | `backend/app/utils/llm.py:81-82` | モジュールローカル `_anthropic_circuit` / `_openai_circuit` を削除、使用箇所を `get_circuit_breaker(...)` 経由へ |
| A4-b | `backend/app/utils/llm_client_registry.py` | `CircuitBreaker` に `was_open: bool` / `provider: Optional[str]` 追加。`record_failure` / `reset` 内で open/closed 遷移ログ。`LLMClientRegistry` default_factory で provider セット |
| A5-a | `backend/app/utils/llm.py` `call_llm_with_error` | fallback 実行直前に `llm.fallback.triggered` JSON ログ + `latency_ms` 計測 |
| A5-b | `backend/app/utils/llm.py` `call_llm_text_with_error` | 同上 |
| A6 | `backend/tests/shared/test_llm_model_routing.py` / `test_llm_fallback.py` / `test_llm_client_registry.py` | テスト追加 |
| B3 | `docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md` | 新規レポート |
| — | `docs/review/TRACKER.md` | company-info-search / ai-quality 行更新 |

### Out（触らない）

- Phase 1A-2（出力側ガードレール）、1A-3（labeled dataset）
- Phase 1B-2（実修正）、1B-3 / 1B-4
- OTel / Prometheus / gitleaks
- `backend/app/routers/company_info.py`（Phase 2 以降）
- `backend/app/utils/llm_prompt_safety.py`（1A-2）
- `npm run test:agent-pipeline` 等ハーネス検証
- live eval 実行（`make backend-test-live-search` を呼ばない）
- 親計画 `docs/plan/AI_QUALITY_IMPROVEMENT_PLAN.md` の status 更新
- `git push`

### 変更しないが影響を受けるファイル

- `backend/app/utils/llm_streaming.py` — A4-b の CircuitBreaker ログ設計により、ストリーミング経路の既存呼び出しから自動で log が出る。ただし破綻していないかを grep と pytest で確認

## 並列実行計画

Branch A（LLM 基盤）と Branch B（検索 FAIL 調査）はファイル・機能が独立 → 並列可。Branch 内部は依存順に直列。

```
Branch A（LLM 基盤）                       Branch B（検索 FAIL 調査）
├─ A1 capability class helper               ├─ B1 .runs[] 静的分析
├─ A2 _feature_cross_fallback_model         ├─ B2 原因三分岐判定
├─ A3 error_type filter 修正（2 箇所）     └─ B3 レポート作成
├─ A4-a Circuit 単一化
├─ A4-b Circuit イベントログ
├─ A5 fallback ログ + latency（2 関数）
└─ A6 テスト追加
                                       ▼
                    Z 2 コミット論理分割（push なし）
```

Claude 側の並列点:
- B1 の jq 集計と A1/A2 の Edit を同一メッセージ内で並列呼び出し
- A6 の pytest を `run_in_background` で実行しつつ B3 のレポートを書く

## Branch A 詳細

### A1: `_capability_class(model: str) -> Optional[str]`

- ファイル: `backend/app/utils/llm_model_routing.py`
- 判定ロジック（alias と実 ID 両対応、実装時に括弧で結合優先を明示）:

```python
def _capability_class(model: str) -> Optional[str]:
    m = (model or "").lower().strip()
    if not m:
        return None
    # Claude 系（Opus は将来的に別 tier 化する可能性があるため本計画では None）
    if "claude" in m:
        if "sonnet" in m:
            return "sonnet_tier"
        if "haiku" in m:
            return "haiku_tier"
        return None
    # GPT 系（裸 "gpt" / "gpt-5.4" / "gpt-5" は gpt5_tier）
    if "gpt" in m:
        if "mini" in m:
            return "gpt_mini_tier"
        if "nano" in m:
            return None  # mapping 対象外
        return "gpt5_tier"
    return None
```

- Gemini 系 alias は現状 feature 未使用 → None

### A2: `_feature_cross_fallback_model(feature, provider)`

- 既存シグネチャ `(feature: str, provider: LLMProvider) -> Optional[LLMModel]` を維持
- アルゴリズム:
  1. `get_model_config()[feature]` で primary alias 取得。feature が登録外なら None
  2. `_capability_class(primary)` で class 判定
  3. `provider` は「失敗した側」。反対プロバイダ alias を返す:
     - `sonnet_tier` on anthropic → `"gpt"` (openai)
     - `gpt5_tier` on openai → `"claude-sonnet"` (anthropic)
     - `haiku_tier` on anthropic → `"gpt-mini"` (openai)
     - `gpt_mini_tier` on openai → `"claude-haiku"` (anthropic)
     - それ以外 → None
  4. fallback 先プロバイダ `target_provider` のガード:
     - `_provider_has_api_key(target_provider)` が False → None
     - `get_circuit_breaker(target_provider).is_open()` が True → None（rate_limit 連打時のコスト抑止）

### A3: error_type filter 修正（2 箇所）

- `backend/app/utils/llm.py:1252` と `backend/app/utils/llm.py:1459`
- 変更: `error_type not in {"billing", "rate_limit", "network"}` → `error_type not in {"billing"}`
- 空応答 fallback 経路（1430 付近）は error_type ベースでないので対象外

### A4-a: CircuitBreaker 単一化

- `backend/app/utils/llm.py:81-82` のモジュールローカル `_anthropic_circuit` / `_openai_circuit` を削除
- 使用箇所を `get_circuit_breaker("anthropic")` / `("openai")` に書き換え
- 事前調査: `grep -rn "_anthropic_circuit\|_openai_circuit" backend/app/utils/llm.py backend/tests/` で既存参照を洗い出し
- テスト側で monkeypatch している箇所は `reset_registry()` / `set_registry()` に書き換え

### A4-b: CircuitBreaker にログ機能を組み込む

- ファイル: `backend/app/utils/llm_client_registry.py`
- 設計: **provider をフィールドに持たせ、`record_failure` / `reset` 内で直接ログを出す**。これにより `llm.py` / `llm_streaming.py` 両方の呼び出しから自動で log

```python
@dataclass
class CircuitBreaker:
    failures: int = 0
    last_failure: Optional[datetime] = None
    threshold: int = 3
    reset_timeout: timedelta = field(default_factory=lambda: timedelta(minutes=5))
    was_open: bool = False
    provider: Optional[str] = None  # registry がセット。ログ識別用

    def is_open(self) -> bool:
        if self.failures < self.threshold:
            return False
        if (self.last_failure
            and datetime.now() - self.last_failure > self.reset_timeout):
            self.reset()
            return False
        return True

    def record_failure(self) -> None:
        self.failures += 1
        self.last_failure = datetime.now()
        if self.failures >= self.threshold and not self.was_open:
            self.was_open = True
            self._emit("llm.circuit.open")

    def record_success(self) -> None:
        self.reset()

    def reset(self) -> None:
        was_prev_open = self.was_open
        self.failures = 0
        self.last_failure = None
        self.was_open = False
        if was_prev_open:
            self._emit("llm.circuit.reset")

    def _emit(self, event: str) -> None:
        # 循環依存を避けるため遅延 import
        from app.utils.secure_logger import get_logger
        import json
        get_logger(__name__).info(json.dumps({
            "event": event,
            "provider": self.provider,
            "failures": self.failures,
            "threshold": self.threshold,
        }))
```

- `LLMClientRegistry` の default_factory で provider を指定:

```python
anthropic_circuit: CircuitBreaker = field(
    default_factory=lambda: CircuitBreaker(provider="anthropic")
)
openai_circuit: CircuitBreaker = field(
    default_factory=lambda: CircuitBreaker(provider="openai")
)
```

- **この方式により `llm_streaming.py:325, 436` の既存 `record_success()` / `record_failure()` 呼び出しからも自動で log が出る**（streaming 側ファイル変更不要）

### A5: fallback ログ + latency 計測（2 関数）

- `call_llm_with_error`（L1249-1284）と `call_llm_text_with_error`（L1457-1486）
- 共通 helper を `llm.py` module 内に追加:

```python
def _emit_fallback_event(
    feature: str,
    primary_model: str,
    selected_model: str,
    failure_reason: str,
    latency_ms: int,
    primary_provider: str,  # 失敗した側 provider の breaker 状態を circuit_state に入れる
) -> None:
    import json
    from app.utils.secure_logger import get_logger
    from app.utils.llm_client_registry import get_circuit_breaker
    get_logger(__name__).info(json.dumps({
        "event": "llm.fallback.triggered",
        "feature": feature,
        "primary_model": primary_model,
        "selected_model": selected_model,
        "failure_reason": failure_reason,
        "latency_ms": latency_ms,
        "circuit_state": "open" if get_circuit_breaker(primary_provider).is_open() else "closed",
    }))
```

- 各関数の実装手順:
  1. 関数冒頭で `start = time.monotonic()`
  2. API エラー except 捕捉時 `latency_ms = int((time.monotonic() - start) * 1000)`
  3. `fallback_model` が非 None と判明した直後、`disable_fallback=False` の条件内で `_emit_fallback_event(...)` を呼ぶ
- `circuit_state` は **primary 側プロバイダ**（失敗した側）の状態。fallback 先ではない旨を helper 関数 docstring に 1 行コメント
- `open` / `closed` のみ（`half_open` 未実装）

### A6: テスト追加

3 ファイル新規 or 追記。

**`test_llm_model_routing.py`**:
- `_capability_class`: `"claude-sonnet"` / `"claude-sonnet-4-6"` / `"claude-haiku"` / `"claude-haiku-4-5-20251001"` / `"gpt"` / `"gpt-5.4"` / `"gpt-5"` / `"gpt-mini"` / `"gpt-5.4-mini"` / `"gpt-nano"` / `"gemini"` / `""` / `"unknown"` で期待値
- `_feature_cross_fallback_model`:
  - `("es_review", "anthropic")` → `"gpt"` 系
  - `("interview_plan", "openai")` → `"claude-sonnet"`
  - `("interview", "anthropic")` → `"gpt-mini"`（primary `claude-haiku`）
  - `("gakuchika", "openai")` → `"claude-haiku"`（primary `gpt-mini`）
  - openai key 未設定 + anthropic 発 → None（monkeypatch `settings.openai_api_key=""`）
  - openai circuit が open + anthropic 発 → None
  - 登録外 feature → None

**`test_llm_fallback.py`**:
- JSON 経路 (`call_llm_with_error`): Anthropic 呼び出しを `AnthropicAPIError(network)` / `(rate_limit)` / `(api)` / `(server)` で monkeypatch、fallback に到達
- テキスト経路 (`call_llm_text_with_error`): 同じケース
- `disable_fallback=True` で fallback 発火しないこと
- fallback ログが 1 行出て、期待 7 フィールド（`event`, `feature`, `primary_model`, `selected_model`, `failure_reason`, `latency_ms`, `circuit_state`）を含む

**`test_llm_client_registry.py`**:
- `CircuitBreaker(provider="anthropic")` で `record_failure` × 3 回 → `llm.circuit.open` が **1 回だけ**（caplog、`"provider":"anthropic"` 含む）
- `record_success` で `llm.circuit.reset` が 1 回
- `is_open()` 経由の timeout reset で `llm.circuit.reset` が 1 回（`last_failure` を過去にし `is_open()` 呼ぶ）
- `was_open=False` 状態で `reset()` を呼んでもログ出ない
- `llm.py` module attribute に `_anthropic_circuit` / `_openai_circuit` が無いこと

## Branch B 詳細

### B1: `.runs[]` 静的分析

```bash
FILE=backend/evals/company_info_search/output/live_company_info_search_20260418_142454_curated.json

# 全体把握
jq '.meta | {generated_at, duration_seconds, rate_limiter, snapshot_cache, company_source}' $FILE
jq '.summary | {overall, recruitment, corporate, gate_summary: .gate_summary.checks}' $FILE
jq '.runs | length' $FILE

# 候補空・エラー分布
jq '[.runs[] | select(.candidates == [])] | length' $FILE
jq '[.runs[] | select(.error != null)] | length' $FILE
jq '[.runs[] | select(.error != null) | .error] | group_by(.) | map({error:.[0], count:length}) | sort_by(-.count) | .[:10]' $FILE

# エラーなし + candidates 空 の内訳（mode/kind/industry）
jq '[.runs[] | select(.error == null and (.candidates|length) == 0) | {mode, kind, industry}] | group_by(.kind) | map({kind:.[0].kind, count:length}) | sort_by(-.count)' $FILE

# サンプル
jq '[.runs[] | select(.error != null)] | .[0]' $FILE
jq '[.runs[] | select(.error == null and (.candidates|length) == 0)] | .[0]' $FILE
```

### B2: 原因三分岐判定

- (a) `record.error != null` → API エラー系 または **Python 例外（ロジックバグ）**
- (b) `record.error == null && candidates == []` → 検索 0 件 / インデックス未構築 / 呼び出しがスキップ
- (c) `candidates != []` かつ grade FAIL → 検索ロジック / ランキング / フィルタリング問題
- 分岐 (a) の error メッセージ内容を必ず分類し、ネットワーク系かロジック例外かを切り分ける

**注記**: `failure_taxonomy.py` の `A.1:empty_response` は DDG 由来の歴史的記述。現行実装は `candidates` / `raw` / `error` をもとに判定するハイブリッド評価ベース。

### B3: 調査レポート作成

- ファイル: `docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md`（新規）
- 構成 6 セクション（実事実ベースで 200〜600 行、事実が薄い場合は短くて良い）:
  1. **Summary**（3 行以内）
  2. **再現手順** — `make backend-test-live-search LIVE_SEARCH_SAMPLE_SIZE=10 LIVE_SEARCH_USE_CURATED=true` を軽量再現として記載。本調査は live 再実行していない旨明記
  3. **Primary Gate 定義** — 6 ゲート閾値（`config.py` 引用）
  4. **直近実測の静的分析** — B1 の数値・error 分布・サンプル
  5. **原因三分岐の判定結果** — B2 の結論 + taxonomy ラベル由来注記
  6. **次アクション候補** — 分岐別の 1B-2 修正範囲見積もり

## Z: コミット

手順（素の git、push なし）:

```bash
# 事前
git fetch origin develop     # AC-Z-2 の比較元を最新化
git status
git diff --stat

# Branch A コミット
git add backend/app/utils/llm_model_routing.py \
        backend/app/utils/llm.py \
        backend/app/utils/llm_client_registry.py \
        backend/tests/shared/test_llm_model_routing.py \
        backend/tests/shared/test_llm_fallback.py \
        backend/tests/shared/test_llm_client_registry.py
git commit -m "feat(llm): implement cross-provider fallback + circuit observability (1A-1)"

# Branch B コミット（本計画 + 調査レポート + TRACKER）
git add docs/plan/AI_QUALITY_IMPROVEMENT_PHASE1A1_1B01_PLAN.md \
        docs/review/company-info-search/2026-04-19-primary-gate-fail-investigation.md \
        docs/review/TRACKER.md
git commit -m "docs: record Primary Gate FAIL investigation + child plan (1B-0/1B-1)"

# 検証
git log origin/develop..HEAD --oneline   # 2 行
git diff --stat HEAD~2..HEAD~1            # backend のみ
git diff --stat HEAD~1..HEAD              # docs のみ
```

- `commit-develop` skill は使わない（push を含むため）
- `git add -A` / `git add .` は使わない（既存 uncommitted 変更を巻き込まないため）

## Critical Files 一覧

### 読むだけ（実装時に再読）

- `backend/app/utils/llm_model_routing.py` 全体（167 行、特に `_build_model_config` L19-34、`_resolve_model_target`、`_provider_has_api_key` L141-146）
- `backend/app/utils/llm.py` L75-90（モジュールローカル circuit）、L1249-1284（JSON 経路）、L1457-1486（テキスト経路）
- `backend/app/utils/llm_client_registry.py` 全体（136 行）
- `backend/app/utils/llm_streaming.py` L23 / L262 / L325 / L436（CircuitBreaker 呼び出し、A4-b で自動対応）
- `backend/app/utils/secure_logger.py` 先頭（`get_logger(name)` のシグネチャ）
- `backend/app/config.py` L170-207（feature-model マッピング、`"gpt"` 裸 alias 含む）
- `backend/evals/company_info_search/models.py:135-152`（`RunRecord` 定義）
- `backend/evals/company_info_search/failure_taxonomy.py`
- `backend/evals/company_info_search/config.py`（6 ゲート閾値）
- `output/live_company_info_search_20260418_142454_curated.json` の `.meta` / `.summary` / `.runs`

## 受入基準（AC）

### Branch A

- AC-A-1: `_capability_class` が 13 種類の alias / 実 ID で期待値を返す
- AC-A-2: `_feature_cross_fallback_model` が 4 組の capability mapping と 2 組のガード（API key / circuit open）で期待値を返す
- AC-A-3: `grep -n '{"billing", "rate_limit", "network"}' backend/app/utils/llm.py` が空、`grep -n '{"billing"}' backend/app/utils/llm.py` が 2 行ヒット
- AC-A-4: `grep -n '_anthropic_circuit\|_openai_circuit' backend/app/utils/llm.py` が空
- AC-A-5: CircuitBreaker の open 遷移で `llm.circuit.open` が 1 回、closed 遷移（手動 reset / 自動 reset）で `llm.circuit.reset` が 1 回だけ出る（caplog）
- AC-A-6: fallback 発火時に `llm.fallback.triggered` JSON が JSON 経路・テキスト経路 **両方** で 1 行出て、7 フィールドを含む。`circuit_state` は primary 側 breaker の open/closed のみ
- AC-A-7: `cd backend && pytest tests/shared/test_llm_model_routing.py tests/shared/test_llm_fallback.py tests/shared/test_llm_client_registry.py -v` が全 pass
- AC-A-8: `cd backend && pytest tests/shared/ -v` が退行ゼロ。repo 全体テストは CI に委ねる

### Branch B

- AC-B-1: レポートが 6 セクション構成で存在
- AC-B-2: `.runs` 総数 / candidates 空率 / error 分布 / mode・kind 分布の集計数値を記載
- AC-B-3: 原因三分岐の結論（どの分岐が何 %）
- AC-B-4: 次アクション候補（分岐別 1B-2 修正範囲）
- AC-B-5: TRACKER.md 更新
- AC-B-6: taxonomy A.1 ラベルの由来注記

### 全体

- AC-Z-1: 2 コミットが作られ、それぞれ Branch A / B のファイル群のみ
- AC-Z-2: `git log origin/develop..HEAD --oneline` が 2 行（事前 `git fetch origin develop` 済み）。`git push` は実行されていない
- AC-Z-3: `git diff --stat HEAD~2..HEAD~1` が backend のみ、`HEAD~1..HEAD` が docs のみ

## エンドツーエンド検証

```bash
# Branch A: 各テスト
cd backend && pytest tests/shared/test_llm_model_routing.py -v
cd backend && pytest tests/shared/test_llm_fallback.py -v
cd backend && pytest tests/shared/test_llm_client_registry.py -v
cd backend && pytest tests/shared/ -v   # 退行チェック

# Branch A: 単一化確認
grep -n '{"billing", "rate_limit", "network"}' backend/app/utils/llm.py   # 空
grep -n '{"billing"}' backend/app/utils/llm.py                              # 2 行
grep -n '_anthropic_circuit\|_openai_circuit' backend/app/utils/llm.py      # 空

# Branch B: 分析再現性
FILE=backend/evals/company_info_search/output/live_company_info_search_20260418_142454_curated.json
jq '.runs | length' $FILE
jq '[.runs[] | select(.candidates == [])] | length' $FILE
jq '[.runs[] | select(.error != null)] | length' $FILE

# コミット後
git fetch origin develop
git log origin/develop..HEAD --oneline   # 2 行
git diff --stat HEAD~2..HEAD~1
git diff --stat HEAD~1..HEAD
```

## リスク評価

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| A3 で `rate_limit` 連打時のコスト増 | 中 | 中 | A2 の circuit open ガード + `disable_fallback=True` 再帰で 1 段のみ |
| A4-a で既存テストの `_anthropic_circuit` monkeypatch が壊れる | 中 | 中 | 事前 `grep -rn` で依存を洗い、`reset_registry()` / `set_registry()` に書き換え |
| A4-b の遅延 import で循環依存 | 低 | 低 | `_emit` 内の遅延 import で回避 |
| A5 の 2 経路でログ shape がズレる | 低 | 低 | `_emit_fallback_event` 共通ヘルパで吸収 |
| B1 の jq 処理時間（12M JSON） | 低 | 低 | 全ロードで十分。`--stream` 不要 |
| 素 git で既存 uncommitted を巻き込む | 中 | 中 | `git add <file>` でファイル明示。`git add -A` / `git add .` 禁止 |
| `git fetch origin develop` をし忘れて `origin/develop..HEAD` が古い比較になる | 低 | 低 | 手順に fetch を明記 |

## 参考

- 親計画: [`docs/plan/AI_QUALITY_IMPROVEMENT_PLAN.md`](AI_QUALITY_IMPROVEMENT_PLAN.md)
- 実行順序: [`docs/plan/EXECUTION_ORDER.md`](EXECUTION_ORDER.md)
- 包括評価: [`docs/review/ai_quality_comprehensive_20260419.md`](../review/ai_quality_comprehensive_20260419.md)
- レビュー履歴（2026-04-19）: v2 一次（7 件）/ v3 二次（9 件）/ v4 三次（streaming 経路 + 設計簡素化）
