# 志望動機作成機能

会話ベースで志望動機 ES の材料を揃え、下書きを生成する機能。会話なしの直接生成は補助ルートとして対応するが、会話ありと完全同等ではない。

## 入口

| 項目 | パス |
|------|------|
| FastAPI | `backend/app/routers/motivation.py` |
| ページ | `src/app/(product)/companies/[id]/motivation/page.tsx` |
| Next API | `src/app/api/motivation/[companyId]/` |
| 会話状態 | `src/lib/motivation/conversation.ts` |
| 集客 LP | `src/app/(marketing)/shiboudouki-ai/page.tsx`（志望動機 AI / 書き方 / テンプレ） |

## 概要

- 目的は、その企業・その職種に合った志望動機 ES の材料を、会話で段階的に揃えること。会話なしの直接生成は、材料がまだないときの fallback として扱う
- 会話開始前に `企業確認 / 業界確定 / 職種確定` の setup を行う。setup エリアはヘッダー固定＋フォーム部分のみスクロールし、画面内に収めやすくする
- **二ルート**: (A) setup 完了後「会話せずに下書きを作成」→ 企業 RAG・プロフィール・ガクチカ要約のみで FastAPI `POST /api/motivation/generate-draft-from-profile` 経由で ES 生成（会話履歴が空のときのみ、かつログイン必須）。(B) 「質問を始める」→ 従来どおり `conversation/start` → `stream` → 十分なら `generate-draft`
- 現行の主要 route はログイン必須で、会話開始・質問送信・下書き生成の本線は guest を受け付けない
- 会話は `slot_fill` と `deepdive` の 2 モードで進む
- `slot_fill` では 6 要素を 1 回ずつ回収し、現行仕様では 6〜7 問で ES 解放する
- `draft_ready` 到達後はスナックバーで通知し、`志望動機ESを作成` CTA を有効化する
- `deepdive` では ES 解放後に最大 10 問まで弱点補強を行う
- 返答は自由入力のみ
- ステージ名 `closing` が API に残る場合でも、UI では「仕上げを整理中」等のラベルは出さず、直前スロットやモードにフォールバックする
- 志望動機・ガクチカの ES 本文は **改行なしの 1 段落**（プロンプト指示＋Next の `generate-draft` / `generate-draft-direct` / ガクチカ `generate-es-draft`、および FastAPI 側の正規化で保存直前に統一）
- **ES 下書き（会話ありの `generate-draft`）**: FastAPI は ES 添削と同じ `backend/app/prompts/es_templates.py` の `TEMPLATE_DEFS` から組み立てた **`build_template_draft_generation_prompt`（テンプレ種別 `company_motivation`）** で 1 回の LLM 呼び出しを行う。企業 RAG の要約テキストはユーザープロンプト側の「企業参考情報」に載せる（添削の evidence card 形式は下書きでは未使用）
- **ES 下書き（会話ありの `generate-draft`）**: `slotSummaries` と `slotEvidenceSentences` を会話ログと一緒に FastAPI へ渡し、構造化材料を優先参照させる。会話ログの再抽出依存を減らし、重要材料の見落としを抑える
- **会話なしの `generate-draft-from-profile`**: fallback 専用。プロフィールとガクチカの材料が薄い場合は生成を止め、対話あり導線へ戻す。会話ありと同等品質の前提にはしない

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
- `slot_status` は `filled_strong / filled_weak / partial / missing` の 4 段階で扱う
- `slot_fill` 中の次質問は常に 1 論点だけを聞く
- 同じ `slot + intent` の再質問は原則禁止する
- `rough` でも先に進み、完璧に埋め切ることを優先しない
- `deepdive` は ES 解放後の補強フェーズとして動き、追加で最大 10 問まで扱う
- 未整理明示か明示的矛盾がある場合のみ再質問を許可する。`UNRESOLVED_PATTERNS` と再質問予算で、完全な未整理回答にも一定のハンドリングはある
- 直前質問と同じ意味の質問は `question_signature` と `lastQuestionMeta` で避ける
- 未確認の企業名・職種・仕事内容・志望理由を前提にした質問は reject / repair する

## ストリーミングと一貫性

- `conversation/stream` は `progress` と最終 `complete` を返す
- 質問文の `string_chunk` は中継しない
- UI は確定済みの `nextQuestion` だけを表示し、質問が表示後に別文へ置換されない
- DB 保存、質問生成、UI 表示は同じ canonical question を使う

## 主要 API

- `GET /api/motivation/[companyId]/conversation`
  - 会話履歴、setup 状態、`nextQuestion`、`stageStatus`、`conversationContext` を返す
- `POST /api/motivation/[companyId]/conversation/start`
  - setup を保存し、初回質問を生成して assistant message として保存する
- `POST /api/motivation/[companyId]/conversation/stream`
  - 回答送信の唯一の経路。FastAPI SSE を consume-and-re-emit し、保存とクレジット消費もここで行う
- `POST /api/motivation/[companyId]/generate-draft`
  - 300/400/500 字の ES 下書きを生成し、会話 state に保持する（会話が draft ready かつ十分な履歴があること）
- `POST /api/motivation/[companyId]/generate-draft-direct`
  - ルート A。会話メッセージが空のときのみ、かつログイン必須。FastAPI `generate-draft-from-profile` を呼び、材料が薄い場合は 409 で止める。生成後は必要に応じて `next-question` で深掘り用の初回質問を 1 件付与する
- `POST /api/motivation/[companyId]/resume-deepdive`
  - `generate-draft` のフォローアップ質問取得失敗時のリカバリ用。既存の `generatedDraft` を前提に FastAPI `/api/motivation/next-question` を再呼び出しし、deepdive 質問を取得する。1 クレジット消費
- FastAPI のエラー `detail` が文字列以外でも、Next 側で `messageFromFastApiDetail` によりユーザー向け短文に正規化する

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
- `draftSource`

## UI 要点

- 右カラムの進捗はガクチカと同じピルバッジ + フェーズトラッカーで表示する
  - ピル: 6 スロット（業界理由・企業理由・自己接続・希望業務・価値貢献・差別化）を done✓ / current● / pending○ の 3 状態で表示。データソースは `StageStatus`
  - フェーズ: ES作成可 / 深堀り中 / 面接準備完了（真理値表ベースで導出）
  - カウンター: slot_fill 時「N問目 / 約6問」、deepdive 時「N問目 / 補強中」
- slot_fill 中は「今確認していること」「今回知りたいこと」「次に進む条件」を詳細セクションで維持する
- setup 画面では業界と職種を先に確定する
- `参考にした企業情報` は compact card で表示する
- `会話をやり直す` は `ConversationSidebarCard` ラッパーのアクションボタンから操作できる。現状は全体リセットが基本で、スロット単位の redo はない
- `志望動機ESを作成` CTA は常に見える位置に置き、未到達時は disabled 理由を表示する
- ES 完成後は面接対策への CTA も出す
- `applyConversationPayload` は `Partial<ConversationPayload>` 対応。`"key" in` ガードで未指定フィールドは既存 state を保持し、ES 作成後もピルやフェーズの状態が維持される

## ES 作成後の導線

ES 生成成功後のフローは以下の通り:

1. **スナックバー** → **モーダル** (`MotivationDraftModal`) が表示される
2. モーダルには「ESとして保存する」(primary) と「もっと深堀りして再生成する」(outline) の 2 ボタンがある
3. **「ESとして保存する」** → 新規 ES ドキュメントを作成 → `/es/{docId}` に遷移 → 成功スナックバー表示
4. **「もっと深堀りして再生成する」** → モーダルを閉じ → deepdive 会話が再開される
5. モーダルの X ボタンまたはオーバーレイクリックも「もっと深堀り」と同じ動作
6. ES 保存は毎回新規ドキュメントとして作成される（会話内の下書きは上書き更新）

### 過渡期メッセージ

- **draft_ready 直後（ES 未生成）**: 「志望動機の材料が揃いました。右上の「志望動機ESを作成」からESを生成できます。」
- **deepdive 完了時（追加質問なし）**: 「補強が完了しました。「志望動機ESを作成」で再生成すると、深掘り内容が反映されます。」

### フォローアップ質問取得失敗時

`generate-draft` 成功後に FastAPI `/api/motivation/next-question` が失敗した場合:
- モーダルは表示される（保存は可能）
- エラーメッセージが表示され、リトライボタンは `resume-deepdive` API を呼ぶ

### 進捗パネル（deepdive 時）

- `conversationMode === "deepdive"` 時に「補強フェーズ」セクションが表示される
- 各 causal gap をカード形式で全件表示（slot 名 + 理由）
- gap 残数バッジ or 「完了」バッジ

## クレジット

- 応答 5 回ごとに 3 クレジット消費
- 下書き生成（対話後 `generate-draft` と会話なし `generate-draft-direct` の両方）は **同一 feature キー `motivation_draft`**。6 credits 予約 → 成功確定 / 失敗取消
- `resume-deepdive` はフォローアップ質問再取得のため 1 credit 消費（feature キー `motivation_resume_deepdive`）
- 失敗時は消費しない
