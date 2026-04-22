---
topic: motivation
plan_date: 2026-04-12
based_on_review: feature/motivation_quality_audit_20260412.md
status: 進行中
---

# 志望動機作成機能 品質改善計画

**作成日:** 2026-04-12
**最終更新:** 2026-04-16（P1 完了マーキング + P2 設計改善: managed prompt 同期手順、grounding_mode 決定規則、retry 採用基準を追記）
**対象:** 志望動機作成機能（品質監査スコア 42/100 → 目標 92/100 Grade A）
**根拠:** `docs/review/feature/motivation_quality_audit_20260412.md`（セクション9「2026-04-14 再評価」を含む）
**注記:** review ops ルール上、再監査は新日付ファイル並置が推奨だが、今回は既存ファイルへのセクション追記とした（ユーザー判断）。次回の本格再監査時に `motivation_quality_audit_20260414.md` として独立化する

---

## 1. 背景と目的

### 現状の問題

品質監査（初回 2026-04-12）で総合スコア **35/100 (Grade D)** と評価された。2026-04-14 の再評価で一部修正を反映し **42/100** に上方修正。本計画の開始点は **42/100**。

アーキテクチャ（6スロット構造化ヒアリング、品質ゲート二重構造、因果ギャップ検出）は就活AI市場で最も構造化された設計だが、**設計の意図が実装に到達していない**状態にある。

主要な問題:
1. `slot_status_v2` の読み捨てにより 4-state 設計が 3-state に劣化
2. LLM失敗時にサイレント 200 OK を返却し、ユーザーが永遠にドラフト生成不可
3. 会話8メッセージ切り詰め + `conversation_context` 未注入で初期スロットが常に missing 判定
4. `has_rag=False, grounding_mode="none"` がハードコードされ、RAG企業情報がドラフトに到達しない
5. 約30個の重複関数がドリフトリスクを生んでいる
6. AI臭抑制が未実装で、人事のAI検出リスクに対応できていない

### 市場動向

別紙参照: `docs/review/feature/motivation_quality_audit_20260412.md` セクション4（競合比較）。
就活Passの差別化ポイント: **構造化ヒアリング + 企業固有性 + AI臭抑制**。

### 改善方針（ユーザー決定済み）

| 項目 | 決定 |
|------|------|
| スコープ | P1+P2+P3+P4 全体計画（フェーズ分け、P4 まで確定） |
| 目標スコア | **92/100 (Grade A)** |
| ドラフト品質の重点 | **企業固有性**（RAG グラウンディング有効化） |
| 質問UX | バリデーション緩和（フォールバック発火率低減） |
| リファクタリング | 重複削除のみ（モジュール分割はしない） |
| P4 LLM 追加判定 | feature flag (`MOTIVATION_SEMANTIC_CONFIRM`) 下で段階導入 |

---

## 2. フェーズ計画

```
P1 (Sprint 1) ──> P2 (Sprint 2) ──> P3 (Sprint 3) ──> P4 (Sprint 4)
致命的バグ修正       品質向上           中期構造改善      Grade A 到達
7項目               10項目             5項目             8項目
42→60              60→75              75→80+            80+→92
```

### 依存関係

```
P1-4 (重複削除) ──┬─> P1-1 (slot_status_v2 4-state化)
                  ├─> P1-2 (サイレント200)
                  ├─> P1-3 (eval context注入)
                  ├─> P1-5 (JST)
                  ├─> P1-6 (構成ガイド追加)
                  └─> P1-7 (バリデーション緩和) ← 2026-04-14 追加

P1完了 ──┬─> P2-1 (RAG有効化) ──> P2-2 (AI臭抑制)
         ├─> P2-3 (ログ計装) ──[データ蓄積]──> P3-4 (キーワード最適化+レスポンス計装)
         ├─> P2-4 (否定表現修正) ──> P3-3 (否定表現拡張)
         ├─> P2-5 (draft-ready計装) ──[データ蓄積]──> 別spec (AND ゲート化検討)
         ├─> P2-6 (動的文字数制限)
         ├─> P2-7 (positive instruction) ← 2026-04-14 追加
         ├─> P2-8 (フォールバックリライト) ← 2026-04-14 追加
         ├─> P2-9 (ペルソナ改善) ← 2026-04-14 追加
         └─> P2-10 (draft ready通知) ← 2026-04-14 追加

P2完了 ──┬─> P3-1 (プロンプト共通化)
         ├─> P3-2 (why_nowスロット)
         └─> P3-5 (名前空間統一)

P1完了 ──┬─> P4-1 (eval ペルソナ)          [P2と並行可]
         ├─> P4-5 (スロット要約注入)       [P2と並行可]
         ├─> P4-7 (履歴サイズガード)       [P2と並行可]
         └─> P4-8 (学生向け言語)           [P2と並行可]

P1-1完了 ──> P4-2 (セマンティック確認) + P4-3 (信頼度スコアリング)

P2-1完了 ──> P4-6 (質問RAGカード)

P2-2完了 ──> P4-4 (マルチパスドラフト精錬)
```

**注記:** P1-7（バリデーション緩和）は `motivation.py` 内の `_validate_or_repair_question()` のみの変更で `es_templates.py` に触れないため、ES_REVIEW 改善計画との依存がなく、P1-4 完了後に独立着手可能。

---

## 3. Phase 1: 致命的バグ修正

**目標:** 設計意図が実装に正しく到達する状態にする
**リスク:** P1-4 のみ中、他は低。フロントエンドAPI契約の変更なし
**前提:** P1-4（重複統合）を最初に実施し、以降の変更を簡素化する

### P1-4: 重複関数の統合（約30個）[最初に実施]

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | **中** |
| ファイル | `backend/app/routers/motivation.py` |

**問題:** `motivation.py` は lines 64-120 で `motivation_context.py` / `motivation_planner.py` から関数を import した後、lines ~394-1138 で**同名の関数・定数をローカルに再定義**している。Python では後から定義した同名関数が import 名を上書きするため、**実行中のコードはローカル版（motivation.py 側）である**。import 元はデッドコードとして無視されている。

**重要: これはデッドコード削除ではなく、実行中のロジックを `motivation_context.py` / `motivation_planner.py` 実装へ切り替える変更である。**

**リスク軽減:** 全約30関数について byte-for-byte の差分比較を実施済み。2026-04-12 時点で**全関数が完全に同一**であることを確認。ただし、今後のコミットで片方だけが変更される可能性があるため、実施時に再度差分確認が必要。

**変更内容:**
1. **実施前:** 全重複関数の diff を再取得し、乖離がないことを再確認する
2. `motivation.py` lines ~394-1138 のローカル再定義をすべて削除
3. lines 64-128 の import が全ての参照先をカバーしていることを確認
4. 削除対象: `UNRESOLVED_PATTERNS`, `CONTRADICTION_PATTERNS`, `COMPANY_GENERIC_PATTERNS`, `CONTRIBUTION_*_TOKENS` 等の定数群、および `_default_slot_states`, `_default_slot_summaries`, `_normalize_slot_state`, `_normalize_slot_status_v2`, `_answer_is_confirmed_for_stage`, `_normalize_conversation_context`, `_compute_deterministic_causal_gaps` 等 約30関数

**実施前の diff 検証コマンド:**
```bash
# motivation.py L394-1138 のローカル再定義と import 元の差分を確認
# 各関数ペアを抽出して diff する。乖離が1つでもあれば自動削除は不可
python3 -c "
import ast, textwrap, sys
files = {
    'local': 'backend/app/routers/motivation.py',
    'context': 'backend/app/routers/motivation_context.py',
    'planner': 'backend/app/routers/motivation_planner.py',
}
for name, path in files.items():
    tree = ast.parse(open(path).read())
    funcs = {n.name: ast.get_source_segment(open(path).read(), n) for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    print(f'{name}: {len(funcs)} functions')
"
```

**重複対象の関数・定数一覧（実施時に diff で同一性を再確認すること）:**

| # | 名前 | 種別 | import 元 |
|---|------|------|-----------|
| 1 | `UNRESOLVED_PATTERNS` | 定数 | `motivation_context` |
| 2 | `CONTRADICTION_PATTERNS` | 定数 | `motivation_context` |
| 3 | `COMPANY_GENERIC_PATTERNS` | 定数 | `motivation_context` |
| 4 | `CONTRIBUTION_ACTION_TOKENS` | 定数 | `motivation_context` |
| 5 | `CONTRIBUTION_TARGET_TOKENS` | 定数 | `motivation_context` |
| 6 | `CONTRIBUTION_VALUE_TOKENS` | 定数 | `motivation_context` |
| 7-37 | `_default_slot_states`, `_default_slot_summaries`, `_normalize_slot_state`, `_normalize_slot_status_v2`, `_answer_is_confirmed_for_stage`, `_normalize_conversation_context`, `_compute_deterministic_causal_gaps` 等 ~30 関数 | 関数 | `motivation_context` / `motivation_planner` |

**テスト:**
- **実施前:** 既存テスト全パスを確認しベースラインとする
- **実施前:** 上記 diff 検証コマンドで全関数の同一性を確認。**1つでも乖離があれば、乖離箇所を手動マージしてから削除する**
- **実施後:** 同一テストが変更なしで全パスすることを確認
- **追加:** 主要5関数について `motivation.py` 内での名前解決が `motivation_context.py` の関数オブジェクトと同一 (`is`) であることを assert するスモークテストを追加

---

### P1-1: `slot_status_v2` 4-state 完全活用

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py`, `backend/app/prompts/motivation_prompts.py` |

**部分修正済み:** `_normalize_slot_status_v2()` が追加され、LLM 出力の正規化は動作している。ただし **evaluation プロンプトの出力形式が 3-state (`filled|partial|missing`) のまま**であり、`_normalize_slot_state()` は `"filled"→"filled_strong"` に一律変換するため、`filled_weak` が evaluation パスから生成されることはない。設計上の 4-state が実質 3-state に劣化した状態が残存。

**根拠コード:**
- `motivation_prompts.py:88-93`: 出力形式が `"filled|partial|missing"` の 3 択
- `motivation.py:509-515`: `_normalize_slot_state()` — `"filled"→"filled_strong"` 一律変換。`filled_weak` への分岐なし
- `motivation.py:2704`: `data.get("slot_status")` で LLM の 3-state 出力を取得

**変更:**
1. `MOTIVATION_EVALUATION_PROMPT` の出力形式を 4-state に更新:
```
"slot_status": {{{{
    "industry_reason": "filled_strong|filled_weak|partial|missing",
    ...
}}}}
```
2. 判定基準を `_SLOT_COMPLETENESS_RULES` に追加:
```
- filled_strong: 具体的な根拠（固有名詞、経験、数字等）があり、他社でも通る一般論に留まらない
- filled_weak: 何らかの言及はあるが、抽象的・一般的すぎて他社にも当てはまる内容
```
3. `_normalize_slot_state()` の `"filled"→"filled_strong"` 一律変換は後方互換として維持（LLM が旧 3-state で返した場合の安全ネット）

**テスト:**
- LLM 出力 mock で `filled_weak` を含むケースが `slot_status_v2` に正しく反映されることを検証
- `filled_weak` スロットが `SLOT_STATE_ELIGIBLE_FOR_ASK` に含まれ、追加質問の対象になることを検証
- 旧 3-state 出力（`filled`）が `filled_strong` にフォールバックすることを検証（後方互換）

---

### P1-2: LLM 失敗時のサイレント 200 OK 修正

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 中 |
| ファイル | `backend/app/routers/motivation.py` |

**問題:** `_evaluate_motivation_internal` (line 2544) で LLM 呼出失敗時に全スロット missing のデフォルト値を 200 OK で返却。クライアントは障害を検知できない。

**状態遷移の問題:**
`_prepare_motivation_next_question` (line 2758) では、evaluation の**前に** `_capture_answer_into_context()` (line 2771) が呼ばれ、以下が更新される:
- `confirmedFacts` — 回答確認結果
- `slotSummaries` — スロット要約
- `slotStates` — スロット状態
- `turnCount` — ターン数

LLM 評価が失敗した場合、`slotStatusV2` だけ保持しても `confirmedFacts` / `slotStates` / `turnCount` は既に前進しており、**評価失敗なのに文脈だけ前進した半壊状態**になる。

**変更（2段階）:**

**Step 1: evaluation_status の分類**
`call_llm_with_error(..., retry_on_parse=True)` (line 2641) は、プロバイダ障害と JSON 解析失敗の両方を `success=False` として返す。原因と対処が異なるため分類する:
- `"ok"`: LLM 呼出成功かつ JSON 解析成功
- `"provider_failure"`: LLM プロバイダ障害（API key、ネットワーク、レート制限等）
- `"parse_failure"`: LLM は応答したが JSON 解析失敗（retry_on_parse 後も）

判別方法: `llm_result.error.error_type` を正本として使用する。`LLMError` (`llm.py:370`) は既に `error_type` フィールドを持ち、"no_api_key", "billing", "rate_limit", "invalid_key", "network", "parse", "refusal", "unknown" を返す。
- `error_type == "parse"` → `parse_failure`
- それ以外 → `provider_failure`

```python
# Before (ヒューリスティック — 不正確):
# "provider_failure" if raw_text is empty, else "parse_failure"

# After (LLMError.error_type を正本に使用):
if llm_result.error and llm_result.error.error_type == "parse":
    evaluation_status = "parse_failure"
elif llm_result.error:
    evaluation_status = "provider_failure"
else:
    evaluation_status = "ok"
```

**Step 2: capture のトランザクション化（全体オブジェクト復元）**

`_capture_answer_into_context()` (`motivation_context.py:601`) は以下の15以上のフィールドを更新する:
- stage 固有: `industryReason`, `companyReason`, `selfConnection`, `fitConnection`, `desiredWork`, `valueContribution`, `differentiationReason`
- 確認: `confirmedFacts`, `openSlots`, `closedSlots`
- 状態: `slotStates`, `slotSummaries`, `slotEvidenceSentences`, `slotIntentsAsked`
- カウンタ: `turnCount`, `deepdiveTurnCount`, `stageAttemptCount`
- 品質: `reaskBudgetBySlot`, `unresolvedPoints`, `forbiddenReasks`
- 役割: `roleReason`, `roleReasonState`

個別キーの復元は漏れのリスクが高い。**全体オブジェクト復元**（deep copy）を使用する:

```python
import copy

# _prepare_motivation_next_question 内 (line 2758 付近):
conversation_context = _normalize_conversation_context(request.conversation_context)

# capture 前の完全スナップショット（deep copy）
pre_capture_context = copy.deepcopy(conversation_context)

# capture 実行（通常通り）
conversation_context = _capture_answer_into_context(conversation_context, latest_user_answer)

# evaluation 呼出
eval_result = await _evaluate_motivation_internal(...)

# evaluation 失敗時: capture 前に完全復元
if eval_result.get("evaluation_status") != "ok":
    conversation_context = pre_capture_context
    logger.warning(
        "[Motivation] evaluation %s — context fully rolled back to pre-capture state",
        eval_result.get("evaluation_status"),
    )
    # 同じスロットの質問を再送（プランナーをスキップ）
```

**なぜ deep copy か:** `_capture_answer_into_context` は dict 内のネストされた dict/list を直接変更する（`context["slotSummaries"][stage] = ...`, `context["closedSlots"] = list({...})`）ため、shallow copy では内部オブジェクトが共有される。

**Step 3: 評価失敗をクライアントに可視化する**

現在の `NextQuestionResponse` (`motivation_models.py:79`) には `evaluation_status` の受け皿がない。`get_next_question()` (line 3260) は常に成功レスポンスを返す。

**選択肢:**

| 方式 | 変更内容 | クライアント影響 |
|------|---------|----------------|
| A: 非200レスポンス | `provider_failure` 時に 503 を返す。`parse_failure` は fallback 質問を返しつつ warning を付与 | FE のエラーハンドリングが自然に発動 |
| B: レスポンス内フィールド | `NextQuestionResponse` に `evaluation_status: Optional[str] = None` を追加 | FE で明示的にチェックが必要 |
| C: risk_flags に追加 | 既存の `risk_flags: list[str]` に `"evaluation_provider_failure"` / `"evaluation_parse_failure"` を追加 | FE 変更不要（risk_flags は既に表示ロジックあり） |

**推奨:** `provider_failure` は **503** を返す（選択肢 A）。これは `next-question` エンドポイントの既存エラーハンドリングと一貫する（line 3260 付近で他の LLM 障害は 503 を返している）。`parse_failure` は **選択肢 C**（`risk_flags` に追加）で、fallback 質問と共に degraded 状態を伝える。

```python
if eval_result.get("evaluation_status") == "provider_failure":
    raise HTTPException(
        status_code=503,
        detail={"error": "評価処理が一時的に利用できません", "error_type": "evaluation_provider_failure"},
    )
if eval_result.get("evaluation_status") == "parse_failure":
    risk_flags.append("evaluation_parse_failure")
    # fallback 質問で続行
```

**テスト:**
- LLM provider failure mock → 503 が返ることを検証
- LLM parse failure mock → 200 + `risk_flags` に `"evaluation_parse_failure"` が含まれ、`conversation_context` が pre-capture 状態に復元されることを検証
- 正常時は deep copy のオーバーヘッドが許容範囲内であることを確認（dict サイズは ~2KB、deep copy は ~0.1ms）

---

### P1-3: evaluation プロンプトへの `conversation_context` 注入

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py`, `backend/app/prompts/motivation_prompts.py` |

**問題:** `_trim_conversation_for_evaluation` (line 150) が末尾8メッセージに切り詰め。6スロットで最低12メッセージ必要なため、最初の4スロット（industry_reason 等）の原文が脱落。evaluation プロンプトに `conversation_context` のスロットサマリが注入されていない。

**変更:**
1. `motivation_prompts.py` の `MOTIVATION_EVALUATION_PROMPT` に `{slot_summaries_section}` プレースホルダーを追加:
```
## 確認済みスロット要約（過去ターンの累積）
{slot_summaries_section}
```
2. `_evaluate_motivation_internal` (line 2618) で `normalized_context["slotSummaries"]` からセクションを生成:
```python
summaries = normalized_context.get("slotSummaries", {})
lines = [f"- {STAGE_LABELS.get(k, k)}: {v}" for k, v in summaries.items() if v]
slot_summaries_section = "\n".join(lines) if lines else "（まだ確認済みのスロットはありません）"
```
3. `prompt.format()` に `slot_summaries_section=slot_summaries_section` を追加

**テスト（決定論的に検証可能な範囲に限定）:**
- `slot_summaries_section` が evaluation プロンプト文字列に正しく注入されていることを assert（プロンプト内に各 stage label の要約テキストが含まれるか）
- `_trim_conversation_for_evaluation` で切り詰め後も、プロンプトに渡される文字列にスロットサマリが残ることを確認
- **LLM出力の判定結果（missing かどうか）は LLM 依存のため unit test では assert しない**。Live AI テストで別途検証

---

### P1-5: JST 基準への修正

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | S（1行修正） |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |

**変更:**
```python
# Before (line 2862):
conversation_context.get("draftReadyUnlockedAt") or datetime.utcnow().isoformat()

# After:
conversation_context.get("draftReadyUnlockedAt") or datetime.now(ZoneInfo("Asia/Tokyo")).isoformat()
```
`from zoneinfo import ZoneInfo` を import に追加。

---

### P1-6: `es_templates.py` への構成ガイド・why now ヒント追加

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/prompts/es_templates.py` |

**問題:** 削除済み Notion 版プロンプトに含まれていた有益ルール（構成比率、why now 一節）が失われている。

**注意:** 「だ・である調統一」は既に `es_templates.py:1415` のグローバル constraints ブロックに存在するため重複追加しない。

**変更:** `es_templates.py` の `company_motivation` テンプレート定義に以下を追加:
- 構成比率ガイド: 導入15% / 本論70% / 締め15%
- why now シグナル: 可能なら「なぜ今この会社か」が伝わる一節を含める

---

### P1-7: 質問バリデーション緩和 [2026-04-14 再評価で追加]

**ステータス:** [完了 2026-04-16] (P1 verification phase で全項目 implemented 確認済)

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |
| 依存 | P1-4（重複統合）完了後 |

**問題:** `_validate_or_repair_question()` (L1963-2024) の11段階バリデーションが過剰で、LLM生成の自然な質問を大量に棄却しフォールバック質問に置換している。ユーザーから「質問が機械的・不自然」という直接のフィードバックがある。推定フォールバック発火率 70%以上。

**根本原因（3件の過剰フィルタ）:**

1. **疑問符強制** (L1801-1802): 「？」で終わらない質問を全棄却。「〜を教えてください。」等の丁寧語終止が棄却される
2. **ステージ別必須キーワードの狭さ**: `differentiation` で「比較して」「決め手」等が通らない
3. **二重チェック**: `QUESTION_KEYWORDS_BY_STAGE` → 個別チェック (L2010-2023) の二重フィルタ

**変更（3ステップ）:**

**Step 1: 疑問符強制の撤廃**
```python
# Before (L1801-1802):
if not normalized.endswith("？") and not normalized.endswith("?"):
    return fallback

# After: 疑問符 OR 丁寧語終止 を許容
VALID_ENDINGS = ("？", "?", "ください。", "しょうか。", "すか。", "ますか。")
if not any(normalized.endswith(e) for e in VALID_ENDINGS):
    return fallback
```

**Step 2: ステージ別必須キーワードの拡張**
```python
# Before (例: differentiation):
QUESTION_KEYWORDS_BY_STAGE = {
    "differentiation": ["他社", "違い", "ならでは"],
    ...
}

# After:
QUESTION_KEYWORDS_BY_STAGE = {
    "differentiation": ["他社", "違い", "ならでは", "比較", "決め手", "選んだ", "だからこそ", "最も"],
    "desired_work": ["入社後", "仕事", "関わ", "取り組", "担い", "挑戦", "チーム"],
    "industry_reason": ["業界", "分野", "領域", "セクター", "関心", "きっかけ"],
    "self_connection": ["経験", "価値観", "強み", "きっかけ", "原体験", "学び", "つなが"],
    "value_contribution": ["価値", "貢献", "役立", "発揮", "出したい", "支え"],
    ...
}
```

**Step 3: 二重チェックの統合**
L2010-2023 の個別ステージチェックを `QUESTION_KEYWORDS_BY_STAGE` に統合し、単一のチェックポイントにする。

**テスト:**
- 各ステージで「ください。」終止の質問が棄却されないことを検証
- 拡張キーワードを含む質問が各ステージで通過することを検証
- 既存のブロックリスト（「もう少し詳しく」等）が引き続き棄却されることを検証

---

## 4. Phase 2: 品質向上

**目標:** ドラフトの企業固有性とAI臭抑制を実現し、市場競争力を確保する
**リスク:** 中。P2-1（RAGグラウンディング）が最大の変更
**前提:** P1 完了

### P2-1: RAG グラウンディング有効化 [最重要]

| 項目 | 内容 |
|------|------|
| 規模 | L |
| リスク | 中 |
| ファイル | `backend/app/routers/motivation.py`, `backend/app/routers/motivation_models.py`, `src/app/api/motivation/[companyId]/generate-draft/route.ts`, (`es_review_grounding.py` から再利用) |

**問題:** `motivation.py` の2箇所で `company_evidence_cards=None, has_rag=False, grounding_mode="none"` がハードコード:
- `generate_draft` (line 3616-3618): 会話ベースのドラフト生成
- `generate_draft_from_profile` (line 3751-3753): プロフィールベースのドラフト生成

企業情報は `_get_company_context()` (line 3595) で取得済みだが、返り値 `tuple[str, list[dict]]` の `sources` リストは `_` で捨てられている。

**変更（4ステップ）:**

**Step 0: RAG ソースの保持**
```python
# Before (line 3595):
company_context, _ = await _get_company_context(request.company_id)
# After:
company_context, company_sources = await _get_company_context(request.company_id)
```

**Step 1: Evidence Cards 構築**
`_build_company_evidence_cards` の実際のシグネチャ (`es_review_grounding.py:677`):
```python
def _build_company_evidence_cards(
    rag_sources: list[dict],
    *,
    template_type: str,       # "company_motivation"
    question: str,            # ES review では設問文
    answer: str,              # ES review ではユーザー回答
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    max_items: int = 5,
    user_priority_urls: Optional[set[str]] = None,
) -> list[dict[str, str]]
```

**志望動機固有の引数マッピング（ES review との違い）:**
ES review は単一の question-answer ペアだが、志望動機には該当する単一ペアが存在しない。

- `question`: `draft_synthetic_question_company_motivation(honorific)` を渡す（line 3601 で既に生成済み）
- `answer`: **確定済みスロット要約の連結**を使用。`GenerateDraftRequest` には既に `slot_summaries` と `slot_evidence_sentences` が含まれている (`route.ts:156-157`)。末尾200文字のような粗い切り出しではなく、ドラフトの実際の材料であるスロット要約を使うことで、evidence scoring のノイズ（会話終盤の相槌・短い補足）を排除する:
```python
# slot_summaries からスロット要約を連結
summaries = request.slot_summaries or {}
answer_for_evidence = "\n".join(
    f"{STAGE_LABELS.get(k, k)}: {v}"
    for k, v in summaries.items()
    if v and isinstance(v, str) and v.strip()
) or ""
```
`generate_draft_from_profile` では `primary_material`（プロフィール + ガクチカ要約）を使用（slot_summaries がないため）
- `role_name`: `GenerateDraftRequest` (`motivation_models.py:115`) には `selected_role` がないが、Next.js 側では `conversationContext.selectedRole` を既に復元している (`generate-draft/route.ts:129`)。FastAPI への payload 構築時に落としている (`route.ts:151`)。以下の2ファイルを変更する:
  1. **`motivation_models.py`**: `GenerateDraftRequest` に `selected_role: Optional[str] = None` を追加（加法的変更、既存クライアント互換）
  2. **`generate-draft/route.ts`**: `fastApiBody` (L151-158) に `selected_role: conversationContext.selectedRole ?? null` を追加
  これにより `_build_company_evidence_cards` の role-aware ranking が有効になり、企業固有性向上に寄与する。`generate_draft_from_profile` は既存の `selected_role` フィールドで対応可
- `intern_name`: `None` (志望動機ではインターン名は不要)
- `grounding_mode`: 初期値 `"company_general"` を渡す

```python
from app.routers.es_review_grounding import (
    _build_company_evidence_cards,
    _assess_company_evidence_coverage,
)

evidence_cards = _build_company_evidence_cards(
    company_sources,
    template_type="company_motivation",
    question=synthetic_q,                          # line 3601 で生成済み
    answer=answer_for_evidence,                    # 下記参照
    role_name=request.selected_role,               # 加法的に追加した Optional フィールド
    intern_name=None,
    grounding_mode="company_general",
)
```

**Step 2: グラウンディングモード解決**
`_assess_company_evidence_coverage` の実際のシグネチャ (`es_review_grounding.py:830`):
```python
def _assess_company_evidence_coverage(
    *,
    template_type: str,
    role_name: str | None,
    company_rag_available: bool,
    company_evidence_cards: Optional[list[dict[str, str]]],
    grounding_mode: str,
) -> tuple[str, bool]   # (coverage_level, needs_downgrade)
```

```python
has_rag = bool(evidence_cards)
if has_rag:
    coverage_level, needs_downgrade = _assess_company_evidence_coverage(
        template_type="company_motivation",
        role_name=request.selected_role,  # 加法的に追加した Optional フィールド
        company_rag_available=True,
        company_evidence_cards=evidence_cards,
        grounding_mode="company_general",
    )
    # coverage_level: "strong" / "partial" / "weak" / "none"
    grounding_mode = "company_general" if coverage_level in ("strong", "partial") else "none"
else:
    grounding_mode = "none"
```

**Step 3: プロンプトへ渡す**
```python
build_template_draft_generation_prompt(
    ...
    company_evidence_cards=evidence_cards if has_rag else None,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
)
```

**`generate_draft_from_profile` (line 3738) への適用:**
同パターンだが `answer` は `primary_material` の末尾200文字を使用。

**ロールバック:** 環境変数 `MOTIVATION_RAG_GROUNDING=false` で旧動作に戻せるようフラグを用意

**設計改善 (2026-04-16 レビュー指摘 #2, #3 の反映):**

P2-1 着手前レビューで以下2点の致命的設計欠陥が指摘された:
1. grounding_mode を on/off の2値で扱うと弱根拠で企業言及を強制し品質劣化する
2. answer マッピングが末尾切り出しで evidence ranking が不安定になる

これに対応し、`_resolve_motivation_grounding_mode()` と `_build_motivation_grounding_answer()` の2つのヘルパーを新設する。Step 2/3 を以下に置換:

#### grounding_mode の決定規則 (Step 2 改訂)
ハードコード `grounding_mode="none"` および「`coverage in (strong, partial)` → `company_general`」の2値判定を、ES review と同等の coverage 連動ロジックに置換:

- 新規ヘルパー `_resolve_motivation_grounding_mode(*, rag_available, company_sources, role_name, coverage_level)`:
  - `coverage_level == "weak"` または `"none"` → `"none"` (薄い根拠での企業言及強制を回避)
  - `role_name` あり & `coverage_level == "strong"` → `"role_grounded"`
  - それ以外 (partial coverage または role なし) → `"company_general"`
- coverage 評価は `es_review_grounding.py:835` の `_assess_company_evidence_coverage()` を再利用 (引数は既存の通り)
- evidence cards 構築は `es_review_grounding.py:682` の `_build_company_evidence_cards()` を再利用
- 暫定 grounding_mode (`role_grounded` または `company_general`) で初回構築 → coverage 評価 → 最終 grounding_mode で再構築の2段階
- 環境変数 `MOTIVATION_RAG_GROUNDING` でロールバック可能 (default `true`)
- 参照: `es_review.py:409-437` `_evaluate_grounding_mode()` (志望動機向けに簡略化したものが本ヘルパー)

#### 決定論的 answer 構築 (Step 1 の `answer_for_evidence` 改訂)
`_build_company_evidence_cards()` の `answer` 引数は evidence ranking のスコアリング (`_score_company_evidence_source()` `es_review_grounding.py:591-649`) に使われる。会話末尾の tail-trim ではなく、特定スロットの組合せを使い ranking を安定化:

- 新規ヘルパー `_build_motivation_grounding_answer(*, slot_summaries, selected_role)`:
  - `slot_summaries` の `company_reason` + `desired_work` + `differentiation` + `selected_role` を結合
  - 志望動機の「なぜこの企業で何をしたいか」を表す核心スロットのみ採用
  - 会話長に依存しない決定論的入力
- プロフィールルート用に `_build_motivation_grounding_answer_from_profile(*, role_name, gakuchika_section, profile_summary)` も新設
  - `role_name` + `gakuchika_section[:300]` + `profile_summary[:200]` を結合 (先頭から bounded 抽出、末尾依存なし)

#### フロントエンド変更 (既存記述の補強)
`GenerateDraftRequest` に `selected_role: Optional[str] = Field(default=None, max_length=200)` を追加し、`src/app/api/motivation/[companyId]/generate-draft/route.ts` の `fastApiBody` に `selected_role: conversationContext.selectedRole ?? null` を含める。`route.test.ts` には `expect(firstCallBody.selected_role).toBe("企画職")` を追加 (既存 mock の `conversationContext.selectedRole` を活用)。

**テスト:**
- ユニットテスト: RAG ソース mock で `_build_company_evidence_cards` が正しいシグネチャで呼ばれ、返り値が `build_template_draft_generation_prompt` に渡されることを検証
- `_resolve_motivation_grounding_mode()` の coverage パターン全網羅 (`none` × `weak` × `partial` × `strong` × role あり/なし)
- `_build_motivation_grounding_answer()` がスロット欠損時に空文字を返すこと
- `answer` 引数のマッピング (スロット結合) が期待通りであることを検証
- 環境変数 `MOTIVATION_RAG_GROUNDING=false` で hardcode 動作維持
- frontend test (`route.test.ts`) で `selected_role` 送信を assert
- Live AI テスト: 既知企業で生成した2つのドラフト（前/後）の企業固有名詞数を比較

---

### P2-2: AI臭抑制の導入

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 中 |
| ファイル | `backend/app/routers/motivation.py` |

**問題:** ES添削には AI 臭検出パイプライン（`es_review_validation.py`）があるが、志望動機ドラフトには未適用。

**AI 臭検出の実 API（2段階構成）:**

Step 1 — 警告抽出: `_detect_ai_smell_patterns(text, user_answer) → list[dict[str, str]]` (`es_review_validation.py:749`)
- `text`: AI 生成ドラフト
- `user_answer`: ユーザー元テキスト。AI パターン検出時に、ユーザー自身が使った表現を誤検知除外 (`m not in user_answer`)
- 返り値: `[{"code": "repetitive_ending", "detail": "..."}, ...]`

Step 2 — スコア化: `_compute_ai_smell_score(warnings, *, template_type, char_max) → dict` (`es_review_validation.py:872`)
- `warnings`: Step 1 の返り値
- `template_type`: テンプレート種別（志望動機は `"company_motivation"`）
- `char_max`: 文字数上限（300/400/500）
- 返り値: `{"score": float, "tier": 0|1|2, "band": str, "threshold": float, "details": [...]}`

**志望動機での `user_answer` の定義:**

全会話連結を渡すと検出感度が大幅に低下するため、**ドラフトに寄与した材料のみ**に絞る:

- **会話ベース (`generate_draft`)**: 直近3回分のユーザー回答のみを連結
- **プロフィールベース (`generate_draft_from_profile`)**: ガクチカ要約部分のみ

```python
# generate_draft の場合:
user_messages = [
    msg.content for msg in request.conversation_history
    if msg.role == "user" and msg.content.strip()
]
user_origin_text = "\n".join(user_messages[-3:]) if user_messages else ""

# Step 1: 警告抽出
ai_warnings = _detect_ai_smell_patterns(draft_text, user_origin_text)
# Step 2: スコア化
ai_smell = _compute_ai_smell_score(
    ai_warnings,
    template_type="company_motivation",
    char_max=request.char_limit,
)
```

**変更:**
1. `es_review_validation.py` から `_detect_ai_smell_patterns`, `_compute_ai_smell_score` を import
2. `es_review_retry.py` から `_build_ai_smell_retry_hints` を import (`(warnings: list[dict[str, str]]) -> list[str]`, L181)
3. ドラフト生成成功後に2段階パイプラインを実行
4. Tier 2 (`ai_smell["tier"] == 2`) の場合、1回のリトライを実施

**Tier 2 閾値:** `_TIER2_THRESHOLDS` に `"company_motivation"` エントリがないため `"_default"` (short: 3.5, mid_long: 4.0) が適用される。志望動機は 300-500文字 (mid_long band) のため閾値は 4.0。

**リトライ時のヒント注入:** system prompt 末尾に追記する方式（選択肢 A）で初期実装:
```python
if ai_smell["tier"] == 2:
    hints = _build_ai_smell_retry_hints(ai_warnings)
    refined_prompt = system_prompt + "\n\n## AI臭修正指示\n" + "\n".join(f"- {h}" for h in hints)
```

5. AI 臭スコアを `GenerateDraftResponse.internal_telemetry` に記録（既存フィールド, `motivation_models.py:130`）

**設計改善 (2026-04-16 レビュー指摘 #4 の反映):**

P2-2 着手前レビューで以下の致命的設計欠陥が指摘された:
- リトライ採用条件が定義されておらず、字数超過版 / parse 失敗版が返る経路ができる

これに対応し、`_select_motivation_draft()` ヘルパーで deterministic 6パターン採用ルールを導入する。Step 4 (Tier 2 リトライ後の採用判定) を以下に置換:

#### deterministic 採用ルール
- 新規ヘルパー `_select_motivation_draft(*, initial_draft, initial_smell_score, initial_within_limits, retry_draft, retry_smell_score, retry_within_limits, char_min, char_max) -> tuple[str, str]`:
  1. retry が `None` (生成失敗・parse 失敗) → initial 採用 (`selection_reason="retry_failed"`)
  2. 両方が `[char_min, char_max]` 内 → AI smell score が低い方 (同点なら initial) (`retry_better_score` または `initial_equal_or_better`)
  3. retry のみ limits 内 → retry 採用 (`retry_within_limits`)
  4. initial のみ limits 内 → initial 採用 (`initial_within_limits`)
  5. 両方 limits 外 → initial 採用 (劣化を避ける、`both_out_of_limits`)
- `char_min = max(int(request.char_limit * 0.7), 100)`
- `char_max = request.char_limit`
- 字数検証は `es_review_validation.py:169` の `_is_within_char_limits()` を再利用
- リトライは Tier 2 のみ (1回まで)。Tier 0/1 はリトライ呼出自体をスキップ

#### telemetry 拡張
`GenerateDraftResponse.internal_telemetry` に以下を追加 (4箇所の response builder 全てに反映):
- `draft_selection_reason` — `_select_motivation_draft()` の第2戻り値
- `ai_smell_score` — 採用された draft のスコア
- `ai_smell_tier` — 採用された draft の tier
- `retry_attempted` — リトライを呼び出したか (bool)
- `initial_within_limits` — 初稿が字数範囲内か
- `retry_within_limits` — retry が字数範囲内か (リトライ実施時のみ)

`generate_draft_from_profile()` にも同パターンを適用 (user_origin_text は `gakuchika_section[:300]` を使用)。

**テスト:**
- `_select_motivation_draft()` の全6パターン (retry None, 両 limits 内 better/worse/equal, 片方 limits 外, 両 limits 外)
- mock LLM で初稿に AI 臭パターンを仕込む → Tier 2 発火 → リトライ → 採用判定
- 字数制限超過の retry が rejected されること
- telemetry に `selection_reason`, `ai_smell_score` が記録されること

---

### P2-3: フォールバック発火率のログ計装 [ログのみ — P3-4 の前提データ収集]

| 項目 | 内容 |
|------|------|
| 規模 | **S** |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |

**スコープ:** P2-3 は **構造化ログの追加のみ**。戻り値変更やレスポンスへの計装は P3-4 で実施する。P2-3 のログデータが P3-4 のキーワード最適化判断の入力になる。

**P2-3 → P3-4 の関係:**
```
P2-3 (ログ計装) ──[ログデータ蓄積]──> P3-4 (キーワード最適化 + レスポンス計装)
      ↑ Stage 1 のみ                       ↑ Stage 2 + 最適化
```

**変更:**
各 `return fallback` ポイントに `logger.info` を追加:
```python
logger.info("[Motivation] question_fallback reason=%s stage=%s", "generic_blocklist", stage)
return fallback
```
理由コード: `empty`, `generic_blocklist`, `instruction_copy`, `multi_part`, `other_company`, `unconfirmed_premise`, `too_long`, `missing_keyword`, `stage_specific`

**テスト:** 各理由コードに対応する入力で `logger.info` が呼ばれることを mock で検証

---

### P2-4: 否定表現偽陽性の修正

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation_context.py` |

**変更:** `_answer_is_confirmed_for_stage` でキーワードチェックの前に:
```python
if _answer_signals_unresolved(normalized) or _answer_signals_contradiction(normalized):
    return False
```

**テスト:** 「業界に関心はありません」「まだ理由が見つからない」等の否定表現で `False` が返ることを検証

---

### P2-5: `ready_for_draft` vs `draftReady` 2系統の計装 [計装のみ]

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |

**スコープ:** P2-5 は **計装（テレメトリ記録）のみ**。動作変更を伴う2系統の統合（AND ゲート化等）は**プロダクト仕様の判断が必要**であり、計装データを収集した上で別 spec（Kiro spec-init）で扱う。

**現行動作の概要:**

2系統が独立に判定し、OR に近い関係で `draftReady` が決定される:

1. **evaluation 系** (`motivation.py:2721-2725`): LLM の `ready_for_draft` AND `_compute_draft_gate()` → `eval_ready_for_draft`
2. **planner 系** (`motivation_planner.py:134-152`): `all(slotStates == "locked")` or `turnCount >= 7`（安全弁）→ `is_complete`
3. **合流** (`motivation.py:2858-2863`): planner の `is_complete == True` なら `draftReady = True`（eval と独立）

**問題:** planner が `max_turn_reached` で unlock した場合、eval が `ready_for_draft=False` でも `draftReady=True` になる。これは技術バグではなくプロダクト仕様の曖昧さ。

**変更（計装のみ）:**

既存の `internal_telemetry: Optional[dict[str, Any]]` フィールド (`motivation_models.py:112`) に格納:

```python
# line 3221 付近の internal_telemetry 構築時:
internal_telemetry = consume_request_llm_cost_summary("motivation")
internal_telemetry["draft_ready_eval"] = eval_ready_for_draft
internal_telemetry["draft_ready_planner"] = is_complete
internal_telemetry["draft_ready_source"] = _classify_draft_ready_source(
    eval_ready=eval_ready_for_draft, planner_unlock=is_complete, unlock_reason=unlock_reason
)
internal_telemetry["planner_unlock_reason"] = unlock_reason
```

`_classify_draft_ready_source` ヘルパー:
```python
def _classify_draft_ready_source(*, eval_ready, planner_unlock, unlock_reason):
    if eval_ready and planner_unlock:
        return "both_agree"
    if planner_unlock and not eval_ready:
        return f"planner_only:{unlock_reason or 'unknown'}"
    if eval_ready and not planner_unlock:
        return "eval_only"
    return "neither"
```

**後続（別 spec）:** 計装データで `planner_only:max_turn_reached` の頻度と影響を把握した上で、AND ゲート化（選択肢 B/C）を検討:

| 選択肢 | 挙動 | トレードオフ |
|--------|------|-------------|
| B: AND ゲート + max_turn フォールバック | 通常は AND。`max_turn_reached` のみ planner 単独 unlock 許可 | 品質向上。安全弁維持 |
| C: 完全 AND ゲート | planner AND eval 両方 true 必須 | 最も厳格。会話終了不能リスク |

---

### P2-6: 80文字制限の動的化

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |

**変更:**
```python
# Before (line ~2006):
if len(normalized) > 80:

# After:
max_length = 80 + len(company_name or "")
if len(normalized) > max_length:
```

---

### P2-7: グラウンディングルールへの positive instruction 追加 [2026-04-14 再評価で追加]

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/prompts/motivation_prompts.py` |

**問題:** `_GROUNDING_AND_SAFETY_RULES` (L8-16) が「〜しない」の禁止指示のみで、企業情報を質問に積極活用する許可指示がゼロ。LLMが安全側に倒れ、全企業で同一パターンの質問を生成する。

**変更:** L16 の後に以下を追加:
```
- 企業情報(RAG)に特徴的なキーワード（事業名・サービス名・取り組み等）がある場合、
  「〜について」の形で質問に組み込んでよい。ただし事実として断定せず、関心の有無を問う形にする
- 例: 企業情報に「Woven City」があれば「Woven Cityのような取り組みに関心がありますか？」はOK。
  「Woven Cityを志望されているのですね」はNG（断定）
```

**実装手順 (managed prompt 同期必須):**

1. `.py` fallback 更新: `motivation_prompts.py` L11-19 の `_GROUNDING_AND_SAFETY_RULES` 末尾に上記2行を追加
2. **managed prompt 同期** — `_GROUNDING_AND_SAFETY_RULES` は f-string で 3 prompt (`motivation.evaluation`, `motivation.question`, `motivation.deepdive_question`) に展開されるため、3 key 全てを `notion_prompts.json` に同期する必要がある:
   ```bash
   python scripts/prompts/sync_notion_prompts.py \
     --key motivation.evaluation \
     --key motivation.question \
     --key motivation.deepdive_question \
     --apply
   ```
3. 同期後 `notion_prompts.json` の差分を確認し、3 key の content に新ルールが含まれることを assert
4. **注意:** `notion_prompts.json` に該当 key があると JSON が完全勝利するため、`.py` 変更だけでは本番に反映されない。`backend/app/utils/notion_registry.py` の `_PROMPT_CACHE` はプロセス起動時に1回だけ読込み

**テスト:** RAG コンテキストに企業固有キーワードを含むケースで、生成質問にそのキーワードが反映される傾向を Live AI テストで確認。加えて `notion_prompts.json` の3 key content に新ルール文字列が含まれることをユニットテストで assert

---

### P2-8: フォールバック質問18問のリライト [2026-04-14 再評価で追加]

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 低 |
| ファイル | `backend/app/routers/motivation.py` |

**問題:**
1. プロンプトで禁止した「{企業名}で{職種}を考えるとき」型がフォールバックにそのまま存在（L1877付近）
2. 「最も近いものを1つ教えてください」等の選択型質問がUIに選択肢表示がなく不自然
3. 各ステージ3問のローテーションが同一ステージ再質問時に不足

**変更:**
1. 禁止型に該当するフォールバック質問を自然な1トピック型に書き換え
2. 選択型質問を開放型質問に変更
3. 各ステージ4-5問に増量（ローテーション余裕確保）

**テスト:** 全フォールバック質問がバリデーションチェーンを通過することを assert

---

### P2-9: ペルソナ改善 [2026-04-14 再評価で追加]

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `backend/app/prompts/motivation_prompts.py` |

**問題:** 質問生成プロンプト (L105) のペルソナが「就活生向けの志望動機作成アドバイザー」という肩書きのみで、対話スタンス（共感か構造か、テンポ感）が未定義。LLMは抽象ペルソナのとき質問をフォーマルかつ均質にする傾向がある。

**変更:** ペルソナに対話状況の描写を追加:
```
# Before:
あなたは就活生向けの志望動機作成アドバイザーです。

# After:
あなたは就活生の志望動機づくりをサポートするアドバイザーです。
相手は志望理由をまだうまく言葉にできていない学生です。
1問ずつ短く聞いて、学生自身の言葉で材料を引き出してください。
```

**実装手順 (managed prompt 同期必須):**

1. `.py` fallback 更新: `motivation_prompts.py` L116 の `_MOTIVATION_QUESTION_PROMPT_FALLBACK` 冒頭1行を上記3行に拡張
2. managed prompt 同期 — `motivation.question` のみ (1 key):
   ```bash
   python scripts/prompts/sync_notion_prompts.py --key motivation.question --apply
   ```
3. 同期後 `notion_prompts.json` の `motivation.question` content 先頭3行が新ペルソナを含むことを assert
4. **注意:** P2-7 と同じく `notion_prompts.json` 経由で本番反映される。`.py` 変更のみでは fallback パスでしか効かない

**テスト:**
- managed prompt の content 先頭3行が新ペルソナを含むことを assert
- ユニットテストで `motivation.question` の現在値が3行ペルソナで始まることを検証

---

### P2-10: Draft ready スナックバー追加 [2026-04-14 再評価で追加]

**ステータス:** [完了 2026-04-16] (codebase verification 済 - 実装は別 PR で先行マージ)

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| ファイル | `src/components/motivation/MotivationConversationContent.tsx` |
| 委譲先 | `nextjs-developer` |

**問題:** `isDraftReady=true` 時にsnackbar/toast通知が表示されず、ユーザーがESを作成可能になったことに気づきにくい。

**変更:** `useMotivationDomain` の `isDraftReady` が `false → true` に遷移した時点で toast 通知を表示:
```
「志望動機ESを作成できます！下のボタンから作成してください。」
```
既存の `sonner` toast ライブラリ（プロジェクトで使用済み）を利用。

---

## 5. Phase 3: 中期構造改善

**目標:** プロンプト保守性向上、バリデーション最適化、名前空間統一
**前提:** P2 完了

### P3-1: 4プロンプトのルール重複解消

| 項目 | 内容 |
|------|------|
| 規模 | M |
| ファイル | `backend/app/prompts/motivation_prompts.py` |

**変更:** 4つの共通ルールブロック（grounding/question_design/repetition/slot_completeness）を `_SHARED_MOTIVATION_RULES` 定数に集約し、各プロンプトテンプレートから `{shared_rules}` プレースホルダーで参照。

---

### P3-2: `why_now` スロットの追加検討 [設計調査が必要]

| 項目 | 内容 |
|------|------|
| 規模 | **XL** |
| リスク | **高** |
| ファイル | 広範囲（下記参照） |

**既存の `why_now` 関連コード（deepdive 名前空間との衝突）:**
- `motivation_prompts.py:216`: `why_now_strengthening` が deepdive の `target_area` として既に存在
- `motivation.py:3021`: `_deepdive_area_to_stage("why_now_strengthening")` → `"company_reason"` にマッピング
- `motivation.py:3026+`: `_deepdive_area_to_weakness_tag("why_now_strengthening")` → `"why_now_missing"` にマッピング

現状 `why_now` は独立スロットではなく、`company_reason` の deepdive 補強として扱われている。7番目の slot として追加すると、以下の全てに影響する:

**影響範囲（FE型変更だけでは済まない）:**

| レイヤー | 変更箇所 | 影響 |
|---------|---------|------|
| **Backend** | | |
| `motivation_context.py` | `REQUIRED_MOTIVATION_STAGES` タプル | 6→7要素。**依存する全ロジック（ループ、dict 初期化、完了判定）に波及** |
| `motivation_context.py` | `_default_slot_states()`, `_default_slot_summaries()` 等 ~10関数 | 新スロットのデフォルト値追加 |
| `motivation_context.py` | `_answer_is_confirmed_for_stage()` | `why_now` 用のキーワード・閾値定義が必要 |
| `motivation_planner.py` | `_determine_next_turn()` | unlock 条件（全 stage locked）に why_now が追加。**7ターンで全スロット到達不可になる可能性** |
| `motivation_planner.py` | `_compute_deterministic_causal_gaps()` | why_now 用の gap 定義が必要 |
| `motivation_prompts.py` | 全4プロンプト | slot 記述の更新 |
| `motivation.py` | `_compute_draft_gate()` | why_now を必須 gate に含めるか判断が必要 |
| `motivation.py` | deepdive マッピング | `why_now_strengthening` → `why_now`（company_reason からの切り離し） |
| `motivation_models.py` | `StageStatus`, `MotivationEvaluation` | 新 stage 値 |
| `QUESTION_WORDING_BY_STAGE` | フォールバック質問 | why_now 用の3問追加 |
| `STAGE_CONFIRMED_FACT_KEYS` | 確認キー | why_now 用のキー追加 |
| **Frontend（型・union だけでは済まない）** | | |
| `src/lib/motivation/conversation.ts:316` | `coerceQuestionStage()` | unknown stage の丸め先に `why_now` を追加。未対応だと `"differentiation"` にフォールバック |
| `src/lib/motivation/conversation.ts:429` | `safeParseConversationContext()` | `slotStates`, `slotSummaries`, `stageStatus` の parse に `why_now` が含まれない → 消失 |
| `src/lib/motivation/conversation-payload.ts:72` | `buildProgressFromContext()` | `progress.total = 6` がハードコードされている可能性。7に更新必要 |
| `src/lib/motivation/adapters.ts` | シリアライズ / デシリアライズ | 新 stage が round-trip で保持されることを検証 |
| `src/lib/motivation/conversation.test.ts` | 既存テスト | `safeParseConversationContext` のテストケースに why_now を追加 |
| フロントエンド UI | ステージトラッカー | 7項目表示。モバイル表示幅の検討 |

**推奨:** P3-2 は単独の spec（Kiro spec-init）として切り出し、要件定義 → 設計 → タスク化のフルフローを経る。今回の改善計画には「検討項目」として残すが、実装は別タスクとする。

**代替案（低リスク）:** slot_fill に why_now スロットを追加する代わりに、deepdive の `why_now_strengthening` をより積極的に発火させる（発火条件の緩和のみ）。影響範囲は `motivation_planner.py` の gap 判定ロジックのみ。

---

### P3-3: 否定表現パターンの拡張

| 項目 | 内容 |
|------|------|
| 規模 | S |
| ファイル | `backend/app/routers/motivation_context.py` |

`UNRESOLVED_PATTERNS` / `CONTRADICTION_PATTERNS` に追加:
- 「正直よくわからない」「あまりピンと来ない」「まだ漠然と」「考え中」
- 「前の答えは違って」「さっきのは撤回」「実は」「考え直すと」

---

### P3-4: ステージ別キーワード最適化 + レスポンス計装

| 項目 | 内容 |
|------|------|
| 規模 | M |
| ファイル | `backend/app/routers/motivation.py` |

**前提:** P2-3 のログ計装データが蓄積されていること。

**スコープ（2つの作業）:**

**作業 1: レスポンス計装（P2-3 の Stage 2 に相当）**
`_validate_or_repair_question()` の戻り値を拡張し、フォールバック情報を `candidate_validation_summary` に格納する:

```python
# 選択肢 B（推奨）: 副作用オブジェクト
def _validate_or_repair_question(..., validation_report: dict | None = None) -> str:
    ...
    if validation_report is not None:
        validation_report["fallback_used"] = True
        validation_report["fallback_reason"] = "generic_blocklist"
    return fallback
```

`candidate_validation_summary` (既存 `NextQuestionResponse` フィールド, line 103) にマージ:
```python
candidate_validation_summary={
    "total_candidates": 0,
    "deepdive_mode": _should_use_deepdive_mode(prep),
    "fallback_used": validation_report.get("fallback_used", False),
    "fallback_reason": validation_report.get("fallback_reason"),
},
```

**作業 2: キーワード最適化**
P1-7 でキーワード拡張の初期対応済み。P2-3 のログデータから理由コード別の発火率を分析し、`QUESTION_KEYWORDS_BY_STAGE` の OR 条件をさらに調整する。

**判断基準:** 各ステージのフォールバック率が 30% 以下になるまでキーワードを追加。ただしブロックリスト（「もう少し詳しく」等）の検出率は維持する。

---

### P3-5: 深掘り名前空間の統一

| 項目 | 内容 |
|------|------|
| 規模 | S |
| ファイル | `motivation_planner.py`, `motivation_models.py` |

3つの名前空間（planner `gap_id`, API `target_area`, model `weakness_tag`）を `DeepDiveGap` enum で統一。

---

## 6. Phase 4: Grade A 到達（80+ → 92）

**目標:** 6軸評価の全軸で高得点を達成し、Grade A (90+) に到達する
**前提:** P3 の主要項目完了。ただし P4-1/5/7/8 は P1 完了後すぐ着手可能
**リスク:** 中。P4-2 と P4-4 が最大の変更

### P4-1: evaluation プロンプトにロールペルソナ追加

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| 改善軸 | Prompt Design +1 |
| ファイル | `backend/app/prompts/motivation_prompts.py` |
| 依存 | なし |

**問題:** evaluation プロンプト (`_MOTIVATION_EVALUATION_PROMPT_FALLBACK`, L58) にロールペルソナがない。question プロンプト (L111) には「就活生向けの志望動機作成アドバイザー」があるが、evaluation は裸のタスク指示から開始。LLM はロール未定義時に評価基準が不安定になりやすい。

**変更:**
```python
# Before (L58):
_MOTIVATION_EVALUATION_PROMPT_FALLBACK = f"""以下の志望動機に関する会話を分析し、...

# After:
_MOTIVATION_EVALUATION_PROMPT_FALLBACK = f"""あなたは就活生の志望動機ESの骨格判定を行う専門評価者です。
会話内容の事実のみに基づき、推測で充足判定せず、厳密に評価してください。

以下の志望動機に関する会話を分析し、...
```

**テスト:** 既存 evaluation テスト PASS。プロンプト文字列にロールペルソナが含まれることを assert。

---

### P4-2: セマンティック確認バリデータ（`_answer_is_confirmed_for_stage` 強化） [feature flag]

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 中 |
| 改善軸 | Judgment Accuracy +3 |
| ファイル | `backend/app/routers/motivation_context.py`, `backend/app/routers/motivation.py` |
| 依存 | P1-1 (slot_status_v2 安定後) |
| feature flag | `MOTIVATION_SEMANTIC_CONFIRM` (デフォルト: `false`) |

**問題:** `_answer_is_confirmed_for_stage()` (`motivation_context.py:375-403`) はハードコードされたトークンリストで判定。例: `company_reason` は `("理由", "ため", "から", "惹かれ", "魅力", "合う")` の6語いずれかが必要。「御社のDXによる社会変革に深い共感を覚えています」は6語のどれも含まないため False。

**設計制約:**
- 現行 `_answer_is_confirmed_for_stage` は軽量な同期関数。LLM ミニコール追加で hot path が sync → async に変わる
- next-question 全体の応答時間に +200ms 程度影響
- feature flag 下で段階導入し、staging で効果とレイテンシを計測後に本番投入を判断

**変更（2層構成）:**

**Layer 1 (既存キーワード — fast path):** キーワードマッチで True → そのまま True（高速、変更なし）。

**Layer 2 (LLM ミニコール — feature flag ON かつキーワード不一致時のみ):**
```python
async def _semantic_answer_confirmation(
    answer: str,
    stage: str,
    *,
    model: str = "gpt-nano",  # エイリアス → settings.gpt_nano_model (gpt-5.4-nano)
    max_tokens: int = 10,
    timeout_seconds: float = 2.0,
) -> bool:
    """キーワード不一致かつ長さ14文字以上の回答に対し、LLM で意味判定。"""
    prompt = (
        f"以下の回答は「{STAGE_LABELS[stage]}」に対する実質的な回答ですか？"
        f"yes/noのみ。\n回答: {answer}"
    )
    result = await call_llm_with_error(
        prompt, model=model, max_tokens=max_tokens, temperature=0,
    )
    return result.success and "yes" in (result.data or "").lower()
```

**モデル解決:** `gpt-nano` は本プロジェクトのエイリアス (`llm_model_routing.py:81`) で `settings.gpt_nano_model` (デフォルト `gpt-5.4-nano`) に解決される。OpenAI 公式モデル名ではなくプロジェクト内エイリアスとして使用。

**呼び出しフロー:**
1. `MOTIVATION_SEMANTIC_CONFIRM` が `false` → Layer 1 のみ（既存動作）
2. Layer 1 キーワードマッチ: True → 即 True（LLM 不要）
3. 長さ < 14 → False（短すぎ）
4. Layer 2: `_semantic_answer_confirmation` を await。タイムアウト (2秒) /失敗時は False
5. 結果を `conversation_context["semanticConfirmationCache"][stage]` にキャッシュ

**コスト影響:** gpt-5.4-nano は ~$0.10/1M input tokens。1回の判定は ~50 tokens → ~$0.000005/call。6スロット×全ミス仮定で $0.00003/セッション。

**テスト:**
- feature flag OFF → Layer 1 のみ、LLM 呼び出しなし
- feature flag ON + キーワードマッチ → LLM 呼び出しなしで True
- feature flag ON + キーワード不一致 + 長さ14以上 → LLM mock (yes) → True
- LLM タイムアウト → False（安全側にフォールバック）
- P2-4 の否定チェック（「業界に関心はありません」）→ 先に False

---

### P4-3: evaluation スロット信頼度スコアリング

| 項目 | 内容 |
|------|------|
| 規模 | M |
| リスク | 低〜中 |
| 改善軸 | Judgment Accuracy +2 |
| ファイル | `backend/app/prompts/motivation_prompts.py`, `backend/app/routers/motivation.py` |
| 依存 | P1-1 (slot_status_v2) |

**問題:** evaluation LLM はスロット状態を flat な文字列で返す。不確実な場合でも "filled" を返しがちで、品質不足のドラフト生成が許可される。

**変更:**

**Step 1: プロンプト出力スキーマ拡張** (`motivation_prompts.py:89-97`)
```
# Before:
"slot_status": {
    "industry_reason": "filled|partial|missing",
}

# After:
"slot_status": {
    "industry_reason": {"state": "filled_strong|filled_weak|partial|missing", "confidence": 0.85},
}
```

**Step 2: 後処理ロジック** (`motivation.py:_evaluate_motivation_internal` 内)
```python
for slot, val in raw_slot_status.items():
    if isinstance(val, dict):
        state = val.get("state", "missing")
        confidence = val.get("confidence", 1.0)
        if state in ("filled", "filled_strong") and confidence < 0.6:
            state = "partial"  # 低信頼度 → ダウングレード
    else:
        state = val  # 後方互換: 文字列のまま → confidence=1.0
    slot_status[slot] = _normalize_slot_state(state)
```

**テスト:**
- `{"state": "filled", "confidence": 0.4}` → `"partial"` にダウングレード
- `{"state": "filled_strong", "confidence": 0.9}` → `"filled_strong"` 維持
- `"filled"` (文字列のみ) → 後方互換で `"filled_strong"`

---

### P4-4: マルチパスドラフト精錬（AI 臭 + 企業固有性 + 結論先行チェック + 修正パス）

| 項目 | 内容 |
|------|------|
| 規模 | L |
| リスク | 中 |
| 改善軸 | Draft Quality +2 |
| ファイル | `backend/app/routers/motivation.py` |
| 依存 | P2-2 (AI 臭検出の導入後) |

**問題:** P2-2 で AI 臭検出 + 1回リトライを追加するが、企業固有性チェック（ドラフトに企業固有名詞が含まれるか）と結論先行構造チェックが欠如。

**変更（P2-2 の拡張）:**

**検証パス（ドラフト生成成功後）:**
```python
# 1. AI 臭パイプライン（P2-2 で導入済みの2段階 API）
ai_warnings = _detect_ai_smell_patterns(draft_text, user_origin_text)
ai_smell = _compute_ai_smell_score(ai_warnings, template_type="company_motivation", char_max=request.char_limit)

# 2. 企業固有性チェック（新規）
company_anchor_keywords = _extract_company_anchor_keywords(company_context)
has_company_specificity = any(kw in draft_text for kw in company_anchor_keywords)

# 3. 結論先行チェック（新規）
starts_with_conclusion = _check_conclusion_first(draft_text)

# 4. 修正判定
needs_refinement = (
    ai_smell["tier"] == 2  # Tier 2 以上
    or (not has_company_specificity and company_anchor_keywords)
    or not starts_with_conclusion
)
```

**`_extract_company_anchor_keywords` ヘルパー:**
evidence_cards 利用可能時は card.title / card.excerpt から固有名詞を抽出。なければ company_context から「」内テキストを正規表現で抽出。

**修正パス（1回のみ）:**
```python
if needs_refinement:
    repair_hints = []
    if ai_smell["effective_score"] >= 3.0:
        repair_hints.extend(_build_ai_smell_retry_hints(ai_smell["warnings"]))
    if not has_company_specificity and company_anchor_keywords:
        repair_hints.append(
            f"企業固有の要素（{', '.join(company_anchor_keywords[:3])}等）を具体的に織り込む"
        )
    if not starts_with_conclusion:
        repair_hints.append("冒頭で結論（志望理由の核心）を述べてから展開する")
    
    refined_prompt = original_system_prompt + "\n\n## 修正指示\n" + "\n".join(f"- {h}" for h in repair_hints)
    # 1回のみ再生成
```

**テスト:**
- AI 臭スコア高 → 修正パス発火
- 企業固有名詞なし + anchor keywords あり → 修正パス発火
- 正常ドラフト → 修正パス不発火
- レイテンシ: telemetry に修正パス有無と所要時間を記録

---

### P4-5: ドラフトプロンプトへのスロット要約構造化注入

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| 改善軸 | Draft Quality +1 |
| ファイル | `backend/app/routers/motivation.py` |
| 依存 | なし |

**問題:** `generate_draft` (L3596) は `conversation_text`（生の会話ログ）のみを primary material として渡す。FE は `slot_summaries` / `slot_evidence_sentences` を送信しており (`GenerateDraftRequest` L120-121)、backend も受信しているが、プロンプトに渡していない。

**P2-1 との材料優先順位（重複防止）:**
P2-1 は `company_evidence_cards`（企業情報）をプロンプトに注入し、P4-5 は `slot_summaries`（ユーザー回答の構造化要約）を注入する。同じ根拠が二重注入されるリスクを防ぐため、以下の優先順位を固定する:

- **一次材料（必須）:** slot_summaries — ユーザー自身の言葉を構造化したもの。ドラフトの骨格
- **二次材料（補強）:** company_evidence_cards — 企業情報。一次材料に企業固有性を付与する裏付け
- **三次材料（文脈）:** conversation_text — 生の会話ログ。一次・二次でカバーされない文脈補完

プロンプト内では明示的にセクションを分離し、LLM に優先順位を指示する:

**変更:**
```python
# generate_draft 内 (L3596 付近):
summaries = request.slot_summaries or {}
evidence = request.slot_evidence_sentences or {}

# 一次材料: スロット要約（ドラフトの骨格）
structured_section = "【一次材料：骨格要約（優先的に反映すること）】\n"
for stage in REQUIRED_MOTIVATION_STAGES:
    label = STAGE_LABELS.get(stage, stage)
    summary = summaries.get(stage, "")
    ev = evidence.get(stage, [])
    if summary:
        structured_section += f"- {label}: {summary}\n"
        if ev:
            structured_section += f"  根拠: {'; '.join(ev[:2])}\n"

# 三次材料: 会話ログ（補完）
primary_material = structured_section + "\n【三次材料：会話ログ（補完用）】\n" + conversation_text
# 注: 二次材料（企業エビデンスカード）は P2-1 の company_evidence_cards 経由で別セクションに注入済み
```

**テスト:** `slot_summaries` 付きリクエストで、プロンプトに `【一次材料：骨格要約】` セクションが含まれることを assert。

---

### P4-6: 質問生成プロンプトへの RAG エビデンスカード注入

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| 改善軸 | Draft Quality +0.5, Prompt Design +0.5 |
| ファイル | `backend/app/routers/motivation.py` |
| 依存 | P2-1 (RAG 有効化後) |

**問題:** 質問プロンプト (L2938 付近) は `company_context` をフリーテキストで受け取るが、構造化された evidence cards は UI 表示用のみ。

**変更:**
```python
# _build_motivation_question_system_prompt 内:
if evidence_cards:
    card_section = "## 利用可能な企業エビデンス\n"
    for i, card in enumerate(evidence_cards[:3], 1):
        card_section += f"- E{i} ({card['contentType']}): {card['excerpt'][:80]}...\n"
```

**テスト:** evidence_cards 付きで、プロンプトに `利用可能な企業エビデンス` セクションが含まれること。

---

### P4-7: conversation_history サイズガード

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| 改善軸 | Safety +1 |
| ファイル | `backend/app/routers/motivation_models.py` |
| 依存 | なし |

**問題:** `NextQuestionRequest.conversation_history` (`motivation_models.py:53`) はリスト長の制限がない。100+ メッセージの送信で ~1MB のペイロードになる。

**変更:**
```python
# motivation_models.py L53:
# Before:
conversation_history: list[Message]

# After:
conversation_history: list[Message] = Field(max_length=40)
```

Pydantic v2 の `Field(max_length=N)` でリスト要素数を制限。40 = 6スロット × 2 (Q+A) × 3 (deepdive余裕) + α。

**テスト:** 41メッセージ → 422 Validation Error。40メッセージ → 正常処理。

---

### P4-8: 質問の学生向け言語レジスタ指示

| 項目 | 内容 |
|------|------|
| 規模 | S |
| リスク | 低 |
| 改善軸 | Question UX +1 |
| ファイル | `backend/app/prompts/motivation_prompts.py` |
| 依存 | なし |

**問題:** `_QUESTION_DESIGN_RULES` (L21) に言語レジスタの指示がなく、LLM がビジネス専門用語（「バリューチェーン」「ソリューション」等）を使うことがある。

**変更:** `_QUESTION_DESIGN_RULES` の末尾に追加:
```
- 質問は大学3年生が理解できる言葉で聞く。ビジネス専門用語（DX、バリューチェーン、ソリューション等）を使う場合は平易な言い換えを添える
```

**テスト:** プロンプト文字列に「大学3年生」が含まれることを assert。

---

## 7. 複雑度・リスク一覧

| 項目 | 規模 | リスク | FE変更 | 依存 | 備考 |
|------|:---:|:---:|:---:|------|------|
| P1-4 重複統合 | M | **中** | なし | なし（最初に実施） | 実行ロジック切替。実施前に再 diff 必須。検証コマンド追記済み |
| P1-1 slot_status_v2 4-state | S | 低 | なし | P1-4 | 部分修正済み（正規化あり）。evaluation prompt の 4-state 化が残存 |
| P1-2 サイレント200 | **M** | **中** | なし | P1-4 | deep copy全体復元。provider→503, parse→risk_flags |
| P1-3 eval context注入 | M | 低 | なし | P1-4 | テストはプロンプト注入のみ assert |
| P1-5 JST | S | 低 | なし | P1-4 | |
| P1-6 構成ガイド | S | 低 | なし | なし | だ・である調は既存。why now+構成ガイドのみ |
| **P1-7 バリデーション緩和** | **M** | **低** | **なし** | **P1-4** | **2026-04-14追加。疑問符強制撤廃+キーワード拡張+二重チェック統合** |
| P2-1 RAG有効化 | **L** | **中** | **加法的** | P1完了 | models.py+route.ts+selected_role追加, answer=slot要約連結 |
| P2-2 AI臭抑制 | M | 中 | なし | P2-1 | user_answer=直近3回答。retry_hints=system prompt末尾追記 |
| P2-3 ログ計装 | **S** | 低 | なし | P1完了 | ログのみ。Stage2（レスポンス計装）は P3-4 に移動 |
| P2-4 否定表現 | S | 低 | なし | P1完了 | |
| P2-5 draft-ready計装 | S | 低 | なし | P1-2 | 計装のみ。動作変更は別spec |
| P2-6 動的文字数 | S | 低 | なし | P1完了 | |
| **P2-7 positive instruction** | **S** | **低** | **なし** | **P1完了** | **2026-04-14追加。グラウンディングルールに企業情報活用の許可追加** |
| **P2-8 フォールバックリライト** | **M** | **低** | **なし** | **P1-7** | **2026-04-14追加。禁止型削除+選択型修正+各ステージ4-5問に増量** |
| **P2-9 ペルソナ改善** | **S** | **低** | **なし** | **P1完了** | **2026-04-14追加。対話スタンスの具体化** |
| **P2-10 draft ready通知** | **S** | **低** | **FE** | **P1完了** | **2026-04-14追加。nextjs-developer委譲** |
| P3-1 プロンプト共通化 | M | 低 | なし | P2完了 | |
| P3-2 why_nowスロット | **XL** | **高** | **広範囲** | P2完了 | 別spec推奨。FE: coerceQuestionStage/safeparse/progress等 |
| P3-3 否定表現拡張 | S | 低 | なし | P2-4 | |
| P3-4 キーワード最適化+レスポンス計装 | M | 低 | なし | P2-3 | P1-7で初期対応済み。P2-3ログ+レスポンス計装で最適化 |
| P3-5 名前空間統一 | S | 低 | 非推奨 | P2完了 | |
| **P4-1 eval ペルソナ** | **S** | **低** | **なし** | **なし** | **Prompt Design +1** |
| **P4-2 セマンティック確認** | **M** | **中** | **なし** | **P1-1** | **Judgment Accuracy +3。feature flag `MOTIVATION_SEMANTIC_CONFIRM` 下。gpt-nano (→gpt-5.4-nano)** |
| **P4-3 信頼度スコアリング** | **M** | **低〜中** | **なし** | **P1-1** | **Judgment Accuracy +2。出力スキーマ拡張 + 後処理** |
| **P4-4 マルチパス精錬** | **L** | **中** | **なし** | **P2-2** | **Draft Quality +2。AI臭 Tier2+企業固有性+結論先行→1回修正パス** |
| **P4-5 スロット要約注入** | **S** | **低** | **なし** | **なし** | **Draft Quality +1。slot_summaries をドラフトプロンプトに構造化注入** |
| **P4-6 質問RAGカード** | **S** | **低** | **なし** | **P2-1** | **Mixed +1。evidence cards を質問プロンプトに注入** |
| **P4-7 履歴サイズガード** | **S** | **低** | **なし** | **なし** | **Safety +1。Pydantic max_length=40** |
| **P4-8 学生向け言語** | **S** | **低** | **なし** | **なし** | **Question UX +1。言語レジスタ指示追加** |

---

## 8. フェーズ完了条件（Exit Criteria）

各フェーズの完了判定は以下の **必須テスト・観測指標・許容レイテンシ/コスト** を全て満たすこと。

### P1 完了条件

| 区分 | 基準 |
|------|------|
| 必須テスト | `cd backend && python -m pytest tests/ -v` 全 PASS。P1 で追加した全テストケースが PASS |
| ビルド | `npm run build` 型エラーなし |
| 観測指標 | evaluation エンドポイントで LLM 失敗時に 503 が返ること（手動 curl で確認） |
| 観測指標 | `slot_status_v2` に `filled_weak` が出現すること（staging で 1 セッション実施） |
| 観測指標 | 重複関数ゼロ: `motivation.py` 内に `motivation_context.py` と同名の関数定義がないこと (grep) |
| レイテンシ | next-question p95 < 5秒（P1 前後で有意な劣化なし） |

### P2 完了条件

| 区分 | 基準 |
|------|------|
| 必須テスト | backend + frontend 全ユニットテスト PASS |
| ビルド | `npm run build` 型エラーなし |
| 観測指標 | RAG 有効時のドラフトに企業固有名詞が 1つ以上含まれること（既知企業3社で検証） |
| 観測指標 | AI 臭 Tier 2 発火率を telemetry で計測可能であること |
| 観測指標 | フォールバック発火ログが出力されること（`reason=` パターンを grep） |
| 許容コスト | ドラフト生成1回あたりの追加 LLM コスト < $0.01（AI 臭リトライ含む） |
| レイテンシ | ドラフト生成 p95 < 15秒（AI 臭リトライ込み） |
| 中間再監査 | ゴールドセット3ケースで簡易スコア算出 → 70+ |

### P3 完了条件

| 区分 | 基準 |
|------|------|
| 必須テスト | 全ユニットテスト PASS |
| 観測指標 | プロンプト共通化後の各プロンプト内に重複ルールブロックがないこと |
| 観測指標 | フォールバック発火率 < 30%（P2-3 ログから算出） |

### P4 完了条件

| 区分 | 基準 |
|------|------|
| 必須テスト | 全ユニットテスト PASS（P4-2 feature flag ON/OFF 両方） |
| ビルド | `npm run build` 型エラーなし |
| 観測指標 | P4-2 (staging, flag ON): Layer 2 発火率と yes/no 比率を telemetry で計測 |
| 観測指標 | P4-3: confidence < 0.6 でダウングレードが発生すること（staging 1 セッション） |
| 観測指標 | P4-4: マルチパス精錬の発火率を telemetry で計測 |
| 許容コスト | P4-2 セマンティック確認 1回あたり < $0.001（gpt-nano エイリアス） |
| レイテンシ | next-question p95 < 5.5秒（P4-2 flag ON 時の許容増分 +500ms） |
| **最終再監査** | **ゴールドセット10ケースで総合スコア 90+ (Grade A)** |

---

### ユニットテスト（全フェーズ）

- フレームワーク: `pytest`（`backend/tests/` 既存パターン）
- カバレッジ対象:
  - P1: LLM 失敗時フォールバック挙動（error.error_type分岐）、JST タイムスタンプ、バリデーション緩和（疑問符・キーワード拡張）
  - P2: evidence cards 構築、AI 臭スコア算出、否定表現検出、動的文字数、フォールバック質問パス検証
  - P3: プロンプトビルダー出力、キーワード最適化
  - P4: セマンティック確認（mock LLM yes/no/timeout）、信頼度ダウングレード、マルチパス精錬発火条件、スロット要約注入、履歴サイズバリデーション

### インテグレーションテスト（P1, P2）

- `unittest.mock.AsyncMock` で LLM レスポンスを mock
- `_prepare_motivation_next_question` の全体フローを検証
- レスポンスが `NextQuestionResponse` スキーマに適合することを確認

### Live AI テスト（P2, P4）

- `backend/app/testing/es_review_live_gate.py` パターンを流用
- Before/After 比較指標:
  - ドラフト内の企業固有名詞カウント
  - AI 臭スコア分布
  - フォールバック質問使用率
  - マルチパス精錬の発火率と改善効果（P4-4）
  - セマンティック確認の Layer 2 発火率（P4-2）

### E2E（P3-2 のみ）

- Playwright テストで `why_now` スロットが UI に表示されることを検証
- P1/P2/P4 は既存 E2E がそのまま通過すること

### 最終検証（P4 完了後）

- ゴールドセット10ケースで総合スコアを再計測 → 90+ を確認
- 6軸評価マトリクスを再作成し、全軸の改善を検証

---

## 9. 主要ファイル一覧

| ファイル | 行数 | 関連フェーズ |
|---------|:---:|-------------|
| `backend/app/routers/motivation.py` | 3,787 | P1-1,2,3,4,5 / P2-1,2,3,5,6 / P3-4 / P4-2,4,5,6 |
| `backend/app/routers/motivation_context.py` | 767 | P1-4(参照元) / P2-4 / P3-3 / P4-2 |
| `backend/app/routers/motivation_planner.py` | 203 | P1-4(参照元) / P3-5 |
| `backend/app/prompts/motivation_prompts.py` | 251 | P1-1,3,6 / P2-7,9 / P3-1 / P4-1,3,8 |
| `backend/app/prompts/es_templates.py` | - | P1-6 / P2-1 |
| `backend/app/routers/es_review_grounding.py` | - | P2-1 / P4-6 (再利用元) |
| `backend/app/routers/es_review_validation.py` | - | P2-2 / P4-4 (再利用元) |
| `backend/app/routers/motivation_models.py` | 155 | P2-1 / P3-2,5 / P4-7 |
| `src/app/api/motivation/[companyId]/generate-draft/route.ts` | - | P2-1 |

---

## 10. 期待される成果

| 指標 | 現状 (42) | P1完了後 | P2完了後 | P3完了後 | **P4完了後** |
|------|:---:|:---:|:---:|:---:|:---:|
| 監査スコア | 42 | 60 | 75 | 80+ | **92** |
| slot_status_v2 精度 | 実質3-state | 4-state正常 | 同左 | 同左 | **信頼度ゲート付き** |
| ドラフト企業固有性 | なし | なし | RAG注入済み | 同左 | **マルチパス精錬** |
| AI臭スコア平均 | 未計測 | 未計測 | Tier B未満 | 同左 | **精錬で改善** |
| フォールバック発火率 | 推定70%+ | 目標30%以下 | 計測で検証 | 最適化済み | 同左 |
| 質問の企業固有キーワード含有率 | 推定0% | 同左 | 目標50%+ | 同左 | **RAGカード注入** |
| LLM障害検知 | 不可 | 可 | 同左 | 同左 | 同左 |
| 重複関数数 | 37 | 0 | 0 | 0 | 0 |
| draft ready通知 | 未実装 | 同左 | 実装済み | 同左 | 同左 |
| **回答確認精度** | **キーワードのみ** | 同左 | 同左 | 同左 | **セマンティック+キーワード** |
| **入力バリデーション** | **サイズ無制限** | 同左 | 同左 | 同左 | **40msg上限** |

### P4 スコア積み上げ詳細

| Item | 改善軸 | ポイント | 累積 |
|------|--------|:---:|:---:|
| P3 baseline | — | — | ~80 |
| P4-1 eval ペルソナ | Prompt Design | +1 | 81 |
| P4-2 セマンティック確認 | Judgment Accuracy | +3 | 84 |
| P4-3 信頼度スコアリング | Judgment Accuracy | +2 | 86 |
| P4-4 マルチパス精錬 | Draft Quality | +2 | 88 |
| P4-5 スロット要約注入 | Draft Quality | +1 | 89 |
| P4-6 質問RAGカード | Mixed | +1 | 90 |
| P4-7 履歴サイズガード | Safety | +1 | 91 |
| P4-8 学生向け言語 | Question UX | +1 | 92 |

---

## 11. 次回監査

P4 完了後、ゴールドセット10ケースで総合スコア再計測を実施。90+ (Grade A) の達成を確認。
中間チェックポイントとして P2 完了後にも簡易再検証を推奨（P2 完了後1週間以内）。

---

## 12. 改訂履歴

### 2026-04-16 P2 着手前再評価

**P1 完了状況:** 全7項目 (P1-1 〜 P1-7) の現況確認を実施し、すべて implemented と判定。各項目見出し直下に `[完了 2026-04-16]` マーカーを追記。

**P2 状況:**
- 完了: P2-10 (draft ready 通知) — 別 PR で先行マージ済
- 未着手: P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8, P2-9 (9項目)

**P2 着手前レビューで指摘された4つの設計欠陥と本計画書への反映:**

| # | 指摘 | 反映先セクション |
|---|------|-----------------|
| 1 | P2-7/P2-9 の prompt 変更が `notion_prompts.json` に上書きされ無効化される | P2-7 / P2-9 に「実装手順 (managed prompt 同期必須)」サブセクションを追記 |
| 2 | P2-1 の grounding_mode on/off で弱根拠の企業言及を強制し品質劣化 | P2-1 に「設計改善」サブセクション内 `_resolve_motivation_grounding_mode()` (coverage 連動) を追記 |
| 3 | P2-1 の answer マッピングが粗く evidence ranking が不安定 | P2-1 に「設計改善」サブセクション内 `_build_motivation_grounding_answer()` (決定論的構築) を追記 |
| 4 | P2-2 のリトライ採用条件不在で字数超過版が返る経路 | P2-2 に「設計改善」サブセクション内 `_select_motivation_draft()` (deterministic 6パターン) を追記 |

**P2 実装順序 (3 Wave 構成):**

- **Wave 1 (並行可)**: P2-3 (ログ計装), P2-4 (否定表現修正), P2-5 (draft-ready 計装), P2-6 (動的文字数) — 小規模独立、低リスク
- **Wave 2 (順次)**: P2-7 (positive instruction), P2-9 (ペルソナ改善) — managed prompt 同期必須
- **Wave 3 (順序依存)**: P2-8 (フォールバックリライト) → P2-1 (RAG グラウンディング) → P2-2 (AI臭抑制 + 採用ルール) — 大規模クロスカット

**前提知識 (実装担当者向け):**

- **Managed prompt の上書き機構**: `motivation_prompts.py` の `_GROUNDING_AND_SAFETY_RULES` (L11-19) と `_MOTIVATION_QUESTION_PROMPT_FALLBACK` (L116) は f-string で展開され `_MOTIVATION_*_PROMPT_FALLBACK` 文字列に組込まれる。これらは `get_managed_prompt_content("motivation.<key>", fallback=_FALLBACK)` の `fallback` 引数として渡される。`notion_prompts.json` (`backend/app/prompts/generated/`) に該当 key があると JSON が完全勝利し、`.py` の変更は無視される。同期スクリプト: `scripts/prompts/sync_notion_prompts.py`。キャッシュ (`notion_registry._PROMPT_CACHE`) はプロセス起動時に1回だけ読込み。
- **grounding_mode の三段階**: `none` / `company_general` / `role_grounded`。ES review の決定ロジック (`es_review.py:409-437` `_evaluate_grounding_mode()`) を志望動機向けに簡略化したものを `_resolve_motivation_grounding_mode()` として実装する。
- **coverage_level の四段階**: `strong` / `partial` / `weak` / `none` (`es_review_grounding.py:835-888`)。**危険ゾーン**: `company_general` × `weak` coverage で `company_grounding="required"` 設定時、薄い根拠で企業言及2点を強制する。これを避けるため `weak` 以下では grounding_mode を `none` にダウングレードする。

**次回監査:** P2 実装完了後、ゴールドセット3ケースで簡易再検証 (60→75 Grade C 達成確認)。実装完了時に本セクションへ「2026-04-XX P2 実装後検証」ブロックを追記し、観測指標 (フォールバック発火率、AI smell tier 分布、`draft_ready_source` 分布) の staging 計測結果を記録する。
