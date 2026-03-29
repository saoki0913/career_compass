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
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.utils.llm import (
    PromptSafetyError,
    call_llm_with_error,
    call_llm_streaming_fields,
    consume_request_llm_cost_summary,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.vector_store import get_enhanced_context_for_review_with_sources
from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.content_types import content_type_label
from app.prompts.motivation_prompts import (
    MOTIVATION_EVALUATION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
    MOTIVATION_SUGGESTION_REWRITE_PROMPT,
    DRAFT_GENERATION_PROMPT,
)
from app.limiter import limiter

logger = get_logger(__name__)

router = APIRouter(prefix="/api/motivation", tags=["motivation"])

# Configuration
ELEMENT_COMPLETION_THRESHOLD = 70  # Each element needs 70%+ to be complete


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
    hidden_eval: Optional[dict[str, Any]] = None
    risk_flags: list[str] = []


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
    requires_industry_selection: bool = False
    industry_options: Optional[list[str]] = None
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    scores: Optional[MotivationScoresInput] = None
    gakuchika_context: Optional[list[dict]] = None
    conversation_context: Optional[dict[str, Any]] = None
    profile_context: Optional[dict[str, Any]] = None
    application_job_candidates: Optional[list[str]] = None
    company_role_candidates: Optional[list[str]] = None
    company_work_candidates: Optional[list[str]] = None


class SuggestionOption(BaseModel):
    id: str
    label: str
    sourceType: str
    intent: str
    evidenceSourceIds: list[str] = []
    rationale: Optional[str] = None
    isTentative: bool = False


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
    target_element: Optional[str] = None
    company_insight: Optional[str] = None  # RAG-based company insight used
    suggestion_options: list[SuggestionOption] = []
    evidence_summary: Optional[str] = None  # RAG根拠の短い要約
    evidence_cards: list[EvidenceCard] = []
    question_stage: Optional[str] = None
    question_focus: Optional[str] = None
    stage_status: Optional[StageStatus] = None
    captured_context: Optional[dict[str, Any]] = None
    coaching_focus: Optional[str] = None
    risk_flags: list[str] = []
    question_signature: Optional[str] = None
    stage_attempt_count: Optional[int] = None
    premise_mode: Optional[str] = None
    internal_telemetry: Optional[dict[str, Any]] = None


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
    internal_telemetry: Optional[dict[str, Any]] = None


def _format_conversation(messages: list[Message]) -> str:
    """Format conversation history for prompts."""
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


def _sanitize_request_messages(messages: list[Message]) -> None:
    for msg in messages:
        if msg.role == "user":
            msg.content = sanitize_user_prompt_text(msg.content, max_length=3000)


def _sanitize_request_text(value: Optional[str], *, max_length: int = 200) -> Optional[str]:
    if value is None:
        return None
    sanitized = sanitize_user_prompt_text(value, max_length=max_length)
    return sanitized.strip() or None


def _sanitize_next_question_request(request: NextQuestionRequest) -> None:
    request.company_name = _sanitize_request_text(request.company_name, max_length=200) or request.company_name
    request.industry = _sanitize_request_text(request.industry, max_length=100)
    _sanitize_request_messages(request.conversation_history)


def _sanitize_generate_draft_request(request: GenerateDraftRequest) -> None:
    request.company_name = _sanitize_request_text(request.company_name, max_length=200) or request.company_name
    request.industry = _sanitize_request_text(request.industry, max_length=100)
    _sanitize_request_messages(request.conversation_history)


def _trim_conversation_for_evaluation(
    messages: list[Message], max_messages: int = 8
) -> list[Message]:
    """Trim conversation to recent messages for evaluation stability."""
    if len(messages) <= max_messages:
        return messages
    return messages[-max_messages:]


def _format_recent_conversation_for_prompt(
    messages: list[Message],
    max_messages: int = 6,
) -> str:
    if not messages:
        return "（まだ会話履歴なし）"
    return _format_conversation(_trim_conversation_for_evaluation(messages, max_messages=max_messages))


def _build_question_messages(messages: list[Message]) -> list[dict[str, str]] | None:
    if not messages:
        return None
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def _build_question_user_message(messages: list[Message]) -> str:
    if not messages:
        return "会話開始用の最初の深掘り質問を1問生成してください。"
    return "次の深掘り質問を生成してください。"


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


STAGE_ORDER = [
    "industry_reason",
    "company_reason",
    "desired_work",
    "origin_experience",
    "fit_connection",
    "differentiation",
    "closing",
]

STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "company_reason": "企業志望理由",
    "desired_work": "やりたい仕事",
    "origin_experience": "原体験",
    "fit_connection": "経験との接続",
    "differentiation": "差別化",
    "closing": "締めの整理",
}

REQUIRED_MOTIVATION_STAGES = (
    "industry_reason",
    "company_reason",
    "desired_work",
    "origin_experience",
    "fit_connection",
    "differentiation",
)

MAX_STAGE_REASKS = 1

STAGE_CONFIRMED_FACT_KEYS = {
    "industry_reason": "industry_reason_confirmed",
    "company_reason": "company_reason_confirmed",
    "desired_work": "desired_work_confirmed",
    "origin_experience": "origin_experience_confirmed",
    "fit_connection": "fit_connection_confirmed",
    "differentiation": "differentiation_confirmed",
}

PREMISE_ASSERTIVE_PATTERNS = (
    "志望して",
    "やりたい",
    "惹かれて",
    "合っている",
    "活かせる",
)

QUESTION_FOCUS_BY_STAGE = {
    "industry_reason": ("industry_axis", "why_industry_now"),
    "company_reason": ("industry_axis", "why_industry_now", "feature_appeal", "axis_match", "role_value"),
    "desired_work": ("work_image", "customer_problem", "value_creation"),
    "origin_experience": ("origin_trigger", "experience_detail"),
    "fit_connection": ("experience_connection", "strength_application"),
    "differentiation": ("company_over_others", "role_specific_reason"),
    "closing": ("one_line_summary",),
}


def _clean_short_phrase(text: str, max_len: int = 40) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip(" ・-:：")
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


def _coerce_string_list(value: Any, max_items: int = 4) -> list[str]:
    if not isinstance(value, list):
        return []
    output: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        cleaned = _clean_short_phrase(item, max_len=48)
        if cleaned and cleaned not in output:
            output.append(cleaned)
        if len(output) >= max_items:
            break
    return output


def _default_confirmed_facts() -> dict[str, bool]:
    return {
        "industry_reason_confirmed": False,
        "company_reason_confirmed": False,
        "desired_work_confirmed": False,
        "origin_experience_confirmed": False,
        "fit_connection_confirmed": False,
        "differentiation_confirmed": False,
    }


def _normalize_confirmed_facts(value: Any) -> dict[str, bool]:
    defaults = _default_confirmed_facts()
    if not isinstance(value, dict):
        return defaults
    normalized = defaults.copy()
    for key in defaults:
        if key in value:
            normalized[key] = bool(value[key])
    return normalized


def _build_open_slots_from_confirmed_facts(confirmed_facts: dict[str, bool]) -> list[str]:
    slots: list[str] = []
    for stage, key in STAGE_CONFIRMED_FACT_KEYS.items():
        if not confirmed_facts.get(key, False):
            slots.append(stage)
    return slots


def _confirmed_fact_key_for_stage(stage: str) -> str | None:
    return STAGE_CONFIRMED_FACT_KEYS.get(stage)


def _answer_is_confirmed_for_stage(stage: str, answer: str) -> bool:
    normalized = " ".join((answer or "").split()).strip()
    if len(normalized) < 10:
        return False
    if stage == "industry_reason":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("業界", "関心", "理由", "ため", "から", "惹かれ")
        )
    if stage == "company_reason":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("理由", "ため", "から", "惹かれ", "魅力", "合う")
        )
    if stage == "desired_work":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("したい", "挑戦", "関わりたい", "担いたい", "取り組みたい")
        )
    if stage == "origin_experience":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("経験", "原体験", "きっかけ", "通じ", "から")
        )
    if stage == "fit_connection":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("活か", "つなが", "生か", "再現", "役立", "結びつ")
        )
    if stage == "differentiation":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("他社", "違い", "だからこそ", "最も", "ならでは", "合う")
        )
    return bool(normalized)


def _coerce_risk_flags(value: Any, max_items: int = 2) -> list[str]:
    return _coerce_string_list(value, max_items=max_items)


def _normalize_conversation_context(value: dict[str, Any] | None) -> dict[str, Any]:
    context = value.copy() if isinstance(value, dict) else {}
    has_explicit_confirmed_facts = isinstance(context.get("confirmedFacts"), dict)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    raw_stage_attempt_count = context.get("stageAttemptCount")
    try:
        stage_attempt_count = max(int(raw_stage_attempt_count or 0), 0)
    except (TypeError, ValueError):
        stage_attempt_count = 0
    normalized = {
        "selectedIndustry": str(context.get("selectedIndustry") or "").strip() or None,
        "selectedIndustrySource": str(context.get("selectedIndustrySource") or "").strip() or None,
        "industryReason": str(context.get("industryReason") or "").strip() or None,
        "companyReason": str(context.get("companyReason") or "").strip() or None,
        "selectedRole": str(context.get("selectedRole") or "").strip() or None,
        "selectedRoleSource": str(context.get("selectedRoleSource") or "").strip() or None,
        "desiredWork": str(context.get("desiredWork") or "").strip() or None,
        "originExperience": str(context.get("originExperience") or "").strip() or None,
        "fitConnection": str(context.get("fitConnection") or "").strip() or None,
        "differentiationReason": str(context.get("differentiationReason") or "").strip() or None,
        "userAnchorStrengths": _coerce_string_list(context.get("userAnchorStrengths"), max_items=4),
        "userAnchorEpisodes": _coerce_string_list(context.get("userAnchorEpisodes"), max_items=4),
        "profileAnchorIndustries": _coerce_string_list(context.get("profileAnchorIndustries"), max_items=4),
        "profileAnchorJobTypes": _coerce_string_list(context.get("profileAnchorJobTypes"), max_items=4),
        "companyAnchorKeywords": _sanitize_existing_grounding_candidates(
            context.get("companyAnchorKeywords"),
            max_items=6,
            max_len=32,
        ),
        "companyRoleCandidates": _coerce_string_list(context.get("companyRoleCandidates"), max_items=4),
        "companyWorkCandidates": _sanitize_existing_grounding_candidates(
            context.get("companyWorkCandidates"),
            max_items=4,
            max_len=32,
        ),
        "questionStage": str(context.get("questionStage") or "").strip() or "industry_reason",
        "stageAttemptCount": stage_attempt_count,
        "lastQuestionSignature": str(context.get("lastQuestionSignature") or "").strip() or None,
        "confirmedFacts": confirmed_facts,
        "openSlots": _coerce_string_list(
            context.get("openSlots") or _build_open_slots_from_confirmed_facts(confirmed_facts),
            max_items=8,
        ),
        "lastQuestionMeta": context.get("lastQuestionMeta")
        if isinstance(context.get("lastQuestionMeta"), dict)
        else None,
    }
    if not has_explicit_confirmed_facts:
        if normalized["industryReason"]:
            confirmed_facts["industry_reason_confirmed"] = True
        if normalized["companyReason"]:
            confirmed_facts["company_reason_confirmed"] = True
        if normalized["desiredWork"]:
            confirmed_facts["desired_work_confirmed"] = True
        if normalized["originExperience"]:
            confirmed_facts["origin_experience_confirmed"] = True
        if normalized["fitConnection"]:
            confirmed_facts["fit_connection_confirmed"] = True
        if normalized["differentiationReason"]:
            confirmed_facts["differentiation_confirmed"] = True
        normalized["confirmedFacts"] = confirmed_facts
        normalized["openSlots"] = _build_open_slots_from_confirmed_facts(confirmed_facts)
    return normalized


def _capture_answer_into_context(
    conversation_context: dict[str, Any] | None,
    answer: str | None,
) -> dict[str, Any]:
    context = _normalize_conversation_context(conversation_context)
    trimmed = " ".join((answer or "").split()).strip()
    if not trimmed:
        return context

    stage = context.get("questionStage") or "industry_reason"
    if stage == "industry_reason":
        context["industryReason"] = trimmed
    elif stage == "company_reason":
        context["companyReason"] = trimmed
    elif stage == "desired_work":
        context["desiredWork"] = trimmed
    elif stage == "origin_experience":
        context["originExperience"] = trimmed
    elif stage == "fit_connection":
        context["fitConnection"] = trimmed
    elif stage == "differentiation":
        context["differentiationReason"] = trimmed

    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    fact_key = _confirmed_fact_key_for_stage(stage)
    if fact_key:
        confirmed_facts[fact_key] = _answer_is_confirmed_for_stage(stage, trimmed)
    context["confirmedFacts"] = confirmed_facts
    context["openSlots"] = _build_open_slots_from_confirmed_facts(confirmed_facts)

    return context


def _format_profile_for_prompt(profile_context: dict[str, Any] | None) -> str:
    if not isinstance(profile_context, dict):
        return "（プロフィール情報なし）"

    lines: list[str] = []
    if profile_context.get("university"):
        lines.append(f"- 大学: {profile_context['university']}")
    if profile_context.get("faculty"):
        lines.append(f"- 学部学科: {profile_context['faculty']}")
    if profile_context.get("graduation_year"):
        lines.append(f"- 卒業年度: {profile_context['graduation_year']}")

    industries = _coerce_string_list(profile_context.get("target_industries"), max_items=4)
    job_types = _coerce_string_list(profile_context.get("target_job_types"), max_items=4)
    if industries:
        lines.append(f"- 志望業界: {', '.join(industries)}")
    if job_types:
        lines.append(f"- 志望職種: {', '.join(job_types)}")

    return "\n".join(lines) if lines else "（プロフィール情報なし）"


def _format_application_jobs_for_prompt(application_job_candidates: list[str] | None) -> str:
    candidates = _coerce_string_list(application_job_candidates, max_items=6)
    if not candidates:
        return "（応募中・検討中の職種情報なし）"
    return "\n".join(f"- {candidate}" for candidate in candidates)


def _format_conversation_context_for_prompt(conversation_context: dict[str, Any] | None) -> str:
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context["confirmedFacts"])
    last_question_meta = context.get("lastQuestionMeta") or {}
    lines = [
        f"- 確定業界: {context['selectedIndustry'] or '未確定'}",
        f"- 業界志望理由: {context['industryReason'] or '未整理'}",
        f"- 企業志望理由: {context['companyReason'] or '未整理'}",
        f"- 志望職種: {context['selectedRole'] or '未整理'}",
        f"- やりたい仕事: {context['desiredWork'] or '未整理'}",
        f"- 原体験: {context['originExperience'] or '未整理'}",
        f"- 経験との接続: {context['fitConnection'] or '未整理'}",
        f"- 他社ではなくこの企業の理由: {context['differentiationReason'] or '未整理'}",
        f"- 現在段階: {STAGE_LABELS.get(context['questionStage'], context['questionStage'])}",
        f"- 段階再質問回数: {context['stageAttemptCount']}",
        (
            "- confirmed facts: "
            f"industry={confirmed_facts['industry_reason_confirmed']}, "
            f"company={confirmed_facts['company_reason_confirmed']}, "
            f"desired_work={confirmed_facts['desired_work_confirmed']}, "
            f"origin={confirmed_facts['origin_experience_confirmed']}, "
            f"fit_connection={confirmed_facts['fit_connection_confirmed']}, "
            f"differentiation={confirmed_facts['differentiation_confirmed']}"
        ),
    ]
    if last_question_meta:
        lines.append(
            "- 前回質問メタ: "
            f"stage={last_question_meta.get('question_stage') or 'なし'}, "
            f"focus={last_question_meta.get('question_focus') or 'なし'}, "
            f"attempt={last_question_meta.get('stage_attempt_count') or 0}"
        )
    if context["companyRoleCandidates"]:
        lines.append(f"- 企業職種候補: {', '.join(context['companyRoleCandidates'])}")
    if context["companyWorkCandidates"]:
        lines.append(f"- 企業仕事内容候補: {', '.join(context['companyWorkCandidates'])}")
    return "\n".join(lines)


COMPANY_TEXT_NOISE_PATTERNS = (
    re.compile(r"^[QＱ]\s*\d+\b", re.IGNORECASE),
    re.compile(r"^(見出し|質問|回答)[:：]"),
    re.compile(r"^https?://", re.IGNORECASE),
)

COMPANY_TEXT_NOISE_KEYWORDS = (
    "ご紹介します",
    "エントリー",
    "マイページ",
    "募集要項",
    "選考フロー",
    "選考情報",
    "応募方法",
    "応募する",
    "よくある質問",
    "FAQ",
    "ニュース",
    "トピックス",
    "一覧",
    "詳細はこちら",
    "クリック",
    "社員紹介",
    "採用情報",
    "インターンシップ",
    "見出し",
    "Q1",
    "Q2",
    "Q3",
    "Q4",
)

COMPANY_FEATURE_ENDINGS = (
    "事業投資",
    "バリューチェーン",
    "社会課題解決",
    "デジタル変革",
    "脱炭素ソリューション",
    "エネルギー事業",
    "インフラ事業",
    "物流事業",
    "金融事業",
    "DX支援",
    "業務改革",
    "事業開発",
    "事業基盤",
    "ソリューション",
    "グローバル事業",
    "価値創出",
    "価値提供",
    "トレーディング",
    "投資",
    "物流",
    "金融",
    "インフラ",
    "エネルギー",
    "食料",
    "DX",
    "事業",
)

WORK_CANDIDATE_ENDINGS = (
    "顧客課題解決",
    "事業開発",
    "商品企画",
    "営業企画",
    "提案営業",
    "法人営業",
    "データ分析",
    "業務改善",
    "運用改善",
    "改善提案",
    "課題分析",
    "顧客提案",
    "提案",
    "企画",
    "開発",
    "運用",
    "改善",
    "推進",
    "分析",
    "支援",
    "設計",
    "研究",
    "営業",
    "投資",
)

ROLE_WORK_FALLBACKS = {
    "営業": "顧客課題の整理と提案",
    "企画": "新しい企画の立案と改善",
    "マーケティング": "顧客理解をもとにした企画提案",
    "コンサル": "課題整理と改善提案",
    "エンジニア": "課題を技術で解決する開発",
    "開発": "課題を技術で解決する開発",
    "研究": "新しい価値につながる研究開発",
    "データ": "データ分析を通じた改善提案",
    "人事": "人や組織の課題解決",
    "財務": "数字を起点にした課題分析",
    "法務": "事業推進を支える法務支援",
    "総合職": "事業課題を捉えて関係者を巻き込む仕事",
}

GENERIC_OPTION_BLOCKLIST = {
    "成長したい",
    "頑張りたい",
    "学びたい",
    "興味がある",
    "貢献したい",
    "挑戦したい",
}

DIRECT_ANSWER_REQUIRED_TERMS = {
    "industry_reason": ("ため", "から", "関心", "惹かれ", "理由"),
    "company_reason": ("ため", "から", "魅力", "惹かれ", "理由"),
    "desired_work": ("したい", "挑戦", "関わりたい", "担いたい", "取り組みたい", "向き合いたい"),
    "origin_experience": ("経験", "原体験", "きっかけ", "通じて", "から"),
    "fit_connection": ("活か", "活き", "つなが", "再現", "役立", "生か"),
    "differentiation": ("他社", "違い", "理由", "合うため", "最も", "だからこそ"),
    "closing": ("したい", "目指", "貢献", "実現", "価値を出", "なりたい"),
}

QUESTION_KEYWORDS_BY_STAGE = {
    "industry_reason": ("業界", "関心", "理由", "きっかけ", "今"),
    "company_reason": ("理由", "魅力", "惹かれ", "きっかけ", "選ぶ"),
    "desired_work": ("入社後", "仕事", "挑戦", "担い", "関わり"),
    "origin_experience": ("経験", "原体験", "きっかけ", "通じ", "関心"),
    "fit_connection": ("経験", "強み", "活か", "つなが", "再現"),
    "differentiation": ("他社", "違い", "選ぶ", "理由", "だからこそ"),
    "closing": ("一言", "まとめ", "実現", "目標", "価値"),
}

GENERIC_QUESTION_BLOCKLIST = (
    "もう少し詳しく",
    "具体的に説明",
    "他にありますか",
    "先ほど",
)

QUESTION_INSTRUCTION_BLOCKLIST = (
    "1文で答える",
    "一文で答える",
    "入力してください",
    "候補を選ぶ",
    "そのまま入力",
    "選択してください",
    "選んでください",
)

QUESTION_FIT_KEYWORDS = {
    ("industry_reason", "industry_axis"): ("業界", "産業", "横断", "幅広", "選択肢", "IT・通信", "商社"),
    ("industry_reason", "why_industry_now"): ("きっかけ", "関心", "高ま", "強まり", "惹かれ", "今"),
    ("company_reason", "industry_axis"): ("業界", "産業", "横断", "幅広", "選択肢", "商社", "事業"),
    ("company_reason", "why_industry_now"): ("きっかけ", "関心", "高ま", "強まり", "惹かれ", "今"),
    ("company_reason", "role_value"): ("職種", "役割", "関わ", "担", "志望"),
    ("company_reason", "feature_appeal"): ("魅力", "強み", "特徴", "惹かれ", "姿勢"),
    ("company_reason", "axis_match"): ("軸", "合う", "重なる", "一致"),
    ("desired_work", "customer_problem"): ("入社後", "課題", "提案", "向き合", "整理"),
    ("desired_work", "work_image"): ("入社後", "挑戦", "担いたい", "関わりたい"),
    ("desired_work", "value_creation"): ("入社後", "価値", "貢献", "成果", "実現"),
    ("origin_experience", "origin_trigger"): ("きっかけ", "原体験", "関心", "強ま", "通じて"),
    ("origin_experience", "experience_detail"): ("経験", "取り組み", "出来事", "場面", "通じて"),
    ("fit_connection", "strength_application"): ("強み", "活か", "再現", "巻き込み", "つなが"),
    ("fit_connection", "experience_connection"): ("経験", "培った", "活か", "つなが", "エピソード"),
    ("differentiation", "company_over_others"): ("他社", "違う", "比べ", "最も", "だからこそ"),
    ("differentiation", "role_specific_reason"): ("職種", "役割", "仕事", "描ける", "実務"),
    ("closing", "one_line_summary"): ("貢献", "価値", "実現", "目指", "したい"),
}


def _iter_company_grounding_segments(
    company_context: str,
    company_sources: list[dict] | None,
) -> list[str]:
    segments: list[str] = []
    seen: set[str] = set()

    def add(text: str | None) -> None:
        normalized = " ".join((text or "").split())
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        segments.append(normalized)

    for source in company_sources or []:
        if not isinstance(source, dict):
            continue
        add(str(source.get("excerpt") or "").strip())
        add(str(source.get("title") or "").strip())

    for line in company_context.splitlines():
        add(line.strip())

    return segments


def _is_noisy_company_text(text: str) -> bool:
    cleaned = " ".join((text or "").split())
    if len(cleaned) < 4:
        return True
    if any(pattern.search(cleaned) for pattern in COMPANY_TEXT_NOISE_PATTERNS):
        return True
    if any(keyword in cleaned for keyword in COMPANY_TEXT_NOISE_KEYWORDS):
        return True
    if "?" in cleaned or "？" in cleaned:
        return True
    if any(token in cleaned for token in ("|", ">", "＞", "http://", "https://")):
        return True
    return False


def _extract_compound_nouns(
    text: str,
    endings: tuple[str, ...],
    *,
    max_len: int,
) -> list[str]:
    candidates: list[str] = []
    if _is_noisy_company_text(text):
        return candidates

    for ending in endings:
        pattern = re.compile(
            rf"([一-龠ァ-ヶA-Za-z0-9・／/&ー]{{0,20}}{re.escape(ending)})"
        )
        for match in pattern.finditer(text):
            candidate = _clean_short_phrase(match.group(1), max_len=max_len)
            if len(candidate) < 4 or candidate in candidates:
                continue
            if _is_noisy_company_text(candidate):
                continue
            candidates.append(candidate)
    return candidates


def _sanitize_existing_grounding_candidates(
    values: list[str] | None,
    *,
    max_items: int = 4,
    max_len: int = 32,
) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned_values: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = _clean_short_phrase(value, max_len=max_len)
        if not cleaned or cleaned in cleaned_values:
            continue
        if _is_noisy_company_text(cleaned):
            continue
        cleaned_values.append(cleaned)
        if len(cleaned_values) >= max_items:
            break
    return cleaned_values


def _extract_company_keywords(
    company_context: str,
    company_sources: list[dict] | None = None,
    *,
    selected_role: str | None = None,
    max_items: int = 6,
) -> list[str]:
    return _merge_candidate_lists(
        _extract_company_features(company_context, company_sources, max_features=min(4, max_items)),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=selected_role,
            max_items=min(4, max_items),
        ),
        max_items=max_items,
    )


def _extract_role_candidates_from_context(company_context: str, max_items: int = 4) -> list[str]:
    pattern = re.compile(r"(営業|企画|マーケティング|コンサルタント|エンジニア|開発|研究|データサイエンティスト|デザイナー|総合職|事務|人事|財務|法務|生産技術|品質管理)")
    candidates: list[str] = []
    for line in company_context.splitlines():
        cleaned = _clean_short_phrase(line, max_len=36)
        if not cleaned:
            continue
        match = pattern.search(cleaned)
        if match:
            candidate = match.group(1)
            if candidate not in candidates:
                candidates.append(candidate)
        if len(candidates) >= max_items:
            break
    return candidates


def _extract_company_features(
    company_context: str,
    company_sources: list[dict] | None = None,
    *,
    max_features: int = 3,
) -> list[str]:
    candidates: list[str] = []
    for segment in _iter_company_grounding_segments(company_context, company_sources):
        for candidate in _extract_compound_nouns(segment, COMPANY_FEATURE_ENDINGS, max_len=26):
            if candidate not in candidates:
                candidates.append(candidate)
            if len(candidates) >= max_features:
                return candidates
    return candidates


def _extract_work_candidates_from_context(
    company_context: str,
    company_sources: list[dict] | None = None,
    *,
    selected_role: str | None = None,
    max_items: int = 4,
) -> list[str]:
    segments = _iter_company_grounding_segments(company_context, company_sources)
    if selected_role:
        segments = sorted(
            segments,
            key=lambda segment: 0 if selected_role in segment else 1,
        )
    candidates: list[str] = []
    for segment in segments:
        for candidate in _extract_compound_nouns(segment, WORK_CANDIDATE_ENDINGS, max_len=28):
            if candidate not in candidates:
                candidates.append(candidate)
            if len(candidates) >= max_items:
                return candidates
    return candidates


def _extract_gakuchika_episode(gakuchika_context: list[dict] | None) -> str | None:
    if not gakuchika_context:
        return None
    for item in gakuchika_context:
        title = item.get("title")
        if isinstance(title, str) and title.strip():
            return _clean_short_phrase(title, max_len=28)
    return None


def _extract_profile_job_types(profile_context: dict[str, Any] | None) -> list[str]:
    if not isinstance(profile_context, dict):
        return []
    return _coerce_string_list(profile_context.get("target_job_types"), max_items=4)


def _extract_profile_industries(profile_context: dict[str, Any] | None) -> list[str]:
    if not isinstance(profile_context, dict):
        return []
    return _coerce_string_list(profile_context.get("target_industries"), max_items=4)


def _extract_profile_anchor(profile_context: dict[str, Any] | None) -> str | None:
    if not isinstance(profile_context, dict):
        return None
    faculty = str(profile_context.get("faculty") or "").strip()
    if faculty:
        return _clean_short_phrase(faculty, max_len=24)
    job_types = _extract_profile_job_types(profile_context)
    if job_types:
        return job_types[0]
    industries = _extract_profile_industries(profile_context)
    if industries:
        return industries[0]
    return None


def _fallback_work_for_role(role: str | None) -> str:
    cleaned_role = (role or "").strip()
    if not cleaned_role:
        return "顧客課題の解決"
    for keyword, fallback in ROLE_WORK_FALLBACKS.items():
        if keyword in cleaned_role:
            return fallback
    return "顧客課題の解決"


def _build_suggestion_option(label: str, source_type: str, intent: str) -> SuggestionOption:
    cleaned_label = _clean_short_phrase(label, max_len=68)
    return SuggestionOption(
        id=re.sub(r"[^a-z0-9]+", "-", f"{intent}-{cleaned_label.lower()}").strip("-")[:48] or intent,
        label=cleaned_label,
        sourceType=source_type,
        intent=intent,
    )


def _merge_candidate_lists(*candidate_lists: list[str], max_items: int = 4) -> list[str]:
    merged: list[str] = []
    for candidate_list in candidate_lists:
        for item in candidate_list:
            if item and item not in merged:
                merged.append(item)
            if len(merged) >= max_items:
                return merged
    return merged


def _top_source_ids(sources: list[dict] | None, max_items: int = 2) -> list[str]:
    if not sources:
        return []
    ids: list[str] = []
    for source in sources:
        source_id = str(source.get("source_id") or "").strip()
        if source_id and source_id not in ids:
            ids.append(source_id)
        if len(ids) >= max_items:
            break
    return ids


def _build_evidence_cards_from_sources(
    sources: list[dict] | None,
    max_items: int = 3,
) -> list[EvidenceCard]:
    if not sources:
        return []

    cards: list[EvidenceCard] = []
    for source in sources[:max_items]:
        if not isinstance(source, dict):
            continue
        source_id = str(source.get("source_id") or "").strip()
        source_url = str(source.get("source_url") or "").strip()
        if not source_id or not source_url:
            continue
        content_type = str(source.get("content_type") or "").strip() or "general"
        cards.append(
            EvidenceCard(
                sourceId=source_id,
                title=_clean_short_phrase(
                    str(source.get("title") or content_type_label(content_type) or "参照資料"),
                    max_len=40,
                ),
                contentType=content_type,
                excerpt=_normalize_excerpt(str(source.get("excerpt") or "").strip(), max_len=84),
                sourceUrl=source_url,
                relevanceLabel=content_type_label(content_type) or "企業情報",
            )
        )
    return cards


def _build_stage_status(conversation_context: dict[str, Any] | None, current_stage: str) -> StageStatus:
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    completed: list[str] = []
    for stage, fact_key in STAGE_CONFIRMED_FACT_KEYS.items():
        if confirmed_facts.get(fact_key, False):
            completed.append(stage)

    pending = [stage for stage in STAGE_ORDER if stage not in completed and stage != current_stage]
    return StageStatus(current=current_stage, completed=completed, pending=pending)


def _build_suggestion_rationale(stage: str, source_type: str) -> str:
    rationale_map = {
        "industry_reason": {
            "company": "業界志望理由を企業接点で補強する候補",
            "gakuchika": "経験から業界関心を説明する候補",
            "profile": "志向や就活軸から業界理由を示す候補",
            "hybrid": "経験と業界関心をつなぐ候補",
            "application_job_type": "志望職種から業界理由へつなぐ候補",
        },
        "company_reason": {
            "company": "企業固有の特徴に直接触れる候補",
            "gakuchika": "過去経験と企業の接点を示す候補",
            "profile": "志望軸との整合を示す候補",
            "hybrid": "企業情報と本人経験を両方使う候補",
            "application_job_type": "応募職種から企業志望理由へつなぐ候補",
        },
        "desired_work": {
            "company": "企業資料の仕事内容に沿った候補",
            "gakuchika": "経験を活かせる仕事へ寄せた候補",
            "profile": "志望職種と整合する仕事候補",
            "hybrid": "仕事内容と本人経験をつなぐ候補",
            "application_job_type": "応募職種から自然に導いた仕事候補",
        },
        "fit_connection": {
            "company": "企業理解を補強しつつ接点を示す候補",
            "gakuchika": "強みや経験を前面に出す候補",
            "profile": "志向や専攻を踏まえた候補",
            "hybrid": "企業と本人の因果接続を作る候補",
            "application_job_type": "職種選択と経験を結びつける候補",
        },
        "differentiation": {
            "company": "この企業ならではの理由を示す候補",
            "gakuchika": "経験から他社差分を語る候補",
            "profile": "自分の志向軸から選ぶ理由を示す候補",
            "hybrid": "企業固有性と本人固有性を同時に出す候補",
            "application_job_type": "職種選択まで含めて差別化する候補",
        },
        "closing": {
            "company": "企業で実現したい姿をまとめる候補",
            "gakuchika": "経験起点の締め候補",
            "profile": "志向を軸にした締め候補",
            "hybrid": "企業理解と経験をまとめる締め候補",
            "application_job_type": "職種軸で締める候補",
        },
    }
    return rationale_map.get(stage, rationale_map["fit_connection"]).get(
        source_type,
        "回答のたたき台として使える候補",
    )


def _decorate_suggestion_option(
    label: str,
    source_type: str,
    intent: str,
    evidence_source_ids: list[str] | None = None,
    *,
    is_tentative: bool = False,
    rationale: str | None = None,
) -> SuggestionOption:
    option = _build_suggestion_option(label, source_type, intent)
    option.evidenceSourceIds = evidence_source_ids or []
    option.rationale = rationale or _build_suggestion_rationale(intent, source_type)
    option.isTentative = is_tentative
    return option


def _normalize_excerpt(text: str, max_len: int = 60) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


def _build_evidence_summary_from_sources(
    sources: list[dict] | None, max_items: int = 2, focus: str | None = None
) -> str | None:
    """Build a compact evidence summary from RAG sources for UI display."""
    if not sources:
        return None

    chips: list[str] = []
    for src in sources:
        if not isinstance(src, dict):
            continue
        source_id = str(src.get("source_id") or "").strip()
        content_type = str(src.get("content_type") or "").strip()
        excerpt = _normalize_excerpt(str(src.get("excerpt") or "").strip(), max_len=56)
        title = _normalize_excerpt(str(src.get("title") or "").strip(), max_len=24)

        prefix = source_id or "S?"
        if content_type:
            prefix = f"{prefix} {content_type}"
        if title:
            prefix = f"{prefix} {title}"

        if excerpt:
            chips.append(f"{prefix}: {excerpt}")
        else:
            chips.append(prefix)

        if len(chips) >= max_items:
            break

    if not chips:
        return None
    summary = " / ".join(chips)
    return f"{focus}: {summary}" if focus else summary


def _question_has_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _normalize_question_focus(stage: str, question_focus: Any, question: str | None = None) -> str:
    allowed = QUESTION_FOCUS_BY_STAGE.get(stage, ())
    focus = str(question_focus or "").strip()
    if focus in allowed:
        return focus
    return _detect_question_focus(stage, question)


def _detect_question_focus(stage: str, question: str | None) -> str:
    text = (question or "").strip()
    if not text:
        allowed = QUESTION_FOCUS_BY_STAGE.get(stage, ())
        return allowed[0] if allowed else "default"

    if stage == "industry_reason":
        if _question_has_any_keyword(text, ("きっかけ", "今", "関心が高ま", "強まり")):
            return "why_industry_now"
        return "industry_axis"

    if stage == "company_reason":
        if _question_has_any_keyword(text, ("なぜ商社", "選択肢", "業界", "多岐", "幅広", "横断")):
            return "industry_axis"
        if _question_has_any_keyword(text, ("なぜ今", "きっかけ", "関心が強", "興味を持っ", "原体験")):
            return "why_industry_now"
        if _question_has_any_keyword(text, ("職種", "役割", "どのような役割", "どんな役割")):
            return "role_value"
        if _question_has_any_keyword(text, ("どの点", "どんな点", "どこに魅力", "惹かれ", "魅力")):
            return "feature_appeal"
        return "axis_match"

    if stage == "desired_work":
        if _question_has_any_keyword(text, ("顧客", "課題", "解決", "向き合")):
            return "customer_problem"
        if _question_has_any_keyword(text, ("価値", "貢献", "成果", "実現")):
            return "value_creation"
        return "work_image"

    if stage == "origin_experience":
        if _question_has_any_keyword(text, ("きっかけ", "原体験", "関心が高ま", "関心を持っ", "今")):
            return "origin_trigger"
        return "experience_detail"

    if stage == "fit_connection":
        if _question_has_any_keyword(text, ("強み", "再現", "活か")):
            return "strength_application"
        if _question_has_any_keyword(text, ("経験", "原体験", "エピソード")):
            return "experience_connection"
        return "experience_connection"

    if stage == "differentiation":
        if _question_has_any_keyword(text, ("職種", "役割", "仕事")):
            return "role_specific_reason"
        return "company_over_others"

    if stage == "closing":
        return "one_line_summary"

    allowed = QUESTION_FOCUS_BY_STAGE.get(stage, ())
    return allowed[0] if allowed else "default"


def _preferred_question_focus_for_turn(
    stage: str,
    *,
    stage_attempt_count: int = 0,
    last_question_meta: dict[str, Any] | None = None,
) -> str | None:
    allowed = QUESTION_FOCUS_BY_STAGE.get(stage, ())
    if not allowed:
        return None
    if stage_attempt_count <= 0:
        return allowed[0]

    previous_focus = ""
    if isinstance(last_question_meta, dict):
        previous_focus = str(last_question_meta.get("question_focus") or "").strip()

    for focus in allowed:
        if focus != previous_focus:
            return focus
    return allowed[0]


def _build_reask_instruction_section(
    stage: str,
    *,
    stage_attempt_count: int = 0,
    last_question_meta: dict[str, Any] | None = None,
) -> str:
    preferred_focus = _preferred_question_focus_for_turn(
        stage,
        stage_attempt_count=stage_attempt_count,
        last_question_meta=last_question_meta,
    )
    previous_focus = ""
    if isinstance(last_question_meta, dict):
        previous_focus = str(last_question_meta.get("question_focus") or "").strip()

    if stage_attempt_count <= 0:
        return (
            "## このターンの focus 指示\n"
            f"- 推奨 question_focus: `{preferred_focus or 'default'}`\n"
            "- まずはこの切り口を優先し、1問1論点で聞いてください。"
        )

    return (
        "## このターンの再深掘り指示\n"
        f"- この段階は再深掘りターンです（再質問回数 {stage_attempt_count}/{MAX_STAGE_REASKS}）\n"
        f"- 前回の question_focus: `{previous_focus or 'unknown'}`\n"
        f"- 今回の推奨 question_focus: `{preferred_focus or 'default'}`\n"
        "- 前回と同じ切り口・同じ聞き方を繰り返さないこと\n"
        "- 同じ論点を別の角度から、自然な1問に言い換えること"
    )


def _looks_like_multi_part_question(question: str) -> bool:
    normalized = " ".join((question or "").split())
    if normalized.count("？") + normalized.count("?") >= 2:
        return True
    return any(token in normalized for token in ("また、", "それとも", "何ですか？なぜ", "理由と"))


def _looks_like_instructional_prompt(question: str) -> bool:
    normalized = " ".join((question or "").split())
    return any(
        token in normalized for token in ("1文で答える", "そのまま入力", "候補を選ぶ", "入力してください", "答えてください")
    )


def _looks_like_instruction_or_ui_copy(question: str) -> bool:
    normalized = " ".join((question or "").split())
    if any(token in normalized for token in QUESTION_INSTRUCTION_BLOCKLIST):
        return True
    if normalized and not normalized.endswith(("?", "？")):
        return True
    return False


def _mentions_other_company_name(text: str, company_name: str) -> bool:
    normalized = " ".join((text or "").split())
    target = (company_name or "").strip()
    if not normalized or not target:
        return False
    if target in normalized or "御社" in normalized or "貴社" in normalized:
        return False
    if re.search(r"(株式会社|有限会社|合同会社|ホールディングス|カンパニー)", normalized):
        return True
    leading_anchor = re.match(r"^([^\s、。]{2,40})の", normalized)
    if not leading_anchor:
        return False
    anchor = leading_anchor.group(1)
    if anchor in {"この企業", "この会社", "当社", "御社", "貴社"}:
        return False
    return True


def _question_uses_unconfirmed_premise(
    *,
    question: str,
    stage: str,
    selected_role: str | None,
    desired_work: str | None,
    confirmed_facts: dict[str, bool] | None,
) -> bool:
    normalized = " ".join((question or "").split())
    if confirmed_facts is None:
        return False
    confirmed = _normalize_confirmed_facts(confirmed_facts)
    if stage == "company_reason" and not confirmed["company_reason_confirmed"]:
        if any(pattern in normalized for pattern in PREMISE_ASSERTIVE_PATTERNS):
            if selected_role and selected_role in normalized:
                return True
            if "御社の" in normalized or "弊社の" in normalized:
                return True
    if stage == "desired_work" and not confirmed["desired_work_confirmed"]:
        if desired_work and desired_work in normalized and any(
            pattern in normalized for pattern in PREMISE_ASSERTIVE_PATTERNS
        ):
            return True
    return False


def _build_question_fallback_candidates(
    *,
    stage: str,
    company_name: str,
    selected_industry: str | None,
    selected_role: str | None,
    desired_work: str | None,
    grounded_company_anchor: str | None,
    gakuchika_episode: str | None,
    gakuchika_strength: str | None,
    confirmed_facts: dict[str, bool] | None = None,
) -> list[str]:
    confirmed = _normalize_confirmed_facts(confirmed_facts) if confirmed_facts is not None else None
    if stage == "industry_reason":
        if selected_industry:
            return [f"{selected_industry}業界を志望する理由を1つ教えてください。"]
        return ["この業界を志望する理由を1つ教えてください。"]

    if stage == "company_reason":
        if selected_role and confirmed is not None and not confirmed["company_reason_confirmed"]:
            return [
                f"{company_name}で{selected_role}という選択肢に興味を持つとしたら、どんな点が気になりますか？",
                f"{company_name}で{selected_role}を選ぶとしたら、どんな理由が考えられそうですか？",
                f"{company_name}で{selected_role}として働くイメージを持てる点はありますか？",
            ]
        if grounded_company_anchor:
            return [
                f"{company_name}の{grounded_company_anchor}に惹かれた理由を1つ教えてください。",
                f"{company_name}の{grounded_company_anchor}のどこに魅力を感じますか？",
                f"{company_name}の{grounded_company_anchor}がご自身の軸と重なる点はどこですか？",
            ]
        if selected_role:
            return [
                f"{company_name}で{selected_role}を選ぶ理由を1つ教えてください。",
                f"{company_name}で{selected_role}に関心を持つ点を1つ教えてください。",
            ]
        return [
            f"{company_name}を志望する理由を1つ教えてください。",
            f"{company_name}に惹かれる点を1つ教えてください。",
        ]

    if stage == "desired_work":
        if selected_role and desired_work:
            return [
                f"入社後、{selected_role}として{desired_work}の中で特に挑戦したいことは何ですか？",
                f"入社後、{selected_role}として{desired_work}にどう関わりたいですか？",
            ]
        if selected_role:
            return [
                f"入社後、{selected_role}としてどんな仕事に挑戦したいですか？",
                f"入社後、{selected_role}としてどんな役割を担いたいですか？",
            ]
        return [
            "入社後にどんな仕事へ挑戦したいですか？",
            "入社後にどんな役割を担いたいですか？",
        ]

    if stage == "origin_experience":
        if gakuchika_episode:
            return [
                f"{gakuchika_episode}の経験を通じて、その仕事への関心が強まったきっかけは何ですか？",
                f"{gakuchika_episode}の経験のどんな場面が、今の関心につながっていますか？",
            ]
        if desired_work:
            return [
                f"{desired_work}に関心を持つようになった原体験は何ですか？",
                f"{desired_work}に近いことへ興味を持ったきっかけは何ですか？",
            ]
        return [
            "その仕事に関心を持つようになった原体験は何ですか？",
            "今の関心につながるきっかけは何ですか？",
        ]

    if stage == "fit_connection":
        if gakuchika_episode and desired_work:
            return [
                f"{gakuchika_episode}の経験は、{desired_work}にどう活かせますか？",
                f"{gakuchika_episode}の経験は、{desired_work}とどこでつながりますか？",
            ]
        if gakuchika_strength and selected_role:
            return [
                f"{gakuchika_strength}は、{selected_role}の仕事でどう活かせますか？",
                f"{gakuchika_strength}は、{selected_role}で価値を出す場面とどうつながりますか？",
            ]
        return [
            "これまでの経験は、その仕事にどうつながりますか？",
            "これまでの経験のどの部分が、その仕事で活きそうですか？",
        ]

    if stage == "differentiation":
        if grounded_company_anchor:
            return [
                f"同業他社ではなく、{company_name}の{grounded_company_anchor}を選ぶ理由は何ですか？",
                f"同業他社と比べて、{company_name}の{grounded_company_anchor}に惹かれる理由は何ですか？",
            ]
        if selected_role:
            return [
                f"同業他社ではなく、{company_name}で{selected_role}を目指す理由は何ですか？",
                f"同業他社と比べて、{company_name}で{selected_role}に惹かれる理由は何ですか？",
            ]
        return [
            f"同業他社ではなく、{company_name}を選ぶ理由は何ですか？",
            f"同業他社と比べて、{company_name}に惹かれる理由は何ですか？",
        ]

    if desired_work:
        return [
            f"最後に、{company_name}で{desired_work}を通じて実現したいことを一言でまとめると何ですか？",
            f"最後に、{company_name}で目指したいことを一言でまとめると何ですか？",
        ]
    return [f"最後に、{company_name}で実現したいことを一言でまとめると何ですか？"]


def _build_question_fallback(
    *,
    stage: str,
    company_name: str,
    selected_industry: str | None,
    selected_role: str | None,
    desired_work: str | None,
    grounded_company_anchor: str | None,
    gakuchika_episode: str | None,
    gakuchika_strength: str | None,
    confirmed_facts: dict[str, bool] | None = None,
    used_signatures: set[str] | None = None,
) -> str:
    candidates = _build_question_fallback_candidates(
        stage=stage,
        company_name=company_name,
        selected_industry=selected_industry,
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=grounded_company_anchor,
        gakuchika_episode=gakuchika_episode,
        gakuchika_strength=gakuchika_strength,
        confirmed_facts=confirmed_facts,
    )
    used = used_signatures or set()
    for candidate in candidates:
        if _question_signature(candidate) not in used:
            return candidate
    return candidates[0]


def _validate_or_repair_question(
    *,
    question: str,
    stage: str,
    company_name: str,
    selected_industry: str | None = None,
    selected_role: str | None,
    desired_work: str | None,
    grounded_company_anchor: str | None,
    gakuchika_episode: str | None,
    gakuchika_strength: str | None,
    confirmed_facts: dict[str, bool] | None = None,
) -> str:
    normalized = " ".join((question or "").split())
    fallback = _build_question_fallback(
        stage=stage,
        company_name=company_name,
        selected_industry=selected_industry,
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=grounded_company_anchor,
        gakuchika_episode=gakuchika_episode,
        gakuchika_strength=gakuchika_strength,
        confirmed_facts=confirmed_facts,
    )
    if not normalized:
        return fallback
    if any(token in normalized for token in GENERIC_QUESTION_BLOCKLIST):
        return fallback
    if _looks_like_instruction_or_ui_copy(normalized):
        return fallback
    if _looks_like_multi_part_question(normalized):
        return fallback
    if stage in {"company_reason", "differentiation", "closing"} and _mentions_other_company_name(normalized, company_name):
        return fallback
    if _question_uses_unconfirmed_premise(
        question=normalized,
        stage=stage,
        selected_role=selected_role,
        desired_work=desired_work,
        confirmed_facts=confirmed_facts,
    ):
        return fallback
    if len(normalized) > 80:
        return fallback
    if not any(keyword in normalized for keyword in QUESTION_KEYWORDS_BY_STAGE.get(stage, ())):
        return fallback
    if stage == "industry_reason" and "業界" not in normalized:
        return fallback
    if stage == "company_reason" and normalized.startswith("入社後"):
        return fallback
    if stage == "desired_work" and "入社後" not in normalized:
        return fallback
    if stage == "origin_experience" and not any(token in normalized for token in ("経験", "原体験", "きっかけ")):
        return fallback
    if stage == "differentiation" and "他社" not in normalized and "違い" not in normalized:
        return fallback
    if stage == "closing" and not any(token in normalized for token in ("一言", "まとめ", "端的")):
        return fallback
    return normalized


def _question_signature(text: str) -> str:
    return re.sub(r"[\s、。・/／!?？「」（）\-\u3000]", "", (text or "").strip())


def _suggestion_signature(text: str) -> str:
    normalized = " ".join((text or "").split()).strip()
    for token in (
        "です。",
        "です",
        "ます。",
        "ます",
        "と感じています。",
        "と感じています",
        "と感じました。",
        "と感じました",
        "と考えています。",
        "と考えています",
        "ためです。",
        "ためです",
    ):
        normalized = normalized.replace(token, "")
    return re.sub(r"[\s、。・/／!?？「」（）\-\u3000]", "", normalized)


def _rotate_question_focus_for_reask(
    *,
    stage: str,
    question_focus: str,
    conversation_context: dict[str, Any] | None,
) -> str:
    allowed = QUESTION_FOCUS_BY_STAGE.get(stage, ())
    if question_focus not in allowed:
        return question_focus
    context = _normalize_conversation_context(conversation_context)
    if int(context.get("stageAttemptCount") or 0) <= 0:
        return question_focus
    last_meta = context.get("lastQuestionMeta") or {}
    if str(last_meta.get("question_stage") or "").strip() != stage:
        return question_focus
    previous_focus = str(last_meta.get("question_focus") or "").strip()
    if not previous_focus or previous_focus != question_focus:
        return question_focus
    for focus in allowed:
        if focus != previous_focus:
            return focus
    return question_focus


def _ensure_distinct_question(
    *,
    question: str,
    stage: str,
    conversation_history: list[Any],
    company_name: str,
    selected_industry: str | None,
    selected_role: str | None,
    desired_work: str | None,
    grounded_company_anchor: str | None,
    gakuchika_episode: str | None,
    gakuchika_strength: str | None,
    confirmed_facts: dict[str, bool] | None = None,
    last_question_meta: dict[str, Any] | None = None,
) -> str:
    candidate = " ".join((question or "").split())
    if not candidate:
        return _build_question_fallback(
            stage=stage,
            company_name=company_name,
            selected_industry=selected_industry,
            selected_role=selected_role,
            desired_work=desired_work,
            grounded_company_anchor=grounded_company_anchor,
            gakuchika_episode=gakuchika_episode,
            gakuchika_strength=gakuchika_strength,
        )

    assistant_signatures: set[str] = set()
    for message in reversed(conversation_history or []):
        role = getattr(message, "role", None)
        content = getattr(message, "content", None)
        if isinstance(message, dict):
            role = message.get("role")
            content = message.get("content")
        if role == "assistant" and isinstance(content, str) and content.strip():
            assistant_signatures.add(_question_signature(content.strip()))

    if isinstance(last_question_meta, dict):
        signature = str(last_question_meta.get("question_signature") or "").strip()
        if signature:
            assistant_signatures.add(signature)

    if assistant_signatures and _question_signature(candidate) in assistant_signatures:
        return _build_question_fallback(
            stage=stage,
            company_name=company_name,
            selected_industry=selected_industry,
            selected_role=selected_role,
            desired_work=desired_work,
            grounded_company_anchor=grounded_company_anchor,
            gakuchika_episode=gakuchika_episode,
            gakuchika_strength=gakuchika_strength,
            confirmed_facts=confirmed_facts,
            used_signatures=assistant_signatures,
        )

    return candidate


def _extract_explicit_company_name(text: str) -> str | None:
    normalized = " ".join((text or "").split()).strip()
    if not normalized:
        return None
    pattern = re.compile(r"((?:株式会社|有限会社|合同会社)[^\s、。]{1,40}|[^\s、。]{1,40}(?:株式会社|有限会社|合同会社|ホールディングス|カンパニー))")
    match = pattern.search(normalized)
    if match:
        return match.group(1)
    leading_anchor = re.match(r"^([^\s、。]{2,40})の", normalized)
    if leading_anchor:
        anchor = leading_anchor.group(1)
        if anchor not in {"この企業", "この会社", "当社", "御社", "貴社"}:
            return anchor
    return None


def _rewrite_preserves_suggestion_facts(
    *,
    original_label: str,
    rewritten_label: str,
    question: str,
) -> bool:
    allowed_company = _extract_explicit_company_name(question)
    if allowed_company and _mentions_other_company_name(rewritten_label, allowed_company):
        return False
    if not allowed_company:
        original_company = _extract_explicit_company_name(original_label)
        if original_company and _mentions_other_company_name(rewritten_label, original_company):
            return False
    return True


def _format_industry_axis(profile_industries: list[str]) -> str:
    cleaned = [industry for industry in profile_industries if industry][:2]
    if len(cleaned) >= 2:
        return f"{cleaned[0]}や{cleaned[1]}"
    if cleaned:
        return cleaned[0]
    return "複数の業界"


def _is_noisy_suggestion_label(label: str) -> bool:
    if not label or label in GENERIC_OPTION_BLOCKLIST:
        return True
    if _is_noisy_company_text(label):
        return True
    return any(token in label for token in ("見出し", "Q1", "Q2", "Q3", "Q4", "ご紹介します"))


def _is_direct_answer_label(label: str, stage: str) -> bool:
    if any(token in label for token in ("教えてください", "答える", "入力してください", "候補を選ぶ", "何ですか？", "ですか？")):
        return False
    required_terms = DIRECT_ANSWER_REQUIRED_TERMS.get(stage, ())
    if not required_terms:
        return True
    return any(term in label for term in required_terms)


def _suggestion_signature(label: str) -> str:
    normalized = " ".join((label or "").split()).strip()
    normalized = re.sub(r"(と感じ(ま)?す|ため(です)?|と思(いま)?す|と考え(てい)?ます)$", "", normalized)
    normalized = re.sub(r"(です|ます)$", "", normalized)
    return re.sub(r"[\s、。・/／!?？「」（）\-\u3000]", "", normalized)


def _score_suggestion_question_fit(
    label: str,
    *,
    stage: str,
    focus: str,
    selected_role: str | None,
    desired_work: str | None,
) -> int:
    score = 2
    keywords = QUESTION_FIT_KEYWORDS.get((stage, focus), ())
    if keywords:
        score += 3 if any(keyword in label for keyword in keywords) else -2

    if stage == "industry_reason":
        if "業界" in label or "産業" in label:
            score += 2
    elif stage == "company_reason":
        if label.startswith("入社後は"):
            score -= 4
        else:
            score += 1
        if selected_role and selected_role in label:
            score += 2
    elif stage == "desired_work":
        if label.startswith("入社後は"):
            score += 2
        else:
            score -= 3
    elif stage == "origin_experience" and any(token in label for token in ("経験", "原体験", "きっかけ", "通じて")):
        score += 2
    elif stage == "fit_connection" and any(token in label for token in ("経験", "培った", "活か", "つなが", "再現")):
        score += 2
    elif stage == "differentiation" and focus == "company_over_others" and "他社" in label:
        score += 2
    elif stage == "closing" and any(token in label for token in ("貢献", "価値", "実現", "目指")):
        score += 1

    if selected_role and selected_role in label:
        score += 1
    if desired_work and desired_work in label and stage in ("fit_connection", "differentiation", "closing"):
        score += 1
    return score


def _finalize_suggestion_options(
    options: list[SuggestionOption],
    *,
    stage: str,
    focus: str,
    selected_role: str | None = None,
    desired_work: str | None = None,
    max_items: int = 4,
    hard_min_items: int = 2,
) -> list[SuggestionOption]:
    scored_options: list[tuple[int, SuggestionOption]] = []
    for option in options:
        if not isinstance(option, SuggestionOption):
            continue
        label = _clean_short_phrase(option.label, max_len=68)
        if len(label) < 10:
            continue
        if _is_noisy_suggestion_label(label):
            continue
        if not _is_direct_answer_label(label, stage):
            continue
        option.label = label
        scored_options.append(
            (
                _score_suggestion_question_fit(
                    label,
                    stage=stage,
                    focus=focus,
                    selected_role=selected_role,
                    desired_work=desired_work,
                ),
                option,
            )
        )

    scored_options.sort(key=lambda item: item[0], reverse=True)

    output: list[SuggestionOption] = []
    seen_labels: set[str] = set()
    seen_signatures: set[str] = set()
    thresholds = (5, 3, 1) if focus != "default" else (4, 2, 1)

    for threshold in thresholds:
        for score, option in scored_options:
            label = option.label
            if score < threshold or label in seen_labels:
                continue
            signature = _suggestion_signature(label)
            if signature in seen_signatures:
                continue
            option.id = re.sub(r"[^a-z0-9]+", "-", f"{option.intent}-{label.lower()}").strip("-")[:48] or option.intent
            output.append(option)
            seen_labels.add(label)
            seen_signatures.add(signature)
            if len(output) >= max_items:
                return output
            if len(output) >= hard_min_items and threshold != thresholds[0]:
                return output
        if len(output) >= hard_min_items:
            break

    return output


def _build_low_grounding_fallback_suggestions(
    *,
    stage: str,
    company_name: str,
    selected_industry: str | None,
    selected_role: str | None,
) -> list[str]:
    if stage == "industry_reason":
        industry = selected_industry or "この業界"
        return [
            f"{industry}なら、自分の関心を仕事に結びつけやすいと感じるためです。",
            f"{industry}は、関心のある課題に継続して向き合えると考えたためです。",
        ]
    if stage == "company_reason":
        return [
            f"{company_name}は、自分の関心や就活軸と重なる点があると感じたためです。",
            f"{company_name}なら、関心のあるテーマにより近い形で関われそうだと感じたためです。",
        ]
    if stage == "desired_work":
        role_prefix = f"{selected_role}として、" if selected_role else ""
        return [
            f"入社後は{role_prefix}相手の課題に向き合える仕事に取り組みたいです。",
            f"入社後は{role_prefix}価値を出せる役割に挑戦したいです。",
        ]
    if stage == "origin_experience":
        return [
            "これまでに相手の課題に向き合った経験が、今の志望につながっています。",
            "過去に手応えを感じた経験が、今の関心の原点になっています。",
        ]
    if stage == "fit_connection":
        return [
            "これまでの経験で培った視点は、入社後の仕事でも活かせると考えています。",
            "過去の経験で身につけた力が、志望している仕事につながると考えています。",
        ]
    if stage == "differentiation":
        return [
            f"他社と比べても、{company_name}が自分の軸に最も合うと感じたためです。",
            f"他社よりも、{company_name}のほうが自分の志向と仕事のイメージが重なるためです。",
        ]
    return [
        f"{company_name}で自分らしい価値を出していきたいです。",
        "自分の強みを仕事につなげながら価値を出したいです。",
    ]


def _build_stage_specific_suggestion_options(
    *,
    stage: str,
    question: str,
    question_focus: str | None = None,
    company_name: str,
    company_context: str,
    company_sources: list[dict] | None,
    gakuchika_context: list[dict] | None,
    profile_context: dict[str, Any] | None,
    application_job_candidates: list[str] | None,
    company_role_candidates: list[str] | None,
    company_work_candidates: list[str] | None,
    conversation_context: dict[str, Any] | None,
) -> list[SuggestionOption]:
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    selected_role_from_context = context["selectedRole"]
    features = _extract_company_features(company_context, company_sources, max_features=4)
    role_candidates = _merge_candidate_lists(
        application_job_candidates or [],
        company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        _sanitize_existing_grounding_candidates(company_work_candidates, max_items=4, max_len=32),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=selected_role_from_context,
            max_items=4,
        ),
        max_items=4,
    )
    gakuchika_strength = _extract_gakuchika_strength(gakuchika_context)
    gakuchika_episode = _extract_gakuchika_episode(gakuchika_context)
    profile_job_types = _extract_profile_job_types(profile_context)
    profile_industries = _extract_profile_industries(profile_context)
    profile_anchor = _extract_profile_anchor(profile_context)
    source_ids = _top_source_ids(company_sources, max_items=2)
    focus = _normalize_question_focus(stage, question_focus, question)

    feature1 = features[0] if features else None
    feature2 = features[1] if len(features) > 1 else feature1
    application_role = (application_job_candidates or [None])[0]
    selected_role = selected_role_from_context or application_role
    fallback_work = _fallback_work_for_role(selected_role) if selected_role else None
    work1 = work_candidates[0] if work_candidates else fallback_work
    work2 = work_candidates[1] if len(work_candidates) > 1 else fallback_work
    confirmed_industry_reason = context["industryReason"] if confirmed_facts["industry_reason_confirmed"] else None
    confirmed_company_reason = context["companyReason"] if confirmed_facts["company_reason_confirmed"] else None
    confirmed_desired_work = context["desiredWork"] if confirmed_facts["desired_work_confirmed"] else None
    confirmed_origin_experience = (
        context["originExperience"] if confirmed_facts["origin_experience_confirmed"] else None
    )
    desired_work = confirmed_desired_work
    industry_axis = _format_industry_axis(profile_industries)
    has_multi_industry_axis = len(profile_industries) >= 2

    def option(
        label: str,
        source_type: str,
        *,
        include_company_evidence: bool = False,
        is_tentative: bool = False,
        rationale: str | None = None,
    ) -> SuggestionOption:
        return _decorate_suggestion_option(
            label,
            source_type,
            stage,
            source_ids if include_company_evidence else [],
            is_tentative=is_tentative,
            rationale=rationale,
        )

    def finalize_options() -> list[SuggestionOption]:
        finalized = _finalize_suggestion_options(
            options,
            stage=stage,
            focus=focus,
            selected_role=selected_role,
            desired_work=desired_work,
        )
        if len(finalized) >= 2:
            return finalized

        existing_signatures = {_suggestion_signature(item.label) for item in finalized}
        for label in _build_low_grounding_fallback_suggestions(
            stage=stage,
            company_name=company_name,
            selected_industry=context["selectedIndustry"],
            selected_role=selected_role,
        ):
            signature = _suggestion_signature(label)
            if signature in existing_signatures:
                continue
            finalized.append(
                _decorate_suggestion_option(
                    label,
                    "profile",
                    stage,
                    source_ids if stage in {"company_reason", "differentiation"} and has_company_evidence else [],
                    is_tentative=stage == "desired_work",
                )
            )
            existing_signatures.add(signature)
            if len(finalized) >= 2:
                break

        return finalized[:4]

    options: list[SuggestionOption] = []
    grounded_company_anchor = feature1 or (work_candidates[0] if work_candidates else None)
    secondary_company_anchor = feature2 or grounded_company_anchor
    has_company_evidence = bool(grounded_company_anchor)
    company_reason_anchor = (
        grounded_company_anchor
        if grounded_company_anchor and grounded_company_anchor not in set(work_candidates)
        else None
    )
    role_based_source = (
        "application_job_type"
        if application_role and application_role == selected_role
        else "profile"
    )
    question = _validate_or_repair_question(
        question=question,
        stage=stage,
        company_name=company_name,
        selected_industry=context["selectedIndustry"],
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=grounded_company_anchor,
        gakuchika_episode=gakuchika_episode,
        gakuchika_strength=gakuchika_strength,
        confirmed_facts=confirmed_facts,
    )

    if stage == "industry_reason":
        selected_industry = context["selectedIndustry"] or industry_axis
        if focus == "why_industry_now":
            if gakuchika_episode:
                options.append(
                    option(
                        f"{gakuchika_episode}を通じて{selected_industry}業界への関心が強まったため",
                        "gakuchika",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として幅広い課題に向き合える点から、{selected_industry}業界への関心が高まったため",
                        "profile",
                    )
                )
        if has_multi_industry_axis:
            options.append(
                option(
                    f"{industry_axis}に関心がある中でも、複数の課題に関われる{selected_industry}業界に魅力を感じるため",
                    "profile",
                )
            )
        if gakuchika_strength:
            options.append(
                option(
                    f"{gakuchika_strength}を活かして多様な課題解決に関わりたいので、{selected_industry}業界を志望している",
                    "gakuchika",
                )
            )
        return finalize_options()

    if stage == "company_reason":
        if focus == "industry_axis":
            if confirmed_industry_reason:
                options.append(
                    option(
                        f"{confirmed_industry_reason}という軸と、この企業で働く方向性が重なると感じるためです。",
                        "profile",
                    )
                )
            if has_multi_industry_axis:
                options.append(
                    option(
                        f"{industry_axis}に関心がある中でも、複数の産業や課題に向き合える点に魅力を感じたためです。",
                        "profile",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として複数の産業や事業を横断して関われる選択肢だと感じたためです。",
                        "profile",
                    )
                )
        elif focus == "why_industry_now":
            if confirmed_industry_reason:
                options.append(
                    option(
                        f"{confirmed_industry_reason}と感じるようになり、この企業への関心も強まったためです。",
                        "profile",
                    )
                )
            if gakuchika_episode:
                options.append(
                    option(
                        f"{gakuchika_episode}を通じて課題解決への関心が強まり、この企業にも惹かれるようになりました。",
                        "gakuchika",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}という方向で考えたことで、自分の志望理由がより具体化し、関心が強まったためです。",
                        "profile",
                    )
                )
            if company_reason_anchor:
                options.append(
                    option(
                        f"{company_reason_anchor}に関われると知り、今の関心がさらに強まったためです。",
                        "company",
                        include_company_evidence=True,
                    )
                )
        elif focus == "role_value":
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として自分なりの価値を出すイメージを持てたためです。",
                        role_based_source,
                    )
                )
            if selected_role and confirmed_industry_reason:
                options.append(
                    option(
                        f"{selected_role}という役割が、自分の関心や就活軸と重なると感じたためです。",
                        "profile",
                    )
                )
            if gakuchika_strength and selected_role:
                options.append(
                    option(
                        f"{gakuchika_strength}を活かしながら{selected_role}で価値を出せると感じたためです。",
                        "hybrid" if has_company_evidence else "gakuchika",
                        include_company_evidence=has_company_evidence,
                    )
                )
        elif focus == "feature_appeal":
            if confirmed_company_reason:
                options.append(
                    option(
                        confirmed_company_reason,
                        "hybrid" if gakuchika_strength else "profile",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として働くイメージを持てる点が、自分の志向と合うためです。",
                        "profile",
                    )
                )
        elif focus == "axis_match":
            if confirmed_industry_reason:
                options.append(
                    option(
                        f"{confirmed_industry_reason}という就活軸を、この企業でより実現できると感じたためです。",
                        "profile",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として向き合いたいテーマと、この企業の方向性が重なると感じたためです。",
                        "profile",
                    )
                )
            if company_reason_anchor:
                options.append(
                    option(
                        f"{company_reason_anchor}のように産業や事業を横断して価値を出せる点に魅力を感じたためです。",
                        "company",
                        include_company_evidence=True,
                    )
                )

        if confirmed_company_reason:
            options.append(
                option(
                    confirmed_company_reason,
                    "profile",
                )
            )
        if gakuchika_episode and gakuchika_strength:
            options.append(
                option(
                    f"{gakuchika_episode}で培った{gakuchika_strength}を、この企業でも活かせると感じるためです。",
                    "gakuchika",
                )
            )
        if selected_role and focus not in {"industry_axis", "why_industry_now"}:
            options.append(
                option(
                    (
                        f"{selected_role}として複数の産業に関われる働き方が、自分の就活軸と合うと感じたためです。"
                        if focus == "industry_axis"
                        else f"{selected_role}という方向で考えたときに、自分の就活軸と合うと感じたためです。"
                    ),
                    "profile",
                )
            )
        if selected_role and focus != "industry_axis":
            options.append(
                option(
                    (
                        f"{selected_role}としてどんな価値を出したいかが見え、志望度が高まったためです。"
                        if focus == "why_industry_now"
                        else f"{selected_role}としてどんな価値を出したいかを描きやすかったためです。"
                    ),
                    role_based_source,
                )
            )
        return finalize_options()

    if stage == "desired_work":
        if focus == "customer_problem":
            if selected_role:
                options.append(
                    option(
                        f"入社後は{selected_role}として、相手の課題を整理しながら解決に近づける仕事がしたいです。",
                        role_based_source,
                        is_tentative=True,
                    )
                )
            if gakuchika_episode:
                options.append(
                    option(
                        f"入社後は、{gakuchika_episode}で向き合ったように、相手の課題を言語化して提案できる仕事がしたいです。",
                        "gakuchika",
                        is_tentative=True,
                    )
                )
        elif focus == "value_creation":
            if selected_role:
                options.append(
                    option(
                        f"入社後は{selected_role}として、相手の意思決定や前進を後押しできる仕事がしたいです。",
                        role_based_source,
                        is_tentative=True,
                    )
                )
            if gakuchika_strength:
                options.append(
                    option(
                        f"入社後は{gakuchika_strength}を活かして、周囲を巻き込みながら改善を進める仕事がしたいです。",
                        "gakuchika",
                        is_tentative=True,
                    )
                )
        elif focus == "work_image":
            if selected_role:
                options.append(
                    option(
                        f"入社後は{selected_role}として、現場や顧客に近い立場で課題解決に関わる仕事がしたいです。",
                        role_based_source,
                        is_tentative=True,
                    )
                )
            if gakuchika_episode:
                options.append(
                    option(
                        f"入社後は、{gakuchika_episode}で得た経験を活かしながら、相手に向き合う仕事に挑戦したいです。",
                        "gakuchika",
                        is_tentative=True,
                    )
                )

        if selected_role:
            options.append(
                option(
                    f"入社後は{selected_role}として、自分の強みを活かしながら価値を出せる仕事に挑戦したいです。",
                    role_based_source,
                    is_tentative=True,
                )
            )
        if gakuchika_episode:
            options.append(
                option(
                    f"入社後は、{gakuchika_episode}の経験を活かせる仕事に取り組みたいです。",
                    "gakuchika",
                    is_tentative=True,
                )
            )
        if selected_role:
            options.append(
                option(
                    f"入社後は{selected_role}として、現場や顧客に近い立場で改善を進めたいです。",
                    role_based_source,
                    is_tentative=True,
                )
            )
        if gakuchika_strength:
            options.append(
                option(
                    f"入社後は{gakuchika_strength}を活かして、相手の課題解決に貢献できる仕事がしたいです。",
                    "gakuchika",
                    is_tentative=True,
                )
            )
        return finalize_options()

    if stage == "origin_experience":
        if focus == "origin_trigger":
            if gakuchika_episode and confirmed_desired_work:
                options.append(
                    option(
                        f"{gakuchika_episode}を通じて、{confirmed_desired_work}のような仕事に関心を持つようになりました。",
                        "gakuchika",
                    )
                )
        if gakuchika_episode:
            options.append(
                option(
                    f"{gakuchika_episode}で相手の課題に向き合った経験が、今の志望につながっている",
                    "gakuchika",
                )
            )
        if gakuchika_strength:
            options.append(
                option(
                    f"{gakuchika_strength}を発揮できた経験を通じて、この仕事への関心が強まった",
                    "gakuchika",
                )
            )
        if confirmed_desired_work:
            options.append(
                option(
                    f"{confirmed_desired_work}に近いことへ手応えを感じた経験があり、それが志望の原点になっています。",
                    "profile",
                )
            )
        return finalize_options()

    if stage == "fit_connection":
        if focus == "strength_application":
            if gakuchika_strength and selected_role:
                options.append(
                    option(
                        f"{gakuchika_strength}は、{selected_role}として周囲を巻き込みながら進める場面で活かせると考えています。",
                        "gakuchika",
                    )
                )
            if gakuchika_episode and confirmed_desired_work:
                options.append(
                    option(
                        f"{gakuchika_episode}での経験が、{confirmed_desired_work}につながると考えています。",
                        "gakuchika",
                    )
                )
        elif focus == "experience_connection":
            if gakuchika_episode and gakuchika_strength and selected_role:
                options.append(
                    option(
                        f"{gakuchika_episode}で培った{gakuchika_strength}を、{selected_role}で活かせると考えています。",
                        "gakuchika",
                    )
                )
            if selected_role and confirmed_desired_work:
                options.append(
                    option(
                        f"{selected_role}として{confirmed_desired_work}に取り組む際に、自分の経験が活きると考えています。",
                        role_based_source,
                    )
                )

        if gakuchika_episode and gakuchika_strength and selected_role:
            options.append(
                option(
                    f"{gakuchika_episode}で培った{gakuchika_strength}を、{selected_role}で活かせると考えています。",
                    "gakuchika",
                )
            )
        if selected_role and confirmed_desired_work:
            options.append(
                option(
                    f"{selected_role}として{confirmed_desired_work}に取り組む際に、自分の経験が活きると考えています。",
                    role_based_source,
                )
            )
        if profile_anchor and selected_role:
            options.append(
                option(
                    f"{profile_anchor}で培った視点も、{selected_role}で価値を出す上でつながっていると考えています。",
                    "profile",
                )
            )
        return finalize_options()

    if stage == "differentiation":
        if focus == "company_over_others":
            if confirmed_company_reason:
                options.append(
                    option(
                        f"{confirmed_company_reason}と感じており、その点が他社より自分の軸に合うためです。",
                        "profile",
                    )
                )
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として価値を出すイメージを最も具体的に持てるためです。",
                        role_based_source,
                    )
                )
            if gakuchika_episode:
                options.append(
                    option(
                        f"{gakuchika_episode}の経験を最も自然に活かせるのが{company_name}だと感じるためです。",
                        "hybrid" if has_company_evidence else "gakuchika",
                        include_company_evidence=has_company_evidence,
                    )
                )
        elif focus == "role_specific_reason":
            if selected_role:
                options.append(
                    option(
                        f"{selected_role}として働く方向が、自分の就活軸に最も合うためです。",
                        role_based_source,
                    )
                )
            if gakuchika_strength and selected_role:
                options.append(
                    option(
                        f"{gakuchika_strength}を活かしながら{selected_role}で価値を出す姿が描きやすいためです。",
                        "gakuchika",
                    )
                )

        if confirmed_company_reason:
            options.append(
                option(
                    f"{confirmed_company_reason}と感じており、それが自分の軸に最も合うためです。",
                    "profile",
                )
            )
        if gakuchika_episode:
            options.append(
                option(
                    f"{gakuchika_episode}の経験を{company_name}で最も再現しやすいと感じるためです。",
                    "hybrid" if has_company_evidence else "gakuchika",
                    include_company_evidence=has_company_evidence,
                )
            )
        if selected_role and confirmed_desired_work:
            options.append(
                option(
                    f"{selected_role}と{confirmed_desired_work}の両方を具体的に描ける点で、自分に合うと感じています。",
                    role_based_source,
                )
            )
        if has_multi_industry_axis:
            options.append(
                option(
                    f"{industry_axis}に関心がある中でも、{company_name}は複数の産業と接点を持てる点が自分の軸に最も合うため",
                    "profile",
                )
            )
        return finalize_options()

    if stage == "closing":
        if focus == "one_line_summary":
            if selected_role and confirmed_desired_work:
                options.append(
                    option(
                        f"{selected_role}として{confirmed_desired_work}を通じて価値を出したいです。",
                        role_based_source,
                    )
                )
            if gakuchika_strength and selected_role:
                options.append(
                    option(
                        f"{gakuchika_strength}を活かして{selected_role}で価値を出したい",
                        "hybrid" if has_company_evidence else "gakuchika",
                        include_company_evidence=has_company_evidence,
                    )
                )

        if selected_role and confirmed_company_reason:
            options.append(
                option(
                    f"{selected_role}として、自分らしい価値を出せる環境だと感じています。",
                    "profile",
                )
            )
        if gakuchika_strength:
            options.append(
                option(
                    f"{gakuchika_strength}を軸に成果を出したい",
                    "gakuchika",
                )
            )
        if confirmed_desired_work:
            options.append(
                option(
                    f"{confirmed_desired_work}を形にして価値を出したいです。",
                    role_based_source,
                )
            )
        if selected_role:
            options.append(
                option(
                    f"{company_name}で{selected_role}の専門性を磨きたい",
                    "profile",
                )
            )
        return finalize_options()

    options = [
        option(
            f"{gakuchika_episode}の経験を今後の仕事にも結びつけたいと考えています。",
            "gakuchika",
        ) if gakuchika_episode else None,
        option(
            f"{selected_role}で{gakuchika_strength}を再現したい",
            "gakuchika",
        ) if selected_role and gakuchika_strength else None,
        option(
            f"{confirmed_company_reason}",
            "profile",
        ) if confirmed_company_reason else None,
        option(
            f"{confirmed_desired_work}につなげたいと考えています。",
            "profile",
        ) if confirmed_desired_work else None,
    ]
    return finalize_options()


def _repair_generated_question_for_response(
    *,
    question: str,
    stage: str,
    company_name: str,
    company_context: str,
    company_sources: list[dict] | None,
    gakuchika_context: list[dict] | None,
    profile_context: dict[str, Any] | None,
    application_job_candidates: list[str] | None,
    company_role_candidates: list[str] | None,
    company_work_candidates: list[str] | None,
    conversation_context: dict[str, Any] | None,
) -> str:
    context = _normalize_conversation_context(conversation_context)
    role_candidates = _merge_candidate_lists(
        application_job_candidates or [],
        company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        _sanitize_existing_grounding_candidates(company_work_candidates, max_items=4, max_len=32),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=context["selectedRole"],
            max_items=4,
        ),
        max_items=4,
    )
    features = _extract_company_features(company_context, company_sources, max_features=3)
    selected_role = context["selectedRole"] or (application_job_candidates or [None])[0]
    desired_work = context["desiredWork"] or (work_candidates[0] if work_candidates else _fallback_work_for_role(selected_role))
    grounded_company_anchor = features[0] if features else (work_candidates[0] if work_candidates else None)
    return _validate_or_repair_question(
        question=question,
        stage=stage,
        company_name=company_name,
        selected_industry=context["selectedIndustry"],
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=grounded_company_anchor,
        gakuchika_episode=_extract_gakuchika_episode(gakuchika_context),
        gakuchika_strength=_extract_gakuchika_strength(gakuchika_context),
        confirmed_facts=context.get("confirmedFacts"),
    )


def _get_next_stage(
    conversation_context: dict[str, Any] | None,
    *,
    weakest_element: str | None = None,
    is_complete: bool = False,
) -> str:
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    current_stage = context.get("questionStage") or "industry_reason"
    stage_attempt_count = context.get("stageAttemptCount") or 0

    current_key = STAGE_CONFIRMED_FACT_KEYS.get(current_stage)
    if current_key and not confirmed_facts[current_key]:
        if stage_attempt_count < MAX_STAGE_REASKS:
            return current_stage
        if current_stage in REQUIRED_MOTIVATION_STAGES:
            current_index = REQUIRED_MOTIVATION_STAGES.index(current_stage)
            for next_stage in REQUIRED_MOTIVATION_STAGES[current_index + 1:]:
                next_key = STAGE_CONFIRMED_FACT_KEYS[next_stage]
                if not confirmed_facts[next_key]:
                    return next_stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        fact_key = STAGE_CONFIRMED_FACT_KEYS[stage]
        if not confirmed_facts[fact_key]:
            return stage

    if is_complete:
        return "closing"
    if weakest_element == "self_analysis":
        return "fit_connection"
    if weakest_element == "differentiation":
        return "differentiation"
    return "closing"


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


def _build_adaptive_rag_query(
    scores: Optional["MotivationScores"] = None,
    conversation_text: str = "",
) -> str:
    """Build a RAG query tailored to the user's weakest motivation elements."""
    conversation_text = conversation_text or ""
    if scores is None:
        base_query = "企業の特徴、事業内容、強み、社風、求める人物像"
        if any(keyword in conversation_text for keyword in ["競合", "他社", "比較"]):
            return base_query + "、競合との差別化、独自性"
        return base_query

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
    if any(keyword in conversation_text for keyword in ["なぜ今", "今だから", "原体験", "きっかけ"]):
        query_parts.append("採用方針、注力事業、最近の取り組み、今後の方向性")
    if any(keyword in conversation_text for keyword in ["社風", "価値観", "文化", "カルチャー"]):
        query_parts.append("企業理念、価値観、働き方、行動指針")

    if not query_parts:
        return "企業の特徴、事業内容、強み、社風、求める人物像"

    return "、".join(query_parts)


def _role_hint_for_rag(
    conversation_context: dict[str, Any],
    application_job_candidates: list[str] | None,
) -> str | None:
    role = conversation_context.get("selectedRole")
    if isinstance(role, str) and role.strip():
        return role.strip()
    aj = application_job_candidates or []
    if aj and isinstance(aj[0], str) and aj[0].strip():
        return aj[0].strip()
    return None


def _augment_rag_query_with_role(base_query: str, role_hint: str | None) -> str:
    q = (base_query or "").strip()
    if not role_hint:
        return q
    compact = " ".join(role_hint.split())
    if len(compact) > 50:
        compact = compact[:50] + "…"
    tail = f"{compact}に関する仕事内容・役割・求める人物像"
    if tail in q or compact in q:
        return q
    return f"{q}、{tail}" if q else tail


def _format_selected_role_line_for_prompt(
    conversation_context: dict[str, Any],
    application_job_candidates: list[str] | None,
) -> str:
    role = _role_hint_for_rag(conversation_context, application_job_candidates)
    if role:
        return f"志望職種（確定）: {sanitize_prompt_input(role, max_length=80)}"
    return "志望職種（確定）: 会話コンテキストの「志望職種」を必ず参照すること"


def _build_element_guidance_for_question_prompt(
    stage: str,
    weakest_element_jp: str,
    missing_aspects_text: str,
) -> str:
    late_stages = frozenset({"fit_connection", "differentiation", "closing"})
    if stage in late_stages:
        ma = missing_aspects_text or "（特になし）"
        return (
            "## 評価に基づく補助指針（※当該質問段階の論点を崩さない範囲でだけ参照）\n"
            f"- 相対的に弱い要素: **{weakest_element_jp}**\n"
            f"- 不足しがちな観点: {ma}\n"
            "上記に引きずって段階外の質問にしないこと。"
        )
    return (
        "## 評価に基づく補助指針\n"
        "- いまは **質問段階の論点だけ** を扱う。4要素スコアや「最も弱い要素」の深掘り指示は "
        "**このターンでは参照しない**（後続の fit_connection / differentiation / closing で反映する）。\n"
        "- スコア欄は参考情報であり、段階を飛ばす理由にならない。"
    )


@dataclass
class _MotivationQuestionPrep:
    conversation_context: dict[str, Any]
    industry: str
    company_context: str
    company_sources: list[dict]
    company_features: list[str]
    role_candidates: list[str]
    work_candidates: list[str]
    eval_result: dict[str, Any]
    scores: MotivationScores
    weakest_element: str
    is_complete: bool
    missing_aspects: dict[str, Any]
    stage: str


async def _get_company_context(
    company_id: str,
    query: str = "",
    scores: Optional["MotivationScores"] = None,
    role_hint: str | None = None,
) -> tuple[str, list[dict]]:
    """Get company RAG context for motivation questions.

    When *scores* are provided, builds an adaptive query targeting
    the user's weakest motivation elements.
    """
    try:
        if not query:
            query = _build_adaptive_rag_query(scores, query)
        query = _augment_rag_query_with_role(query, role_hint)
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
@limiter.limit("60/minute")
async def evaluate_motivation_endpoint(payload: NextQuestionRequest, request: Request) -> dict:
    """
    Public endpoint: Evaluate the current conversation for motivation element coverage.
    Fetches RAG context internally.
    """
    request = payload
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
            "hidden_eval": {
                "company_accuracy": 0,
                "why_now_strength": 0,
                "fit_reasoning": 0,
            },
            "missing_aspects": {
                "company_understanding": ["企業の事業内容", "企業の強み・特徴"],
                "self_analysis": ["関連する経験", "自分の強み"],
                "career_vision": ["入社後にやりたいこと", "キャリアパス"],
                "differentiation": ["この企業を選ぶ理由", "他社との違い"],
            },
            "risk_flags": [],
        }

    trimmed_history = _trim_conversation_for_evaluation(request.conversation_history)
    if settings.debug and len(trimmed_history) != len(request.conversation_history):
        logger.debug(
            "[Motivation] Evaluation conversation trimmed: "
            f"{len(request.conversation_history)} -> {len(trimmed_history)}"
        )

    # Use pre-fetched context if available, otherwise fetch from RAG
    if company_context is None:
        ctx = _normalize_conversation_context(request.conversation_context)
        role_hint = _role_hint_for_rag(ctx, request.application_job_candidates)
        company_context, _ = await _get_company_context(
            request.company_id,
            _format_conversation(trimmed_history),
            role_hint=role_hint,
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
            "hidden_eval": {
                "company_accuracy": 0,
                "why_now_strength": 0,
                "fit_reasoning": 0,
            },
            "missing_aspects": {},
            "risk_flags": [],
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
        "hidden_eval": data.get("hidden_eval", {}),
        "missing_aspects": data.get("missing_aspects", {}),
        "risk_flags": _coerce_risk_flags(data.get("risk_flags"), max_items=2),
    }


async def _prepare_motivation_next_question(
    request: NextQuestionRequest,
) -> _MotivationQuestionPrep:
    conversation_context = _normalize_conversation_context(request.conversation_context)
    latest_user_answer = next(
        (
            message.content
            for message in reversed(request.conversation_history)
            if message.role == "user" and message.content.strip()
        ),
        None,
    )
    conversation_context = _capture_answer_into_context(
        conversation_context,
        latest_user_answer,
    )
    industry = request.industry or conversation_context["selectedIndustry"] or "この業界"
    role_hint = _role_hint_for_rag(conversation_context, request.application_job_candidates)
    company_context, company_sources = await _get_company_context(
        request.company_id,
        role_hint=role_hint,
    )
    company_features = _extract_company_features(company_context, company_sources, max_features=4)
    role_candidates = _merge_candidate_lists(
        request.application_job_candidates or [],
        request.company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(request.profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        _sanitize_existing_grounding_candidates(request.company_work_candidates, max_items=4, max_len=32),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=conversation_context["selectedRole"],
            max_items=4,
        ),
        max_items=4,
    )
    conversation_context["companyAnchorKeywords"] = _merge_candidate_lists(
        conversation_context["companyAnchorKeywords"],
        company_features,
        _extract_company_keywords(
            company_context,
            company_sources,
            selected_role=conversation_context["selectedRole"],
        ),
        max_items=6,
    )
    conversation_context["companyRoleCandidates"] = _merge_candidate_lists(
        conversation_context["companyRoleCandidates"],
        role_candidates,
        max_items=4,
    )
    conversation_context["companyWorkCandidates"] = _merge_candidate_lists(
        conversation_context["companyWorkCandidates"],
        work_candidates,
        max_items=4,
    )

    eval_result = await _evaluate_motivation_internal(request, company_context=company_context)
    scores = MotivationScores(**eval_result["scores"])
    weakest_element = eval_result["weakest_element"]
    is_complete = eval_result["is_complete"]
    missing_aspects = eval_result.get("missing_aspects", {})

    stage = _get_next_stage(
        conversation_context,
        weakest_element=weakest_element,
        is_complete=is_complete,
    )
    previous_stage = conversation_context.get("questionStage") or "industry_reason"
    previous_attempt_count = int(conversation_context.get("stageAttemptCount") or 0)
    next_attempt_count = (
        previous_attempt_count + 1
        if latest_user_answer and stage == previous_stage
        else 0
    )
    conversation_context["questionStage"] = stage
    conversation_context["stageAttemptCount"] = next_attempt_count
    conversation_context["openSlots"] = _build_open_slots_from_confirmed_facts(
        conversation_context.get("confirmedFacts") or _default_confirmed_facts()
    )

    return _MotivationQuestionPrep(
        conversation_context=conversation_context,
        industry=industry,
        company_context=company_context,
        company_sources=company_sources,
        company_features=company_features,
        role_candidates=role_candidates,
        work_candidates=work_candidates,
        eval_result=eval_result,
        scores=scores,
        weakest_element=weakest_element,
        is_complete=is_complete,
        missing_aspects=missing_aspects,
        stage=stage,
    )


def _build_motivation_question_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    weakest_jp = _get_element_japanese_name(prep.weakest_element)
    missing_for_weakest = prep.missing_aspects.get(prep.weakest_element, [])
    missing_aspects_text = (
        f"「{weakest_jp}」で不足: {', '.join(missing_for_weakest)}"
        if missing_for_weakest
        else ""
    )
    element_guidance = _build_element_guidance_for_question_prompt(
        prep.stage,
        weakest_jp,
        missing_aspects_text,
    )
    selected_role_line = _format_selected_role_line_for_prompt(
        prep.conversation_context,
        request.application_job_candidates,
    )
    safe_company_name = sanitize_prompt_input(request.company_name, max_length=200)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    profile_section = _format_profile_for_prompt(request.profile_context)
    application_job_section = _format_application_jobs_for_prompt(request.application_job_candidates)
    conversation_context_section = _format_conversation_context_for_prompt(prep.conversation_context)
    conversation_history_section = _format_recent_conversation_for_prompt(request.conversation_history)
    reask_instruction_section = _build_reask_instruction_section(
        prep.stage,
        stage_attempt_count=int(prep.conversation_context.get("stageAttemptCount") or 0),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
    )
    return MOTIVATION_QUESTION_PROMPT.format(
        company_name=safe_company_name,
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        company_context=prep.company_context or "（企業情報なし）",
        gakuchika_section=gakuchika_section,
        profile_section=profile_section,
        application_job_section=application_job_section,
        conversation_context=conversation_context_section,
        conversation_history=conversation_history_section,
        company_understanding_score=prep.scores.company_understanding,
        self_analysis_score=prep.scores.self_analysis,
        career_vision_score=prep.scores.career_vision,
        differentiation_score=prep.scores.differentiation,
        element_guidance_section=element_guidance,
        reask_instruction_section=reask_instruction_section,
        selected_role_line=selected_role_line,
        question_stage=prep.stage,
        threshold=ELEMENT_COMPLETION_THRESHOLD,
    )


async def _paraphrase_suggestion_options(
    options: list[SuggestionOption],
    *,
    question: str,
    stage: str,
) -> list[SuggestionOption]:
    if not options:
        return options
    labels_json = json.dumps([o.label for o in options], ensure_ascii=False)
    system_prompt = MOTIVATION_SUGGESTION_REWRITE_PROMPT.format(
        question=sanitize_prompt_input(question, max_length=600),
        stage=sanitize_prompt_input(stage, max_length=80),
        labels_json=labels_json,
    )
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message="ルールに従い、JSONのみを出力してください。",
        max_tokens=700,
        temperature=0.2,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success or not llm_result.data:
        return options
    new_labels = llm_result.data.get("labels")
    if not isinstance(new_labels, list) or len(new_labels) != len(options):
        return options
    out: list[SuggestionOption] = []
    seen_signatures: set[str] = set()
    for opt, raw in zip(options, new_labels):
        if not isinstance(raw, str):
            return options
        cleaned = " ".join(raw.split()).strip()
        if len(cleaned) < 8:
            return options
        if len(cleaned) > 200:
            cleaned = cleaned[:197] + "…"
        if not _rewrite_preserves_suggestion_facts(
            original_label=opt.label,
            rewritten_label=cleaned,
            question=question,
        ):
            return options
        signature = _suggestion_signature(cleaned)
        if signature in seen_signatures:
            cleaned = opt.label
            signature = _suggestion_signature(cleaned)
        seen_signatures.add(signature)
        out.append(opt.model_copy(update={"label": cleaned}))
    return out


async def _assemble_regular_next_question_response(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
    data: dict[str, Any],
) -> NextQuestionResponse:
    stage = prep.stage
    validated_question = _repair_generated_question_for_response(
        question=str(data["question"]),
        stage=stage,
        company_name=request.company_name,
        company_context=prep.company_context,
        company_sources=prep.company_sources,
        gakuchika_context=request.gakuchika_context,
        profile_context=request.profile_context,
        application_job_candidates=request.application_job_candidates,
        company_role_candidates=prep.role_candidates,
        company_work_candidates=prep.work_candidates,
        conversation_context=prep.conversation_context,
    )
    validated_question = _ensure_distinct_question(
        question=validated_question,
        stage=stage,
        conversation_history=request.conversation_history,
        company_name=request.company_name,
        selected_industry=prep.conversation_context["selectedIndustry"],
        selected_role=prep.conversation_context["selectedRole"]
        or (request.application_job_candidates or [None])[0],
        desired_work=prep.conversation_context["desiredWork"]
        or (prep.work_candidates[0] if prep.work_candidates else None),
        grounded_company_anchor=prep.company_features[0]
        if prep.company_features
        else (prep.work_candidates[0] if prep.work_candidates else None),
        gakuchika_episode=_extract_gakuchika_episode(request.gakuchika_context),
        gakuchika_strength=_extract_gakuchika_strength(request.gakuchika_context),
        confirmed_facts=prep.conversation_context.get("confirmedFacts"),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
    )
    question_focus = _rotate_question_focus_for_reask(
        stage=stage,
        question_focus=_normalize_question_focus(stage, data.get("question_focus"), validated_question),
        conversation_context=prep.conversation_context,
    )
    preferred_focus = _preferred_question_focus_for_turn(
        stage,
        stage_attempt_count=int(prep.conversation_context.get("stageAttemptCount") or 0),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
    )
    previous_focus = ""
    if isinstance(prep.conversation_context.get("lastQuestionMeta"), dict):
        previous_focus = str(prep.conversation_context["lastQuestionMeta"].get("question_focus") or "").strip()
    if preferred_focus and question_focus == previous_focus:
        question_focus = preferred_focus

    suggestion_options = _build_stage_specific_suggestion_options(
        stage=stage,
        question=validated_question,
        question_focus=question_focus,
        company_name=request.company_name,
        company_context=prep.company_context,
        company_sources=prep.company_sources,
        gakuchika_context=request.gakuchika_context,
        profile_context=request.profile_context,
        application_job_candidates=request.application_job_candidates,
        company_role_candidates=prep.role_candidates,
        company_work_candidates=prep.work_candidates,
        conversation_context=prep.conversation_context,
    )
    suggestion_options = await _paraphrase_suggestion_options(
        suggestion_options,
        question=validated_question,
        stage=stage,
    )
    evidence_summary = data.get("evidence_summary") or _build_evidence_summary_from_sources(
        prep.company_sources, focus="質問の根拠"
    )
    evidence_cards = _build_evidence_cards_from_sources(prep.company_sources)
    prep.conversation_context["questionStage"] = stage
    prep.conversation_context["lastQuestionSignature"] = _question_signature(validated_question)
    prep.conversation_context["lastQuestionMeta"] = {
        "question_signature": _question_signature(validated_question),
        "question_stage": stage,
        "question_focus": question_focus,
        "stage_attempt_count": prep.conversation_context.get("stageAttemptCount") or 0,
        "premise_mode": "confirmed_only",
    }
    stage_status = _build_stage_status(prep.conversation_context, stage)
    risk_flags = _coerce_risk_flags(data.get("risk_flags"), max_items=2) or _coerce_risk_flags(
        prep.eval_result.get("risk_flags"), max_items=2
    )

    return NextQuestionResponse(
        question=validated_question,
        reasoning=data.get("reasoning"),
        should_continue=data.get("should_continue", True),
        suggested_end=bool(data.get("suggested_end", False) or prep.is_complete),
        draft_ready=prep.is_complete,
        evaluation=prep.eval_result,
        target_element=data.get("target_element", prep.weakest_element),
        company_insight=data.get("company_insight"),
        suggestion_options=suggestion_options,
        evidence_summary=evidence_summary,
        evidence_cards=evidence_cards,
        question_stage=stage,
        question_focus=question_focus,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus=str(data.get("coaching_focus") or STAGE_LABELS.get(stage, stage)),
        risk_flags=risk_flags,
        question_signature=_question_signature(validated_question),
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        premise_mode="confirmed_only",
        internal_telemetry=consume_request_llm_cost_summary("motivation"),
    )


@router.post("/next-question", response_model=NextQuestionResponse)
@limiter.limit("60/minute")
async def get_next_question(payload: NextQuestionRequest, request: Request):
    """
    Generate the next deep-dive question for motivation based on evaluation.
    """
    request = payload
    if not request.company_name:
        raise HTTPException(status_code=400, detail="企業名が指定されていません")
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    prep = await _prepare_motivation_next_question(request)

    prompt = _build_motivation_question_system_prompt(request=request, prep=prep)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    if settings.debug:
        message_chars = sum(len(msg.content) for msg in request.conversation_history)
        logger.debug(
            "[Motivation] Next question input sizes: "
            f"messages={len(request.conversation_history)}, "
            f"message_chars={message_chars}, "
            f"company_context_chars={len(prep.company_context)}, "
            f"gakuchika_chars={len(gakuchika_section)}"
        )

    messages = _build_question_messages(request.conversation_history)
    user_message = _build_question_user_message(request.conversation_history)

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message=user_message,
        messages=messages,
        max_tokens=700,
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

    return await _assemble_regular_next_question_response(request=request, prep=prep, data=data)


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
    Shares preparation and post-processing with get_next_question.
    """
    try:
        if not request.company_name:
            yield _sse_event("error", {
                "message": "企業名が指定されていません",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        yield _sse_event("progress", {
            "step": "rag", "progress": 15, "label": "企業情報を取得中...",
        })
        await asyncio.sleep(0.05)

        prep = await _prepare_motivation_next_question(request)

        yield _sse_event("progress", {
            "step": "evaluation", "progress": 40, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        yield _sse_event("progress", {
            "step": "question", "progress": 65, "label": "質問を考え中...",
        })
        await asyncio.sleep(0.05)

        prompt = _build_motivation_question_system_prompt(request=request, prep=prep)
        messages = _build_question_messages(request.conversation_history)
        user_message = _build_question_user_message(request.conversation_history)

        llm_result = None
        preview_question_parts: list[str] = []
        async for event in call_llm_streaming_fields(
            system_prompt=prompt,
            user_message=user_message,
            messages=messages,
            max_tokens=700,
            temperature=0.5,
            feature="motivation",
            schema_hints={
                "question": "string",
                "evidence_summary": "string",
                "coaching_focus": "string",
                "risk_flags": "array",
            },
            stream_string_fields=["question"],
            partial_required_fields=("question",),
        ):
            if event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                    "internal_telemetry": consume_request_llm_cost_summary("motivation"),
                })
                return
            elif event.type == "string_chunk" and event.path == "question":
                preview_question_parts.append(event.text)
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success:
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        data = llm_result.data
        if not data or not data.get("question"):
            yield _sse_event("error", {
                "message": "AIから有効な質問を取得できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("motivation"),
            })
            return

        yield _sse_event("progress", {
            "step": "suggestions", "progress": 85, "label": "回答候補を整えています...",
        })
        await asyncio.sleep(0.05)

        response_obj = await _assemble_regular_next_question_response(
            request=request, prep=prep, data=data
        )
        preview_question = "".join(preview_question_parts).strip()
        final_question = response_obj.question.strip()
        if preview_question and preview_question != final_question:
            logger.info(
                "[Motivation] Canonical question replaced preview: "
                f"company_id={request.company_id} "
                f"company_name={request.company_name} "
                f"stage={response_obj.question_stage} "
                f"question_signature={response_obj.question_signature} "
                f"preview={preview_question!r} "
                f"final={final_question!r}"
            )

        yield _sse_event("string_chunk", {"path": "question", "text": response_obj.question})

        yield _sse_event("complete", {
            "data": {
                "question": response_obj.question,
                "reasoning": response_obj.reasoning,
                "should_continue": response_obj.should_continue,
                "suggested_end": response_obj.suggested_end,
                "draft_ready": response_obj.draft_ready,
                "evaluation": response_obj.evaluation,
                "target_element": response_obj.target_element,
                "company_insight": response_obj.company_insight,
                "suggestion_options": [o.model_dump() for o in response_obj.suggestion_options],
                "evidence_summary": response_obj.evidence_summary,
                "evidence_cards": [c.model_dump() for c in response_obj.evidence_cards],
                "question_stage": response_obj.question_stage,
                "question_focus": response_obj.question_focus,
                "stage_status": response_obj.stage_status.model_dump()
                if response_obj.stage_status
                else {},
                "captured_context": response_obj.captured_context,
                "coaching_focus": response_obj.coaching_focus,
                "risk_flags": response_obj.risk_flags,
                "question_signature": response_obj.question_signature,
                "stage_attempt_count": response_obj.stage_attempt_count,
                "premise_mode": response_obj.premise_mode,
            },
            "internal_telemetry": response_obj.internal_telemetry,
        })

    except Exception as e:
        yield _sse_event("error", {
            "message": f"予期しないエラーが発生しました: {str(e)}",
            "internal_telemetry": consume_request_llm_cost_summary("motivation"),
        })


@router.post("/next-question/stream")
@limiter.limit("60/minute")
async def get_next_question_stream(payload: NextQuestionRequest, request: Request):
    """
    SSE streaming version of next-question.
    Yields progress events then complete/error event.
    """
    request = payload
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


@router.post("/generate-draft", response_model=GenerateDraftResponse)
@limiter.limit("60/minute")
async def generate_draft(payload: GenerateDraftRequest, request: Request):
    """
    Generate ES draft from conversation history.
    """
    request = payload
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_generate_draft_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

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
        feature="motivation_draft",
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
                        internal_telemetry=consume_request_llm_cost_summary("motivation_draft"),
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
        internal_telemetry=consume_request_llm_cost_summary("motivation_draft"),
    )
