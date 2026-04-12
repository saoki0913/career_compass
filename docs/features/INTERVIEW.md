# 面接対策（企業特化模擬面接）

企業・職種に特化した模擬面接を行い、最終講評を生成する機能。

## 入口

| 項目 | パス |
|------|------|
| FastAPI | `backend/app/routers/interview.py` |
| ページ | `src/app/(product)/companies/[id]/interview/page.tsx` |
| Next API | `src/app/api/companies/[id]/interview/`（start, stream, feedback, continue, reset） |
| セッション管理 | `src/lib/interview/session.ts`, `src/lib/interview/conversation.ts` |
| 共通ロジック | `src/app/api/companies/[id]/interview/shared.ts` |

## 概要

- ルートは `/companies/[id]/interview`
- 開始前に `業界 / 職種 / 面接方式 / 選考種別 / 面接段階 / 面接官タイプ / 厳しさ` を確認する `setup-first` UI を使う
- `roleTrack` は UI で直接選ばせず、応募職種から内部自動分類する
- 質問生成モデルは `MODEL_INTERVIEW=gpt-mini`（既定 `GPT-5.4 mini`）
- 最終講評は `MODEL_INTERVIEW_FEEDBACK=claude-sonnet`（表示名 `Claude Sonnet 4.6`）
- 面接対策はログイン必須。guest は開始・進行・講評・満足度保存のいずれも利用しない
- 会話は `interview_conversations`、講評履歴は `interview_feedback_histories` に保存する
- 旧版セッションは互換復元せず、v2 開始時にリセット扱いにする
- 最終講評の成功時のみ `6 credits` を予約・確定で消費する
- persistence schema が未適用のときは `INTERVIEW_PERSISTENCE_UNAVAILABLE` で fail-closed する

## v2.1 の進行モデル

- 固定段階 `industry_reason / role_reason / opening / experience / company_understanding / motivation_fit` は正本として使わない
- FastAPI 側で static checklist catalog を正本にし、`interview_plan` は deterministic weighting 後の `priorityTopics / mustCoverTopics / riskTopics / suggestedTimeflow` を返す
- 各ターンでは `turn_state.coverageState` を正本にし、topic ごとに次を保持する
  - `topic`
  - `status`
  - `requiredChecklist`
  - `passedChecklistKeys`
  - `deterministicCoveragePassed`
  - `llmCoverageHint`
  - `deepeningCount`
  - `lastCoveredTurnId`
- `coveredTopics` は `coverageState` から派生させる read model とし、coverage 判定の正本には使わない
- `recentQuestionSummariesV2` は `intentKey / normalizedSummary / topic / followupStyle / turnId` を保持し、同義質問抑止に使う
- `strictnessMode` は covered 判定の閾値だけを変え、`interviewStage` は required checklist 自体を変える
- `formatPhase` は `opening / standard_main / case_main / case_closing / technical_main / life_history_main / feedback`（旧 `discussion_main` / `presentation_main` は読み取り時に `life_history_main` に正規化）
- `case_main` では behavioral fallback を禁止し、`case_closing` でのみ motivation / personality 系 topic を限定解禁する
- `improved_answer` は generic fallback を廃止し、`weakest_turn_id` に紐づく最弱 1 問専用で返す

## setup-first

開始前に次を確定する。

- `selectedIndustry`
- `selectedRole`
- `selectedRoleSource`
- `interviewFormat`
- `selectionType`
- `interviewStage`
- `interviewerType`
- `strictnessMode`

補助情報:

- `roleTrack` は `selectedRole` から内部自動分類する
- `company.industry` が曖昧な場合だけ業界選択を必須にする
- 既存の志望動機・応募職種・企業情報から初期値をプリセットする

## 面接方式

同一機能内で次の 4 方式を扱う（方式定義・論点の一次参照: [Notion 面接関連](https://www.notion.so/1d44da9ec68881f0b665c3fe5b391510?v=1d44da9ec688813096b4000ce931e6f2&source=copy_link)。ローカル補助: `references/interview` があればプロンプト整合の参照に使う）。

- `standard_behavioral`
- `case`
- `technical`
- `life_history`

方式ごとの原則:

- `standard_behavioral`: 1 問 1 論点で STAR 互換の深掘りを行う
- `case`: 構造化、仮説、打ち手の優先順位を確認する
- `technical`: 専門知識、設計判断、前提・トレードオフ・再現性を確認する
- `life_history`: 転機、価値観、行動の一貫性と自己理解の深さを確認する（旧 `discussion` / `presentation` の DB 値は `life_history` に正規化）

FastAPI の質問・計画・講評は `string_chunk` を逐次 SSE で返し、Next BFF は中継のみ（バッファで一括しない）。

## 会社別上乗せ

質問生成では次を材料にする。

1. 保存済み志望動機
2. ガクチカ要約
3. 関連 ES
4. `academic_summary` / `research_summary`
5. `src/lib/interview/company-seeds.ts` の業界・企業 seed

seed は repo 内の設定資産として保持し、実行時に毎回 live search はしない。

## 永続化

### `interview_conversations`

- `companyId`
- `userId` / `guestId`
- `messages`
- `status`
- `selectedIndustry`
- `selectedRole`
- `selectedRoleSource`
- `roleTrack`
- `interviewFormat`
- `selectionType`
- `interviewStage`
- `interviewerType`
- `strictnessMode`
- `interviewPlanJson`
- `turnStateJson`
- `turnMetaJson`
- `activeFeedbackDraft`
- `currentFeedbackId`
- `updatedAt`

旧 `currentStage / stageQuestionCounts / completedStages / lastQuestionFocus` は互換読み取りの補助として残るが、v2.1 の正本は `turnStateJson` と `turnMetaJson`。

### `interview_turn_events`

- `turnId`
- `conversationId`
- `companyId`
- `userId` / `guestId`
- `question`
- `answer`
- `topic`
- `questionType`
- `turnAction`
- `followupStyle`
- `intentKey`
- `coverageChecklistSnapshot`
- `deterministicCoveragePassed`
- `llmCoverageHint`
- `formatPhase`
- `formatGuardApplied`
- `createdAt`

各ターンの canonical log。最弱設問の復元、同義質問分析、analytics の正本に使う。

### `interview_feedback_histories`

- `conversationId`
- `companyId`
- `userId` / `guestId`
- `overallComment`
- `scores`
- `strengths`
- `improvements`
- `consistencyRisks`
- `weakestQuestionType`
- `weakestTurnId`
- `weakestQuestionSnapshot`
- `weakestAnswerSnapshot`
- `improvedAnswer`
- `preparationPoints`
- `premiseConsistency`
- `satisfactionScore`
- `sourceQuestionCount`
- `sourceMessagesSnapshot`

## Next API

- `GET /api/companies/[id]/interview`
  - hydrate 用。`setup`, `materials`, `conversation`, `feedbackHistories`, `creditCost` を返す
- `POST /api/companies/[id]/interview/start`
  - v2 setup を保存し、`plan -> opening question` を SSE で返す
- `POST /api/companies/[id]/interview/stream`
  - 直近回答を追加し、次質問を SSE で返す
- `POST /api/companies/[id]/interview/feedback`
  - 最終講評を SSE 返却し、成功時のみ 6 credits を確定する
- `POST /api/companies/[id]/interview/continue`
  - 直近講評の `next_preparation` と現 plan を踏まえて追加深掘りを再開する
- `POST /api/companies/[id]/interview/reset`
  - active session を初期化し、講評履歴は残す
- `POST /api/companies/[id]/interview/feedback/satisfaction`
  - 直近講評履歴に `1..5` の満足度を保存する

## FastAPI

- `POST /api/interview/start`
- `POST /api/interview/turn`
- `POST /api/interview/continue`
- `POST /api/interview/feedback`

すべて `text/event-stream` を返す。

## SSE 契約

- `progress`
  - `label`, `step`, `progress`
- `string_chunk`
  - `question`
  - `overall_comment`
  - `improved_answer`
- `field_complete`
  - `focus`
  - `question_stage`
  - `stage_status`
  - `scores`
  - `premise_consistency`
  - `weakest_question_type`
- `array_item_complete`
  - `strengths.{n}`
  - `improvements.{n}`
  - `next_preparation.{n}`
  - `consistency_risks.{n}`
- `complete`
  - `messages`
  - `questionCount`
  - `stageStatus`
  - `questionStage`
  - `focus`
  - `feedback`
  - `questionFlowCompleted`
  - `creditCost`
  - `turnState`
  - `turnMeta`
  - `plan`
  - `feedbackHistories`
- `error`
  - `message`

## 最終講評

7 軸で講評する。

- `company_fit`
- `role_fit`
- `specificity`
- `logic`
- `persuasiveness`
- `consistency`
- `credibility`

あわせて次を返す。

- `strengths`
- `improvements`
- `consistency_risks`
- `weakest_question_type`
- `weakest_turn_id`
- `weakest_question_snapshot`
- `weakest_answer_snapshot`
- `improved_answer`
- `next_preparation`
- `premise_consistency`
- `satisfaction_score`

## UI / UX

- 開始前は setup card を表示し、設定確認後に開始できる
- 会話上部に `現在の主論点 / covered までの残り checklist / follow-up 意図 / format phase` を表示する
- 右カラムに `進捗 / 面接設定 / 面接計画 / 論点詳細 / 参考にする材料 / 過去の最終講評` を表示する
- 進捗は固定段階 tracker ではなく `現在の論点 / 確認済み / 残り論点 / 未充足 checklist` で表示する
- 過去講評は compact 表示にし、クリックでモーダル全文表示する
- 最終講評後は `最弱設問 / そのときの回答 / improved_answer / 次に準備すべき論点 / 1問満足度` を表示する
- 最終講評後は `面接対策を続ける` と `会話をやり直す` を表示する

## analytics

- analytics の正本は server-side 保存
- `interview_turn_events` と `interview_feedback_histories` を使って次を集計する
  - 完走率
  - 再質問率
  - `followupStyle` 分布
  - `satisfactionScore`
- client の trackEvent は補助用途に留める

## 課金

- 質問フロー中は課金しない
- `POST /feedback` の成功時のみ `6 credits` を予約・確定する
- 失敗・中断時は `cancelReservation` で返金する
