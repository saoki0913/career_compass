"""Prompt builders for ES template rewrite and draft generation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from app.prompts.es_quality_rules import (
    _build_contextual_rules,
    format_template_guidance,
    get_abstract_examples,
)

from ._common import (
    _format_anti_ai_phrase_block,
    _format_prose_style_block,
    get_company_honorific,
)
from ._focus_modes import FocusModeContext, _dedupe_text_items, _format_focus_mode_guidance
from ._length_control import (
    _format_char_condition,
    _format_length_policy_block,
    _format_target_char_window,
)
from .basic import TEMPLATE_DEF as BASIC_TEMPLATE_DEF
from .company_motivation import TEMPLATE_DEF as COMPANY_MOTIVATION_TEMPLATE_DEF
from .gakuchika import TEMPLATE_DEF as GAKUCHIKA_TEMPLATE_DEF
from .intern_goals import TEMPLATE_DEF as INTERN_GOALS_TEMPLATE_DEF
from .intern_reason import TEMPLATE_DEF as INTERN_REASON_TEMPLATE_DEF
from .post_join_goals import TEMPLATE_DEF as POST_JOIN_GOALS_TEMPLATE_DEF
from .role_course_reason import TEMPLATE_DEF as ROLE_COURSE_REASON_TEMPLATE_DEF
from .self_pr import TEMPLATE_DEF as SELF_PR_TEMPLATE_DEF
from .work_values import TEMPLATE_DEF as WORK_VALUES_TEMPLATE_DEF
from ._types import EvaluationAxis, TemplateDef


TEMPLATE_DEFS: dict[str, TemplateDef] = {
    "basic": BASIC_TEMPLATE_DEF,
    "company_motivation": COMPANY_MOTIVATION_TEMPLATE_DEF,
    "intern_reason": INTERN_REASON_TEMPLATE_DEF,
    "intern_goals": INTERN_GOALS_TEMPLATE_DEF,
    "gakuchika": GAKUCHIKA_TEMPLATE_DEF,
    "self_pr": SELF_PR_TEMPLATE_DEF,
    "post_join_goals": POST_JOIN_GOALS_TEMPLATE_DEF,
    "role_course_reason": ROLE_COURSE_REASON_TEMPLATE_DEF,
    "work_values": WORK_VALUES_TEMPLATE_DEF,
}


def get_template_evaluation_axes(template_type: str) -> list[EvaluationAxis]:
    axes = get_template_spec(template_type).get("evaluation_axes") or []
    return [dict(axis) for axis in axes if str(axis.get("name") or "").strip()]


def _format_template_evaluation_rubric(
    template_type: str = "",
    *,
    template_spec: TemplateDef | None = None,
) -> str:
    if template_spec is not None:
        axes = [
            dict(axis)
            for axis in list(template_spec.get("evaluation_axes") or [])
            if str(axis.get("name") or "").strip()
        ]
    else:
        axes = get_template_evaluation_axes(template_type)
    if not axes:
        return ""
    lines = ["<evaluation_rubric>"]
    for axis in axes:
        name = str(axis.get("name") or "").strip()
        pass_condition = str(axis.get("pass_condition") or "").strip()
        rewrite_instruction = str(axis.get("rewrite_instruction") or "").strip()
        if not name:
            continue
        detail = " / ".join(part for part in [pass_condition, rewrite_instruction] if part)
        lines.append(f"- {name}: {detail}")
    lines.append("</evaluation_rubric>")
    return "\n".join(lines)


TEMPLATE_ROLES = {
    "basic": "就活ES作成のプロフェッショナル",
    "company_motivation": "就活ESの志望理由作成のプロフェッショナル",
    "intern_reason": "就活ESのインターン志望理由作成のプロフェッショナル",
    "intern_goals": "就活ESのインターン目標作成のプロフェッショナル",
    "gakuchika": "就活ESのガクチカ作成のプロフェッショナル",
    "self_pr": "就活ESの自己PR作成のプロフェッショナル",
    "post_join_goals": "就活ESの入社後ビジョン作成のプロフェッショナル",
    "role_course_reason": "就活ESの職種選択理由作成のプロフェッショナル",
    "work_values": "就活ESの価値観表現作成のプロフェッショナル",
}


def grounding_level_to_policy(level: str) -> str:
    return "required" if level in {"standard", "deep"} else "assistive"


def get_template_default_grounding_level(template_type: str) -> str:
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    return str(template_def.get("grounding_level") or "light")


def get_template_company_grounding_policy(template_type: str) -> str:
    return grounding_level_to_policy(get_template_default_grounding_level(template_type))


def get_template_spec(template_type: str) -> dict[str, Any]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if template_def:
        return template_def
    return TEMPLATE_DEFS["basic"]


def get_template_evaluation_checks(template_type: str) -> dict[str, Any]:
    return dict(get_template_spec(template_type).get("evaluation_checks") or {})


def get_template_retry_guidance(template_type: str) -> dict[str, str]:
    return dict(get_template_spec(template_type).get("retry_guidance") or {})


def get_template_fact_priority(template_type: str) -> str:
    return str(get_template_spec(template_type).get("fact_priority") or "mixed")


def _extract_deep_grounding_hint_terms(company_evidence_cards: Optional[list[dict]]) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for card in company_evidence_cards or []:
        text = " ".join(str(card.get(field) or "") for field in ("claim", "excerpt", "title"))
        for token in re.findall(
            r"[ァ-ヶー]{3,}|[一-龥]{2,8}(?:部|課|室|局|本部|事業部|センター|部門|チーム|グループ)|[A-Z][A-Za-z0-9]{2,}|\d+[万億兆%％人名社件]",
            text,
        ):
            if token not in seen:
                seen.add(token)
                terms.append(token)
            if len(terms) >= 5:
                return terms
    return terms


def _format_deep_grounding_requirements(
    *,
    effective_grounding_level: str,
    company_evidence_cards: list[dict] | None = None,
) -> str:
    if effective_grounding_level != "deep":
        return ""
    terms = _extract_deep_grounding_hint_terms(company_evidence_cards)
    terms_line = "、".join(terms) if terms else "企業根拠カードに含まれる固有の事業名・部署名・制度名・数値"
    return f"""
<required_company_specifics>
以下の固有候補から必ず1つだけ本文中に含めること（複数使用不可）:
候補: {terms_line}

使用ルール:
- 選んだ1つを、自分の経験・強み・学びとの接続文として使う
- カード外の固有施策・部署名・数値・成果は追加しない
- 固有候補の羅列や過剰反復は避け、本文の主張を補強する1軸に絞る
</required_company_specifics>"""


def _format_gakuchika_bias_guard(template_type: str) -> str:
    if template_type in {"gakuchika", "basic"}:
        return ""
    return """
<gakuchika_bias_guard>
- ガクチカのエピソード説明は最小限に留め、設問の主題（志望動機/自己PR/入社後ビジョン等）に直接答える内容を優先する
- ガクチカの経験は「根拠の一言」程度にとどめ、設問が求める結論・動機・展望を本文の6割以上にする
</gakuchika_bias_guard>"""


def _format_structure_template(template_type: str, char_max: int | None) -> str:
    if char_max and char_max <= 220:
        return ""
    structure_map = {
        "company_motivation": "結論（志望理由の核）→根拠（経験＋企業接点）→展望（入社後の貢献）",
        "intern_reason": "結論（参加したい理由の核）→根拠（経験＋インターン接点）→目標（何を得たいか）",
        "self_pr": "結論（強みの核）→根拠（エピソード＋行動＋成果）→再現性（仕事での活かし方）",
        "gakuchika": "結論（取り組みの核）→状況・課題→行動→成果→学び",
        "post_join_goals": "結論（実現したいことの核）→根拠（経験＋企業接点）→具体的なアクション",
        "role_course_reason": "結論（選択理由の核）→根拠（経験＋適性）→展望（その職種での貢献）",
    }
    structure = structure_map.get(template_type)
    if not structure:
        return ""
    return f"""
<required_structure>
- 推奨構成: {structure}
- 第1文は必ず設問への直接的な回答にする（前置き・背景説明で始めない）
</required_structure>"""


def _format_template_required_elements(
    template_type: str = "",
    *,
    template_spec: TemplateDef | None = None,
) -> str:
    spec = template_spec if template_spec is not None else get_template_spec(template_type)
    items = [
        str(item).strip()
        for item in list(spec.get("required_elements") or [])
        if str(item).strip()
    ]
    if not items:
        return ""
    return "\n".join(["【設問で落としてはいけない要素】", *[f"- {item}" for item in items]])


def _format_template_anti_patterns(
    template_type: str = "",
    *,
    template_spec: TemplateDef | None = None,
) -> str:
    spec = template_spec if template_spec is not None else get_template_spec(template_type)
    items = [
        str(item).strip()
        for item in list(spec.get("anti_patterns") or [])
        if str(item).strip()
    ]
    if not items:
        return ""
    return "\n".join(["【避けるパターン】", *[f"- {item}" for item in items]])


def _format_gakuchika_allocation_guide(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    """Allocation guide for ``gakuchika`` draft generation."""
    if template_type != "gakuchika":
        return ""
    target = char_max or char_min or 0

    def _pct(lo: float, hi: float) -> str:
        if target <= 0:
            return f"{int(lo*100)}〜{int(hi*100)}% 目安"
        lo_chars = int(round(target * lo))
        hi_chars = int(round(target * hi))
        if lo_chars == hi_chars:
            return f"約 {lo_chars} 字"
        return f"約 {lo_chars}〜{hi_chars} 字"

    lines = [
        "【配分ガイド（目安）】",
        f"- 結論: {_pct(0.13, 0.17)}",
        f"- 状況＋課題: {_pct(0.20, 0.25)}",
        f"- 行動: {_pct(0.35, 0.40)}",
        f"- 成果: {_pct(0.15, 0.20)}",
        f"- 学び: {_pct(0.05, 0.10)}",
        "- 薄くなる場合は行動・成果を優先する",
        "- 最終文は評論調にしない。抽象名詞を主語にした「手法は〜に直結する」「〜と言える」は避ける",
        "- 結びは必ず「結果、OOした」または「結果、OOした。この経験からOOを〈結び動詞〉」のどちらかにする",
        "- 結び動詞は「培った」「身につけた」「磨いた」のいずれかを使う（参考ES傾向: 培った>身につけた>学んだ）。「学んだ」「実感した」は使わない",
        "- 結びで「今後の仕事でも〜」「発揮していく」「活かしていく」と未来志向にしない。ガクチカの結びはその経験から何を得たかで締める",
        "- 学び・身についた能力だけで終えない。結びには経験内の成果、数字、前後差のいずれかを必ず含める",
        "- 複数施策を①②で列挙する場合、その前に「そこで2つの施策を実施した。」のように施策数と行動意図を示す導入文を置く",
        "- 各施策を説明するときは「①では」を短い冒頭にして各項目を完結した文にする（句点「。」で区切る）。「①[長い活動名]では」と書くと接続節化しやすいため避ける",
        "- 悪い例:「①XXの実施では…し、②YYでは…した。」→ 正しい例:「そこで2つの施策を実施した。①ではXXに取り組み…を実現した。②ではYYを…達成した。」",
    ]
    return "\n".join(lines)


def _format_gakuchika_student_expressions(
    template_type: str,
    student_expressions: Optional[list[str]],
) -> str:
    """Render a compact "student's own words" block."""
    if template_type != "gakuchika" or not student_expressions:
        return ""
    cleaned = [str(item).strip() for item in student_expressions if str(item).strip()]
    if not cleaned:
        return ""
    bullets = "\n".join(f"- {item}" for item in cleaned[:5])
    return (
        "## 学生本人の表現\n"
        "以下から 1 つ以上を draft に残す（言い換えすぎない）:\n"
        f"{bullets}"
    )


def _format_gakuchika_fact_and_pii_rules(template_type: str) -> str:
    if template_type != "gakuchika":
        return ""
    return (
        "## 事実保全と個人情報の取り扱い\n"
        "- 会話にない事実は足さない\n"
        "- 推測で補わない\n"
        "- ドラフト内で実在の個人名を使用しないこと。「Aさん」「先輩」等で代替する\n"
        "- 学校名・企業名は文脈上必要な場合のみ残す\n"
    )


def _format_fact_preservation_rules() -> str:
    return "\n".join(
        [
            "- 元回答・使えるユーザー事実・企業根拠カードにない数値、役職、経験、成果、企業施策を追加しない",
            "- 文字数不足でも新事実で埋めず、既存事実の説明密度、接続、語尾、構成だけで調整する",
            "- 前回不合格案に含まれる事実でも、正本入力にないものは削除する",
            "- 企業根拠カードは方向性の補助に使い、未確認の固有施策・社内体制・数値として断定しない",
            "- ただし構造改善（文の順序変更、論理接続の補強、行動の具体化、能力の抽象化、貢献像、キャリア接続）で元回答の事実から論理的に導ける表現への置き換え・補強は事実追加に含めない。禁止するのは元にない数値・固有名詞・未経験の出来事の追加のみ",
        ]
    )


def _format_rewrite_closing_guidance(template_def: "TemplateDef") -> str:
    guidance = template_def.get("rewrite_closing_guidance", "")
    if not guidance:
        return ""
    return f"\n- {guidance}"


def _format_user_fact_guidance(
    allowed_user_facts: Optional[list[dict]],
    *,
    template_type: str,
    char_max: int | None = None,
) -> str:
    if not allowed_user_facts:
        return ""
    fact_lines = [
        f"- [{str(item.get('source', 'unknown'))}] {str(item.get('text', '')).strip()}"
        for item in allowed_user_facts
        if str(item.get("text", "")).strip()
    ]
    if not fact_lines:
        return ""
    fact_priority = get_template_fact_priority(template_type)
    priority_line = ""
    if fact_priority == "self":
        priority_line = "\n- 本文の主軸は自分の経験・行動・学びに置く"
    elif fact_priority == "mixed":
        priority_line = "\n- 本文の主軸は自分の経験を起点に、必要な範囲で企業や仕事との接点につなぐ"
    short_band_hint = ""
    if char_max and char_max <= 220 and len(fact_lines) >= 2:
        short_band_hint = "\n- 短い字数制限のため、元回答の核となる表現（動詞・名詞）をそのまま活かす"
    return f"""
【使えるユーザー事実】
{chr(10).join(fact_lines)}

<fact_weaving_rules>
1. 数値・固有名詞（○人、○か月、ツール名等）→ そのまま転写し、言い換えない
2. 行動・役割の事実 → 2文目または3文目の主語・目的語として使う
3. 成果・結果の事実 → 行動の直後に因果でつなぐ（「〜した結果」「〜により」）
4. 元回答のキーとなる動詞句 → 書き言葉に昇格させても動詞の核は変えない
   例: 「めっちゃ頑張って整理した」→「整理した」は残す（「整備した」に変えない）
5. 上記にない経験・役割・成果・数字は追加しない
6. raw material の事実は書かれた範囲のみ使い、推定や敷衍をしない
</fact_weaving_rules>{priority_line}{short_band_hint}"""


def _format_reference_quality_guidance(reference_quality_block: str) -> str:
    if not reference_quality_block:
        return ""
    return f"\n{reference_quality_block}"


def _format_reference_copy_safety_rules() -> str:
    return "\n".join(
        [
            "- 参考ESは品質傾向だけを参考にし、本文・語句・特徴的な言い回し・個別エピソードを再利用しない",
            "- 参考ES由来の事実をユーザー事実や企業根拠として扱わない",
            "- 論理構成パターンは構成の参考に留め、パターン内の例示表現や語句をそのまま使わない",
        ]
    )


def _format_assistive_grounding_block(
    *,
    effective_company_grounding: str,
    grounding_mode: str,
    company_name: str | None,
) -> str:
    """Return an <assistive_grounding> XML block for assistive-mode prompts.

    Conditions: effective_company_grounding == "assistive" AND
                grounding_mode != "none" AND company_name is truthy.
    Otherwise returns empty string.
    """
    if effective_company_grounding != "assistive":
        return ""
    if grounding_mode == "none":
        return ""
    if not company_name:
        return ""
    return f"""
<assistive_grounding>
- 企業への言及は「{company_name}」の名前、または具体的な事業・価値観で行う
- 企業に言及するときは「貴社」等の敬称を使ってよい
- 企業との接点は補助的に 0〜1 文にとどめ、本文の主軸は応募者自身の経験に置く
- 経験と企業の接点が自然に書けないときは企業言及を省略してよい
</assistive_grounding>"""


def _format_proper_noun_policy(
    *,
    template_type: str,
    intern_name: str | None,
    role_name: str | None,
) -> str:
    if template_type in {"intern_reason", "intern_goals"}:
        anchor = intern_name or "そのインターン"
        return f"""
<proper_noun_policy>
- 「{anchor}」のような固有名詞は冒頭で1回だけ使う
- 2回目以降は「本インターンシップ」または「本プログラム」に言い換える
- 固有名詞の反復で字数を使わず、参加理由・学び・接点の中身を優先する
</proper_noun_policy>"""
    if template_type == "role_course_reason":
        anchor = role_name or "その職種・コース"
        return f"""
<proper_noun_policy>
- 「{anchor}」のような固有名詞は冒頭で1回だけ使う
- 2回目以降は「本コース」または「当該職種」に言い換える
- 固有名詞の反復で字数を使わず、志望理由・適性・役割理解の中身を優先する
</proper_noun_policy>"""
    return ""


def _format_company_guidance(
    *,
    company_evidence_cards: Optional[list[dict]],
    has_rag: bool,
    grounding_mode: str,
    requires_company_rag: bool,
    company_grounding: str = "required",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    template_type: str = "basic",
) -> str:
    if has_rag and company_evidence_cards:
        primary_cards = [card for card in company_evidence_cards if card.get("is_primary")]
        secondary_cards = [card for card in company_evidence_cards if not card.get("is_primary")]
        ordered_cards = (primary_cards + secondary_cards)[:5]
        card_lines = []
        for index, card in enumerate(ordered_cards):
            theme = str(card.get("theme") or "").strip()
            axis = str(card.get("normalized_axis") or "").strip()
            summary = str(card.get("normalized_summary") or "").strip()
            claim = str(card.get("claim") or "").strip()
            excerpt = str(card.get("excerpt") or "").strip()
            line = summary or " / ".join(part for part in [claim, excerpt] if part)
            if not line:
                continue
            prefix_bits = [bit for bit in [theme, axis] if bit]
            prefix = f"[{' / '.join(prefix_bits)}] " if prefix_bits else ""
            label = "PRIMARY" if card.get("is_primary") or (index == 0 and not primary_cards) else "参考"
            card_lines.append(f"- {label}: {prefix}{line}")
        if not card_lines:
            return ""
        usage_lines = [
            "- 設問との接点が強い根拠を1〜2点だけ使う",
            "- 企業が重視する能力・価値観・方向性との整合を優先する",
            "- cards にない固有施策・制度・体制は新しく断定しない",
            "- cards の固有名詞や言い回しをそのまま増殖させない",
        ]
        if company_grounding == "assistive":
            if template_type == "gakuchika":
                if grounding_mode == "none":
                    usage_lines.extend(
                        [
                            "- 本文の主軸は課題・行動・成果・学びに置く",
                            "- 「貴社」「貴行」等の企業敬称は使わない（企業名なし文脈では不自然になる）",
                        ]
                    )
                else:
                    usage_lines.extend(
                        [
                            "- 本文の主軸は課題・行動・成果・学びに置く",
                            "- 企業理解や「貴社で活かす」系の接続を義務づけない（自然に書けるときだけ最大1文、なければ省略）",
                        ]
                    )
            else:
                if grounding_mode == "none":
                    usage_lines.extend(
                        [
                            "- 本文の主軸は自分の経験・行動・学び・価値観に置く",
                            "- 「貴社」「貴行」等の企業敬称は使わない（企業名なし文脈では不自然になる）",
                        ]
                    )
                else:
                    usage_lines.extend(
                        [
                            "- 本文の主軸は自分の経験・行動・学び・価値観に置く",
                            "- 企業理解は 0〜1 文だけ補助的に使い、本文の中心にしない",
                            "- 学びや強みが会社でどう活きるかを短くつなぐ程度にとどめる",
                        ]
                    )
        if grounding_mode == "company_general":
            usage_lines.append("- 職種別の断定や配属前提の表現は避ける")
            usage_lines.append("- PRIMARY カードの方向性だけを1文で使い、参考カードは無視してよい")
            usage_lines.append("- 企業情報は結論や根拠の補強材料としてのみ使い、企業説明で1文を丸ごと使わない")
        else:
            usage_lines.append("- 役割理解やインターン価値が取れている card を優先する")
        if generic_role_mode:
            usage_lines.append("- broad な職種名ではなく、事業理解と得たい経験・スキルの2軸で企業理解を示す")
        if evidence_coverage_level in {"weak", "partial"} and company_grounding == "required":
            usage_lines.extend(
                [
                    "- 根拠が限定的な場合は、cards から別観点の company anchor を最低2点拾う",
                    "- 事業理解と現場期待/役割期待を1文ずつ、または1文内の2句で圧縮してつなぐ",
                ]
            )
        elif evidence_coverage_level in {"weak", "partial"}:
            usage_lines.append("- 根拠が限定的な場合は、本文では薄く触れるか触れず、改善の方向づけだけに使う")
        usage_lines.append("- 企業接点の書き方: 「[自分の経験/強み]を、[企業の方向性/事業特性]の中で[具体的な貢献動詞]」の形で1文に圧縮する")
        return f"""
【企業根拠カード】
{chr(10).join(card_lines)}

【企業根拠の使い方】
{chr(10).join(usage_lines)}"""
    if requires_company_rag or company_grounding == "required":
        return """
【企業根拠なし】
- 推測で企業固有情報を書かない
- 自分の経験・関心・職種理解を軸にまとめる"""
    if company_grounding == "assistive":
        if template_type == "gakuchika":
            if grounding_mode == "none":
                return """
【企業情報は補助扱い（ガクチカ）】
- 企業固有の断定を無理に広げない
- 課題・行動・成果・学びを主軸にまとめる
- 「貴社」「貴行」等の企業敬称は使わない（企業名なし文脈では不自然になる）"""
            return """
【企業情報は補助扱い（ガクチカ）】
- 企業固有の断定を無理に広げない
- 課題・行動・成果・学びを主軸にまとめる
- 「貴社のように〜で貢献」などの企業接続を無理に入れない（自然な場合のみ短く）"""
        if grounding_mode == "none":
            return """
【企業情報は補助扱い】
- 企業固有の断定を無理に広げない
- 自分の経験・強み・価値観を主軸にまとめる
- 「貴社」「貴行」等の企業敬称は使わない（企業名なし文脈では不自然になる）"""
        return """
【企業情報は補助扱い】
- 企業固有の断定を無理に広げない
- 自分の経験・強み・価値観を主軸にまとめる
- 使うとしても fit や活かし方を短く補助する程度にとどめる"""
    return ""


# ---------------------------------------------------------------------------
# 施策 7: CAPEL-inspired self-count instruction for character length control
# ---------------------------------------------------------------------------


def _format_self_count_instruction(
    char_min: int | None,
    char_max: int | None,
    *,
    llm_model: str | None = None,
    latest_failed_length: int = 0,
) -> str:
    """Return a self-count instruction block inspired by CAPEL methodology.

    Guides the LLM to count characters during generation for better length compliance.
    This acts as a "floor raise" -- actual validation is still done by the existing
    post-validation + retry system.
    """
    if not char_min and not char_max:
        return ""

    _ = llm_model
    if char_min and char_max:
        acceptance_desc = f"{char_min}字〜{char_max}字"
        target_desc = f"{max(char_min, char_max - 5)}字前後"
        avg_target = char_max
    elif char_max:
        acceptance_desc = f"{char_max}字以内"
        target_desc = f"{char_max}字以内"
        avg_target = char_max
    elif char_min:
        acceptance_desc = f"{char_min}字以上"
        target_desc = f"{char_min}字以上"
        avg_target = char_min
    else:
        acceptance_desc = "指定範囲"
        target_desc = "指定範囲"
        avg_target = 160

    sentence_count = max(2, round(avg_target / 40))
    lines = [
        "【文字数セルフチェック】",
        f"- 必須受理帯: {acceptance_desc}",
        f"- 生成時の目安: {target_desc}",
        f"- 文量配分の目安: {sentence_count}文前後。1文ごとに結論・根拠・接続・締めの役割を持たせる",
        "- Draft → 文字数を数える → strict受理帯に収まるよう Adjust",
        "- 不足時は一般論を足さず、元回答にある行動の目的・対象・結果・学び・接続を具体化する",
    ]
    if latest_failed_length and char_min and latest_failed_length < char_min:
        lines.append(
            f"- 前回出力は{latest_failed_length}字で、最低字数まで{char_min - latest_failed_length}字不足。一般論でなく既存事実の説明密度を増やす"
        )
    elif latest_failed_length and char_max and latest_failed_length > char_max:
        lines.append(
            f"- 前回出力は{latest_failed_length}字で、上限まで{latest_failed_length - char_max}字超過。重複説明と補助論点を圧縮する"
        )
    if char_max and char_max >= 320:
        lines.append("- 長文では第1文を結論、第2〜3文を根拠経験、第4文以降を学び・企業接点・今後に割り当てる")

    return "\n" + "\n".join(lines)


def _format_short_answer_guidance(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    if not char_max or char_max > 220:
        return ""

    template_spec = get_template_spec(template_type)
    recommended_structure = dict(template_spec.get("recommended_structure") or {})
    required_dense_band = bool(recommended_structure.get("dense_short_answer")) and 150 <= char_max <= 220

    target = _format_target_char_window(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
    )
    structure = str(
        recommended_structure.get("short")
        or "1文目で結論、2文目で根拠、必要なら3文目で企業や仕事との接点を置く"
    )
    min_guard = f"- {char_min}字未満で終えない" if char_min else ""
    extra_lines: list[str] = []
    sentence_count_line = "- 3〜4文で構成する" if required_dense_band else "- 2〜3文で構成する"
    bridge_line = (
        "- 文字数が足りないときは、既にある経験・役割・企業接点のつながりを1〜2文まで補う"
        if required_dense_band
        else "- 文字数が足りないときは、既にある経験・役割・企業接点のつながりを1文だけ補う"
    )
    if required_dense_band:
        extra_lines.extend(
            [
                "- required 設問では、根拠経験だけで終わらせず、企業接点と貢献の両方を残す",
                "- 3文で足りなければ4文目で役割・学び・貢献のいずれかを言い切る",
            ]
        )
    if 160 <= char_max <= 220 and bool(recommended_structure.get("three_sentence_close_on_short_band")):
        extra_lines.extend(
            [
                "- 3文で締め、3文目で仕事や再現性につながる価値を言い切る",
                "- 2文目の具体経験を削りすぎず、根拠の一手だけは残す",
            ]
        )
    if stage == "under_min_recovery":
        extra_lines.append("- 今回は不足分を埋めるため、最後の1文まで使って target を取りにいく")
    extra_guidance = "\n" + "\n".join(extra_lines) if extra_lines else ""
    return f"""
【短字数設問の書き方】
{sentence_count_line}
- {structure}
- 目標は {target} で、短く終わらせない
{bridge_line}
- 一般論の言い換えだけで埋めず、元回答にある材料をつないで伸ばす
{min_guard}
- 文を細かく切りすぎず、各文に意味を持たせる{extra_guidance}"""


def _format_midrange_length_guidance(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    if not char_min or not char_max or char_max < 280 or char_max > 520:
        return ""

    template_spec = get_template_spec(template_type)
    recommended_structure = dict(template_spec.get("recommended_structure") or {})
    mid_structure = str(recommended_structure.get("mid") or "").strip()
    if not mid_structure:
        return ""

    stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    target = _format_target_char_window(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
    )
    guidance_lines = [
        "【300〜500字設問の組み方】",
        "- 4文前後で構成する",
        f"- {mid_structure}",
        f"- 目標は {target} で、{char_min}字未満で終えない",
        "- 説明だけの文で終わらせず、各文に役割を持たせる",
        "- 短くまとめすぎる場合は、既にある経験・職種・企業接点のつながりを1文補う",
        "- 企業接点と貢献は1文に圧縮してよく、4文固定や冗長な段階増しを避ける",
    ]
    if length_control_mode == "under_min_recovery":
        shortfall_text = f"{length_shortfall}字前後" if length_shortfall else "不足分"
        guidance_lines.extend(
            [
                "【今回の不足を埋める方針】",
                f"- 現在の不足は {shortfall_text} と見なし、一般論ではなく接続文で埋める",
                "- 新事実を足さず、経験→職種→企業理解の順で補強する",
                "- 3文以下で終わっている場合は文数を増やし、最後の文で役割や貢献を言い切る",
            ]
        )
    elif length_control_mode == "tight_length":
        guidance_lines.append("- 根拠経験と企業接点のどちらも省略せず、4文構成を保つ")
    return "\n".join(guidance_lines)


def _format_question_specific_guidance(
    template_type: str,
    question: str,
) -> str:
    normalized = (question or "").strip()
    for rule in list(get_template_spec(template_type).get("question_focus_rules") or []):
        contains_all = [str(item).strip() for item in rule.get("contains_all", []) if str(item).strip()]
        contains_any = [str(item).strip() for item in rule.get("contains_any", []) if str(item).strip()]
        if contains_all and not all(token in normalized for token in contains_all):
            continue
        if contains_any and not any(token in normalized for token in contains_any):
            continue
        title = str(rule.get("title") or "この設問で落としてはいけない要素").strip()
        items = [str(item).strip() for item in rule.get("items", []) if str(item).strip()]
        if items:
            return "\n".join([f"【{title}】", *[f"- {item}" for item in items]]).strip()
    return ""


def _format_negative_reframe_guidance(template_type: str) -> str:
    items = [
        str(item).strip()
        for item in get_template_spec(template_type).get("negative_reframe_guidance", [])
        if str(item).strip()
    ]
    if not items:
        return ""
    return "\n".join(["【自己PRで避ける表現】", *[f"- {item}" for item in items]]).strip()


def _format_required_template_playbook(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    honorific: str,
    role_name: Optional[str] = None,
    intern_name: Optional[str] = None,
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    playbook = dict(get_template_spec(template_type).get("playbook") or {})
    if not playbook:
        return ""
    if not char_max or char_max < 120:
        return ""

    template_kwargs = {
        "honorific": honorific,
        "role_name": role_name or "その職種・コース",
        "intern_name": intern_name or "そのインターン",
    }
    subject = str(playbook.get("subject") or "").format(**template_kwargs)
    opening = str(playbook.get("opening") or "").format(**template_kwargs)
    second = str(playbook.get("second") or "").format(**template_kwargs)
    third = str(playbook.get("third") or "").format(**template_kwargs)
    fourth = str(playbook.get("fourth") or "").format(**template_kwargs)
    example_good_1, example_good_2 = get_abstract_examples(template_type)
    example_bad = str(playbook.get("example_bad") or "").format(**template_kwargs)

    return f"""
【requiredテンプレの型】
- {subject}を4文前後で組み立てる
- {opening}
- {second}
- {third}
- {fourth}
- 企業接点と貢献は1文に圧縮してよく、段階を増やしすぎない

【書き出し例】
- 良い: {example_good_1}
- 良い: {example_good_2}

【避ける例】
- 悪い: {example_bad}
""".strip()


# Synthetic questions for draft generation (align with ES review template types).
DRAFT_SYNTHETIC_QUESTION_GAKUCHIKA = (
    "学生時代に力を入れたことについて、設問に答える形で具体的に述べなさい。"
)


def draft_synthetic_question_company_motivation(honorific: str) -> str:
    return f"{honorific}を志望する理由を述べなさい。"


def _draft_generation_output_contract_json(*, kind: str, char_min: Optional[int], char_max: Optional[int]) -> str:
    band = f"{char_min}〜{char_max}字" if char_min and char_max else "指定範囲の字数"
    if kind == "gakuchika":
        return f"""- 出力は有効な JSON のみ（説明文・マークダウン・コードフェンス禁止）
- キーは次のとおり:
  - "draft": ガクチカ本文（だ・である調。「です」「ます」は使わない。改行・箇条書き・空行を入れず1段落の連続した文章）
  - "followup_suggestion": 短い次アクション文言（省略可。省略時は「更に深掘りする」相当でよい）
- "draft" の文字数は厳守: {band}
- JSON 以外を出力しない"""
    if kind == "motivation":
        return f"""- 出力は有効な JSON のみ（説明文・マークダウン・コードフェンス禁止）
- キーは次のとおり:
  - "draft": 志望動機本文（だ・である調、改行・箇条書き・空行を入れず1段落の連続した文章）
  - "key_points": 本文で強調した論点の文字列配列（3件程度）
  - "company_keywords": 企業理解に使った観点の短い語の文字列配列（空可）
- "draft" の文字数は厳守: {band}
- 会話・材料にない企業固有事実・職種・数字を捏造しない
- JSON 以外を出力しない"""
    raise ValueError(f"Unknown draft JSON kind: {kind}")


# ---------------------------------------------------------------------------
# Compositor functions — wrap multiple helpers into semantic XML sections
# ---------------------------------------------------------------------------


def _format_length_section(
    *,
    template_type: str,
    char_min: int | None,
    char_max: int | None,
    stage: str,
    original_len: int,
    llm_model: str | None,
    latest_failed_length: int,
    length_control_mode: str,
    length_shortfall: int | None,
) -> str:
    parts = [
        _format_length_policy_block(
            char_min, char_max,
            stage=stage, original_len=original_len,
            llm_model=llm_model, latest_failed_len=latest_failed_length,
        ),
        _format_self_count_instruction(
            char_min, char_max,
            llm_model=llm_model, latest_failed_length=latest_failed_length,
        ),
        _format_short_answer_guidance(
            template_type, char_min, char_max,
            stage=stage, original_len=original_len, llm_model=llm_model,
        ),
        _format_midrange_length_guidance(
            template_type, char_min, char_max,
            length_control_mode=length_control_mode,
            length_shortfall=length_shortfall,
            original_len=original_len, llm_model=llm_model,
        ),
    ]
    content = "\n".join(p for p in parts if p.strip())
    if not content.strip():
        return ""
    return f"\n<length>\n{content}\n</length>"


def _format_style_section(
    *,
    template_type: str,
    char_max: int | None,
    grounding_mode: str,
) -> str:
    parts = [
        f"<core_style>\n{_build_contextual_rules(template_type, char_max, grounding_mode)}\n</core_style>",
        _format_prose_style_block(char_max),
        _format_anti_ai_phrase_block(),
        _format_gakuchika_bias_guard(template_type),
    ]
    content = "\n".join(p for p in parts if p.strip())
    return f"\n<style>\n{content}\n</style>"


def _format_template_section(
    *,
    template_def: TemplateDef,
    template_type: str,
    char_min: int | None,
    char_max: int | None,
    honorific: str,
    role_name: str | None,
    intern_name: str | None,
    original_len: int,
    llm_model: str | None,
    include_template_focus: bool,
    student_expressions: list[str] | None = None,
) -> str:
    parts: list[str] = []
    if include_template_focus:
        parts.append(f"<template_focus>\n{template_def['description']}\n</template_focus>")
    parts.append(_format_template_required_elements(template_spec=template_def))
    parts.append(_format_template_evaluation_rubric(template_spec=template_def))
    parts.append(_format_structure_template(template_type, char_max))
    parts.append(format_template_guidance(template_type))
    parts.append(_format_template_anti_patterns(template_spec=template_def))
    parts.append(_format_gakuchika_allocation_guide(template_type, char_min, char_max))
    parts.append(_format_gakuchika_student_expressions(template_type, student_expressions))
    parts.append(_format_gakuchika_fact_and_pii_rules(template_type))
    parts.append(_format_required_template_playbook(
        template_type, char_min, char_max,
        honorific=honorific, role_name=role_name, intern_name=intern_name,
        original_len=original_len, llm_model=llm_model,
    ))
    content = "\n".join(p for p in parts if p.strip())
    if not content.strip():
        return ""
    return f"\n<template>\n{content}\n</template>"


def _format_company_section(
    *,
    template_type: str,
    template_def: TemplateDef,
    company_evidence_cards: list[dict] | None,
    has_rag: bool,
    grounding_mode: str,
    effective_company_grounding: str,
    effective_grounding_level: str,
    generic_role_mode: bool,
    evidence_coverage_level: str,
    company_name: str | None,
    intern_name: str | None,
    role_name: str | None,
) -> str:
    parts = [
        _format_assistive_grounding_block(
            effective_company_grounding=effective_company_grounding,
            grounding_mode=grounding_mode,
            company_name=company_name,
        ),
        _format_deep_grounding_requirements(
            effective_grounding_level=effective_grounding_level,
            company_evidence_cards=company_evidence_cards,
        ),
        _format_proper_noun_policy(
            template_type=template_type,
            intern_name=intern_name,
            role_name=role_name,
        ),
        _format_company_guidance(
            company_evidence_cards=company_evidence_cards,
            has_rag=has_rag,
            grounding_mode=grounding_mode,
            requires_company_rag=bool(template_def.get("requires_company_rag")),
            company_grounding=effective_company_grounding,
            generic_role_mode=generic_role_mode,
            evidence_coverage_level=evidence_coverage_level,
            template_type=template_type,
        ),
    ]
    content = "\n".join(p for p in parts if p.strip())
    if not content.strip():
        return ""
    return f"\n<company>\n{content}\n</company>"


def _format_context_section(
    *,
    reference_quality_block: str,
    allowed_user_facts: list[dict] | None,
    template_type: str,
    char_max: int | None,
) -> str:
    parts = [
        _format_reference_quality_guidance(reference_quality_block),
        _format_user_fact_guidance(allowed_user_facts, template_type=template_type, char_max=char_max),
    ]
    content = "\n".join(p for p in parts if p.strip())
    if not content.strip():
        return ""
    return f"\n<context>\n{content}\n</context>"


def _format_retry_section(
    *,
    focus_mode: str,
    focus_modes: list[str] | None,
    focus_mode_context: FocusModeContext | None,
    template_type: str,
    question: str,
    retry_items: list[str],
) -> str:
    parts = [
        _format_focus_mode_guidance(focus_modes or focus_mode, context=focus_mode_context),
        _format_question_specific_guidance(template_type, question),
        _format_negative_reframe_guidance(template_type),
    ]
    if retry_items:
        parts.append(
            "【前回失敗の回避】\n" + "\n".join(f"- {item}" for item in retry_items)
        )
    content = "\n".join(p for p in parts if p.strip())
    if not content.strip():
        return ""
    return f"\n<retry>\n{content}\n</retry>"


# ---------------------------------------------------------------------------
# RewriteStrategy — unified standard / fallback rewrite configuration
# ---------------------------------------------------------------------------


class RewriteStrategy(str, Enum):
    STANDARD = "standard"
    FALLBACK = "fallback"


@dataclass(frozen=True)
class _StrategyConfig:
    role: str
    task: str
    absolute_preamble: str
    core_closing: str
    user_prompt_suffix: str
    include_template_focus: bool
    pass_focus_mode_context: bool
    company_abstraction_fallback: str
    output_contract_extra: str


def _resolve_strategy_config(
    strategy: RewriteStrategy,
    template_role: str,
    char_condition: str,
) -> _StrategyConfig:
    if strategy == RewriteStrategy.FALLBACK:
        return _StrategyConfig(
            role="日本語のES編集者",
            task="元回答の事実を保ったまま、提出できる本文に安全に整える。",
            absolute_preamble=(
                "- 具体的事実は元回答とユーザー事実の範囲から出す\n"
                "- 足りない情報は創作せず、一般化してつなぐ"
            ),
            core_closing="",
            user_prompt_suffix="元の具体的事実を極力保ちつつ、構成だけを整えた安全な改善案本文を1件だけ返してください。",
            include_template_focus=False,
            pass_focus_mode_context=False,
            company_abstraction_fallback="固有施策、社内体制、数値、成果を新しく断定しない",
            output_contract_extra=f"\n- {char_condition}",
        )
    return _StrategyConfig(
        role=template_role,
        task="提出できる改善案本文を1件だけ作る。",
        absolute_preamble=(
            "- 元回答の具体的事実は保ち、構成と伝わり方を改善する\n"
            "- ユーザー事実にない経験・役割・成果・数字を足さない"
        ),
        core_closing="- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない",
        user_prompt_suffix="この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。",
        include_template_focus=True,
        pass_focus_mode_context=True,
        company_abstraction_fallback="企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない",
        output_contract_extra="",
    )


# ---------------------------------------------------------------------------
# Draft generation prompt builder
# ---------------------------------------------------------------------------


def build_template_draft_generation_prompt(
    template_type: str,
    *,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    char_min: Optional[int],
    char_max: Optional[int],
    primary_material_heading: str,
    primary_material_body: str,
    company_reference_heading: Optional[str] = None,
    company_reference_body: Optional[str] = None,
    output_json_kind: str,
    role_name: Optional[str] = None,
    company_evidence_cards: Optional[list[dict]] = None,
    has_rag: bool = False,
    grounding_mode: str = "none",
    llm_model: Optional[str] = None,
    reference_quality_block: str = "",
    evidence_coverage_level: str = "none",
    student_expressions: Optional[list[str]] = None,
) -> tuple[str, str]:
    """Build system+user prompts for one-shot ES draft generation using TEMPLATE_DEFS (same source as ES review).

    Company context for motivation should appear in ``company_reference_body`` when RAG evidence cards are empty.
    """
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    if output_json_kind not in {"gakuchika", "motivation"}:
        raise ValueError(f"output_json_kind must be gakuchika or motivation, got {output_json_kind}")

    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    honorific = get_company_honorific(industry)
    if grounding_mode == "none":
        company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
    else:
        company_mention_rule = f"本文で企業に言及するときは企業名ではなく「{honorific}」を使う（ガクチカで企業に触れない場合は省略してよい）"
    original_len = 0
    target_stage = "default"

    effective_grounding_level = get_template_default_grounding_level(template_type)
    effective_company_grounding = grounding_level_to_policy(effective_grounding_level)

    system_prompt = f"""あなたは{template_role}である。

<task>
会話・与えられた材料のみを根拠に、提出用のES本文を新規に書く。
材料に書かれていない経験・役割・成果・数字・企業固有情報を捏造・推測で足さない。
企業や職種について材料にない断定をしない。
</task>

<output_contract>
{_draft_generation_output_contract_json(kind=output_json_kind, char_min=char_min, char_max=char_max)}
</output_contract>

<constraints>
- 設問に正面から答える
- だ・である調で統一（です・ますは使わない）
- {company_mention_rule}
- 設問の冒頭表現をそのまま繰り返して始めない
- 末尾で同じ文末表現を2文連続で使わない
- 最終文は具体的な行動・成果・貢献イメージで締め、抽象意気込みの羅列にしない
{_format_reference_copy_safety_rules()}
</constraints>

{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}
{_format_style_section(
    template_type=template_type,
    char_max=char_max,
    grounding_mode=grounding_mode,
)}
{_format_template_section(
    template_def=template_def,
    template_type=template_type,
    char_min=char_min,
    char_max=char_max,
    honorific=honorific,
    role_name=role_name,
    intern_name=None,
    original_len=original_len,
    llm_model=llm_model,
    include_template_focus=True,
    student_expressions=student_expressions,
)}
{_format_focus_mode_guidance("normal")}
{_format_short_answer_guidance(template_type, char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode="default",
    length_shortfall=None,
    original_len=original_len,
    llm_model=llm_model,
)}
{_format_question_specific_guidance(template_type, question)}
{_format_negative_reframe_guidance(template_type)}
{_format_company_section(
    template_type=template_type,
    template_def=template_def,
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    effective_company_grounding=effective_company_grounding,
    effective_grounding_level=effective_grounding_level,
    generic_role_mode=False,
    evidence_coverage_level=evidence_coverage_level,
    company_name=company_name,
    intern_name=None,
    role_name=role_name,
)}
{_format_context_section(
    reference_quality_block=reference_quality_block,
    allowed_user_facts=None,
    template_type=template_type,
    char_max=char_max,
)}
"""

    meta_lines = [f"【設問】\n{question.strip()}"]
    if company_name:
        meta_lines.append(f"【企業名】\n{company_name}")
    if industry:
        meta_lines.append(f"【業界】\n{industry}")
    if role_name:
        meta_lines.append(f"【志望職種・コース】\n{role_name.strip()}")
    meta_lines.append(f"【字数】\n{_format_char_condition(char_min, char_max)}")

    blocks: list[str] = ["\n\n".join(meta_lines), f"{primary_material_heading}\n{primary_material_body.strip()}"]
    if company_reference_body and str(company_reference_body).strip():
        heading = company_reference_heading or "【企業参考情報（要約）】"
        blocks.append(f"{heading}\n{company_reference_body.strip()}")

    user_prompt = "\n\n".join(blocks) + "\n\n上記のみを根拠にJSONを出力してください。"

    return system_prompt.strip(), user_prompt


# ---------------------------------------------------------------------------
# Rewrite prompt builder (unified standard + fallback via RewriteStrategy)
# ---------------------------------------------------------------------------


def build_template_rewrite_prompt(
    template_type: str,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    answer: str,
    char_min: Optional[int],
    char_max: Optional[int],
    company_evidence_cards: Optional[list[dict]],
    has_rag: bool,
    allowed_user_facts: Optional[list[dict]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    retry_hints: Optional[list[str]] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
    focus_mode: str = "normal",
    focus_modes: Optional[list[str]] = None,
    company_grounding_override: Optional[str] = None,
    grounding_level_override: Optional[str] = None,
    llm_model: Optional[str] = None,
    latest_failed_length: int = 0,
    focus_mode_context: FocusModeContext | None = None,
    template_spec_override: TemplateDef | None = None,
    strategy: RewriteStrategy = RewriteStrategy.STANDARD,
) -> tuple[str, str]:
    template_def = template_spec_override or TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    honorific = get_company_honorific(industry)
    original_len = len(answer or "")

    config = _resolve_strategy_config(
        strategy,
        template_role,
        _format_char_condition(char_min, char_max),
    )

    if strategy == RewriteStrategy.FALLBACK:
        conditions = [f"設問: {question}", f"文字数: {_format_char_condition(char_min, char_max)}"]
        if company_name:
            conditions.append(f"企業: {company_name}")
        if industry:
            conditions.append(f"業界: {industry}")
        if intern_name:
            conditions.append(f"インターン名: {intern_name}")
        if role_name:
            conditions.append(f"職種・コース名: {role_name}")
    else:
        conditions = [f"設問: {question}"]
        if company_name:
            conditions.append(f"企業: {company_name}")
        if industry:
            conditions.append(f"業界: {industry}")
        if intern_name:
            conditions.append(f"インターン名: {intern_name}")
        if role_name:
            conditions.append(f"職種・コース名: {role_name}")
        conditions.append(f"文字数: {_format_char_condition(char_min, char_max)}")

    retry_items = _dedupe_text_items(list(retry_hints or ([] if not retry_hint else [retry_hint])))
    effective_grounding_level = grounding_level_override or get_template_default_grounding_level(
        template_type
    )
    effective_company_grounding = company_grounding_override or grounding_level_to_policy(
        effective_grounding_level
    )
    if grounding_mode == "none":
        company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
    elif effective_company_grounding == "assistive":
        company_mention_rule = f"企業に言及するときは「{honorific}」を使う。本文全体で2回までにとどめる"
    else:
        company_mention_rule = f"企業名は本文中で1回までにとどめ、2回目以降は「{honorific}」を使う"
    if effective_grounding_level == "deep":
        company_specificity_rule = "- 企業根拠カード由来の固有候補だけを1軸で使い、カード外の固有名詞・施策・数値は足さない"
        company_abstraction_rule = "- 固有候補を羅列せず、自分の経験・強み・学びとの接続文として使う"
    else:
        company_specificity_rule = f"- {config.company_abstraction_fallback}"
        company_abstraction_rule = "- 本文で企業に触れるときは、方向性・価値観・重視姿勢に抽象化する"
    target_stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"

    core_closing_line = f"\n{config.core_closing}" if config.core_closing else ""

    focus_mode_context_arg = focus_mode_context if config.pass_focus_mode_context else None

    system_prompt = f"""あなたは{config.role}である。

<role_task>
{config.task}
</role_task>

<output_contract>
- 出力は改善案本文のみ。1文字目から本文を書き始める
- 説明、前置き、後書き、箇条書き、引用符、JSON、コードブロックは禁止
- 「以下が改善案です」等のメタ説明は禁止
- だ・である調で統一（「です」「ます」は1箇所も使わない）
- 改行・空行を入れず、1段落の連続した文章として出力する{config.output_contract_extra}
</output_contract>

<constraints priority="absolute">
{config.absolute_preamble}
{_format_fact_preservation_rules()}
- だ・である調で統一する
{_format_reference_copy_safety_rules()}
</constraints>

<constraints priority="core">
- 設問に正面から答える
- 結論ファーストで書き、読み手に伝えたいことを明確にする{core_closing_line}
- 冗長な接続詞で文字数を浪費しない
- role_name があっても別職種や別コースを仮定しない{_format_rewrite_closing_guidance(template_def)}
</constraints>

<constraints priority="target">
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
{company_specificity_rule}
{company_abstraction_rule}
- {company_mention_rule}
</constraints>
{_format_length_section(
    template_type=template_type,
    char_min=char_min,
    char_max=char_max,
    stage=target_stage,
    original_len=original_len,
    llm_model=llm_model,
    latest_failed_length=latest_failed_length,
    length_control_mode=length_control_mode,
    length_shortfall=length_shortfall,
)}
{_format_style_section(
    template_type=template_type,
    char_max=char_max,
    grounding_mode=grounding_mode,
)}
{_format_template_section(
    template_def=template_def,
    template_type=template_type,
    char_min=char_min,
    char_max=char_max,
    honorific=honorific,
    role_name=role_name,
    intern_name=intern_name,
    original_len=original_len,
    llm_model=llm_model,
    include_template_focus=config.include_template_focus,
)}
{_format_company_section(
    template_type=template_type,
    template_def=template_def,
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    effective_company_grounding=effective_company_grounding,
    effective_grounding_level=effective_grounding_level,
    generic_role_mode=generic_role_mode,
    evidence_coverage_level=evidence_coverage_level,
    company_name=company_name,
    intern_name=intern_name,
    role_name=role_name,
)}
{_format_context_section(
    reference_quality_block=reference_quality_block,
    allowed_user_facts=allowed_user_facts,
    template_type=template_type,
    char_max=char_max,
)}
{_format_retry_section(
    focus_mode=focus_mode,
    focus_modes=focus_modes,
    focus_mode_context=focus_mode_context_arg,
    template_type=template_type,
    question=question,
    retry_items=retry_items,
)}
"""

    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}

{config.user_prompt_suffix}"""

    return system_prompt, user_prompt


def build_template_fallback_rewrite_prompt(
    template_type: str,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    answer: str,
    char_min: Optional[int],
    char_max: Optional[int],
    company_evidence_cards: Optional[list[dict]],
    has_rag: bool,
    allowed_user_facts: Optional[list[dict]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    retry_hints: Optional[list[str]] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
    focus_mode: str = "normal",
    focus_modes: Optional[list[str]] = None,
    company_grounding_override: Optional[str] = None,
    grounding_level_override: Optional[str] = None,
    llm_model: Optional[str] = None,
    latest_failed_length: int = 0,
    template_spec_override: TemplateDef | None = None,
) -> tuple[str, str]:
    return build_template_rewrite_prompt(
        template_type,
        company_name,
        industry,
        question,
        answer,
        char_min,
        char_max,
        company_evidence_cards,
        has_rag,
        allowed_user_facts=allowed_user_facts,
        intern_name=intern_name,
        role_name=role_name,
        grounding_mode=grounding_mode,
        retry_hint=retry_hint,
        retry_hints=retry_hints,
        reference_quality_block=reference_quality_block,
        generic_role_mode=generic_role_mode,
        evidence_coverage_level=evidence_coverage_level,
        length_control_mode=length_control_mode,
        length_shortfall=length_shortfall,
        focus_mode=focus_mode,
        focus_modes=focus_modes,
        company_grounding_override=company_grounding_override,
        grounding_level_override=grounding_level_override,
        llm_model=llm_model,
        latest_failed_length=latest_failed_length,
        template_spec_override=template_spec_override,
        strategy=RewriteStrategy.FALLBACK,
    )
