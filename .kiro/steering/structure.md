# Project Structure - ウカルン (Career Compass)

## Directory Layout

```
career_compass/
├── .kiro/
│   ├── steering/           # Project context & guidelines
│   │   ├── product.md      # Product vision & features
│   │   ├── tech.md         # Technical stack & decisions
│   │   └── structure.md    # This file
│   └── specs/              # Feature specifications
│       └── {feature}/      # Each feature has its own spec
│           ├── spec.json
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
├── .claude/
│   └── skills/             # Claude Code skills
├── docs/
│   ├── SPEC.md             # Full product specification
│   ├── MCP_SETUP.md        # MCP server setup guide
│   └── DEVELOPMENT.md      # Development guide
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...all]/    # Better Auth catch-all
│   │   │   ├── checkout/          # Stripe checkout session
│   │   │   ├── webhooks/stripe/   # Stripe webhook handler
│   │   │   ├── companies/         # Company CRUD (planned)
│   │   │   ├── documents/         # ES/Tips/Analysis (planned)
│   │   │   ├── deadlines/         # Deadline management (planned)
│   │   │   └── credits/           # Credit management (planned)
│   │   ├── (auth)/               # Auth pages (login, etc.)
│   │   ├── (dashboard)/          # Main dashboard
│   │   ├── companies/            # Company management pages
│   │   ├── documents/            # ES editor pages
│   │   ├── calendar/             # Calendar pages
│   │   └── settings/             # Settings pages
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── layout/               # Layout components
│   │   ├── forms/                # Form components
│   │   └── features/             # Feature-specific components
│   └── lib/
│       ├── auth/                 # Better Auth setup
│       ├── db/
│       │   ├── schema.ts         # Drizzle schema
│       │   └── index.ts          # DB client
│       ├── stripe/               # Stripe client
│       └── utils.ts              # Utility functions
├── backend/
│   └── app/
│       ├── routers/
│       │   ├── health.py         # Health check
│       │   ├── ai/               # AI endpoints (planned)
│       │   │   ├── review.py     # ES review
│       │   │   └── deepdive.py   # Gakuchika deepdive
│       │   └── scraper/          # Company info scraper (planned)
│       ├── services/             # Business logic (planned)
│       ├── config.py
│       ├── database.py
│       └── main.py
├── e2e/                          # Playwright tests
├── package.json
├── drizzle.config.ts
└── playwright.config.ts
```

## Naming Conventions

### Files & Folders
- **Components**: PascalCase (e.g., `CompanyCard.tsx`)
- **Pages/Routes**: kebab-case folders
- **API Routes**: kebab-case (e.g., `stripe-webhook`)
- **Utils/Libs**: camelCase (e.g., `formatDate.ts`)

### Code Style
- **React Components**: Named exports, functional components
- **Server Actions**: `action` prefix or `use server` directive
- **Types**: PascalCase, suffix with type (e.g., `CompanyData`, `UserResponse`)
- **Database**: snake_case for table/column names

## Feature Implementation Pattern

Each major feature follows this structure:
1. **Spec**: `.kiro/specs/{feature}/` with requirements, design, tasks
2. **API**: `src/app/api/{feature}/` for endpoints
3. **Pages**: `src/app/{feature}/` for UI
4. **Components**: `src/components/features/{feature}/` for feature-specific UI
5. **Types**: Co-located with relevant code or in `src/types/`

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/db/schema.ts` | Database schema definition |
| `src/lib/auth/index.ts` | Better Auth server config |
| `src/lib/auth/client.ts` | Better Auth client hooks |
| `src/lib/stripe/index.ts` | Stripe server client |
| `backend/app/main.py` | FastAPI entry point |
| `docs/SPEC.md` | Full product specification |
