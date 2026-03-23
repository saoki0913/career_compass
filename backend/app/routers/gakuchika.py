"""
Gakuchika (学生時代に力を入れたこと) Router

AI-powered deep-dive questioning for Gakuchika refinement using LLM.

Deep-dive enhancement:
- Merged STAR evaluation + question generation into a single LLM call
- Phase-based question focus
- Content-aware initial question generation
- Reference-guide rubric for causal depth and credibility
"""

import json
import random
import re
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.utils.llm import (
    _parse_json_response,
    PromptSafetyError,
    call_llm_streaming_fields,
    call_llm_text_with_error,
    call_llm_with_error,
    consume_request_llm_cost_summary,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)
from app.prompts.gakuchika_prompts import (
    PROHIBITED_EXPRESSIONS as _PROHIBITED_EXPRESSIONS,
    QUESTION_QUALITY_PRINCIPLES,
    REFERENCE_GUIDE_RUBRIC,
    STAR_EVALUATE_AND_QUESTION_PROMPT,
    INITIAL_QUESTION_PROMPT,
    STRUCTURED_SUMMARY_PROMPT,
    GAKUCHIKA_DRAFT_PROMPT,
)

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

# Configuration
STAR_COMPLETION_THRESHOLD = 70  # 各STAR要素がこの%以上で完了とみなす
QUESTIONS_PER_CREDIT = 5  # 5問回答ごとに1クレジット消費
INITIAL_QUESTION_MAX_TOKENS = 120
NEXT_QUESTION_MAX_TOKENS = 360

# Conversation phases based on question count
PHASE_OPENING = "opening"  # 0-2: 全体像の把握
PHASE_EXPLORATION = "exploration"  # 3-5: 課題と行動の深掘り
PHASE_DEEP_DIVE = "deep_dive"  # 6-8: 具体的な場面の掘り下げ
PHASE_SYNTHESIS = "synthesis"  # 9+: 学びと再現性の確認

# Question focus categories
FOCUS_SCENE = "scene"
FOCUS_ROOT_CAUSE = "root_cause"
FOCUS_DECISION_REASON = "decision_reason"
FOCUS_CONCRETE_ACTION = "concrete_action"
FOCUS_RESULT_LEARNING = "result_learning"
FOCUS_CREDIBILITY_SCOPE = "credibility_scope"

RULE_BASED_QUESTION_TEMPLATES: dict[str, dict[str, str]] = {
    PHASE_OPENING: {
        "situation": "その活動が始まった時期と、関わっていた人数はどれくらいでしたか。",
        "task": "最初にいちばん解決したいと思っていた課題は何でしたか。",
        "action": "その場で最初に自分から動いたことは何でしたか。",
        "result": "取り組みのあと、何がどう変わりましたか。",
    },
    PHASE_EXPLORATION: {
        "situation": "その課題が起きていた場面を思い出すと、どんな状況でしたか。",
        "task": "なぜそれを本当の課題だと見たのか、背景から聞かせてもらえますか。",
        "action": "その課題に対して、自分はどんな順番で動きましたか。",
        "result": "その行動によって、数字や周囲の反応はどう変わりましたか。",
    },
    PHASE_DEEP_DIVE: {
        "situation": "印象に残っている場面を一つ選ぶと、どんな状況でしたか。",
        "task": "その場面で、自分が特に向き合う必要があった課題は何でしたか。",
        "action": "その場面での工夫や判断を、順番にたどるとどうなりますか。",
        "result": "その場面のあと、どんな成果や学びにつながりましたか。",
    },
    PHASE_SYNTHESIS: {
        "situation": "振り返ると、その経験の前提条件や特徴はどこにあったと思いますか。",
        "task": "その経験を通じて、自分が本質的に向き合っていた課題は何だと整理できますか。",
        "action": "その経験で得た行動の型は、どんな場面でも再現できそうですか。",
        "result": "この経験から持ち帰れそうな学びや行動原則は何ですか。",
    },
}


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class STARScores(BaseModel):
    situation: int = Field(default=0, ge=0, le=100)
    task: int = Field(default=0, ge=0, le=100)
    action: int = Field(default=0, ge=0, le=100)
    result: int = Field(default=0, ge=0, le=100)


class STAREvaluation(BaseModel):
    scores: STARScores
    weakest_element: str  # 最も低いスコアの要素
    is_complete: bool     # 全要素がthreshold以上


class STARScoresInput(BaseModel):
    """Typed input for STAR scores from client (may include extended fields)."""
    situation: int = Field(default=0, ge=0, le=100)
    task: int = Field(default=0, ge=0, le=100)
    action: int = Field(default=0, ge=0, le=100)
    result: int = Field(default=0, ge=0, le=100)

    model_config = {"extra": "ignore"}


class NextQuestionRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    gakuchika_content: Optional[str] = Field(default=None, max_length=5000)
    char_limit_type: Optional[str] = Field(default=None, pattern=r"^(300|400|500)$")
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    star_scores: Optional[STARScoresInput] = None


class NextQuestionResponse(BaseModel):
    question: str
    # STAR evaluation after processing the conversation
    star_evaluation: Optional[dict] = None
    # Which STAR element this question targets
    target_element: Optional[str] = None
    internal_telemetry: Optional[dict[str, object]] = None


class StructuredSummaryRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
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


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    conversation_history: list[Message]
    structured_summary: Optional[dict] = None
    char_limit: int = Field(default=400, ge=300, le=500)


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int
    internal_telemetry: Optional[dict[str, object]] = None




# Prompt constants moved to app.prompts.gakuchika_prompts (imported at top of file)


def _format_conversation_for_evaluation(messages: list[Message]) -> str:
    """Format conversation history for STAR evaluation prompt."""
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_user_prompt_text(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _prompt_safety_http_error() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="内部設定や秘匿情報に関する指示は受け付けられません。",
    )


def _sanitize_messages(messages: list[Message]) -> None:
    for msg in messages:
        if msg.role == "user":
            msg.content = sanitize_user_prompt_text(msg.content, max_length=3000)


def _sanitize_gakuchika_title(value: str) -> str:
    return sanitize_user_prompt_text(value, max_length=200).strip()


def _sanitize_next_question_request(request: NextQuestionRequest) -> None:
    request.gakuchika_title = _sanitize_gakuchika_title(request.gakuchika_title)
    if request.gakuchika_content is not None:
        request.gakuchika_content = sanitize_user_prompt_text(
            request.gakuchika_content,
            max_length=5000,
            rich_text=True,
        )
    _sanitize_messages(request.conversation_history)


def _sanitize_summary_request(request: StructuredSummaryRequest) -> None:
    request.gakuchika_title = _sanitize_gakuchika_title(request.gakuchika_title)
    _sanitize_messages(request.conversation_history)


def _sanitize_es_draft_request(request: GakuchikaESDraftRequest) -> None:
    request.gakuchika_title = _sanitize_gakuchika_title(request.gakuchika_title)
    _sanitize_messages(request.conversation_history)


def _get_weakest_element(scores: STARScores) -> str:
    """Get the STAR element with the lowest score."""
    elements = {
        "situation": scores.situation,
        "task": scores.task,
        "action": scores.action,
        "result": scores.result,
    }
    return min(elements, key=elements.get)


def _get_element_japanese_name(element: str) -> str:
    """Convert STAR element to Japanese name."""
    names = {
        "situation": "状況",
        "task": "課題",
        "action": "行動",
        "result": "結果",
    }
    return names.get(element, element)


def _is_star_complete(scores: STARScores, threshold: int = STAR_COMPLETION_THRESHOLD) -> bool:
    """Check if all STAR elements meet the completion threshold."""
    return (
        scores.situation >= threshold
        and scores.task >= threshold
        and scores.action >= threshold
        and scores.result >= threshold
    )


def _get_last_user_answer(messages: list[Message]) -> Optional[str]:
    """Get the last user answer from conversation history."""
    for msg in reversed(messages):
        if msg.role == "user":
            return msg.content
    return None


def _scores_from_request(star_scores: Optional[STARScoresInput]) -> STARScores:
    if not star_scores:
        return STARScores()
    return STARScores(
        situation=star_scores.situation,
        task=star_scores.task,
        action=star_scores.action,
        result=star_scores.result,
    )


def _coerce_score(value: object, fallback: int) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return fallback


def _coerce_star_scores(
    value: object,
    fallback_scores: Optional[STARScores] = None,
) -> STARScores:
    fallback = fallback_scores or STARScores()
    if not isinstance(value, dict):
        return STARScores(
            situation=fallback.situation,
            task=fallback.task,
            action=fallback.action,
            result=fallback.result,
        )
    return STARScores(
        situation=_coerce_score(value.get("situation"), fallback.situation),
        task=_coerce_score(value.get("task"), fallback.task),
        action=_coerce_score(value.get("action"), fallback.action),
        result=_coerce_score(value.get("result"), fallback.result),
    )


def _determine_phase(question_count: int) -> tuple[str, str, list[str], list[str]]:
    """
    Determine conversation phase based on question count.

    Returns:
        (phase_name, description, preferred_focuses, preferred_target_elements)
    """
    if question_count <= 2:
        return (
            PHASE_OPENING,
            "全体像の把握。テーマの背景・時期・規模感を聞く",
            [FOCUS_SCENE, FOCUS_CREDIBILITY_SCOPE],
            ["situation", "task"],
        )
    elif question_count <= 5:
        return (
            PHASE_EXPLORATION,
            "課題と行動の深掘り。なぜ・どうやって・何が大変だったか",
            [FOCUS_ROOT_CAUSE, FOCUS_DECISION_REASON, FOCUS_CONCRETE_ACTION],
            ["task", "action"],
        )
    elif question_count <= 8:
        return (
            PHASE_DEEP_DIVE,
            "具体的な場面の掘り下げ。感情・判断理由・数字",
            [FOCUS_SCENE, FOCUS_DECISION_REASON, FOCUS_RESULT_LEARNING],
            ["action", "result"],
        )
    else:
        return (
            PHASE_SYNTHESIS,
            "学びと再現性の確認。経験の意味づけと今後への活かし方",
            [FOCUS_RESULT_LEARNING, FOCUS_CREDIBILITY_SCOPE],
            ["result"],
        )


def _next_question_llm_inputs(
    request: NextQuestionRequest,
) -> tuple[str, STARScores]:
    """Shared: format history, build system prompt, resolve STAR fallbacks for next-question."""
    conversation_text = _format_conversation_for_evaluation(request.conversation_history)
    prompt = _build_next_question_prompt(
        gakuchika_title=request.gakuchika_title,
        conversation_text=conversation_text,
        question_count=request.question_count,
    )
    fallback_scores = _scores_from_request(request.star_scores)
    return prompt, fallback_scores


def _build_next_question_prompt(
    gakuchika_title: str,
    conversation_text: str,
    question_count: int,
) -> str:
    phase_name, phase_desc, preferred_types, preferred_elements = _determine_phase(
        question_count
    )
    return STAR_EVALUATE_AND_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(gakuchika_title, max_length=200),
        conversation=conversation_text,
        phase_name=phase_name,
        phase_description=phase_desc,
        preferred_focuses=", ".join(preferred_types),
        preferred_target_elements=", ".join(preferred_elements),
        threshold=STAR_COMPLETION_THRESHOLD,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
        question_quality_principles=QUESTION_QUALITY_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
    )

def _clean_string_list(values: object, max_items: int = 3) -> list[str]:
    """Normalize optional string array fields from LLM output."""
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _build_star_evaluation(scores: STARScores) -> dict:
    return {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_star_complete(scores),
    }


def _build_rule_based_question(target_element: str, question_count: int) -> str:
    phase_name, _, _, _ = _determine_phase(question_count)
    phase_templates = RULE_BASED_QUESTION_TEMPLATES.get(
        phase_name,
        RULE_BASED_QUESTION_TEMPLATES[PHASE_EXPLORATION],
    )
    return phase_templates.get(
        target_element,
        "その経験を一段深く理解したいので、具体的な場面を一つ選ぶと何が起きていましたか。",
    )


def _extract_question_from_text(raw_text: str) -> Optional[str]:
    if not raw_text:
        return None
    stripped = raw_text.strip()
    if not stripped:
        return None
    if stripped.startswith("{") or stripped.startswith("```"):
        return None
    line = stripped.splitlines()[0].strip().strip('"')
    if not line:
        return None
    return line


def _parse_next_question_payload(raw_text: str) -> dict:
    parsed = _parse_json_response(raw_text)
    if parsed is not None:
        return parsed

    question = _extract_question_from_text(raw_text)
    if question:
        return {"question": question}
    return {}


def _normalize_next_question_payload(
    payload: object,
    fallback_scores: Optional[STARScores],
    question_count: int,
) -> tuple[str, dict, str, str]:
    data = payload if isinstance(payload, dict) else {}
    scores = _coerce_star_scores(data.get("star_scores"), fallback_scores)
    target_element = _get_weakest_element(scores)
    question = data.get("question") if isinstance(data.get("question"), str) else None
    source = "full_json" if question and "star_scores" in data else "partial_json"

    if not question:
        question = _build_rule_based_question(target_element, question_count)
        source = "rule_fallback"

    return question.strip(), _build_star_evaluation(scores), target_element, source


async def _generate_initial_question(request: NextQuestionRequest) -> str:
    template_questions = [
        "まず、その活動が始まった時期と期間はどれくらいでしたか。",
        "その活動に自分から力を入れようと思ったきっかけは何でしたか。",
        "当時の自分は、どんな役割を任されていましたか。",
        "活動の規模感は、人数や担当範囲で言うとどれくらいでしたか。",
    ]

    if not request.gakuchika_content:
        return random.choice(template_questions)

    prompt = INITIAL_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        gakuchika_content=sanitize_prompt_input(request.gakuchika_content, max_length=2000),
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
        question_quality_principles=QUESTION_QUALITY_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
    )
    llm_result = await call_llm_text_with_error(
        system_prompt=prompt,
        user_message="最初の深掘り質問を生成してください。",
        max_tokens=INITIAL_QUESTION_MAX_TOKENS,
        temperature=0.4,
        feature="gakuchika",
        disable_fallback=True,
    )
    if llm_result.success and isinstance(llm_result.raw_text, str):
        payload = _parse_next_question_payload(llm_result.raw_text)
        question = payload.get("question") if isinstance(payload.get("question"), str) else None
        if question:
            return question.strip()

    return random.choice(template_questions)


@router.post("/next-question", response_model=NextQuestionResponse)
async def get_next_question(request: NextQuestionRequest):
    """
    Generate the next deep-dive question for Gakuchika.

    Phase 1 Improvements:
    - Merged STAR evaluation + question generation into single LLM call
    - Conversation phase system for adaptive questioning
    - Question diversity enforcement (no consecutive same types)
    - Content-aware initial question generation

    Flow:
    1. Handle initial question (with/without content)
    2. Determine conversation phase
    3. Generate STAR evaluation + next question in single call
    4. Keep question variation natural through prompt guidance
    """
    if not request.gakuchika_title:
        raise HTTPException(
            status_code=400, detail="ガクチカのテーマが指定されていません"
        )
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    # Handle initial question (no conversation history or no user response yet)
    has_user_response = any(msg.role == "user" for msg in request.conversation_history)
    if not has_user_response:
        initial_question = await _generate_initial_question(request)

        return NextQuestionResponse(
            question=initial_question,
            star_evaluation=_build_star_evaluation(STARScores()),
            target_element="situation",
            internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
        )

    prompt, fallback_scores = _next_question_llm_inputs(request)

    llm_result = await call_llm_text_with_error(
        system_prompt=prompt,
        user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
        max_tokens=NEXT_QUESTION_MAX_TOKENS,
        temperature=0.35,
        feature="gakuchika",
        disable_fallback=True,
    )

    if not llm_result.success:
        error = llm_result.error
        logger.error(f"[Gakuchika] LLM error: {error.detail if error else 'unknown'}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": (
                    error.message
                    if error
                    else "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。"
                ),
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    payload = _parse_next_question_payload(llm_result.raw_text or "")
    question, star_eval, target_element, source = _normalize_next_question_payload(
        payload,
        fallback_scores=fallback_scores,
        question_count=request.question_count,
    )
    logger.info(
        f"[Gakuchika] next-question normalized via {source} "
        f"(target={target_element}, scores={star_eval['scores']})"
    )

    return NextQuestionResponse(
        question=question,
        star_evaluation=star_eval,
        target_element=target_element,
        internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
    )


# ── SSE Streaming helpers ──────────────────────────────────────────────

def _sse_event(event_type: str, data: dict) -> str:
    """Format SSE event data."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _generate_next_question_progress(
    request: NextQuestionRequest,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for gakuchika next-question with progress updates.
    Gakuchika uses a single LLM call (unified eval+question), so 2 progress steps suffice.
    """
    try:
        if not request.gakuchika_title:
            yield _sse_event("error", {
                "message": "ガクチカのテーマが指定されていません",
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        # Handle initial question (no user response) — return immediately
        has_user_response = any(msg.role == "user" for msg in request.conversation_history)
        if not has_user_response:
            initial_question = await _generate_initial_question(request)

            yield _sse_event("complete", {
                "data": {
                    "question": initial_question,
                    "star_evaluation": _build_star_evaluation(STARScores()),
                    "target_element": "situation",
                },
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        # Step 1: Analyzing response
        yield _sse_event("progress", {
            "step": "analysis", "progress": 30, "label": "質問の意図を整理中",
        })

        prompt, fallback_scores = _next_question_llm_inputs(request)

        # Step 2: Generating question
        yield _sse_event("progress", {
            "step": "question", "progress": 60, "label": "次の質問を生成中...",
        })

        # Stream LLM response with field-level events
        llm_result = None
        async for event in call_llm_streaming_fields(
            system_prompt=prompt,
            user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
            max_tokens=NEXT_QUESTION_MAX_TOKENS,
            temperature=0.35,
            feature="gakuchika",
            schema_hints={
                "question": "string",
                "star_scores": "object",
            },
            stream_string_fields=["question"],
            attempt_repair_on_parse_failure=False,
            partial_required_fields=("question",),
        ):
            if event.type == "string_chunk":
                yield _sse_event("string_chunk", {"path": event.path, "text": event.text})
            elif event.type == "field_complete":
                yield _sse_event("field_complete", {"path": event.path, "value": event.value})
            elif event.type == "array_item_complete":
                yield _sse_event("array_item_complete", {"path": event.path, "value": event.value})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                    "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
                })
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success:
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        data = llm_result.data
        if data is None:
            yield _sse_event("error", {
                "message": "AIからの応答を解析できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        question, star_eval, target_element, source = _normalize_next_question_payload(
            data,
            fallback_scores=fallback_scores,
            question_count=request.question_count,
        )
        logger.info(
            f"[Gakuchika] next-question/stream normalized via {source} "
            f"(target={target_element}, scores={star_eval['scores']})"
        )

        yield _sse_event("complete", {
            "data": {
                "question": question,
                "star_evaluation": star_eval,
                "target_element": target_element,
            },
            "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
        })

    except Exception as e:
        yield _sse_event("error", {
            "message": f"予期しないエラーが発生しました: {str(e)}",
            "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
        })


@router.post("/next-question/stream")
async def get_next_question_stream(request: NextQuestionRequest):
    """
    SSE streaming version of next-question.
    Yields progress events then complete/error event.
    """
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()
    return StreamingResponse(
        _generate_next_question_progress(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/structured-summary")
async def generate_structured_summary(request: StructuredSummaryRequest):
    """Generate a STAR-structured summary of the Gakuchika conversation."""
    try:
        _sanitize_summary_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    user_answers = [
        msg.content for msg in request.conversation_history if msg.role == "user"
    ]

    if not user_answers:
        raise HTTPException(status_code=400, detail="ユーザーの回答がありません")

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    prompt = STRUCTURED_SUMMARY_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        conversation=conversation_text,
        question_quality_principles=QUESTION_QUALITY_PRINCIPLES,
    )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話をSTAR構造に整理してください。",
        max_tokens=1500,
        temperature=0.3,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if llm_result.success and llm_result.data is not None:
        data = llm_result.data
        # Ensure strengths/learnings are lists of dicts
        strengths = data.get("strengths", [])
        if strengths and isinstance(strengths[0], str):
            strengths = [{"title": s, "description": ""} for s in strengths]
        learnings = data.get("learnings", [])
        if learnings and isinstance(learnings[0], str):
            learnings = [{"title": l, "description": ""} for l in learnings]

        return {
            "situation_text": data.get("situation_text", ""),
            "task_text": data.get("task_text", ""),
            "action_text": data.get("action_text", ""),
            "result_text": data.get("result_text", ""),
            "strengths": strengths,
            "learnings": learnings,
            "numbers": data.get("numbers", []),
            "interviewer_hooks": _clean_string_list(data.get("interviewer_hooks")),
            "decision_reasons": _clean_string_list(data.get("decision_reasons")),
            "before_after_comparisons": _clean_string_list(data.get("before_after_comparisons")),
            "credibility_notes": _clean_string_list(data.get("credibility_notes"), max_items=2),
            "role_scope": str(data.get("role_scope", "")).strip(),
            "reusable_principles": _clean_string_list(data.get("reusable_principles")),
        }

    error = llm_result.error
    raise HTTPException(
        status_code=503,
        detail={
            "error": (
                error.message if error else "構造化サマリー生成中にエラーが発生しました。"
            ),
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        },
    )


# ── ES Draft Generation ───────────────────────────────────────────────

@router.post("/generate-es-draft", response_model=GakuchikaESDraftResponse)
async def generate_es_draft(request: GakuchikaESDraftRequest):
    """
    Generate an ES draft from Gakuchika conversation history.
    """
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(
            status_code=400,
            detail="文字数は300, 400, 500のいずれかを指定してください",
        )
    try:
        _sanitize_es_draft_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)
    char_min = int(request.char_limit * 0.9)

    # Build structured summary section if available
    structured_summary_section = ""
    if request.structured_summary:
        ss = request.structured_summary
        parts = []
        if ss.get("situation_text"):
            parts.append(f"- 状況: {ss['situation_text']}")
        if ss.get("task_text"):
            parts.append(f"- 課題: {ss['task_text']}")
        if ss.get("action_text"):
            parts.append(f"- 行動: {ss['action_text']}")
        if ss.get("result_text"):
            parts.append(f"- 結果: {ss['result_text']}")
        if parts:
            structured_summary_section = "## STAR構造（参考）\n" + "\n".join(parts)

    prompt = GAKUCHIKA_DRAFT_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        conversation=conversation_text,
        structured_summary_section=structured_summary_section,
        char_limit=request.char_limit,
        char_min=char_min,
    )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="ガクチカのESを作成してください。",
        max_tokens=1200,  # Draft: ~300-500 chars + char_count + JSON
        temperature=0.3,
        feature="gakuchika_draft",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        # Fallback: extract draft text from raw_text if JSON parse failed (truncation)
        if llm_result.raw_text:
            raw = llm_result.raw_text.strip()
            match = re.search(r'"draft"\s*:\s*"((?:[^"\\]|\\.)*)', raw, re.DOTALL)
            if match:
                draft_text = match.group(1)
                draft_text = draft_text.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
                # Trim at last complete sentence if truncated mid-sentence
                if not draft_text.endswith(("。", "」", "）")):
                    last_period = draft_text.rfind("。")
                    if last_period > len(draft_text) * 0.5:
                        draft_text = draft_text[: last_period + 1]
                if len(draft_text) >= 100:
                    logger.warning(f"[ガクチカES] raw_textフォールバック: {len(draft_text)}字のドラフトを抽出")
                    return GakuchikaESDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
                        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
                    )
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "ES生成中にエラーが発生しました。",
            },
        )

    data = llm_result.data
    draft = data.get("draft", "")

    return GakuchikaESDraftResponse(
        draft=draft,
        char_count=len(draft),
        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
    )
