# ガクチカ作成 (Gakuchika Deep Dive)

## 1. 概要

会話ベースでガクチカ素材を揃え、ES 下書き生成と面接向け深掘りまで行う機能。短い初期入力から STAR フレームワーク (Situation / Task / Action / Result) に沿って材料を収集し、ES 本文を自動生成した後、同一セッションで面接対策レベルまで深掘りする。

- **対応モデル**: 会話生成は `MODEL_GAKUCHIKA=gpt-mini`、ES 下書き生成は `MODEL_GAKUCHIKA_DRAFT=claude-sonnet`
- **プロトコル**: SSE (Server-Sent Events) によるリアルタイム質問ストリーミング
- **認証**: ログインユーザー専用（ゲストは会話・ES 生成ともに利用不可）
- **課金**: 会話は 1 問あたり 1 クレジット（成功時のみ消費）、ES 下書き生成は 6 クレジット（Reserve -> Confirm/Cancel）

---

## 2. アーキテクチャ

### 2.1 3 層構成図

```
+-------------------------------------------------------------+
|  Frontend (React)                                           |
|  GakuchikaConversationContent -> ConversationProgressBar    |
|  useConversationRuntime -> adapter -> playback -> streaming  |
+-----------------------------+-------------------------------+
                              | POST /api/gakuchika/{id}/conversation/stream
                              | POST /api/gakuchika/{id}/generate-es-draft
                              | POST /api/gakuchika/{id}/interview-summary
+-----------------------------v-------------------------------+
|  BFF (Next.js API Route)                                    |
|  認証検証 -> クレジット処理 -> FastAPI proxy -> SSE 中継      |
|  stream/route.ts + generate-es-draft/route.ts               |
+-----------------------------+-------------------------------+
                              | POST /api/gakuchika/next-question/stream
                              | POST /api/gakuchika/generate-es-draft
                              | POST /api/gakuchika/structured-summary
+-----------------------------v-------------------------------+
|  Backend (FastAPI)                                          |
|  入力防御 -> 質問生成パイプライン -> 正規化 -> SSE 生成       |
|  routers/gakuchika.py -> services/gakuchika/ ->             |
|  normalization/ -> prompts/                                 |
+-------------------------------------------------------------+
```

### 2.2 normalization/ と services/gakuchika/ の責務分離

バックエンドは 4 層に分離されている。

| 層 | 責務 | 特徴 |
|---|---|---|
| `normalization/` | LLM 出力の正規化、readiness gate、coach message 生成 | Pure function のみ。LLM 呼び出しなし |
| `services/gakuchika/` | 質問パイプライン、リトライ戦略、プロンプト組立 | async。LLM 呼び出しを含む |
| `routers/` | HTTP ハンドラ、入力サニタイズ、draft 品質 retry | FastAPI エンドポイント |
| `prompts/` | プロンプトテンプレート、few-shot 例 | テンプレート文字列のみ |

### 2.3 主要ファイル配置

| 層 | パス | 責務 |
|---|---|---|
| Page (一覧) | `src/app/(product)/gakuchika/page.tsx` | 一覧表示 |
| Page (詳細) | `src/app/(product)/gakuchika/[id]/page.tsx` | 会話 UI + 進捗 |
| 会話 UI | `src/components/gakuchika/GakuchikaConversationContent.tsx` | メイン会話コンポーネント |
| 進捗 UI | `src/components/gakuchika/NaturalProgressStatus.tsx` | コーチ進捗メッセージ + 残り質問数 |
| STAR 進捗 | `src/components/gakuchika/STARProgressBar.tsx` | 4 要素ピル表示 |
| 完了サマリー | `src/components/gakuchika/CompletionSummary.tsx` | 面接準備パック表示 |
| 開始画面 | `src/components/gakuchika/GakuchikaStartScreen.tsx` | 初期導入 + 作成開始 |
| 状態管理 | `src/lib/gakuchika/conversation-state.ts` | ConversationState 型定義 + 変換 |
| SSE FSM | `src/lib/gakuchika/stream-state-machine.ts` | ストリーム状態マシン |
| 一覧ステータス | `src/lib/gakuchika/list-status.ts` | 一覧カードのステータス正規化 |
| クライアント API | `src/lib/gakuchika/client-api.ts` | fetch ラッパー |
| サマリー | `src/lib/gakuchika/summary.ts` | 構造化サマリーの型 + 変換 |
| ViewModel | `src/hooks/gakuchika/useGakuchikaViewModel.ts` | re-export hub |
| テキスト再生 | `src/hooks/useStreamingTextPlayback.ts` | 文字送りアニメーション |
| チャットバブル | `src/components/chat/StreamingChatMessage.tsx` | ストリーミングテキスト表示 |
| BFF Stream | `src/bff/gakuchika/[id]/conversation/stream/route.ts` | SSE 中継 + クレジット消費 |
| BFF Draft | `src/bff/gakuchika/[id]/generate-es-draft/route.ts` | ES 生成 + Reserve/Confirm |
| BFF Summary | `src/bff/gakuchika/[id]/interview-summary/route.ts` | 構造化サマリー取得 |
| BFF New | `src/bff/gakuchika/[id]/conversation/new/route.ts` | 新規セッション開始 |
| BFF Resume | `src/bff/gakuchika/[id]/conversation/resume/route.ts` | セッション再開 |
| Billing | `src/bff/billing/gakuchika-stream-policy.ts` | 会話クレジット policy |
| FastAPI Router | `backend/app/routers/gakuchika.py` | 全エンドポイント + draft 品質管理 |
| Normalization | `backend/app/normalization/gakuchika_payload.py` | ペイロード正規化 (SSOT) |
| Question Planner | `backend/app/normalization/gakuchika_question_planner.py` | 質問計画 + カバレッジ |
| Pipeline | `backend/app/services/gakuchika/question_pipeline.py` | SSE 質問生成パイプライン |
| Core | `backend/app/services/gakuchika/core.py` | プロンプト組立 + 会話整形 |
| Retry | `backend/app/services/gakuchika/retry.py` | 質問品質リトライ |
| Models | `backend/app/services/gakuchika/models.py` | Pydantic モデル |
| Prompts | `backend/app/prompts/gakuchika_prompts.py` | テンプレート文字列 |
| Prompt Builder | `backend/app/prompts/gakuchika_prompt_builder.py` | (system, user) 組立 |

### 2.4 SSE イベントプロトコル

FastAPI が生成する SSE イベントを BFF がブラウザへ中継する。`internal_telemetry` は BFF 側で分離しフロントへは渡さない。

| イベント | 用途 | ペイロード例 |
|---|---|---|
| `progress` | 処理進捗 | `{step: "analysis", progress: 30, label: "質問の意図を整理中"}` |
| `string_chunk` | 質問テキスト逐次送出 | `{path: "question", text: "..."}` |
| `field_complete` | 個別フィールド確定 | `{path: "coach_progress_message", value: "..."}` |
| `complete` | 最終結果 | `{data: {question, conversation_state, next_action}}` |
| `error` | エラー | `{message: "...", internal_telemetry: {...}}` |

SSE 契約の詳細は `docs/architecture/GAKUCHIKA_SSE_CONTRACT.md` 参照。

---

## 3. STAR フレームワークとフェーズ遷移

### 3.1 4 段階

```
es_building ──> draft_ready ──> deep_dive_active ──> interview_ready
    |                |                                      |
    |          (ES 下書き生成)                    (構造化サマリー生成)
    |                |                                      |
    |         「深掘りを続ける」                     「もっと深掘る」
    |                |                                      |
    |                +---> deep_dive_active        extended_deep_dive_round++
    |                                                interview_ready に戻る
    +--- 会話やり直し ---> 新規 es_building
```

| 段階 | DB status | 入力欄 | 主な next_action |
|---|---|---|---|
| `es_building` | `in_progress` | 開 | `ask` |
| `draft_ready` | `in_progress` | 閉 | `show_generate_draft_cta` / `continue_deep_dive` |
| `deep_dive_active` | `in_progress` | 開 | `ask` |
| `interview_ready` | `completed` | 閉 | `show_interview_ready` |

### 3.2 focus_key と 4 要素

ES 構築段階の `focus_key` は STAR 骨格の 4 要素に対応する。

| focus_key | 意味 | progress_label 例 |
|---|---|---|
| `context` | 状況 | `状況を整理中` |
| `task` | 課題 | `課題を整理中` |
| `action` | 行動 | `行動を整理中` |
| `result` | 結果 | `成果を整理中` |
| `learning` | 学び（ES 前は必須でない） | `学びを整理中` |
| `role` | 役割（条件付き） | `役割を確認中` |

深掘り段階の `focus_key` は以下の観点に対応する。

| focus_key | 意味 |
|---|---|
| `challenge` | 判断理由・困難 |
| `role` | 役割範囲 |
| `action_reason` | 行動理由 |
| `result_evidence` | 成果根拠 |
| `learning_transfer` | 学びの再現性 |
| `credibility` | 信憑性 |
| `future` | 将来展望 |
| `backstory` | 原体験 |

### 3.3 input_richness_mode 分類

初回入力の濃さをサーバー側 classifier で分類し、質問戦略を切り替える。

| モード | 条件 | 質問戦略 |
|---|---|---|
| `seed_only` | テーマのみ or ごく短い | context / task を優先 |
| `rough_episode` | 課題や活動は記載あり | task / action を優先 |
| `almost_draftable` | 行動・結果まで含む | action / result / role の質を優先 |

SSOT: `_classify_input_richness()` in `backend/app/utils/gakuchika_text.py`

---

## 4. 正規化レイヤー（gakuchika_payload.py）

正規化レイヤーは LLM の JSON 出力をフロントが期待する `ConversationState` 形状に変換する pure function 群。LLM 呼び出しは一切行わない。

### 4.1 ES 構築 / 深掘りペイロード正規化

| 関数 | 入力 | 出力 |
|---|---|---|
| `_normalize_es_build_payload()` | LLM JSON + fallback state + 会話テキスト | `(question, state_dict, source)` |
| `_normalize_deepdive_payload()` | LLM JSON + fallback state + draft_text | `(question, state_dict, source)` |

ES 構築の正規化では以下の処理を順に実行する:

1. `missing_elements` を `_build_core_missing_elements()` で再計算
2. `draft_quality_checks` を `_build_draft_quality_checks()` で再評価
3. `causal_gaps` を `_build_causal_gaps()` で再計算
4. `focus_key` を `_choose_build_focus()` でサーバー側決定（LLM 提案より優先）
5. STAR 進捗と質問の論点を `_detect_es_focus_from_missing()` で一致させる
6. `ready_for_draft` を readiness gate で判定
7. 質問品質を `_evaluate_question_quality()` で検証
8. 質問ループを `_apply_question_loop_guard()` で検出

### 4.2 coach_progress_message の決定論的生成

`_build_coach_progress_message()` は stage / resolved_focuses / missing_elements から 30 字以下の進捗メッセージを生成する。LLM 非依存の pure function。

| 条件 | 出力例 |
|---|---|
| `interview_ready` | `面接準備まで整いました。さらに深掘りも可能です。` |
| `deep_dive_active` (round > 0) | `さらに一段深く掘り下げています。` |
| `deep_dive_active` (round = 0) | `深掘りで論点を整理しています。` |
| `draft_ready` | `ES材料が揃いました。下書きを作成できます。` |
| `es_building` (context resolved) | `状況が見えてきました。あと1-2問で材料が揃いそうです。` |
| `es_building` (初回) | `いま状況を一緒に整理しています。` |

SSOT: `_build_coach_progress_message()` in `backend/app/normalization/gakuchika_payload.py`

### 4.3 質問ループガード

質問の重複・ループを 3 層で防止する。

| 層 | 検出手段 | 対応 |
|---|---|---|
| 1. 会話履歴ベース | `_detect_question_loops_in_history()` | focus_key をブロックリストに追加 |
| 2. 質問品質評価 | `_evaluate_question_quality()` | fallback 質問に切替 or focus ブロック |
| 3. focus_attempt_counts | 同一 focus への試行回数 >= 2 | 一時ブロックし別 focus へ |

ブロックされた focus は `blocked_focuses` + `loop_blocked_focuses` で管理し、`_merge_focus_blocks()` で統合する。CORE_BUILD_ELEMENTS に属する focus は `_sanitize_blocked_focuses()` により、missing_elements に残っている限りブロックを解除する。

### 4.4 学生表現抽出

`_extract_student_expressions()` はユーザー回答から最大 5 件の「本人の言葉」を抽出し、ES 下書き生成プロンプトに注入する。

| カテゴリ | パターン | 例 |
|---|---|---|
| 引用表現 | `「...」` (2-30 字) | `「全員で話し合った」` |
| 数値+単位 | 数字 + %/人/件/倍 等 | `参加者が30%増加` |
| 一人称行動 | 私/自分 + 動詞句 | `私が企画書を作った` |

SSOT: `_extract_student_expressions()` in `backend/app/normalization/gakuchika_payload.py`

### 4.5 残り質問数推定

`_estimate_remaining_questions()` は readiness gate と同じ入力から残り質問数を算出する。UI の「あと N 問」チップで使用。

計算ロジック: `max(min_gate, missing_core, quality_gaps)` を cap_room で上限制限。

- `min_gate` = `MIN_USER_ANSWERS_FOR_ES_DRAFT_READY(4)` - question_count
- `missing_core` = CORE_BUILD_ELEMENTS の未充足数
- `quality_gaps` = task_clarity / action_ownership / result_traceability + 条件付き role_clarity / causal_gap_action_result

SSOT: `_estimate_remaining_questions()` in `backend/app/normalization/gakuchika_question_planner.py`

---

## 5. 質問生成パイプライン

### 5.1 初回質問 / ES 構築中の次問 / 深掘り次問

| 種別 | 関数 | プロンプト | max_tokens |
|---|---|---|---|
| 初回 | `_generate_initial_question()` | `INITIAL_QUESTION_SYSTEM_PROMPT` + `INITIAL_QUESTION_USER_MESSAGE` | 220 |
| ES 構築 | `_generate_next_question_progress()` | `ES_BUILD_SYSTEM_PROMPT` + `ES_BUILD_USER_MESSAGE` | 420 |
| 深掘り | 同上（`_is_deepdive_request()` で分岐） | `STAR_EVALUATE_SYSTEM_PROMPT` + `STAR_EVALUATE_USER_MESSAGE` | 420 |

プロンプトは Phase B.1-B.4 で system / user に分割されている。system は persona / rules / few-shot を含みキャッシュ可能。user は会話履歴 / known_facts / asked / blocked focuses を含み毎ターン再生成。

```
_generate_next_question_progress (SSE generator)
  |
  +-- _is_deepdive_request() で分岐
  |     yes -> _build_deepdive_prompt()
  |     no  -> _build_es_prompt()
  |
  +-- call_llm_streaming_fields() で LLM 呼び出し
  |     -> string_chunk / field_complete / complete イベント
  |
  +-- _retry_question_generation() で品質保証
  |     -> Stage 1: 初回結果 (temp 0.35)
  |     -> Stage 2: retry guidance 付き (temp 0.45)
  |     -> Stage 3: 別 focus 強制 (temp 0.25)
  |     -> Stage 4: deterministic fallback (LLM なし)
  |
  +-- _normalize_*_payload() で state 正規化
  |
  +-- SSE 送出: field_complete(coach_progress_message)
  |              field_complete(remaining_questions_estimate)
  |              complete(question + state + next_action)
```

### 5.2 リトライ戦略（retry.py）

質問生成は最大 3 段階 + fallback の 4 層リトライを持つ。10 秒のタイムアウト制約内で実行。

| Stage | Temperature | 戦略 | LLM 呼び出し |
|---|---|---|---|
| 1 | 0.35 | 初回結果をそのまま評価 | 初回ストリーミング結果を流用 |
| 2 | 0.45 | 品質違反を retry_guidance として注入 | あり |
| 3 | 0.25 | 未質問の focus_key を強制指定 | あり |
| Fallback | - | canonical fallback テンプレートを使用 | なし |

品質評価は `_evaluate_question_quality()` で実施。`quality_ok=true` なら即座に返却。terminal payload（`ready_for_draft=true` or `deepdive_stage=interview_ready`）も即座に返却。

---

## 6. ES 下書き品質保証

### 6.1 6 メトリクス

`draft_quality_checks` で追跡する 6 メトリクス。`_build_draft_quality_checks()` が会話テキストから deterministic に判定する。

| メトリクス | 判定内容 | readiness gate での扱い |
|---|---|---|
| `task_clarity` | 課題が抽象語だけで終わっていないか | `ready_for_draft` の必須条件 |
| `action_ownership` | 本人の具体行動が読めるか | `ready_for_draft` の必須条件 |
| `role_required` | 役割確認が必要なケースか（複数人活動等） | true の場合 `role_clarity` も必須 |
| `role_clarity` | 担当範囲がはっきりしているか | `role_required` 時のみ必須 |
| `result_traceability` | 行動の結果・変化が追えるか | soft 条件（missing_elements 判定にも連動） |
| `learning_reusability` | 学びが再現可能な形で言語化されているか | ES 作成前は必須でない |

### 6.2 causal_gaps 因果欠落検出

`_build_causal_gaps()` が会話テキストから因果の欠落を検出する。

| gap | 条件 | readiness gate への影響 |
|---|---|---|
| `causal_gap_task_action` | task はあるが action が課題に接続しない | ブロック条件ではない |
| `causal_gap_action_result` | action はあるが result が接続しない | **critical: draft-ready をブロック** |
| `learning_too_generic` | 学びが抽象的 | ブロック条件ではない |
| `role_scope_missing` | 大きな成果に対し role が不明 | **critical: draft-ready をブロック** |

### 6.3 品質 retry（ES 下書き生成時）

`generate_es_draft` ハンドラは生成後に `_build_gakuchika_draft_quality_report()` を実行し、品質問題を検出した場合は 1 回だけ retry する。

| 検出項目 | failure_code | retry hint |
|---|---|---|
| 文字数不足 | `under_char_min` | 具体的な行動・結果を補い char_min 字以上にする |
| 文字数超過 | `over_char_max` | 冗長な抽象表現を削り char_max 字以内に収める |
| AI smell 高 (tier >= 2) | `ai_smell_high` | 抽象名詞主語の一般論を避け、具体事実を主語に戻す |
| 評論調の結び | `critic_closing` | 結びは経験内の結果 or 結果+学びで締める |
| 事実反映不足 | `low_fact_overlap` | 本人の表現・数値・固有名を少なくとも 1 つ残す |

retry 結果は初回と比較し、failure_codes が subset かつ改善された場合のみ採用する。最終結果の `draft_quality.status` は `passed` / `repaired` / `warning` のいずれか。

---

## 7. 事実保持とコーパス構築

### 7.1 known_facts / draft_material

| 入力 | 生成元 | 用途 |
|---|---|---|
| `known_facts` | `_build_known_facts()`: ユーザー回答から最大 5 件（先頭 2 件 + 末尾 3 件）をバレット化、計 1200 字上限 | ES 構築プロンプト + ES 下書きプロンプト |
| `draft_material` | BFF が conversation_state から構築: readiness_reason / strength_tags / issue_tags / quality_checks 等 | ES 下書きプロンプトに「材料診断」として注入 |
| `student_expressions` | `_extract_student_expressions()`: 最大 5 件 | ES 下書きプロンプトに「本人の言葉」として注入 |
| `user_corpus` | `_build_user_corpus()`: 初期入力 + 全ユーザー回答 + draft_text を結合 | 正規化レイヤーの deterministic evaluator に使用 |

### 7.2 タグ体系

ES 下書き生成成功直後に `_build_draft_diagnostics()` が draft テキストを分析し、4 種のタグを生成する。深掘りプロンプトの `draft_diagnostics_json` として LLM に渡される。

| タグ種別 | 例 | 用途 |
|---|---|---|
| `strength_tags` | `action_visible`, `result_visible`, `ownership_visible` | 強みの可視化 |
| `issue_tags` | `action_specificity_weak`, `result_evidence_thin`, `learning_generic` | 改善点の特定 |
| `deepdive_recommendation_tags` | `deepen_action_reason`, `collect_result_evidence`, `clarify_role_scope` | 深掘り優先順位 |
| `credibility_risk_tags` | `ownership_ambiguous` | 信憑性リスク |

---

## 8. 構造化サマリーと面接準備パック

`interview_ready` 到達時に `STRUCTURED_SUMMARY_PROMPT` を使って構造化サマリーを生成する。

### リクエスト

`POST /api/gakuchika/structured-summary` に会話履歴 + `draft_text` を渡す（`draft_text` は必須）。

### レスポンス構造

| カテゴリ | フィールド | 内容 |
|---|---|---|
| STAR 本文 | `situation_text`, `task_text`, `action_text`, `result_text` | 各 50-120 字 |
| 分析 | `strengths` (2件), `learnings` (2件), `numbers` | エピソード固有の表現 |
| 面接対策 | `interviewer_hooks`, `decision_reasons`, `before_after_comparisons` | 深掘りポイント |
| 信憑性補強 | `credibility_notes`, `role_scope` | 突っ込まれた時の補足 |
| 再現性 | `reusable_principles`, `interview_supporting_details` | 入社後に使える原則 |
| 拡張情報 | `future_outlook_notes`, `backstory_notes` | 将来展望 / 原体験 |
| 面接準備パック | `one_line_core_answer`, `likely_followup_questions`, `weak_points_to_prepare`, `two_minute_version_outline` | 面接本番で使える材料 |

### 深掘りフェーズの進行

深掘り質問は `_determine_deepdive_phase()` で 3 段階に分かれ、質問数に応じて自動遷移する。

| phase_name | 条件 | 意図 | 優先 focus |
|---|---|---|---|
| `es_aftercare` | deepdive_turn <= 2 | ES 骨格の判断理由・役割の解像度向上 | challenge, role, action_reason |
| `evidence_enhancement` | deepdive_turn 3-5 | 成果の根拠・信憑性・再現可能性の補強 | result_evidence, credibility, learning_transfer |
| `interview_expansion` | deepdive_turn >= 6 | 将来展望・原体験で人物像を厚くする | future, backstory, learning_transfer |

深掘りカバレッジは `_compute_group_coverage()` で 4 グループ (foundation / reasoning / evidence / narrative) の到達状況を追跡し、`_select_next_deepdive_focus_by_coverage()` が未到達グループの focus を優先的に選択する。

### 継続深掘り

`interview_ready` 到達後も「もっと深掘る」で会話を再開できる。`extended_deep_dive_round` がインクリメントされ、プロンプトに「仮説の裏取り・数値の分解・逆質問に備えた答え」を要求する補助指示が追加される。

---

## 9. フロントエンド

### 9.1 コンポーネント構成

```
src/app/(product)/gakuchika/[id]/page.tsx
  +-- GakuchikaConversationContent
  |     +-- useConversationRuntime + gakuchika-stream-adapter (SSE処理)
  |     +-- StreamingChatMessage (チャットバブル + カーソル)
  |     +-- GakuchikaStartScreen (初期導入)
  |     +-- ConversationProgressBar (共通、4要素ピル: 状況/課題/行動/結果)
  |     +-- ConversationPhaseBar (共通、ライフサイクル表示)
  |     +-- STARProgressBar (一覧用コンパクト表示)
  |     +-- CompletionSummary (面接準備パック)
  |     +-- GakuchikaRestartConfirmDialog (会話やり直し確認)
  +-- GakuchikaCard (一覧用カード)
  +-- GakuchikaGrid (一覧レイアウト)
  +-- StatusGroup (一覧ステータスグループ)
```

### 9.2 進捗 UI（4 要素ピル / ステータス遷移）

一覧画面では `STARProgressBar` が `状況 / 課題 / 行動 / 結果` の 4 要素をコンパクト表示する。会話画面では共通 `ConversationProgressBar`（`src/components/chat/ConversationProgressBar.tsx`）が同じ 4 要素をピルで表示し、`ConversationPhaseBar` がライフサイクル（Q&A → ES作成可 → 深掘り中 → 面接準備完了）を表示する。

`coach_progress_message` と `remaining_questions_estimate` はサーバーから SSE で送られ、`ConversationProgressBar` の `footerMessage` / `headerSubtext` として表示する。

### 9.3 ストリーミング再生

SSE 処理は `useConversationRuntime` + `gakuchika-stream-adapter` で行う。`processSSEEvent` は pure reducer として `string_chunk` をバッファし、`complete` で最終テキストを確定する。副作用（`assistantPhase` 更新等）は `onSideEffect` コールバックに集約。文字送り再生は `useConversationPlayback` → `useStreamingTextPlayback` → `StreamingChatMessage` で行い、再生終了後に `commitState` でメッセージ・`nextQuestion`・`conversation_state` を一括反映する。

### 9.4 一覧画面

一覧カードの状態は `未開始 / 作成中 / ES作成可 / 深掘り中 / 面接準備完了` で表示する。API の `conversationStatus` は `in_progress` / `completed` に正規化され、`getGakuchikaListStatusKey`（`src/lib/gakuchika/list-status.ts`）で JSON のゆれを未開始にまとめる。タブが visible に戻ったとき `/gakuchika` で silent 再取得する。

---

## 10. 課金・認証

### 認証ルール

| 対象 | アクセス |
|---|---|
| ログインユーザー | 全機能利用可能 |
| ゲスト | 会話・ES 生成ともに利用不可（BFF が 401 で拒否） |

### クレジット消費テーブル

| 操作 | クレジット | パターン | 条件 |
|---|---|---|---|
| 会話 (1 問) | 1 | Precheck -> Confirm on complete | `CONVERSATION_CREDITS_PER_TURN = 1` |
| ES 下書き生成 | 6 | Reserve -> Confirm/Cancel | `reserveCredits(userId, 6, "gakuchika")` |
| 構造化サマリー | 0 | なし | クレジット消費なし |

### 会話クレジット処理フロー

```
BFF stream/route.ts
  |
  +-- shouldConsumeCredit = !!userId
  +-- gakuchikaStreamPolicy.precheck()  -> クレジット残高確認
  +-- fetchConfiguredUpstreamSSE()      -> FastAPI SSE 取得
  +-- complete 受信 -> confirm()         -> 1 クレジット消費
  +-- error/abort -> cancel()            -> no-op (予約なし)
```

### ES 下書きクレジット処理フロー

```
BFF generate-es-draft/route.ts
  |
  +-- reserveCredits(userId, 6, "gakuchika")  -> 6 クレジット事前控除
  +-- fetchFastApiInternal(/api/gakuchika/generate-es-draft)
  +-- 成功 -> confirmReservation()             -> 控除確定
  +-- 失敗 -> cancelReservation()              -> 返金
```

### エラーパス

| 段階 | 条件 | 結果 |
|---|---|---|
| BFF (stream) | 未認証 / ゲスト | 401 |
| BFF (stream) | クレジット不足 | 402 |
| BFF (stream) | レートリミット超過 | 429 |
| BFF (stream) | SSE 同時接続超過 | 429 (sse_concurrency_exceeded) |
| BFF (draft) | 未認証 / ゲスト | 401 |
| BFF (draft) | クレジット不足 | 402 (予約失敗) |
| Backend | テーマ空 | SSE error |
| Backend | 入力注入検出 | 400 (PromptSafetyError) |
| Backend | LLM 呼び出し失敗 | 503 |
| Backend | 会話履歴なし (draft/summary) | 400 |

---

## 11. テスト

### Draft Validation Profile

ガクチカ ES 下書きは ES 添削の LLM validation を共有しつつ、`LENIENT_PROFILE` を使う。`company_grounding` と `fact_preservation` は warning 扱いで、短い会話材料からの下書き生成で blocking failure にしない。

品質リトライ後も未解決の failure が残る場合、空本文・断片・自己否定・企業名なし設問での企業敬称混入に該当しなければ best-effort として最も近い下書きを返し、`draft_quality.best_effort_adopted` と warning を付ける。

### テスト層

| 層 | コマンド | 内容 |
|---|---|---|
| Unit (Backend) | `python -m pytest backend/tests/gakuchika -q` | 正規化・品質判定・リトライ・プロンプト構造 |
| Architecture | `python -m pytest backend/tests/architecture/ -q` | サービス層の境界分離 |
| Live Provider | `make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=gakuchika` | 実 API 品質ゲート |
| Unit (Frontend) | `npm run test:unit` | コンポーネント・状態変換 |

### 主要テストファイル

| ファイル | 内容 |
|---|---|
| `backend/tests/gakuchika/test_gakuchika_next_question.py` | 正規化 + readiness gate + focus 選択 |
| `backend/tests/gakuchika/test_gakuchika_flow_evaluators.py` | draft_quality_checks / causal_gaps / deepdive_completion |
| `backend/tests/gakuchika/test_gakuchika_facts_retention.py` | known_facts / student_expressions / fact_overlap |
| `backend/tests/gakuchika/test_gakuchika_live_scenarios.py` | 実 LLM を使ったシナリオテスト |
| `backend/tests/gakuchika/test_gakuchika_prompt_contracts.py` | プロンプトテンプレートの構造検証 |
| `backend/tests/gakuchika/test_gakuchika_retry.py` | リトライ戦略 + fallback |
| `backend/tests/gakuchika/test_question_group_coverage.py` | 深掘りカバレッジ計算 |
| `backend/tests/gakuchika/test_question_loop_detector.py` | 質問ループ検出 |
| `backend/tests/gakuchika/test_question_quality.py` | 質問品質評価 |

---

## 12. 主要ファイル一覧（クイックリファレンス）

| カテゴリ | ファイル | 行数 |
|---|---|---|
| **Backend Core** | `backend/app/normalization/gakuchika_payload.py` | ~930 |
| | `backend/app/normalization/gakuchika_question_planner.py` | ~249 |
| | `backend/app/services/gakuchika/question_pipeline.py` | ~372 |
| | `backend/app/services/gakuchika/core.py` | ~254 |
| | `backend/app/services/gakuchika/retry.py` | ~170 |
| | `backend/app/services/gakuchika/models.py` | ~124 |
| | `backend/app/routers/gakuchika.py` | ~1,144 |
| **Prompts** | `backend/app/prompts/gakuchika_prompts.py` | ~536 |
| | `backend/app/prompts/gakuchika_prompt_builder.py` | ~205 |
| **Frontend** | `src/components/gakuchika/GakuchikaConversationContent.tsx` | ~469 |
| | `src/components/gakuchika/CompletionSummary.tsx` | ~399 |
| | `src/components/gakuchika/NaturalProgressStatus.tsx` | ~226 |
| | `src/components/gakuchika/STARProgressBar.tsx` | ~172 |
| | `src/components/gakuchika/GakuchikaStartScreen.tsx` | ~127 |
| | `src/lib/gakuchika/conversation-state.ts` | ~563 |
| | `src/lib/gakuchika/summary.ts` | ~239 |
| | `src/lib/gakuchika/stream-state-machine.ts` | ~82 |
| **BFF** | `src/bff/gakuchika/[id]/generate-es-draft/route.ts` | ~416 |
| | `src/bff/gakuchika/[id]/conversation/stream/route.ts` | ~196 |
| | `src/bff/gakuchika/[id]/conversation/resume/route.ts` | ~290 |
| | `src/bff/gakuchika/[id]/interview-summary/route.ts` | ~208 |
| | `src/bff/gakuchika/[id]/conversation/new/route.ts` | ~180 |
| | `src/bff/gakuchika/fastapi-stream.ts` | ~287 |
| | `src/bff/billing/gakuchika-stream-policy.ts` | ~40 |

---

## 補足: 関連ドキュメント

- SSE 契約: `docs/architecture/GAKUCHIKA_SSE_CONTRACT.md`
- ES 添削機能: `docs/features/ES_REVIEW.md`
- 志望動機: `docs/features/MOTIVATION.md`
- 集客 LP: `src/app/(marketing)/gakuchika-ai/page.tsx`
