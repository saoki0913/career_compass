# ガクチカ深掘り

最終更新: 2026-03-03

## 概要

ガクチカ深掘りは、登録済みのガクチカ素材を会話形式で深掘りし、STAR
（Situation / Task / Action / Result）の4要素を補強して、ES作成や面接準備に使える状態まで整える機能です。

現行実装では、質問生成の主目的を次の3つに絞っています。

- 次の深掘り質問を自然な日本語で返す
- STARスコアを更新する
- 今どの要素を補強したいかを `targetElement` として返す
- 質問品質は参考資料由来のルーブリックで制御し、真因・判断理由・役割範囲・再現可能な学びを優先する

企業紐づけ UI は現在の深掘り画面では使っていません。DB スキーマ上の `linked_company_ids` は残っていますが、会話生成・会話画面・会話 API では利用していません。

## ユーザー体験

### 1. 開始前

- ガクチカ詳細ページで、素材タイトルと本文を確認できる
- 会話セッションが存在しない場合は「深掘りを始める」導線を表示する
- STAR フレームワークの説明を折りたたみで確認できる

### 2. 会話中

- 開始時は assistant の初回質問を1つ生成して会話を始める
- ユーザー回答の送信後、ユーザー吹き出しは通常の濃さで即時表示される
- `送信中...` のような文言はユーザー吹き出し内に表示しない
- assistant 側では次の順番で一時吹き出しを出す
  1. `質問の意図を整理中`
  2. `次の質問を生成中...`
  3. 次の質問本文のストリーミング表示
- ストリーミング開始後は、その質問表示を最後の UI ステップとし、途中で別の補助 UI を差し込まない

### 3. 回答ヒント

- 回答欄の上には `targetElement` に応じた短いヒントを表示する
- ヒントは「この質問は課題に関するものです」のような抽象ラベルではなく、「何を答えるとよいか」がわかる 1 文で出す
- `targetElement` が取得できない場合はヒントを出さない
- 会話再読込時は保存済み `starScores` の最弱要素から `targetElement` を再計算して表示する

### 4. 完了後

- STAR の4要素がしきい値を満たすと完了扱いになる
- 完了時は会話の末尾に短い締めコメントを出し、その下に STAR 構造化テキスト、強み、学び、数字などのサマリーを表示する
- 完了画面の主要導線は 1 つだけで、`この経験を使ってESを作成する` を表示する
- 追加で `深掘りを続ける` を押すと、新規セッションではなく同じセッションを `completed` から `in_progress` に戻して続きから再開する

## セッション仕様

### セッション一覧

- 1つのガクチカ素材に対して複数セッションを保持できる
- セッション一覧には `status`, `starScores`, `questionCount`, `createdAt` を表示する
- 一覧カードの本文は raw JSON を表示せず、構造化サマリーから生成した `summaryPreview` を表示する
- 過去セッションを選ぶと、その時点の会話ログを再表示できる

### 新規開始

- `POST /api/gakuchika/[id]/conversation/new`
- Next.js API が FastAPI `POST /api/gakuchika/next-question` を呼び、初回質問を1つ生成してセッションを作成する

### 通常の回答送信

- `POST /api/gakuchika/[id]/conversation/stream`
- Next.js API が FastAPI `POST /api/gakuchika/next-question/stream` を consume-and-re-emit で中継する
- SSE の `progress` -> `string_chunk` -> `complete` を UI に反映する

### 完了後の再開

- `POST /api/gakuchika/[id]/conversation/resume`
- completed セッションに対して次の assistant 質問を1つ追加し、同じセッションを `in_progress` に戻す
- この再開フローは現在 FastAPI の非ストリーミング `POST /api/gakuchika/next-question` を使用している

## 処理の流れ

### 1. 初回開始フロー

1. ユーザーが「深掘りを始める」を押す
2. フロントが `POST /api/gakuchika/[id]/conversation/new` を呼ぶ
3. Next.js API が FastAPI `POST /api/gakuchika/next-question` を呼ぶ
4. FastAPI が初回質問を1つ返す
5. Next.js API が `gakuchikaConversations` に assistant の初回質問を保存する
6. フロントが会話データを再取得し、チャット画面を表示する

### 2. 回答送信フロー

1. ユーザーが回答を送信する
2. フロントはユーザー吹き出しを optimistic に即時追加する
3. フロントが `POST /api/gakuchika/[id]/conversation/stream` を呼ぶ
4. Next.js API が会話履歴に user message を追加し、FastAPI `POST /api/gakuchika/next-question/stream` を呼ぶ
5. FastAPI が以下の SSE を順に返す
   - `progress: analysis`
   - `progress: question`
   - `string_chunk` 群
   - `complete`
6. フロントは assistant 側で次の順番に UI を切り替える
   - `質問の意図を整理中`
   - `次の質問を生成中...`
   - 次質問のストリーミング表示
7. `complete` 到着後、Next.js API が messages / starScores / targetElement / status を確定保存する
8. フロントが確定済みの会話状態で再描画する

### 3. 完了フロー

1. `complete` 内の `star_scores` から完了判定を行う
2. 完了なら会話セッションを `completed` に更新する
3. Next.js API が FastAPI `POST /api/gakuchika/structured-summary` を呼び、構造化サマリーを生成する
4. サマリーを `gakuchika_contents.summary` に保存する
5. フロントは完了画面に切り替え、STAR 構造化テキストや強み・学びを表示する

### 4. 完了後の再開フロー

1. ユーザーが `深掘りを続ける` を押す
2. フロントが `POST /api/gakuchika/[id]/conversation/resume` を呼ぶ
3. Next.js API が completed セッションを取得する
4. Next.js API が既存の会話履歴をそのまま FastAPI `POST /api/gakuchika/next-question` に渡す
5. FastAPI が次の assistant 質問を1つ返す
6. Next.js API がその質問を messages の末尾に追加し、セッション状態を `in_progress` に戻す
7. フロントは同じセッションの続きとして会話画面を再表示する

### 5. 失敗時の扱い

1. 通常送信中に FastAPI SSE から `error` が返ると、フロントは optimistic user message を巻き戻す
2. 入力欄には直前の回答を戻す
3. クレジットは消費しない
4. 再開や初回開始で non-stream `next-question` が失敗すると、現状は 503 をそのまま返す
5. このため、通常送信よりも `new` / `resume` の方が壊れやすい

## 現行の AI 出力契約

ガクチカ深掘りの次質問生成では、LLM の JSON 出力を最小構成にしています。

```json
{
  "star_scores": {
    "situation": 45,
    "task": 50,
    "action": 65,
    "result": 35
  },
  "question": "次の深掘り質問",
  "target_element": "result"
}
```

Next.js 側では FastAPI レスポンスを次の形で扱います。

```json
{
  "question": "次の深掘り質問",
  "star_evaluation": {
    "scores": {
      "situation": 45,
      "task": 50,
      "action": 65,
      "result": 35
    },
    "weakest_element": "result",
    "is_complete": false
  },
  "target_element": "result"
}
```


## STAR スコアと完了判定

- STAR スコアは `situation`, `task`, `action`, `result` の4要素
- しきい値は各要素 70 点以上
- 完了判定は FastAPI / Next.js の両方で `star_scores` ベースに行う
- `targetElement` が欠けた場合は、最弱の STAR 要素から補完する

## サマリー生成

完了時には、会話ログをもとに構造化サマリーを生成して `gakuchika_contents.summary` に保存します。

主な出力項目:

- `situation_text`
- `task_text`
- `action_text`
- `result_text`
- `strengths`
- `learnings`
- `numbers`
- `interviewer_hooks`
- `reusable_principles`

現在の完了画面はこの構造化サマリーを優先表示し、旧式の簡易サマリーは後方互換用にのみ残しています。
一覧画面では同じ共通 parser で `summaryPreview` を生成し、`action_text + result_text` を優先した自然文に整形して表示します。

## クレジット

- ログインユーザーのみ 5 問回答ごとに 1 クレジット消費
- FastAPI 成功後にのみ消費する
- 失敗時は消費しない
- ゲストユーザーはガクチカ深掘りでクレジット消費しない

## 既知の実装上の注意

### 1. 通常送信と再開で呼ぶ FastAPI 経路が違う

- 通常送信は `next-question/stream`
- 新規開始と完了後再開は `next-question`

この差により、通常送信は field streaming の部分復旧が効く一方で、新規開始と再開は JSON 解析失敗時に 503 になりやすいです。

### 2. 503 Service Unavailable の主な意味

FastAPI `POST /api/gakuchika/next-question` の 503 は、主に次のいずれかです。

- LLM 呼び出し失敗
- LLM 応答の JSON 解析失敗
- 解析はできたが `question` が欠落

### 3. 観測ログ

`backend/app/utils/llm.py` では、現在次のログを残します。

- Claude field streaming 完了時の `stop_reason`
- `max_tokens` 到達警告
- partial fallback 時の必須フィールド欠落

これにより、切り詰め・欠落・プロバイダエラーを判別しやすくしています。

## 主な関連ファイル

- `src/app/gakuchika/[id]/page.tsx`
- `src/components/gakuchika/CompletionSummary.tsx`
- `src/app/api/gakuchika/[id]/conversation/route.ts`
- `src/app/api/gakuchika/[id]/conversation/new/route.ts`
- `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- `src/app/api/gakuchika/[id]/conversation/resume/route.ts`
- `backend/app/routers/gakuchika.py`
- `backend/app/prompts/gakuchika_prompts.py`
- `backend/app/utils/llm.py`
