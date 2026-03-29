# ガクチカ作成

最終更新: 2026-03-25

## 概要

ガクチカ作成は、登録済みのガクチカ素材を会話形式で整理し、ES作成や面接準備に使える文章へ整える機能です。会話の LLM 既定は `MODEL_GAKUCHIKA=gpt-fast`（GPT-5.4 mini）。ES 下書き生成は `MODEL_GAKUCHIKA_DRAFT=claude-sonnet`（Claude Sonnet 4.6）既定。

現行実装では、質問生成の主目的を次の3つに絞っています。

- 次の質問を自然な日本語で返す
- STARスコアを更新する
- 今どの要素を補強したいかを `targetElement` として返す
- 質問品質は `backend/app/prompts/gakuchika_prompts.py` のルーブリックで制御する（面接で伝わる要点を要約して蒸留したもの。リポジトリ外の参照メモは開発時の材料であり、実装の正はプロンプト定義）
- 真因・課題選定の筋・役割範囲・等身大・再現可能な学びを優先し、未言及の別エピソードへ誘導しない

### 参照資料とプロンプト保守

- 開発者用の `references/gakuchika_QA_guide.md` など **リポジトリ外の Markdown はランタイムに読み込まない**。FastAPI は [`backend/app/prompts/gakuchika_prompts.py`](../../backend/app/prompts/gakuchika_prompts.py) の固定文字列だけを使う。
- 外部資料の意図は **プロンプト内の箇条書きに蒸留して** 保守する（長文の転載はしない）。資料を更新・差し替えしたら、次を手で確認する:
  - `QUESTION_QUALITY_PRINCIPLES` / `REFERENCE_GUIDE_RUBRIC` に求める観点が足りているか
  - [`backend/tests/gakuchika/test_gakuchika_next_question.py`](../../backend/tests/gakuchika/test_gakuchika_next_question.py) のプロンプト含有アサーションを更新したか
- 例: 想定 Q&A 集の **目標・評価軸（定性/定量）**（ガイド Q21–23 付近）や **共通ルールと現場独自の切り分け**（Q30 付近）は、プロンプトに「会話に既に触れがあるときだけ 1 点で確認」として反映する（別エピソードへの誘導には使わない）

企業紐づけ UI は現在の作成画面では使っていません。DB スキーマ上の `linked_company_ids` は残っていますが、会話生成・会話画面・会話 API では利用していません。

## ユーザー体験

### 1. 開始前

- ガクチカ詳細ページで、素材タイトルと本文を確認できる
- 会話セッションが存在しない場合は「作成を始める」導線を表示する
- STAR フレームワークは内部評価として扱い、ユーザーには作成のための補助情報として見せる

### 2. 会話中

- 画面の外枠は ES 一覧・企業一覧と同様に `max-w-7xl`。チャット吹き出し列は読みやすさのため内側で幅を抑え、完了後のサマリーは同じ外枠内で広く表示する
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
- 上段には `志望動機作成` と同系統の `ガクチカESを作成` action bar を表示する
- ES 作成は action bar から行い、文字数選択 UI は出さない（固定 400 字運用）
- 追加で `作成を続ける` を押すと、新規セッションではなく同じセッションを `completed` から `in_progress` に戻して続きから再開する

## セッション仕様

### セッション一覧

- 1つのガクチカ素材に対して複数セッションを保持できる
- セッション一覧には `status`, `starScores`, `questionCount`, `createdAt` を表示する
- 一覧カードの本文は raw JSON を表示せず、構造化サマリーから生成した `summaryPreview` を表示する
- 過去セッションを選ぶと、その時点の会話ログを再表示できる

### 新規開始

- `POST /api/gakuchika/[id]/conversation/new`
- Next.js API が [`src/app/api/gakuchika/shared.ts`](../../src/app/api/gakuchika/shared.ts) 経由で FastAPI `POST /api/gakuchika/next-question/stream` を呼び、**SSE をサーバ内で完読**して `complete` から初回質問を取得し、セッションを作成する（クライアントには従来どおり JSON のみ返す）

### 通常の回答送信

- `POST /api/gakuchika/[id]/conversation/stream`
- Next.js API が FastAPI `POST /api/gakuchika/next-question/stream` を consume-and-re-emit で中継する
- SSE の `progress` -> `string_chunk` -> `complete` を UI に反映する

### 完了後の再開

- `POST /api/gakuchika/[id]/conversation/resume`
- completed セッションに対して次の assistant 質問を1つ追加し、同じセッションを `in_progress` に戻す
- Next.js は `shared.ts` 経由で FastAPI `POST /api/gakuchika/next-question/stream` を **完読**し、次の質問を取得する（非ストリーミングの `next-question` は使わない）

## 処理の流れ

### 1. 初回開始フロー

1. ユーザーが「作成を始める」を押す
2. フロントが `POST /api/gakuchika/[id]/conversation/new` を呼ぶ
3. Next.js API が FastAPI `POST /api/gakuchika/next-question/stream` を呼び、SSE の `complete` まで読み取る
4. FastAPI が初回質問を `complete` ペイロードで返す
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

1. ユーザーが `作成を続ける` を押す
2. フロントが `POST /api/gakuchika/[id]/conversation/resume` を呼ぶ
3. Next.js API が completed セッションを取得する
4. Next.js API が既存の会話履歴をそのまま FastAPI `POST /api/gakuchika/next-question/stream` に渡し、`complete` まで読み取る
5. FastAPI が次の assistant 質問を `complete` で返す
6. Next.js API がその質問を messages の末尾に追加し、セッション状態を `in_progress` に戻す
7. フロントは同じセッションの続きとして会話画面を再表示する

### 5. 失敗時の扱い

1. 通常送信中に FastAPI SSE から `error` が返ると、フロントは optimistic user message を巻き戻す
2. 入力欄には直前の回答を戻す
3. クレジットは消費しない
4. 再開・初回開始もストリーム経路のため、LLM 失敗・`error` SSE・タイムアウト時は `new` / `resume` が 503 / 502 / 504 相当を返し得る（通常送信と同系統の復旧・部分ストリームの扱いに揃えた）

## 現行の AI 出力契約

ガクチカ作成の次質問生成では、LLM の JSON 出力を最小構成にしています。

```json
{
  "star_scores": {
    "situation": 45,
    "task": 50,
    "action": 65,
    "result": 35
  },
  "question": "次の質問"
}
```

（`target_element` は LLM 出力には含めず、FastAPI 側で `star_scores` から最弱要素を算出して Next に返す。）

Next.js 側では FastAPI レスポンスを次の形で扱います。

```json
{
  "question": "次の質問",
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

完了時には、Next.js の `generateGakuchikaSummary` が FastAPI `POST /api/gakuchika/structured-summary` を呼び、構造化サマリーを `gakuchika_contents.summary` に保存します。`structured-summary` が失敗した場合は、LLM を介さずユーザー回答を連結した簡易フォールバックのみを保存します（旧 FastAPI `POST /api/gakuchika/summary` は廃止）。

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

DB に過去の旧式サマリー JSON が残っていても、`parseGakuchikaSummary` で読み取り表示する後方互換は維持する。
一覧画面では同じ共通 parser で `summaryPreview` を生成し、`action_text + result_text` を優先した自然文に整形して表示します。

## クレジット

- ログインユーザーのみ **5 問回答ごとに 3 クレジット**消費
- ES 下書き生成は **6 クレジット/回**（成功時のみ）
- FastAPI 成功後にのみ消費する
- 失敗時は消費しない
- ゲストユーザーはガクチカ作成でクレジット消費しない

ガクチカ ES 作成の UI は `志望動機` と同じ上部 action bar へ揃えるが、今回の変更ではクレジット金額は変更しない。揃えるのは `成功時のみ消費` というルール。

## 既知の実装上の注意

### 1. FastAPI 呼び出し経路の統一

- Next.js からの次質問生成（新規開始・再開・会話ストリーム）はいずれも **`POST /api/gakuchika/next-question/stream`** を起点にする。
- ブラウザへの配信形だけが異なる: `conversation/stream` は SSE をそのまま中継し、`new` / `resume` は同一 SSE をサーバ内で `iterateGakuchikaFastApiSseEvents` により完読してから JSON で応答する。
- FastAPI の **`POST /api/gakuchika/next-question`（非ストリーミング JSON）** は製品の主経路では使わず、デバッグや外部クライアント向けに残す。

### 2. 503 / 502 / 504 の主な意味（Next が FastAPI を呼ぶ場合）

- LLM 呼び出し失敗や FastAPI からの HTTP エラー
- ストリーム完読前に `error` イベント、または `question` が取れない `complete`
- `FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS`（60 秒）超過による Abort（タイムアウトメッセージ）

### 3. 観測ログ

`backend/app/utils/llm.py` では、現在次のログを残します。

- Claude field streaming 完了時の `stop_reason`
- `max_tokens` 到達警告
- partial fallback 時の必須フィールド欠落

これにより、切り詰め・欠落・プロバイダエラーを判別しやすくしています。

## 主な関連ファイル

- `src/app/(product)/gakuchika/[id]/page.tsx`
- `src/components/gakuchika/CompletionSummary.tsx`
- `src/app/api/gakuchika/shared.ts`（FastAPI stream の完読・SSE 行パース共有）
- `src/app/api/gakuchika/[id]/conversation/route.ts`
- `src/app/api/gakuchika/[id]/conversation/new/route.ts`
- `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- `src/app/api/gakuchika/[id]/conversation/resume/route.ts`
- `backend/app/routers/gakuchika.py`
- `backend/app/prompts/gakuchika_prompts.py`
- `backend/app/utils/llm.py`
- `src/app/api/gakuchika/summary-server.ts`
