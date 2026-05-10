"""AI-like phrase detection for ES review and draft generation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal, TypedDict

AiSmellCategory = Literal[
    "abstract_buzzword",
    "value_creation",
    "growth_cliche",
    "relation_abstract",
    "ceremonial_closing",
    "empty_emphasis",
]


@dataclass(frozen=True)
class AiSmellCategoryDef:
    category: AiSmellCategory
    patterns: tuple[re.Pattern[str], ...]
    requires_specificity_check: bool
    penalty: float
    prompt_label: str
    retry_hint: str


@dataclass(frozen=True)
class AiSmellWarning:
    category: AiSmellCategory
    phrase: str
    detail: str
    sentence: str

    def to_dict(self) -> dict[str, str]:
        return {"code": self.category, "detail": self.detail, "phrase": self.phrase}


class AiSmellScoreResult(TypedDict):
    score: float
    tier: int
    band: str
    threshold: float
    details: list[str]
    warnings: list[dict[str, str]]


def _compile_patterns(*patterns: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(pattern) for pattern in patterns)


_CATEGORIES: tuple[AiSmellCategoryDef, ...] = (
    AiSmellCategoryDef(
        category="abstract_buzzword",
        patterns=_compile_patterns(
            r"多角的(?:な|に)",
            r"包括的(?:な|に)",
            r"主体的(?:な|に)",
            r"能動的(?:な|に)",
            r"俯瞰的(?:な|に)",
            r"多様な(?:関係者|人々|価値観)",
            r"幅広い(?:視野|知見|経験)",
        ),
        requires_specificity_check=True,
        penalty=2.0,
        prompt_label="抽象修飾: 多角的、包括的、主体的、能動的、俯瞰的、多様な関係者、幅広い視野",
        retry_hint="「多角的」「包括的」等の抽象修飾語を、具体的な対象や方法に置き換える",
    ),
    AiSmellCategoryDef(
        category="value_creation",
        patterns=_compile_patterns(
            r"価値を創出",
            r"価値を形にする",
            r"新たな価値を(?:生み出す|創造する)",
            r"付加価値を提供",
        ),
        requires_specificity_check=True,
        penalty=2.5,
        prompt_label="価値創出系: 価値を創出、価値を形にする、新たな価値を生み出す、付加価値を提供",
        retry_hint="「価値を創出」等の定型句を、実際の行動・成果に置き換える",
    ),
    AiSmellCategoryDef(
        category="growth_cliche",
        patterns=_compile_patterns(
            r"を通じて成長した",
            r"の重要性を学んだ",
            r"の大切さを(?:実感した|痛感した)",
            r"に対する理解を深めた",
            r"を深く考えるきっかけとなった",
        ),
        requires_specificity_check=True,
        penalty=1.5,
        prompt_label="成長定型: 〜を通じて成長した、〜の重要性を学んだ、〜の大切さを実感した",
        retry_hint="「〜を通じて成長した」等の定型句を、何がどう変わったかの具体に置き換える",
    ),
    AiSmellCategoryDef(
        category="relation_abstract",
        patterns=_compile_patterns(
            r"関係者(?:を巻き込み|と連携し)",
            r"多様な人々",
            r"ステークホルダー",
            r"周囲を巻き込みながら",
        ),
        requires_specificity_check=True,
        penalty=2.0,
        prompt_label="関係性抽象: 関係者を巻き込み、多様な人々、ステークホルダー、周囲を巻き込みながら",
        retry_hint="「関係者を巻き込み」等を、誰とどう連携したかの具体に置き換える",
    ),
    AiSmellCategoryDef(
        category="ceremonial_closing",
        patterns=_compile_patterns(
            r"に貢献したい",
            r"に挑戦したい",
            r"を実現したい",
            r"に寄与したい",
        ),
        requires_specificity_check=True,
        penalty=1.5,
        prompt_label="儀式的結語: 〜に貢献したい、〜に挑戦したい、〜を実現したい（具体的対象なし）",
        retry_hint="最終文の「〜に貢献したい」を、何にどう貢献するかの具体で締める",
    ),
    AiSmellCategoryDef(
        category="empty_emphasis",
        patterns=_compile_patterns(
            r"まさに",
            r"確かに",
            r"大いに",
            r"と言えるでしょう",
            r"ではないでしょうか",
        ),
        requires_specificity_check=False,
        penalty=1.0,
        prompt_label="空虚強調: まさに、確かに、大いに、〜と言えるでしょう、〜ではないでしょうか",
        retry_hint="「まさに」「確かに」等の空虚な強調語を削除する",
    ),
)

_CATEGORY_BY_CODE = {category.category: category for category in _CATEGORIES}

_AI_SMELL_TIER2_THRESHOLDS: dict[str, dict[str, float]] = {
    "gakuchika": {"short": 3.0, "mid_long": 3.5},
    "self_pr": {"short": 3.0, "mid_long": 3.5},
    "work_values": {"short": 3.0, "mid_long": 3.5},
    "_default": {"short": 3.5, "mid_long": 4.0},
}


def _char_max_to_band(char_max: int | None) -> str:
    if not char_max or char_max <= 220:
        return "short"
    return "mid_long"


def _sentence_has_specificity(sentence: str) -> bool:
    """Return whether the same sentence has a concrete marker."""
    if re.search(r"\d+[人名件%％倍回日月年時間]", sentence):
        return True
    if re.search(r"[ァ-ヶー]{3,}", sentence):
        return True
    if re.search(r"[一-龥]{2,8}(?:部|課|室|局|本部|事業部|センター|部門)", sentence):
        return True
    if re.search(r"(?:開発|設計|実装|提案|分析|調査|交渉|企画|運営|指導|管理)", sentence):
        return True
    return False


def _split_sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"[。！？]", text) if sentence.strip()]


def detect_ai_smell_patterns(
    text: str,
    user_answer: str,
    *,
    template_type: str = "basic",
    char_max: int | None = None,
    llm_validation_result: dict[str, Any] | None = None,
) -> list[AiSmellWarning]:
    """Detect AI-like phrases that were not already present in the user's answer."""
    _ = (template_type, char_max, llm_validation_result)
    warnings: list[AiSmellWarning] = []
    if not text:
        return warnings

    original = user_answer or ""
    for sentence in _split_sentences(text):
        for category in _CATEGORIES:
            for pattern in category.patterns:
                for match in pattern.finditer(sentence):
                    phrase = match.group(0)
                    if phrase in original:
                        continue
                    if category.requires_specificity_check:
                        specificity_sentence = (
                            sentence[: match.start()] + sentence[match.end() :]
                        )
                        if _sentence_has_specificity(specificity_sentence):
                            continue
                    warnings.append(
                        AiSmellWarning(
                            category=category.category,
                            phrase=phrase,
                            detail=f"{category.prompt_label} に該当: {phrase}",
                            sentence=sentence,
                        )
                    )

    return warnings


def compute_ai_smell_score(
    warnings: list[AiSmellWarning],
    *,
    template_type: str = "basic",
    char_max: int | None = None,
) -> AiSmellScoreResult:
    """Compute an aggregate score and tier from AI smell warnings."""
    band = _char_max_to_band(char_max)
    thresholds = _AI_SMELL_TIER2_THRESHOLDS.get(
        template_type,
        _AI_SMELL_TIER2_THRESHOLDS["_default"],
    )
    tier2_threshold = thresholds.get(band, 4.0)
    score = 0.0
    details: list[str] = []

    for warning in warnings:
        category = _CATEGORY_BY_CODE.get(warning.category)
        if category is None:
            continue
        score += category.penalty
        details.append(f"{warning.category}={category.penalty}")

    tier = 2 if score >= tier2_threshold else 1 if score > 0 else 0
    return {
        "score": score,
        "tier": tier,
        "band": band,
        "threshold": tier2_threshold,
        "details": details,
        "warnings": [warning.to_dict() for warning in warnings],
    }


def build_ai_smell_retry_hints(warnings: list[AiSmellWarning]) -> list[str]:
    """Build retry hints from the first three AI smell warnings."""
    hints: list[str] = []
    for warning in warnings[:3]:
        category_code = (
            warning.category
            if isinstance(warning, AiSmellWarning)
            else str(warning.get("code", ""))
        )
        category = _CATEGORY_BY_CODE.get(category_code)
        if category is None:
            continue
        hints.append(category.retry_hint)
    return list(dict.fromkeys(hints))


def format_anti_ai_phrase_lines() -> list[str]:
    """Return prompt-ready labels for anti-AI phrase guidance."""
    return [f"- {category.prompt_label}" for category in _CATEGORIES]


__all__ = [
    "AiSmellCategory",
    "AiSmellCategoryDef",
    "AiSmellScoreResult",
    "AiSmellWarning",
    "build_ai_smell_retry_hints",
    "compute_ai_smell_score",
    "detect_ai_smell_patterns",
    "format_anti_ai_phrase_lines",
]
