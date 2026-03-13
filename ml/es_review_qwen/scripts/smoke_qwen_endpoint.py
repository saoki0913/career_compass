#!/usr/bin/env python3
"""Smoke-test the Qwen ES review endpoint via OpenAI-compatible API."""

from __future__ import annotations

import argparse
import json
import os
import re

from openai import OpenAI


THINK_BLOCK_PATTERN = re.compile(r"(?is)<think>.*?</think>\s*")


def _build_client(base_url: str, api_key: str) -> OpenAI:
    return OpenAI(base_url=base_url.rstrip("/"), api_key=api_key)


def _run_json_probe(client: OpenAI, model: str) -> dict:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "/no_think\n有効なJSONのみを返してください。"},
            {"role": "user", "content": "top3 を1件だけ返してください。"},
        ],
        temperature=0.0,
        max_tokens=600,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "es_review_probe",
                "schema": {
                    "type": "object",
                    "properties": {
                        "top3": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "category": {"type": "string"},
                                    "issue": {"type": "string"},
                                    "suggestion": {"type": "string"},
                                },
                                "required": ["category", "issue", "suggestion"],
                            },
                        }
                    },
                    "required": ["top3"],
                },
            },
        },
    )
    return json.loads(response.choices[0].message.content or "{}")


def _run_text_probe(client: OpenAI, model: str) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "/no_think\n日本語でES改善案だけを返してください。"},
            {
                "role": "user",
                "content": "学生時代に力を入れたことの改善案を80字程度で1件返してください。",
            },
        ],
        temperature=0.2,
        max_tokens=200,
    )
    content = response.choices[0].message.content or ""
    return THINK_BLOCK_PATTERN.sub("", content).strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test the Qwen ES review endpoint.")
    parser.add_argument("--base-url", default=os.environ.get("QWEN_ES_REVIEW_BASE_URL", ""))
    parser.add_argument("--api-key", default=os.environ.get("QWEN_ES_REVIEW_API_KEY", "local-qwen"))
    parser.add_argument(
        "--model",
        default=os.environ.get("QWEN_ES_REVIEW_ADAPTER_ID")
        or os.environ.get("QWEN_ES_REVIEW_MODEL", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2"),
    )
    args = parser.parse_args()

    if not args.base_url:
        raise SystemExit("Missing --base-url or QWEN_ES_REVIEW_BASE_URL")

    client = _build_client(args.base_url, args.api_key)
    json_probe = _run_json_probe(client, args.model)
    text_probe = _run_text_probe(client, args.model)
    print(
        json.dumps(
            {
                "json_probe": json_probe,
                "text_probe": text_probe,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
