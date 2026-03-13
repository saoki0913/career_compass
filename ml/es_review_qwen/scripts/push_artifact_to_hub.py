#!/usr/bin/env python3
"""Upload ES review training artifacts to a private Hugging Face repo."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from huggingface_hub import HfApi


def _resolve_token(cli_token: str | None) -> str:
    token = cli_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        raise SystemExit("Missing HF_TOKEN / HUGGINGFACE_TOKEN")
    return token


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload a local folder into a Hugging Face repo.")
    parser.add_argument("--source-dir", required=True, help="Local folder to upload")
    parser.add_argument("--repo-id", required=True, help="Target Hugging Face repo id")
    parser.add_argument(
        "--repo-type",
        default="model",
        choices=["model", "dataset", "space"],
        help="Target repo type",
    )
    parser.add_argument("--path-in-repo", default="", help="Optional path prefix inside the repo")
    parser.add_argument("--token", default="", help="HF token override")
    parser.add_argument("--private", action="store_true", help="Create repo as private if missing")
    args = parser.parse_args()

    source_dir = Path(args.source_dir)
    if not source_dir.exists():
        raise SystemExit(f"Source dir not found: {source_dir}")

    token = _resolve_token(args.token or None)
    api = HfApi(token=token)
    api.create_repo(
        repo_id=args.repo_id,
        repo_type=args.repo_type,
        private=args.private,
        exist_ok=True,
    )
    commit = api.upload_folder(
        folder_path=str(source_dir),
        repo_id=args.repo_id,
        repo_type=args.repo_type,
        path_in_repo=args.path_in_repo or None,
    )
    print(
        json.dumps(
            {
                "repo_id": args.repo_id,
                "repo_type": args.repo_type,
                "path_in_repo": args.path_in_repo or "",
                "source_dir": str(source_dir),
                "commit": str(commit),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
