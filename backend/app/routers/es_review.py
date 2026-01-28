"""
ES Review Router

AI-powered ES (Entry Sheet) review and feedback using LLM.

Scoring axes (SPEC Section 16.2):
- 論理 (logic): 論理の一貫性
- 具体性 (specificity): 具体性（数字、エピソード）
- 熱意 (passion): 熱意・意欲の伝わり度
- 企業接続 (company_connection): 企業との接続度（RAG取得時のみ評価）
- 読みやすさ (readability): 文章の読みやすさ

Style options (SPEC Section 16.3):
- Free: バランス/堅め/個性強め (3 types)
- Paid: above + 短く/熱意強め/結論先出し/具体例強め/端的 (8 types)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.utils.llm import call_llm_with_error
from app.utils.vector_store import get_company_context_for_review, has_company_rag

router = APIRouter(prefix="/api/es", tags=["es-review"])

# Style options per plan
FREE_STYLES = ["バランス", "堅め", "個性強め"]
PAID_STYLES = FREE_STYLES + ["短く", "熱意強め", "結論先出し", "具体例強め", "端的"]


class SectionDataInput(BaseModel):
    """Section data with character limit for review"""
    title: str
    content: str
    char_limit: Optional[int] = None


class ReviewRequest(BaseModel):
    content: str
    section_id: Optional[str] = None
    style: str = "バランス"  # Rewrite style
    is_paid: bool = False  # Whether user is on paid plan
    has_company_rag: bool = False  # Whether company RAG data is available
    company_id: Optional[str] = None  # Company ID for RAG context lookup
    rewrite_count: int = 1  # Number of rewrites (Free: 1, Paid: 3)
    # H2 sections for 設問別指摘 (paid only)
    sections: Optional[list[str]] = None
    # Section data with character limits (paid only)
    section_data: Optional[list[SectionDataInput]] = None


class Score(BaseModel):
    logic: int  # 1-5: 論理の一貫性
    specificity: int  # 1-5: 具体性（数字、エピソード）
    passion: int  # 1-5: 熱意・意欲の伝わり度
    company_connection: Optional[int] = None  # 1-5: 企業接続（RAG取得時のみ）
    readability: int  # 1-5: 読みやすさ


class Issue(BaseModel):
    category: str  # 評価カテゴリ
    issue: str  # 問題点の説明
    suggestion: str  # 改善提案


class SectionFeedback(BaseModel):
    section_title: str  # H2 section title
    feedback: str  # 100-150 chars feedback
    rewrite: Optional[str] = None  # Section-specific rewrite respecting char limit


class ReviewResponse(BaseModel):
    scores: Score
    top3: list[Issue]
    rewrites: list[str]  # Multiple rewrites based on plan
    section_feedbacks: Optional[list[SectionFeedback]] = None  # Paid only


def generate_mock_review(
    content: str,
    has_company_rag: bool = False,
    is_paid: bool = False,
    rewrite_count: int = 1,
    sections: Optional[list[str]] = None,
    section_data: Optional[list[SectionDataInput]] = None
) -> ReviewResponse:
    """Generate mock review for development/testing."""
    import random

    # Scores according to spec (論理/具体性/熱意/企業接続/読みやすさ)
    scores = Score(
        logic=random.randint(2, 4),
        specificity=random.randint(2, 4),
        passion=random.randint(2, 4),
        company_connection=random.randint(2, 4) if has_company_rag else None,
        readability=random.randint(3, 5),
    )

    # Top3 improvements
    top3 = [
        Issue(
            category="具体性",
            issue="具体的なエピソードや数値が不足しています",
            suggestion="「〇〇人のチームで」「売上を△△%向上させた」など、具体的な数字を入れましょう"
        ),
        Issue(
            category="論理",
            issue="課題と解決策の因果関係が曖昧です",
            suggestion="「なぜその行動を取ったのか」「どのような結果につながったか」を明確にしましょう"
        ),
        Issue(
            category="熱意",
            issue="志望度の高さが伝わりにくい表現になっています",
            suggestion="その企業・職種でなければならない理由を具体的に述べましょう"
        ),
    ]

    # Add company_connection issue if RAG is available
    if has_company_rag:
        top3[2] = Issue(
            category="企業接続",
            issue="企業の事業内容や求める人材像との接点が薄いです",
            suggestion="企業の具体的な事業や価値観に触れながら、自分との接点を示しましょう"
        )

    # Generate rewrites based on plan
    base_rewrite = f"{content[:200]}...（改善例）" if len(content) > 200 else f"{content}（改善例）"
    rewrites = [base_rewrite]
    if rewrite_count >= 2:
        rewrites.append(f"【堅め】{content[:150]}...（堅実な表現に修正）" if len(content) > 150 else f"【堅め】{content}")
    if rewrite_count >= 3:
        rewrites.append(f"【個性強め】{content[:150]}...（独自性を強調）" if len(content) > 150 else f"【個性強め】{content}")

    # Section feedbacks (paid only)
    section_feedbacks = None
    if is_paid and section_data:
        # Use section_data with char limits
        section_feedbacks = []
        for section in section_data:
            char_limit = section.char_limit
            limit_text = f"{char_limit}文字以内で" if char_limit else ""

            # Generate mock rewrite respecting char limit
            mock_rewrite = None
            if section.content:
                if char_limit:
                    # Truncate to fit within char limit
                    truncated = section.content[:max(1, char_limit - 20)]
                    mock_rewrite = f"{truncated}（改善例）"
                else:
                    mock_rewrite = f"{section.content[:100]}（改善例）"

            section_feedbacks.append(SectionFeedback(
                section_title=section.title,
                feedback=f"「{section.title}」では具体的な数値や結果を追加すると説得力が増します。{limit_text}まとめることで、より訴求力のある文章になります。"[:150],
                rewrite=mock_rewrite
            ))
    elif is_paid and sections:
        # Fallback to simple sections (no char limits)
        section_feedbacks = [
            SectionFeedback(
                section_title=section,
                feedback=f"「{section}」では具体的な数値や結果を追加すると説得力が増します。また、その経験から得た学びをより明確にすることで、成長をアピールできます。"[:150]
            )
            for section in sections
        ]

    return ReviewResponse(
        scores=scores,
        top3=top3,
        rewrites=rewrites,
        section_feedbacks=section_feedbacks
    )


@router.post("/review", response_model=ReviewResponse)
async def review_es(request: ReviewRequest):
    """
    Review ES content and provide scores, improvement suggestions, and rewrites.

    This endpoint:
    1. Takes ES text content as input
    2. Uses LLM to analyze and score the content
    3. Returns scores (5 axes per SPEC), top 3 issues with suggestions, and rewrites

    Scoring axes (SPEC Section 16.2):
    - 論理 (logic): 論理の一貫性
    - 具体性 (specificity): 具体性（数字、エピソード）
    - 熱意 (passion): 熱意・意欲の伝わり度
    - 企業接続 (company_connection): 企業との接続度（RAG取得時のみ）
    - 読みやすさ (readability): 文章の読みやすさ

    The caller (Next.js API) is responsible for:
    - Authentication
    - Credit checking and consumption
    - Rate limiting
    """
    if not request.content or len(request.content.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="ESの内容が短すぎます。もう少し詳しく書いてから添削をリクエストしてください。"
        )

    # Validate style based on plan
    available_styles = PAID_STYLES if request.is_paid else FREE_STYLES
    if request.style not in available_styles:
        raise HTTPException(
            status_code=400,
            detail=f"利用可能なスタイル: {', '.join(available_styles)}"
        )

    # Cap rewrite count based on plan
    rewrite_count = min(request.rewrite_count, 3 if request.is_paid else 1)

    # Check and fetch company RAG context if company_id is provided
    company_context = ""
    company_rag_available = request.has_company_rag

    if request.company_id and not company_rag_available:
        # Check if company has RAG data
        company_rag_available = has_company_rag(request.company_id)

    if request.company_id and company_rag_available:
        # Fetch relevant company context for this ES content
        company_context = await get_company_context_for_review(
            company_id=request.company_id,
            es_content=request.content,
            max_context_length=1500
        )
        if company_context:
            print(f"[ES Review] Fetched company RAG context ({len(company_context)} chars)")
        else:
            company_rag_available = False

    # Build scoring criteria based on RAG availability
    score_criteria = """1. scores (各1-5点):
   - logic: 論理の一貫性（主張と根拠の整合性、因果関係の明確さ）
   - specificity: 具体性（数字、エピソード、固有名詞の使用）
   - passion: 熱意・意欲の伝わり度（モチベーションの説得力）"""

    if company_rag_available:
        score_criteria += """
   - company_connection: 企業接続（企業の事業・文化との接点、志望動機の説得力）"""

    score_criteria += """
   - readability: 読みやすさ（文章の明瞭さ、構成の分かりやすさ）"""

    # Build rewrite instruction based on style
    style_instructions = {
        "バランス": "バランスの取れた、読みやすい文章に",
        "堅め": "フォーマルで堅実な印象の文章に",
        "個性強め": "個性と独自性が際立つ文章に",
        "短く": "簡潔でコンパクトな文章に",
        "熱意強め": "熱意と意欲が強く伝わる文章に",
        "結論先出し": "結論を先に述べ、根拠を後から示す構成に",
        "具体例強め": "具体的なエピソードや数値を増やした文章に",
        "端的": "端的で要点を押さえた文章に",
    }

    rewrite_instruction = style_instructions.get(request.style, "バランスの取れた文章に")

    # Section feedback instruction (paid only)
    section_feedback_instruction = ""
    if request.is_paid and request.section_data:
        # Use section_data with char limits
        section_items = []
        for s in request.section_data:
            limit_note = f"（文字数制限: {s.char_limit}文字）" if s.char_limit else ""
            section_items.append(f"   - {s.title}{limit_note}")
        section_list = "\n".join(section_items)
        section_feedback_instruction = f"""
4. section_feedbacks: 設問別の指摘と改善例
   以下の各設問について、具体的な改善点と改善例を提供してください:
{section_list}
   - section_title: 設問タイトル
   - feedback: その設問に特化した改善点（100-150字）
   - rewrite: 改善例（文字数制限がある場合はその文字数以内で）"""
    elif request.is_paid and request.sections:
        section_list = "\n".join([f"   - {s}" for s in request.sections])
        section_feedback_instruction = f"""
4. section_feedbacks: 設問別の指摘（100-150字/設問）
   以下の各設問について、具体的な改善点を指摘してください:
{section_list}
   - section_title: 設問タイトル
   - feedback: その設問に特化した改善点（100-150字）"""

    system_prompt = f"""あなたはES（エントリーシート）添削の専門家です。
就活生のESを添削し、具体的で実用的なフィードバックを提供してください。

以下の観点で評価し、必ずJSON形式で回答してください：

{score_criteria}

2. top3: 改善すべき上位3点
   - category: 評価軸の名前（論理、具体性、熱意、{"企業接続、" if company_rag_available else ""}読みやすさ）
   - issue: 具体的な問題点（文章のどこが、なぜ問題か）
   - suggestion: 実践的な改善案（具体的に何をどう変えるか）

3. rewrites: 改善例（{rewrite_count}パターン）
   - スタイル「{request.style}」に沿って{rewrite_instruction}リライト
   - 元の文章の良い部分は活かしつつ、問題点を改善した文章
   - 元の文章と同程度の長さで
{section_feedback_instruction}

スコアは厳しめに付けてください（平均3点程度）。
改善案は具体的で、すぐに実践できるものにしてください。

出力形式（必ず有効なJSONで回答）:
{{
  "scores": {{"logic": 3, "specificity": 3, "passion": 3, "readability": 3{', "company_connection": 3' if company_rag_available else ''}}},
  "top3": [
    {{"category": "...", "issue": "...", "suggestion": "..."}}
  ],
  "rewrites": ["リライト1", "リライト2", ...],
  "section_feedbacks": [{{"section_title": "...", "feedback": "...", "rewrite": "..."}}]
}}"""

    # Build user message with company context if available
    user_message = f"以下のESを添削してください：\n\n{request.content}"
    if company_context:
        user_message = f"""以下のESを添削してください。

**企業情報（RAGから取得）:**
{company_context}

**ES内容:**
{request.content}"""

    # feature="es_review" → automatically selects Claude Sonnet
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=3000,
        temperature=0.3,
        feature="es_review"
    )

    if not llm_result.success:
        # Return detailed error to client
        error = llm_result.error
        error_detail = {
            "error": error.message if error else "AI処理中にエラーが発生しました",
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        }
        raise HTTPException(
            status_code=503,
            detail=error_detail
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM"
            }
        )

    try:
        # Validate and construct response
        scores_data = data.get("scores", {})
        scores = Score(
            logic=max(1, min(5, scores_data.get("logic", 3))),
            specificity=max(1, min(5, scores_data.get("specificity", 3))),
            passion=max(1, min(5, scores_data.get("passion", 3))),
            company_connection=max(1, min(5, scores_data.get("company_connection", 3))) if company_rag_available else None,
            readability=max(1, min(5, scores_data.get("readability", 3))),
        )

        top3_data = data.get("top3", [])
        top3 = [
            Issue(
                category=item.get("category", "その他"),
                issue=item.get("issue", ""),
                suggestion=item.get("suggestion", "")
            )
            for item in top3_data[:3]
        ]

        # Ensure we have 3 issues
        while len(top3) < 3:
            top3.append(Issue(
                category="その他",
                issue="追加の改善点を特定できませんでした",
                suggestion="全体的な見直しを行ってみてください"
            ))

        # Get rewrites (handle both array and single string)
        rewrites_data = data.get("rewrites", [])
        if isinstance(rewrites_data, str):
            rewrites_data = [rewrites_data]
        rewrites = rewrites_data[:rewrite_count] if rewrites_data else [request.content]

        # Get section feedbacks (paid only)
        section_feedbacks = None
        if request.is_paid and (request.section_data or request.sections):
            sf_data = data.get("section_feedbacks", [])
            if sf_data:
                section_feedbacks = [
                    SectionFeedback(
                        section_title=item.get("section_title", ""),
                        feedback=item.get("feedback", "")[:150],
                        rewrite=item.get("rewrite")  # Include section-specific rewrite
                    )
                    for item in sf_data
                ]

        return ReviewResponse(
            scores=scores,
            top3=top3,
            rewrites=rewrites,
            section_feedbacks=section_feedbacks
        )

    except Exception as e:
        print(f"Error parsing LLM response: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を処理できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e)
            }
        )
