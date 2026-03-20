"""
ES Template Definitions and Prompt Builder

Template-based ES review with company RAG source integration.
Each template specifies:
- requires_company_rag: Whether company RAG data is required
- company_grounding: How deeply company grounding should be used
- extra_fields: Additional fields required for this template (intern_name, role_name)
"""

from typing import Optional

_GLOBAL_CONCLUSION_FIRST_RULES = """【結論ファースト（全設問・全文字数）】
- 1文目は設問への答えを結論として短く言い切る（設問文の言い換えや背景説明から入らない）
- 各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない
- 企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない"""


def get_company_honorific(industry: str | None) -> str:
    """Return the appropriate honorific for a company based on its industry.

    銀行→貴行, 信用金庫→貴庫, 事務所→貴所, 学校/大学→貴校, 病院→貴院, その他→貴社
    """
    if not industry:
        return "貴社"
    if "信用金庫" in industry:
        return "貴庫"
    if "銀行" in industry:
        return "貴行"
    if "事務所" in industry:
        return "貴所"
    if "学校" in industry or "大学" in industry:
        return "貴校"
    if "病院" in industry:
        return "貴院"
    return "貴社"


# Template definitions
TEMPLATE_DEFS = {
    "basic": {
        "label": "汎用ES添削",
        "requires_company_rag": False,
        "company_grounding": "assistive",
        "description": "設問への適合性、企業理解、自己アピール、論理性を総合的に評価。",
    },
    "company_motivation": {
        "label": "企業志望理由",
        "requires_company_rag": True,
        "company_grounding": "required",
        "description": "企業への志望理由を述べる設問。企業の特徴・事業・価値観との接点を示す。",
    },
    "intern_reason": {
        "label": "インターン志望理由",
        "requires_company_rag": True,
        "company_grounding": "required",
        "description": "インターンへの参加理由を述べる設問。参加目的と自己成長の接点を示す。",
        "extra_fields": ["intern_name"],
    },
    "intern_goals": {
        "label": "インターンでやりたいこと・学びたいこと",
        "requires_company_rag": True,
        "company_grounding": "required",
        "description": "インターンで達成したい目標や学びたいことを述べる設問。",
        "extra_fields": ["intern_name"],
    },
    "gakuchika": {
        "label": "ガクチカ",
        "requires_company_rag": False,
        "company_grounding": "assistive",
        "description": "学生時代に力を入れたことを述べる設問。STAR形式で具体的に。",
    },
    "self_pr": {
        "label": "自己PR",
        "requires_company_rag": False,
        "company_grounding": "assistive",
        "description": "強み、その根拠となる経験、企業や職種での活かし方を述べる設問。",
    },
    "post_join_goals": {
        "label": "入社後やりたいこと",
        "requires_company_rag": True,
        "company_grounding": "required",
        "description": "入社後のキャリアビジョンや挑戦したいことを述べる設問。",
    },
    "role_course_reason": {
        "label": "職種・コース選択理由",
        "requires_company_rag": True,
        "company_grounding": "required",
        "description": "特定の職種やコースを選んだ理由を述べる設問。",
        "extra_fields": ["role_name"],
    },
    "work_values": {
        "label": "働くうえで大切にしている価値観",
        "requires_company_rag": False,
        "company_grounding": "assistive",
        "description": "仕事に対する価値観や姿勢を述べる設問。",
    },
}

TEMPLATE_RAG_PROFILES = {
    "basic": {
        "profile_name": "es_light",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.82,
            "keyword_weight": 0.18,
            "fetch_k": 16,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.82,
            "mmr_lambda": 0.62,
            "use_hyde": False,
        },
    },
    "company_motivation": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.68,
            "keyword_weight": 0.32,
            "fetch_k": 24,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.66,
            "mmr_lambda": 0.48,
            "use_hyde": False,
        },
    },
    "intern_reason": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.7,
            "keyword_weight": 0.3,
            "fetch_k": 22,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.67,
            "mmr_lambda": 0.5,
            "use_hyde": False,
        },
    },
    "intern_goals": {
        "profile_name": "es_company_focus",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.68,
            "keyword_weight": 0.32,
            "fetch_k": 22,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.66,
            "mmr_lambda": 0.48,
            "use_hyde": False,
        },
    },
    "gakuchika": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.86,
            "keyword_weight": 0.14,
            "fetch_k": 12,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.84,
            "mmr_lambda": 0.7,
            "use_hyde": False,
        },
    },
    "self_pr": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.86,
            "keyword_weight": 0.14,
            "fetch_k": 12,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.84,
            "mmr_lambda": 0.7,
            "use_hyde": False,
        },
    },
    "post_join_goals": {
        "profile_name": "es_company_future",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.66,
            "keyword_weight": 0.34,
            "fetch_k": 26,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.65,
            "mmr_lambda": 0.46,
            "use_hyde": True,
        },
    },
    "role_course_reason": {
        "profile_name": "es_role_fit",
        "expand_queries": True,
        "rerank": True,
        "use_bm25": True,
        "profile_overrides": {
            "semantic_weight": 0.7,
            "keyword_weight": 0.3,
            "fetch_k": 24,
            "max_queries": 1,
            "max_total_queries": 2,
            "rerank_threshold": 0.64,
            "mmr_lambda": 0.46,
            "use_hyde": False,
        },
    },
    "work_values": {
        "profile_name": "es_self_focus",
        "expand_queries": False,
        "rerank": False,
        "use_bm25": False,
        "profile_overrides": {
            "semantic_weight": 0.88,
            "keyword_weight": 0.12,
            "fetch_k": 10,
            "max_queries": 0,
            "max_total_queries": 1,
            "rerank_threshold": 0.86,
            "mmr_lambda": 0.72,
            "use_hyde": False,
        },
    },
}

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


def get_template_labels() -> dict[str, str]:
    """Get template type to label mapping for frontend."""
    return {k: v["label"] for k, v in TEMPLATE_DEFS.items()}


def get_template_company_grounding_policy(template_type: str) -> str:
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    return str(template_def.get("company_grounding") or "assistive")


def _format_char_condition(char_min: Optional[int], char_max: Optional[int]) -> str:
    if char_min and char_max:
        return f"{char_min}字〜{char_max}字"
    if char_max:
        return f"{char_max}字以内"
    if char_min:
        return f"{char_min}字以上"
    return "未指定"


def _format_target_char_window(char_min: Optional[int], char_max: Optional[int]) -> str:
    if not char_max:
        return _format_char_condition(char_min, char_max)

    gap = 6 if char_max <= 220 else 8
    target_low = max(char_min or 0, char_max - gap)
    target_high = max(target_low, char_max - 2)
    return f"{target_low}字〜{target_high}字"


def _format_user_fact_guidance(allowed_user_facts: Optional[list[dict]]) -> str:
    if not allowed_user_facts:
        return ""
    fact_lines = [
        f"- [{str(item.get('source', 'unknown'))}] {str(item.get('text', '')).strip()}"
        for item in allowed_user_facts
        if str(item.get("text", "")).strip()
    ]
    if not fact_lines:
        return ""
    return f"""
【使えるユーザー事実】
{chr(10).join(fact_lines)}

- 上記にない具体的な経験・役割・成果・数字は足さない
- raw material 由来の内容は、書かれている範囲を超えて解釈しない
- 情報が足りない場合は一般化して書く"""


def _format_reference_quality_guidance(reference_quality_block: str) -> str:
    if not reference_quality_block:
        return ""
    return f"\n{reference_quality_block}"


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
        card_lines = []
        for card in company_evidence_cards[:5]:
            theme = str(card.get("theme") or "").strip()
            claim = str(card.get("claim") or "").strip()
            excerpt = str(card.get("excerpt") or "").strip()
            line = " / ".join(part for part in [claim, excerpt] if part)
            if not line:
                continue
            prefix = f"[{theme}] " if theme else ""
            card_lines.append(f"- {prefix}{line}")
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
                usage_lines.extend(
                    [
                        "- 本文の主軸は課題・行動・成果・学びに置く",
                        "- 企業理解や「貴社で活かす」系の接続を義務づけない（自然に書けるときだけ最大1文、なければ省略）",
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
        else:
            usage_lines.append("- 役割理解やインターン価値が取れている card を優先する")
        if generic_role_mode:
            usage_lines.append("- broad な職種名ではなく、事業理解と得たい経験・スキルの2軸で企業理解を示す")
        if evidence_coverage_level in {"weak", "partial"} and company_grounding == "required":
            usage_lines.append("- 根拠が限定的な場合は、企業理解を1軸に絞って一般化した表現を優先する")
        elif evidence_coverage_level in {"weak", "partial"}:
            usage_lines.append("- 根拠が限定的な場合は、本文では薄く触れるか触れず、改善の方向づけだけに使う")
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
            return """
【企業情報は補助扱い（ガクチカ）】
- 企業固有の断定を無理に広げない
- 課題・行動・成果・学びを主軸にまとめる
- 「貴社のように〜で貢献」などの企業接続を無理に入れない（自然な場合のみ短く）"""
        return """
【企業情報は補助扱い】
- 企業固有の断定を無理に広げない
- 自分の経験・強み・価値観を主軸にまとめる
- 使うとしても fit や活かし方を短く補助する程度にとどめる"""
    return ""


def _format_short_answer_guidance(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
) -> str:
    if not char_max or char_max > 220:
        return ""

    target = max(0, char_max - 2)
    structure_map = {
        "intern_reason": "1文目で参加理由、2文目で根拠経験、必要なら3文目でこのインターンで得たいことを置く",
        "intern_goals": "1文目で学びたいこと、2文目で根拠経験、必要なら3文目でインターン接点を置く",
        "role_course_reason": "1文目で職種志望、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "company_motivation": "1文目で志望理由、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "post_join_goals": "1文目でやりたいこと、2文目で根拠経験、必要なら3文目で企業接点を置く",
    }
    structure = structure_map.get(
        template_type,
        "1文目で結論、2文目で根拠、必要なら3文目で企業や仕事との接点を置く",
    )
    return f"""
【短字数設問の書き方】
- 2〜3文で構成する
- {structure}
- 目標は {target}字前後で、短く終わらせない
- 文を細かく切りすぎず、各文に意味を持たせる"""


def _format_midrange_length_guidance(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
) -> str:
    if not char_min or not char_max or char_max < 300 or char_max > 500:
        return ""

    if template_type not in {
        "company_motivation",
        "intern_reason",
        "intern_goals",
        "post_join_goals",
        "role_course_reason",
    }:
        return ""

    structure_map = {
        "company_motivation": "1文目で志望理由、2文目で根拠経験、3文目で企業理解との接点、4文目で貢献イメージを置く",
        "intern_reason": "1文目で参加理由、2文目で根拠経験、3文目でインターン価値との接点、4文目で得たい学びを置く",
        "intern_goals": "1文目で学びたいこと、2文目で根拠経験、3文目でプログラム接点、4文目で成長イメージを置く",
        "post_join_goals": "1文目で入社後の目標、2文目で根拠経験、3文目で企業との接点、4文目で価値発揮の方向性を置く",
        "role_course_reason": "1文目で職種・コース志望、2文目で根拠経験、3文目で企業や事業との接点、4文目でその役割で出したい価値を置く",
    }
    target = _format_target_char_window(char_min, char_max)
    guidance_lines = [
        "【300〜500字設問の組み方】",
        "- 4文前後で構成する",
        f"- {structure_map.get(template_type, '1文目で結論、2文目で根拠、3文目で企業接点、4文目で価値発揮を置く')}",
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


def get_template_rag_profile(template_type: str) -> dict:
    return TEMPLATE_RAG_PROFILES.get(template_type, TEMPLATE_RAG_PROFILES["basic"]).copy()


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
    improvement_points: Optional[list[dict]] = None,
    allowed_user_facts: Optional[list[dict]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
    company_grounding_override: Optional[str] = None,
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    honorific = get_company_honorific(industry)

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

    improvement_guidance = ""
    if improvement_points:
        improvement_lines = []
        for index, item in enumerate(improvement_points, 1):
            issue = str(item.get("issue", "")).strip()
            suggestion = str(item.get("suggestion", "")).strip()
            required_action = str(item.get("required_action", "")).strip()
            if issue or suggestion:
                improvement_lines.append(
                    (
                        f"{index}. 問題点: {issue or '未設定'} / 改善指示: {suggestion or '未設定'}"
                        + (f" / 必須動作: {required_action}" if required_action else "")
                    )
                )
        if improvement_lines:
            improvement_guidance = f"""
【改善ポイント】
{chr(10).join(improvement_lines)}

- 上記を本文で解消する
- 改善ポイントと矛盾する内容を書かない"""

    retry_guidance = f"\n【前回失敗の回避】\n- {retry_hint}" if retry_hint else ""
    effective_company_grounding = company_grounding_override or str(
        template_def.get("company_grounding") or "assistive"
    )
    system_prompt = f"""あなたは{template_role}である。
目的は、提出できる改善案本文を1件だけ作ること。

【必須ルール】
- 出力は改善案本文のみ
- 説明、前置き、箇条書き、引用符、JSON、コードブロックは禁止
- だ・である調で統一
- 設問に正面から答える
- 元回答の具体的事実は保ち、構成と伝わり方を改善する
- ユーザー事実にない経験・役割・成果・数字を足さない
- role_name があっても別職種や別コースを仮定しない
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない
- 本文で企業に触れるときは、方向性・価値観・重視姿勢に抽象化する
- 本文で企業に言及するときは企業名ではなく「{honorific}」を使う
- 設問の冒頭表現をそのまま繰り返して始めない（例:「〇〇を志望する理由は…」「〇〇でやりたいことは…」は不可）
- 末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない
- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない
- 冗長な接続詞で文字数を浪費しない
- 文字数条件は {_format_char_condition(char_min, char_max)}
- 目標は {_format_target_char_window(char_min, char_max)} の提出用本文

{_GLOBAL_CONCLUSION_FIRST_RULES}

【設問タイプの焦点】
{template_def["description"]}
{_format_short_answer_guidance(template_type, char_min, char_max)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=length_shortfall,
)}
{_format_company_guidance(
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    requires_company_rag=bool(template_def.get("requires_company_rag")),
    company_grounding=effective_company_grounding,
    generic_role_mode=generic_role_mode,
    evidence_coverage_level=evidence_coverage_level,
    template_type=template_type,
)}
{_format_reference_quality_guidance(reference_quality_block)}
{_format_user_fact_guidance(allowed_user_facts)}
{improvement_guidance}
{retry_guidance}
"""

    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}

この回答を、提出できる改善案に書き直してください。改善案本文のみを返してください。"""

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
    improvement_points: Optional[list[dict]] = None,
    allowed_user_facts: Optional[list[dict]] = None,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    retry_hint: Optional[str] = None,
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    length_control_mode: str = "default",
    length_shortfall: Optional[int] = None,
    company_grounding_override: Optional[str] = None,
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    honorific = get_company_honorific(industry)

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
        issue = str(item.get("issue", "")).strip()
        suggestion = str(item.get("suggestion", "")).strip()
        if issue or suggestion:
            issue_lines.append(f"{index}. {issue} / {suggestion}")

    retry_guidance = f"\n【前回失敗の回避】\n- {retry_hint}" if retry_hint else ""
    effective_company_grounding = company_grounding_override or str(
        template_def.get("company_grounding") or "assistive"
    )
    system_prompt = f"""あなたは日本語のES編集者である。
目的は、元回答の事実を保ったまま、提出できる本文に安全に整えること。

【必須ルール】
- 具体的事実は元回答とユーザー事実の範囲から出さない
- 足りない情報は創作せず、一般化してつなぐ
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 固有施策、社内体制、数値、成果を新しく断定しない
- 本文で企業に言及するときは企業名ではなく「{honorific}」を使う
- 設問の冒頭表現をそのまま繰り返して始めない
- 末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない
- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない
- 出力は本文のみ、だ・である調、{_format_char_condition(char_min, char_max)}
- 目標は {_format_target_char_window(char_min, char_max)}

{_GLOBAL_CONCLUSION_FIRST_RULES}
{_format_short_answer_guidance(template_type, char_min, char_max)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=length_shortfall,
)}
{_format_company_guidance(
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    requires_company_rag=bool(template_def.get("requires_company_rag")),
    company_grounding=effective_company_grounding,
    generic_role_mode=generic_role_mode,
    evidence_coverage_level=evidence_coverage_level,
    template_type=template_type,
)}
{_format_reference_quality_guidance(reference_quality_block)}
{_format_user_fact_guidance(allowed_user_facts)}
{retry_guidance}
"""

    issue_block = f"\n【最低限反映する改善点】\n{chr(10).join(issue_lines)}" if issue_lines else ""
    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}{issue_block}

元の具体的事実を極力保ちつつ、構成だけを整えた安全な改善案本文を1件だけ返してください。"""
    return system_prompt, user_prompt


def build_template_improvement_prompt(
    template_type: str,
    question: str,
    original_answer: str,
    company_name: Optional[str],
    company_evidence_cards: Optional[list[dict]],
    has_rag: bool,
    char_min: Optional[int],
    char_max: Optional[int],
    allowed_user_facts: Optional[list[dict]] = None,
    role_name: Optional[str] = None,
    grounding_mode: str = "none",
    reference_quality_block: str = "",
    generic_role_mode: bool = False,
    evidence_coverage_level: str = "none",
    company_grounding_override: Optional[str] = None,
) -> tuple[str, str]:
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    company_grounding = company_grounding_override or str(
        TEMPLATE_DEFS.get(template_type, {}).get("company_grounding") or "assistive"
    )
    company_eval_rule = (
        "企業根拠がある場合は、企業理解・職種理解・事業方向性とのズレを評価する"
        if company_grounding == "required"
        else "企業根拠がある場合でも、自分の強み・価値観・学びの活かし方を補助的に見る"
    )
    system_prompt = f"""あなたは{template_role}である。
目的は、元回答の不足を改善ポイントとして3件以内で返すこと。

【必須ルール】
- 改善案は書かない
- 指摘は必ず元回答に対して行う
- 改善後の理想像ではなく、今足りない点を述べる
- role_name がある場合は職種・コース適合も評価する
- {company_eval_rule}
- 企業根拠にない固有施策や社内体制を新しく前提にしない
- 元回答やユーザー事実にない経験・役割・成果・数字を前提にしない
- JSONのみを返す
- コードブロック、前置き、後書きは書かない
- 各要素は category / issue / suggestion のみ
- top3 は 3 件以内
- category は 12 文字以内
- issue と suggestion は各 60 文字以内
- issue と suggestion に改行や箇条書きを入れない
- 構成面では結論ファースト（1文目で設問への答えの要約）が弱い場合は指摘する
{_format_short_answer_guidance(template_type, char_min, char_max)}
{_format_company_guidance(
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    requires_company_rag=bool(TEMPLATE_DEFS.get(template_type, {}).get("requires_company_rag")),
    company_grounding=company_grounding,
    generic_role_mode=generic_role_mode,
    evidence_coverage_level=evidence_coverage_level,
    template_type=template_type,
)}
{_format_reference_quality_guidance(reference_quality_block)}
{_format_user_fact_guidance(allowed_user_facts)}
"""

    user_prompt = f"""以下の設問と回答を確認し、改善ポイントをJSONで返してください。

【設問】
{question}

【元の回答】
{original_answer}

【企業】
{company_name or "未指定"}

【職種・コース】
{role_name or "未指定"}

【改善案の文字数条件】
{_format_char_condition(char_min, char_max)}

【grounding mode】
{grounding_mode}

出力形式:
{{
  "top3": [
    {{
      "category": "評価軸名",
      "issue": "問題点",
      "suggestion": "改善提案"
    }}
  ]
}}"""

    return system_prompt, user_prompt


def build_template_length_fix_prompt(
    template_type: str,
    current_text: str,
    char_min: Optional[int],
    char_max: Optional[int],
    fix_mode: str,
    *,
    length_control_mode: str = "default",
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")

    mode_instruction = (
        "意味を変えず、冗長な句・重複・一般論だけを削って収める"
        if fix_mode == "over_max"
        else "意味を変えず、短い補足句を1つだけ足して指定字数に近づける"
    )
    if fix_mode == "under_min" and length_control_mode == "under_min_recovery":
        mode_instruction = (
            "意味を変えず、既にある経験・職種・企業接点のつながりを補う短い文を1文まで足し、"
            "必要なら補足句も使って指定字数に収める"
        )
    system_prompt = f"""あなたは日本語のES編集者である。
目的は、既にある改善案本文の意味と事実を変えず、文字数だけを整えること。

【必須ルール】
- 出力は修正後の本文のみ
- だ・である調を維持する
- 新しい経験・役割・成果・数字・企業施策を足さない
- 本文の主張順と意味は極力維持する
- {mode_instruction}
- 文字数条件は {_format_char_condition(char_min, char_max)}
- 目標は {_format_target_char_window(char_min, char_max)}
- 説明、前置き、箇条書き、JSON、引用符は禁止
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=(char_min - len(current_text)) if fix_mode == "under_min" and char_min else None,
)}
"""

    user_prompt = f"""【現在の本文】
{current_text}

上の本文を、意味を変えずに文字数だけ調整した改善案本文として返してください。"""
    return system_prompt, user_prompt
