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
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.utils.llm import call_llm_with_error, call_llm_streaming_fields, sanitize_prompt_input
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
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    scores: Optional[MotivationScoresInput] = None
    gakuchika_context: Optional[list[dict]] = None
    conversation_context: Optional[dict[str, Any]] = None
    profile_context: Optional[dict[str, Any]] = None
    company_role_candidates: Optional[list[str]] = None
    company_work_candidates: Optional[list[str]] = None


class SuggestionOption(BaseModel):
    id: str
    label: str
    sourceType: str
    intent: str


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    evaluation: Optional[dict] = None
    target_element: Optional[str] = None
    company_insight: Optional[str] = None  # RAG-based company insight used
    suggestions: list[str] = []  # 4 suggested answer options for the user
    suggestion_options: list[SuggestionOption] = []
    evidence_summary: Optional[str] = None  # RAG根拠の短い要約
    question_stage: Optional[str] = None
    captured_context: Optional[dict[str, Any]] = None
    coaching_focus: Optional[str] = None
    risk_flags: list[str] = []


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


STAGE_ORDER = [
    "industry_reason",
    "company_reason",
    "role_selection",
    "desired_work",
    "fit_connection",
    "differentiation",
    "closing",
]

STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "company_reason": "企業志望理由",
    "role_selection": "志望職種",
    "desired_work": "やりたい仕事",
    "fit_connection": "経験との接続",
    "differentiation": "差別化",
    "closing": "締めの整理",
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


def _coerce_risk_flags(value: Any, max_items: int = 2) -> list[str]:
    return _coerce_string_list(value, max_items=max_items)


def _normalize_conversation_context(value: dict[str, Any] | None) -> dict[str, Any]:
    context = value.copy() if isinstance(value, dict) else {}
    normalized = {
        "industryReason": str(context.get("industryReason") or "").strip() or None,
        "companyReason": str(context.get("companyReason") or "").strip() or None,
        "selectedRole": str(context.get("selectedRole") or "").strip() or None,
        "selectedRoleSource": str(context.get("selectedRoleSource") or "").strip() or None,
        "desiredWork": str(context.get("desiredWork") or "").strip() or None,
        "userAnchorStrengths": _coerce_string_list(context.get("userAnchorStrengths"), max_items=4),
        "userAnchorEpisodes": _coerce_string_list(context.get("userAnchorEpisodes"), max_items=4),
        "profileAnchorIndustries": _coerce_string_list(context.get("profileAnchorIndustries"), max_items=4),
        "profileAnchorJobTypes": _coerce_string_list(context.get("profileAnchorJobTypes"), max_items=4),
        "companyAnchorKeywords": _coerce_string_list(context.get("companyAnchorKeywords"), max_items=6),
        "companyRoleCandidates": _coerce_string_list(context.get("companyRoleCandidates"), max_items=4),
        "companyWorkCandidates": _coerce_string_list(context.get("companyWorkCandidates"), max_items=4),
        "questionStage": str(context.get("questionStage") or "").strip() or "industry_reason",
    }
    return normalized


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


def _format_conversation_context_for_prompt(conversation_context: dict[str, Any] | None) -> str:
    context = _normalize_conversation_context(conversation_context)
    lines = [
        f"- 業界志望理由: {context['industryReason'] or '未整理'}",
        f"- 企業志望理由: {context['companyReason'] or '未整理'}",
        f"- 志望職種: {context['selectedRole'] or '未整理'}",
        f"- やりたい仕事: {context['desiredWork'] or '未整理'}",
        f"- 現在段階: {STAGE_LABELS.get(context['questionStage'], context['questionStage'])}",
    ]
    if context["companyRoleCandidates"]:
        lines.append(f"- 企業職種候補: {', '.join(context['companyRoleCandidates'])}")
    if context["companyWorkCandidates"]:
        lines.append(f"- 企業仕事内容候補: {', '.join(context['companyWorkCandidates'])}")
    return "\n".join(lines)


def _extract_company_keywords(company_context: str, max_items: int = 6) -> list[str]:
    keywords: list[str] = []
    if not company_context:
        return keywords
    for line in company_context.splitlines():
        cleaned = _clean_short_phrase(line, max_len=32)
        if not cleaned or len(cleaned) < 6:
            continue
        if any(token in cleaned for token in ["事業", "採用", "DX", "ソリューション", "サービス", "営業", "開発", "企画", "研究", "技術"]):
            if cleaned not in keywords:
                keywords.append(cleaned)
        if len(keywords) >= max_items:
            break
    return keywords


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


def _extract_work_candidates_from_context(company_context: str, max_items: int = 4) -> list[str]:
    patterns = [
        r"([^\n。]{0,20}(企画|提案|開発|運用|改善|推進|分析|支援|設計|研究)[^\n。]{0,12})",
    ]
    candidates: list[str] = []
    for line in company_context.splitlines():
        for pattern in patterns:
            match = re.search(pattern, line)
            if not match:
                continue
            candidate = _clean_short_phrase(match.group(1), max_len=34)
            if candidate and candidate not in candidates:
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


def _build_suggestion_option(label: str, source_type: str, intent: str) -> SuggestionOption:
    return SuggestionOption(
        id=re.sub(r"[^a-z0-9]+", "-", f"{intent}-{label.lower()}").strip("-")[:48] or intent,
        label=label[:48],
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


def _get_next_stage(conversation_context: dict[str, Any] | None) -> str:
    context = _normalize_conversation_context(conversation_context)
    if not context["industryReason"]:
        return "industry_reason"
    if not context["companyReason"]:
        return "company_reason"
    if not context["selectedRole"]:
        return "role_selection"
    if not context["desiredWork"]:
        return "desired_work"
    return "fit_connection"


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


def _build_stage_question(
    stage: str,
    company_name: str,
    company_features: list[str],
    role_candidates: list[str],
) -> str:
    feature = company_features[0] if company_features else f"{company_name}の事業"
    if stage == "industry_reason":
        return f"{feature}に触れて、なぜこの業界を志望したいと感じましたか。"
    if stage == "company_reason":
        return f"{company_name}のどの点が、他社ではなく志望先として強く残っていますか。"
    if stage == "role_selection":
        role_hint = role_candidates[0] if role_candidates else "職種"
        return f"{company_name}では、どの職種で力を発揮したいと考えていますか。{role_hint}に近いものがあれば教えてください。"
    if stage == "desired_work":
        return f"{company_name}に入社したら、まずどんな仕事に取り組みたいですか。"
    if stage == "closing":
        return f"{company_name}で実現したい目標を、一言でまとめると何ですか。"
    return f"{company_name}で活かせるご自身の経験や強みを、どこに結びつけたいですか。"


def _build_stage_specific_suggestion_options(
    stage: str,
    company_name: str,
    industry: str,
    company_context: str,
    gakuchika_context: list[dict] | None,
    profile_context: dict[str, Any] | None,
    company_role_candidates: list[str] | None,
    company_work_candidates: list[str] | None,
    conversation_context: dict[str, Any] | None,
) -> list[SuggestionOption]:
    features = _extract_company_features(company_context, max_features=4)
    company_keywords = _extract_company_keywords(company_context, max_items=6)
    role_candidates = _merge_candidate_lists(
        company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        company_work_candidates or [],
        _extract_work_candidates_from_context(company_context),
        max_items=4,
    )
    gakuchika_strength = _extract_gakuchika_strength(gakuchika_context) or "強み"
    gakuchika_episode = _extract_gakuchika_episode(gakuchika_context) or "学生時代の経験"
    profile_job_types = _extract_profile_job_types(profile_context)
    profile_industries = _extract_profile_industries(profile_context)
    context = _normalize_conversation_context(conversation_context)

    feature1 = features[0] if features else f"{company_name}の事業"
    feature2 = features[1] if len(features) > 1 else (company_keywords[0] if company_keywords else feature1)
    role1 = role_candidates[0] if role_candidates else (profile_job_types[0] if profile_job_types else "企画職")
    role2 = role_candidates[1] if len(role_candidates) > 1 else (profile_job_types[0] if profile_job_types else "営業職")
    work1 = work_candidates[0] if work_candidates else f"{feature1}に関わる企画"
    work2 = work_candidates[1] if len(work_candidates) > 1 else f"{feature2}の改善提案"
    profile_industry = profile_industries[0] if profile_industries else industry

    if stage == "industry_reason":
        labels = [
            (f"{feature1}を通じて{profile_industry}に惹かれたため", "hybrid"),
            (f"{gakuchika_episode}で培った{gakuchika_strength}を業界で活かしたいため", "gakuchika"),
            (f"{feature2}の社会的な価値に魅力を感じたから", "company"),
            (f"{profile_industry}×{company_name}の接点が自分の軸に合うため", "profile"),
        ]
    elif stage == "company_reason":
        labels = [
            (f"{feature1}と{gakuchika_strength}の接点を感じたため", "hybrid"),
            (f"{company_name}の{feature2}が志望業界の中でも印象的なため", "company"),
            (f"{gakuchika_episode}の経験を{company_name}で再現したいため", "gakuchika"),
            (f"{profile_job_types[0] if profile_job_types else role1}志望の軸と合うため", "profile"),
        ]
    elif stage == "role_selection":
        labels = [
            (f"{role1}で{gakuchika_strength}を活かしたい", "hybrid"),
            (f"{role2}で{feature1}に関わりたい", "company"),
            (f"{profile_job_types[0] if profile_job_types else role1}に近い役割を志望", "profile"),
            (f"{gakuchika_episode}の経験から{role1}に挑戦したい", "gakuchika"),
        ]
    elif stage == "desired_work":
        selected_role = context["selectedRole"] or role1
        labels = [
            (f"{selected_role}として{work1}に挑戦したい", "company"),
            (f"{gakuchika_episode}の経験を活かして{work2}を担いたい", "hybrid"),
            (f"{feature1}に近い領域で価値提供したい", "company"),
            (f"{selected_role}で顧客や現場に近い仕事をしたい", "profile"),
        ]
    elif stage == "closing":
        labels = [
            (f"{feature1}で新しい価値を生むこと", "company"),
            (f"{gakuchika_strength}を軸に成果を出すこと", "gakuchika"),
            (f"{context['desiredWork'] or work1}を形にすること", "hybrid"),
            (f"{company_name}で長く専門性を磨くこと", "profile"),
        ]
    else:
        labels = [
            (f"{gakuchika_episode}の経験を{feature1}に結びつけたい", "hybrid"),
            (f"{role1}で{gakuchika_strength}を再現したい", "gakuchika"),
            (f"{feature2}に自分の価値観が重なるため", "company"),
            (f"{context['desiredWork'] or work1}へ繋げたい", "profile"),
        ]

    return [_build_suggestion_option(label, source_type, stage) for label, source_type in labels[:4]]


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
            query = _build_adaptive_rag_query(scores, query)
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


@router.post("/next-question", response_model=NextQuestionResponse)
async def get_next_question(request: NextQuestionRequest):
    """
    Generate the next deep-dive question for motivation based on evaluation.
    """
    if not request.company_name:
        raise HTTPException(status_code=400, detail="企業名が指定されていません")

    industry = request.industry or "この業界"
    conversation_context = _normalize_conversation_context(request.conversation_context)
    company_context, company_sources = await _get_company_context(request.company_id)
    company_features = _extract_company_features(company_context, max_features=4)
    role_candidates = _merge_candidate_lists(
        request.company_role_candidates or [],
        _extract_role_candidates_from_context(company_context),
        _extract_profile_job_types(request.profile_context),
        max_items=4,
    )
    work_candidates = _merge_candidate_lists(
        request.company_work_candidates or [],
        _extract_work_candidates_from_context(company_context),
        max_items=4,
    )
    conversation_context["companyAnchorKeywords"] = _merge_candidate_lists(
        conversation_context["companyAnchorKeywords"],
        company_features,
        _extract_company_keywords(company_context),
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

    stage = _get_next_stage(conversation_context)
    if not request.conversation_history:
        stage = "industry_reason"
    conversation_context["questionStage"] = stage

    # Evaluate current progress (pass pre-fetched context to avoid duplicate RAG call)
    eval_result = await _evaluate_motivation_internal(request, company_context=company_context)
    scores = MotivationScores(**eval_result["scores"])
    weakest_element = eval_result["weakest_element"]
    is_complete = eval_result["is_complete"]
    missing_aspects = eval_result.get("missing_aspects", {})

    # If complete, suggest ending
    if is_complete:
        completion_suggestions = _build_completion_suggestions(
            company_name=request.company_name,
            industry=industry,
            company_context=company_context,
        )
        completion_options = [
            _build_suggestion_option(label, "hybrid" if index == 2 else "company", "closing")
            for index, label in enumerate(completion_suggestions)
        ]
        evidence_summary = _build_evidence_summary_from_sources(
            company_sources, focus="締めに使う企業根拠"
        )
        conversation_context["questionStage"] = "closing"

        return NextQuestionResponse(
            question="これまでの深掘りで、志望動機の核となる部分が具体的に整理できました。最後に、この企業で実現したい一番の目標を一言でまとめると何ですか？",
            reasoning="全要素が基準値に達したため、締めの質問",
            should_continue=False,
            suggested_end=True,
            evaluation=eval_result,
            target_element="career_vision",
            company_insight=None,
            suggestions=completion_suggestions,
            suggestion_options=completion_options,
            evidence_summary=evidence_summary,
            question_stage="closing",
            captured_context=conversation_context,
            coaching_focus="志望動機を締める",
            risk_flags=_coerce_risk_flags(eval_result.get("risk_flags"), max_items=2),
        )

    if stage in {"industry_reason", "company_reason", "role_selection", "desired_work"}:
        stage_options = _build_stage_specific_suggestion_options(
            stage=stage,
            company_name=request.company_name,
            industry=industry,
            company_context=company_context,
            gakuchika_context=request.gakuchika_context,
            profile_context=request.profile_context,
            company_role_candidates=role_candidates,
            company_work_candidates=work_candidates,
            conversation_context=conversation_context,
        )
        question = _build_stage_question(stage, request.company_name, company_features, role_candidates)
        evidence_summary = _build_evidence_summary_from_sources(
            company_sources, focus=f"{STAGE_LABELS.get(stage, stage)}の根拠"
        )
        target_element = {
            "industry_reason": "company_understanding",
            "company_reason": "differentiation",
            "role_selection": "career_vision",
            "desired_work": "career_vision",
        }.get(stage, weakest_element)
        return NextQuestionResponse(
            question=question,
            reasoning=f"{STAGE_LABELS.get(stage, stage)}を先に固めるための質問",
            should_continue=True,
            suggested_end=False,
            evaluation=eval_result,
            target_element=target_element,
            company_insight=company_features[0] if company_features else None,
            suggestions=[option.label for option in stage_options],
            suggestion_options=stage_options,
            evidence_summary=evidence_summary,
            question_stage=stage,
            captured_context=conversation_context,
            coaching_focus=STAGE_LABELS.get(stage, stage),
            risk_flags=_coerce_risk_flags(eval_result.get("risk_flags"), max_items=2),
        )

    # Generate targeted question
    weakest_jp = _get_element_japanese_name(weakest_element)
    missing_for_weakest = missing_aspects.get(weakest_element, [])
    missing_aspects_text = f"「{weakest_jp}」で不足: {', '.join(missing_for_weakest)}" if missing_for_weakest else ""

    safe_company_name = sanitize_prompt_input(request.company_name, max_length=200)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    profile_section = _format_profile_for_prompt(request.profile_context)
    conversation_context_section = _format_conversation_context_for_prompt(conversation_context)
    prompt = MOTIVATION_QUESTION_PROMPT.format(
        company_name=safe_company_name,
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        company_context=company_context or "（企業情報なし）",
        gakuchika_section=gakuchika_section,
        profile_section=profile_section,
        conversation_context=conversation_context_section,
        company_understanding_score=scores.company_understanding,
        self_analysis_score=scores.self_analysis,
        career_vision_score=scores.career_vision,
        differentiation_score=scores.differentiation,
        weakest_element=weakest_jp,
        missing_aspects=missing_aspects_text,
        question_stage=stage,
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
    suggestion_options = [
        _build_suggestion_option(s, "hybrid" if index == 0 else "company", stage)
        for index, s in enumerate(suggestions)
    ]
    evidence_summary = (
        data.get("evidence_summary")
        or _build_evidence_summary_from_sources(company_sources, focus="質問の根拠")
    )
    conversation_context["questionStage"] = stage
    risk_flags = _coerce_risk_flags(data.get("risk_flags"), max_items=2) or _coerce_risk_flags(
        eval_result.get("risk_flags"), max_items=2
    )

    return NextQuestionResponse(
        question=data["question"],
        reasoning=data.get("reasoning"),
        should_continue=data.get("should_continue", True),
        suggested_end=data.get("suggested_end", False),
        evaluation=eval_result,
        target_element=data.get("target_element", weakest_element),
        company_insight=data.get("company_insight"),
        suggestions=suggestions,
        suggestion_options=suggestion_options,
        evidence_summary=evidence_summary,
        question_stage=stage,
        captured_context=conversation_context,
        coaching_focus=str(data.get("coaching_focus") or STAGE_LABELS.get(stage, stage)),
        risk_flags=risk_flags,
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

        industry = request.industry or "この業界"
        conversation_context = _normalize_conversation_context(request.conversation_context)

        # Step 1: RAG context fetch
        yield _sse_event("progress", {
            "step": "rag", "progress": 15, "label": "企業情報を取得中...",
        })
        await asyncio.sleep(0.05)

        company_context, company_sources = await _get_company_context(request.company_id)
        company_features = _extract_company_features(company_context, max_features=4)
        role_candidates = _merge_candidate_lists(
            request.company_role_candidates or [],
            _extract_role_candidates_from_context(company_context),
            _extract_profile_job_types(request.profile_context),
            max_items=4,
        )
        work_candidates = _merge_candidate_lists(
            request.company_work_candidates or [],
            _extract_work_candidates_from_context(company_context),
            max_items=4,
        )
        conversation_context["companyAnchorKeywords"] = _merge_candidate_lists(
            conversation_context["companyAnchorKeywords"],
            company_features,
            _extract_company_keywords(company_context),
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
        stage = _get_next_stage(conversation_context)
        if not request.conversation_history:
            stage = "industry_reason"
        conversation_context["questionStage"] = stage

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
            completion_suggestions = _build_completion_suggestions(
                company_name=request.company_name,
                industry=industry,
                company_context=company_context,
            )
            completion_options = [
                _build_suggestion_option(label, "hybrid" if index == 2 else "company", "closing")
                for index, label in enumerate(completion_suggestions)
            ]
            evidence_summary = _build_evidence_summary_from_sources(
                company_sources, focus="締めに使う企業根拠"
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
                    "suggestion_options": [option.model_dump() for option in completion_options],
                    "evidence_summary": evidence_summary,
                    "question_stage": "closing",
                    "captured_context": conversation_context,
                    "coaching_focus": "志望動機を締める",
                    "risk_flags": _coerce_risk_flags(eval_result.get("risk_flags"), max_items=2),
                },
            })
            return

        if stage in {"industry_reason", "company_reason", "role_selection", "desired_work"}:
            stage_options = _build_stage_specific_suggestion_options(
                stage=stage,
                company_name=request.company_name,
                industry=industry,
                company_context=company_context,
                gakuchika_context=request.gakuchika_context,
                profile_context=request.profile_context,
                company_role_candidates=role_candidates,
                company_work_candidates=work_candidates,
                conversation_context=conversation_context,
            )
            evidence_summary = _build_evidence_summary_from_sources(
                company_sources, focus=f"{STAGE_LABELS.get(stage, stage)}の根拠"
            )
            yield _sse_event("complete", {
                "data": {
                    "question": _build_stage_question(stage, request.company_name, company_features, role_candidates),
                    "reasoning": f"{STAGE_LABELS.get(stage, stage)}を先に固めるための質問",
                    "should_continue": True,
                    "suggested_end": False,
                    "evaluation": eval_result,
                    "target_element": {
                        "industry_reason": "company_understanding",
                        "company_reason": "differentiation",
                        "role_selection": "career_vision",
                        "desired_work": "career_vision",
                    }.get(stage, weakest_element),
                    "company_insight": company_features[0] if company_features else None,
                    "suggestions": [option.label for option in stage_options],
                    "suggestion_options": [option.model_dump() for option in stage_options],
                    "evidence_summary": evidence_summary,
                    "question_stage": stage,
                    "captured_context": conversation_context,
                    "coaching_focus": STAGE_LABELS.get(stage, stage),
                    "risk_flags": _coerce_risk_flags(eval_result.get("risk_flags"), max_items=2),
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
        profile_section = _format_profile_for_prompt(request.profile_context)
        conversation_context_section = _format_conversation_context_for_prompt(conversation_context)
        prompt = MOTIVATION_QUESTION_PROMPT.format(
            company_name=sanitize_prompt_input(request.company_name, max_length=200),
            industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
            company_context=company_context or "（企業情報なし）",
            gakuchika_section=gakuchika_section,
            profile_section=profile_section,
            conversation_context=conversation_context_section,
            company_understanding_score=scores.company_understanding,
            self_analysis_score=scores.self_analysis,
            career_vision_score=scores.career_vision,
            differentiation_score=scores.differentiation,
            weakest_element=weakest_jp,
            missing_aspects=missing_aspects_text,
            question_stage=stage,
            threshold=ELEMENT_COMPLETION_THRESHOLD,
        )

        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        # Stream LLM response with field-level events
        llm_result = None
        async for event in call_llm_streaming_fields(
            system_prompt=prompt,
            user_message="次の深掘り質問を生成してください。",
            messages=messages,
            max_tokens=900,
            temperature=0.5,
            feature="motivation",
            schema_hints={
                "question": "string",
                "suggestions": "array",
                "evidence_summary": "string",
                "coaching_focus": "string",
                "risk_flags": "array",
            },
            stream_string_fields=["question"],
        ):
            if event.type == "chunk":
                yield _sse_event("chunk", {"text": event.text})
            elif event.type == "string_chunk":
                yield _sse_event("string_chunk", {"path": event.path, "text": event.text})
            elif event.type == "field_complete":
                yield _sse_event("field_complete", {"path": event.path, "value": event.value})
            elif event.type == "array_item_complete":
                yield _sse_event("array_item_complete", {"path": event.path, "value": event.value})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                })
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success:
            error = llm_result.error if llm_result else None
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
        suggestion_options = [
            _build_suggestion_option(s, "hybrid" if index == 0 else "company", stage)
            for index, s in enumerate(suggestions)
        ]
        evidence_summary = (
            data.get("evidence_summary")
            or _build_evidence_summary_from_sources(company_sources, focus="質問の根拠")
        )
        risk_flags = _coerce_risk_flags(data.get("risk_flags"), max_items=2) or _coerce_risk_flags(
            eval_result.get("risk_flags"), max_items=2
        )

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
                "suggestion_options": [option.model_dump() for option in suggestion_options],
                "evidence_summary": evidence_summary,
                "question_stage": stage,
                "captured_context": conversation_context,
                "coaching_focus": str(data.get("coaching_focus") or STAGE_LABELS.get(stage, stage)),
                "risk_flags": risk_flags,
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
