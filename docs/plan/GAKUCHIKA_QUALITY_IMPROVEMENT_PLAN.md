---
topic: gakuchika
plan_date: 2026-04-14
based_on_review: feature/gakuchika_quality_audit_20260412.md
status: 完了 (Phase 7-A〜7-H 全完了、133 tests PASS、judge mean 92/100)
last_update: 2026-04-20
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

## Phase 6: v3 Live Test 残課題 (2026-04-19 追加)

> **根拠**: v3 live test (8ケー���) 結果 pass=1 / degraded=3 / fail=4。テスト��ンフラ問題と LLM 品質問題を分離して対応する。
> **参照**: `docs/review/ai_quality_comprehensive_20260419.md` Appendix A

### 6-A. テストインフラ修正 (LLM 品質とは独立)

#### 6-A-1. フォールバック汚染排除

| 項目 | 内容 |
|------|------|
| **問題** | `conversation_runner.py` L23-29 の `GAKUCHIKA_FALLBACK_ANSWERS` が塾講師シナリオ固定。L174 で `case_answers < 4` 件のケースが全てこのバンクにフォールバックし、「学園祭実行委員」「開発サークル」等に「宿題提出率」が注入される |
| **影響** | 8ケース中6ケースが汚染の影響を受ける |
| **対象ファイル** | `backend/tests/conversation/conversation_runner.py`, ケース定義元 |
| **作業内容** | ① extended 5ケースの answers を各 8 件以上に拡充（各シナリオのドメインに適合した回答） ② フォールバック閾値を `>= 4` から `>= 8` に引き上げ ③ `GAKUCHIKA_FALLBACK_ANSWERS` のグローバル塾講師シナリオを廃止し、汎用 STAR 質問応答テンプレートに置換 |
| **受け入れ条件** | v3 テスト再実行でフォールバック汚染 0 件。全8ケースが case_answers のみで会話完了 |
| **工数感** | 小 |

#### 6-A-2. テストケース品質強化

| 項目 | 内容 |
|------|------|
| **作業内容** | ① `requiredQuestionTokenGroups` が未定義のケースがないか確認し全ケースに必須化 ② 各ケースの answers が STAR 5 観点（状況・課題・行動・結果・学び）を網羅しているか検証 �� 回答バンクのドメイン整合性チェック |
| **受け入れ条件** | 全ケースに `requiredQuestionTokenGroups` が定義され、answers が 5 観点をカバー |
| **工数感** | 小 |

### 6-B. LLM 品質改善

#### 6-B-1. 質問ループ検出 + トピックスキップ

| 項目 | 内容 |
|------|------|
| **問題** | ユーザーが同一/無関係な回答を繰り返した場合、LLM が同じ質問を反復。最��� 11 回の同一質問ループが観測された (volunteer_outreach) |
| **対象ファイル** | `backend/app/routers/gakuchika.py`, `backend/app/prompts/gakuchika_prompts.py` |
| **作業内容** | ① 直近 N 問の質問テキスト類似度を計算（embedding or 文字列一致率） ② 閾値超の重複検出時に `blocked_focuses` に追加し、次の question_group にスキップ ③ スキップ時のユーザー向けメッセージ（「別の観点からお聞きしますね」） ④ ループ検出回数メトリクスの記録 |
| **受け入れ条件** | 同一質問の連続反復が最大 2 回まで。3 回目で自動スキップ |
| **工数感** | 中 |
| **v3 エビデンス** | scope_and_role: 3x / team_conflict: 8+x / volunteer_outreach: 11x |

#### 6-B-2. question_group カバレッジの動的計画

| 項目 | 内容 |
|------|------|
| **問題** | LLM が「結果数値確認」に偏重し、role/motivation, learning/transfer グループに遷移しない。4/4 fail が satisfied_groups=1/2 |
| **対象ファイル** | `backend/app/routers/gakuchika.py`, `backend/app/prompts/gakuchika_prompts.py`, `backend/app/prompts/gakuchika_prompt_builder.py` |
| **作業内容** | ① 本番ループ中に `satisfied_groups` をリアルタイムトラッキング ② 未到達グループのリストをプロンプ��に明示注入（「まだ聞けていない観点: 役割/担当、学び/今後への活用」） ③ question_count が閾値（例: 4問）を超えた場合に未到達グループへの強制遷移 ④ `required_question_groups` をテストケース定義から読み取り、評価時に使用 |
| **受け入れ条件** | AI Live テストで `required_question_group_miss` が 0 件 |
| **工数感** | 中 |
| **v3 エビデンス** | process_over_result / retail_shift_coordination / engineering_team_latency / research_lab_reproducibility 全て satisfied_groups=1/2 |

#### 6-B-3. ドラフトの事実矛盾検出

| 項目 | 内容 |
|------|------|
| **問題** | フォールバック汚染下でドラフトが無関係な事実を含んだ。テストインフラ修正後も、ユーザーが矛盾した情報を入力した場合に備えたガードが必要 |
| **対象ファイル** | `backend/app/routers/gakuchika.py`, `backend/app/prompts/es_templates.py` |
| **作業内容** | ① ドラフト生成プロンプトに「ユーザーが明言していない事実をドラフトに含���ない」制約を強化 ② `_extract_student_expressions` の出力とドラフトの fact overlap を検証する post-generation check |
| **受け入れ条件** | judge の user_fact_preservation スコアが全ケースで 3/5 以上 |
| **工数感** | 中 |

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
 Step 15: Phase 6-A-1 — フォールバック汚染排除 (独立、即着手可)
 Step 16: Phase 6-A-2 — テストケース品質強化        ← Step 15 に依存
 Step 17: Phase 6-B-1 + 6-B-2 — ループ検出 + グループ動的計画  ← Step 16 完了後
 Step 18: Phase 6-B-3 — ドラフト事実矛盾検出        ← Step 17 に依存
 Step 19: v3 テスト再実行 — 全 8 ケース pass 確認    ← Step 18 完了後
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
| 6-A | `test-automator` | conversation_runner.py, ケース定義 |
| 6-B-1, 6-B-2 | `fastapi-developer` + `prompt-engineer` | gakuchika.py, gakuchika_prompts.py |
| 6-B-3 | `prompt-engineer` | es_templates.py, gakuchika.py |
| 最終レビュー | `code-reviewer` | 全ファイル |

## 期待スコア推移

| 軸 | 現在 | v3目標 | v4目標 | v4+P6目標 | 主要変更 |
|----|------|--------|--------|-----------|----------|
| プロンプト設計 | 9/15 | 12/15 | 13/15 | 14/15 | ペルソナ, 承認パターン, few-shot, system/user分離, +グループ動的計画 |
| ES下書き生成 | 8/15 | 11/15 | 12/15 | 13/15 | AI臭排除, 学生の声, anti_patterns 8個, +事実矛盾検出 |
| ES作成判定 | 6/15 | 10/15 | 13/15 | 13/15 | 暗黙タスク, 所有権緩和, 追跡緩和, ループ修正 |
| 深掘り/STAR | 7/10 | 8/10 | 9/10 | 10/10 | ブロック注入, コーチ進捗メッセージ, +ループ検出+スキップ |
| テスト | 4/15 | 10/15 | 12/15 | 14/15 | 16+新規テスト, ImportError修正, UIテスト, +フォールバック汚染排除 |
| コード品質 | 6/10 | 7/10 | 8/10 | 8/10 | Shadowing修正, known_facts, useReducer化 |
| フロントUX | 7/10 | 7/10 | 9/10 | 9/10 | 自然言語進捗, DraftReady改善, カウンター |
| セーフティ | 8/10 | 9/10 | 9/10 | 9/10 | Shadowing修正 |
| **合計** | **52** | **~75** | **~87** | **~90** | v4→v4+P6: +3点（ループ検出, グループ動的計画, 事実矛盾検出, テスト基盤修正） |

## リスク軽減

| リスク | 軽減策 |
|--------|--------|
| 判定緩和で早すぎるdraft_ready | `MIN_USER_ANSWERS=4` と `question_cap_ready` の6問ゲートは維持。個別チェック緩和のみ |
| ペルソナでトークン増加 | +120 tokens/request。system/user分離でキャッシュ効率化 |
| 学生表現抽出の偽陽性 | 最大5件、suggestions扱い（LLMが無視可能） |
| useReducer移行の破壊 | 既存公開API維持。最後にマージして競合最小化 |

---

## 改訂履歴

### 2026-04-17 Phase 0 + Phase 1 完了

- **Phase 0.1** test ImportError 修正（`_should_retry_gakuchika_draft` import 削除 + 関連テスト削除）。collection error 解消。
- **Phase 0.2** `request = payload` シャドウイング除去（4 handler: `get_next_question` / `get_next_question_stream` / `generate_structured_summary` / `generate_es_draft`）。`request.<attr>` 参照を全て `payload.<attr>` に置換。slowapi の `@limiter.limit` が必要とする `request: Request` 引数は残置。
- **Phase 0.3** STAR 再整列に blocked-aware ガード追加（`_detect_es_focus_from_missing` に optional `blocked` 引数、`_normalize_es_build_payload` の再整列で `blocked=set(blocked_focuses)` を渡す）。
- **Phase 1.1** `TASK_IMPLICIT_PATTERNS` 定数追加、`task_clarity` に「暗黙タスク + (接続詞 OR ACTION)」OR 分岐。`_classify_input_richness` は触らない。
- **Phase 1.2** `OTHER_ACTOR_PATTERNS` を module level に抽出＋拡張（`先輩の提案` / `指示された` / `手伝` を追加）。`action_specific` を全 disjunct に uniform OTHER_ACTOR guard 適用 + 複合 ACTION (>=2 ヒット) 分岐追加。passive 回帰テスト `test_build_draft_quality_does_not_treat_passive_mentions_as_owned_action` を緑化。
- **Phase 1.3** `result_traceability` に digit 代替パス追加（数値があれば接続詞不在でも traceability を認める、ただし `action_specific` は必須）。
- **Phase 1.4** `_build_known_facts` を「先頭 2 件 + 末尾 3 件選択、各 bullet 240 字省略、全体 1200 字キャップ」の新アルゴリズムに書き換え。

**検証**:
- `cd backend && pytest tests/gakuchika -q` → 33 passed / 1 failed / 1 skipped
- 追加テスト 10 件（`test_task_clarity_detects_implicit_task_with_connective` / `_with_action` / `_false_when_only_implicit_without_connective_or_action` / `test_classify_input_richness_ignores_implicit_patterns` / `test_action_ownership_recognized_for_compound_actions_without_first_person` / `test_action_ownership_true_when_first_person_present` / `test_result_traceability_accepts_digit_alternative` / `test_result_traceability_still_requires_action_specific` / `test_normalize_es_build_payload_skips_blocked_focus_when_realigning` / `test_build_known_facts_truncates_when_exceeding_char_cap`）すべて緑。
- `cd backend && pytest tests/interview --tb=no -q` → 67 passed / 1 skipped（regression なし）。
- `grep -nE "^    request = payload" backend/app/routers/gakuchika.py` → 0 件。
- import smoke `cd backend && python -c "from app.routers.gakuchika import router"` → 成功。

**残失敗 (本 Phase 範囲外)**:
- `test_evaluate_deepdive_completion_rejects_keyword_only_shallow_followup` は `_evaluate_deepdive_completion` のキーワード表面判定が「深い理由」を拾ってしまう pre-existing 仕様ギャップ。Phase 0.1 の collection 復帰で顕在化したが、`_build_draft_quality_checks` とは別経路の判定で Phase 2+ の scope。別タスクで改善する。

**残 Phase**: Phase 2 (`gakuchika_prompts.py` プロンプト拡充) / Phase 3 (frontend UX) / Phase 4 (`es_templates.py` AI 臭排除) / Phase 5 (追加テスト・UIテスト)。

---

### 2026-04-17 Phase 2 + 3 + 4 + 5 完了 (フルスタック)

**architecture-gate**: PASS_WITH_REFACTOR (`docs/review/architecture-gate/gakuchika_v4_20260417.md`)。B.0 を Phase A 先頭へ移動、SSE event contract 明文化、prompt_builder 責務を template-only に限定、の 3 点を反映して rev3 計画で実装。

**Phase A (事前ゲート + 基盤 refactor)**:
- **A.2** `ConversationState` SSOT 統合 (`src/lib/gakuchika/conversation-state.ts` が唯一、`src/app/api/gakuchika/state.ts` 削除)。`coachProgressMessage: string | null` 追加。snake_case ⇔ camelCase 変換対称。
- **A.3** SSE event contract 明文化 (`docs/architecture/GAKUCHIKA_SSE_CONTRACT.md`): `string_chunk` / `field_complete` / `complete` / `error` の 4 型を規定。partial 増分パッチ + complete 完全 replace の役割分離を固定。
- **A.4** `backend/app/routers/gakuchika.py` を 1721 → ~900 行へ責務分離 (`evaluators/deepdive_completion.py`, `evaluators/draft_quality.py`, `normalization/gakuchika_payload.py`, `prompts/gakuchika_prompt_builder.py`, `utils/gakuchika_text.py`)。`_determine_deepdive_phase` / `_build_draft_diagnostics` は routers に残置 (architecture-gate 必須要件)。
- **A.5** pre-existing deep-dive fail 修正: `UNCERTAINTY_MARKERS` / `SHALLOW_REASON_HEDGES` / `LEARNING_WISH_ONLY_PATTERNS` / `LEARNING_CONCRETE_PATTERNS` を `utils/gakuchika_text.py` に追加し、`_evaluate_deepdive_completion` の context-aware 判定を実装。`test_evaluate_deepdive_completion_rejects_keyword_only_shallow_followup` 緑化。

**Phase B (バックエンド)**:
- **B.1** `COACH_PERSONA` (職業プロ型・名前なし・経歴主張なし) 追加。3 質問プロンプトに `{coach_persona}` 注入。承認+質問パターン必須化。`_PROHIBITED_EXPRESSIONS_FALLBACK` を 6 → 14 パターンに拡張 (メタ深掘り / 記憶配慮 / 過剰賞賛 / 複合質問 / 内省のみ / yes-no 困難確認 / 過剰配慮 / 60 字超)。
- **B.2** `build_es_prompt_text` / `build_deepdive_prompt_text` / `generate_initial_question` を `(system_prompt, user_message)` タプル返却に変更。sync / SSE / structured_summary / es_draft の 4 経路で tuple を正しく受け取る。
- **B.3** few-shot 例文注入: 質問生成は `input_richness_mode` 条件で seed_only/rough_episode 各 2 例、ES 下書きは `char_limit` 条件で 300/400/500 字の 1 例のみ。system 側に入れて prompt caching で償却。
- **B.4** `blocked_focuses` / `asked_focuses` を user message に追加 (STAR 再整列ループの second line of defense)。
- **B.5** `_extract_student_expressions(messages, max_items=5)` を `normalization/gakuchika_payload.py` に追加。引用句 / 数字+単位 / 一人称アクションを最大 5 件抽出して ES 下書きプロンプトに suggestions として注入。
- **B.6** `es_templates.py` の `template_type == "gakuchika"` 分岐で `anti_patterns` を 3 → 8 に拡張 (定型学び表現 / 抽象修飾語 / 抽象動詞連打 / 学生口語全置換 / 結論+学び繰り返し)。配分ガイド (結論 15% / 状況+課題 20-25% / 行動 35-40% / 成果 15-20% / 学び ≤10%) を `_format_gakuchika_allocation_guide` で char_limit ベースに字数換算。
- **B.7** `_build_coach_progress_message()` (pure function, LLM なし、≤ 30 字) を `normalization/gakuchika_payload.py` に追加。stage / resolved_focuses / missing_elements / focus_key / ready_for_draft から決定論的に進捗メッセージを生成。`_default_state()` に `coach_progress_message` フィールド追加。SSE `field_complete` event で partial 送信、complete event の `conversation_state.coach_progress_message` に含める。

**Phase C (フロントエンド)**:
- **C.2** SSE ingestion: `fastapi-stream.ts` の `field_complete` ハンドラに `coach_progress_message` ケース追加。`conversation/stream/route.ts` が partial を forward、`useGakuchikaConversationController.ts` が state merge。
- **C.3** `NaturalProgressStatus.tsx` 新規: STAR 状態 (✅/🔵/⬜) + 残り質問数推定 + コーチメッセージ優先表示。サイドバー / モバイル / `GakuchikaCard.tsx` で共用。`role="status"`, `aria-live="polite"` 対応。
- **C.4** `DraftReadyPanel.tsx` を `page.tsx` L54-148 から抽出。セレブレーションヘッダー / STAR ミニサマリー / CTA ヒエラルキー (primary/outline) を整理。既存機能を 100% 保持。
- **C.5** `ThinkingIndicator.tsx` に `contextLabel` prop 追加。`progressLabel` を `progressLabelToContextLabel()` helper で「○○について整理しています...」に変換。
- **C.6** 質問カウンター (「3 問目 / 約 5 問」) と Answer Hint UI 改善 (`HelpCircle` アイコン + `rounded-xl bg-primary/5 border border-primary/10`)。

**Phase D (テスト)**:
- **D.2 LLM call-site 契約テスト** (`test_gakuchika_prompt_contracts.py`、8 件): persona / blocked_focuses 配置 / sync-stream 同形 / phase 注入契約 / pure function / 景表法チェック。
- **D.3 ロジック/プロンプトテスト**: Phase B の各 agent が +12 件追加 (`test_gakuchika_flow_evaluators.py`)、`_extract_student_expressions` 8 件 + `_build_coach_progress_message` 4 件。
- **D.4 Live シナリオ** (`test_gakuchika_live_scenarios.py`、10 件): executable completion criteria を deterministic に assert — 同一質問署名連続回数 ≤ 2 / 5 問以内 draft_ready 到達 / 承認付き質問比率 / 質問長制約 / トークン増分 (baseline 固定 + 同 method 比較で再現可能)。
- **D.6 LLM-judge golden set** (`backend/tests/conversation/gakuchika_golden_set.py`、5 件): 既存 `llm_judge.py::JUDGE_AXES["gakuchika"]` の 5 軸で scoring。`@pytest.mark.llm_judge` で CI skip、PR 時手動実行。
- **D.5 `ai-writing-auditor`** は実 LLM 生成を要するため PR 時手動実行 (release prerequisite)。

**検証結果**:
- `pytest backend/tests/gakuchika -q` → **64 passed / 1 skipped** (33 → 64 件、regression なし + Phase A.5 で pre-existing fail も解消)
- `pytest backend/tests/interview --tb=no -q` → **67 passed / 1 skipped** (regression なし)
- `npm run test:ui:review -- /gakuchika/[id]` → 5 viewport 全 pass
- `npm run lint:ui:guardrails` → clean
- TypeScript type check → 今回の変更由来で新規 error なし (pre-existing `gakuchika-stream-policy.test.ts` / `shared.test.ts` は本 scope 外)
- トークン増分: baseline 固定方法 (char_times_half) で method mismatch なし、budget +350 内

**code-reviewer 判定 → release blocker 3 件を修正後 READY_TO_MERGE**:
- M1: `gakuchika_golden_set.py::_compute_score_100` を `raw * 20` に修正 (docstring 通り 1→20, 5→100)
- M3: `backend/app/routers/gakuchika.py` の dead imports 8 件削除
- M5: `conversation-state.ts::buildConversationStatePatch` の `coachProgressMessage` を `null` late-wins 対応 (`hasOwnProperty` で null 明示上書きを許容)

**非スコープ / 次 PR 送り (architecture 整理)**:
- M2 (prompt_builder の template-only 厳格化、`generate_initial_question` の router 移動) — **2026-04-17 完了**
- M4 (NaturalProgressStatus の残り質問数をサーバ readiness gate と完全整合) — **2026-04-17 完了**
- L1-L9 (保守性改善、ドキュメント整合)
- Phase 3.7 useReducer 化 (計画通り見送り、別 PR)

---

### 2026-04-17 M2 + M4 完了

**M2 (prompt_builder template-only 厳格化)**:
- `backend/app/prompts/gakuchika_prompt_builder.py` から `generate_initial_question()` async 関数 (LLM call 含む) と `from app.normalization.gakuchika_payload import ...` の逆流 import を**完全削除**。template-only 化を達成。
- 移植先: `backend/app/routers/gakuchika.py` の `_generate_initial_question()` を完全実装に置換 (LLM call + fallback 分岐 + `_normalize_es_build_payload` 呼び出し)。
- prompt_builder は `_render_initial_question_system_prompt` / `_render_es_build_system_prompt` / `_render_deepdive_system_prompt` / `build_es_prompt_text` / `build_deepdive_prompt_text` の template-only helper のみを持つ。
- `test_gakuchika_prompt_contracts.py` に negative assertion 2 件追加: prompt_builder module に `generate_initial_question` 属性が無いこと、source に `from app.normalization` / `call_llm` が無いこと。

**M4 (remaining_questions_estimate 導入)**:
- `backend/app/normalization/gakuchika_payload.py` に pure function `_estimate_remaining_questions()` を新設。`stage` / `ready_for_draft` で早期 0 返却、それ以外は MIN_USER_ANSWERS gate / 残り missing_elements / quality_checks ギャップの最大を `_es_build_question_cap_threshold() - question_count` で cap した int を返す。
- `_default_state()` に `remaining_questions_estimate: int` フィールド追加。`_normalize_es_build_payload` / `_normalize_deepdive_payload` 両経路で算出して state に載せる。
- `routers/gakuchika.py` の SSE ハンドラで `field_complete: remaining_questions_estimate` の partial 送信を初期質問分岐と ES/deep-dive 分岐の 2 箇所に追加。
- Next API: `src/app/api/gakuchika/fastapi-stream.ts` に新 path 分岐を追加 (snake → camel 変換 + 正規化)。
- Frontend: `src/lib/gakuchika/conversation-state.ts` に `remainingQuestionsEstimate: number | null` 追加 (interface / default / parse / serialize / patch の late-wins)。`NaturalProgressStatus.tsx` でサーバ値優先、fallback は既存 `estimateRemainingQuestionsText`。
- `docs/architecture/GAKUCHIKA_SSE_CONTRACT.md` に path 表・算出式・契約テスト行を追加。`docs/features/GAKUCHIKA_DEEP_DIVE.md` の会話状態 JSON 例に反映。

**検証**:
- `pytest backend/tests/gakuchika -q` → regression なし、新規テスト 10 件 pass
- `npm run test:unit -- src/components/gakuchika src/app/api/gakuchika src/lib/gakuchika` → 新規テスト pass
- `grep "from app.normalization" backend/app/prompts/` → 0 件 (逆流 import 撲滅確認)
- `grep "generate_initial_question" backend/app/prompts/` → 0 件

**残 (次 PR)**: Phase 3.7 (useReducer 化)、L1-L9 のうち LP / テンプレ拡充、gakuchika.py のさらなる責務分離。

---

### 2026-04-18 プロンプト品質実測検証 (v3 cycle 1) 完了

**実施プラン**: `/Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-cheerful-marshmallow.md` (v3、レビュー指摘 12 件反映)
**測定ログ**: `docs/review/feature/gakuchika_prompt_measurement_20260418.md`

**Phase 0 インフラ整備 (新規ファイル群)**:
- `backend/tests/conversation/gakuchika_golden_set.py` を `TRAINING_CASES` (5) / `HOLDOUT_CASES` (3) に物理分離。HOLDOUT 3 件追加 (rich_detailed_episode / ambiguous_role_scope / learning_only_feedback)。Phase 2 中の overfit リスクを排除。
- `backend/tests/conversation/judge_sampling.py` 新規 (410 LOC)。`run_judge_pointwise_n` (N-sample mean/sd) と `run_judge_pairwise_ab_ba` (AB/BA position-debias + tie 許容) を実装。`llm_judge.py` は無変更で pure 維持。
- `backend/tests/gakuchika/test_gakuchika_facts_retention.py` 新規 (345 LOC, 11 テスト)。quote_retention (`_extract_student_expressions` 経由) と fact_retention (japanese_tokenizer 名詞 top20 + 全数詞) を deterministic 算出。
- `backend/tests/gakuchika/fixtures/baseline_prompt_token_counts_v2.json` 新規。token snapshot を **4 prompt 種** (initial 1531 / es_build 2315 / deep_dive 1731 / draft_generation 1399 tokens) に拡張、各 +200 tokens budget 適用。
- `backend/scripts/measure_gakuchika_baseline.py` / `compare_gakuchika_runs.py` 新規。Battery C (実 draft 生成 + judge) と Phase 3 比較 (pointwise Δ + pairwise) を CLI 化。

**Phase 1 ギャップ分析 (証拠 pinpoint)**:
- baseline overall mean **4.598/5 = 91.96/100** (Phase 0 までの修正で既に 72→92 相当に到達していたことが実測判明)
- 改善対象軸: naturalness 4.40 (training) / 4.22 (holdout)、quote_retention 0.24
- ai-writing-auditor: 24 draft 中「実感した」 15/24 (62%)、「再現できる」 7/24、「確信している」 3/24、P0/P1 比率 92%
- question_depth (3.73) は judge が固定 transcript の質問品質を採点するため本プラン scope 外と判定

**Phase 2 プロンプト調整 (証拠ベース、12 行修正)**:
- `gakuchika_prompts.py` PROHIBITED_EXPRESSIONS に LLM 定型結び 1 行追加 (「実感した」「再現できる」「確信している」「次に活きる」)
- `es_templates.py` gakuchika 分岐の anti_patterns に 2 件 append (「実感した結び」「再現できる結び」、既存 8 件保持)
- `es_templates.py:888 _format_gakuchika_student_expressions` 文言を「必ず 1 つ以上そのまま転写 (言い換え禁止)」に強化
- `gakuchika_prompts.py` few-shot draft 300/400/500 から「次に活きる行動原則」を削除 (self-reinforce 排除)
- token budget: 4 種すべて baseline + 200 tokens 以内 (+33 〜 +104)

**Phase 3 結果**:
- Tier 1 AI 臭 hit: **28 → 5 (-82%)** (独立指標 ai-writing-auditor で確認)
- holdout 5 軸すべて improvement 方向 (mean 4.622 → 4.733)
- training mean 4.587 → 4.640 (judge 5 段階の天井効果で Δ > 2σ 不成立)
- pairwise: after_wins 13% / before_wins 13% / **tie 73%** (天井効果)
- Battery D quote_retention: 0.240 → 0.263 (+9% relative)
- regression: `tests/gakuchika tests/interview tests/conversation tests/es_review tests/prompts` で **624 pass / 28 skip**

**最終判定**: judge スコアでの統計有意性 (Δ > 2σ) は不成立だが、独立指標で AI 臭 -82% の決定的改善を確認。holdout 全軸 improvement、害なし、regression ゼロ。1 サイクルで完了 (overfit リスク回避)。

**残課題 (本プラン scope 外、別タスク化推奨)**:
- judge 天井効果対策: pairwise reasoning の自動解析 or rubric 鋭利化
- quote_retention 0.5+ 達成: few-shot 増加または ES draft 構造見直し
- question_depth 改善: 実会話 simulation の harness 必要


---

### 2026-04-18 プロンプト品質実測検証 (v3 cycle 1) 完了

**実施プラン**: `/Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-cheerful-marshmallow.md` (v3)
**測定ログ**: `docs/review/feature/gakuchika_prompt_measurement_20260418.md`

**Phase 0 インフラ整備 (新規)**:
- `backend/tests/conversation/gakuchika_golden_set.py` を `TRAINING_CASES` (5) / `HOLDOUT_CASES` (3) に物理分離。HOLDOUT 3 件追加 (rich_detailed_episode / ambiguous_role_scope / learning_only_feedback)。Phase 2 中の overfit リスクを排除。
- `backend/tests/conversation/judge_sampling.py` 新規 (410 LOC)。`run_judge_pointwise_n` (N-sample mean/sd) と `run_judge_pairwise_ab_ba` (AB/BA position-debias + tie 許容) を実装。`llm_judge.py` は無変更で pure 維持。
- `backend/tests/gakuchika/test_gakuchika_facts_retention.py` 新規 (345 LOC, 11 テスト)。quote_retention (`_extract_student_expressions` 経由) と fact_retention (japanese_tokenizer 名詞 top20 + 全数詞) を deterministic 算出。
- `backend/tests/gakuchika/fixtures/baseline_prompt_token_counts_v2.json` 新規。token snapshot を **4 prompt 種** (initial 1531 / es_build 2315 / deep_dive 1731 / draft_generation 1399) に拡張、各 +200 tokens budget 適用。
- `backend/scripts/measure_gakuchika_baseline.py` / `compare_gakuchika_runs.py` 新規。Battery C (実 draft 生成 + judge) と Phase 3 比較 (pointwise Δ + pairwise) を CLI 化。

**Phase 1 ギャップ分析 (証拠 pinpoint)**:
- baseline overall mean **4.598/5 = 91.96/100** (元評価 72/100 から大幅改善されていることが判明)
- 改善対象軸: naturalness 4.40 (training) / 4.22 (holdout)、quote_retention 0.24
- ai-writing-auditor: 24 draft 中「実感した」 15/24 (62%)

---

### 2026-04-19 v3 Live Test 結果反映 — Phase 6 追加

**テスト結果**: v3 live test (8ケース) pass=1, degraded=3, fail=4

| ケース | ステータス | 失敗種別 | judge |
|--------|:-:|------|------|
| scope_and_role | degraded | LLM loop 3x | N/A |
| quantitative_outcome | **pass** | — | 4/4/4/3/4 |
| team_conflict | degraded | LLM loop 8+x | N/A |
| process_over_result | fail | required_question_group_miss (1/2) | pass 4/4/4/3/3 |
| retail_shift_coordination | fail | required_question_group_miss (1/2) | **fail** 2/1/2/3/2 |
| engineering_team_latency | fail | required_question_group_miss (1/2) | **fail** 3/2/3/2/4 |
| volunteer_outreach | degraded | LLM loop 11x | N/A |
| research_lab_reproducibility | fail | required_question_group_miss (1/2) | pass 4/4/4/3/4 |

**根本原因分析**:

A. **テストインフラ問題** (LLM品質とは独立):
- `conversation_runner.py` L23-29 の `GAKUCHIKA_FALLBACK_ANSWERS` が塾講師シナリオ固定
- extended 5ケース (answers=3件) が全てこのバンクにフォールバック → ドメイン汚染
- 6/8 ケースが汚染の影響を受ける

B. **LLM品質問題**:
1. 質問ループ (3 degraded): 同一質問を最大11回反復。重複検出・トピックスキップ機構なし
2. question_group カバレッジ不足 (4 fail): 全て satisfied_groups=1/2。「結果数値確認」に偏重し role/motivation/learning に遷移しない
3. ドラフト品質崩壊 (2 judge fail): フォールバック汚染下で user_fact_preservation=1-2/5

**対応**: Phase 6 (6-A: テストインフラ修正, 6-B: LLM品質改善) を追加。
**包括評価への反映**: `docs/review/ai_quality_comprehensive_20260419.md` §2-4 を 75→68 に再評価、Appendix A 追加。