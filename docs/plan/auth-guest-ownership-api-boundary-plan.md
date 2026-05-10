# 認証・ゲスト/ユーザー所有権 API 境界統一計画

作成日: 2026-05-04 JST

## 1. 目的

就活Pass の認証・ゲスト/ユーザー所有権まわりを、API/BFF 境界で一貫して扱える状態にする。

本計画書は **API 境界統一** に絞る。対象は `RequestIdentity` 解決、`guest_device_token` cookie、所有権チェック、401/403/404、CSRF、ゲスト移行、owner 条件付き mutation、FastAPI principal 伝播である。DB 制約や巨大 route 分割も扱うが、主目的は「各 route が個別判断で owner 条件を組む状態」を解消することに置く。

本タスクの完了条件は計画書作成であり、コード実装・migration 作成・テスト実装は行わない。

## 2. 調査範囲

主に以下を静的に確認した。

- `src/bff/identity/request-identity.ts`
- `src/bff/identity/owner-access.ts`
- `src/lib/auth/guest.ts`
- `src/lib/auth/guest-cookie.ts`
- `src/app/api/auth/guest/route.ts`
- `src/app/api/guest/migrate/route.ts`
- `src/lib/csrf.ts`
- `src/lib/db/schema.ts`
- `src/app/api/**` の `getRequestIdentity`, `auth.api.getSession`, owner 条件, mutation
- `src/bff/**` の AI / FastAPI principal 境界
- `docs/features/AUTH.md`
- 既存テスト: `src/bff/identity/*.test.ts`, `src/lib/auth/*.test.ts`, `src/app/api/**/*test.ts`, `e2e/functional/auth-boundary.spec.ts`

外部仕様は Better Auth 公式ドキュメントの session / cookie / security 周辺だけを参照する。

- https://better-auth.com/docs/concepts/session-management
- https://better-auth.com/docs/concepts/cookies
- https://www.better-auth.com/docs/reference/security

## 3. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/auth-guest-ownership-api-boundary-plan.md` が存在する。
2. 認証・ゲスト/ユーザー所有権の現状、主要リスク、設計判断、実装タスク、受け入れ条件、検証コマンドが記録されている。
3. `Task Board` は `Status / Priority / Area / Task / Evidence / Acceptance Criteria / Updated At` を持つ Markdown table で管理されている。
4. 実装フェーズで Status を更新するルールが明記されている。
5. `P0` と `P1` のタスクは、後続実装者が追加判断なしで着手できる粒度になっている。
6. 計画書作成後に、ファイル存在確認と主要見出し検索が実行されている。

## 4. タスク状態更新ルール

実装フェーズでは、完了条件を満たすまで次のループを続ける。

1. `Task Board` から `Todo` の最上位 Priority を 1 件選ぶ。
2. 着手時に `Status` を `Doing` へ変え、`Progress Log` に開始理由を書く。
3. 実装または検証でブロックしたら `Blocked` にし、必要な判断または環境条件を明記する。
4. 受け入れ条件を満たしたら `Review` にし、実行したテストと差分確認結果を書く。
5. レビュー後に `Done` へ変える。
6. `Todo / Doing / Blocked / Review` が残る場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `Doing`: 実装中
- `Blocked`: 判断待ちまたは環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

## 5. 設計判断

### 5.1 principal の正本

- 認証ユーザーは Better Auth session を正本にする。
- ゲストは HttpOnly `guest_device_token` cookie を正本にする。
- 公開 API の browser-visible `x-device-token` はデフォルト無視を維持する。
- `allowDeviceTokenHeader` は `src/app/api/internal/**` など内部境界だけで許可し、internal auth 後に限定する。

現状の `getHeadersIdentity()` は session を優先し、session がない場合に cookie から guest を解決している。cookie がある場合は `x-device-token` より cookie を優先するため、この設計は維持する。

### 5.2 owner identity の形

`RequestIdentity` は `{ userId: string | null; guestId: string | null }` を維持する。owner 判定は `userId XOR guestId` を満たす identity だけ有効とする。

手書きの `identity.userId ? eq(table.userId, identity.userId) : eq(table.guestId, identity.guestId!)` は段階的に廃止し、`owner-access` 層の helper 経由へ寄せる。

### 5.3 HTTP status policy

- identity なし: `401`
- private resource の他人所有: 原則 `404`
- 存在が既にユーザーに見えており、業務ルールで禁止される操作: `403`
- user-only API に guest が来た場合: `401` とし、login required の structured error を返す

この方針により、private resource の存在列挙を避けつつ、`SUBMISSION_PROTECTED` のような業務ルール違反は明示する。

### 5.4 ゲスト移行の衝突方針

ゲスト移行時に同じ company の conversation や同じ entity の pin が user 側にも guest 側にも存在する場合、user 側を正として保持する。

- user 側データは上書きしない。
- guest 側の衝突しないデータだけ user に移す。
- guest 側の衝突データは移行結果と監査ログに残す。
- 衝突のために移行全体を失敗させない。

### 5.5 mutation の防御線

事前に owner 確認してから `where(eq(id))` で update/delete する形は廃止対象にする。owner 条件付き mutation helper、または transaction 内の再検証を使う。

受け入れ条件は「他人の ID を指定した場合に DB mutation、外部 I/O、credit confirm が 0 回」で固定する。

## 6. 現状評価

### 6.1 強い点

- `guest_device_token` は HttpOnly cookie で保持され、UUID v4 検証がある。
- DB には多くの owner table で `user_id XOR guest_id` check がある。
- `request-identity.ts` は cookie guest を優先し、公開 `x-device-token` をデフォルト無視する。
- `owner-access.ts` は invalid identity を false に倒す。
- `createApiErrorResponse()` は `requestId`, `X-Request-Id`, `userMessage`, `action`, dev-only `debug` を持つ。
- FastAPI 側 principal は `X-Career-Principal` と internal JWT へ寄せる方向にある。

### 6.2 主な弱点

- route 側に共通 helper、route 内 `verify*Access`, `auth.api.getSession()` 直呼び、raw `NextResponse.json({ error })` が混在している。
- `guest/migrate` は高リスク POST だが route-level CSRF の明示検証が不足している。
- `migrateGuestToUser()` の移行対象に interview 系 owner table が含まれていない。
- `motivation_conversations`, `interview_conversations`, `user_pins` などで migration 時の unique 衝突方針が実装されていない。
- owner 確認後に owner 条件なしで update/delete する箇所がある。
- private resource の他人所有が `404` と `403` で route ごとに揺れている。
- owner 親子整合性は DB で十分には守られていない。
- 企業 RAG / 企業情報取得 route が巨大化し、認証・所有権・課金・FastAPI proxy・保存が混在している。

## 7. Task Board

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Done | P0 | Guest Migration | `/api/guest/migrate` に route-level CSRF 検証を追加する | `src/app/api/guest/migrate/route.ts`, `src/lib/csrf.ts`, `src/app/api/guest/migrate/route.test.ts` | CSRF cookie/header が欠損または不一致なら `403`。`migrateGuestToUser()`, rate limit, DB mutation は呼ばれない。structured error へ寄せる。 | 2026-05-10 |
| Done | P0 | Guest Migration | `migrateGuestToUser()` の移行対象を owner_xor table から棚卸しする | `src/lib/auth/guest.ts`, `src/lib/db/schema.ts`, `src/lib/auth/guest.test.ts` | `companies`, `applications`, `documents`, `tasks`, `notifications`, `gakuchika_contents`, `motivation_conversations`, `submission_items`, `user_pins`, `interview_conversations`, `interview_feedback_histories`, `interview_turn_events`, `interview_drill_attempts` が対象として明文化される。 | 2026-05-10 |
| Done | P0 | Guest Migration | ゲスト移行の claim を transaction 内で atomic にする | `src/lib/auth/guest.ts`, `guest_users.migrated_to_user_id`, `src/lib/auth/guest.test.ts` | `UPDATE guest_users ... WHERE migrated_to_user_id IS NULL RETURNING id` で最初に claim する。二重 migration で片方だけ成功し、もう片方は no-op になる。 | 2026-05-10 |
| Done | P0 | Guest Migration | migration 衝突時の user 優先ポリシーを実装する | `motivation_conversations_company_user_ux`, `interview_conversations_company_user_ux`, `user_pins_user_entity_ux`, `src/lib/auth/guest.ts` | user 側を上書きしない。重複する guest 側 row は内部件数を記録して削除し、非衝突 row は移行する。公開 API レスポンスは変えない。 | 2026-05-10 |
| Done | P0 | Owner Mutation | owner 条件付き update/delete helper を設計する | `src/bff/identity/owner-access.ts`, `src/bff/identity/owner-access.test.ts` | mutation SQL が `id + owner` 条件または transaction 内再検証を持つ。`returning().length === 0` は private resource 404 になる。 | 2026-05-10 |
| Done | P0 | Owner Mutation | 主要 CRUD の check-then-mutate を owner 条件付き mutation へ置き換える | `companies/[id]`, `documents/[id]`, `applications/[id]`, `deadlines/[id]`, `tasks/[id]`, `submissions/[id]`, `calendar/events/[id]` | 他人 ID では update/delete が 0 件。外部 I/O、credit confirm、通知作成が起きない route test がある。deadline / calendar の外部 sync は local mutation 成功後のみ。 | 2026-05-10 |
| Todo | P1 | BFF Interface | `Owner Access Facade` を追加する | `src/bff/identity/request-identity.ts`, `src/bff/identity/owner-access.ts`, `src/bff/api/error-response.ts` | `requireRequestIdentity(request, policy)`, `getOwnedResourceOr404(kind, id, identity)`, `assertRelatedOwner(...)` 相当の interface で route 分岐を削れる。 | 2026-05-04 |
| Todo | P1 | BFF Interface | `buildOwnerCondition(table, identity)` を SSOT 化する | route 内の手書き `identity.userId ? ... : guestId!` | mixed identity と null identity を helper で拒否し、route 側の `guestId!` を減らす。 | 2026-05-04 |
| Todo | P1 | Error Contract | 401/403/404 policy を route 実装へ反映する | `companies/[id]`, `submissions/[id]`, `calendar/events/[id]`, `notifications/*` | identity なしは `401`、private foreign owner は `404`、業務ルール禁止は `403`。snapshot または table-driven test で固定される。 | 2026-05-04 |
| Todo | P1 | Error Contract | ownership-sensitive route を `createApiErrorResponse()` へ寄せる | `applications/*`, `notifications/*`, `companies/*search*`, corporate fetch 系 | `X-Request-Id` と body `requestId` が常に返る。raw `{ error: string }` は例外リストに限定される。 | 2026-05-04 |
| Todo | P1 | CSRF | state-changing route の CSRF 適用棚卸しを作る | `src/proxy.ts`, `src/app/api/**`, `src/bff/**` | unsafe method route のうち high-risk route は proxy だけでなく route-level guard または inventory guard に含まれる。 | 2026-05-04 |
| Todo | P1 | FastAPI Boundary | owner に関わる FastAPI 呼び出しを principal 必須にする | `src/lib/fastapi/client.ts`, corporate/search/interview/gakuchika/motivation route | actor を body だけで渡す route を棚卸しし、`fetchFastApiWithPrincipal()` または同等 helper を使う。 | 2026-05-04 |
| Todo | P1 | Company RAG | 企業 RAG / 企業情報取得の巨大 route を責務分割する | `fetch-corporate/route.ts`, `fetch-info/route.ts` | auth/owner, billing, FastAPI proxy, persistence が service 単位に分離される。所有権と plan 解決は `RequestIdentity` 経由に統一される。 | 2026-05-04 |
| Todo | P1 | Search Fallback | production で FastAPI 検索失敗時に mock 候補を返さない | `src/app/api/companies/[id]/search-pages/route.ts` | production/staging では structured `503`。mock は test/dev 明示に限定される。 | 2026-05-04 |
| Todo | P2 | DB Integrity | owner mismatch 検出 SQL を運用手順に入れる | `src/lib/db/schema.ts`, `drizzle_pg/` | parent company と child resource の `user_id/guest_id` 不一致、orphan、XOR 違反を検出できる SQL が docs または script にある。 | 2026-05-04 |
| Todo | P2 | DB Integrity | partial unique / index 最適化を設計する | `motivation_conversations`, `interview_conversations`, `user_pins`, `applications` | nullable owner unique index を `WHERE user_id IS NOT NULL` / `WHERE guest_id IS NOT NULL` へ寄せる方針と migration 手順がある。`applications` owner index の必要性を判断する。 | 2026-05-04 |
| Todo | P2 | Auth Failure | session 解決例外時の guest fallback 方針を明文化する | `src/bff/identity/request-identity.ts` | 高リスク操作では session lookup error を `503` に倒すか、現行 fallback を許すかが policy と test で固定される。 | 2026-05-04 |
| Done | P0 | Planning | API 境界統一計画書を作成する | `docs/plan/auth-guest-ownership-api-boundary-plan.md` | 現状、設計判断、Task Board、完了条件、検証コマンドが記載されている。 | 2026-05-04 |

## 8. 受け入れテスト方針

### 8.1 Unit / Vitest

重点は route 単位で「副作用が起きない」ことを固定する。

- `getHeadersIdentity()` は cookie がある場合 `x-device-token` を無視する。
- `allowDeviceTokenHeader` なしでは header guest を採用しない。
- null identity と mixed identity は owner helper で拒否される。
- private resource の他人所有は `404`。
- identity なしは `401`。
- 業務ルール禁止だけ `403`。
- CSRF 失敗時は identity 解決後の mutation、外部 I/O、credit reservation/confirm が起きない。
- owner 条件付き mutation は `returning().length === 0` を 404 に倒す。

推奨コマンド:

```bash
npm run test:unit -- src/bff/identity src/lib/auth src/app/api/guest/migrate/route.test.ts src/app/api/auth/guest/route.test.ts src/app/api/csrf/route.test.ts
npm run test:unit -- src/app/api
```

### 8.2 Playwright E2E

代表 resource で横断境界を確認する。

- guest A が作った company/document/task を guest B が読めない。
- user A の resource を user B が読めない。
- guest cookie clear 後に旧 guest データへ戻れない。
- guest から user へ移行後、移行対象 resource が user として読める。
- 移行衝突時、user 側データが残る。

推奨コマンド:

```bash
npm run test:e2e -- e2e/functional/auth-boundary.spec.ts e2e/functional/guest-major.spec.ts e2e/functional/user-major.spec.ts e2e/functional/company-crud.spec.ts
```

### 8.3 FastAPI / pytest

BFF から FastAPI への principal 伝播と tenant isolation を維持する。

推奨コマンド:

```bash
cd backend && pytest backend/tests/shared/test_career_principal.py backend/tests/security/test_tenant_isolation.py backend/tests/contracts/test_bff_fastapi_contracts.py
```

## 9. DB 検証 SQL 候補

実装前に実データの不整合を把握する。

```sql
-- owner XOR 違反
select 'companies' as table_name, count(*) from companies where (user_id is null) = (guest_id is null)
union all select 'documents', count(*) from documents where (user_id is null) = (guest_id is null)
union all select 'tasks', count(*) from tasks where (user_id is null) = (guest_id is null)
union all select 'motivation_conversations', count(*) from motivation_conversations where (user_id is null) = (guest_id is null)
union all select 'interview_conversations', count(*) from interview_conversations where (user_id is null) = (guest_id is null);

-- company と document の owner 不一致
select d.id
from documents d
join companies c on c.id = d.company_id
where coalesce(d.user_id, '') <> coalesce(c.user_id, '')
   or coalesce(d.guest_id, '') <> coalesce(c.guest_id, '');

-- company と task の owner 不一致
select t.id
from tasks t
join companies c on c.id = t.company_id
where coalesce(t.user_id, '') <> coalesce(c.user_id, '')
   or coalesce(t.guest_id, '') <> coalesce(c.guest_id, '');

-- migration 衝突候補: motivation
select guest_mc.company_id, gu.id as guest_id, gu.migrated_to_user_id as user_id
from motivation_conversations guest_mc
join guest_users gu on gu.id = guest_mc.guest_id
join motivation_conversations user_mc
  on user_mc.company_id = guest_mc.company_id
 and user_mc.user_id = gu.migrated_to_user_id
where gu.migrated_to_user_id is not null;

-- migration 衝突候補: interview
select guest_ic.company_id, gu.id as guest_id, gu.migrated_to_user_id as user_id
from interview_conversations guest_ic
join guest_users gu on gu.id = guest_ic.guest_id
join interview_conversations user_ic
  on user_ic.company_id = guest_ic.company_id
 and user_ic.user_id = gu.migrated_to_user_id
where gu.migrated_to_user_id is not null;
```

## 10. 実装順序

1. P0 の `guest/migrate` CSRF と migration atomic claim を先に実装する。
2. owner_xor table 棚卸しを migration helper の SSOT にする。
3. migration 衝突を user 優先で解決する。
4. `owner-access` に owner 条件付き mutation helper と `Owner Access Facade` を追加する。
5. 主要 CRUD から check-then-mutate を置き換える。
6. 401/403/404 と structured error を ownership-sensitive route へ広げる。
7. FastAPI principal 必須 endpoint と company RAG route 分割へ進む。
8. DB integrity 検出と index/partial unique は実データ確認後に段階導入する。

## 11. Progress Log

| Date | Actor | Update |
|---|---|---|
| 2026-05-04 | Codex | 現状実装、専門サブエージェント調査、Better Auth 公式 docs 確認に基づき、API 境界統一計画を作成した。 |
| 2026-05-10 | Codex | P0 release hardening を実装。`/api/guest/migrate` の CSRF / owner table 棚卸し / atomic claim の実装済み状態を反映し、migration 衝突時は user 側を正として duplicate guest row を内部件数記録後に削除、非衝突 row を移行する方針にした。`submissions/[id]`, `deadlines/[id]`, `calendar/events/[id]` は owner-conditioned mutation とし、foreign owner は private resource `404`、業務ルール禁止のみ `403` に固定。高リスク mutation では Better Auth session 解決例外を `503` に倒す strict identity mode を追加した。 |
| 2026-05-04 | Codex | ユーザー確認により、重点は API 境界統一、形式は実装チケット型、migration 衝突は user 優先、private resource の他人所有は原則 404 に固定した。 |
