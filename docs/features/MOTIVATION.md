# 志望動機作成機能

現行実装の正本は `backend/app/routers/motivation.py` と `src/app/(product)/companies/[id]/motivation/page.tsx`。本書はその要点だけをまとめる。

## 概要

- 目的は、その企業・その職種に合った志望動機 ES の材料を、会話で段階的に揃えること
- 会話開始前に `企業確認 / 業界確定 / 職種確定` の setup を行う
- 質問数は固定しない
- 骨格が十分に揃った時点で `draft_ready` にし、自動で次質問は出さない
- `draft_ready` 到達後はスナックバーで通知し、`志望動機ESを作成` CTA を有効化する
- その後も任意で会話を続けられ、追加深掘りは ES を強める補足質問だけに限定する

## 会話骨格

志望動機は次の 6 要素で管理する。

1. `industry_reason`
2. `company_reason`
3. `self_connection`
4. `desired_work`
5. `value_contribution`
6. `differentiation`

基本フローは `industry_reason → company_reason → self_connection → desired_work → value_contribution → differentiation`。

`origin_experience` と `fit_connection` は旧ステージ名としては残さず、現在は `self_connection` に統合して扱う。

## 評価と質問生成

- FastAPI は 4 要素スコアではなく `slot_status / missing_slots / ready_for_draft / draft_readiness_reason / conversation_warnings` を返す
- `ready_for_draft` は 6 要素が最低限埋まり、特に `company_reason / desired_work / differentiation` が抽象語だけで終わっていない時に true
- 次質問は常に「不足している 1 要素」に対して 1 問だけ生成する
- 同じ要素の再質問は `stageAttemptCount` で最大 1 回まで
- 直前質問と同じ意味の質問は `question_signature` と `lastQuestionMeta` で避ける
- 未確認の企業名・職種・仕事内容・志望理由を前提にした質問は reject / repair する

## 回答候補

- 候補は質問に対する自然な回答だけを返す
- 候補数は 2〜4 件固定ではなく、成立する件数だけ返す
- 候補本文に使うのは `setup で確定した業界/職種` と `会話・プロフィール・ガクチカで明示された事実` のみ
- ユーザーが言っていない社名・職種・事業・経験を候補に混ぜない
- 材料が薄いときは `まだそこは整理できていません` 系の安全候補を許可する

## ストリーミングと一貫性

- `conversation/stream` は `progress` と最終 `complete` を返す
- 質問文の `string_chunk` は中継しない
- UI は確定済みの `nextQuestion` だけを表示し、質問が表示後に別文へ置換されない
- DB 保存、候補生成、UI 表示は同じ canonical question を使う

## 主要 API

- `GET /api/motivation/[companyId]/conversation`
  - 会話履歴、setup 状態、`nextQuestion`、`stageStatus`、`conversationContext` を返す
- `POST /api/motivation/[companyId]/conversation/start`
  - setup を保存し、初回質問を生成して assistant message として保存する
- `POST /api/motivation/[companyId]/conversation/stream`
  - 回答送信の唯一の経路。FastAPI SSE を consume-and-re-emit し、保存とクレジット消費もここで行う
- `POST /api/motivation/[companyId]/generate-draft`
  - 300/400/500 字の ES 下書きを生成し、`documents` に保存する

## 会話状態

`conversationContext` には主に次を保持する。

- `selectedIndustry`
- `selectedRole`
- `industryReason`
- `companyReason`
- `selfConnection`
- `desiredWork`
- `valueContribution`
- `differentiationReason`
- `confirmedFacts`
- `openSlots`
- `questionStage`
- `stageAttemptCount`
- `lastQuestionMeta`
- `draftReady`
- `draftReadyUnlockedAt`

## UI 要点

- 右カラムの進捗は 6 要素ベース
- setup 画面では業界と職種を先に確定する
- `参考にした企業情報` は compact card で表示する
- `会話をやり直す` は進捗カードから操作できる
- `志望動機ESを作成` CTA は常に見える位置に置き、未到達時は disabled 理由を表示する

## クレジット

- 応答 5 回ごとに 3 クレジット消費
- 下書き生成は成功時のみ所定クレジットを消費
- 失敗時は消費しない
