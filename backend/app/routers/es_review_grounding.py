"""Grounding and evidence helpers for ES review."""

from __future__ import annotations

import re
from typing import Any, Optional

from app.prompts.es_templates import (
    get_template_company_grounding_policy,
    get_template_evaluation_checks,
)
from app.routers.es_review_models import ReviewRequest
from app.utils.llm import sanitize_prompt_input

COMPANY_HONORIFIC_TOKENS = ("貴社", "貴行", "貴庫", "貴所", "貴校", "貴院")
COMPANY_REFERENCE_TOKENS = ("当社", "御社", "同社", "本社", "こちらの企業")
ROLE_SUPPORTIVE_CONTENT_TYPES = {
    "new_grad_recruitment",
    "employee_interviews",
    "corporate_site",
}
ROLE_PROGRAM_EVIDENCE_THEMES = {"役割理解", "インターン機会", "現場期待"}
COMPANY_DIRECTION_EVIDENCE_THEMES = {
    "企業理解",
    "事業理解",
    "価値観",
    "将来接続",
    "採用方針",
    "成長領域",
    "成長機会",
}
SUPPORTING_PROMPT_FACT_SOURCES = {
    "gakuchika_summary",
    "document_section",
    "gakuchika_raw_material",
}
GENERIC_ROLE_PATTERNS = (
    r"^総合職$",
    r"^総合職[ABCD]?$",
    r"^総合コース$",
    r"^オープンコース$",
    r"^open\s*course$",
    r"^open$",
    r"^global\s*staff$",
)


def _template_checks(template_type: str) -> dict[str, Any]:
    return get_template_evaluation_checks(template_type)


def _split_fact_spans(text: str, max_items: int = 4) -> list[str]:
    if not text:
        return []
    parts = re.split(r"(?<=[。！？!?])|\n+", text)
    facts: list[str] = []
    for part in parts:
        normalized = re.sub(r"\s+", " ", part).strip()
        if len(normalized) < 10:
            continue
        snippet = normalized[:120]
        if snippet not in facts:
            facts.append(snippet)
        if len(facts) >= max_items:
            break
    return facts


def _append_user_fact(
    facts: list[dict[str, str]],
    seen: set[tuple[str, str]],
    *,
    source: str,
    text: str,
    usage: str,
) -> None:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if len(normalized) < 6:
        return
    key = (source, normalized)
    if key in seen:
        return
    seen.add(key)
    facts.append(
        {
            "source": source,
            "text": normalized[:140],
            "usage": usage,
        }
    )


def _build_allowed_user_facts(request: ReviewRequest) -> list[dict[str, str]]:
    facts: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for span in _split_fact_spans(request.content, max_items=6):
        _append_user_fact(
            facts,
            seen,
            source="current_answer",
            text=span,
            usage="具体的経験・役割・成果・数字に使ってよい",
        )

    if request.document_context:
        for section in request.document_context.other_sections[:4]:
            title = re.sub(r"\s+", " ", section.title or "").strip()
            for span in _split_fact_spans(section.content, max_items=3):
                _append_user_fact(
                    facts,
                    seen,
                    source="document_section",
                    text=f"{title}: {span}" if title else span,
                    usage="同一ES内で既に書かれている事実として使ってよい",
                )

    for gakuchika in request.gakuchika_context[:4]:
        if gakuchika.source_status == "structured_summary":
            if gakuchika.action_text:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {gakuchika.action_text}",
                    usage="行動・役割として使ってよい",
                )
            if gakuchika.result_text:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {gakuchika.result_text}",
                    usage="成果・学びとして使ってよい",
                )
            for number in gakuchika.numbers[:3]:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_summary",
                    text=f"{gakuchika.title}: {number}",
                    usage="明示された数値として使ってよい",
                )
            for strength in gakuchika.strengths[:3]:
                if isinstance(strength, str):
                    text = strength
                else:
                    title = str(strength.get("title") or "").strip()
                    description = str(strength.get("description") or "").strip()
                    text = " - ".join(part for part in [title, description] if part)
                if text:
                    _append_user_fact(
                        facts,
                        seen,
                        source="gakuchika_summary",
                        text=f"{gakuchika.title}: {text}",
                        usage="要約済みの強み・学びとして使ってよい",
                    )
        else:
            for span in gakuchika.fact_spans[:4]:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_raw_material",
                    text=f"{gakuchika.title}: {span}",
                    usage="明示文面の範囲だけを使ってよい。強みや成果の推定は禁止",
                )
            if gakuchika.content_excerpt:
                _append_user_fact(
                    facts,
                    seen,
                    source="gakuchika_raw_material",
                    text=f"{gakuchika.title}: {gakuchika.content_excerpt}",
                    usage="原文要約ではなく素材断片としてのみ参照できる",
                )

    profile = request.profile_context
    if profile:
        if profile.university:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"大学: {profile.university}",
                usage="背景情報として使ってよい。経験創作には使わない",
            )
        if profile.faculty:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"学部学科: {profile.faculty}",
                usage="背景情報として使ってよい。経験創作には使わない",
            )
        for job_type in profile.target_job_types[:4]:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"志望職種: {job_type}",
                usage="志向情報として使ってよい。経験創作には使わない",
            )
        for industry in profile.target_industries[:4]:
            _append_user_fact(
                facts,
                seen,
                source="profile",
                text=f"志望業界: {industry}",
                usage="志向情報として使ってよい。経験創作には使わない",
            )

    return facts


def _role_name_appears_in_text(role_name: str | None, haystack: str) -> bool:
    if not role_name:
        return False
    rn = re.sub(r"\s+", " ", role_name).strip()
    if not rn:
        return False
    if rn in haystack:
        return True
    for part in re.split(r"[/／・]+", rn):
        p = part.strip()
        if len(p) >= 2 and p in haystack:
            return True
    return False


def _extract_prompt_terms(*texts: str, max_terms: int = 18) -> list[str]:
    stop_terms = {
        "について",
        "ください",
        "理由",
        "説明",
        "選んだ",
        "選択",
        "エントリー",
        "インターンシップ",
        "インターン",
        "会社",
        "企業",
        "貴社",
        "自分",
        "こと",
        "ため",
        "です",
        "ます",
    }
    terms: list[str] = []
    for text in texts:
        for token in re.findall(r"[A-Za-z0-9][A-Za-z0-9.+/-]{1,}|[一-龠々ぁ-んァ-ヴー]{2,14}", text or ""):
            normalized = token.strip()
            if (
                len(normalized) < 2
                or normalized in stop_terms
                or normalized.lower() in stop_terms
                or normalized in terms
            ):
                continue
            terms.append(normalized)
            if len(terms) >= max_terms:
                return terms
    return terms


def _is_generic_role_label(role_name: str | None) -> bool:
    normalized = re.sub(r"\s+", " ", (role_name or "")).strip().lower()
    if not normalized:
        return False
    return any(re.fullmatch(pattern, normalized, re.IGNORECASE) for pattern in GENERIC_ROLE_PATTERNS)


def _extract_question_focus_signals(
    *,
    template_type: str,
    question: str,
    answer: str | None = None,
) -> dict[str, list[str]]:
    text = " ".join([template_type, question or "", answer or ""])
    signals: list[tuple[str, list[str]]] = []
    if re.search(r"事業|ビジネス|領域|商材|手掛け|手がけ|注力|投資|事業領域|社会課題", text):
        signals.append(("事業理解", ["事業", "ビジネス", "成長領域", "注力分野", "社会課題"]))
    if re.search(r"経験|スキル|学び|学ぶ|獲得|成長|若手|挑戦|鍛え|磨き", text):
        signals.append(("成長機会", ["経験", "スキル", "成長", "若手", "挑戦"]))
    if re.search(r"価値観|人物|社風|文化|求める|大切|重視|理念|使命|風土", text):
        signals.append(("価値観", ["価値観", "求める人物像", "社員", "理念", "風土"]))
    if re.search(r"入社後|将来|キャリア|実現|やりたい|挑みたい|貢献|担いたい", text):
        signals.append(("将来接続", ["入社後", "将来", "キャリア", "挑戦", "貢献"]))
    if re.search(r"職種|コース|業務|仕事内容|役割|担当|部署|キャリアコース", text):
        signals.append(("役割理解", ["職種", "業務", "仕事内容", "役割", "担当"]))
    if re.search(r"インターン|プログラム|workshop|ワークショップ|就業|就労体験|現場体験|実務", text, re.IGNORECASE):
        signals.append(("インターン機会", ["インターン", "プログラム", "実務", "現場", "社員"]))

    default_by_template = {
        "post_join_goals": [
            ("事業理解", ["事業", "成長領域", "注力分野"]),
            ("成長機会", ["経験", "スキル", "若手"]),
            ("将来接続", ["入社後", "キャリア", "挑戦"]),
        ],
        "company_motivation": [
            ("事業理解", ["事業", "方向性", "注力分野"]),
            ("価値観", ["価値観", "人物像", "社員"]),
            ("将来接続", ["入社後", "貢献", "挑戦"]),
        ],
        "role_course_reason": [
            ("役割理解", ["職種", "業務", "仕事内容", "役割"]),
            ("成長機会", ["経験", "スキル", "挑戦"]),
            ("価値観", ["価値観", "社員"]),
        ],
        "intern_reason": [
            ("インターン機会", ["インターン", "プログラム", "実務", "現場"]),
            ("成長機会", ["学び", "スキル", "経験"]),
            ("役割理解", ["業務", "仕事内容", "役割"]),
        ],
        "intern_goals": [
            ("インターン機会", ["インターン", "プログラム", "実務", "現場"]),
            ("成長機会", ["学び", "スキル", "経験"]),
            ("将来接続", ["将来", "貢献", "挑戦"]),
        ],
        "self_pr": [
            ("成長機会", ["経験", "スキル", "強み"]),
            ("価値観", ["価値観", "人物像", "社員"]),
        ],
    }
    if not signals:
        signals = default_by_template.get(
            template_type,
            [("企業理解", ["事業", "価値観", "社員"])],
        )
    elif template_type in default_by_template:
        existing_themes = {theme for theme, _ in signals}
        for theme, terms in default_by_template[template_type]:
            if theme not in existing_themes:
                signals.append((theme, terms))

    themes: list[str] = []
    query_terms: list[str] = []
    for theme, terms in signals:
        if theme not in themes:
            themes.append(theme)
        for term in terms:
            if term not in query_terms:
                query_terms.append(term)
    return {"themes": themes[:6], "query_terms": query_terms[:10]}


def _question_has_assistive_company_signal(
    *,
    template_type: str,
    question: str,
) -> bool:
    text = " ".join([template_type, question or ""])
    if template_type == "self_pr":
        return bool(re.search(r"強み|自己PR|自己ＰＲ|活か|発揮|貢献", text))
    if template_type == "work_values":
        return bool(re.search(r"価値観|大切|重視|働く|姿勢", text))
    if template_type == "gakuchika":
        return bool(re.search(r"学び|強み|活か|仕事|貢献|将来|価値観", text))
    if template_type == "basic":
        return bool(re.search(r"強み|価値観|活か|志望|理由|将来|入社後", text))
    return False


def _count_term_overlap(text: str, terms: list[str]) -> int:
    haystack = text or ""
    return sum(1 for term in terms if term and term in haystack)


def _select_prompt_user_facts(
    allowed_user_facts: list[dict[str, str]],
    *,
    template_type: str | None = None,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    company_name: str | None,
    max_items: int = 8,
    char_max: int | None = None,
) -> list[dict[str, str]]:
    if not allowed_user_facts:
        return []

    anchor_terms = _extract_prompt_terms(
        question,
        answer,
        role_name or "",
        intern_name or "",
        company_name or "",
    )
    if template_type:
        focus_signals = _extract_question_focus_signals(
            template_type=template_type,
            question=question,
            answer=answer,
        )
        for term in focus_signals["query_terms"]:
            if term not in anchor_terms:
                anchor_terms.append(term)
    source_weights = {
        "current_answer": 10,
        "gakuchika_summary": 8,
        "document_section": 7,
        "gakuchika_raw_material": 6,
        "profile": 3,
    }
    source_caps = {
        "current_answer": 3,
        "gakuchika_summary": 2,
        "document_section": 2,
        "gakuchika_raw_material": 2,
        "profile": 2,
    }
    # Short-band: allow more current_answer facts to preserve user's key points
    if char_max and char_max <= 220:
        source_caps["current_answer"] = 4

    if role_name or company_name:
        source_caps["profile"] = 1

    scored: list[dict[str, Any]] = []
    for index, fact in enumerate(allowed_user_facts):
        text = str(fact.get("text") or "").strip()
        if not text:
            continue
        source = str(fact.get("source") or "unknown")
        overlap = _count_term_overlap(text, anchor_terms)
        score = source_weights.get(source, 1) + overlap * 3
        if source == "profile" and overlap == 0:
            score -= 1
        scored.append(
            {
                "score": score,
                "index": index,
                "fact": fact,
                "source": source,
                "overlap": overlap,
            }
        )

    ranked = sorted(scored, key=lambda item: (-int(item["score"]), int(item["index"])))

    selected: list[dict[str, str]] = []
    per_source_counts: dict[str, int] = {}

    def add_entry(entry: dict[str, Any]) -> bool:
        fact = entry["fact"]
        source = str(entry["source"] or "unknown")
        if per_source_counts.get(source, 0) >= source_caps.get(source, 2):
            return False
        if fact in selected:
            return False
        selected.append(fact)
        per_source_counts[source] = per_source_counts.get(source, 0) + 1
        return True

    primary_answer = next(
        (entry for entry in ranked if entry["source"] == "current_answer"),
        None,
    )
    if primary_answer:
        add_entry(primary_answer)

    support_fact = next(
        (
            entry
            for entry in ranked
            if entry["source"] in SUPPORTING_PROMPT_FACT_SOURCES
        ),
        None,
    )
    if support_fact:
        add_entry(support_fact)

    if role_name or company_name:
        profile_fact = next(
            (
                entry
                for entry in ranked
                if entry["source"] == "profile" and int(entry["overlap"]) > 0
            ),
            None,
        )
        if profile_fact:
            add_entry(profile_fact)

    for entry in ranked:
        if len(selected) >= max_items:
            break
        add_entry(entry)

    return selected or allowed_user_facts[:max_items]


def _tokenize_role_terms(role_name: str | None) -> list[str]:
    if not role_name:
        return []
    tokens = re.findall(r"[A-Za-z0-9]+|[一-龠々ぁ-んァ-ヴー]{2,8}", role_name)
    cleaned = []
    for token in tokens:
        stripped = token.strip()
        if len(stripped) >= 2 and stripped not in cleaned:
            cleaned.append(stripped)
    if role_name not in cleaned:
        cleaned.insert(0, role_name)
    return cleaned[:6]


def _infer_company_evidence_theme(
    *,
    template_type: str,
    content_type: str,
    text: str,
    role_terms: list[str],
    intern_name: str | None,
    generic_role_mode: bool = False,
    question_focus_themes: Optional[list[str]] = None,
) -> str:
    focus_themes = set(question_focus_themes or [])
    if intern_name and intern_name in text:
        return "インターン機会"
    if re.search(r"インターン|internship|program", text, re.IGNORECASE):
        return "インターン機会"
    if role_terms and any(term in text for term in role_terms):
        return "役割理解"
    if "インターン機会" in focus_themes and content_type == "new_grad_recruitment":
        return "インターン機会"
    if (
        "インターン機会" in focus_themes
        and content_type == "corporate_site"
        and re.search(r"インターン|program|実務", text, re.IGNORECASE)
    ):
        return "インターン機会"
    if "事業理解" in focus_themes and content_type in {"corporate_site", "ir_materials", "midterm_plan"}:
        return "事業理解"
    if "成長機会" in focus_themes and content_type in {"new_grad_recruitment", "employee_interviews"}:
        return "成長機会"
    if "価値観" in focus_themes and content_type in {"new_grad_recruitment", "employee_interviews", "corporate_site"}:
        return "価値観"
    if "将来接続" in focus_themes and content_type in {"midterm_plan", "ir_materials", "corporate_site"}:
        return "将来接続"
    if "役割理解" in focus_themes and content_type in {"employee_interviews", "new_grad_recruitment", "corporate_site"}:
        return "役割理解"
    if generic_role_mode and "成長機会" in focus_themes and content_type in {"corporate_site", "ir_materials"}:
        return "成長機会"
    if content_type == "employee_interviews":
        return "現場期待"
    if content_type == "new_grad_recruitment":
        return "採用方針"
    if content_type in {"ir_materials", "midterm_plan"}:
        return "成長領域"
    if template_type == "company_motivation":
        return "企業理解"
    if template_type == "post_join_goals":
        return "将来接続"
    return "企業理解"


def _infer_secondary_company_evidence_theme(
    *,
    template_type: str,
    content_type: str,
    text: str,
    primary_theme: str,
    role_terms: list[str],
    grounding_mode: str,
) -> str | None:
    haystack = text or ""
    if (
        grounding_mode == "role_grounded"
        and primary_theme != "役割理解"
        and (
            any(term and term in haystack for term in role_terms)
            or content_type in ROLE_SUPPORTIVE_CONTENT_TYPES
        )
    ):
        return "役割理解"
    if primary_theme != "現場期待" and re.search(r"現場|実務|若手|学び|経験|意思決定", haystack):
        return "現場期待"
    if primary_theme != "事業理解" and re.search(r"事業|投資|価値創出|社会課題|成長領域", haystack):
        return "事業理解"
    if template_type == "post_join_goals" and primary_theme != "将来接続" and re.search(
        r"将来|成長|機会|挑戦|キャリア",
        haystack,
    ):
        return "将来接続"
    return None


def _score_company_evidence_source(
    source: dict,
    *,
    template_type: str,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    generic_role_mode: bool = False,
    question_focus_terms: Optional[list[str]] = None,
    user_priority_urls: Optional[set[str]] = None,
) -> int:
    content_type = str(source.get("content_type") or "")
    source_url = str(source.get("source_url") or "")
    haystack = " ".join(
        str(source.get(key) or "")
        for key in ("title", "excerpt", "heading", "heading_path", "source_url")
    )
    role_terms = _tokenize_role_terms(role_name)
    query_terms = _extract_prompt_terms(
        question,
        answer,
        role_name or "",
        intern_name or "",
    )
    focus_terms = [term for term in (question_focus_terms or []) if term]

    score = {
        "new_grad_recruitment": 10,
        "employee_interviews": 9,
        "corporate_site": 7,
        "midterm_plan": 6,
        "ir_materials": 6,
        "press_release": 4,
    }.get(content_type, 3)
    score += _count_term_overlap(haystack, role_terms) * 4
    score += _count_term_overlap(haystack, query_terms) * 2
    score += _count_term_overlap(haystack, focus_terms) * (4 if generic_role_mode else 2)

    if grounding_mode == "role_grounded" and content_type in ROLE_SUPPORTIVE_CONTENT_TYPES:
        score += 3
    if generic_role_mode and content_type in {"new_grad_recruitment", "employee_interviews", "corporate_site", "ir_materials", "midterm_plan"}:
        score += 3
    if intern_name and intern_name in haystack:
        score += 5
    if template_type == "intern_reason" and re.search(r"インターン|program|workshop", haystack, re.IGNORECASE):
        score += 5
    if template_type == "role_course_reason" and role_terms and any(term in haystack for term in role_terms):
        score += 4
    if template_type == "post_join_goals" and content_type in {"midterm_plan", "ir_materials"}:
        score += 3
    if source.get("title"):
        score += 1
    if source.get("excerpt"):
        score += 1
    if source_url and user_priority_urls and source_url in user_priority_urls:
        score += 8
    return score


def _normalize_company_evidence_axis(theme: str) -> str:
    mapping = {
        "価値観": "value_orientation",
        "採用方針": "value_orientation",
        "企業理解": "business_characteristics",
        "事業理解": "business_characteristics",
        "将来接続": "business_characteristics",
        "成長領域": "business_characteristics",
        "現場期待": "work_environment",
        "成長機会": "work_environment",
        "役割理解": "role_expectation",
        "インターン機会": "role_expectation",
    }
    return mapping.get(theme, "business_characteristics")


def _normalize_company_evidence_summary(card: dict[str, Any]) -> str:
    claim = str(card.get("claim") or "").strip()
    excerpt = str(card.get("excerpt") or "").strip()
    axis = str(card.get("normalized_axis") or "").strip()

    if axis == "value_orientation":
        return "価値観・重視姿勢としては、" + (claim or excerpt)
    if axis == "work_environment":
        return "働く環境や期待行動としては、" + (claim or excerpt)
    if axis == "role_expectation":
        return "役割期待としては、" + (claim or excerpt)
    return "事業や提供価値の特徴としては、" + (claim or excerpt)


def _build_company_evidence_cards(
    rag_sources: list[dict],
    *,
    template_type: str,
    question: str,
    answer: str,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    max_items: int = 5,
    user_priority_urls: Optional[set[str]] = None,
) -> list[dict[str, str]]:
    company_grounding = get_template_company_grounding_policy(template_type)
    if not rag_sources:
        return []

    generic_role_mode = _is_generic_role_label(role_name)
    focus_signals = _extract_question_focus_signals(
        template_type=template_type,
        question=question,
        answer=answer,
    )
    ranked: list[tuple[int, int, dict]] = []
    for index, source in enumerate(rag_sources):
        score = _score_company_evidence_source(
            source,
            template_type=template_type,
            question=question,
            answer=answer,
            role_name=role_name,
            intern_name=intern_name,
            grounding_mode=grounding_mode,
            generic_role_mode=generic_role_mode,
            question_focus_terms=focus_signals["query_terms"],
            user_priority_urls=user_priority_urls,
        )
        ranked.append((-score, index, source))

    role_terms = _tokenize_role_terms(role_name)
    candidates: list[dict[str, str]] = []
    seen_claims: set[str] = set()
    for _, _, source in sorted(ranked):
        content_type = str(source.get("content_type") or "")
        title = sanitize_prompt_input(
            str(source.get("title") or source.get("heading") or ""), max_length=72
        ).strip()
        excerpt = sanitize_prompt_input(
            str(source.get("excerpt") or ""), max_length=120
        ).strip()
        claim = title if len(title) >= 8 else excerpt or title
        if len(claim) < 8:
            continue
        theme = _infer_company_evidence_theme(
            template_type=template_type,
            content_type=content_type,
            text=" ".join([title, excerpt]),
            role_terms=role_terms,
            intern_name=intern_name,
            generic_role_mode=generic_role_mode,
            question_focus_themes=focus_signals["themes"],
        )
        if claim in seen_claims:
            continue
        seen_claims.add(claim)
        candidates.append(
            {
                "theme": theme,
                "claim": claim,
                "excerpt": excerpt,
                "normalized_axis": _normalize_company_evidence_axis(theme),
                "source_url": str(source.get("source_url") or ""),
                "content_type": content_type,
                "title": title,
                "same_company_verified": bool(source.get("same_company_verified", True)),
            }
        )
        secondary_theme = _infer_secondary_company_evidence_theme(
            template_type=template_type,
            content_type=content_type,
            text=excerpt,
            primary_theme=theme,
            role_terms=role_terms,
            grounding_mode=grounding_mode,
        )
        if (
            company_grounding == "required"
            and secondary_theme
            and secondary_theme != theme
            and len(excerpt) >= 20
        ):
            candidates.append(
                {
                    "theme": secondary_theme,
                    "claim": excerpt,
                    "excerpt": title if title and title != excerpt else "",
                    "normalized_axis": _normalize_company_evidence_axis(secondary_theme),
                    "source_url": str(source.get("source_url") or ""),
                    "content_type": content_type,
                    "title": title,
                    "same_company_verified": bool(source.get("same_company_verified", True)),
                }
            )

    effective_max_items = min(max_items, 1 if company_grounding == "assistive" else 4)

    cards: list[dict[str, str]] = []
    seen_themes: set[str] = set()
    per_theme_counts: dict[str, int] = {}
    theme_target = 1 if company_grounding == "assistive" else (4 if generic_role_mode else 3)

    def append_candidate(candidate: dict[str, str]) -> bool:
        theme = candidate["theme"]
        if candidate in cards:
            return False
        cards.append(candidate)
        seen_themes.add(theme)
        per_theme_counts[theme] = per_theme_counts.get(theme, 0) + 1
        return True

    if company_grounding == "required":
        for theme_group in (ROLE_PROGRAM_EVIDENCE_THEMES, COMPANY_DIRECTION_EVIDENCE_THEMES):
            for candidate in candidates:
                if candidate["theme"] not in theme_group:
                    continue
                if append_candidate(candidate):
                    break

    for candidate in candidates:
        candidate["normalized_summary"] = _normalize_company_evidence_summary(candidate)
        theme = candidate["theme"]
        if theme in seen_themes:
            continue
        append_candidate(candidate)
        if len(cards) >= min(theme_target, effective_max_items):
            break

    for candidate in candidates:
        if len(cards) >= effective_max_items:
            break
        if candidate in cards:
            continue
        theme = candidate["theme"]
        if company_grounding == "assistive":
            break
        if generic_role_mode and per_theme_counts.get(theme, 0) >= 1:
            continue
        if not generic_role_mode and per_theme_counts.get(theme, 0) >= 2:
            continue
        append_candidate(candidate)

    return cards


def _assess_company_evidence_coverage(
    *,
    template_type: str,
    role_name: str | None,
    company_rag_available: bool,
    company_evidence_cards: Optional[list[dict[str, str]]],
    grounding_mode: str,
) -> tuple[str, bool]:
    cards = [
        card
        for card in (company_evidence_cards or [])
        if bool(card.get("same_company_verified", True))
    ]
    company_grounding = get_template_company_grounding_policy(template_type)
    if not company_rag_available or not cards:
        return "none", company_grounding == "required"

    generic_role_mode = _is_generic_role_label(role_name)
    theme_count = len(
        {
            str(card.get("theme") or "").strip()
            for card in cards
            if str(card.get("theme") or "").strip()
        }
    )
    card_count = len(cards)
    themes = {
        str(card.get("theme") or "").strip()
        for card in cards
        if str(card.get("theme") or "").strip()
    }

    if company_grounding == "assistive":
        if grounding_mode == "role_grounded" and themes & {"役割理解", "現場期待", "インターン機会"}:
            return "strong", False
        if themes & {"価値観", "現場期待", "役割理解", "採用方針", "成長機会", "インターン機会"}:
            return "partial", False
        return "weak", False

    if grounding_mode == "role_grounded" and theme_count >= 2 and card_count >= 2:
        return "strong", False

    if generic_role_mode:
        if theme_count >= 3 and card_count >= 3:
            return "strong", False
        if theme_count >= 2 and card_count >= 2:
            return "partial", False
        return "weak", True

    if theme_count >= 2 and card_count >= 2:
        return "strong", False
    if theme_count >= 1 and card_count >= 1:
        return "partial", False
    return "weak", True


def _collect_user_context_sources(request: ReviewRequest) -> list[str]:
    sources: list[str] = ["current_answer"]
    if request.document_context and request.document_context.other_sections:
        sources.append("document_sections")
    if request.gakuchika_context:
        if any(item.source_status == "raw_material" for item in request.gakuchika_context):
            sources.append("gakuchika_raw_material")
        if any(item.source_status == "structured_summary" for item in request.gakuchika_context):
            sources.append("gakuchika_summary")
    if request.profile_context:
        sources.append("profile")
    return sources
