"""Schedule extraction helpers — prompt building, parsing, OCR gating."""

from __future__ import annotations

from urllib.parse import urlparse

from app.prompts.company_info_prompts import (
    SCHEDULE_SYSTEM_PROMPT,
    SCHEDULE_USER_MESSAGE_TEXT,
    SCHEDULE_USER_MESSAGE_URL,
    SCHEDULE_YEAR_RULES_GENERIC,
    SCHEDULE_YEAR_RULES_INTERNSHIP,
    SCHEDULE_YEAR_RULES_MAIN,
)
from app.routers.company_info_candidate_scoring import _get_graduation_year
from app.routers.company_info_config import SCHEDULE_MIN_TEXT_CHARS
from app.routers.company_info_models import (
    ExtractedDeadline,
    ExtractedDocument,
    ExtractedItem,
    ExtractedScheduleInfo,
)


def _parse_extracted_schedule_info(
    data: dict | None,
    default_source_url: str,
) -> ExtractedScheduleInfo:
    deadlines = []
    raw_deadlines = data.get("deadlines") if isinstance(data, dict) else []
    if not isinstance(raw_deadlines, list):
        raw_deadlines = []
    for d in raw_deadlines:
        if not isinstance(d, dict):
            continue
        deadlines.append(
            ExtractedDeadline(
                type=d.get("type", "other"),
                title=d.get("title", ""),
                due_date=d.get("due_date"),
                source_url=d.get("source_url", default_source_url),
                confidence=d.get("confidence", "low"),
            )
        )

    required_documents = []
    raw_docs = data.get("required_documents") if isinstance(data, dict) else []
    if not isinstance(raw_docs, list):
        raw_docs = []
    for doc in raw_docs:
        if not isinstance(doc, dict):
            continue
        required_documents.append(
            ExtractedDocument(
                name=doc.get("name", ""),
                required=doc.get("required", True),
                source_url=doc.get("source_url", default_source_url),
                confidence=doc.get("confidence", "low"),
            )
        )

    am_data = data.get("application_method") if isinstance(data, dict) else None
    application_method = None
    if isinstance(am_data, dict):
        application_method = ExtractedItem(
            value=am_data.get("value", ""),
            source_url=am_data.get("source_url", default_source_url),
            confidence=am_data.get("confidence", "low"),
        )

    sp_data = data.get("selection_process") if isinstance(data, dict) else None
    selection_process = None
    if isinstance(sp_data, dict):
        selection_process = ExtractedItem(
            value=sp_data.get("value", ""),
            source_url=sp_data.get("source_url", default_source_url),
            confidence=sp_data.get("confidence", "low"),
        )

    return ExtractedScheduleInfo(
        deadlines=deadlines,
        required_documents=required_documents,
        application_method=application_method,
        selection_process=selection_process,
    )


def _count_schedule_signal_items(extracted: ExtractedScheduleInfo | None) -> int:
    if not extracted:
        return 0
    return (
        len(extracted.deadlines)
        + len(extracted.required_documents)
        + int(extracted.application_method is not None)
        + int(extracted.selection_process is not None)
    )


def _schedule_candidate_requires_ocr(
    candidate_url: str,
    extracted: ExtractedScheduleInfo | None,
    preview_text: str | None,
) -> bool:
    lower_url = urlparse(candidate_url).path.lower()
    if lower_url.endswith(".pdf"):
        return True
    if _count_schedule_signal_items(extracted) > 0:
        return False
    return len((preview_text or "").strip()) < SCHEDULE_MIN_TEXT_CHARS


def _build_schedule_extraction_prompts(
    url: str,
    graduation_year: int | None,
    selection_type: str | None,
    *,
    text_for_llm: str | None,
) -> tuple[str, str]:
    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100
    start_year = grad_year - 2
    end_year = grad_year - 1

    if selection_type == "main_selection":
        year_rules = SCHEDULE_YEAR_RULES_MAIN.format(
            grad_year_short=grad_year_short,
            end_year=end_year,
            start_year=start_year,
        )
    elif selection_type == "internship":
        year_rules = SCHEDULE_YEAR_RULES_INTERNSHIP.format(
            grad_year_short=grad_year_short,
            end_year=end_year,
            start_year=start_year,
        )
    else:
        year_rules = SCHEDULE_YEAR_RULES_GENERIC.format(
            grad_year_short=grad_year_short,
            end_year=end_year,
            start_year=start_year,
        )

    selection_type_label = (
        "本選考"
        if selection_type == "main_selection"
        else "インターン" if selection_type == "internship" else "選考"
    )
    system_prompt_template = SCHEDULE_SYSTEM_PROMPT
    system_prompt = system_prompt_template.format(
        selection_type_label=selection_type_label,
        grad_year_short=grad_year_short,
        start_year=start_year,
        end_year=end_year,
        year_rules=year_rules,
        url=url,
    )
    if text_for_llm is not None:
        user_message_template = SCHEDULE_USER_MESSAGE_TEXT
        user_message = user_message_template.format(
            selection_type_label=selection_type_label,
            text_for_llm=text_for_llm,
        )
    else:
        user_message = SCHEDULE_USER_MESSAGE_URL.format(
            url=url,
            selection_type_label=selection_type_label,
        )
    return system_prompt, user_message
