# 面接対策（企業特化模擬面接）

参照実装: `backend/app/routers/interview.py`, `src/app/api/companies/[id]/interview/route.ts`, `src/app/api/companies/[id]/interview/start/route.ts`, `src/app/api/companies/[id]/interview/stream/route.ts`, `src/app/api/companies/[id]/interview/feedback/route.ts`, `src/app/api/companies/[id]/interview/continue/route.ts`, `src/app/api/companies/[id]/interview/reset/route.ts`, `src/app/api/companies/[id]/interview/shared.ts`, `src/lib/interview/company-seeds.ts`, `src/lib/interview/session.ts`, `src/app/(product)/companies/[id]/interview/page.tsx`

## 概要

- ルートは `/companies/[id]/interview`
- 画面は `setup-first`。開始前に `業界` と `職種` を確定する
- 質問生成モデルは `MODEL_INTERVIEW=gpt-fast`（既定 `GPT-5.4 mini`）
- 最終講評は `MODEL_INTERVIEW_FEEDBACK=claude-sonnet`（表示名 `Claude Sonnet 4.6`）
- 面接セッションは `sessionStorage` ではなく `interview_conversations` に保存する
- 1社につき `1つの進行中セッション` を持ち、最終講評は `interview_feedback_histories` に履歴保存する
- 会社別上乗せは `採用サイト seed / 会社メモ / 保存済み志望動機 / ガクチカ / ES` を束ねて質問に反映する
- 最終講評の成功時のみ `6 credits` を予約・確定で消費する
- persistence schema が未適用のときは silent fallback せず、全 interview API が `INTERVIEW_PERSISTENCE_UNAVAILABLE` で fail-closed する

## 面接フロー

表示段階は次の 7 つ。

1. `industry_reason` - 業界志望理由
2. `role_reason` - 職種志望理由
3. `opening` - 導入・人物把握
4. `experience` - 経験・ガクチカ
5. `company_understanding` - 企業理解
6. `motivation_fit` - 志望動機・適合
7. `feedback` - 最終講評

質問数は **10〜15問**。

- 10問到達前は原則継続する
- 10問以降は段階別 coverage と未解消 gap が十分なら終了できる
- 15問で打ち切る

段階切替時は必ず `次は○○について伺います。` の transition line を付ける。

## setup-first

面接開始前に次を確定する。

- `selectedIndustry`
- `selectedRole`
- `selectedRoleSource`

業界候補と職種候補は `es-role-options` と同じロジックを使う。会社 `industry` が曖昧な場合だけ業界選択を必須にする。

開始後の最初の 2 問は必ず次。

- `その業界を志望する理由`
- `その職種を志望する理由`

この 2 問は短く確認し、その後の深掘りや最終講評で `前提一致度` を評価する。

## 会社別上乗せ

`src/lib/interview/company-seeds.ts` に `23業界 × 代表企業3社` の seed profile を保持する。

- `commonTopics`
- `watchouts`
- `representativeCompanies[].companyTopics`
- `representativeCompanies[].roleTopics`
- `representativeCompanies[].cultureTopics`

質問生成では次の順で優先する。

1. 保存済み志望動機 / ガクチカ / 関連ES / これまでの会話
2. 会社別 seed 論点
3. 業界共通 seed 論点

seed は repo 内の設定資産として保持し、実行時に毎回 69社を live search しない。

## 永続化

`schema.ts` と app DB の正本は `drizzle_pg/` で管理する。面接セッション追加のような app table 変更時は、`schema.ts` 変更だけでなく Drizzle migration も必須。

- app DB への反映: `npm run db:migrate:as-app` または `make db-migrate`
- local Supabase reset / mirror 反映: `supabase db push` または `supabase db reset`
- 本番 drift check: `npm run check:prod-db-drift`

### `interview_conversations`

- `companyId`
- `userId` / `guestId`
- `messages`
- `status`
- `currentStage`
- `questionCount`
- `stageQuestionCounts`
- `completedStages`
- `lastQuestionFocus`
- `questionFlowCompleted`
- `selectedIndustry`
- `selectedRole`
- `selectedRoleSource`
- `activeFeedbackDraft`
- `currentFeedbackId`
- `updatedAt`

### `interview_feedback_histories`

- `conversationId`
- `companyId`
- `userId` / `guestId`
- `overallComment`
- `scores`
- `strengths`
- `improvements`
- `improvedAnswer`
- `preparationPoints`
- `premiseConsistency`
- `sourceQuestionCount`
- `sourceMessagesSnapshot`

## Next API

- `GET /api/companies/[id]/interview`
  - hydrate 用。`setup`, `materials`, `conversation`, `feedbackHistories`, `creditCost` を返す
- `POST /api/companies/[id]/interview/start`
  - setup を保存し、active session があれば復元、なければ初回質問を SSE で返す
- `POST /api/companies/[id]/interview/stream`
  - サーバ保存済み会話を正として回答を append し、次質問を SSE で返す
- `POST /api/companies/[id]/interview/feedback`
  - Claude Sonnet 4.6 で最終講評を SSE 返却し、成功時のみ 6 credits を確定する
- `POST /api/companies/[id]/interview/continue`
  - 直近講評の `preparation_points` を踏まえて追加深掘りの質問を返す
- `POST /api/companies/[id]/interview/reset`
  - active session のみ初期化し、講評履歴は残す

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
- `array_item_complete`
  - `strengths.{n}`
  - `improvements.{n}`
  - `preparation_points.{n}`
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
  - `feedbackHistories`
- `error`
  - `message`

## UI / UX

- 開始前は setup card を表示し、業界/職種確定後に開始できる
- 戻る / 再読込 / 別タブ後でも active session を復元する
- 右カラムに `参考にする材料` と `過去の最終講評` を表示する
- 過去講評は compact 表示にし、クリックでモーダル全文表示する
- 最終講評後は `面接対策を続ける` と `会話をやり直す` を出す
- continue 時は前回講評を履歴として残しつつ、深掘り質問を再開する

## 課金

- 質問フロー中は課金しない
- `POST /feedback` の成功時のみ `6 credits` を予約・確定する
- 失敗・中断時は `cancelReservation` で返金する

## 代表企業 seed

初期 seed は次の 23 業界 × 3 社。

- 商社: 三井物産 / 三菱商事 / 伊藤忠商事
- 銀行: 三菱UFJ銀行 / 三井住友銀行 / みずほ銀行
- 信託銀行: 三井住友信託銀行 / 三菱UFJ信託銀行 / みずほ信託銀行
- 証券: 野村證券 / 大和証券 / SMBC日興証券
- 保険: 東京海上日動 / 三井住友海上 / 住友生命
- アセットマネジメント: 野村アセットマネジメント / アセットマネジメントOne / 三井住友DSアセットマネジメント
- カード・リース・ノンバンク: オリックス / 三菱HCキャピタル / オリコ
- 政府系・系統金融: DBJ / 日本政策金融公庫 / 農林中央金庫
- コンサルティング: アクセンチュア / デロイト トーマツ コンサルティング / NRI
- IT・通信: NTTデータ / KDDI / NTTドコモ
- メーカー（電機・機械）: 日立製作所 / パナソニックグループ / キーエンス
- メーカー（食品・日用品）: 味の素 / サントリー / 花王
- 広告・マスコミ: 電通 / 博報堂プロダクツ / 講談社
- 不動産・建設: 三井不動産 / 三菱地所 / 大和ハウス工業
- 小売・流通: イオンリテール / ローソン / ニトリ
- サービス・インフラ: JR東日本 / ANA / 東京ガス
- 医療・福祉: SOMPOケア / ニチイ学館 / LITALICO
- 教育: ベネッセ / 学研 / Z会
- 印刷・包装: TOPPAN / DNP / レンゴー
- アパレル・繊維: ファーストリテイリング / オンワード樫山 / 東レ
- 設備工事・エンジニアリング: 日揮HD / 千代田化工建設 / NTTファシリティーズ
- 公務員・団体: JICA / JETRO / JNTO
- その他: リクルート / パーソルキャリア / ディップ
