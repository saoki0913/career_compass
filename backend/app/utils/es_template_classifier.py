from __future__ import annotations

from dataclasses import dataclass, asdict, field
import re


TemplateType = str
TemplateConfidence = str
GroundingLevel = str


@dataclass(frozen=True)
class ESQuestionClassification:
    predicted_template_type: TemplateType
    confidence: TemplateConfidence
    secondary_candidates: list[TemplateType]
    rationale: str
    requires_company_rag: bool
    recommended_grounding_level: GroundingLevel
    matched_rule: str
    is_compound: bool = False
    compound_secondary_type: TemplateType | None = None
    compound_tertiary_type: TemplateType | None = None
    compound_variant: str | None = None
    compound_template_types: list[TemplateType] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _build(
    template_type: TemplateType,
    confidence: TemplateConfidence,
    matched_rule: str,
    *,
    secondary_candidates: list[TemplateType] | None = None,
    rationale: str,
    requires_company_rag: bool,
    recommended_grounding_level: GroundingLevel,
    is_compound: bool = False,
    compound_secondary_type: TemplateType | None = None,
    compound_tertiary_type: TemplateType | None = None,
    compound_variant: str | None = None,
) -> ESQuestionClassification:
    compound_template_types = [template_type]
    if compound_secondary_type:
        compound_template_types.append(compound_secondary_type)
    if compound_tertiary_type:
        compound_template_types.append(compound_tertiary_type)
    inferred_candidates = list(secondary_candidates or [])
    for candidate in compound_template_types[1:]:
        if candidate not in inferred_candidates:
            inferred_candidates.append(candidate)
    return ESQuestionClassification(
        predicted_template_type=template_type,
        confidence=confidence,
        secondary_candidates=inferred_candidates,
        rationale=rationale,
        requires_company_rag=requires_company_rag,
        recommended_grounding_level=recommended_grounding_level,
        matched_rule=matched_rule,
        is_compound=is_compound,
        compound_secondary_type=compound_secondary_type,
        compound_tertiary_type=compound_tertiary_type,
        compound_variant=compound_variant,
        compound_template_types=compound_template_types if is_compound else [],
    )


_COMPANY_REQUIRED_TYPES = {
    "company_motivation",
    "role_course_reason",
    "intern_reason",
    "intern_goals",
    "post_join_goals",
}


_GROUNDING_RANK = {"none": 0, "light": 1, "standard": 2, "deep": 3}
_DEFAULT_GROUNDING_BY_TYPE = {
    "basic": "none",
    "company_motivation": "deep",
    "role_course_reason": "deep",
    "intern_reason": "standard",
    "intern_goals": "standard",
    "post_join_goals": "standard",
    "gakuchika": "none",
    "self_pr": "light",
    "work_values": "light",
}


def _search(pattern: str, text: str) -> bool:
    return bool(re.search(pattern, text, re.IGNORECASE))


def _compound(
    primary_type: TemplateType,
    secondary_type: TemplateType,
    matched_rule: str,
    rationale: str,
    *,
    tertiary_type: TemplateType | None = None,
    variant: str | None = None,
) -> ESQuestionClassification:
    template_types = [primary_type, secondary_type]
    if tertiary_type:
        template_types.append(tertiary_type)
    grounding_level = max(
        (_DEFAULT_GROUNDING_BY_TYPE.get(template_type, "light") for template_type in template_types),
        key=lambda level: _GROUNDING_RANK.get(level, 0),
    )
    return _build(
        primary_type,
        "high",
        matched_rule,
        secondary_candidates=template_types[1:],
        rationale=rationale,
        requires_company_rag=any(template_type in _COMPANY_REQUIRED_TYPES for template_type in template_types),
        recommended_grounding_level=grounding_level,
        is_compound=True,
        compound_secondary_type=secondary_type,
        compound_tertiary_type=tertiary_type,
        compound_variant=variant,
    )


def classify_es_question(question: str) -> ESQuestionClassification:
    text = (question or "").strip()

    if (
        _search(r"挑戦|成長|経験|学生時代|力を入れ", text)
        and _search(r"強み|発揮", text)
        and _search(r"当社|貴社|御社|入社後|将来|活か|生か|貢献", text)
    ):
        return _compound(
            "gakuchika",
            "self_pr",
            "compound_gakuchika_self_pr_post_join_goals",
            "経験、そこで得た強みや学び、入社後の活かし方を同時に問う三重複合設問です。",
            tertiary_type="post_join_goals",
        )

    if _search(r"強み|長所|良い点", text) and _search(r"弱み|短所|課題", text):
        return _compound(
            "self_pr",
            "self_pr",
            "compound_strength_weakness",
            "強みと弱みの両方を、根拠や克服姿勢とともに問う設問です。",
            variant="strength_weakness",
        )

    if _search(r"インターン", text) and _search(r"志望|参加|理由", text) and _search(r"強み|自己pr|自己ＰＲ|PR|発揮|活か|生か", text):
        return _compound(
            "intern_reason",
            "self_pr",
            "compound_intern_reason_self_pr",
            "インターン志望理由と、プログラムで発揮できる強みを同時に問う設問です。",
        )

    if _search(r"インターン", text) and _search(r"参加|志望|理由", text) and _search(r"学び|得たい|身につけたい|目標|達成|やりたい", text):
        return _compound(
            "intern_reason",
            "intern_goals",
            "compound_intern_reason_goals",
            "インターン参加理由と学びたいことを同時に問う設問です。",
        )

    if _search(r"志望|なぜ当社|当社を選んだ|貴社を志望|御社を志望", text) and _search(r"職種|コース|部門|領域|事業|どの", text):
        return _compound(
            "company_motivation",
            "role_course_reason",
            "compound_company_role_course",
            "企業志望理由と職種・コース・事業選択理由を同時に問う設問です。",
        )

    if _search(r"大切|価値観|働くうえ|仕事観", text) and _search(r"当社|貴社|御社|企業|志望|実現", text):
        return _compound(
            "work_values",
            "company_motivation",
            "compound_work_values_company",
            "働くうえでの価値観と企業適合性を同時に問う設問です。",
        )

    if _search(r"成し遂げたい|キャリアビジョン|将来像|人生で", text) and _search(r"なぜ当社|当社|貴社|御社|企業|志望", text):
        return _compound(
            "post_join_goals",
            "company_motivation",
            "compound_career_company",
            "将来像や成し遂げたいことと、企業選択理由を同時に問う設問です。",
        )

    if _search(r"志望|志望動機|なぜ当社|当社を志望|貴社を志望|御社を志望", text) and _search(r"入社後|実現|取り組みたい|やりたい|挑戦したい", text):
        return _compound(
            "company_motivation",
            "post_join_goals",
            "compound_company_post_join",
            "企業志望理由と入社後に実現したいことを同時に問う設問です。",
        )

    if _search(r"強み|自己pr|自己ＰＲ|PR|アピール", text) and _search(r"入社後|実現|活か|生か|貢献", text):
        return _compound(
            "self_pr",
            "post_join_goals",
            "compound_self_pr_post_join",
            "自己PRと入社後の活かし方を同時に問う設問です。",
        )

    if _search(r"学生時代|力を入れ|頑張|経験|取り組", text) and _search(r"強み|発揮|自己pr|自己ＰＲ|PR|アピール", text):
        return _compound(
            "gakuchika",
            "self_pr",
            "compound_gakuchika_self_pr",
            "学生時代の経験と、そこで発揮した強みを同時に問う設問です。",
        )

    if _search(r"学生時代|力を入れ|頑張|経験|取り組", text) and _search(r"活か|生か|将来|入社後|今後|仕事", text):
        return _compound(
            "gakuchika",
            "post_join_goals",
            "compound_gakuchika_post_join",
            "学生時代の経験と、その学びの将来への活かし方を同時に問う設問です。",
        )

    if re.search(r"学生時代|力を入れた|頑張ったこと|学業以外|最も困難だった経験", text):
        return _build(
            "gakuchika",
            "high",
            "gakuchika",
            secondary_candidates=["self_pr"],
            rationale="学生時代の経験や取り組みを問う表現が明確です。",
            requires_company_rag=False,
            recommended_grounding_level="none",
        )

    if re.search(r"(自己pr|自己ＰＲ|自分の強み|あなたの強み|セールスポイント)", text, re.IGNORECASE):
        return _build(
            "self_pr",
            "high",
            "self_pr",
            secondary_candidates=["gakuchika"],
            rationale="強みや自己PRを直接たずねる表現が含まれています。",
            requires_company_rag=False,
            recommended_grounding_level="light",
        )

    if re.search(r"インターン", text) and re.search(r"学びたい|得たい|身につけたい|目標|達成|やりたい", text):
        return _build(
            "intern_goals",
            "high",
            "intern_goals",
            secondary_candidates=["intern_reason"],
            rationale="インターンで学びたいことや得たいことを問う表現が明確です。",
            requires_company_rag=True,
            recommended_grounding_level="standard",
        )

    if re.search(r"インターン", text) and re.search(r"理由|参加理由|参加したい", text):
        return _build(
            "intern_reason",
            "high",
            "intern_reason",
            secondary_candidates=["intern_goals"],
            rationale="インターンに参加する理由を問う表現が明確です。",
            requires_company_rag=True,
            recommended_grounding_level="standard",
        )

    if re.search(r"価値観|大切にしている|働くうえで|仕事観", text):
        return _build(
            "work_values",
            "high",
            "work_values",
            secondary_candidates=["self_pr"],
            rationale="働くうえで大切にしたい価値観を問う表現が含まれています。",
            requires_company_rag=False,
            recommended_grounding_level="light",
        )

    if (
        re.search(r"(職種|コース|部門|領域|デジタル企画|エンジニア|総合職).*理由", text)
        or (re.search(r"選択した理由", text) and not re.search(r"当社|企業|貴社|御社", text))
        or (re.search(r"職種|コース|部門|領域", text) and re.search(r"志望|志望理由|理由", text))
    ):
        return _build(
            "role_course_reason",
            "high",
            "role_course_reason",
            secondary_candidates=["company_motivation"],
            rationale="職種・コース・部門など役割選択の理由を問う表現が含まれています。",
            requires_company_rag=True,
            recommended_grounding_level="deep",
        )

    if re.search(r"入社後|将来|実現したい|挑戦したい|やりたいこと", text):
        return _build(
            "post_join_goals",
            "high",
            "post_join_goals",
            secondary_candidates=["company_motivation"],
            rationale="入社後や将来に実現したいことを問う表現が含まれています。",
            requires_company_rag=True,
            recommended_grounding_level="standard",
        )

    if re.search(r"志望理由|志望する理由|志望動機|なぜ当社|当社を志望|当社を選んだ理由|貴社を志望|御社を志望", text):
        return _build(
            "company_motivation",
            "high",
            "company_motivation",
            secondary_candidates=["role_course_reason"],
            rationale="企業を志望する理由を直接たずねる表現が含まれています。",
            requires_company_rag=True,
            recommended_grounding_level="deep",
        )

    if re.search(r"当社|貴社|御社", text) and re.search(r"大切|重視|共感|魅力", text):
        return _build(
            "basic",
            "low",
            "fallback_basic",
            secondary_candidates=["work_values", "company_motivation"],
            rationale="会社への言及はありますが、価値観設問か志望理由設問かが断定しきれません。",
            requires_company_rag=False,
            recommended_grounding_level="light",
        )

    if re.search(r"インターン", text):
        return _build(
            "basic",
            "low",
            "fallback_basic",
            secondary_candidates=["intern_reason", "intern_goals"],
            rationale="インターン文脈ですが、理由か目標かを断定する語が不足しています。",
            requires_company_rag=False,
            recommended_grounding_level="light",
        )

    return _build(
        "basic",
        "low",
        "fallback_basic",
        rationale="設問タイプを断定する決め手が少ないため、汎用添削として扱います。",
        requires_company_rag=False,
        recommended_grounding_level="none",
    )
