#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Local Context =="
echo "repo: $ROOT_DIR"
if command -v git >/dev/null 2>&1; then
  echo "git:  $(git rev-parse --short HEAD 2>/dev/null || echo n/a) ($(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo n/a))"
fi
echo

echo "== Tool Versions =="
command -v node >/dev/null 2>&1 && echo "node: $(node --version)" || echo "node: (not found)"
command -v npm >/dev/null 2>&1 && echo "npm:  $(npm --version)" || echo "npm:  (not found)"
command -v python3 >/dev/null 2>&1 && echo "py:   $(python3 --version)" || echo "py:   (not found)"
echo

echo "== Vercel CLI =="
if command -v vercel >/dev/null 2>&1; then
  echo "vercel: $(vercel --version)"
  echo
  echo "[cmd] vercel whoami"
  vercel whoami || true
  echo
  echo "[cmd] vercel projects ls"
  vercel projects ls || true
  echo
  echo "[cmd] vercel ls --prod"
  vercel ls --prod || true
  echo
  echo "[cmd] vercel env ls"
  # NOTE: This lists keys, not values. Avoid commands that print secrets.
  vercel env ls || true
else
  echo "vercel: (not found)"
  echo "install: npm i -g vercel"
fi
echo

echo "== Railway CLI =="
if command -v railway >/dev/null 2>&1; then
  railway --version || true
  echo
  echo "[cmd] railway whoami"
  railway whoami || true
  echo
  echo "[cmd] railway status"
  railway status || true
  echo
  echo "[cmd] railway logs --tail 200"
  railway logs --tail 200 || true
else
  echo "railway: (not found)"
  echo "install: npm i -g @railway/cli"
fi
echo

echo "== HTTP Smoke Tests =="
if [ "$#" -eq 0 ]; then
  echo "usage:"
  echo "  scripts/diagnose-deploy.sh https://www.shupass.jp https://<your-railway-domain>/health"
else
  for url in "$@"; do
    echo
    echo "[curl] $url"
    curl -sS -o /dev/null -D - -I "$url" | sed -n '1,20p' || true
  done
fi
echo

cat <<'EOF'
== Quick Interpretation ==

Vercel "404: NOT_FOUND" (Vercel-branded page) usually means one of:
- You are hitting a domain that is not currently attached to any deployment
- The project is linked to the wrong repo/root directory, so it deployed "nothing"

Checklist:
- Vercel Project Settings > General:
  - Framework Preset: Next.js
  - Root Directory: .
  - Build Command: npm run build
- After changing Environment Variables, redeploy (env changes do not affect existing deployments)

Railway backend reachability:
- This repo binds uvicorn to ${PORT:-8000} via backend/Dockerfile.
- In Railway, do NOT hardcode PORT unless you know you must; prefer the platform-provided PORT.
- Ensure Railway healthcheckPath is /health and your service is reachable at /health.
EOF

