# Technical Context - 就活Pass (Career Compass)

## Tech Stack

### Frontend
- **Framework**: Next.js 16.x (App Router)
- **Language**: TypeScript 5.x
- **UI**: React 19.x + Tailwind CSS 4.x
- **Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React
- **Animation**: framer-motion

### Backend (Next.js API)
- **Router**: App Router API Routes
- **Database**: Turso (libSQL/SQLite)
- **ORM**: Drizzle ORM 0.45.x
- **Auth**: Better Auth 1.4.x (Google OAuth)
- **Payment**: Stripe (Checkout, Webhooks, Subscriptions)

### Backend (Python FastAPI)
- **Framework**: FastAPI 0.109.x + Uvicorn
- **AI/LLM**: Anthropic (Claude) + OpenAI (GPT)
- **Vector DB**: ChromaDB (persistent)
- **Embeddings**: OpenAI text-embedding-3-small
- **Keyword Search**: bm25s + MeCab (fugashi/unidic-lite)
- **Reranking**: sentence-transformers CrossEncoder
- **Web Search**: DuckDuckGo (ddgs) + httpx + BeautifulSoup4

## FastAPI Routers (5)

| Router | File | Purpose |
|--------|------|---------|
| company_info | `routers/company_info.py` | Company search, info extraction, RAG build |
| es_review | `routers/es_review.py` | ES scoring, template review, rewrite variants |
| gakuchika | `routers/gakuchika.py` | STAR-based deep-dive questioning |
| motivation | `routers/motivation.py` | 4-element evaluation, draft generation |
| health | `routers/health.py` | Health check |

## Backend Utils (17 modules)

| Module | Purpose |
|--------|---------|
| `llm.py` | Multi-provider LLM + circuit breaker + JSON recovery |
| `vector_store.py` | ChromaDB operations, RAG build/search |
| `hybrid_search.py` | Query expansion, HyDE, RRF, MMR, reranking pipeline |
| `web_search.py` | DuckDuckGo multi-query search + RRF fusion |
| `bm25_store.py` | BM25 keyword index management |
| `reranker.py` | Cross-encoder reranking (mmarco multilingual) |
| `embeddings.py` | OpenAI/local embedding generation |
| `text_chunker.py` | Content-type-aware document chunking |
| `japanese_tokenizer.py` | MeCab-based tokenization for BM25 |
| `company_names.py` | Domain patterns, subsidiary detection |
| `content_classifier.py` | ML-based content type classification |
| `content_types.py` | 9 content type constants |
| `content_type_keywords.py` | Type keyword mappings |
| `intent_profile.py` | Query intent classification for boost profiles |
| `cache.py` | RAG response caching |
| `http_fetch.py` | HTTP content fetching with timeout |
| `telemetry.py` | Metric recording |

## LLM Model Configuration

Feature-based model routing via `config.py`:

| Feature | Default Model | Env Variable |
|---------|--------------|--------------|
| ES Review | Claude Sonnet | MODEL_ES_REVIEW |
| Gakuchika | Claude Haiku | MODEL_GAKUCHIKA |
| Motivation | Claude Haiku | MODEL_MOTIVATION |
| Company Info | OpenAI (GPT-5-mini) | MODEL_COMPANY_INFO |
| RAG Query Expansion | Claude Haiku | MODEL_RAG_QUERY_EXPANSION |
| RAG HyDE | Claude Sonnet | MODEL_RAG_HYDE |
| RAG Rerank | Claude Sonnet | MODEL_RAG_RERANK |
| RAG Classify | Claude Haiku | MODEL_RAG_CLASSIFY |
| Selection Schedule | Claude Haiku | MODEL_SELECTION_SCHEDULE |

## Database Schema (24 tables)

### Auth: users, sessions, accounts, verifications, guestUsers
### User: userProfiles, loginPrompts
### Company: companies, applications, jobTypes, deadlines, submissionItems
### Documents: documents, documentVersions
### Gakuchika: gakuchikaContents, gakuchikaConversations
### Motivation: motivationConversations
### AI: aiThreads, aiMessages
### Credits: credits, creditTransactions, subscriptions, dailyFreeUsage
### Calendar: calendarSettings, calendarEvents
### Notifications: notifications, notificationSettings
### Templates: esTemplates, templateLikes, templateFavorites

## Key Technical Decisions
1. **JST基準**: 日次通知、無料回数リセットはJST（Asia/Tokyo）
2. **成功時のみ消費**: クレジット/無料回数は成功時のみカウント
3. **非同期UX**: 外部I/Oは非同期実行＋結果通知
4. **Last Write Wins**: 同時編集は最後の保存を優先
5. **Feature-based Model Routing**: 各機能で最適なLLMモデルを選択

## RAG Pipeline

```
Query → [Query Expansion (LLM, cached)] → [HyDE] → Multi-Query Semantic Search
  → RRF Merge (adaptive k) → MMR Diversity → [Cross-Encoder Rerank]
  → BM25 Fusion → Content-Type Boost (intent-aware) → Domain Boost → Results
```

## Development Commands
```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run db:push      # Push schema to Turso
npm run db:studio    # Open Drizzle Studio
make dev             # Start all dev servers
make test            # Run tests
```

## Environment Variables
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `MODEL_*` — Feature-specific model overrides
- `RAG_*` — RAG tuning parameters
