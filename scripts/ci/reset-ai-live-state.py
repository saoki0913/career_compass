#!/usr/bin/env python3
"""Reset AI live test state on staging."""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
import httpx

async def reset_state(base_url: str, auth_secret: str, scope: str | None = None) -> bool:
    endpoint = f"{base_url.rstrip('/')}/api/internal/test-auth/reset-live-state"
    headers = {"Authorization": f"Bearer {auth_secret}"}
    if scope:
        headers["x-ci-e2e-scope"] = scope
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(endpoint, headers=headers)
    if resp.is_success:
        print(f"[ai-live] state reset ok: {endpoint}")
        return True
    print(f"[ai-live] state reset failed: {endpoint} status={resp.status_code}", file=sys.stderr)
    return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("PLAYWRIGHT_BASE_URL", os.getenv("AI_LIVE_BASE_URL", "")))
    parser.add_argument("--scope", default=os.getenv("CI_E2E_SCOPE", ""))
    args = parser.parse_args()
    auth_secret = os.getenv("CI_E2E_AUTH_SECRET", "").strip()
    if not auth_secret:
        print("[ai-live] CI_E2E_AUTH_SECRET not set, skipping reset", file=sys.stderr)
        sys.exit(0)
    ok = asyncio.run(reset_state(args.base_url, auth_secret, args.scope or None))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
