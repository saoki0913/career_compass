"""FastAPI route handlers for ``/api/interview``.

Each endpoint delegates to an SSE generator from ``generators.py`` after
sanitizing the incoming request payload. Prompt-safety errors surface as HTTP
400; all other failures fall through to the generator's own exception handler
which emits a sanitized SSE ``error`` event.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.limiter import limiter
from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
)
from app.prompts.interview_prompts import PROMPT_VERSION as INTERVIEW_PROMPT_VERSION
from app.routers._interview.contracts import (
    INTERVIEW_DRILL_SCORE_SCHEMA,
    INTERVIEW_DRILL_START_SCHEMA,
    SEVEN_AXIS_KEYS,
    InterviewBaseRequest,
    InterviewContinueRequest,
    InterviewDrillScoreRequest,
    InterviewDrillScoreResponse,
    InterviewDrillStartRequest,
    InterviewDrillStartResponse,
    InterviewFeedbackRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    Message,
)
from app.routers._interview.generators import (
    _generate_continue_progress,
    _generate_feedback_progress,
    _generate_start_progress,
    _generate_turn_progress,
    _stream_response,
)
from app.routers._interview.prompting import (
    _build_drill_score_prompt,
    _build_drill_start_prompt,
)
from app.utils.llm import call_llm_with_error
from app.utils.llm_prompt_safety import (
    PromptSafetyError,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)

router = APIRouter(prefix="/api/interview", tags=["interview"])


# ---------------------------------------------------------------------------
# Request sanitization helpers
# ---------------------------------------------------------------------------


def _sanitize_optional_text(value: Optional[str], max_length: int) -> Optional[str]:
    if value is None:
        return None
    return sanitize_user_prompt_text(value, max_length=max_length, rich_text=True)


def _sanitize_messages(messages: list[Message]) -> None:
    for message in messages:
        message.content = sanitize_user_prompt_text(message.content, max_length=3000, rich_text=True)


def _sanitize_base_request(payload: InterviewBaseRequest) -> None:
    """InterviewBaseRequest の全フィールドを 2-pass sanitize する。

    1-pass (``sanitize_user_prompt_text``) でユーザ入力としての XSS / 長さ / rich_text
    を揃え、2-pass (``sanitize_prompt_input``) で LLM へ渡す前のプロンプトインジェクション
    対策を行う。Phase 2 Stage 10 以前は route ハンドラー側で 2-pass を個別に呼んでおり、
    フィールド追加漏れと保守コストが高かったため、全 route 共通で 1 関数に統合する。
    """
    # ---- 1st pass: user-input sanitize (rich_text / length) ----
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    payload.company_summary = sanitize_user_prompt_text(
        payload.company_summary, max_length=4000, rich_text=True
    )
    payload.motivation_summary = _sanitize_optional_text(payload.motivation_summary, 4000)
    payload.gakuchika_summary = _sanitize_optional_text(payload.gakuchika_summary, 4000)
    payload.academic_summary = _sanitize_optional_text(payload.academic_summary, 4000)
    payload.research_summary = _sanitize_optional_text(payload.research_summary, 4000)
    payload.es_summary = _sanitize_optional_text(payload.es_summary, 4000)
    payload.selected_industry = _sanitize_optional_text(payload.selected_industry, 120)
    payload.selected_role = _sanitize_optional_text(payload.selected_role, 200)
    payload.selected_role_source = _sanitize_optional_text(payload.selected_role_source, 120)
    payload.role_track = _sanitize_optional_text(payload.role_track, 40)
    payload.interview_format = _sanitize_optional_text(payload.interview_format, 40)
    payload.selection_type = _sanitize_optional_text(payload.selection_type, 20)
    payload.interview_stage = _sanitize_optional_text(payload.interview_stage, 20)
    payload.interviewer_type = _sanitize_optional_text(payload.interviewer_type, 20)
    payload.strictness_mode = _sanitize_optional_text(payload.strictness_mode, 20)
    payload.seed_summary = _sanitize_optional_text(payload.seed_summary, 4000)

    # ---- 2nd pass: prompt-injection defence (LLM 入力直前の再 sanitize) ----
    # None 許容フィールドは fallback 文字列 ("なし" / "未設定") に揃えてから sanitize し、
    # prompt テンプレート側で None チェックを要求しない。
    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=4000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=4000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=4000)
    payload.academic_summary = sanitize_prompt_input(payload.academic_summary or "なし", max_length=4000)
    payload.research_summary = sanitize_prompt_input(payload.research_summary or "なし", max_length=4000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=4000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=4000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------


@router.post("/start")
@limiter.limit("60/minute")
async def start_interview(
    payload: InterviewStartRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    try:
        _sanitize_base_request(payload)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    return _stream_response(_generate_start_progress(payload))


@router.post("/turn")
@limiter.limit("60/minute")
async def next_interview_turn(
    payload: InterviewTurnRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    return _stream_response(_generate_turn_progress(payload))


@router.post("/continue")
@limiter.limit("60/minute")
async def continue_interview(
    payload: InterviewContinueRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    return _stream_response(_generate_continue_progress(payload))


@router.post("/feedback")
@limiter.limit("60/minute")
async def interview_feedback(
    payload: InterviewFeedbackRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    return _stream_response(_generate_feedback_progress(payload))


# ---------------------------------------------------------------------------
# Phase 2 Stage 7: Weakness drill endpoints
# ---------------------------------------------------------------------------


def _sanitize_drill_start(payload: InterviewDrillStartRequest) -> None:
    """drill/start request の文字列フィールドを sanitize する。

    会話履歴を含まない非 SSE endpoint なので、rich_text=True は本文長フィールドのみ
    に適用する。conversation_id / turn_id はプレーン文字列として扱う。
    """
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    if payload.company_summary:
        payload.company_summary = sanitize_user_prompt_text(
            payload.company_summary, max_length=4000, rich_text=True
        )
    payload.weakest_question = sanitize_user_prompt_text(
        payload.weakest_question, max_length=4000, rich_text=True
    )
    payload.weakest_answer = sanitize_user_prompt_text(
        payload.weakest_answer, max_length=4000, rich_text=True
    )
    payload.weakest_axis = sanitize_user_prompt_text(payload.weakest_axis, max_length=40)
    if payload.selected_role is not None:
        payload.selected_role = sanitize_user_prompt_text(payload.selected_role, max_length=200)
    payload.interview_format = sanitize_user_prompt_text(payload.interview_format, max_length=40)
    payload.interviewer_type = sanitize_user_prompt_text(payload.interviewer_type, max_length=20)
    payload.strictness_mode = sanitize_user_prompt_text(payload.strictness_mode, max_length=20)
    # weakest_evidence は list[str]。各要素を個別に sanitize する。
    payload.weakest_evidence = [
        sanitize_user_prompt_text(str(item), max_length=400, rich_text=True)
        for item in (payload.weakest_evidence or [])
        if str(item).strip()
    ][:3]
    # Prompt injection defence (2 次 sanitize)。
    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary or "なし", max_length=4000)
    payload.weakest_question = sanitize_prompt_input(payload.weakest_question, max_length=4000)
    payload.weakest_answer = sanitize_prompt_input(payload.weakest_answer, max_length=4000)
    payload.weakest_axis = sanitize_prompt_input(payload.weakest_axis, max_length=40)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)


def _sanitize_drill_score(payload: InterviewDrillScoreRequest) -> None:
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    if payload.company_summary:
        payload.company_summary = sanitize_user_prompt_text(
            payload.company_summary, max_length=4000, rich_text=True
        )
    payload.retry_question = sanitize_user_prompt_text(
        payload.retry_question, max_length=4000, rich_text=True
    )
    payload.retry_answer = sanitize_user_prompt_text(
        payload.retry_answer, max_length=4000, rich_text=True
    )
    payload.weakest_axis = sanitize_user_prompt_text(payload.weakest_axis, max_length=40)
    if payload.selected_role is not None:
        payload.selected_role = sanitize_user_prompt_text(payload.selected_role, max_length=200)
    # original_scores の各値を 0-5 にクランプ (bad input ガード)。
    clamped: dict[str, int] = {}
    for key in SEVEN_AXIS_KEYS:
        value = payload.original_scores.get(key)
        if isinstance(value, (int, float)):
            clamped[key] = max(0, min(5, int(value)))
        else:
            clamped[key] = 0
    payload.original_scores = clamped
    # Prompt injection defence.
    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary or "なし", max_length=4000)
    payload.retry_question = sanitize_prompt_input(payload.retry_question, max_length=4000)
    payload.retry_answer = sanitize_prompt_input(payload.retry_answer, max_length=4000)
    payload.weakest_axis = sanitize_prompt_input(payload.weakest_axis, max_length=40)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)


def _coerce_retry_scores(raw: Any) -> dict[str, int]:
    """LLM 返却 retry_scores を 7 軸の int に正規化する。欠落・型不正は 0 で埋める。"""
    if not isinstance(raw, dict):
        return {key: 0 for key in SEVEN_AXIS_KEYS}
    result: dict[str, int] = {}
    for key in SEVEN_AXIS_KEYS:
        value = raw.get(key)
        if isinstance(value, bool):
            # bool は int のサブクラスなので明示的に弾く (True → 1 扱いを避ける)。
            result[key] = 0
            continue
        if isinstance(value, (int, float)):
            result[key] = max(0, min(5, int(value)))
        else:
            result[key] = 0
    return result


@router.post("/drill/start", response_model=InterviewDrillStartResponse)
@limiter.limit("30/minute")
async def interview_drill_start(
    payload: InterviewDrillStartRequest,
    request: Request,
) -> InterviewDrillStartResponse:
    """最弱回答について 4 field のコーチング内容を生成する。

    非 SSE (単発 JSON POST)。LLM 1 回呼び出し → json_schema mode で 4 field を返す。
    失敗時は deterministic fallback (空文字 3 件 + 一般化 retry question) で埋める。
    """
    try:
        _sanitize_drill_start(payload)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    prompt = _build_drill_start_prompt(payload)
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="ドリル 4 field を JSON で生成してください。",
        max_tokens=800,
        temperature=0.3,
        feature="interview",
        response_format="json_schema",
        json_schema=INTERVIEW_DRILL_START_SCHEMA,
    )

    data: dict[str, Any] = {}
    if llm_result.success and isinstance(llm_result.data, dict):
        data = llm_result.data

    why_weak = str(data.get("why_weak") or "").strip()
    improvement_pattern = str(data.get("improvement_pattern") or "").strip()
    model_rewrite = str(data.get("model_rewrite") or "").strip()
    retry_question = str(data.get("retry_question") or "").strip()

    # Deterministic fallback: 最低限の文言で UI を壊さない。本番品質は LLM に依存。
    if not retry_question:
        retry_question = f"先ほどの「{payload.weakest_axis}」の観点で、同じ問いに別の角度から答え直してみてください。"
    if not why_weak:
        why_weak = f"{payload.weakest_axis} の観点で evidence が弱く、採点が {payload.original_score}/5 にとどまりました。"
    if not improvement_pattern:
        improvement_pattern = "抽象的な表現を具体的な経験と数字に置き換え、企業固有の論点との接続を明示する。"
    if not model_rewrite:
        model_rewrite = "(模範回答の生成に失敗しました。時間をおいて再度お試しください。)"

    return InterviewDrillStartResponse(
        why_weak=why_weak,
        improvement_pattern=improvement_pattern,
        model_rewrite=model_rewrite,
        retry_question=retry_question,
        prompt_version=INTERVIEW_PROMPT_VERSION,
    )


@router.post("/drill/score", response_model=InterviewDrillScoreResponse)
@limiter.limit("30/minute")
async def interview_drill_score(
    payload: InterviewDrillScoreRequest,
    request: Request,
) -> InterviewDrillScoreResponse:
    """retry_answer を 7 軸で再採点し、delta_scores (retry - original) を返す。

    LLM 1 回呼び出し → INTERVIEW_SCORE_SCHEMA を再利用。
    採点失敗時は original_scores = retry_scores とみなし、delta = 0 の fallback。
    """
    try:
        _sanitize_drill_score(payload)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    prompt = _build_drill_score_prompt(payload)
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="retry_answer の 7 軸採点と rationale を JSON で生成してください。",
        max_tokens=600,
        temperature=0.2,
        feature="interview_feedback",
        response_format="json_schema",
        json_schema=INTERVIEW_DRILL_SCORE_SCHEMA,
    )

    data: dict[str, Any] = {}
    if llm_result.success and isinstance(llm_result.data, dict):
        data = llm_result.data

    retry_scores = _coerce_retry_scores(data.get("retry_scores"))
    # original_scores は sanitize 時にクランプ済み。delta = retry - original。
    delta_scores = {
        key: retry_scores[key] - int(payload.original_scores.get(key, 0)) for key in SEVEN_AXIS_KEYS
    }
    rationale = str(data.get("rationale") or "").strip()
    if not rationale:
        # Deterministic fallback: delta を 1 文で要約する (軸名と差分のみ、固有 evidence なし)。
        positives = [f"{k} {delta_scores[k]:+d}" for k in SEVEN_AXIS_KEYS if delta_scores[k] > 0]
        negatives = [f"{k} {delta_scores[k]:+d}" for k in SEVEN_AXIS_KEYS if delta_scores[k] < 0]
        parts: list[str] = []
        if positives:
            parts.append("改善: " + ", ".join(positives))
        if negatives:
            parts.append("低下: " + ", ".join(negatives))
        rationale = " / ".join(parts) if parts else "主要軸に明確な変化は見られませんでした。"

    return InterviewDrillScoreResponse(
        retry_scores=retry_scores,
        delta_scores=delta_scores,
        rationale=rationale,
        prompt_version=INTERVIEW_PROMPT_VERSION,
    )


__all__ = [
    "router",
    "_sanitize_optional_text",
    "_sanitize_messages",
    "_sanitize_base_request",
    "start_interview",
    "next_interview_turn",
    "continue_interview",
    "interview_feedback",
    # Phase 2 Stage 7: Weakness drill
    "_sanitize_drill_start",
    "_sanitize_drill_score",
    "_coerce_retry_scores",
    "interview_drill_start",
    "interview_drill_score",
]
