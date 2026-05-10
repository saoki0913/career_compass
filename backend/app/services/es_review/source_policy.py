"""Source filtering and logging policy for ES review."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from app.prompts.es_templates import get_template_source_family_priority_name
from app.services.es_review.models import TemplateSource
from app.services.es_review.stream import _extract_domain
from app.utils.company_names import classify_company_domain_relation

EMPLOYEE_INTERVIEW_EVIDENCE_POSITIVE_SIGNALS = {
    "interview",
    "voice",
    "people",
    "person",
    "member",
    "members",
    "staff",
    "story",
    "talk",
    "社員紹介",
    "社員インタビュー",
    "社員の声",
    "先輩社員",
    "働く人",
    "人を知る",
    "人を読む",
}

EMPLOYEE_INTERVIEW_EVIDENCE_NEGATIVE_SIGNALS = {
    "investor",
    "investors",
    "ir",
    "financial",
    "earnings",
    "results",
    "governance",
    "integrated",
    "統合報告",
    "決算",
    "株主",
    "投資家",
    "有価証券",
    "企業データ",
    "会社概要",
    "企業概要",
    "company data",
    "company overview",
}


def _template_source_family_priority_name(template_type: str) -> str | None:
    return get_template_source_family_priority_name(template_type)


def _company_source_text(source: dict[str, Any]) -> str:
    return " ".join(
        str(source.get(key) or "").lower()
        for key in ("source_url", "title", "excerpt", "heading", "heading_path")
    )


def _filter_verified_company_rag_sources(
    rag_sources: list[dict],
    *,
    company_name: str | None,
) -> tuple[list[dict], list[dict], bool]:
    if not company_name:
        return list(rag_sources), [], False

    verified_sources: list[dict] = []
    rejected_sources: list[dict] = []
    has_mismatched_company_sources = False

    for source in rag_sources:
        enriched = dict(source)
        source_url = str(source.get("source_url") or "")
        content_type = str(source.get("content_type") or "")
        reason: str | None = None

        if not source_url:
            reason = "source_url_missing"
        else:
            relation = classify_company_domain_relation(source_url, company_name, content_type)
            enriched["domain_relation"] = relation
            enriched["domain"] = source.get("domain") or _extract_domain(source_url)
            if not relation.get("is_official"):
                has_mismatched_company_sources = True
                reason = "same_company_unverified"

        if not reason and content_type == "employee_interviews":
            haystack = _company_source_text(enriched)
            path = urlparse(source_url).path.rstrip("/").lower() if source_url else ""
            if not path:
                reason = "employee_root_page"
            elif any(signal in haystack for signal in EMPLOYEE_INTERVIEW_EVIDENCE_NEGATIVE_SIGNALS):
                reason = "employee_wrong_topic"
            elif not any(signal in haystack for signal in EMPLOYEE_INTERVIEW_EVIDENCE_POSITIVE_SIGNALS):
                reason = "employee_signal_missing"

        enriched["same_company_verified"] = reason is None
        enriched["validation_reason"] = reason or "verified"
        if reason is None:
            verified_sources.append(enriched)
        else:
            rejected_sources.append(enriched)

    return verified_sources, rejected_sources, has_mismatched_company_sources


def _format_rejected_source_log_lines(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return "  (none)"
    return "\n".join(
        "  "
        + f"{index}. reason={source.get('validation_reason', '-')}"
        + f" / type={source.get('content_type', '-')}"
        + f" / title={source.get('title', '-')}"
        + f" / url={source.get('source_url', '-')}"
        for index, source in enumerate(sources, start=1)
    )


def _format_source_log_lines(sources: list[TemplateSource]) -> str:
    if not sources:
        return "  (none)"
    return "\n".join(
        "  "
        + f"{index}. [{source.content_type_label or source.content_type}] "
        + f"title={source.title or '-'} / domain={source.domain or '-'} / url={source.source_url or '-'}"
        for index, source in enumerate(sources, start=1)
    )
