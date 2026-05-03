"""Typed models for motivation router."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


# E-3 / P3-5: 深掘り名前空間 (planner gap_id / API target_area / model weakness_tag)
# を相互変換するための canonical enum。既存のワイヤー上の文字列は温存したまま、
# 境界で convert するためのユーティリティとして使う。
class DeepDiveGap(str, Enum):
    COMPANY_REASON = "company_reason"
    SELF_CONNECTION = "self_connection"
    DESIRED_WORK = "desired_work"
    VALUE_CONTRIBUTION = "value_contribution"
    DIFFERENTIATION = "differentiation"
    WHY_NOW = "why_now"

    # --- 入力サイド: ワイヤー文字列 → canonical ---
    @classmethod
    def from_gap_id(cls, gap_id: str | None) -> Optional["DeepDiveGap"]:
        mapping = {
            "company_reason_specificity": cls.COMPANY_REASON,
            "self_connection_gap": cls.SELF_CONNECTION,
            "role_reason_missing": cls.DESIRED_WORK,
            "value_contribution_vague": cls.VALUE_CONTRIBUTION,
            "differentiation_missing": cls.DIFFERENTIATION,
            "why_now_missing": cls.WHY_NOW,
        }
        return mapping.get((gap_id or "").strip())

    @classmethod
    def from_target_area(cls, target_area: str | None) -> Optional["DeepDiveGap"]:
        mapping = {
            "company_reason_strengthening": cls.COMPANY_REASON,
            "origin_background": cls.SELF_CONNECTION,
            "desired_work_clarity": cls.DESIRED_WORK,
            "value_contribution_clarity": cls.VALUE_CONTRIBUTION,
            "differentiation_strengthening": cls.DIFFERENTIATION,
            "why_now_strengthening": cls.WHY_NOW,
        }
        return mapping.get((target_area or "").strip())

    @classmethod
    def from_weakness_tag(cls, weakness_tag: str | None) -> Optional["DeepDiveGap"]:
        mapping = {
            "company_reason_generic": cls.COMPANY_REASON,
            "self_connection_weak": cls.SELF_CONNECTION,
            "desired_work_too_abstract": cls.DESIRED_WORK,
            "value_contribution_vague": cls.VALUE_CONTRIBUTION,
            "differentiation_missing": cls.DIFFERENTIATION,
            "why_now_missing": cls.WHY_NOW,
        }
        return mapping.get((weakness_tag or "").strip())

    @classmethod
    def from_stage(cls, stage: str | None) -> Optional["DeepDiveGap"]:
        """draft_blockers 等の stage/slot 文字列から canonical を解決する。

        `to_stage()` は WHY_NOW と COMPANY_REASON が同じ stage "company_reason" を
        返す非単射なので、逆引きでは COMPANY_REASON を優先する。
        """
        mapping = {
            "company_reason": cls.COMPANY_REASON,
            "self_connection": cls.SELF_CONNECTION,
            "desired_work": cls.DESIRED_WORK,
            "value_contribution": cls.VALUE_CONTRIBUTION,
            "differentiation": cls.DIFFERENTIATION,
        }
        return mapping.get((stage or "").strip())

    # --- 出力サイド: canonical → ワイヤー文字列 ---
    def to_gap_id(self) -> str:
        return {
            DeepDiveGap.COMPANY_REASON: "company_reason_specificity",
            DeepDiveGap.SELF_CONNECTION: "self_connection_gap",
            DeepDiveGap.DESIRED_WORK: "role_reason_missing",
            DeepDiveGap.VALUE_CONTRIBUTION: "value_contribution_vague",
            DeepDiveGap.DIFFERENTIATION: "differentiation_missing",
            DeepDiveGap.WHY_NOW: "why_now_missing",
        }[self]

    def to_target_area(self) -> str:
        return {
            DeepDiveGap.COMPANY_REASON: "company_reason_strengthening",
            DeepDiveGap.SELF_CONNECTION: "origin_background",
            DeepDiveGap.DESIRED_WORK: "desired_work_clarity",
            DeepDiveGap.VALUE_CONTRIBUTION: "value_contribution_clarity",
            DeepDiveGap.DIFFERENTIATION: "differentiation_strengthening",
            DeepDiveGap.WHY_NOW: "why_now_strengthening",
        }[self]

    def to_weakness_tag(self) -> str:
        return {
            DeepDiveGap.COMPANY_REASON: "company_reason_generic",
            DeepDiveGap.SELF_CONNECTION: "self_connection_weak",
            DeepDiveGap.DESIRED_WORK: "desired_work_too_abstract",
            DeepDiveGap.VALUE_CONTRIBUTION: "value_contribution_vague",
            DeepDiveGap.DIFFERENTIATION: "differentiation_missing",
            DeepDiveGap.WHY_NOW: "why_now_missing",
        }[self]

    def to_stage(self) -> str:
        # planner の slot と API の stage は一致
        return {
            DeepDiveGap.COMPANY_REASON: "company_reason",
            DeepDiveGap.SELF_CONNECTION: "self_connection",
            DeepDiveGap.DESIRED_WORK: "desired_work",
            DeepDiveGap.VALUE_CONTRIBUTION: "value_contribution",
            DeepDiveGap.DIFFERENTIATION: "differentiation",
            DeepDiveGap.WHY_NOW: "company_reason",  # why_now は company_reason 系の補強
        }[self]


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
    # 会話要約が 20 件超で発動するが、フォールバック時の安全マージンとして 60 を許容
    conversation_history: list[Message] = Field(max_length=60)
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
    # D-2 / P2-1: RAG グラウンディングのロール軸を決めるために追加（加法的、未送信時は None）
    selected_role: Optional[str] = Field(default=None, max_length=200)
    # 会話要約が 20 件超で発動するが、フォールバック時の安全マージンとして 60 を許容
    conversation_history: list[Message] = Field(max_length=60)
    slot_summaries: Optional[dict[str, Optional[str]]] = None
    slot_evidence_sentences: Optional[dict[str, list[str]]] = None
    char_limit: int = Field(default=400, ge=300, le=500)
    is_regeneration: bool = False


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
    "DeepDiveGap",
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
