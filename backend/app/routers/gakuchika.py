"""
Gakuchika (学生時代に力を入れたこと) Router

AI-powered deep-dive questioning for Gakuchika refinement using LLM.

SPEC Section 17.2 Requirements:
- Target ~8 questions (can end early or extend based on content)
- Credit consumption: 1 per 5 questions answered
- 0 credit if <5 questions answered
- Can pause/resume conversation
- Can re-run same material
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.utils.llm import call_llm_with_error

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

# Configuration per SPEC Section 17.2
TARGET_QUESTIONS = 8  # 目安8問（内容により早終了/追加あり）
QUESTIONS_PER_CREDIT = 5  # 5問回答ごとに1クレジット消費


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class NextQuestionRequest(BaseModel):
    gakuchika_title: str  # テーマ: サークル活動、アルバイト等
    gakuchika_content: Optional[str] = None  # ガクチカ本文
    char_limit_type: Optional[str] = None  # 文字数制限タイプ ("300", "400", "500")
    conversation_history: list[Message]  # これまでの会話履歴
    question_count: int = 0  # 現在の質問数（Next.js側で管理）


class NextQuestionResponse(BaseModel):
    question: str  # 次の深掘り質問
    reasoning: Optional[str] = None  # この質問をする理由（デバッグ用）
    should_continue: bool = True  # 継続すべきかどうか
    suggested_end: bool = False  # 終了を提案するかどうか


# Static question bank for fallback (8 questions targeting key aspects)
STATIC_QUESTIONS = [
    "その経験を始めたきっかけは何でしたか？",
    "その中で最も困難だった出来事は何ですか？",
    "その困難をどのように乗り越えましたか？",
    "その経験から学んだことは何ですか？",
    "周りの人からどのような評価を受けましたか？",
    "具体的な数字や成果はありますか？",
    "チームの中でのあなたの役割は何でしたか？",
    "その学びを今後どのように活かしたいですか？",
]


@router.post("/next-question", response_model=NextQuestionResponse)
async def get_next_question(request: NextQuestionRequest):
    """
    Generate the next deep-dive question for Gakuchika based on conversation history.

    This endpoint:
    1. Takes the Gakuchika theme and conversation history
    2. Uses LLM to generate a contextual follow-up question
    3. Returns a question designed to extract deeper insights
    4. Indicates whether to continue or suggest ending (~8 questions target)

    SPEC Section 17.2:
    - Target ~8 questions (can end early or extend based on content)
    - Credit consumption: 1 per 5 questions answered (handled by Next.js)
    - 0 credit if <5 questions answered

    The caller (Next.js API) is responsible for:
    - Authentication
    - Credit checking and consumption (every 5 questions)
    - Saving conversation history
    """
    if not request.gakuchika_title:
        raise HTTPException(
            status_code=400,
            detail="ガクチカのテーマが指定されていません"
        )

    # Use question_count from request, or count user messages as fallback
    question_count = request.question_count
    if question_count == 0:
        question_count = sum(
            1 for msg in request.conversation_history if msg.role == "user"
        )

    # Determine if we should suggest ending (approaching ~8 questions)
    suggested_end = question_count >= TARGET_QUESTIONS - 1

    # Build content context for the prompt
    content_context = ""
    if request.gakuchika_content:
        char_limit_note = f"（{request.char_limit_type}文字制限）" if request.char_limit_type else ""
        content_context = f"""
**ユーザーが入力したガクチカ本文{char_limit_note}:**
{request.gakuchika_content}

上記の本文をもとに、より深い洞察を引き出す質問をしてください。"""

    # If conversation is empty, start with first question based on content
    if not request.conversation_history:
        initial_question = f"「{request.gakuchika_title}」について、具体的にどのようなことに取り組みましたか？"
        if request.gakuchika_content:
            # Ask a more specific question based on the content
            initial_question = f"記載いただいた「{request.gakuchika_title}」の経験について、まず最も印象に残っている場面を教えてください。"
        return NextQuestionResponse(
            question=initial_question,
            reasoning="会話開始時の導入質問",
            should_continue=True,
            suggested_end=False
        )

    # Include progress awareness in the prompt
    progress_note = ""
    if question_count >= TARGET_QUESTIONS - 2:
        progress_note = f"""

**進捗情報**: 現在{question_count}問目です。目安の{TARGET_QUESTIONS}問に近づいています。
- まだ深掘りが必要な場合は質問を続けてください
- 十分な情報が得られている場合は、最後のまとめの質問にしてください"""

    system_prompt = f"""あなたは就活生の「ガクチカ」（学生時代に力を入れたこと）を深掘りするインタビュアーです。

テーマ: {request.gakuchika_title}
現在の質問数: {question_count}/{TARGET_QUESTIONS}
{content_context}

あなたの役割は、就活生がES（エントリーシート）や面接で話すエピソードをより魅力的にするために、
深い洞察を引き出す質問をすることです。

以下のルールに従って次の質問を生成してください：

1. **前の回答を踏まえる**: ユーザーの回答内容に基づいて、より具体的な深掘りをする
2. **具体性を引き出す**: 「なぜ」「どのように」「具体的に」を意識した質問をする
3. **数字を引き出す**: 人数、期間、成果などの具体的な数字を聞き出す
4. **感情・思考を掘り下げる**: そのとき何を感じ、何を考えたかを聞く
5. **成長・学びを明確化**: その経験で何を学び、どう変わったかを聞く
6. **他者評価を確認**: 周りの人からどう見られていたかを聞く
{progress_note}

質問のパターン例：
- 「その〇〇について、もう少し詳しく教えてください」
- 「なぜ〇〇しようと思ったのですか？」
- 「具体的にはどのような行動を取りましたか？」
- 「その結果、数字で表すとどのような成果がありましたか？」
- 「そのとき、どんな気持ちでしたか？」
- 「その経験から、何を学びましたか？」
- 「周りの人は、あなたの行動をどう評価していましたか？」

質問は1つだけ、簡潔に（2文以内で）生成してください。
相手の話を深く聞く姿勢を示す、温かみのある質問にしてください。

必ずJSON形式で回答してください：
{{"question": "質問文", "reasoning": "この質問をする理由（1文）", "should_continue": true, "suggested_end": false}}

- should_continue: まだ深掘りすべき内容がある場合はtrue
- suggested_end: 十分な情報が得られた、または目安の質問数に達した場合はtrue"""

    # Build conversation messages for LLM
    messages = []
    for msg in request.conversation_history:
        messages.append({
            "role": msg.role,
            "content": msg.content
        })

    # feature="gakuchika" → automatically selects Claude Sonnet
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message="次の深掘り質問を生成してください",
        messages=messages,
        max_tokens=400,
        temperature=0.7,
        feature="gakuchika"
    )

    if not llm_result.success:
        # Return detailed error to client
        error = llm_result.error
        print(f"[Gakuchika] LLM error: {error.detail if error else 'unknown'}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            }
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
        question = data.get("question")
        if not question:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "AIから有効な質問を取得できませんでした。",
                    "error_type": "parse",
                    "provider": "unknown",
                    "detail": "No question in response"
                }
            )

        return NextQuestionResponse(
            question=question,
            reasoning=data.get("reasoning"),
            should_continue=data.get("should_continue", True),
            suggested_end=data.get("suggested_end", suggested_end)
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error parsing LLM response: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答の処理中にエラーが発生しました。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": str(e)
            }
        )


@router.post("/summary")
async def generate_summary(request: NextQuestionRequest):
    """
    Generate a summary of the Gakuchika conversation for use in ES writing.

    This is an optional endpoint that can be called after the conversation is complete.
    """
    if not request.conversation_history:
        raise HTTPException(
            status_code=400,
            detail="会話履歴がありません"
        )

    # Extract user answers
    user_answers = [
        msg.content for msg in request.conversation_history if msg.role == "user"
    ]

    if not user_answers:
        raise HTTPException(
            status_code=400,
            detail="ユーザーの回答がありません"
        )

    system_prompt = """あなたは就活アドバイザーです。
以下のガクチカ深掘り会話の内容を、ES（エントリーシート）で使いやすい形にまとめてください。

以下の情報を抽出してJSON形式で返してください：
1. summary: 経験の要約（200-300字程度）
2. key_points: キーとなるポイントのリスト（3-5個）
3. numbers: 言及された具体的な数字や成果のリスト
4. strengths: この経験から読み取れる強み（2-3個）

必ず有効なJSON形式で回答:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "numbers": ["...", "..."],
  "strengths": ["...", "..."]
}"""

    conversation_text = ""
    for msg in request.conversation_history:
        role_label = "質問" if msg.role == "assistant" else "回答"
        conversation_text += f"{role_label}: {msg.content}\n\n"

    # feature="gakuchika" → automatically selects Claude Sonnet
    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=f"テーマ: {request.gakuchika_title}\n\n会話履歴:\n{conversation_text}",
        max_tokens=1000,
        temperature=0.3,
        feature="gakuchika"
    )

    if llm_result.success and llm_result.data is not None:
        return llm_result.data

    # Return detailed error
    error = llm_result.error
    raise HTTPException(
        status_code=503,
        detail={
            "error": error.message if error else "サマリー生成中にエラーが発生しました。",
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        }
    )
