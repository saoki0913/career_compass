# Project Structure - 就活Pass (Career Compass)

## Directory Layout

```
career_compass/
├── .kiro/
│   ├── steering/           # Project context & guidelines
│   │   ├── product.md      # Product vision & features
│   │   ├── tech.md         # Technical stack & decisions
│   │   └── structure.md    # This file
│   └── specs/              # Feature specifications
├── .claude/
│   ├── skills/             # Claude Code skills
│   └── agents/             # Agent configurations
├── docs/
│   ├── INDEX.md            # Documentation navigation
│   ├── SPEC.md             # Full product specification
│   ├── PROGRESS.md         # Implementation progress
│   ├── architecture/
│   │   ├── ARCHITECTURE.md # System architecture
│   │   └── TECH_STACK.md   # Technology inventory
│   ├── features/
│   │   ├── COMPANY_RAG.md       # RAG system
│   │   ├── COMPANY_INFO_FETCH.md # Company info extraction
│   │   ├── COMPANY_INFO_SEARCH.md # Search algorithms
│   │   ├── ES_REVIEW.md         # ES review feature
│   │   ├── GAKUCHIKA_DEEP_DIVE.md # Gakuchika deep-dive
│   │   └── MOTIVATION.md        # Motivation generation
│   ├── setup/
│   │   ├── DEVELOPMENT.md  # Development guide
│   │   └── ENV_SETUP.md    # Environment setup
│   ├── release/
│   │   └── PRODUCTION.md   # Production deployment
│   └── testing/
│       └── BACKEND_TESTS.md # Backend test docs
├── src/
│   ├── app/
│   │   ├── (auth)/               # Auth pages (login, onboarding)
│   │   ├── api/                  # API Routes
│   │   │   ├── auth/             # Better Auth handlers
│   │   │   ├── companies/        # Company CRUD + info fetching
│   │   │   ├── documents/        # ES CRUD + review + threads
│   │   │   ├── gakuchika/        # Gakuchika CRUD + conversation
│   │   │   ├── motivation/       # Motivation conversation + draft
│   │   │   ├── deadlines/        # Deadline management
│   │   │   ├── tasks/            # Task management
│   │   │   ├── calendar/         # Calendar + Google sync
│   │   │   ├── notifications/    # Notification management
│   │   │   ├── credits/          # Credit balance
│   │   │   ├── stripe/           # Checkout + portal
│   │   │   ├── webhooks/stripe/  # Stripe webhook
│   │   │   ├── applications/     # Application management
│   │   │   ├── submissions/      # Submission items
│   │   │   ├── search/           # Global search
│   │   │   ├── settings/         # User settings
│   │   │   └── dashboard/        # Dashboard data
│   │   ├── dashboard/            # Dashboard page
│   │   ├── companies/            # Company pages + [id] detail
│   │   ├── es/                   # ES document pages
│   │   ├── gakuchika/            # Gakuchika pages
│   │   ├── calendar/             # Calendar pages
│   │   ├── tasks/                # Task management page
│   │   ├── notifications/        # Notification page
│   │   ├── search/               # Global search page
│   │   ├── pricing/              # Pricing page
│   │   ├── profile/              # User profile
│   │   ├── settings/             # Settings pages
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Landing page
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── dashboard/            # Dashboard-specific components
│   │   ├── companies/            # Company feature components
│   │   ├── es/                   # ES review components
│   │   ├── gakuchika/            # Gakuchika components (STAR UI)
│   │   ├── calendar/             # Calendar components
│   │   ├── chat/                 # Chat message UI
│   │   ├── search/               # Search components
│   │   ├── deadlines/            # Deadline form/modal
│   │   ├── applications/         # Application modal
│   │   ├── submissions/          # Submission list
│   │   ├── auth/                 # Auth components
│   │   └── landing/              # Landing page sections
│   ├── hooks/                    # Custom React hooks (16+)
│   └── lib/
│       ├── auth/                 # Better Auth setup
│       ├── db/
│       │   ├── schema.ts         # Drizzle schema (24 tables)
│       │   └── index.ts          # DB client
│       ├── stripe/               # Stripe config
│       ├── credits/              # Credit management
│       ├── rate-limit/           # Rate limiting
│       └── constants/            # Constants
├── backend/
│   └── app/
│       ├── main.py               # FastAPI entry point
│       ├── config.py             # Settings (env-based)
│       ├── routers/
│       │   ├── company_info.py   # Company search + info extraction
│       │   ├── es_review.py      # ES review + template review
│       │   ├── gakuchika.py      # Gakuchika deep-dive
│       │   ├── motivation.py     # Motivation conversation
│       │   └── health.py         # Health check
│       ├── utils/
│       │   ├── llm.py            # Multi-provider LLM + circuit breaker
│       │   ├── vector_store.py   # ChromaDB operations
│       │   ├── hybrid_search.py  # Query expansion + HyDE + RRF + MMR
│       │   ├── web_search.py     # DuckDuckGo + RRF fusion
│       │   ├── bm25_store.py     # BM25 keyword index
│       │   ├── reranker.py       # Cross-encoder reranking
│       │   ├── embeddings.py     # Embedding generation
│       │   ├── text_chunker.py   # Document chunking
│       │   ├── japanese_tokenizer.py # MeCab tokenization
│       │   ├── company_names.py  # Domain/subsidiary patterns
│       │   ├── content_classifier.py # Content type classification
│       │   ├── content_types.py  # Content type constants
│       │   ├── content_type_keywords.py # Type keyword mappings
│       │   ├── intent_profile.py # Query intent classification
│       │   ├── cache.py          # RAG response caching
│       │   ├── http_fetch.py     # HTTP content fetching
│       │   └── telemetry.py      # Metric recording
│       ├── prompts/
│       │   └── es_templates.py   # 8 ES template definitions
│       └── data/
│           ├── chroma/           # ChromaDB persistent storage
│           ├── bm25/             # BM25 indices (JSON)
│           └── company_mappings.json # Domain patterns
├── drizzle/                      # DB migrations
├── e2e/                          # Playwright E2E tests
├── public/                       # Static files
├── Makefile                      # Build/dev commands
├── CLAUDE.md                     # Claude Code instructions
└── README.md                     # Project overview
```

## Naming Conventions

### Files & Folders
- **Components**: PascalCase (e.g., `CompanyCard.tsx`)
- **Pages/Routes**: kebab-case folders
- **API Routes**: kebab-case (e.g., `stripe-webhook`)
- **Utils/Libs**: camelCase (e.g., `formatDate.ts`)
- **Python**: snake_case (e.g., `hybrid_search.py`)

### Code Style
- **React Components**: Named exports, functional components
- **Server Actions**: `action` prefix or `use server` directive
- **Types**: PascalCase, suffix with type (e.g., `CompanyData`, `UserResponse`)
- **Database**: snake_case for table/column names (Drizzle camelCase maps)

## Feature Implementation Pattern

Each major feature follows this structure:
1. **Spec**: `.kiro/specs/{feature}/` with requirements, design, tasks
2. **API**: `src/app/api/{feature}/` for Next.js endpoints
3. **FastAPI**: `backend/app/routers/{feature}.py` for AI processing
4. **Pages**: `src/app/{feature}/` for UI
5. **Components**: `src/components/{feature}/` for feature-specific UI

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | Database schema (24 tables) |
| `src/lib/auth/index.ts` | Better Auth server config |
| `src/lib/stripe/config.ts` | Stripe plans & pricing |
| `src/lib/credits/index.ts` | Credit consumption logic |
| `backend/app/config.py` | FastAPI settings (models, RAG params) |
| `backend/app/main.py` | FastAPI entry point |
| `backend/app/prompts/es_templates.py` | 8 ES template definitions |
| `CLAUDE.md` | Claude Code project instructions |
