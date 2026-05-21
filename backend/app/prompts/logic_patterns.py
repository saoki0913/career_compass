"""Renderer for prompt-safe reference ES logic composition patterns.

Single schema (no versioning, no corpus statistics). Data comes from the
hand-curated SSOT ``es_reference_guidance``. Compound ES surfaces the primary
type's pattern with a capped secondary supplement.
"""

from __future__ import annotations

from functools import lru_cache
import re

from app.prompts.es_reference_guidance import (
    KNOWN_COMPANY_NAMES,
    get_logic_patterns_payload,
)

CONFIDENCE_MAP: dict[str, str] = {
    "basic": "high",
    "company_motivation": "high",
    "post_join_goals": "high",
    "intern_reason": "high",
    "gakuchika": "high",
    "role_course_reason": "medium",
    "self_pr": "medium",
    "work_values": "medium",
    "intern_goals": "medium",
}

_DISPLAYABLE_CONFIDENCE = frozenset({"high", "medium"})
_MIN_CHAR_MAX = 260
_DESCRIPTION_MAX = 200
_BLOCK_CHAR_BUDGET = 1100

_PATTERN_TEXT_FIELDS = (
    "approach_label",
    "approach_description",
    "persuasion_key",
    "structural_blueprint",
    "evidence_strategy",
    "transition_logic",
)

_KNOWN_COMPANY_RE = re.compile(
    "|".join(re.escape(name) for name in sorted(KNOWN_COMPANY_NAMES, key=len, reverse=True)),
    re.IGNORECASE,
)


def _validate_schema(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get("question_type"), str) or not data["question_type"].strip():
        return False
    if data.get("human_reviewed") is not True:
        return False
    patterns = data.get("patterns")
    if not isinstance(patterns, list) or not patterns:
        return False
    for pattern in patterns:
        if not isinstance(pattern, dict):
            return False
        for key in ("approach_label", "approach_description", "persuasion_key"):
            value = pattern.get(key)
            if not isinstance(value, str) or not value.strip():
                return False
        if len(pattern["approach_description"]) > _DESCRIPTION_MAX:
            return False
        for optional in ("structural_blueprint", "evidence_strategy", "transition_logic"):
            if optional in pattern and not (
                isinstance(pattern[optional], str) and pattern[optional].strip()
            ):
                return False
    for list_key in ("quality_markers", "common_weaknesses"):
        if list_key in data:
            value = data[list_key]
            if not isinstance(value, list) or not value:
                return False
            if not all(isinstance(item, str) and item.strip() for item in value):
                return False
    enumeration = data.get("enumeration_phrasing")
    if enumeration is not None:
        if not isinstance(enumeration, dict) or not enumeration:
            return False
        for items in enumeration.values():
            if not isinstance(items, list) or not items:
                return False
            if not all(isinstance(item, str) and item.strip() for item in items):
                return False
    return True


def _iter_pattern_texts(data: dict) -> list[str]:
    texts: list[str] = []
    for pattern in data.get("patterns") or []:
        if isinstance(pattern, dict):
            texts.extend(str(pattern.get(field) or "") for field in _PATTERN_TEXT_FIELDS)
    texts.append(str(data.get("section_balance") or ""))
    for key in ("opening_pattern", "closing_pattern"):
        value = data.get(key)
        if isinstance(value, dict):
            texts.append(str(value.get("structure") or ""))
            texts.append(str(value.get("effect") or ""))
            texts.append(str(value.get("examples_summary") or ""))
    for list_key in ("quality_markers", "common_weaknesses"):
        value = data.get(list_key)
        if isinstance(value, list):
            texts.extend(str(item) for item in value if isinstance(item, str))
    enumeration = data.get("enumeration_phrasing")
    if isinstance(enumeration, dict):
        for items in enumeration.values():
            if isinstance(items, list):
                texts.extend(str(item) for item in items if isinstance(item, str))
    return texts


def _check_copy_safety(data: dict) -> bool:
    return not any(_KNOWN_COMPANY_RE.search(text) for text in _iter_pattern_texts(data))


@lru_cache(maxsize=32)
def get_logic_patterns(question_type: str) -> dict | None:
    data = get_logic_patterns_payload(question_type)
    if not data:
        return None
    if not _validate_schema(data):
        return None
    if data.get("question_type") != question_type:
        return None
    if not _check_copy_safety(data):
        return None
    return data


def _string_field(data: dict, key: str) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def _structure_field(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, dict):
        return ""
    structure = value.get("structure")
    return structure.strip() if isinstance(structure, str) else ""


def _secondary_supplement(component_types: list[str] | None, primary: str) -> list[str]:
    """One capped supplement line per distinct secondary compound type."""

    lines: list[str] = []
    seen = {primary}
    for secondary in component_types or []:
        if secondary in seen:
            continue
        seen.add(secondary)
        data = get_logic_patterns(secondary)
        if not data:
            continue
        primary_pattern = data["patterns"][0]
        lines.append(
            f"- 補助アプローチ（複合）: {primary_pattern['approach_label']}"
            f" — {primary_pattern['persuasion_key']}"
        )
    return lines[:2]


def _render_block(
    data: dict, *, confidence: str, secondary_lines: list[str]
) -> str:
    patterns = data["patterns"]
    primary = patterns[0]

    core: list[str] = [
        "",
        "",
        "【参考ESから抽出した構成パターン】",
        f"- 主な論理アプローチ: {primary['approach_label']}",
        f"  「{primary['approach_description']}」",
    ]
    if primary.get("structural_blueprint"):
        core.append(f"  構成設計: {primary['structural_blueprint']}")
    if primary.get("evidence_strategy"):
        core.append(f"  根拠提示: {primary['evidence_strategy']}")
    if primary.get("transition_logic"):
        core.append(f"  接続パターン: {primary['transition_logic']}")

    section_balance = _string_field(data, "section_balance")
    if section_balance:
        core.append(f"- 配分傾向: {section_balance}")
    core.append(f"- 説得力の鍵: {primary['persuasion_key']}")
    opening = _structure_field(data, "opening_pattern")
    if opening:
        core.append(f"- 冒頭の型: {opening}")
    closing = _structure_field(data, "closing_pattern")
    if closing:
        core.append(f"- 締めの型: {closing}")

    quality_markers = data.get("quality_markers")
    marker_lines: list[str] = []
    if isinstance(quality_markers, list) and quality_markers:
        marker_lines.append("- 品質指標:")
        marker_lines.extend(f"  - {marker}" for marker in quality_markers[:3])

    weaknesses = data.get("common_weaknesses")
    weakness_lines: list[str] = []
    if isinstance(weaknesses, list) and weaknesses:
        weakness_lines.append("- よくある弱点:")
        weakness_lines.extend(f"  - {weakness}" for weakness in weaknesses[:2])

    footer: list[str] = list(secondary_lines)
    footer.append("- 構成パターンは論点順の参考に留め、既存の骨子や事実より優先しない")
    if confidence == "medium":
        footer.append("- 件数が少ない設問タイプのため、パターンは参考程度に使う")

    # Assemble within the char budget; drop the richest optional groups first.
    for optional in (marker_lines + weakness_lines, weakness_lines, marker_lines, []):
        candidate = core + optional + footer if optional else core + footer
        rendered = "\n".join(candidate)
        if len(rendered) <= _BLOCK_CHAR_BUDGET:
            return rendered
    return "\n".join(core + footer)


def build_logic_patterns_block(
    question_type: str,
    *,
    char_max: int | None = None,
    component_types: list[str] | None = None,
) -> str:
    confidence = CONFIDENCE_MAP.get(question_type, "low")
    if confidence not in _DISPLAYABLE_CONFIDENCE:
        return ""
    if char_max is not None and char_max < _MIN_CHAR_MAX:
        return ""

    data = get_logic_patterns(question_type)
    if not data:
        return ""

    secondary_lines = _secondary_supplement(
        [t for t in (component_types or []) if t != question_type], question_type
    )
    return _render_block(data, confidence=confidence, secondary_lines=secondary_lines)
