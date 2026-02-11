"""
Motivation (志望動機) Deep-Dive Router

AI-powered deep-dive questioning for creating company motivation ES drafts.

Features:
- Company RAG integration for contextual questions
- 4-element evaluation: Company Understanding, Self-Analysis, Career Vision, Differentiation
- Dynamic question generation based on conversation progress
- ES draft generation from conversation
"""

import asyncio
import json
import re
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.utils.llm import call_llm_with_error, sanitize_prompt_input
from app.utils.vector_store import get_enhanced_context_for_review_with_sources
from app.config import settings
from app.utils.secure_logger import get_logger
from app.prompts.motivation_prompts import (
    MOTIVATION_EVALUATION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
    DRAFT_GENERATION_PROMPT,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/motivation", tags=["motivation"])

# Configuration
ELEMENT_COMPLETION_THRESHOLD = 70  # Each element needs 70%+ to be complete
DEFAULT_TARGET_QUESTIONS = 8


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class MotivationScores(BaseModel):
    company_understanding: int = Field(default=0, ge=0, le=100)
    self_analysis: int = Field(default=0, ge=0, le=100)
    career_vision: int = Field(default=0, ge=0, le=100)
    differentiation: int = Field(default=0, ge=0, le=100)


class MotivationEvaluation(BaseModel):
    scores: MotivationScores
    weakest_element: str
    is_complete: bool
    missing_aspects: dict[str, list[str]]


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
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    scores: Optional[MotivationScoresInput] = None
    gakuchika_context: Optional[list[dict]] = None


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    evaluation: Optional[dict] = None
    target_element: Optional[str] = None
    company_insight: Optional[str] = None  # RAG-based company insight used
    suggestions: list[str] = []  # 4 suggested answer options for the user


class GenerateDraftRequest(BaseModel):
    company_id: str = Field(max_length=100)
    company_name: str = Field(max_length=200)
    industry: Optional[str] = Field(default=None, max_length=100)
    conversation_history: list[Message]
    char_limit: int = Field(default=400, ge=300, le=500)


class GenerateDraftResponse(BaseModel):
    draft: str
    char_count: int
    key_points: list[str]
    company_keywords: list[str]


def _format_conversation(messages: list[Message]) -> str:
    """Format conversation history for prompts."""
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_prompt_input(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _trim_conversation_for_evaluation(
    messages: list[Message], max_messages: int = 8
) -> list[Message]:
    """Trim conversation to recent messages for evaluation stability."""
    if len(messages) <= max_messages:
        return messages
    return messages[-max_messages:]


def _extract_company_features(company_context: str, max_features: int = 3) -> list[str]:
    """Extract key company features from RAG context for suggestion building."""
    if not company_context or company_context == "（企業情報なし）":
        return []

    features = []
    lines = company_context.split("\n")
    for line in lines:
        line = line.strip()
        if not line or len(line) < 10:
            continue
        # Look for short descriptive phrases (company features, business descriptions)
        if len(line) <= 60 and any(kw in line for kw in [
            "事業", "サービス", "強み", "取り組み", "ビジョン",
            "理念", "方針", "挑戦", "グローバル", "DX",
            "プロジェクト", "ソリューション", "イノベーション",
        ]):
            clean = line.lstrip("・-•●■□▪▸▹→ ")
            if clean and len(clean) >= 8:
                features.append(clean)
        if len(features) >= max_features:
            break

    return features


def _format_gakuchika_for_prompt(gakuchika_context: list[dict] | None, max_items: int = 3) -> str:
    """Format gakuchika summaries into prompt-friendly text."""
    if not gakuchika_context:
        return "（ガクチカ情報なし）"

    sections = []
    for g in gakuchika_context[:max_items]:
        title = g.get("title", "経験")
        strengths = []
        for s in g.get("strengths", [])[:2]:
            if isinstance(s, dict):
                strengths.append(s.get("title", ""))
            elif isinstance(s, str):
                strengths.append(s)
        strengths = [s for s in strengths if s]
        action = str(g.get("action_text", ""))[:80]
        result = str(g.get("result_text", ""))[:60]
        numbers = [str(n) for n in g.get("numbers", [])[:3]]

        parts = [f"- {title}"]
        if strengths:
            parts.append(f"  強み: {', '.join(strengths)}")
        if action:
            parts.append(f"  行動: {action}")
        if result:
            parts.append(f"  成果: {result}")
        if numbers:
            parts.append(f"  数字: {', '.join(numbers)}")
        sections.append("\n".join(parts))

    return "\n".join(sections)


def _extract_gakuchika_strength(gakuchika_context: list[dict] | None) -> str | None:
    """Extract the first strength title from gakuchika context for personalization."""
    if not gakuchika_context:
        return None
    for g in gakuchika_context:
        for s in g.get("strengths", []):
            title = s.get("title") if isinstance(s, dict) else s
            if title and isinstance(title, str) and len(title) >= 2:
                return title
    return None


def _build_initial_suggestions(
    company_name: str,
    industry: str,
    company_context: str,
    gakuchika_context: list[dict] | None = None,
) -> list[str]:
    """Build initial suggestions incorporating RAG company info and gakuchika when available."""
    features = _extract_company_features(company_context)

    if features:
        suggestions = [
            f"{features[0]}への関心から",
            f"社員インタビューで社風に共感",
            f"{features[1] if len(features) > 1 else '事業内容'}に魅力を感じて",
            f"{industry}の業界研究がきっかけ",
        ]
    else:
        suggestions = [
            f"{industry}を学び{company_name}に興味",
            "社員インタビューで社風に共感",
            "説明会で事業内容に魅力を感じて",
            f"{industry}の業界研究がきっかけ",
        ]

    # Personalize first suggestion with gakuchika strength if available
    gakuchika_strength = _extract_gakuchika_strength(gakuchika_context)
    if gakuchika_strength and features:
        suggestions[0] = f"{gakuchika_strength}を活かせる{features[0]}に関心"[:45]

    return suggestions


def _build_completion_suggestions(
    company_name: str,
    industry: str,
    company_context: str,
) -> list[str]:
    """Build completion suggestions incorporating company info when available."""
    features = _extract_company_features(company_context)

    if features:
        return [
            f"{features[0]}で新しい価値を生むこと",
            "強みを活かしチーム成果を最大化",
            f"{features[1] if len(features) > 1 else industry + 'の課題解決'}の最前線へ",
            "顧客に直接価値を届けるプロになる",
        ]
    else:
        return [
            f"{company_name}で新しい価値を生むこと",
            "強みを活かしチーム成果を最大化",
            f"{industry}の課題解決の最前線へ",
            "顧客に直接価値を届けるプロになる",
        ]


def _get_weakest_element(scores: MotivationScores) -> str:
    """Get the element with the lowest score."""
    elements = {
        "company_understanding": scores.company_understanding,
        "self_analysis": scores.self_analysis,
        "career_vision": scores.career_vision,
        "differentiation": scores.differentiation,
    }
    return min(elements, key=elements.get)


def _get_element_japanese_name(element: str) -> str:
    """Convert element to Japanese name."""
    names = {
        "company_understanding": "企業理解",
        "self_analysis": "自己分析",
        "career_vision": "キャリアビジョン",
        "differentiation": "差別化",
    }
    return names.get(element, element)


def _is_complete(scores: MotivationScores, threshold: int = ELEMENT_COMPLETION_THRESHOLD) -> bool:
    """Check if motivation is complete using weighted scoring.

    Weights reflect each element's impact on ES quality:
    - differentiation (30%): strongest predictor of unique, compelling ESes
    - career_vision (25%): demonstrates forward-thinking and commitment
    - company_understanding (25%): shows genuine interest and research
    - self_analysis (20%): foundation that supports all other elements
    """
    weighted = (
        scores.differentiation * 0.30
        + scores.career_vision * 0.25
        + scores.company_understanding * 0.25
        + scores.self_analysis * 0.20
    )
    # Weighted average must meet threshold AND no element below 50%
    min_element = min(
        scores.company_understanding,
        scores.self_analysis,
        scores.career_vision,
        scores.differentiation,
    )
    return weighted >= threshold and min_element >= 50


def _build_adaptive_rag_query(scores: Optional["MotivationScores"] = None) -> str:
    """Build a RAG query tailored to the user's weakest motivation elements."""
    if scores is None:
        return "企業の特徴、事業内容、強み、社風、求める人物像"

    weak_threshold = 50  # Elements below this need targeted context
    query_parts: list[str] = []

    if scores.company_understanding < weak_threshold:
        query_parts.append("企業の事業内容、製品、サービス、業界での位置づけ")
    if scores.self_analysis < weak_threshold:
        query_parts.append("求める人物像、必要なスキル、企業文化、働き方")
    if scores.career_vision < weak_threshold:
        query_parts.append("キャリアパス、成長機会、研修制度、配属")
    if scores.differentiation < weak_threshold:
        query_parts.append("競合との差別化、独自の強み、特徴的な取り組み")

    if not query_parts:
        return "企業の特徴、事業内容、強み、社風、求める人物像"

    return "、".join(query_parts)


async def _get_company_context(
    company_id: str,
    query: str = "",
    scores: Optional["MotivationScores"] = None,
) -> tuple[str, list[dict]]:
    """Get company RAG context for motivation questions.

    When *scores* are provided, builds an adaptive query targeting
    the user's weakest motivation elements.
    """
    try:
        if not query:
            query = _build_adaptive_rag_query(scores)
        context, sources = await get_enhanced_context_for_review_with_sources(
            company_id=company_id,
            es_content=query,
            max_context_length=2000,
        )
        return context, sources
    except Exception as e:
        logger.error(f"[Motivation] RAG context error: {e}")
        return "", []


@router.post("/evaluate")
async def evaluate_motivation_endpoint(request: NextQuestionRequest) -> dict:
    """
    Public endpoint: Evaluate the current conversation for motivation element coverage.
    Fetches RAG context internally.
    """
    return await _evaluate_motivation_internal(request)


async def _evaluate_motivation_internal(
    request: NextQuestionRequest,
    company_context: str | None = None,
) -> dict:
    """
    Internal evaluation logic. Accepts optional pre-fetched company context
    to avoid redundant RAG calls when invoked from get_next_question().
    """
    if not request.conversation_history:
        return {
            "scores": {
                "company_understanding": 0,
                "self_analysis": 0,
                "career_vision": 0,
                "differentiation": 0,
            },
            "weakest_element": "company_understanding",
            "is_complete": False,
            "missing_aspects": {
                "company_understanding": ["企業の事業内容", "企業の強み・特徴"],
                "self_analysis": ["関連する経験", "自分の強み"],
                "career_vision": ["入社後にやりたいこと", "キャリアパス"],
                "differentiation": ["この企業を選ぶ理由", "他社との違い"],
            },
        }

    trimmed_history = _trim_conversation_for_evaluation(request.conversation_history)
    if settings.debug and len(trimmed_history) != len(request.conversation_history):
        logger.debug(
            "[Motivation] Evaluation conversation trimmed: "
            f"{len(request.conversation_history)} -> {len(trimmed_history)}"
        )

    # Use pre-fetched context if available, otherwise fetch from RAG
    if company_context is None:
        company_context, _ = await _get_company_context(
            request.company_id,
            _format_conversation(trimmed_history)
        )

    conversation_text = _format_conversation(trimmed_history)
    prompt = MOTIVATION_EVALUATION_PROMPT.format(
        conversation=conversation_text,
        company_context=company_context or "（企業情報なし）",
    )
    if settings.debug:
        logger.debug(
            "[Motivation] Evaluation input sizes: "
            f"conversation_chars={len(conversation_text)}, "
            f"company_context_chars={len(company_context)}"
        )

    parse_retry_instructions = (
        "JSON以外は一切出力しないでください。"
        "コードブロックや説明文は禁止です。"
        "必ず必要なキーをすべて含め、配列は空配列でも可とします。"
    )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を評価してください。",
        max_tokens=1024,
        temperature=0.3,
        feature="motivation",
        retry_on_parse=True,
        parse_retry_instructions=parse_retry_instructions,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        if request.scores:
            scores = MotivationScores(
                company_understanding=request.scores.company_understanding,
                self_analysis=request.scores.self_analysis,
                career_vision=request.scores.career_vision,
                differentiation=request.scores.differentiation,
            )
        else:
            scores = MotivationScores()
        return {
            "scores": scores.model_dump(),
            "weakest_element": _get_weakest_element(scores),
            "is_complete": _is_complete(scores),
            "missing_aspects": {},
        }

    data = llm_result.data
    scores_data = data.get("scores", {})
    scores = MotivationScores(
        company_understanding=scores_data.get("company_understanding", 0),
        self_analysis=scores_data.get("self_analysis", 0),
        career_vision=scores_data.get("career_vision", 0),
        differentiation=scores_data.get("differentiation", 0),
    )

    return {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_complete(scores),
        "missing_aspects": data.get("missing_aspects", {}),
    }


@router.post("/next-question", response_model=NextQuestionResponse)
async def get_next_question(request: NextQuestionRequest):
    """
    Generate the next deep-dive question for motivation based on evaluation.
    """
    if not request.company_name:
        raise HTTPException(status_code=400, detail="企業名が指定されていません")

    # Handle initial question — fetch RAG for company-tailored suggestions
    if not request.conversation_history:
        initial_question = f"{request.company_name}を志望される理由を教えてください。まずは、どんなきっかけでこの企業に興味を持ちましたか？"

        industry = request.industry or "この業界"
        company_context, _ = await _get_company_context(request.company_id)
        initial_suggestions = _build_initial_suggestions(
            company_name=request.company_name,
            industry=industry,
            company_context=company_context,
            gakuchika_context=request.gakuchika_context,
        )

        return NextQuestionResponse(
            question=initial_question,
            reasoning="会話開始時の導入質問",
            should_continue=True,
            suggested_end=False,
            evaluation={
                "scores": {
                    "company_understanding": 0,
                    "self_analysis": 0,
                    "career_vision": 0,
                    "differentiation": 0,
                },
                "weakest_element": "company_understanding",
                "is_complete": False,
            },
            target_element="company_understanding",
            company_insight=None,
            suggestions=initial_suggestions,
        )

    # Get company RAG context (only for subsequent questions)
    company_context, _ = await _get_company_context(request.company_id)

    # Evaluate current progress (pass pre-fetched context to avoid duplicate RAG call)
    eval_result = await _evaluate_motivation_internal(request, company_context=company_context)
    scores = MotivationScores(**eval_result["scores"])
    weakest_element = eval_result["weakest_element"]
    is_complete = eval_result["is_complete"]
    missing_aspects = eval_result.get("missing_aspects", {})

    # If complete, suggest ending
    if is_complete:
        industry = request.industry or "この業界"
        completion_suggestions = _build_completion_suggestions(
            company_name=request.company_name,
            industry=industry,
            company_context=company_context,
        )

        return NextQuestionResponse(
            question="これまでの深掘りで、志望動機の核となる部分が具体的に整理できました。最後に、この企業で実現したい一番の目標を一言でまとめると何ですか？",
            reasoning="全要素が基準値に達したため、締めの質問",
            should_continue=False,
            suggested_end=True,
            evaluation=eval_result,
            target_element="career_vision",
            company_insight=None,
            suggestions=completion_suggestions,
        )

    # Generate targeted question
    weakest_jp = _get_element_japanese_name(weakest_element)
    missing_for_weakest = missing_aspects.get(weakest_element, [])
    missing_aspects_text = f"「{weakest_jp}」で不足: {', '.join(missing_for_weakest)}" if missing_for_weakest else ""

    safe_company_name = sanitize_prompt_input(request.company_name, max_length=200)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    prompt = MOTIVATION_QUESTION_PROMPT.format(
        company_name=safe_company_name,
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        company_context=company_context or "（企業情報なし）",
        gakuchika_section=gakuchika_section,
        company_understanding_score=scores.company_understanding,
        self_analysis_score=scores.self_analysis,
        career_vision_score=scores.career_vision,
        differentiation_score=scores.differentiation,
        weakest_element=weakest_jp,
        missing_aspects=missing_aspects_text,
        threshold=ELEMENT_COMPLETION_THRESHOLD,
    )
    if settings.debug:
        message_chars = sum(len(msg.content) for msg in request.conversation_history)
        logger.debug(
            "[Motivation] Next question input sizes: "
            f"messages={len(request.conversation_history)}, "
            f"message_chars={message_chars}, "
            f"company_context_chars={len(company_context)}, "
            f"gakuchika_chars={len(gakuchika_section)}"
        )

    messages = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="次の深掘り質問を生成してください。",
        messages=messages,
        max_tokens=900,  # 質問+サジェスト4つで十分
        temperature=0.5,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AIサービスに接続できませんでした。",
                "error_type": error.error_type if error else "unknown",
            },
        )

    data = llm_result.data
    if not data or not data.get("question"):
        raise HTTPException(
            status_code=503,
            detail={"error": "AIから有効な質問を取得できませんでした。"},
        )

    # Extract and validate suggestions
    suggestions = data.get("suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []
    suggestions = [s for s in suggestions if isinstance(s, str) and len(s.strip()) > 0][:4]

    return NextQuestionResponse(
        question=data["question"],
        reasoning=data.get("reasoning"),
        should_continue=data.get("should_continue", True),
        suggested_end=data.get("suggested_end", False),
        evaluation=eval_result,
        target_element=data.get("target_element", weakest_element),
        company_insight=data.get("company_insight"),
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
    Generate SSE events for motivation next-question with progress updates.
    Reuses get_next_question logic but yields progress events.
    """
    try:
        if not request.company_name:
            yield _sse_event("error", {"message": "企業名が指定されていません"})
            return

        # Handle initial question — fetch RAG for company-tailored suggestions
        if not request.conversation_history:
            initial_question = f"{request.company_name}を志望される理由を教えてください。まずは、どんなきっかけでこの企業に興味を持ちましたか？"
            industry = request.industry or "この業界"
            company_context, _ = await _get_company_context(request.company_id)
            initial_suggestions = _build_initial_suggestions(
                company_name=request.company_name,
                industry=industry,
                company_context=company_context,
                gakuchika_context=request.gakuchika_context,
            )
            yield _sse_event("complete", {
                "data": {
                    "question": initial_question,
                    "reasoning": "会話開始時の導入質問",
                    "should_continue": True,
                    "suggested_end": False,
                    "evaluation": {
                        "scores": {
                            "company_understanding": 0,
                            "self_analysis": 0,
                            "career_vision": 0,
                            "differentiation": 0,
                        },
                        "weakest_element": "company_understanding",
                        "is_complete": False,
                    },
                    "target_element": "company_understanding",
                    "company_insight": None,
                    "suggestions": initial_suggestions,
                },
            })
            return

        # Step 1: RAG context fetch
        yield _sse_event("progress", {
            "step": "rag", "progress": 15, "label": "企業情報を取得中...",
        })
        await asyncio.sleep(0.05)

        company_context, _ = await _get_company_context(request.company_id)

        # Step 2: Evaluation
        yield _sse_event("progress", {
            "step": "evaluation", "progress": 40, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        eval_result = await _evaluate_motivation_internal(
            request, company_context=company_context
        )
        scores = MotivationScores(**eval_result["scores"])
        weakest_element = eval_result["weakest_element"]
        is_complete = eval_result["is_complete"]
        missing_aspects = eval_result.get("missing_aspects", {})

        # If complete, return final question
        if is_complete:
            industry = request.industry or "この業界"
            completion_suggestions = _build_completion_suggestions(
                company_name=request.company_name,
                industry=industry,
                company_context=company_context,
            )
            yield _sse_event("complete", {
                "data": {
                    "question": "これまでの深掘りで、志望動機の核となる部分が具体的に整理できました。最後に、この企業で実現したい一番の目標を一言でまとめると何ですか？",
                    "reasoning": "全要素が基準値に達したため、締めの質問",
                    "should_continue": False,
                    "suggested_end": True,
                    "evaluation": eval_result,
                    "target_element": "career_vision",
                    "company_insight": None,
                    "suggestions": completion_suggestions,
                },
            })
            return

        # Step 3: Question generation
        yield _sse_event("progress", {
            "step": "question", "progress": 65, "label": "質問を考え中...",
        })
        await asyncio.sleep(0.05)

        weakest_jp = _get_element_japanese_name(weakest_element)
        missing_for_weakest = missing_aspects.get(weakest_element, [])
        missing_aspects_text = (
            f"「{weakest_jp}」で不足: {', '.join(missing_for_weakest)}"
            if missing_for_weakest
            else ""
        )

        gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
        prompt = MOTIVATION_QUESTION_PROMPT.format(
            company_name=sanitize_prompt_input(request.company_name, max_length=200),
            industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
            company_context=company_context or "（企業情報なし）",
            gakuchika_section=gakuchika_section,
            company_understanding_score=scores.company_understanding,
            self_analysis_score=scores.self_analysis,
            career_vision_score=scores.career_vision,
            differentiation_score=scores.differentiation,
            weakest_element=weakest_jp,
            missing_aspects=missing_aspects_text,
            threshold=ELEMENT_COMPLETION_THRESHOLD,
        )

        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        llm_result = await call_llm_with_error(
            system_prompt=prompt,
            user_message="次の深掘り質問を生成してください。",
            messages=messages,
            max_tokens=900,
            temperature=0.5,
            feature="motivation",
            retry_on_parse=True,
            disable_fallback=True,
        )

        if not llm_result.success:
            error = llm_result.error
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
            })
            return

        data = llm_result.data
        if not data or not data.get("question"):
            yield _sse_event("error", {
                "message": "AIから有効な質問を取得できませんでした。",
            })
            return

        # Extract suggestions
        suggestions = data.get("suggestions", [])
        if not isinstance(suggestions, list):
            suggestions = []
        suggestions = [
            s for s in suggestions if isinstance(s, str) and len(s.strip()) > 0
        ][:4]

        yield _sse_event("complete", {
            "data": {
                "question": data["question"],
                "reasoning": data.get("reasoning"),
                "should_continue": data.get("should_continue", True),
                "suggested_end": data.get("suggested_end", False),
                "evaluation": eval_result,
                "target_element": data.get("target_element", weakest_element),
                "company_insight": data.get("company_insight"),
                "suggestions": suggestions,
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


@router.post("/generate-draft", response_model=GenerateDraftResponse)
async def generate_draft(request: GenerateDraftRequest):
    """
    Generate ES draft from conversation history.
    """
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")

    # Get company context
    company_context, _ = await _get_company_context(request.company_id)

    conversation_text = _format_conversation(request.conversation_history)
    char_min = int(request.char_limit * 0.9)

    prompt = DRAFT_GENERATION_PROMPT.format(
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        company_context=company_context or "（企業情報なし）",
        conversation=conversation_text,
        char_limit=request.char_limit,
        char_min=char_min,
    )
    if settings.debug:
        logger.debug(
            "[Motivation] Draft input sizes: "
            f"conversation_chars={len(conversation_text)}, "
            f"company_context_chars={len(company_context)}, "
            f"char_limit={request.char_limit}"
        )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="志望動機のESを作成してください。",
        max_tokens=1200,  # Draft: ~300-500 chars + key_points + company_keywords + JSON
        temperature=0.3,
        feature="motivation",
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
                # Unescape JSON string escapes
                draft_text = draft_text.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
                # Remove trailing incomplete sentence if truncated
                if not draft_text.endswith(("。", "」", "）")):
                    last_period = draft_text.rfind("。")
                    if last_period > len(draft_text) * 0.5:
                        draft_text = draft_text[: last_period + 1]
                if len(draft_text) >= 100:
                    logger.warning(f"[志望動機作成] ⚠️ raw_textフォールバック: {len(draft_text)}字のドラフトを抽出")
                    return GenerateDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
                        key_points=[],
                        company_keywords=[],
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

    return GenerateDraftResponse(
        draft=draft,
        char_count=len(draft),
        key_points=data.get("key_points", []),
        company_keywords=data.get("company_keywords", []),
    )
