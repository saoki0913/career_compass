"""
Content type definitions and helpers for company RAG classification.
"""

CONTENT_TYPES = [
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
}


def content_type_label(value: str) -> str:
    """Get display label for a content type."""
    return CONTENT_TYPE_LABELS.get(value, "企業情報")


def normalize_content_type(value: str) -> str:
    """
    Normalize content type value to standard format.

    Handles legacy values and ensures consistency.

    Args:
        value: Raw content type string

    Returns:
        Normalized content type string
    """
    if not value:
        return "corporate_site"
    # Handle legacy "structured" type
    if value == "structured":
        return "corporate_site"
    # Return as-is if valid
    if value in CONTENT_TYPES:
        return value
    return "corporate_site"


def expand_content_type_filter(content_types: list[str] | None) -> list[str]:
    """
    Expand content type filter to include all valid types.

    Args:
        content_types: List of content types to filter by, or None for all

    Returns:
        List of valid content types
    """
    if not content_types:
        return CONTENT_TYPES.copy()
    return [t for t in content_types if t in CONTENT_TYPES]
