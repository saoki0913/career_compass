# ガクチカ作成

最終更新: 2026-04-05

## 概要

ガクチカ作成は、短い初期入力からまず ES に載せられる水準の本文を作り、その後に同じ会話の続きとして面接向けの深掘りへ進める機能です。会話生成の既定モデルは `MODEL_GAKUCHIKA=gpt-fast`、ES 下書き生成は `MODEL_GAKUCHIKA_DRAFT=claude-sonnet` です。

### 想定ユーザーフロー（プロダクト正）

1. **ES 材料フェーズ**: おおむね **4〜6 問**の対話で、ES に載せられる水準の材料が揃う（`draft_ready` / `ready_for_draft`）。
2. **ES 作成**: ユーザーがガクチカ ES を生成する。先に詰めたい場合は **「もう少し整える」** で同じセッション内で材料を増やしてから ES 作成へ（`draft_ready` かつ下書き未生成でも深掘り系プロンプトで再開する）。
3. **深掘りフェーズ**: ES 作成後（または下書き生成済みの文脈）で、面接に耐える粒度まで深掘り（`deep_dive_active`）。
4. **面接準備完了**: 講評・整理（structured summary 等）を **面接準備完了** として提示（`interview_ready`）。このとき `gakuchika_conversations.status=completed`。
5. **継続深掘り**: **「もっと深掘る」** で会話を再開する。`status` は `in_progress` に戻り、ストリーム送信が再度可能。`extended_deep_dive_round` が増えるほどプロンプト上でより細かい論点（具体・仮説・数値の裏取り等）を要求する。

**会話をやり直す** は、進捗カードから開く確認モーダルで続行可否を選んだうえで新規セッション（`conversation/new`）を開始する。

この機能は次の順序で進みます。

1. ES 作成前は深掘りしすぎず、`状況 / 課題 / 行動 / 結果` の 4 要素を短い会話で揃える
2. `ready_for_draft=true` に達したら FastAPI `POST /api/gakuchika/generate-es-draft` が **`build_template_draft_generation_prompt`（`TEMPLATE_DEFS` の `gakuchika` と同一ソース）** で ES 下書きを 1 回の LLM 呼び出しで生成する
3. その後は同一セッションを再開して面接向けに深掘りする
4. 十分に進んだら `STRUCTURED_SUMMARY_PROMPT` で STAR と面接メモへ整理する

## 会話段階

`gakuchika_conversations.star_scores` カラム名は後方互換のため残すが、保存する値は `conversationState` JSON に切り替える。

```json
{
  "stage": "es_building | draft_ready | deep_dive_active | interview_ready",
  "focus_key": "overview | context | task | action | result | learning | role | challenge | action_reason | result_evidence | learning_transfer | credibility | future | backstory",
  "progress_label": "行動を整理中",
  "answer_hint": "ご自身が取った具体的な行動を書くと伝わりやすいです。",
  "input_richness_mode": "seed_only | rough_episode | almost_draftable",
  "missing_elements": ["action", "result"],
  "asked_focuses": ["context", "task"],
  "resolved_focuses": ["context"],
  "deferred_focuses": ["learning"],
  "blocked_focuses": [],
  "focus_attempt_counts": {
    "task": 1
  },
  "last_question_signature": "task:v1",
  "draft_quality_checks": {
    "task_clarity": false,
    "action_ownership": false,
    "role_required": true,
    "role_clarity": false,
    "result_traceability": false,
    "learning_reusability": false
  },
  "causal_gaps": ["causal_gap_action_result"],
  "completion_checks": {},
  "ready_for_draft": false,
  "draft_readiness_reason": "task と action の具体性をもう少し補いたいです。",
  "draft_text": null,
  "strength_tags": [],
  "issue_tags": [],
  "deepdive_recommendation_tags": [],
  "credibility_risk_tags": [],
  "deepdive_stage": null,
  "deepdive_complete": false,
  "completion_reasons": [],
  "extended_deep_dive_round": 0
}
```

### ES 作成フェーズ

- 段階は `es_building`
- 目的は `context / task / action / result` の 4 要素を最短で揃えること
- 初回入力はサーバー側 classifier で `seed_only / rough_episode / almost_draftable` に分類し、`input_richness_mode` として state に保持する
- LLM の質問文は必ず丁寧語
- `question / answer_hint / progress_label / focus_key` は同じ焦点を指す
- 実装上、ES 構築中に `missing_elements` に STAR の前段が残る限り、`focus_key` はその先頭欠落（context→task→action→result）へサーバー側で寄せ、進捗バーと質問の軸をずらさない
- 質問数は `4〜6問` を基本目標とし、原則 `6問` で `ready_for_draft` 判定まで進める。初期入力が極端に薄い時だけ `7〜8問` まで救済する
- `ready_for_draft=true` の条件は「4要素が全部埋まっている」だけではない
- 最低基準は次で固定する
  - `context`: 取り組みの場面や状況が 1 文で言える
  - `task`: 何を問題と見ていたかが抽象語だけで終わらない
  - `action`: 自分の具体行動が少なくとも 1 つある
  - `result`: 数字がなくても前後差・反応・変化のいずれかがある
- 重大因果欠落は server-side で判定する
  - `task` はあるが `action` が課題に接続しない
  - `action` はあるが `result` が完全に接続しない
  - `result` が大きいのに `role / ownership` が全く不明
- `learning` は ES 作成前の絶対必須ではない。会話中に取れた場合のみ draft に自然に織り込む
- `draft_quality_checks` と `causal_gaps` をサーバー側で保持し、`task_clarity / action_ownership / role_clarity / result_traceability / learning_reusability` を明示的に見る
- `role` は全件必須ではない。複数人活動、組織改善、役職あり、大きな成果、自分の寄与が見えにくいケースで優先確認する
- 重複質問は prompt 任せにせず、`asked_focuses / resolved_focuses / deferred_focuses / blocked_focuses / focus_attempt_counts / last_question_signature` を state に持って抑制する
- fallback 質問は focus ごとの canonical 文面を使い、同じ論点の言い換え連打を避ける

### ES 作成可

- 段階は `draft_ready`
- UI では `ES作成可` と表示する
- `progress_label` は `ESを作成できます`
- この段階では follow-up question を出さず、会話入力欄を閉じる
- 主 CTA は `ガクチカESを作成`、副 CTA は `もう少し整える`
- **文字数**: 作成前に UI で **300 / 400 / 500** 字を選べる。`POST /api/gakuchika/[id]/generate-es-draft` の JSON ボディ `charLimit`（300 / 400 / 500）に対応。初期値は `gakuchika_contents.charLimitType` に追従
- `POST /api/gakuchika/[id]/generate-es-draft` は `completed` セッション限定ではなく、`ready_for_draft=true` を条件に実行する
- DB 上の `gakuchika_conversations.status` はまだ `in_progress` のまま保つ
- ES 生成成功時は draft を ES ドキュメントへ保存し、同じセッションの `draft_text` にも保持する
- ES 下書き生成成功直後に deterministic evaluator を走らせ、`strength_tags / issue_tags / deepdive_recommendation_tags / credibility_risk_tags` を state に保存する

### 深掘りフェーズ

- 段階は `deep_dive_active`
- ES 本文を起点に、判断理由・役割範囲・成果根拠・再現性を補強する
- 必要に応じて `future` と `backstory` も聞く
- `draft_ready` かつ `draft_text` ありの状態で、ユーザーが明示的に `更に深掘りする` を選んだ時だけ入る
- prompt は次質問の論点と質問文を返し、`deepdive_complete` の判定はサーバー側 orchestrator が行う
- `role / challenge / action_reason / result_evidence / learning_transfer / credibility` が揃うと `interview_ready` に遷移する

### 面接準備完了

- 段階は `interview_ready`
- この段階だけ `gakuchika_conversations.status=completed` にする
- `STRUCTURED_SUMMARY_PROMPT` を使って `gakuchika_contents.summary` を最終版で更新する
- summary には STAR の本文に加えて、面接補足用の `future_outlook_notes` と `backstory_notes` を含める
- summary には `one_line_core_answer / likely_followup_questions / weak_points_to_prepare / two_minute_version_outline` を含め、面接準備パックとして表示する

## API 契約

### FastAPI `/api/gakuchika/next-question`

返却の中心は `conversation_state` であり、旧 `star_scores` と `target_element` は会話制御に使わない。

```json
{
  "question": "その課題に対して、ご自身はまず何をしたのですか。",
  "next_action": "ask | show_generate_draft_cta | continue_deep_dive | show_interview_ready",
  "conversation_state": {
    "stage": "es_building",
    "focus_key": "action",
    "progress_label": "行動を整理中",
    "answer_hint": "ご自身が取った具体的な行動を書くと伝わりやすいです。",
    "input_richness_mode": "rough_episode",
    "missing_elements": ["action", "result"],
    "asked_focuses": ["context", "task"],
    "resolved_focuses": ["context"],
    "deferred_focuses": [],
    "blocked_focuses": [],
    "focus_attempt_counts": {
      "task": 1
    },
    "last_question_signature": "task:v1",
    "draft_quality_checks": {
      "task_clarity": false,
      "action_ownership": false,
      "role_required": true,
      "role_clarity": false,
      "result_traceability": false,
      "learning_reusability": false
    },
    "causal_gaps": ["causal_gap_action_result"],
    "completion_checks": {},
    "ready_for_draft": false,
    "draft_readiness_reason": "task と action の具体性をもう少し補いたいです。",
    "draft_text": null,
    "strength_tags": [],
    "issue_tags": [],
    "deepdive_recommendation_tags": [],
    "credibility_risk_tags": [],
    "deepdive_stage": null,
    "deepdive_complete": false,
    "completion_reasons": []
  }
}
```

- `next_action=ask` の時だけ canonical question を表示する
- `draft_ready` 到達時は `question=""` を許容し、UI は `next_action=show_generate_draft_cta` を正として CTA 表示へ切り替える
- SSE の `string_chunk` は complete までバッファし、**確定した次質問文**は complete payload を正とする。UI は chunk の逐次 `setState` ではなく、**`useStreamingTextPlayback` + `StreamingChatMessage`** で文字送り再生し、再生終了後にメッセージ・`nextQuestion`・`conversation_state` を一括反映する（CTA 判定も complete を正とする）

### FastAPI `/api/gakuchika/structured-summary`

入力には会話履歴に加えて `draft_text` を必須で渡す。主な出力項目は次のとおり。

- `situation_text`
- `task_text`
- `action_text`
- `result_text`
- `strengths`
- `learnings`
- `numbers`
- `interviewer_hooks`
- `reusable_principles`
- `interview_supporting_details`
- `future_outlook_notes`
- `backstory_notes`
- `one_line_core_answer`
- `likely_followup_questions`
- `weak_points_to_prepare`
- `two_minute_version_outline`

## フロント挙動

### 詳細画面

- 開始前は短い導入と `作成を始める` を表示する
- ES 作成フェーズでは会話と進捗を同じ画面で見せる
- 進捗の主表示は `状況 / 課題 / 行動 / 結果` の 4 要素に寄せる
- `focus_key` に対応する `answer_hint` と `progress_label` をそのまま表示する
- `draft_ready` 到達後は `ガクチカESを作成` CTA を強く見せ、入力欄は閉じる
- `もう少し整える` を押した時だけ、その時点の `draft_ready` セッションで会話を再開できる
- ES 作成後は `更に深掘りする` で同一セッションを再開する
- `interview_ready` 到達後は構造化サマリーを表示する
- 面接準備パックでは `one_line_core_answer` と `two_minute_version_outline` を主表示にし、`likely_followup_questions` と `weak_points_to_prepare` を補助表示にする

### 一覧画面

- 旧 0-100 STAR 採点は表示しない
- カード状態は `未開始 / 作成中 / ES作成可 / 深掘り中 / 面接準備完了` で見せる
- 進捗バーは ES 作成前は 4 要素、ES 作成後は `ES作成可 -> 深掘り中 -> 面接準備完了` へ切り替える
- API の `conversationStatus` は `in_progress` / `completed` に正規化され、`questionCount > 0` かつステータス欠落時は `in_progress` にフォールバックする。クライアントは `getGakuchikaListStatusKey`（`src/lib/gakuchika/list-status.ts`）で JSON のゆれを未開始にまとめ、**タブが visible に戻ったとき** `/gakuchika` で silent 再取得する

## クレジット

- ログインユーザーのみ 5 問回答ごとに 3 クレジット
- ES 下書き生成は 6 クレジット
- いずれも成功時のみ消費
- ゲストユーザーはガクチカ作成・ES 生成を使えない

## 関連ファイル

- `backend/app/prompts/gakuchika_prompts.py`
- `backend/app/prompts/es_templates.py`（`build_template_draft_generation_prompt`・`DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA`）
- `backend/app/routers/gakuchika.py`
- `backend/tests/gakuchika/test_gakuchika_next_question.py`
- `src/app/api/gakuchika/shared.ts`
- `src/app/api/gakuchika/route.ts`（一覧 GET・`normalizeGakuchikaListConversationStatus`）
- `src/lib/gakuchika/list-status.ts`
- `src/hooks/useStreamingTextPlayback.ts`
- `src/components/chat/StreamingChatMessage.tsx`
- `src/app/api/gakuchika/[id]/conversation/new/route.ts`
- `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- `src/app/api/gakuchika/[id]/conversation/resume/route.ts`
- `src/app/api/gakuchika/[id]/generate-es-draft/route.ts`
- `src/app/api/gakuchika/summary-server.ts`
- `src/app/(product)/gakuchika/page.tsx`
- `src/app/(product)/gakuchika/[id]/page.tsx`
