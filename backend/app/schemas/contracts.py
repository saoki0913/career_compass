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


class EsReviewCompleteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["complete"]
    result: dict[str, Any]


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
