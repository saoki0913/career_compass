#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.prompts.notion_registry import GENERATED_PROMPTS_PATH
from app.prompts.notion_sync import (  # noqa: E402
    REQUIRED_MANAGED_PROMPT_KEYS,
    build_prompt_manifest,
    normalize_notion_prompt_page,
)


NOTION_VERSION = "2022-06-28"
DEFAULT_TOKEN_ENV = "NOTION_TOKEN"
DEFAULT_DATABASE_ENV = "NOTION_PROMPT_REGISTRY_DATABASE_ID"


def _query_notion_database(database_id: str, token: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    cursor: str | None = None

    while True:
        payload = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor

        request = urllib.request.Request(
            url=f"https://api.notion.com/v1/databases/{database_id}/query",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Notion-Version": NOTION_VERSION,
            },
            data=json.dumps(payload).encode("utf-8"),
        )
        with urllib.request.urlopen(request) as response:
            body = json.loads(response.read().decode("utf-8"))

        results.extend(body.get("results") or [])
        if not body.get("has_more"):
            return results
        cursor = body.get("next_cursor")


def _load_raw_pages(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.input:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload.get("results") or []
        if isinstance(payload, list):
            return payload
        raise ValueError("Input payload must be a JSON object with results or a JSON array")

    token = args.token or os.environ.get(DEFAULT_TOKEN_ENV, "")
    database_id = args.database_id or os.environ.get(DEFAULT_DATABASE_ENV, "")
    if not token:
        raise ValueError(f"Missing token. Set {DEFAULT_TOKEN_ENV} or pass --token.")
    if not database_id:
        raise ValueError(
            f"Missing database id. Set {DEFAULT_DATABASE_ENV} or pass --database-id."
        )
    return _query_notion_database(database_id, token)


def _diff_summary(current: dict[str, Any], new: dict[str, Any]) -> str:
    current_keys = set(current)
    new_keys = set(new)
    added = sorted(new_keys - current_keys)
    removed = sorted(current_keys - new_keys)
    changed = sorted(
        key for key in (new_keys & current_keys) if current.get(key) != new.get(key)
    )

    lines = [
        f"added={len(added)} changed={len(changed)} removed={len(removed)}",
    ]
    if added:
        lines.append(f"  + {', '.join(added[:8])}")
    if changed:
        lines.append(f"  ~ {', '.join(changed[:8])}")
    if removed:
        lines.append(f"  - {', '.join(removed[:8])}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync managed prompts from Notion Prompt Registry.")
    parser.add_argument("--input", help="Path to raw Notion query JSON for offline normalization")
    parser.add_argument("--output", default=str(GENERATED_PROMPTS_PATH), help="Generated JSON output path")
    parser.add_argument("--database-id", help="Override Notion database id")
    parser.add_argument("--token", help="Override Notion token")
    parser.add_argument("--key", action="append", default=[], help="Limit sync to one or more prompt keys")
    parser.add_argument("--apply", action="store_true", help="Write the generated JSON file")
    args = parser.parse_args()

    raw_pages = _load_raw_pages(args)
    rows = [normalize_notion_prompt_page(page) for page in raw_pages]

    required_keys = REQUIRED_MANAGED_PROMPT_KEYS
    if args.key:
        target_keys = {item.strip() for item in args.key if item.strip()}
        rows = [row for row in rows if row.get("key") in target_keys]
        required_keys = target_keys

    manifest = build_prompt_manifest(rows, required_keys=required_keys)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    current: dict[str, Any] = {}
    if output_path.exists():
        current = json.loads(output_path.read_text(encoding="utf-8"))

    print(_diff_summary(current, manifest))
    if current == manifest:
        print("No prompt changes detected.")
        return 0

    if not args.apply:
        print("Dry run only. Re-run with --apply to write the generated file.")
        return 0

    output_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
