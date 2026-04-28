# BFF FastAPI Contract

## 目的

Next.js BFF と FastAPI AI backend の境界を、Clean Architecture 移行前に固定する。CA-0 では契約・型・代表テストだけを追加し、route 移設や domain/service 分割は行わない。

## 対象

- TypeScript 正本: `src/shared/contracts/fastapi/`
- Python mirror: `backend/app/schemas/contracts.py`
- 共通 fixture: `tests/fixtures/bff-fastapi-contract-fixtures.json`
- 代表テスト:
  - `src/shared/contracts/fastapi/*.test.ts`
  - `backend/tests/contracts/test_bff_fastapi_contracts.py`
  - 既存 `src/lib/fastapi/sse-proxy.test.ts`
  - 既存 `backend/tests/shared/test_career_principal.py`

## SSE Wire Format

FastAPI stream は `data: <JSON>\n\n` の SSE block を返す。BFF は `src/lib/fastapi/sse-proxy.ts` で受け、`internal_telemetry` を browser へ転送しない。

共通 event:

| type | 用途 | 契約 |
|---|---|---|
| `progress` | 進捗表示 | 追加 field は feature ごとに許容 |
| `string_chunk` | 逐次本文 | `text` 必須、`path` は任意 |
| `field_complete` | 部分 state patch | `path` と `value` 必須 |
| `complete` | 最終結果 | 成功扱い。feature 別 payload を持つ |
| `error` | 失敗 | 成功扱いしない |

`complete` は final truth として扱い、partial event より優先する。未知の `field_complete.path` は forward-compatible に無視する。

## Feature Complete Payloads

| feature | complete payload |
|---|---|
| motivation | `{ type: "complete", data: { ... } }` |
| gakuchika | `{ type: "complete", data: { question, conversation_state, next_action } }` |
| interview | `{ type: "complete", data: { turn_state?, turn_meta?, interview_plan?, question_stage? } }` |
| es_review | `{ type: "complete", result: { ... } }` |

ES review は `result` key を使い、`data` key へ寄せない。これは既存 frontend と SSE handler の互換性維持のため。

## Gakuchika Field Patch

許可する `field_complete.path`:

- `focus_key`
- `progress_label`
- `answer_hint`
- `ready_for_draft`
- `draft_readiness_reason`
- `deepdive_stage`
- `coach_progress_message`
- `remaining_questions_estimate`

`remaining_questions_estimate` は integer かつ `>= 0`。未知 path は schema 全体では受けても、gakuchika patch helper では `null` として無視する。

## X-Career-Principal

BFF は `X-Career-Principal` に HS256 token を入れて FastAPI へ渡す。payload contract:

| claim | contract |
|---|---|
| `scope` | `"company" | "ai-stream"` |
| `actor.kind` | `"user" | "guest"` |
| `actor.id` | non-empty string |
| `plan` | `"guest" | "free" | "standard" | "pro"` |
| `company_id` | company scope では必須、ai-stream では nullable |
| `iat` / `nbf` / `exp` | epoch seconds |
| `jti` | non-empty string |

FastAPI では `backend/app/security/career_principal.py` が署名・issuer・audience・scope・期限を検証する。

## Owner Check

所有権判定は Next.js BFF の責務とする。ログインユーザーは Better Auth session、ゲストは HttpOnly `guest_device_token` cookie から解決し、browser-visible header を正本にしない。

FastAPI は BFF が署名した `X-Career-Principal` を検証し、scope と actor を downstream の安全境界として扱う。company scope の endpoint では `company_id` claim が必須で、handler 側は path / payload の company id と principal の company id を一致させる。

owner 判定の配置:

| 層 | 責務 |
|---|---|
| BFF route | user / guest identity 解決、resource owner check、構造化エラー化 |
| FastAPI dependency | principal token の署名・期限・scope・actor・company id claim 検証 |
| FastAPI service | tenant key / company id を下流 RAG・cache・delete 処理に渡す |

## Rate Limit / Concurrency

SSE concurrency は FastAPI の `backend/app/security/sse_concurrency.py` が actor 単位で制御する。BFF は stream feature の開始時に `scope: "ai-stream"` の principal を付与し、FastAPI は actor と plan を制限判定の入力に使う。

rate limit と concurrency の契約は feature 固有の payload から分離し、`X-Career-Principal` と stream feature config を境界にする。CA-1 以降で route を `src/bff/` / `src/features/` へ移しても、制限点はこの契約に従う。

## Billing Policy

AI stream の contract は次の3種類だけを許容する。

| kind | 意味 |
|---|---|
| `post_success` | precheck 後、DB save 成功時のみ consume |
| `three_phase` | stream 前 reserve、成功時 confirm、失敗時 cancel |
| `free` | stream contract 上は課金しない |

現状の `STREAM_FEATURE_CONFIGS` は motivation/gakuchika が `post_success`、ES review が `three_phase`、interview が `free`。interview の start/turn/feedback 個別課金は route 側の既存仕様として残し、CA-1 以降で feature boundary を切るときに再整理する。

## CA-1 への引き継ぎ

CA-1 ではこの契約テストを維持したまま、motivation pilot の `src/features/`、`src/bff/`、`backend/app/services/` 移行を別 PR で行う。CA-0 の範囲では既存 route の責務移動、FastAPI router 分割、DB schema 変更、LLM prompt 変更は行わない。

CA-1 着手条件:

- CA-0 contract tests が PASS している
- `docs/review/TRACKER.md` と `docs/plan/EXECUTION_ORDER.md` が CA-0 完了状態
- RAG P0-2 を先に実施する場合、CA-1 は RAG / company_info 変更を含めない
