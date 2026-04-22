---
topic: interview
plan_date: 2026-04-12
based_on_review: feature/interview_quality_audit_20260412.md
status: Phase 3 完了
completion_date: 2026-04-21
completion_notes: |
  Stage A (C-01 payload shadowing, SSE サニタイズ + degraded helper, ROLE_TRACK 5→10, question_stage allowlist, route contract) + Stage B (interview_prompts.py 10 ブロック, 5 テンプレ重複除去 -12.8%, 決定論 4 関数, enrich_feedback シグネチャ維持) + Stage C (deterministic test 37 新規, streaming 7 追加, route_contract TS 9 新規) 完了。
  pytest backend/tests/interview: 67 passed / 1 skipped。
  tiktoken cl100k_base: before_dedup 7,527 → after_dedup 6,563 (-12.8%) → with_block 14,376 (+91% vs before, 厚労省 14 事項 grounding block 主因で品質投資として許容)。
  `_fallback_turn_meta` callsite 実測 2 箇所 (L2234/L2235) 全て setup=setup 更新済。
phase2_completion_date: 2026-04-17
phase2_completion_notes: |
  Stage 0-10 全完了。Phase 1 (73/100) → Phase 2 推定 91/100 Grade A 到達。
  - Stage 0 評価ハーネス (24 ケース + 4 層評価): pytest/CI で deterministic + forbidden 毎回実行
  - Stage 1 hot path トークン最適化: 14,376 → 9,162 (-36.4%)
  - Stage 2 façade 化: interview.py 2694 → 134 行、_interview/ 6 モジュール分割
  - Stage 3 CASE_BRIEF_SCHEMA: 7 業界プリセット + 構造化 brief で case 面接の再現性確立
  - Stage 4 FOLLOWUP_STYLE_POLICY: 33 組合せ + 9 answer_gap deterministic 判定
  - Stage 5 Evidence-Linked Rubric: BARS anchor + evidence 3 + confidence の 7 軸完備
  - Stage 6 Per-turn short coaching: good / missing / next_edit
  - Stage 7 弱点ドリル (/drill): interview_drill_attempts テーブル + delta re-score
  - Stage 8 成長ダッシュボード + 企業別 prep pack: 7 軸推移 + 企業別ヒートマップ
  - Stage 9 BFF/UI refactor: Promise.allSettled + pure reducer
  - Stage 10 hygiene: 二重サニタイズ統合 / dead code sweep / magic number 定数化
  pytest backend/tests/interview: 308 passed / 26 skipped。Vitest 59+ passed。
  migration 0022 (interview_drill_attempts) 適用済。24 hot path budget 全 green。
phase3_completion_date: 2026-04-21
phase3_completion_notes: |
  Phase 3 品質改善完了。Phase 2 実スコア ~76/100 → Phase 3 推定 90+/100 Grade A。
  Phase A (Prompt/AI品質):
  - A-1: GROUNDING_CORE に seed/RAG 活用指示追加
  - A-2: fallback turn payload が strictness/interviewer_type/role_track を参照 (pure helper 切り出し)
  - A-3: fallback opening が case_brief を参照
  - A-4: SCORING_RUBRIC に 7 軸別 3 点 anchor 追加
  - A-5: short coaching に company_name パーソナライズ
  - A-6: mixed_panel に 3 ターン視点回転指示 (prompt 文面のみ、contract 変更なし)
  Phase B (UX):
  - B-1: リセット確認 AlertDialog (2 箇所)
  - B-2: 満足度アンカーラベル 不満/満足
  - B-3: 開始ボタン無効時ヘルパーテキスト
  - B-4: JST タイムゾーン修正 (timeZone: "Asia/Tokyo")
  - B-5: DrillPanel Collapsible 接続 (既存 weakest_answer_snapshot 使用)
  - B-6: スコア表示 /5 + カラーインジケータ (emerald/amber)
  - B-7: エラー再試行ボタン + lastFailedAction state
  Phase C (テスト): continue/reset route test, 402 credit test, fallback 差分���スト
  PROMPT_VERSION: "2026-04-21-phase3-quality"
  pytest backend/tests/interview: 316 passed / 27 skipped。tsc --noEmit: interview 関連エラーなし。
---

# 面接対策機能 改善計画書 v3

**作成日:** 2026-04-12
**根拠:** `docs/review/feature/interview_quality_audit_20260412.md` (50/100, Grade C)
**スコープ:** プロンプト品質の最優先改善（決定論ロジック含む）+ 致命的バグ修正

---

## Context

品質監査で面接機能は 50/100 (Grade C)。最大のボトルネックは「144通りの設定がプロンプト上の行動変化に繋がっていない」点。

改善対象は 2 層ある:
1. **LLM プロンプト層** — strictness/interviewer/stage の行動指示が皆無（ラベル挿入のみ）
2. **決定論ロジック層** — `_checklist_for_topic()`, `_fallback_plan()`, `_fallback_turn_meta()`, `_build_fallback_opening_payload()` が strictness/interviewer をほぼ無視

両層を合わせて改善しないと、LLM 成功時の品質は上がっても fallback 経路の品質差は改善されない。

### 現行テストのベースライン

`backend/tests/interview/test_interview_prompt_shapes.py` は **6/7 失敗**。失敗は全て「実装にまだ存在しない機能をアサートしている」aspirational テスト:
- テスト1-3: `'標準モード'`, `'厳しめモード'` 等の行動指示ブロックを期待（未実装）
- テスト4: case fallback の質問文が微妙に不一致（`'まず何から切り分けて考えますか'` vs 実際 `'まず何をどう切り分けて考えますか'`）+ `intent_key` フィールドが未存在
- テスト5: `'描画性能'` を期待（role_track `frontend_engineer` → `biz_general` フォールバックにより技術的コンテキストが消失）
- テスト6: `_enrich_feedback_defaults(company_name=...)` — 実装にない kwarg を渡して TypeError

**計画の前提**: まず赤いテストを整理し、本改善で green にする。

### Web調査から得た設計指針

- 深掘り5型: Why(動機), What(事実), How(手法), Context(状況), Result(成果)
- STAR+L メソッド(Learning追加) — 行動面接のベストプラクティス
- 3ギア適応難易度: 探索(supportive) / ガイド(standard) / チャレンジ(strict)
- 面接段階別焦点: 一次=基本確認、二次=深掘り本番、最終=覚悟・ビジョン
- 圧迫面接は減少傾向 → strict は「最悪ケース練習」としてフレーミング
- 学生の典型弱点: 抽象的回答、質問に答えていない、暗記感、ES との不整合
- 公正採用選考: 差別的質問を避ける安全ルール（厚労省ガイダンス準拠）

※ 経団連「コミュニケーション能力 83%・16年連続1位」は 2011年調査(80.2%)で確認可能だが、最新年度の正確な数字は要再検証。計画書内では概数として扱い、プロンプト本文には埋め込まない。

---

## Phase 0: ベースライン整備

### 0-1. SSE エラーメッセージのサニタイズ [C-06/S-01]

**ファイル:** `backend/app/routers/interview.py`
**4箇所:** L1811, L1902, L1984, L2058

現行:
```python
yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})
```

修正:
```python
yield _sse_event("error", {"message": "予期しないエラーが発生しました。しばらくしてからもう一度お試しください。"})
```

`logger.exception(...)` は各箇所の直前で維持済み。

**テスト:** start/turn/continue/feedback の各ジェネレータに対し、LLM 呼び出しを例外に差し替え、SSE error イベントに `str(exc)` 相当の文字列が **含まれない** ことを直接検証するテストを `test_interview_streaming.py` に追加。

### 0-2. 赤いテストのベースライン整理

**ファイル:** `backend/tests/interview/test_interview_prompt_shapes.py`

6/7 テストが失敗中。これらは本改善の完了後に green になるべきテスト。整理方針:

| テスト | 現在の失敗理由 | 対応 |
|--------|--------------|------|
| test 1-3 (行動指示アサーション) | `'標準モード'` 等が未実装 | Phase 1-2 完了後に green にする。ただし文言アサーション(`'標準モード'` 等)は脆い → 構造差分テストに書き換える（Phase 2-1 で詳述） |
| test 4 (case fallback) | 文言微妙不一致 + `intent_key` 未存在 | Phase 1-3 の fallback 改修で解決。`intent_key` は既存規約 `topic:followup_style` に合わせる（`case_scenario:*` は不採用）。テスト側の期待も同規約に修正 |
| test 5 (technical focus) | `frontend_engineer` → `biz_general` フォールバック | Phase 0-3 の ROLE_TRACK 修正で解決。`'描画性能'` は文言依存 → `frontend_engineer` がプロンプトに反映されることを構造的に検証する形に書き換え |
| test 6 (feedback defaults) | `company_name` kwarg が実装に不存在 | テスト側を修正: `company_name=` kwarg を削除し `setup=` のみ使用。`_build_setup()` に `company_name` を含めることで setup 経由で一本化 |

**方針:**
- テストを「未実装」理由で削除しない。各 Phase の完了時に green を確認する
- **テストの主判定は文言ではなく構造差分** — `must_cover_topics`, `requiredChecklist`, `turn_meta` フィールド, `depth_focus`, `intent_key` 等の構造を検証する。文言アサーション（`'標準モード'` 等）は補助的なスモークテストとして最小限に留める

### 0-3. ROLE_TRACK 不整合修正 [C-02]

**ファイル:**
- `backend/app/routers/interview.py` L23-28, L65-71

**問題の正確な所在:**
- Frontend (`src/lib/interview/session.ts` L128) は10種を分類して backend に `role_track` を渡している
- Backend `ROLE_TRACKS` set (L23) が5種しかないため、未知の `role_track` は `_build_setup()` 内で `biz_general` にフォールバック
- Backend `ROLE_TRACK_KEYWORDS` (L65) も5種分のみ → `role_track` 未指定時の推論語彙が弱い

**対応:**
1. `ROLE_TRACKS` に5種追加: `frontend_engineer`, `backend_engineer`, `data_ai`, `infra_platform`, `product_manager`
2. `ROLE_TRACK_KEYWORDS` に追加（英語略称も含む）:
   - `frontend_engineer`: ["フロントエンド", "UI", "UX", "Web開発", "frontend", "React"]
   - `backend_engineer`: ["バックエンド", "サーバーサイド", "API", "backend"]
   - `data_ai`: ["データサイエンス", "AI", "機械学習", "データ分析", "ML", "data"]
   - `infra_platform`: ["インフラ", "SRE", "クラウド", "DevOps", "platform"]
   - `product_manager`: ["プロダクトマネージャー", "PdM", "PM", "サービス企画"]
3. テスト: 全10トラックの推論テスト + 英語略称("frontend", "ML", "SRE" 等)の推論テスト

### 0-4. topic → question_stage 推論の語彙拡張

**ファイル:** `backend/app/routers/interview.py`
- `_infer_stage_from_topic()` (L778)
- `_question_stage_from_turn_meta()` (L1330)

**問題:** 新 role_track 対応で `_fallback_plan()` / `_checklist_for_topic()` に追加するトピック (`system_design`, `design_decision`, `analytical_approach`, `data_handling`, `reliability`, `user_understanding`, `prioritization`, `structured_thinking` 等) が、stage 推論関数のどのキーワードにもマッチせず全て `"opening"` にフォールスルーする。これにより `stageQuestionCounts["opening"]` が膨張し、`completedStages` の計算が壊れる。

**現行ロジック (L782-793):**
```python
if any(key in normalized for key in ["company", "industry", "compare", "fit"]):
    return "company_understanding"
if any(key in normalized for key in ["role", "skill", "technical"]):
    return "role_reason"
if any(key in normalized for key in ["experience", "gakuchika", "project"]):
    return "experience"
if any(key in normalized for key in ["motivation", "career", "future", "why"]):
    return "motivation_fit"
```

**改修:** 新トピックのキーワードを追加:

| 新トピック | マッチすべき stage | 追加するキーワード |
|-----------|-------------------|-----------------|
| `system_design`, `design_decision` | `role_reason` | `"design"`, `"system"` を `["role", "skill", "technical"]` に追加 |
| `analytical_approach`, `data_handling` | `role_reason` | `"analytical"`, `"data"` を追加 |
| `reliability` | `role_reason` | `"reliability"` を追加 |
| `user_understanding`, `prioritization` | `role_reason` | `"user_understanding"`, `"prioritization"` を追加 |
| `structured_thinking` | `experience` | `"structured"`, `"thinking"` を追加 |
| `life_narrative_core`, `turning_point_values` | `experience` | `"narrative"`, `"turning"`, `"values"` を追加 |
| `personality` | `opening` | 現行のまま（人物把握は opening に分類） |

**同じ修正を `_question_stage_from_turn_meta()` (L1330-1342) にも適用。** 両関数のキーワードリストは共通化し、dict 定数 `_TOPIC_STAGE_KEYWORDS` として一箇所で管理する。

**テスト:** 全新トピックで `_infer_stage_from_topic()` と `_question_stage_from_turn_meta()` が `"opening"` 以外の正しい stage を返すことを検証。

---

## Phase 1: プロンプト品質改善 + 決定論ロジック改修

### 1-1. `backend/app/prompts/interview_prompts.py` 新規作成

**参考パターン:** `backend/app/prompts/motivation_prompts.py` のルールブロック構造

以下の定数ブロックを定義する:

#### (A) グラウンディング・安全ルール `INTERVIEW_GROUNDING_RULES`

現在ゼロ → 7項目追加:
1. 質問は会話履歴・応募者材料・企業情報に明示された内容のみを根拠にする
2. 応募者がまだ言っていない経験・スキル・志望理由を前提としない
3. 企業情報(seed/RAG)の固有名詞を使う場合、断定せず質問形式にする
4. 応募者の回答と矛盾する前提の質問を生成しない
5. 存在しない社内制度・事業・商品名を創作しない
6. 差別的質問(出身地、家族構成、思想信条)は使わない（厚労省公正採用選考準拠）
7. 応募者の材料が不足している場合、より広い質問で引き出す

#### (B) 厳しさモード行動指示 `STRICTNESS_INSTRUCTIONS`

3ギア適応難易度モデルを反映:

- **`supportive`（やさしめ — 探索モード）:** 深掘り最大2回、肯定から入る、成功体験を積ませる、フィードバックは良い点先行
- **`standard`（標準 — ガイドモード）:** 深掘り最大3回、質問で気づかせる、具体例・数字を求める、深掘り5型バランス使用
- **`strict`（厳しめ — チャレンジモード）:** 深掘り最大4回、矛盾・論理飛躍を直接指摘、圧迫寄り質問使用、ただし人格否定・差別的質問は絶対禁止。「最悪ケースの練習」としてフレーミング

#### (C) 面接官ペルソナ行動指示 `INTERVIEWER_PERSONA_INSTRUCTIONS`

- **`hr`:** 志望動機の本気度・人物面・カルチャーフィット重視。「周囲との関わり」を好む
- **`line_manager`:** 実務能力・即戦力性重視。「具体的にどうやったか」「技術的にどう判断したか」を深掘り。再現性を見る
- **`executive`:** 覚悟・長期ビジョン重視。「なぜうちか」「10年後どうなりたいか」。抽象的問いで思考の深さを見る
- **`mixed_panel`:** 人事→現場→役員の複合視点。回答の一貫性を特に重視

#### (D) 面接段階行動指示 `INTERVIEW_STAGE_INSTRUCTIONS`

- **`early`:** 基本確認。深い企業理解は求めず関心の方向性を見る
- **`mid`:** 深掘り本番。STAR+L で構造的に深掘り。ES との一貫性確認
- **`final`:** 覚悟確認。他社比較・キャリアビジョン・経営視点のフィット感

#### (E) 深掘りテクニック体系 `DEEPENING_TECHNIQUE_INSTRUCTIONS`

- 深掘り5型: Why / What / How / Context / Result
- STAR+L チェーン（行動面接用）: Situation(30秒) → Task(15秒) → Action(60秒,個人行動) → Result(30秒,数字) → Learning(15秒,志望企業への接続)
- 前提揺さぶり: 「もしそのメンバーがいなかったら」
- 仮説検証: 「その方法以外に検討した選択肢は」
- 一貫性チェック: 「ESではこう書いていますが」

#### (F) 方式別質問生成ルール `INTERVIEW_FORMAT_INSTRUCTIONS`

4方式それぞれの質問設計原則:
- `standard_behavioral`: STAR+L 互換、学生の典型弱点を引き出す
- `case`: 企業情報から題材選定、思考プロセスの透明性重視
- `technical`: roleTrack に応じた技術領域、設計判断の背景・トレードオフ
- `life_history`: 転機・価値観の時系列確認、自己理解の深さ

#### (G) スコアリングルブリック `SCORING_RUBRIC`

7軸(0-5)の明確な基準:
- 0: 言及なし / 評価不能
- 1: 主張不明確、根拠ゼロ
- 2: 根拠薄い、他社でも通用する汎用的内容
- 3: 主張と根拠の対応はあるが具体性が一段不足
- 4: 主張・根拠・具体例が揃い説得力あり
- 5: 独自の視点・深い自己理解。面接官が唸るレベル

厳しさ別採点基準:
- `supportive`: 良い点を強調、改善提案は建設的に
- `standard`: 基準通り
- `strict`: 「4以上でなければ本番では弱い」のトーン、改善点を率直に

#### (H) 反復防止ルール `REPETITION_PREVENTION_RULES`

#### (I) 質問設計ルール `QUESTION_DESIGN_RULES`

1ターン1質問1論点、1-2分で答えやすい、「もう少し詳しく」禁止

#### (J) ヘルパー関数 `build_behavioral_block(setup: dict) -> str`

setup の strictness_mode / interviewer_type / interview_stage / interview_format に応じて、上記ブロックを組み立てて返す。

### 1-2a. 既存プロンプトの変数重複除去（行動指示追加の前に実施）

**ファイル:** `backend/app/routers/interview.py`

行動指示を追加する **前** に、既存テンプレートの重複を先に削る。順序が逆だと net 増減が見積もれない。

**重複対象の特定:**

| 重複 | 箇所 | 除去方法 |
|------|------|---------|
| `role_track`, `interview_format`, 他5フィールドの2重挿入 | `_PLAN_FALLBACK` L76-88: 日本語ラベル行 + raw key=value 行 | raw key=value 行を削除。日本語ラベル行に統一 |
| `academic_summary` 3重挿入 | 各テンプレート: セットアップブロック + 専用セクション + `materials_section` | `_build_context_section(setup, payload)` ヘルパーを作成し1回だけ生成 |
| `interview_plan` 2重挿入 | Opening, Turn テンプレート: 専用セクション + インライン記法 | 専用セクションに統一 |
| `_build_opening_prompt()` 末尾の追加 append | L1416: `academic_summary` と `opening_topic` を整形後にさらに追記 | `_build_context_section` に統合し append を削除 |

**トークン計測方法:**
1. 重複除去 **前** に `_build_plan_prompt()` 等の5つの builder で出力トークン数を計測（tiktoken cl100k_base）
2. 重複除去 **後**、行動指示追加 **前** に再計測 → 純粋な削減量を記録
3. 行動指示追加 **後** に再計測 → net 増減を報告

### 1-2b. 全5プロンプトテンプレートへの行動指示組込み

**ファイル:** `backend/app/routers/interview.py`

各テンプレートの `_build_*_prompt()` 関数で `build_behavioral_block(setup)` を呼び出し、プロンプト本文に挿入:

| テンプレート | 挿入するブロック |
|------------|--------------|
| `_PLAN_FALLBACK` | グラウンディング + 方式別 + 段階別 |
| `_OPENING_FALLBACK` | 全ブロック |
| `_TURN_FALLBACK` | 全ブロック + 深掘りテクニック |
| `_CONTINUE_FALLBACK` | 全ブロック |
| `_FEEDBACK_FALLBACK` | グラウンディング + ルブリック + 厳しさ別採点基準 |

### 1-3. 決定論ロジックへの strictness/interviewer/stage 反映

**これが最も重要な追加点。** LLM プロンプトに行動指示を足すだけでは、fallback 経路の品質差が改善されない。

#### `_checklist_for_topic()` (L842) の改修

現状: `interview_format` と `interview_stage=final` のみ参照
改修:

```python
def _checklist_for_topic(topic: str, setup: dict[str, Any]) -> list[str]:
    # ... 既存の format ベースのチェックリスト選択 ...

    # interview_stage による調整
    if setup.get("interview_stage") == "final":
        # 既存の company_compare/decision_axis/commitment 追加
        ...
    elif setup.get("interview_stage") == "early":
        # early では checklist を軽くする（基本確認のみ）
        checklist = checklist[:2]  # 最低限の項目に絞る

    # strictness_mode による調整
    strictness = setup.get("strictness_mode", "standard")
    if strictness == "strict":
        # strict では追加チェック項目
        if "consistency_check" not in checklist:
            checklist.append("consistency_check")
    elif strictness == "supportive":
        # supportive では checklist を緩くする
        checklist = checklist[:2]

    # interviewer_type による調整
    interviewer = setup.get("interviewer_type", "hr")
    if interviewer == "executive" and "career_vision" not in checklist:
        checklist.append("career_vision")
    elif interviewer == "line_manager" and "practical_skill" not in checklist:
        checklist.append("practical_skill")

    return checklist
```

#### `_fallback_plan()` (L1580) の改修

現状: `interview_format`, `interview_stage`, `selection_type`, `role_track`(2種のみ) を参照。`strictness_mode`, `interviewer_type` 無視。新5種の `role_track` も未対応。

改修:
- 新5種 role_track に対応する `must_cover` 項目追加:
  - `frontend_engineer` / `backend_engineer`: `technical_depth`, `design_decision`
  - `data_ai`: `analytical_approach`, `data_handling`
  - `infra_platform`: `system_design`, `reliability`
  - `product_manager`: `user_understanding`, `prioritization`
- `strictness_mode` で `risk_topics` の粒度を調整:
  - `strict`: `risk_topics` にプレッシャー質問候補を追加
  - `supportive`: `risk_topics` を最小限に
- `interviewer_type` で `priority_topics` の重みを調整:
  - `executive`: `career_alignment`, `company_compare_check` を優先
  - `line_manager`: `work_understanding`, `technical_depth` を優先
  - `hr`: `motivation_fit`, `personality` を優先

#### `_fallback_turn_meta()` (L1628) の改修

現状: `turn_state` と `interview_plan` のみ参照。setup を受け取っていない。

改修: 引数に `setup` を追加し:
- `strictness_mode` で `turn_action` のバイアスを調整:
  - `strict`: `deepen` を優先（既に covered でも深掘り可）
  - `supportive`: `shift` を優先（早めに次の論点へ）
- `interviewer_type` で `depth_focus` を調整:
  - `executive`: `company_fit` / `credibility` を優先
  - `line_manager`: `specificity` / `logic` を優先
- `followup_style` をペルソナに合わせて変化

**呼び出し元の修正:** `_fallback_turn_meta()` の全呼び出し箇所に `setup` を渡す。

#### `_build_fallback_opening_payload()` (L1055) の改修

現状: `interview_format` のみ参照。case の質問は企業無関係の固定シナリオ。

改修:
- case fallback: `seed_summary` が存在すれば企業関連のケース設定に。不在なら `selected_industry` ベースの業界ケースに。それもなければ汎用ケース（現行文言を調整）
- 全方式: `strictness_mode` で質問のトーンを変化（`strict` ではより直接的、`supportive` ではより答えやすい）
- 全方式: `turn_meta` に `intent_key` フィールドを追加。**既存の `topic:followup_style` 規約に従う**（例: `structured_thinking:theme_choice_check`）。テスト4が期待する `case_scenario:*` は新規規約であり不採用。テスト側を `structured_thinking:theme_choice_check` 系に修正する

**注意:** FastAPI が受けている `seed_summary` は文字列のみ（`_format_materials_section()` L756 で `"## seed\n{payload.seed_summary}"` として処理）。構造化メタデータではないため、企業別ケース題材の安定生成は文字列パースに依存する。安定性が不十分な場合は汎用フォールバックを使う。

### 1-4. `_enrich_feedback_defaults()` のデータフロー修正

**ファイル:** `backend/app/routers/interview.py` L1178, L729-753

**問題:**
- `_enrich_feedback_defaults()` のシグネチャは `(feedback, *, setup)` — `company_name` kwarg は存在しない
- テスト6 は `company_name="任天堂"` を直接渡して TypeError
- 現行の `_build_setup()` (L729) は `company_name` / `company_summary` を setup dict に含めていない

**改修（3点セット — 全て一緒に実施）:**

1. **`_build_setup()` (L729) に追加:**
   ```python
   return {
       ...既存フィールド...,
       "company_name": (payload.company_name or "").strip() or "企業",
       "company_summary": (payload.company_summary or "").strip() or "",
   }
   ```

2. **`_enrich_feedback_defaults()` (L1178) の実装修正:**
   - シグネチャはそのまま `(feedback, *, setup)` を維持（kwarg は増やさない）
   - `setup["company_name"]` と `setup["selected_role"]` を使って `improved_answer` をパーソナライズ:
   ```python
   company_name = setup.get("company_name", "企業")
   selected_role = setup.get("selected_role", "")
   if weakest_question and weakest_answer:
       feedback["improved_answer"] = (
           f"{weakest_question} への回答は、まず「{company_name}の{selected_role}として」"
           "という結論を示し、根拠となる経験、入社後に出したい価値を一文ずつつなぐ。"
       )
   ```

3. **テスト6 (`test_feedback_defaults_personalize_improved_answer`) の修正:**
   ```python
   # Before (TypeError):
   feedback = _enrich_feedback_defaults({...}, setup=_build_setup(payload), company_name=payload.company_name)
   # After:
   feedback = _enrich_feedback_defaults({...}, setup=_build_setup(payload))
   # setup 経由で company_name が渡るため kwarg は不要
   assert "任天堂" in feedback["improved_answer"]
   assert "企画" in feedback["improved_answer"]
   ```

### 1-5. 企業シード情報の活用指示強化 [P-07]

`_format_materials_section()` (L756) で `"## seed\n{payload.seed_summary}"` として末尾に配置されている。

改修:
- プロンプトテンプレート内で seed セクションの活用指示を明示:「以下のシード情報に含まれる企業固有の論点・業界論点を、質問設計の根拠として積極的に活用すること」
- 末尾の「補足」から `## 企業固有の論点` として昇格

---

## Phase 2: 検証・品質担保

### 2-1. テスト修正・拡充

**ファイル:** `backend/tests/interview/test_interview_prompt_shapes.py`

#### 既存テストの修正

| テスト | 修正内容 |
|--------|---------|
| test 4 | 文言期待を実装に合わせる + `intent_key` の期待を `topic:followup_style` 規約に合わせる |
| test 5 | `frontend_engineer` が正しく通るようになった後、技術的コンテキストのアサーションを構造的に検証する形に書き換え |
| test 6 | `company_name` kwarg を削除し、setup 経由で渡す形に修正 |

#### 新規テスト

**テスト方針: 構造差分を主軸、文言は補助のみ**

`'標準モード'`, `'厳しめモード'`, `'描画性能'` のような文言アサーションは言い換えで簡単に壊れ、行動差分の保証にならない。テストの主判定は `must_cover_topics`, `requiredChecklist`, `turn_meta` フィールド, `depth_focus`, `intent_key` 等の構造差分とする。

**a. SSE エラーサニタイズテスト** (`test_interview_streaming.py` に追加):
- start/turn/continue/feedback の各ジェネレータの `except` パスに入るよう LLM 呼び出しを例外に差し替え
- SSE error イベントに Python 例外文字列（`str(exc)` 相当）が **含まれない** ことを直接検証
- 汎用メッセージのみ返ることを確認

**b. 構造差分テスト** (`test_interview_deterministic.py` 新規):

同一入力で setup パラメータのみ変えた場合の **構造的な出力差** を検証する:

```python
def test_checklist_strict_has_more_items_than_supportive():
    """strict は supportive より checklist 項目が多い"""
    checklist_strict = _checklist_for_topic("motivation_fit", {**base, "strictness_mode": "strict"})
    checklist_supportive = _checklist_for_topic("motivation_fit", {**base, "strictness_mode": "supportive"})
    assert len(checklist_strict) > len(checklist_supportive)

def test_fallback_plan_executive_includes_career_alignment():
    """executive は career_alignment を must_cover に含むが hr は含まない"""
    plan_exec = _fallback_plan(payload, {**base, "interviewer_type": "executive"})
    plan_hr = _fallback_plan(payload, {**base, "interviewer_type": "hr"})
    assert "career_alignment" in plan_exec["must_cover_topics"]
    assert "career_alignment" not in plan_hr["must_cover_topics"]

def test_fallback_turn_meta_strict_prefers_deepen():
    """strict は covered topic で deepen を返し、supportive は shift を返す"""
    turn_state = {"coveredTopics": ["motivation_fit"], "remainingTopics": ["role_understanding"]}
    meta_strict = _fallback_turn_meta(turn_state, plan, {**base, "strictness_mode": "strict"})
    meta_supportive = _fallback_turn_meta(turn_state, plan, {**base, "strictness_mode": "supportive"})
    assert meta_strict["turn_action"] == "deepen"
    assert meta_supportive["turn_action"] == "shift"

def test_fallback_plan_covers_all_10_role_tracks():
    """全10 role_track で有効な must_cover を返し、新 track は技術系論点を含む"""
    for rt in ROLE_TRACKS:
        plan = _fallback_plan(payload, {**base, "role_track": rt})
        assert len(plan["must_cover_topics"]) >= 3
    # 技術系 track は技術論点を含む
    plan_fe = _fallback_plan(payload, {**base, "role_track": "frontend_engineer"})
    assert any("technical" in t or "design" in t for t in plan_fe["must_cover_topics"])

def test_fallback_opening_intent_key_follows_topic_followup_convention():
    """fallback opening の intent_key は topic:followup_style 規約に従う"""
    opening = _build_fallback_opening_payload(payload, plan, setup)
    intent_key = opening["turn_meta"].get("intent_key", "")
    assert ":" in intent_key  # topic:followup_style 形式
    topic, style = intent_key.split(":", 1)
    assert topic  # 空でない
    assert style  # 空でない
```

**c. topic → stage 推論テスト** (`test_interview_deterministic.py` に追加):
```python
@pytest.mark.parametrize("topic,expected_stage", [
    ("system_design", "role_reason"),
    ("design_decision", "role_reason"),
    ("analytical_approach", "role_reason"),
    ("data_handling", "role_reason"),
    ("reliability", "role_reason"),
    ("structured_thinking", "experience"),
    ("life_narrative_core", "experience"),
    ("turning_point_values", "experience"),
    ("motivation_fit", "motivation_fit"),
    ("company_compare_check", "company_understanding"),
])
def test_infer_stage_from_new_topics(topic, expected_stage):
    assert _infer_stage_from_topic(topic) == expected_stage
    assert _question_stage_from_turn_meta({"topic": topic}) == expected_stage
```

**d. グラウンディングルール存在テスト** (構造的に検証):
```python
@pytest.mark.parametrize("builder", [_build_plan_prompt, _build_opening_prompt, _build_turn_prompt, _build_feedback_prompt])
def test_grounding_rules_present(builder):
    """全 prompt builder がグラウンディングルールブロックを含む"""
    prompt = builder(...)
    # INTERVIEW_GROUNDING_RULES の定数文字列がそのまま含まれることを検証
    from app.prompts.interview_prompts import INTERVIEW_GROUNDING_RULES
    assert INTERVIEW_GROUNDING_RULES in prompt
```

**e. 行動指示挿入スモークテスト** (`test_interview_prompt_shapes.py` のテスト1-3 を書き換え):

文言ではなく、`build_behavioral_block()` の戻り値がプロンプトに含まれることを検証:
```python
def test_behavioral_block_included_in_plan_prompt():
    from app.prompts.interview_prompts import build_behavioral_block
    setup = _build_setup(payload)
    expected_block = build_behavioral_block(setup)
    prompt = _build_plan_prompt(payload)
    # ブロック全体がプロンプトに含まれる
    assert expected_block in prompt
```

### 2-2. 手動QA（12ケース比較）

監査レポートの再現条件を使い、改善前後を比較:
- **厳しさ差分:** 同一企業で supportive vs strict → 質問のトーン・深掘り回数・フィードバックの率直さに差があること
- **ペルソナ差分:** 同一設定で hr vs executive → 質問の視点（人物面 vs ビジョン）に差があること
- **段階差分:** early vs final → checklist の深さ・論点の焦点に差があること

---

## 対象ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `backend/app/prompts/interview_prompts.py` | **新規作成**: 全ルールブロック + `build_behavioral_block()` ヘルパー |
| `backend/app/routers/interview.py` | SSEエラーサニタイズ(4箇所) / ROLE_TRACK拡張 / `_infer_stage_from_topic` + `_question_stage_from_turn_meta` 語彙拡張 / 5テンプレートへの行動指示組込み / 変数重複除去 / `_checklist_for_topic` 改修 / `_fallback_plan` 改修 / `_fallback_turn_meta` 改修(引数追加+全呼び出し元修正) / `_build_fallback_opening_payload` 改修(intent_key は `topic:followup_style` 規約) / `_enrich_feedback_defaults` パーソナライズ / `_build_setup` に `company_name` + `company_summary` 追加 |
| `backend/tests/interview/test_interview_prompt_shapes.py` | テスト1-3 を構造差分テストに書き換え / テスト4,5,6 の期待値修正 / グラウンディングテスト追加 |
| `backend/tests/interview/test_interview_deterministic.py` | **新規作成**: 決定論ロジック差分テスト + topic→stage 推論テスト |
| `backend/tests/interview/test_interview_streaming.py` | SSEエラーサニタイズテスト追加 |

## 実行手順

1. Phase 0-1: SSEエラーサニタイズ(4箇所) → SSE テスト追加 → green 確認
2. Phase 0-3: ROLE_TRACK 拡張(ROLE_TRACKS + ROLE_TRACK_KEYWORDS) → 推論テスト追加 → green 確認
3. Phase 0-4: topic→stage 推論の語彙拡張(`_infer_stage_from_topic` + `_question_stage_from_turn_meta`) → stage 推論テスト追加 → green 確認
4. Phase 1-1: `interview_prompts.py` 作成（全ルールブロック + `build_behavioral_block()`）
5. Phase 1-2a: 既存テンプレートの変数重複除去 → トークン計測（before/after）
6. Phase 1-2b: テンプレートへの行動指示組込み → トークン計測（net 増減）→ テスト1-3 書き換え → green 確認
7. Phase 1-3: 決定論ロジック改修(`_checklist_for_topic` + `_fallback_plan` + `_fallback_turn_meta` + `_build_fallback_opening_payload`) → `test_interview_deterministic.py` green 確認
8. Phase 1-4: `_build_setup()` に company_name 追加 + `_enrich_feedback_defaults` パーソナライズ → テスト6 修正 → green 確認
9. Phase 1-5: seed 活用指示強化
10. Phase 2-1: テスト4,5 の期待値調整 → 全テスト green 確認
11. Phase 2-2: 手動QA 12ケース

## 検証方法

```bash
# ユニットテスト全体
cd backend && python -m pytest tests/interview/ -v

# 決定論差分テスト
cd backend && python -m pytest tests/interview/test_interview_deterministic.py -v

# トークン計測（実装後に追加するスクリプト）
cd backend && python -c "from app.routers.interview import _build_plan_prompt; ..."
```

## 委譲先サブエージェント

CLAUDE.md のルーティングテーブルに従い:
- `backend/app/prompts/interview_prompts.py` 新規作成: `prompt-engineer`
- `backend/app/routers/interview.py` の決定論ロジック改修: `fastapi-developer`
- `backend/tests/interview/` のテスト作成: `test-automator`

## スコープ外（後続フェーズ）

| 項目 | 概要 |
|------|------|
| C-01 payload シャドウイング | 現行コードで解消済み（全箇所 `event_payload`） |
| アーキテクチャ分割 [C-03] | `interview.py` 2172行を4モジュールに分割 |
| フロントエンド分割 [C-04] | `InterviewPageContent.tsx` コンポーネント抽出 |
| UX改善 [U-01〜U-03] | リセット確認・満足度ラベル・開始ボタン説明 |
| テスト拡充 [T-02〜T-06] | continue/reset ルート・controller テスト |
| E2E 設定マトリクス [T-03] | 4方式の E2E カバレッジ |
| 音声対応 | 音声入力 + TTS読み上げ |
| 上流からの構造化 seed メタデータ | FastAPI が受ける seed_summary を構造化する設計変更 |
