"""Company grounding and metadata helpers for motivation flows."""

from __future__ import annotations

import re
from typing import Any

from app.utils.content_types import content_type_label
from app.routers.motivation_context import (
    REQUIRED_MOTIVATION_STAGES,
    _clean_short_phrase,
    _coerce_string_list,
    _is_noisy_company_text,
    _normalize_conversation_context,
    _normalize_slot_state_map,
)
from app.routers.motivation_models import EvidenceCard, StageStatus

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

_DRAFT_KEY_POINT_LABELS: dict[str, str] = {
    "industry_reason": "業界軸",
    "company_reason": "企業理解",
    "self_connection": "自己接続",
    "desired_work": "やりたい仕事",
    "value_contribution": "価値発揮",
    "differentiation": "差別化",
}

STAGE_ORDER = [
    "industry_reason",
    "company_reason",
    "self_connection",
    "desired_work",
    "value_contribution",
    "differentiation",
]


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
        _extract_company_features(
            company_context, company_sources, max_features=min(4, max_items)
        ),
        _extract_work_candidates_from_context(
            company_context,
            company_sources,
            selected_role=selected_role,
            max_items=min(4, max_items),
        ),
        max_items=max_items,
    )


def _clean_motivation_metadata_items(
    value: object,
    *,
    max_items: int,
    max_len: int,
) -> list[str]:
    cleaned: list[str] = []
    if not isinstance(value, list):
        return cleaned
    for raw_item in value:
        if not isinstance(raw_item, str):
            continue
        normalized = " ".join(raw_item.split())
        if not normalized:
            continue
        normalized = normalized[:max_len].strip()
        if len(normalized) < 2 or normalized in cleaned:
            continue
        cleaned.append(normalized)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _resolve_motivation_draft_metadata(
    *,
    slot_summaries: dict[str, str | None] | None,
    llm_key_points: object,
    llm_company_keywords: object,
    company_context: str,
    company_sources: list[dict] | None,
    selected_role: str | None,
    include_experience_anchor: bool = False,
    max_key_points: int = 3,
    max_company_keywords: int = 6,
) -> tuple[list[str], list[str]]:
    deterministic_key_points: list[str] = []
    summaries = slot_summaries or {}
    for stage in (
        "company_reason",
        "self_connection",
        "desired_work",
        "value_contribution",
        "differentiation",
        "industry_reason",
    ):
        if summaries.get(stage) and stage in _DRAFT_KEY_POINT_LABELS:
            deterministic_key_points.append(_DRAFT_KEY_POINT_LABELS[stage])

    if include_experience_anchor and "自己接続" not in deterministic_key_points:
        deterministic_key_points.append("自己接続")
    if (selected_role or "").strip() and "やりたい仕事" not in deterministic_key_points:
        deterministic_key_points.append("やりたい仕事")

    key_points = _merge_candidate_lists(
        deterministic_key_points,
        _clean_motivation_metadata_items(
            llm_key_points, max_items=max_key_points, max_len=20
        ),
        max_items=max_key_points,
    )

    company_keywords = _merge_candidate_lists(
        _extract_company_keywords(
            company_context,
            company_sources,
            selected_role=selected_role,
            max_items=max_company_keywords,
        ),
        _clean_motivation_metadata_items(
            llm_company_keywords,
            max_items=max_company_keywords,
            max_len=24,
        ),
        max_items=max_company_keywords,
    )
    if not company_keywords:
        fallback_keyword = company_context.strip().splitlines()[0].split("。")[0].strip()
        if fallback_keyword:
            company_keywords = [fallback_keyword[:24]]

    return key_points, company_keywords


def _extract_role_candidates_from_context(
    company_context: str, max_items: int = 4
) -> list[str]:
    pattern = re.compile(
        r"(営業|企画|マーケティング|コンサルタント|エンジニア|開発|研究|データサイエンティスト|デザイナー|総合職|事務|人事|財務|法務|生産技術|品質管理)"
    )
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
        for candidate in _extract_compound_nouns(
            segment, COMPANY_FEATURE_ENDINGS, max_len=26
        ):
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
        for candidate in _extract_compound_nouns(
            segment, WORK_CANDIDATE_ENDINGS, max_len=28
        ):
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


def _merge_candidate_lists(
    *candidate_lists: list[str], max_items: int = 4
) -> list[str]:
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
                    str(
                        source.get("title")
                        or content_type_label(content_type)
                        or "参照資料"
                    ),
                    max_len=40,
                ),
                contentType=content_type,
                excerpt=_normalize_excerpt(
                    str(source.get("excerpt") or "").strip(), max_len=84
                ),
                sourceUrl=source_url,
                relevanceLabel=content_type_label(content_type) or "企業情報",
            )
        )
    return cards


def _build_stage_status(
    conversation_context: dict[str, Any] | None, current_stage: str
) -> StageStatus:
    context = _normalize_conversation_context(conversation_context)
    normalized_current_stage = (
        "self_connection"
        if current_stage in {"origin_experience", "fit_connection"}
        else current_stage
    )
    slot_states = _normalize_slot_state_map(context.get("slotStates"))
    completed = [
        stage
        for stage in REQUIRED_MOTIVATION_STAGES
        if slot_states.get(stage) == "locked"
    ]

    pending = [
        stage
        for stage in STAGE_ORDER
        if stage not in completed and stage != normalized_current_stage
    ]
    return StageStatus(
        current=normalized_current_stage, completed=completed, pending=pending
    )


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
