# 認証・ゲスト/ユーザー所有権 改善計画

**作成日**: 2026-05-04  
**対象**: 就活Pass (`career_compass`)  
**目的**: Better Auth session、`guest_device_token` cookie、BFF owner check、FastAPI `X-Career-Principal` の境界を正本化し、公開前 P0 の tenant 越境・guest migration 漏れ・route drift を潰し込む。  
**本タスクの完了条件**: この計画書を `docs/plan` に作成すること。実装修正、migration、テスト追加、commit、push はこのタスクでは行わない。

## 現状整理

- `src/bff/identity/request-identity.ts` は Better Auth session を優先し、session がない場合のみ `guest_device_token` HttpOnly cookie から guest を解決する。browser-visible `x-device-token` header は default では無効。
- `src/proxy.ts` は外部 `x-device-token` を削除し、cookie から内部 header を再構成する設計になっている。
- `src/bff/identity/owner-access.ts` は `userId` / `guestId` XOR の identity を fail-closed に扱うが、route-local owner check と owner 条件なし mutation がまだ残る。
- DB schema は多くの owner table に `userId` / `guestId` XOR 制約を持つ。ただし親子 owner 整合性は FK だけでは保証されず、API 側の owner check に依存している。
- FastAPI 側の企業 RAG は `tenant_key` を ChromaDB / BM25 / cache key に含める strict 境界へ寄っている。一方で、AI JSON endpoint と `ai-stream` principal の `company_id` 契約には不揃いが残る。
- ゲストからログインユーザーへの移行は `migrateGuestToUser()` が手動 table 列挙であり、interview 系 owner table が移行対象から漏れている。

## 完了条件

実装フェーズへ進む場合は、次を満たすまでこの計画書のタスクリストを更新しながら作業を繰り返す。

- P0 タスクがすべて `done` になる。
- P1 タスクは `done`、または残す理由・期限・後続計画が明記される。
- `guest_device_token` cookie が guest identity の正本であり、browser-visible header では guest を確定しないことが単体テストと E2E smoke で固定される。
- owner 付き API は `getRequestIdentity()` と owner check を通し、他人の企業、応募枠、締切、タスク、通知、ES、ガクチカ、志望動機、面接へアクセスできない。
- guest migration は schema 上の owner XOR table と整合し、ログイン移行後に guest-owned data が取り残されない。
- FastAPI の actor principal は company-bound AI / RAG 処理で `company_id` 一致を要求し、RAG / cache / BM25 は `tenant_key` なしで fail closed する。
- 変更後に該当 Vitest、pytest、必要最小限の E2E smoke、`npx tsc --noEmit` が通る。

## 状態更新ルール

- `todo`: 未着手。
- `doing`: 調査、設計、実装、またはテスト作成中。
- `blocked`: 方針判断、既存データ監査、migration 安全性、外部環境、または flaky test の解消が必要。
- `done`: 完了条件と検証コマンドが通り、差分レビューでも scope 外変更がない。

運用ルール:

- 実装開始時に対象タスクを `doing` にする。
- 検証が失敗した場合は `todo` または `blocked` に戻し、失敗理由を `Notes` に追記する。
- 完了条件を満たすまで、同じ表を更新しながら `doing -> verification -> done/blocked` を繰り返す。
- DB 制約追加は、既存データ監査を通過してから別フェーズで扱う。今回の P0 では監査 SQL / 検出テストまでを対象にする。

## タスクリスト

| ID | Priority | Status | Finding | Fix Plan | Completion Criteria | Verification | Owner Agent |
|---|---|---|---|---|---|---|---|
| AUTH-P0-01 | P0 | todo | guest migration が interview 系 owner table を移行しない | `migrateGuestToUser()` の移行 registry に `interviewConversations`、`interviewFeedbackHistories`、`interviewTurnEvents`、`interviewDrillAttempts` を追加する。unique conflict 方針は「既存 user data 優先、guest duplicate は衝突前に検出して blocked」とする | schema 上の owner XOR table と migration 対象の差分がテストで検出され、interview 系が user owner へ移る | `npm run test:unit -- src/lib/auth/guest.test.ts src/app/api/guest/migrate/route.test.ts` | database-engineer |
| AUTH-P0-02 | P0 | todo | route-local owner check が散在し drift しやすい | `src/bff/identity/owner-access.ts` に owner condition builder と owned child loader を追加し、代表 route から段階置換する | mixed identity は DB に触らず拒否し、owner mutation は `where(id + owner)` に寄る | `npm run test:unit -- src/bff/identity/owner-access.test.ts src/app/api/companies/[id]/route.test.ts src/app/api/applications/[id]/route.test.ts` | nextjs-developer |
| AUTH-P0-03 | P0 | todo | `user_pins` が polymorphic `entityType/entityId` をそのまま insert できる | pin 作成時に `document` / `gakuchika` の実体 owner を検証してから upsert する。未知 entity type は 400、存在しない/他人 entity は 404 | 他人の document/gakuchika、存在しない ID、mixed identity で insert されない | `npm run test:unit -- src/app/api/pins/route.test.ts` | security-auditor |
| AUTH-P0-04 | P0 | todo | company-bound AI call で principal `company_id` が任意になり得る | FastAPI helper を作り、payload/path に `company_id` がある場合は `principal.company_id == company_id` を必須化する | ES review、motivation、gakuchika の company-bound request が missing/mismatch principal で 403 になる | `cd backend && pytest backend/tests/es_review/test_auth_boundary.py backend/tests/gakuchika/test_auth_boundary.py backend/tests/motivation/test_auth_boundary.py -q` | fastapi-developer |
| AUTH-P0-05 | P0 | todo | Gakuchika の一部 JSON LLM endpoint が service JWT だけを信頼する | LLM 実行 endpoint は SSE/JSON を問わず `fetchFastApiWithPrincipal()` と `require_career_principal("ai-stream")` に統一する | `/next-question`、`/structured-summary`、`/generate-es-draft` が principal なし 401、scope mismatch 403 になる | `cd backend && pytest backend/tests/gakuchika/test_auth_boundary.py -q` | fastapi-developer |
| AUTH-P0-06 | P0 | todo | multipart upload が認証・rate limit・owner check 前に `formData()` する | `fetch-corporate-upload` を `auth -> rate limit -> company owner check -> formData -> file validation` の順に変更する | 未認証/非 owner request で `formData()` が呼ばれない | `npm run test:unit -- src/app/api/companies/[id]/fetch-corporate-upload/route.test.ts` | security-auditor |
| AUTH-P0-07 | P0 | todo | 親子 owner 整合性が DB 制約で守られていない | 今回は API write path の検証と監査 SQL / 検出テストまで実施し、composite FK / unique index は別フェーズにする | `application.owner != company.owner`、`document.application.company_id != document.company_id` などを検出できる | `npm run test:unit -- src/lib/db/owner-integrity.test.ts` または監査 SQL dry-run | database-engineer |
| AUTH-P1-01 | P1 | todo | owner check 後の mutation が `where(id)` に戻る route がある | `companies/[id]`、`applications/[id]`、`gakuchika/[id]`、`notifications/[id]*` から owner predicate 付き update/delete に置換する | TOCTOU に弱い `where(id)` mutation が対象 route から消える | `npm run test:unit -- src/app/api/companies/[id]/route.test.ts src/app/api/applications/[id]/route.test.ts src/app/api/notifications/[id]/read/route.test.ts` | nextjs-developer |
| AUTH-P1-02 | P1 | todo | raw `{ error }` response が ID 付き product route に残る | `createApiErrorResponse()` へ段階移行し、`requestId`、`userMessage`、`action` を揃える | 対象 route の raw error が allowlist なしで増えない | `node scripts/security/check-raw-error-responses.mjs` | code-reviewer |
| AUTH-P1-03 | P1 | todo | login-only route が `auth.api.getSession()` を個別実装している | `getRequiredUserIdentity()` / `getRequiredUserIdentityWithPlan()` を導入し、guest 禁止 route を仕様として表現する | corporate RAG、calendar、settings、stripe の login-only 境界が helper 名で明示される | `npm run test:unit -- src/bff/identity/request-identity.test.ts src/app/api/companies/[id]/fetch-corporate/estimate/route.test.ts` | security-auditor |
| AUTH-P1-04 | P1 | todo | SSE concurrency key が `actor_id` のみ | `actor_kind:actor_id` を concurrency key にし、user と guest の同一 ID 衝突を防ぐ | `user:same-id` と `guest:same-id` が別 lease になる | `cd backend && pytest backend/tests/shared/test_sse_concurrency.py -q` | fastapi-developer |
| AUTH-P1-05 | P1 | todo | production rate limit が Upstash 障害時に実質 fail-open し得る | 高リスク operation は production で Upstash 未設定/障害時に fail-closed または低い固定上限にする | `guestAuth`、`guestMigrate`、AI/credit mutation が分散 rate limit なしで unlimited にならない | `npm run test:unit -- src/lib/rate-limit.test.ts` | security-auditor |

## 実装順序

1. `AUTH-P0-01` と `AUTH-P0-03` を先に実装する。どちらも直接的な owner 漏れ・移行漏れで、blast radius が比較的小さい。
2. `AUTH-P0-02` と `AUTH-P1-01` で owner helper と owner predicate 付き mutation を代表 route へ導入する。
3. `AUTH-P0-04`、`AUTH-P0-05`、`AUTH-P1-04` で FastAPI principal 契約を統一する。
4. `AUTH-P0-06` で multipart upload の処理順を直す。
5. `AUTH-P0-07` で監査 SQL / 検出テストを追加し、DB 制約追加の別計画を作る。
6. P0 がすべて `done` になった後、P1 を同じ状態更新ルールで処理する。

## 検証コマンド

最小検証:

```bash
npm run test:unit -- src/bff/identity/request-identity.test.ts src/bff/identity/owner-access.test.ts src/lib/auth/guest.test.ts
npm run test:unit -- src/app/api/guest/migrate/route.test.ts src/app/api/pins/route.test.ts
npm run test:unit -- src/app/api/companies/[id]/fetch-corporate-upload/route.test.ts
npx tsc --noEmit
```

FastAPI 契約変更を含む場合:

```bash
cd backend && pytest backend/tests/security/test_tenant_isolation.py -q
cd backend && pytest backend/tests/es_review/test_auth_boundary.py backend/tests/gakuchika/test_auth_boundary.py backend/tests/motivation/test_auth_boundary.py -q
```

E2E smoke 候補:

```bash
npx playwright test e2e/functional/auth-ownership-boundary.spec.ts
```

想定シナリオ:

- guest A が作成した company を guest B の cookie で GET / PUT / DELETE すると 404。
- cookie なしで `x-device-token` header だけ送って `/api/companies` が 401。
- guest cookie A と偽装 `x-device-token` B が同時にある場合、cookie A の identity だけが使われる。
- guest company 作成後に login migration し、user として同じ company が見える。
- migration 後の旧 guest token では migrated data にアクセスできない。

## DB 制約フェーズの扱い

今回の P0 では、親子 owner 整合性の DB 制約追加までは含めない。理由は、composite FK / unique index を追加する前に既存データの不整合確認が必要で、migration の失敗リスクが高いため。

別フェーズで検討する DB hardening:

- `companies(id,user_id)` / `companies(id,guest_id)` の composite unique。
- `applications(company_id,user_id)` / `applications(company_id,guest_id)` の親 owner 整合。
- `documents` の `companyId`、`applicationId`、`jobTypeId` の階層整合。
- `company_pdf_ingest_jobs.source_url` の global unique を `company_id + source_url` に変更。
- `motivation_conversations` / `interview_conversations` の partial unique index 化。

## 参照基準

- Better Auth cookie / session docs: https://www.better-auth.com/docs/concepts/cookies, https://www.better-auth.com/docs/concepts/session-management
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP API Broken Object Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- Repo docs: `docs/features/AUTH.md`, `docs/architecture/BFF_FASTAPI_CONTRACT.md`, `docs/architecture/TENANT_ISOLATION_AUDIT.md`, `docs/plan/pre-production-readiness-items-2026-05-04.md`
