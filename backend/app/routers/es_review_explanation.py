"""Independent improvement explanation generator for ES review."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.routers.es_review_stream import _queue_stream_event
from app.utils.llm_providers import get_openai_client

logger = logging.getLogger(__name__)

EXPLANATION_TIMEOUT_SECONDS = 5.0

_TEMPLATE_LABELS: dict[str, str] = {
    "basic": "一般設問",
    "company_motivation": "志望動機",
    "intern_reason": "インターン参加理由",
    "intern_goals": "インターン目標",
    "gakuchika": "ガクチカ",
    "self_pr": "自己PR",
    "post_join_goals": "入社後の目標",
    "role_course_reason": "職種・コース志望理由",
    "work_values": "働く上で大切にしたいこと",
}


def _build_explanation_prompt(
    original_text: str,
    rewritten_text: str,
    template_type: str,
    company_name: str | None,
) -> tuple[str, str]:
    """Build prompts for explanation generation."""
    template_label = _TEMPLATE_LABELS.get(template_type, "ES設問")
    system_prompt = """あなたはES添削の改善内容を就活生にわかりやすく説明するアシスタントです。

元の回答と改善案を比較し、主要な改善ポイントを3〜5件の箇条書きで簡潔に説明してください。

各ポイントは以下の形式で書いてください:
**【改善の種類】**
「変更前の表現（10字以内に要約）」→「変更後の表現（10字以内に要約）」
改善の理由を1文で説明。

改善の種類の例: 結論ファースト化 / 数値による具体化 / 企業接続の追加 / 冗長表現の圧縮 / 文末バリエーション / 構成の整理 / 論理接続の強化 / だ・である調への統一

ルール:
- ポイントは重要度順に並べる
- 各ポイントは2-3行で収める
- 専門用語は避け、就活生にわかる言葉で書く
- 改善前後の引用は要約し、長い文をそのまま引用しない"""

    def _sanitize(text: str) -> str:
        return text.replace("【", "〔").replace("】", "〕")

    safe_original = _sanitize(original_text)
    safe_rewritten = _sanitize(rewritten_text)
    safe_company = _sanitize(company_name) if company_name else None

    company_line = f"\n企業: {safe_company}" if safe_company else ""
    user_prompt = f"""【設問タイプ】{template_label}{company_line}

【元の回答】
{safe_original}

【改善案】
{safe_rewritten}"""
    return system_prompt, user_prompt


async def generate_improvement_explanation(
    original_text: str,
    rewritten_text: str,
    template_type: str,
    company_name: str | None,
    progress_queue: "asyncio.Queue[tuple[str, dict[str, Any]]] | None",
) -> str | None:
    """Generate improvement explanation using a lightweight OpenAI model."""
    system_prompt, user_prompt = _build_explanation_prompt(
        original_text,
        rewritten_text,
        template_type,
        company_name,
    )

    try:
        return await asyncio.wait_for(
            _call_explanation_llm(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                progress_queue=progress_queue,
            ),
            timeout=EXPLANATION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Explanation generation timed out after %ss",
            EXPLANATION_TIMEOUT_SECONDS,
        )
        _queue_stream_event(
            progress_queue,
            "field_complete",
            {"path": "improvement_explanation", "value": ""},
        )
        return None
    except Exception:
        logger.exception("Explanation generation failed")
        _queue_stream_event(
            progress_queue,
            "field_complete",
            {"path": "improvement_explanation", "value": ""},
        )
        return None


async def _call_explanation_llm(
    system_prompt: str,
    user_prompt: str,
    progress_queue: "asyncio.Queue[tuple[str, dict[str, Any]]] | None",
) -> str:
    """Call GPT-5.4-mini and forward streamed deltas to the SSE queue."""
    from app.utils.llm import (
        _extract_openai_usage_summary,
        _openai_supports_temperature,
        log_llm_cost_event,
    )

    client = await get_openai_client(for_rag=False)
    request_kwargs: dict[str, Any] = {
        "model": "gpt-5.4-mini",
        "instructions": system_prompt,
        "input": user_prompt,
        "max_output_tokens": 600,
        "stream": True,
        "text": {"format": {"type": "text"}},
    }
    if _openai_supports_temperature("gpt-5.4-mini"):
        request_kwargs["temperature"] = 0.1

    chunks: list[str] = []
    completed_response: Any | None = None

    stream = await client.responses.create(**request_kwargs)
    async for event in stream:
        if event.type == "response.output_text.delta":
            delta = getattr(event, "delta", "") or ""
            if not delta:
                continue
            chunks.append(delta)
            _queue_stream_event(
                progress_queue,
                "string_chunk",
                {
                    "path": "improvement_explanation",
                    "text": delta,
                },
            )
        elif event.type == "response.completed":
            completed_response = getattr(event, "response", None)
        elif event.type in {"response.failed", "response.incomplete"}:
            raise RuntimeError(f"OpenAI explanation stream ended with {event.type}")

    full_text = "".join(chunks).strip()
    if not full_text:
        raise RuntimeError("OpenAI explanation stream returned empty text")

    if completed_response is not None:
        log_llm_cost_event(
            feature="es_review",
            provider="openai",
            resolved_model="gpt-5.4-mini",
            call_kind="text_stream",
            usage=_extract_openai_usage_summary(completed_response),
        )

    _queue_stream_event(
        progress_queue,
        "field_complete",
        {
            "path": "improvement_explanation",
            "value": full_text,
        },
    )
    return full_text
