# Career Compass (就活Pass) - Agent Instructions

## Project Overview
- 就活支援アプリ「就活Pass」。
- 主機能は ES 添削、志望動機作成、ガクチカ深掘り、企業管理、締切管理、通知、Google カレンダー連携。
- UI は Next.js App Router、AI 処理と検索基盤は Python FastAPI が担う。

## Target Users
- 情報整理に不安があり、就活塾には行かずに進めたい学生
- 超高難度選考向けの専門対策より、迷わず進める管理体験を重視する層

## Tech Stack
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- Backend API: Next.js App Router (`src/app/api`)
- AI Backend: FastAPI (`backend/app`)
- Auth: Better Auth + Google OAuth
- Database: Supabase (PostgreSQL) + Drizzle ORM
- Payments: Stripe
- Search / RAG: ChromaDB, BM25, Cross-Encoder reranking
- Testing: Playwright, Vitest, pytest

---

## Skill Auto-Trigger Rules

タスク内容が次に当てはまるときは、対応する skill を自動で使う。

### 1. RAG / Retrieval
- Skills: `rag-implementation`, `rag-engineer`
- Trigger keywords: RAG, retrieval, embedding, ベクトル検索, semantic search, chunking, indexing, HyDE, query expansion
- Auto-invoke when:
  - `backend/app/utils/vector_store.py` を触る
  - `backend/app/utils/hybrid_search.py` を触る
  - RAG パイプライン、取得戦略、チャンク分割、インデックス更新を変更する

### 2. Search Quality / Ranking
- Skills: `hybrid-search-implementation`, `similarity-search-patterns`
- Trigger keywords: BM25, rerank, RRF, MMR, recall, precision, ハイブリッド検索, リランキング
- Auto-invoke when:
  - `backend/app/utils/bm25_store.py` を触る
  - `backend/app/utils/reranker.py` を触る
  - 企業検索や RAG 検索の関連度改善を行う

### 3. Prompt / LLM Output Quality
- Skill: `prompt-engineer`
- Trigger keywords: prompt, system message, JSON output, hallucination, few-shot, structured output, プロンプト
- Auto-invoke when:
  - `backend/app/prompts/` 配下を触る
  - `backend/app/utils/llm.py` を触る
  - LLM 出力形式や生成品質を改善する

### 4. ML / Inference Pipeline
- Skill: `senior-ml-engineer`
- Trigger keywords: inference, evaluation, model routing, fine-tuning, batch processing, GPU, MLOps
- Auto-invoke when:
  - 推論基盤やモデル切替ロジックを変更する
  - `backend/evals/` や `ml/` を扱う

### 5. Frontend / UI
- Skills: `frontend-design`, `ui-ux-pro-max`, `vercel-react-best-practices`, `component-refactoring`
- Trigger keywords: UI, UX, responsive, loading state, accessibility, React, Next.js, component, モバイル
- Auto-invoke when:
  - `src/components/` 配下を触る
  - `src/app/**/page.tsx` を触る
  - レイアウト、操作導線、ローディング、レスポンシブ対応を改善する

### 6. Security / Auth / Payments
- Skill: `security-review`
- Trigger keywords: auth, authorization, CSRF, XSS, secrets, API security, webhook, payment, セキュリティ
- Auto-invoke when:
  - `src/lib/auth/` を触る
  - `src/lib/csrf.ts` や `src/lib/trusted-origins.ts` を触る
  - `src/app/api/webhooks/stripe/route.ts` や課金導線を変更する

### 7. Website / SEO Audit
- Skills: `audit-website`, `seo-review`
- Trigger keywords: SEO, audit, lighthouse, meta tags, indexing, structured data
- Auto-invoke when:
  - LP、公開ページ、テンプレ、無料ツールの改善や監査を行う

---

## Current App Structure

### 1. Public Marketing Surface
- Landing page: `src/app/page.tsx`
- Pricing: `src/app/pricing`
- Contact / legal pages: `src/app/contact`, `src/app/terms`, `src/app/privacy`, `src/app/legal`
- Free tools / templates: `src/app/tools`, `src/app/templates`

### 2. Auth / Onboarding
- Login and onboarding live under `src/app/(auth)/`
- Better Auth handles session management
- Guest mode is supported via device token flow in `src/lib/auth/guest.ts`

### 3. Core Product Areas
- Dashboard: `src/app/dashboard`
- Companies: `src/app/companies`, `src/app/api/companies`
- Applications / deadlines / submissions: `src/app/api/applications`, `src/app/api/deadlines`, `src/app/api/submissions`
- ES documents and review: `src/app/es`, `src/app/api/documents`
- Motivation: `src/app/companies/[id]/motivation`, `src/app/api/motivation`
- Gakuchika: `src/app/gakuchika`, `src/app/api/gakuchika`
- Tasks / notifications / calendar / search:
  - `src/app/tasks`
  - `src/app/notifications`
  - `src/app/calendar`
  - `src/app/search`

### 4. AI Backend
- Entry point: `backend/app/main.py`
- Routers:
  - `backend/app/routers/company_info.py`
  - `backend/app/routers/es_review.py`
  - `backend/app/routers/gakuchika.py`
  - `backend/app/routers/motivation.py`
  - `backend/app/routers/health.py`
- Search / RAG utilities live in `backend/app/utils/`

---

## Core Architecture Notes

### Company Data Flow
- Next API validates auth / guest identity and ownership.
- Company info fetch and corporate info enrichment proxy to FastAPI.
- RAG source URLs, PDF ingestion jobs, and fetched timestamps are stored in Postgres.
- Deadline extraction is not auto-applied; user approval is required before persistence.

### ES Review Flow
- Documents live in Postgres and are versioned through `src/app/api/documents`.
- Review uses streaming endpoints under `src/app/api/documents/[id]/review/stream`.
- Success-only credit consumption applies after successful completion.
- Review UI and playback logic live in `src/components/es/` and `src/hooks/useESReview.ts`.

### Motivation / Gakuchika Flow
- Motivation uses conversation start, stream, and draft generation endpoints.
- Gakuchika supports guided conversation, summaries, and ES draft generation.
- Shared chat-like UI patterns live in `src/components/chat/`.

### Calendar / Notifications / Tasks
- Calendar sync is handled by Next API plus Google Calendar helpers in `src/lib/calendar/`.
- Notifications and task recommendations are first-class product flows, not secondary utilities.
- Cron routes exist under `src/app/api/cron/` for daily notifications, calendar sync, and PDF OCR processing.

---

## Business Rules

1. 成功時のみ消費
- クレジットや無料回数は、対象処理が成功したときだけ消費する。

2. JST 基準
- 日次リセット、通知、締切関連の基準時刻は `Asia/Tokyo`。

3. 締切は承認必須
- 自動抽出結果をそのまま締切として確定しない。

4. 非同期 UX
- 外部 I/O や AI 実行は、処理中表示、完了通知、失敗通知まで含めて設計する。

5. guest / user の両対応
- 多くの API はログインユーザーとゲストの両方を扱う。
- owner 判定は `userId` と `guestId` の排他的管理を前提にする。

---

## API / Error Handling Rules

### API Response Pattern
- 主要な Next API は `createApiErrorResponse()` を使って構造化エラーを返す。
- エラー応答では `userMessage` と `action` を返し、開発者向け詳細は開発環境の `debug` に閉じ込める。
- `X-Request-Id` / `requestId` を付与し、ログと突合できる状態を保つ。

### Frontend Error Pattern
- フロントでは `parseApiErrorResponse()` と `AppUiError` を使う。
- API の raw error や例外文字列を UI にそのまま出さない。
- ユーザーには短い説明と次の行動だけを見せる。

### Request Identity
- 認証済みユーザーは Better Auth セッションから解決する。
- ゲストは `x-device-token` を使って解決する。
- 共通化済みロジックは `src/app/api/_shared/request-identity.ts` にある。

---

## Data Model Notes

主要スキーマは `src/lib/db/schema.ts`。

- Better Auth tables: `users`, `sessions`, `accounts`, `verifications`
- Guest / profile: `guest_users`, `user_profiles`, `login_prompts`
- Company domain: `companies`, `applications`, `job_types`, `deadlines`, `submissions`
- Document domain: ES documents, review threads, versions
- Product domain: `notifications`, `tasks`, credits, calendar settings, Stripe-related tables
- AI ingest domain: `company_pdf_ingest_jobs`

スキーマ変更時は、既存の guest/user 両対応と cascade 設計を壊さないこと。

---

## Development Commands

### App
```bash
npm run dev
npm run build
npm run lint
```

### Tests
```bash
npm run test
npm run test:e2e
npm run test:unit
```

### Database
```bash
npm run db:push
npm run db:generate
npm run db:migrate
npm run db:studio
```

### FastAPI
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

---

## Key File Locations

### Next.js
- Pages / layouts: `src/app/`
- API routes: `src/app/api/`
- Components: `src/components/`
- Hooks: `src/hooks/`
- Shared libs: `src/lib/`
- DB schema: `src/lib/db/schema.ts`

### FastAPI
- Entry: `backend/app/main.py`
- Routers: `backend/app/routers/`
- Utils: `backend/app/utils/`
- Prompts: `backend/app/prompts/`
- Tests: `backend/tests/`
- Eval scripts: `backend/evals/`

### Documentation
- Product spec: `docs/SPEC.md`
- Progress tracker: `docs/PROGRESS.md`
- Setup docs: `docs/setup/`
- Feature docs: `docs/features/`
- Architecture docs: `docs/architecture/`
- Release docs: `docs/release/`
- Operational guardrails: `docs/ops/CLI_GUARDRAILS.md`

### Project Steering
- `.kiro/steering/product.md`
- `.kiro/steering/structure.md`
- `.kiro/steering/tech.md`

---

## Documentation Rules
- 実装判断に効く事実を優先し、古い改善メモや願望ベースの TODO は残さない。
- ドキュメント本文は日本語中心で書く。
- コマンド、パス、識別子、型名、ライブラリ名は英語のまま保つ。
- `AGENTS.md` と `CLAUDE.md` は同内容で保つ。

## Language
- 思考は任意だが、ユーザー向け説明と repo 内ドキュメント更新は日本語を基本にする。
