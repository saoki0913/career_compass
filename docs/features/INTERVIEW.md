# 面接対策（企業特化模擬面接）

参照実装: `backend/app/routers/interview.py`, `src/app/api/companies/[id]/interview/route.ts`, `src/app/api/companies/[id]/interview/start/route.ts`, `src/app/api/companies/[id]/interview/stream/route.ts`, `src/app/api/companies/[id]/interview/feedback/route.ts`, `src/app/(product)/companies/[id]/interview/page.tsx`

## 概要

- ルートは `/companies/[id]/interview`
- ログイン必須。guest ではログイン誘導カードを表示する
- モデルは `MODEL_INTERVIEW=gpt-fast`（既定 `GPT-5.4 mini`）
- 企業情報、志望動機、ガクチカ、関連 ES を材料に、固定 5 問の模擬面接を行う
- セッションの永続化は DB 追加なしで `sessionStorage` を使う
- クレジットは **最終講評 complete 成功時のみ** `5 credits` 消費する

## 画面構成

- `DashboardHeader` + `max-w-7xl` の product UI
- 上段: タイトル + `最終講評を作成` action bar
- 左カラム: 会話、開始前説明、入力欄
- 右カラム上部: 固定 5 段階 tracker
- 右カラム中段: `参考にする材料`

開始前、進行中、5問完了後、講評生成後は同一レイアウト上で切り替える。PC は会話欄と右カラムを独立スクロールし、入力欄は下部固定とする。

## 段階仕様

表示段階は固定で次の 5 つ。

1. `opening` - 導入
2. `company_understanding` - 企業理解
3. `experience` - 経験・ガクチカ
4. `motivation_fit` - 志望動機・適合
5. `feedback` - 最終講評

質問数は固定 5 問。

1. 1問目: 導入
2. 2問目: 企業理解
3. 3問目: 経験・ガクチカ
4. 4問目: 志望動機・適合
5. 5問目: 志望動機・適合の追加深掘り

5問目の回答送信後、tracker を `feedback` に進めるが、最終講評は自動では返さない。ユーザーが上部 action bar の `最終講評を作成` を押したときにだけ生成する。

## API / SSE 契約

### Next API

- `GET /api/companies/[id]/interview`
  - hydrate 用。company, materials, creditCost, 初期 `stageStatus` を返す
- `POST /api/companies/[id]/interview/start`
  - 初回質問を SSE で返す
- `POST /api/companies/[id]/interview/stream`
  - 回答送信後の次質問を SSE で返す
- `POST /api/companies/[id]/interview/feedback`
  - 5問完了後に最終講評を SSE で返す

### FastAPI

- `POST /api/interview/start`
- `POST /api/interview/turn`
- `POST /api/interview/feedback`

いずれも `text/event-stream` を返す。

### SSE event

- `progress`
  - `label`, `step`, `progress`
- `string_chunk`
  - 質問文は `path="question"`
  - 最終講評の総評文は `path="overall_comment"`
- `complete`
  - `messages`, `questionCount`, `stageStatus`, `questionStage`, `focus`, `feedback`, `isCompleted`, `questionFlowCompleted`, `creditCost`
- `error`
  - `message`

`complete.feedback` は質問ターンでは `null`、最終講評ターンでは 4 軸評価 shape を返す。5問目完了時は `questionFlowCompleted=true` だけを返し、講評はまだ生成しない。

## 参考材料

- `志望動機`
- `ガクチカ`
- `関連ES`

右カラムの材料 card は、空状態でも card 自体は残し、企業情報中心で質問することを短文で伝える。

## Skeleton 方針

- route `loading.tsx` は `DashboardHeader` を含めた interview 専用 skeleton を返す
- `面接対策を始める` 押下後の in-page loading でも、同じ interview skeleton を使う
- spinner 文言だけの loading は使わない

## ナビ導線

- `DashboardHeader`
- `BottomTabBar`

両方に `面接対策` trigger を置き、押下時は `CompanySelectModal mode="interview"` を開く。
企業選択後に `/companies/[id]/interview` へ遷移する。standalone `/interview` route は作らない。

## UI Review

- preflight route: `/companies/ui-review-company/interview`
- review command: `npm run test:ui:review -- /companies/ui-review-company/interview --auth=mock`
- 会話本体の screenshot review は `guest` ではなく `mock` を使う
