#!/usr/bin/env python3
"""Run a served Qwen ES review model against the holdout split."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI


THINK_BLOCK_PATTERN = re.compile(r"(?is)<think>.*?</think>\s*")


IMPROVEMENT_SCHEMA = {
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
}


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def _extract_prompt_pair(messages: list[dict[str, Any]]) -> tuple[str, str]:
    system_prompt = ""
    user_prompt = ""
    for message in messages:
        role = str(message.get("role") or "")
        content = str(message.get("content") or "")
        if role == "system" and not system_prompt:
            system_prompt = content
        elif role == "user" and not user_prompt:
            user_prompt = content
    if not system_prompt or not user_prompt:
        raise ValueError("SFT record must include system/user messages")
    return system_prompt, user_prompt


def _build_prompt_index(
    sft_rows: list[dict[str, Any]],
    *,
    split: str,
) -> dict[str, dict[str, tuple[str, str]]]:
    prompt_index: dict[str, dict[str, tuple[str, str]]] = {}
    for row in sft_rows:
        metadata = row.get("metadata") or {}
        if str(metadata.get("split") or "") != split:
            continue
        source_case_id = str(metadata.get("source_case_id") or "").strip()
        task = str(row.get("task") or "").strip()
        messages = row.get("messages")
        if not source_case_id or task not in {"improvement_top3", "rewrite_text"} or not isinstance(messages, list):
            continue
        prompt_index.setdefault(source_case_id, {})[task] = _extract_prompt_pair(messages)
    return prompt_index


def _extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return THINK_BLOCK_PATTERN.sub("", content).strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return THINK_BLOCK_PATTERN.sub("", "".join(parts)).strip()
    return ""


def _ensure_no_think(system_prompt: str) -> str:
    stripped = system_prompt.lstrip()
    if stripped.startswith("/no_think"):
        return system_prompt
    return f"/no_think\n{system_prompt}"


async def _request_json(
    client: AsyncOpenAI,
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: int,
) -> list[dict[str, Any]] | None:
    response = await client.with_options(timeout=timeout_seconds).chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _ensure_no_think(system_prompt)},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.15,
        max_tokens=320,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "es_review_holdout_top3",
                "schema": IMPROVEMENT_SCHEMA,
                "strict": True,
            },
        },
    )
    content = _extract_text_content(response.choices[0].message.content if response.choices else "")
    if not content:
        return None
    payload = json.loads(content)
    top3 = payload.get("top3")
    return top3 if isinstance(top3, list) else None


async def _request_text(
    client: AsyncOpenAI,
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    char_max: int | None,
    timeout_seconds: int,
) -> str:
    response = await client.with_options(timeout=timeout_seconds).chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _ensure_no_think(system_prompt)},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=min(900, max(360, int((char_max or 500) * 2.0))),
    )
    return _extract_text_content(response.choices[0].message.content if response.choices else "")


async def _predict_case(
    client: AsyncOpenAI,
    *,
    model: str,
    teacher_row: dict[str, Any],
    prompts: dict[str, tuple[str, str]],
    improvement_timeout_seconds: int,
    rewrite_timeout_seconds: int,
) -> dict[str, Any]:
    improvement_prompt = prompts.get("improvement_top3")
    rewrite_prompt = prompts.get("rewrite_text")
    if not improvement_prompt or not rewrite_prompt:
        raise ValueError("missing holdout prompts for one or more tasks")

    prediction_top3 = await _request_json(
        client,
        model=model,
        system_prompt=improvement_prompt[0],
        user_prompt=improvement_prompt[1],
        timeout_seconds=improvement_timeout_seconds,
    )
    prediction_rewrite = await _request_text(
        client,
        model=model,
        system_prompt=rewrite_prompt[0],
        user_prompt=rewrite_prompt[1],
        char_max=int(teacher_row["char_max"]) if teacher_row.get("char_max") is not None else None,
        timeout_seconds=rewrite_timeout_seconds,
    )
    return {
        **teacher_row,
        "prediction_top3": prediction_top3,
        "prediction_rewrite": prediction_rewrite,
        "prediction_error": None,
    }


async def _run(args: argparse.Namespace) -> None:
    teacher_rows = _load_jsonl(Path(args.teacher_records))
    sft_rows = _load_jsonl(Path(args.sft_records))
    prompt_index = _build_prompt_index(sft_rows, split=args.split)
    selected_rows = [row for row in teacher_rows if str(row.get("split") or "") == args.split]
    if args.max_cases:
        selected_rows = selected_rows[: args.max_cases]

    client = AsyncOpenAI(
        api_key=args.api_key,
        base_url=args.base_url.rstrip("/"),
        timeout=args.timeout_seconds,
    )
    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    output_rows: list[dict[str, Any]] = []

    async def _worker(teacher_row: dict[str, Any]) -> None:
        async with semaphore:
            case_id = str(teacher_row.get("id") or "<unknown>")
            prompts = prompt_index.get(case_id)
            if not prompts:
                output_rows.append(
                    {
                        **teacher_row,
                        "prediction_top3": None,
                        "prediction_rewrite": "",
                        "prediction_error": "missing_prompts",
                    }
                )
                return
            try:
                output_rows.append(
                    await _predict_case(
                        client,
                        model=args.model,
                        teacher_row=teacher_row,
                        prompts=prompts,
                        improvement_timeout_seconds=args.improvement_timeout_seconds,
                        rewrite_timeout_seconds=args.rewrite_timeout_seconds,
                    )
                )
            except Exception as error:
                output_rows.append(
                    {
                        **teacher_row,
                        "prediction_top3": None,
                        "prediction_rewrite": "",
                        "prediction_error": str(error),
                    }
                )

    await asyncio.gather(*[_worker(row) for row in selected_rows])
    output_rows.sort(key=lambda row: str(row.get("id") or ""))
    _write_jsonl(Path(args.output), output_rows)
    print(
        json.dumps(
            {
                "split": args.split,
                "cases": len(selected_rows),
                "predicted": len(output_rows),
                "output": args.output,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate holdout predictions from a served Qwen ES review model.")
    parser.add_argument(
        "--teacher-records",
        default=os.environ.get(
            "QWEN_ES_REVIEW_TEACHER_RECORDS",
            "ml/es_review_qwen/data/generated/teacher_records.jsonl",
        ),
        help="teacher_records.jsonl path",
    )
    parser.add_argument(
        "--sft-records",
        default=os.environ.get(
            "QWEN_ES_REVIEW_SFT_RECORDS",
            "ml/es_review_qwen/data/generated/sft/test.jsonl",
        ),
        help="SFT split JSONL path for the same split",
    )
    parser.add_argument(
        "--output",
        default="ml/es_review_qwen/data/generated/holdout_predictions.jsonl",
        help="Prediction JSONL output path",
    )
    parser.add_argument("--split", default="test", help="Split name to score")
    parser.add_argument("--base-url", default=os.environ.get("QWEN_ES_REVIEW_BASE_URL", ""))
    parser.add_argument("--api-key", default=os.environ.get("QWEN_ES_REVIEW_API_KEY", "local-qwen"))
    parser.add_argument(
        "--model",
        default=os.environ.get("QWEN_ES_REVIEW_ADAPTER_ID")
        or os.environ.get("QWEN_ES_REVIEW_MODEL", "tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2"),
    )
    parser.add_argument("--timeout-seconds", type=int, default=120, help="Legacy default timeout for both stages")
    parser.add_argument(
        "--improvement-timeout-seconds",
        type=int,
        default=int(os.environ.get("QWEN_ES_REVIEW_TIMEOUT_IMPROVEMENT_SECONDS", "30")),
        help="Timeout for improvement JSON generation",
    )
    parser.add_argument(
        "--rewrite-timeout-seconds",
        type=int,
        default=int(os.environ.get("QWEN_ES_REVIEW_TIMEOUT_REWRITE_SECONDS", "90")),
        help="Timeout for rewrite generation",
    )
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--max-cases", type=int, default=0)
    args = parser.parse_args()
    if "--improvement-timeout-seconds" not in os.sys.argv:
        args.improvement_timeout_seconds = args.timeout_seconds
    if "--rewrite-timeout-seconds" not in os.sys.argv:
        args.rewrite_timeout_seconds = args.timeout_seconds
    if not args.base_url:
        raise SystemExit("Missing --base-url or QWEN_ES_REVIEW_BASE_URL")
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
