"""
ES Template Definitions and Prompt Builder

Template-based ES review with company RAG source integration.
Each template specifies:
- requires_company_rag: Whether company RAG data is required
- company_grounding: How deeply company grounding should be used
- extra_fields: Additional fields required for this template (intern_name, role_name)
"""

from dataclasses import dataclass
from typing import Any, Optional

_GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK = """【結論ファースト（全設問・全文字数）】
- 1文目は設問への答えを20〜45字で結論として短く言い切る（設問文の言い換えや背景説明から入らない）
- 各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない
- 企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない
- 指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす
- 下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす
- ユーザーの元回答に含まれる数値・固有名詞（○人、○か月、ツール名、イベント名など）は必ず保持する
- 「整理した」「取り組んだ」「向き合った」のような抽象動詞だけで済ませず、具体的な行動（何をどうしたか）を1つ以上含める
- 「多様な」「幅広い」「さまざまな」のような形容詞を単独で使わず、具体例や対象を併記する
- 「この経験を活かし」「この力を生かし」のような定型接続は避け、文脈固有の橋渡し表現に変える（例: 「〜で培った視点は、〜に直結する」「〜から見えた問いを、〜で深めたい」）
- 「関係者を巻き込みながら」「新たな価値を」「幅広い視野」等のLLM特有フレーズは、ユーザーの元回答に含まれていない限り使わない
- 「貢献する」「成長する」だけで終わらず、何にどう貢献するか・どの方向に成長するかを1語以上具体化する"""
_GLOBAL_CONCLUSION_FIRST_RULES = _GLOBAL_CONCLUSION_FIRST_RULES_FALLBACK


# ---------------------------------------------------------------------------
# 8-A: Contextual style rules — scope-aware variant of the global rules
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _StyleRule:
    text: str
    scope: str  # "all", "company", "short_only", "mid_long"
    applicable_templates: frozenset[str] | None = None
    priority: str = "should"  # "must", "should", "watch"


_STYLE_RULES: list[_StyleRule] = [
    # Core rules (always applied)
    _StyleRule(
        "1文目は設問への答えを20〜45字で結論として短く言い切る（設問文の言い換えや背景説明から入らない）",
        "all",
        priority="must",
    ),
    _StyleRule("各文は役割を1つに絞り、同趣旨を言い換えて引き延ばさない", "all"),
    _StyleRule("企業接点・貢献・活かし方は必要なら1文に圧縮してよく、段階を無理に増やさない", "all"),
    _StyleRule(
        "ユーザーの元回答に含まれる数値・固有名詞（○人、○か月、ツール名、イベント名など）は必ず保持する",
        "all",
        priority="must",
    ),
    _StyleRule("「整理した」「取り組んだ」「向き合った」のような抽象動詞だけで済ませず、具体的な行動（何をどうしたか）を1つ以上含める", "all"),
    _StyleRule("「多様な」「幅広い」「さまざまな」のような形容詞を単独で使わず、具体例や対象を併記する", "all"),
    _StyleRule("「この経験を活かし」「この力を生かし」のような定型接続は避け、文脈固有の橋渡し表現に変える（例: 「〜で培った視点は、〜に直結する」「〜から見えた問いを、〜で深めたい」）", "all"),
    _StyleRule(
        "「関係者を巻き込みながら」「新たな価値を」「幅広い視野」等のLLM特有フレーズは、ユーザーの元回答に含まれていない限り使わない",
        "all",
        priority="must",
    ),
    _StyleRule("「貢献する」「成長する」だけで終わらず、何にどう貢献するか・どの方向に成長するかを1語以上具体化する", "all"),
    # Length-specific: mid/long band only
    _StyleRule(
        "指定の字数下限を下回る改善案は再検証で弾かれる。要約しすぎず、下限まで本文を伸ばす",
        "mid_long",
        priority="watch",
    ),
    _StyleRule(
        "下限が200字を超える設問では、具体を削りすぎず下限付近まで本文を伸ばす",
        "mid_long",
        priority="watch",
    ),
    # Short-band only
    _StyleRule("短い字数制限では結論と根拠を凝縮し、冗長な修飾を削る", "short_only", priority="watch"),
    _StyleRule(
        "抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する。ただし元回答にない数字は作らない",
        "all",
        frozenset({"self_pr", "work_values"}),
    ),
    _StyleRule(
        "強みや価値観は抽象語の反復で済ませず、具体的な行動動詞を最低1組入れて再現性を示す",
        "all",
        frozenset({"self_pr", "work_values"}),
    ),
    _StyleRule(
        "複数の施策や工夫を書くときは「(1)(2)」または「まず / 次に」で順序を明示し、「また / さらに」の羅列にしない",
        "all",
        frozenset({"gakuchika"}),
    ),
]


def _build_contextual_rules(
    template_type: str,
    char_max: int | None,
    grounding_mode: str,
) -> str:
    """Build contextual style rules based on template type, character band, and grounding mode."""
    band = "short" if (char_max and char_max <= 220) else "mid_long"
    is_company_template = grounding_mode not in ("none",)

    grouped_rules: dict[str, list[str]] = {"must": [], "should": [], "watch": []}
    for rule in _STYLE_RULES:
        if rule.applicable_templates and template_type not in rule.applicable_templates:
            continue
        should_include = False
        if rule.scope == "all":
            should_include = True
        elif rule.scope == "company" and is_company_template:
            should_include = True
        elif rule.scope == "short_only" and band == "short":
            should_include = True
        elif rule.scope == "mid_long" and band == "mid_long":
            should_include = True
        if should_include:
            grouped_rules[rule.priority].append(rule.text)

    must_lines = "\n".join(
        f"  {index}. {text}" for index, text in enumerate(grouped_rules["must"], start=1)
    )
    should_lines = "\n".join(
        f"  {index}. {text}" for index, text in enumerate(grouped_rules["should"], start=1)
    )
    watch_lines = "\n".join(f"- {text}" for text in grouped_rules["watch"])

    blocks: list[str] = []
    if must_lines:
        blocks.append(f"【MUST（絶対守る）】\n{must_lines}")
    if should_lines:
        blocks.append(f"【SHOULD（できる限り）】\n{should_lines}")
    if watch_lines:
        blocks.append(f"【WATCH（注意）】\n{watch_lines}")
    return "【結論ファースト（全設問・全文字数）】\n" + "\n".join(blocks)


# ---------------------------------------------------------------------------
# 9-F helper: prose_style block for mid/long answers (char_max > 220)
# ---------------------------------------------------------------------------

def _format_prose_style_block(char_max: int | None) -> str:
    """Return a <prose_style> block for longer answers where natural writing matters.

    Only emitted when char_max > 220 to avoid cluttering short-answer prompts.
    """
    if not char_max or char_max <= 220:
        return ""
    return """
<prose_style>
- 文と文の間は、前文の固有名詞か固有動詞を次文の主語に据えてつなぐ（「この」「その」「こうした」で始めない）
- 読み手に伝わる順序で配置する（結論→根拠→展望）
- 改行や空行を入れず、1段落の連続した文章として仕上げる
- 同じ意味の言い換え（パラフレーズ）で字数を稼がない。1文=1新情報
- 「実感した」「確信した」「痛感した」で締めず、最終文は具体的な行動名詞で終わる
- ユーザーの口語表現（「すごく」「めっちゃ」等）は書き言葉に直しつつ、動詞の核は保つ
</prose_style>"""


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
        # gap 拡大: medium 帯で char_max 60-70% しか生成できない問題への対応
        # 内部目標帯を実際の生成能力範囲に近づけることでリトライ成功率を改善
        _DEFAULT_STAGE_KEY: {"short": 4, "medium": 12, "long": 15},
        _RECOVERY_STAGE_KEY: {"short": 2, "medium": 8, "long": 10},
        _TIGHT_STAGE_KEY: {"short": 6, "medium": 12, "long": 14},
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
        "grounding_level": "light",
        "description": "設問への適合性、企業理解、自己アピール、論理性を総合的に評価。",
        "purpose": "設問の主眼に正面から答え、経験や考えが読み手に伝わる本文に整える。",
        "required_elements": ["設問への結論", "根拠になる経験・考え", "必要に応じた仕事や企業との接点"],
        "anti_patterns": [
            "設問文の言い換えだけで始める",
            "具体性のない一般論だけで終わる",
            "箇条書きや断片文のまま終わる",
        ],
        "recommended_structure": {
            "short": "1文目で結論、2文目で根拠、必要なら3文目で仕事や企業との接点を置く",
        },
        "evaluation_checks": {
            "head_sentence_window": 2,
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、既にある経験や考えのつながりを補って不足字数を埋める",
            "answer_focus": "1文目で設問への答えの核を短く言い切る",
            "grounding": "企業理解との接点を自然な範囲で1点示す",
        },
        "company_usage": "assistive",
        "fact_priority": "mixed",
    },
    "company_motivation": {
        "label": "企業志望理由",
        "requires_company_rag": True,
        "grounding_level": "deep",
        "description": "企業への志望理由を述べる設問。企業の特徴・事業・価値観との接点を示す。",
        "purpose": "なぜその企業なのかを、自分の経験や関心と企業理解につないで示す。",
        "required_elements": ["志望理由の核", "根拠になる経験", "企業理解との接点", "入社後の価値発揮"],
        "anti_patterns": [
            "どの企業にも当てはまる一般論",
            "企業説明だけで終わり自分との接続がない",
            "志望理由の言い換えだけで始める",
        ],
        "recommended_structure": {
            "short": "1文目で志望理由、2文目で根拠経験、必要なら3文目で企業接点を置く",
            "mid": "1文目で志望理由、2文目で根拠経験、3文目で企業理解との接点、4文目で貢献イメージを置く",
            "dense_short_answer": True,
        },
        "composition_ratio": "導入15% / 本論70% / 締め15%",
        "why_now_hint": "可能なら「なぜ今この会社か」が伝わる一節を含める",
        "evaluation_checks": {
            "repeated_opening_pattern": r"(志望する理由|志望理由)は",
            "head_sentence_window": 3,
            "anchor_type": "company",
            "head_focus_pattern": r"志望|惹|魅力|理由|価値|からだ|ためだ|関心|期待|共感|惹か",
            "answer_focus_message": "冒頭でなぜこの会社かを短く言い切ってください（企業名または貴社と志望の核を含む）。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、既にある経験から企業接点と貢献への橋渡しを1文補う",
            "answer_focus": "1文目でなぜその企業を志望するのかを短く言い切る",
            "grounding": "企業理解との接点を1点だけ明確にする",
        },
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{honorific}を志望する理由",
            "opening": "1文目で{honorific}を志望する理由の核を言い切る",
            "second": "2文目で元回答の経験を1点だけ出す",
            "third": "3文目で企業理解との接点を1点だけつなぐ",
            "fourth": "4文目で入社後の貢献で締める",
            "example_good_1": "私が{honorific}を志望するのは、事業を通じて社会課題に向き合う姿勢に魅力を感じたからだ。",
            "example_good_2": "研究で仮説検証を重ねた経験を土台に、現場で事業理解を深め、価値創出につなげたい。",
            "example_bad": "私は{honorific}を志望する理由は、{honorific}の魅力に惹かれたからだ。",
        },
    },
    "intern_reason": {
        "label": "インターン志望理由",
        "requires_company_rag": True,
        "grounding_level": "standard",
        "description": "インターンへの参加理由を述べる設問。参加目的と自己成長の接点を示す。",
        "extra_fields": ["intern_name"],
        "purpose": "なぜそのインターンに参加したいかを、経験と得たい学びにつないで示す。",
        "required_elements": ["参加理由の核", "活かせる経験や課題意識", "プログラムとの接点", "得たい学び"],
        "anti_patterns": [
            "参加してみたいだけの一般論",
            "学びたいことが抽象的すぎる",
            "経験とインターンの接続がない",
        ],
        "recommended_structure": {
            "short": "1文目で参加理由、2文目で根拠経験、必要なら3文目でこのインターンで得たいことを置く",
            "mid": "1文目で参加理由、2文目で根拠経験、3文目でインターン価値との接点、4文目で得たい学びを置く",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(参加理由|志望理由)は",
            "head_sentence_window": 2,
            "anchor_type": "intern",
            "anchor_pattern": r"インターン|プログラム|インターンシップ",
            "practice_context_pattern": r"実務|現場|課題|就業|体験",
            "head_focus_pattern": r"参加|志望|理由|惹|魅力|学びたい|学びたく|身につけたい|得たい|挑戦したい|試したい|試し(?:ながら|て)|実践したい|実践的|期待|関心|魅力を感|惹か|ふさわしい|最適|身を置きたい|触れたい|体感|機会|鍛え",
            "answer_focus_message": "冒頭でなぜそのインターンに参加したいかを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、参加理由から経験、得たい学びへの橋渡しを補う",
            "answer_focus": "1文目で参加したい理由の核を短く言い切る",
            "grounding": "インターンの価値との接点を1点だけ明確にする",
        },
        "company_usage": "required",
        "fact_priority": "mixed",
        "question_focus_rules": [
            {
                "contains_all": ["活か"],
                "contains_any": ["持ち帰", "得たい", "学びたい"],
                "title": "この設問で落としてはいけない3要素",
                "items": [
                    "参加したい理由を1文で明示する",
                    "活かせる経験・事実を1文で置く",
                    "持ち帰りたい学び・視点を最後に1文で言い切る",
                    "3要素のどれも省略しない",
                ],
            }
        ],
        "playbook": {
            "subject": "{intern_name}への参加理由",
            "opening": "1文目で参加理由の核を言い切る",
            "second": "2文目で元回答の経験や課題感を1点だけ出す",
            "third": "3文目でそのインターンの価値との接点を1点だけつなぐ",
            "fourth": "4文目でインターン後の成長イメージで締める",
            "example_good_1": "私が{intern_name}に参加したいのは、実務に近い課題で分析力を試し、学びを得たいからだ。",
            "example_good_2": "研究で磨いた仮説検証力を土台に、実務の制約下で優先順位を考える力を伸ばしたい。",
            "example_bad": "私は{intern_name}に参加したい理由は、参加してみたいからだ。",
        },
    },
    "intern_goals": {
        "label": "インターンでやりたいこと・学びたいこと",
        "requires_company_rag": True,
        "grounding_level": "standard",
        "description": "インターンで達成したい目標や学びたいことを述べる設問。",
        "extra_fields": ["intern_name"],
        "purpose": "インターンで何を学びたいか、なぜそれを得たいかを経験とともに示す。",
        "required_elements": ["学びたいことの核", "根拠になる経験や問題意識", "プログラムとの接点", "成長イメージ"],
        "anti_patterns": [
            "学びたいことが曖昧で広すぎる",
            "インターンの文脈が見えない",
            "経験や問題意識との接続がない",
        ],
        "recommended_structure": {
            "short": "1文目で学びたいこと、2文目で根拠経験、必要なら3文目でインターン接点を置く",
            "mid": "1文目で学びたいこと、2文目で根拠経験、3文目でプログラム接点、4文目で成長イメージを置く",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(学びたいこと|やりたいこと)は",
            "head_sentence_window": 3,
            "anchor_type": "intern",
            "anchor_pattern": r"インターン|プログラム|インターンシップ",
            "practice_context_pattern": r"実務|現場|分析|学び|意思決定|優先|仮説|課題|顧客|価値",
            "head_focus_pattern": r"学びたい|身につけたい|やりたい|獲得したい|高めたい|磨きたい|確かめたい|得たい|習得したい|鍛えたい|深めたい|試したい|経験したい|積みたい|培いたい|伸ばしたい",
            "answer_focus_message": "冒頭でインターンで何を学びたいかを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、学びたいことから経験、成長イメージへの橋渡しを補う",
            "answer_focus": "1文目で学びたいことの核を短く言い切る",
            "grounding": "プログラムとの接点を1点だけ明確にする",
        },
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{intern_name}で学びたいこと",
            "opening": "1文目で学びたいことの核を言い切る（学びたい・確かめたい・得たい・磨きたいのいずれかを含める）",
            "second": "2文目で元回答の経験や問題意識を1点だけ出す",
            "third": "3文目でそのインターンで得たい学びとの接点を1点だけつなぐ",
            "fourth": "4文目で将来の成長イメージで締める",
            "example_good_1": "{intern_name}では、実務に近い課題の中で分析の精度と判断の速さを学びたい。",
            "example_good_2": "研究で培った整理力を土台に、チームで課題を前に進める視点を身につけたい。",
            "example_bad": "{intern_name}で学びたいことは、いろいろなことを学ぶことだ。",
        },
    },
    "gakuchika": {
        "label": "ガクチカ",
        "requires_company_rag": False,
        "grounding_level": "none",
        "description": "学生時代に力を入れたことを述べる設問。STAR形式で具体的に。",
        "purpose": "学生時代に力を入れた取り組みを、課題・行動・成果・学びが伝わる形で示す。",
        "required_elements": ["取り組みの核", "課題や目的", "工夫した行動", "成果や学び"],
        "anti_patterns": [
            "活動名だけで中身が見えない",
            "行動や工夫が具体化されていない",
            "企業接続を無理に入れて主題がぼける",
            "『この経験を通じて〜の重要性を学んだ』のような定型の学び表現で締める",
            "『多様な』『幅広い』『様々な』等の抽象修飾語を具体例なしで使う",
            "『分析し、検討し、実行した』のような抽象動詞を連打して行動の中身が見えない",
            "学生が口語（すごく/めっちゃ 等）で語った言い回しを全て書き言葉に置き換えて等身大の声を消す",
            "冒頭の結論と末尾の学びで同じことを繰り返し、実質の情報量が落ちる",
            "結びの1文は、学んだ内容を具体的な次の行動に接続する（感想系動詞で終わらない）",
            "「再現できる」「次に活きる」を使った学び結びは抽象的 → 「同じ手法で〜に応用したい」など固有のリンクを示す",
        ],
        "recommended_structure": {
            "short": "1文目で最も力を入れた行動、2文目で工夫や成果、必要なら3文目で仕事との接点を置く",
            "three_sentence_close_on_short_band": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(学生時代に力を入れたこと|学生時代に頑張ったこと)は",
            "head_sentence_window": 3,
            "head_focus_pattern": r"力を入れ|頑張っ|取り組ん|経験|課題|行動|成果|学び|リーダー|役割|担当|主担当|工夫|改善|達成|PDCA|チーム|サークル|ゼミ|研究|活動|最も",
            "answer_focus_message": "冒頭で学生時代に力を入れた取り組みの核を短く示してください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、課題・行動・成果・学びのつながりを補う",
            "answer_focus": "1文目で最も力を入れた取り組みの核を短く示す",
            "structure": "複数の施策や工夫は「まず / 次に」または「(1)(2)」で順序を示し、課題・行動・成果が追える形に整える",
        },
        "company_usage": "none",
        "fact_priority": "self",
        "playbook": {
            "subject": "学生時代に力を入れた取り組み",
            "opening": "1文目で最も力を入れた取り組みと自分の役割を言い切る",
            "second": "2文目で直面した課題や目的を1点だけ置く",
            "third": "3文目で工夫した行動を順序が分かる形で具体化する",
            "fourth": "4文目で成果と学び、仕事での再現性を短く締める",
            "example_good_1": "私が学生時代に最も力を入れたのは、学園祭運営の導線改善である。",
            "example_good_2": "30人規模の運営で情報共有の遅れを立て直し、来場者対応の流れを整えた。",
            "example_bad": "学生時代に力を入れたことは、いろいろ工夫して頑張ったことである。",
        },
    },
    "self_pr": {
        "label": "自己PR",
        "requires_company_rag": False,
        "grounding_level": "light",
        "description": "強み、その根拠となる経験、企業や職種での活かし方を述べる設問。",
        "purpose": "自分の強みと、その再現性を裏づける経験を一貫して示す。",
        "required_elements": ["強みの核", "根拠になる経験", "仕事や役割での活かし方"],
        "anti_patterns": [
            "強みの名前だけで根拠がない",
            "経験が説明で終わり再現性が見えない",
            "自己否定語をそのまま残す",
            "強みを裏付ける経験で「整理した」「取り組んだ」「向き合った」だけで済ませる",
            "最終文で「この強みを活かして貢献したい」と定型的に締める",
            "強みの名前を冒頭と末尾で繰り返し、新情報なしで終わる",
        ],
        "recommended_structure": {
            "short": "1文目で強みの核、2文目で根拠経験、必要なら3文目で仕事や企業との接点を置く",
            "three_sentence_close_on_short_band": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(自己PR|自己ＰＲ)(?:として|で|は)|私の強みは|アピールしたいことは|自己紹介としては",
            "head_sentence_window": 2,
            "head_focus_pattern": r"強み|長所|得意|アピール|特徴|資質|性格|スキル|信念|指針|軸|他者と(?:の)?違い|差別化|強みとして|スキルとして|自分(?:自身)?(?:の)?|私(?:自身)?(?:の)?|一つ(?:の)?|まず|最も",
            "answer_focus_message": "冒頭で自分の強みやアピールの核を短く示してください。",
            "negative_self_eval_patterns": ["経験不足", "自信がない", "自信はない"],
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、強みから経験、再現性へのつながりを補う",
            "answer_focus": "1文目で強みの核を短く言い切る",
            "grounding": "強みと企業との接点を自然な範囲で1点示す",
            "quantify": "抽象的な強みの説明だけで終えず、行動の対象・範囲・頻度を具体化し、元回答にある数値は保持する",
        },
        "negative_reframe_guidance": [
            "「経験不足」「自信がない」などの自己否定語をそのまま残さない",
            "元の事実は保ちつつ、準備・責任感・学習姿勢・確認力などの前向きな表現に言い換える",
            "弱さの告白で締めず、仕事で再現できる行動特性で締める",
        ],
        "company_usage": "assistive",
        "fact_priority": "self",
    },
    "post_join_goals": {
        "label": "入社後やりたいこと",
        "requires_company_rag": True,
        "grounding_level": "standard",
        "description": "入社後のキャリアビジョンや挑戦したいことを述べる設問。",
        "purpose": "入社後にやりたいことを、自分の経験と企業の方向性につなげて示す。",
        "required_elements": ["やりたいことの核", "根拠になる経験や原体験", "企業や事業との接点", "価値発揮の方向性"],
        "anti_patterns": [
            "やりたいことが抽象的で広すぎる",
            "企業や事業との接点がない",
            "意気込みだけで具体的な価値発揮が見えない",
        ],
        "recommended_structure": {
            "short": "1文目でやりたいこと、2文目で根拠経験、必要なら3文目で企業接点を置く",
            "mid": "1文目で入社後の目標、2文目で根拠経験、3文目で企業との接点、4文目で価値発揮の方向性を置く",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "head_sentence_window": 3,
            "head_focus_pattern": r"入社後|将来|キャリア|仕事|業務|職場|携わりたい|挑戦したい|担いたい|実現したい|貢献したい|目標|手掛け|ビジネス|投資|事業機会|価値創出|獲得したい|極めたい|従事|取り組みたい|身を置き|発揮したい|成し遂げ|やりたい|務めたい",
            "answer_focus_message": "冒頭で入社後にやりたいことや手掛けたいことを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、やりたいことから経験、価値発揮への橋渡しを補う",
            "answer_focus": "1文目で入社後にやりたいことの核を短く言い切る",
            "grounding": "企業や事業との接点を1点だけ明確にする",
        },
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "入社後に挑戦したいこと",
            "opening": "1文目で入社後の挑戦の核を言い切る",
            "second": "2文目で元回答の経験や原体験を1点だけ出す",
            "third": "3文目で企業や事業との接点を1点だけつなぐ",
            "fourth": "4文目で中長期の価値発揮で締める",
            "example_good_1": "入社後は、現場で事業理解を深めながら論点整理を担い、価値創出につなげたい。",
            "example_good_2": "研究で論点を整理した経験を土台に、関係者を巻き込みながら事業を前進させたい。",
            "example_bad": "入社後に挑戦したいことは、入社後に頑張っていきたいということである。",
        },
    },
    "role_course_reason": {
        "label": "職種・コース選択理由",
        "requires_company_rag": True,
        "grounding_level": "deep",
        "description": "特定の職種やコースを選んだ理由を述べる設問。",
        "extra_fields": ["role_name"],
        "purpose": "なぜその職種・コースを選ぶのかを、経験・適性・企業文脈につないで示す。",
        "required_elements": ["職種・コース志望の核", "根拠になる経験や適性", "役割や事業との接点", "その役割で出したい価値"],
        "anti_patterns": [
            "職種名への興味だけで終わる",
            "経験や適性との結びつきがない",
            "企業文脈がなく他社にも言える",
        ],
        "recommended_structure": {
            "short": "1文目で職種志望、2文目で根拠経験、必要なら3文目で企業接点を置く",
            "mid": "1文目で職種・コース志望、2文目で根拠経験、3文目で企業や事業との接点、4文目でその役割で出したい価値を置く",
            "dense_short_answer": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(選んだ理由|選択した理由|志望理由)は",
            "head_sentence_window": 2,
            "anchor_type": "role",
            "anchor_pattern": r"職種|コース|業務|役割|ポジション|ジョブ",
            "head_focus_pattern": r"志望|選ぶ|理由|関心|担いたい|携わりたい|適性|適合|惹か|魅力|期待|共感",
            "answer_focus_message": "冒頭でなぜその職種・コースかを短く言い切ってください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、経験から役割理解、価値発揮への橋渡しを補う",
            "answer_focus": "1文目でなぜその職種・コースを志望するのかを短く言い切る",
            "grounding": "役割や事業との接点を1点だけ明確にする",
        },
        "company_usage": "required",
        "fact_priority": "mixed",
        "playbook": {
            "subject": "{role_name}を志望する理由",
            "opening": "1文目でその職種・コースを志望する理由の核を言い切る（志望・魅力・担いたいのいずれかを含める）",
            "second": "2文目で元回答の経験や適性を1点だけ出す",
            "third": "3文目でその役割や事業との接点を1点だけつなぐ",
            "fourth": "4文目でその役割で出したい価値で締める",
            "example_good_1": "私が{role_name}を志望するのは、事業と技術をつなぐ役割に魅力を感じるからだ。",
            "example_good_2": "研究で論点を整理しながら前に進めた経験を土台に、その役割で価値を出したい。",
            "example_bad": "私は{role_name}を選んだ理由は、{role_name}に興味があるからだ。",
        },
    },
    "work_values": {
        "label": "働くうえで大切にしている価値観",
        "requires_company_rag": False,
        "grounding_level": "light",
        "description": "仕事に対する価値観や姿勢を述べる設問。",
        "purpose": "働くうえで大切にしている価値観を、経験とともに一貫して示す。",
        "required_elements": ["価値観の核", "根拠になる経験", "仕事での表れ方"],
        "anti_patterns": [
            "価値観の言葉だけで根拠がない",
            "抽象論が続き本人らしさが見えない",
            "企業接続を無理に入れて主題がぼける",
        ],
        "recommended_structure": {
            "short": "1文目で価値観の核、2文目で根拠経験、必要なら3文目で仕事との接点を置く",
            "three_sentence_close_on_short_band": True,
        },
        "evaluation_checks": {
            "repeated_opening_pattern": r"(大切にしている価値観|働くうえで大切にしていること)は",
            "head_sentence_window": 2,
            "head_focus_pattern": r"大切|重視|価値観|信念|軸|譲れない|譲りたくない|姿勢|こだわり|大事にしている|考え方|モットー|指針|プライド|根底|念頭|秉|大切にしたい|尊重",
            "answer_focus_message": "冒頭で大切にしている価値観や姿勢の核を短く示してください。",
        },
        "retry_guidance": {
            "under_min": "{target_hint} を狙い、価値観から経験、仕事での表れ方へのつながりを補う",
            "answer_focus": "1文目で価値観の核を短く示す",
            "grounding": "価値観が仕事でどう表れるかの接点を1点示す",
            "quantify": "価値観の抽象説明だけで終えず、行動の対象・範囲・頻度を具体化し、元回答にある数値は保持する",
        },
        "company_usage": "assistive",
        "fact_priority": "self",
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


def grounding_level_to_policy(level: str) -> str:
    return "required" if level in {"standard", "deep"} else "assistive"


def get_template_default_grounding_level(template_type: str) -> str:
    template_def = TEMPLATE_DEFS.get(template_type, TEMPLATE_DEFS["basic"])
    return str(template_def.get("grounding_level") or "light")


def get_template_labels() -> dict[str, str]:
    """Get template type to label mapping for frontend."""
    return {k: v["label"] for k, v in TEMPLATE_DEFS.items()}


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


def get_template_company_usage(template_type: str) -> str:
    return str(get_template_spec(template_type).get("company_usage") or "assistive")


def get_template_fact_priority(template_type: str) -> str:
    return str(get_template_spec(template_type).get("fact_priority") or "mixed")


def _format_template_required_elements(template_type: str) -> str:
    items = [str(item).strip() for item in get_template_spec(template_type).get("required_elements", []) if str(item).strip()]
    if not items:
        return ""
    return "\n".join(["【設問で落としてはいけない要素】", *[f"- {item}" for item in items]])


def _format_template_anti_patterns(template_type: str) -> str:
    items = [str(item).strip() for item in get_template_spec(template_type).get("anti_patterns", []) if str(item).strip()]
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
- 「貴社」「御社」等の敬称は使わない
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
                            "- 「貴社」「御社」等の企業敬称は使わない",
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
                            "- 「貴社」「御社」等の企業敬称は使わず、企業名や固有の事業・価値観で触れる",
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
- 「貴社のように〜で貢献」などの企業接続を無理に入れない（自然な場合のみ短く）
- 「貴社」「御社」等の企業敬称は使わない"""
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
- 使うとしても fit や活かし方を短く補助する程度にとどめる
- 「貴社」「御社」等の企業敬称は使わず、企業名や固有の事業・価値観で触れる"""
    return ""


# ---------------------------------------------------------------------------
# 施策 7: CAPEL-inspired self-count instruction for character length control
# ---------------------------------------------------------------------------


def _format_self_count_instruction(
    char_min: int | None,
    char_max: int | None,
    *,
    llm_model: str | None = None,
    length_fix_mode: bool = False,
) -> str:
    """Return a self-count instruction block inspired by CAPEL methodology.

    Guides the LLM to count characters during generation for better length compliance.
    This acts as a "floor raise" — actual validation is still done by the existing
    post-validation + retry system.
    """
    if not char_min and not char_max:
        return ""

    # Determine provider family for model-specific instructions
    model = (llm_model or "").lower()
    is_openai = "gpt" in model or "openai" in model or "o1" in model or "o3" in model
    is_gemini = "gemini" in model

    target_desc = ""
    if char_min and char_max:
        target_desc = f"{char_min}〜{char_max}字"
    elif char_max:
        target_desc = f"{char_max}字以内"
    elif char_min:
        target_desc = f"{char_min}字以上"

    if length_fix_mode and is_openai:
        return (
            f"\n【文字数セルフチェック】\n"
            f"- Draft → 文字数を数える → {target_desc} に収まるよう Adjust\n"
            f"- 調整時は意味を変えず、語尾・修飾の削除/追加で対応する"
        )

    if is_gemini:
        # Gemini benefits from paragraph allocation hints
        if char_min and char_max and char_max >= 300:
            mid = (char_min + char_max) // 2
            intro_alloc = mid // 4
            body_alloc = mid // 2
            close_alloc = mid - intro_alloc - body_alloc
            return (
                f"\n【文字数セルフチェック】\n"
                f"- 目標: {target_desc}\n"
                f"- 段落配分の目安: 導入{intro_alloc}字・本体{body_alloc}字・締め{close_alloc}字\n"
                f"- 書き終えたら文字数を数え、範囲外なら語尾・修飾で調整する"
            )

    return (
        f"\n【文字数セルフチェック】\n"
        f"- 目標: {target_desc}\n"
        f"- 書き終えたら文字数を数え、範囲外なら語尾・修飾で調整する"
    )


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
        "fact_preservation_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 元回答の数値・役職名・経験名を一切改変しない",
                "- 新しい実績、割合、役割、経験を足さない",
                "- 表現だけを整え、事実関係は元回答どおりに保つ",
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
        "quantify_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 抽象ラベルだけで終わらせず、行動の対象・範囲・頻度・比較を具体化する。ただし元回答にない数字は作らない",
                "- 強みや価値観は具体的な行動動詞で裏づけ、再現性が見える形にする",
            ]
        ),
        "structure_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 箇条書きや断片ではなく、つながった本文として書き切る",
                "- 1文ごとの役割を整理し、途中で切れないようにする",
            ]
        ),
        "positive_reframe_focus": "\n".join(
            [
                "【今回の修正フォーカス】",
                "- 自己否定語をそのまま残さず、元の事実を保ったまま前向きな表現へ言い換える",
                "- 準備・責任感・学習姿勢・確認力など、仕事で再現できる行動特性として示す",
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
    playbook = dict(get_template_spec(template_type).get("playbook") or {})
    if not playbook:
        return ""
    if not char_max or char_max < 120:
        return ""

    target = _format_target_char_window(
        char_min,
        char_max,
        original_len=original_len,
        llm_model=llm_model,
    )
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
    example_good_1 = str(playbook.get("example_good_1") or "").format(**template_kwargs)
    example_good_2 = str(playbook.get("example_good_2") or "").format(**template_kwargs)
    example_bad = str(playbook.get("example_bad") or "").format(**template_kwargs)

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
    if get_template_company_usage(template_type) != "required":
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
  - "draft": ガクチカ本文（だ・である調、改行・箇条書き・空行を入れず1段落の連続した文章）
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
</constraints>

{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}

<core_style>
{_build_contextual_rules(template_type, char_max, grounding_mode)}
</core_style>
{_format_prose_style_block(char_max)}

<template_focus>
{template_def["description"]}
</template_focus>
{_format_template_required_elements(template_type)}
{_format_template_anti_patterns(template_type)}
{_format_gakuchika_allocation_guide(template_type, char_min, char_max)}
{_format_gakuchika_student_expressions(template_type, student_expressions)}
{_format_gakuchika_fact_and_pii_rules(template_type)}
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
{_format_company_guidance(
    company_evidence_cards=company_evidence_cards,
    has_rag=has_rag,
    grounding_mode=grounding_mode,
    requires_company_rag=bool(template_def.get("requires_company_rag")),
    company_grounding=effective_company_grounding,
    generic_role_mode=False,
    evidence_coverage_level=evidence_coverage_level,
    template_type=template_type,
)}
{_format_reference_quality_guidance(reference_quality_block)}
{_format_required_template_playbook(
    template_type,
    char_min,
    char_max,
    honorific=honorific,
    role_name=role_name,
    intern_name=None,
    original_len=original_len,
    llm_model=llm_model,
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
    effective_grounding_level = grounding_level_override or get_template_default_grounding_level(
        template_type
    )
    effective_company_grounding = company_grounding_override or grounding_level_to_policy(
        effective_grounding_level
    )
    if grounding_mode == "none":
        company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
    elif effective_company_grounding == "assistive":
        company_mention_rule = f"企業に言及するときは企業名（{company_name or '企業名'}）や固有の事業・価値観で触れ、本文全体で2回までにとどめる。敬称（貴社・御社等）は使わない"
    else:
        company_mention_rule = f"企業名は本文中で1回までにとどめ、2回目以降は「{honorific}」を使う"
    target_stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    system_prompt = f"""あなたは{template_role}である。

<task>
提出できる改善案本文を1件だけ作る。
</task>

<output_contract>
- 出力は改善案本文のみ
- 説明、前置き、箇条書き、引用符、JSON、コードブロックは禁止
- だ・である調で統一
- 改行・空行を入れず、1段落の連続した文章として出力する
</output_contract>

<constraints>
- 設問に正面から答える
- 元回答の具体的事実は保ち、構成と伝わり方を改善する
- ユーザー事実にない経験・役割・成果・数字を足さない
- role_name があっても別職種や別コースを仮定しない
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 企業根拠カードの固有名詞・施策名・組織名・英字略語を本文でそのまま増殖させない
- 本文で企業に触れるときは、方向性・価値観・重視姿勢に抽象化する
- {company_mention_rule}
- 1文目は設問への答えを20〜45字で言い切り、長い前置きや設問の言い換えから入らない
- 設問の冒頭表現をそのまま繰り返して始めない（例:「〇〇を志望する理由は…」「〇〇でやりたいことは…」は不可）
- 末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない
- 最終文は具体的な行動や貢献で締め、抽象的な意気込みの羅列にしない
- 冗長な接続詞で文字数を浪費しない
{_format_self_count_instruction(char_min, char_max, llm_model=llm_model)}
</constraints>
{_format_assistive_grounding_block(effective_company_grounding=effective_company_grounding, grounding_mode=grounding_mode, company_name=company_name)}
{_format_proper_noun_policy(template_type=template_type, intern_name=intern_name, role_name=role_name)}
{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}

<core_style>
{_build_contextual_rules(template_type, char_max, grounding_mode)}
</core_style>
{_format_prose_style_block(char_max)}
<template_focus>
{template_def["description"]}
</template_focus>
{_format_template_required_elements(template_type)}
{_format_template_anti_patterns(template_type)}
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
{_format_question_specific_guidance(template_type, question)}
{_format_negative_reframe_guidance(template_type)}
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
{_format_user_fact_guidance(allowed_user_facts, template_type=template_type, char_max=char_max)}
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
    grounding_level_override: Optional[str] = None,
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
    effective_grounding_level = grounding_level_override or get_template_default_grounding_level(
        template_type
    )
    effective_company_grounding = company_grounding_override or grounding_level_to_policy(
        effective_grounding_level
    )
    if grounding_mode == "none":
        company_mention_rule = "この設問では企業名・企業敬称（貴社・御社・貴行等）を絶対に使わない。自分の経験と強みだけで完結させる"
    elif effective_company_grounding == "assistive":
        company_mention_rule = f"企業に言及するときは企業名（{company_name or '企業名'}）や固有の事業・価値観で触れ、本文全体で2回までにとどめる。敬称（貴社・御社等）は使わない"
    else:
        company_mention_rule = f"企業名は本文中で1回までにとどめ、2回目以降は「{honorific}」を使う"
    target_stage = "under_min_recovery" if length_control_mode == "under_min_recovery" else "default"
    system_prompt = f"""あなたは日本語のES編集者である。

<task>
元回答の事実を保ったまま、提出できる本文に安全に整える。
</task>

<output_contract>
- 出力は本文のみ
- だ・である調
- {_format_char_condition(char_min, char_max)}
- 改行・空行を入れず、1段落の連続した文章として出力する
</output_contract>

<constraints>
- 具体的事実は元回答とユーザー事実の範囲から出す
- 足りない情報は創作せず、一般化してつなぐ
- 企業情報は設問タイプに応じて使い、required でない設問では補助的にだけ使う
- 固有施策、社内体制、数値、成果を新しく断定しない
- {company_mention_rule}
- 1文目は設問への答えを20〜45字で言い切り、長い前置きや設問の言い換えから入らない
- 設問の冒頭表現をそのまま繰り返して始めない
- 末尾で同じ文末表現（〜したい、〜と考える 等）を2文連続で使わない
- 最終文は具体的な行動や貢献で締める
{_format_self_count_instruction(char_min, char_max, llm_model=llm_model)}
</constraints>
{_format_assistive_grounding_block(effective_company_grounding=effective_company_grounding, grounding_mode=grounding_mode, company_name=company_name)}
{_format_proper_noun_policy(template_type=template_type, intern_name=intern_name, role_name=role_name)}
{_format_length_policy_block(char_min, char_max, stage=target_stage, original_len=original_len, llm_model=llm_model)}

<core_style>
{_build_contextual_rules(template_type, char_max, grounding_mode)}
</core_style>
{_format_prose_style_block(char_max)}
{_format_template_required_elements(template_type)}
{_format_template_anti_patterns(template_type)}
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
{_format_question_specific_guidance(template_type, question)}
{_format_negative_reframe_guidance(template_type)}
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
{_format_user_fact_guidance(allowed_user_facts, template_type=template_type, char_max=char_max)}
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
    effective_company_grounding: str = "assistive",
    grounding_mode: str = "none",
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
                if char_min and char_min >= 150 and under_shortfall >= 30:
                    mode_instructions.append(
                        "意味を変えず、既にある経験・職種・企業接点のつながりを補う短い文を1〜2文まで足し、必要なら補足句も使って指定字数に収める"
                    )
                else:
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
        elif mode == "quantify_focus":
            mode_instructions.append(
                "新事実を足さず、行動の対象・範囲・頻度・比較を具体化し、元回答にある数値は保持する。元回答にない数字は作らない"
            )
        elif mode == "answer_focus":
            mode_instructions.append("1文目で設問への答えの核がすぐ伝わるよう、冒頭の一文だけを優先して整える")
        elif mode == "structure_focus":
            mode_instructions.append("箇条書きや断片を避け、つながった本文として読める形へ最小限で整える")
    if not mode_instructions:
        mode_instructions.append("意味を変えず、本文の崩れだけを最小限で整える")
    if grounding_mode == "none":
        mode_instructions.append("企業名・企業敬称（貴社・御社等）を絶対に使わない")
    elif effective_company_grounding == "assistive":
        mode_instructions.append("企業敬称（貴社・御社等）は使わず、企業名や固有の事業・価値観で触れる")
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
{_format_self_count_instruction(char_min, char_max, llm_model=llm_model, length_fix_mode=True)}
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
{_format_negative_reframe_guidance(template_type)}
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
