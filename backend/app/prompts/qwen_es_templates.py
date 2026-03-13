"""Qwen-specific ES template prompts.

These prompts intentionally stay shorter and more prescriptive than the Claude
path so Qwen short-answer generations remain on-task.
"""

from __future__ import annotations

from typing import Any, Optional

from app.prompts.es_templates import (
    TEMPLATE_DEFS,
    TEMPLATE_ROLES,
    _format_char_condition,
    _format_target_char_window,
    get_template_company_grounding_policy,
)
from app.prompts.reference_es import QUESTION_TYPE_QUALITY_HINTS, QUESTION_TYPE_SKELETONS


QWEN_SHORT_ANSWER_STRUCTURE = {
    "intern_reason": "1文目で参加理由、2文目で根拠経験、必要なら3文目でこのインターンで得たいことを置く",
    "intern_goals": "1文目で学びたいこと、2文目で根拠経験、必要なら3文目でその学びの使い道を置く",
    "role_course_reason": "1文目でその職種・コースを選ぶ理由、2文目で根拠経験、必要なら3文目で企業接点を置く",
    "company_motivation": "1文目でなぜこの会社か、2文目で根拠経験、必要なら3文目で入社後の貢献を置く",
    "post_join_goals": "1文目で入社後にやりたいこと、2文目で根拠経験を短く、必要なら3文目で獲得したい力を置く",
}


def _format_qwen_user_facts(allowed_user_facts: Optional[list[dict[str, Any]]]) -> str:
    if not allowed_user_facts:
        return ""
    lines = []
    for fact in allowed_user_facts:
        text = str(fact.get("text") or "").strip()
        source = str(fact.get("source") or "").strip()
        if text:
            lines.append(f"- [{source or 'fact'}] {text}")
    if not lines:
        return ""
    return "【使ってよいユーザー事実】\n" + "\n".join(lines)


def _format_qwen_reference_guidance(
    template_type: str,
    *,
    reference_quality_block: str,
    char_max: Optional[int],
) -> str:
    if not reference_quality_block or (char_max is not None and char_max <= 220):
        return ""
    hints = QUESTION_TYPE_QUALITY_HINTS.get(template_type, QUESTION_TYPE_QUALITY_HINTS["basic"])[:2]
    skeleton = QUESTION_TYPE_SKELETONS.get(template_type, QUESTION_TYPE_SKELETONS["basic"])[:3]
    hint_lines = "\n".join(f"- {item}" for item in hints)
    skeleton_lines = "\n".join(f"- {item}" for item in skeleton)
    return f"""【参考ESの使い方】
- 本文や言い回しは借りない
- 使うのは論点配置のヒントだけ

【品質ヒント】
{hint_lines}

【骨子の目安】
{skeleton_lines}"""


def _format_qwen_company_guidance(
    *,
    template_type: str,
    company_evidence_cards: Optional[list[dict[str, Any]]],
    company_name: Optional[str],
    grounding_mode: str,
) -> str:
    cards = company_evidence_cards or []
    company_grounding = get_template_company_grounding_policy(template_type)
    if not cards:
        if company_grounding == "required":
            return """【企業情報】
- 推測で固有施策を書かない
- 企業理解は方向性・価値観・事業理解レベルに一般化する"""
        return """【企業情報】
- 企業情報は補助扱い
- 無理に企業接続を増やさず、自分の経験と強みを主軸にする"""

    lines = []
    for card in cards[:2]:
        theme = str(card.get("theme") or "").strip()
        claim = str(card.get("claim") or "").strip()
        if theme and claim:
            lines.append(f"- {theme}: {claim}")
    card_block = "\n".join(lines) if lines else "- 企業根拠は補助情報として扱う"

    if company_grounding == "required":
        return f"""【企業根拠】
{card_block}
- {company_name or '企業'}との接点は1〜2軸に絞る
- 根拠カードの固有名詞や文面をそのまま増殖させない
- 抽象化して自分の将来像や貢献につなぐ
- grounding mode は {grounding_mode}"""

    return f"""【企業根拠は補助のみ】
{card_block}
- 本文の主軸は自分の経験・強み・価値観に置く
- 企業情報は fit や活かし方を短く補助する程度にとどめる
- 固有施策や断定的な社内事情は書かない"""


def _format_qwen_short_answer_guidance(
    template_type: str,
    *,
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    if not char_max or char_max > 220:
        return ""
    structure = QWEN_SHORT_ANSWER_STRUCTURE.get(
        template_type,
        "1文目で結論、2文目で根拠、必要なら3文目で会社や仕事との接点を置く",
    )
    target = _format_target_char_window(char_min, char_max)
    return f"""【短字数優先】
- 2〜3文で書く
- {structure}
- 1文目で設問への答えを言い切る
- 過去経験は根拠として短く1節だけ使う
- 数字、人数、期間、手順説明を長く書かない
- 設問の主軸に本文の大半を使う
- 目標は {target}"""


def _format_qwen_template_focus(
    template_type: str,
    *,
    company_name: Optional[str],
    role_name: Optional[str],
    intern_name: Optional[str],
) -> str:
    if template_type == "post_join_goals":
        return (
            "- 入社後にやりたいこと、獲得したい経験・スキル、将来どう価値を出すかを中心に書く\n"
            "- 過去経験の詳細説明を本文の中心にしない"
        )
    if template_type == "company_motivation":
        return f"- 1文目でなぜ{company_name or 'この会社'}かを言い切る\n- 汎用的な就活軸だけで終わらせない"
    if template_type == "role_course_reason":
        return f"- 1文目でなぜ{role_name or 'その職種・コース'}かを言い切る\n- 役割理解を外さない"
    if template_type == "intern_goals":
        return f"- 1文目で{intern_name or 'インターン'}で学びたいことを言い切る\n- 参加後の成長イメージまでつなぐ"
    if template_type == "intern_reason":
        return f"- 1文目で{intern_name or 'インターン'}に参加したい理由を言い切る\n- 受け身ではなく主体的な目的を書く"
    if template_type == "self_pr":
        return "- 1文目で強みを示し、後半で仕事での活かし方につなぐ"
    if template_type == "gakuchika":
        return "- 課題・行動・成果・学びを省略しない\n- 企業接続は補助的に短く置く"
    return "- 設問に正面から答える"


def build_qwen_template_improvement_prompt(
    template_type: str,
    question: str,
    original_answer: str,
    company_name: Optional[str],
    company_evidence_cards: Optional[list[dict[str, Any]]],
    has_rag: bool,
    char_min: Optional[int],
    char_max: Optional[int],
    allowed_user_facts: Optional[list[dict[str, Any]]] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
) -> tuple[str, str]:
    del has_rag, generic_role_mode, evidence_coverage_level
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    system_prompt = f"""あなたは{template_role}である。
目的は、元回答の不足だけを改善ポイントとして最大3件返すこと。

【最重要】
- 改善案本文は書かない
- JSONだけを返す
- 各要素は category / issue / suggestion のみ
- category は12文字以内
- issue と suggestion は各60文字以内
- 改行、箇条書き、前置き、コードブロックは禁止
- 元回答やユーザー事実にない経験・役割・成果・数字を前提にしない
- 企業情報は必要なときだけ補助的に見る
- 文字数条件を無視した長い提案を書かない

【設問タイプ】
{template_def["description"]}

【この設問で見るべき点】
{_format_qwen_template_focus(template_type, company_name=company_name, role_name=role_name, intern_name=None)}
{_format_qwen_short_answer_guidance(template_type, char_min=char_min, char_max=char_max)}
{_format_qwen_company_guidance(
    template_type=template_type,
    company_evidence_cards=company_evidence_cards,
    company_name=company_name,
    grounding_mode=grounding_mode,
)}
{_format_qwen_reference_guidance(
    template_type,
    reference_quality_block=reference_quality_block,
    char_max=char_max,
)}
{_format_qwen_user_facts(allowed_user_facts)}
"""

    user_prompt = f"""【設問】
{question}

【元の回答】
{original_answer}

【企業】
{company_name or "未指定"}

【職種・コース】
{role_name or "未指定"}

【文字数条件】
{_format_char_condition(char_min, char_max)}

【grounding mode】
{grounding_mode}

次の形式のJSONだけを返してください。
{{
  "top3": [
    {{
      "category": "評価軸",
      "issue": "不足している点",
      "suggestion": "直し方"
    }}
  ]
}}"""
    return system_prompt, user_prompt


def build_qwen_template_rewrite_prompt(
    template_type: str,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    answer: str,
    char_min: Optional[int],
    char_max: Optional[int],
    company_evidence_cards: Optional[list[dict[str, Any]]],
    has_rag: bool,
    improvement_points: Optional[list[dict[str, Any]]] = None,
    allowed_user_facts: Optional[list[dict[str, Any]]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
) -> tuple[str, str]:
    del has_rag, generic_role_mode, evidence_coverage_level
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    conditions = [f"設問: {question}", f"文字数: {_format_char_condition(char_min, char_max)}"]
    if company_name:
        conditions.append(f"企業: {company_name}")
    if industry:
        conditions.append(f"業界: {industry}")
    if intern_name:
        conditions.append(f"インターン名: {intern_name}")
    if role_name:
        conditions.append(f"職種・コース名: {role_name}")

    issue_lines = []
    for index, item in enumerate(improvement_points or [], 1):
        issue = str(item.get("issue") or "").strip()
        suggestion = str(item.get("suggestion") or "").strip()
        if issue or suggestion:
            issue_lines.append(f"{index}. {issue or '不足あり'} / {suggestion or '改善する'}")
    issue_block = "\n".join(issue_lines)
    retry_block = f"\n【再試行で必ず直す点】\n- {retry_hint}" if retry_hint else ""

    system_prompt = f"""あなたは{template_role}である。
目的は、提出できる改善案本文を1件だけ返すこと。

【最重要】
- 出力は本文のみ
- だ・である調
- 前置き、説明、箇条書き、引用符、JSON、コードブロックは禁止
- 1文目で設問への答えを言い切る
- 設問の主軸を本文の中心に置く
- 過去経験は根拠として短く1節だけ使う
- 数字、人数、期間、手順説明を長く書かない
- 改善ポイントの断片をそのまま並べない
- 元回答やユーザー事実にない経験・役割・成果・数字を足さない
- 企業情報は必要な分だけ使い、固有名詞や施策名をそのまま増殖させない
- 文字数条件は {_format_char_condition(char_min, char_max)}
- 目標は {_format_target_char_window(char_min, char_max)}

【設問タイプ】
{template_def["description"]}

【この設問で外してはいけない焦点】
{_format_qwen_template_focus(template_type, company_name=company_name, role_name=role_name, intern_name=intern_name)}
{_format_qwen_short_answer_guidance(template_type, char_min=char_min, char_max=char_max)}
{_format_qwen_company_guidance(
    template_type=template_type,
    company_evidence_cards=company_evidence_cards,
    company_name=company_name,
    grounding_mode=grounding_mode,
)}
{_format_qwen_reference_guidance(
    template_type,
    reference_quality_block=reference_quality_block,
    char_max=char_max,
)}
{_format_qwen_user_facts(allowed_user_facts)}
{retry_block}
"""

    improvement_block = (
        f"\n【改善ポイント】\n{issue_block}\n- 上記は本文に自然に吸収する"
        if issue_block
        else ""
    )
    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}{improvement_block}

改善案本文だけを返してください。"""
    return system_prompt, user_prompt


def build_qwen_template_fallback_rewrite_prompt(
    template_type: str,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    answer: str,
    char_min: Optional[int],
    char_max: Optional[int],
    company_evidence_cards: Optional[list[dict[str, Any]]],
    has_rag: bool,
    improvement_points: Optional[list[dict[str, Any]]] = None,
    allowed_user_facts: Optional[list[dict[str, Any]]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
) -> tuple[str, str]:
    del has_rag, generic_role_mode, evidence_coverage_level
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    conditions = [f"設問: {question}", f"文字数: {_format_char_condition(char_min, char_max)}"]
    if company_name:
        conditions.append(f"企業: {company_name}")
    if industry:
        conditions.append(f"業界: {industry}")
    if intern_name:
        conditions.append(f"インターン名: {intern_name}")
    if role_name:
        conditions.append(f"職種・コース名: {role_name}")

    issue_lines = []
    for index, item in enumerate(improvement_points or [], 1):
        issue = str(item.get("issue") or "").strip()
        suggestion = str(item.get("suggestion") or "").strip()
        if issue or suggestion:
            issue_lines.append(f"{index}. {issue or '不足あり'} / {suggestion or '改善する'}")

    retry_block = f"\n【再試行で必ず直す点】\n- {retry_hint}" if retry_hint else ""
    system_prompt = f"""あなたは日本語のES編集者である。
目的は、元回答の事実を保ったまま、提出できる本文に安全に整えること。

【最重要】
- 出力は本文のみ
- だ・である調
- 設問に正面から答える
- 過去経験は根拠として短く1節だけ使う
- 足りない情報は創作せず、一般化してつなぐ
- 数字、人数、期間、手順説明を長く書かない
- 企業情報は必要最小限だけ使う
- 文字数条件は {_format_char_condition(char_min, char_max)}
- 目標は {_format_target_char_window(char_min, char_max)}

【設問タイプ】
{template_def["description"]}

【外してはいけない焦点】
{_format_qwen_template_focus(template_type, company_name=company_name, role_name=role_name, intern_name=intern_name)}
{_format_qwen_short_answer_guidance(template_type, char_min=char_min, char_max=char_max)}
{_format_qwen_company_guidance(
    template_type=template_type,
    company_evidence_cards=company_evidence_cards,
    company_name=company_name,
    grounding_mode=grounding_mode,
)}
{_format_qwen_reference_guidance(
    template_type,
    reference_quality_block=reference_quality_block,
    char_max=char_max,
)}
{_format_qwen_user_facts(allowed_user_facts)}
{retry_block}
"""

    issue_block = f"\n【最低限反映する改善点】\n{chr(10).join(issue_lines)}" if issue_lines else ""
    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}{issue_block}

短く、自然で、提出できる改善案本文を1件だけ返してください。"""
    return system_prompt, user_prompt


def build_qwen_template_length_fix_prompt(
    template_type: str,
    current_text: str,
    char_min: Optional[int],
    char_max: Optional[int],
    fix_mode: str,
) -> tuple[str, str]:
    system_prompt = f"""あなたは日本語のES編集者である。
目的は、本文の意味と事実を変えずに、文字数だけを整えること。

【最重要】
- 出力は本文のみ
- だ・である調
- 意味、事実、主張の順序を大きく変えない
- 新しい経験・数字・固有名詞を足さない
- 箇条書き、説明、前置きは禁止
- 条件は {_format_char_condition(char_min, char_max)}
- {fix_mode} を直すことだけに集中する"""

    user_prompt = f"""【現在の本文】
{current_text}

意味を変えず、文字数だけを整えた本文を返してください。"""
    return system_prompt, user_prompt
