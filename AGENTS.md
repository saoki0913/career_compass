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

## Subagent Routing

タスクを始める前に、対象領域に合うサブエージェントへ自動委譲する。各 agent の詳細は `.claude/agents/<name>.md` を参照。

| 変更対象 / 作業内容 | 委譲先 subagent |
|---|---|
| `backend/app/prompts/**`, `backend/app/utils/llm.py`, プロンプト品質 / A/B | `prompt-engineer` |
| `backend/app/utils/(vector_store\|hybrid_search\|embeddings\|text_chunker\|content_classifier).py` | `rag-engineer` |
| `backend/app/utils/(bm25_store\|reranker\|japanese_tokenizer\|web_search).py`, `improve-search` | `search-quality-engineer` |
| `backend/app/routers/**`, `backend/app/main.py`, `backend/app/utils/llm_streaming.py`, SSE ストリーミング | `fastapi-developer` |
| `src/components/**`, `src/app/**/(page\|layout\|loading).tsx` のビジュアル, marketing LP | `ui-designer` |
| `src/app/**/(page\|layout).tsx` のロジック, `src/app/api/**`, `src/hooks/`, SWR | `nextjs-developer` |
| `src/lib/db/schema.ts`, `drizzle_pg/`, マイグレーション, インデックス | `database-engineer` |
| `src/lib/auth/**`, `src/lib/csrf.ts`, `src/lib/trusted-origins.ts`, `src/app/api/webhooks/stripe/**`, `src/lib/stripe/`, `src/app/api/credits/` | `security-auditor` |
| `scripts/release/**`, `Makefile` の release targets, `make deploy`, provider CLI 操作 | `release-engineer` |
| `e2e/**`, `backend/tests/**`, `src/**/*.test.ts`, AI Live テスト | `test-automator` |
| コードレビュー、500 行超ファイルへの追加、dead code 検出 | `code-reviewer` |
| architecture gate, OMM review, PRD / RFC 作成, 大規模クロスカット | `architect` |
| マーケ LP 改善, UX / 競合 / SEO / 無料ツール戦略 | `product-strategist` |

ユーザーが「本番にデプロイして」「公開して」「リリースして」「ship it」等の自然文で依頼した場合も `release-engineer` に委譲する。

docs-only、test-only、局所的な文言修正、明らかな局所バグ修正では委譲を省略してよい。

---

## Business Rules

1. **成功時のみ消費** — クレジットや無料回数は、対象処理が成功したときだけ消費する。
2. **JST 基準** — 日次リセット、通知、締切関連の基準時刻は `Asia/Tokyo`。
3. **締切は承認必須** — 自動抽出結果をそのまま締切として確定しない。
4. **非同期 UX** — 外部 I/O や AI 実行は、処理中表示、完了通知、失敗通知まで含めて設計する。
5. **guest / user の両対応** — 多くの API はログインユーザーとゲストの両方を扱う。owner 判定は `userId` と `guestId` の排他的管理を前提にする。ゲスト識別は browser-visible header ではなく `guest_device_token` cookie を正とする。

---

## Core Architecture Notes

非自明なフローのみ記載。詳細は `docs/features/` と `.omm/` を参照。

- **Company Data Flow** — Next API で auth / ゲスト identity と所有権を検証し、企業情報取得と corporate info enrichment は FastAPI へ proxy する。RAG ソース URL、PDF ingest ジョブ、取得時刻は Postgres に保存。締切抽出結果はユーザー承認を経て初めて確定する。
- **ES Review Flow** — ドキュメントは Postgres に版管理され (`src/app/api/documents`)、レビューは `src/app/api/documents/[id]/review/stream` の SSE。成功時のみクレジット消費。
- **Motivation / Gakuchika Flow** — 会話開始 / stream / draft 生成の 3 エンドポイント構成。共通 chat-like UI は `src/components/chat/`。
- **Request Identity** — 認証済みユーザーは Better Auth session、ゲストは HttpOnly cookie から解決し、proxy が内部 `x-device-token` を再構成する。共通化済みロジックは `src/app/api/_shared/request-identity.ts`。

---

## API / Error Handling Rules

- Next API は `createApiErrorResponse()` を使って構造化エラーを返す。`userMessage` と `action` を含め、開発者向け詳細は dev 環境の `debug` にのみ出す。`X-Request-Id` / `requestId` を付与する。
- フロントでは `parseApiErrorResponse()` と `AppUiError` を使う。raw error や例外文字列を UI にそのまま出さない。
- secrets 正本は `codex-company/.secrets/career_compass`。**実ファイル (`*.env`) を直接 Read しない**。インベントリ確認は `zsh scripts/release/sync-career-compass-secrets.sh --check` のみ。

---

## UI Change Workflow (hard rules)

`src/components/**`, `src/app/**/(page|layout|loading).tsx`, `src/components/skeletons/**` を変更する前後で必ず実行する:

1. 事前: `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` → Markdown 出力を会話 / PR / 作業ログに残す
2. 変更中: `npm run lint:ui:guardrails`
3. 事後: `npm run test:ui:review -- <route>`

参照: `docs/architecture/FRONTEND_UI_GUIDELINES.md`, `DESIGN.md`, `docs/marketing/LP.md`。PR の `UI Review Routes` (`.github/PULL_REQUEST_TEMPLATE.md`) は埋める。既存画面では既存のデザインシステムを優先する。

---

## Key Commands

```bash
# tests (npm run test は存在しない)
npm run test:unit           # Vitest
npm run test:e2e            # Playwright
npm run test:ui:review -- <route>   # UI 変更後の Playwright 確認
npm run test:agent-pipeline # sync-pipeline のスナップショット

# DB (Drizzle)
npm run db:generate         # schema.ts → migration SQL
npm run db:push             # 本番同期（慎重に）
npm run db:migrate
npm run db:studio

# release
make ops-release-check      # 全ローカル変更を含める標準入口
make deploy-stage-all
make deploy                 # staged-only 明示時のみ
```

---

## Documentation Rules
- 実装判断に効く事実を優先し、古い改善メモや願望ベースの TODO は残さない。
- ドキュメント本文は日本語中心で書く。
- コマンド、パス、識別子、型名、ライブラリ名は英語のまま保つ。
- `AGENTS.md` と `CLAUDE.md` は同内容で保つ。

## Language
- 思考は任意だが、ユーザー向け説明と repo 内ドキュメント更新は日本語を基本にする。
