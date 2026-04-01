# ガクチカ作成

最終更新: 2026-04-02

## 概要

ガクチカ作成は、短い初期入力からまず ES に載せられる水準の本文を作り、その後に同じ会話の続きとして面接向けの深掘りへ進める機能です。会話生成の既定モデルは `MODEL_GAKUCHIKA=gpt-fast`、ES 下書き生成は `MODEL_GAKUCHIKA_DRAFT=claude-sonnet` です。

この機能は次の順序で進みます。

1. ES 作成前は深掘りしすぎず、本文に必要な材料を揃える
2. `ready_for_draft=true` に達したら `GAKUCHIKA_DRAFT_PROMPT` で ES 下書きを作る
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
  "missing_elements": ["action", "result"],
  "ready_for_draft": false,
  "draft_readiness_reason": "task と action の具体性をもう少し補いたいです。",
  "draft_text": null,
  "deepdive_stage": null
}
```

### ES 作成フェーズ

- 段階は `es_building`
- 目的は `overview / context / task / action / result / learning` の最低材料を揃えること
- LLM の質問文は必ず丁寧語
- `question / answer_hint / progress_label / focus_key` は同じ焦点を指す
- `ready_for_draft=true` の条件は「6要素がある」だけではない
- 特に `task` と `action` は抽象語で終わらず、ES 本文に落とせる最低具体性が必要

### ES 作成可

- 段階は `draft_ready`
- UI では `ES作成可` と表示する
- `POST /api/gakuchika/[id]/generate-es-draft` は `completed` セッション限定ではなく、`ready_for_draft=true` を条件に実行する
- ES 生成成功時は draft を ES ドキュメントへ保存し、同じセッションの `draft_text` にも保持する

### 深掘りフェーズ

- 段階は `deep_dive_active`
- ES 本文を起点に、判断理由・役割範囲・成果根拠・再現性を補強する
- 必要に応じて `future` と `backstory` も聞く
- 十分に進んだら `interview_ready` に遷移する

### 面接準備完了

- 段階は `interview_ready`
- `STRUCTURED_SUMMARY_PROMPT` を使って `gakuchika_contents.summary` を最終版で更新する
- summary には STAR の本文に加えて、面接補足用の `future_outlook_notes` と `backstory_notes` を含める

## API 契約

### FastAPI `/api/gakuchika/next-question`

返却の中心は `conversation_state` であり、旧 `star_scores` と `target_element` は会話制御に使わない。

```json
{
  "question": "その課題に対して、ご自身はまず何をしたのですか。",
  "conversation_state": {
    "stage": "es_building",
    "focus_key": "action",
    "progress_label": "行動を整理中",
    "answer_hint": "ご自身が取った具体的な行動を書くと伝わりやすいです。",
    "missing_elements": ["action", "result"],
    "ready_for_draft": false,
    "draft_readiness_reason": "task と action の具体性をもう少し補いたいです。",
    "draft_text": null,
    "deepdive_stage": null
  }
}
```

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

## フロント挙動

### 詳細画面

- 開始前は短い導入と `作成を始める` を表示する
- ES 作成フェーズでは会話と進捗を同じ画面で見せる
- `focus_key` に対応する `answer_hint` と `progress_label` をそのまま表示する
- `draft_ready` 到達後は `ガクチカESを作成` CTA を強く見せる
- ES 作成後は `更に深掘りする` で同一セッションを再開する
- `interview_ready` 到達後は構造化サマリーを表示する

### 一覧画面

- 旧 0-100 STAR 採点は表示しない
- カード状態は `未開始 / 作成中 / ES作成可 / 深掘り中 / 面接準備完了` で見せる
- 進捗バーは ES 作成前と深掘り後で表示内容を切り替える

## クレジット

- ログインユーザーのみ 5 問回答ごとに 3 クレジット
- ES 下書き生成は 6 クレジット
- いずれも成功時のみ消費
- ゲストユーザーはガクチカ作成・ES 生成を使えない

## 関連ファイル

- `backend/app/prompts/gakuchika_prompts.py`
- `backend/app/routers/gakuchika.py`
- `backend/tests/gakuchika/test_gakuchika_next_question.py`
- `src/app/api/gakuchika/shared.ts`
- `src/app/api/gakuchika/[id]/conversation/new/route.ts`
- `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- `src/app/api/gakuchika/[id]/conversation/resume/route.ts`
- `src/app/api/gakuchika/[id]/generate-es-draft/route.ts`
- `src/app/api/gakuchika/summary-server.ts`
- `src/app/(product)/gakuchika/page.tsx`
- `src/app/(product)/gakuchika/[id]/page.tsx`
