#!/usr/bin/env python3
"""Preflight check for CI E2E auth on staging."""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
import httpx

async def run_probe(endpoint: str, bearer: str, scope: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {bearer}"}
    if scope:
        headers["x-ci-e2e-scope"] = scope
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(endpoint, headers=headers)
    return {"status": resp.status_code, "ok": resp.is_success}

async def check_auth(base_url: str, auth_secret: str, scope: str | None = None, max_attempts: int = 3) -> bool:
    endpoint = f"{base_url.rstrip('/')}/api/internal/test-auth/login"
    for attempt in range(1, max_attempts + 1):
        if not auth_secret:
            print("[ai-live] auth preflight failed: CI_E2E_AUTH_SECRET is empty", file=sys.stderr)
            return False
        invalid = await run_probe(endpoint, "invalid-secret", scope)
        valid = await run_probe(endpoint, auth_secret, scope)
        invalid_ok = invalid["status"] == 401
        valid_ok = valid["ok"]
        if invalid_ok and valid_ok:
            print(f"[ai-live] auth preflight passed: {endpoint} (attempts={attempt})")
            return True
        if attempt < max_attempts:
            await asyncio.sleep(0.25)
    print(f"[ai-live] auth preflight failed: {endpoint}", file=sys.stderr)
    return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("PLAYWRIGHT_BASE_URL", os.getenv("AI_LIVE_BASE_URL", "")))
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--scope", default=os.getenv("CI_E2E_SCOPE", ""))
    args = parser.parse_args()
    auth_secret = os.getenv("CI_E2E_AUTH_SECRET", "").strip()
    ok = asyncio.run(check_auth(args.base_url, auth_secret, args.scope or None, args.max_attempts))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
