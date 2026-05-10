"""Runtime loader for reference ES logic composition patterns."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import json
import re
from typing import Any

LOGIC_PATTERNS_DIR = Path(__file__).resolve().parents[1] / "reference" / "es_review"

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
_PATTERN_TEXT_FIELDS_V1 = (
    "approach_label",
    "approach_description",
    "persuasion_key",
)
_PATTERN_TEXT_FIELDS_V2 = (
    "approach_label",
    "approach_description",
    "persuasion_key",
    "structural_blueprint",
    "evidence_strategy",
    "transition_logic",
)
_BASE_KNOWN_COMPANY_NAMES = (
    "KPMG",
    "PwC",
    "EY",
    "デロイト",
    "アクセンチュア",
    "三菱商事",
    "三井物産",
    "伊藤忠",
    "住友商事",
    "丸紅",
    "トヨタ",
    "Toyota",
    "ソニー",
    "Sony",
    "楽天",
    "サイバーエージェント",
    "NTT",
    "野村",
    "みずほ",
    "三井住友",
    "三菱UFJ",
)


def _load_known_company_names_from_corpus() -> tuple[str, ...]:
    names: set[str] = set(_BASE_KNOWN_COMPANY_NAMES)
    for path in LOGIC_PATTERNS_DIR.glob("*/references.jsonl"):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        for line in lines:
            try:
                record = json.loads(line)
            except Exception:
                continue
            if not isinstance(record, dict):
                continue
            company_name = str(record.get("company_name") or "").strip()
            if company_name:
                names.add(company_name)
    return tuple(sorted(names, key=len, reverse=True))


_KNOWN_COMPANY_NAMES = _load_known_company_names_from_corpus()
_KNOWN_COMPANY_RE = re.compile(
    "|".join(re.escape(name) for name in _KNOWN_COMPANY_NAMES),
    re.IGNORECASE,
)


def _detect_extraction_version(data: dict) -> str:
    return str(data.get("extraction_version") or "1.0")


def _validate_schema(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get("question_type"), str) or not data["question_type"].strip():
        return False
    if not isinstance(data.get("source_count"), int):
        return False
    if data.get("human_reviewed") is not True:
        return False
    patterns = data.get("patterns")
    if not isinstance(patterns, list) or not patterns:
        return False
    version = _detect_extraction_version(data)
    required_fields = _PATTERN_TEXT_FIELDS_V2 if version >= "2.0" else _PATTERN_TEXT_FIELDS_V1
    desc_limit = 200 if version >= "2.0" else 120
    for pattern in patterns:
        if not isinstance(pattern, dict):
            return False
        for key in required_fields:
            value = pattern.get(key)
            if not isinstance(value, str) or not value.strip():
                return False
        if len(pattern["approach_description"]) > desc_limit:
            return False
        if not isinstance(pattern.get("frequency_count"), int):
            return False
    if version >= "2.0":
        for list_key in ("quality_markers", "common_weaknesses"):
            value = data.get(list_key)
            if not isinstance(value, list) or not value:
                return False
            if not all(isinstance(item, str) and item.strip() for item in value):
                return False
    return True


def _iter_pattern_texts(data: dict) -> list[str]:
    texts: list[str] = []
    version = _detect_extraction_version(data)
    pattern_fields = _PATTERN_TEXT_FIELDS_V2 if version >= "2.0" else _PATTERN_TEXT_FIELDS_V1
    for pattern in data.get("patterns") or []:
        if isinstance(pattern, dict):
            texts.extend(str(pattern.get(field) or "") for field in pattern_fields)
    for key in ("section_balance",):
        texts.append(str(data.get(key) or ""))
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
    return texts


def _check_copy_safety(data: dict) -> bool:
    return not any(_KNOWN_COMPANY_RE.search(text) for text in _iter_pattern_texts(data))


@lru_cache(maxsize=32)
def get_logic_patterns(question_type: str) -> dict | None:
    path = LOGIC_PATTERNS_DIR / question_type / "patterns.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not _validate_schema(data):
        return None
    if data.get("question_type") != question_type:
        return None
    if not _check_copy_safety(data):
        return None
    return data


def _string_field(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def _structure_field(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, dict):
        return ""
    structure = value.get("structure")
    return structure.strip() if isinstance(structure, str) else ""


def build_logic_patterns_block(question_type: str, *, char_max: int | None = None) -> str:
    confidence = CONFIDENCE_MAP.get(question_type, "low")
    if confidence not in _DISPLAYABLE_CONFIDENCE:
        return ""
    if char_max is not None and char_max < 260:
        return ""

    data = get_logic_patterns(question_type)
    if not data:
        return ""
    source_count = data.get("source_count")
    if not isinstance(source_count, int):
        return ""

    version = _detect_extraction_version(data)
    patterns = data["patterns"]
    primary = patterns[0]

    if version >= "2.0":
        return _build_v2_block(data, patterns, primary, source_count, confidence)
    return _build_v1_block(data, patterns, primary, source_count, confidence)


def _build_v1_block(
    data: dict, patterns: list, primary: dict, source_count: int, confidence: str
) -> str:
    lines = [
        "",
        "",
        "【参考ESから抽出した構成パターン】",
        f"- 主な論理アプローチ: {primary['approach_label']} ({source_count}件中{primary['frequency_count']}件)",
        f"  「{primary['approach_description']}」",
    ]
    if len(patterns) >= 2:
        secondary = patterns[1]
        lines.append(f"- 補助アプローチ: {secondary['approach_label']} ({secondary['frequency_count']}件)")
    section_balance = _string_field(data, "section_balance")
    opening = _structure_field(data, "opening_pattern")
    closing = _structure_field(data, "closing_pattern")
    if section_balance:
        lines.append(f"- 配分傾向: {section_balance}")
    lines.append(f"- 説得力の鍵: {primary['persuasion_key']}")
    if opening:
        lines.append(f"- 冒頭の型: {opening}")
    if closing:
        lines.append(f"- 締めの型: {closing}")
    lines.append("- 構成パターンは論点順の参考に留め、既存の骨子や事実より優先しない")
    if confidence == "medium":
        lines.append("- 件数が少ない設問タイプのため、パターンは参考程度に使う")
    return "\n".join(lines)


def _build_v2_block(
    data: dict, patterns: list, primary: dict, source_count: int, confidence: str
) -> str:
    lines = [
        "",
        "",
        "【参考ESから抽出した構成パターン】",
        f"- 主な論理アプローチ: {primary['approach_label']} ({source_count}件中{primary['frequency_count']}件)",
        f"  「{primary['approach_description']}」",
    ]
    blueprint = primary.get("structural_blueprint") or ""
    if blueprint:
        lines.append(f"  構成設計: {blueprint}")
    evidence = primary.get("evidence_strategy") or ""
    if evidence:
        lines.append(f"  根拠提示: {evidence}")
    transition = primary.get("transition_logic") or ""
    if transition:
        lines.append(f"  接続パターン: {transition}")

    if len(patterns) >= 2:
        secondary = patterns[1]
        lines.append(f"- 補助アプローチ: {secondary['approach_label']} ({secondary['frequency_count']}件)")
        sec_blueprint = secondary.get("structural_blueprint") or ""
        if sec_blueprint:
            lines.append(f"  構成設計: {sec_blueprint}")

    section_balance = _string_field(data, "section_balance")
    opening = _structure_field(data, "opening_pattern")
    closing = _structure_field(data, "closing_pattern")
    if section_balance:
        lines.append(f"- 配分傾向: {section_balance}")
    lines.append(f"- 説得力の鍵: {primary['persuasion_key']}")
    if opening:
        lines.append(f"- 冒頭の型: {opening}")
    if closing:
        lines.append(f"- 締めの型: {closing}")

    quality_markers = data.get("quality_markers")
    if isinstance(quality_markers, list) and quality_markers:
        lines.append("- 品質指標:")
        for marker in quality_markers[:5]:
            lines.append(f"  - {marker}")

    lines.append("- 構成パターンは論点順の参考に留め、既存の骨子や事実より優先しない")
    if confidence == "medium":
        lines.append("- 件数が少ない設問タイプのため、パターンは参考程度に使う")
    return "\n".join(lines)
