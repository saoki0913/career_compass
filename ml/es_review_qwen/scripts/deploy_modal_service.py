#!/usr/bin/env python3
"""Deploy the Qwen ES review Modal service using values from .env.local."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy the Modal Qwen ES review service.")
    parser.add_argument(
        "--env-file",
        default=str(ROOT / ".env.local"),
        help="Env file that contains Modal / HF credentials",
    )
    parser.add_argument(
        "--adapter-repo-id",
        default="saoki0913/career-compass-qwen3-es-review-lora",
        help="Hugging Face model repo id that stores the LoRA adapter",
    )
    args = parser.parse_args()

    env_values = _load_env_file(Path(args.env_file))
    required_keys = [
        "MODAL_TOKEN_ID",
        "MODAL_TOKEN_SECRET",
        "HF_TOKEN",
        "QWEN_ES_REVIEW_API_KEY",
    ]
    missing = [key for key in required_keys if not env_values.get(key)]
    if missing:
        raise SystemExit(f"Missing required env values: {', '.join(missing)}")

    env = dict(os.environ)
    env["MODAL_TOKEN_ID"] = env_values["MODAL_TOKEN_ID"]
    env["MODAL_TOKEN_SECRET"] = env_values["MODAL_TOKEN_SECRET"]
    env["HF_TOKEN"] = env_values["HF_TOKEN"]
    env["QWEN_MODAL_API_KEY"] = env_values["QWEN_ES_REVIEW_API_KEY"]
    env["QWEN_MODAL_ADAPTER_REPO_ID"] = args.adapter_repo_id

    subprocess.run(
        [
            str(ROOT / "ml" / "es_review_qwen" / ".venv-serve" / "bin" / "modal"),
            "deploy",
            str(ROOT / "ml" / "es_review_qwen" / "modal" / "serve_qwen_es_review.py"),
        ],
        check=True,
        env=env,
    )


if __name__ == "__main__":
    main()
