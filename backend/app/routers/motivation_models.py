"""Typed models for motivation router."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class MotivationScores(BaseModel):
    company_understanding: int = Field(default=0, ge=0, le=100)
    self_analysis: int = Field(default=0, ge=0, le=100)
    career_vision: int = Field(default=0, ge=0, le=100)
    differentiation: int = Field(default=0, ge=0, le=100)


class MotivationEvaluation(BaseModel):
    slot_status: dict[str, str]
    slot_status_v2: dict[str, str] = {}
    missing_slots: list[str]
    weak_slots: list[str] = []
    do_not_ask_slots: list[str] = []
    ready_for_draft: bool
    draft_readiness_reason: str
    draft_blockers: list[str] = []
    risk_flags: list[str] = []
    conversation_warnings: list[str] = []


class MotivationScoresInput(BaseModel):
    """Typed input for motivation scores from client."""

    company_understanding: int = Field(default=0, ge=0, le=100)
    self_analysis: int = Field(default=0, ge=0, le=100)
    career_vision: int = Field(default=0, ge=0, le=100)
    differentiation: int = Field(default=0, ge=0, le=100)

    model_config = {"extra": "ignore"}


class NextQuestionRequest(BaseModel):
    company_id: str = Field(max_length=100)
    company_name: str = Field(max_length=200)
    industry: Optional[str] = Field(default=None, max_length=100)
    generated_draft: Optional[str] = Field(default=None, max_length=8000)
    requires_industry_selection: bool = False
    industry_options: Optional[list[str]] = None
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    scores: Optional[MotivationScoresInput] = None
    gakuchika_context: Optional[list[dict]] = None
    conversation_context: Optional[dict[str, Any]] = None
    profile_context: Optional[dict[str, Any]] = None
    application_job_candidates: Optional[list[str]] = None
    company_role_candidates: Optional[list[str]] = None
    company_work_candidates: Optional[list[str]] = None


class EvidenceCard(BaseModel):
    sourceId: str
    title: str
    contentType: str
    excerpt: str
    sourceUrl: str
    relevanceLabel: str


class StageStatus(BaseModel):
    current: str
    completed: list[str]
    pending: list[str]


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    draft_ready: bool = False
    evaluation: Optional[dict] = None
    target_slot: Optional[str] = None
    question_intent: Optional[str] = None
    answer_contract: Optional[dict[str, Any]] = None
    target_element: Optional[str] = None
    company_insight: Optional[str] = None
    evidence_summary: Optional[str] = None
    evidence_cards: list[EvidenceCard] = []
    question_stage: Optional[str] = None
    question_focus: Optional[str] = None
    stage_status: Optional[StageStatus] = None
    captured_context: Optional[dict[str, Any]] = None
    coaching_focus: Optional[str] = None
    risk_flags: list[str] = []
    question_signature: Optional[str] = None
    semantic_question_signature: Optional[str] = None
    stage_attempt_count: Optional[int] = None
    question_difficulty_level: Optional[int] = None
    candidate_validation_summary: Optional[dict[str, Any]] = None
    weakness_tag: Optional[str] = None
    premise_mode: Optional[str] = None
    conversation_mode: Optional[str] = None
    current_slot: Optional[str] = None
    current_intent: Optional[str] = None
    next_advance_condition: Optional[str] = None
    progress: Optional[dict[str, Any]] = None
    causal_gaps: list[dict[str, Any]] = []
    internal_telemetry: Optional[dict[str, Any]] = None


class GenerateDraftRequest(BaseModel):
    company_id: str = Field(max_length=100)
    company_name: str = Field(max_length=200)
    industry: Optional[str] = Field(default=None, max_length=100)
    conversation_history: list[Message]
    slot_summaries: Optional[dict[str, Optional[str]]] = None
    slot_evidence_sentences: Optional[dict[str, list[str]]] = None
    char_limit: int = Field(default=400, ge=300, le=500)


class GenerateDraftResponse(BaseModel):
    draft: str
    char_count: int
    key_points: list[str]
    company_keywords: list[str]
    internal_telemetry: Optional[dict[str, Any]] = None


class GenerateDraftFromProfileRequest(BaseModel):
    company_id: str = Field(max_length=100)
    company_name: str = Field(max_length=200)
    industry: Optional[str] = Field(default=None, max_length=100)
    selected_role: str = Field(max_length=200)
    char_limit: int = Field(default=400, ge=300, le=500)
    gakuchika_context: Optional[list[dict]] = None
    profile_context: Optional[dict[str, Any]] = None


__all__ = [
    "EvidenceCard",
    "GenerateDraftFromProfileRequest",
    "GenerateDraftRequest",
    "GenerateDraftResponse",
    "Message",
    "MotivationEvaluation",
    "MotivationScores",
    "MotivationScoresInput",
    "NextQuestionRequest",
    "NextQuestionResponse",
    "StageStatus",
]
