# ガクチカ SSE Event Contract

本ドキュメントはガクチカ会話 API の Server-Sent Events (SSE) 通信契約を規定する。
architecture-gate (2026-04-17) で必須要件として明文化された。

## 対象経路

- FastAPI 内部 API: `POST /api/gakuchika/next-question/stream` (実装: `backend/app/routers/gakuchika.py`)
- Next.js API route: `POST /api/gakuchika/[id]/conversation/stream` (実装: `src/app/api/gakuchika/[id]/conversation/stream/route.ts`)
- Next.js API proxy: `src/app/api/gakuchika/fastapi-stream.ts` の `iterateGakuchikaFastApiSseEvents` / `consumeGakuchikaNextQuestionSse`
- Client controller: `src/hooks/useGakuchikaConversationController.ts`

## 全体方針

1. **Partial event で state の増分パッチ** (`field_complete`) を送信、**Complete event で最終状態** (`complete`) を送信
2. Partial event は **部分的な state patch** であり、既存 state にマージする
3. Complete event は **完全な state の replace** であり、partial の蓄積が不一致でも complete が正
4. Error event で fatal error、Done で正常終了
5. 接続断時の **session resume** は complete event の state snapshot を最後の真実として扱う

## Event 型

すべて JSON オブジェクトで、`data: <JSON>\n\n` 形式の SSE wire format。

### 1. `string_chunk` — ストリーミング本文

質問文 (`question`) の漸進的ストリーミング。

```jsonc
{
  "type": "string_chunk",
  "path": "question",
  "text": "SNS発信で参加者が倍増したのは"
}
```

- `path`: 現在は `"question"` のみ
- `text`: 追加される差分テキスト (concatenate する)
- 連続する `string_chunk` を連結して `streamedQuestionText` を構築
- `complete` event の `data.question` があればそれを優先、なければ `streamedQuestionText` を使う

### 2. `field_complete` — State 増分パッチ (partial)

単一フィールドの確定。

```jsonc
{
  "type": "field_complete",
  "path": "focus_key",
  "value": "action"
}
```

対応する path 一覧 (既存 + 新規):
| path (snake_case) | ConversationState (camelCase) | 型 |
|---|---|---|
| `focus_key` | `focusKey` | `FocusKey` |
| `progress_label` | `progressLabel` | `string` |
| `answer_hint` | `answerHint` | `string` |
| `ready_for_draft` | `readyForDraft` | `boolean` |
| `draft_readiness_reason` | `draftReadinessReason` | `string` |
| `deepdive_stage` | `deepdiveStage` | `string` |
| `coach_progress_message` | `coachProgressMessage` | `string` |
| `remaining_questions_estimate` (新規、2026-04-17) | `remainingQuestionsEstimate` | `number` (int ≥ 0) |

**クライアント実装方針** (fastapi-stream.ts):
- 各 `field_complete` を `partialState: Partial<ConversationState>` にマージ
- 複数回の `field_complete` は最後勝ち (late-wins)
- 未知の path は silently ignore (forward-compat)

### 3. `complete` — 最終状態 (final state replace)

```jsonc
{
  "type": "complete",
  "data": {
    "question": "SNS発信で参加者が倍増したのは大きな成果ですね。その時、他のメンバーとは〜",
    "conversation_state": {
      "stage": "es_building",
      "focus_key": "action",
      "coach_progress_message": "あと1-2問で材料が揃いそうです。",
      "...": "..."
    },
    "next_action": "ask"
  }
}
```

- `data.question`: 最終的な質問文 (string_chunk 蓄積より優先)
- `data.conversation_state`: **完全な state snapshot** (snake_case キー)
- `data.next_action`: `"ask" | "show_generate_draft_cta" | "continue_deep_dive" | "show_interview_ready"`

**クライアント実装方針**:
- complete 到達時、partial state を破棄して `data.conversation_state` を `safeParseConversationState` で解析
- complete が来ない場合、partial state を `buildConversationStatePatch(defaultConversationState(), partialState)` で構築 (fallback)

### 4. `error` — Fatal error

```jsonc
{
  "type": "error",
  "message": "AIサービスに接続できませんでした。"
}
```

- `message` がない場合は `FASTAPI_ERROR_MESSAGE` fallback
- 受信後は ストリームを即終了、`{ ok: false, error }` を返す

## Session Resume

接続断の復旧は以下の順で判断:

1. **conversation 永続化**: 最新の `conversationState` は `gakuchikaConversations.state_json` (Postgres) に保存済み
2. **復旧エンドポイント**: `GET /api/gakuchika/[id]/conversation/resume` で最新の state snapshot を返す
3. **クライアント**: resume response を `safeParseConversationState` で解析し controller に hydrate
4. **新規 SSE**: 次の質問要求は resume 後の state を `conversation_state` として送信

Complete event が届いていれば client はそれを truth として扱う。Complete が届かない異常終了時は resume endpoint で最新の永続化 state に戻す。

## coach_progress_message / remaining_questions_estimate の扱い (新規、2026-04-17)

### coach_progress_message

- **生成**: FastAPI `backend/app/normalization/gakuchika_payload.py` の `_build_coach_progress_message()` で計算 (LLM call なし、`resolved_focuses` / `focus_key` / `missing_elements` から決定論的生成、≤ 30 字)
- **送信方法**:
  - Partial: `{ type: "field_complete", path: "coach_progress_message", value: "..." }`
  - Complete: `data.conversation_state.coach_progress_message`
- **Next API は pass-through**: Next.js は FastAPI の state をそのまま client へ中継 (additional processing なし)
- **Client 表示**: `NaturalProgressStatus` コンポーネント (Phase C.3) が消費

### remaining_questions_estimate (2026-04-17 M4)

サーバ側 readiness gate と UI「あと◯問」表示を 100% 整合させるためのフィールド。

- **生成**: `backend/app/normalization/gakuchika_payload.py` の `_estimate_remaining_questions()` で計算 (LLM call なし、pure function)
- **算出式**: `stage` が `interview_ready` / `deep_dive_active` / `draft_ready` または `ready_for_draft=true` のとき常に `0`。それ以外は以下 3 値の最大を `_es_build_question_cap_threshold() - question_count` で cap (0 下限):
  - `max(0, MIN_USER_ANSWERS_FOR_ES_DRAFT_READY - question_count)`
  - `missing_elements` 中の CORE_BUILD_ELEMENTS の個数
  - `task_clarity` / `action_ownership` / `result_traceability` の false 個数 + `role_required && !role_clarity` + `causal_gap_action_result`
- **送信方法**:
  - Partial: `{ type: "field_complete", path: "remaining_questions_estimate", value: 3 }`
  - Complete: `data.conversation_state.remaining_questions_estimate`
- **Next API は pass-through** (snake → camel の key 変換のみ)
- **Client 表示**: `NaturalProgressStatus` がサーバ値を優先。`null` / 欠落のときだけ既存 heuristic (`missingElements.length`) へ fallback

## 契約テスト (必須)

以下は `D.2 LLM call-site 契約テスト` と `D.4 Live scenario` で検証:

- `field_complete` の全 path について、patch マージが正しい (既存 state を上書き)
- `complete` event 後に partial が来ても無視される (complete が truth)
- `error` event 受信時、それ以降のイベントは read されない
- 未知の path を含む `field_complete` はエラーを投げずスキップ
- `coach_progress_message` が partial / complete 両方で同じ string に収束する
- `remaining_questions_estimate` は **整数 ≥ 0** で送られる (負値や非整数は Next API / FE 正規化層で ignore)
- `stage == "interview_ready"` / `ready_for_draft == true` のとき `remaining_questions_estimate` は常に `0`

## バージョニング

- Event 型は追加のみ許容 (後方互換)
- 既存 path の意味を変更する破壊変更は明示的 `version` フィールドと coord 必須
- 新規 path 追加時は本ドキュメントに先に追記してから実装

## 参照

- architecture-gate 判定: `docs/review/architecture-gate/gakuchika_v4_20260417.md`
- 計画書: `docs/plan/GAKUCHIKA_QUALITY_IMPROVEMENT_PLAN.md`
- 実装プラン: `/Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-concurrent-candle.md`
