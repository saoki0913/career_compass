# 個人情報・機密情報保護 改善計画

**作成日**: 2026-05-04  
**対象**: 就活Pass (`career_compass`)  
**観点**: 個人情報・機密情報保護  
**深掘り軸**: 漏洩境界全体  
**本タスクの完了条件**: この計画書を作成すること。実装、migration、テスト修正、既存コード変更は行わない。

---

## 1. 目的と完了条件

就活Pass は ES 本文、ガクチカ、志望動機、面接回答、企業メモ、企業マイページ認証情報、Google Calendar token、Stripe customer/subscription 情報、問い合わせ内容を扱う。漏洩時の被害が大きいため、保存時だけでなく、API response、ログ、SSE、LLM provider 送信、RAG 永続化、analytics、テスト成果物までを一つの漏洩境界として扱う。

### 本タスクの完了条件

- [x] `docs/plan/privacy-confidential-protection-2026-05-04.md` を作成する。
- [x] 現状調査サマリ、リスク台帳、改善タスクリスト、状態更新ルール、検証コマンドを明記する。
- [x] 本タスクでは実装を行わないことを明記する。
- [x] 後続実装フェーズの完了条件をタスクごとに定義する。

### 本タスクで行わないこと

- コード実装
- DB migration 生成
- テスト追加・修正
- 既存 API / UI / backend 挙動変更
- secret 実値や `.env` 実ファイルの参照

---

## 2. 外部基準

| 基準 | この計画での使い方 |
|---|---|
| [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | Prompt Injection、Insecure Output Handling、Sensitive Information Disclosure、RAG/LLM 境界の確認。 |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Web API の認証、認可、ログ、エラー処理、データ保護、入力検証の確認。 |
| [NIST SP 800-53 Rev.5](https://csrc.nist.gov/Pubs/sp/800/53/r5/upd1/Final) | PII、監査ログ、アクセス制御、データ最小化、保持期間の整理。 |

---

## 3. 調査サマリ

### 3.1 良い現状

- `guest_device_token` は HttpOnly cookie を正本にし、DB 保存時は SHA-256 hash 化されている。
  - 根拠: `src/lib/auth/guest-cookie.ts`, `src/lib/auth/guest.ts`
- proxy が browser-visible な `x-device-token` を削除し、cookie 由来で内部 header を再構成している。
  - 根拠: `src/proxy.ts`
- 多くの user/guest 所有テーブルは `userId` / `guestId` XOR 制約を持つ。
  - 根拠: `src/lib/db/schema.ts`
- 企業 RAG 系 FastAPI endpoint は `X-Career-Principal` と `tenant_key` で actor/company scope を追加検証している。
  - 根拠: `src/lib/fastapi/career-principal.ts`, `backend/app/security/career_principal.py`, `backend/app/routers/company_info.py`
- `mypagePassword` と Google Calendar token は AES-256-GCM で暗号化される設計がある。
  - 根拠: `src/lib/crypto.ts`, `src/lib/calendar/connection.ts`
- ES review stream は reserve / confirm / refund に近い形で、成功時のみ消費を意識している。
  - 根拠: `src/bff/es-review/handle-review-stream.ts`

### 3.2 主要な漏洩境界

1. **client-visible API response**
   - DB row spread により `userId` / `guestId` が response に混ざる箇所がある。
   - 通常の企業一覧・詳細で `mypageLoginId` が露出する可能性がある。
   - 根拠候補: `src/lib/server/document-loaders.ts`, `src/app/api/documents/route.ts`, `src/app/api/documents/[id]/route.ts`, `src/lib/db/sanitize.ts`, `src/lib/server/loader-helpers.ts`

2. **ログとエラー**
   - `src/lib/logger.ts` は `extra` の string 値中心の redaction で、object/array 内の secret/PII を落とし切れない。
   - FastAPI の `secure_logger` は secret pattern 中心で、メール、電話、住所、ES 本文、会話履歴、RAG context の扱いが弱い。
   - `llm_providers.py` の `_log()` は `print()` を使い、redaction 経路を迂回する。
   - 企業 RAG/PDF 取込系の Next route に raw backend body、URL、errors 配列を `console.error` や response `extra` に出す経路がある。

3. **SSE / LLM output**
   - streaming 出力は chunk を先に流し、leakage 検知が完了後になる箇所がある。
   - `detect_output_leakage()` と `_emit_output_leakage_event()` は存在するが、現状は log-only に近く、ユーザー表示を止める設計になっていない。
   - 根拠候補: `backend/app/utils/llm_streaming.py`, `backend/app/utils/llm.py`, `backend/app/utils/llm_prompt_safety.py`

4. **analytics**
   - `trackEvent()` は PII 回避コメントのみで runtime allowlist がない。
   - `companyId` など内部 ID が GA4 event param に送られる可能性がある。
   - 根拠候補: `src/lib/analytics/client.ts`, `src/hooks/useESReview.ts`

5. **RAG / PDF / source metadata**
   - Chroma/BM25/Redis は tenant 分離が進んでいるが、chunk 本文、`source_url`, upload URL, PDF file name, query string の過保持リスクがある。
   - HyDE / query expansion cache が tenant 非依存 key になり得る。
   - PDF OCR は外部 provider へ page bytes を送るため、同意・ログ・保持の説明が必要。
   - 根拠候補: `backend/app/rag/vector_store.py`, `backend/app/rag/hybrid_search.py`, `backend/app/utils/bm25_store.py`, `backend/app/utils/pdf_ocr.py`

6. **DB / 保持期間 / migration**
   - Better Auth `accounts.access_token`, `refresh_token`, `id_token`, `password` は schema 上 `text` で、暗号化境界が明確でない。
   - 親子テーブル間の owner 整合性は DB constraint だけでは保証されていない箇所がある。
   - RLS 有効化 migration の固定配列に後発テーブルが漏れている可能性がある。
   - Google Calendar token の復号失敗時に plaintext fallback する互換経路が残っている。

7. **テスト成果物**
   - `backend/tests/output` は約 111MB あり、live AI report に元回答、rewrite、会話、token usage などが保存される。
   - 本番相当データで live/audit を走らせた場合、raw PII が成果物に残る可能性がある。

---

## 4. リスク台帳

| ID | Priority | 領域 | リスク | 根拠ファイル | 推奨対応 | Status |
|---|---|---|---|---|---|---|
| R-01 | P0 | API response | `userId` / `guestId` が client-visible response に混ざる | `src/lib/server/document-loaders.ts`, `src/app/api/documents/**` | DTO allowlist を導入し、owner 判定用 field を response から除外 | TODO |
| R-02 | P0 | credentials | `mypageLoginId` が通常企業 response に残る | `src/lib/db/sanitize.ts`, `src/lib/server/loader-helpers.ts` | 通常 response は `hasCredentials` のみ、credential は専用 API に限定 | TODO |
| R-03 | P0 | LLM/SSE | leakage 検知が streaming chunk 送信後になる | `backend/app/utils/llm_streaming.py` | chunk 表示前検査、または安全 field event のみ forward | TODO |
| R-04 | P0 | logging | nested object 内の secret/PII が redaction されない | `src/lib/logger.ts`, `backend/app/utils/secure_logger.py` | `redactDeep()` / `redact_for_log()` を導入 | TODO |
| R-05 | P0 | backend proxy | raw backend body / URL / errors 配列が log/response に出る | `src/app/api/companies/[id]/fetch-corporate/route.ts`, `fetch-corporate-upload/route.ts` | requestId, status, domain/hash, count のみログに残す | TODO |
| R-06 | P1 | analytics | GA4 に internal ID や本文断片が送信される | `src/lib/analytics/client.ts`, `src/hooks/useESReview.ts` | event param allowlist と危険 key drop | TODO |
| R-07 | P1 | calendar | Google token 復号失敗時に plaintext fallback する | `src/lib/calendar/connection.ts` | 移行期間後は fail closed + reconnect required | TODO |
| R-08 | P1 | RAG | Chroma/BM25/Redis に raw URL / upload metadata / long excerpt が残る | `backend/app/rag/**`, `backend/app/utils/bm25_store.py` | `source_hash`, `source_kind`, `metadata_schema_version` 中心に移行 | TODO |
| R-09 | P1 | test artifacts | AI live report に raw PII が残る | `backend/tests/output/**`, live report scripts | raw 本文を redacted / feature 化し、保存対象を縮小 | TODO |
| R-10 | P2 | DB crypto | `accounts` token 類の暗号化境界が不明確 | `src/lib/db/schema.ts` | Better Auth adapter 境界または token vault 化 | TODO |
| R-11 | P2 | RLS | 後発テーブルが RLS migration から漏れる | `supabase/migrations/20260215092108_enable_rls_all_tables.sql` | 現行 table 全体に deny-by-default RLS 再適用 | TODO |
| R-12 | P2 | owner integrity | 親子テーブル間 owner 一致が DB で保証されない | `src/lib/db/schema.ts` | 複合 FK または trigger による owner 整合性検査 | TODO |
| R-13 | P2 | retention | contact / AI会話 / document versions / migrated guest の保持期間が曖昧 | `src/lib/db/schema.ts`, `src/lib/auth/guest.ts` | 表単位 retention policy と cleanup job を設計 | TODO |

---

## 5. 改善タスクリスト

このタスクリストは後続実装フェーズの作業単位であり、本タスクでは実装しない。

| ID | Priority | Task | Owner候補 | Done Condition | Verification | Status |
|---|---|---|---|---|---|---|
| PLAN-01 | P0 | 個人情報・機密情報保護の計画書を作成する | orchestrator | 本ファイルが作成され、完了条件・状態更新ルール・検証コマンドを含む | `sed` / `rg` で内容確認 | DONE |
| P0-01 | P0 | client-visible DTO allowlist を設計・実装する | nextjs-developer | companies/documents/applications/tasks の通常 response から `userId`, `guestId`, `mypageLoginId`, `mypagePassword` が消える | Vitest で response payload に禁止 field がないことを確認 | TODO |
| P0-02 | P0 | credentials 表示境界を専用 API に限定する | security-auditor / nextjs-developer | 通常企業 response は `hasCredentials` のみ返し、`/credentials` だけが loginId/password を返す | API route test | TODO |
| P0-03 | P0 | Next logger の deep redaction を実装する | security-auditor | string/object/array の token, cookie, email, authorization, secret が `[REDACTED]` になる | `src/lib/logger.test.ts` | TODO |
| P0-04 | P0 | FastAPI logger と LLM provider log を redaction 経由に統一する | fastapi-developer | `_log()` が `print()` を使わず、provider raw response / prompt preview を直接出さない | pytest で fake secret/PII が log に残らない | TODO |
| P0-05 | P0 | FastAPI proxy error の log/response を要約化する | nextjs-developer / security-auditor | backend raw body, URL 一覧, errors 配列を client response と production log に出さない | route test | TODO |
| P0-06 | P0 | streaming leakage をユーザー表示前に止める | prompt-engineer / fastapi-developer | `[SYSTEM]`, role leak, schema leak が SSE chunk として forward されない | pytest streaming regression | TODO |
| P0-07 | P0 | LLM/RAG untrusted text 境界を明文化する | prompt-engineer / rag-engineer | Web/RAG/PDF 本文は「命令ではない分析対象データ」として prompt に入る | prompt safety tests | TODO |
| P1-01 | P1 | analytics param allowlist を導入する | nextjs-developer | `*Id`, `email`, `content`, `draft`, `query`, `url` が GA4 に送信されない | Vitest + E2E network mock | TODO |
| P1-02 | P1 | AI live / test output の raw PII 保存を抑制する | test-automator | report は raw answer ではなく redacted text / char_count / quality metrics を保存する | artifact scan | TODO |
| P1-03 | P1 | Google token plaintext fallback 廃止方針を実装する | security-auditor | decrypt 失敗時は plaintext 使用せず reconnect required になる | calendar connection tests | TODO |
| P1-04 | P1 | RAG source metadata を最小化する | rag-engineer | Chroma/BM25/Redis に raw query string, upload URL 内 companyId, long excerpt が残らない | tenant/RAG tests + artifact scan | TODO |
| P1-05 | P1 | Firecrawl URL guard と payload limit を統一する | fastapi-developer | Firecrawl 経路でも private IP / credential URL / unsafe redirect が拒否される | pytest URL guard | TODO |
| P2-01 | P2 | `accounts` token 暗号化 migration を設計する | database-engineer / security-auditor | token 類が DB 平文保存されず、互換期間と key rotation 方針がある | migration review + adapter tests | TODO |
| P2-02 | P2 | RLS 再適用 migration を設計する | database-engineer | 現行全 user data table に deny-by-default RLS が適用される | Supabase anon/authenticated read denial test | TODO |
| P2-03 | P2 | owner 整合性 constraint / trigger を設計する | database-engineer | 子 table owner と親 company/application/document owner の不一致 insert/update が拒否される | DB integration tests | TODO |
| P2-04 | P2 | retention policy と cleanup job を設計する | database-engineer / product-strategist | guest, contact, notifications, AI conversations, logs の保持期間が表単位に定義される | cleanup tests + docs | TODO |

---

## 6. 状態更新ルール

後続実装フェーズでは、このファイルのタスクリストを単一の進捗管理表として扱う。

### Status

| Status | 意味 |
|---|---|
| TODO | 未着手。仕様と完了条件は定義済み。 |
| IN_PROGRESS | 実装または検証中。担当者が明確。 |
| BLOCKED | 追加判断、外部 secret、migration 承認、仕様確認が必要。 |
| DONE | Done Condition と Verification を満たした。 |

### 更新手順

1. 実装前に対象 task を `TODO` から `IN_PROGRESS` に変更する。
2. 実装中に新しいリスクが見つかった場合は、リスク台帳とタスクリストに行を追加する。
3. 検証失敗時は `IN_PROGRESS` のまま、Verification 欄に失敗コマンドと原因を追記する。
4. ユーザー判断や migration 承認が必要な場合は `BLOCKED` に変更し、ブロック理由を Task 欄に追記する。
5. Verification を満たした時点で `DONE` に変更する。
6. P0 がすべて `DONE` になるまで、次のサイクルを繰り返す。
   - 調査
   - 実装
   - 検証
   - レビュー
   - タスクリスト更新

---

## 7. 後続実装フェーズの検証コマンド候補

本タスクでは実行必須ではない。実装フェーズで対象変更に応じて選択する。

### 計画書確認

```bash
sed -n '1,260p' docs/plan/privacy-confidential-protection-2026-05-04.md
rg -n "完了条件|TODO|IN_PROGRESS|BLOCKED|DONE|Verification|実装は行わない" docs/plan/privacy-confidential-protection-2026-05-04.md
```

### Next.js / BFF

```bash
npm run test:unit
npx tsc --noEmit
```

### FastAPI / LLM safety

```bash
pytest backend/tests/shared/test_prompt_safety.py backend/tests/shared/test_prompt_safety_metrics.py
pytest backend/tests/es_review/test_es_review_template_repairs.py
```

### UI / E2E

```bash
npm run test:e2e
```

### Security / artifacts

```bash
bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical
rg -n "sk-|sk-ant-|Bearer |guest_device_token|better-auth\\.session_token|@|\\[SYSTEM\\]|json_schema" backend/tests/output docs/plan
```

---

## 8. 後続フェーズの実装方針

### Phase 0: 直接漏洩を止める

優先対象は client-visible DTO、credential response、ログ redaction、raw backend error、LLM/SSE leakage、analytics allowlist。既存 DB データや migration に触らず、漏洩面を狭める。

### Phase 1: AI/RAG と運用成果物を最小化する

AI live report、RAG metadata、source URL、upload PDF、HyDE/query cache、Firecrawl guard を整理する。品質劣化を避けるため、ES/志望動機/面接で必要な企業名・大学名・活動名の扱いは feature ごとに分ける。

### Phase 2: 保存データと DB 境界を強化する

`accounts` token 暗号化、RLS 再適用、owner 整合性、retention policy、cleanup job を扱う。migration 互換性、既存データ backfill、rollback を伴うため、独立した設計レビューと staging 検証を必須にする。

---

## 9. 明示的な前提

- 本計画書作成タスクでは実装しない。
- 本計画書作成タスクでは migration を生成しない。
- 本計画書作成タスクではテストを追加・修正しない。
- 後続実装では、P0 から順に進める。
- secret 実値、`.env` 実ファイル、外部 provider の本番 secret は読まない。
- Web/RAG/PDF 由来テキストは、ユーザー入力と同じく untrusted data として扱う。
