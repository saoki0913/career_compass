"""Validation helpers for motivation question generation."""

from __future__ import annotations

import asyncio
import math
import re
from typing import Any, Awaitable, Callable, Optional

from app.config import settings
from app.utils.embeddings import generate_embeddings_batch
from app.utils.secure_logger import get_logger
from app.routers.motivation_context import _normalize_confirmed_facts, _normalize_conversation_context

logger = get_logger(__name__)

EmbeddingFn = Callable[[list[str]], Awaitable[list[Optional[list[float]]]]]

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


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return numerator / (left_norm * right_norm)


async def _is_semantically_duplicate_question(
    *,
    candidate_question: str,
    assistant_questions: list[str],
    generate_embeddings_fn: EmbeddingFn = generate_embeddings_batch,
) -> bool:
    """Return whether the candidate is semantically too close to recent assistant questions."""
    if not settings.motivation_embedding_dedup:
        return False

    candidate = (candidate_question or "").strip()
    history = [item.strip() for item in assistant_questions if item and item.strip()]
    if not candidate or not history:
        return False

    texts = [candidate, *history[:6]]
    try:
        embeddings = await asyncio.wait_for(
            generate_embeddings_fn(texts),
            timeout=settings.motivation_embedding_dedup_timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001 - fail-open by design
        logger.info("[Motivation] semantic dedup skipped: %s", type(exc).__name__)
        return False

    if not embeddings or embeddings[0] is None:
        return False
    candidate_embedding = embeddings[0]
    threshold = settings.motivation_embedding_dedup_similarity_threshold
    for vector in embeddings[1:]:
        if vector is None:
            continue
        if _cosine_similarity(candidate_embedding, vector) >= threshold:
            return True
    return False


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
    valid_endings = ("？", "?", "ください。", "しょうか。", "すか。", "ますか。")
    if normalized and not any(normalized.endswith(e) for e in valid_endings):
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
        active_logger = logger
        try:
            from app.routers import motivation as motivation_router

            active_logger = getattr(motivation_router, "logger", logger)
        except Exception:  # noqa: BLE001
            pass
        active_logger.info("[Motivation] question_fallback reason=%s stage=%s", reason, stage)
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


async def _ensure_distinct_question(
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
    validation_report: dict[str, Any] | None = None,
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
    assistant_questions: list[str] = []
    for message in reversed(conversation_history or []):
        role = getattr(message, "role", None)
        content = getattr(message, "content", None)
        if isinstance(message, dict):
            role = message.get("role")
            content = message.get("content")
        if role == "assistant" and isinstance(content, str) and content.strip():
            assistant_signatures.add(_question_signature(content.strip()))
            assistant_questions.append(content.strip())

    if isinstance(last_question_meta, dict):
        signature = str(last_question_meta.get("question_signature") or "").strip()
        if signature:
            assistant_signatures.add(signature)

    if assistant_signatures and _question_signature(candidate) in assistant_signatures:
        if validation_report is not None:
            validation_report["fallback_used"] = True
            validation_report["fallback_reason"] = "duplicate_text"
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

    if await _is_semantically_duplicate_question(
        candidate_question=candidate,
        assistant_questions=assistant_questions,
    ):
        if validation_report is not None:
            validation_report["fallback_used"] = True
            validation_report["fallback_reason"] = "duplicate_semantic"
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


__all__ = [
    "_cosine_similarity",
    "_is_semantically_duplicate_question",
    "_question_has_any_keyword",
    "_normalize_question_focus",
    "_detect_question_focus",
    "_preferred_question_focus_for_turn",
    "_build_reask_instruction_section",
    "_looks_like_multi_part_question",
    "_looks_like_instructional_prompt",
    "_looks_like_instruction_or_ui_copy",
    "_mentions_other_company_name",
    "_question_uses_unconfirmed_premise",
    "_build_question_fallback_candidates",
    "_build_question_fallback",
    "_validate_or_repair_question",
    "_question_signature",
    "_semantic_question_signature",
    "_rotate_question_focus_for_reask",
    "_ensure_distinct_question",
]
