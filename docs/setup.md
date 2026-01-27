# Career Compass - Setup Guide

## Prerequisites

- Node.js 20+
- Python 3.12+ (for FastAPI backend)
- npm or pnpm

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

## Environment Variables Setup

### 1. Database (Turso)

1. Sign up at [turso.tech](https://turso.tech/)
2. Install Turso CLI:
   ```bash
   brew install tursodatabase/tap/turso  # macOS
   # or
   curl -sSfL https://get.tur.so/install.sh | bash
   ```
3. Login and create database:
   ```bash
   turso auth login
   turso db create career-compass
   turso db show career-compass  # Get URL
   turso db tokens create career-compass  # Get token
   ```
4. Set environment variables:
   ```
   TURSO_DATABASE_URL=libsql://career-compass-xxx.turso.io
   TURSO_AUTH_TOKEN=your-auth-token
   ```
5. Push schema to database:
   ```bash
   npx drizzle-kit push
   ```

### 2. Authentication (Better Auth)

1. Generate a secret key (min 32 characters):
   ```bash
   openssl rand -base64 32
   ```
2. Set environment variables:
   ```
   BETTER_AUTH_SECRET=your-generated-secret
   BETTER_AUTH_URL=http://localhost:3000
   ```

#### GitHub OAuth (Optional)

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL to: `http://localhost:3000/api/auth/callback/github`
4. Set environment variables:
   ```
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```

#### Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth credentials
3. Set authorized redirect URI to: `http://localhost:3000/api/auth/callback/google`
4. Set environment variables:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

### 3. Object Storage (Cloudflare R2)

1. Sign up at [cloudflare.com](https://cloudflare.com/)
2. Go to R2 in the dashboard
3. Create a new bucket
4. Create an API token with R2 read/write permissions
5. Set environment variables:
   ```
   CLOUDFLARE_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-access-key
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET_NAME=career-compass
   R2_PUBLIC_URL=https://your-custom-domain.com
   ```

### 4. Payment (Stripe)

1. Sign up at [stripe.com](https://stripe.com/)
2. Get API keys from [Dashboard](https://dashboard.stripe.com/apikeys)
3. Set environment variables:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

#### Webhook Setup (Local Development)

1. Install Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe
   ```
2. Login and forward webhooks:
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
3. Copy the webhook signing secret and set:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## FastAPI Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```

## Available Commands

```bash
# Development
make dev            # Start Next.js dev server
make backend        # Start FastAPI dev server

# Database
make db-push        # Push schema to Turso
make db-studio      # Open Drizzle Studio

# Testing
make test           # Run Playwright tests
make test-ui        # Run tests in UI mode

# Production
make build          # Build Next.js
make docker-up      # Start with Docker
```

## Project Structure

```
career_compass/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API Routes
│   │   │   ├── auth/        # Better Auth routes
│   │   │   ├── checkout/    # Stripe checkout
│   │   │   └── webhooks/    # Webhook handlers
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ui/              # shadcn/ui components
│   └── lib/
│       ├── auth/            # Better Auth config
│       ├── db/              # Drizzle + Turso
│       ├── storage/         # Cloudflare R2
│       └── stripe/          # Stripe config
├── backend/                  # FastAPI backend
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       └── routers/
├── e2e/                      # Playwright tests
├── drizzle/                  # Database migrations
└── docs/                     # Documentation
```

## Deployment

### Vercel (Next.js Frontend)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com/)
3. Set environment variables
4. Deploy

### FastAPI Backend

Option 1: Railway
1. Connect GitHub repo
2. Set root directory to `backend`
3. Set environment variables

Option 2: Docker
```bash
docker build -t career-compass-backend ./backend
docker run -p 8000:8000 career-compass-backend
```
