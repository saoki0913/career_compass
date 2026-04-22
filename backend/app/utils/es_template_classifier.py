from __future__ import annotations

from dataclasses import dataclass, asdict
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
) -> ESQuestionClassification:
    return ESQuestionClassification(
        predicted_template_type=template_type,
        confidence=confidence,
        secondary_candidates=list(secondary_candidates or []),
        rationale=rationale,
        requires_company_rag=requires_company_rag,
        recommended_grounding_level=recommended_grounding_level,
        matched_rule=matched_rule,
    )


def classify_es_question(question: str) -> ESQuestionClassification:
    text = (question or "").strip()

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
