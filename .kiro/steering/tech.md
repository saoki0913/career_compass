# Technical Context - ウカルン (Career Compass)

## Tech Stack

### Frontend
- **Framework**: Next.js 16.x (App Router)
- **Language**: TypeScript
- **UI**: React 19.x + Tailwind CSS 4.x
- **Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React

### Backend
- **API (Next.js)**: App Router API Routes
- **API (Python)**: FastAPI (AIサービス用)
- **Database**: Turso (libSQL/SQLite)
- **ORM**: Drizzle ORM

### Authentication
- **Provider**: Better Auth
- **OAuth**: Google OAuth (カレンダー連携のため必須)
- **Session**: サーバーサイドセッション

### External Services
- **Payment**: Stripe (Checkout, Webhooks, Subscriptions)
- **Storage**: Cloudflare R2 (S3互換)
- **AI**: OpenAI API / Claude API (FastAPI経由)
- **Calendar**: Google Calendar API

### Testing
- **E2E**: Playwright

## Project Structure
```
career_compass/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API Routes
│   │   │   ├── auth/        # Better Auth handlers
│   │   │   ├── checkout/    # Stripe checkout
│   │   │   └── webhooks/    # Stripe webhooks
│   │   └── (routes)/        # Page routes
│   ├── components/
│   │   └── ui/              # shadcn/ui components
│   └── lib/
│       ├── auth/            # Better Auth config
│       ├── db/              # Drizzle schema & client
│       ├── storage/         # R2 storage client
│       └── stripe/          # Stripe client
├── backend/
│   └── app/                 # FastAPI application
│       ├── routers/         # API endpoints
│       └── main.py          # FastAPI entry point
├── e2e/                     # Playwright tests
└── docs/                    # Documentation
```

## Database Schema (Planned)
- users, accounts, sessions (Better Auth)
- companies, applications, deadlines
- documents (ES, Tips, 企業分析)
- credits, subscriptions
- notifications
- templates

## Key Technical Decisions
1. **JST基準**: 日次通知、無料回数リセットはJST（Asia/Tokyo）
2. **成功時のみ消費**: クレジット/無料回数は成功時のみカウント
3. **非同期UX**: 外部I/Oは非同期実行＋結果通知
4. **Last Write Wins**: 同時編集は最後の保存を優先

## Environment Variables
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`, `R2_*`

## Development Commands
```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run db:push      # Push schema to Turso
npm run db:studio    # Open Drizzle Studio
npm run test         # Run Playwright tests
```
