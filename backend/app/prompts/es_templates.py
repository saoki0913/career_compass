"""
ES Template Definitions and Prompt Builder

Template-based ES review with company RAG source integration.
Each template specifies:
- requires_company_rag: Whether company RAG data is required
- company_grounding: How deeply company grounding should be used
- extra_fields: Additional fields required for this template (intern_name, role_name)
"""

from dataclasses import dataclass
from typing import Optional

_GLOBAL_CONCLUSION_FIRST_RULES = """【結論ファースト（全設問・全文字数）】
- 1文目は設問への答えを結論として短く言い切る（設問文の言い換えや背景説明から入らない）
- 各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない
- 企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない
- 指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす
- 下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす"""


@dataclass(frozen=True)
class LengthControlProfile:
    profile_id: str
    provider_family: str
    band: str
    stage: str
    target_lower: int | None
    target_upper: int | None
    gap: int
    source_fill_ratio: float
    required_growth: int
    latest_failed_length: int
    early_length_fix_after_attempt: int


_DEFAULT_STAGE_KEY = "default"
_RECOVERY_STAGE_KEY = "under_min_recovery"
_TIGHT_STAGE_KEY = "tight_length"
_MODEL_FAMILY_DEFAULTS = {
    "openai_gpt5_mini": {
        # medium/long の gap は +1（下限未達の回収を少し緩める）
        _DEFAULT_STAGE_KEY: {"short": 2, "medium": 5, "long": 7},
        _RECOVERY_STAGE_KEY: {"short": 1, "medium": 3, "long": 4},
        _TIGHT_STAGE_KEY: {"short": 6, "medium": 9, "long": 11},
        "early_length_fix_after_attempt": 2,
    },
    "openai_gpt5": {
        _DEFAULT_STAGE_KEY: {"short": 4, "medium": 7, "long": 9},
        _RECOVERY_STAGE_KEY: {"short": 2, "medium": 4, "long": 5},
        _TIGHT_STAGE_KEY: {"short": 6, "medium": 9, "long": 11},
        "early_length_fix_after_attempt": 3,
    },
    "anthropic_claude": {
        _DEFAULT_STAGE_KEY: {"short": 6, "medium": 9, "long": 11},
        _RECOVERY_STAGE_KEY: {"short": 3, "medium": 5, "long": 6},
        _TIGHT_STAGE_KEY: {"short": 8, "medium": 11, "long": 13},
        "early_length_fix_after_attempt": 99,
    },
    "google_gemini": {
        _DEFAULT_STAGE_KEY: {"short": 5, "medium": 8, "long": 10},
        _RECOVERY_STAGE_KEY: {"short": 3, "medium": 5, "long": 6},
        _TIGHT_STAGE_KEY: {"short": 7, "medium": 10, "long": 12},
        "early_length_fix_after_attempt": 99,
    },
    "generic": {
        _DEFAULT_STAGE_KEY: {"short": 5, "medium": 8, "long": 10},
        _RECOVERY_STAGE_KEY: {"short": 3, "medium": 4, "long": 4},
        _TIGHT_STAGE_KEY: {"short": 7, "medium": 10, "long": 12},
        "early_length_fix_after_attempt": 99,
    },
}


def _length_band(char_max: int | None) -> str:
    if not char_max or char_max <= 220:
        return "short"
    if char_max <= 320:
        return "medium"
    return "long"


def _model_provider_family(llm_model: str | None) -> str:
    model_l = (llm_model or "").strip().lower()
    if "claude" in model_l:
        return "anthropic_claude"
    if "gemini" in model_l:
        return "google_gemini"
    if "gpt-5.4-mini" in model_l or "mini" in model_l:
        return "openai_gpt5_mini"
    if "gpt-5" in model_l or model_l.startswith("o"):
        return "openai_gpt5"
    return "generic"


def resolve_length_control_profile(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
    latest_failed_len: int = 0,
) -> LengthControlProfile:
    band = _length_band(char_max)
    provider_family = _model_provider_family(llm_model)
    profile = _MODEL_FAMILY_DEFAULTS.get(provider_family, _MODEL_FAMILY_DEFAULTS["generic"])
    stage_key = stage if stage in {_DEFAULT_STAGE_KEY, _RECOVERY_STAGE_KEY, _TIGHT_STAGE_KEY} else _DEFAULT_STAGE_KEY
    ratio = min(1.25, max(0.0, float(original_len) / float(max(char_max or 1, 1))))
    gap = int(profile[stage_key][band])

    if stage_key == _DEFAULT_STAGE_KEY:
        if ratio < 0.45:
            gap += 1 if provider_family == "openai_gpt5_mini" else 2
        elif 0.80 < ratio < 0.95:
            gap -= 1
        elif ratio >= 0.95:
            gap += 1

    span = max(1, char_max - (char_min or 0)) if char_max else 1
    gap = max(1, min(span, gap))
    target_upper = char_max
    target_lower = max(char_min or 0, (char_max or 0) - gap) if char_max else char_min
    profile_id = f"{provider_family}:{band}:{stage_key}"
    required_growth = max(0, (char_min or 0) - latest_failed_len) if char_min else 0
    return LengthControlProfile(
        profile_id=profile_id,
        provider_family=provider_family,
        band=band,
        stage=stage_key,
        target_lower=target_lower,
        target_upper=target_upper,
        gap=gap,
        source_fill_ratio=round(ratio, 4),
        required_growth=required_growth,
        latest_failed_length=int(latest_failed_len or 0),
        early_length_fix_after_attempt=int(profile["early_length_fix_after_attempt"]),
    )


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


# 文字数パイプライン: メイン rewrite → _validate_rewrite_candidate →（必要時）length_fix。
# 内部目標帯は compute_internal_target_gap / _format_target_char_window で
# メイン・フォールバック・length_fix プロンプトに一貫して埋め込む。


def compute_internal_target_gap(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    original_len: int = 0,
    llm_model: Optional[str] = None,
    stage: str = "default",
) -> int:
    """LLM向けの内部目標帯の幅（char_max からの差分）。"""
    profile = resolve_length_control_profile(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
        stage=stage,
        latest_failed_len=original_len,
    )
    return profile.gap


def _target_window_bounds(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> tuple[Optional[int], Optional[int]]:
    if not char_max:
        return char_min, char_max

    gap = compute_internal_target_gap(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
        stage=stage,
    )
    target_low = max(char_min or 0, char_max - gap)
    target_high = char_max
    return target_low, target_high


def _format_target_char_window(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    if not char_max:
        return _format_char_condition(char_min, char_max)

    target_low, target_high = _target_window_bounds(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
    )
    if target_low is None or target_high is None:
        return _format_char_condition(char_min, char_max)
    return f"{target_low}字〜{target_high}字"


def _format_length_policy_block(
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    target_window = _format_target_char_window(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
    )
    final_floor = f"{int(char_max * 0.9 + 0.999999999)}字" if char_max else "未指定"
    long_line = ""
    if char_min and char_max and char_max >= 350:
        long_line = (
            f"\n- 長文設問: 設問が求める複数の軸を削らず、{char_min}字未満で終えない。"
            "最終文まで strict 帯内に収める"
        )
    return f"""<length_policy>
- strict受理帯: {_format_char_condition(char_min, char_max)}
- 今回の内部目標帯: {target_window}
- strictに届かない場合でも、最終段だけ {final_floor} 以上なら受理余地がある
- ただし soft救済は最後だけで、通常段では strict を守る{long_line}
</length_policy>"""


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
    *,
    stage: str = "default",
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    if not char_max or char_max > 220:
        return ""

    target = _format_target_char_window(
        char_min,
        char_max,
        stage=stage,
        original_len=original_len,
        llm_model=llm_model,
    )
    structure_map = {
        "intern_reason": "1文目で参加理由、2文目で根拠経験、必要なら3文目でこのインターンで得たいことを置く",
        "intern_goals": "1文目で学びたいこと、2文目で根拠経験、必要なら3文目でインターン接点を置く",
        "role_course_reason": "1文目で職種志望、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "company_motivation": "1文目で志望理由、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "post_join_goals": "1文目でやりたいこと、2文目で根拠経験、必要なら3文目で企業接点を置く",
        "self_pr": "1文目で強みの核、2文目で根拠経験、必要なら3文目で仕事や企業との接点を置く",
        "gakuchika": "1文目で最も力を入れた行動、2文目で工夫や成果、必要なら3文目で仕事との接点を置く",
        "work_values": "1文目で価値観の核、2文目で根拠経験、必要なら3文目で仕事との接点を置く",
    }
    structure = structure_map.get(
        template_type,
        "1文目で結論、2文目で根拠、必要なら3文目で企業や仕事との接点を置く",
    )
    min_guard = f"- {char_min}字未満で終えない" if char_min else ""
    extra_lines: list[str] = []
    if 160 <= char_max <= 220 and template_type in {"self_pr", "gakuchika", "work_values"}:
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
- 2〜3文で構成する
- {structure}
- 目標は {target} で、短く終わらせない
- 文字数が足りないときは、既にある経験・役割・企業接点のつながりを1文だけ補う
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


def _dedupe_text_items(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        value = str(item or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _format_focus_mode_guidance(focus_mode: str | list[str]) -> str:
    guidance_map = {
        "normal": "",
        "length_focus_min": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 不足字数を埋めることを最優先にする",
                "- 一般論の水増しではなく、既存の経験・役割・企業接点のつながりを補う",
                "- 最小字数に届くまで、最後の1文も使って意味を保ったまま伸ばす",
            ]
        ),
        "length_focus_max": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 最大字数を超えないことを最優先にする",
                "- 意味の重複、冗長な接続、同趣旨の言い換えから先に削る",
                "- 核心の経験・企業接点・結論は残したまま、圧縮して収める",
            ]
        ),
        "style_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 全文をだ・である調に統一する",
                "- 文末だけを機械的に変えず、1本の本文として自然に整える",
            ]
        ),
        "grounding_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 企業や役割との接点を1点だけ明確にする",
                "- 固有名詞を増やしすぎず、方向性・価値観・役割期待の抽象度で接続する",
            ]
        ),
        "answer_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 1文目で設問への答えの核を短く言い切る",
                "- 背景説明より先に結論を置く",
            ]
        ),
        "opening_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 設問文の言い換えで始めず、結論から書き出す",
                "- 冒頭2文の役割を整理し、前置きを削る",
            ]
        ),
        "structure_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 箇条書きや断片ではなく、つながった本文として書き切る",
                "- 1文ごとの役割を整理し、途中で切れないようにする",
            ]
        ),
    }
    if isinstance(focus_mode, str):
        focus_modes = [focus_mode]
    else:
        focus_modes = list(focus_mode or [])
    blocks = [
        guidance_map.get(mode or "normal", "").strip()
        for mode in _dedupe_text_items(focus_modes)
    ]
    return "\n\n".join(block for block in blocks if block)


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
    if template_type not in {
        "company_motivation",
        "intern_reason",
        "intern_goals",
        "post_join_goals",
        "role_course_reason",
    }:
        return ""
    if not char_max or char_max < 120:
        return ""

    target = _format_target_char_window(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
    )
    subject = {
        "company_motivation": f"{honorific}を志望する理由",
        "intern_reason": f"{intern_name or 'そのインターン'}への参加理由",
        "intern_goals": f"{intern_name or 'そのインターン'}で学びたいこと",
        "post_join_goals": "入社後に挑戦したいこと",
        "role_course_reason": f"{role_name or 'その職種・コース'}を志望する理由",
    }[template_type]
    opening = {
        "company_motivation": f"1文目で{honorific}を志望する理由の核を言い切る",
        "intern_reason": "1文目で参加理由の核を言い切る",
        "intern_goals": (
            "1文目で学びたいことの核を言い切る（学びたい・確かめたい・得たい・磨きたいのいずれかを含める）"
        ),
        "post_join_goals": "1文目で入社後の挑戦の核を言い切る",
        "role_course_reason": "1文目でその職種・コースを志望する理由の核を言い切る（志望・魅力・担いたいのいずれかを含める）",
    }[template_type]
    second = {
        "company_motivation": "2文目で元回答の経験を1点だけ出す",
        "intern_reason": "2文目で元回答の経験や課題感を1点だけ出す",
        "intern_goals": "2文目で元回答の経験や問題意識を1点だけ出す",
        "post_join_goals": "2文目で元回答の経験や原体験を1点だけ出す",
        "role_course_reason": "2文目で元回答の経験や適性を1点だけ出す",
    }[template_type]
    third = {
        "company_motivation": "3文目で企業理解との接点を1点だけつなぐ",
        "intern_reason": "3文目でそのインターンの価値との接点を1点だけつなぐ",
        "intern_goals": "3文目でそのインターンで得たい学びとの接点を1点だけつなぐ",
        "post_join_goals": "3文目で企業や事業との接点を1点だけつなぐ",
        "role_course_reason": "3文目でその役割や事業との接点を1点だけつなぐ",
    }[template_type]
    fourth = {
        "company_motivation": "4文目で入社後の貢献で締める",
        "intern_reason": "4文目でインターン後の成長イメージで締める",
        "intern_goals": "4文目で将来の成長イメージで締める",
        "post_join_goals": "4文目で中長期の価値発揮で締める",
        "role_course_reason": "4文目でその役割で出したい価値で締める",
    }[template_type]
    example_good_1 = {
        "company_motivation": f"私が{honorific}を志望するのは、事業を通じて社会課題に向き合う姿勢に魅力を感じたからだ。",
        "intern_reason": f"私が{intern_name or 'そのインターン'}に参加したいのは、実務に近い課題で分析力を試し、学びを得たいからだ。",
        "intern_goals": f"{intern_name or 'そのインターン'}では、実務に近い課題の中で分析の精度と判断の速さを学びたい。",
        "post_join_goals": "入社後は、現場で事業理解を深めながら論点整理を担い、価値創出につなげたい。",
        "role_course_reason": f"私が{role_name or 'その職種・コース'}を志望するのは、事業と技術をつなぐ役割に魅力を感じるからだ。",
    }[template_type]
    example_good_2 = {
        "company_motivation": "研究で仮説検証を重ねた経験を土台に、現場で事業理解を深め、価値創出につなげたい。",
        "intern_reason": "研究で磨いた仮説検証力を土台に、実務の制約下で優先順位を考える力を伸ばしたい。",
        "intern_goals": "研究で培った整理力を土台に、チームで課題を前に進める視点を身につけたい。",
        "post_join_goals": "研究で論点を整理した経験を土台に、関係者を巻き込みながら事業を前進させたい。",
        "role_course_reason": "研究で論点を整理しながら前に進めた経験を土台に、その役割で価値を出したい。",
    }[template_type]
    example_bad = {
        "company_motivation": f"私は{honorific}を志望する理由は、{honorific}の魅力に惹かれたからだ。",
        "intern_reason": f"私は{intern_name or 'そのインターン'}に参加したい理由は、参加してみたいからだ。",
        "intern_goals": f"{intern_name or 'そのインターン'}で学びたいことは、いろいろなことを学ぶことだ。",
        "post_join_goals": "入社後に挑戦したいことは、入社後に頑張っていきたいということである。",
        "role_course_reason": f"私は{role_name or 'その職種・コース'}を選んだ理由は、{role_name or 'その職種・コース'}に興味があるからだ。",
    }[template_type]

    return f"""
【requiredテンプレの型】
- {subject}を4文前後で組み立てる
- {opening}
- {second}
- {third}
- {fourth}
- 目標は {target} で、短く終えすぎない
- 企業接点と貢献は1文に圧縮してよく、段階を増やしすぎない

【書き出し例】
- 良い: {example_good_1}
- 良い: {example_good_2}

【避ける例】
- 悪い: {example_bad}
""".strip()


def _format_required_template_length_fix_guidance(
    template_type: str,
    char_min: Optional[int],
    char_max: Optional[int],
    *,
    original_len: int = 0,
    llm_model: Optional[str] = None,
) -> str:
    if template_type not in {
        "company_motivation",
        "intern_reason",
        "intern_goals",
        "post_join_goals",
        "role_course_reason",
    }:
        return ""
    if not char_max or char_max < 120:
        return ""

    target = _format_target_char_window(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
    )
    return f"""
【requiredテンプレの補修方針】
- 1文目の結論は動かさず、既存の経験・職種・企業接点のつながりで補う
- 文字数補修は1文追加か短い接続句の調整に限る
- 新しい経験・役割・成果・数字・企業施策は足さない
- 目標は {target} で、意味を増やしすぎずに指定字数へ寄せる
""".strip()


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
    llm_model: Optional[str] = None,
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    template_role = TEMPLATE_ROLES.get(template_type, TEMPLATE_ROLES["basic"])
    honorific = get_company_honorific(industry)
    original_len = len(answer or "")

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
    retry_guidance = (
        "\n【前回失敗の回避】\n" + "\n".join(f"- {item}" for item in retry_items)
        if retry_items
        else ""
    )
    effective_company_grounding = company_grounding_override or str(
        template_def.get("company_grounding") or "assistive"
    )
    target_stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    system_prompt = f"""あなたは{template_role}である。

<task>
提出できる改善案本文を1件だけ作る。
</task>

<output_contract>
- 出力は改善案本文のみ
- 説明、前置き、箇条書き、引用符、JSON、コードブロックは禁止
- だ・である調で統一
</output_contract>

<constraints>
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
</constraints>

{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}

<core_style>
{_GLOBAL_CONCLUSION_FIRST_RULES}
</core_style>

<template_focus>
{template_def["description"]}
</template_focus>
{_format_focus_mode_guidance(focus_modes or focus_mode)}
{_format_short_answer_guidance(template_type, char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=length_shortfall,
    original_len=original_len,
    llm_model=llm_model,
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
{_format_required_template_playbook(
    template_type,
    char_min,
    char_max,
    honorific=honorific,
    role_name=role_name,
    intern_name=intern_name,
    original_len=original_len,
    llm_model=llm_model,
)}
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
    llm_model: Optional[str] = None,
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")
    honorific = get_company_honorific(industry)
    original_len = len(answer or "")

    conditions = [f"設問: {question}", f"文字数: {_format_char_condition(char_min, char_max)}"]
    if company_name:
        conditions.append(f"企業: {company_name}")
    if industry:
        conditions.append(f"業界: {industry}")
    if intern_name:
        conditions.append(f"インターン名: {intern_name}")
    if role_name:
        conditions.append(f"職種・コース名: {role_name}")

    retry_items = _dedupe_text_items(list(retry_hints or ([] if not retry_hint else [retry_hint])))
    retry_guidance = (
        "\n【前回失敗の回避】\n" + "\n".join(f"- {item}" for item in retry_items)
        if retry_items
        else ""
    )
    effective_company_grounding = company_grounding_override or str(
        template_def.get("company_grounding") or "assistive"
    )
    target_stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    system_prompt = f"""あなたは日本語のES編集者である。

<task>
元回答の事実を保ったまま、提出できる本文に安全に整える。
</task>

<output_contract>
- 出力は本文のみ
- だ・である調
- {_format_char_condition(char_min, char_max)}
</output_contract>

<constraints>
- 具体的事実は元回答とユーザー事実の範囲から出す
- 足りない情報は創作せず、一般化してつなぐ
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 固有施策、社内体制、数値、成果を新しく断定しない
- 本文で企業に言及するときは企業名ではなく「{honorific}」を使う
- 設問の冒頭表現をそのまま繰り返して始めない
- 末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない
- 最終文は具体的な行動や貢献で締める
</constraints>

{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}

<core_style>
{_GLOBAL_CONCLUSION_FIRST_RULES}
</core_style>
{_format_focus_mode_guidance(focus_modes or focus_mode)}
{_format_short_answer_guidance(template_type, char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=length_shortfall,
    original_len=original_len,
    llm_model=llm_model,
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
{_format_required_template_playbook(
    template_type,
    char_min,
    char_max,
    honorific=honorific,
    role_name=role_name,
    intern_name=intern_name,
    original_len=original_len,
    llm_model=llm_model,
)}
{retry_guidance}
"""
    user_prompt = f"""【条件】
{chr(10).join(conditions)}

【元の回答】
{answer}

元の具体的事実を極力保ちつつ、構成だけを整えた安全な改善案本文を1件だけ返してください。"""
    return system_prompt, user_prompt


def build_template_length_fix_prompt(
    template_type: str,
    current_text: str,
    char_min: Optional[int],
    char_max: Optional[int],
    fix_mode: str,
    *,
    focus_modes: Optional[list[str]] = None,
    length_control_mode: str = "default",
    llm_model: Optional[str] = None,
) -> tuple[str, str]:
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")

    original_len = len(current_text or "")
    under_shortfall = (
        max(0, char_min - original_len) if fix_mode == "under_min" and char_min else 0
    )

    resolved_focus_modes = _dedupe_text_items(list(focus_modes or []))
    if not resolved_focus_modes:
        focus_mode_mapping = {
            "under_min": ["length_focus_min"],
            "over_max": ["length_focus_max"],
            "style": ["style_focus"],
            "grounding": ["grounding_focus"],
        }
        resolved_focus_modes = focus_mode_mapping.get(fix_mode, [])

    mode_instructions: list[str] = []
    for mode in resolved_focus_modes:
        if mode == "length_focus_min":
            if length_control_mode == "under_min_recovery":
                mode_instructions.append(
                    "意味を変えず、既にある経験・職種・企業接点のつながりを補う短い文を1文まで足し、必要なら補足句も使って指定字数に収める"
                )
            elif under_shortfall > 40:
                mode_instructions.append(
                    "意味を変えず、既存の文脈のつながりを保ちながら短い接続句を1〜2か所足し、新事実は足さずに指定字数に近づける"
                )
            else:
                mode_instructions.append(
                    "意味を変えず、短い補足句を1つだけ足して指定字数に近づける"
                )
        elif mode == "length_focus_max":
            mode_instructions.append("意味を変えず、冗長な句・重複・一般論だけを削って収める")
        elif mode == "style_focus":
            mode_instructions.append("意味を変えず、だ・である調への統一だけを最小限で整える")
        elif mode == "grounding_focus":
            mode_instructions.append("意味を変えず、企業や役割との接点を1句だけ補って伝わり方を整える")
        elif mode == "opening_focus":
            mode_instructions.append("冒頭は設問の言い換えで始めず、結論の一文から書き出す形へ最小限で整える")
        elif mode == "answer_focus":
            mode_instructions.append("1文目で設問への答えの核がすぐ伝わるよう、冒頭の一文だけを優先して整える")
        elif mode == "structure_focus":
            mode_instructions.append("箇条書きや断片を避け、つながった本文として読める形へ最小限で整える")
    if not mode_instructions:
        mode_instructions.append("意味を変えず、本文の崩れだけを最小限で整える")
    stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    system_prompt = f"""あなたは日本語のES編集者である。

<task>
既にある改善案本文の意味と事実を変えず、文字数だけを整える。
</task>

<output_contract>
- 出力は修正後の本文のみ
- 説明、前置き、箇条書き、JSON、引用符は禁止
- だ・である調を維持する
</output_contract>

<constraints>
- 新しい経験・役割・成果・数字・企業施策を足さない
- 本文の主張順と意味は極力維持する
{chr(10).join(f"- {instruction}" for instruction in _dedupe_text_items(mode_instructions))}
</constraints>
{_format_length_policy_block(char_min, char_max, stage=stage, original_len=original_len, llm_model=llm_model)}
{_format_midrange_length_guidance(
    template_type,
    char_min,
    char_max,
    length_control_mode=length_control_mode,
    length_shortfall=under_shortfall if fix_mode == "under_min" and char_min else None,
    original_len=original_len,
    llm_model=llm_model,
)}
{_format_required_template_length_fix_guidance(
    template_type,
    char_min,
    char_max,
    original_len=original_len,
    llm_model=llm_model,
)}
"""

    user_prompt = f"""【現在の本文】
{current_text}

上の本文を、意味を変えずに文字数だけ調整した改善案本文として返してください。"""
    return system_prompt, user_prompt
