"""Streaming helpers for ES review SSE."""

from __future__ import annotations

import asyncio
import json

from app.routers.es_review_models import TemplateSource
from app.utils.content_types import content_type_label


def _queue_progress_event(
    progress_queue: "asyncio.Queue | None",
    *,
    step: str,
    progress: int,
    label: str,
    sub_label: str | None = None,
) -> None:
    if progress_queue is None:
        return
    try:
        progress_queue.put_nowait(
            (
                "progress",
                {
                    "step": step,
                    "progress": progress,
                    "label": label,
                    "subLabel": sub_label,
                },
            )
        )
    except asyncio.QueueFull:
        pass


def _queue_stream_event(
    progress_queue: "asyncio.Queue | None",
    event_type: str,
    event_data: dict,
) -> None:
    if progress_queue is None:
        return
    try:
        progress_queue.put_nowait((event_type, event_data))
    except asyncio.QueueFull:
        pass


async def _stream_final_rewrite(
    progress_queue: "asyncio.Queue | None",
    text: str,
    chunk_size: int = 20,
) -> None:
    if progress_queue is None or not text:
        return
    for start in range(0, len(text), chunk_size):
        try:
            progress_queue.put_nowait(
                (
                    "string_chunk",
                    {
                        "path": "streaming_rewrite",
                        "text": text[start : start + chunk_size],
                    },
                )
            )
        except asyncio.QueueFull:
            await asyncio.sleep(0.01)
            continue
        await asyncio.sleep(0.015)


async def _stream_source_links(
    progress_queue: "asyncio.Queue | None",
    sources: list[TemplateSource],
) -> None:
    if progress_queue is None or not sources:
        return

    for index, source in enumerate(sources):
        _queue_progress_event(
            progress_queue,
            step="sources",
            progress=min(99, 95 + index * 2),
            label="出典リンクを表示中...",
            sub_label=f"{index + 1}件目を追加しています",
        )
        _queue_stream_event(
            progress_queue,
            "array_item_complete",
            {
                "path": f"keyword_sources.{index}",
                "value": source.model_dump(),
            },
        )
        await asyncio.sleep(0.04)


def _sse_event(event_type: str, data: dict) -> str:
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _sse_comment(comment: str = "keep-alive") -> str:
    return f": {comment}\n\n"


def _extract_domain(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).netloc.lower()


def _build_keyword_sources(rag_sources: list[dict]) -> list[TemplateSource]:
    return [
        TemplateSource(
            source_id=src.get("source_id", ""),
            source_url=src.get("source_url", ""),
            content_type=src.get("content_type", ""),
            content_type_label=src.get("content_type_label")
            or content_type_label(src.get("content_type", "")),
            title=src.get("title"),
            domain=src.get("domain") or _extract_domain(src.get("source_url", "")),
            excerpt=src.get("excerpt"),
        )
        for src in rag_sources
    ]
