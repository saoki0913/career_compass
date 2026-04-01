"""
Motivation (志望動機) Deep-Dive Router

AI-powered deep-dive questioning for creating company motivation ES drafts.

Features:
- Company RAG integration for contextual questions
- 6-slot evaluation: industry/company reason, self-connection, desired work,
  value contribution, differentiation
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
    MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
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
    slot_status: dict[str, str]
    missing_slots: list[str]
    ready_for_draft: bool
    draft_readiness_reason: str
    risk_flags: list[str] = []
    conversation_warnings: list[str] = []


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
    target_slot: Optional[str] = None
    question_intent: Optional[str] = None
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
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
]

STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "company_reason": "企業志望理由",
    "self_connection": "自分との接続",
    "desired_work": "やりたい仕事",
    "value_contribution": "価値発揮",
    "differentiation": "差別化",
}

REQUIRED_MOTIVATION_STAGES = (
    "industry_reason",
    "company_reason",
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
)

MAX_STAGE_REASKS = 1

STAGE_CONFIRMED_FACT_KEYS = {
    "industry_reason": "industry_reason_confirmed",
    "company_reason": "company_reason_confirmed",
    "self_connection": "self_connection_confirmed",
    "desired_work": "desired_work_confirmed",
    "value_contribution": "value_contribution_confirmed",
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
    "industry_reason": ("industry_reason",),
    "company_reason": ("company_reason", "differentiation_seed"),
    "self_connection": ("origin_background", "experience_connection"),
    "desired_work": ("desired_work",),
    "value_contribution": ("value_contribution",),
    "differentiation": ("differentiation",),
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
        "self_connection_confirmed": False,
        "desired_work_confirmed": False,
        "value_contribution_confirmed": False,
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
    if "origin_experience_confirmed" in value:
        normalized["self_connection_confirmed"] = (
            normalized["self_connection_confirmed"] or bool(value["origin_experience_confirmed"])
        )
    if "fit_connection_confirmed" in value:
        normalized["self_connection_confirmed"] = (
            normalized["self_connection_confirmed"] or bool(value["fit_connection_confirmed"])
        )
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
    if stage == "self_connection":
        return len(normalized) >= 18 and any(
            token in normalized for token in ("経験", "価値観", "強み", "きっかけ", "つなが", "活か")
        )
    if stage == "desired_work":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("したい", "挑戦", "関わりたい", "担いたい", "取り組みたい")
        )
    if stage == "value_contribution":
        return len(normalized) >= 16 and any(
            token in normalized for token in ("価値", "貢献", "役立", "前に進め", "支え", "実現")
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
        "selfConnection": str(
            context.get("selfConnection")
            or context.get("fitConnection")
            or context.get("originExperience")
            or ""
        ).strip()
        or None,
        "desiredWork": str(context.get("desiredWork") or "").strip() or None,
        "valueContribution": str(context.get("valueContribution") or "").strip() or None,
        "differentiationReason": str(context.get("differentiationReason") or "").strip() or None,
        "originExperience": str(context.get("originExperience") or "").strip() or None,
        "fitConnection": str(context.get("fitConnection") or "").strip() or None,
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
        "questionStage": (
            "self_connection"
            if str(context.get("questionStage") or "").strip() in {"origin_experience", "fit_connection"}
            else str(context.get("questionStage") or "").strip() or "industry_reason"
        ),
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
        if normalized["selfConnection"]:
            confirmed_facts["self_connection_confirmed"] = True
        if normalized["desiredWork"]:
            confirmed_facts["desired_work_confirmed"] = True
        if normalized["valueContribution"]:
            confirmed_facts["value_contribution_confirmed"] = True
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
    elif stage == "self_connection":
        context["selfConnection"] = trimmed
        context["fitConnection"] = trimmed
    elif stage == "desired_work":
        context["desiredWork"] = trimmed
    elif stage == "value_contribution":
        context["valueContribution"] = trimmed
    elif stage == "differentiation":
        context["differentiationReason"] = trimmed

    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    fact_key = _confirmed_fact_key_for_stage(stage)
    if fact_key:
        is_confirmed = _answer_is_confirmed_for_stage(stage, trimmed)
        confirmed_facts[fact_key] = is_confirmed
        if stage == "self_connection":
            confirmed_facts["origin_experience_confirmed"] = is_confirmed
            confirmed_facts["fit_connection_confirmed"] = is_confirmed
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
        f"- 自分との接続: {context['selfConnection'] or '未整理'}",
        f"- やりたい仕事: {context['desiredWork'] or '未整理'}",
        f"- 価値発揮: {context['valueContribution'] or '未整理'}",
        f"- 他社ではなくこの企業の理由: {context['differentiationReason'] or '未整理'}",
        f"- 現在段階: {STAGE_LABELS.get(context['questionStage'], context['questionStage'])}",
        f"- 段階再質問回数: {context['stageAttemptCount']}",
        (
            "- confirmed facts: "
            f"industry={confirmed_facts['industry_reason_confirmed']}, "
            f"company={confirmed_facts['company_reason_confirmed']}, "
            f"self_connection={confirmed_facts['self_connection_confirmed']}, "
            f"desired_work={confirmed_facts['desired_work_confirmed']}, "
            f"value_contribution={confirmed_facts['value_contribution_confirmed']}, "
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
    "self_connection": ("経験", "価値観", "強み", "つなが", "活か", "きっかけ"),
    "desired_work": ("したい", "挑戦", "関わりたい", "担いたい", "取り組みたい", "向き合いたい"),
    "value_contribution": ("価値", "貢献", "役立", "支え", "実現", "前に進め"),
    "differentiation": ("他社", "違い", "理由", "合うため", "最も", "だからこそ"),
    "closing": ("したい", "目指", "貢献", "実現", "価値を出", "なりたい"),
}

QUESTION_KEYWORDS_BY_STAGE = {
    "industry_reason": ("業界", "関心", "理由", "きっかけ", "今"),
    "company_reason": ("理由", "魅力", "惹かれ", "きっかけ", "選ぶ"),
    "self_connection": ("経験", "価値観", "強み", "つなが", "活か", "原体験"),
    "desired_work": ("入社後", "仕事", "挑戦", "担い", "関わり"),
    "value_contribution": ("価値", "貢献", "役立", "実現", "前に進め"),
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
    ("industry_reason", "industry_reason"): ("業界", "関心", "理由", "きっかけ", "今"),
    ("company_reason", "company_reason"): ("企業", "魅力", "理由", "惹かれ", "選ぶ"),
    ("company_reason", "differentiation_seed"): ("他社", "違い", "ならでは", "選ぶ"),
    ("self_connection", "origin_background"): ("原体験", "きっかけ", "価値観", "関心"),
    ("self_connection", "experience_connection"): ("経験", "強み", "活か", "つなが"),
    ("desired_work", "desired_work"): ("入社後", "仕事", "挑戦", "担いたい"),
    ("value_contribution", "value_contribution"): ("価値", "貢献", "役立", "支え", "実現"),
    ("differentiation", "differentiation"): ("他社", "違い", "理由", "だからこそ"),
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
    normalized_current_stage = (
        "self_connection" if current_stage in {"origin_experience", "fit_connection"} else current_stage
    )
    completed: list[str] = []
    for stage, fact_key in STAGE_CONFIRMED_FACT_KEYS.items():
        if confirmed_facts.get(fact_key, False):
            completed.append(stage)

    pending = [stage for stage in STAGE_ORDER if stage not in completed and stage != normalized_current_stage]
    return StageStatus(current=normalized_current_stage, completed=completed, pending=pending)


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
        "self_connection": {
            "company": "企業理解を補強しつつ接点を示す候補",
            "gakuchika": "強みや経験を前面に出す候補",
            "profile": "志向や専攻を踏まえた候補",
            "hybrid": "企業と本人の因果接続を作る候補",
            "application_job_type": "職種選択と経験を結びつける候補",
        },
        "value_contribution": {
            "company": "企業で出したい価値を整理する候補",
            "gakuchika": "経験から価値発揮へつなぐ候補",
            "profile": "志向や職種から価値発揮を示す候補",
            "hybrid": "やりたい仕事と貢献像をつなぐ候補",
            "application_job_type": "職種起点で価値発揮を整理する候補",
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
    return rationale_map.get(stage, rationale_map["self_connection"]).get(
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
        return "industry_reason"

    if stage == "company_reason":
        if _question_has_any_keyword(text, ("他社", "違い", "ならでは", "選ぶ")):
            return "differentiation_seed"
        return "company_reason"

    if stage == "self_connection":
        if _question_has_any_keyword(text, ("原体験", "きっかけ", "価値観")):
            return "origin_background"
        return "experience_connection"

    if stage == "desired_work":
        return "desired_work"

    if stage == "value_contribution":
        return "value_contribution"

    if stage == "differentiation":
        return "differentiation"

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
    normalized_stage = "self_connection" if stage in {"origin_experience", "fit_connection"} else stage
    confirmed = _normalize_confirmed_facts(confirmed_facts) if confirmed_facts is not None else None
    if stage == "industry_reason":
        if selected_industry:
            return [f"{selected_industry}業界を志望する理由を1つ教えてください。"]
        return ["この業界を志望する理由を1つ教えてください。"]

    if normalized_stage == "company_reason":
        if selected_role and confirmed is not None and not confirmed["company_reason_confirmed"]:
            return [
                f"{company_name}を志望先として考えるとき、どんな点に魅力を感じますか？",
                f"{company_name}を選びたいと思う理由があるとしたら、何が近いですか？",
            ]
        if selected_role:
            return [
                f"{company_name}で{selected_role}を考えるとき、どんな点に惹かれますか？",
                f"{company_name}を志望する理由として近いものを1つ教えてください。",
            ]
        return [
            f"{company_name}を志望する理由を1つ教えてください。",
            f"{company_name}に惹かれる点を1つ教えてください。",
        ]

    if normalized_stage == "self_connection":
        if gakuchika_episode:
            return [
                f"{gakuchika_episode}の経験は、今の志望とどうつながっていますか？",
                "ご自身の経験や価値観の中で、今の志望につながるものは何ですか？",
            ]
        return [
            "ご自身の経験や価値観の中で、今の志望につながるものは何ですか？",
            "これまでの経験で、今の志望に影響していることはありますか？",
        ]

    if normalized_stage == "desired_work":
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

    if normalized_stage == "value_contribution":
        return [
            "入社後、どんな価値や貢献を出したいですか？",
            "その仕事を通じて、相手にどんな変化を届けたいですか？",
        ]

    if normalized_stage == "differentiation":
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
    if stage == "self_connection" and not any(token in normalized for token in ("経験", "価値観", "きっかけ", "つなが")):
        return fallback
    if stage == "value_contribution" and not any(token in normalized for token in ("価値", "貢献", "役立", "支え", "実現")):
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
        return _preferred_question_focus_for_turn(
            stage,
            stage_attempt_count=int(_normalize_conversation_context(conversation_context).get("stageAttemptCount") or 0),
            last_question_meta=_normalize_conversation_context(conversation_context).get("lastQuestionMeta"),
        ) or question_focus
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
    elif stage == "self_connection" and any(token in label for token in ("経験", "原体験", "きっかけ", "通じて", "価値観", "つなが")):
        score += 2
    elif stage == "differentiation" and focus == "company_over_others" and "他社" in label:
        score += 2
    elif stage == "closing" and any(token in label for token in ("貢献", "価値", "実現", "目指")):
        score += 1

    if selected_role and selected_role in label:
        score += 1
    if desired_work and desired_work in label and stage in ("self_connection", "differentiation", "closing"):
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
    if stage == "self_connection":
        return [
            "これまでの経験で培った視点は、入社後の仕事でも活かせると考えています。",
            "過去の経験で身につけた力が、志望している仕事につながると考えています。",
        ]
    if stage == "value_contribution":
        return [
            "相手の課題を整理し、前に進みやすい状態をつくることで価値を出したいです。",
            "自分の経験を活かして、より良い提案や意思決定につながる価値を出したいです。",
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
    normalized_stage = "self_connection" if stage in {"origin_experience", "fit_connection"} else stage
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    selected_role = context.get("selectedRole") or (application_job_candidates or [None])[0]
    selected_industry = context.get("selectedIndustry") or (
        (_extract_profile_industries(profile_context) or [None])[0]
    )
    gakuchika_strength = _extract_gakuchika_strength(gakuchika_context)
    gakuchika_episode = _extract_gakuchika_episode(gakuchika_context)
    self_connection = context.get("selfConnection") or context.get("fitConnection") or context.get("originExperience")
    desired_work = context.get("desiredWork")
    value_contribution = context.get("valueContribution")
    company_reason = context.get("companyReason") if confirmed_facts["company_reason_confirmed"] else None
    industry_reason = context.get("industryReason") if confirmed_facts["industry_reason_confirmed"] else None

    def push(
        bucket: list[SuggestionOption],
        label: str | None,
        source_type: str,
        *,
        is_tentative: bool = False,
    ) -> None:
        cleaned = " ".join((label or "").split()).strip()
        if not cleaned:
            return
        if len(cleaned) > 120:
            cleaned = cleaned[:117].rstrip() + "…"
        if any(_suggestion_signature(cleaned) == _suggestion_signature(item.label) for item in bucket):
            return
        bucket.append(
            _decorate_suggestion_option(
                cleaned,
                source_type,
                normalized_stage,
                [],
                is_tentative=is_tentative,
                rationale="質問に直接答える候補",
            )
        )

    options: list[SuggestionOption] = []
    normalized_question = " ".join((question or "").split())

    if normalized_stage == "industry_reason":
        if industry_reason:
            push(options, industry_reason, "conversation")
        if selected_industry and gakuchika_episode:
            push(options, f"{gakuchika_episode}を通じて、{selected_industry}業界への関心が強まったためです。", "gakuchika")
        if selected_industry and selected_role:
            push(options, f"{selected_role}として向き合いたい課題があり、{selected_industry}業界を志望しているためです。", "profile")
        if selected_industry:
            push(options, f"複数の課題に関わりながら価値を出せる点に魅力を感じ、{selected_industry}業界を志望しています。", "safe_fallback", is_tentative=True)

    elif normalized_stage == "company_reason":
        if company_reason:
            push(options, company_reason, "conversation")
        if any(token in normalized_question for token in ("なぜ今", "高まった", "強まった", "きっかけ")):
            push(options, f"{gakuchika_episode or 'これまでの経験'}を通じて、業界への関心を具体的な仕事として考えるようになったためです。", "gakuchika", is_tentative=True)
            push(options, f"就活を進める中で、自分の関心を仕事に結びつけるなら{company_name}だと感じたためです。", "safe_fallback", is_tentative=True)
        if any(token in normalized_question for token in ("選択肢", "商社", "なぜその業界", "なぜこの業界")):
            industry_axis = selected_industry or _format_industry_axis(_extract_profile_industries(profile_context))
            push(options, f"{industry_axis}だけでなく複数の事業や産業に関われる選択肢として、{company_name}が気になったためです。", "profile", is_tentative=True)
            push(options, f"一つの領域に閉じずに事業や産業を横断して価値を出せる点に、{company_name}らしさを感じたためです。", "safe_fallback", is_tentative=True)
        if industry_reason:
            push(options, f"{industry_reason}という軸を、{company_name}でより具体的に実現できると感じるためです。", "conversation")
        if selected_role:
            push(options, f"{selected_role}として向き合いたいテーマと、{company_name}で挑戦したい方向性が重なると感じるためです。", "profile", is_tentative=True)
        push(options, f"業界への関心を具体的な仕事につなげる場として、{company_name}を志望したいと考えています。", "safe_fallback", is_tentative=True)

    elif normalized_stage == "self_connection":
        if self_connection:
            push(options, self_connection, "conversation")
        if desired_work:
            push(options, f"これまでの経験で培った課題整理の視点が、{desired_work}につながると感じています。", "conversation", is_tentative=True)
        if gakuchika_episode and selected_role:
            push(options, f"{gakuchika_episode}で課題を整理して動いた経験が、{selected_role}の仕事につながると感じています。", "gakuchika")
        if gakuchika_strength and selected_role:
            push(options, f"{gakuchika_strength}を発揮してきた経験が、{selected_role}として価値を出す場面でも活かせると考えています。", "gakuchika")
        push(options, "まだ言語化しきれていませんが、自分の経験や価値観とこの仕事には接点があると感じています。", "safe_fallback", is_tentative=True)

    elif normalized_stage == "desired_work":
        if desired_work:
            push(options, desired_work, "conversation")
        if selected_role:
            push(options, f"入社後は{selected_role}として、相手の課題を整理しながら前に進める仕事に挑戦したいです。", "profile", is_tentative=True)
        if gakuchika_episode:
            push(options, f"入社後は、{gakuchika_episode}で向き合ったような課題に、仕事として関われる役割に挑戦したいです。", "gakuchika", is_tentative=True)
        if selected_role:
            push(options, f"入社後は{selected_role}として、現場の課題を捉えて提案につなげる仕事がしたいです。", "safe_fallback", is_tentative=True)

    elif normalized_stage == "value_contribution":
        if value_contribution:
            push(options, value_contribution, "conversation")
        if desired_work:
            push(options, f"{desired_work}を通じて、相手が動きやすくなる価値を出したいです。", "conversation", is_tentative=True)
        if selected_role:
            push(options, f"{selected_role}として課題を整理し、関係者が前に進みやすい状態をつくることで価値を出したいです。", "profile", is_tentative=True)
        push(options, "相手の課題を整理して、より良い意思決定につながる価値を出したいです。", "safe_fallback", is_tentative=True)

    elif normalized_stage == "differentiation":
        if company_reason:
            push(options, f"{company_reason}と感じており、その点が他社よりも自分の軸に合うためです。", "conversation")
        if selected_role and desired_work:
            push(options, f"{selected_role}として{desired_work}を実現するイメージを、{company_name}で最も具体的に持てるためです。", "profile", is_tentative=True)
        if gakuchika_episode:
            push(options, f"{gakuchika_episode}の経験を踏まえると、{company_name}でこそ自分の志向を形にしやすいと感じています。", "gakuchika", is_tentative=True)
        push(options, f"業界に興味があるだけでなく、自分の軸を具体的な仕事につなげやすい点で、{company_name}を選びたいと考えています。", "safe_fallback", is_tentative=True)

    else:
        if desired_work:
            push(options, f"{desired_work}を通じて価値を出したいです。", "conversation")
        if selected_role:
            push(options, f"{selected_role}として自分なりの価値を出していきたいです。", "profile", is_tentative=True)

    return options[:4]


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
    selected_role = context["selectedRole"] or (application_job_candidates or [None])[0]
    desired_work = context["desiredWork"]
    grounded_company_anchor = None
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
    missing_slots: list[str] | None = None,
    ready_for_draft: bool = False,
    weakest_element: str | None = None,
    is_complete: bool | None = None,
) -> str:
    if is_complete is True:
        ready_for_draft = True
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

    if ready_for_draft:
        return current_stage

    slot_priority = [slot for slot in REQUIRED_MOTIVATION_STAGES if slot in (missing_slots or [])]
    if slot_priority:
        return slot_priority[0]

    for stage in REQUIRED_MOTIVATION_STAGES:
        fact_key = STAGE_CONFIRMED_FACT_KEYS[stage]
        if not confirmed_facts[fact_key]:
            return stage

    return current_stage


def _slot_to_legacy_element(slot: str) -> str:
    mapping = {
        "industry_reason": "company_understanding",
        "company_reason": "company_understanding",
        "self_connection": "self_analysis",
        "desired_work": "career_vision",
        "value_contribution": "career_vision",
        "differentiation": "differentiation",
    }
    return mapping.get(slot, "company_understanding")


def _slot_label(slot: str) -> str:
    labels = {
        "industry_reason": "業界志望理由",
        "company_reason": "企業志望理由",
        "self_connection": "自分との接続",
        "desired_work": "やりたい仕事",
        "value_contribution": "価値発揮",
        "differentiation": "差別化",
    }
    return labels.get(slot, slot)


def _slot_status_to_scores(slot_status: dict[str, str]) -> MotivationScores:
    score_map = {"missing": 20, "partial": 55, "filled": 82}
    company_score = min(
        score_map.get(slot_status.get("industry_reason", "missing"), 20),
        score_map.get(slot_status.get("company_reason", "missing"), 20),
    )
    self_score = score_map.get(slot_status.get("self_connection", "missing"), 20)
    career_score = min(
        score_map.get(slot_status.get("desired_work", "missing"), 20),
        score_map.get(slot_status.get("value_contribution", "missing"), 20),
    )
    differentiation_score = score_map.get(slot_status.get("differentiation", "missing"), 20)
    return MotivationScores(
        company_understanding=company_score,
        self_analysis=self_score,
        career_vision=career_score,
        differentiation=differentiation_score,
    )


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
    late_stages = frozenset({"self_connection", "value_contribution", "differentiation", "closing"})
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
        "**このターンでは参照しない**（後続の self_connection / value_contribution / differentiation / closing で反映する）。\n"
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
    missing_slots: list[str]
    stage: str
    was_draft_ready: bool


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
            "weakest_element": "company_reason",
            "is_complete": False,
            "slot_status": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "missing_slots": [
                "industry_reason",
                "company_reason",
                "self_connection",
                "desired_work",
                "value_contribution",
                "differentiation",
            ],
            "ready_for_draft": False,
            "draft_readiness_reason": "志望動機の骨格がまだ揃っていないため",
            "conversation_warnings": [],
            "missing_aspects": {},
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
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        selected_role_line=_format_selected_role_line_for_prompt(
            _normalize_conversation_context(request.conversation_context),
            request.application_job_candidates,
        ),
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
        scores = MotivationScores()
        return {
            "scores": scores.model_dump(),
            "weakest_element": "company_reason",
            "is_complete": False,
            "slot_status": {
                "industry_reason": "missing",
                "company_reason": "missing",
                "self_connection": "missing",
                "desired_work": "missing",
                "value_contribution": "missing",
                "differentiation": "missing",
            },
            "missing_slots": [
                "industry_reason",
                "company_reason",
                "self_connection",
                "desired_work",
                "value_contribution",
                "differentiation",
            ],
            "ready_for_draft": False,
            "draft_readiness_reason": "評価に失敗したため骨格未確認",
            "conversation_warnings": [],
            "missing_aspects": {},
            "risk_flags": [],
        }

    data = llm_result.data
    slot_status = data.get("slot_status") or {}
    missing_slots = [
        slot
        for slot in data.get("missing_slots", [])
        if slot in {
            "industry_reason",
            "company_reason",
            "self_connection",
            "desired_work",
            "value_contribution",
            "differentiation",
        }
    ]
    ready_for_draft = bool(data.get("ready_for_draft", False))
    weakest_element = _slot_to_legacy_element(missing_slots[0] if missing_slots else "differentiation")

    return {
        "scores": {
            "company_understanding": 0,
            "self_analysis": 0,
            "career_vision": 0,
            "differentiation": 0,
        },
        "weakest_element": weakest_element,
        "is_complete": ready_for_draft,
        "slot_status": {
            "industry_reason": slot_status.get("industry_reason", "missing"),
            "company_reason": slot_status.get("company_reason", "missing"),
            "self_connection": slot_status.get("self_connection", "missing"),
            "desired_work": slot_status.get("desired_work", "missing"),
            "value_contribution": slot_status.get("value_contribution", "missing"),
            "differentiation": slot_status.get("differentiation", "missing"),
        },
        "missing_slots": missing_slots,
        "ready_for_draft": ready_for_draft,
        "draft_readiness_reason": str(data.get("draft_readiness_reason") or ""),
        "conversation_warnings": _coerce_string_list(data.get("conversation_warnings"), max_items=4),
        "missing_aspects": {},
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
    scores = MotivationScores(**(eval_result.get("scores") or MotivationScores().model_dump()))
    weakest_element = eval_result["weakest_element"]
    is_complete = bool(eval_result.get("ready_for_draft") or eval_result.get("is_complete"))
    missing_slots = list(eval_result.get("missing_slots") or [])
    was_draft_ready = bool(conversation_context.get("draftReady"))

    stage = _get_next_stage(
        conversation_context,
        missing_slots=missing_slots,
        ready_for_draft=is_complete,
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
        missing_slots=missing_slots,
        stage=stage,
        was_draft_ready=was_draft_ready,
    )


def _build_motivation_question_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
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
    slot_status = prep.eval_result.get("slot_status") or {}
    slot_status_section = "\n".join(
        f"- {slot}: {slot_status.get(slot, 'missing')}"
        for slot in (
            "industry_reason",
            "company_reason",
            "self_connection",
            "desired_work",
            "value_contribution",
            "differentiation",
        )
    )
    missing_slots_section = ", ".join(prep.missing_slots) if prep.missing_slots else "（不足要素なし）"
    last_question_meta = prep.conversation_context.get("lastQuestionMeta") or {}
    last_question = str(last_question_meta.get("questionText") or "").strip() or "（なし）"
    last_question_target_slot = str(last_question_meta.get("question_stage") or "").strip() or "（なし）"
    recent_question_summaries = []
    for message in request.conversation_history[-4:]:
        if message.role == "assistant" and message.content.strip():
            recent_question_summaries.append(_clean_short_phrase(message.content, max_len=36))
    recent_question_summaries_text = ", ".join(recent_question_summaries) if recent_question_summaries else "（なし）"
    return MOTIVATION_QUESTION_PROMPT.format(
        company_name=safe_company_name,
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        selected_role_line=selected_role_line,
        company_context=prep.company_context or "（企業情報なし）",
        gakuchika_section=gakuchika_section,
        profile_section=profile_section,
        application_job_section=application_job_section,
        conversation_context=conversation_context_section,
        conversation_history=conversation_history_section,
        slot_status_section=slot_status_section,
        missing_slots_section=missing_slots_section,
        draft_readiness_reason=str(prep.eval_result.get("draft_readiness_reason") or "（理由なし）"),
        last_question=last_question,
        last_question_target_slot=last_question_target_slot,
        recent_question_summaries=recent_question_summaries_text,
    )


def _build_motivation_deepdive_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    selected_role_line = _format_selected_role_line_for_prompt(
        prep.conversation_context,
        request.application_job_candidates,
    )
    draft_text = "（まだ下書きは生成していませんが、骨格は揃っています）"
    last_question_meta = prep.conversation_context.get("lastQuestionMeta") or {}
    last_question = str(last_question_meta.get("questionText") or "").strip() or "（なし）"
    recent_question_summaries = []
    for message in request.conversation_history[-4:]:
        if message.role == "assistant" and message.content.strip():
            recent_question_summaries.append(_clean_short_phrase(message.content, max_len=36))
    recent_question_summaries_text = ", ".join(recent_question_summaries) if recent_question_summaries else "（なし）"
    return MOTIVATION_DEEPDIVE_QUESTION_PROMPT.format(
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        selected_role_line=selected_role_line,
        draft_text=draft_text,
        company_context=prep.company_context or "（企業情報なし）",
        conversation_history=_format_recent_conversation_for_prompt(request.conversation_history, max_messages=8),
        last_question=last_question,
        recent_question_summaries=recent_question_summaries_text,
    )


def _deepdive_area_to_stage(target_area: str | None) -> str:
    mapping = {
        "company_reason_strengthening": "company_reason",
        "desired_work_clarity": "desired_work",
        "value_contribution_clarity": "value_contribution",
        "differentiation_strengthening": "differentiation",
        "origin_background": "self_connection",
        "why_now_strengthening": "company_reason",
    }
    return mapping.get(str(target_area or "").strip(), "differentiation")


def _build_draft_ready_response(prep: _MotivationQuestionPrep) -> NextQuestionResponse:
    stage_status = _build_stage_status(prep.conversation_context, prep.stage)
    return NextQuestionResponse(
        question="",
        should_continue=True,
        suggested_end=True,
        draft_ready=True,
        evaluation=prep.eval_result,
        target_slot=None,
        question_intent=None,
        suggestion_options=[],
        evidence_summary=_build_evidence_summary_from_sources(prep.company_sources, focus="参考企業情報"),
        evidence_cards=_build_evidence_cards_from_sources(prep.company_sources),
        question_stage=prep.stage,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus="ES作成可能",
        risk_flags=_coerce_risk_flags(prep.eval_result.get("risk_flags"), max_items=2),
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        premise_mode="confirmed_only",
        internal_telemetry=consume_request_llm_cost_summary("motivation"),
    )


async def _paraphrase_suggestion_options(
    options: list[SuggestionOption],
    *,
    question: str,
    stage: str,
    company_name: str,
    industry: str,
    conversation_history: list[Message],
) -> list[SuggestionOption]:
    if not options:
        return options
    source_material_json = json.dumps([o.label for o in options], ensure_ascii=False)
    system_prompt = MOTIVATION_SUGGESTION_REWRITE_PROMPT.format(
        question=sanitize_prompt_input(question, max_length=600),
        target_slot=sanitize_prompt_input(stage, max_length=80),
        question_intent=sanitize_prompt_input(STAGE_LABELS.get(stage, stage), max_length=80),
        stage=sanitize_prompt_input(stage, max_length=80),
        company_name=sanitize_prompt_input(company_name, max_length=120),
        industry=sanitize_prompt_input(industry, max_length=80),
        conversation_history=_format_recent_conversation_for_prompt(conversation_history, max_messages=6),
        source_material_json=source_material_json,
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
        company_name=request.company_name,
        industry=prep.industry,
        conversation_history=request.conversation_history,
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
        target_slot=data.get("target_slot", stage),
        question_intent=data.get("question_intent", STAGE_LABELS.get(stage, stage)),
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


def _build_draft_ready_unlock_response(
    *,
    prep: _MotivationQuestionPrep,
) -> NextQuestionResponse:
    stage_status = _build_stage_status(prep.conversation_context, prep.stage)
    return NextQuestionResponse(
        question="",
        reasoning="志望動機ESの骨格が揃ったため、追加質問を出さずに下書き作成へ進めます。",
        should_continue=True,
        suggested_end=True,
        draft_ready=True,
        evaluation=prep.eval_result,
        target_element=None,
        company_insight=None,
        suggestion_options=[],
        evidence_summary=_build_evidence_summary_from_sources(prep.company_sources, focus="参考情報"),
        evidence_cards=_build_evidence_cards_from_sources(prep.company_sources),
        question_stage=prep.stage,
        question_focus=None,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus="ES作成可能",
        risk_flags=_coerce_risk_flags(prep.eval_result.get("risk_flags"), max_items=2),
        question_signature=None,
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
    if prep.is_complete and not prep.was_draft_ready:
        return _build_draft_ready_unlock_response(prep=prep)

    prompt = (
        _build_motivation_deepdive_system_prompt(request=request, prep=prep)
        if prep.was_draft_ready
        else _build_motivation_question_system_prompt(request=request, prep=prep)
    )
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

    if prep.was_draft_ready:
        prep.stage = _deepdive_area_to_stage(data.get("target_area"))
        prep.conversation_context["questionStage"] = prep.stage

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
        if prep.is_complete and not prep.was_draft_ready:
            response_obj = _build_draft_ready_unlock_response(prep=prep)
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
                    "suggestion_options": [],
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
            return

        yield _sse_event("progress", {
            "step": "evaluation", "progress": 40, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        yield _sse_event("progress", {
            "step": "question", "progress": 65, "label": "質問を考え中...",
        })
        await asyncio.sleep(0.05)

        prompt = (
            _build_motivation_deepdive_system_prompt(request=request, prep=prep)
            if prep.was_draft_ready
            else _build_motivation_question_system_prompt(request=request, prep=prep)
        )
        messages = _build_question_messages(request.conversation_history)
        user_message = _build_question_user_message(request.conversation_history)

        llm_result = None
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

        if prep.was_draft_ready:
            prep.stage = _deepdive_area_to_stage(data.get("target_area"))
            prep.conversation_context["questionStage"] = prep.stage

        yield _sse_event("progress", {
            "step": "suggestions", "progress": 85, "label": "回答候補を整えています...",
        })
        await asyncio.sleep(0.05)

        response_obj = await _assemble_regular_next_question_response(
            request=request, prep=prep, data=data
        )
        yield _sse_event("complete", {
            "data": {
                "question": response_obj.question,
                "reasoning": response_obj.reasoning,
                "should_continue": response_obj.should_continue,
                "suggested_end": response_obj.suggested_end,
                "draft_ready": response_obj.draft_ready,
                "evaluation": response_obj.evaluation,
                "target_slot": response_obj.target_slot,
                "question_intent": response_obj.question_intent,
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
