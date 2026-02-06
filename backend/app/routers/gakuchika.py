"""
Gakuchika (学生時代に力を入れたこと) Router

AI-powered deep-dive questioning for Gakuchika refinement using LLM.

Phase 1 Improvements (Deep-dive Enhancement):
- Merged STAR evaluation + question generation into a single LLM call
- Conversation phase system (opening/exploration/deep_dive/synthesis)
- Question diversity enforcement (8 question types)
- Content-aware initial question generation
- Enhanced persona and forbidden expressions
"""

import asyncio
import json
import random
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.utils.llm import call_llm_with_error

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

# Configuration
STAR_COMPLETION_THRESHOLD = 70  # 各STAR要素がこの%以上で完了とみなす
QUESTIONS_PER_CREDIT = 5  # 5問回答ごとに1クレジット消費

# Conversation phases based on question count
PHASE_OPENING = "opening"  # 0-2: 全体像の把握
PHASE_EXPLORATION = "exploration"  # 3-5: 課題と行動の深掘り
PHASE_DEEP_DIVE = "deep_dive"  # 6-8: 具体的な場面の掘り下げ
PHASE_SYNTHESIS = "synthesis"  # 9+: 学びと再現性の確認

# Question types for diversity enforcement
QUESTION_TYPE_NUMBERS = "numbers"
QUESTION_TYPE_EMOTIONS = "emotions"
QUESTION_TYPE_REASONING = "reasoning"
QUESTION_TYPE_OTHERS_PERSPECTIVE = "others_perspective"
QUESTION_TYPE_DIFFICULTY = "difficulty"
QUESTION_TYPE_CONTRAST = "contrast"
QUESTION_TYPE_SCENE = "scene"
QUESTION_TYPE_LEARNING = "learning"


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
    # STAR scores from previous evaluation (optional, can include extended fields)
    star_scores: Optional[dict] = None


class NextQuestionResponse(BaseModel):
    question: str
    reasoning: Optional[str] = None
    should_continue: bool = True
    suggested_end: bool = False
    # STAR evaluation after processing the conversation
    star_evaluation: Optional[dict] = None
    # Which STAR element this question targets
    target_element: Optional[str] = None
    # Question type for diversity tracking
    question_type: Optional[str] = None


# STAR評価プロンプト (standalone use)
STAR_EVALUATION_PROMPT = """以下のガクチカ会話を分析し、STAR法の各要素の充実度を0-100で評価してください。

## 評価基準

### 状況(Situation) 0-100点
- 0-30点: 時期・場所・規模の記載なし
- 31-50点: 一部記載あり(例: 「サークルで」)
- 51-70点: 具体的だが数字なし(例: 「大学2年のサークルで」)
- 71-90点: 具体的で数字あり(例: 「大学2年の秋、30人規模のテニスサークルで」)
- 91-100点: 背景の社会的文脈まで説明

### 課題(Task) 0-100点
- 0-30点: 課題が不明確
- 31-50点: 課題は分かるが「なぜ課題か」が不明
- 51-70点: 課題と理由あり(例: 「参加率低下で大会出場が危うい」)
- 71-90点: 課題の深刻さ・自分の責任範囲が明確
- 91-100点: 複数の観点から課題を分析

### 行動(Action) 0-100点
- 0-30点: 何をしたか不明確
- 31-50点: 行動はあるが「なぜその方法か」不明
- 51-70点: 行動と理由あり
- 71-90点: 工夫・困難の乗り越え方あり
- 91-100点: PDCAサイクル・チームでの役割まで明確

### 結果(Result) 0-100点
- 0-30点: 結果が不明確(「うまくいった」等)
- 31-50点: 定性的な結果のみ
- 51-70点: 数字での結果あり
- 71-90点: 数字 + 学び・気づきあり
- 91-100点: その後の活かし方・再現性まで言及

## 会話履歴
{conversation}

## 出力形式
必ず以下のJSON形式で回答してください:
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


# 統合プロンプト: STAR評価 + 質問生成
STAR_EVALUATE_AND_QUESTION_PROMPT = """あなたは10年以上の経験を持つ就活アドバイザーです。学生の「ガクチカ」を深掘りし、経験の価値を最大限引き出すことが役割です。

## あなたのキャラクター
- 共感力が高く、学生の経験に真剣に向き合う
- 「何をしたか」ではなく「なぜそうしたか」「何を感じたか」を重視
- 面接官ではなく、経験の価値を一緒に発見するパートナー

## テーマ
{gakuchika_title}

## 会話履歴
{conversation}

## 会話フェーズ
現在: **{phase_name}** ({phase_description})
推奨質問タイプ: {preferred_question_types}
推奨ターゲット要素: {preferred_target_elements}

## これまでの質問タイプ履歴
{question_type_history}

## タスク
1. 上記の会話を分析し、STAR法の各要素(状況・課題・行動・結果)を0-100点で評価
2. 最も不足している要素を特定
3. 会話フェーズと質問多様性を考慮し、次の深掘り質問を生成

## STAR評価基準

### 状況(Situation) 0-100点
- 0-30点: 時期・場所・規模の記載なし
- 31-50点: 一部記載あり(例: 「サークルで」)
- 51-70点: 具体的だが数字なし(例: 「大学2年のサークルで」)
- 71-90点: 具体的で数字あり(例: 「大学2年の秋、30人規模のテニスサークルで」)
- 91-100点: 背景の社会的文脈まで説明

### 課題(Task) 0-100点
- 0-30点: 課題が不明確
- 31-50点: 課題は分かるが「なぜ課題か」が不明
- 51-70点: 課題と理由あり(例: 「参加率低下で大会出場が危うい」)
- 71-90点: 課題の深刻さ・自分の責任範囲が明確
- 91-100点: 複数の観点から課題を分析

### 行動(Action) 0-100点
- 0-30点: 何をしたか不明確
- 31-50点: 行動はあるが「なぜその方法か」不明
- 51-70点: 行動と理由あり
- 71-90点: 工夫・困難の乗り越え方あり
- 91-100点: PDCAサイクル・チームでの役割まで明確

### 結果(Result) 0-100点
- 0-30点: 結果が不明確(「うまくいった」等)
- 31-50点: 定性的な結果のみ
- 51-70点: 数字での結果あり
- 71-90点: 数字 + 学び・気づきあり
- 91-100点: その後の活かし方・再現性まで言及

## 質問生成ルール

### 必須: 前回の回答を引用する
前回のユーザー回答から具体的なフレーズを引用し、「先ほど『〇〇』とおっしゃいましたが...」のように始めてください。

### 禁止表現(絶対に使わない)
- ❌「もう少し詳しく教えてください」
- ❌「具体的に説明してください」
- ❌「他にありますか?」
- ❌「どうでしたか?」
- ❌「教えてください」
- ❌「いかがでしたか?」
- ❌「詳しく聞かせてください」
- ❌「何かありますか?」
- ❌「どのように感じましたか?」
- ❌「お聞かせください」

### 推奨: 具体的な切り口で聞く(質問タイプ別)

**numbers(数字)**: 「具体的に何人でしたか?」「何%変化しましたか?」「期間はどれくらいでしたか?」
**emotions(感情)**: 「その瞬間、どんな気持ちでしたか?」「一番嬉しかったのはどんなときですか?」
**reasoning(判断理由)**: 「なぜその方法を選んだのですか?」「他に検討した案はありましたか?」
**others_perspective(他者視点)**: 「周りの人はどんな反応でしたか?」「誰かに褒められたり、指摘されたりしましたか?」
**difficulty(困難)**: 「途中で壁にぶつかったことはありますか?」「うまくいかなかったときはどう対処しましたか?」
**contrast(対比)**: 「取り組む前と後で何が変わりましたか?」「他の人とは違うアプローチでしたか?」
**scene(場面)**: 「最も印象に残っている場面を教えてください」「ターニングポイントとなった瞬間はいつですか?」
**learning(学び)**: 「この経験から何を学びましたか?」「今後どう活かしていきますか?」

### 質問多様性の確保
- **重要**: 直前の質問と同じタイプを連続使用しない
- フェーズに応じた推奨タイプを優先するが、柔軟に判断してよい

### フォローアップチェーン戦略
- **重要**: 前回の回答の中で最も重要な部分（具体的な行動、結果、感情）を特定し、そこを起点に深掘りする
- 独立した新しい質問ではなく、前回の回答を引用しながら「その〇〇について、もう少し詳しく教えてください」のように掘り下げる
- 2-3個の段階的な深掘りを意識する（表面的回答→具体的行動→その結果/学び）

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "star_scores": {{
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
  }},
  "question": "質問文(前回の回答を引用しつつ、具体的な切り口で)",
  "question_type": "numbers|emotions|reasoning|others_perspective|difficulty|contrast|scene|learning",
  "target_element": "situation|task|action|result",
  "reasoning": "この質問をする理由(1文)",
  "should_continue": true,
  "suggested_end": {suggested_end_value}
}}

suggested_endは全てのSTAR要素が{threshold}%以上の場合のみtrueにしてください。"""


# 初回質問生成プロンプト(コンテンツあり)
INITIAL_QUESTION_PROMPT = """あなたは10年以上の経験を持つ就活アドバイザーです。学生が記載したガクチカの内容を読み、最初の深掘り質問を生成してください。

## テーマ
{gakuchika_title}

## 学生が記載した内容
{gakuchika_content}

## タスク
上記の内容を読み、学生が最も印象に残っている場面や、最も力を入れた部分について尋ねる質問を生成してください。

## 質問生成ルール

### 禁止表現(絶対に使わない)
- ❌「もう少し詳しく教えてください」
- ❌「具体的に説明してください」
- ❌「他にありますか?」
- ❌「どうでしたか?」
- ❌「教えてください」
- ❌「いかがでしたか?」
- ❌「詳しく聞かせてください」
- ❌「何かありますか?」
- ❌「どのように感じましたか?」
- ❌「お聞かせください」

### 推奨: 内容に基づいた具体的な質問
- 記載内容から具体的なキーワードを引用する
- 「〇〇に取り組まれたとのことですが...」のように始める
- 場面や感情を聞く質問が効果的

## 出力形式
必ず以下のJSON形式で回答してください:
{{
  "question": "質問文(内容を引用しつつ、具体的な切り口で)",
  "question_type": "scene",
  "reasoning": "この質問をする理由(1文)"
}}"""


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


def _determine_phase(question_count: int) -> tuple[str, str, list[str], list[str]]:
    """
    Determine conversation phase based on question count.

    Returns:
        (phase_name, description, preferred_question_types, preferred_target_elements)
    """
    if question_count <= 2:
        return (
            PHASE_OPENING,
            "全体像の把握。テーマの背景・時期・規模感を聞く",
            [QUESTION_TYPE_SCENE, QUESTION_TYPE_NUMBERS, QUESTION_TYPE_CONTRAST],
            ["situation", "task"],
        )
    elif question_count <= 5:
        return (
            PHASE_EXPLORATION,
            "課題と行動の深掘り。なぜ・どうやって・何が大変だったか",
            [QUESTION_TYPE_REASONING, QUESTION_TYPE_DIFFICULTY, QUESTION_TYPE_EMOTIONS],
            ["task", "action"],
        )
    elif question_count <= 8:
        return (
            PHASE_DEEP_DIVE,
            "具体的な場面の掘り下げ。感情・判断理由・数字",
            [QUESTION_TYPE_EMOTIONS, QUESTION_TYPE_OTHERS_PERSPECTIVE, QUESTION_TYPE_NUMBERS, QUESTION_TYPE_SCENE],
            ["action", "result"],
        )
    else:
        return (
            PHASE_SYNTHESIS,
            "学びと再現性の確認。得たもの・今後どう活かすか",
            [QUESTION_TYPE_LEARNING, QUESTION_TYPE_CONTRAST, QUESTION_TYPE_REASONING],
            ["result"],
        )


def _build_question_type_history(star_scores: Optional[dict]) -> str:
    """
    Build question type history string from star_scores extended field.

    Args:
        star_scores: Dictionary that may contain a "question_types" list

    Returns:
        Formatted string describing question type history
    """
    if not star_scores or "question_types" not in star_scores:
        return "まだ質問していません"

    question_types = star_scores.get("question_types", [])
    if not question_types:
        return "まだ質問していません"

    # Get last 3 question types
    recent_types = question_types[-3:]
    type_names = {
        QUESTION_TYPE_NUMBERS: "数字",
        QUESTION_TYPE_EMOTIONS: "感情",
        QUESTION_TYPE_REASONING: "判断理由",
        QUESTION_TYPE_OTHERS_PERSPECTIVE: "他者視点",
        QUESTION_TYPE_DIFFICULTY: "困難",
        QUESTION_TYPE_CONTRAST: "対比",
        QUESTION_TYPE_SCENE: "場面",
        QUESTION_TYPE_LEARNING: "学び",
    }

    history_items = [type_names.get(t, t) for t in recent_types]

    # Identify last type for consecutive check
    last_type = question_types[-1] if question_types else None
    last_type_name = type_names.get(last_type, last_type) if last_type else "なし"

    return f"{', '.join(history_items)} (直前: {last_type_name} - これは連続使用禁止)"


def _get_last_question_type(star_scores: Optional[dict]) -> Optional[str]:
    """Get the last question type from star_scores extended field."""
    if not star_scores or "question_types" not in star_scores:
        return None

    question_types = star_scores.get("question_types", [])
    return question_types[-1] if question_types else None


@router.post("/evaluate-star")
async def evaluate_star(request: NextQuestionRequest) -> dict:
    """
    Evaluate the current conversation for STAR element coverage.
    Returns scores for each element and identifies missing aspects.

    This endpoint is kept for standalone use (e.g., progress visualization).
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
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        # Return previous scores or defaults on error
        if request.star_scores:
            scores = STARScores(**{k: v for k, v in request.star_scores.items() if k in ["situation", "task", "action", "result"]})
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
    Generate the next deep-dive question for Gakuchika.

    Phase 1 Improvements:
    - Merged STAR evaluation + question generation into single LLM call
    - Conversation phase system for adaptive questioning
    - Question diversity enforcement (no consecutive same types)
    - Content-aware initial question generation

    Flow:
    1. Handle initial question (with/without content)
    2. Determine conversation phase
    3. Generate STAR evaluation + next question in single call
    4. Track question types for diversity
    """
    if not request.gakuchika_title:
        raise HTTPException(
            status_code=400, detail="ガクチカのテーマが指定されていません"
        )

    # Handle initial question (no conversation history or no user response yet)
    has_user_response = any(msg.role == "user" for msg in request.conversation_history)
    if not has_user_response:
        # Template-based initial questions (no LLM call for cost optimization)
        template_questions = [
            "まず、取り組んだ時期と期間を教えてください。",
            "この活動に参加したきっかけは何でしたか?",
            "当時、どのような役割を担っていましたか?",
            "活動の規模感(人数や範囲など)を教えてください。",
        ]

        initial_question = None
        question_type = QUESTION_TYPE_SCENE
        reasoning = "会話開始時の導入質問"

        # If content is provided, use LLM to generate personalized initial question
        if request.gakuchika_content:
            prompt = INITIAL_QUESTION_PROMPT.format(
                gakuchika_title=request.gakuchika_title,
                gakuchika_content=request.gakuchika_content,
            )

            llm_result = await call_llm_with_error(
                system_prompt=prompt,
                user_message="最初の深掘り質問を生成してください。",
                max_tokens=300,
                temperature=0.7,
                feature="gakuchika",
                disable_fallback=True,
            )

            if llm_result.success and llm_result.data:
                data = llm_result.data
                initial_question = data.get("question")
                question_type = data.get("question_type", QUESTION_TYPE_SCENE)
                reasoning = data.get("reasoning", "会話開始時の導入質問")

        # Fallback to template if LLM failed or no content
        if not initial_question:
            initial_question = random.choice(template_questions)

        return NextQuestionResponse(
            question=initial_question,
            reasoning=reasoning,
            should_continue=True,
            suggested_end=False,
            star_evaluation={
                "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
                "weakest_element": "situation",
                "is_complete": False,
            },
            target_element="situation",
            question_type=question_type,
        )

    # Determine conversation phase
    phase_name, phase_desc, preferred_types, preferred_elements = _determine_phase(
        request.question_count
    )

    # Build question type history
    question_type_history = _build_question_type_history(request.star_scores)
    last_question_type = _get_last_question_type(request.star_scores)

    # Format conversation for prompt
    conversation_text = _format_conversation_for_evaluation(request.conversation_history)

    # Build unified prompt
    prompt = STAR_EVALUATE_AND_QUESTION_PROMPT.format(
        gakuchika_title=request.gakuchika_title,
        conversation=conversation_text,
        phase_name=phase_name,
        phase_description=phase_desc,
        preferred_question_types=", ".join(preferred_types),
        preferred_target_elements=", ".join(preferred_elements),
        question_type_history=question_type_history,
        threshold=STAR_COMPLETION_THRESHOLD,
        suggested_end_value="false" if request.question_count < 5 else "false",
    )

    # Single LLM call for both evaluation and question generation
    # Note: conversation context is already embedded in the system prompt via {conversation} placeholder.
    # We use messages=None so user_message is properly sent as the user turn,
    # avoiding Claude API's requirement that messages must start with role="user".
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
        max_tokens=600,  # 統合レスポンス (scores+question+metadata) は400-500トークンで十分
        temperature=0.7,
        feature="gakuchika",
        disable_fallback=True,
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

    # Extract STAR scores
    star_scores_data = data.get("star_scores", {})
    scores = STARScores(
        situation=star_scores_data.get("situation", 0),
        task=star_scores_data.get("task", 0),
        action=star_scores_data.get("action", 0),
        result=star_scores_data.get("result", 0),
    )

    # Build star evaluation
    star_eval = {
        "scores": scores.model_dump(),
        "weakest_element": _get_weakest_element(scores),
        "is_complete": _is_star_complete(scores),
        "missing_aspects": data.get("missing_aspects", {}),
    }

    # Extract question
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

    # Extract metadata
    question_type = data.get("question_type", QUESTION_TYPE_SCENE)
    target_element = data.get("target_element", _get_weakest_element(scores))
    reasoning = data.get("reasoning")
    should_continue = data.get("should_continue", True)
    suggested_end = data.get("suggested_end", False)

    # Validate question type diversity (consecutive same type check)
    if last_question_type and question_type == last_question_type:
        print(f"[Gakuchika] Warning: Consecutive same question type '{question_type}' detected")
        # Note: We allow it but log the warning. LLM should handle this based on prompt.

    return NextQuestionResponse(
        question=question,
        reasoning=reasoning,
        should_continue=should_continue,
        suggested_end=suggested_end,
        star_evaluation=star_eval,
        target_element=target_element,
        question_type=question_type,
    )


# ── SSE Streaming helpers ──────────────────────────────────────────────

def _sse_event(event_type: str, data: dict) -> str:
    """Format SSE event data."""
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _generate_next_question_progress(
    request: NextQuestionRequest,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for gakuchika next-question with progress updates.
    Gakuchika uses a single LLM call (unified eval+question), so 2 progress steps suffice.
    """
    try:
        if not request.gakuchika_title:
            yield _sse_event("error", {"message": "ガクチカのテーマが指定されていません"})
            return

        # Handle initial question (no user response) — return immediately
        has_user_response = any(msg.role == "user" for msg in request.conversation_history)
        if not has_user_response:
            template_questions = [
                "まず、取り組んだ時期と期間を教えてください。",
                "この活動に参加したきっかけは何でしたか?",
                "当時、どのような役割を担っていましたか?",
                "活動の規模感(人数や範囲など)を教えてください。",
            ]

            initial_question = None
            question_type = QUESTION_TYPE_SCENE
            reasoning = "会話開始時の導入質問"

            if request.gakuchika_content:
                prompt = INITIAL_QUESTION_PROMPT.format(
                    gakuchika_title=request.gakuchika_title,
                    gakuchika_content=request.gakuchika_content,
                )
                llm_result = await call_llm_with_error(
                    system_prompt=prompt,
                    user_message="最初の深掘り質問を生成してください。",
                    max_tokens=300,
                    temperature=0.7,
                    feature="gakuchika",
                    disable_fallback=True,
                )
                if llm_result.success and llm_result.data:
                    data = llm_result.data
                    initial_question = data.get("question")
                    question_type = data.get("question_type", QUESTION_TYPE_SCENE)
                    reasoning = data.get("reasoning", "会話開始時の導入質問")

            if not initial_question:
                initial_question = random.choice(template_questions)

            yield _sse_event("complete", {
                "data": {
                    "question": initial_question,
                    "reasoning": reasoning,
                    "should_continue": True,
                    "suggested_end": False,
                    "star_evaluation": {
                        "scores": {"situation": 0, "task": 0, "action": 0, "result": 0},
                        "weakest_element": "situation",
                        "is_complete": False,
                    },
                    "target_element": "situation",
                    "question_type": question_type,
                },
            })
            return

        # Step 1: Analyzing response
        yield _sse_event("progress", {
            "step": "analysis", "progress": 30, "label": "回答を分析中...",
        })
        await asyncio.sleep(0.05)

        # Determine conversation phase
        phase_name, phase_desc, preferred_types, preferred_elements = _determine_phase(
            request.question_count
        )
        question_type_history = _build_question_type_history(request.star_scores)

        # Format conversation for prompt
        conversation_text = _format_conversation_for_evaluation(request.conversation_history)

        # Step 2: Generating question
        yield _sse_event("progress", {
            "step": "question", "progress": 60, "label": "次の質問を生成中...",
        })
        await asyncio.sleep(0.05)

        # Build unified prompt
        prompt = STAR_EVALUATE_AND_QUESTION_PROMPT.format(
            gakuchika_title=request.gakuchika_title,
            conversation=conversation_text,
            phase_name=phase_name,
            phase_description=phase_desc,
            preferred_question_types=", ".join(preferred_types),
            preferred_target_elements=", ".join(preferred_elements),
            question_type_history=question_type_history,
            threshold=STAR_COMPLETION_THRESHOLD,
            suggested_end_value="false" if request.question_count < 5 else "false",
        )

        llm_result = await call_llm_with_error(
            system_prompt=prompt,
            user_message="上記の会話を分析し、STAR評価と次の質問をJSON形式で生成してください。",
            max_tokens=600,
            temperature=0.7,
            feature="gakuchika",
            disable_fallback=True,
        )

        if not llm_result.success:
            error = llm_result.error
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
            })
            return

        data = llm_result.data
        if data is None:
            yield _sse_event("error", {
                "message": "AIからの応答を解析できませんでした。",
            })
            return

        # Extract STAR scores
        star_scores_data = data.get("star_scores", {})
        scores = STARScores(
            situation=star_scores_data.get("situation", 0),
            task=star_scores_data.get("task", 0),
            action=star_scores_data.get("action", 0),
            result=star_scores_data.get("result", 0),
        )

        star_eval = {
            "scores": scores.model_dump(),
            "weakest_element": _get_weakest_element(scores),
            "is_complete": _is_star_complete(scores),
            "missing_aspects": data.get("missing_aspects", {}),
        }

        question = data.get("question")
        if not question:
            yield _sse_event("error", {
                "message": "AIから有効な質問を取得できませんでした。",
            })
            return

        yield _sse_event("complete", {
            "data": {
                "question": question,
                "reasoning": data.get("reasoning"),
                "should_continue": data.get("should_continue", True),
                "suggested_end": data.get("suggested_end", False),
                "star_evaluation": star_eval,
                "target_element": data.get("target_element", _get_weakest_element(scores)),
                "question_type": data.get("question_type", QUESTION_TYPE_SCENE),
            },
        })

    except Exception as e:
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(e)}"})


@router.post("/next-question/stream")
async def get_next_question_stream(request: NextQuestionRequest):
    """
    SSE streaming version of next-question.
    Yields progress events then complete/error event.
    """
    return StreamingResponse(
        _generate_next_question_progress(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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
以下のガクチカ深掘り会話の内容を、ES(エントリーシート)で使いやすい形にまとめてください。

以下の情報を抽出してJSON形式で返してください:
1. summary: 経験の要約(200-300字程度)
2. key_points: キーとなるポイントのリスト(3-5個)
3. numbers: 言及された具体的な数字や成果のリスト
4. strengths: この経験から読み取れる強み(2-3個)

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
        max_tokens=800,  # summary(200-300字)+key_points+numbers+strengths で600-700トークン
        temperature=0.3,
        feature="gakuchika",
        disable_fallback=True,
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
