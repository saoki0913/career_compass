"""Validation helpers for ES review.

Self-contained helpers (no cross-refs into `es_review.py`) live here directly;
the rest are re-exported as a facade so existing callers keep working.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

from app.prompts.es_templates import get_company_honorific
from app.routers.es_review_fact_guard import (
    HARD_BLOCK_HALLUCINATION_CODES,
    _compute_hallucination_score,
    _detect_fact_hallucination_warnings,
)
from app.routers.es_review_grounding import (
    COMPANY_HONORIFIC_TOKENS,
    COMPANY_REFERENCE_TOKENS,
    _question_has_assistive_company_signal,
    _role_name_appears_in_text,
    _template_checks,
)
from app.routers.es_review_models import Issue


SHORT_ANSWER_CHAR_MAX = 220
FINAL_SOFT_MIN_FLOOR_RATIO = 0.9
TIGHT_LENGTH_TEMPLATES = {
    "company_motivation",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
    "role_course_reason",
}

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


def _candidate_has_grounding_anchor(
    text: str,
    *,
    template_type: str,
    company_name: str | None,
    role_name: str | None,
    intern_name: str | None,
    grounding_mode: str,
    company_evidence_cards: Optional[list[dict]] = None,
) -> bool:
    normalized = text or ""
    if grounding_mode == "none":
        return True

    company_terms = {
        "事業",
        "価値",
        "価値観",
        "方向性",
        "姿勢",
        "顧客",
        "社会",
        "現場",
        "変革",
        "成長",
        "挑戦",
    }
    for card in company_evidence_cards or []:
        for field in ("theme", "claim", "excerpt"):
            for token in re.findall(r"[一-龥ぁ-んァ-ヴー]{2,12}|[A-Za-z][A-Za-z0-9.+/-]{1,}", str(card.get(field) or "")):
                if len(token) >= 2:
                    company_terms.add(token)

    company_reference_present = bool(
        (company_name and company_name in normalized)
        or any(token in normalized for token in COMPANY_HONORIFIC_TOKENS)
    )
    company_term_present = any(token in normalized for token in company_terms)
    if not company_reference_present and not company_term_present:
        return False

    if grounding_mode != "role_grounded":
        return company_reference_present and company_term_present

    if template_type in {"role_course_reason", "post_join_goals"}:
        return bool(company_term_present and (
            _role_name_appears_in_text(role_name, normalized)
            or re.search(r"職種|コース|役割|業務|ポジション", normalized)
        ))
    if template_type in {"intern_reason", "intern_goals"}:
        return bool(company_term_present and (
            (intern_name and intern_name in normalized)
            or re.search(r"インターン|プログラム|実務|現場", normalized)
        ))
    return True


def _should_validate_grounding(
    *,
    template_type: str,
    question: str | None,
    effective_company_grounding_policy: str,
    grounding_mode: str,
) -> bool:
    if grounding_mode == "none":
        return False
    if effective_company_grounding_policy == "required":
        return True
    if effective_company_grounding_policy == "assistive":
        return _question_has_assistive_company_signal(
            template_type=template_type,
            question=question or "",
        )
    return False


def _split_candidate_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?])", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def _contains_negative_self_eval(text: str, *, template_type: str) -> bool:
    patterns = [
        str(pattern).strip()
        for pattern in _template_checks(template_type).get("negative_self_eval_patterns", [])
        if str(pattern).strip()
    ]
    if not patterns:
        return False
    return any(re.search(pattern, text or "") for pattern in patterns)


def _validate_standard_conclusion_focus(
    text: str,
    *,
    template_type: str,
    company_name: str | None,
    role_name: str | None,
    intern_name: str | None,
) -> tuple[str | None, str | None]:
    checks = _template_checks(template_type)
    sentences = _split_candidate_sentences(text)
    if not sentences:
        return "fragment", "本文が断片的です。文を最後まで言い切ってください。"

    first_sentence = sentences[0].strip()
    if len(sentences) > 1:
        meaningful_chars = re.findall(r"[一-龥ぁ-んァ-ヶA-Za-z0-9]", first_sentence)
        if len(set(meaningful_chars)) <= 3:
            return None, None

    repeated_pattern = str(checks.get("repeated_opening_pattern") or "").strip()
    if (
        len(sentences) > 1
        and repeated_pattern
        and re.search(repeated_pattern, first_sentence)
    ):
        return "verbose_opening", "設問の冒頭表現を繰り返さず、1文目で答えを短く言い切ってください。"
    head_sentence_window = max(1, int(checks.get("head_sentence_window") or 1))
    head = "".join(sentences[:head_sentence_window])
    anchor_type = str(checks.get("anchor_type") or "").strip()
    focus_pattern = str(checks.get("head_focus_pattern") or "").strip()
    answer_focus_message = str(checks.get("answer_focus_message") or "冒頭で設問への答えを短く示してください。").strip()

    if anchor_type == "company":
        company_anchor_head = bool(
            (company_name and company_name in head)
            or any(token in head for token in COMPANY_HONORIFIC_TOKENS)
            or any(token in head for token in COMPANY_REFERENCE_TOKENS)
        )
        if not company_anchor_head or (focus_pattern and not re.search(focus_pattern, head)):
            return "answer_focus", answer_focus_message
    elif anchor_type == "role":
        role_anchor_pattern = str(checks.get("anchor_pattern") or "").strip()
        role_anchor_head = bool(
            _role_name_appears_in_text(role_name, head)
            or (role_anchor_pattern and re.search(role_anchor_pattern, head))
        )
        if not role_anchor_head or (focus_pattern and not re.search(focus_pattern, head)):
            return "answer_focus", answer_focus_message
    elif anchor_type == "intern":
        anchor_pattern = str(checks.get("anchor_pattern") or "").strip()
        practice_context_pattern = str(checks.get("practice_context_pattern") or "").strip()
        internship_named = bool(
            intern_name
            and re.search(r"インターン|internship", intern_name, re.IGNORECASE)
        )
        has_intern_context = bool(
            (intern_name and intern_name in text)
            or (anchor_pattern and re.search(anchor_pattern, head))
            or (anchor_pattern and re.search(anchor_pattern, text))
            or (internship_named and practice_context_pattern and re.search(practice_context_pattern, text))
            or (internship_named and practice_context_pattern and re.search(practice_context_pattern, head))
        )
        if not has_intern_context or (focus_pattern and not re.search(focus_pattern, head)):
            return "answer_focus", answer_focus_message
    elif focus_pattern and not re.search(focus_pattern, head):
        return "answer_focus", answer_focus_message

    return None, None


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
    company_evidence_cards: Optional[list[dict]] = None,
    review_variant: str = "standard",
    soft_validation_mode: str = "strict",
    allow_soft_min: bool | None = None,
    user_answer: str = "",
) -> tuple[str | None, str, str, dict[str, Any]]:
    _ = review_variant
    if allow_soft_min is not None and soft_validation_mode == "strict":
        soft_validation_mode = "final_soft" if allow_soft_min else "strict"
    normalized = _normalize_repaired_text(candidate)
    if not normalized:
        return None, "empty", "改善案が空でした。本文を必ず返してください。", {}

    if "です" in normalized or "ます" in normalized:
        normalized = _coerce_degraded_rewrite_dearu_style(normalized)

    style_invalid = "です" in normalized or "ます" in normalized
    bulletish_invalid = bool(
        "\n" in normalized and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", normalized)
    )
    focus_code, focus_reason = _validate_standard_conclusion_focus(
        normalized,
        template_type=template_type,
        company_name=company_name,
        role_name=role_name,
        intern_name=intern_name,
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

    _ai_warnings = _detect_ai_smell_patterns(
        fitted, user_answer,
        template_type=template_type, char_max=char_max,
    )
    length_meta["ai_smell_warnings"] = _ai_warnings
    _ai_smell_result = _compute_ai_smell_score(
        _ai_warnings, template_type=template_type, char_max=char_max,
    )
    length_meta["ai_smell_score"] = _ai_smell_result["score"]
    length_meta["ai_smell_tier"] = _ai_smell_result["tier"]
    length_meta["ai_smell_band"] = _ai_smell_result["band"]
    _hallucination_warnings = _detect_fact_hallucination_warnings(
        fitted, user_answer,
        template_type=template_type, char_max=char_max,
    )
    length_meta["hallucination_warnings"] = _hallucination_warnings
    _hallucination_result = _compute_hallucination_score(
        _hallucination_warnings, template_type=template_type,
    )
    length_meta["hallucination_score"] = _hallucination_result["score"]
    length_meta["hallucination_tier"] = _hallucination_result["tier"]
    length_meta["hallucination_band"] = _hallucination_result["band"]

    if "です" in fitted or "ます" in fitted:
        style_invalid = True

    if "\n" in fitted and re.search(r"(^|\n)\s*([・\-•]|\d+[.)])", fitted):
        bulletish_invalid = True

    fragment_invalid = _has_unfinished_tail(fitted)
    negative_self_eval_invalid = _contains_negative_self_eval(
        fitted,
        template_type=template_type,
    )

    focus_code, focus_reason = _validate_standard_conclusion_focus(
        fitted,
        template_type=template_type,
        company_name=company_name,
        role_name=role_name,
        intern_name=intern_name,
    )

    grounding_invalid = False
    if _should_validate_grounding(
        template_type=template_type,
        question=question,
        effective_company_grounding_policy=effective_company_grounding_policy,
        grounding_mode=grounding_mode,
    ):
        grounding_invalid = not _candidate_has_grounding_anchor(
            fitted,
            template_type=template_type,
            company_name=company_name,
            role_name=role_name,
            intern_name=intern_name,
            grounding_mode=grounding_mode,
            company_evidence_cards=company_evidence_cards,
        )

    companyless_honorific_detected = False
    if grounding_mode == "none":
        companyless_honorific_detected = any(
            token in fitted for token in COMPANY_HONORIFIC_TOKENS
        )

    assistive_honorific_detected = False
    if effective_company_grounding_policy == "assistive" and grounding_mode != "none":
        assistive_honorific_detected = any(
            token in fitted for token in COMPANY_HONORIFIC_TOKENS
        )

    failure_codes: list[str] = []
    failure_reason = "条件を満たしていません。"
    if style_invalid:
        failure_codes.append("style")
        failure_reason = "です・ます調が混在しています。だ・である調に統一してください。"
    if bulletish_invalid:
        failure_codes.append("bulletish_or_listlike")
        failure_reason = "箇条書きや列挙ではなく、1本の本文にしてください。"
    if fragment_invalid:
        failure_codes.append("fragment")
        failure_reason = "本文が断片的です。文を最後まで言い切ってください。"
    if focus_code:
        failure_codes.append(focus_code)
        failure_reason = focus_reason or "設問への適合が不足しています。"
    if grounding_invalid:
        failure_codes.append("grounding")
        failure_reason = "企業や役割との接点が本文から十分に伝わっていません。"
    if negative_self_eval_invalid:
        failure_codes.append("negative_self_eval")
        failure_reason = "自己否定語を残さず、事実を保ったまま前向きな表現へ言い換えてください。"
    if companyless_honorific_detected:
        failure_codes.append("company_reference_in_companyless")
        failure_reason = "企業名なしの設問で「貴社」等の企業敬称が含まれています。自分の経験を主軸にまとめてください。"
    if assistive_honorific_detected:
        failure_codes.append("assistive_honorific")
        failure_reason = "この設問では「貴社」等の企業敬称ではなく、企業名や固有の事業・価値観で触れてください。"
    hallucination_codes_found = {w["code"] for w in _hallucination_warnings}
    hard_block_detected = bool(
        hallucination_codes_found & HARD_BLOCK_HALLUCINATION_CODES
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
                    return fitted, "soft_ok", "ok", length_meta
                allowed_soft_codes = {"style", "grounding"}
                if set(failure_codes).issubset(allowed_soft_codes):
                    meta = dict(length_meta)
                    meta["soft_validation_applied"] = True
                    meta["soft_validation_codes"] = sorted(set(failure_codes))
                    return fitted, "soft_ok", "ok", meta
        return None, failure_codes[0], failure_reason, {
            "failure_codes": failure_codes,
            "ai_smell_warnings": _ai_warnings,
            "hallucination_warnings": _hallucination_warnings,
            "hallucination_tier": _hallucination_result["tier"],
        }

    result_code = "soft_ok" if length_meta["length_policy"] != "strict" else "ok"
    return fitted, result_code, "ok", length_meta


def _detect_ai_smell_patterns(
    text: str,
    user_answer: str,
    *,
    template_type: str = "basic",
    char_max: int | None = None,
) -> list[dict[str, str]]:
    """Detect AI-like writing patterns in rewrite text.

    Returns a list of warning dicts, each with 'code' and 'detail' keys.
    This is soft detection only — results are recorded but do not cause rejection.
    """
    warnings: list[dict[str, str]] = []
    if not text:
        return warnings

    # 1. repetitive_ending: same sentence-ending pattern 2+ times in a row
    sentences = [s.strip() for s in re.split(r"[。！？]", text) if s.strip()]
    if len(sentences) >= 2:
        ending_patterns = []
        for s in sentences:
            if s.endswith("したい"):
                ending_patterns.append("したい")
            elif s.endswith("と考える"):
                ending_patterns.append("と考える")
            elif s.endswith("である"):
                ending_patterns.append("である")
            elif s.endswith("と考えている"):
                ending_patterns.append("と考えている")
            elif s.endswith("していきたい"):
                ending_patterns.append("していきたい")
            else:
                ending_patterns.append(None)
        for i in range(len(ending_patterns) - 1):
            if ending_patterns[i] and ending_patterns[i] == ending_patterns[i + 1]:
                warnings.append({
                    "code": "repetitive_ending",
                    "detail": f"「〜{ending_patterns[i]}」が2文連続",
                })
                break

        # low_ending_diversity: too few unique endings relative to total
        non_null_endings = [e for e in ending_patterns if e is not None]
        if len(non_null_endings) >= 3:
            unique_ratio = len(set(non_null_endings)) / len(non_null_endings)
            if unique_ratio < 0.5:
                warnings.append({
                    "code": "low_ending_diversity",
                    "detail": f"文末多様性が低い（一意率 {unique_ratio:.1%}、{len(non_null_endings)}文中{len(set(non_null_endings))}種）",
                })

    # 2. ai_signature_phrase: LLM-typical phrases not in user's original answer
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
    detected_phrases = [p for p in ai_phrases if p in text and p not in user_answer]
    if detected_phrases:
        warnings.append({
            "code": "ai_signature_phrase",
            "detail": f"LLM特有フレーズ検出: {'、'.join(detected_phrases[:3])}",
        })

    # 2b. ai_added_kankeisha: "関係者" added by AI when not in user's original
    if "関係者" in text and "関係者" not in user_answer:
        warnings.append({
            "code": "ai_added_kankeisha",
            "detail": "「関係者」はユーザー元回答になく、AI追加の可能性",
        })

    # 3. vague_modifier_chain: abstract modifiers without concrete backing, 2+ occurrences
    vague_modifiers = ["大きな", "新たな", "多様な", "幅広い", "さまざまな"]
    vague_count = sum(1 for m in vague_modifiers if m in text and m not in user_answer)
    if vague_count >= 2:
        warnings.append({
            "code": "vague_modifier_chain",
            "detail": f"抽象修飾語が{vague_count}箇所（ユーザー元回答になし）",
        })

    # 4. monotone_connector: template-like connectors (observation only, ≥2 matches required)
    connectors = [
        "この経験を活かし", "この経験を生かし", "この経験を土台に",
        "こうした経験は", "この力を生かし", "この力を活かし",
        "その経験を", "こうした力を",
    ]
    matched_connectors = [c for c in connectors if c in text and c not in user_answer]
    if len(matched_connectors) >= 2:
        warnings.append({
            "code": "monotone_connector",
            "detail": f"定型接続が{len(matched_connectors)}箇所: {'、'.join(matched_connectors[:2])}",
        })

    # 5. ceremonial_closing: abstract aspiration ending without concrete nouns (observation only)
    if sentences and len(sentences) >= 3:
        last = sentences[-1]
        closing_match = re.search(r"(貢献したい|挑戦したい|実現したい|成長したい)$", last.strip("。"))
        if closing_match:
            has_concrete = bool(re.search(r"[\u4e00-\u9fff]{2,}(部門|事業|技術|分野|領域|環境|チーム)", last))
            if not has_concrete:
                warnings.append({
                    "code": "ceremonial_closing",
                    "detail": "最終文が具体語なしの定型的意気込みで締まっている",
                })

    # 6. concrete_value_absence: rewrite lacks concrete markers for templates that need them
    _concrete_templates = {"gakuchika", "self_pr", "company_motivation"}
    _check_concrete = template_type in _concrete_templates or (
        template_type == "work_values" and char_max is not None and char_max > 200
    )
    if _check_concrete:
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
    # template_type -> band -> threshold
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
    """Compute AI smell score and tier from warning list.

    Returns dict with: score, tier (0/1/2), band, details.
    Tier 0: clean, Tier 1: warnings only (current behavior), Tier 2: triggers retry/rejection.
    """
    if not warnings:
        return {"score": 0.0, "tier": 0, "band": _char_max_to_band(char_max), "details": []}

    score = 0.0
    details: list[str] = []
    for w in warnings:
        code = w.get("code", "")
        penalty = _AI_SMELL_PENALTIES.get(code, 0.0)
        if penalty > 0:
            score += penalty
            details.append(f"{code}={penalty}")

    band = _char_max_to_band(char_max)
    thresholds = _TIER2_THRESHOLDS.get(template_type, _TIER2_THRESHOLDS["_default"])
    tier2_threshold = thresholds.get(band, 4.0)

    if score >= tier2_threshold:
        tier = 2
    elif score > 0:
        tier = 1
    else:
        tier = 0

    return {"score": score, "tier": tier, "band": band, "threshold": tier2_threshold, "details": details}


__all__ = [
    "FINAL_SOFT_MIN_FLOOR_RATIO",
    "SEMANTIC_COMPRESSION_RULES",
    "SHORT_ANSWER_CHAR_MAX",
    "TIGHT_LENGTH_TEMPLATES",
    "_AI_SMELL_PENALTIES",
    "_apply_semantic_compression_rules",
    "_auto_replace_gosha",
    "_candidate_has_grounding_anchor",
    "_char_max_to_band",
    "_compute_ai_smell_score",
    "_detect_ai_smell_patterns",
    "_char_limit_distance",
    "_coerce_degraded_rewrite_dearu_style",
    "_contains_negative_self_eval",
    "_fit_rewrite_text_deterministically",
    "_has_unfinished_tail",
    "_is_within_char_limits",
    "_normalize_repaired_text",
    "_prune_low_priority_sentences",
    "_sentence_priority",
    "_should_attempt_semantic_compression",
    "_should_validate_grounding",
    "_soft_min_shortfall",
    "_split_candidate_sentences",
    "_split_japanese_sentences",
    "_trim_to_safe_boundary",
    "_uses_tight_length_control",
    "_validate_rewrite_candidate",
    "_validate_standard_conclusion_focus",
    "deterministic_compress_variant",
]
