"""Phase 2 Stage 2 façade seam test.

Asserts that every public symbol from the ``_interview`` subpackage is
re-exported through the ``app.routers.interview`` façade and that the split
modules exist and are importable. Any drift between the façade ``__all__``
and the underlying submodules will trip this test, preventing silent loss of
a monkeypatch target or a Pydantic model that external callers rely on.
"""

from __future__ import annotations

import importlib

EXPECTED_SUBMODULES = (
    "contracts",
    "setup",
    "planning",
    "prompting",
    "generators",
    "endpoints",
)

# Names that the façade guarantees to keep re-exporting. Pulled from the
# plan (see interview-quality-improvement-web-*.md, Phase 2 Stage 2) plus
# every identifier currently referenced by a test or by the downstream Next
# API. A missing symbol here is a breaking change that must be explicit.
FACADE_REEXPORTS: tuple[str, ...] = (
    # router / handlers
    "router",
    "start_interview",
    "next_interview_turn",
    "continue_interview",
    "interview_feedback",
    # request models
    "Message",
    "InterviewBaseRequest",
    "InterviewStartRequest",
    "InterviewTurnRequest",
    "InterviewContinueRequest",
    "InterviewFeedbackRequest",
    # schemas
    "INTERVIEW_PLAN_SCHEMA",
    "INTERVIEW_OPENING_SCHEMA",
    "INTERVIEW_TURN_SCHEMA",
    "INTERVIEW_CONTINUE_SCHEMA",
    "INTERVIEW_FEEDBACK_SCHEMA",
    # allow-lists
    "ROLE_TRACKS",
    "ROLE_TRACK_KEYWORDS",
    "INTERVIEW_FORMATS",
    "SELECTION_TYPES",
    "INTERVIEW_STAGES",
    "INTERVIEWER_TYPES",
    "STRICTNESS_MODES",
    "LEGACY_STAGE_ORDER",
    "QUESTION_STAGE_ORDER",
    "LEGACY_STAGE_LABELS",
    # setup + planning helpers referenced by tests
    "_build_setup",
    "_infer_role_track",
    "_infer_stage_from_topic",
    "_question_stage_from_turn_meta",
    "_build_plan_prompt",
    "_build_opening_prompt",
    "_build_turn_prompt",
    "_build_feedback_prompt",
    "_build_continue_prompt",
    "_fallback_plan",
    "_fallback_short_coaching",
    "_fallback_turn_meta",
    "_build_fallback_opening_payload",
    "_build_fallback_turn_payload",
    "_build_fallback_continue_payload",
    "_merge_plan_progress",
    "_derive_turn_state_for_question",
    "_normalize_feedback",
    "_enrich_feedback_defaults",
    "_checklist_for_topic",
    # generators / SSE plumbing
    "_sse_event",
    "_sse_error_event",
    "_stream_response",
    "_stream_llm_json_completion",
    "_generate_start_progress",
    "_generate_turn_progress",
    "_generate_continue_progress",
    "_generate_feedback_progress",
    # monkeypatch targets re-exported for backwards compatibility
    "call_llm_streaming_fields",
    "consume_request_llm_cost_summary",
)


def test_interview_subpackage_has_expected_submodules() -> None:
    """Every submodule of the Stage 2 split must be importable on its own."""
    for name in EXPECTED_SUBMODULES:
        module = importlib.import_module(f"app.routers._interview.{name}")
        assert module is not None, f"_interview.{name} failed to import"


def test_facade_reexports_all_public_symbols() -> None:
    """Every plan-documented public symbol must still live on the façade."""
    facade = importlib.import_module("app.routers.interview")
    missing = [name for name in FACADE_REEXPORTS if not hasattr(facade, name)]
    assert not missing, f"Façade is missing re-exports: {missing}"


def test_facade_identity_matches_submodule_symbols() -> None:
    """Ensure the façade reference points at the canonical submodule symbol
    rather than a silent copy. Catches accidental rebinds during future
    refactors."""
    facade = importlib.import_module("app.routers.interview")
    generators = importlib.import_module("app.routers._interview.generators")
    planning = importlib.import_module("app.routers._interview.planning")
    prompting = importlib.import_module("app.routers._interview.prompting")
    setup = importlib.import_module("app.routers._interview.setup")
    endpoints = importlib.import_module("app.routers._interview.endpoints")

    # router comes from endpoints
    assert facade.router is endpoints.router

    # generators-owned symbols
    for name in (
        "_sse_event",
        "_sse_error_event",
        "_stream_response",
        "_stream_llm_json_completion",
        "_generate_start_progress",
        "_generate_turn_progress",
        "_generate_continue_progress",
        "_generate_feedback_progress",
    ):
        assert getattr(facade, name) is getattr(generators, name), (
            f"Façade.{name} is not the generators-module symbol"
        )

    # planning-owned symbols
    for name in (
        "_build_setup",  # via planning import chain? no — setup owns it
    ):
        pass
    for name in ("_fallback_plan", "_merge_plan_progress", "_derive_turn_state_for_question"):
        assert getattr(facade, name) is getattr(planning, name)

    # prompting-owned symbols
    for name in ("_build_plan_prompt", "_build_opening_prompt", "_build_turn_prompt"):
        assert getattr(facade, name) is getattr(prompting, name)

    # setup-owned symbols
    for name in ("_build_setup", "_infer_role_track", "_infer_stage_from_topic"):
        assert getattr(facade, name) is getattr(setup, name)


def test_facade_router_registers_interview_routes() -> None:
    """Sanity check: façade router exposes the expected route set.

    Phase 2 Stage 7 adds /drill/start and /drill/score to the original 4 SSE routes.
    Keep this test as an allowlist of all public endpoints under /api/interview.
    """
    facade = importlib.import_module("app.routers.interview")
    paths = {route.path for route in facade.router.routes}
    assert paths == {
        "/api/interview/start",
        "/api/interview/turn",
        "/api/interview/continue",
        "/api/interview/feedback",
        # Phase 2 Stage 7
        "/api/interview/drill/start",
        "/api/interview/drill/score",
    }
