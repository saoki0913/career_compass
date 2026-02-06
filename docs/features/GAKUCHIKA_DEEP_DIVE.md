# ガクチカ深掘り機能（実装フロー & プロンプト仕様）

本書は現行実装に基づく **ガクチカ深掘り機能** のフローとプロンプト仕様をまとめたものです。

参照実装:
- `backend/app/routers/gakuchika.py` — FastAPI（質問生成・STAR評価・サマリー）
- `src/app/api/gakuchika/[id]/conversation/route.ts` — Next.js API（会話管理）
- `src/app/gakuchika/page.tsx` — リストページ
- `src/app/gakuchika/[id]/page.tsx` — 会話ページ
- `src/components/gakuchika/` — UIコンポーネント群

---

## 1. 概要

- **目的**: 会話形式でガクチカを深掘りし、ES/面接で使える具体性を引き出す
- **STAR法**: Situation（状況）/ Task（課題）/ Action（行動）/ Result（結果）で構造的に評価
- **質問数目安**: 8問（内容に応じて早期終了/延長あり）
- **会話フェーズ**: opening(1-2問) → exploration(3-5問) → deep_dive(6-8問) → synthesis(9問〜)
- **クレジット**: 5問回答ごとに1クレジット（5問未満で終了なら消費なし）
- **LLM**: Claude Sonnet（feature=`gakuchika`）
- **再実行**: 同じ素材で複数セッション可能（1:Nリレーション）

---

## 2. プラン別制限

| プラン | 素材数上限 |
|--------|-----------|
| Guest  | 2         |
| Free   | 3         |
| Standard | 10      |
| Pro    | 20        |

上限管理: `src/app/api/gakuchika/route.ts` の POST ハンドラで検証。

---

## 3. エンドツーエンドの流れ

1. **フロント → Next.js API**
   - `GET /api/gakuchika/:id/conversation[?sessionId=xxx]`（履歴取得 + 次質問 + セッション一覧）
   - `POST /api/gakuchika/:id/conversation`（回答送信、`sessionId` 指定可）
   - `POST /api/gakuchika/:id/conversation/new`（新セッション作成）

2. **Next.js API → FastAPI**
   - `POST /api/gakuchika/next-question` — STAR評価 + 質問生成を1回の呼び出しで実行
   - `POST /api/gakuchika/evaluate-star` — STAR評価のみ（単独利用向け）
   - `POST /api/gakuchika/summary` — 構造化サマリー生成

3. **会話保存**
   - `gakuchikaConversations` にメッセージ・質問数・STARスコア・ステータスを保存

4. **終了判定**
   - 目安8問で `suggestedEnd` → `completed` 扱い
   - 完了時にFastAPI `/api/gakuchika/summary` を呼び出し構造化サマリーを `gakuchikaContents.summary` に格納
   - FastAPI失敗時は会話履歴の末尾を切り詰めフォールバック

---

## 4. Next.js APIエンドポイント

### 4.1 会話管理

**ファイル:** `src/app/api/gakuchika/[id]/conversation/route.ts`

#### GET
- `?sessionId=xxx` で特定セッションの履歴を取得
- 会話履歴が無い場合、FastAPIに初回質問を依頼
- 返却: `messages`, `nextQuestion`, `questionCount`, `isCompleted`, `starScores`, `sessions[]`

#### POST
- `{ answer, sessionId }` を受信
- 完了済みセッションへの投稿は409で拒否
- 5問ごとにクレジット消費（ログインユーザーのみ）
- 8問到達で完了 → FastAPI summary呼び出し → 構造化サマリー保存
- 返却に `summary` フィールド含む（完了時）

### 4.2 新セッション作成

**ファイル:** `src/app/api/gakuchika/[id]/conversation/new/route.ts`

#### POST
- 新しい `gakuchikaConversations` レコードを作成
- 返却: `sessionId`, `sessions[]`

### 4.3 素材CRUD

**ファイル:** `src/app/api/gakuchika/[id]/route.ts`

- **GET**: 素材詳細取得
- **PUT**: `title`, `content`, `charLimitType`, `linkedCompanyIds` の更新
- **DELETE**: カスケード削除（会話履歴含む）、所有権チェック付き

### 4.4 並び替え

**ファイル:** `src/app/api/gakuchika/reorder/route.ts`

- **PATCH**: `{ orderedIds: string[] }` を受け取り `sortOrder` を更新

### 4.5 サマリー一覧（ES連携用）

**ファイル:** `src/app/api/gakuchika/summaries/route.ts`

- **GET**: 完了済みガクチカの `{ id, title, summary, starScores, linkedCompanyIds }` リストを返却
- ES エディタのガクチカコンテキスト選択で使用

---

## 5. FastAPIエンドポイント

**ファイル:** `backend/app/routers/gakuchika.py`

### 5.1 次質問生成（STAR評価統合）

**`POST /api/gakuchika/next-question`**

統合プロンプトで STAR評価 + 質問生成を1回のLLM呼び出しで実行（レイテンシ50%削減）。

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
  "question_type": "numbers|emotions|reasoning|others_perspective|difficulty|contrast|scene|learning",
  "target_element": "situation|task|action|result",
  "reasoning": "理由",
  "should_continue": true,
  "suggested_end": false,
  "star_scores": { "situation": 75, "task": 50, "action": 30, "result": 10 }
}
```

### 5.2 STAR評価（単独）

**`POST /api/gakuchika/evaluate-star`**

出力:
```json
{
  "situation": 75,
  "task": 50,
  "action": 30,
  "result": 10,
  "missing_aspects": { ... }
}
```

### 5.3 サマリー生成

**`POST /api/gakuchika/summary`**

出力:
```json
{
  "summary": "200-300字の要約",
  "key_points": ["ポイント1", "ポイント2", "ポイント3"],
  "numbers": ["参加者100名", "成果+30%"],
  "strengths": ["リーダーシップ", "問題解決力"]
}
```

---

## 6. 会話フェーズシステム

| フェーズ | 質問番号 | 推奨質問タイプ | 目的 |
|----------|---------|----------------|------|
| opening | 1-2問 | scene, emotions | 状況把握、アイスブレイク |
| exploration | 3-5問 | reasoning, numbers, others_perspective | 各STAR要素の探索 |
| deep_dive | 6-8問 | difficulty, contrast, reasoning | 弱い要素の深掘り |
| synthesis | 9問〜 | learning, scene | 学び・成長の統合 |

フェーズはガイダンスとして機能し、LLMは必要に応じてオーバーライド可能。

---

## 7. 質問多様性の強制

8つの質問タイプを分類:
- `numbers` — 数字・定量データ
- `emotions` — 感情・モチベーション
- `reasoning` — 理由・意思決定プロセス
- `others_perspective` — 他者の視点・評価
- `difficulty` — 困難・壁
- `contrast` — 比較・対比
- `scene` — 具体的場面描写
- `learning` — 学び・気づき

直前の質問タイプを追跡し、連続使用を禁止。履歴は `starScores` JSONフィールドに拡張格納:
```json
{
  "situation": 75, "task": 50, "action": 30, "result": 10,
  "question_types": ["scene", "reasoning", "emotions"],
  "current_phase": "exploration"
}
```

---

## 8. プロンプト仕様

### ペルソナ
「10年以上の経験を持つ就活アドバイザー」として対話。面接官ではなく「経験の価値を引き出すアドバイザー」のキャラクター設定。

### 禁止表現（10項目）
- 「素晴らしいですね」等の安易な褒め言葉
- 「面接官の立場から」等の面接を意識させる表現
- 複数の質問を一度に投げかける
- 回答を否定する表現
- 他の学生と比較する表現
- 抽象的なアドバイス
- 「頑張りましたね」等の上から目線
- 「〜すべきです」等の断定的な指示
- ES/面接の直接的な書き方指導
- 質問なしの長い講評

### 初回質問
- `gakuchika_content` がある場合: LLM呼び出しで内容に基づく質問を生成
- `gakuchika_content` がない場合: テンプレートからランダム選択（コスト節約）

### フォローアップチェーン戦略

質問が独立した新しい質問にならないよう、前回回答を起点とした段階的深掘りを行う。

- **重要**: 前回の回答の中で最も重要な部分（具体的な行動、結果、感情）を特定し、そこを起点に深掘りする
- 独立した新しい質問ではなく、前回の回答を引用しながら「その〇〇について、もう少し詳しく教えてください」のように掘り下げる
- 2-3個の段階的な深掘りを意識する（表面的回答→具体的行動→その結果/学び）

**効果**: STAR要素の深掘り品質 +10%

---

## 9. UIコンポーネント

### リストページ (`src/app/gakuchika/page.tsx`)
- framer-motion `Reorder.Group/Item` によるドラッグ&ドロップ並び替え
- 三点メニュー（タイトル編集・削除）
- インラインタイトル編集
- プラン上限バッジ（`3/3 素材使用中`）
- 上限到達時の非活性化 + アップグレードリンク
- モバイルFABボタン

### 会話ページ (`src/app/gakuchika/[id]/page.tsx`)
- STARプログレスバー（Popover説明付き）
- セッションセレクター（複数セッション時）
- STARオンボーディング（初回のみ、localStorage管理）
- 回答ヒントバナー（ターゲットSTAR要素表示）
- スコア変化フィードバック（アニメーション付き）
- リッチ完了画面（サマリー・キーポイント・強み・CTA）
- CompanyLinker（デスクトップ: Popover+Command、モバイル: Sheet）
- モバイル最適化（safe-area-inset、44pxタッチターゲット）

### コンポーネント一覧
| コンポーネント | ファイル | 用途 |
|----------------|---------|------|
| STARProgressBar | `STARProgressBar.tsx` | STAR進捗バー（Popover説明付き） |
| STARProgressCompact | `STARProgressBar.tsx` | コンパクト版（リスト用） |
| STARStatusBadge | `STARProgressBar.tsx` | ステータスバッジ |
| STAROnboarding | `STAROnboarding.tsx` | 初回STAR説明オーバーレイ |
| STARHintBanner | `STARHintBanner.tsx` | 回答ヒントバナー |
| STARScoreChange | `STARScoreChange.tsx` | スコア変化通知 |
| CompletionSummary | `CompletionSummary.tsx` | リッチ完了画面 |
| DeleteConfirmDialog | `DeleteConfirmDialog.tsx` | 2ステップ削除確認 |
| CompanyLinker | `CompanyLinker.tsx` | 企業紐づけ（レスポンシブ） |

---

## 10. ES連携

### ガクチカ → ES作成導線
- 完了画面の「ESを作成する」CTA → `/es?gakuchikaId=xxx`
- ES作成ページでバナー表示 + 新規作成モーダル自動表示

### ES添削へのコンテキスト注入
- `aiThreads.gakuchikaId` でガクチカと添削スレッドを紐づけ
- ES添削リクエストに `gakuchikaContext` パラメータを渡す
- FastAPI側: ガクチカ深掘り情報（key_points, strengths）をシステムプロンプトに注入
- 対象: フルレビュー、セクションレビュー、SSEストリーミング

---

## 11. データモデル

### gakuchikaContents
| カラム | 型 | 説明 |
|--------|-----|------|
| id | text PK | UUID |
| userId | text FK | ユーザーID |
| guestId | text FK | ゲストID |
| title | text | 素材タイトル |
| content | text | ガクチカ本文 |
| charLimitType | text | "300" / "400" / "500" |
| summary | text | 構造化サマリー（JSON or プレーンテキスト） |
| linkedCompanyIds | text | JSON配列 |
| sortOrder | integer | 並び順 |

### gakuchikaConversations
| カラム | 型 | 説明 |
|--------|-----|------|
| id | text PK | UUID |
| gakuchikaId | text FK | 素材ID（1:N） |
| messages | text | JSON: Q&A配列 |
| questionCount | integer | 質問数 |
| status | text | "in_progress" / "completed" |
| starScores | text | JSON: STAR評価 + question_types + current_phase |

---

## 12. 関連ファイル一覧

### バックエンド
- `backend/app/routers/gakuchika.py` — FastAPIルーター（質問生成・STAR評価・サマリー）

### Next.js API
- `src/app/api/gakuchika/route.ts` — 一覧取得・新規作成（プラン上限チェック）
- `src/app/api/gakuchika/[id]/route.ts` — 詳細・編集・削除
- `src/app/api/gakuchika/[id]/conversation/route.ts` — 会話管理（セッション対応）
- `src/app/api/gakuchika/[id]/conversation/new/route.ts` — 新セッション作成
- `src/app/api/gakuchika/reorder/route.ts` — 並び替え
- `src/app/api/gakuchika/summaries/route.ts` — サマリー一覧（ES連携用）

### フロントエンド
- `src/app/gakuchika/page.tsx` — リストページ
- `src/app/gakuchika/[id]/page.tsx` — 会話ページ
- `src/components/gakuchika/` — UIコンポーネント群
- `src/hooks/useMediaQuery.ts` — レスポンシブ判定フック

### 設定
- `src/lib/stripe/config.ts` — プラン別素材数上限（PLAN_METADATA.gakuchika）
- `src/lib/db/schema.ts` — DBスキーマ（gakuchikaContents, gakuchikaConversations, aiThreads）
