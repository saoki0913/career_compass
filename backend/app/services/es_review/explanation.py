"""Independent improvement explanation generator for ES review."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from app.prompts.es_templates import get_template_evaluation_axes
from app.services.es_review.stream import _queue_stream_event
from app.utils.llm_providers import get_openai_client

logger = logging.getLogger(__name__)

EXPLANATION_TIMEOUT_SECONDS = 8.0

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

_EXPLANATION_JSON_SCHEMA: dict[str, Any] = {
    "type": "json_schema",
    "name": "es_improvement_explanation",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "version": {"type": "integer", "enum": [2]},
            "improvement_points": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "axis": {"type": "string"},
                        "point": {"type": "string"},
                        "detail": {"type": "string"},
                    },
                    "required": ["axis", "point", "detail"],
                },
            },
            "main_changes": {
                "type": "array",
                "maxItems": 2,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "before_summary": {"type": "string"},
                        "after_summary": {"type": "string"},
                        "change": {"type": "string"},
                    },
                    "required": ["before_summary", "after_summary", "change"],
                },
            },
        },
        "required": ["version", "improvement_points", "main_changes"],
    },
}


def _build_explanation_prompt(
    original_text: str,
    rewritten_text: str,
    template_type: str,
    company_name: str | None,
    evaluation_axes_override: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Build prompts for explanation generation."""
    template_label = _TEMPLATE_LABELS.get(template_type, "ES設問")
    evaluation_axes = evaluation_axes_override or get_template_evaluation_axes(template_type)
    axes_lines = "\n".join(
        f"- {axis.get('name', '')}: {axis.get('pass_condition', '')} / {axis.get('rewrite_instruction', '')}"
        for axis in evaluation_axes
        if str(axis.get("name") or "").strip()
    )
    axes_block = axes_lines or "- 設問への直答性: 設問に正面から答える / 冒頭で答えの核を示す"
    system_prompt = """あなたはES添削の改善内容を就活生にわかりやすく説明するアシスタントです。

元の回答と改善案を比較し、評価軸に対応する改善ポイントと主な変更点を説明してください。

出力は JSON オブジェクトのみ。Markdown、見出し、コードフェンス、前置きは禁止。

形式:
{
  "version": 2,
  "improvement_points": [
    {"axis": "評価軸名", "point": "改善ポイントを短く", "detail": "読み手に伝わる変化を1文で"}
  ],
  "main_changes": [
    {"before_summary": "変更前の要約", "after_summary": "変更後の要約", "change": "何をどう直したかを1文で"}
  ]
}

ルール:
- 就活生向けの平易な言葉を使う
- 重要度が高い改善から順に記載する
- improvement_points は最大3件、main_changes は最大2件
- 引用は要約し15字以内にする。長い文をそのまま引用しない
- 元の回答を批判せず、改善案の良さを説明する
- 「〜べき」「〜しなければならない」ではなく「〜するとよい」「〜が効果的」のトーンにする
- 評価軸にない一般論だけで説明しない
- 空の配列は避け、比較できる範囲で必ず improvement_points を1件以上出す
- reason、points、changes など指定外のキーは出力しない"""

    def _sanitize(text: str) -> str:
        return text.replace("【", "〔").replace("】", "〕")

    safe_original = _sanitize(original_text)
    safe_rewritten = _sanitize(rewritten_text)
    safe_company = _sanitize(company_name) if company_name else None

    company_line = f"\n企業: {safe_company}" if safe_company else ""
    user_prompt = f"""【設問タイプ】{template_label}{company_line}

【評価軸】
{axes_block}

【元の回答】
{safe_original}

【改善案】
{safe_rewritten}"""
    return system_prompt, user_prompt


def _short_text(value: Any, limit: int = 90) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"^#+\s*", "", text)
    text = text.replace("改善ポイント", "").replace("変更箇所の解説", "").strip()
    return text[:limit].strip()


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start < 0 or end <= start:
            raise
        parsed = json.loads(cleaned[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("explanation payload is not an object")
    return parsed


def _normalize_explanation_payload(raw_text: str) -> str:
    payload = _extract_json_object(raw_text)
    points: list[dict[str, str]] = []
    for item in payload.get("improvement_points") or []:
        if not isinstance(item, dict):
            continue
        axis = _short_text(item.get("axis"), 32)
        point = _short_text(item.get("point"), 48)
        detail = _short_text(item.get("detail"), 110)
        if point or detail:
            points.append({"axis": axis, "point": point, "detail": detail})
        if len(points) >= 3:
            break

    changes: list[dict[str, str]] = []
    for item in payload.get("main_changes") or []:
        if not isinstance(item, dict):
            continue
        before = _short_text(item.get("before_summary"), 24)
        after = _short_text(item.get("after_summary"), 24)
        change = _short_text(item.get("change"), 90)
        if before or after or change:
            changes.append(
                {
                    "before_summary": before,
                    "after_summary": after,
                    "change": change,
                }
            )
        if len(changes) >= 2:
            break

    return json.dumps(
        {"version": 2, "improvement_points": points, "main_changes": changes},
        ensure_ascii=False,
        separators=(",", ":"),
    )


async def generate_improvement_explanation(
    original_text: str,
    rewritten_text: str,
    template_type: str,
    company_name: str | None,
    progress_queue: "asyncio.Queue[tuple[str, dict[str, Any]]] | None",
    evaluation_axes_override: list[dict[str, Any]] | None = None,
) -> str | None:
    """Generate improvement explanation using a lightweight OpenAI model."""
    system_prompt, user_prompt = _build_explanation_prompt(
        original_text,
        rewritten_text,
        template_type,
        company_name,
        evaluation_axes_override=evaluation_axes_override,
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
    """Call GPT-5.4-mini and publish a normalized JSON explanation payload."""
    from app.utils.llm import log_llm_cost_event
    from app.utils.llm_providers import _openai_supports_temperature
    from app.utils.llm_responses import _extract_openai_usage_summary

    client = await get_openai_client(for_rag=False)
    request_kwargs: dict[str, Any] = {
        "model": "gpt-5.4-mini",
        "instructions": system_prompt,
        "input": user_prompt,
        "max_output_tokens": 900,
        "stream": True,
        "text": {"format": _EXPLANATION_JSON_SCHEMA},
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
        elif event.type == "response.completed":
            completed_response = getattr(event, "response", None)
        elif event.type in {"response.failed", "response.incomplete"}:
            raise RuntimeError(f"OpenAI explanation stream ended with {event.type}")

    raw_text = "".join(chunks).strip()
    if not raw_text:
        raise RuntimeError("OpenAI explanation stream returned empty text")
    full_text = _normalize_explanation_payload(raw_text)

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
