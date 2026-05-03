"""Fact-preservation guardrails for ES rewrite validation."""

from __future__ import annotations

import re
from typing import Any


_ROLE_TITLES = [
    "副会長",
    "副部長",
    "副委員長",
    "副代表",
    "副リーダー",
    "副幹事長",
    "会長",
    "部長",
    "委員長",
    "代表",
    "リーダー",
    "幹事長",
    "チーフ",
    "マネージャー",
    "キャプテン",
    "監督",
    "幹事",
    "書記",
    "会計",
    "広報",
    "渉外",
    "主将",
    "副主将",
]

_KANJI_DIGITS = {
    "零": 0,
    "〇": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
_KANJI_SMALL_UNITS = {"十": 10, "百": 100, "千": 1000}
_KANJI_LARGE_UNITS = {"万": 10_000, "億": 100_000_000}

_NUMERIC_UNITS = [
    "ヶ月",
    "か月",
    "カ月",
    "ヵ月",
    "時間",
    "人",
    "名",
    "件",
    "％",
    "%",
    "倍",
    "回",
    "日",
    "月",
    "年",
    "分",
    "秒",
    "個",
    "社",
    "台",
    "冊",
    "本",
    "万",
    "億",
    "割",
    "厘",
]
_NUMERIC_UNIT_PATTERN = "|".join(sorted(_NUMERIC_UNITS, key=len, reverse=True))
_NUMERIC_PATTERN = re.compile(
    rf"(?P<value>[0-9\uff10-\uff19]+(?:[,，][0-9\uff10-\uff19]{{3}})*(?:\.[0-9\uff10-\uff19]+)?|[一二三四五六七八九十百千万億〇零]+)"
    rf"(?P<unit>{_NUMERIC_UNIT_PATTERN})"
)
_ROLE_PATTERN = re.compile("|".join(re.escape(role) for role in _ROLE_TITLES))
_EXPERIENCE_PATTERNS = [
    re.compile(
        r"[\u4e00-\u9fffぁ-んァ-ヶー]{2,}"
        r"(?:大会|コンテスト|プロジェクト|留学|ボランティア|インターン|アルバイト|研究)"
    ),
    re.compile(r"(?:海外|国内|全国|地方)(?:大会|遠征|研修|留学)"),
]

HARD_BLOCK_HALLUCINATION_CODES = frozenset(
    {"number_mutation", "role_title_mutation", "metric_fabrication"}
)

_HALLUCINATION_PENALTIES: dict[str, float] = {
    "number_mutation": 3.0,
    "role_title_mutation": 3.5,
    "metric_fabrication": 2.5,
    "experience_fabrication": 2.0,
}
_HALLUCINATION_TIER2_THRESHOLD = 3.0


def _canonical_numeric_unit(unit: str) -> str:
    if unit == "名":
        return "人"
    if unit == "％":
        return "%"
    if unit in {"ヶ月", "カ月", "ヵ月"}:
        return "か月"
    return unit


def _normalize_fullwidth_digits(text: str) -> str:
    return text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def _normalize_number_token(value: str) -> float | None:
    if not value:
        return None
    cleaned = _normalize_fullwidth_digits(value).replace(",", "")
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", cleaned):
        return float(cleaned)
    return _kanji_to_number(cleaned)


def _kanji_to_number(text: str) -> float | None:
    if all(c in _KANJI_DIGITS for c in text) and len(text) >= 2:
        return float("".join(str(_KANJI_DIGITS[c]) for c in text))

    total = 0
    section = 0
    num = 0
    for char in text:
        if char in _KANJI_DIGITS:
            num = _KANJI_DIGITS[char]
            continue
        if char in _KANJI_SMALL_UNITS:
            if num == 0:
                num = 1
            section += num * _KANJI_SMALL_UNITS[char]
            num = 0
            continue
        if char in _KANJI_LARGE_UNITS:
            if num == 0 and section == 0:
                section = 1
            total += (section + num) * _KANJI_LARGE_UNITS[char]
            section = 0
            num = 0
            continue
        return None
    return float(total + section + num)


def _sentence_context(text: str, start: int, end: int) -> str:
    sentence_start = max(
        text.rfind("。", 0, start),
        text.rfind("！", 0, start),
        text.rfind("？", 0, start),
        text.rfind("\n", 0, start),
    )
    sentence_end_candidates = [
        pos
        for pos in (
            text.find("。", end),
            text.find("！", end),
            text.find("？", end),
            text.find("\n", end),
        )
        if pos != -1
    ]
    sentence_end = min(sentence_end_candidates) if sentence_end_candidates else len(text)
    return text[sentence_start + 1 : sentence_end].strip()


def _around(
    text: str,
    start: int,
    end: int,
    *,
    left: int = 5,
    right: int = 5,
) -> tuple[str, str]:
    prefix = re.sub(r"\s+", "", text[max(0, start - left) : start])
    suffix = re.sub(r"\s+", "", text[end : min(len(text), end + right)])
    return prefix, suffix


def _context_score(prefix_a: str, suffix_a: str, prefix_b: str, suffix_b: str) -> int:
    score = 0
    if prefix_a and prefix_a == prefix_b:
        score += 2
    elif prefix_a and prefix_b and (prefix_a.endswith(prefix_b) or prefix_b.endswith(prefix_a)):
        score += 1
    if suffix_a and suffix_a == suffix_b:
        score += 2
    elif suffix_a and suffix_b and (suffix_a.startswith(suffix_b) or suffix_b.startswith(suffix_a)):
        score += 1
    return score


def _numeric_surface(expr: dict[str, Any]) -> str:
    return f"{expr.get('value', '')}{expr.get('unit', '')}"


def _extract_numeric_expressions(text: str) -> list[dict[str, Any]]:
    expressions: list[dict[str, Any]] = []
    if not text:
        return expressions

    for match in _NUMERIC_PATTERN.finditer(text):
        value = match.group("value")
        unit = match.group("unit")
        normalized = _normalize_number_token(value)
        prefix, suffix = _around(text, match.start(), match.end())
        expressions.append(
            {
                "value": value,
                "unit": unit,
                "context": _sentence_context(text, match.start(), match.end()),
                "normalized": normalized,
                "canonical_unit": _canonical_numeric_unit(unit),
                "prefix": prefix,
                "suffix": suffix,
            }
        )
    return expressions


def _extract_role_titles(text: str) -> list[str]:
    return [match.group(0) for match in _ROLE_PATTERN.finditer(text or "")]


def _extract_role_mentions(text: str) -> list[dict[str, str]]:
    mentions: list[dict[str, str]] = []
    for match in _ROLE_PATTERN.finditer(text or ""):
        prefix, suffix = _around(text, match.start(), match.end(), left=8, right=8)
        mentions.append(
            {
                "role": match.group(0),
                "context": _sentence_context(text, match.start(), match.end()),
                "prefix": prefix,
                "suffix": suffix,
            }
        )
    return mentions


def _find_numeric_match(
    text_expr: dict[str, Any],
    user_exprs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_score = -1
    for user_expr in user_exprs:
        score = _context_score(
            str(text_expr.get("prefix") or ""),
            str(text_expr.get("suffix") or ""),
            str(user_expr.get("prefix") or ""),
            str(user_expr.get("suffix") or ""),
        )
        if score > best_score:
            best = user_expr
            best_score = score
    if best is not None and best_score >= 1:
        return best
    if len(user_exprs) == 1:
        return user_exprs[0]
    return None


def _is_metric_fabrication_candidate(expr: dict[str, Any]) -> bool:
    surface = _numeric_surface(expr)
    context = str(expr.get("context") or "")
    joined = surface + context
    if re.search(
        r"(第\s*[0-9一二三四五六七八九十]+に|[0-9一二三四五六七八九十]+つ目|[0-9一二三四五六七八九十]+点目)",
        joined,
    ):
        return False
    if any(token in context for token in ("一方", "1つ", "一つ", "ひとつ")):
        return False
    return True


def _extract_experience_terms(text: str) -> list[str]:
    if not text:
        return []
    terms: list[str] = []
    for pattern in _EXPERIENCE_PATTERNS:
        for match in pattern.finditer(text):
            term = match.group(0)
            if len(term) < 4:
                continue
            sentence = _sentence_context(text, match.start(), match.end())
            if re.search(r"(ではない|でない|じゃない|しない|なかった|なく)", sentence):
                continue
            if re.search(r"(あれば|なら|場合|としたら|れば)", sentence):
                continue
            if term not in terms:
                terms.append(term)
    return terms


def _detect_fact_hallucination_warnings(
    text: str,
    user_answer: str,
    *,
    template_type: str,
    char_max: int | None,
) -> list[dict[str, str]]:
    _ = (template_type, char_max)
    warnings: list[dict[str, str]] = []
    if not text or not user_answer:
        return warnings

    user_numeric = _extract_numeric_expressions(user_answer)
    text_numeric = _extract_numeric_expressions(text)

    for text_expr in text_numeric:
        candidates = [
            expr
            for expr in user_numeric
            if expr.get("canonical_unit") == text_expr.get("canonical_unit")
        ]
        user_match = _find_numeric_match(text_expr, candidates)
        if user_match is not None:
            if (
                text_expr.get("normalized") is not None
                and user_match.get("normalized") is not None
                and float(text_expr["normalized"]) != float(user_match["normalized"])
            ):
                warnings.append(
                    {
                        "code": "number_mutation",
                        "detail": f"「{_numeric_surface(user_match)}」が「{_numeric_surface(text_expr)}」に変更されています",
                    }
                )
            continue

        if _is_metric_fabrication_candidate(text_expr):
            warnings.append(
                {
                    "code": "metric_fabrication",
                    "detail": f"元回答にない「{_numeric_surface(text_expr)}」が追加されています",
                }
            )

    user_mentions = _extract_role_mentions(user_answer)
    text_mentions = _extract_role_mentions(text)
    user_roles = {item["role"] for item in user_mentions}
    text_roles = {item["role"] for item in text_mentions}
    if not text_roles.issubset(user_roles):
        for text_mention in text_mentions:
            if text_mention["role"] in user_roles:
                continue
            for user_mention in user_mentions:
                if user_mention["role"] in text_roles:
                    continue
                if _context_score(
                    text_mention["prefix"],
                    text_mention["suffix"],
                    user_mention["prefix"],
                    user_mention["suffix"],
                ) <= 0:
                    continue
                warnings.append(
                    {
                        "code": "role_title_mutation",
                        "detail": f"「{user_mention['role']}」が「{text_mention['role']}」に変更されています",
                    }
                )
                break

    user_experiences = set(_extract_experience_terms(user_answer))
    for term in _extract_experience_terms(text):
        if term in user_experiences:
            continue
        warnings.append(
            {
                "code": "experience_fabrication",
                "detail": f"元回答にない「{term}」が追加されています",
            }
        )

    deduped: list[dict[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for warning in warnings:
        pair = (warning["code"], warning["detail"])
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        deduped.append(warning)
    return deduped


def _compute_hallucination_score(
    warnings: list[dict[str, str]],
    *,
    template_type: str,
) -> dict[str, Any]:
    if not warnings:
        return {
            "score": 0.0,
            "tier": 0,
            "band": "standard",
            "threshold": _HALLUCINATION_TIER2_THRESHOLD,
        }

    metric_penalty = (
        1.5
        if template_type in {"company_motivation", "post_join_goals"}
        else _HALLUCINATION_PENALTIES["metric_fabrication"]
    )
    score = 0.0
    for warning in warnings:
        code = warning.get("code", "")
        if code == "metric_fabrication":
            score += metric_penalty
        else:
            score += _HALLUCINATION_PENALTIES.get(code, 0.0)

    if score >= _HALLUCINATION_TIER2_THRESHOLD:
        tier = 2
    elif score > 0:
        tier = 1
    else:
        tier = 0

    return {
        "score": score,
        "tier": tier,
        "band": (
            "relaxed_metric_fabrication"
            if template_type in {"company_motivation", "post_join_goals"}
            else "standard"
        ),
        "threshold": _HALLUCINATION_TIER2_THRESHOLD,
    }


__all__ = [
    "HARD_BLOCK_HALLUCINATION_CODES",
    "_HALLUCINATION_PENALTIES",
    "_HALLUCINATION_TIER2_THRESHOLD",
    "_compute_hallucination_score",
    "_detect_fact_hallucination_warnings",
    "_extract_numeric_expressions",
    "_extract_role_titles",
]
