"""Reference ES guidance renderer.

Renders prompt-safe writing guidance from the hand-curated SSOT
``es_reference_guidance``. Holds no guidance data and no corpus statistics:
quality is decided per question type in ``es_reference_guidance``. Compound ES
(multiple question types) is merged here at render time, mirroring
``app.services.es_review.template_context.merge_template_specs``.
"""

from __future__ import annotations

from app.prompts.es_reference_guidance import (
    get_logic_patterns_payload,
    get_quality_hints,
    get_sentence_flow,
    get_skeleton,
    select_char_band,
)

_SECONDARY_HINT_TAKE = 3
_MERGED_HINT_CAP = 10


def load_reference_examples(
    question_type: str,
    *,
    char_max: int | None = None,
    company_name: str | None = None,
    max_items: int = 2,
) -> list[dict]:
    """Raw reference ES examples are never returned at runtime (offline only)."""

    return []


def _dedupe_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        normalized = str(item or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped


def _normalized_component_types(
    question_type: str, component_types: list[str] | None
) -> list[str]:
    """Primary-first, deduped component type list. Single type when no compound."""

    raw = [question_type, *(component_types or [])]
    ordered: list[str] = []
    for template_type in raw:
        name = str(template_type or "").strip()
        if name and name not in ordered:
            ordered.append(name)
    return ordered or [question_type]


def _secondary_core(secondary_type: str) -> str:
    """One-line summary of what a secondary type adds (for the compound note)."""

    payload = get_logic_patterns_payload(secondary_type) or {}
    opening = payload.get("opening_pattern")
    if isinstance(opening, dict):
        structure = opening.get("structure")
        if isinstance(structure, str) and structure.strip():
            return structure.strip()
    flow = get_sentence_flow(secondary_type)
    return flow.get("sentence_1_role") or secondary_type


def _merge_reference_guidance(
    component_types: list[str], *, char_max: int | None
) -> dict[str, object]:
    """Merge per-type guidance for compound ES.

    Strategy mirrors ``merge_template_specs``: the primary leads, each secondary
    contributes a capped, deduped supplement. The primary's char-band skeleton
    stays the structural backbone (two skeletons are never machine-interleaved);
    secondaries are surfaced as a compound note so the ES stays coherent.
    """

    primary = component_types[0]
    secondaries = component_types[1:]

    hints = list(get_quality_hints(primary))
    for secondary in secondaries:
        hints.extend(get_quality_hints(secondary)[:_SECONDARY_HINT_TAKE])
    quality_hints = _dedupe_strings(hints)[:_MERGED_HINT_CAP]

    skeleton = list(get_skeleton(primary, char_max=char_max))
    if secondaries:
        cores = " / ".join(_secondary_core(secondary) for secondary in secondaries)
        skeleton = skeleton + [f"（複合）後半で次の観点も自然に接続する: {cores}"]

    sentence_flow = dict(get_sentence_flow(primary))
    if secondaries and sentence_flow:
        base = sentence_flow.get("transition_pattern", "")
        sentence_flow["transition_pattern"] = (
            (f"{base}。" if base else "")
            + f"複合設問のため主骨格は{primary}を保ち、後半で他タイプの要素を接続する"
        )

    return {
        "quality_hints": quality_hints,
        "skeleton": skeleton,
        "sentence_flow": sentence_flow,
    }


def build_reference_quality_profile(
    question_type: str,
    *,
    char_max: int | None = None,
    company_name: str | None = None,
    current_answer: str | None = None,
    component_types: list[str] | None = None,
) -> dict | None:
    """Resolve qualitative guidance for the (possibly compound) question type."""

    types = _normalized_component_types(question_type, component_types)
    is_compound = len(types) > 1

    if is_compound:
        merged = _merge_reference_guidance(types, char_max=char_max)
        quality_hints = list(merged["quality_hints"])  # type: ignore[arg-type]
        skeleton = list(merged["skeleton"])  # type: ignore[arg-type]
        sentence_flow = dict(merged["sentence_flow"])  # type: ignore[arg-type]
    else:
        quality_hints = get_quality_hints(question_type)
        skeleton = get_skeleton(question_type, char_max=char_max)
        sentence_flow = get_sentence_flow(question_type)

    if not quality_hints and not skeleton:
        return None

    return {
        "quality_hints": quality_hints,
        "skeleton": skeleton,
        "sentence_flow": sentence_flow,
        "char_band": select_char_band(char_max).value,
        "is_compound": is_compound,
        "component_types": types,
    }


def build_reference_quality_block(
    question_type: str,
    *,
    char_max: int | None = None,
    company_name: str | None = None,
    current_answer: str | None = None,
    component_types: list[str] | None = None,
) -> str:
    profile = build_reference_quality_profile(
        question_type,
        char_max=char_max,
        company_name=company_name,
        current_answer=current_answer,
        component_types=component_types,
    )
    if not profile:
        return ""

    hint_lines = "\n".join(f"- {hint}" for hint in profile["quality_hints"])
    skeleton_lines = "\n".join(f"- {item}" for item in profile["skeleton"])

    from app.prompts.logic_patterns import build_logic_patterns_block

    structural_block = build_logic_patterns_block(
        question_type,
        char_max=char_max,
        component_types=profile["component_types"],
    )

    sentence_flow = profile["sentence_flow"]
    flow_section = ""
    if sentence_flow:
        flow_lines: list[str] = []
        for key, value in sentence_flow.items():
            if key.startswith("sentence_"):
                flow_lines.append(f"- {value}")
            elif key == "transition_pattern":
                flow_lines.append(f"- 接続: {value}")
        if flow_lines:
            flow_section = "\n\n【文レベルの流れ】\n" + "\n".join(flow_lines)

    return f"""【この設問で意識する品質】
{hint_lines}

【参考ESから抽出した骨子】
{skeleton_lines}
- 骨子は論点配置の参考に留め、文章や流れをそのままなぞらない
- 参考ESの本文・語句・特徴的な言い回し・細かな構成順を再利用しない{flow_section}{structural_block}"""
