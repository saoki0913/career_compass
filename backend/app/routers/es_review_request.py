"""Request sanitization helpers for ES review router."""

from __future__ import annotations

from typing import Any, Optional

from app.routers.es_review_models import ReviewRequest
from app.utils.llm import detect_es_injection_risk, sanitize_es_content, sanitize_prompt_input


def iter_string_leaves(field_name: str, value: Any) -> list[tuple[str, str]]:
    if isinstance(value, str):
        normalized = value.strip()
        return [(field_name, normalized)] if normalized else []
    if isinstance(value, list):
        leaves: list[tuple[str, str]] = []
        for index, item in enumerate(value):
            leaves.extend(iter_string_leaves(f"{field_name}[{index}]", item))
        return leaves
    if isinstance(value, dict):
        leaves: list[tuple[str, str]] = []
        for key, item in value.items():
            leaves.extend(iter_string_leaves(f"{field_name}.{key}", item))
        return leaves
    return []


def collect_injection_scan_targets(request: ReviewRequest) -> list[tuple[str, str]]:
    targets: list[tuple[str, str]] = [("content", request.content)]
    if request.section_title:
        targets.append(("section_title", request.section_title))
    if request.retrieval_query:
        targets.append(("retrieval_query", request.retrieval_query))

    template_request = request.template_request
    if template_request:
        targets.extend(
            [
                ("template.company_name", template_request.company_name or ""),
                ("template.industry", template_request.industry or ""),
                ("template.question", template_request.question),
                ("template.answer", template_request.answer),
                ("template.intern_name", template_request.intern_name or ""),
                ("template.role_name", template_request.role_name or ""),
            ]
        )

    role_context = request.role_context
    if role_context:
        targets.append(("role_context.primary_role", role_context.primary_role or ""))
        for index, candidate in enumerate(role_context.role_candidates):
            targets.append((f"role_context.role_candidates[{index}]", candidate))

    profile_context = request.profile_context
    if profile_context:
        targets.extend(
            [("profile.university", profile_context.university or ""), ("profile.faculty", profile_context.faculty or "")]
        )
        for index, industry in enumerate(profile_context.target_industries):
            targets.append((f"profile.target_industries[{index}]", industry))
        for index, job_type in enumerate(profile_context.target_job_types):
            targets.append((f"profile.target_job_types[{index}]", job_type))

    for index, item in enumerate(request.gakuchika_context):
        targets.extend(
            [
                (f"gakuchika[{index}].title", item.title),
                (f"gakuchika[{index}].action_text", item.action_text or ""),
                (f"gakuchika[{index}].result_text", item.result_text or ""),
                (f"gakuchika[{index}].content_excerpt", item.content_excerpt or ""),
            ]
        )
        for fact_index, fact_span in enumerate(item.fact_spans):
            targets.append((f"gakuchika[{index}].fact_spans[{fact_index}]", fact_span))
        for leaf_name, leaf_value in iter_string_leaves(f"gakuchika[{index}].strengths", item.strengths):
            targets.append((leaf_name, leaf_value))

    document_context = request.document_context
    if document_context:
        for index, section in enumerate(document_context.other_sections):
            targets.extend(
                [
                    (f"document_context.other_sections[{index}].title", section.title),
                    (f"document_context.other_sections[{index}].content", section.content),
                ]
            )

    return [(field_name, value) for field_name, value in targets if value]


def detect_request_injection_risk(request: ReviewRequest) -> tuple[str, list[str]]:
    risk_priority = {"none": 0, "medium": 1, "high": 2}
    detected_risk = "none"
    detected_reasons: list[str] = []

    for field_name, value in collect_injection_scan_targets(request):
        field_risk, field_reasons = detect_es_injection_risk(value)
        if risk_priority[field_risk] > risk_priority[detected_risk]:
            detected_risk = field_risk
        for reason in field_reasons:
            tagged_reason = f"{field_name}:{reason}"
            if tagged_reason not in detected_reasons:
                detected_reasons.append(tagged_reason)
    return detected_risk, detected_reasons


def sanitize_nested_prompt_value(value: Any, *, max_length: int = 500) -> Any:
    if isinstance(value, str):
        return sanitize_prompt_input(value, max_length=max_length).strip()
    if isinstance(value, list):
        return [sanitize_nested_prompt_value(item, max_length=max_length) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_nested_prompt_value(item, max_length=max_length) for key, item in value.items()}
    return value


def sanitize_optional_prompt_text(value: Optional[str], *, max_length: int = 500) -> Optional[str]:
    if value is None:
        return None
    sanitized = sanitize_prompt_input(value, max_length=max_length).strip()
    return sanitized or None


def sanitize_review_request(request: ReviewRequest) -> None:
    request.content = sanitize_es_content(request.content, max_length=5000)
    request.section_title = sanitize_optional_prompt_text(request.section_title, max_length=300)
    request.retrieval_query = sanitize_optional_prompt_text(request.retrieval_query, max_length=600)

    template_request = request.template_request
    if template_request:
        template_request.company_name = sanitize_optional_prompt_text(template_request.company_name, max_length=200)
        template_request.industry = sanitize_optional_prompt_text(template_request.industry, max_length=100)
        template_request.question = sanitize_prompt_input(template_request.question, max_length=300).strip()
        template_request.answer = sanitize_es_content(template_request.answer, max_length=5000)
        template_request.intern_name = sanitize_optional_prompt_text(template_request.intern_name, max_length=200)
        template_request.role_name = sanitize_optional_prompt_text(template_request.role_name, max_length=200)

    role_context = request.role_context
    if role_context:
        role_context.primary_role = sanitize_optional_prompt_text(role_context.primary_role, max_length=200)
        role_context.role_candidates = [
            candidate
            for candidate in (
                sanitize_optional_prompt_text(candidate, max_length=200) for candidate in role_context.role_candidates
            )
            if candidate
        ]

    profile_context = request.profile_context
    if profile_context:
        profile_context.university = sanitize_optional_prompt_text(profile_context.university, max_length=200)
        profile_context.faculty = sanitize_optional_prompt_text(profile_context.faculty, max_length=200)
        profile_context.target_industries = [
            industry
            for industry in (
                sanitize_optional_prompt_text(item, max_length=100) for item in profile_context.target_industries
            )
            if industry
        ]
        profile_context.target_job_types = [
            job_type
            for job_type in (
                sanitize_optional_prompt_text(item, max_length=100) for item in profile_context.target_job_types
            )
            if job_type
        ]

    for item in request.gakuchika_context:
        item.title = sanitize_prompt_input(item.title, max_length=200).strip()
        item.action_text = sanitize_optional_prompt_text(item.action_text, max_length=400)
        item.result_text = sanitize_optional_prompt_text(item.result_text, max_length=400)
        item.content_excerpt = sanitize_optional_prompt_text(item.content_excerpt, max_length=800)
        item.fact_spans = [
            fact_span
            for fact_span in (sanitize_optional_prompt_text(value, max_length=200) for value in item.fact_spans)
            if fact_span
        ]
        item.strengths = sanitize_nested_prompt_value(item.strengths, max_length=200)

    document_context = request.document_context
    if document_context:
        for section in document_context.other_sections:
            section.title = sanitize_prompt_input(section.title, max_length=200).strip()
            section.content = sanitize_prompt_input(section.content, max_length=800).strip()
