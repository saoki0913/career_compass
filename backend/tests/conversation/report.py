"""
Report generation for AI conversation live tests.

Delegates to the shared ``write_live_feature_report`` function so that
gakuchika / motivation / interview reports follow the same JSON + Markdown
format as company-info and ES-review live reports.

Environment variables (checked in priority order):
  LIVE_AI_CONVERSATION_CASE_SET   explicit case set for conversation tests
  AI_LIVE_SUITE                   fallback shared across all live suites
  (default)                       "smoke"
"""

from __future__ import annotations

import os
from typing import Any

from tests.company_info.integration.live_feature_report import (
    write_live_feature_report,
)

DISPLAY_NAMES: dict[str, str] = {
    "gakuchika": "ガクチカ深掘り",
    "motivation": "志望動機作成",
    "interview": "面接練習",
}


def selected_case_set() -> str:
    """Return the active case-set name for conversation live tests."""
    return (
        os.getenv("LIVE_AI_CONVERSATION_CASE_SET", "")
        or os.getenv("AI_LIVE_SUITE", "")
        or "smoke"
    ).strip()


def write_conversation_report(
    feature: str,
    rows: list[dict[str, Any]],
) -> tuple:
    """Write JSON + MD report using shared write_live_feature_report.

    Returns (json_path, md_path) -- both ``pathlib.Path`` objects.
    """
    return write_live_feature_report(
        report_type=feature,
        display_name=DISPLAY_NAMES.get(feature, feature),
        rows=rows,
    )
