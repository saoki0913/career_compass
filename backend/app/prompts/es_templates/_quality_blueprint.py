"""Quality-first rewrite blueprint for ES review prompts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, TypedDict, cast

from app.prompts.es_reference_guidance import select_char_band
from app.prompts.logic_patterns import get_logic_patterns

from ._types import TemplateDef, rewrite_policy


class ReferenceQualityProfile(TypedDict, total=False):
    quality_hints: list[str]
    skeleton: list[str]
    sentence_flow: dict[str, str]
    char_band: str
    is_compound: bool
    component_types: list[str]


@dataclass(frozen=True, slots=True)
class QualityBlueprint:
    template_type: str
    char_band: str
    primary_goal: str
    flow: tuple[str, ...]
    must_improve: tuple[str, ...]
    avoid: tuple[str, ...]
    compound_note: str = ""


PRIMARY_GOALS: dict[str, str] = {
    "basic": "設問への答えを冒頭で明確に示し、具体的な経験・行動・結果で裏づける。",
    "company_motivation": "自分が実現したいことと、その企業でなければならない理由を一本の線でつなぐ。",
    "gakuchika": "困難に対してどのように考え、周囲を巻き込み、成果を出したかを示す。",
    "self_pr": "強みを一言で定義し、その強みが経験で再現性を持って発揮されたことを示す。",
    "intern_reason": "なぜその会社ではなく、そのインターンに参加したいのかを過去経験・課題・プログラム固有性で示す。",
    "intern_goals": "参加を通じて何を得たいかを、過去経験・現在の不足・将来像とつなげる。",
    "post_join_goals": "入社後に実現したい価値を、企業の事業・自分の経験・時間軸と接続する。",
    "role_course_reason": "企業志望理由ではなく、その職種・コースを選ぶ理由と自己適性を接続する。",
    "work_values": "働くうえで大切にする価値観を、実体験と仕事での行動に落とし込む。",
}


def _clean_items(items: object, *, limit: int) -> tuple[str, ...]:
    if not isinstance(items, list):
        return ()
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
        if len(cleaned) >= limit:
            break
    return tuple(cleaned)


def _profile_from_mapping(profile: Mapping[str, Any] | None) -> ReferenceQualityProfile:
    if not profile:
        return {}
    result: ReferenceQualityProfile = {}
    quality_hints = profile.get("quality_hints")
    if isinstance(quality_hints, list):
        result["quality_hints"] = [str(item) for item in quality_hints if str(item).strip()]
    skeleton = profile.get("skeleton")
    if isinstance(skeleton, list):
        result["skeleton"] = [str(item) for item in skeleton if str(item).strip()]
    sentence_flow = profile.get("sentence_flow")
    if isinstance(sentence_flow, dict):
        result["sentence_flow"] = {
            str(key): str(value)
            for key, value in sentence_flow.items()
            if str(key).strip() and str(value).strip()
        }
    char_band = profile.get("char_band")
    if isinstance(char_band, str):
        result["char_band"] = char_band
    is_compound = profile.get("is_compound")
    if isinstance(is_compound, bool):
        result["is_compound"] = is_compound
    component_types = profile.get("component_types")
    if isinstance(component_types, list):
        result["component_types"] = [
            str(item) for item in component_types if str(item).strip()
        ]
    return result


def _take_clean(items: tuple[str, ...], limit: int) -> list[str]:
    return [item for item in items if item.strip()][:limit]


def _logic_pattern_guidance(
    template_type: str,
) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    payload = get_logic_patterns(template_type) or {}
    if not payload:
        return (), (), ()

    flow_items: list[str] = []
    improve_items: list[str] = []
    avoid_items: list[str] = []

    opening = payload.get("opening_pattern")
    if isinstance(opening, dict):
        structure = opening.get("structure")
        if isinstance(structure, str) and structure.strip():
            flow_items.append(structure.strip())

    patterns = payload.get("patterns")
    if isinstance(patterns, list):
        for pattern in patterns:
            if not isinstance(pattern, dict):
                continue
            blueprint = pattern.get("structural_blueprint")
            if isinstance(blueprint, str) and blueprint.strip():
                flow_items.append(blueprint.strip())
            evidence = pattern.get("evidence_strategy")
            if isinstance(evidence, str) and evidence.strip():
                improve_items.append(evidence.strip())
            transition = pattern.get("transition_logic")
            if isinstance(transition, str) and transition.strip():
                improve_items.append(transition.strip())
            if len(flow_items) >= 2 and len(improve_items) >= 2:
                break

    closing = payload.get("closing_pattern")
    if isinstance(closing, dict):
        structure = closing.get("structure")
        if isinstance(structure, str) and structure.strip():
            flow_items.append(structure.strip())

    quality_markers = payload.get("quality_markers")
    if isinstance(quality_markers, list):
        improve_items.extend(str(item).strip() for item in quality_markers if str(item).strip())

    common_weaknesses = payload.get("common_weaknesses")
    if isinstance(common_weaknesses, list):
        avoid_items.extend(str(item).strip() for item in common_weaknesses if str(item).strip())

    return (
        _clean_items(flow_items, limit=2),
        _clean_items(improve_items, limit=2),
        _clean_items(avoid_items, limit=2),
    )


def _flow_from_profile(
    profile: ReferenceQualityProfile,
    template_def: TemplateDef,
    template_type: str,
) -> tuple[str, ...]:
    logic_flow, _, _ = _logic_pattern_guidance(template_type)
    skeleton = _clean_items(profile.get("skeleton"), limit=5)
    if skeleton:
        return tuple([*_take_clean(skeleton, 3), *_take_clean(logic_flow, 2)][:5])
    sentence_flow = profile.get("sentence_flow") or {}
    flow = [
        value
        for key, value in sorted(sentence_flow.items())
        if key.startswith("sentence_") and value.strip()
    ]
    if flow:
        return tuple([*flow[:3], *_take_clean(logic_flow, 2)][:5])
    required = _clean_items(rewrite_policy(template_def).get("required_elements"), limit=5)
    return tuple([*_take_clean(required, 3), *_take_clean(logic_flow, 2)][:5]) or (
        "結論、根拠、行動、結果、今後への接続を一本の線で示す",
    )


def _must_improve_from_sources(
    profile: ReferenceQualityProfile,
    template_def: TemplateDef,
    template_type: str,
) -> tuple[str, ...]:
    policy = rewrite_policy(template_def)
    _, logic_improve, _ = _logic_pattern_guidance(template_type)
    candidates = [
        *_clean_items(profile.get("quality_hints"), limit=2),
        *_take_clean(logic_improve, 1),
        *_clean_items(policy.get("required_elements"), limit=3),
    ]
    return _clean_items(cast(list[str], candidates), limit=3)


def _avoid_from_sources(template_def: TemplateDef, template_type: str) -> tuple[str, ...]:
    _, _, logic_avoid = _logic_pattern_guidance(template_type)
    avoid = _clean_items(rewrite_policy(template_def).get("anti_patterns"), limit=3)
    if avoid:
        return tuple([*_take_clean(avoid, 2), *_take_clean(logic_avoid, 1)][:3])
    return (
        "抽象語や一般論だけで字数を埋める",
        "設問の主題から外れて経験説明だけを長くする",
        "参考ESの語句や特徴的な表現を再利用する",
    )


def _enumeration_phrasing_for_band(template_type: str, char_max: int | None) -> str:
    """文字数帯に対応する列挙テンプレ例（句点独立）。なければ空文字。"""
    payload = get_logic_patterns(template_type) or {}
    phrasing = payload.get("enumeration_phrasing")
    if not isinstance(phrasing, dict):
        return ""
    items = phrasing.get(select_char_band(char_max).value)
    if isinstance(items, list) and items and isinstance(items[0], str):
        return items[0].strip()
    return ""


def _compound_note(profile: ReferenceQualityProfile) -> str:
    if not profile.get("is_compound"):
        return ""
    component_types = profile.get("component_types") or []
    if len(component_types) <= 1:
        return "主設問の骨格を優先し、補助観点は後半で自然に接続する。"
    secondaries = "、".join(component_types[1:3])
    return f"主設問の骨格を優先し、{secondaries} の観点は後半で自然に接続する。"


def build_quality_blueprint(
    *,
    template_type: str,
    template_def: TemplateDef,
    reference_quality_profile: Mapping[str, Any] | None,
    char_min: int | None,
    char_max: int | None,
) -> QualityBlueprint:
    _ = char_min
    profile = _profile_from_mapping(reference_quality_profile)
    char_band = profile.get("char_band") or (
        f"{char_max}字以内" if char_max else "指定なし"
    )
    must_improve = _must_improve_from_sources(profile, template_def, template_type)
    # 参考ES由来の列挙テンプレ例があれば must_improve の先頭に置く
    # （compact 描画でも残り、LLM が論理構成を再現しやすくする）。
    enumeration = _enumeration_phrasing_for_band(template_type, char_max)
    if enumeration:
        must_improve = _clean_items([enumeration, *must_improve], limit=3)
    return QualityBlueprint(
        template_type=template_type,
        char_band=char_band,
        primary_goal=PRIMARY_GOALS.get(template_type, PRIMARY_GOALS["basic"]),
        flow=_flow_from_profile(profile, template_def, template_type),
        must_improve=must_improve,
        avoid=_avoid_from_sources(template_def, template_type),
        compound_note=_compound_note(profile),
    )


def format_quality_blueprint_instruction(
    blueprint: QualityBlueprint,
    *,
    compact: bool = False,
) -> str:
    flow = blueprint.flow[:3] if compact else blueprint.flow
    must_improve = blueprint.must_improve[:2] if compact else blueprint.must_improve
    avoid = blueprint.avoid[:2] if compact else blueprint.avoid
    lines = [
        '<quality_blueprint priority="primary">',
        "目的: 元回答を、設問タイプに合う高品質な提出ESへ改善する。",
        "",
        f"評価される核: {blueprint.primary_goal}",
        "",
        "構成:",
        *[f"{index}. {item}" for index, item in enumerate(flow, start=1)],
        "",
        "必ず改善する点:",
        *[f"- {item}" for item in must_improve],
        "",
        "避ける点:",
        *[f"- {item}" for item in avoid],
    ]
    if blueprint.compound_note:
        lines.extend(["", f"複合設問の補助観点: {blueprint.compound_note}"])
    lines.append("</quality_blueprint>")
    return "\n".join(lines)


def summarize_quality_blueprint(blueprint: QualityBlueprint) -> str:
    lines = [
        f"評価される核: {blueprint.primary_goal}",
        "構成: " + " / ".join(blueprint.flow[:5]),
        "必ず改善する点: " + " / ".join(blueprint.must_improve[:3]),
    ]
    if blueprint.compound_note:
        lines.append(f"複合設問: {blueprint.compound_note}")
    return "\n".join(line for line in lines if line.strip())
