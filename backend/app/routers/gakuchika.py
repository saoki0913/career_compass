"""
Gakuchika (学生時代に力を入れたこと) Router

AI-powered deep-dive questioning for Gakuchika refinement using LLM.

Updated Implementation:
- STAR法（状況・課題・行動・結果）に基づく動的終了判断
- 質問品質の向上（前回回答引用、具体的切り口）
- 進捗可視化のためのスコア評価
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.utils.llm import call_llm_with_error

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

# Configuration
STAR_COMPLETION_THRESHOLD = 70  # 各STAR要素がこの%以上で完了とみなす
QUESTIONS_PER_CREDIT = 5  # 5問回答ごとに1クレジット消費


class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class STARScores(BaseModel):
    situation: int = 0  # 状況・背景 (0-100)
    task: int = 0       # 課題・目標 (0-100)
    action: int = 0     # 行動・工夫 (0-100)
    result: int = 0     # 結果・学び (0-100)


class STAREvaluation(BaseModel):
    scores: STARScores
    weakest_element: str  # 最も低いスコアの要素
    is_complete: bool     # 全要素がthreshold以上
    missing_aspects: dict[str, list[str]]  # 各要素で不足している観点


class NextQuestionRequest(BaseModel):
    gakuchika_title: str
    gakuchika_content: Optional[str] = None
    char_limit_type: Optional[str] = None
    conversation_history: list[Message]
    question_count: int = 0
    # STAR scores from previous evaluation (optional)
    star_scores: Optional[dict] = None


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    # NEW: STAR evaluation after processing the conversation
    star_evaluation: Optional[dict] = None
    # NEW: Which STAR element this question targets
    target_element: Optional[str] = None


# STAR評価プロンプト
STAR_EVALUATION_PROMPT = """以下のガクチカ会話を分析し、STAR法の各要素の充実度を0-100で評価してください。

## 評価基準

### 状況（Situation）0-100点
- 0-30点: 時期・場所・規模の記載なし
- 31-50点: 一部記載あり（例: 「サークルで」）
- 51-70点: 具体的だが数字なし（例: 「大学2年のサークルで」）
- 71-90点: 具体的で数字あり（例: 「大学2年の秋、30人規模のテニスサークルで」）
- 91-100点: 背景の社会的文脈まで説明

### 課題（Task）0-100点
- 0-30点: 課題が不明確
- 31-50点: 課題は分かるが「なぜ課題か」が不明
- 51-70点: 課題と理由あり（例: 「参加率低下で大会出場が危うい」）
- 71-90点: 課題の深刻さ・自分の責任範囲が明確
- 91-100点: 複数の観点から課題を分析

### 行動（Action）0-100点
- 0-30点: 何をしたか不明確
- 31-50点: 行動はあるが「なぜその方法か」不明
- 51-70点: 行動と理由あり
- 71-90点: 工夫・困難の乗り越え方あり
- 91-100点: PDCAサイクル・チームでの役割まで明確

### 結果（Result）0-100点
- 0-30点: 結果が不明確（「うまくいった」等）
- 31-50点: 定性的な結果のみ
- 51-70点: 数字での結果あり
- 71-90点: 数字 + 学び・気づきあり
- 91-100点: その後の活かし方・再現性まで言及

## 会話履歴
{conversation}

## 出力形式
必ず以下のJSON形式で回答してください：
{{
  "scores": {{
    "situation": 0-100の数値,
    "task": 0-100の数値,
    "action": 0-100の数値,
    "result": 0-100の数値
  }},
  "missing_aspects": {{
    "situation": ["不足している観点1", "不足している観点2"],
    "task": ["不足している観点1"],
    "action": ["不足している観点1", "不足している観点2"],
    "result": ["不足している観点1"]
  }}
}}"""


# STAR法ベースの質問生成プロンプト
STAR_QUESTION_PROMPT = """あなたは就活生の「ガクチカ」を深掘りするプロのインタビュアーです。

## テーマ
{gakuchika_title}

## 現在のSTAR評価スコア
- 状況（Situation）: {situation_score}%
- 課題（Task）: {task_score}%
- 行動（Action）: {action_score}%
- 結果（Result）: {result_score}%

## 最も深掘りが必要な要素
**{weakest_element}** を重点的に深掘りしてください。

## 不足している観点
{missing_aspects}

## 質問生成ルール

### 必須: 前回の回答を引用する
前回のユーザー回答から具体的なフレーズを引用し、「先ほど『〇〇』とおっしゃいましたが...」のように始めてください。

### 禁止表現（使ってはいけない）
- ❌「もう少し詳しく教えてください」
- ❌「具体的に説明してください」
- ❌「他にありますか？」
- ❌「どうでしたか？」

### 推奨: 具体的な切り口で聞く
- 数字を聞く: 「具体的に何人でしたか？」「何%変化しましたか？」「期間はどれくらいでしたか？」
- 感情を聞く: 「その瞬間、どんな気持ちでしたか？」「一番大変だったのはどんなときですか？」
- 判断理由を聞く: 「なぜその方法を選んだのですか？」「他に検討した案はありましたか？」
- 他者評価を聞く: 「周りの人はどんな反応でしたか？」「誰かに褒められたり、指摘されたりしましたか？」
- 困難を聞く: 「途中で壁にぶつかったことはありますか？」「うまくいかなかったときはどう対処しましたか？」

## 出力形式
必ず以下のJSON形式で回答してください：
{{
  "question": "質問文（前回の回答を引用しつつ、具体的な切り口で）",
  "reasoning": "この質問をする理由（1文）",
  "target_element": "situation|task|action|result",
  "should_continue": true,
  "suggested_end": false
}}

suggested_endは全てのSTAR要素が{threshold}%以上の場合のみtrueにしてください。"""


def _format_conversation_for_evaluation(messages: list[Message]) -> str:
    """Format conversation history for STAR evaluation prompt."""
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        formatted.append(f"{role_label}: {msg.content}")
    return "\n\n".join(formatted)


def _get_weakest_element(scores: STARScores) -> str:
    """Get the STAR element with the lowest score."""
    elements = {
        "situation": scores.situation,
        "task": scores.task,
        "action": scores.action,
        "result": scores.result,
    }
    return min(elements, key=elements.get)


def _get_element_japanese_name(element: str) -> str:
    """Convert STAR element to Japanese name."""
    names = {
        "situation": "状況",
        "task": "課題",
        "action": "行動",
        "result": "結果",
    }
    return names.get(element, element)


def _is_star_complete(scores: STARScores, threshold: int = STAR_COMPLETION_THRESHOLD) -> bool:
    """Check if all STAR elements meet the completion threshold."""
    return (
        scores.situation >= threshold
        and scores.task >= threshold
        and scores.action >= threshold
        and scores.result >= threshold
    )


def _get_last_user_answer(messages: list[Message]) -> Optional[str]:
    """Get the last user answer from conversation history."""
    for msg in reversed(messages):
        if msg.role == "user":
            return msg.content
    return None


@router.post("/evaluate-star")
async def evaluate_star(request: NextQuestionRequest) -> dict:
    """
    Evaluate the current conversation for STAR element coverage.
    Returns scores for each element and identifies missing aspects.
    """
    if not request.conversation_history:
        # Return initial scores for empty conversation
        return {
            "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
            "weakest_element": "situation",
            "is_complete": False,
            "missing_aspects": {
                "situation": ["時期", "場所", "規模"],
                "task": ["課題の内容", "なぜ課題だったか"],
                "action": ["具体的な行動", "工夫した点"],
                "result": ["数字での成果", "学び"],
            },
        }

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)
    prompt = STAR_EVALUATION_PROMPT.format(conversation=conversation_text)

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を評価してください。",
        max_tokens=500,
        temperature=0.3,  # Lower temperature for consistent evaluation
        feature="gakuchika",
    )

    if not llm_result.success or llm_result.data is None:
        # Return previous scores or defaults on error
        if request.star_scores:
            scores = STARScores(**request.star_scores)
        else:
            scores = STARScores()

        return {
            "scores": scores.model_dump(),
            "weakest_element": _get_weakest_element(scores),
            "is_complete": _is_star_complete(scores),
            "missing_aspects": {
                "situation": [],
                "task": [],
                "action": [],
                "result": [],
            },
        }

    data = llm_result.data
    scores_data = data.get("scores", {})
    scores = STARScores(
        situation=scores_data.get("situation", 0),
        task=scores_data.get("task", 0),
        action=scores_data.get("action", 0),
        result=scores_data.get("result", 0),
    )

    return {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_star_complete(scores),
        "missing_aspects": data.get("missing_aspects", {}),
    }


@router.post("/next-question", response_model=NextQuestionResponse)
async def get_next_question(request: NextQuestionRequest):
    """
    Generate the next deep-dive question for Gakuchika based on STAR evaluation.

    Flow:
    1. Evaluate current conversation for STAR coverage
    2. Identify weakest element
    3. Generate targeted question for that element
    4. Return question with updated STAR scores
    """
    if not request.gakuchika_title:
        raise HTTPException(
            status_code=400, detail="ガクチカのテーマが指定されていません"
        )

    # Handle initial question (no conversation history)
    if not request.conversation_history:
        initial_question = f"「{request.gakuchika_title}」について、具体的にどのようなことに取り組みましたか？"
        if request.gakuchika_content:
            initial_question = f"記載いただいた「{request.gakuchika_title}」の経験について、まず最も印象に残っている場面を教えてください。"

        return NextQuestionResponse(
            question=initial_question,
            reasoning="会話開始時の導入質問",
            should_continue=True,
            suggested_end=False,
            star_evaluation={
                "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
                "weakest_element": "situation",
                "is_complete": False,
            },
            target_element="situation",
        )

    # Step 1: Evaluate current STAR coverage
    star_eval = await evaluate_star(request)
    scores = STARScores(**star_eval["scores"])
    weakest_element = star_eval["weakest_element"]
    is_complete = star_eval["is_complete"]
    missing_aspects = star_eval.get("missing_aspects", {})

    # If STAR is complete, suggest ending
    if is_complete:
        return NextQuestionResponse(
            question="これまでの深掘りで、状況・課題・行動・結果が具体的に整理できました。最後に、この経験を通じて得た一番の学びを一言でまとめると何ですか？",
            reasoning="STAR全要素が基準値に達したため、締めの質問",
            should_continue=False,
            suggested_end=True,
            star_evaluation=star_eval,
            target_element="result",
        )

    # Step 2: Format missing aspects for prompt
    weakest_jp = _get_element_japanese_name(weakest_element)
    missing_for_weakest = missing_aspects.get(weakest_element, [])
    missing_aspects_text = f"「{weakest_jp}」で不足: {', '.join(missing_for_weakest)}" if missing_for_weakest else ""

    # Step 3: Generate targeted question
    prompt = STAR_QUESTION_PROMPT.format(
        gakuchika_title=request.gakuchika_title,
        situation_score=scores.situation,
        task_score=scores.task,
        action_score=scores.action,
        result_score=scores.result,
        weakest_element=weakest_jp,
        missing_aspects=missing_aspects_text,
        threshold=STAR_COMPLETION_THRESHOLD,
    )

    # Build conversation messages for context
    messages = [{"role": msg.role, "content": msg.content} for msg in request.conversation_history]

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="次の深掘り質問を生成してください。",
        messages=messages,
        max_tokens=400,
        temperature=0.7,
        feature="gakuchika",
    )

    if not llm_result.success:
        error = llm_result.error
        print(f"[Gakuchika] LLM error: {error.detail if error else 'unknown'}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": (
                    error.message
                    if error
                    else "AIサービスに接続できませんでした。しばらくしてからもう一度お試しください。"
                ),
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data
    if data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIからの応答を解析できませんでした。もう一度お試しください。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "Empty response from LLM",
            },
        )

    question = data.get("question")
    if not question:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIから有効な質問を取得できませんでした。",
                "error_type": "parse",
                "provider": "unknown",
                "detail": "No question in response",
            },
        )

    return NextQuestionResponse(
        question=question,
        reasoning=data.get("reasoning"),
        should_continue=data.get("should_continue", True),
        suggested_end=data.get("suggested_end", False),
        star_evaluation=star_eval,
        target_element=data.get("target_element", weakest_element),
    )


@router.post("/summary")
async def generate_summary(request: NextQuestionRequest):
    """
    Generate a summary of the Gakuchika conversation for use in ES writing.
    """
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    user_answers = [
        msg.content for msg in request.conversation_history if msg.role == "user"
    ]

    if not user_answers:
        raise HTTPException(status_code=400, detail="ユーザーの回答がありません")

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

    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    llm_result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=f"テーマ: {request.gakuchika_title}\n\n会話履歴:\n{conversation_text}",
        max_tokens=1000,
        temperature=0.3,
        feature="gakuchika",
    )

    if llm_result.success and llm_result.data is not None:
        return llm_result.data

    error = llm_result.error
    raise HTTPException(
        status_code=503,
        detail={
            "error": (
                error.message if error else "サマリー生成中にエラーが発生しました。"
            ),
            "error_type": error.error_type if error else "unknown",
            "provider": error.provider if error else "unknown",
            "detail": error.detail if error else "",
        },
    )
