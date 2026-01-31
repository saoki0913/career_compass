"""
Content type definitions and helpers for company RAG classification.
"""

from typing import Iterable

STRUCTURED_CONTENT_TYPE = "structured"

CONTENT_TYPES_NEW = [
    "new_grad_recruitment",
    "midcareer_recruitment",
    "corporate_site",
    "ir_materials",
    "ceo_message",
    "employee_interviews",
    "press_release",
    "csr_sustainability",
    "midterm_plan",
]

LEGACY_CONTENT_TYPES = [
    "recruitment",
    "corporate_ir",
    "corporate_business",
    "corporate_general",
]

CONTENT_TYPES_ALL = CONTENT_TYPES_NEW + [STRUCTURED_CONTENT_TYPE] + LEGACY_CONTENT_TYPES

LEGACY_TO_NEW = {
    "recruitment": "new_grad_recruitment",
    "recruitment_homepage": "new_grad_recruitment",  # Migrate existing data
    "corporate_ir": "ir_materials",
    "corporate_business": "corporate_site",
    "corporate_general": "corporate_site",
}

NEW_TO_LEGACY = {
    "new_grad_recruitment": ["recruitment"],
    "midcareer_recruitment": ["recruitment"],
    "employee_interviews": ["recruitment", "corporate_general"],
    "corporate_site": ["corporate_general", "corporate_business"],
    "ir_materials": ["corporate_ir"],
    "midterm_plan": ["corporate_ir"],
    "press_release": ["corporate_general", "corporate_business"],
    "csr_sustainability": ["corporate_general", "corporate_ir"],
    "ceo_message": ["corporate_general"],
    STRUCTURED_CONTENT_TYPE: [],
}

CONTENT_TYPE_LABELS = {
    "new_grad_recruitment": "新卒採用ホームページ",
    "midcareer_recruitment": "中途採用ホームページ",
    "corporate_site": "企業HP",
    "ir_materials": "IR資料",
    "ceo_message": "社長メッセージ",
    "employee_interviews": "社員インタビュー",
    "press_release": "プレスリリース",
    "csr_sustainability": "CSR/サステナ",
    "midterm_plan": "中期経営計画",
    STRUCTURED_CONTENT_TYPE: "構造化データ",
}


def normalize_content_type(value: str) -> str:
    """Map legacy content types to new ones."""
    return LEGACY_TO_NEW.get(value, value)


def expand_content_type_filter(types: Iterable[str]) -> list[str]:
    """Expand content types to include compatible legacy/new values."""
    expanded: list[str] = []
    seen = set()

    for value in types:
        if not value:
            continue
        if value not in seen:
            expanded.append(value)
            seen.add(value)

        mapped = LEGACY_TO_NEW.get(value)
        if mapped and mapped not in seen:
            expanded.append(mapped)
            seen.add(mapped)

        legacy_list = NEW_TO_LEGACY.get(value)
        if legacy_list:
            for legacy in legacy_list:
                if legacy not in seen:
                    expanded.append(legacy)
                    seen.add(legacy)

    return expanded


def content_type_label(value: str) -> str:
    """Get display label for a content type (handles legacy values)."""
    normalized = normalize_content_type(value)
    return CONTENT_TYPE_LABELS.get(normalized, "企業情報")
