"""Typed contracts for ES template definitions."""

from __future__ import annotations

from typing import Any, TypedDict


class EvaluationAxis(TypedDict):
    name: str
    pass_condition: str
    rewrite_instruction: str


class TemplateDef(TypedDict, total=False):
    label: str
    requires_company_rag: bool
    grounding_level: str
    description: str
    purpose: str
    required_elements: list[str]
    anti_patterns: list[str]
    recommended_structure: dict[str, Any]
    evaluation_checks: dict[str, Any]
    evaluation_axes: list[EvaluationAxis]
    retry_guidance: dict[str, str]
    company_usage: str
    fact_priority: str
    extra_fields: list[str]
    rewrite_closing_guidance: str
    negative_reframe_guidance: list[str]
    question_focus_rules: list[dict[str, Any]]
    playbook: dict[str, str]
