# ガクチカ深掘り機能（実装フロー & プロンプト仕様）

本書は現行実装に基づく **ガクチカ深掘り機能** のフローとプロンプト仕様をまとめたものです。
参照実装: `backend/app/routers/gakuchika.py`, `backend/app/utils/llm.py`, `src/app/api/gakuchika/[id]/conversation/route.ts`

---

## 1. 概要

- **目的**: 会話形式でガクチカを深掘りし、ES/面接で使える具体性を引き出す
- **質問数目安**: 8問（内容に応じて早期終了/延長あり）
- **クレジット**: 5問回答ごとに1クレジット（5問未満で終了なら消費なし）
- **LLM**: Claude Sonnet（feature=`gakuchika`）

---

## 2. エンドツーエンドの流れ

1. **フロント → Next.js API**
   - `GET /api/gakuchika/:id/conversation`（履歴取得 + 次質問）
   - `POST /api/gakuchika/:id/conversation`（回答送信）

2. **Next.js API → FastAPI**
   - `POST /api/gakuchika/next-question`
   - 会話履歴と進捗を渡して次質問を生成

3. **会話保存**
   - `gakuchikaConversations` にメッセージと質問数を保存

4. **終了判定**
   - 目安8問で `suggestedEnd` を true
   - 8問到達時は `completed` 扱い

---

## 3. Next.js API（会話管理）

**ファイル:** `src/app/api/gakuchika/[id]/conversation/route.ts`

### GET の動き
- 会話履歴が無い場合、FastAPIに初回質問を依頼
- 会話がある場合は、次質問を FastAPI に問い合わせ
- 返却には `nextQuestion`, `questionCount`, `suggestedEnd` などを含む

### POST の動き
- 直近の質問 + ユーザー回答を会話履歴に追加
- `questionCount` をインクリメント
- 5問ごとにクレジット消費（ログインユーザーのみ）
- 8問到達で summary 用に簡易要約を保存

---

## 4. FastAPI エンドポイント

**ファイル:** `backend/app/routers/gakuchika.py`

### 4.1 次質問生成
**`POST /api/gakuchika/next-question`**

入力:
```json
{
  "gakuchika_title": "サークル活動",
  "gakuchika_content": "任意本文",
  "char_limit_type": "300",
  "conversation_history": [{"role": "assistant", "content": "..."}],
  "question_count": 3
}
```

出力:
```json
{
  "question": "次の深掘り質問",
  "reasoning": "理由",
  "should_continue": true,
  "suggested_end": false
}
```

### 4.2 サマリー生成
**`POST /api/gakuchika/summary`**

出力:
```json
{
  "summary": "200-300字の要約",
  "key_points": ["..."],
  "numbers": ["..."],
  "strengths": ["..."]
}
```

---

## 5. プロンプト仕様（次質問生成）

- 直前の回答を踏まえた深掘り
- 具体性 / 数字 / 感情 / 学び / 他者評価を引き出す
- JSONで返す: `question`, `reasoning`, `should_continue`, `suggested_end`

---

## 6. プロンプト仕様（サマリー生成）

- 会話履歴から以下を抽出
  - `summary`（200-300字）
  - `key_points`（3-5個）
  - `numbers`（数字/成果）
  - `strengths`（2-3個）

---

## 7. 代表ログ

- `[LLM] Calling claude-sonnet (...) for feature: gakuchika`
- `[Gakuchika] LLM error: ...`

---

## 8. 関連ファイル

- `backend/app/routers/gakuchika.py`
- `backend/app/utils/llm.py`
- `src/app/api/gakuchika/[id]/conversation/route.ts`
- `src/app/api/gakuchika/route.ts`
