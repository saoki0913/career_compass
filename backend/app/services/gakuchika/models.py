"""Pydantic models for the Gakuchika FastAPI slice."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class ConversationStateInput(BaseModel):
    stage: str | None = Field(default=None, max_length=40)
    focus_key: str | None = Field(default=None, max_length=40)
    progress_label: str | None = Field(default=None, max_length=80)
    answer_hint: str | None = Field(default=None, max_length=160)
    input_richness_mode: str | None = Field(default=None, max_length=32)
    missing_elements: list[str] = Field(default_factory=list)
    draft_quality_checks: dict[str, bool] = Field(default_factory=dict)
    causal_gaps: list[str] = Field(default_factory=list)
    completion_checks: dict[str, bool] = Field(default_factory=dict)
    ready_for_draft: bool = False
    draft_readiness_reason: str | None = Field(default=None, max_length=240)
    draft_text: str | None = Field(default=None, max_length=3000)
    draft_document_id: str | None = Field(default=None, max_length=120)
    summary_stale: bool = False
    strength_tags: list[str] = Field(default_factory=list)
    issue_tags: list[str] = Field(default_factory=list)
    deepdive_recommendation_tags: list[str] = Field(default_factory=list)
    credibility_risk_tags: list[str] = Field(default_factory=list)
    deepdive_stage: str | None = Field(default=None, max_length=40)
    deepdive_complete: bool = False
    completion_reasons: list[str] = Field(default_factory=list)
    asked_focuses: list[str] = Field(default_factory=list)
    resolved_focuses: list[str] = Field(default_factory=list)
    deferred_focuses: list[str] = Field(default_factory=list)
    blocked_focuses: list[str] = Field(default_factory=list)
    recent_question_texts: list[str] = Field(default_factory=list)
    loop_blocked_focuses: list[str] = Field(default_factory=list)
    focus_attempt_counts: dict[str, int] = Field(default_factory=dict)
    last_question_signature: str | None = Field(default=None, max_length=120)
    extended_deep_dive_round: int = Field(default=0, ge=0, le=100)
    coach_progress_message: str | None = Field(default=None, max_length=120)
    paused_question: str | None = Field(default=None, max_length=300)
    remaining_questions_estimate: int | None = Field(default=None, ge=0, le=20)
    retry_degraded: bool = False

    model_config = {"extra": "ignore"}


class NextQuestionRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    gakuchika_content: Optional[str] = Field(default=None, max_length=5000)
    char_limit_type: Optional[str] = Field(default=None, pattern=r"^(300|400|500)$")
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    conversation_state: Optional[ConversationStateInput] = None


class NextQuestionResponse(BaseModel):
    question: str
    conversation_state: dict[str, Any]
    next_action: str = "ask"
    internal_telemetry: Optional[dict[str, object]] = None


class StructuredSummaryRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    draft_text: str = Field(max_length=3000)
    conversation_history: list[Message]


class StrengthItem(BaseModel):
    title: str
    description: str


class LearningItem(BaseModel):
    title: str
    description: str


class StructuredSummaryResponse(BaseModel):
    situation_text: str
    task_text: str
    action_text: str
    result_text: str
    strengths: list[StrengthItem]
    learnings: list[LearningItem]
    numbers: list[str]
    interviewer_hooks: list[str] = []
    decision_reasons: list[str] = []
    before_after_comparisons: list[str] = []
    credibility_notes: list[str] = []
    role_scope: str = ""
    reusable_principles: list[str] = []
    interview_supporting_details: list[str] = []
    future_outlook_notes: list[str] = []
    backstory_notes: list[str] = []
    one_line_core_answer: str = ""
    likely_followup_questions: list[str] = []
    weak_points_to_prepare: list[str] = []
    two_minute_version_outline: list[str] = []
    internal_telemetry: Optional[dict[str, object]] = None


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    conversation_history: list[Message]
    char_limit: int = Field(default=400, ge=300, le=500)
    known_facts: str | None = Field(default=None, max_length=3000)
    draft_material: dict[str, Any] | None = None


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int
    followup_suggestion: str = "更に深掘りする"
    draft_diagnostics: dict[str, list[str]] | None = None
    draft_quality: dict[str, Any] | None = None
    internal_telemetry: Optional[dict[str, object]] = None
