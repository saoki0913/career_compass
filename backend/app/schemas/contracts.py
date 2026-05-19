"""BFF <-> FastAPI contract mirrors.

These Pydantic models intentionally describe wire-shape contracts only. They
do not move route orchestration or feature domain logic.
"""
from __future__ import annotations

from typing import Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


class ProgressEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["progress"]


class StringChunkEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["string_chunk"]
    text: str
    path: str | None = None


class ErrorEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["error"]
    message: str | None = None


class GakuchikaFieldCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["field_complete"]
    path: str
    value: Any

    @model_validator(mode="after")
    def _validate_known_numeric_paths(self) -> "GakuchikaFieldCompleteEvent":
        if self.path == "remaining_questions_estimate":
            if not isinstance(self.value, int) or self.value < 0:
                raise ValueError("remaining_questions_estimate must be a non-negative integer")
        return self


class GakuchikaCompleteData(BaseModel):
    model_config = ConfigDict(extra="allow")

    question: str
    conversation_state: dict[str, Any]
    next_action: str

    @model_validator(mode="after")
    def _validate_conversation_state(self) -> "GakuchikaCompleteData":
        estimate = self.conversation_state.get("remaining_questions_estimate")
        if estimate is not None and (not isinstance(estimate, int) or estimate < 0):
            raise ValueError("remaining_questions_estimate must be a non-negative integer")
        return self


class GakuchikaCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["complete"]
    data: GakuchikaCompleteData


class MotivationCompleteData(BaseModel):
    model_config = ConfigDict(extra="allow")

    question: str | None = None
    nextAction: str | None = None


class MotivationCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["complete"]
    data: MotivationCompleteData


class InterviewCompleteData(BaseModel):
    model_config = ConfigDict(extra="allow")

    turn_state: dict[str, Any] | None = None
    turn_meta: dict[str, Any] | None = None
    interview_plan: dict[str, Any] | None = None
    question_stage: str | None = None


class InterviewCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["complete"]
    data: InterviewCompleteData


class EsReviewBillingOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    billable: bool
    schema_version: int = Field(ge=1)


class EsReviewTemplateReview(BaseModel):
    model_config = ConfigDict(extra="allow")

    template_type: Literal[
        "basic",
        "company_motivation",
        "intern_reason",
        "intern_goals",
        "gakuchika",
        "self_pr",
        "post_join_goals",
        "role_course_reason",
        "work_values",
    ]
    keyword_sources: list[dict[str, Any]] = Field(default_factory=list)


class EsReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rewrites: list[str] = Field(min_length=1)
    template_review: EsReviewTemplateReview | None = None
    improvement_explanation: str | None = None
    review_meta: dict[str, Any] | None = None
    billing_outcome: EsReviewBillingOutcome


class EsReviewCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["complete"]
    result: EsReviewResult
    internal_telemetry: dict[str, Any] | None = None


class EsReviewStreamRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=6, max_length=1500)
    section_id: str | None = None
    document_id: str | None = None
    company_id: str | None = None
    section_title: str = Field(min_length=1, max_length=300)
    section_char_limit: int | None = Field(default=None, ge=1, le=1500)
    template_request: dict[str, Any] | None = None
    role_context: dict[str, Any] | None = None
    retrieval_query: str | None = None
    profile_context: dict[str, Any] | None = None
    gakuchika_context: list[dict[str, Any]] = Field(default_factory=list)
    document_context: dict[str, Any] | None = None
    llm_model: str | None = None
    user_provided_corporate_urls: list[str] = Field(default_factory=list)


FastApiStreamEvent = TypeAdapter(
    Union[
        ProgressEvent,
        StringChunkEvent,
        GakuchikaFieldCompleteEvent,
        ErrorEvent,
        EsReviewCompleteEvent,
        GakuchikaCompleteEvent,
        InterviewCompleteEvent,
        MotivationCompleteEvent,
    ]
)


class CareerPrincipalActor(BaseModel):
    kind: Literal["user", "guest"]
    id: str = Field(min_length=1)


class CareerPrincipalPayload(BaseModel):
    scope: Literal["company", "ai-stream"]
    actor: CareerPrincipalActor
    plan: Literal["guest", "free", "standard", "pro"]
    company_id: str | None
    iat: int
    nbf: int
    exp: int
    jti: str = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_company_scope(self) -> "CareerPrincipalPayload":
        if self.scope == "company" and not self.company_id:
            raise ValueError("company scope requires company_id")
        return self


class PostSuccessBillingPolicy(BaseModel):
    kind: Literal["post_success"]
    creditsPerSuccess: int = Field(gt=0)


class ThreePhaseBillingPolicy(BaseModel):
    kind: Literal["three_phase"]
    reserveBeforeStream: Literal[True]


class FreeBillingPolicy(BaseModel):
    kind: Literal["free"]


StreamBillingPolicy = TypeAdapter(
    Union[PostSuccessBillingPolicy, ThreePhaseBillingPolicy, FreeBillingPolicy]
)
