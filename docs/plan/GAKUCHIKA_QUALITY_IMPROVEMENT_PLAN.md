---
topic: gakuchika
plan_date: 2026-04-14
based_on_review: feature/gakuchika_quality_audit_20260412.md
status: 未着手
---

# ガクチカ作成機能 品質改善計画 v4

**作成日:** 2026-04-14
**根拠:** `docs/review/feature/gakuchika_quality_audit_20260412.md` + 競合調査 + 実ユーザー会話分析
**現在スコア:** C (52/100) → **目標:** A- (85+/100)
**スコープ:** フルスタック（バックエンド + フロントエンド）
**レビュー履歴:** v1→v2（grace mode 廃止, TASK_IMPLICIT 分離, 軽量化）→ v3（STAR 再整列 blocked 対応, global ルール分離, cold start 対策, テスト計画強化）→ **v4（フルスタック拡張: 判定緩和, フロントUX刷新, 競合分析反映, A-目標へ引き上げ）**

---

## v3→v4 の主要変更点

| 変更 | v3 | v4 |
|------|----|----|
| スコープ | バックエンドのみ | フルスタック |
| 目標 | B+ (75-80) | A- (85+) |
| 判定ロジック | readiness判定は一切緩めない | action_ownership, result_traceability を緩和（偽陰性根本修正） |
| フロントエンドUX | 対象外 | 自然言語進捗, DraftReadyPanel改善, ThinkingIndicator文脈化, useReducer化 |
| コーチ進捗メッセージ | なし | サーバーサイド生成の自然言語進捗 |
| 競合分析 | なし | 市場調査反映（対話型ガクチカ特化は市場空白） |
| 禁止表現 | 6→12 | 6→14 |
| anti_patterns | 3→6 | 3→8 |

---

## 対象ファイル

| ファイル | 行数 | 変更内容 |
|---|---|---|
| `backend/app/prompts/gakuchika_prompts.py` | 313 | ペルソナ、承認パターン、禁止表現14個、few-shot、メッセージ分離 |
| `backend/app/prompts/es_templates.py` | 1879 | AI臭排除（anti_patterns 8個 + constraints + 学生表現保存） |
| `backend/app/routers/gakuchika.py` | 1616 | バグ修正3件、判定緩和3件、ループ防止、コーチ進捗メッセージ |
| `backend/tests/gakuchika/test_gakuchika_flow_evaluators.py` | 118 | ImportError修正、新規ロジックテスト8件 |
| `backend/tests/gakuchika/test_gakuchika_next_question.py` | 361 | タプル対応書き換え、新規プロンプトテスト6件 |
| `src/components/gakuchika/NaturalProgressStatus.tsx` | 新規 | 自然言語進捗コンポーネント |
| `src/components/gakuchika/DraftReadyPanel.tsx` | 新規 | 改善版ES作成可パネル（page.tsx L54-148から抽出） |
| `src/app/(product)/gakuchika/[id]/page.tsx` | ~1000 | UI統合（進捗・パネル・ヒント・カウンター） |
| `src/lib/gakuchika/conversation-state.ts` | 100+ | 型拡張 + ユーティリティ関数追加 |
| `src/hooks/gakuchika/useGakuchikaDomain.ts` | 180+ | 16 useState → useReducer化 |
| `src/components/chat/ThinkingIndicator.tsx` | 50+ | contextLabel prop 追加 |

---

## Phase 0: クリティカルバグ修正（全作業のブロッカー）

### 0.1 テスト ImportError 修正
**ファイル:** `test_gakuchika_flow_evaluators.py` L8
**CI ブロッカー** — `pytest tests/gakuchika/test_gakuchika_flow_evaluators.py -q` で collection error 再現済み

- import から `_should_retry_gakuchika_draft` を削除
- テスト `test_should_retry_gakuchika_draft_for_short_and_shallow_output` (L110-113) を削除

### 0.2 request シャドウイング解消
**ファイル:** `gakuchika.py` L1373, L1452, L1471, L1543

`request = payload` を削除し、以降の参照を `payload` に統一。`@limiter.limit` が正しい Request を参照できるようにする。

### 0.3 STAR 再整列ループ修正（最重要バグ）
**ファイル:** `gakuchika.py` L828-832, L873-877

**問題:** L866-872 で blocked を避けて focus_key を差し替えても、直後の STAR 再整列 `_detect_es_focus_from_missing(missing_elements)` (L875) が blocked な先頭要素に戻してしまう。Live テストで同じ質問が20回以上繰り返される原因。

**修正:**
```python
def _detect_es_focus_from_missing(missing_elements: list[str], blocked: set[str] | None = None) -> str:
    blocked = blocked or set()
    for key in CORE_BUILD_ELEMENTS:
        if key in missing_elements and key not in blocked:
            return key
    return "result"
```
呼び出し側 (L875) で `blocked=set(blocked_focuses)` を渡す。

---

## Phase 1: 判定ロジック修正（4-5問でdraft_ready到達を実現）

### 1.1 暗黙的タスク表現パターン追加
**ファイル:** `gakuchika.py`

新定数 `TASK_IMPLICIT_PATTERNS`:
```python
TASK_IMPLICIT_PATTERNS = (
    "なかった", "ない状態", "できていな", "足りな", "少な", "低かった",
    "うまくいかな", "始めた", "立ち上げ", "改善しよう", "変えよう",
    "必要だと", "何とかし", "放置されて", "手つかず", "声が上が",
    "不満", "離脱", "ばらつ", "属人", "回らな",
)
```

`_build_draft_quality_checks()` L434 の `task_clarity` を拡張:
```python
"task_clarity": (
    _contains_any(n, TASK_PATTERNS) and _contains_any(n, CONNECTIVE_PATTERNS)
) or (
    _contains_any(n, TASK_IMPLICIT_PATTERNS) and (
        _contains_any(n, CONNECTIVE_PATTERNS) or _contains_any(n, ACTION_PATTERNS)
    )
),
```

**重要:** `_classify_input_richness` (L400) には使用しない（初期ルーティングの偽陽性防止）。

### 1.2 action_ownership 緩和（v4 新規）
**ファイル:** `gakuchika.py` L427-429

**問題:** 「提案して導入した」等、明示的な一人称なしの複合アクションが false になる。

**修正:** 複合アクション（ACTION_PATTERNS が2つ以上）を所有権ありとみなす:
```python
action_hit_count = sum(1 for p in ACTION_PATTERNS if p in normalized)
action_specific = _contains_any(normalized, ACTION_PATTERNS) and (
    "私" in normalized or "自分" in normalized
    or _contains_any(normalized, ROLE_CLARITY_PATTERNS)
    or action_hit_count >= 2
)
```

### 1.3 result_traceability 緩和（v4 新規）
**ファイル:** `gakuchika.py` L438

**問題:** 数字＋アクション可視でも接続詞がないと false になる。

**修正:** 数字を含む場合の代替パス追加:
```python
"result_traceability": (
    (result_visible and action_specific and _contains_any(normalized, CONNECTIVE_PATTERNS))
    or (result_visible and action_specific and _contains_digit(normalized))
),
```

**安全弁:** `MIN_USER_ANSWERS_FOR_ES_DRAFT_READY = 4` のゲート（L904）と `question_cap_ready` の6問ゲート（L888-893）は維持。個別チェック緩和のみで全体ゲートは変更しない。

### 1.4 `_build_known_facts` 窓拡張
**ファイル:** `gakuchika.py` L678-683

先頭2件 + 末尾3件 + `max_total_chars=1200` キャップ。初期コンテキスト消失を防止。

---

## Phase 2: プロンプト品質改善

### 2.1 コーチペルソナ設定
**ファイル:** `gakuchika_prompts.py` + `gakuchika.py`

新定数 `COACH_PERSONA`:
```
あなたは「コンパス先輩」。就活生の ES 作成を手伝うキャリアアドバイザーです。
- 元人事経験があり、面接官がどこを見るかを知っている
- 口調は丁寧だが堅すぎない。学生が萎縮しない距離感
- 質問の前に、前回の回答への短い承認（1文、15〜30字）を必ず入れる
- 承認は内容に具体的に触れること。「いい回答ですね」等の空の承認は禁止
- 学生の言葉づかいを大事にし、無理に書き言葉に直さない
```

3つの質問プロンプト（`INITIAL_QUESTION_PROMPT`, `ES_BUILD_AND_QUESTION_PROMPT`, `STAR_EVALUATE_AND_QUESTION_PROMPT`）に `{coach_persona}` 注入。

**cold start 対策:** `BUILD_FOCUS_FALLBACKS["context"]["question"]` (L122-126) をペルソナトーンに書き換え。

### 2.2 承認+質問パターン（v4 新規）
**ファイル:** `gakuchika_prompts.py`

ES_BUILD と STAR_EVALUATE プロンプトのタスクセクションに追加:
```
## 承認+質問パターン（必須）
- question の冒頭に、前回の回答に触れた短い承認（15〜30字）を置く
- 承認+質問の合計は100字以内を目安
- 例: 「SNS発信で参加者が倍増したのは大きな成果ですね。その時、他のメンバーとは〜」
```

**フロントエンド変更不要** — 承認は `question` フィールド内に含まれる。

### 2.3 禁止表現の拡充
**ファイル:** `gakuchika_prompts.py` L19-26

6→14パターン。新規8パターン:
- 「もう一歩踏み込んで」等のメタ深掘り
- 「印象に残っている範囲で」等の記憶配慮（Liveテスト8回出現）
- 過剰賞賛 / 複合質問 / 内省のみ質問 / yes/no困難確認 / 過剰配慮 / 60字超冗長質問

### 2.4 few-shot 例文
**ファイル:** `gakuchika_prompts.py`

- 質問生成: seed_only/rough_episode 各2例（`input_richness_mode` に応じて条件注入）
- ES下書き: 300/400/500字の3例（`char_limit` に応じて1例のみ注入）
- 良い質問/悪い質問の比較例を禁止表現セクションに追加

**トークン影響:** +150-350 tokens/request（条件注入）

### 2.5 質問生成側の system/user 分離
**ファイル:** `gakuchika_prompts.py` + `gakuchika.py`

`_build_es_prompt()` と `_build_deepdive_prompt()` → `(system_prompt, user_message)` タプル返却。
- system: ペルソナ + ルール + 原則 + 禁止表現 + few-shot（安定、キャッシュ可能）
- user: テーマ + 会話 + known_facts + タスク指示（動的）

---

## Phase 3: フロントエンドUX改善（v4 新規）

### 3.1 自然言語プログレスコンポーネント
**新規:** `src/components/gakuchika/NaturalProgressStatus.tsx`

`resolvedFocuses` / `focusKey` / `missingElements` から自然言語ステータスを生成:
```
✅ 状況が整理できました
✅ 課題が見えてきました
🔵 行動の詳細を聞いています
⬜ 結果・変化
「あと1-2問で作成できそうです」
```

残り質問数推定: `missingElements.length` ベースのフロントエンド計算。

**修正対象:**
- `src/app/(product)/gakuchika/[id]/page.tsx` サイドバー + モバイルステータス
- `src/components/gakuchika/GakuchikaCard.tsx` コンパクト表示
- `src/lib/gakuchika/conversation-state.ts` ユーティリティ追加

### 3.2 コーチ進捗メッセージ
**Backend:** `gakuchika.py` に `_build_coach_progress_message()` 関数追加（サーバーサイド計算、トークンコストゼロ）。`_default_state()` に `coach_progress_message` フィールド追加。

**Frontend:** `ConversationState` に `coachProgressMessage: string | null` 追加。`NaturalProgressStatus` で表示。

### 3.3 ThinkingIndicator 文脈表示
**ファイル:** `src/components/chat/ThinkingIndicator.tsx`

`contextLabel` prop 追加。`progressLabel` を変換して「行動について整理しています...」表示。

### 3.4 DraftReadyPanel 改善
**新規:** `src/components/gakuchika/DraftReadyPanel.tsx`（page.tsx L54-148 から抽出）

- セレブレーションヘッダー:「お疲れさまでした! ES材料が揃いました」
- 収集済みSTAR要素のミニサマリー
- CTAヒエラルキー明確化（primary/outline）

### 3.5 質問カウンター表示
モバイルステータスとサイドバーに「3問目 / 約5問」表示。

### 3.6 Answer Hint の柔らかいデザイン
ヒントアイコン + `rounded-xl bg-primary/5` コンテナ。

### 3.7 useGakuchikaDomain の useReducer 化
**ファイル:** `src/hooks/gakuchika/useGakuchikaDomain.ts`

16 useState → 1 useReducer + discriminated union actions。`APPLY_CONVERSATION_UPDATE` で7 setterを原子的更新。既存公開API維持（後方互換）。

---

## Phase 4: ES生成品質（AI臭排除 + 学生の声保持）

### 4.1 学生表現抽出関数
**ファイル:** `gakuchika.py`

`_extract_student_expressions(messages)`: 引用句・数字表現・一人称アクションを最大5件抽出 → ES下書きプロンプトに注入。

### 4.2 ガクチカ anti_patterns 拡張
**ファイル:** `es_templates.py`

3→8項目:
- 「この経験を通じて〜の重要性を学んだ」定型学び表現
- 「多様な」「幅広い」抽象修飾語の単独使用
- 抽象プロセス語の羅列
- 学生の口語を硬い書き言葉に全置換
- 結論と学びの内容繰り返し

### 4.3 ガクチカ専用ES生成制約
**ファイル:** `es_templates.py` `build_template_draft_generation_prompt()`

`template_type == "gakuchika"` 分岐で追加:
- 学生の口語表現保存指示
- 配分ガイド: 結論15% / 状況+課題20-25% / 行動35-40% / 成果15-20% / 学び10%以下

### 4.4 ブロック済みフォーカスのプロンプト注入
**ファイル:** `gakuchika.py` `_build_es_prompt()` + `_build_deepdive_prompt()`

blocked_focuses / asked_focuses 通知を追加。LLMが同じ質問を繰り返すことを防止。

---

## Phase 5: テスト

### 5.1 既存テスト修正
- ImportError 修正
- `_build_es_prompt()` タプル返却に伴う全面書き換え
- `_build_known_facts` テストを全件固定比較に強化

### 5.2 新規テスト（ロジック 8件）
- `test_implicit_task_with_connective` / `test_implicit_task_with_action_no_connective` / `test_implicit_task_alone_is_insufficient`
- `test_classify_input_richness_ignores_implicit_patterns`
- `test_choose_build_focus_skips_blocked`
- `test_star_realignment_respects_blocked`
- `test_extract_student_expressions`
- `test_build_known_facts_preserves_early_and_recent`

### 5.3 新規テスト（プロンプトアセンブリ 6件）
- `test_build_es_prompt_includes_blocked_focuses`
- `test_build_es_prompt_includes_coach_persona`
- `test_build_deepdive_prompt_includes_blocked_focuses`
- `test_draft_prompt_includes_anti_ai_for_gakuchika_only`
- `test_draft_prompt_includes_few_shot_for_matching_char_limit`
- `test_generate_es_draft_passes_student_expressions_to_builder`

### 5.4 UI テスト
- `npm run ui:preflight -- /gakuchika/[id] --surface=product`
- `npm run lint:ui:guardrails`
- `npm run test:ui:review -- /gakuchika/[id]`

---

## 実装順序

```
 Step 1:  Phase 0.1 — テストImportError修正
 Step 2:  Phase 0.2 — request シャドウイング除去            ← Step 1と並行可
 Step 3:  Phase 0.3 — STARループ修正                       ← 最重要バグ
 Step 4:  Phase 1.1 + 1.2 + 1.3 — 判定ロジック緩和3件      ← 並行実行可
 Step 5:  Phase 1.4 — known_facts窓拡張
 Step 6:  Phase 2.1 + 2.2 + 2.3 — ペルソナ+承認+禁止表現   ← 並行実行可
 Step 7:  Phase 2.5 — system/user分離                      ← Step 6に依存
 Step 8:  Phase 2.4 — Few-Shot例                           ← Step 7に依存
 Step 9:  Phase 4.4 — ブロック済みフォーカス注入             ← Step 7に依存
 Step 10: Phase 4.1 + 4.2 + 4.3 — AI臭排除+学生の声        ← Step 7に依存
 Step 11: Phase 3.1 + 3.2 — 自然言語進捗UI + コーチメッセージ ← Step 4完了後
 Step 12: Phase 3.3 + 3.4 + 3.5 + 3.6 — UI改善群           ← Step 11に依存
 Step 13: Phase 3.7 — useReducer化                          ← 独立、最後にマージ
 Step 14: Phase 5 — テスト全件（各Stepで逐次追加）
```

## サブエージェント委譲

| Phase | 委譲先 | 主要ファイル |
|---|---|---|
| 0.1 | `test-automator` | tests/gakuchika/ |
| 0.2, 0.3 | `fastapi-developer` | routers/gakuchika.py |
| 1.1-1.4 | `fastapi-developer` | routers/gakuchika.py |
| 2.1-2.4 | `prompt-engineer` | prompts/gakuchika_prompts.py |
| 2.5 | `fastapi-developer` | routers/gakuchika.py |
| 3.1-3.6 | `ui-designer` + `nextjs-developer` | components/gakuchika/, [id]/page.tsx |
| 3.7 | `nextjs-developer` | hooks/gakuchika/ |
| 4.1-4.4 | `prompt-engineer` + `fastapi-developer` | es_templates.py, gakuchika.py |
| 5.1-5.4 | `test-automator` | tests/, e2e/ |
| 最終レビュー | `code-reviewer` | 全ファイル |

## 期待スコア推移

| 軸 | 現在 | v3目標 | v4目標 | 主要変更 |
|----|------|--------|--------|----------|
| プロンプト設計 | 9/15 | 12/15 | 13/15 | ペルソナ, 承認パターン, few-shot, system/user分離 |
| ES下書き生成 | 8/15 | 11/15 | 12/15 | AI臭排除, 学生の声, anti_patterns 8個 |
| ES作成判定 | 6/15 | 10/15 | 13/15 | 暗黙タスク, 所有権緩和, 追跡緩和, ループ修正 |
| 深掘り/STAR | 7/10 | 8/10 | 9/10 | ブロック注入, コーチ進捗メッセージ |
| テスト | 4/15 | 10/15 | 12/15 | 16+新規テスト, ImportError修正, UIテスト |
| コード品質 | 6/10 | 7/10 | 8/10 | Shadowing修正, known_facts, useReducer化 |
| フロントUX | 7/10 | 7/10 | 9/10 | 自然言語進捗, DraftReady改善, カウンター |
| セーフティ | 8/10 | 9/10 | 9/10 | Shadowing修正 |
| **合計** | **52** | **~75** | **~87** | v3→v4: +12点（判定緩和+フロントUX） |

## リスク軽減

| リスク | 軽減策 |
|--------|--------|
| 判定緩和で早すぎるdraft_ready | `MIN_USER_ANSWERS=4` と `question_cap_ready` の6問ゲートは維持。個別チェック緩和のみ |
| ペルソナでトークン増加 | +120 tokens/request。system/user分離でキャッシュ効率化 |
| 学生表現抽出の偽陽性 | 最大5件、suggestions扱い（LLMが無視可能） |
| useReducer移行の破壊 | 既存公開API維持。最後にマージして競合最小化 |
