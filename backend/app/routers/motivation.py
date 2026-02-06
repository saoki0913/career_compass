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
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.utils.llm import call_llm_with_error
from app.utils.vector_store import get_enhanced_context_for_review_with_sources
from app.config import settings

router = APIRouter(prefix="/api/motivation", tags=["motivation"])

# Configuration
ELEMENT_COMPLETION_THRESHOLD = 70  # Each element needs 70%+ to be complete
DEFAULT_TARGET_QUESTIONS = 8


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class MotivationScores(BaseModel):
    company_understanding: int = 0  # 企業理解 (0-100)
    self_analysis: int = 0          # 自己分析 (0-100)
    career_vision: int = 0          # キャリアビジョン (0-100)
    differentiation: int = 0        # 差別化 (0-100)


class MotivationEvaluation(BaseModel):
    scores: MotivationScores
    weakest_element: str
    is_complete: bool
    missing_aspects: dict[str, list[str]]


class NextQuestionRequest(BaseModel):
    company_id: str
    company_name: str
    industry: Optional[str] = None
    conversation_history: list[Message]
    question_count: int = 0
    scores: Optional[dict] = None  # Previous scores


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
    company_id: str
    company_name: str
    industry: Optional[str] = None
    conversation_history: list[Message]
    char_limit: int = 400  # 300, 400, or 500


class GenerateDraftResponse(BaseModel):
    draft: str
    char_count: int
    key_points: list[str]
    company_keywords: list[str]


# Evaluation prompt for motivation elements
MOTIVATION_EVALUATION_PROMPT = """以下の志望動機に関する会話を分析し、4つの要素の充実度を0-100で評価してください。

## 評価基準

### 企業理解（Company Understanding）0-100点
- 0-30点: 企業について具体的な言及なし
- 31-50点: 業界や事業の一般的な理解のみ
- 51-70点: 企業の特徴・強みを1つ以上言及
- 71-90点: 企業の具体的な取り組み・数字に言及
- 91-100点: 競合との差別化ポイントまで理解

### 自己分析（Self-Analysis）0-100点
- 0-30点: 自分の経験・強みの言及なし
- 31-50点: 抽象的な強み（例: 「コミュニケーション力」）
- 51-70点: 具体的なエピソードあり
- 71-90点: エピソードと企業との接点を説明
- 91-100点: 再現性のある強みとして整理

### キャリアビジョン（Career Vision）0-100点
- 0-30点: 入社後のビジョンなし
- 31-50点: 「成長したい」等の抽象的な表現
- 51-70点: 具体的な業務・役割への言及
- 71-90点: 中長期的なキャリアパスの言及
- 91-100点: 企業の成長と自分の成長を接続

### 差別化（Differentiation）0-100点
- 0-30点: なぜこの企業かの説明なし
- 31-50点: 業界への興味のみ
- 51-70点: この企業でなければならない理由1つ
- 71-90点: 複数の理由を論理的に説明
- 91-100点: 他社との比較も含めて説明

## 会話履歴
{conversation}

## 企業情報（参考）
{company_context}

## 出力形式
必ず以下のJSON形式で回答してください：
JSON以外の文字列・コードブロック・説明文は禁止です。
missing_aspectsの各要素は最大2項目、各項目10文字以内で簡潔に記述してください。
{{
  "scores": {{
    "company_understanding": 0-100の数値,
    "self_analysis": 0-100の数値,
    "career_vision": 0-100の数値,
    "differentiation": 0-100の数値
  }},
  "missing_aspects": {{
    "company_understanding": ["観点1", "観点2"],
    "self_analysis": ["観点1"],
    "career_vision": ["観点1", "観点2"],
    "differentiation": ["観点1"]
  }}
}}"""


# Question generation prompt
MOTIVATION_QUESTION_PROMPT = """あなたは就活生の「志望動機」を深掘りするプロのインタビュアーです。

## 企業情報
- 企業名: {company_name}
- 業界: {industry}

## 企業の特徴（RAG情報）
{company_context}

## 現在の評価スコア
- 企業理解: {company_understanding_score}%
- 自己分析: {self_analysis_score}%
- キャリアビジョン: {career_vision_score}%
- 差別化: {differentiation_score}%

## 最も深掘りが必要な要素
**{weakest_element}** を重点的に深掘りしてください。

## 不足している観点
{missing_aspects}

## 質問生成ルール

### 必須: RAG情報を活用する
企業の具体的な情報（事業内容、強み、取り組み等）を質問に織り込んでください。
例: 「御社の〇〇という取り組みについて伺いましたが、これに興味を持ったきっかけは何ですか？」

### 必須: 前回の回答を引用する（2回目以降）
前回のユーザー回答から具体的なフレーズを引用し、「先ほど『〇〇』とおっしゃいましたが...」のように始めてください。

### 禁止表現
- ❌「もう少し詳しく教えてください」
- ❌「具体的に説明してください」
- ❌「他にありますか？」

### 推奨: 具体的な切り口
- 経験を聞く: 「〇〇に関連する経験はありますか？」
- 接点を聞く: 「ご自身の経験と御社の△△はどう繋がりますか？」
- 比較を聞く: 「同業他社ではなく御社を選ぶ理由は？」
- ビジョンを聞く: 「入社後、どんな仕事に挑戦したいですか？」

## 回答サジェスション生成ルール
質問と同時に、ユーザーが選べる回答候補を4つ生成してください。

### 要件
- 1つあたり1〜2文、50〜100文字程度
- 4つが異なる切り口をカバーすること
- 対象要素（{weakest_element}）に関連した内容
- 就活生が自然に言いそうな口語体
- 企業RAG情報があれば1〜2つに織り込む

### 多様性パターン
1. 経験ベース: 過去の経験から答える
2. 企業情報ベース: 企業の特徴に触れる
3. 価値観ベース: 自分の考え方から答える
4. 将来志向: 将来やりたいことから答える

## 出力形式
必ず以下のJSON形式で回答してください。suggestionsはquestionの直後に出力すること（重要フィールドを先に出力）：
{{
  "question": "質問文",
  "suggestions": ["回答候補1（経験ベース）", "回答候補2（企業情報ベース）", "回答候補3（価値観ベース）", "回答候補4（将来志向）"],
  "reasoning": "この質問をする理由（1文）",
  "target_element": "company_understanding|self_analysis|career_vision|differentiation",
  "company_insight": "質問に活用した企業情報（あれば）",
  "should_continue": true,
  "suggested_end": false
}}

suggested_endは全ての要素が{threshold}%以上の場合のみtrueにしてください。"""


# ES draft generation prompt
DRAFT_GENERATION_PROMPT = """以下の会話内容から、{char_limit}字程度の志望動機ESを作成してください。

## 企業情報
- 企業名: {company_name}
- 業界: {industry}

## 企業の特徴（参考）
{company_context}

## 会話内容
{conversation}

## 作成ルール
1. だ・である調で統一
2. 文字数: {char_min}〜{char_limit}字
3. 構成:
   - 導入（15%）: 志望理由の結論
   - 本論（70%）: 具体的な理由・経験・接点
   - 結論（15%）: 入社後のビジョン
4. 会話で出た具体的なエピソード・数字を活用
5. 企業の特徴との接点を明確に

## 出力形式
必ず以下のJSON形式で回答してください：
{{
  "draft": "志望動機本文",
  "key_points": ["強調したポイント1", "強調したポイント2", "強調したポイント3"],
  "company_keywords": ["使用した企業キーワード1", "使用した企業キーワード2"]
}}"""


def _format_conversation(messages: list[Message]) -> str:
    """Format conversation history for prompts."""
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        formatted.append(f"{role_label}: {msg.content}")
    return "\n\n".join(formatted)


def _trim_conversation_for_evaluation(
    messages: list[Message], max_messages: int = 8
) -> list[Message]:
    """Trim conversation to recent messages for evaluation stability."""
    if len(messages) <= max_messages:
        return messages
    return messages[-max_messages:]


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
        print(f"[Motivation] RAG context error: {e}")
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
        print(
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
        print(
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
            scores = MotivationScores(**request.scores)
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

    # Handle initial question early — no RAG needed for the first question
    if not request.conversation_history:
        initial_question = f"{request.company_name}を志望される理由を教えてください。まずは、どんなきっかけでこの企業に興味を持ちましたか？"

        industry = request.industry or "この業界"
        initial_suggestions = [
            f"大学の授業で{industry}について学び、{request.company_name}の取り組みに興味を持ちました",
            f"就活サイトで{request.company_name}の社員インタビューを読んで、社風に惹かれました",
            "インターンシップや説明会に参加して、事業内容に魅力を感じました",
            f"もともと{industry}に関心があり、業界研究の中で{request.company_name}を知りました",
        ]

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
        completion_suggestions = [
            f"{request.company_name}で新しい価値を生み出し、社会に貢献すること",
            "自分の強みを活かして、チームの成果を最大化すること",
            f"{industry}の課題解決に第一線で取り組むこと",
            "お客様に直接価値を届けられるプロフェッショナルになること",
        ]

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

    prompt = MOTIVATION_QUESTION_PROMPT.format(
        company_name=request.company_name,
        industry=request.industry or "不明",
        company_context=company_context or "（企業情報なし）",
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
        print(
            "[Motivation] Next question input sizes: "
            f"messages={len(request.conversation_history)}, "
            f"message_chars={message_chars}, "
            f"company_context_chars={len(company_context)}"
        )

    messages = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="次の深掘り質問を生成してください。",
        messages=messages,
        max_tokens=900,  # 質問+サジェスト4つで十分
        temperature=0.7,
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

        # Handle initial question (no history) — return immediately
        if not request.conversation_history:
            initial_question = f"{request.company_name}を志望される理由を教えてください。まずは、どんなきっかけでこの企業に興味を持ちましたか？"
            industry = request.industry or "この業界"
            initial_suggestions = [
                f"大学の授業で{industry}について学び、{request.company_name}の取り組みに興味を持ちました",
                f"就活サイトで{request.company_name}の社員インタビューを読んで、社風に惹かれました",
                "インターンシップや説明会に参加して、事業内容に魅力を感じました",
                f"もともと{industry}に関心があり、業界研究の中で{request.company_name}を知りました",
            ]
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
            completion_suggestions = [
                f"{request.company_name}で新しい価値を生み出し、社会に貢献すること",
                "自分の強みを活かして、チームの成果を最大化すること",
                f"{industry}の課題解決に第一線で取り組むこと",
                "お客様に直接価値を届けられるプロフェッショナルになること",
            ]
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

        prompt = MOTIVATION_QUESTION_PROMPT.format(
            company_name=request.company_name,
            industry=request.industry or "不明",
            company_context=company_context or "（企業情報なし）",
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
            temperature=0.7,
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
        company_name=request.company_name,
        industry=request.industry or "不明",
        company_context=company_context or "（企業情報なし）",
        conversation=conversation_text,
        char_limit=request.char_limit,
        char_min=char_min,
    )
    if settings.debug:
        print(
            "[Motivation] Draft input sizes: "
            f"conversation_chars={len(conversation_text)}, "
            f"company_context_chars={len(company_context)}, "
            f"char_limit={request.char_limit}"
        )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="志望動機のESを作成してください。",
        max_tokens=600,  # Draft: ~200-400 chars + JSON wrapper
        temperature=0.5,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
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
