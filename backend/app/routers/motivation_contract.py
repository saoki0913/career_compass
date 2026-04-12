"""
Motivation response-contract helpers.

Shared serialization logic for the motivation router and streaming module.
Keeps the wire shape for Next.js consistent while reducing duplicated field
assembly across regular and SSE responses.
"""

from __future__ import annotations

from typing import Any

from app.routers.motivation_context import (
    REQUIRED_MOTIVATION_STAGES,
    _normalize_conversation_context,
    _normalize_slot_state_map,
)
from app.routers.motivation_models import NextQuestionResponse, StageStatus


def build_stage_status(conversation_context: dict[str, Any] | None, current_stage: str) -> StageStatus:
    context = _normalize_conversation_context(conversation_context)
    normalized_current_stage = (
        "self_connection" if current_stage in {"origin_experience", "fit_connection"} else current_stage
    )
    slot_states = _normalize_slot_state_map(context.get("slotStates"))
    completed = [
        stage for stage in REQUIRED_MOTIVATION_STAGES
        if slot_states.get(stage) == "locked"
    ]
    pending = [
        stage
        for stage in REQUIRED_MOTIVATION_STAGES
        if stage not in completed and stage != normalized_current_stage
    ]
    return StageStatus(current=normalized_current_stage, completed=completed, pending=pending)


def build_stream_complete_data(response_obj: NextQuestionResponse) -> dict[str, Any]:
    payload = response_obj.model_dump(mode="json", exclude={"internal_telemetry"})
    if response_obj.stage_status is None:
        payload["stage_status"] = {}
    return payload


def build_stream_complete_event(response_obj: NextQuestionResponse) -> dict[str, Any]:
    return {
        "data": build_stream_complete_data(response_obj),
        "internal_telemetry": response_obj.internal_telemetry,
    }


__all__ = [
    "build_stage_status",
    "build_stream_complete_data",
    "build_stream_complete_event",
]
