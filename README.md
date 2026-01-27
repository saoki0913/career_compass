# Career Compass

A modern web application built with Next.js and FastAPI.

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | FastAPI (Python) |
| Auth | Better Auth |
| Database | Turso (SQLite) |
| ORM | Drizzle |
| Storage | Cloudflare R2 |
| UI | shadcn/ui + Tailwind CSS |
| Testing | Playwright |
| Payment | Stripe |
| Deploy | Vercel |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Push database schema
npx drizzle-kit push

# Start development server
npm run dev
```

For detailed setup instructions, see [docs/setup.md](docs/setup.md).

## Development

```bash
# Start Next.js frontend
make dev

# Start FastAPI backend
make backend

# Run tests
make test

# Open Drizzle Studio
make db-studio
```

## Project Structure

```
career_compass/
├── src/
│   ├── app/           # Next.js App Router
│   ├── components/    # React components (shadcn/ui)
│   └── lib/           # Utilities (auth, db, storage, stripe)
├── backend/           # FastAPI backend
├── e2e/               # Playwright tests
└── docs/              # Documentation
```

## Environment Variables

See [.env.example](.env.example) for all required environment variables.

Key services to set up:
- **Turso** - Database ([turso.tech](https://turso.tech))
- **Cloudflare R2** - Object storage ([cloudflare.com](https://cloudflare.com))
- **Stripe** - Payments ([stripe.com](https://stripe.com))

## License

MIT
