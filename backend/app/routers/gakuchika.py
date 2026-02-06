"""
Gakuchika (学生時代に力を入れたこと) Router

AI-powered deep-dive questioning for Gakuchika refinement using LLM.

Phase 1 Improvements (Deep-dive Enhancement):
- Merged STAR evaluation + question generation into a single LLM call
- Conversation phase system (opening/exploration/deep_dive/synthesis)
- Question diversity enforcement (8 question types)
- Content-aware initial question generation
- Enhanced persona and forbidden expressions
"""

import asyncio
import json
import random
import re
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.utils.llm import call_llm_with_error
from app.prompts.gakuchika_prompts import (
    PROHIBITED_EXPRESSIONS as _PROHIBITED_EXPRESSIONS,
    STAR_EVALUATION_PROMPT,
    STAR_EVALUATE_AND_QUESTION_PROMPT,
    INITIAL_QUESTION_PROMPT,
    STRUCTURED_SUMMARY_PROMPT,
    GAKUCHIKA_DRAFT_PROMPT,
)

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

# Configuration
STAR_COMPLETION_THRESHOLD = 70  # 各STAR要素がこの%以上で完了とみなす
QUESTIONS_PER_CREDIT = 5  # 5問回答ごとに1クレジット消費

# Conversation phases based on question count
PHASE_OPENING = "opening"  # 0-2: 全体像の把握
PHASE_EXPLORATION = "exploration"  # 3-5: 課題と行動の深掘り
PHASE_DEEP_DIVE = "deep_dive"  # 6-8: 具体的な場面の掘り下げ
PHASE_SYNTHESIS = "synthesis"  # 9+: 学びと再現性の確認

# Question types for diversity enforcement
QUESTION_TYPE_NUMBERS = "numbers"
QUESTION_TYPE_EMOTIONS = "emotions"
QUESTION_TYPE_REASONING = "reasoning"
QUESTION_TYPE_OTHERS_PERSPECTIVE = "others_perspective"
QUESTION_TYPE_DIFFICULTY = "difficulty"
QUESTION_TYPE_CONTRAST = "contrast"
QUESTION_TYPE_SCENE = "scene"
QUESTION_TYPE_LEARNING = "learning"


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class STARScores(BaseModel):
    situation: int = 0  # 状況・背景 (0-100)
    task: int = 0       # 課題・目標 (0-100)
    action: int = 0     # 行動・工夫 (0-100)
    result: int = 0     # 結果・学び (0-100)


class STAREvaluation(BaseModel):
    scores: STARScores
    weakest_element: str  # 最も低いスコアの要素
    is_complete: bool     # 全要素がthreshold以上
    missing_aspects: dict[str, list[str]]  # 各要素で不足している観点


class NextQuestionRequest(BaseModel):
    gakuchika_title: str
    gakuchika_content: Optional[str] = None
    char_limit_type: Optional[str] = None
    conversation_history: list[Message]
    question_count: int = 0
    # STAR scores from previous evaluation (optional, can include extended fields)
    star_scores: Optional[dict] = None


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    # STAR evaluation after processing the conversation
    star_evaluation: Optional[dict] = None
    # Which STAR element this question targets
    target_element: Optional[str] = None
    # Question type for diversity tracking
    question_type: Optional[str] = None
    # Suggested answer options for the user
    suggestions: list[str] = []


class StructuredSummaryRequest(BaseModel):
    gakuchika_title: str
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


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str
    conversation_history: list[Message]
    structured_summary: Optional[dict] = None
    char_limit: int = 400


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int




# Prompt constants moved to app.prompts.gakuchika_prompts:
# _PROHIBITED_EXPRESSIONS, STAR_EVALUATION_PROMPT, STAR_EVALUATE_AND_QUESTION_PROMPT,
# INITIAL_QUESTION_PROMPT (imported at top of file)


def _format_conversation_for_evaluation(messages: list[Message]) -> str:
    """Format conversation history for STAR evaluation prompt."""
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        formatted.append(f"{role_label}: {msg.content}")
    return "\n\n".join(formatted)


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


def _compute_suggested_end_value(
    question_count: int,
    star_scores: Optional[dict],
    min_questions: int = 5,
) -> str:
    """Compute suggested_end hint for the prompt template.

    Returns "true" when enough questions have been asked AND
    all STAR elements meet the completion threshold based on
    previous scores, otherwise "false".
    """
    if question_count < min_questions or not star_scores:
        return "false"
    scores = STARScores(
        **{k: v for k, v in star_scores.items() if k in ["situation", "task", "action", "result"]}
    )
    return "true" if _is_star_complete(scores) else "false"


def _get_last_user_answer(messages: list[Message]) -> Optional[str]:
    """Get the last user answer from conversation history."""
    for msg in reversed(messages):
        if msg.role == "user":
            return msg.content
    return None


def _determine_phase(question_count: int) -> tuple[str, str, list[str], list[str]]:
    """
    Determine conversation phase based on question count.

    Returns:
        (phase_name, description, preferred_question_types, preferred_target_elements)
    """
    if question_count <= 2:
        return (
            PHASE_OPENING,
            "全体像の把握。テーマの背景・時期・規模感を聞く",
            [QUESTION_TYPE_SCENE, QUESTION_TYPE_NUMBERS, QUESTION_TYPE_CONTRAST],
            ["situation", "task"],
        )
    elif question_count <= 5:
        return (
            PHASE_EXPLORATION,
            "課題と行動の深掘り。なぜ・どうやって・何が大変だったか",
            [QUESTION_TYPE_REASONING, QUESTION_TYPE_DIFFICULTY, QUESTION_TYPE_EMOTIONS],
            ["task", "action"],
        )
    elif question_count <= 8:
        return (
            PHASE_DEEP_DIVE,
            "具体的な場面の掘り下げ。感情・判断理由・数字",
            [QUESTION_TYPE_EMOTIONS, QUESTION_TYPE_OTHERS_PERSPECTIVE, QUESTION_TYPE_NUMBERS, QUESTION_TYPE_SCENE],
            ["action", "result"],
        )
    else:
        return (
            PHASE_SYNTHESIS,
            "学びと再現性の確認。得たもの・今後どう活かすか",
            [QUESTION_TYPE_LEARNING, QUESTION_TYPE_CONTRAST, QUESTION_TYPE_REASONING],
            ["result"],
        )


def _build_question_type_history(star_scores: Optional[dict]) -> str:
    """
    Build question type history string from star_scores extended field.

    Args:
        star_scores: Dictionary that may contain a "question_types" list

    Returns:
        Formatted string describing question type history
    """
    if not star_scores or "question_types" not in star_scores:
        return "まだ質問していません"

    question_types = star_scores.get("question_types", [])
    if not question_types:
        return "まだ質問していません"

    # Get last 3 question types
    recent_types = question_types[-3:]
    type_names = {
        QUESTION_TYPE_NUMBERS: "数字",
        QUESTION_TYPE_EMOTIONS: "感情",
        QUESTION_TYPE_REASONING: "判断理由",
        QUESTION_TYPE_OTHERS_PERSPECTIVE: "他者視点",
        QUESTION_TYPE_DIFFICULTY: "困難",
        QUESTION_TYPE_CONTRAST: "対比",
        QUESTION_TYPE_SCENE: "場面",
        QUESTION_TYPE_LEARNING: "学び",
    }

    history_items = [type_names.get(t, t) for t in recent_types]

    # Identify last type for consecutive check
    last_type = question_types[-1] if question_types else None
    last_type_name = type_names.get(last_type, last_type) if last_type else "なし"

    return f"{', '.join(history_items)} (直前: {last_type_name} - これは連続使用禁止)"


def _get_last_question_type(star_scores: Optional[dict]) -> Optional[str]:
    """Get the last question type from star_scores extended field."""
    if not star_scores or "question_types" not in star_scores:
        return None

    question_types = star_scores.get("question_types", [])
    return question_types[-1] if question_types else None


@router.post("/evaluate-star")
async def evaluate_star(request: NextQuestionRequest) -> dict:
    """
    Evaluate the current conversation for STAR element coverage.
    Returns scores for each element and identifies missing aspects.

    This endpoint is kept for standalone use (e.g., progress visualization).
    """
    if not request.conversation_history:
        # Return initial scores for empty conversation
        return {
            "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
            "weakest_element": "situation",
            "is_complete": False,
            "missing_aspects": {
                "situation": ["時期", "場所", "規模"],
                "task": ["課題の内容", "なぜ課題だったか"],
                "action": ["具体的な行動", "工夫した点"],
                "result": ["数字での成果", "学び"],
            },
        }

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)
    prompt = STAR_EVALUATION_PROMPT.format(conversation=conversation_text)

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を評価してください。",
        max_tokens=500,
        temperature=0.3,  # Lower temperature for consistent evaluation
        feature="gakuchika",
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        # Return previous scores or defaults on error
        if request.star_scores:
            scores = STARScores(**{k: v for k, v in request.star_scores.items() if k in ["situation", "task", "action", "result"]})
        else:
            scores = STARScores()

        return {
            "scores": scores.model_dump(),
            "weakest_element": _get_weakest_element(scores),
            "is_complete": _is_star_complete(scores),
            "missing_aspects": {
                "situation": [],
                "task": [],
                "action": [],
                "result": [],
            },
        }

    data = llm_result.data
    scores_data = data.get("scores", {})
    scores = STARScores(
        situation=scores_data.get("situation", 0),
        task=scores_data.get("task", 0),
        action=scores_data.get("action", 0),
        result=scores_data.get("result", 0),
    )

    return {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_star_complete(scores),
        "missing_aspects": data.get("missing_aspects", {}),
    }


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
    4. Track question types for diversity
    """
    if not request.gakuchika_title:
        raise HTTPException(
            status_code=400, detail="ガクチカのテーマが指定されていません"
        )

    # Handle initial question (no conversation history or no user response yet)
    has_user_response = any(msg.role == "user" for msg in request.conversation_history)
    if not has_user_response:
        # Template-based initial questions (no LLM call for cost optimization)
        template_questions = [
            "まず、取り組んだ時期と期間を教えてください。",
            "この活動に参加したきっかけは何でしたか?",
            "当時、どのような役割を担っていましたか?",
            "活動の規模感(人数や範囲など)を教えてください。",
        ]

        initial_question = None
        question_type = QUESTION_TYPE_SCENE
        reasoning = "会話開始時の導入質問"

        # If content is provided, use LLM to generate personalized initial question
        if request.gakuchika_content:
            prompt = INITIAL_QUESTION_PROMPT.format(
                gakuchika_title=request.gakuchika_title,
                gakuchika_content=request.gakuchika_content,
                prohibited_expressions=_PROHIBITED_EXPRESSIONS,
            )

            llm_result = await call_llm_with_error(
                system_prompt=prompt,
                user_message="最初の深掘り質問を生成してください。",
                max_tokens=500,  # question + suggestions + metadata
                temperature=0.5,
                feature="gakuchika",
                disable_fallback=True,
            )

            if llm_result.success and llm_result.data:
                data = llm_result.data
                initial_question = data.get("question")
                question_type = data.get("question_type", QUESTION_TYPE_SCENE)
                reasoning = data.get("reasoning", "会話開始時の導入質問")
                initial_suggestions = data.get("suggestions", [])

        # Fallback to template if LLM failed or no content
        if not initial_question:
            initial_question = random.choice(template_questions)
            initial_suggestions = []

        return NextQuestionResponse(
            question=initial_question,
            reasoning=reasoning,
            should_continue=True,
            suggested_end=False,
            star_evaluation={
                "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
                "weakest_element": "situation",
                "is_complete": False,
            },
            target_element="situation",
            question_type=question_type,
            suggestions=initial_suggestions,
        )

    # Determine conversation phase
    phase_name, phase_desc, preferred_types, preferred_elements = _determine_phase(
        request.question_count
    )

    # Build question type history
    question_type_history = _build_question_type_history(request.star_scores)
    last_question_type = _get_last_question_type(request.star_scores)

    # Format conversation for prompt
    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    # Build unified prompt
    prompt = STAR_EVALUATE_AND_QUESTION_PROMPT.format(
        gakuchika_title=request.gakuchika_title,
        conversation=conversation_text,
        phase_name=phase_name,
        phase_description=phase_desc,
        preferred_question_types=", ".join(preferred_types),
        preferred_target_elements=", ".join(preferred_elements),
        question_type_history=question_type_history,
        threshold=STAR_COMPLETION_THRESHOLD,
        suggested_end_value=_compute_suggested_end_value(request.question_count, request.star_scores),
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )

    # Single LLM call for both evaluation and question generation
    # Note: conversation context is already embedded in the system prompt via {conversation} placeholder.
    # We use messages=None so user_message is properly sent as the user turn,
    # avoiding Claude API's requirement that messages must start with role="user".
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
        max_tokens=800,  # 統合レスポンス (scores+question+suggestions+metadata)
        temperature=0.5,
        feature="gakuchika",
        disable_fallback=True,
    )

    if not llm_result.success:
        error = llm_result.error
        print(f"[Gakuchika] LLM error: {error.detail if error else 'unknown'}")
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

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM",
            },
        )

    # Extract STAR scores
    star_scores_data = data.get("star_scores", {})
    scores = STARScores(
        situation=star_scores_data.get("situation", 0),
        task=star_scores_data.get("task", 0),
        action=star_scores_data.get("action", 0),
        result=star_scores_data.get("result", 0),
    )

    # Build star evaluation
    star_eval = {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_star_complete(scores),
        "missing_aspects": data.get("missing_aspects", {}),
    }

    # Extract question
    question = data.get("question")
    if not question:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIから有効な質問を取得できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "No question in response",
            },
        )

    # Extract metadata
    question_type = data.get("question_type", QUESTION_TYPE_SCENE)
    target_element = data.get("target_element", _get_weakest_element(scores))
    reasoning = data.get("reasoning")
    should_continue = data.get("should_continue", True)
    suggested_end = data.get("suggested_end", False)
    suggestions = data.get("suggestions", [])

    # Validate question type diversity (consecutive same type check)
    if last_question_type and question_type == last_question_type:
        print(f"[Gakuchika] Warning: Consecutive same question type '{question_type}' detected")
        # Note: We allow it but log the warning. LLM should handle this based on prompt.

    return NextQuestionResponse(
        question=question,
        reasoning=reasoning,
        should_continue=should_continue,
        suggested_end=suggested_end,
        star_evaluation=star_eval,
        target_element=target_element,
        question_type=question_type,
        suggestions=suggestions,
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
            yield _sse_event("error", {"message": "ガクチカのテーマが指定されていません"})
            return

        # Handle initial question (no user response) — return immediately
        has_user_response = any(msg.role == "user" for msg in request.conversation_history)
        if not has_user_response:
            template_questions = [
                "まず、取り組んだ時期と期間を教えてください。",
                "この活動に参加したきっかけは何でしたか?",
                "当時、どのような役割を担っていましたか?",
                "活動の規模感(人数や範囲など)を教えてください。",
            ]

            initial_question = None
            question_type = QUESTION_TYPE_SCENE
            reasoning = "会話開始時の導入質問"

            if request.gakuchika_content:
                prompt = INITIAL_QUESTION_PROMPT.format(
                    gakuchika_title=request.gakuchika_title,
                    gakuchika_content=request.gakuchika_content,
                    prohibited_expressions=_PROHIBITED_EXPRESSIONS,
                )
                llm_result = await call_llm_with_error(
                    system_prompt=prompt,
                    user_message="最初の深掘り質問を生成してください。",
                    max_tokens=500,  # question + suggestions + metadata
                    temperature=0.5,
                    feature="gakuchika",
                    disable_fallback=True,
                )
                if llm_result.success and llm_result.data:
                    data = llm_result.data
                    initial_question = data.get("question")
                    question_type = data.get("question_type", QUESTION_TYPE_SCENE)
                    reasoning = data.get("reasoning", "会話開始時の導入質問")
                    initial_suggestions = data.get("suggestions", [])

            if not initial_question:
                initial_question = random.choice(template_questions)
                initial_suggestions = []

            yield _sse_event("complete", {
                "data": {
                    "question": initial_question,
                    "reasoning": reasoning,
                    "should_continue": True,
                    "suggested_end": False,
                    "star_evaluation": {
                        "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
                        "weakest_element": "situation",
                        "is_complete": False,
                    },
                    "target_element": "situation",
                    "question_type": question_type,
                    "suggestions": initial_suggestions,
                },
            })
            return

        # Step 1: Analyzing response
        yield _sse_event("progress", {
            "step": "analysis", "progress": 30, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        # Determine conversation phase
        phase_name, phase_desc, preferred_types, preferred_elements = _determine_phase(
            request.question_count
        )
        question_type_history = _build_question_type_history(request.star_scores)

        # Format conversation for prompt
        conversation_text = _format_conversation_for_evaluation(request.conversation_history)

        # Step 2: Generating question
        yield _sse_event("progress", {
            "step": "question", "progress": 60, "label": "次の質問を生成中...",
        })
        await asyncio.sleep(0.05)

        # Build unified prompt
        prompt = STAR_EVALUATE_AND_QUESTION_PROMPT.format(
            gakuchika_title=request.gakuchika_title,
            conversation=conversation_text,
            phase_name=phase_name,
            phase_description=phase_desc,
            preferred_question_types=", ".join(preferred_types),
            preferred_target_elements=", ".join(preferred_elements),
            question_type_history=question_type_history,
            threshold=STAR_COMPLETION_THRESHOLD,
            suggested_end_value=_compute_suggested_end_value(request.question_count, request.star_scores),
            prohibited_expressions=_PROHIBITED_EXPRESSIONS,
        )

        llm_result = await call_llm_with_error(
            system_prompt=prompt,
            user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
            max_tokens=800,
            temperature=0.5,
            feature="gakuchika",
            disable_fallback=True,
        )

        if not llm_result.success:
            error = llm_result.error
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
            })
            return

        data = llm_result.data
        if data is None:
            yield _sse_event("error", {
                "message": "AIからの応答を解析できませんでした。",
            })
            return

        # Extract STAR scores
        star_scores_data = data.get("star_scores", {})
        scores = STARScores(
            situation=star_scores_data.get("situation", 0),
            task=star_scores_data.get("task", 0),
            action=star_scores_data.get("action", 0),
            result=star_scores_data.get("result", 0),
        )

        star_eval = {
            "scores": scores.model_dump(),
            "weakest_element": _get_weakest_element(scores),
            "is_complete": _is_star_complete(scores),
            "missing_aspects": data.get("missing_aspects", {}),
        }

        question = data.get("question")
        if not question:
            yield _sse_event("error", {
                "message": "AIから有効な質問を取得できませんでした。",
            })
            return

        yield _sse_event("complete", {
            "data": {
                "question": question,
                "reasoning": data.get("reasoning"),
                "should_continue": data.get("should_continue", True),
                "suggested_end": data.get("suggested_end", False),
                "star_evaluation": star_eval,
                "target_element": data.get("target_element", _get_weakest_element(scores)),
                "question_type": data.get("question_type", QUESTION_TYPE_SCENE),
                "suggestions": data.get("suggestions", []),
            },
        })

    except Exception as e:
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(e)}"})


@router.post("/next-question/stream")
async def get_next_question_stream(request: NextQuestionRequest):
    """
    SSE streaming version of next-question.
    Yields progress events then complete/error event.
    """
    return StreamingResponse(
        _generate_next_question_progress(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/summary")
async def generate_summary(request: NextQuestionRequest):
    """
    Generate a summary of the Gakuchika conversation for use in ES writing.
    """
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    user_answers = [
        msg.content for msg in request.conversation_history if msg.role == "user"
    ]

    if not user_answers:
        raise HTTPException(status_code=400, detail="ユーザーの回答がありません")

    system_prompt = """あなたは就活アドバイザーです。
以下のガクチカ深掘り会話の内容を、ES(エントリーシート)で使いやすい形にまとめてください。

以下の情報を抽出してJSON形式で返してください:
1. summary: 経験の要約(200-300字程度)
2. key_points: キーとなるポイントのリスト(3-5個)
3. numbers: 言及された具体的な数字や成果のリスト
4. strengths: この経験から読み取れる強み(2-3個)

必ず有効なJSON形式で回答:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "numbers": ["...", "..."],
  "strengths": ["...", "..."]
}"""

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=f"テーマ: {request.gakuchika_title}\n\n会話履歴:\n{conversation_text}",
        max_tokens=800,  # summary(200-300字)+key_points+numbers+strengths で600-700トークン
        temperature=0.3,
        feature="gakuchika",
        disable_fallback=True,
    )

    if llm_result.success and llm_result.data is not None:
        return llm_result.data

    error = llm_result.error
    raise HTTPException(
        status_code=503,
        detail={
            "error": (
                error.message if error else "サマリー生成中にエラーが発生しました。"
            ),
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        },
    )


# ── Structured Summary (replaces /summary for new completions) ────────

@router.post("/structured-summary")
async def generate_structured_summary(request: StructuredSummaryRequest):
    """
    Generate a STAR-structured summary of the Gakuchika conversation.
    Replaces the old /summary format with richer structured output.
    """
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    user_answers = [
        msg.content for msg in request.conversation_history if msg.role == "user"
    ]

    if not user_answers:
        raise HTTPException(status_code=400, detail="ユーザーの回答がありません")

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    prompt = STRUCTURED_SUMMARY_PROMPT.format(
        gakuchika_title=request.gakuchika_title,
        conversation=conversation_text,
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
        gakuchika_title=request.gakuchika_title,
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
        feature="gakuchika",
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
                    print(f"[ガクチカES] ⚠️ raw_textフォールバック: {len(draft_text)}字のドラフトを抽出")
                    return GakuchikaESDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
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
    )
