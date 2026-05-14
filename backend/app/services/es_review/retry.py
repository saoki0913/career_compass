"""Retry helpers for ES review.

Self-contained retry / focus-mode helpers live here directly. Functions that
depend on other `es_review.py` internals (TEMPLATE_DEFS, prompts, etc.) are
lazy re-exports so call sites keep working.
"""

from __future__ import annotations

import re

from dataclasses import dataclass, field
from typing import Any

from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    LengthTargetPlan,
    format_generation_target,
    get_template_retry_guidance,
    resolve_length_target_plan,
)
from app.prompts.es_templates._length_control import compute_shortfall_delta_band
from app.services.es_review.grounding import (
    COMPANY_DIRECTION_EVIDENCE_THEMES,
    ROLE_PROGRAM_EVIDENCE_THEMES,
    _extract_question_focus_signals,
    _is_generic_role_label,
)
from app.services.es_review.enums import ValidationFailureCode
from app.services.es_review.models import TemplateRequest
from app.services.es_review.validation import (
    SHORT_ANSWER_CHAR_MAX,
    _normalize_repaired_text,
)
from app.utils.llm_model_routing import resolve_feature_model_metadata


PROMPT_USER_FACT_LIMIT = 8


REWRITE_MAX_ATTEMPTS = 3
# OpenAI Responses の推論トークンが max_output に含まれるため、
# 可視出力の前に枯渇しないよう下限を設ける。
_OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR = 4096
_LENGTH_CODES = frozenset({
    ValidationFailureCode.UNDER_MIN,
    ValidationFailureCode.OVER_MAX,
})
_CRITICAL_CODES = frozenset({
    ValidationFailureCode.HALLUCINATION,
    ValidationFailureCode.NEGATIVE_SELF_EVAL,
    ValidationFailureCode.EMPTY,
    ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS,
})
_STRUCTURE_CODES = frozenset({
    ValidationFailureCode.FRAGMENT,
    ValidationFailureCode.BULLETISH_OR_LISTLIKE,
    ValidationFailureCode.ANSWER_FOCUS,
    ValidationFailureCode.VERBOSE_OPENING,
    ValidationFailureCode.STRUCTURE,
})
_STYLE_STRUCTURE_CODES = frozenset({
    ValidationFailureCode.STYLE,
    ValidationFailureCode.FRAGMENT,
    ValidationFailureCode.BULLETISH_OR_LISTLIKE,
})


@dataclass(frozen=True)
class RetryPlan:
    primary_code: str
    selected_codes: tuple[str, ...]
    focus_modes: tuple[str, ...]
    focus_mode: str
    length_control_mode: str
    target_plan: LengthTargetPlan
    guidance_items: tuple[str, ...] = field(default_factory=tuple)
    shortfall_delta_band: str | None = None


def build_rewrite_retry_plan(
    *,
    retry_code: str,
    failure_codes: list[str] | None,
    focus_modes: list[str],
    focus_mode: str,
    use_tight_length_control: bool,
    char_min: int | None,
    char_max: int | None,
    original_len: int,
    latest_failed_length: int,
    llm_model: str | None,
    template_type: str,
) -> RetryPlan:
    """Build one typed retry plan shared by prompts, validation trace, and meta."""
    selected_codes = _select_retry_codes(
        retry_code=retry_code,
        failure_codes=failure_codes,
    )
    length_control_mode = _resolve_rewrite_length_control_mode(
        use_tight_length_control=use_tight_length_control,
        focus_mode=focus_mode,
    )
    shortfall_delta_band = compute_shortfall_delta_band(
        char_min=char_min,
        current_length=latest_failed_length or None,
    )
    target_plan = resolve_length_target_plan(
        char_min,
        char_max,
        stage=_length_profile_stage_from_mode(length_control_mode),
        original_len=original_len,
        llm_model=llm_model,
        latest_failed_len=latest_failed_length,
    )
    guidance_items = _retry_hints_from_codes(
        retry_code=retry_code,
        failure_codes=failure_codes,
        char_min=char_min,
        char_max=char_max,
        current_length=latest_failed_length or None,
        length_control_mode=length_control_mode,
        template_type=template_type,
    )
    return RetryPlan(
        primary_code=_primary_retry_code(
            retry_code=retry_code,
            failure_codes=failure_codes,
        ),
        selected_codes=tuple(selected_codes),
        focus_modes=tuple(focus_modes or ()),
        focus_mode=focus_mode,
        length_control_mode=length_control_mode,
        target_plan=target_plan,
        guidance_items=tuple(guidance_items),
        shortfall_delta_band=shortfall_delta_band,
    )


def _select_composite_retry_mode(
    *,
    failure_codes: list[str] | None = None,
    already_used: bool = False,
) -> str | None:
    """Return one composite repair mode for multi-factor failures.

    Priority follows the product decision: hard fact/safety failures first,
    then repeated length-centered failures, with at most one composite pass.
    """
    if already_used:
        return None
    codes = _dedupe_preserve_order(list(failure_codes or []))
    code_set = set(codes)
    if len(code_set) < 2:
        return None

    has_length = bool(code_set & _LENGTH_CODES)
    has_under_min = ValidationFailureCode.UNDER_MIN in code_set
    if ValidationFailureCode.HALLUCINATION in code_set:
        if has_length:
            return "fact_safety_length"
        if code_set & _STRUCTURE_CODES:
            return "fact_safety_structure"
    if ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS in code_set and has_length:
        return "company_reference_length"
    if has_length and ValidationFailureCode.GROUNDING in code_set:
        return "length_grounding"
    if has_length and code_set & {
        ValidationFailureCode.ANSWER_FOCUS,
        ValidationFailureCode.VERBOSE_OPENING,
    }:
        return "length_answer_focus"
    if has_under_min and ValidationFailureCode.QUANTIFY in code_set:
        return "length_quantify"
    if has_length and code_set & _STYLE_STRUCTURE_CODES:
        return "length_style_structure"
    return None


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        value = item.value if isinstance(item, ValidationFailureCode) else str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _select_retry_codes(
    *, retry_code: str, failure_codes: list[str] | None = None
) -> list[str]:
    raw_codes = _dedupe_preserve_order(
        ([retry_code] if retry_code else []) + list(failure_codes or [])
    )
    if not raw_codes:
        return [ValidationFailureCode.GENERIC.value]

    length_codes = [code for code in raw_codes if code in _LENGTH_CODES]
    critical_codes = [code for code in raw_codes if code in _CRITICAL_CODES]
    other_codes = [
        code for code in raw_codes if code not in _LENGTH_CODES and code not in _CRITICAL_CODES
    ]

    selected: list[str] = []
    if ValidationFailureCode.HALLUCINATION in raw_codes:
        selected.append(ValidationFailureCode.HALLUCINATION.value)
    if length_codes and len(selected) < 2:
        selected.append(length_codes[0])
    selected.extend(critical_codes[: max(0, 2 - len(selected))])
    selected.extend(other_codes[: max(0, 2 - len(selected))])
    if not selected:
        selected.append(raw_codes[0])
    return _dedupe_preserve_order(selected)


def _primary_retry_code(
    *, retry_code: str, failure_codes: list[str] | None = None
) -> str:
    selected_codes = _select_retry_codes(
        retry_code=retry_code, failure_codes=failure_codes
    )
    return selected_codes[0] if selected_codes else (retry_code or ValidationFailureCode.GENERIC.value)


def _resolve_rewrite_focus_mode(*, retry_code: str) -> str:
    mapping = {
        ValidationFailureCode.UNDER_MIN: "length_focus_min",
        ValidationFailureCode.OVER_MAX: "length_focus_max",
        ValidationFailureCode.STYLE: "style_focus",
        ValidationFailureCode.GROUNDING: "grounding_focus",
        ValidationFailureCode.ANSWER_FOCUS: "answer_focus",
        ValidationFailureCode.VERBOSE_OPENING: "opening_focus",
        ValidationFailureCode.QUANTIFY: "quantify_focus",
        ValidationFailureCode.STRUCTURE: "structure_focus",
        ValidationFailureCode.BULLETISH_OR_LISTLIKE: "structure_focus",
        ValidationFailureCode.EMPTY: "structure_focus",
        ValidationFailureCode.FRAGMENT: "structure_focus",
        ValidationFailureCode.NEGATIVE_SELF_EVAL: "positive_reframe_focus",
        ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS: "structure_focus",
        ValidationFailureCode.HALLUCINATION: "fact_preservation_focus",
        ValidationFailureCode.LLM_QUALITY: "structure_focus",
        ValidationFailureCode.FACT_PRESERVATION: "fact_preservation_focus",
        ValidationFailureCode.GENERIC: "structure_focus",
    }
    return mapping.get(retry_code or ValidationFailureCode.GENERIC, "structure_focus")


def _resolve_rewrite_focus_modes(
    *, retry_code: str, failure_codes: list[str] | None = None
) -> list[str]:
    selected_codes = _select_retry_codes(
        retry_code=retry_code, failure_codes=failure_codes
    )
    modes = [_resolve_rewrite_focus_mode(retry_code=code) for code in selected_codes]
    return _dedupe_preserve_order(
        modes or [_resolve_rewrite_focus_mode(retry_code=retry_code)]
    )


def _serialize_focus_modes(focus_modes: list[str] | None) -> str:
    unique_modes = _dedupe_preserve_order(list(focus_modes or []))
    if not unique_modes:
        return "normal"
    if unique_modes == ["normal"]:
        return "normal"
    return "+".join(unique_modes)


_DEGRADED_BLOCK_CODES = frozenset({
    ValidationFailureCode.EMPTY,
    ValidationFailureCode.FRAGMENT,
    ValidationFailureCode.NEGATIVE_SELF_EVAL,
    ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS,
    ValidationFailureCode.HALLUCINATION,
    ValidationFailureCode.FACT_PRESERVATION,
})


def _best_effort_rewrite_admissible(
    normalized_text: str,
    *,
    template_type: str,
    company_name: str | None,
    char_max: int | None,
    primary_failure_code: str,
    failure_codes: list[str] | None = None,
    degraded_block_codes: frozenset[str] | None = None,
) -> bool:
    """Return True if we may return best rejected rewrite instead of 422.

    Block empty output, fragment-only text, and companyless honorific violations.
    """
    _ = (template_type, company_name, char_max)
    block_codes = (
        degraded_block_codes
        if degraded_block_codes is not None
        else _DEGRADED_BLOCK_CODES
    )
    if not (normalized_text or "").strip():
        return False
    if primary_failure_code in block_codes:
        return False
    if failure_codes and block_codes.intersection(failure_codes):
        return False
    return True


def _build_hallucination_retry_hints(warnings: list[dict[str, str]]) -> list[str]:
    hints: list[str] = []
    for w in warnings[:2]:
        code = w.get("code", "")
        if code == "number_mutation":
            hints.append(f"数値の改変を修正: {w.get('detail', '')}")
        elif code == "role_title_mutation":
            hints.append(f"役職名の改変を修正: {w.get('detail', '')}")
        elif code == "metric_fabrication":
            hints.append(f"元回答にない数値を削除する: {w.get('detail', '')}")
        elif code == "experience_fabrication":
            hints.append("元回答にない経験・活動を削除する")
    return hints


def _rewrite_validation_degraded_hint(codes: list[str]) -> str:
    """degraded 採用時に、未解決の主要コードに応じた修正点を明示する。"""
    intro = (
        "厳密な品質チェックをすべて満たせませんでしたが、最も近い改善案を表示しています。"
    )
    action_by_code: dict[str, str] = {
        ValidationFailureCode.STYLE: (
            "提出前に、です・ます調を使わずだ・である調にそろえてください。"
        ),
        ValidationFailureCode.UNDER_MIN: (
            "提出前に、指定の最小字数を満たすよう、本文を足すか構成を調整してください。"
        ),
        ValidationFailureCode.OVER_MAX: (
            "提出前に、指定の最大字数を超えないよう、重複や冗長な表現を削ってください。"
        ),
        ValidationFailureCode.ANSWER_FOCUS: (
            "提出前に、冒頭の1〜2文で設問の答えの核がすぐ伝わるよう書き直してください。"
        ),
        ValidationFailureCode.VERBOSE_OPENING: (
            "提出前に、設問文の言い換えで始めず、結論から書き始めてください。"
        ),
        ValidationFailureCode.BULLETISH_OR_LISTLIKE: (
            "提出前に、箇条書きや番号列挙をやめ、つながった一段の本文にしてください。"
        ),
        ValidationFailureCode.GROUNDING: (
            "提出前に、企業や役割との接点が本文から伝わるよう、1文で結び直してください。"
        ),
        ValidationFailureCode.NEGATIVE_SELF_EVAL: (
            "提出前に、「経験不足」「自信がない」などの自己否定語を残さず、"
            "準備・責任感・学習姿勢などの前向きな表現へ言い換えてください。"
        ),
        ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS: (
            "提出前に、「貴社」「貴行」等の企業敬称を削除し、自分の経験を主軸にまとめてください。"
        ),
        ValidationFailureCode.HALLUCINATION: (
            "提出前に、元回答や確認済みユーザー事実にない数値・役職・経験・成果が混ざっていないか確認してください。"
        ),
        ValidationFailureCode.GENERIC: (
            "提出前に、文体（だ・である調）・指定字数・冒頭の結論の置き方を確認し、"
            "不足している点を直してください。"
        ),
    }
    if not codes:
        return intro + action_by_code[ValidationFailureCode.GENERIC]
    actions = [
        action_by_code.get(code, action_by_code[ValidationFailureCode.GENERIC])
        for code in _select_retry_codes(retry_code=codes[0], failure_codes=codes)
    ]
    return intro + " ".join(_dedupe_preserve_order(actions))


def _rewrite_validation_soft_hint(codes: list[str]) -> str:
    if not codes:
        return "一部条件を緩和して表示しています。提出前に文体と企業接続を確認してください。"

    if set(codes) == {ValidationFailureCode.UNDER_MIN}:
        return "一部条件を緩和して表示しています。提出前に、指定字数に届いているか確認してください。"
    if set(codes) == {ValidationFailureCode.STYLE}:
        return "一部条件を緩和して表示しています。提出前に、だ・である調へ統一してください。"
    if set(codes) == {ValidationFailureCode.GROUNDING}:
        return "一部条件を緩和して表示しています。提出前に、企業や役割との接点を1文で補ってください。"
    return "一部条件を緩和して表示しています。提出前に文体・文字数・企業接続を確認してください。"


def _describe_retry_reason(reason: str) -> str:
    if not reason:
        return "不明な理由で再試行します。"
    if "タイムアウト" in reason:
        return f"{reason} より短い構成で再試行します。"
    if reason.startswith("改善案が空でした"):
        return "改善案が空だったため、再試行します。"
    if reason.startswith("文字数制約を満たしていません"):
        return f"{reason} 再試行します。"
    if "です・ます調" in reason:
        return "文体が「だ・である調」に揃っていなかったため、再試行します。"
    if "参考ES" in reason:
        return "参考ESとの表現類似が高かったため、別表現で再試行します。"
    if "職種・コース" in reason:
        return "なぜその職種・コースかが弱かったため、役割の理由を先頭で明示して再試行します。"
    if "設問の冒頭表現を繰り返さず" in reason:
        return "設問の言い換えから始まっていたため、結論だけを先頭で短く言い切って再試行します。"
    if "1文目で" in reason and "短く言い切って" in reason:
        return f"{reason} 先頭文だけで答えが伝わる構成にして再試行します。"
    if "断片的" in reason:
        return "断片的な本文になったため、1本の文章として再試行します。"
    if "自己否定" in reason:
        return "自己否定語が残っていたため、事実を保ったまま前向きな表現へ言い換えて再試行します。"
    return f"{reason} 再試行します。"


def _resolve_rewrite_length_control_mode(
    *,
    use_tight_length_control: bool,
    focus_mode: str,
) -> str:
    if not use_tight_length_control:
        return "default"
    if focus_mode == "length_focus_min":
        return "under_min_recovery"
    if focus_mode == "length_focus_max":
        return "tight_length"
    return "tight_length"


def _length_profile_stage_from_mode(length_control_mode: str) -> str:
    if length_control_mode == "under_min_recovery":
        return "under_min_recovery"
    if length_control_mode == "tight_length":
        return "tight_length"
    return "default"


def _length_shortfall_bucket(
    *,
    char_min: int | None,
    latest_failed_length: int,
    length_failure_code: str | None,
) -> str | None:
    if length_failure_code != ValidationFailureCode.UNDER_MIN or not char_min or latest_failed_length <= 0:
        return None
    shortfall = max(0, char_min - latest_failed_length)
    if shortfall <= 0:
        return None
    if shortfall <= 5:
        return "1-5"
    if shortfall <= 20:
        return "6-20"
    return "21+"


def _es_review_temperature(
    llm_model: str | None,
    *,
    stage: str,
    focus_mode: str = "normal",
    shortfall_delta_band: str | None = None,
    use_tight_length_control: bool = False,
    length_control_mode: str = "default",
    simplified_mode: bool = False,
) -> float:
    _ = (use_tight_length_control, length_control_mode, simplified_mode)
    provider, model_name = resolve_feature_model_metadata("es_review", llm_model)
    if provider == "google":
        return 1.0
    if stage == "improvement":
        return 0.15
    if focus_mode == "length_focus_min" and shortfall_delta_band:
        temp_map = {"large": 0.15, "medium": 0.13, "small": 0.11, "tiny": 0.11}
        return temp_map.get(shortfall_delta_band, 0.13)
    if focus_mode in {"length_focus_min", "length_focus_max"}:
        return 0.13
    if focus_mode != "normal":
        return 0.14
    mid = (model_name or "").strip().lower()
    if provider == "openai" and "mini" in mid:
        return 0.12
    return 0.2


def _openai_es_review_output_cap(base: int, llm_model: str | None) -> int:
    """Raise output token ceiling for OpenAI reasoning models (Responses API)."""
    provider, model_name = resolve_feature_model_metadata("es_review", llm_model)
    if provider != "openai":
        return base
    mid = model_name.strip().lower()
    if not (mid.startswith("gpt-5") or mid.startswith("o")):
        return base
    return max(base, _OPENAI_ES_REVIEW_OUTPUT_TOKEN_FLOOR)


def _rewrite_max_tokens(
    char_max: int | None,
    *,
    focus_mode: str = "normal",
    timeout_compact_mode: bool = False,
    review_variant: str = "standard",
    llm_model: str | None = None,
) -> int:
    _ = (timeout_compact_mode, review_variant)
    if focus_mode == "length_focus_min":
        base = min(720, max(280, int((char_max or 500) * 1.3)))
    else:
        base = min(720, max(260, int((char_max or 500) * 1.4)))
        mid = (llm_model or "").strip().lower()
        if "gpt-5" in mid and "mini" in mid and (char_max or 0) >= 170:
            base = min(720, int(base * 1.12))
    base = _openai_es_review_output_cap(base, llm_model)
    provider, _ = resolve_feature_model_metadata("es_review", llm_model)
    if provider == "google" and (char_max or 0) >= 300:
        # 長文で出力が短く切れるケース向けに余裕を持たせる（呼び出し回数は増やさない）
        base = max(base, min(2048, int((char_max or 400) * 1.65)))
    return base


def _total_rewrite_attempts(review_variant: str) -> int:
    _ = review_variant
    return REWRITE_MAX_ATTEMPTS


def _normalize_timeout_fallback_clause(
    text: str,
    *,
    limit: int,
) -> str:
    cleaned = _normalize_repaired_text(text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("。")
    if not cleaned:
        return ""
    cleaned = cleaned.split("。", 1)[0].strip()
    replacements = [
        (r"したい(?:です|と思います|と考えています)$", "したい"),
        (r"なりたい(?:です|と思います|と考えています)$", "なりたい"),
        (r"学びたい(?:です|と思います|と考えています)$", "学びたい"),
        (r"携わりたい(?:です|と思います|と考えています)$", "携わりたい"),
        (r"貢献したい(?:です|と思います|と考えています)$", "貢献したい"),
        (r"考えています$", "考える"),
        (r"思います$", "考える"),
        (r"です$", ""),
        (r"ます$", ""),
    ]
    for pattern, replacement in replacements:
        cleaned = re.sub(pattern, replacement, cleaned)
    if len(cleaned) <= limit:
        return cleaned
    truncated = cleaned[:limit]
    for delimiter in ("。", "、", "，", ",", " "):
        index = truncated.rfind(delimiter)
        if index >= int(limit * 0.55):
            truncated = truncated[:index]
            break
    return truncated.strip("。、，, ")


def _retry_hint_from_code(
    code: str,
    *,
    char_min: int | None,
    char_max: int | None,
    current_length: int | None = None,
    length_control_mode: str = "default",
    template_type: str | None = None,
) -> str:
    target_stage = (
        "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    )
    target_hint = format_generation_target(
        resolve_length_target_plan(
            char_min,
            char_max,
            stage=target_stage,
            latest_failed_len=current_length or 0,
        )
    )
    shortfall = max(0, (char_min or 0) - (current_length or 0)) if char_min and current_length else 0
    template_def = TEMPLATE_DEFS.get(template_type or "basic", TEMPLATE_DEFS["basic"])
    template_usage = str(template_def.get("company_usage") or "assistive")
    template_guidance = get_template_retry_guidance(template_type or "basic")
    spec_hint = str(template_guidance.get(code) or "").strip()
    formatted_spec_hint = (
        spec_hint.format(
            target_hint=target_hint,
            char_min=char_min or 0,
            char_max=char_max or 0,
            current_length=current_length or 0,
            shortfall=shortfall,
        )
        if spec_hint
        else ""
    )
    if code != ValidationFailureCode.UNDER_MIN and formatted_spec_hint:
        return formatted_spec_hint
    if code == ValidationFailureCode.UNDER_MIN:
        if length_control_mode == "under_min_recovery":
            if shortfall >= 30:
                base_hint = (
                    f"新事実を足さず、経験→職種→企業接点をつなぐ1文を補い、"
                    f"{target_hint} を狙う"
                )
            else:
                base_hint = f"最後に役割や企業との接点を補う1文を足し、{target_hint} を狙う"
            if formatted_spec_hint and template_usage == "required":
                return f"{base_hint}。{formatted_spec_hint}"
            if formatted_spec_hint:
                return formatted_spec_hint
            return base_hint
        if length_control_mode == "tight_length":
            base_hint = f"短くまとめすぎず、根拠経験と企業接点を残して {target_hint} を狙う"
            if formatted_spec_hint and template_usage == "required":
                return f"{base_hint}。{formatted_spec_hint}"
            if formatted_spec_hint:
                return formatted_spec_hint
            return base_hint
        if char_min and current_length:
            delta_band = compute_shortfall_delta_band(
                char_min=char_min,
                current_length=current_length,
            )
            band_hints = {
                "large": "2~3文の追加が必要。既存事実の経験→役割→企業接点を順に展開する",
                "medium": "1文追加で足りる。行動・学び・企業接点いずれかを1文で補う",
                "small": "修飾句（対象・手段・結果の具体化）を1〜2箇所に加えて到達する",
                "tiny": "既存文の1箇所に修飾語（数値・対象名・方法）を加えるだけで到達する",
            }
            band_hint = band_hints.get(delta_band or "medium", band_hints["medium"])
            base_hint = (
                f"前回出力は{current_length}字、目標の{char_min}字まで{shortfall}字不足。"
                f"{band_hint}"
            )
            if formatted_spec_hint and template_usage == "required":
                return f"{base_hint}。{formatted_spec_hint}"
            if formatted_spec_hint:
                return f"{base_hint}。{formatted_spec_hint}"
            return base_hint
        if formatted_spec_hint:
            return formatted_spec_hint
    mapping = {
        ValidationFailureCode.EMPTY: "改善案本文を必ず1件だけ返す",
        ValidationFailureCode.UNDER_MIN: f"内容を薄めず {target_hint} を狙う",
        ValidationFailureCode.OVER_MAX: f"冗長語を削り {target_hint} に収める",
        ValidationFailureCode.STYLE: "です・ます調を使わず、だ・である調に統一する",
        ValidationFailureCode.ANSWER_FOCUS: (
            "1文目で設問への答えを短く言い切る（インターンなら参加・学びの核、"
            "コース志望なら志望・関心の語を含める）"
        ),
        ValidationFailureCode.VERBOSE_OPENING: "設問の言い換えから始めず、1文目は結論だけを短く置く",
        ValidationFailureCode.FRAGMENT: "本文を断片で終わらせず、最後まで言い切る",
        ValidationFailureCode.BULLETISH_OR_LISTLIKE: "箇条書きや列挙ではなく、1本の本文にする",
        ValidationFailureCode.NEGATIVE_SELF_EVAL: (
            "「経験不足」「自信がない」などの自己否定語を残さず、"
            "準備・責任感・学習姿勢として言い換える"
        ),
        ValidationFailureCode.COMPANY_REFERENCE_IN_COMPANYLESS: "「貴社」等の企業敬称を使わず、自分の経験で書く",
        ValidationFailureCode.LLM_QUALITY: "品質検証の指摘を反映し、冒頭・構成・企業接地・文体を整える",
        ValidationFailureCode.FACT_PRESERVATION: "元回答の数値・役割・具体的経験を変更せず、そのまま保持する",
        ValidationFailureCode.HALLUCINATION: "元回答の数値・役割・具体的経験を変更せず、そのまま保持する",
        ValidationFailureCode.GENERIC: "条件を満たす安全な改善案を返す",
    }
    return mapping.get(code, mapping[ValidationFailureCode.GENERIC])


def _retry_hints_from_codes(
    *,
    retry_code: str,
    failure_codes: list[str] | None,
    char_min: int | None,
    char_max: int | None,
    current_length: int | None = None,
    length_control_mode: str = "default",
    template_type: str | None = None,
) -> list[str]:
    return [
        _retry_hint_from_code(
            code,
            char_min=char_min,
            char_max=char_max,
            current_length=current_length,
            length_control_mode=length_control_mode,
            template_type=template_type,
        )
        for code in _select_retry_codes(
            retry_code=retry_code,
            failure_codes=failure_codes,
        )
    ]


def _is_short_answer_mode(char_max: int | None) -> bool:
    return bool(char_max and char_max <= SHORT_ANSWER_CHAR_MAX)


def _select_rewrite_prompt_context(
    *,
    template_type: str,
    char_max: int | None,
    attempt: int,
    simplified_mode: bool,
    length_control_mode: str = "default",
    timeout_compact_mode: bool = False,
    review_variant: str = "standard",
    prompt_user_facts: list[dict[str, str]],
    company_evidence_cards: list[dict[str, str]],
    improvement_payload: list[dict[str, Any]],
    reference_quality_block: str,
    evidence_coverage_level: str,
    effective_company_grounding: str = "assistive",
) -> dict[str, Any]:
    _ = review_variant
    company_grounding = effective_company_grounding
    short_answer_mode = _is_short_answer_mode(char_max)
    compact_mode = timeout_compact_mode or simplified_mode or attempt >= 2
    preserve_context_for_recovery = length_control_mode == "under_min_recovery"
    preserve_required_context = company_grounding == "required" and not short_answer_mode

    if preserve_context_for_recovery:
        fact_limit = PROMPT_USER_FACT_LIMIT
    elif short_answer_mode:
        fact_limit = 5
    elif simplified_mode:
        fact_limit = 5
    elif compact_mode:
        fact_limit = 6
    else:
        fact_limit = PROMPT_USER_FACT_LIMIT
    if compact_mode:
        fact_limit = max(4, fact_limit)

    issue_limit = 3 if preserve_context_for_recovery else (2 if compact_mode else 3)
    if preserve_context_for_recovery:
        card_limit = min(4, len(company_evidence_cards))
    elif company_grounding == "assistive":
        if evidence_coverage_level == "none":
            card_limit = 0
        elif evidence_coverage_level == "weak":
            card_limit = 0 if compact_mode else 1
        else:
            card_limit = min(2, len(company_evidence_cards))
    elif simplified_mode or short_answer_mode:
        card_limit = 1
    elif evidence_coverage_level in {"weak", "partial"}:
        card_limit = 2
    elif company_grounding == "required" and not compact_mode:
        card_limit = 4
    elif preserve_required_context and compact_mode:
        card_limit = min(2, len(company_evidence_cards))
    elif compact_mode:
        card_limit = 2
    else:
        card_limit = 3

    include_reference_quality = (
        bool(reference_quality_block)
        and not short_answer_mode
        and (char_max is None or char_max >= 260)
        and (
            attempt == 0
            or preserve_context_for_recovery
            or (simplified_mode and preserve_required_context)
        )
    )
    return {
        "prompt_user_facts": prompt_user_facts[:fact_limit],
        "company_evidence_cards": company_evidence_cards[:card_limit],
        "improvement_payload": improvement_payload[:issue_limit],
        "reference_quality_block": reference_quality_block if include_reference_quality else "",
    }


def _build_role_focused_second_pass_query(
    template_request: TemplateRequest,
    primary_role: str | None,
) -> str:
    generic_role_mode = _is_generic_role_label(primary_role or template_request.role_name)
    focus_signals = _extract_question_focus_signals(
        template_type=template_request.template_type,
        question=template_request.question,
        answer=template_request.answer,
    )
    query_parts: list[str] = [template_request.company_name or ""]

    focus_terms = focus_signals["query_terms"][:6]

    if template_request.template_type in {"intern_reason", "intern_goals"}:
        query_parts.extend(
            [
                template_request.intern_name or "",
                primary_role or "",
                "インターン",
                "プログラム",
                "実務",
                "社員",
            ]
        )
        query_parts.extend(focus_terms)
    elif generic_role_mode:
        query_parts.extend(focus_signals["query_terms"][:8])
        query_parts.extend(["社員", "若手", "事業"])
    elif template_request.template_type == "role_course_reason":
        query_parts.extend([primary_role or "", "職種", "業務", "仕事内容", "社員"])
        query_parts.extend(focus_terms[:4])
    elif template_request.template_type in {"company_motivation", "post_join_goals", "self_pr"}:
        query_parts.extend([primary_role or "", "事業", "価値観", "社員", "若手"])
        query_parts.extend(focus_terms[:5])
    else:
        query_parts.extend([primary_role or "", template_request.question])
        query_parts.extend(focus_terms[:4])

    deduped: list[str] = []
    for part in query_parts:
        normalized = re.sub(r"\s+", " ", part or "").strip()
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return " / ".join(deduped)


def _should_run_role_focused_second_pass(
    *,
    template_request: TemplateRequest,
    primary_role: str | None,
    company_rag_available: bool,
    grounding_mode: str,
    company_evidence_cards: list[dict[str, str]],
    evidence_coverage_level: str,
    assistive_company_signal: bool,
    effective_company_grounding: str = "assistive",
) -> bool:
    if not company_rag_available:
        return False
    if not (primary_role or template_request.intern_name or template_request.question):
        return False

    if effective_company_grounding == "assistive":
        return (
            grounding_mode == "company_general"
            and assistive_company_signal
            and evidence_coverage_level == "weak"
        )

    if grounding_mode not in {"company_general", "role_grounded"}:
        return False

    if evidence_coverage_level not in {"weak", "partial"}:
        return False

    role_anchor_count = sum(
        1
        for card in company_evidence_cards
        if str(card.get("theme") or "") in ROLE_PROGRAM_EVIDENCE_THEMES
    )
    company_anchor_count = sum(
        1
        for card in company_evidence_cards
        if str(card.get("theme") or "") in COMPANY_DIRECTION_EVIDENCE_THEMES
    )
    return role_anchor_count == 0 or company_anchor_count == 0 or evidence_coverage_level == "weak"


__all__ = [
    "RetryPlan",
    "REWRITE_MAX_ATTEMPTS",
    "build_rewrite_retry_plan",
    "_best_effort_rewrite_admissible",
    "_build_role_focused_second_pass_query",
    "_build_hallucination_retry_hints",
    "_dedupe_preserve_order",
    "_describe_retry_reason",
    "_es_review_temperature",
    "_length_profile_stage_from_mode",
    "_length_shortfall_bucket",
    "_normalize_timeout_fallback_clause",
    "_openai_es_review_output_cap",
    "_primary_retry_code",
    "_resolve_rewrite_focus_mode",
    "_resolve_rewrite_focus_modes",
    "_resolve_rewrite_length_control_mode",
    "_retry_hints_from_codes",
    "_rewrite_max_tokens",
    "_rewrite_validation_degraded_hint",
    "_rewrite_validation_soft_hint",
    "_select_composite_retry_mode",
    "_select_retry_codes",
    "_select_rewrite_prompt_context",
    "_serialize_focus_modes",
    "_should_run_role_focused_second_pass",
    "_total_rewrite_attempts",
]
