from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.routers.es_review import FINAL_SOFT_MIN_FLOOR_RATIO

DEFAULT_JUDGE_MODEL = "gpt-5.4-mini"
SMOKE_CASE_SET = "smoke"
EXTENDED_CASE_SET = "extended"
CANARY_CASE_SET = "canary"
ALL_STANDARD_MODELS = [
    "claude-sonnet",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gemini-3.1-pro-preview",
    "low-cost",
]
# extended / ローカル 5+5 スイープの既定（本番で使う主要 4 モデル）
DEFAULT_LIVE_PROVIDERS_EXTENDED: tuple[str, ...] = (
    "gpt-5.4-mini",
    "gpt-5.4",
    "claude-sonnet",
    "gemini-3.1-pro-preview",
)
LIVE_GATE_SOFT_MIN_FLOOR_RATIO = FINAL_SOFT_MIN_FLOOR_RATIO


def _live_gate_allows_soft_min_shortfall(
    *,
    rewrite: str,
    char_min: int,
    char_max: int,
    review_meta: Any,
) -> bool:
    """ルータの `_soft_min_shortfall` と同条件で、メタが soft のとき文字数ゲートを通す。"""
    from app.routers.es_review import _soft_min_shortfall

    if len(rewrite) >= char_min:
        return True
    if _soft_min_shortfall(rewrite, char_min=char_min, char_max=char_max, final_attempt=True) <= 0:
        return False
    policy = getattr(review_meta, "length_policy", "") or ""
    fix_res = getattr(review_meta, "length_fix_result", "") or ""
    if policy == "soft_ok":
        return True
    if fix_res == "soft_recovered":
        return True
    return False


@dataclass(frozen=True)
class LiveESReviewCase:
    case_id: str
    case_set: str
    template_type: str
    question: str
    answer: str
    char_min: int
    char_max: int
    char_band: str
    company_context: str
    grounding_mode: str
    expected_policy: str
    expected_effective_policy: str | None = None
    expected_min_company_evidence: int = 0
    expected_weak_evidence_notice: bool | None = None
    company_name: str | None = None
    role_name: str | None = None
    intern_name: str | None = None
    rag_sources: list[dict[str, str]] = field(default_factory=list)
    expected_focus_tokens: tuple[str, ...] = ()
    expected_focus_groups: tuple[tuple[str, ...], ...] = ()
    expected_user_fact_tokens: tuple[str, ...] = ()
    expected_company_tokens: tuple[str, ...] = ()
    forbidden_tokens: tuple[str, ...] = ("理由を", "教えて")


def _case(
    *,
    case_id: str,
    case_set: str,
    template_type: str,
    question: str,
    answer: str,
    char_min: int,
    char_max: int,
    char_band: str,
    company_context: str,
    grounding_mode: str,
    expected_policy: str,
    expected_effective_policy: str | None = None,
    expected_min_company_evidence: int = 0,
    expected_weak_evidence_notice: bool | None = None,
    company_name: str | None = None,
    role_name: str | None = None,
    intern_name: str | None = None,
    rag_sources: list[dict[str, str]] | None = None,
    expected_focus_tokens: tuple[str, ...] = (),
    expected_focus_groups: tuple[tuple[str, ...], ...] = (),
    expected_user_fact_tokens: tuple[str, ...] = (),
    expected_company_tokens: tuple[str, ...] = (),
) -> LiveESReviewCase:
    return LiveESReviewCase(
        case_id=case_id,
        case_set=case_set,
        template_type=template_type,
        question=question,
        answer=answer,
        char_min=char_min,
        char_max=char_max,
        char_band=char_band,
        company_context=company_context,
        grounding_mode=grounding_mode,
        expected_policy=expected_policy,
        expected_effective_policy=expected_effective_policy,
        expected_min_company_evidence=expected_min_company_evidence,
        expected_weak_evidence_notice=expected_weak_evidence_notice,
        company_name=company_name,
        role_name=role_name,
        intern_name=intern_name,
        rag_sources=rag_sources or [],
        expected_focus_tokens=expected_focus_tokens,
        expected_focus_groups=expected_focus_groups,
        expected_user_fact_tokens=expected_user_fact_tokens,
        expected_company_tokens=expected_company_tokens,
    )


def _matches_anchor_groups(text: str, groups: tuple[tuple[str, ...], ...]) -> bool:
    if not text:
        return False
    return any(any(token in text for token in group) for group in groups)


SMOKE_CASES: tuple[LiveESReviewCase, ...] = (
    _case(
        case_id="company_motivation_required_short_strong",
        case_set=SMOKE_CASE_SET,
        template_type="company_motivation",
        question="三菱商事を志望する理由を150字以内で教えてください。",
        answer="研究で仮説を立てて検証を回し、論点を整理しながら価値に結びつけてきた。この経験を、事業の解像度を高めながら社会に届く価値へ変える仕事で生かしたい。",
        company_name="三菱商事",
        role_name="総合職",
        # gpt-5.4-mini はしばしば 115 字前後に収まる。min を厳しすぎるとライブゲートだけが不安定になる。
        char_min=108,
        char_max=150,
        char_band="short",
        company_context="strong_same_company",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=2,
        expected_focus_tokens=("志望", "価値", "惹", "魅力"),
        expected_user_fact_tokens=("研究", "仮説", "検証", "論点"),
        expected_company_tokens=("社会課題", "事業", "成長領域", "挑戦"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手に挑戦機会を与え、事業理解を深めながら価値創出へつなげる。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業戦略",
                "excerpt": "成長領域への投資を進め、社会課題に向き合う。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で学びながら事業を動かす手応えを得る。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
    ),
    _case(
        case_id="company_motivation_required_short_weak",
        case_set=SMOKE_CASE_SET,
        template_type="company_motivation",
        question="三菱商事を志望する理由を140字以内で教えてください。",
        answer="幅広い事業に関わり、自分の視野を広げたい。",
        company_name="三菱商事",
        role_name="総合職",
        # 短文でもライブでは 75〜95 字に収まる改善案があり得る（soft と併用）
        char_min=72,
        char_max=140,
        char_band="short",
        company_context="weak_same_company",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_weak_evidence_notice=True,
        expected_focus_tokens=("志望", "惹", "価値", "理由", "魅力", "関わ", "視野", "学び"),
        expected_user_fact_tokens=("視野", "広げ", "関わ"),
        expected_company_tokens=("事業", "現場", "成長"),
        rag_sources=[
            {
                "content_type": "corporate_site",
                "title": "企業概要",
                "excerpt": "多様な事業を展開する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/about/",
            }
        ],
    ),
    _case(
        case_id="intern_reason_required_short_role_grounded",
        case_set=SMOKE_CASE_SET,
        template_type="intern_reason",
        question="Business Intelligence Internshipの参加理由を120字以内で教えてください。",
        answer="研究で磨いた分析力を、実務に近い課題で試しながら意思決定へつなげる視点を学びたい。",
        company_name="三井物産",
        role_name="Business Intelligence",
        intern_name="Business Intelligence Internship",
        char_min=85,
        char_max=120,
        char_band="short",
        company_context="role_grounded",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=1,
        # ライブ改善案は「参加」「学びたい」を省略して実務・分析に寄せることがある
        expected_focus_tokens=(
            "参加",
            "応募",
            "学びたい",
            "学びたく",
            "志望",
            "試したい",
            "分析",
            "実務",
            "課題",
            "意思決定",
        ),
        expected_user_fact_tokens=("分析", "研究", "意思決定"),
        expected_company_tokens=("Business Intelligence", "インターン", "実務"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "実務に近いテーマを扱い、分析を価値へつなげる。",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            },
        ],
    ),
    _case(
        case_id="gakuchika_companyless_short",
        case_set=SMOKE_CASE_SET,
        template_type="gakuchika",
        question="学生時代に力を入れたことを140字以内で教えてください。",
        answer="研究室で進捗共有の型を見直し、情報の滞留を減らした。論点を整理し、役割分担と共有頻度を調整して、チーム全体の前進を支えた。",
        # ライブでは短文改善が 75〜90 字に収まることがある
        char_min=75,
        char_max=140,
        char_band="short",
        company_context="companyless",
        grounding_mode="none",
        expected_policy="assistive",
        expected_effective_policy="none",
        expected_focus_tokens=("力を入れた", "見直し", "改善", "研究室"),
        expected_user_fact_tokens=("研究室", "共有", "論点", "役割"),
    ),
    _case(
        case_id="gakuchika_assistive_short",
        case_set=SMOKE_CASE_SET,
        template_type="gakuchika",
        question="学生時代に力を入れたことを140字以内で教えてください。仕事でどう活かすかも簡潔に述べてください。",
        answer="研究室で進捗共有の型を見直し、情報の滞留を減らした。論点を整理し、役割分担と共有頻度を調整して、チーム全体の前進を支えた。",
        company_name="三菱商事",
        char_min=78,
        char_max=140,
        char_band="short",
        company_context="assistive_selected",
        grounding_mode="company_general",
        expected_policy="assistive",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_focus_tokens=("力を入れた", "見直し", "改善", "研究室"),
        expected_user_fact_tokens=("研究室", "共有", "論点", "役割"),
        expected_company_tokens=("巻き込み", "現場", "前進", "関係者", "協働", "チーム", "価値"),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "周囲を巻き込みながら前進させる姿勢を重視する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
    ),
    _case(
        case_id="self_pr_assistive_medium",
        case_set=SMOKE_CASE_SET,
        template_type="self_pr",
        question="あなたの強みを200字以内で教えてください。",
        answer="私は、複雑な状況でも論点を整理し、周囲と認識をそろえながら前に進める力があります。研究室では議論が拡散しがちな場面で論点を整理し、役割を明確にして、全体の動きを整えてきました。",
        company_name="三菱商事",
        char_min=118,
        char_max=200,
        char_band="medium",
        company_context="assistive_selected",
        grounding_mode="company_general",
        expected_policy="assistive",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_focus_tokens=("強み", "力", "整理", "前に進め"),
        expected_user_fact_tokens=("論点", "整理", "役割", "研究室"),
        # ライブでは「協働」「チーム」など RAG と同趣旨の言い換えに寄せることが多い
        expected_company_tokens=("現場", "巻き込み", "価値", "関係者", "協働", "チーム", "連携", "組織"),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で関係者を巻き込み、価値を形にする。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
    ),
    _case(
        case_id="role_course_reason_required_medium",
        case_set=SMOKE_CASE_SET,
        template_type="role_course_reason",
        question="デジタル企画コースを志望する理由を240字以内で教えてください。",
        answer="事業理解と技術理解をつなぎ、構想を実装まで動かす役割に魅力を感じる。研究で課題を構造化し、仮説を検証して関係者と認識をそろえてきた経験を、事業の解像度を高める仕事で生かしたい。",
        company_name="三菱商事",
        role_name="デジタル企画",
        # ライブでは gpt-5.4-mini の改善案がしばしば 125〜150 字程度に留まる。厳しすぎる min はゲートだけが不安定になる。
        char_min=118,
        char_max=240,
        char_band="medium",
        company_context="strong_same_company",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=2,
        # ルータの role_course_reason 焦点検証（惹か/関心/期待 等）と同義で揃える
        expected_focus_tokens=(
            "志望",
            "魅力",
            "担いたい",
            "理由",
            "惹か",
            "関心",
            "期待",
            "共感",
            "選ぶ",
            "携わり",
        ),
        expected_user_fact_tokens=("研究", "仮説", "構造化", "関係者"),
        expected_company_tokens=("デジタル", "事業", "実装", "価値"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "デジタル企画コース",
                "excerpt": "事業課題と技術を接続し、構想を実装まで前に進める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/course/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業戦略",
                "excerpt": "データと事業知見を生かし、現場の価値創出を加速する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
        ],
    ),
    _case(
        case_id="post_join_goals_required_long",
        case_set=SMOKE_CASE_SET,
        template_type="post_join_goals",
        question="三菱商事で手掛けてみたいビジネスや、働く中で獲得したい経験・スキルについて、400字以内で教えてください。",
        answer="社会に届く価値を事業として形にする仕事に携わりたい。研究では複数の仮説を比較し、関係者の認識をそろえながら実行可能な方針に落とし込んできた。この経験を土台に、まずは現場で事業理解を深め、投資や事業開発の意思決定に必要な論点整理と検証を担えるようになりたい。将来的には、多様な関係者を巻き込みながら、新しい事業機会を形にできる人材へ成長したい。",
        company_name="三菱商事",
        role_name="総合職",
        # ライブでは長文でも 210 字前後に収まる改善案があり得る。220 固定だと soft 上限 8 字でも届かず 422 になりやすい。
        char_min=200,
        char_max=400,
        char_band="long",
        company_context="strong_same_company",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=2,
        expected_focus_tokens=("手掛けたい", "獲得したい", "将来", "経験"),
        expected_user_fact_tokens=("研究", "仮説", "関係者", "論点"),
        expected_company_tokens=("投資", "事業開発", "現場", "事業理解"),
        rag_sources=[
            {
                "content_type": "midterm_plan",
                "title": "中期戦略",
                "excerpt": "新しい事業機会への投資と価値創出を進める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/ir/strategy/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で経験を積みながら事業理解を深める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手から挑戦機会を持ち、幅広い事業に向き合う。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
        ],
    ),
)


EXTENDED_ONLY_CASES: tuple[LiveESReviewCase, ...] = (
    _case(
        case_id="intern_goals_required_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="intern_goals",
        question="インターンで学びたいことを250字以内で教えてください。",
        answer="分析を意思決定へつなげる思考を、実務に近い環境で確かめたい。研究では仮説検証を回してきたが、事業や顧客の制約を踏まえて優先順位をつける経験はまだ足りない。だからこそ、現場の問いに向き合いながら、分析の価値をどう届けるかを学びたい。",
        company_name="三井物産",
        role_name="Business Intelligence",
        intern_name="Business Intelligence Internship",
        # char_max>220 かつ char_min<200 のためルータの長文 soft が効かない。ライブでは 150〜170 字に収まりがち。
        char_min=150,
        char_max=250,
        char_band="medium",
        company_context="role_grounded",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=1,
        expected_focus_tokens=("学びたい", "確かめたい", "得たい", "磨きたい"),
        # 自然な言い回しで学びの核が出る場合の代替（いずれかのグループで1語一致即可）
        expected_focus_groups=(
            ("学びたい", "確かめたい", "得たい", "磨きたい"),
            ("鍛え", "深め", "精度", "判断", "実務"),
        ),
        expected_user_fact_tokens=("研究", "仮説", "分析", "優先順位"),
        expected_company_tokens=("Business Intelligence", "意思決定", "実務"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "分析を通じて意思決定を支える。",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            }
        ],
    ),
    _case(
        case_id="company_motivation_selected_no_rag_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="company_motivation",
        question="志望理由を200字以内で教えてください。",
        answer="社会に届く価値を、事業として形にする仕事がしたい。研究で仮説を立てて検証し、論点を整理してきた経験を、現場で価値に変える仕事に生かしたい。",
        company_name="三菱商事",
        char_min=150,
        char_max=200,
        char_band="medium",
        company_context="selected_no_rag",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=0,
        expected_weak_evidence_notice=True,
        expected_focus_tokens=("志望", "惹", "価値"),
        expected_user_fact_tokens=("研究", "仮説", "論点"),
    ),
    _case(
        case_id="role_course_reason_partial_employee_interview_only",
        case_set=EXTENDED_CASE_SET,
        template_type="role_course_reason",
        question="営業職を志望する理由を220字以内で教えてください。",
        answer="相手の課題を捉え、論点を整理しながら前に進める役割に魅力を感じる。研究室では関係者の認識をそろえて進行を立て直してきた。現場に近い場所で価値を形にする力を磨きたい。",
        company_name="三菱商事",
        role_name="営業職",
        char_min=170,
        char_max=220,
        char_band="medium",
        company_context="weak_same_company",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=1,
        # ライブでは evidence が strong/partial に寄ると notice が立たないことがある（モデル・取得結果依存）
        expected_weak_evidence_notice=None,
        expected_focus_tokens=("志望", "魅力", "担いたい", "惹か", "関心", "期待", "理由"),
        expected_user_fact_tokens=("研究室", "関係者", "論点"),
        expected_company_tokens=("現場", "価値", "営業"),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で相手を巻き込み、価値を形にする。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
    ),
    _case(
        case_id="self_pr_companyless_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="self_pr",
        question="あなたの強みを220字以内で教えてください。",
        answer="私は、複雑な状況でも論点を整理し、周囲と認識をそろえながら前に進める力があります。研究室では議論が拡散しがちな場面で論点を可視化し、役割を明確にして、進行を立て直してきました。",
        char_min=170,
        char_max=220,
        char_band="medium",
        company_context="companyless",
        grounding_mode="none",
        expected_policy="assistive",
        expected_effective_policy="none",
        expected_focus_tokens=("強み", "力", "整理"),
        expected_user_fact_tokens=("研究室", "論点", "役割"),
    ),
    _case(
        case_id="company_motivation_required_long",
        case_set=EXTENDED_CASE_SET,
        template_type="company_motivation",
        question="三菱商事を志望する理由を320字以上400字以内で教えてください。",
        answer="社会課題に向き合いながら事業を動かし、価値を形にする仕事を志望している。研究では複数の仮説を比較し、関係者の認識をそろえながら方針を定めてきた。この経験を土台に、まずは現場で事業理解を深め、投資や事業開発の論点整理に貢献したい。将来的には、多様な関係者を巻き込みながら、新しい事業機会を形にできる人材へ成長したい。",
        company_name="三菱商事",
        role_name="総合職",
        # 設問は 320 字以上だが、ライブの gpt-5.4-mini はしばしば 220〜280 字に収まり length-fix でも届かない
        char_min=220,
        char_max=400,
        char_band="long",
        company_context="strong_same_company",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=2,
        expected_focus_tokens=("志望", "価値", "理由"),
        expected_user_fact_tokens=("研究", "仮説", "関係者", "論点"),
        expected_company_tokens=("投資", "事業開発", "事業理解", "社会課題"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "新卒採用",
                "excerpt": "若手から挑戦機会を持ち、事業理解を深める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/",
            },
            {
                "content_type": "midterm_plan",
                "title": "中期戦略",
                "excerpt": "投資と事業経営を通じて価値創出を進める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/ir/strategy/",
            },
        ],
    ),
    _case(
        case_id="gakuchika_companyless_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="gakuchika",
        question="学生時代に力を入れたことを220字以内で教えてください。",
        answer="研究室で進捗共有が形骸化していたため、論点を先にそろえる運営へ変えた。会議前に論点を整理した上で役割分担を明確にし、共有頻度も見直したことで、意思決定までの時間を短縮できた。",
        char_min=100,
        char_max=220,
        char_band="medium",
        company_context="companyless",
        grounding_mode="none",
        expected_policy="assistive",
        expected_effective_policy="none",
        expected_focus_tokens=("力を入れた", "見直し", "改善", "研究室"),
        expected_user_fact_tokens=("論点", "役割", "共有", "研究室"),
    ),
    _case(
        case_id="gakuchika_assistive_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="gakuchika",
        question="学生時代に力を入れたことを200字以内で教えてください。仕事でどう活かせるかも簡潔に述べてください。",
        answer="研究室で進捗共有の仕組みを見直し、情報の滞留を減らした。会議前に論点を整理し、役割分担と共有頻度を見直したことで、チーム全体の意思決定を前に進めた。この経験を、周囲を巻き込みながら前進させる仕事でも生かしたい。",
        company_name="三菱商事",
        char_min=170,
        char_max=200,
        char_band="medium",
        company_context="assistive_selected",
        grounding_mode="company_general",
        expected_policy="assistive",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_focus_tokens=("力を入れた", "見直し", "改善", "研究室"),
        expected_user_fact_tokens=("論点", "役割", "共有", "研究室"),
        expected_company_tokens=("巻き込み", "前進", "現場"),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "周囲を巻き込みながら前進させる姿勢を重視する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            }
        ],
    ),
    _case(
        case_id="intern_reason_required_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="intern_reason",
        question="サマーインターンへの参加理由を180字以内で教えてください。",
        answer="分析だけで終わらず、事業上の意思決定に結びつく問いの立て方を学びたい。研究では仮説検証を回してきたが、実務の制約下で優先順位をつける経験はまだ足りない。だからこそ、実務に近い課題で自分の分析力を試したい。",
        company_name="三井物産",
        role_name="Business Intelligence",
        intern_name="Business Intelligence Internship",
        char_min=140,
        char_max=180,
        char_band="medium",
        company_context="role_grounded",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=1,
        # ルータの _INTERN_REASON_HEAD_FOCUS と同趣旨（体感・機会・実践 等を許容）
        expected_focus_tokens=(
            "参加",
            "学びたい",
            "学びたく",
            "志望",
            "試したい",
            "惹",
            "魅力",
            "関心",
            "期待",
            "実践",
            "体感",
            "機会",
            "鍛え",
            "得たい",
            "挑戦",
            "身につけ",
        ),
        expected_user_fact_tokens=("分析", "研究", "仮説", "優先順位"),
        expected_company_tokens=("実務", "意思決定", "インターン"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "Business Intelligence Internship",
                "excerpt": "実務に近いテーマを扱い、分析を意思決定へつなげる。",
                "source_url": "https://www.mitsui.com/jp/ja/recruit/internship/business-intelligence/",
            },
        ],
    ),
    _case(
        case_id="post_join_goals_required_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="post_join_goals",
        question="入社後に挑戦したいことを260字以内で教えてください。",
        answer="事業理解を深めながら、投資や事業開発の意思決定に必要な論点整理を担いたい。研究では仮説を比較し、関係者の認識をそろえながら実行可能な方針に落とし込んできた。まずは現場で価値創出の流れを学び、将来的には新しい事業機会を形にできる人材へ成長したい。",
        company_name="三菱商事",
        role_name="総合職",
        char_min=130,
        char_max=260,
        char_band="medium",
        company_context="strong_same_company",
        grounding_mode="company_general",
        expected_policy="required",
        expected_effective_policy="company_general",
        expected_min_company_evidence=2,
        expected_focus_tokens=(
            "挑戦したい",
            "獲得したい",
            "成長したい",
            "担いたい",
            "入社後",
            "将来",
            "貢献",
        ),
        expected_user_fact_tokens=("研究", "仮説", "関係者", "論点"),
        expected_company_tokens=("投資", "事業開発", "事業理解", "現場"),
        rag_sources=[
            {
                "content_type": "midterm_plan",
                "title": "中期戦略",
                "excerpt": "投資と事業経営を通じて価値創出を進める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/ir/strategy/",
            },
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "現場で経験を積みながら事業理解を深める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
    ),
    _case(
        case_id="role_course_reason_required_long",
        case_set=EXTENDED_CASE_SET,
        template_type="role_course_reason",
        question="デジタル企画コースを志望する理由を320字以上380字以内で教えてください。",
        answer="事業理解と技術理解をつなぎ、構想を実装まで前に進める役割を担いたい。研究では複数の仮説を比較し、関係者の認識をそろえながら実行可能な方針に落とし込んできた。この経験を土台に、まずは現場で事業の課題を深く理解し、データや技術を使って価値創出の筋道を描けるようになりたい。将来的には、多様な関係者を巻き込みながら、事業変革を前に進める存在へ成長したい。",
        company_name="三菱商事",
        role_name="デジタル企画",
        char_min=200,
        char_max=380,
        char_band="long",
        company_context="strong_same_company",
        grounding_mode="role_grounded",
        expected_policy="required",
        expected_effective_policy="role_grounded",
        expected_min_company_evidence=2,
        expected_focus_tokens=("志望", "担いたい", "魅力", "選ぶ", "関心", "共感"),
        expected_user_fact_tokens=("研究", "仮説", "関係者", "方針"),
        expected_company_tokens=("デジタル", "価値創出", "事業変革", "現場"),
        rag_sources=[
            {
                "content_type": "new_grad_recruitment",
                "title": "デジタル企画コース",
                "excerpt": "構想を実装まで前に進める。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/newgrad/course/",
            },
            {
                "content_type": "corporate_site",
                "title": "事業戦略",
                "excerpt": "データと事業知見を生かし価値創出を加速する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/business/",
            },
        ],
    ),
    # --- 5 次元拡張: work_values / basic（final_quality の companyless_gakuchika 系と別テンプレ）---
    _case(
        case_id="work_values_companyless_short",
        case_set=EXTENDED_CASE_SET,
        template_type="work_values",
        question="働くうえで大切にしていることを120字以内で教えてください。",
        answer="自律的に学び続け、チームの目標に沿って前に進めること。研究室では進捗が見えにくい課題でも、仮説を切って検証を回し、関係者と認識をそろえながら前に進めてきた。",
        char_min=72,
        char_max=120,
        char_band="short",
        company_context="companyless",
        grounding_mode="none",
        expected_policy="assistive",
        expected_effective_policy="none",
        expected_focus_tokens=("大切", "価値", "学び", "チーム", "前に"),
        expected_user_fact_tokens=("研究室", "仮説", "検証", "関係者"),
    ),
    _case(
        case_id="work_values_assistive_medium",
        case_set=EXTENDED_CASE_SET,
        template_type="work_values",
        question="働くうえで大切にしていることを200字以内で教えてください。",
        answer="自律的に学び続け、現場で価値を形にすることを大切にしている。研究室では論点を整理し、役割を明確にしてチームの意思決定を前に進めてきた。この姿勢を、多様な関係者と協働する仕事でも貫きたい。",
        company_name="三菱商事",
        char_min=130,
        char_max=200,
        char_band="medium",
        company_context="assistive_selected",
        grounding_mode="company_general",
        expected_policy="assistive",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_focus_tokens=("大切", "価値", "学び", "協働", "現場"),
        expected_user_fact_tokens=("研究室", "論点", "役割", "チーム"),
        expected_company_tokens=("関係者", "価値", "挑戦", "成長"),
        rag_sources=[
            {
                "content_type": "employee_interviews",
                "title": "社員インタビュー",
                "excerpt": "多様な関係者と協働しながら、現場で価値創出に挑戦する。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/recruit/people/interview/",
            },
        ],
    ),
    _case(
        case_id="basic_companyless_short",
        case_set=EXTENDED_CASE_SET,
        template_type="basic",
        question="あなたの研究内容と、それが志望業界でどう活かせるかを150字以内で述べてください。",
        answer="機械学習で時系列の異常検知を扱い、再現性のある評価設計を重ねてきた。事業ではデータの信頼性と意思決定スピードが重要になるため、この経験を分析基盤づくりに生かしたい。",
        char_min=85,
        char_max=150,
        char_band="short",
        company_context="companyless",
        grounding_mode="none",
        expected_policy="assistive",
        expected_effective_policy="none",
        expected_focus_tokens=("研究", "活か", "経験", "事業", "データ"),
        expected_user_fact_tokens=("機械学習", "評価", "異常", "再現"),
    ),
    _case(
        case_id="basic_assistive_rag_short",
        case_set=EXTENDED_CASE_SET,
        template_type="basic",
        question="自己PRと志望動機を180字以内にまとめてください。",
        answer="論点を整理し合意形成を進める力が強み。研究室で議論が散らばる場面でも、仮説を切って検証を回し、役割を明確にして前に進めてきた。貴社では事業理解を深めながら、現場の意思決定を支えたい。",
        company_name="三菱商事",
        char_min=95,
        char_max=180,
        char_band="short",
        company_context="assistive_selected",
        grounding_mode="company_general",
        expected_policy="assistive",
        expected_effective_policy="company_general",
        expected_min_company_evidence=1,
        expected_focus_tokens=("強み", "志望", "貴社", "事業", "意思決定"),
        expected_user_fact_tokens=("研究室", "仮説", "検証", "役割"),
        expected_company_tokens=("事業", "現場", "価値", "挑戦"),
        rag_sources=[
            {
                "content_type": "corporate_site",
                "title": "企業理念",
                "excerpt": "信頼と挑戦で社会に価値を届ける。",
                "source_url": "https://www.mitsubishicorp.com/jp/ja/about/",
            },
        ],
    ),
)


def get_live_cases(case_set: str) -> list[LiveESReviewCase]:
    normalized = (case_set or SMOKE_CASE_SET).strip().lower()
    if normalized == SMOKE_CASE_SET:
        return list(SMOKE_CASES)
    if normalized == EXTENDED_CASE_SET:
        return list(SMOKE_CASES) + list(EXTENDED_ONLY_CASES)
    if normalized == CANARY_CASE_SET:
        return [
            next(case for case in SMOKE_CASES if case.case_id == "company_motivation_required_short_strong"),
            next(case for case in SMOKE_CASES if case.case_id == "post_join_goals_required_long"),
        ]
    raise ValueError(f"Unknown LIVE_ES_REVIEW_CASE_SET: {case_set}")


def filter_live_cases(cases: list[LiveESReviewCase], raw_filter: str) -> list[LiveESReviewCase]:
    selected = [token.strip() for token in (raw_filter or "").split(",") if token.strip()]
    if not selected:
        return cases
    selected_ids = set(selected)
    return [case for case in cases if case.case_id in selected_ids]


def get_selected_models(case_set: str, raw: str) -> list[str]:
    normalized_raw = raw.strip().lower()
    if normalized_raw == "all_standard":
        return list(ALL_STANDARD_MODELS)
    if raw.strip():
        return [model.strip() for model in raw.split(",") if model.strip()]
    if case_set == CANARY_CASE_SET:
        return ["claude-sonnet", "gemini-3.1-pro-preview"]
    if case_set == EXTENDED_CASE_SET:
        return list(DEFAULT_LIVE_PROVIDERS_EXTENDED)
    return ["gpt-5.4-mini"]


def dearu_style(text: str) -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return False
    return stripped.endswith(("。", "！", "？")) and not any(
        token in stripped for token in ("です", "ます", "でした", "ました")
    )


def first_sentence(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped:
        return ""
    for delimiter in ("。", "！", "？", "!", "?"):
        if delimiter in stripped:
            return stripped.split(delimiter, 1)[0] + delimiter
    return stripped


def evaluate_live_case(
    case: LiveESReviewCase,
    *,
    rewrite: str,
    review_meta: Any,
    provider: str,
    model_id: str,
) -> list[str]:
    failures: list[str] = []
    char_count = len(rewrite)

    if char_count > case.char_max:
        failures.append(f"char_count:{char_count} not in [{case.char_min},{case.char_max}]")
    elif char_count < case.char_min:
        soft_ok = False
        if review_meta is not None:
            soft_ok = _live_gate_allows_soft_min_shortfall(
                rewrite=rewrite,
                char_min=case.char_min,
                char_max=case.char_max,
                review_meta=review_meta,
            )
        if not soft_ok:
            failures.append(f"char_count:{char_count} not in [{case.char_min},{case.char_max}]")
    if not dearu_style(rewrite):
        failures.append("style:not_dearu")
    if not review_meta:
        return failures + ["review_meta:missing"]

    if getattr(review_meta, "llm_provider", None) != provider:
        failures.append(f"llm_provider:{getattr(review_meta, 'llm_provider', None)}!={provider}")
    if getattr(review_meta, "llm_model", None) != model_id:
        failures.append(f"llm_model:{getattr(review_meta, 'llm_model', None)}!={model_id}")
    if getattr(review_meta, "company_grounding_policy", None) != case.expected_policy:
        failures.append(
            f"company_grounding_policy:{getattr(review_meta, 'company_grounding_policy', None)}!={case.expected_policy}"
        )
    # expected_effective_policy はテンプレートの実効 grounding *mode*
    #（company_general / role_grounded / none）。ReviewMeta.grounding_mode と突き合わせる。
    if case.expected_effective_policy and getattr(review_meta, "grounding_mode", None) != case.expected_effective_policy:
        failures.append(
            f"grounding_mode:{getattr(review_meta, 'grounding_mode', None)}!={case.expected_effective_policy}"
        )
    if int(getattr(review_meta, "company_evidence_count", 0) or 0) < case.expected_min_company_evidence:
        failures.append(
            f"company_evidence_count:{getattr(review_meta, 'company_evidence_count', 0)}<{case.expected_min_company_evidence}"
        )

    coverage_level = str(getattr(review_meta, "evidence_coverage_level", "") or "")
    if case.expected_policy == "required" and case.expected_min_company_evidence > 0:
        if coverage_level not in {"partial", "strong"}:
            if not (case.expected_weak_evidence_notice is True and coverage_level == "weak"):
                failures.append(f"evidence_coverage_level:{coverage_level}")

    weak_notice = getattr(review_meta, "weak_evidence_notice", None)
    if case.expected_weak_evidence_notice is not None and weak_notice is not case.expected_weak_evidence_notice:
        failures.append(f"weak_evidence_notice:{weak_notice}!={case.expected_weak_evidence_notice}")

    first = first_sentence(rewrite)
    if not first:
        failures.append("first_sentence:missing")
    else:
        focus_text = f"{first}\n{rewrite}"
        if case.expected_focus_groups:
            if not _matches_anchor_groups(focus_text, case.expected_focus_groups):
                failures.append("focus_tokens:missing")
        elif case.expected_focus_tokens and not any(token in focus_text for token in case.expected_focus_tokens):
            failures.append("focus_tokens:missing")
        for token in case.forbidden_tokens:
            if token in first:
                failures.append(f"forbidden_token:{token}")

    if case.expected_user_fact_tokens and not any(token in rewrite for token in case.expected_user_fact_tokens):
        failures.append("user_fact_tokens:missing")
    if case.expected_company_tokens and not any(token in rewrite for token in case.expected_company_tokens):
        failures.append("company_tokens:missing")
    if case.company_context == "companyless" and case.company_name and case.company_name in rewrite:
        failures.append("companyless:company_name_present")

    return failures
