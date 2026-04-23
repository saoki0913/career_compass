"""CRUD report writer — delegates to the shared live_feature_report."""
from __future__ import annotations

from typing import Any

from tests.company_info.integration.live_feature_report import (
    write_live_feature_report,
)

DISPLAY_NAMES: dict[str, str] = {
    "calendar": "カレンダー",
    "tasks_deadlines": "タスク・締切管理",
    "notifications": "通知",
    "company_crud": "企業CRUD",
    "profile_settings": "プロフィール設定",
    "billing": "課金・クレジット",
    "search_query": "検索",
}


def write_crud_report(
    feature: str,
    rows: list[dict[str, Any]],
) -> tuple:
    return write_live_feature_report(
        report_type=feature,
        display_name=DISPLAY_NAMES.get(feature, feature),
        rows=rows,
    )
