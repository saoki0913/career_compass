"""
ES Review (ES添削) Prompt Builders

Centralized prompt builder functions for the ES review feature.
Used by backend/app/routers/es_review.py.

Unlike motivation/gakuchika prompts which are simple .format() constants,
ES review prompts require dynamic f-string construction due to conditional
sections (company_rag, section_feedbacks, style variations). These are
therefore implemented as builder functions.
"""

from typing import Optional


def build_section_review_prompt(
    section_title: str,
    section_char_limit: Optional[int],
    score_criteria: str,
    company_rag_available: bool,
    rewrite_instruction: str,
    style: str,
    char_limit_instruction: str,
) -> str:
    """Build system prompt for single-section ES review.

    Args:
        section_title: Title of the ES section/question being reviewed
        section_char_limit: Character limit for the section (optional)
        score_criteria: Pre-built scoring criteria text
        company_rag_available: Whether company RAG data is available
        rewrite_instruction: Style-specific rewrite instruction
        style: Selected style name
        char_limit_instruction: Pre-built character limit instruction line
    """
    char_limit_line = (
        f"\n文字数制限: {section_char_limit}文字" if section_char_limit else ""
    )
    company_category = "企業接続、" if company_rag_available else ""
    company_top3_note = (
        "※企業接続の指摘では、提供された企業情報を参照して具体的な改善点を示してください"
        if company_rag_available
        else ""
    )
    company_rewrite_note = (
        "- 企業情報に基づいて、企業の事業内容や価値観と結びつく表現を追加"
        if company_rag_available
        else ""
    )
    company_score_example = (
        ', "company_connection": 3' if company_rag_available else ""
    )

    return f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESの**特定の設問**を添削し、具体的で実用的なフィードバックを提供してください。

設問タイトル: 「{section_title}」{char_limit_line}

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき点（1〜2点）
   - category: 評価軸の名前（論理、具体性、熱意、{company_category}読みやすさ）
   - issue: 具体的な問題点（文章のどこが、なぜ問題か）
   - suggestion: 実践的な改善案（具体的に何をどう変えるか）
   - difficulty: 難易度（easy/medium/hard）
   {company_top3_note}

3. rewrites: 改善例（1パターン）
   - スタイル「{style}」に沿って{rewrite_instruction}リライト
   - 元の文章の良い部分は活かしつつ、問題点を改善した文章
{char_limit_instruction}
   {company_rewrite_note}

スコアは厳しめに付けてください（平均3点程度）。
この設問に特化した具体的なフィードバックを提供してください。

出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{company_score_example}}},
  "top3": [
    {{"category": "...", "issue": "...", "suggestion": "...", "difficulty": "easy"}}
  ],
  "rewrites": ["リライト案"]
}}"""


def build_full_review_prompt(
    score_criteria: str,
    company_rag_available: bool,
    rewrite_count: int,
    rewrite_instruction: str,
    style: str,
    section_feedback_instruction: str,
) -> str:
    """Build system prompt for full ES review.

    Args:
        score_criteria: Pre-built scoring criteria text
        company_rag_available: Whether company RAG data is available
        rewrite_count: Number of rewrite patterns to generate
        rewrite_instruction: Style-specific rewrite instruction
        style: Selected style name
        section_feedback_instruction: Pre-built section feedback instruction
    """
    company_category = "企業接続、" if company_rag_available else ""
    company_top3_note = (
        "※企業接続の指摘では、提供された企業情報を参照し、"
        "『〇〇事業への言及がない』『△△という企業理念との接点が不明確』など、"
        "具体的な改善点を示してください"
        if company_rag_available
        else ""
    )
    company_rewrite_note = (
        "- 企業情報に基づいて、企業の事業内容や価値観と結びつく表現を追加"
        if company_rag_available
        else ""
    )
    company_score_example = (
        ', "company_connection": 3' if company_rag_available else ""
    )

    return f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESを添削し、具体的で実用的なフィードバックを提供してください。

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき上位3点
   - category: 評価軸の名前（論理、具体性、熱意、{company_category}読みやすさ）
   - issue: 具体的な問題点（文章のどこが、なぜ問題か）
   - suggestion: 実践的な改善案（具体的に何をどう変えるか）
   - difficulty: 難易度（easy/medium/hard）
   {company_top3_note}

3. rewrites: 改善例（{rewrite_count}パターン）
   - スタイル「{style}」に沿って{rewrite_instruction}リライト
   - 元の文章の良い部分は活かしつつ、問題点を改善した文章
   - 元の文章と同程度の長さで
   {company_rewrite_note}
{section_feedback_instruction}

スコアは厳しめに付けてください（平均3点程度）。
改善案は具体的で、すぐに実践できるものにしてください。

出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{company_score_example}}},
  "top3": [
    {{"category": "...", "issue": "...", "suggestion": "...", "difficulty": "easy"}}
  ],
  "rewrites": ["リライト1", "リライト2", ...],
  "section_feedbacks": [{{"section_title": "...", "feedback": "...", "rewrite": "..."}}]
}}"""


def build_full_review_prompt_streaming(
    score_criteria: str,
    company_rag_available: bool,
    rewrite_count: int,
    rewrite_instruction: str,
    style: str,
    section_feedback_instruction: str,
) -> str:
    """Build system prompt for full ES review (streaming variant).

    This variant is simpler and used by the streaming endpoint.
    """
    company_category = "企業接続、" if company_rag_available else ""
    company_score_example = (
        ', "company_connection": 3' if company_rag_available else ""
    )

    return f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESを添削し、具体的で実用的なフィードバックを提供してください。

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき上位3点
   - category: 評価軸の名前
   - issue: 具体的な問題点
   - suggestion: 実践的な改善案
   - difficulty: 難易度（easy/medium/hard）

3. rewrites: 改善例（{rewrite_count}パターン）
   - スタイル「{style}」に沿って{rewrite_instruction}リライト
{section_feedback_instruction}

スコアは厳しめに付けてください。
出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{company_score_example}}},
  "top3": [{{"category": "...", "issue": "...", "suggestion": "...", "difficulty": "easy"}}],
  "rewrites": ["リライト1"],
  "section_feedbacks": [{{"section_title": "...", "feedback": "..."}}]
}}"""


def build_review_user_message(
    content: str,
    company_context: Optional[str],
    gakuchika_context: Optional[str],
    section_title: Optional[str] = None,
    section_char_limit: Optional[int] = None,
) -> str:
    """Build user message for ES review (section or full).

    Args:
        content: ES content or section content to review
        company_context: Company RAG context (optional)
        gakuchika_context: Gakuchika deep-dive context (optional)
        section_title: Section title (for section review mode)
        section_char_limit: Section character limit (for section review mode)
    """
    gakuchika_section = ""
    if gakuchika_context:
        gakuchika_section = f"""

**ガクチカ深掘り情報:**
以下はガクチカ（学生時代に力を入れたこと）の深掘りセッションから得られた情報です。
ESの添削において、これらの経験や強みが活かされているか確認し、フィードバックに反映してください。

{gakuchika_context}
"""

    if section_title:
        # Section review mode
        char_limit_line = (
            f"\n**文字数制限**: {section_char_limit}文字"
            if section_char_limit
            else ""
        )
        if company_context:
            return f"""以下の設問への回答を添削してください。

**企業情報（RAGから取得）:**
{company_context}
{gakuchika_section}
**設問**: {section_title}{char_limit_line}

**回答内容**:
{content}"""
        elif gakuchika_section:
            return f"""以下の設問への回答を添削してください。
{gakuchika_section}
**設問**: {section_title}{char_limit_line}

**回答内容**:
{content}"""
        else:
            return f"""以下の設問への回答を添削してください：

**設問**: {section_title}{char_limit_line}

**回答内容**:
{content}"""
    else:
        # Full ES review mode
        if company_context:
            return f"""以下のESを添削してください。

**企業情報（RAGから取得）:**
以下は企業の採用ページ、IR情報、事業紹介から抽出した情報です。ESの「企業接続」評価において、これらの情報を参照して具体的なフィードバックを行ってください。

{company_context}
{gakuchika_section}
**ES内容:**
{content}

**評価のポイント:**
- 企業情報に記載されている事業内容、価値観、求める人材像とESの内容が結びついているか
- 企業の具体的な取り組みや特徴に言及しているか
- 志望動機が企業の実態に即しているか"""
        elif gakuchika_section:
            return f"""以下のESを添削してください。
{gakuchika_section}
**ES内容:**
{content}"""
        else:
            return f"以下のESを添削してください：\n\n{content}"
