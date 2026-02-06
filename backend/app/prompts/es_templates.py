"""
ES Template Definitions and Prompt Builder

Template-based ES review with company RAG source integration.
Each template specifies:
- keyword_count: Number of company keywords to use from RAG
- require_strengthen_points: Whether to suggest self-strengthening points
- requires_company_rag: Whether company RAG data is required
- extra_fields: Additional fields required for this template (intern_name, role_name)
"""

from typing import Optional
from pathlib import Path

BASIC_TEMPLATE_PATH = (
    Path(__file__).resolve().parents[3] / "templates" / "00_basic_template.md"
)
try:
    BASIC_TEMPLATE_TEXT = BASIC_TEMPLATE_PATH.read_text(encoding="utf-8")
except Exception:
    BASIC_TEMPLATE_TEXT = None

# Template definitions
TEMPLATE_DEFS = {
    "basic": {
        "label": "汎用ES添削",
        "keyword_count": 2,
        "require_strengthen_points": False,
        "requires_company_rag": True,
        "description": "設問への適合性、企業理解、自己アピール、論理性を総合的に評価。",
    },
    "company_motivation": {
        "label": "企業志望理由",
        "keyword_count": 2,
        "require_strengthen_points": False,
        "requires_company_rag": True,
        "description": "企業への志望理由を述べる設問。企業の特徴・事業・価値観との接点を示す。",
    },
    "intern_reason": {
        "label": "インターン志望理由",
        "keyword_count": 0,
        "require_strengthen_points": True,
        "requires_company_rag": True,
        "description": "インターンへの参加理由を述べる設問。参加目的と自己成長の接点を示す。",
        "extra_fields": ["intern_name"],
    },
    "intern_goals": {
        "label": "インターンでやりたいこと・学びたいこと",
        "keyword_count": 2,
        "require_strengthen_points": False,
        "requires_company_rag": True,
        "description": "インターンで達成したい目標や学びたいことを述べる設問。",
        "extra_fields": ["intern_name"],
    },
    "gakuchika": {
        "label": "ガクチカ",
        "keyword_count": 0,
        "require_strengthen_points": True,
        "requires_company_rag": False,
        "description": "学生時代に力を入れたことを述べる設問。STAR形式で具体的に。",
    },
    "post_join_goals": {
        "label": "入社後やりたいこと",
        "keyword_count": 2,
        "require_strengthen_points": False,
        "requires_company_rag": True,
        "description": "入社後のキャリアビジョンや挑戦したいことを述べる設問。",
    },
    "role_course_reason": {
        "label": "職種・コース選択理由",
        "keyword_count": 0,
        "require_strengthen_points": False,
        "requires_company_rag": True,
        "description": "特定の職種やコースを選んだ理由を述べる設問。",
        "extra_fields": ["role_name"],
    },
    "work_values": {
        "label": "働くうえで大切にしている価値観",
        "keyword_count": 0,
        "require_strengthen_points": True,
        "requires_company_rag": False,
        "description": "仕事に対する価値観や姿勢を述べる設問。",
    },
}

# Template-specific prompt components
TEMPLATE_PROMPTS = {
    "basic": {
        "role": "就活ES作成のプロフェッショナル",
        "target": "ES",
        "aspects": """■ 設問への適合性
・設問の意図を正確に理解し、直接的な回答になっているか
・設問で求められている要素（理由、経験、目標等）が網羅されているか
・設問の指示（具体的に、簡潔に等）に従っているか

■ 企業理解・整合性
・企業が重視するキーワードが適切に2つ含まれているか
・企業が重視するキーワードが過剰（3つ以上）に含まれていないか
・企業の事業戦略・方向性・理念との整合性があるか
・競合他社との差別化ができているか

■ 自己アピール
・自分の経験・スキル・価値観と企業の接点が明確か
・抽象的な表現（「成長したい」「挑戦したい」）を具体化しているか
・具体的な数字やエピソードで裏付けているか
・学生らしい成長意欲と学習姿勢が表現されているか

■ 論理性・説得力
・主張と根拠が論理的に繋がっているか
・「なぜ」が明確に説明されているか
・読み手が納得できる内容か

■ 文章構成
・結論ファーストで書かれていて、読み手に伝えたいことが明確に伝わるか
・だ・である調で統一されているか
・冗長な部分や、省略しすぎて伝わりにくい部分はないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 設問への直接的な回答になっている
□ 企業研究に基づく具体的なキーワード2つ
□ 自分の経験・強みとの接点が明確
□ 論理的で説得力のある構成
□ だ・である調で統一
□ 指定文字数の範囲内""",
    },
    "company_motivation": {
        "role": "就活ESの志望理由作成のプロフェッショナル",
        "target": "企業の志望理由",
        "aspects": """■ 企業理解・整合性
・企業が重視するキーワードが適切に2つ含まれているか
・企業が重視するキーワードが過剰（3つ以上）に含まれていないか
・企業の事業戦略・方向性・理念との整合性があるか
・競合他社との明確な差別化ができているか（なぜこの企業でなければならないか）

■ 自己アピール
・自分の経験・スキル・価値観と企業の接点が明確か
・抽象的な表現（「成長したい」「挑戦したい」）を具体化しているか
・学生らしい成長意欲と学習姿勢が表現されているか

■ キャリアビジョン
・入社後に何をしたいかが具体的に示されているか
・キャリアビジョンと企業の事業・キャリアパスが接続されているか

■ 文章構成
・結論ファーストで書かれていて、読み手に伝えたいことが明確に伝わるか
・だ・である調で統一されているか
・冗長な部分や、省略しすぎて伝わりにくい部分はないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 「貴社でなければならない理由」が明確
□ 企業研究に基づく具体的なキーワード2つ
□ 自分の経験と企業の接点
□ 入社後の具体的なビジョン""",
    },
    "intern_reason": {
        "role": "就活ESのインターン志望理由作成のプロフェッショナル",
        "target": "インターン志望理由",
        "aspects": """■ インターン理解
・このインターンでしか得られない価値・経験を示しているか
・インターンプログラムの内容を正確に理解しているか
・他社インターンとの差別化ができているか

■ 自己との接続
・自分の現状の課題・不足点を認識しているか
・インターンでの成長イメージが具体的か
・自分の強み・素養がどう活きるか示しているか

■ 志望度・意欲
・企業への興味・関心が伝わるか
・本選考への接続を意識した内容か
・受け身でなく主体的な姿勢が見えるか

■ 文章構成
・設問への直接的な回答になっているか
・結論ファーストで書かれているか
・だ・である調で統一されているか
・簡潔で読みやすい文章か
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ このインターンでしか得られない価値が明確
□ 自分の課題と成長イメージの接続
□ 主体的な姿勢・意欲
□ 設問への直接的な回答""",
    },
    "intern_goals": {
        "role": "就活ESのインターン目標作成のプロフェッショナル",
        "target": "インターンでやりたいこと・学びたいこと",
        "aspects": """■ 目標の明確性
・やりたい仕事・業務領域が具体的に絞られているか（1〜2つ）
・経験したいことが明確か
・身につけたいことが具体的か
・そう考えた理由が論理的に説明されているか

■ 企業・インターンとの整合性
・企業が重視するキーワードが適切に2つ含まれているか
・企業が重視するキーワードが過剰（3つ以上）に含まれていないか
・企業の事業戦略・方向性との整合性があるか
・インターンプログラムの内容と目標が合致しているか
・競合他社との差別化ができているか

■ 自己との接続
・自分の経験・スキルと目標の接点が明確か
・インターン後のキャリアビジョンとの関連性があるか
・学生らしい成長意欲と学習姿勢が表現されているか

■ 文章構成
・結論ファーストで書かれていて、読み手に伝えたいことが明確に伝わるか
・だ・である調で統一されているか
・冗長な部分や、省略しすぎて伝わりにくい部分はないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 目標が1〜2つに絞られている
□ 企業の事業・プログラムとの接続
□ 自分の経験との接点が明確
□ 目標達成後のビジョン
□ 受け身でなく主体的な姿勢""",
    },
    "gakuchika": {
        "role": "就活ESのガクチカ作成のプロフェッショナル",
        "target": "ガクチカ",
        "aspects": """■ STAR形式の充実度
・Situation（状況）：活動期間、役割、人数等の具体的なイメージができるか
・Task（課題）：取り組んだ課題・目標が明確か
・Action（行動）：自分の役割と主体的な行動が明確か
・Result（結果）：具体的な成果・数字が示されているか

■ 企業適合性
・企業が重視する能力・スキルがアピールできているか
・企業文化・価値観との適合性があるか
・入社後の活躍イメージが想起できるか

■ 差別化・独自性
・他の応募者との差別化ができているか
・自分ならではの視点・工夫があるか
・再現性のある強みとして伝わるか

■ 学び・成長
・具体的な学びが示されているか
・その経験から得た強みが明確か
・企業で活かせる強みとして伝わるか

■ 文章構成
・結論ファーストで書かれているか
・だ・である調で統一されているか
・冗長な部分がないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 活動期間・役割・人数が明記されている
□ 課題・目標が明確
□ 主体的な行動・工夫が具体的
□ 成果が数字で示されている
□ 学び・得た強みが明確
□ 企業で活かせる強みとして伝わる""",
    },
    "post_join_goals": {
        "role": "就活ESの入社後ビジョン作成のプロフェッショナル",
        "target": "入社後やりたいこと",
        "aspects": """■ ビジョンの具体性
・短期（1-3年）と中長期のキャリアビジョンが区別されているか
・具体的なプロジェクト・事業・目標に言及しているか
・「何を」「どのように」「なぜ」が明確か

■ 企業との整合性
・企業が重視するキーワードが適切に2つ含まれているか
・企業が重視するキーワードが過剰（3つ以上）に含まれていないか
・企業の事業戦略・成長領域との整合性があるか
・企業のキャリアパス・研修制度と接続しているか
・実現可能性のあるビジョンか

■ 自己との接続
・自分の強み・経験がどう活きるかを説明しているか
・なぜそのビジョンを持つに至ったか（原体験）が示されているか
・成長意欲・学習姿勢が表現されているか

■ 貢献意識
・企業・社会への貢献イメージが示されているか
・受け身でなく主体的な姿勢か
・独りよがりでなくチームでの協働意識があるか

■ 文章構成
・結論ファーストで書かれているか
・だ・である調で統一されているか
・冗長な部分がないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 短期・中長期のビジョンが明確
□ 企業の事業・キャリアパスと接続
□ 自分の強み・経験との接点
□ 具体的なプロジェクト・目標への言及
□ 企業・社会への貢献イメージ""",
    },
    "role_course_reason": {
        "role": "就活ESの職種選択理由作成のプロフェッショナル",
        "target": "職種・コース選択理由",
        "aspects": """■ 職種理解
・その職種・コースの役割・業務内容を正確に理解しているか
・企業におけるその職種の特徴・強みを把握しているか
・他職種との違いを理解しているか

■ 自己との接続
・なぜその職種なのかを自分の経験と接続しているか
・職種で求められるスキルと自分の素養の接点があるか
・その職種を志望するに至った原体験があるか

■ キャリアビジョン
・その職種でのキャリアビジョンが明確か
・企業のキャリアパスとの整合性があるか
・長期的な成長イメージが示されているか

■ 適性アピール
・その職種に向いている理由が示されているか
・具体的なエピソードで適性を裏付けているか
・入社後の活躍イメージが想起できるか

■ 文章構成
・結論ファーストで書かれているか
・だ・である調で統一されているか
・冗長な部分がないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 自分の経験と職種の接点が明確
□ 企業のその職種の特徴との接点
□ 職種で求められるスキルと自分の素養
□ その職種でのキャリアビジョン
□ 具体的なエピソードで適性を裏付け""",
    },
    "work_values": {
        "role": "就活ESの価値観表現作成のプロフェッショナル",
        "target": "働くうえで大切にしている価値観",
        "aspects": """■ 価値観の具体性
・抽象的な価値観を具体的な行動指針に落とし込んでいるか
・その価値観を形成した具体的なエピソードがあるか
・一貫性のある価値観として伝わるか

■ 裏付け
・その価値観を裏付ける経験・エピソードがあるか
・実際の行動として表れている例があるか
・複数の場面で発揮された価値観か

■ 仕事への接続
・その価値観が仕事でどう活きるか示しているか
・企業の価値観・文化との親和性があるか
・チームでの協働における意義が示されているか

■ 独自性
・他の応募者との差別化ができているか
・自分ならではの視点・表現があるか
・深みのある内容か

■ 文章構成
・結論ファーストで書かれているか
・だ・である調で統一されているか
・冗長な部分がないか
・面接で深掘りされた時に答えられる内容か""",
        "checklist": """□ 具体的なエピソードから価値観を導出
□ 抽象→具体への落とし込み
□ 価値観が仕事でどう活きるか
□ 企業文化との親和性
□ 自分ならではの視点・表現""",
    },
}


def get_template_labels() -> dict[str, str]:
    """Get template type to label mapping for frontend."""
    return {k: v["label"] for k, v in TEMPLATE_DEFS.items()}


def get_character_budget(char_min: Optional[int], char_max: Optional[int]) -> str:
    """
    Generate section-by-section character budget guidance with safety margins.

    This helps the LLM plan content distribution before writing,
    improving character limit compliance. Uses safety margins to reduce
    character count failures.

    Args:
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)

    Returns:
        Character budget guidance string, or empty string if no limits set
    """
    if not char_min and not char_max:
        return ""

    # Calculate targets with safety margins
    # Aim for 95% of max to leave buffer for adjustment
    if char_min and char_max:
        # Target the middle of safe range (min to 95% of max)
        safe_max = int(char_max * 0.95)
        target = (char_min + safe_max) // 2
        safe_range = f"{char_min}〜{safe_max}字"
        constraint = f"{char_min}字〜{char_max}字"
    elif char_max:
        # For upper-only limits, aim for 90% of max
        target = int(char_max * 0.90)
        safe_max = int(char_max * 0.95)
        safe_range = f"{safe_max}字以内"
        constraint = f"{char_max}字以内"
    else:
        # For lower-only limits, aim for 5% above min
        target = int(char_min * 1.05)
        safe_range = f"{int(char_min * 1.02)}字以上"
        constraint = f"{char_min}字以上"

    # Typical ES structure allocation
    intro_budget = int(target * 0.15)  # 15% for opening statement
    body_budget = int(target * 0.70)  # 70% for main content
    conclusion_budget = int(target * 0.15)  # 15% for conclusion

    return f"""【文字数管理 - 厳守事項】

■ 目標文字数: {target}字（安全範囲: {safe_range}）
■ 制限: {constraint}

■ 構成配分ガイド:
  - 導入（結論/主張）: 約{intro_budget}字
  - 本論（具体的経験・根拠）: 約{body_budget}字
  - 結論（まとめ・展望）: 約{conclusion_budget}字

■ 必須検証手順:
  1. 各パターンを書き終えた後、len(text) で文字数を計算
  2. {safe_range}の範囲外なら以下で調整:
     【多い場合の削減テクニック】
     - 「〜ということ」→「〜こと」
     - 「〜というような」→「〜のような」または省略
     - 「〜させていただく」→「〜する」
     - 「非常に大きな」→「大きな」
     - 重複する修飾語を統合
     【少ない場合の追加テクニック】
     - 具体的な数値（期間、人数、成果の数字）
     - エピソードの背景説明（「〜の状況下で」）
     - 学びや気づきの補強
  3. 調整後、再度 len(text) で確認
  4. char_count に正確な文字数を記録

■ よくある失敗:
  × char_countに概算値を記録 → 必ずlen()の結果を使用
  × 上限ギリギリを狙う → 安全範囲内を目標に
  × 数値を削って短縮 → 具体性は維持、冗長表現を削減"""


def build_template_prompt(
    template_type: str,
    company_name: Optional[str],
    industry: Optional[str],
    question: str,
    answer: str,
    char_min: Optional[int],
    char_max: Optional[int],
    rag_sources: list[dict],
    rag_context: str,
    keyword_count: int,
    has_rag: bool = True,
    intern_name: Optional[str] = None,
    role_name: Optional[str] = None,
    rewrite_count: int = 1,
) -> tuple[str, str]:
    """
    Build system and user prompts for template-based ES review.

    Args:
        template_type: Template type ID
        company_name: Company name (optional)
        industry: Industry name (optional)
        question: ES question text
        answer: User's answer text
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)
        rag_sources: List of source dicts with source_id, source_url, content_type, excerpt
        rag_context: RAG context text
        keyword_count: Number of keywords to use
        has_rag: Whether company RAG data is available
        intern_name: Intern program name (for intern templates)
        role_name: Role/course name (for role_course_reason template)

    Returns:
        Tuple of (system_prompt, user_prompt)
    """
    template_def = TEMPLATE_DEFS.get(template_type)
    if not template_def:
        raise ValueError(f"Unknown template type: {template_type}")

    template_prompt = TEMPLATE_PROMPTS.get(template_type)
    if not template_prompt:
        # Fallback to basic template
        template_prompt = TEMPLATE_PROMPTS["basic"]

    def _build_basic_template_text() -> str:
        if not BASIC_TEMPLATE_TEXT:
            return ""

        # Character limit instructions
        if char_min and char_max:
            char_line = f"文字数：{char_min}字〜{char_max}字（Python len() でカウント・厳守）"
        elif char_max:
            char_line = f"文字数：{char_max}字以内（Python len() でカウント・厳守）"
        elif char_min:
            char_line = f"文字数：{char_min}字以上（Python len() でカウント・厳守）"
        else:
            char_line = "文字数：指定なし"

        lines: list[str] = []
        for line in BASIC_TEMPLATE_TEXT.splitlines():
            stripped = line.strip()
            if stripped.startswith("文字数："):
                lines.append(char_line)
                continue
            if stripped.startswith("業界：") and not industry:
                continue
            if stripped.startswith("企業：") and not company_name:
                continue
            if stripped.startswith("設問："):
                lines.append(f"設問：{question}")
                continue
            lines.append(line)

        text = "\n".join(lines)
        replacements = {
            "{min_chars}": str(char_min) if char_min is not None else "",
            "{max_chars}": str(char_max) if char_max is not None else "",
            "{industry}": industry or "",
            "{company}": company_name or "",
            "{question}": question or "",
            "{draft_text}": answer,
        }
        for key, value in replacements.items():
            text = text.replace(key, value)

        return text.strip()

    # Build source reference section
    source_refs = ""
    if rag_sources:
        source_lines = []
        for src in rag_sources:
            source_lines.append(
                f"- {src['source_id']}: [{src['content_type']}] {src.get('excerpt', '')[:100]}..."
            )
        source_refs = "\n".join(source_lines)

    # Character limit instructions
    char_instruction = ""
    if char_min and char_max:
        if char_min == char_max:
            char_instruction = f"文字数：{char_min}字（Python len() でカウント・厳守）"
        else:
            char_instruction = (
                f"文字数：{char_min}字〜{char_max}字（Python len() でカウント・厳守）"
            )
    elif char_max:
        char_instruction = f"文字数：{char_max}字以内（Python len() でカウント・厳守）"
    elif char_min:
        char_instruction = f"文字数：{char_min}字以上（Python len() でカウント・厳守）"
    else:
        char_instruction = "文字数：指定なし"

    # Build conditions section
    conditions = [char_instruction]
    if industry:
        conditions.append(f"業界：{industry}")
    if company_name:
        conditions.append(f"企業：{company_name}")
    if intern_name:
        conditions.append(f"インターン名：{intern_name}")
    if role_name:
        conditions.append(f"職種・コース名：{role_name}")
    conditions.append(f"設問：{question}")
    conditions_text = "\n".join(conditions)

    # Generate character budget guide
    char_budget = get_character_budget(char_min, char_max)

    # Build character limit constraint description for self-verification
    if char_min and char_max:
        char_constraint = f"{char_min}字〜{char_max}字"
    elif char_max:
        char_constraint = f"{char_max}字以内"
    elif char_min:
        char_constraint = f"{char_min}字以上"
    else:
        char_constraint = ""

    # Output requirements - character limits are now emphasized first
    output_requirements = """【最重要: 文字数厳守】
各パターンを出力する前に、以下の手順を必ず実行:
1. 文章を仮作成
2. len(text) で文字数を計算
3. 範囲外なら調整（多ければ冗長部分を削除、少なければ具体例を追加）
4. 再度 len(text) で確認
5. 範囲内になったら char_count に正確な文字数を記録

文字数調整の方法:
- 多すぎる場合: 冗長な接続詞を削除、「〜という」「〜のような」を省略、重複表現を統合
- 少なすぎる場合: 具体的な数字を追加、エピソードを詳細化、結論の補強

"""
    if rewrite_count == 1:
        output_requirements += "・改善案を1パターン提示（メリット・デメリットは不要、pros/consは空配列で出力）"
    else:
        output_requirements += f"""・改善案を{rewrite_count}パターン提示し、それぞれのメリット・デメリットを説明
・**各パターンのスタイルを明確に差別化すること**:
  パターン1: バランス型（論理性と熱意を両立、最も安定した構成）
  パターン2: 論理型（PREP法など論理構成を重視、数値やエビデンスを強調）
  パターン3: 熱意型（具体エピソードと感情描写を重視、人物像が伝わる構成）"""
        output_requirements += "\n・メリット・デメリットに文字数に関する言及は含めない（「文字数が多い」「文字数が少ない」等は禁止）"
    output_requirements += "\n・rewrites は出力しない（variants[*].text を本文として使用）"
    if keyword_count > 0 and has_rag:
        output_requirements += (
            "\n・使用したキーワードがどの資料から取ったものか明記（keyword_sources は excerpt なしでOK）"
        )
    if template_def.get("require_strengthen_points"):
        output_requirements += (
            "\n・強化すべきポイントを企業の求める人材像と照らし合わせて指摘"
        )
    output_requirements += "\n・top3 には difficulty（easy/medium/hard）を付与"
    if char_constraint:
        output_requirements += f"\n・各パターンは必ず{char_constraint}の範囲内（char_countにはlen(text)の正確な値を記録）"

    # RAG-less mode guidance for templates that usually require company RAG
    no_rag_guidance = ""
    if not has_rag and template_def.get("requires_company_rag"):
        no_rag_guidance = """
【企業情報なしモード】
この企業のRAGデータがないため、以下の点に注意して添削してください:
- 企業キーワードは使用せず、variants の keywords_used と keyword_sources は空配列で出力
- 志望理由系テンプレートでは、「企業研究のヒント」として調べるべきポイントを top3 の suggestion に含める
  - 例: 「企業のIR資料や採用ページから具体的な事業内容を調べ、○○のような具体例を追加してください」
- 応募者自身の経験・価値観・成長目標を軸にした説得力のある構成を重視
"""

    # Build character budget section (only if limits are set)
    char_budget_section = f"\n{char_budget}\n" if char_budget else ""

    # Build dynamic differentiation section based on rewrite_count
    if rewrite_count == 1:
        differentiation_section = ""
    elif rewrite_count == 2:
        differentiation_section = """

【2パターンの差別化】
- パターン1: バランス重視（読みやすさと具体性のバランス）
- パターン2: 論理重視（因果関係を明確にした構成）"""
    else:
        differentiation_section = """

【3パターンの差別化】
- パターン1: バランス重視（読みやすさと具体性のバランス）
- パターン2: 論理重視（因果関係を明確にした構成）
- パターン3: 熱意重視（意欲や passion を強調）"""

    # Build dynamic variant schema example
    if rewrite_count == 1:
        variant_schema_example = """      {{
        "text": "改善案の本文",
        "char_count": 文字数（整数）,
        "pros": [],
        "cons": [],
        "keywords_used": ["キーワード1", "キーワード2"],
        "keyword_sources": ["S1", "S2"]
      }}"""
    else:
        variant_schema_example = """      {{
        "text": "改善案の本文",
        "char_count": 文字数（整数）,
        "pros": ["メリット1", "メリット2"],
        "cons": ["デメリット1"],
        "keywords_used": ["キーワード1", "キーワード2"],
        "keyword_sources": ["S1", "S2"]
      }}"""

    basic_template_text = _build_basic_template_text() if template_type == "basic" else ""
    if basic_template_text:
        base_prompt = basic_template_text
        if no_rag_guidance:
            base_prompt = f"{no_rag_guidance.strip()}\n\n{base_prompt}"
        system_prompt = f"""{base_prompt}

【出力要件（補足）】
{output_requirements}

【JSON出力形式 - 厳守】
# 以下の制約を必ず守ること:
1. JSONオブジェクトのみを出力（マークダウン、説明文、```コードブロック禁止）
2. {{ で始まり }} で終わる（前後に何も付けない）
3. 全ての文字列は必ずダブルクォート（"）で囲む
4. 文字列内の改行は \\n、タブは \\t でエスケープ
5. 配列・オブジェクトの最後の要素にカンマを付けない（[1, 2,] ← 禁止）
6. strengthen_points は空配列 [] でも必ず含めること

{{
  "scores": {{
    "logic": 1-5の整数,
    "specificity": 1-5の整数,
    "passion": 1-5の整数,
    "company_connection": 1-5の整数または省略,
    "readability": 1-5の整数
  }},
  "top3": [
    {{"category": "評価軸名", "issue": "問題点", "suggestion": "改善提案", "difficulty": "easy"}}
  ],
  "template_review": {{
    "template_type": "{template_type}",
    "variants": [
{variant_schema_example}
    ],
    "keyword_sources": [
      {{"source_id": "S1", "source_url": "URL", "content_type": "種別"}}
    ],
    "strengthen_points": ["強化ポイント1"] // require_strengthen_pointsがtrueの場合のみ
  }}
}}

【スコア基準（厳しめに付ける、平均3点程度）】
- logic (論理): 主張と根拠の一貫性
- specificity (具体性): 数字・エピソードの充実度
- passion (熱意): 意欲・モチベーションの伝わり度
- company_connection (企業接続): 企業との接点の明確さ（RAGあり時のみ）
- readability (読みやすさ): 文章の流れと理解しやすさ{differentiation_section}"""
    else:
        system_prompt = f"""＃あなたは{template_prompt['role']}である。以下の条件で完璧な{template_prompt['target']}に添削して変更せよ。
{no_rag_guidance}
【条件】
{conditions_text}
{char_budget_section}
【添削の観点】
{template_prompt['aspects']}

【出力要件】
{output_requirements}

【チェックリスト】
{template_prompt['checklist']}

【JSON出力形式 - 厳守】
# 以下の制約を必ず守ること:
1. JSONオブジェクトのみを出力（マークダウン、説明文、```コードブロック禁止）
2. {{ で始まり }} で終わる（前後に何も付けない）
3. 全ての文字列は必ずダブルクォート（"）で囲む
4. 文字列内の改行は \\n、タブは \\t でエスケープ
5. 配列・オブジェクトの最後の要素にカンマを付けない（[1, 2,] ← 禁止）
6. strengthen_points は空配列 [] でも必ず含めること

{{
  "scores": {{
    "logic": 1-5の整数,
    "specificity": 1-5の整数,
    "passion": 1-5の整数,
    "company_connection": 1-5の整数または省略,
    "readability": 1-5の整数
  }},
  "top3": [
    {{"category": "評価軸名", "issue": "問題点", "suggestion": "改善提案", "difficulty": "easy"}}
  ],
  "template_review": {{
    "template_type": "{template_type}",
    "variants": [
{variant_schema_example}
    ],
    "keyword_sources": [
      {{"source_id": "S1", "source_url": "URL", "content_type": "種別"}}
    ],
    "strengthen_points": ["強化ポイント1"] // require_strengthen_pointsがtrueの場合のみ
  }}
}}

【スコア基準（厳しめに付ける、平均3点程度）】
- logic (論理): 主張と根拠の一貫性
- specificity (具体性): 数字・エピソードの充実度
- passion (熱意): 意欲・モチベーションの伝わり度
- company_connection (企業接続): 企業との接点の明確さ（RAGあり時のみ）
- readability (読みやすさ): 文章の流れと理解しやすさ{differentiation_section}"""

    # Build user prompt
    rag_section = ""
    if rag_context:
        rag_section = f"""
【企業RAG資料】
以下はこの企業に関する資料です。キーワードや企業特徴の参照に使用してください。

{rag_context}

【出典一覧】
{source_refs}"""

    user_prompt = f"""【添削前の{template_prompt['target']}】
{answer}
{rag_section}

上記の回答を添削し、{rewrite_count}パターンの改善案をJSON形式で出力してください。"""

    return system_prompt, user_prompt


def validate_template_output(
    template_review: dict,
    char_min: Optional[int],
    char_max: Optional[int],
    rewrite_count: int = 3,
) -> tuple[bool, str]:
    """
    Validate template review output.

    Args:
        template_review: Parsed template_review dict from LLM
        char_min: Minimum character count (optional)
        char_max: Maximum character count (optional)

    Returns:
        Tuple of (is_valid, error_reason)

    Note:
        Keyword validation is not performed here - keyword count is
        treated as soft guidance in the prompt only.
    """
    errors = []

    # Check variants exist
    variants = template_review.get("variants", [])
    if len(variants) != rewrite_count:
        errors.append(f"{rewrite_count}パターンが必要ですが、{len(variants)}パターンしかありません")
        return False, "; ".join(errors)

    for i, variant in enumerate(variants, 1):
        text = variant.get("text", "")
        char_count = len(text)

        # Character count validation (only if limits are set)
        if char_max:
            if char_count > char_max:
                excess = char_count - char_max
                errors.append(
                    f"パターン{i}: {char_count}文字（{excess}文字削減が必要、上限{char_max}文字）"
                )

        if char_min:
            if char_count < char_min:
                shortage = char_min - char_count
                errors.append(
                    f"パターン{i}: {char_count}文字（{shortage}文字追加が必要、下限{char_min}文字）"
                )

        # Note: Keyword validation removed - treated as soft guidance in prompt only
        # LLM decides keyword usage based on context; no hard validation

        # Check for です/ます (should use だ・である)
        if "です" in text or "ます" in text:
            errors.append(
                f"パターン{i}: です・ます調が使用されています（だ・である調に統一）"
            )

        # Check char_count accuracy — large deviation suggests LLM miscounted
        reported = variant.get("char_count")
        if reported is not None and reported != char_count:
            variant["char_count"] = char_count  # Always fix the stored value
            deviation = abs(reported - char_count)
            if char_count > 0 and deviation / char_count > 0.10:
                # Log only - char_count inaccuracy is not a text quality issue
                print(
                    f"[ES添削/テンプレート] char_count自動修正: パターン{i} 申告{reported}→実際{char_count}"
                )

    if errors:
        return False, "; ".join(errors)

    return True, ""
