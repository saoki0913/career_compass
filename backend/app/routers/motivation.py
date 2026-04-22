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

from __future__ import annotations

import asyncio
import copy
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncGenerator, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.security.career_principal import (
    CareerPrincipal,
    require_career_principal,
)
from app.security.sse_concurrency import (
    SseConcurrencyExceeded,
    SseLease,
)

from app.utils.llm import (
    PromptSafetyError,
    call_llm_with_error,
    call_llm_streaming_fields,
    consume_request_llm_cost_summary,
    sanitize_prompt_input,
)
from app.utils.vector_store import get_enhanced_context_for_review_with_sources
from app.config import settings
from app.utils.secure_logger import get_logger
from app.utils.content_types import content_type_label
from app.prompts.motivation_prompts import (
    MOTIVATION_EVALUATION_PROMPT,
    MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
)
from app.prompts.es_templates import (
    build_template_draft_generation_prompt,
    draft_synthetic_question_company_motivation,
    get_company_honorific,
)
from app.utils.es_draft_text import normalize_es_draft_single_paragraph
from app.limiter import limiter

# Sub-module imports
from app.routers.motivation_models import (
    DeepDiveGap,
    EvidenceCard,
    GenerateDraftFromProfileRequest,
    GenerateDraftRequest,
    GenerateDraftResponse,
    Message,
    MotivationEvaluation,
    MotivationScores,
    MotivationScoresInput,
    NextQuestionRequest,
    NextQuestionResponse,
    StageStatus,
)
from app.routers.motivation_context import (
    COMPANY_GENERIC_PATTERNS,
    COMPANY_TEXT_NOISE_KEYWORDS,
    COMPANY_TEXT_NOISE_PATTERNS,
    CONTRADICTION_PATTERNS,
    CONTRIBUTION_ACTION_TOKENS,
    CONTRIBUTION_TARGET_TOKENS,
    CONTRIBUTION_VALUE_TOKENS,
    CONVERSATION_MODE_DEEPDIVE,
    CONVERSATION_MODE_SLOT_FILL,
    MAX_WEAK_SLOT_REASKS,
    REQUIRED_MOTIVATION_STAGES,
    SLOT_FILL_INTENTS,
    SLOT_STATE_ELIGIBLE_FOR_ASK,
    SLOT_STATE_ORDER,
    SLOT_STATE_VALUES,
    STAGE_CONFIRMED_FACT_KEYS,
    STAGE_LABELS,
    UNRESOLVED_PATTERNS,
    _answer_is_confirmed_for_stage,
    _answer_signals_contradiction,
    _answer_signals_unresolved,
    _build_open_slots_from_confirmed_facts,
    _capture_answer_into_context,
    _classify_slot_state,
    _clean_short_phrase,
    _coerce_risk_flags,
    _coerce_stage_list,
    _coerce_string_list,
    _confirmed_fact_key_for_stage,
    _contains_any_token,
    _count_matching_groups,
    _default_confirmed_facts,
    _default_reask_budget_by_slot,
    _default_slot_evidence_sentences,
    _default_slot_intents_asked,
    _default_slot_states,
    _default_slot_summaries,
    _default_weak_slot_retries,
    _has_company_specificity,
    _is_noisy_company_text,
    _legacy_slot_state,
    _looks_like_role_reason,
    _normalize_causal_gaps,
    _normalize_confirmed_facts,
    _normalize_conversation_context,
    _normalize_forbidden_reasks,
    _normalize_slot_state,
    _normalize_slot_state_map,
    _normalize_slot_status_v2,
    _normalize_slot_summary_map,
    _normalize_slot_evidence_map,
    _normalize_slot_intents_map,
    _normalize_weak_slot_retries,
    _sanitize_existing_grounding_candidates,
    _slot_priority,
)
from app.routers.motivation_planner import (
    DEEPDIVE_INTENT_BY_GAP_ID,
    NEXT_ADVANCE_CONDITION_BY_SLOT,
    _build_progress_payload,
    _compute_deterministic_causal_gaps,
    _determine_next_turn,
    _slot_label,
)
from app.routers.motivation_sanitizers import (
    format_conversation as _format_conversation,
    prompt_safety_http_error as _prompt_safety_http_error,
    sanitize_generate_draft_from_profile_request as _sanitize_generate_draft_from_profile_request,
    sanitize_generate_draft_request as _sanitize_generate_draft_request,
    sanitize_next_question_request as _sanitize_next_question_request,
    sanitize_request_messages as _sanitize_request_messages,
    sanitize_request_text as _sanitize_request_text,
)
from app.routers.motivation_contract import (
    build_stage_status as _build_stage_status,
)
# D-2 / P2-1: ES 添削用の grounding ヘルパを志望動機ドラフトで再利用
from app.routers.es_review_grounding import (
    _assess_company_evidence_coverage,
    _build_company_evidence_cards,
)
# D-3 / P2-2: AI 臭検出と Tier 2 リトライヒントを志望動機ドラフトで再利用
from app.routers.es_review_validation import (
    _compute_ai_smell_score,
    _detect_ai_smell_patterns,
    _is_within_char_limits,
)
from app.routers.es_review_retry import _build_ai_smell_retry_hints

logger = get_logger(__name__)

router = APIRouter(prefix="/api/motivation", tags=["motivation"])

# Configuration
ELEMENT_COMPLETION_THRESHOLD = 70  # Each element needs 70%+ to be complete


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

QUESTION_DIFFICULTY_MAX = 3

WEAKNESS_TAG_TO_STAGE = {
    "company_reason_generic": "company_reason",
    "desired_work_too_abstract": "desired_work",
    "value_contribution_vague": "value_contribution",
    "differentiation_missing": "differentiation",
    "why_now_missing": "company_reason",
    "self_connection_weak": "self_connection",
}

QUESTION_WORDING_BY_STAGE: dict[str, tuple[str, ...]] = {
    "industry_reason": (
        "その業界を志望する理由として最も近いものを1つ教えてください。",
        "その業界に関心を持つようになったきっかけは何ですか？",
        "その業界を選ぶ理由は、関わりたい課題と働き方のどちらに近いですか？",
    ),
    "company_reason": (
        "{company_name}を志望する理由として最も近いものを1つ教えてください。",
        "{company_name}に惹かれる点は、事業の特徴・仕事の進め方・関われるテーマのどれに近いですか？",
        "{company_name}を選ぶ理由は、扱うテーマと働き方のどちらにより近いですか？",
    ),
    "self_connection": (
        "これまでの経験や価値観は、その仕事とどうつながりますか？",
        "過去の経験のうち、今の志望理由に一番つながるものは何ですか？",
        "その志望理由に近い原体験や価値観があれば、短く教えてください。",
    ),
    "desired_work": (
        "入社後に挑戦したい仕事を1つ教えてください。",
        "入社後に関わりたい相手やテーマは何に近いですか？",
        "まず挑戦したい仕事は、提案・企画・課題整理のどれに近いですか？",
    ),
    "value_contribution": (
        "入社後にどんな価値を出したいかを1文で教えてください。",
        "仕事を通じて相手にどう役立ちたいかを教えてください。",
        "価値発揮のイメージは、整理して前に進めることと提案して動かすことのどちらに近いですか？",
    ),
    "differentiation": (
        "他社ではなくこの企業を選びたい理由を1つ教えてください。",
        "比較したときに、この企業のほうが合うと感じる点は何ですか？",
        "最終的にこの企業を選ぶ理由は、仕事内容と働き方のどちらに近いですか？",
    ),
}

ANSWER_CONTRACTS: dict[str, dict[str, Any]] = {
    "industry_reason": {
        "expected_answer": "業界を志望する理由を1文で答える",
        "forbidden_topics": ["company_reason", "desired_work", "self_pr"],
        "min_specificity": "業界を選ぶ理由が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "company_reason": {
        "expected_answer": "その会社に惹かれる理由を1文で答える",
        "forbidden_topics": ["industry_general_only", "desired_work", "value_contribution_only"],
        "min_specificity": "企業固有性か企業を選ぶ軸が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "self_connection": {
        "expected_answer": "経験・価値観・強みのどれかが志望理由や仕事につながる形で答える",
        "forbidden_topics": ["company_reason_only", "desired_work_only"],
        "min_specificity": "自分の過去と志望の接点があること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "desired_work": {
        "expected_answer": "入社後に挑戦したい仕事を1文で答える",
        "forbidden_topics": ["growth_only", "value_contribution_only"],
        "min_specificity": "仕事像か相手像が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "value_contribution": {
        "expected_answer": "どう価値を出したいかを1文で答える",
        "forbidden_topics": ["desired_work_only", "growth_only"],
        "min_specificity": "相手や組織への価値発揮が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "differentiation": {
        "expected_answer": "他社ではなくその会社である理由を1文で答える",
        "forbidden_topics": ["company_reason_rephrase_only", "industry_general_only"],
        "min_specificity": "比較視点か選ぶ決め手が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "deepdive_company_reason_strengthening": {
        "expected_answer": "企業理由と自分の経験・価値観をつないで補強する",
        "forbidden_topics": ["new_fact", "desired_work_only"],
        "min_specificity": "企業理由が自分の経験と因果でつながること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
    "deepdive_desired_work_clarity": {
        "expected_answer": "やりたい仕事の具体像を1〜2文で補強する",
        "forbidden_topics": ["growth_only", "company_reason_only"],
        "min_specificity": "相手・課題・仕事のいずれかが具体化されること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
    "deepdive_value_contribution_clarity": {
        "expected_answer": "価値発揮の仕方を1〜2文で補強する",
        "forbidden_topics": ["desired_work_only", "new_fact"],
        "min_specificity": "価値の出し方が分かること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
}

MAX_STAGE_REASKS = 1

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


def _format_answer_contract_for_prompt(
    *,
    stage: str,
    weakness_tag: str | None = None,
    wording_level: int = 1,
) -> str:
    contract = _build_answer_contract(stage, weakness_tag=weakness_tag)
    forbidden = contract.get("forbidden_topics") or []
    forbidden_text = ", ".join(str(item) for item in forbidden) if forbidden else "なし"
    return (
        "## 回答契約\n"
        f"- 期待する答え: {contract.get('expected_answer')}\n"
        f"- 最低限の具体性: {contract.get('min_specificity')}\n"
        f"- 禁止論点: {forbidden_text}\n"
        f"- 許容文数: {contract.get('allow_sentence_count')}文まで\n"
        f"- 質問レベル: {wording_level}"
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

QUESTION_KEYWORDS_BY_STAGE = {
    "industry_reason": ("業界", "分野", "領域", "セクター", "関心", "理由", "きっかけ", "今"),
    "company_reason": ("理由", "魅力", "惹かれ", "きっかけ", "選ぶ", "特徴", "事業"),
    "self_connection": ("経験", "価値観", "強み", "つなが", "活か", "原体験", "学び", "きっかけ"),
    "desired_work": ("入社後", "仕事", "挑戦", "担い", "関わり", "取り組", "チーム"),
    "value_contribution": ("価値", "貢献", "役立", "実現", "前に進め", "発揮", "出したい", "支え"),
    "differentiation": ("他社", "違い", "選ぶ", "理由", "だからこそ", "比較", "決め手", "最も", "ならでは"),
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
    normalized_current_stage = (
        "self_connection" if current_stage in {"origin_experience", "fit_connection"} else current_stage
    )
    slot_states = _normalize_slot_state_map(context.get("slotStates"))
    completed = [
        stage for stage in REQUIRED_MOTIVATION_STAGES
        if slot_states.get(stage) == "locked"
    ]

    pending = [stage for stage in STAGE_ORDER if stage not in completed and stage != normalized_current_stage]
    return StageStatus(current=normalized_current_stage, completed=completed, pending=pending)


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
    VALID_ENDINGS = ("？", "?", "ください。", "しょうか。", "すか。", "ますか。")
    if normalized and not any(normalized.endswith(e) for e in VALID_ENDINGS):
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
        # D-1: 開放型に統一、関心のきっかけ系も追加
        if selected_industry:
            return [
                f"{selected_industry}業界を志望する理由を1つ教えてください。",
                f"{selected_industry}業界に関心を持ったきっかけは何ですか？",
                f"{selected_industry}業界のどんな分野に今もっとも興味がありますか？",
                f"{selected_industry}業界で関わりたい領域があれば教えてください。",
            ]
        return [
            "この業界を志望する理由を1つ教えてください。",
            "いまの業界選びで関心を持っている理由を教えてください。",
            "この業界のどの領域に今もっとも興味がありますか？",
        ]

    if normalized_stage == "company_reason":
        # D-1: 「最も近いものを1つ」選択型・「{企業名}で{職種}を考えるとき」機械的ペアリングを廃止
        if selected_role and confirmed is not None and not confirmed["company_reason_confirmed"]:
            return [
                f"{company_name}の事業や取り組みで、気になっている点はありますか？",
                f"{company_name}に惹かれる理由が1つあるとしたら、何でしょうか？",
                f"{company_name}で特に関心を持った特徴を教えてください。",
                f"{company_name}を選ぶきっかけになった情報があれば教えてください。",
            ]
        if selected_role:
            return [
                f"{company_name}の事業や取り組みで、気になっている点を1つ教えてください。",
                f"{company_name}に惹かれるきっかけになった事柄は何ですか？",
                f"{company_name}のどの特徴に共感していますか？",
                f"{company_name}を志望する理由を一言で教えてください。",
            ]
        return [
            f"{company_name}を志望する理由を1つ教えてください。",
            f"{company_name}に惹かれる点を1つ教えてください。",
            f"{company_name}の事業や取り組みで気になる点はありますか？",
            f"{company_name}を選ぶきっかけになった情報があれば教えてください。",
        ]

    if normalized_stage == "self_connection":
        if gakuchika_episode:
            return [
                f"{gakuchika_episode}の経験は、今の志望とどうつながっていますか？",
                f"{gakuchika_episode}で身につけた強みは、今の志望にどう活かせそうですか？",
                "ご自身の経験や価値観の中で、今の志望につながるものは何ですか？",
                "これまでの経験で、今の志望に影響している学びはありますか？",
            ]
        return [
            "ご自身の経験や価値観の中で、今の志望につながるものは何ですか？",
            "これまでの経験で、今の志望に影響していることはありますか？",
            "今の志望理由に近い原体験や価値観があれば教えてください。",
            "自分の強みのうち、今の志望と特につなげやすいと感じるものは何ですか？",
        ]

    if normalized_stage == "desired_work":
        if selected_role and desired_work:
            return [
                f"入社後、{selected_role}として{desired_work}の中で特に挑戦したいことは何ですか？",
                f"入社後、{selected_role}として{desired_work}にどう関わりたいですか？",
                f"{selected_role}として{desired_work}で担いたい役割を教えてください。",
                f"{selected_role}として{desired_work}の中で一番取り組みたいテーマは何ですか？",
            ]
        if selected_role:
            return [
                f"入社後、{selected_role}としてどんな仕事に挑戦したいですか？",
                f"入社後、{selected_role}としてどんな役割を担いたいですか？",
                f"{selected_role}として関わってみたいチームや領域はありますか？",
                f"{selected_role}として一番取り組みたいテーマは何ですか？",
            ]
        return [
            "入社後にどんな仕事へ挑戦したいですか？",
            "入社後にどんな役割を担いたいですか？",
            "入社後に関わりたいチームや領域はありますか？",
            "入社後に一番取り組みたいテーマは何ですか？",
        ]

    if normalized_stage == "value_contribution":
        return [
            "入社後、どんな価値や貢献を出したいですか？",
            "その仕事を通じて、相手にどんな価値を届けたいですか？",
            "入社後、まずどんな形で役立ちたいと考えていますか？",
            "自分の強みを使って、どんな価値を発揮したいですか？",
        ]

    if normalized_stage == "differentiation":
        return [
            f"同業他社ではなく、{company_name}を選ぶ理由は何ですか？",
            f"同業他社と比べて、{company_name}に惹かれる理由は何ですか？",
            f"{company_name}を選ぶ決め手になっている理由を教えてください。",
            f"他社と比較したうえで、{company_name}だからこそ選びたいと感じる点は何ですか？",
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
    validation_report: dict | None = None,
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

    def _record_fallback(reason: str) -> None:
        # E-2 / P3-4: 副作用オブジェクトで採用結果を可視化（ログは既存動作を温存）
        logger.info("[Motivation] question_fallback reason=%s stage=%s", reason, stage)
        if validation_report is not None:
            validation_report["fallback_used"] = True
            validation_report["fallback_reason"] = reason

    if not normalized:
        _record_fallback("empty")
        return fallback
    if any(token in normalized for token in GENERIC_QUESTION_BLOCKLIST):
        _record_fallback("generic_blocklist")
        return fallback
    if _looks_like_instruction_or_ui_copy(normalized):
        _record_fallback("instruction_copy")
        return fallback
    if _looks_like_multi_part_question(normalized):
        _record_fallback("multi_part")
        return fallback
    if stage in {"company_reason", "differentiation", "closing"} and _mentions_other_company_name(normalized, company_name):
        _record_fallback("other_company")
        return fallback
    if _question_uses_unconfirmed_premise(
        question=normalized,
        stage=stage,
        selected_role=selected_role,
        desired_work=desired_work,
        confirmed_facts=confirmed_facts,
    ):
        _record_fallback("unconfirmed_premise")
        return fallback
    # P2-6: 企業名が長いほど質問文も自然に長くなるため、会社名長さを許容枠に上乗せする
    max_length = 80 + len(company_name or "")
    if len(normalized) > max_length:
        _record_fallback("too_long")
        return fallback
    if not any(keyword in normalized for keyword in QUESTION_KEYWORDS_BY_STAGE.get(stage, ())):
        _record_fallback("missing_keyword")
        return fallback
    if stage == "company_reason" and normalized.startswith("入社後"):
        _record_fallback("stage_specific")
        return fallback
    if validation_report is not None:
        validation_report.setdefault("fallback_used", False)
        validation_report.setdefault("fallback_reason", None)
    return normalized


def _question_signature(text: str) -> str:
    return re.sub(r"[\s、。・/／!?？「」（）\-\u3000]", "", (text or "").strip())


def _semantic_question_signature(
    *,
    stage: str,
    question_intent: str | None,
    company_anchor: str | None,
    role_anchor: str | None,
    evidence_basis: str | None,
    wording_level: int,
) -> str:
    parts = [
        stage.strip(),
        str(question_intent or "").strip(),
        str(company_anchor or "").strip(),
        str(role_anchor or "").strip(),
        str(evidence_basis or "").strip(),
        str(wording_level),
    ]
    return "|".join(re.sub(r"\s+", "", part) for part in parts if part)


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
    semantic_signature: str | None = None,
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


def _build_answer_contract(stage: str, *, weakness_tag: str | None = None) -> dict[str, Any]:
    if weakness_tag:
        key_map = {
            "company_reason_generic": "deepdive_company_reason_strengthening",
            "desired_work_too_abstract": "deepdive_desired_work_clarity",
            "value_contribution_vague": "deepdive_value_contribution_clarity",
        }
        key = key_map.get(weakness_tag)
        if key in ANSWER_CONTRACTS:
            return ANSWER_CONTRACTS[key].copy()
    return ANSWER_CONTRACTS.get(stage, {
        "expected_answer": "質問に直接答える",
        "forbidden_topics": [],
        "min_specificity": "質問への答えが分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    }).copy()


def _allow_sentence_count_for_stage(stage: str, *, weakness_tag: str | None = None) -> int:
    contract = _build_answer_contract(stage, weakness_tag=weakness_tag)
    try:
        return max(int(contract.get("allow_sentence_count") or 1), 1)
    except (TypeError, ValueError):
        return 1


def _question_difficulty_level(stage_attempt_count: int) -> int:
    return min(max(int(stage_attempt_count or 0) + 1, 1), QUESTION_DIFFICULTY_MAX)


def _wording_level_question(stage: str, level: int, *, company_name: str | None = None) -> str | None:
    templates = QUESTION_WORDING_BY_STAGE.get(stage)
    if not templates:
        return None
    index = min(max(level, 1), len(templates)) - 1
    template = templates[index]
    if "{company_name}" in template:
        return template.format(company_name=company_name or "この企業")
    return template


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
    validation_report: dict | None = None,
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
        validation_report=validation_report,
    )


def _get_next_stage(
    conversation_context: dict[str, Any] | None,
    *,
    missing_slots: list[str] | None = None,
    slot_status_v2: dict[str, str] | None = None,
    ready_for_draft: bool = False,
    weakest_element: str | None = None,
    is_complete: bool | None = None,
) -> str:
    if is_complete is True:
        ready_for_draft = True
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context.get("confirmedFacts"))
    slot_states = _normalize_slot_status_v2(slot_status_v2)
    weak_slot_retries = _normalize_weak_slot_retries(context.get("weakSlotRetries"))
    closed_slots = set(_coerce_stage_list(context.get("closedSlots"), max_items=8))
    recently_closed_slots = set(_coerce_stage_list(context.get("recentlyClosedSlots"), max_items=4))
    current_stage = context.get("questionStage") or "industry_reason"
    stage_attempt_count = context.get("stageAttemptCount") or 0

    if slot_status_v2:
        current_state = slot_states.get(current_stage, "missing")
        if current_state == "filled_strong":
            closed_slots.add(current_stage)
        if current_state == "filled_weak" and weak_slot_retries.get(current_stage, 0) >= MAX_WEAK_SLOT_REASKS:
            closed_slots.add(current_stage)

    current_key = STAGE_CONFIRMED_FACT_KEYS.get(current_stage)
    if (
        current_key
        and not confirmed_facts[current_key]
        and current_stage not in closed_slots
        and (not slot_status_v2 or slot_states.get(current_stage) in {"missing", "partial"})
    ):
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

    for stage in REQUIRED_MOTIVATION_STAGES:
        if slot_states.get(stage) == "missing" and stage not in closed_slots:
            return stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        if slot_states.get(stage) == "partial" and stage not in closed_slots:
            return stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        if (
            slot_states.get(stage) == "filled_weak"
            and weak_slot_retries.get(stage, 0) < MAX_WEAK_SLOT_REASKS
            and stage not in closed_slots
            and stage not in recently_closed_slots
        ):
            return stage

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


def _self_connection_has_causal_link(
    text: str | None,
    *,
    company_reason: str | None,
    desired_work: str | None,
) -> bool:
    normalized = " ".join((text or "").split()).strip()
    if len(normalized) < 18:
        return False
    has_anchor = any(token in normalized for token in ("経験", "価値観", "強み", "原体験", "培", "学ん"))
    has_link = any(token in normalized for token in ("つなが", "活か", "生か", "だからこそ", "結び", "土台", "につなが"))
    if not (has_anchor and has_link):
        return False
    if company_reason and any(token in normalized for token in ("企業", "御社", "貴社", "志望")):
        return True
    if desired_work and any(token in normalized for token in ("仕事", "入社後", "役割", "提案", "企画", "課題")):
        return True
    return True


def _slot_meets_draft_minimum(state: str | None) -> bool:
    return _normalize_slot_state(state or "") in {"filled_strong", "filled_weak"}


def _compute_draft_gate(
    *,
    slot_status_v2: dict[str, str],
    conversation_context: dict[str, Any] | None,
) -> tuple[bool, list[str]]:
    context = _normalize_conversation_context(conversation_context)
    blockers: list[str] = []
    for stage in ("company_reason", "desired_work", "differentiation"):
        if not _slot_meets_draft_minimum(slot_status_v2.get(stage)):
            blockers.append(stage)
    self_connection_state = slot_status_v2.get("self_connection")
    self_connection_text = context.get("selfConnection")
    if self_connection_state not in {"filled_strong", "filled_weak"}:
        blockers.append("self_connection")
    elif self_connection_text and not _self_connection_has_causal_link(
        self_connection_text,
        company_reason=context.get("companyReason"),
        desired_work=context.get("desiredWork"),
    ):
        blockers.append("self_connection")
    return len(blockers) == 0, blockers


def _coerce_motivation_stage_for_ui(stage: str | None) -> str:
    raw = str(stage or "").strip() or "industry_reason"
    if raw == "closing":
        return "differentiation"
    return raw


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
    stage = "self_connection" if stage in {"origin_experience", "fit_connection"} else stage
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
        "**このターンでは参照しない**（後続の self_connection / value_contribution / differentiation で反映する）。\n"
        "- スコア欄は参考情報であり、段階を飛ばす理由にならない。"
    )


@dataclass
class _MotivationQuestionPrep:
    conversation_context: dict[str, Any]
    industry: str
    generated_draft: str | None
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
    has_generated_draft: bool
    conversation_mode: str
    current_slot: str | None
    current_intent: str | None
    next_advance_condition: str | None
    unlock_reason: str | None
    progress: dict[str, Any]
    causal_gaps: list[dict[str, str]]


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
    conversation_context: dict[str, Any] | None = None,
) -> dict:
    """
    Internal evaluation logic. Accepts optional pre-fetched company context
    to avoid redundant RAG calls when invoked from get_next_question().
    """
    normalized_context = _normalize_conversation_context(
        conversation_context if conversation_context is not None else request.conversation_context
    )

    if not request.conversation_history:
        return {
            "evaluation_status": "ok",
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
            "slot_status_v2": {
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
            "weak_slots": [],
            "do_not_ask_slots": [],
            "ready_for_draft": False,
            "draft_readiness_reason": "志望動機の骨格がまだ揃っていないため",
            "draft_blockers": ["company_reason", "desired_work", "differentiation", "self_connection"],
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
        role_hint = _role_hint_for_rag(normalized_context, request.application_job_candidates)
        company_context, _ = await _get_company_context(
            request.company_id,
            _format_conversation(trimmed_history),
            role_hint=role_hint,
        )

    conversation_text = _format_conversation(trimmed_history)
    summaries = normalized_context.get("slotSummaries", {})
    summary_lines = [f"- {STAGE_LABELS.get(k, k)}: {v}" for k, v in summaries.items() if v]
    slot_summaries_section = "\n".join(summary_lines) if summary_lines else "（まだ確認済みのスロットはありません）"
    prompt = MOTIVATION_EVALUATION_PROMPT.format(
        conversation=conversation_text,
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(request.industry or "不明", max_length=100),
        selected_role_line=_format_selected_role_line_for_prompt(
            normalized_context,
            request.application_job_candidates,
        ),
        company_context=company_context or "（企業情報なし）",
        slot_summaries_section=slot_summaries_section,
    )
    prompt = (
        f"{prompt}\n\n"
        "## 追加評価ルール\n"
        "- slot_status は missing / partial / filled_weak / filled_strong の4段階で返す\n"
        "- filled_strong は再質問禁止、filled_weak は必要なら1回だけ補強対象とみなす\n"
        "- missing_slots には missing と partial の slot だけを入れる\n"
        "- weak_slots には filled_weak の slot を入れる\n"
        "- do_not_ask_slots には filled_strong の slot を入れる\n"
        "- self_connection が strong でも、経験・価値観・強みが志望理由ややりたい仕事と因果でつながらない場合は draft_ready を true にしない\n"
        "- 会話が十分進み、骨格がおおむね揃っていれば ready_for_draft を true にしてよい（完璧な言語化は不要）"
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
        # Classify failure type for caller-side handling
        if llm_result.error and getattr(llm_result.error, "error_type", None) == "parse":
            evaluation_status = "parse_failure"
        else:
            evaluation_status = "provider_failure"
        logger.warning(
            "[Motivation] Evaluation LLM call failed: status=%s, error=%s",
            evaluation_status,
            llm_result.error.message if llm_result.error else "unknown",
        )
        scores = MotivationScores()
        return {
            "evaluation_status": evaluation_status,
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
            "slot_status_v2": {
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
            "weak_slots": [],
            "do_not_ask_slots": [],
            "ready_for_draft": False,
            "draft_readiness_reason": "評価に失敗したため骨格未確認",
            "draft_blockers": ["company_reason", "desired_work", "differentiation", "self_connection"],
            "conversation_warnings": [],
            "missing_aspects": {},
            "risk_flags": [],
        }

    data = llm_result.data
    slot_status_v2 = _normalize_slot_status_v2(data.get("slot_status") or {})
    slot_status = {
        slot: _legacy_slot_state(state)
        for slot, state in slot_status_v2.items()
    }
    missing_slots = [
        slot for slot, state in slot_status_v2.items()
        if state in {"missing", "partial"}
    ]
    weak_slots = [
        slot for slot, state in slot_status_v2.items()
        if state == "filled_weak"
    ]
    do_not_ask_slots = [
        slot for slot, state in slot_status_v2.items()
        if state == "filled_strong"
    ]
    gated_ready_for_draft, draft_blockers = _compute_draft_gate(
        slot_status_v2=slot_status_v2,
        conversation_context=normalized_context,
    )
    ready_for_draft = bool(data.get("ready_for_draft", False)) and gated_ready_for_draft
    weakest_element = _slot_to_legacy_element(missing_slots[0] if missing_slots else "differentiation")

    return {
        "evaluation_status": "ok",
        "scores": {
            "company_understanding": 0,
            "self_analysis": 0,
            "career_vision": 0,
            "differentiation": 0,
        },
        "weakest_element": weakest_element,
        "is_complete": ready_for_draft,
        "slot_status": slot_status,
        "slot_status_v2": slot_status_v2,
        "missing_slots": missing_slots,
        "weak_slots": weak_slots,
        "do_not_ask_slots": do_not_ask_slots,
        "ready_for_draft": ready_for_draft,
        "draft_readiness_reason": (
            str(data.get("draft_readiness_reason") or "")
            if ready_for_draft
            else " / ".join(_slot_label(slot) for slot in draft_blockers)
        ),
        "draft_blockers": draft_blockers,
        "conversation_warnings": _coerce_string_list(data.get("conversation_warnings"), max_items=4),
        "missing_aspects": {},
        "risk_flags": _coerce_risk_flags(data.get("risk_flags"), max_items=2),
    }


async def _prepare_motivation_next_question(
    request: NextQuestionRequest,
) -> _MotivationQuestionPrep:
    conversation_context = _normalize_conversation_context(request.conversation_context)
    generated_draft = (request.generated_draft or "").strip() or None
    if conversation_context.get("draftReady") and generated_draft:
        conversation_context["conversationMode"] = CONVERSATION_MODE_DEEPDIVE
        conversation_context["generatedDraft"] = generated_draft
    latest_user_answer = next(
        (
            message.content
            for message in reversed(request.conversation_history)
            if message.role == "user" and message.content.strip()
        ),
        None,
    )
    pre_capture_context = copy.deepcopy(conversation_context)
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

    eval_result = await _evaluate_motivation_internal(
        request,
        company_context=company_context,
        conversation_context=conversation_context,
    )

    # ── Evaluation failure handling ──────────────────────────────────────
    if eval_result.get("evaluation_status") != "ok":
        # Rollback conversation_context to pre-capture state so the
        # already-captured answer does not persist as confirmed fact.
        conversation_context = pre_capture_context
        logger.warning(
            "[Motivation] evaluation %s — context fully rolled back to pre-capture state",
            eval_result.get("evaluation_status"),
        )

        if eval_result.get("evaluation_status") == "provider_failure":
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "評価処理が一時的に利用できません",
                    "error_type": "evaluation_provider_failure",
                },
            )

        # parse_failure: continue with degraded quality, add risk flag
        if eval_result.get("evaluation_status") == "parse_failure":
            risk_flags = list(eval_result.get("risk_flags", []))
            risk_flags.append("evaluation_parse_failure")
            eval_result["risk_flags"] = risk_flags

    scores = MotivationScores(**(eval_result.get("scores") or MotivationScores().model_dump()))
    weakest_element = eval_result["weakest_element"]
    missing_slots = list(eval_result.get("missing_slots") or [])
    was_draft_ready = bool(conversation_context.get("draftReady"))
    conversation_context["slotStatusV2"] = _normalize_slot_status_v2(eval_result.get("slot_status_v2"))
    conversation_context["draftBlockers"] = list(eval_result.get("draft_blockers") or [])

    if was_draft_ready and generated_draft:
        conversation_context["conversationMode"] = CONVERSATION_MODE_DEEPDIVE

    causal_gaps = _compute_deterministic_causal_gaps(conversation_context)
    conversation_context["causalGaps"] = causal_gaps
    turn_plan = _determine_next_turn(conversation_context)
    current_slot = turn_plan.get("target_slot")
    current_intent = turn_plan.get("intent")
    next_advance_condition = turn_plan.get("next_advance_condition")
    conversation_mode = str(turn_plan.get("mode") or CONVERSATION_MODE_SLOT_FILL)
    is_complete = bool(turn_plan.get("unlock"))
    unlock_reason = turn_plan.get("unlock_reason")

    conversation_context["conversationMode"] = conversation_mode
    conversation_context["currentIntent"] = current_intent
    conversation_context["nextAdvanceCondition"] = next_advance_condition
    if current_slot:
        previous_stage = conversation_context.get("questionStage") or "industry_reason"
        previous_attempt_count = int(conversation_context.get("stageAttemptCount") or 0)
        conversation_context["questionStage"] = current_slot
        conversation_context["stageAttemptCount"] = (
            previous_attempt_count + 1 if latest_user_answer and current_slot == previous_stage else 0
        )
    else:
        conversation_context["stageAttemptCount"] = 0

    if is_complete:
        conversation_context["draftReady"] = True
        conversation_context["unlockReason"] = unlock_reason
        conversation_context["draftReadyUnlockedAt"] = (
            conversation_context.get("draftReadyUnlockedAt") or datetime.now(ZoneInfo("Asia/Tokyo")).isoformat()
        )

    progress = _build_progress_payload(
        conversation_context,
        current_slot=current_slot,
        current_intent=current_intent,
        next_advance_condition=next_advance_condition,
    )

    return _MotivationQuestionPrep(
        conversation_context=conversation_context,
        industry=industry,
        generated_draft=generated_draft,
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
        stage=_coerce_motivation_stage_for_ui(
            current_slot or conversation_context.get("questionStage") or "industry_reason"
        ),
        was_draft_ready=was_draft_ready,
        has_generated_draft=bool(generated_draft),
        conversation_mode=conversation_mode,
        current_slot=current_slot,
        current_intent=current_intent,
        next_advance_condition=next_advance_condition,
        unlock_reason=unlock_reason,
        progress=progress,
        causal_gaps=causal_gaps,
    )


def _build_motivation_question_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    wording_level = _question_difficulty_level(int(prep.conversation_context.get("stageAttemptCount") or 0))
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
    slot_status = prep.eval_result.get("slot_status_v2") or prep.eval_result.get("slot_status") or {}
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
    prompt = MOTIVATION_QUESTION_PROMPT.format(
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
    return (
        f"{prompt}\n\n"
        "## このターンで固定されていること\n"
        f"- 対象 slot: {prep.current_slot or prep.stage}\n"
        f"- 質問 intent: {prep.current_intent or SLOT_FILL_INTENTS.get(prep.stage, 'initial_capture')}\n"
        f"- 次に進む条件: {prep.next_advance_condition or '今回の論点について要旨が1つ出れば次へ進みます。'}\n"
        "- このターンでは対象 slot 以外の論点を聞かない\n"
        "- すでに locked の slot は再質問しない\n"
        "- 選択肢の生成には触れない\n\n"
        f"{_format_answer_contract_for_prompt(stage=prep.stage, wording_level=wording_level)}\n"
        "## 追加制約\n"
        f"- 再質問禁止 slot: {', '.join(prep.eval_result.get('do_not_ask_slots') or []) or 'なし'}\n"
        "- 同じ wording を再利用せず、質問レベルに応じて聞き方を変える\n"
        "- 旧仕様のキーは出力しない"
    )


def _build_motivation_deepdive_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    weakness_tag = _infer_weakness_tag_from_eval(prep.eval_result)
    selected_role_line = _format_selected_role_line_for_prompt(
        prep.conversation_context,
        request.application_job_candidates,
    )
    draft_text = prep.generated_draft or "（志望動機 ES は未生成です）"
    last_question_meta = prep.conversation_context.get("lastQuestionMeta") or {}
    last_question = str(last_question_meta.get("questionText") or "").strip() or "（なし）"
    recent_question_summaries = []
    for message in request.conversation_history[-4:]:
        if message.role == "assistant" and message.content.strip():
            recent_question_summaries.append(_clean_short_phrase(message.content, max_len=36))
    recent_question_summaries_text = ", ".join(recent_question_summaries) if recent_question_summaries else "（なし）"
    prompt = MOTIVATION_DEEPDIVE_QUESTION_PROMPT.format(
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        selected_role_line=selected_role_line,
        draft_text=draft_text,
        company_context=prep.company_context or "（企業情報なし）",
        conversation_history=_format_recent_conversation_for_prompt(request.conversation_history, max_messages=8),
        last_question=last_question,
        recent_question_summaries=recent_question_summaries_text,
    )
    return (
        f"{prompt}\n\n"
        "## deepdive 制約\n"
        f"- 今回の weak tag: {weakness_tag}\n"
        f"- 補強対象 slot: {prep.current_slot or prep.stage}\n"
        f"- 質問 intent: {prep.current_intent or 'specificity_check'}\n"
        f"- 次に進む条件: {prep.next_advance_condition or '弱い部分が1つ補えれば十分です。'}\n"
        "- 1弱点につき1質問だけ作る\n"
        "- 通常の slot 補完ではなく、既出内容を前提にした補強質問にする\n"
        "- 新しい論点や新事実を増やさない\n"
        "- 選択肢の生成には触れない"
    )


def _deepdive_area_to_stage(target_area: str | None) -> str:
    # E-3 (P3-5): DeepDiveGap enum を単一情報源にして target_area → stage を解決する
    gap = DeepDiveGap.from_target_area(target_area)
    if gap is None:
        return DeepDiveGap.DIFFERENTIATION.to_stage()
    return gap.to_stage()


def _deepdive_area_to_weakness_tag(target_area: str | None) -> str:
    # E-3 (P3-5): target_area → weakness_tag を DeepDiveGap 経由で解決する
    gap = DeepDiveGap.from_target_area(target_area)
    if gap is None:
        return DeepDiveGap.COMPANY_REASON.to_weakness_tag()
    return gap.to_weakness_tag()


def _infer_weakness_tag_from_eval(eval_result: dict[str, Any] | None) -> str:
    # E-3 (P3-5): draft_blockers の stage 名を DeepDiveGap に解決してから weakness_tag へ
    data = eval_result or {}
    blockers = list(data.get("draft_blockers") or [])
    # draft_blockers は優先順位順で評価する。最初にヒットした stage を採用。
    for stage_name in ("company_reason", "desired_work", "value_contribution", "differentiation", "self_connection"):
        if stage_name in blockers:
            gap = DeepDiveGap.from_stage(stage_name)
            if gap is not None:
                return gap.to_weakness_tag()
    return DeepDiveGap.COMPANY_REASON.to_weakness_tag()


def _should_use_deepdive_mode(prep: _MotivationQuestionPrep) -> bool:
    return prep.was_draft_ready and prep.has_generated_draft


def _classify_draft_ready_source(
    *,
    eval_ready: bool,
    planner_unlock: bool,
    unlock_reason: str | None,
) -> str:
    """Classify which signal drove the draft-ready transition.

    Returns one of:
    - "both_agree": eval LLM and planner both declared ready
    - "planner_only:<reason>": planner unlocked (e.g. max_turn_reached) but eval was not ready
    - "eval_only": eval declared ready but planner did not unlock
    - "neither": neither signal was ready (used when response is not draft_ready)
    """
    if eval_ready and planner_unlock:
        return "both_agree"
    if planner_unlock and not eval_ready:
        return f"planner_only:{unlock_reason or 'unknown'}"
    if eval_ready and not planner_unlock:
        return "eval_only"
    return "neither"


def _build_draft_ready_telemetry(
    prep: _MotivationQuestionPrep,
    base: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Enrich the LLM cost summary with draft_ready source telemetry (P2-5)."""
    eval_ready = bool(prep.eval_result.get("ready_for_draft"))
    planner_unlock = bool(prep.is_complete)
    telemetry = dict(base) if base else {}
    telemetry["draft_ready_eval"] = eval_ready
    telemetry["draft_ready_planner"] = planner_unlock
    telemetry["draft_ready_source"] = _classify_draft_ready_source(
        eval_ready=eval_ready,
        planner_unlock=planner_unlock,
        unlock_reason=prep.unlock_reason,
    )
    telemetry["planner_unlock_reason"] = prep.unlock_reason
    return telemetry


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
        evidence_summary=_build_evidence_summary_from_sources(prep.company_sources, focus="参考企業情報"),
        evidence_cards=_build_evidence_cards_from_sources(prep.company_sources),
        question_stage=prep.stage,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus="ES作成可能",
        risk_flags=_coerce_risk_flags(prep.eval_result.get("risk_flags"), max_items=2),
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        premise_mode="confirmed_only",
        conversation_mode=prep.conversation_mode,
        current_slot=prep.current_slot,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
    )

async def _assemble_regular_next_question_response(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
    data: dict[str, Any],
) -> NextQuestionResponse:
    stage = _coerce_motivation_stage_for_ui(prep.current_slot or prep.stage)
    weakness_tag = _deepdive_area_to_weakness_tag(data.get("target_area")) if _should_use_deepdive_mode(prep) else None
    wording_level = _question_difficulty_level(int(prep.conversation_context.get("stageAttemptCount") or 0))
    company_anchor = prep.company_features[0] if prep.company_features else None
    role_anchor = prep.conversation_context.get("selectedRole")
    precomputed_semantic_signature = _semantic_question_signature(
        stage=stage,
        question_intent=str(data.get("question_intent") or prep.current_intent or STAGE_LABELS.get(stage, stage)),
        company_anchor=company_anchor,
        role_anchor=role_anchor,
        evidence_basis=str(data.get("question_focus") or ""),
        wording_level=wording_level,
    )
    # E-2 / P3-4: validation_report を副作用オブジェクトで受け取り、採用可視化に使う
    validation_report: dict[str, Any] = {}
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
        validation_report=validation_report,
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
        semantic_signature=precomputed_semantic_signature,
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
    evidence_summary = data.get("evidence_summary") or _build_evidence_summary_from_sources(
        prep.company_sources, focus="質問の根拠"
    )
    evidence_cards = _build_evidence_cards_from_sources(prep.company_sources)
    semantic_signature = _semantic_question_signature(
        stage=stage,
        question_intent=str(data.get("question_intent") or prep.current_intent or STAGE_LABELS.get(stage, stage)),
        company_anchor=company_anchor,
        role_anchor=role_anchor,
        evidence_basis=question_focus,
        wording_level=wording_level,
    )
    prep.conversation_context["questionStage"] = stage
    prep.conversation_context["conversationMode"] = prep.conversation_mode
    prep.conversation_context["currentIntent"] = prep.current_intent
    prep.conversation_context["nextAdvanceCondition"] = prep.next_advance_condition
    prep.conversation_context["causalGaps"] = prep.causal_gaps
    prep.conversation_context["lastQuestionSignature"] = _question_signature(validated_question)
    prep.conversation_context["lastQuestionSemanticSignature"] = semantic_signature
    prep.conversation_context["lastQuestionMeta"] = {
        "question_signature": _question_signature(validated_question),
        "semantic_question_signature": semantic_signature,
        "question_stage": stage,
        "question_focus": question_focus,
        "stage_attempt_count": prep.conversation_context.get("stageAttemptCount") or 0,
        "question_difficulty_level": wording_level,
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
        draft_ready=bool(prep.conversation_context.get("draftReady")),
        evaluation=prep.eval_result,
        target_slot=stage,
        question_intent=prep.current_intent or data.get("question_intent") or STAGE_LABELS.get(stage, stage),
        answer_contract=_build_answer_contract(stage, weakness_tag=weakness_tag),
        target_element=data.get("target_element", prep.weakest_element),
        company_insight=data.get("company_insight"),
        evidence_summary=evidence_summary,
        evidence_cards=evidence_cards,
        question_stage=stage,
        question_focus=question_focus,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus=str(data.get("coaching_focus") or _slot_label(stage)),
        risk_flags=risk_flags,
        question_signature=_question_signature(validated_question),
        semantic_question_signature=semantic_signature,
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        question_difficulty_level=wording_level,
        candidate_validation_summary={
            "total_candidates": 0,
            "deepdive_mode": _should_use_deepdive_mode(prep),
            # E-2 / P3-4: フォールバック採用有無と理由コードを可視化
            "fallback_used": bool(validation_report.get("fallback_used", False)),
            "fallback_reason": validation_report.get("fallback_reason"),
        },
        weakness_tag=weakness_tag,
        premise_mode="confirmed_only",
        conversation_mode=prep.conversation_mode,
        current_slot=stage,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
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
        conversation_mode=prep.conversation_mode,
        current_slot=prep.current_slot,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
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
    if prep.is_complete:
        return _build_draft_ready_response(prep=prep)
    if prep.was_draft_ready and not prep.has_generated_draft:
        return _build_draft_ready_response(prep=prep)

    prompt = (
        _build_motivation_deepdive_system_prompt(request=request, prep=prep)
        if _should_use_deepdive_mode(prep)
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
                    "evidence_summary": response_obj.evidence_summary,
                    "evidence_cards": [c.model_dump() for c in response_obj.evidence_cards],
                    "question_stage": response_obj.question_stage,
                    "question_focus": response_obj.question_focus,
                    "stage_status": response_obj.stage_status.model_dump()
                    if response_obj.stage_status
                    else {},
                    "captured_context": response_obj.captured_context,
                    "answer_contract": response_obj.answer_contract,
                    "coaching_focus": response_obj.coaching_focus,
                    "risk_flags": response_obj.risk_flags,
                    "question_signature": response_obj.question_signature,
                    "semantic_question_signature": response_obj.semantic_question_signature,
                    "stage_attempt_count": response_obj.stage_attempt_count,
                    "question_difficulty_level": response_obj.question_difficulty_level,
                    "candidate_validation_summary": response_obj.candidate_validation_summary,
                    "weakness_tag": response_obj.weakness_tag,
                    "premise_mode": response_obj.premise_mode,
                    "conversation_mode": response_obj.conversation_mode,
                    "current_slot": response_obj.current_slot,
                    "current_intent": response_obj.current_intent,
                    "next_advance_condition": response_obj.next_advance_condition,
                    "progress": response_obj.progress,
                    "causal_gaps": response_obj.causal_gaps,
                },
                "internal_telemetry": response_obj.internal_telemetry,
            })
            return
        if prep.is_complete or (prep.was_draft_ready and not prep.has_generated_draft):
            response_obj = _build_draft_ready_response(prep=prep)
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
                    "conversation_mode": response_obj.conversation_mode,
                    "current_slot": response_obj.current_slot,
                    "current_intent": response_obj.current_intent,
                    "next_advance_condition": response_obj.next_advance_condition,
                    "progress": response_obj.progress,
                    "causal_gaps": response_obj.causal_gaps,
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
            if _should_use_deepdive_mode(prep)
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

        yield _sse_event("progress", {
            "step": "finalize", "progress": 85, "label": "次の確認内容を整えています...",
        })
        await asyncio.sleep(0.05)

        response_obj = await _assemble_regular_next_question_response(request=request, prep=prep, data=data)
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
                "evidence_summary": response_obj.evidence_summary,
                "evidence_cards": [c.model_dump() for c in response_obj.evidence_cards],
                "question_stage": response_obj.question_stage,
                "question_focus": response_obj.question_focus,
                "stage_status": response_obj.stage_status.model_dump()
                if response_obj.stage_status
                else {},
                "captured_context": response_obj.captured_context,
                "answer_contract": response_obj.answer_contract,
                "coaching_focus": response_obj.coaching_focus,
                "risk_flags": response_obj.risk_flags,
                "question_signature": response_obj.question_signature,
                "semantic_question_signature": response_obj.semantic_question_signature,
                "stage_attempt_count": response_obj.stage_attempt_count,
                "question_difficulty_level": response_obj.question_difficulty_level,
                "candidate_validation_summary": response_obj.candidate_validation_summary,
                "weakness_tag": response_obj.weakness_tag,
                "premise_mode": response_obj.premise_mode,
                "conversation_mode": response_obj.conversation_mode,
                "current_slot": response_obj.current_slot,
                "current_intent": response_obj.current_intent,
                "next_advance_condition": response_obj.next_advance_condition,
                "progress": response_obj.progress,
                "causal_gaps": response_obj.causal_gaps,
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
async def get_next_question_stream(
    payload: NextQuestionRequest,
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    """
    SSE streaming version of next-question.
    Yields progress events then complete/error event.
    """
    request = payload
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    # Defense-in-depth: if both sides carry a company_id, they must match.
    if (
        request.company_id
        and principal.company_id
        and principal.company_id != request.company_id
    ):
        raise HTTPException(
            status_code=403,
            detail="career principal company_id mismatch",
        )

    from app.routers.motivation_streaming import (
        _generate_next_question_progress as _generate_next_question_progress_canonical,
    )

    try:
        lease = await SseLease.acquire(
            actor_id=principal.actor_id, plan=principal.plan
        )
    except SseConcurrencyExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "sse_concurrency_exceeded",
                "limit": exc.rejection.limit,
            },
            headers={
                "Retry-After": str(exc.rejection.retry_after_seconds),
            },
        )

    async def _stream_with_lease() -> AsyncGenerator[str, None]:
        async with lease:
            async for chunk in _generate_next_question_progress_canonical(request):
                await lease.heartbeat_if_due()
                yield chunk

    return StreamingResponse(
        _stream_with_lease(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _resolve_motivation_grounding_mode(
    *,
    rag_available: bool,
    company_sources: list[dict] | None,
    role_name: str | None,
    coverage_level: str,
) -> str:
    """D-2 / P2-1: coverage × role に基づき grounding_mode を決定する.

    - coverage が weak/none → "none"
    - role あり & coverage=strong → "role_grounded"
    - それ以外 (partial または role なし) → "company_general"
    """
    if not rag_available or not company_sources:
        return "none"
    if coverage_level in ("weak", "none"):
        return "none"
    role_name_stripped = (role_name or "").strip()
    if role_name_stripped and coverage_level == "strong":
        return "role_grounded"
    return "company_general"


def _build_motivation_grounding_answer(
    *,
    slot_summaries: dict[str, Optional[str]] | None,
    selected_role: str | None,
) -> str:
    """会話由来の slot 要約から、grounding card 評価用の合成 answer を組み立てる."""
    if not slot_summaries:
        base = (selected_role or "").strip()
        return base
    parts: list[str] = []
    for key in ("company_reason", "desired_work", "differentiation"):
        value = slot_summaries.get(key)
        if value and str(value).strip():
            parts.append(str(value).strip())
    role = (selected_role or "").strip()
    if role:
        parts.append(role)
    return " ".join(parts)


def _build_motivation_grounding_answer_from_profile(
    *,
    role_name: str,
    gakuchika_section: str,
    profile_summary: str,
) -> str:
    """プロフィール/ガクチカ由来の合成 answer。先頭から bounded 抽出して evidence card 評価に供する."""
    parts: list[str] = [role_name.strip()] if role_name else []
    if gakuchika_section:
        parts.append(gakuchika_section[:300])
    if profile_summary:
        parts.append(profile_summary[:200])
    return "\n".join(p for p in parts if p)


def _resolve_motivation_draft_grounding(
    *,
    template_type: str,
    company_sources: list[dict] | None,
    synthetic_question: str,
    grounding_answer: str,
    role_name: str | None,
) -> tuple[bool, str, Optional[list[dict[str, str]]]]:
    """RAG ソースから 2 段階評価し (has_rag, grounding_mode, evidence_cards) を返す.

    1. 暫定 grounding_mode="company_general" で evidence_cards を初回構築
    2. coverage を評価して最終 mode を決定
    3. 最終 mode が "none" ならカードも捨てる
    """
    if not settings.motivation_rag_grounding:
        return False, "none", None
    if not company_sources:
        return False, "none", None
    try:
        preliminary_cards = _build_company_evidence_cards(
            company_sources,
            template_type=template_type,
            question=synthetic_question,
            answer=grounding_answer,
            role_name=role_name,
            intern_name=None,
            grounding_mode="company_general",
        )
    except Exception as exc:  # noqa: BLE001 - fail-safe: RAG 側の例外でドラフト生成は止めない
        logger.warning("[Motivation] evidence card build failed, falling back to has_rag=False: %s", exc)
        return False, "none", None

    try:
        coverage_level, _ = _assess_company_evidence_coverage(
            template_type=template_type,
            role_name=role_name,
            company_rag_available=True,
            company_evidence_cards=preliminary_cards,
            grounding_mode="company_general",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("[Motivation] coverage assessment failed: %s", exc)
        coverage_level = "weak"

    final_mode = _resolve_motivation_grounding_mode(
        rag_available=True,
        company_sources=company_sources,
        role_name=role_name,
        coverage_level=coverage_level,
    )
    if final_mode == "none" or not preliminary_cards:
        return False, "none", None
    return True, final_mode, preliminary_cards


# D-3 / P2-2: AI 臭抑制と決定論的な採用ルール
def _build_user_origin_from_conversation(
    conversation_history: list[Message],
    *,
    max_messages: int = 3,
    max_chars: int = 1200,
) -> str:
    """直近 user 発話を結合して AI 臭検出の比較テキストにする."""
    user_texts: list[str] = []
    for msg in reversed(conversation_history):
        if getattr(msg, "role", "") != "user":
            continue
        text = (msg.content or "").strip()
        if not text:
            continue
        user_texts.append(text)
        if len(user_texts) >= max_messages:
            break
    joined = "\n".join(reversed(user_texts))
    if len(joined) > max_chars:
        joined = joined[:max_chars]
    return joined


def _select_motivation_draft(
    *,
    initial_draft: str,
    initial_smell_score: dict[str, Any],
    initial_within_limits: bool,
    retry_draft: Optional[str],
    retry_smell_score: Optional[dict[str, Any]],
    retry_within_limits: Optional[bool],
    char_min: int,
    char_max: int,
) -> tuple[str, str]:
    """(draft, selection_reason) を返す決定論的採用ルール.

    1. retry なし → initial (retry_failed)
    2. 両方 limits 内 → AI smell score が低い方 (同点 initial 優先)
    3. retry のみ limits 内 → retry
    4. initial のみ limits 内 → initial
    5. 両方 limits 外 → initial
    """
    if retry_draft is None or retry_smell_score is None or retry_within_limits is None:
        return initial_draft, "retry_failed"

    initial_score = float(initial_smell_score.get("score", 0.0))
    retry_score = float(retry_smell_score.get("score", 0.0))

    if initial_within_limits and retry_within_limits:
        if retry_score < initial_score:
            return retry_draft, "retry_better_score"
        return initial_draft, "initial_equal_or_better"
    if retry_within_limits and not initial_within_limits:
        return retry_draft, "retry_within_limits"
    if initial_within_limits and not retry_within_limits:
        return initial_draft, "initial_within_limits"
    return initial_draft, "both_out_of_limits"


async def _maybe_retry_for_ai_smell(
    *,
    initial_draft: str,
    user_origin_text: str,
    system_prompt: str,
    user_prompt: str,
    char_min: int,
    char_max: int,
    template_type: str = "company_motivation",
    max_tokens: int,
) -> tuple[str, str, dict[str, Any]]:
    """Tier 2 が出たら 1 回だけリトライし、決定論的に採用する。

    Returns (final_draft, selection_reason, telemetry_dict).
    telemetry_dict は draft_selection_reason / ai_smell_score / ai_smell_tier /
    retry_attempted / initial_within_limits / retry_within_limits を含む。
    """
    initial_warnings = _detect_ai_smell_patterns(initial_draft, user_origin_text)
    initial_smell_score = _compute_ai_smell_score(
        initial_warnings,
        template_type=template_type,
        char_max=char_max,
    )
    initial_within, _ = _is_within_char_limits(initial_draft, char_min, char_max)

    tier = int(initial_smell_score.get("tier", 0) or 0)
    if tier < 2:
        telemetry = {
            "draft_selection_reason": "initial_only_no_retry",
            "ai_smell_score": float(initial_smell_score.get("score", 0.0)),
            "ai_smell_tier": tier,
            "retry_attempted": False,
            "initial_within_limits": initial_within,
            "retry_within_limits": None,
        }
        return initial_draft, "initial_only_no_retry", telemetry

    hints = _build_ai_smell_retry_hints(initial_warnings)
    retry_system_prompt = system_prompt
    if hints:
        retry_system_prompt = (
            system_prompt
            + "\n\n## AI臭修正指示\n"
            + "\n".join(f"- {h}" for h in hints)
        )

    retry_result = await call_llm_with_error(
        system_prompt=retry_system_prompt,
        user_message=user_prompt,
        max_tokens=max_tokens,
        temperature=0.35,
        feature="motivation_draft",
        retry_on_parse=True,
        disable_fallback=True,
    )

    retry_draft: Optional[str] = None
    retry_smell_score: Optional[dict[str, Any]] = None
    retry_within: Optional[bool] = None
    # B-2: LLM 呼び出し自体の失敗と、成功したが空ドラフトだった場合を区別してテレメトリに出す
    retry_llm_failed = not (retry_result.success and retry_result.data is not None)
    retry_empty_draft = False
    if not retry_llm_failed:
        raw_retry_draft = str(retry_result.data.get("draft", "")).strip()
        if raw_retry_draft:
            retry_draft = normalize_es_draft_single_paragraph(raw_retry_draft)
            retry_warnings = _detect_ai_smell_patterns(retry_draft, user_origin_text)
            retry_smell_score = _compute_ai_smell_score(
                retry_warnings,
                template_type=template_type,
                char_max=char_max,
            )
            retry_within, _ = _is_within_char_limits(retry_draft, char_min, char_max)
        else:
            retry_empty_draft = True

    if retry_draft is None:
        # `_select_motivation_draft` に None を渡すと retry_failed を返すが、B-2 では
        # LLM 呼び出しが失敗した場合と、成功したが空ドラフトだった場合を区別する。
        if retry_llm_failed:
            reason = "retry_llm_failed"
        elif retry_empty_draft:
            reason = "retry_empty_draft"
        else:
            reason = "retry_failed"
        final_draft = initial_draft
        chosen_smell = initial_smell_score
    else:
        final_draft, reason = _select_motivation_draft(
            initial_draft=initial_draft,
            initial_smell_score=initial_smell_score,
            initial_within_limits=initial_within,
            retry_draft=retry_draft,
            retry_smell_score=retry_smell_score,
            retry_within_limits=retry_within,
            char_min=char_min,
            char_max=char_max,
        )
        retry_adopted_reasons = {"retry_better_score", "retry_within_limits"}
        if reason in retry_adopted_reasons and retry_smell_score is not None:
            chosen_smell = retry_smell_score
        else:
            chosen_smell = initial_smell_score
    telemetry = {
        "draft_selection_reason": reason,
        "ai_smell_score": float(chosen_smell.get("score", 0.0)),
        "ai_smell_tier": int(chosen_smell.get("tier", 0) or 0),
        "retry_attempted": True,
        "initial_within_limits": initial_within,
        "retry_within_limits": retry_within,
        "retry_llm_failed": retry_llm_failed,
    }
    return final_draft, reason, telemetry


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

    # Get company context (sources preserved for D-2 / P2-1 grounding)
    company_context, company_sources = await _get_company_context(request.company_id)

    conversation_text = _format_conversation(request.conversation_history)
    char_min = int(request.char_limit * 0.9)
    industry_s = sanitize_prompt_input(request.industry or "不明", max_length=100)
    honorific = get_company_honorific(industry_s)
    synthetic_q = draft_synthetic_question_company_motivation(honorific)
    ref_body = (company_context or "").strip() or None

    # D-2 / P2-1: RAG evidence cards と coverage に基づく grounding_mode 決定
    role_name = (request.selected_role or "").strip() or None
    grounding_answer = _build_motivation_grounding_answer(
        slot_summaries=request.slot_summaries,
        selected_role=role_name,
    )
    has_rag, grounding_mode, evidence_cards = _resolve_motivation_draft_grounding(
        template_type="company_motivation",
        company_sources=company_sources,
        synthetic_question=synthetic_q,
        grounding_answer=grounding_answer,
        role_name=role_name,
    )

    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "company_motivation",
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=industry_s,
        question=synthetic_q,
        char_min=char_min,
        char_max=request.char_limit,
        primary_material_heading="【会話ログ】",
        primary_material_body=conversation_text,
        company_reference_heading="【企業参考情報（要約）】",
        company_reference_body=ref_body,
        output_json_kind="motivation",
        role_name=role_name,
        company_evidence_cards=evidence_cards,
        has_rag=has_rag,
        grounding_mode=grounding_mode,
    )
    if settings.debug:
        logger.debug(
            "[Motivation] Draft input sizes: "
            f"conversation_chars={len(conversation_text)}, "
            f"company_context_chars={len(company_context)}, "
            f"char_limit={request.char_limit}"
        )

    llm_result = None
    max_draft_attempts = 5
    for attempt in range(max_draft_attempts):
        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=1800,  # Draft JSON can truncate below 1200 when key_points/keywords are long
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if llm_result.success and llm_result.data is not None:
            break
        if attempt < max_draft_attempts - 1:
            backoff = min(8.0, 1.5 * (2**attempt))
            logger.warning(
                "[Motivation] generate_draft LLM call failed (attempt %s/%s): %s; retrying in %.1fs",
                attempt + 1,
                max_draft_attempts,
                llm_result.error.message if llm_result.error else "unknown",
                backoff,
            )
            await asyncio.sleep(backoff)

    if llm_result is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "ES生成中にエラーが発生しました。"},
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
                    draft_text = normalize_es_draft_single_paragraph(draft_text)
                    # D-3 / P2-2: raw_text フォールバック経路は AI 臭リトライをスキップ（既に劣化動作）
                    fallback_telemetry = consume_request_llm_cost_summary("motivation_draft") or {}
                    fallback_telemetry.update(
                        {
                            "draft_selection_reason": "raw_text_fallback",
                            "ai_smell_score": None,
                            "ai_smell_tier": None,
                            "retry_attempted": False,
                            "initial_within_limits": None,
                            "retry_within_limits": None,
                        }
                    )
                    return GenerateDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
                        key_points=[],
                        company_keywords=[],
                        internal_telemetry=fallback_telemetry,
                    )

        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "ES生成中にエラーが発生しました。",
            },
        )

    data = llm_result.data
    draft = normalize_es_draft_single_paragraph(str(data.get("draft", "")))

    # D-3 / P2-2: AI 臭検出 → Tier 2 のとき 1 回リトライ → 決定論的採用
    user_origin_text = _build_user_origin_from_conversation(request.conversation_history)
    draft, _selection_reason, smell_telemetry = await _maybe_retry_for_ai_smell(
        initial_draft=draft,
        user_origin_text=user_origin_text,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        char_min=char_min,
        char_max=request.char_limit,
        template_type="company_motivation",
        max_tokens=1800,
    )

    base_telemetry = consume_request_llm_cost_summary("motivation_draft") or {}
    base_telemetry.update(smell_telemetry)
    return GenerateDraftResponse(
        draft=draft,
        char_count=len(draft),
        key_points=data.get("key_points", []),
        company_keywords=data.get("company_keywords", []),
        internal_telemetry=base_telemetry,
    )


@router.post("/generate-draft-from-profile", response_model=GenerateDraftResponse)
@limiter.limit("60/minute")
async def generate_draft_from_profile(payload: GenerateDraftFromProfileRequest, request: Request):
    """
    Generate motivation ES from company RAG + profile + gakuchika only (no conversation).
    """
    request = payload
    role = (request.selected_role or "").strip()
    if not role:
        raise HTTPException(status_code=400, detail="志望職種が指定されていません")
    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_generate_draft_from_profile_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    company_context, company_sources = await _get_company_context(request.company_id)
    char_min = int(request.char_limit * 0.9)
    profile_section = _format_profile_for_prompt(request.profile_context)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    industry_s = sanitize_prompt_input(request.industry or "不明", max_length=100)
    honorific = get_company_honorific(industry_s)
    synthetic_q = draft_synthetic_question_company_motivation(honorific)
    material_parts = [
        p.strip()
        for p in (
            profile_section.strip() if profile_section else "",
            gakuchika_section.strip() if gakuchika_section else "",
        )
        if p and str(p).strip()
    ]
    primary_material = "\n\n".join(material_parts) if material_parts else "（追加材料なし）"
    ref_body = (company_context or "").strip() or None

    # D-2 / P2-1: プロフィール/ガクチカ由来の合成 answer で grounding cards を構築
    role_name = request.selected_role.strip()
    grounding_answer = _build_motivation_grounding_answer_from_profile(
        role_name=role_name,
        gakuchika_section=gakuchika_section or "",
        profile_summary=profile_section or "",
    )
    has_rag, grounding_mode, evidence_cards = _resolve_motivation_draft_grounding(
        template_type="company_motivation",
        company_sources=company_sources,
        synthetic_question=synthetic_q,
        grounding_answer=grounding_answer,
        role_name=role_name,
    )

    system_prompt, user_prompt = build_template_draft_generation_prompt(
        "company_motivation",
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=industry_s,
        question=synthetic_q,
        char_min=char_min,
        char_max=request.char_limit,
        primary_material_heading="【材料（職種・プロフィール・ガクチカ要約）】",
        primary_material_body=primary_material,
        company_reference_heading="【企業参考情報（要約）】",
        company_reference_body=ref_body,
        output_json_kind="motivation",
        role_name=role_name,
        company_evidence_cards=evidence_cards,
        has_rag=has_rag,
        grounding_mode=grounding_mode,
    )

    llm_result = None
    for attempt in range(3):
        llm_result = await call_llm_with_error(
            system_prompt=system_prompt,
            user_message=user_prompt,
            max_tokens=1200,
            temperature=0.3,
            feature="motivation_draft",
            retry_on_parse=True,
            disable_fallback=True,
        )
        if llm_result.success and llm_result.data is not None:
            break
        if attempt < 2:
            await asyncio.sleep(1.5 * (attempt + 1))

    if llm_result is None or not llm_result.success or llm_result.data is None:
        err = llm_result.error if llm_result else None
        raise HTTPException(
            status_code=503,
            detail={"error": err.message if err else "ES生成中にエラーが発生しました。"},
        )

    data = llm_result.data
    draft = normalize_es_draft_single_paragraph(str(data.get("draft", "")))

    # D-3 / P2-2: profile 経路でも AI 臭検出 + Tier 2 リトライ + 決定論的採用
    user_origin_text = (gakuchika_section or "")[:300]
    draft, _selection_reason, smell_telemetry = await _maybe_retry_for_ai_smell(
        initial_draft=draft,
        user_origin_text=user_origin_text,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        char_min=char_min,
        char_max=request.char_limit,
        template_type="company_motivation",
        max_tokens=1200,
    )

    base_telemetry = consume_request_llm_cost_summary("motivation_draft") or {}
    base_telemetry.update(smell_telemetry)
    return GenerateDraftResponse(
        draft=draft,
        char_count=len(draft),
        key_points=data.get("key_points", []) or [],
        company_keywords=data.get("company_keywords", []) or [],
        internal_telemetry=base_telemetry,
    )
