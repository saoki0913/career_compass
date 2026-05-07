"""Validation helpers for ES review.

Self-contained helpers (no cross-refs into `es_review.py`) live here directly;
the rest are re-exported as a facade so existing callers keep working.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Optional

from app.prompts.es_templates import get_company_honorific
from app.services.es_review.llm_validation import _validate_rewrite_with_llm
from app.services.es_review.fact_guard import (
    _compute_hallucination_score,
    _detect_fact_hallucination_warnings,
)
from app.services.es_review.grounding import COMPANY_HONORIFIC_TOKENS
from app.services.es_review.models import Issue
from app.services.es_review.validation_profile import STRICT_PROFILE, ValidationProfile


SHORT_ANSWER_CHAR_MAX = 220
FINAL_SOFT_MIN_FLOOR_RATIO = 0.9
TIGHT_LENGTH_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
    "role_course_reason",
}


@dataclass(frozen=True)
class RewriteValidationReport:
    accepted: bool
    failed_checks: list[str] = field(default_factory=list)
    primary_failure_code: str = "ok"
    retry_reason: str = "ok"
    char_count: int = 0
    length_policy: str = "strict"
    length_shortfall: int = 0
    soft_min_floor_ratio: float | None = None
    ai_smell_tier: int = 0
    hallucination_tier: int = 0

    def to_meta(self) -> dict[str, Any]:
        return asdict(self)


def _build_validation_report_meta(
    *,
    accepted: bool,
    text: str,
    failed_checks: list[str] | None = None,
    primary_failure_code: str = "ok",
    retry_reason: str = "ok",
    length_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = dict(length_meta or {})
    report = RewriteValidationReport(
        accepted=accepted,
        failed_checks=list(failed_checks or []),
        primary_failure_code=primary_failure_code,
        retry_reason=retry_reason,
        char_count=len(text or ""),
        length_policy=str(meta.get("length_policy") or "strict"),
        length_shortfall=int(meta.get("length_shortfall") or 0),
        soft_min_floor_ratio=meta.get("soft_min_floor_ratio"),
        ai_smell_tier=int(meta.get("ai_smell_tier") or 0),
        hallucination_tier=int(meta.get("hallucination_tier") or 0),
    )
    meta["validation_report"] = report.to_meta()
    meta["failed_checks"] = list(failed_checks or [])
    meta["primary_failure_code"] = primary_failure_code
    meta["char_count"] = len(text or "")
    return meta

SEMANTIC_COMPRESSION_RULES: list[tuple[str, str]] = [
    (r"ということ", "こと"),
    (r"することができる", "できる"),
    (r"することが可能", "できる"),
    (r"ことによって", "ことで"),
    (r"と考えている", "と考える"),
    (r"と考え、", "と考え"),
    (r"非常に", ""),
    (r"大変", ""),
    (r"そのため、", ""),
    (r"一方で、", ""),
    (r"加えて、", ""),
    (r"大きな価値", "価値"),
    (r"新たな価値", "価値"),
    (r"具体的には、", ""),
    (r"その中で、", ""),
    (r"また、", ""),
    (r"さらに、", ""),
    (r"そこで、", ""),
    (r"私自身", "私"),
    (r"私は", ""),
    (r"私が", ""),
    (r"ことができた", "できた"),
    (r"ことができる", "できる"),
    (r"させていただく", "する"),
    (r"であると考える", "と考える"),
    (r"につながると考える", "につながる"),
]


def _has_unfinished_tail(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return True
    return not stripped.endswith(("。", "！", "？", "!", "?"))


def _normalize_repaired_text(text: str) -> str:
    """Remove wrapper artifacts while preserving the body text."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()
    if cleaned.startswith('"') and cleaned.endswith('"'):
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _coerce_degraded_rewrite_dearu_style(text: str) -> str:
    """degraded 採用時のみ。安全な置換でです・ますを減らし、空にならなければ採用する。"""
    if "です" not in text and "ます" not in text:
        return text
    t = text
    regex_pairs = (
        (r"したい(?:です|と思います|と考えています)", "したい"),
        (r"なりたい(?:です|と思います|と考えています)", "なりたい"),
        (r"学びたい(?:です|と思います|と考えています)", "学びたい"),
        (r"磨きたい(?:です|と思います|と考えています)", "磨きたい"),
        (r"高めたい(?:です|と思います|と考えています)", "高めたい"),
        (r"深めたい(?:です|と思います|と考えています)", "深めたい"),
        (r"試したい(?:です|と思います|と考えています)", "試したい"),
        (r"身につけたい(?:です|と思います|と考えています)", "身につけたい"),
        (r"活かしたい(?:です|と思います|と考えています)", "活かしたい"),
        (r"生かしたい(?:です|と思います|と考えています)", "生かしたい"),
        (r"携わりたい(?:です|と思います|と考えています)", "携わりたい"),
        (r"貢献したい(?:です|と思います|と考えています)", "貢献したい"),
        (r"考えています", "考える"),
        (r"思います", "考える"),
    )
    for pattern, replacement in regex_pairs:
        t = re.sub(pattern, replacement, t)
    pairs = (
        ("しています", "している"),
        ("いています", "いている"),
        ("なっています", "なっている"),
        ("でいます", "でいる"),
        ("であります", "である"),
        ("あります。", "ある。"),
        ("あります", "ある"),
        ("でした。", "だった。"),
        ("でした", "だった"),
        ("ですので", "ため"),
        ("ですから", "から"),
        ("ですが", "だが"),
        ("です。", "だ。"),
        ("です", "だ"),
    )
    for old, new in pairs:
        t = t.replace(old, new)
    t = re.sub(r"([ぁ-んァ-ン一-龥A-Za-z0-9]+たい)だ(?=。|$)", r"\1", t)
    t = t.strip()
    return t if t else text


def _uses_tight_length_control(
    *,
    template_type: str,
    char_min: int | None,
    char_max: int | None,
    review_variant: str,
) -> bool:
    if not char_min or not char_max:
        return False
    _ = review_variant
    if template_type in TIGHT_LENGTH_TEMPLATES and 300 <= char_max <= 500:
        return True
    if char_max <= SHORT_ANSWER_CHAR_MAX and char_min >= 120:
        return True
    if template_type in TIGHT_LENGTH_TEMPLATES and 140 <= char_min and char_max <= 260:
        return True
    return False


def _soft_min_shortfall(
    text: str,
    *,
    char_min: int | None,
    char_max: int | None,
    final_attempt: bool = False,
) -> int:
    if not char_min or not char_max:
        return 0
    shortfall = char_min - len(text)
    if shortfall <= 0:
        return 0
    if not final_attempt:
        return 0
    floor = math.ceil(char_max * FINAL_SOFT_MIN_FLOOR_RATIO)
    if len(text) < floor:
        return 0
    return shortfall


def _is_within_char_limits(
    text: str,
    char_min: Optional[int],
    char_max: Optional[int],
) -> tuple[bool, str]:
    """Validate text against configured min/max character limits."""
    length = len(text or "")
    if char_min and length < char_min:
        return False, f"under_min:{length}<{char_min}"
    if char_max and length > char_max:
        return False, f"over_max:{length}>{char_max}"
    return True, "ok"


def _char_limit_distance(
    text: str,
    *,
    char_min: Optional[int],
    char_max: Optional[int],
) -> int:
    length = len(text or "")
    if char_min and length < char_min:
        return char_min - length
    if char_max and length > char_max:
        return length - char_max
    return 0


def _should_attempt_semantic_compression(current_len: int, char_max: Optional[int]) -> bool:
    """Semantic compression is for moderate overflow with safe repair room."""
    if not char_max or current_len <= char_max:
        return False
    excess = current_len - char_max
    return excess <= max(90, int(char_max * 0.22))


def _apply_semantic_compression_rules(text: str, char_max: int) -> str:
    compressed = text
    for pattern, replacement in SEMANTIC_COMPRESSION_RULES:
        updated = re.sub(pattern, replacement, compressed)
        updated = re.sub(r"、{2,}", "、", updated)
        updated = re.sub(r"\s+", "", updated)
        updated = re.sub(r"。{2,}", "。", updated)
        if len(updated) < len(compressed):
            compressed = updated
        if len(compressed) <= char_max:
            break
    return compressed.strip()


def _split_japanese_sentences(text: str) -> list[str]:
    sentences = [s.strip() for s in re.split(r"(?<=[。！？])", text) if s.strip()]
    return sentences or [text.strip()]


def _sentence_priority(sentence: str, index: int, total: int) -> int:
    score = 0
    if index == 0:
        score += 10
    if index == total - 1:
        score += 4
    if re.search(r"志望|理由|魅力|選ぶ|選択", sentence):
        score += 6
    if re.search(r"研究|経験|インターン|開発|取り組|学ん", sentence):
        score += 5
    if re.search(r"活か|貢献|実現|価値|推進|将来|キャリア", sentence):
        score += 5
    if re.search(r"\d", sentence):
        score += 3
    if len(sentence) <= 14:
        score -= 1
    return score


def _prune_low_priority_sentences(text: str, char_max: int) -> str | None:
    sentences = _split_japanese_sentences(text)
    if len(sentences) < 3:
        return None

    working = sentences[:]
    while len("".join(working)) > char_max and len(working) > 2:
        candidates: list[tuple[int, int]] = []
        for idx, sentence in enumerate(working):
            if idx == 0:
                continue
            priority = _sentence_priority(sentence, idx, len(working))
            candidates.append((priority, idx))
        if not candidates:
            break
        _, remove_idx = min(candidates)
        trial = working[:remove_idx] + working[remove_idx + 1 :]
        trial_text = "".join(trial)
        if trial_text == "".join(working):
            break
        working = trial

    result = "".join(working).strip()
    if len(result) <= char_max and result.endswith(("。", "！", "？")):
        return result
    return None


def _trim_to_safe_boundary(
    text: str,
    *,
    char_min: int | None,
    char_max: int,
) -> str | None:
    if len(text) <= char_max:
        return text

    boundary_candidates: list[int] = []
    for token in ("。", "！", "？"):
        index = text.rfind(token, 0, char_max + 1)
        if index >= 0:
            boundary_candidates.append(index + 1)
    for token in ("、", "，", ","):
        index = text.rfind(token, 0, char_max + 1)
        if index >= 0:
            boundary_candidates.append(index)

    for cut_index in sorted(set(boundary_candidates), reverse=True):
        trimmed = text[:cut_index].rstrip("、，, ")
        if not trimmed:
            continue
        if not trimmed.endswith(("。", "！", "？")):
            trimmed += "。"
        if char_min and len(trimmed) < char_min:
            continue
        if len(trimmed) <= char_max:
            return trimmed
    return None


def deterministic_compress_variant(variant: dict, char_max: int) -> dict | None:
    """Compress over-limit text with rule-based shortening, never hard-cutting."""
    text = variant.get("text", "").strip()
    if len(text) <= char_max:
        result = dict(variant)
        result["char_count"] = len(text)
        return result

    compressed = _apply_semantic_compression_rules(text, char_max)
    if len(compressed) > char_max:
        pruned = _prune_low_priority_sentences(compressed, char_max)
        if pruned:
            compressed = pruned
    if len(compressed) > char_max:
        trimmed = _trim_to_safe_boundary(compressed, char_min=None, char_max=char_max)
        if trimmed:
            compressed = trimmed

    if len(compressed) > char_max or not compressed.endswith(("。", "！", "？")):
        return None

    result = dict(variant)
    result["text"] = compressed
    result["char_count"] = len(compressed)
    return result


def _fit_rewrite_text_deterministically(
    text: str,
    *,
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    issues: list[Issue],
    role_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
) -> str | None:
    _ = (template_type, issues, role_name, grounding_mode, company_evidence_cards)
    normalized = _normalize_repaired_text(text)
    if not normalized:
        return None

    within_limits, _reason = _is_within_char_limits(normalized, char_min, char_max)
    if within_limits:
        return normalized

    if (
        char_max
        and len(normalized) > char_max
        and _should_attempt_semantic_compression(len(normalized), char_max)
    ):
        compressed_variant = deterministic_compress_variant(
            {"text": normalized}, char_max
        )
        if compressed_variant:
            compressed_text = str(compressed_variant.get("text") or "").strip()
            compressed_ok, _ = _is_within_char_limits(
                compressed_text, char_min, char_max
            )
            if compressed_ok:
                return compressed_text
            normalized = compressed_text

    if char_max and len(normalized) > char_max:
        safely_trimmed = _trim_to_safe_boundary(
            normalized,
            char_min=char_min,
            char_max=char_max,
        )
        if safely_trimmed:
            trimmed_ok, _ = _is_within_char_limits(
                safely_trimmed, char_min, char_max
            )
            if trimmed_ok:
                return safely_trimmed

    return None


_DEEP_GROUNDING_GENERIC_TERMS = frozenset({
    "事業",
    "企業",
    "採用",
    "情報",
    "価値",
    "価値観",
    "理念",
    "社会",
    "顧客",
    "現場",
    "成長",
    "挑戦",
})


def _extract_deep_grounding_terms(
    company_evidence_cards: Optional[list[dict]],
    *,
    company_name: str | None = None,
) -> list[str]:
    """Extract card-derived proper nouns that are safe to require in deep grounding."""
    blocked = set(_DEEP_GROUNDING_GENERIC_TERMS)
    if company_name:
        blocked.add(company_name)
    terms: list[str] = []
    seen: set[str] = set()
    for card in company_evidence_cards or []:
        haystack = " ".join(
            str(card.get(field) or "")
            for field in ("theme", "claim", "excerpt", "title")
        )
        for token in re.findall(
            r"[ァ-ヶー]{3,}|[一-龥]{2,8}(?:部|課|室|局|本部|事業部|センター|部門|チーム|グループ)|[A-Z][A-Za-z0-9]{2,}|\d+[万億兆%％人名社件]",
            haystack,
        ):
            normalized = token.strip()
            if not normalized or normalized in blocked or normalized in seen:
                continue
            seen.add(normalized)
            terms.append(normalized)
            if len(terms) >= 8:
                return terms
    return terms


def _sentence_has_deep_connection(sentence: str, company_terms: list[str]) -> bool:
    company_signal = bool(
        any(term and term in sentence for term in company_terms)
        or re.search(r"貴社の|御社の|事業|方向性|取り組み|取組|ビジョン|理念|制度|部門|領域", sentence)
    )
    personal_signal = bool(
        re.search(r"私の|自分の|経験|スキル|学び|知見|活かし|活かせ|携わ|挑戦|貢献|取り組み|強み", sentence)
    )
    return company_signal and personal_signal


def evaluate_deep_grounding_meta(
    text: str,
    *,
    company_name: str | None = None,
    company_evidence_cards: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """Return observability meta for staged deep grounding validation."""
    terms = _extract_deep_grounding_terms(
        company_evidence_cards,
        company_name=company_name,
    )
    normalized = text or ""
    proper_noun_found = bool(terms and any(term in normalized for term in terms))
    sentences = _split_candidate_sentences(normalized)
    connection_found = any(_sentence_has_deep_connection(sentence, terms) for sentence in sentences)
    return {
        "deep_grounding_terms": terms[:5],
        "deep_grounding_proper_noun_found": proper_noun_found,
        "deep_grounding_connection_found": connection_found,
    }


def _split_candidate_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def _auto_replace_gosha(text: str, industry: str | None) -> tuple[str, list[dict]]:
    """ESでの「御社」を正しい敬称（貴社/貴行等）に自動置換."""
    replacements: list[dict] = []
    if "御社" not in text:
        return text, replacements
    correct_honorific = get_company_honorific(industry)
    count = text.count("御社")
    text = text.replace("御社", correct_honorific)
    replacements.append({
        "original": "御社", "replaced_with": correct_honorific, "count": count,
    })
    return text, replacements


def _validate_rewrite_candidate(
    candidate: str,
    *,
    template_type: str,
    question: str | None = None,
    company_name: str | None,
    char_min: int | None,
    char_max: int | None,
    issues: list[Issue],
    role_name: str | None,
    intern_name: str | None = None,
    industry: str | None = None,
    grounding_mode: str,
    effective_company_grounding_policy: str = "assistive",
    effective_grounding_level: str = "none",
    company_evidence_cards: Optional[list[dict]] = None,
    review_variant: str = "standard",
    soft_validation_mode: str = "strict",
    allow_soft_min: bool | None = None,
    user_answer: str = "",
    effective_template_checks: dict[str, Any] | None = None,
    profile: ValidationProfile | None = None,
) -> tuple[str | None, str, str, dict[str, Any]]:
    _ = review_variant
    _profile = profile or STRICT_PROFILE
    if allow_soft_min is not None and soft_validation_mode == "strict":
        soft_validation_mode = "final_soft" if allow_soft_min else "strict"
    normalized = _normalize_repaired_text(candidate)
    if not normalized:
        reason = "改善案が空でした。本文を必ず返してください。"
        meta = _build_validation_report_meta(
            accepted=False,
            text="",
            failed_checks=["empty"],
            primary_failure_code="empty",
            retry_reason=reason,
        )
        return None, "empty", reason, meta

    bulletish_invalid = bool(
        "\n" in normalized and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", normalized)
    )
    fitted = _fit_rewrite_text_deterministically(
        normalized,
        template_type=template_type,
        char_min=char_min,
        char_max=char_max,
        issues=issues,
        role_name=role_name,
        grounding_mode=grounding_mode,
        company_evidence_cards=company_evidence_cards,
    )
    length_meta: dict[str, Any] = {"length_policy": "strict", "length_shortfall": 0}
    primary_length_code: str | None = None
    if not fitted:
        _, limit_reason = _is_within_char_limits(normalized, char_min, char_max)
        shortfall = _soft_min_shortfall(
            normalized,
            char_min=char_min,
            char_max=char_max,
            final_attempt=soft_validation_mode == "final_soft",
        )
        if shortfall:
            fitted = normalized
            length_meta = {
                "length_policy": "soft_ok",
                "length_shortfall": shortfall,
                "soft_min_floor_ratio": FINAL_SOFT_MIN_FLOOR_RATIO,
            }
        else:
            retry_code = "under_min" if limit_reason.startswith("under_min") else "over_max"
            primary_length_code = retry_code
            fitted = normalized

    gosha_replacements: list[dict] = []
    if grounding_mode != "none":
        fitted, gosha_replacements = _auto_replace_gosha(fitted, industry)
        if gosha_replacements:
            length_meta["gosha_replacements"] = gosha_replacements

    _hallucination_warnings = _detect_fact_hallucination_warnings(
        fitted, user_answer,
        template_type=template_type, char_max=char_max,
    )
    length_meta["hallucination_warnings"] = _hallucination_warnings
    _hallucination_result = _compute_hallucination_score(
        _hallucination_warnings,
        template_type=template_type,
        tier2_threshold=_profile.hallucination_tier2_threshold,
    )
    length_meta["hallucination_score"] = _hallucination_result["score"]
    length_meta["hallucination_tier"] = _hallucination_result["tier"]
    length_meta["hallucination_band"] = _hallucination_result["band"]

    if "\n" in fitted and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", fitted):
        bulletish_invalid = True

    fragment_invalid = _has_unfinished_tail(fitted)
    if effective_grounding_level == "deep" and company_evidence_cards:
        length_meta.update(
            evaluate_deep_grounding_meta(
                fitted,
                company_name=company_name,
                company_evidence_cards=company_evidence_cards,
            )
        )

    companyless_honorific_detected = False
    if grounding_mode == "none":
        companyless_honorific_detected = any(
            token in fitted for token in COMPANY_HONORIFIC_TOKENS
        )

    failure_codes: list[str] = []
    failure_reason = "条件を満たしていません。"
    if bulletish_invalid:
        failure_codes.append("bulletish_or_listlike")
        failure_reason = "箇条書きや列挙ではなく、1本の本文にしてください。"
    if fragment_invalid:
        failure_codes.append("fragment")
        failure_reason = "本文が断片的です。文を最後まで言い切ってください。"
    if companyless_honorific_detected:
        failure_codes.append("company_reference_in_companyless")
        failure_reason = "企業名なしの設問で「貴社」等の企業敬称が含まれています。自分の経験を主軸にまとめてください。"
    hallucination_codes_found = {w["code"] for w in _hallucination_warnings}
    hard_block_detected = bool(
        hallucination_codes_found & _profile.fact_guard_hard_block_codes
    )
    if hard_block_detected:
        failure_codes.append("hallucination")
        failure_reason = (
            "元回答の事実（数値・役割・経験）が改変されています。"
            "元の内容を正確に保ってください。"
        )
    if primary_length_code:
        failure_codes.append(primary_length_code)
        if len(failure_codes) == 1:
            failure_reason = (
                "文字数制約を満たしていません。"
                f" 現在{len(normalized)}字で、条件は "
                f"{'under_min' if primary_length_code == 'under_min' else 'over_max'} です。"
            )

    if failure_codes:
        if soft_validation_mode == "final_soft":
            blocked = {"bulletish_or_listlike", "empty", "fragment"}
            if not (set(failure_codes) & blocked):
                if set(failure_codes) == {"under_min"} and length_meta["length_policy"] != "strict":
                    meta = _build_validation_report_meta(
                        accepted=True,
                        text=fitted,
                        failed_checks=failure_codes,
                        primary_failure_code="soft_ok",
                        retry_reason="ok",
                        length_meta=length_meta,
                    )
                    meta["soft_validation_codes"] = sorted(set(failure_codes))
                    return fitted, "soft_ok", "ok", meta
        meta = _build_validation_report_meta(
            accepted=False,
            text=fitted,
            failed_checks=failure_codes,
            primary_failure_code=failure_codes[0],
            retry_reason=failure_reason,
            length_meta=length_meta,
        )
        meta.update({
            "failure_codes": failure_codes,
            "hallucination_warnings": _hallucination_warnings,
            "hallucination_tier": _hallucination_result["tier"],
        })
        return None, failure_codes[0], failure_reason, meta

    result_code = "soft_ok" if length_meta["length_policy"] != "strict" else "ok"
    meta = _build_validation_report_meta(
        accepted=True,
        text=fitted,
        failed_checks=[],
        primary_failure_code=result_code,
        retry_reason="ok",
        length_meta=length_meta,
    )
    return fitted, result_code, "ok", meta


async def _validate_rewrite_combined(
    candidate: str,
    *,
    template_type: str,
    question: str | None = None,
    company_name: str | None,
    char_min: int | None,
    char_max: int | None = None,
    issues: list[Issue],
    role_name: str | None,
    intern_name: str | None = None,
    industry: str | None = None,
    grounding_mode: str,
    effective_company_grounding_policy: str = "assistive",
    effective_grounding_level: str = "none",
    company_evidence_cards: list[dict] | None = None,
    review_variant: str = "standard",
    soft_validation_mode: str = "strict",
    allow_soft_min: bool | None = None,
    user_answer: str = "",
    effective_template_checks: dict[str, Any] | None = None,
    json_caller: Callable[..., Any] | None = None,
    is_final_attempt: bool = False,
    profile: ValidationProfile | None = None,
) -> tuple[str | None, str, str, dict[str, Any]]:
    """Run mechanical validation plus LLM quality validation."""
    _profile = profile or STRICT_PROFILE
    result = _validate_rewrite_candidate(
        candidate,
        template_type=template_type,
        question=question,
        company_name=company_name,
        char_min=char_min,
        char_max=char_max,
        issues=issues,
        role_name=role_name,
        intern_name=intern_name,
        industry=industry,
        grounding_mode=grounding_mode,
        effective_company_grounding_policy=effective_company_grounding_policy,
        effective_grounding_level=effective_grounding_level,
        company_evidence_cards=company_evidence_cards,
        review_variant=review_variant,
        soft_validation_mode=soft_validation_mode,
        allow_soft_min=allow_soft_min,
        user_answer=user_answer,
        effective_template_checks=effective_template_checks,
        profile=_profile,
    )
    accepted, code, reason, meta = result
    if not json_caller:
        return result

    llm_result = await _validate_rewrite_with_llm(
        candidate,
        template_type=template_type,
        question=question,
        user_answer=user_answer,
        company_name=company_name,
        grounding_mode=grounding_mode,
        json_caller=json_caller,
        axis_modes=_profile.axis_modes(),
    )

    if llm_result.failed_checks:
        meta["llm_failed_checks"] = llm_result.failed_checks
    if llm_result.warned_checks:
        meta["llm_warned_checks"] = llm_result.warned_checks
    if llm_result.retry_hint:
        meta["llm_retry_hint"] = llm_result.retry_hint

    if not accepted:
        return accepted, code, reason, meta

    if not llm_result.passed:
        if "fact_preservation" in llm_result.failed_checks:
            return None, "fact_preservation", llm_result.retry_hint, meta
        if is_final_attempt:
            meta["llm_lenient_pass"] = True
            return accepted, code, reason, meta
        return None, "llm_quality", llm_result.retry_hint or "品質検証で再調整が必要です。", meta

    return accepted, code, reason, meta


def _detect_ai_smell_patterns(
    text: str,
    user_answer: str,
    *,
    template_type: str = "basic",
    char_max: int | None = None,
) -> list[dict[str, str]]:
    """Detect AI-like writing patterns in rewrite text."""
    warnings: list[dict[str, str]] = []
    if not text:
        return warnings

    sentences = [s.strip() for s in re.split(r"[。！？]", text) if s.strip()]
    if len(sentences) >= 2:
        ending_patterns: list[str | None] = []
        for sentence in sentences:
            if sentence.endswith("したい"):
                ending_patterns.append("したい")
            elif sentence.endswith("と考える"):
                ending_patterns.append("と考える")
            elif sentence.endswith("である"):
                ending_patterns.append("である")
            elif sentence.endswith("と考えている"):
                ending_patterns.append("と考えている")
            elif sentence.endswith("していきたい"):
                ending_patterns.append("していきたい")
            else:
                ending_patterns.append(None)
        for idx in range(len(ending_patterns) - 1):
            if ending_patterns[idx] and ending_patterns[idx] == ending_patterns[idx + 1]:
                warnings.append({
                    "code": "repetitive_ending",
                    "detail": f"「〜{ending_patterns[idx]}」が2文連続",
                })
                break

        non_null_endings = [ending for ending in ending_patterns if ending is not None]
        if len(non_null_endings) >= 3:
            unique_ratio = len(set(non_null_endings)) / len(non_null_endings)
            if unique_ratio < 0.5:
                warnings.append({
                    "code": "low_ending_diversity",
                    "detail": (
                        f"文末多様性が低い（一意率 {unique_ratio:.1%}、"
                        f"{len(non_null_endings)}文中{len(set(non_null_endings))}種）"
                    ),
                })

    ai_phrases = [
        "関係者を巻き込みながら",
        "多様な関係者",
        "価値を形にする",
        "価値を創出する",
        "新たな価値を",
        "幅広い視野",
        "多角的に",
        "包括的に",
    ]
    detected_phrases = [
        phrase for phrase in ai_phrases if phrase in text and phrase not in user_answer
    ]
    if detected_phrases:
        warnings.append({
            "code": "ai_signature_phrase",
            "detail": f"LLM特有フレーズ検出: {'、'.join(detected_phrases[:3])}",
        })

    if "関係者" in text and "関係者" not in user_answer:
        warnings.append({
            "code": "ai_added_kankeisha",
            "detail": "「関係者」はユーザー元回答になく、AI追加の可能性",
        })

    vague_modifiers = ["大きな", "新たな", "多様な", "幅広い", "さまざまな"]
    vague_count = sum(
        1 for modifier in vague_modifiers if modifier in text and modifier not in user_answer
    )
    if vague_count >= 2:
        warnings.append({
            "code": "vague_modifier_chain",
            "detail": f"抽象修飾語が{vague_count}箇所（ユーザー元回答になし）",
        })

    connectors = [
        "この経験を活かし",
        "この経験を生かし",
        "この経験を土台に",
        "こうした経験は",
        "この力を生かし",
        "この力を活かし",
        "その経験を",
        "こうした力を",
    ]
    matched_connectors = [
        connector for connector in connectors if connector in text and connector not in user_answer
    ]
    if len(matched_connectors) >= 2:
        warnings.append({
            "code": "monotone_connector",
            "detail": f"定型接続が{len(matched_connectors)}箇所: {'、'.join(matched_connectors[:2])}",
        })

    if sentences and len(sentences) >= 3:
        last = sentences[-1]
        closing_match = re.search(r"(貢献したい|挑戦したい|実現したい|成長したい)$", last.strip("。"))
        if closing_match:
            has_concrete = bool(
                re.search(r"[\u4e00-\u9fff]{2,}(部門|事業|技術|分野|領域|環境|チーム)", last)
            )
            if not has_concrete:
                warnings.append({
                    "code": "ceremonial_closing",
                    "detail": "最終文が具体語なしの定型的意気込みで締まっている",
                })

    concrete_templates = {"gakuchika", "self_pr", "company_motivation"}
    check_concrete = template_type in concrete_templates or (
        template_type == "work_values" and char_max is not None and char_max > 200
    )
    if check_concrete:
        has_digit = bool(re.search(r"\d", text))
        has_specific_noun = bool(re.search(
            r"(\d+[人名件%％倍回日月年時間]|[一二三四五六七八九十百千万]\s*[人名件%倍回])",
            text,
        ))
        user_had_digit = bool(re.search(r"\d", user_answer))
        if user_had_digit and not has_digit:
            warnings.append({
                "code": "concrete_value_absence",
                "detail": "元回答の数値がリライトで失われた",
            })
        elif not has_digit and not has_specific_noun and len(text) >= 120:
            warnings.append({
                "code": "concrete_value_absence",
                "detail": "具体的な数値・固有名が不足している",
            })

    return warnings


_AI_SMELL_PENALTIES: dict[str, float] = {
    "repetitive_ending": 2.0,
    "ai_signature_phrase": 2.5,
    "vague_modifier_chain": 1.5,
    "monotone_connector": 1.0,
    "ceremonial_closing": 1.0,
    "low_ending_diversity": 0.5,
    "ai_added_kankeisha": 2.0,
    "concrete_value_absence": 1.5,
}

_TIER2_THRESHOLDS: dict[str, dict[str, float]] = {
    "gakuchika": {"short": 3.0, "mid_long": 3.5},
    "self_pr": {"short": 3.0, "mid_long": 3.5},
    "work_values": {"short": 3.0, "mid_long": 3.5},
    "_default": {"short": 3.5, "mid_long": 4.0},
}


def _char_max_to_band(char_max: int | None) -> str:
    """Map char_max to band name for AI smell threshold lookup."""
    if not char_max or char_max <= 220:
        return "short"
    return "mid_long"


def _compute_ai_smell_score(
    warnings: list[dict[str, str]],
    *,
    template_type: str = "basic",
    char_max: int | None = None,
) -> dict[str, Any]:
    """Compute AI smell score and tier from warning list."""
    if not warnings:
        return {"score": 0.0, "tier": 0, "band": _char_max_to_band(char_max), "details": []}

    score = 0.0
    details: list[str] = []
    for warning in warnings:
        code = warning.get("code", "")
        penalty = _AI_SMELL_PENALTIES.get(code, 0.0)
        if penalty > 0:
            score += penalty
            details.append(f"{code}={penalty}")

    band = _char_max_to_band(char_max)
    thresholds = _TIER2_THRESHOLDS.get(template_type, _TIER2_THRESHOLDS["_default"])
    tier2_threshold = thresholds.get(band, 4.0)
    tier = 2 if score >= tier2_threshold else 1 if score > 0 else 0

    return {
        "score": score,
        "tier": tier,
        "band": band,
        "threshold": tier2_threshold,
        "details": details,
    }


__all__ = [
    "FINAL_SOFT_MIN_FLOOR_RATIO",
    "SEMANTIC_COMPRESSION_RULES",
    "SHORT_ANSWER_CHAR_MAX",
    "TIGHT_LENGTH_TEMPLATES",
    "_AI_SMELL_PENALTIES",
    "_apply_semantic_compression_rules",
    "_auto_replace_gosha",
    "_char_limit_distance",
    "_char_max_to_band",
    "_coerce_degraded_rewrite_dearu_style",
    "_compute_ai_smell_score",
    "_detect_ai_smell_patterns",
    "_fit_rewrite_text_deterministically",
    "_has_unfinished_tail",
    "_is_within_char_limits",
    "_normalize_repaired_text",
    "_prune_low_priority_sentences",
    "_sentence_priority",
    "_should_attempt_semantic_compression",
    "_soft_min_shortfall",
    "_split_candidate_sentences",
    "_split_japanese_sentences",
    "_trim_to_safe_boundary",
    "_uses_tight_length_control",
    "_validate_rewrite_combined",
    "_validate_rewrite_candidate",
    "evaluate_deep_grounding_meta",
    "RewriteValidationReport",
    "deterministic_compress_variant",
]
