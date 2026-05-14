# 個人情報・機密情報保護 深掘り改善計画

> **Task state SSOT**: 実装フェーズのタスク状態は `docs/plan/plan-tasks.json` を正本とする。更新は `node scripts/plan/update-plan-task-status.mjs --id <task-id> --status <status> --source-plan <plan.md>`（または統合 JSON の完全な `id`）で行う。Markdown 内の Task Board / Task Tracker は計画本文として残すが、最新状態は統合 JSON を優先する。


作成日: 2026-05-04 JST

## 1. 目的

就活Pass の個人情報・機密情報を、収集、保存、ブラウザ返却、外部送信、ログ、削除までのライフサイクルで棚卸しし、漏洩・過剰保持・過剰送信を防ぐ実装計画へ落とし込む。

既存の `docs/plan/security-vulnerability-hardening-plan.md` と `docs/plan/auth-guest-ownership-api-boundary-plan.md` は、認証、所有権、課金、CSRF、SSRF などの脆弱性対策が主対象である。本計画は重複を避け、次に絞る。

- PII / 機密情報の保存先と返却先を allowlist 化する
- LLM / embedding / OCR / RAG / cache / email / payment provider への外部送信を最小化する
- 退会、会社削除、RAG URL 削除、guest 移行でデータ残存を検証可能にする
- ログとテレメトリから raw PII / secret / user-authored text を排除する
- 非公開・個人資料の PDF アップロードを許容しつつ、外部や他ユーザーに漏れない設計へ強化する

参照する外部基準:

- NIST Privacy Framework: `Identify-P / Govern-P / Control-P / Communicate-P / Protect-P`
- OWASP Top 10 2021 A02: Cryptographic Failures
- OWASP API Security Top 10 2023 API3: Broken Object Property Level Authorization
- 個人情報保護委員会「個人情報の保護に関する法律についてのガイドライン」通則編、安全管理措置

## 2. 完了条件

この計画書作成タスクの完了条件は次のとおり。

1. `docs/plan/personal-data-confidential-information-protection-plan.md` が存在する。
2. 現状調査、主要リスク、設計方針、タスク一覧、受け入れ条件、検証コマンドが記録されている。
3. `Task Board` は `Status / Priority / Area / Task / Evidence / Acceptance Criteria / Updated At` を持つ Markdown table で管理されている。
4. 状態更新ルールが明記され、実装フェーズで完了条件まで反復できる。
5. P0 / P1 は、後続実装者が追加判断なしで着手できる粒度になっている。
6. 計画書作成後に、ファイル存在確認、主要見出し検索、`git diff --check` が実行されている。

## 3. タスク状態更新ルール

実装フェーズでは、完了条件になるまで次のループを続ける。

1. `Task Board` から最上位 Priority の `Todo` を 1 件選ぶ。
2. 着手時に `Status` を `Doing` に変更し、`Progress Log` に開始理由を書く。
3. 外部判断、法務判断、provider 制約、環境制約で進められない場合は `Blocked` にし、必要な判断を明記する。
4. 実装と自己検証が完了したら `Review` にし、実行したテストと結果を書く。
5. 受け入れ条件を満たし、レビューで重大指摘がなければ `Done` にする。
6. `Todo / Doing / Blocked / Review` が残っている場合は 1 に戻る。

Status は以下だけを使う。

- `Todo`: 未着手
- `Doing`: 実装中
- `Blocked`: 判断待ちまたは環境要因待ち
- `Review`: 実装済み、検証またはレビュー待ち
- `Done`: 受け入れ条件を満たした

## 4. 調査体制

以下の専門観点で現状実装を監査した。いずれも実装・編集は行っていない。

| 担当 | 主な調査観点 |
|---|---|
| security-auditor | 退会、OAuth token、Google Calendar scope、ログ redaction、問い合わせ、guest token 保持 |
| database-engineer | DB schema、PII 保存カラム、削除/保持、OAuth/session token、guest 移行漏れ |
| nextjs-developer | Next API response、DB row 丸ごと返却、Calendar settings、credentials、UI error 経路 |
| fastapi-developer | FastAPI 境界、AI outbound、PDF/OCR、principal、telemetry、logging |
| rag-engineer | Chroma/BM25/Redis cache、embedding、HyDE、PDF ingest、RAG 削除検証 |
| prompt-engineer | PII masking、prompt safety、output leakage、LLM 送信最小化、品質評価 |

## 5. 現状評価

### 5.1 強い点

- `guest_device_token` は browser-visible header ではなく HttpOnly cookie を正本にし、DB には SHA-256 hash として保存している。
- `companies.mypagePassword` と Google Calendar token は AES-256-GCM で暗号化保存されている。
- 主要 RAG endpoint は `X-Career-Principal` と tenant key を導入済みで、`TENANT_KEY_SECRET` 未設定時は fail-closed する。
- SSE proxy は `internal_telemetry` を browser へ転送しない設計を持つ。
- SSRF / payload size / PDF upload size / SSE concurrency の基礎対策は既に存在する。
- TS / Python の logger は API key、Bearer token、JWT などの一部 secret redaction を持つ。

### 5.2 主要リスク

| Risk | Severity | Summary |
|---|---:|---|
| Calendar settings raw row 返却 | High | `/api/calendar/settings` が暗号化済み token や `userId` を含む DB row を返し得る |
| OAuth token 平文保存 | High | Better Auth `accounts.accessToken/refreshToken/idToken` が schema 上は `text` |
| 非公開 PDF の外部送信 | High | PDF bytes が Google Document AI / Mistral OCR、本文 chunk が embedding / RAG へ送信・保存される |
| 退会時の外部/残存 PII 未整理 | High | Stripe customer、Google revoke、contact message 匿名化、RAG 実体削除が一体化されていない |
| RAG 実体削除の非同期残存 | High | Chroma、BM25、Redis、Supabase object の削除完了を同期的に確認しにくい |
| 通常 API の credential 露出 | Medium-High | `mypageLoginId` が通常 company response に残る |
| LLM 送信最小化の未統一 | Medium-High | profile、document id、user id、会話履歴、feedback 全履歴などが feature ごとに分散管理 |
| ログ redaction の不足 | Medium-High | email/IP/UA/userId/URL query/本文 excerpt/ネスト構造が raw log に残り得る |
| 問い合わせ PII の過剰送信 | Medium | Resend 通知本文に userId/IP/User-Agent が入り得る |
| 移行済み guest row の長期残存 | Medium | migrated guest row に hashed device token と user link が残り続ける |
| Output leakage が log-only | Medium | `detect_output_leakage()` は検知しても返却前に block/regenerate しない |

## 6. データライフサイクル棚卸し

### 6.1 DB 保存

| Category | Fields / Tables | 現状 | 改善方針 |
|---|---|---|---|
| Account PII | `users.email/name/image`, `user_profiles.university/faculty/graduationYear` | 平文保存 | PII inventory に分類し、返却・外部送信・削除対象を明確化 |
| Session / OAuth secrets | `sessions.token`, `accounts.accessToken/refreshToken/idToken` | schema 上 text | 保存不要性を確認し、必要なら暗号化または hash 化 |
| Guest identifier | `guest_users.device_token` | hash 保存、移行後も残存 | 移行後 tombstone / 短期 purge |
| Company credentials | `mypageLoginId`, encrypted `mypagePassword` | password は通常返却除去、loginId は返却され得る | 通常 API では `hasCredentials` のみ |
| ES / AI content | `documents.content`, `document_versions.content`, `ai_messages.content` | user-authored text を保存 | soft delete / permanent delete / version retention を統一 |
| Motivation / Gakuchika / Interview | conversation messages, answers, feedback, drill attempts | 会話・回答・評価を保存 | PII分類、削除、LLM送信最小化、guest移行漏れ修正 |
| Calendar | encrypted tokens, event ids, sync errors | token暗号化、scope過大、sync error保存 | scope最小化、レスポンス除外、error sanitize |
| Contact | `contact_messages.email/message/ipAddress/userAgent` | 退会後も `userId set null` で残る | 最小保持 + 匿名化 + retention |

### 6.2 外部送信

| Destination | Sent Data | Risk | Policy |
|---|---|---|---|
| OpenAI / Anthropic / Google LLM | ES本文、志望動機会話、ガクチカ、面接回答、RAG context | PII/機密情報のモデル送信 | `AIOutboundPolicy` で field allowlist / max length / PII transform を宣言 |
| OpenAI embeddings | RAG本文、検索 query、dedup text | 非公開PDF本文や個人情報のベクトル化 | source kind と同意に基づき許可、削除時に vector 実体確認 |
| Google Document AI / Mistral OCR | PDF bytes | 非公開資料の外部OCR | 非公開資料は明示同意、分類、audit、削除保証を必須化 |
| Redis cache | RAG context / source excerpt / expansion cache | PIIの二次保存 | tenant key 付き、TTL、user-authored long query の cache 無効化 |
| Chroma / BM25 | chunk本文、metadata、tokens | RAG実体の残存・tenant越境 | tenant key、削除同期検証、account/company delete連動 |
| Stripe | email, customer id, metadata.userId | 決済 provider 側残存 | 退会時の匿名化/保持根拠を明文化 |
| Google Calendar | calendar events, freebusy, OAuth token | scope過大、revoke不足 | scope最小化、退会/切断時 revoke |
| Resend / email | contact本文、email、userId/IP/UA | 運用通知への過剰PII | userId/IP/UA を除外または hash |

## 7. 設計判断

### 7.1 非公開・個人 PDF の扱い

非公開・個人資料も許容する。ただし、公開企業資料と同じ軽い RAG ingest として扱わない。

- upload request は `source_kind: "corporate_public" | "private_user_material"` を持つ。
- `private_user_material` は OCR / embedding / LLM 送信先、保存先、削除方法への明示同意を必須にする。
- 未同意、source kind 未指定、危険分類、scan failure の場合は OCR / embedding / LLM へ到達させない。
- private material 由来 chunk は metadata に source kind を持ち、検索・削除・audit で区別できる。
- account delete / company delete / URL delete で private material 由来の Chroma / BM25 / Redis / Supabase object が削除されたことを検証する。

### 7.2 退会後の保持

「最小保持 + 匿名化」を採用する。

- user-owned core data は原則 cascade / hard delete。
- 法務・決済・不正対策上必要な記録だけ、userId を HMAC/hash 化して保持する。
- contact message は raw email / IP / UA / userId を削除または hash 化し、保持期限を持つ。
- Stripe customer は削除、匿名化、または決済紛争対応の保持根拠を docs に明記する。
- Google Calendar token は DB 削除だけでなく provider revoke を試行し、失敗時は retryable audit を残す。

### 7.3 企業マイページ資格情報

通常 API response から `mypageLoginId` と `mypagePassword` を外す。

- company list/detail/create/update response は `hasCredentials` のみ返す。
- 資格情報専用 route は owner check、structured error、明示操作、必要なら再認証/短期 reveal を前提にする。
- ログとテストでは login ID も credential として扱う。

### 7.4 LLM 送信最小化

全 AI feature で `AIOutboundPolicy` を導入する。

- `feature`, `destination`, `allowed_fields`, `max_chars`, `pii_transform`, `blocked_fields`, `telemetry_policy` を宣言する。
- `userId`, `guestId`, `documentId` は prompt へ入れず、principal / requestId / server log で紐付ける。
- 大学名・学部名は必要性を feature ごとに判断し、不要なら属性カテゴリへ落とす。
- 面接 feedback は全履歴ではなく、採点に必要な turn summary / evidence だけ送る。
- JSON repair など raw output 再送経路も PII / prompt fragment を再送しない。

### 7.5 ログと telemetry

ログは allowlist 方式に寄せる。

- `userId`, `guestId`, IP, email, URL query, User-Agent,本文 excerpt は raw 出力禁止。
- 必要な相関は HMAC/hash、requestId、短い reason code に置き換える。
- TS logger は `extra` のネスト構造も再帰 redaction する。
- Python logger は email / phone / URL query / Japanese free text excerpt の redaction を追加する。
- `internal_telemetry` は browser response に出さず、server side の cost summary だけに残す。

## 8. Task Board

| Status | Priority | Area | Task | Evidence | Acceptance Criteria | Updated At |
|---|---|---|---|---|---|---|
| Done | P0 | Planning | 個人情報・機密情報保護計画書を作成する | `docs/plan/personal-data-confidential-information-protection-plan.md` | 目的、現状、Task Board、状態更新ルール、検証方針が記載される。 | 2026-05-04 |
| Todo | P0 | Data Inventory | PII / 機密情報 inventory を作成する | `src/lib/db/schema.ts`, `backend/app/**`, `src/app/api/**` | table/column/category/purpose/retention/encryption/delete/external transfer/owner model が一覧化され、新規 text/jsonb column が未分類ならテストで検知される。 | 2026-05-04 |
| Todo | P0 | API Response | `/api/calendar/settings` の raw DB row 返却を allowlist serializer に置き換える | `src/app/api/calendar/settings/route.ts`, `src/lib/db/schema.ts` | `googleAccessToken`, `googleRefreshToken`, `googleTokenExpiresAt`, `googleGrantedScopes`, `userId` が GET/PUT response に出ない。 | 2026-05-04 |
| Todo | P0 | Credentials | company 通常 response から credential を除外する | `src/lib/db/sanitize.ts`, `src/app/api/companies/route.ts`, `src/app/api/companies/[id]/route.ts`, `src/app/api/companies/[id]/credentials/route.ts` | list/detail/create/update response は `hasCredentials` のみ。`mypageLoginId` / `mypagePassword` は資格情報専用 route 以外に出ない。 | 2026-05-04 |
| Todo | P0 | Token Storage | Better Auth OAuth token の保存方針を確定し保護する | `src/lib/db/schema.ts`, `src/lib/auth/index.ts` | 保存不要なら null 化、必要なら AES-GCM 暗号化、rotation、復号失敗時 reconnect を実装方針化し、DB dump から token が復元できない。 | 2026-05-04 |
| Todo | P0 | AI Outbound | `AIOutboundPolicy` を導入する | `backend/app/services/es_review`, `backend/app/services/motivation`, `backend/app/services/gakuchika`, `backend/app/routers/_interview`, `backend/app/utils/llm.py` | 各 feature が LLM/OCR/embedding に送る field、最大長、禁止 field、telemetry 可否を宣言し、payload contract test が通る。 | 2026-05-04 |
| Todo | P0 | PDF/OCR | 非公開・個人 PDF の external I/O gate を作る | `backend/app/routers/company_info_pdf.py`, `backend/app/utils/pdf_ocr.py`, `src/app/api/companies/[id]/fetch-corporate-upload/route.ts` | `source_kind`, 明示同意、分類、送信先記録がない PDF は OCR/embedding/LLM に到達しない。private material は metadata で追跡できる。 | 2026-05-04 |
| Todo | P0 | RAG Storage | private material 由来 RAG の保存先を追跡可能にする | `backend/app/rag/vector_store.py`, `backend/app/utils/bm25_store.py`, `backend/app/utils/cache.py` | Chroma metadata、BM25 JSON、Redis key/value audit に source kind / tenant key / company id / source id が入り、削除対象を正確に特定できる。 | 2026-05-04 |
| Todo | P0 | RAG Deletion | RAG 削除を同期検証可能にする | `delete-corporate-urls/route.ts`, `build_rag_source.py`, `vector_store.py` | URL削除、会社削除、退会で Chroma、BM25、Redis の削除結果が確認できる。失敗は retryable audit に残る。 | 2026-05-04 |
| Todo | P0 | Account Deletion | 退会時の外部サービス revoke / 匿名化 / 残存削除を設計する | `src/app/api/settings/account/route.ts`, `src/app/api/stripe/checkout/route.ts`, `src/lib/calendar/connection.ts`, `contact_messages` | Google revoke、Stripe customer 匿名化または保持根拠、contact 匿名化、RAG削除が退会フローに含まれ、失敗時の再試行方針がある。 | 2026-05-04 |
| Todo | P0 | Browser Payload | owner id / guest id / internal id の browser 返却を削る | `src/lib/server/*loaders.ts`, `src/app/api/documents/**`, `src/app/api/guest/migrate/route.ts` | `userId`, `guestId`, internal telemetry、不要な document content が list/create/update response に出ない。 | 2026-05-04 |
| Todo | P1 | Logging | TS / Python logger を PII allowlist + recursive redaction にする | `src/lib/logger.ts`, `backend/app/utils/secure_logger.py`, `src/lib/fastapi/sse-proxy.ts` | email/IP/UA/userId/guest token/OAuth token/ES本文/URL query が stdout/stderr に raw 出力されない snapshot test がある。 | 2026-05-04 |
| Todo | P1 | Contact | 問い合わせ保存と Resend 通知を最小化する | `src/app/api/contact/route.ts`, `src/lib/mail/contact-notifications.ts`, `contact_messages` | Resend payload に raw userId/IP/UA を含めない。DB は保持期限と匿名化方針を持つ。 | 2026-05-04 |
| Todo | P1 | Guest Retention | 移行済み guest row を tombstone / purge する | `src/lib/auth/guest.ts`, `src/app/api/guest/migrate/route.ts` | migration 後に旧 guest token から user 紐付けを復元できず、短期保持後に purge される。 | 2026-05-04 |
| Todo | P1 | Prompt Safety | PII minimization と output leakage gate を共通化する | `backend/app/utils/llm_prompt_safety.py`, `backend/app/utils/llm.py`, `backend/app/prompts/**` | 氏名、メール、電話、住所、学生番号、ログインID、secret、prompt/schema 断片を検知し、機能別に block/regenerate/log を選べる。 | 2026-05-04 |
| Todo | P1 | Motivation Profile | 志望動機の profile_context を最小化する | `src/lib/ai/user-context.ts`, `backend/app/services/motivation/prompt_fmt.py` | 大学/学部/卒年は必要な feature だけ送信し、不要時は属性カテゴリまたは省略になる。 | 2026-05-04 |
| Todo | P1 | Interview Feedback | 面接 feedback の全履歴送信を縮約する | `backend/app/routers/_interview/prompting.py`, `interview_turn_events` | feedback LLM input は採点に必要な turn summary/evidence のみに縮約され、全 conversation_history 送信を避ける。 | 2026-05-04 |
| Todo | P1 | Calendar Scope | Google Calendar OAuth scope を最小化する | `src/lib/calendar/connection.ts`, `src/lib/calendar/google.ts` | full calendar scope を必要性で分割し、作成/同期/freebusy が最小 scope で動く test がある。 | 2026-05-04 |
| Todo | P1 | FastAPI Principal | company-info search/fetch 系にも actor principal を要求する | `backend/app/routers/company_info.py`, `src/lib/fastapi/client.ts` | `search-pages`, `fetch-schedule`, `search-corporate-pages` が principal なし・scope mismatch を拒否し、actor/requestId を audit できる。 | 2026-05-04 |
| Todo | P1 | Client Error | Calendar / legacy API error を structured error に統一する | `src/app/api/calendar/google/route.ts`, `src/hooks/useCalendar.ts`, `src/lib/api-errors.ts` | Google API detail、token refresh detail、backend raw error が UI に直接出ない。 | 2026-05-04 |
| Todo | P1 | Privacy Docs | Privacy / data source policy を実装実態に合わせる | `src/app/(marketing)/privacy/page.tsx`, `src/app/(marketing)/data-source-policy/page.tsx`, `docs/features/COMPANY_RAG.md` | AI/OCR/embedding/RAG/cache/外部委託先、非公開PDFの扱い、保持/削除方針が利用者向けに説明される。 | 2026-05-04 |
| Todo | P2 | Document Retention | document soft/permanent delete の 30日ルールを統一する | `src/app/api/documents/[id]/permanent/route.ts`, `document_versions` | 30日未満 permanent delete は拒否、30日超は content/version/messages まで削除される。 | 2026-05-04 |
| Todo | P2 | Audit Log | PIIを残さない削除監査ログを設計する | account delete, RAG delete, contact anonymization | actor hash/requestId/action/status/completedAt のみを保持し、raw PII は残さない。 | 2026-05-04 |
| Todo | P2 | External Transfer Manifest | 外部送信 manifest をテスト生成する | embeddings, OCR, LLM, Resend, Stripe, Google Calendar | mock provider に渡る payload が manifest 化され、許可 field 以外の追加を検知できる。 | 2026-05-04 |

## 9. 実装順序

### Phase 1: 即時漏洩面の縮小

1. `/api/calendar/settings` allowlist serializer
2. company credentials 通常 response 除外
3. documents / loaders / guest migrate の owner id 返却削減
4. logger recursive redaction と raw `console.*` 経路の棚卸し

この phase はユーザー体験への影響が小さく、漏洩面をすぐ下げられる。

### Phase 2: AI / RAG 外部送信制御

1. `AIOutboundPolicy`
2. PDF `source_kind` / 同意 / external I/O gate
3. private material metadata と RAG 削除検証
4. output leakage gate

この phase は非公開資料を扱う前提の中核であり、FastAPI / RAG / prompt の横断設計として進める。

### Phase 3: 削除・保持・外部 provider 整合

1. 退会時の Google revoke / Stripe 匿名化 / contact 匿名化
2. guest migrated row tombstone / purge
3. document retention 30日ルール統一
4. PII削除監査ログ

この phase は法務・運用判断を含むため、保持根拠と公開文面を同時に更新する。

## 10. テスト計画

### 10.1 Vitest

推奨コマンド:

```bash
npm run test:unit -- src/app/api/calendar/settings/route.test.ts src/app/api/companies/route.test.ts src/app/api/companies/[id]/route.test.ts src/app/api/companies/[id]/credentials/route.test.ts
npm run test:unit -- src/app/api/guest/migrate/route.test.ts src/app/api/documents/route.test.ts src/app/api/documents/[id]/route.test.ts
npm run test:unit -- src/app/api/contact/route.test.ts src/app/api/settings/account/route.test.ts src/lib/logger.test.ts
```

重点ケース:

- Calendar settings response に token / userId がない。
- Company response に `mypageLoginId` / `mypagePassword` がない。
- Guest migration response に `guestId` / `userId` がない。
- Document list/create/update response に owner id と不要な本文がない。
- Contact notification payload に raw IP / UA / userId がない。
- Account deletion が Google revoke / Stripe 匿名化 / contact 匿名化 / RAG削除ジョブを呼ぶ。
- Logger がネスト構造内の PII / secret も redaction する。

### 10.2 pytest

推奨コマンド:

```bash
cd backend && pytest \
  backend/tests/security/test_ai_outbound_minimization.py \
  backend/tests/security/test_pdf_external_io_contract.py \
  backend/tests/security/test_tenant_isolation.py \
  backend/tests/shared/test_logging_redaction_contract.py \
  backend/tests/shared/test_client_telemetry_redaction.py \
  backend/tests/shared/test_ai_output_quality_contract.py
```

重点ケース:

- ES / motivation / gakuchika / interview の LLM payload が allowlist を満たす。
- 未同意 private PDF が OCR / embedding / LLM に到達しない。
- PDF filename、URL query、backend error body に PII が含まれても stdout/stderr に出ない。
- SSE / JSON response に `internal_telemetry`, model id, token cost が出ない。
- `detect_output_leakage()` が prompt/schema/role marker/入力PII再露出を fail にできる。
- tenant A の RAG 削除が tenant B の Chroma/BM25/Redis を消さない。

### 10.3 RAG 削除検証

- URL 削除: Chroma chunk、BM25 JSON document、Redis context が削除される。
- 会社削除: company 配下の RAG 実体が全削除される。
- 退会: user 配下の company/RAG/cache/storage が削除または匿名化される。
- 再取込: URL v1 -> v2 で旧 chunk が消え、別URLは残り、失敗時は旧 v1 が残る。

### 10.4 外部送信 manifest

mock provider で次を記録し、許可 field 以外の混入を検知する。

- OpenAI embeddings input
- LLM system / user messages
- PDF OCR request metadata
- Resend email payload
- Stripe customer metadata
- Google Calendar event / freebusy request

## 11. 検証 SQL 候補

```sql
-- 退会後に user_id が null 化された問い合わせの raw PII 残存確認
select count(*)
from contact_messages
where user_id is null
  and (email is not null or ip_address is not null or user_agent is not null);

-- 30日超 soft delete document
select count(*)
from documents
where status = 'deleted'
  and deleted_at < now() - interval '30 days';

-- migrated guest の長期残存
select count(*)
from guest_users
where migrated_to_user_id is not null
  and updated_at < now() - interval '7 days';

-- interview 系 guest 移行漏れ
select 'interview_conversations' as table_name, count(*)
from interview_conversations ic
join guest_users gu on gu.id = ic.guest_id
where gu.migrated_to_user_id is not null
union all
select 'interview_feedback_histories', count(*)
from interview_feedback_histories x
join guest_users gu on gu.id = x.guest_id
where gu.migrated_to_user_id is not null
union all
select 'interview_turn_events', count(*)
from interview_turn_events x
join guest_users gu on gu.id = x.guest_id
where gu.migrated_to_user_id is not null
union all
select 'interview_drill_attempts', count(*)
from interview_drill_attempts x
join guest_users gu on gu.id = x.guest_id
where gu.migrated_to_user_id is not null;

-- Google refresh token 年齢
select count(*)
from calendar_settings
where google_refresh_token is not null
  and coalesce(google_refresh_token_issued_at, google_calendar_connected_at) < now() - interval '365 days';
```

## 12. 既存計画との関係

- `security-vulnerability-hardening-plan.md`: 支払い失敗、課金 race、SSRF、CSRF、DB owner 整合性などの脆弱性修正を扱う。本計画では、同じ箇所でも PII 保存・返却・外部送信・削除に関係する場合だけ扱う。
- `auth-guest-ownership-api-boundary-plan.md`: identity / owner boundary / guest migration / API status policy を扱う。本計画では owner ID の browser 返却削減、移行済み guest row の保持削減、PII削除を扱う。
- `maintainability-clean-architecture-roadmap.md`: 構造分割計画。本計画の `AIOutboundPolicy` や serializers は、その分割後も boundary contract として維持する。

## 13. Progress Log

| Date | Status | Note |
|---|---|---|
| 2026-05-04 | Done | 現状実装を監査し、個人情報・機密情報保護の計画書を作成。実装変更は未実施。 |
