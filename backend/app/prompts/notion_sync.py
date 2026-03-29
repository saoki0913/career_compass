from __future__ import annotations

import json
import re
from typing import Any


PLACEHOLDER_PATTERN = re.compile(r"(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})")

REQUIRED_MANAGED_PROMPT_KEYS = {
    "motivation.evaluation",
    "motivation.question",
    "motivation.suggestion_rewrite",
    "motivation.draft_generation",
    "gakuchika.prohibited_expressions",
    "gakuchika.question_quality_principles",
    "gakuchika.reference_guide_rubric",
    "gakuchika.star_evaluate_and_question",
    "gakuchika.initial_question",
    "gakuchika.structured_summary",
    "gakuchika.draft_generation",
    "interview.question",
    "interview.feedback",
    "company_info.extract_info.system",
    "company_info.extract_info.user",
    "company_info.extract_schedule.system",
    "company_info.extract_schedule.user",
    "company_info.content_classifier.system",
    "company_info.content_classifier.user",
    "llm_common.json_strict_note",
    "llm_common.json_strict_note_google_append",
    "llm_common.text_strict_note",
    "llm_common.text_strict_note_google_append",
    "llm_common.json_repair_system",
    "llm_common.json_repair_user",
    "es_review.global_conclusion_first_rules",
}


def extract_prompt_placeholders(content: str) -> list[str]:
    return sorted(dict.fromkeys(PLACEHOLDER_PATTERN.findall(content or "")))


def build_prompt_manifest(
    rows: list[dict[str, Any]],
    *,
    required_keys: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    manifest: dict[str, dict[str, Any]] = {}

    for row in rows:
        if str(row.get("status") or "").lower() != "active":
            continue

        key = str(row.get("key") or "").strip()
        if not key:
            raise ValueError("Prompt row is missing key")
        if key in manifest:
            raise ValueError(f"Duplicate prompt key: {key}")

        content = str(row.get("content") or "")
        variables = [str(item) for item in (row.get("variables") or []) if str(item).strip()]
        placeholders = extract_prompt_placeholders(content)
        if sorted(variables) != placeholders:
            raise ValueError(
                f"Prompt '{key}' variables mismatch: declared={sorted(variables)} actual={placeholders}"
            )

        manifest[key] = {
            "feature": str(row.get("feature") or "").strip(),
            "kind": str(row.get("kind") or "").strip(),
            "content": content,
            "variables": variables,
            "version": int(row.get("version") or 0),
            "code_targets": [str(item) for item in (row.get("code_targets") or []) if str(item).strip()],
        }

    required = REQUIRED_MANAGED_PROMPT_KEYS if required_keys is None else required_keys
    missing = sorted(required - set(manifest))
    if missing:
        raise ValueError(f"missing required prompt keys: {', '.join(missing)}")

    return manifest


def _extract_plain_text(value: Any) -> str:
    if not isinstance(value, dict):
        return ""

    value_type = str(value.get("type") or "")
    if value_type == "title":
        title = value.get("title") or []
        return "".join(str(item.get("plain_text") or "") for item in title).strip()
    if value_type == "rich_text":
        rich_text = value.get("rich_text") or []
        return "".join(str(item.get("plain_text") or "") for item in rich_text).strip()
    if value_type == "number":
        number = value.get("number")
        return "" if number is None else str(number)
    if value_type == "status":
        status = value.get("status") or {}
        return str(status.get("name") or "").strip()
    if value_type == "select":
        select = value.get("select") or {}
        return str(select.get("name") or "").strip()
    return ""


def _extract_json_list(value: Any) -> list[str]:
    text = _extract_plain_text(value)
    if not text:
        return []
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array but got: {text}")
    return [str(item) for item in data if str(item).strip()]


def normalize_notion_prompt_page(page: dict[str, Any]) -> dict[str, Any]:
    properties = page.get("properties") or {}
    return {
        "key": _extract_plain_text(properties.get("Key")),
        "feature": _extract_plain_text(properties.get("Feature")),
        "kind": _extract_plain_text(properties.get("Kind")),
        "content": _extract_plain_text(properties.get("Content")),
        "variables": _extract_json_list(properties.get("Variables JSON")),
        "status": _extract_plain_text(properties.get("Status")),
        "version": int(_extract_plain_text(properties.get("Version")) or "0"),
        "code_targets": _extract_json_list(properties.get("Code Targets JSON")),
    }
