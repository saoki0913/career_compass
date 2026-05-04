# クリーンアーキテクチャ移行監査レポート

**作成日**: 2026-05-04  
**対象**: 就活Pass (`career_compass`)  
**観点**: クリーンアーキテクチャへの段階移行  
**形式**: 監査レポート。実装計画ではなく、現状把握、問題構造、移行優先度、守るべき不変条件、検証観点を整理する。  

---

## 1. Executive Summary

判定は `PASS_WITH_REFACTOR`。

就活Pass はすでにクリーンアーキテクチャへ寄せる土台を持っている。Next.js 側では `src/bff/identity/request-identity.ts`、`src/bff/api/error-response.ts`、`src/features/*/architecture.test.ts` があり、FastAPI 側でも `backend/app/services/*`、`backend/app/rag/*`、`backend/app/security/career_principal.py` へ責務分割が進み始めている。

一方で、現状の最大リスクは「境界の名前はあるが、責務の流入をまだ止め切れていない」ことにある。`src/app/api/**/route.ts` が HTTP 境界、identity、owner check、Drizzle query、課金、FastAPI proxy、エラー整形を同時に持つ箇所が多い。FastAPI でも `routers/` が use case、domain policy、prompt assembly、LLM 呼び出し、SSE formatting を抱えている。RAG は `backend/app/rag/vector_store.py` と `backend/app/rag/hybrid_search.py` に domain 判断、use case orchestration、Chroma/BM25/OpenAI adapter、cache、telemetry が混在している。

移行方針は全面作り直しではなく、既存の BFF / feature / service 分割を活かした「縦切りの段階移行」が妥当である。最初に固定すべき対象は Company info fetch 系、identity / ownership / repository 境界、FastAPI AI router の use case 抽出、RAG の ports/adapters 境界である。

クリーンアーキテクチャの判断基準は、Robert C. Martin が説明する依存方向の原則を採用する。すなわち、business rule や use case は framework、DB、UI、外部サービスの詳細に依存しない。依存は内側の policy へ向け、外側の detail は adapter として扱う。

参照:

- Robert C. Martin, The Clean Architecture: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Robert C. Martin, The Clean Architecture Dependency Rule: https://www.informit.com/articles/article.aspx?p=2832399

---

## 2. 調査範囲と根拠

### 2.1 調査した主な領域

- Next.js App Router: `src/app/(product)`, `src/app/api`
- BFF: `src/bff`
- Feature modules: `src/features`
- Shared server modules: `src/lib/server`, `src/lib/credits`, `src/lib/company-info`, `src/lib/auth`, `src/lib/db`
- FastAPI: `backend/app/routers`, `backend/app/services`, `backend/app/rag`, `backend/app/security`, `backend/app/prompts`
- DB schema: `src/lib/db/schema.ts`, `drizzle_pg/`
- Architecture docs: `docs/architecture/*`, `docs/features/*`, `.omm/*`

### 2.2 数値で見えるホットスポット

現状の規模と責務集中は以下のとおり。

| 観点 | 現状 |
|---|---:|
| `src/app/api/**/route.ts` | 107 routes |
| `src/app/api/**/route.ts` 合計行数 | 13,868 lines |
| `src` 内の Drizzle / DB 依存ファイル | 171 files |
| `backend/app/rag/vector_store.py` | 1,792 lines |
| `backend/app/rag/hybrid_search.py` | 1,410 lines |
| `backend/app/routers/es_review.py` | 1,340 lines |
| `backend/app/routers/gakuchika.py` | 1,144 lines |
| `src/lib/db/schema.ts` | 1,041 lines |

特に大きい Next API route:

| File | Lines | 監査所見 |
|---|---:|---|
| `src/app/api/companies/[id]/fetch-corporate/route.ts` | 622 | 認証、plan、owner、rate limit、source compliance、FastAPI proxy、DB 更新、PDF job、エラー整形が同居 |
| `src/app/api/companies/[id]/fetch-info/route.ts` | 559 | AI 取得、公開 URL 検証、billing policy、deadline persistence、success-only credit が密結合 |
| `src/app/api/companies/[id]/fetch-corporate-upload/route.ts` | 470 | upload、ownership、FastAPI、RAG ingest、billing の境界が薄い |
| `src/app/api/deadlines/[id]/route.ts` | 411 | 締切状態、task cascade、owner check、calendar sync が同居 |
| `src/app/api/documents/[id]/route.ts` | 369 | document update、versioning、owner、error response が同居 |

---

## 3. Current Architecture Map

### 3.1 Next.js 側

現在の依存関係は概ね以下である。

```text
src/app/(product) pages
  -> src/lib/server/*-loaders.ts
  -> 一部で db/auth へ直接依存

src/components / src/hooks
  -> fetch('/api/*')
  -> parseApiErrorResponse / AppUiError
  -> notification / analytics
  -> feature domain helpers

src/app/api/**/route.ts
  -> bff/identity
  -> lib/db/schema + Drizzle
  -> lib/server loaders / domain helpers
  -> billing policies
  -> FastAPI clients
  -> createApiErrorResponse or raw NextResponse.json

src/bff/**
  -> identity, structured error, stream orchestration
  -> lib/domain + lib/db
  -> FastAPI bridge

src/features/**
  -> domain/ui, hooks, client-api
  -> legacy src/lib/* domain modules
  -> architecture test で bff 逆依存を一部禁止
```

良い土台:

- `src/bff/identity/request-identity.ts` が `userId` / `guestId` の排他的 owner model に寄せている。
- `src/bff/api/error-response.ts` と `src/lib/api-errors.ts` が structured error の基盤になっている。
- `motivation` と `gakuchika` は `src/app/api/**/route.ts` から `src/bff/**` へ re-export する薄型 route の先例がある。
- `src/features/*/architecture.test.ts` により、feature から BFF への逆依存を禁止する方向がある。
- `src/lib/server/*-loaders.ts` は page SSR 用 read model 境界として使える。

問題:

- `src/app/api` が application service と repository を兼ねている箇所が多い。
- `src/lib` が domain、server use case、repository、integration helper、UI helper の混在場所になっている。
- hooks / components が raw `fetch` と `parseApiErrorResponse` を直接扱い、API wire contract が UI 層へ漏れている。
- page から直接 DB を読む箇所が残り、SSR composition と read model loading の境界が不均一。

### 3.2 FastAPI 側

現在の依存関係は概ね以下である。

```text
backend/app/main.py
  -> routers registration
  -> internal service auth

backend/app/routers/**
  -> FastAPI endpoint
  -> Pydantic schemas
  -> principal validation
  -> service orchestration
  -> prompt builders
  -> LLM / RAG calls
  -> SSE formatting

backend/app/services/**
  -> feature use case 候補
  -> 一部で FastAPI 型や router 的責務を保持

backend/app/rag/**
  -> chunking / retrieval / vector store / BM25 / ranking / adapter / telemetry

backend/app/security/**
  -> internal service auth
  -> CareerPrincipal
  -> payload limits / SSE concurrency

backend/app/prompts/**
  -> prompt templates / prompt builders
```

良い土台:

- `backend/app/security/career_principal.py` が `X-Career-Principal` の署名、scope、actor、plan、company_id を検証している。
- `backend/app/main.py` で主要 router へ internal auth が適用されている。
- `backend/app/prompts/**` に prompt 本体が概ね集約されている。
- `backend/app/services/es_review/*`、`backend/app/services/motivation/*`、`backend/app/services/company_info/*` が use case 抽出の受け皿になっている。

問題:

- `backend/app/services/motivation/facade.py` が `APIRouter`, `Depends`, `StreamingResponse` を持ち、service named router になっている。
- `backend/app/routers/es_review.py` は router というより orchestration monolith である。
- `backend/app/routers/gakuchika.py` が ES review router shim に依存しており、router-to-router 依存の匂いがある。
- `company_info` service が router module を注入される互換設計を持ち、依存方向が曖昧。
- SSE wire format と use case result が分離されていない。

### 3.3 DB / Persistence 側

現状、`@/lib/db` / `@/lib/db/schema` / `drizzle-orm` への直接依存が広い。HTTP route、loader、billing policy、AI stream handler が Drizzle query を直接組み、所有権判定、重複判定、クレジット消費、副作用同期が局所実装に分散している。

良い土台:

- owner XOR は主要 table に DB check として入っている。
- `src/bff/identity/owner-access.ts` に owner access helper がある。
- credits は `reserve` / `confirm` / `cancel` の考え方が導入されている。

問題:

- 子テーブル owner と親 entity owner の一致は DB では保証されていない。例: applications と companies、tasks と deadlines、documents と companies/applications。
- route 内に個別 owner verify が残り、共通 port を経由していない。
- guest migration が schema 上 guest 対応している interview 系 table を移行対象に含めていない可能性がある。
- credit balance update と ledger insert が一部で単一 transaction 境界として弱い。
- 締切完了解除時、`autoCompletedTaskIds` を読む一方で復元 update が `deadlineId + status=done` 全件を対象にする可能性がある。
- AI 抽出締切や企業作成の重複判定が select 後の app-side 判定で、同時実行に弱い。

### 3.4 AI / RAG 側

RAG の核は `backend/app/rag/` に寄り始めているが、現状は module 内の責務が大きい。

問題:

- `backend/app/rag/vector_store.py` が Chroma client、collection naming、tenant filter、metadata schema、chunk 保存、embedding 生成、BM25 更新、cache invalidation、prompt context 整形を同居させている。
- `backend/app/rag/hybrid_search.py` が retrieval profile、content type boost、priority source boost、BM25、MMR、RRF、LLM query expansion / HyDE、reranker、telemetry を同居させている。
- `backend/app/utils/embeddings.py` は `EmbeddingBackend` という domain 寄り概念と OpenAI client singleton / SDK 呼び出しが同居している。
- `backend/app/utils/content_classifier.py` は rule-based 分類、LLM fallback、prompt 文が同居している。
- `backend/app/services/motivation/draft.py` が ES review grounding helper を import 経由で再利用し、企業根拠カード評価が feature 間で密結合している。

---

## 4. Major Boundary Violations

### 4.1 Route handler が adapter を超えている

Clean Architecture では HTTP route は adapter であり、request から principal と validated DTO を作り、use case を呼び、response に変換する場所に留めるべきである。

現状の `src/app/api/companies/[id]/fetch-corporate/route.ts`、`fetch-info/route.ts`、`fetch-corporate-upload/route.ts` は、HTTP 境界と application business rule と infrastructure detail が混在している。Company info は AI/RAG/credit/deadline approval が絡むため、境界違反の影響が大きい。

監査判断:

- Company info fetch 系は最優先の縦切り対象。
- ただし一気に rewrite せず、現行 route の behavior を contract test で固定してから BFF route、server use case、repository、FastAPI client adapter へ段階的に分けるべき。

### 4.2 `src/lib` が layered architecture の逃げ場になっている

`src/lib` は便利な共有置き場として成長し、domain helper、server loader、repository 的 query、integration、security、billing、UI-facing parser が混在している。

監査判断:

- `src/lib` を即時解体する必要はない。
- 先に「新規追加禁止の依存方向」を決めるべき。
- feature domain は `@/lib/db`, `@/bff`, `next/server` を import しない。
- UI component は `@/lib/db`, `@/bff` を import しない。
- server use case / repository は `src/lib/server` または将来の `src/server/<feature>` に寄せる。

### 4.3 Persistence と ownership が route に分散している

owner check は security boundary であり、repository の後段に押し込むと tenant 越境につながる。

監査判断:

- `OwnerScope` または `Principal` を use case の必須 input にする。
- repository は `findOwnedById(id, principal)` を基本形にする。
- 裸の `findById` は admin/internal 限定にする。
- `userId?: string; guestId?: string` のような曖昧型は避け、`AuthenticatedUser | Guest | Anonymous` の排他的 union にする。

### 4.4 FastAPI router が use case と presenter を兼ねている

`backend/app/routers/es_review.py` と `backend/app/routers/gakuchika.py` は、HTTP/SSE adapter 以上の責務を持っている。`services/motivation/facade.py` は service 配下に router が存在するため、命名と責務が一致していない。

監査判断:

- FastAPI router は `Depends`、rate limit、principal extraction、HTTP/SSE response conversion に寄せる。
- use case は `backend/app/services/<feature>` または将来の `backend/app/application/<feature>` に置く。
- domain policy は `backend/app/domain/<feature>` または feature service 内の pure module に置く。
- `HTTPException`, `APIRouter`, `StreamingResponse` は use case から排除する方向で architecture test を追加する。

### 4.5 RAG が clean boundary なしに肥大化している

RAG は品質劣化リスクが高く、単純な分割で ranking や index 互換を壊しやすい。Clean Architecture 移行では behavior preservation が最優先である。

監査判断:

- まず `EmbeddingPort`, `VectorIndexPort`, `KeywordIndexPort`, `RerankerPort`, `QueryExpansionPort` を Protocol / interface として定義する。
- 既存 `vector_store.py` と `hybrid_search.py` は互換 facade として残す。
- chunking、metadata mapper、prompt context formatter の pure function 化から始める。
- embedding model、chunk boundary、collection naming、document id、metadata shape を変える場合は reindex 計画が必要。

---

## 5. Security And Business Invariants

Clean Architecture 移行中も、以下は絶対に弱めない。

### 5.1 Identity / ownership

- `Principal` は `AuthenticatedUser(userId)`、`Guest(guestId)`、`Anonymous` の排他的 union にする。
- owner access に `userId` と `guestId` の同時存在、または同時 null を渡さない。
- DB の owner XOR check constraint は残す。application 層だけの invariant に格下げしない。
- guest 識別の正本は HttpOnly `guest_device_token` cookie。
- browser-visible `x-device-token` は信頼しない。
- proxy は cookie から内部 header を再構成し、外部 request header は strip してから必要な内部 header を付与する。

### 5.2 CSRF / Origin / route boundary

- state-changing API は Origin allowlist と double-submit CSRF を通す。
- Better Auth catch-all と自前 `/api/auth/*` は分ける。
- webhook は CSRF 例外だが、代わりに署名検証を必須にする。
- server action を追加する場合も、route handler と同等の principal / CSRF equivalent guard を設計対象にする。

### 5.3 Stripe / billing

- Stripe plan は price id から決定し、metadata plan を信用しない。
- Stripe event は処理前に unique claim し、処理失敗時は claim を削除して retry 可能にする。
- webhook signature verification と raw body は adapter 外へ漏らさない。
- checkout metadata だけで課金状態を更新しない。

### 5.4 Credits

- クレジットは「成功して永続化された後」だけ確定する。
- stream 系は `reserve -> confirm/cancel` を維持する。
- FastAPI error、client cancel、persistence failure、不正 complete event では confirm しない。
- balance update と ledger insert は transaction boundary として扱う。

### 5.5 Deadlines / tasks

- 締切は承認必須。AI 抽出結果をそのまま確定締切にしない。
- 締切確定、task generation、deadline update は transaction boundary として扱う。
- 締切完了解除は auto completed task のみを戻す。
- calendar sync のような外部 I/O は DB transaction 外へ置き、将来的には outbox / retry job 化する。

---

## 6. Migration Priority Themes

### P0. Company info fetch 系の縦切り

対象:

- `src/app/api/companies/[id]/fetch-corporate/route.ts`
- `src/app/api/companies/[id]/fetch-info/route.ts`
- `src/app/api/companies/[id]/fetch-corporate-upload/route.ts`

狙い:

- HTTP adapter、application use case、repository、FastAPI adapter、billing policy を分ける。
- success-only credit と deadline approval を壊さない。
- public URL guard、source compliance、plan/quota、owner check を一箇所で説明できる状態にする。

監査上の推奨順:

1. 現行 behavior の contract test を固定する。
2. `src/bff/company-info/routes/*` へ route adapter を寄せる。
3. `src/lib/company-info/server/*` または `src/server/company-info/*` に use case を作る。
4. owner-aware repository と FastAPI client adapter を分離する。
5. route は principal 解決、DTO validation、use case 呼び出し、structured error conversion のみへ薄くする。

### P0. Identity / ownership / repository 境界の固定

対象:

- `src/bff/identity/request-identity.ts`
- `src/bff/identity/owner-access.ts`
- `src/lib/auth/guest.ts`
- `src/lib/db/schema.ts`
- owner を持つ route / repository 候補

狙い:

- use case に `NextRequest`, `headers()`, `cookies()`, Better Auth API を持ち込まない。
- repository が owner-aware query を標準にする。
- guest migration の対象 table を schema 由来で棚卸しできるようにする。

監査上の推奨順:

1. `Principal` / `OwnerScope` 型の方針を固定する。
2. owner-aware repository function を company / deadline / task / document から導入する。
3. guest-owned table inventory test を追加する。
4. route 内の個別 owner verify を共通境界へ寄せる。

### P0. FastAPI AI router の use case 抽出

対象:

- `backend/app/routers/es_review.py`
- `backend/app/routers/gakuchika.py`
- `backend/app/services/motivation/facade.py`
- `backend/app/routers/_interview/*`

狙い:

- router は FastAPI adapter に限定する。
- prompt assembly、LLM orchestration、retry decision、draft quality、SSE event shaping を分ける。
- Next BFF との contract を維持する。

監査上の推奨順:

1. `PrincipalContext` dependency を共通化する。
2. SSE presenter を抽出する。
3. `gakuchika.py` の schema / quality / draft use case を分離する。
4. `es_review.py` の stream orchestration を use case へ寄せる。
5. `services/motivation/facade.py` から `APIRouter` を router 側へ戻す。

### P1. RAG ports/adapters 導入

対象:

- `backend/app/rag/vector_store.py`
- `backend/app/rag/hybrid_search.py`
- `backend/app/utils/embeddings.py`
- `backend/app/utils/content_classifier.py`
- `backend/app/services/company_info/build_rag_source.py`

狙い:

- RAG の quality と index 互換を守りながら、domain / use case / adapter を分ける。
- Chroma、BM25、OpenAI、CrossEncoder、cache を adapter として扱う。
- prompt context generation を pure function として snapshot 比較できるようにする。

互換維持必須:

- collection name: `company_info__{provider}__{model}` と `__ctx`
- metadata: `company_id`, `tenant_key`, `source_url`, `content_type`, `secondary_content_types`, `chunk_index`, `ingest_session_id`, `embedding_provider`, `embedding_model`
- source document id 形式
- BM25 path/key の `tenant_key` 境界

### P1. Architecture tests による依存方向の固定

対象:

- `src/features/*/architecture.test.ts`
- `src/bff/*/architecture.test.ts`
- `backend/tests/architecture/*`

狙い:

- 新規コードが旧構造へ逆流しないようにする。
- 大規模移行より先に「これ以上悪化しない」ゲートを作る。

禁止候補:

- `src/features/**` から `@/bff`, `@/lib/db`, `next/server`
- `src/components/**` から `@/bff`, `@/lib/db`
- backend use case から `APIRouter`, `HTTPException`, `StreamingResponse`
- backend domain から LLM / RAG / DB / FastAPI

---

## 7. Target Architecture

### 7.1 Next.js target

```text
src/app/api/**/route.ts
  - route re-export or thin HTTP adapter
  - request id / principal / csrf-origin boundary
  - DTO validation
  - use case call
  - structured error conversion

src/bff/<feature>/**
  - BFF route handlers
  - FastAPI proxy / SSE bridge
  - identity and billing policy adapter

src/server/<feature> or src/lib/server/<feature>
  - server use cases
  - read models
  - transaction orchestration
  - ownership-aware repositories

src/features/<feature>/**
  - domain: pure types, rules, parsers
  - application: client API contract
  - hooks: view model / controller
  - ui: feature-owned UI composition

src/components/**
  - shared presentational components
  - no DB / BFF dependency

src/lib/integrations/**
  - FastAPI, Stripe, Google, Supabase Storage adapters
```

### 7.2 FastAPI target

```text
backend/app/routers/<feature>.py
  - FastAPI endpoint
  - Depends / rate limit / principal extraction
  - HTTP or SSE response conversion

backend/app/application/<feature> or backend/app/services/<feature>
  - use case orchestration
  - no APIRouter / StreamingResponse
  - returns application result or event stream objects

backend/app/domain/<feature>
  - deterministic business rules
  - no FastAPI / LLM / RAG / DB import

backend/app/ports
  - LLMClient
  - StreamingLLMClient
  - VectorIndexPort
  - KeywordIndexPort
  - RerankerPort
  - WebFetcher
  - PdfTextExtractor

backend/app/adapters
  - OpenAI / Qwen / Chroma / BM25 / CrossEncoder / HTTP / PDF adapters
```

---

## 8. Test And Verification Gates

### 8.1 Plan / audit document verification

計画書自体の確認:

```bash
sed -n '1,260p' docs/plan/clean-architecture-migration-audit-2026-05-04.md
git diff -- docs/plan/clean-architecture-migration-audit-2026-05-04.md
```

### 8.2 Future implementation gates

本レポートは実装を行わないが、将来この移行を実施する場合の検証ゲートは以下。

TypeScript:

```bash
npx tsc --noEmit
npm run test:unit
```

Frontend architecture:

```bash
npm run test:unit -- src/features/gakuchika/architecture.test.ts
npm run test:unit -- src/features/motivation/architecture.test.ts
npm run test:unit -- src/features/company-info/architecture.test.ts
```

FastAPI architecture / contracts:

```bash
pytest backend/tests/architecture
pytest backend/tests/contracts
pytest backend/tests/shared/test_career_principal.py
pytest backend/tests/shared/test_sse_concurrency.py
```

Feature-specific:

```bash
pytest backend/tests/es_review
pytest backend/tests/gakuchika
pytest backend/tests/motivation
pytest backend/tests/company_info
pytest backend/tests/interview
```

RAG:

```bash
pytest backend/tests/company_info/test_vector_store_source_replacement.py
pytest backend/tests/company_info/test_embeddings_batch_fallback.py
pytest backend/tests/company_info/test_content_classifier.py
pytest backend/tests/rag_eval
```

Security / billing:

```bash
npm run test:unit -- src/bff/identity/request-identity.test.ts
npm run test:unit -- src/bff/identity/owner-access.test.ts
npm run test:unit -- src/lib/credits/reservations.test.ts
npm run test:unit -- src/app/api/webhooks/stripe/route.test.ts
```

UI route 変更を伴う場合のみ:

```bash
npm run lint:ui:guardrails
npm run test:ui:review -- <route>
```

---

## 9. Anti-goals / Forbidden Shortcuts

この移行で避けるべきこと。

- Clean Architecture を folder rename として扱う。
- `src/lib` の中身を機械的に移動するだけで責務を整理しない。
- use case から `NextRequest`, `headers()`, `cookies()`, Better Auth API を直接読む。
- `guestId` を request body、query、browser-visible header から受け取る。
- `OwnerIdentity = { userId?: string; guestId?: string }` のような曖昧型を増やす。
- repository に裸の `findById` を増やし、呼び出し側で後から owner check する。
- Stripe webhook を通常 user session 前提の controller に混ぜる。
- `reserveCredits` 後の例外経路で `cancelReservation` を省略する。
- RAG の refactor と同時に ranking policy、embedding model、chunking policy を変える。
- prompt や LLM parameter を refactor と同時に変える。
- server action を「内部だから安全」として CSRF / principal 境界から外す。

---

## 10. Appendix: 専門調査所見の要約

### Architect

現行の `src/bff` / `src/features` / FastAPI service 分割は土台になる。ただし `src/app/api` と `src/lib` に責務が残りすぎているため、境界固定を先に進めるべき。

### Next.js

107 route のうち多くが DB query、billing、FastAPI proxy、error shaping を直接持つ。Company info fetch 系が最優先。Product page の直接 DB read と client mega-page も整理対象。

### FastAPI

`routers/` が use case、domain policy、prompt assembly、LLM、SSE formatting を抱える。`services/motivation/facade.py` は service named router になっている。SSE presenter と use case result の分離が必要。

### Database

Drizzle 直接依存が広く、owner check、duplicate detection、transaction boundary が分散。guest migration の table inventory、credit ledger、deadline/task transaction を優先して監査すべき。

### Security

Clean Architecture 化で request / headers / cookies 解決を use case に持ち込むと、guest cookie 優先、CSRF、Stripe 署名、success-only credit の境界が崩れやすい。security invariants は architecture rule より優先する。

### RAG

`vector_store.py` と `hybrid_search.py` が最大ホットスポット。ports/adapters 導入は有効だが、index 互換と retrieval regression を先に固定する必要がある。

---

## 11. 結論

就活Pass の Clean Architecture 移行は可能であり、すでに部分的な移行は始まっている。ただし、現状は「正しい置き場が存在する」段階であり、「間違った依存が入れない」段階にはまだ達していない。

最初にやるべきことは、大規模な移動ではなく、境界の固定である。具体的には、Company info fetch 系を縦切りで監査・移行し、identity / ownership / repository / transaction の安全境界を定義し、FastAPI AI router と RAG の ports/adapters を behavior-preserving に分離する。

この順序なら、就活Pass の重要な business rule である「成功時のみ消費」「JST 基準」「締切は承認必須」「guest / user の両対応」を守りながら、依存方向を内側へ揃えられる。
