# backend `os.getenv` 直読みの config.py 統合 改善計画

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


作成日: 2026-05-18 JST
ステータス: 改善計画（実装は承認後）
対象: `backend/app/` の `os.getenv` 直読み ~13 変数 → `backend/app/config.py` Pydantic Settings 統合

---

## 目次

1. [背景・課題](#1-背景課題)
2. [ゴール / 非ゴール](#2-ゴール--非ゴール)
3. [対象変数 完全表](#3-対象変数-完全表)
4. [Pydantic v2 雛形](#4-pydantic-v2-雛形)
5. [呼出側置換方針](#5-呼出側置換方針)
6. [段階 P1-P6](#6-段階-p1-p6)
7. [検証戦略（最重要）](#7-検証戦略最重要)
8. [drift C4 整合・リスク表・委譲方針](#8-drift-c4-整合リスク表委譲方針)
9. [Task Tracker](#9-task-tracker)

---

## 1. 背景・課題

`backend/app/config.py` は既に Pydantic Settings（`class Settings(BaseSettings)`、`get_settings()` を `@lru_cache` でシングルトン化）で大半の設定を集約している。しかし reranker / gakuchika / web_search / LLM cost / health の各モジュールに `os.getenv` 直読みが ~13 変数残存しており、以下の課題がある:

- **保守性**: 設定の所在が分散し、どの env がどこで読まれるか一望できない。
- **型安全**: clamp・bool 解釈・JSON parse が各所で素朴に実装され、解釈差が起きうる。
- **drift 整合（C4）**: 直読み変数は drift checker のテンプレート照合（Next/FastAPI/CI/provider の service-scoped 比較）に乗らず、`.env.example` / `scripts/release/secrets-examples/**` との過不足検出から漏れる。
- **テスト容易性**: 直読みは `monkeypatch.setenv` + `importlib.reload` / `lru_cache.cache_clear()` が必要で、characterization テストが書きにくい。

**重要な制約**: `backend/app/config.py` は **611 行で既に 500 行超**（Codex medium）。本統合で行数を増やすが、Next/Vercel/DB schema の責務は一切寄せない。drift 監査も「全サービス同一」前提ではなく **service-scoped**（Next / FastAPI / CI / provider template を別系統で比較）にする。config.py が更に肥大化しないよう、JSON override 等の重いロジックは config.py には raw string 取得のみ置き、parse は呼出側の `@lru_cache` 内に残す方針とする。

---

## 2. ゴール / 非ゴール

### ゴール

- **behavior-preserving 絶対要件**: 統合後、各変数の解釈結果（default・clamp・bool・JSON・三状態）が統合前と**完全一致**する。production の挙動を一切変えない。
- ~13 変数を `config.py` の `Settings` に集約（または明示化/移設/除外を理由付きで決定）し、所在を一望可能にする。
- service-scoped drift checker の照合対象に含める（FastAPI service の env として `.env.example` documented にする必要があるものを特定）。
- characterization テストで等価性を機械担保する。

### 非ゴール

- `TOKENIZERS_PARALLELISM`（`backend/app/utils/reranker.py:15` の `os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")`）は **config 化しない**。これは `from sentence_transformers import CrossEncoder` の import 副作用を抑えるための環境変数で、Settings インスタンス生成より前（プロセス起動最初期）に効いている必要がある。Pydantic Settings に載せると評価タイミングが遅れ、tokenizer の fork 警告抑止が効かなくなる。**`backend/app/main.py` の先頭に `os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")` を移設**し、`reranker.py:15` の `setdefault` は冪等な二重防御として残置する（後勝ちにならず、両方 `setdefault` なので安全）。
- Next/Vercel/DB schema 関連 env を FastAPI config.py に寄せない（責務分離。Codex medium）。
- `backend/app/prompts/**` は本タスク対象外（プロンプト品質変更を伴わない）。

---

## 3. 対象変数 完全表

| 変数 | 現箇所:行 | default | 型/clamp | 用途 | 統合方針 | 本番強制 validation |
|---|---|---|---|---|---|---|
| `RERANKER_VARIANT` | `backend/app/utils/reranker.py:223` | `"base"` | str（`.strip().lower()`、`RERANKER_VARIANTS` 外は `"base"`） | reranker variant 選択（base/ab/tuned） | **統合**（単純 str + 正規化を field_validator） | 含めない（tuning 用 optional） |
| `RERANKER_AB_TUNED_RATIO` | `backend/app/utils/reranker.py:230` | `0.5` | float、`max(0.0, min(1.0, x))`、parse 失敗→`0.5` | AB ルーティングの tuned 比率 | **統合**（clamp float、parse 失敗→default） | 含めない（tuning 用） |
| `RERANKER_BASE_MODEL` | `backend/app/utils/reranker.py:243` | `DEFAULT_CROSS_ENCODER_MODEL` | str（`.strip()`） | base cross-encoder モデル名 | **統合**（default は reranker 側定数を参照） | 含めない |
| `RERANKER_TUNED_MODEL_PATH` | `backend/app/utils/reranker.py:244` | `""` | str（`.strip()`） | tuned モデルのパス | **統合**（空文字 default、未設定=base fallback 維持） | 含めない |
| `GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY` | `backend/app/normalization/gakuchika_payload.py:79` | `MIN_USER_ANSWERS_FOR_ES_DRAFT_READY`（定数） | int、`isdigit()` 厳格、`max(1, min(10, n))` | ES draft-ready 最小回答数 override | **統合**（条件付 int: `isdigit` 時のみ clamp、それ以外 default） | 含めない（per-user override / optional） |
| `GAKUCHIKA_FORCE_DRAFT_READY_AFTER` | `backend/app/normalization/gakuchika_payload.py:98` | `0`（無効） | int、`isdigit() and >0` のとき採用、else `0` | CI/E2E 用 draft-ready 強制 | **統合**（条件付 int、`>0` のみ有効） | 含めない（CI/E2E 用、本番未設定） |
| `GAKUCHIKA_LOOP_SIMILARITY_THRESHOLD` | `backend/app/utils/question_loop_detector.py:59` | 呼出側引数 `threshold`（`SIMILARITY_THRESHOLD`） | float、空でないとき `float()`、parse 失敗時は引数 default 維持 | 質問ループ検出の類似度閾値 | **統合**（三状態 `Optional[float]=None`、未設定=引数 default 維持） | 含めない（tuning 用） |
| `AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES` | `backend/app/normalization/gakuchika_payload.py:87` | 未設定（cap=6） | bool 厳密（`.strip() == "1"`）、true→cap=5 | local AI live E2E の gate 緩和 | **統合**（bool 厳密一致 `== "1"`） | 含めない（local E2E 専用） |
| `WEB_SEARCH_DEBUG_PRINT` | `backend/app/utils/web_search.py:75` | false | bool（`_env_flag()` の真理値判定） | web search デバッグ print | **統合**（既存 `web_search_debug` と並列の bool field。`_env_flag` 真理値同値を証明） | 含めない（debug 用） |
| `LLM_PRICE_OVERRIDES_JSON` | `backend/app/utils/llm_usage_cost.py:115` | `{}`（空時） | JSON raw string（`@lru_cache` 内で parse） | LLM 価格 override | **明示化**（config は raw string 取得のみ。parse は `_load_price_overrides()` の `@lru_cache` 内に継続。silent ignore 動作保持） | 含めない |
| `LLM_CALL_BUDGET_OVERRIDES_JSON` | `backend/app/utils/llm_usage_cost.py:399` | `{}`（空時） | JSON raw string（`@lru_cache` 内で parse） | LLM 呼出予算 override | **明示化**（同上。config は raw string のみ、parse は呼出側 lru_cache 内） | 含めない |
| `BUILD_TIME` | `backend/app/routers/health.py:14` | `None` | str or None | health の build time 表示 | **統合**（`Optional[str]=None`） | 含めない（observability 表示） |
| `APP_ENV` | `backend/app/routers/health.py:15` | `os.getenv("ENVIRONMENT")` fallback | str or None（`APP_ENV` → `ENVIRONMENT` fallback） | health の環境表示 | **統合**（既存 `environment` field の AliasChoices に `APP_ENV` を追加検討、または health 専用 `Optional[str]`。既存 `environment` は `ENVIRONMENT`/`RAILWAY_ENVIRONMENT_NAME` alias 済み） | 含めない（observability 表示） |
| `TOKENIZERS_PARALLELISM` | `backend/app/utils/reranker.py:15` | `"false"`（`setdefault`） | str（import 副作用） | tokenizer fork 警告抑止 | **除外（移設）**: config 化せず `main.py` 先頭へ `setdefault` 移設。`reranker.py:15` は冪等二重防御で残置 | 含めない（import 副作用） |

注: 表は 13 行（`TOKENIZERS_PARALLELISM` 含む）。`RERANKER_*`/`GAKUCHIKA_*` は **optional / tuning** 用途のため本番強制 validation には含めない（誤って本番起動を止めないため）。

---

## 4. Pydantic v2 雛形

`config.py` の既存パターン（`Field` + `AliasChoices` + `field_validator`、`get_settings()` の `@lru_cache`）に合わせる。**config.py を肥大化させないため JSON override は raw string 取得のみ**。

```python
# --- 単純 str（正規化あり）---
reranker_variant: str = Field(
    default="base",
    validation_alias=AliasChoices("RERANKER_VARIANT"),
)

@field_validator("reranker_variant", mode="before")
@classmethod
def _normalize_reranker_variant(cls, v: object) -> str:
    s = str(v or "base").strip().lower()
    return s  # RERANKER_VARIANTS 外の base フォールバックは呼出側ロジックを維持

# --- clamp float（parse 失敗→default）---
reranker_ab_tuned_ratio: float = Field(
    default=0.5,
    validation_alias=AliasChoices("RERANKER_AB_TUNED_RATIO"),
)

@field_validator("reranker_ab_tuned_ratio", mode="before")
@classmethod
def _clamp_ratio(cls, v: object) -> float:
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, f))

# --- 条件付 int（isdigit 厳格、未設定/不正→None で呼出側 default 維持）---
gakuchika_min_user_answers_for_es_draft_ready: int | None = Field(
    default=None,
    validation_alias=AliasChoices("GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY"),
)

@field_validator("gakuchika_min_user_answers_for_es_draft_ready", mode="before")
@classmethod
def _strict_digit_clamp(cls, v: object) -> int | None:
    s = str(v or "").strip()
    if s.isdigit():
        return max(1, min(10, int(s)))
    return None  # 呼出側で None → MIN_USER_ANSWERS_FOR_ES_DRAFT_READY 定数を使う

# --- JSON raw string（parse は呼出側 lru_cache 内に継続）---
llm_price_overrides_json: str = Field(
    default="",
    validation_alias=AliasChoices("LLM_PRICE_OVERRIDES_JSON"),
)
# config は raw string のみ保持。_load_price_overrides() の @lru_cache 内で
# json.loads を継続し、parse 失敗時の silent ignore 動作を保持する。

# --- bool 厳密一致（== "1"）---
ai_live_local_relax_gakuchika_gates: bool = Field(
    default=False,
    validation_alias=AliasChoices("AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES"),
)

@field_validator("ai_live_local_relax_gakuchika_gates", mode="before")
@classmethod
def _strict_one(cls, v: object) -> bool:
    return str(v or "").strip() == "1"

# --- 三状態 Optional[float]（未設定=呼出側引数 default 維持）---
gakuchika_loop_similarity_threshold: float | None = Field(
    default=None,
    validation_alias=AliasChoices("GAKUCHIKA_LOOP_SIMILARITY_THRESHOLD"),
)

@field_validator("gakuchika_loop_similarity_threshold", mode="before")
@classmethod
def _opt_float(cls, v: object) -> float | None:
    s = str(v or "").strip()
    if not s:
        return None  # 呼出側で None → 引数 threshold (SIMILARITY_THRESHOLD) を維持
    try:
        return float(s)
    except (TypeError, ValueError):
        return None  # parse 失敗時も引数 default に倒す（現挙動: 失敗時 threshold 維持）

# --- Optional[str]（health 表示）---
build_time: str | None = Field(
    default=None,
    validation_alias=AliasChoices("BUILD_TIME"),
)
```

設計上の注意:
- **三状態（`Optional` で「未設定 vs 設定」を保持）が潰れないこと**が最重要。`gakuchika_loop_similarity_threshold` / `gakuchika_min_user_answers_for_es_draft_ready` は「未設定なら呼出側の既定（引数 / 定数）を使う」現挙動を `None` で表現する。`0.0` や `0` を default にすると未設定との区別が失われ挙動が変わる。
- JSON override（`LLM_*_JSON`）は config.py に parse ロジックを置かない。`@lru_cache` 内 parse の維持で、(1) config.py の肥大化回避、(2) `json.loads` 失敗時の silent ignore（`return {}`）動作の保持、を両立する。
- `field_validator(mode="before")` で env raw 値を受け、Pydantic の型強制（coercion）に乗る前に現行ロジックと同一の解釈をする。Pydantic 既定の bool coercion（`"true"`/`"yes"` 等も True）に流すと `== "1"` 厳密判定と差が出るため、bool は必ず `mode="before"` で文字列比較する。

---

## 5. 呼出側置換方針

各呼出側を `os.getenv(...)` から `from app.config import settings; settings.<field>` に置換する。影響ファイル:

| ファイル | 置換内容 |
|---|---|
| `backend/app/utils/reranker.py` | `:223,230,243,244` の 4 箇所を `settings.reranker_*` に。`:15` の `TOKENIZERS_PARALLELISM` setdefault は **残置**（移設は main.py 側） |
| `backend/app/normalization/gakuchika_payload.py` | `:79,87,98` の 3 関数を `settings.gakuchika_*` 参照に。`None`/`False` のとき従来の定数（`MIN_USER_ANSWERS_FOR_ES_DRAFT_READY` 等）/ cap=6 にフォールバックするロジックを呼出側に残す |
| `backend/app/utils/question_loop_detector.py` | `:59` を `settings.gakuchika_loop_similarity_threshold` 参照に。`None` のとき引数 `threshold`（`SIMILARITY_THRESHOLD`）維持 |
| `backend/app/utils/web_search.py` | `:75` の `WEB_SEARCH_DEBUG_PRINT = _env_flag(...)` を `settings.web_search_debug_print` に。`_env_flag` の真理値集合と Pydantic field の真理値が同値であることを §7 で証明してから置換 |
| `backend/app/utils/llm_usage_cost.py` | `:115,399` の `os.getenv("LLM_*_JSON","").strip()` を `settings.llm_*_json` に（raw string）。`@lru_cache` + `json.loads` + `return {}` は不変 |
| `backend/app/routers/health.py` | `:14,15` を `settings.build_time` / `settings.<env field>` に。`APP_ENV`→`ENVIRONMENT` fallback は AliasChoices で表現するか health 専用 field の validator で再現 |
| `backend/app/main.py` | **先頭に** `os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")` を追加（import 副作用の早期確定。冪等二重防御で `reranker.py:15` も残す） |

TOKENIZERS_PARALLELISM 移設設計（冪等二重防御）:
- `main.py` 先頭（他 import より前）に `os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")` を置く。
- `reranker.py:15` の `setdefault` は残す。`setdefault` は既存値を上書きしないため、main.py が先に設定済みなら reranker 側は no-op。どちらの import 順でも最終値は `"false"`（明示設定があればそれを尊重）で挙動不変。

---

## 6. 段階 P1-P6

各 Phase は独立にロールバック可能（`git revert` 単位）。behavior-preserving を Phase ごとに characterization テストで担保する。

| Phase | 内容 | ロールバック |
|---|---|---|
| **P1** | `RERANKER_*`（4 変数）を config 統合 + 呼出側置換 + 等価テーブルテスト | revert（reranker.py + config.py） |
| **P2** | `GAKUCHIKA_*` 3 変数 + `AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES` を config 統合 + 呼出側置換（三状態 None フォールバック維持）+ 境界テスト | revert |
| **P3** | `LLM_PRICE_OVERRIDES_JSON` / `LLM_CALL_BUDGET_OVERRIDES_JSON` を raw string 明示化（parse は lru_cache 内維持）+ silent ignore 同値テスト | revert |
| **P4** | `BUILD_TIME` / health の env 表示を config 統合 + `WEB_SEARCH_DEBUG_PRINT` 統合（真理値同値証明後）| revert |
| **P5** | `TOKENIZERS_PARALLELISM` を `main.py` 先頭へ移設（冪等二重防御）。reranker.py:15 残置 | revert（main.py 1 行） |
| **P6** | cleanup（不要 `import os` 整理、`.env.example` / `secrets-examples` への documented 反映、drift green 確認） | revert |

---

## 7. 検証戦略（最重要）

統合の本質は「**解釈結果の完全等価**」であり、検証戦略が本計画の中核。

### 7.1 characterization / 等価テーブルテスト

各変数について、統合前ロジックと統合後 `settings.<field>` + 呼出側フォールバックが同一結果を返すことを境界値テーブルでテストする。境界:

| ケース | 例 |
|---|---|
| 未設定 | env 削除 → default / 三状態 None フォールバック |
| 空文字 | `""` → 各実装の空扱い |
| 正常値 | `RERANKER_VARIANT=ab`, `RERANKER_AB_TUNED_RATIO=0.3`, `GAKUCHIKA_MIN_..._READY=4` |
| clamp 範囲内/外 | `RERANKER_AB_TUNED_RATIO=-1`→0.0, `=2`→1.0, `GAKUCHIKA_MIN_..._READY=0`→clamp 後 1, `=99`→10（`isdigit` 厳格）|
| 不正値 | `RERANKER_AB_TUNED_RATIO=abc`→0.5, `GAKUCHIKA_MIN_..._READY=4.5`（`isdigit` False）→None→定数 |
| bool 集合 | `AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES` に `1`/`0`/`true`/`True`/` 1 `/空。`==\"1\"` 厳密のため `true` は False 維持 |
| JSON 不正 | `LLM_PRICE_OVERRIDES_JSON={bad json` → `json.loads` 失敗 → `return {}`（silent ignore 保持）|

テストは `monkeypatch.setenv` / `monkeypatch.delenv` で env を制御し、統合前後の関数（`_min_user_answers_for_es_draft_ready()` 等）と新実装の出力が一致することを assert する（黄金値比較）。

### 7.2 lru_cache / importlib.reload の落とし穴

- `get_settings()` は `@lru_cache`。env を変えてテストするには `get_settings.cache_clear()` を各ケースで呼ぶ（または DI で `Settings(...)` を直接生成して field validator を検証）。
- `_load_price_overrides()` / `_load_budget_overrides()` も `@lru_cache(maxsize=1)`。env 変更テストでは両方の `cache_clear()` が必要。**lru_cache を clear し忘れると偽陰性**（前ケースの結果が残り「等価」に見える）になる。テストヘルパで全関連 cache を一括 clear する fixture を用意する。
- `os.getenv` 直読みを参照する既存モジュールは import 時評価ではなく呼出時評価のものが多いが、`web_search.py:75` の `WEB_SEARCH_DEBUG_PRINT` は **module-level 定数**（import 時に確定）。これを `settings.web_search_debug_print` に置換すると評価タイミングが import 時 → settings 生成時に変わる。settings は `get_settings()` が最初に呼ばれた時点で確定するため、テストでは `importlib.reload(web_search)` で再評価が必要になりうる。置換時はこの評価タイミング差が観測挙動に影響しないことを確認する。

### 7.3 WEB_SEARCH_DEBUG 真理値同値証明

`web_search.py:75` は `_env_flag("WEB_SEARCH_DEBUG_PRINT")` を使う。`_env_flag` の真理値集合（どの文字列を True とみなすか）を抽出し、Pydantic field の `field_validator` がそれと**完全同値**になるよう実装する。`_env_flag` が `1`/`true`/`yes` 等を True とするなら field validator も同集合にする（既存 `web_search_debug` field の解釈と揃える）。同値性を真理値テーブルテストで証明してから置換する。

### 7.4 staging 実機検証

local の characterization テスト後、staging で以下の実挙動を確認:

- **RERANKER AB routing**: `RERANKER_VARIANT=ab` + `RERANKER_AB_TUNED_RATIO` で tuned/base の振り分けが統合前後で同一（`_stable_bucket` ベースの決定性が保たれる）。
- **GAKUCHIKA gate**: `GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY` / `FORCE_DRAFT_READY_AFTER` の draft-ready 判定が同一。
- **health version**: `/health` の build time / 環境表示が `BUILD_TIME` / `APP_ENV`(→`ENVIRONMENT` fallback) で統合前と同一文字列。

### 7.5 受け入れ基準

1. 全対象変数の等価テーブルテストが green（境界 7 ケース網羅）。
2. `pytest` 全体 green、`make backend-test-coverage` 退行なし。
3. staging 実機で RERANKER AB routing / GAKUCHIKA gate / health version が統合前と同一挙動。
4. `npm run check:env-drift`（service-scoped）が "no drift"。
5. production 設定での挙動が一切変わらない（characterization テストで固定）。

---

## 8. drift C4 整合・リスク表・委譲方針

### 8.1 drift C4 整合

drift checker は service-scoped（Next / FastAPI / CI / provider template を別系統で比較）で運用する。

- `AliasChoices` の **Tier1（=`.env.example` に documented 必要）** は、本番起動に必要な変数。本計画の対象は **optional / tuning / debug / observability** が大半のため、ほとんどは documented 必須ではない。ただし FastAPI service の env として `.env.example` / `scripts/release/secrets-examples/**` に「存在しうる env」として記載することで service-scoped drift の照合対象に乗せ、過不足検出から漏れないようにする。
- どの変数を documented とするかは Phase 6 で `check:env-drift` service-scoped 結果を見て確定する。tuning 系（`RERANKER_*`/`GAKUCHIKA_*`）は「optional・本番未設定」コメント付きで記載し、本番強制 validation には入れない。

### 8.2 リスク表

| # | リスク | 内容 | 緩和 |
|---|---|---|---|
| RK1 | 型 coercion 差 | Pydantic 既定の bool/number coercion が `== "1"` 厳密判定や `isdigit` 厳格と差を生む | 全 bool/conditional-int を `field_validator(mode="before")` で文字列比較。coercion に流さない |
| RK2 | 三状態潰れ | `Optional` を `0`/`0.0`/`False` default にすると「未設定 vs 設定」が消え挙動変化 | `None` default を厳守。呼出側で `None`→既定フォールバック。境界テストで未設定ケースを必ず検証 |
| RK3 | import 順序 | `web_search.py:75` の module-level 定数化で評価タイミングが import 時 → settings 生成時に変化 | §7.2 で評価タイミング差の観測影響を検証。必要なら遅延参照（関数内で `settings.x` 参照）に変更 |
| RK4 | JSON silent ignore 喪失 | JSON override の parse を config.py に移すと `json.loads` 失敗時の `return {}`（silent ignore）が ValidationError に化け、起動失敗しうる | config.py は raw string のみ保持。parse は `@lru_cache` 内に維持し silent ignore を保持 |
| RK5 | 本番 validation 誤巻込 | tuning 系を本番強制 validation に入れると未設定の本番が起動失敗 | `RERANKER_*`/`GAKUCHIKA_*` は強制 validation 対象外（§3 表で明示） |
| RK6 | lru_cache 偽陰性 | テストで `get_settings` / `_load_*_overrides` の `lru_cache` を clear し忘れ、前ケース結果が残り「等価」に見える | 全関連 cache を一括 clear する fixture を用意（§7.2） |

### 8.3 見積 / 委譲方針

- 見積: 6 Phase。P1（reranker）/P2（gakuchika）が中核、P3-P6 は小。等価テスト作成が工数の主。
- 委譲方針:
  - `RERANKER_*`（`reranker.py`）= **search-quality-engineer**（reranker は検索品質ドメイン）。
  - `main.py` / `health.py` 変更 = **fastapi-developer**。
  - `prompt-engineer` は **不要**（`backend/app/prompts/**` は非対象。gakuchika_payload は normalization であり prompt ではない）。
  - config.py への Pydantic field 追加・等価テストは Claude/database-engineer 相当が設計、Codex で実装委譲可（behavior-preserving の characterization テストを context に含める）。

---

## 9. Task Tracker

Status は `Todo` / `Doing` / `Blocked` / `Review` / `Done` / `Superseded` のみ使用（`plan-tasks.json` の `statusValues` に整合）。状態の正本は `docs/plan/plan-tasks.json`。

| Status | Priority | Task | Owner | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Todo | P1 | BCE-01: `RERANKER_*`（4 変数）を config 統合 + reranker.py 置換 | search-quality-engineer | `backend/app/utils/reranker.py:223,230,243,244`, `backend/app/config.py` | 等価テーブルテスト green（正常/clamp 内外/不正/未設定）。AB routing 決定性が統合前後で一致 | 2026-05-18 |
| Todo | P1 | BCE-02: `GAKUCHIKA_*` + `AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES` を config 統合 + 呼出側置換（三状態 None フォールバック維持） | search-quality-engineer | `backend/app/normalization/gakuchika_payload.py:79,87,98`, `backend/app/utils/question_loop_detector.py:59` | `isdigit` 厳格・`==\"1\"` 厳密・三状態 None フォールバックの境界テスト green。draft-ready 判定が統合前と一致 | 2026-05-18 |
| Todo | P2 | BCE-03: `LLM_*_JSON` を raw string 明示化（parse は lru_cache 内維持） | fastapi-developer | `backend/app/utils/llm_usage_cost.py:115,399` | `json.loads` 失敗時の silent ignore（`return {}`）動作が不変。lru_cache clear fixture で偽陰性回避 | 2026-05-18 |
| Todo | P2 | BCE-04: `BUILD_TIME` / health 環境表示 / `WEB_SEARCH_DEBUG_PRINT` を config 統合 | fastapi-developer | `backend/app/routers/health.py:14,15`, `backend/app/utils/web_search.py:75` | `_env_flag` 真理値同値を真理値テーブルテストで証明後に置換。`APP_ENV`→`ENVIRONMENT` fallback 維持。health 表示文字列が統合前と一致 | 2026-05-18 |
| Todo | P2 | BCE-05: `TOKENIZERS_PARALLELISM` を main.py 先頭へ移設（冪等二重防御、reranker.py:15 残置） | fastapi-developer | `backend/app/main.py`, `backend/app/utils/reranker.py:15` | main.py 先頭に `setdefault`。reranker.py:15 残置。import 順序によらず最終値 `\"false\"`（明示設定尊重）。config 化しない | 2026-05-18 |
| Todo | P3 | BCE-06: cleanup + drift C4 整合（service-scoped、`.env.example`/`secrets-examples` documented 反映） | fastapi-developer | `.env.example`, `scripts/release/secrets-examples/**` | `npm run check:env-drift`（service-scoped）が "no drift"。tuning 系は optional コメント付き記載・本番強制 validation 対象外 | 2026-05-18 |

---

## 関連計画との関係

- `docs/plan/maintainability-clean-architecture-roadmap.md` — backend の責務境界・保守性ロードマップ。本計画は同ロードマップの「設定集約・config.py 責務」の局所改善であり従属関係（重複なし。同ロードマップが境界全体、本計画が env 直読み解消を担う）。config.py を肥大化させない方針は同ロードマップの「500 行超ファイルに責務を寄せない」原則と整合。
- `docs/plan/supabase-environment-separation-plan.md` — 環境分離 RFC。`APP_ENV` を SSOT とする方針は本計画の health 環境表示（`APP_ENV`→`ENVIRONMENT` fallback）の扱いと整合させる（同一 env の解釈を二重定義しない）。
- `docs/plan/performance-cost-optimization-plan.md` — `LLM_PRICE_OVERRIDES_JSON` / `LLM_CALL_BUDGET_OVERRIDES_JSON` はコスト最適化の運用 lever。本計画は解釈を変えず明示化のみ行うため、同計画の cost lever 運用と矛盾しない。
