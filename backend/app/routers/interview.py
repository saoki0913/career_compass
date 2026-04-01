import asyncio
import json
import re
from typing import Any, AsyncGenerator, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.limiter import limiter
from app.prompts.notion_registry import get_managed_prompt_content
from app.utils.llm import (
    PromptSafetyError,
    call_llm_streaming_fields,
    call_llm_with_error,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/interview", tags=["interview"])

QUESTION_STAGE_ORDER = [
    "industry_reason",
    "role_reason",
    "opening",
    "experience",
    "company_understanding",
    "motivation_fit",
]
STAGE_ORDER = [*QUESTION_STAGE_ORDER, "feedback"]
STAGE_LABELS = {
    "industry_reason": "業界志望理由",
    "role_reason": "職種志望理由",
    "opening": "導入・人物把握",
    "experience": "経験・ガクチカ",
    "company_understanding": "企業理解",
    "motivation_fit": "志望動機・適合",
    "feedback": "最終講評",
}
STAGE_GOALS = {
    "industry_reason": "業界を志望する理由が本人の言葉で短く明確に語れる状態にする。",
    "role_reason": "その職種を志望する理由と、自分の強みとの接続を確認する。",
    "opening": "自己紹介・価値観・人物像を把握し、核となる経験を定める。",
    "experience": "経験の課題、役割、判断、成果、再現性を深掘りする。",
    "company_understanding": "なぜこの会社か、なぜこの事業・配属・制度理解かを別観点で確認する。",
    "motivation_fit": "入社後の役割、初期貢献、適合理由まで接続する。",
    "feedback": "面接全体を振り返り、改善点と次の論点を整理する。",
}
STAGE_MIN_COUNTS = {
    "industry_reason": 1,
    "role_reason": 1,
    "opening": 1,
    "experience": 2,
    "company_understanding": 2,
    "motivation_fit": 2,
}
STAGE_MAX_COUNTS = {
    "industry_reason": 1,
    "role_reason": 1,
    "opening": 2,
    "experience": 4,
    "company_understanding": 4,
    "motivation_fit": 4,
}
TOTAL_MIN_QUESTIONS = 10
TOTAL_MAX_QUESTIONS = 15
DEFAULT_STAGE_COUNTS = {
    "industry_reason": 0,
    "role_reason": 0,
    "opening": 0,
    "experience": 0,
    "company_understanding": 0,
    "motivation_fit": 0,
}
STAGE_FOCUS_OPTIONS = {
    "industry_reason": [
        "業界志望の核",
        "業界を選ぶ背景",
        "他業界との差分",
    ],
    "role_reason": [
        "職種志望の根拠",
        "強みとの接続",
        "業務理解の深さ",
    ],
    "opening": [
        "自己紹介の軸",
        "価値観の源泉",
        "人物像が出る経験",
    ],
    "experience": [
        "課題設定の具体性",
        "役割と責任範囲",
        "意思決定の理由",
        "成果の根拠",
        "再現性",
    ],
    "company_understanding": [
        "なぜこの会社か",
        "事業理解の根拠",
        "他社との差分",
        "配属・制度理解",
    ],
    "motivation_fit": [
        "入社後の役割像",
        "初期貢献の解像度",
        "活かす強み",
        "中長期の適合",
    ],
}

_INTERVIEW_TURN_EVALUATION_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。企業特化模擬面接の直近回答を評価し、同じ段階を深掘りするか次に進むかを決めてください。

## 企業
- 企業名: {company_name}
- 企業情報:
{company_summary}

## 前提
- 志望業界: {selected_industry}
- 志望職種: {selected_role}
- seed_summary:
{seed_summary}

## 参考材料
{materials_section}

## 現在段階
- current_stage: {current_stage}
- stage_label: {stage_label}
- stage_goal: {stage_goal}
- stage_question_count: {stage_question_count}
- total_question_count: {total_question_count}
- minimum_questions_for_stage: {stage_min_count}
- maximum_questions_for_stage: {stage_max_count}
- last_focus: {last_focus}

## 会話履歴
{conversation_text}

## 直近の応募者回答
{latest_answer}

## 評価観点
- その段階で聞くべき論点が十分に語れているか
- 抽象論ではなく、具体的な事実・役割・理由・成果があるか
- 確認済みの業界/職種前提とズレていないか
- 業界共通論点と企業固有論点に未解消ギャップが残っていないか

## ルール
- `decision` は `stay` / `advance` / `complete` のいずれか
- 現在段階の不足があるなら `stay`
- 次段階へ進んだほうが自然なら `advance`
- `motivation_fit` が十分で、総質問数が 10 問以上に達しているなら `complete`
- `recommended_focus` は次に聞くべき論点を 20 文字以内で 1 つ
- `missing_points` と `interviewer_concerns` は最大 3 件
- JSON 以外は禁止

## 出力形式
{{
  "decision": "stay|advance|complete",
  "recommended_focus": "次に聞く論点",
  "reason": "判定理由を1文",
  "stage_assessment": {{
    "coverage": 0,
    "specificity": 0,
    "logic": 0,
    "company_fit": 0,
    "premise_consistency": 0
  }},
  "missing_points": ["不足点"],
  "interviewer_concerns": ["懸念点"]
}}"""

_INTERVIEW_QUESTION_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。企業特化模擬面接の次の質問を1つだけ作ってください。

## 企業
- 企業名: {company_name}
- 企業情報:
{company_summary}

## 前提
- 志望業界: {selected_industry}
- 志望職種: {selected_role}
- seed_summary:
{seed_summary}

## 参考材料
{materials_section}

## 現在段階
- current_stage: {current_stage}
- stage_label: {stage_label}
- stage_goal: {stage_goal}
- stage_question_count: {stage_question_count}
- total_question_count: {total_question_count}
- recommended_focus: {recommended_focus}
- focus_options: {focus_options}
- recent_gap_summary: {gap_summary}

## 会話履歴
{conversation_text}

## ルール
- 質問は1つだけ
- その段階の論点だけを深掘りする
- 直前と同じ言い方を繰り返さない
- 汎用的な「詳しく教えてください」だけの聞き方は禁止
- 企業情報・参考材料に根拠がない固有情報を足さない
- 学生が 1〜3 文で答えやすい自然な日本語にする
- 段階が切り替わる場合だけ `transition_line` に「次は○○について伺います。」の形で入れる
- JSON 以外は禁止

## 出力形式
{{
  "question": "次の面接質問",
  "focus": "今回の狙いを20字以内で",
  "question_stage": "{current_stage}",
  "transition_line": "{transition_hint}"
}}"""

_INTERVIEW_CONTINUE_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。前回の最終講評を踏まえて、面接対策を続けるための次の質問を1つだけ作ってください。

## 企業
- 企業名: {company_name}
- 企業情報:
{company_summary}

## 前提
- 志望業界: {selected_industry}
- 志望職種: {selected_role}
- seed_summary:
{seed_summary}

## 参考材料
{materials_section}

## これまでの会話
{conversation_text}

## 直近の最終講評
{latest_feedback_summary}

## ルール
- 講評の `preparation_points` と `improvements` のうち優先度が高いものから 1 つ選んで深掘りする
- `question_stage` は `experience` / `company_understanding` / `motivation_fit` のいずれか
- `transition_line` は「最終講評を踏まえて、次は○○についてさらに伺います。」の形で返す
- 質問は1つだけ、学生が答えやすい自然な日本語にする
- JSON 以外は禁止

## 出力形式
{{
  "question": "次の面接質問",
  "focus": "今回の狙いを20字以内で",
  "question_stage": "experience|company_understanding|motivation_fit",
  "transition_line": "最終講評を踏まえて、次は○○についてさらに伺います。"
}}"""

_INTERVIEW_FEEDBACK_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。会話履歴を読み、企業特化模擬面接の最終講評を構造化して返してください。

## 企業
- 企業名: {company_name}
- 企業情報:
{company_summary}

## 前提
- 志望業界: {selected_industry}
- 志望職種: {selected_role}
- seed_summary:
{seed_summary}

## 参考材料
{materials_section}

## 会話履歴
{conversation_text}

## 評価観点
- 企業適合
- 具体性
- 論理性
- 説得力
- 前提一致度（確認済みの業界/職種理由と、その後の回答の整合）

## ルール
- `overall_comment` は自然な日本語で総評にする
- 良かった点は最大 3 件
- 改善点は最大 3 件
- improved_answer は応募者がそのまま言いやすい 120〜220 字
- preparation_points は次に準備すべき論点を最大 3 件
- `premise_consistency` は 0〜100
- JSON 以外は禁止

## 出力形式
{{
  "overall_comment": "総評",
  "scores": {{
    "company_fit": 0,
    "specificity": 0,
    "logic": 0,
    "persuasiveness": 0
  }},
  "strengths": ["良かった点"],
  "improvements": ["改善点"],
  "improved_answer": "改善回答例",
  "preparation_points": ["次に準備すべき論点"],
  "premise_consistency": 0
}}"""


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class InterviewBaseRequest(BaseModel):
    company_name: str = Field(max_length=200)
    company_summary: str = Field(max_length=4000)
    motivation_summary: Optional[str] = Field(default=None, max_length=4000)
    gakuchika_summary: Optional[str] = Field(default=None, max_length=4000)
    es_summary: Optional[str] = Field(default=None, max_length=4000)
    selected_industry: Optional[str] = Field(default=None, max_length=120)
    selected_role: Optional[str] = Field(default=None, max_length=200)
    selected_role_source: Optional[str] = Field(default=None, max_length=120)
    seed_summary: Optional[str] = Field(default=None, max_length=4000)


class InterviewStartRequest(InterviewBaseRequest):
    pass


class InterviewTurnRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None


class InterviewFeedbackRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None


class InterviewContinueRequest(InterviewBaseRequest):
    conversation_history: list[Message]
    turn_state: Optional[dict[str, Any]] = None
    latest_feedback: Optional[dict[str, Any]] = None


def _sanitize_optional_text(value: Optional[str], max_length: int) -> Optional[str]:
    if value is None:
        return None
    return sanitize_user_prompt_text(value, max_length=max_length, rich_text=True)


def _sanitize_messages(messages: list[Message]) -> None:
    for message in messages:
        message.content = sanitize_user_prompt_text(
            message.content, max_length=3000, rich_text=True
        )


def _sanitize_base_request(payload: InterviewBaseRequest) -> None:
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    payload.company_summary = sanitize_user_prompt_text(
        payload.company_summary, max_length=4000, rich_text=True
    )
    payload.motivation_summary = _sanitize_optional_text(payload.motivation_summary, 4000)
    payload.gakuchika_summary = _sanitize_optional_text(payload.gakuchika_summary, 4000)
    payload.es_summary = _sanitize_optional_text(payload.es_summary, 4000)
    payload.selected_industry = _sanitize_optional_text(payload.selected_industry, 120)
    payload.selected_role = _sanitize_optional_text(payload.selected_role, 200)
    payload.selected_role_source = _sanitize_optional_text(payload.selected_role_source, 120)
    payload.seed_summary = _sanitize_optional_text(payload.seed_summary, 4000)


def _default_turn_state() -> dict[str, Any]:
    return {
        "currentStage": "industry_reason",
        "totalQuestionCount": 0,
        "stageQuestionCounts": dict(DEFAULT_STAGE_COUNTS),
        "completedStages": [],
        "lastQuestionFocus": None,
        "nextAction": "ask",
    }


def _normalize_turn_state(
    raw: Optional[dict[str, Any]], conversation_history: Optional[list[Message]] = None
) -> dict[str, Any]:
    state = _default_turn_state()
    if raw and isinstance(raw, dict):
        current_stage = raw.get("currentStage")
        if current_stage in STAGE_ORDER:
            state["currentStage"] = current_stage
        total_question_count = raw.get("totalQuestionCount")
        if isinstance(total_question_count, int) and total_question_count >= 0:
            state["totalQuestionCount"] = total_question_count
        stage_counts = raw.get("stageQuestionCounts")
        if isinstance(stage_counts, dict):
            state["stageQuestionCounts"] = {
                stage: int(stage_counts.get(stage, 0))
                if isinstance(stage_counts.get(stage, 0), int) and int(stage_counts.get(stage, 0)) >= 0
                else 0
                for stage in QUESTION_STAGE_ORDER
            }
        completed = raw.get("completedStages")
        if isinstance(completed, list):
            state["completedStages"] = [
                stage for stage in completed if stage in QUESTION_STAGE_ORDER
            ]
        last_focus = raw.get("lastQuestionFocus")
        if isinstance(last_focus, str) and last_focus.strip():
            state["lastQuestionFocus"] = last_focus.strip()
        next_action = raw.get("nextAction")
        if next_action in {"ask", "feedback"}:
            state["nextAction"] = next_action

    if conversation_history and state["totalQuestionCount"] == 0:
        assistant_count = len([m for m in conversation_history if m.role == "assistant"])
        if assistant_count > 0:
            state["totalQuestionCount"] = assistant_count
    return state


def _build_stage_status(current: str) -> dict[str, list[str] | str]:
    current_index = STAGE_ORDER.index(current)
    return {
        "current": current,
        "completed": STAGE_ORDER[:current_index],
        "pending": STAGE_ORDER[current_index + 1 :],
    }


def _format_materials_section(payload: InterviewBaseRequest) -> str:
    return "\n\n".join(
        [
            f"## 志望動機\n{payload.motivation_summary or 'なし'}",
            f"## ガクチカ\n{payload.gakuchika_summary or 'なし'}",
            f"## ES\n{payload.es_summary or 'なし'}",
            f"## seed\n{payload.seed_summary or 'なし'}",
        ]
    )


def _format_conversation(conversation_history: list[Message]) -> str:
    if not conversation_history:
        return "まだ会話なし"
    return "\n".join(
        f"{'面接官' if message.role == 'assistant' else '応募者'}: {message.content}"
        for message in conversation_history
    )


def _normalize_question_text(question: str, company_name: str) -> str:
    normalized = re.sub(r"\s+", " ", question).strip()
    patterns = [
        rf"^{re.escape(company_name)}の面接に臨むにあたり、?",
        rf"^{re.escape(company_name)}を受けるにあたって、?",
        rf"^{re.escape(company_name)}を志望するうえで、?",
        r"^この企業の面接に臨むにあたり、?",
        r"^今回の面接に臨むにあたり、?",
    ]
    for pattern in patterns:
        normalized = re.sub(pattern, "", normalized).strip()
    return normalized or question.strip()


def _sanitize_focus(value: Any, stage: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()[:40]
    return STAGE_FOCUS_OPTIONS[stage][0]


def _sanitize_transition_line(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()[:120]
    return None


def _advance_stage(current_stage: str) -> str:
    try:
        index = QUESTION_STAGE_ORDER.index(current_stage)
    except ValueError:
        return "feedback"
    if index >= len(QUESTION_STAGE_ORDER) - 1:
        return "feedback"
    return QUESTION_STAGE_ORDER[index + 1]


def _derive_completed_stages(current_stage: str, explicit_completed: list[str]) -> list[str]:
    current_index = STAGE_ORDER.index(current_stage)
    auto_completed = [stage for stage in QUESTION_STAGE_ORDER if STAGE_ORDER.index(stage) < current_index]
    return [stage for stage in QUESTION_STAGE_ORDER if stage in set(explicit_completed + auto_completed)]


def _pick_focus(stage: str, recommended_focus: Optional[str], last_focus: Optional[str]) -> str:
    options = STAGE_FOCUS_OPTIONS[stage]
    if isinstance(recommended_focus, str) and recommended_focus.strip():
        normalized = recommended_focus.strip()
        if normalized != last_focus:
            return normalized[:40]
    for option in options:
        if option != last_focus:
            return option
    return options[0]


async def _evaluate_turn(
    payload: InterviewTurnRequest,
    turn_state: dict[str, Any],
) -> dict[str, Any]:
    current_stage = turn_state["currentStage"]
    stage_counts = turn_state["stageQuestionCounts"]
    latest_answer = next(
        (message.content for message in reversed(payload.conversation_history) if message.role == "user"),
        "",
    )
    prompt = get_managed_prompt_content(
        "interview.turn_evaluation",
        fallback=_INTERVIEW_TURN_EVALUATION_PROMPT_FALLBACK,
    ).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        selected_industry=payload.selected_industry or "未設定",
        selected_role=payload.selected_role or "未設定",
        seed_summary=payload.seed_summary or "なし",
        materials_section=_format_materials_section(payload),
        current_stage=current_stage,
        stage_label=STAGE_LABELS[current_stage],
        stage_goal=STAGE_GOALS[current_stage],
        stage_question_count=stage_counts[current_stage],
        total_question_count=turn_state["totalQuestionCount"],
        stage_min_count=STAGE_MIN_COUNTS[current_stage],
        stage_max_count=STAGE_MAX_COUNTS[current_stage],
        last_focus=turn_state["lastQuestionFocus"] or "なし",
        conversation_text=_format_conversation(payload.conversation_history),
        latest_answer=latest_answer or "なし",
    )
    result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="このターンの評価と遷移判定を返してください。",
        max_tokens=700,
        temperature=0.2,
        feature="interview",
    )
    if not result.success or not isinstance(result.data, dict):
        logger.warning("[Interview] evaluation fallback used: %s", result.error.message if result.error else "unknown")
        return {
            "decision": "stay",
            "recommended_focus": _pick_focus(
                current_stage,
                None,
                turn_state.get("lastQuestionFocus"),
            ),
            "reason": "追加の具体性が必要です。",
            "stage_assessment": {
                "coverage": 45,
                "specificity": 45,
                "logic": 50,
                "company_fit": 45,
                "premise_consistency": 55,
            },
            "missing_points": ["具体例の不足", "根拠の不足"],
            "interviewer_concerns": ["抽象的に見える"],
        }
    return result.data


def _decide_next_state(turn_state: dict[str, Any], evaluation: dict[str, Any]) -> tuple[dict[str, Any], bool, str]:
    current_stage = turn_state["currentStage"]
    total_question_count = int(turn_state["totalQuestionCount"])
    stage_counts = dict(turn_state["stageQuestionCounts"])
    current_stage_count = int(stage_counts.get(current_stage, 0))

    decision = str(evaluation.get("decision") or "stay")
    force_feedback = total_question_count >= TOTAL_MAX_QUESTIONS
    reached_stage_min = current_stage_count >= STAGE_MIN_COUNTS[current_stage]
    reached_stage_max = current_stage_count >= STAGE_MAX_COUNTS[current_stage]

    next_action: Literal["ask", "feedback"] = "ask"
    next_stage = current_stage

    if force_feedback:
        next_action = "feedback"
        next_stage = "feedback"
    elif current_stage == "motivation_fit":
        if (decision == "complete" or decision == "advance") and reached_stage_min and total_question_count >= TOTAL_MIN_QUESTIONS:
            next_action = "feedback"
            next_stage = "feedback"
        elif reached_stage_max and total_question_count >= TOTAL_MIN_QUESTIONS:
            next_action = "feedback"
            next_stage = "feedback"
    else:
        if reached_stage_max:
            next_stage = _advance_stage(current_stage)
        elif decision == "advance" and reached_stage_min:
            next_stage = _advance_stage(current_stage)

    question_flow_completed = next_action == "feedback" or next_stage == "feedback"
    completed_stages = _derive_completed_stages(
        next_stage,
        turn_state.get("completedStages", []),
    )

    updated = {
        **turn_state,
        "currentStage": next_stage,
        "stageQuestionCounts": stage_counts,
        "completedStages": completed_stages,
        "nextAction": "feedback" if question_flow_completed else "ask",
    }
    if question_flow_completed:
        updated["currentStage"] = "feedback"

    return updated, question_flow_completed, current_stage


def _build_question_prompt(
    payload: InterviewBaseRequest,
    stage: str,
    turn_state: dict[str, Any],
    focus: str,
    transition_hint: str,
    conversation_text: str,
    evaluation: Optional[dict[str, Any]] = None,
) -> str:
    gap_items: list[str] = []
    if evaluation:
        missing_points = evaluation.get("missing_points") or []
        interviewer_concerns = evaluation.get("interviewer_concerns") or []
        if isinstance(missing_points, list):
            gap_items.extend(str(item) for item in missing_points if str(item).strip())
        if isinstance(interviewer_concerns, list):
            gap_items.extend(str(item) for item in interviewer_concerns if str(item).strip())
    gap_summary = " / ".join(gap_items[:4]) or "不足点なし"
    return get_managed_prompt_content(
        "interview.question",
        fallback=_INTERVIEW_QUESTION_PROMPT_FALLBACK,
    ).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        selected_industry=payload.selected_industry or "未設定",
        selected_role=payload.selected_role or "未設定",
        seed_summary=payload.seed_summary or "なし",
        materials_section=_format_materials_section(payload),
        current_stage=stage,
        stage_label=STAGE_LABELS[stage],
        stage_goal=STAGE_GOALS[stage],
        stage_question_count=turn_state["stageQuestionCounts"].get(stage, 0),
        total_question_count=turn_state["totalQuestionCount"],
        recommended_focus=focus,
        focus_options=" / ".join(STAGE_FOCUS_OPTIONS[stage]),
        gap_summary=gap_summary,
        conversation_text=conversation_text,
        transition_hint=transition_hint,
    )


def _build_feedback_prompt(payload: InterviewFeedbackRequest) -> str:
    return get_managed_prompt_content(
        "interview.feedback",
        fallback=_INTERVIEW_FEEDBACK_PROMPT_FALLBACK,
    ).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        selected_industry=payload.selected_industry or "未設定",
        selected_role=payload.selected_role or "未設定",
        seed_summary=payload.seed_summary or "なし",
        materials_section=_format_materials_section(payload),
        conversation_text=_format_conversation(payload.conversation_history),
    )


def _build_continue_prompt(payload: InterviewContinueRequest) -> str:
    latest_feedback_summary = json.dumps(payload.latest_feedback or {}, ensure_ascii=False)
    return get_managed_prompt_content(
        "interview.continue",
        fallback=_INTERVIEW_CONTINUE_PROMPT_FALLBACK,
    ).format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        selected_industry=payload.selected_industry or "未設定",
        selected_role=payload.selected_role or "未設定",
        seed_summary=payload.seed_summary or "なし",
        materials_section=_format_materials_section(payload),
        conversation_text=_format_conversation(payload.conversation_history),
        latest_feedback_summary=latest_feedback_summary,
    )


def _sse_event(event_type: str, payload: dict[str, Any]) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


async def _stream_question_fields(prompt: str) -> AsyncGenerator[Any, None]:
    async for event in call_llm_streaming_fields(
        system_prompt=prompt,
        user_message="次の面接質問を生成してください。",
        max_tokens=550,
        temperature=0.45,
        feature="interview",
        schema_hints={
            "question": "string",
            "focus": "string",
            "question_stage": "string",
            "transition_line": "string",
        },
        stream_string_fields=["question"],
        partial_required_fields=("question",),
    ):
        yield event


async def _stream_feedback_fields(prompt: str) -> AsyncGenerator[Any, None]:
    async for event in call_llm_streaming_fields(
        system_prompt=prompt,
        user_message="最終講評を生成してください。",
        max_tokens=1000,
        temperature=0.3,
        feature="interview_feedback",
        schema_hints={
            "overall_comment": "string",
            "scores": "object",
            "strengths": "array",
            "improvements": "array",
            "improved_answer": "string",
            "preparation_points": "array",
            "premise_consistency": "number",
        },
        stream_string_fields=["overall_comment", "improved_answer"],
        partial_required_fields=("overall_comment",),
    ):
        yield event


async def _generate_start_progress(payload: InterviewStartRequest) -> AsyncGenerator[str, None]:
    try:
        turn_state = _default_turn_state()
        stage = "industry_reason"
        focus = STAGE_FOCUS_OPTIONS[stage][0]
        working_state = {
            **turn_state,
            "totalQuestionCount": 1,
            "stageQuestionCounts": {**turn_state["stageQuestionCounts"], stage: 1},
            "lastQuestionFocus": focus,
        }

        yield _sse_event("progress", {"step": "prepare", "progress": 20, "label": "面接の初回質問を準備中..."})
        await asyncio.sleep(0.03)
        yield _sse_event("field_complete", {"path": "focus", "value": focus})
        yield _sse_event("field_complete", {"path": "question_stage", "value": stage})
        yield _sse_event("field_complete", {"path": "stage_status", "value": _build_stage_status(stage)})

        prompt = _build_question_prompt(
            payload,
            stage,
            working_state,
            focus,
            "",
            "まだ会話なし",
        )
        llm_result = None
        async for event in _stream_question_fields(prompt):
            if event.type == "string_chunk" and event.path == "question":
                yield _sse_event("string_chunk", {"path": "question", "text": event.text})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {"message": error.message if error else "面接対策の応答生成に失敗しました。"})
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or not isinstance(llm_result.data, dict):
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {"message": error.message if error else "面接質問を生成できませんでした。"})
            return

        question = _normalize_question_text(str(llm_result.data.get("question", "")).strip(), payload.company_name)
        resolved_focus = _sanitize_focus(llm_result.data.get("focus") or focus, stage)
        working_state["lastQuestionFocus"] = resolved_focus

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": None,
                    "focus": resolved_focus,
                    "question_stage": stage,
                    "stage_status": _build_stage_status(stage),
                    "question_flow_completed": False,
                    "turn_state": working_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] start failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_turn_progress(payload: InterviewTurnRequest) -> AsyncGenerator[str, None]:
    try:
        turn_state = _normalize_turn_state(payload.turn_state, payload.conversation_history)
        current_stage = turn_state["currentStage"]
        if current_stage == "feedback":
            yield _sse_event(
                "complete",
                {
                    "data": {
                        "focus": None,
                        "question_stage": "feedback",
                        "stage_status": _build_stage_status("feedback"),
                        "question_flow_completed": True,
                        "turn_state": {**turn_state, "nextAction": "feedback"},
                    }
                },
            )
            return

        yield _sse_event("progress", {"step": "evaluation", "progress": 25, "label": "直近の回答を分析中..."})
        evaluation = await _evaluate_turn(payload, turn_state)
        yield _sse_event("field_complete", {"path": "evaluation", "value": evaluation})

        next_state, question_flow_completed, evaluated_stage = _decide_next_state(turn_state, evaluation)
        if question_flow_completed:
            yield _sse_event(
                "complete",
                {
                    "data": {
                        "focus": None,
                        "transition_line": None,
                        "question_stage": "feedback",
                        "stage_status": _build_stage_status("feedback"),
                        "question_flow_completed": True,
                        "turn_state": next_state,
                    }
                },
            )
            return

        next_stage = next_state["currentStage"]
        focus = _pick_focus(next_stage, evaluation.get("recommended_focus"), turn_state.get("lastQuestionFocus"))
        next_state["stageQuestionCounts"] = {
            **next_state["stageQuestionCounts"],
            next_stage: int(next_state["stageQuestionCounts"].get(next_stage, 0)) + 1,
        }
        next_state["totalQuestionCount"] = int(next_state["totalQuestionCount"]) + 1
        next_state["lastQuestionFocus"] = focus
        transition_hint = (
            f"次は{STAGE_LABELS[next_stage]}について伺います。"
            if next_stage != evaluated_stage
            else ""
        )

        yield _sse_event(
            "progress",
            {
                "step": "question",
                "progress": 68,
                "label": f"{STAGE_LABELS[next_stage]}の質問を考え中...",
            },
        )
        yield _sse_event("field_complete", {"path": "focus", "value": focus})
        yield _sse_event("field_complete", {"path": "question_stage", "value": next_stage})
        yield _sse_event("field_complete", {"path": "stage_status", "value": _build_stage_status(next_stage)})

        prompt = _build_question_prompt(
            payload,
            next_stage,
            next_state,
            focus,
            transition_hint,
            _format_conversation(payload.conversation_history),
            evaluation,
        )
        llm_result = None
        async for event in _stream_question_fields(prompt):
            if event.type == "string_chunk" and event.path == "question":
                yield _sse_event("string_chunk", {"path": "question", "text": event.text})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {"message": error.message if error else "面接対策の応答生成に失敗しました。"})
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or not isinstance(llm_result.data, dict):
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {"message": error.message if error else "面接質問を生成できませんでした。"})
            return

        question = _normalize_question_text(str(llm_result.data.get("question", "")).strip(), payload.company_name)
        resolved_focus = _sanitize_focus(llm_result.data.get("focus") or focus, next_stage)
        next_state["lastQuestionFocus"] = resolved_focus
        transition_line = _sanitize_transition_line(llm_result.data.get("transition_line") or transition_hint)

        logger.info(
            "[Interview] next question stage=%s evaluated_stage=%s total=%s focus=%s",
            next_stage,
            evaluated_stage,
            next_state["totalQuestionCount"],
            resolved_focus,
        )

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": transition_line,
                    "focus": resolved_focus,
                    "question_stage": next_stage,
                    "stage_status": _build_stage_status(next_stage),
                    "question_flow_completed": False,
                    "turn_state": next_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] turn failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_continue_progress(payload: InterviewContinueRequest) -> AsyncGenerator[str, None]:
    try:
        turn_state = _normalize_turn_state(payload.turn_state, payload.conversation_history)
        next_state = {
            **turn_state,
            "nextAction": "ask",
        }

        yield _sse_event("progress", {"step": "continue", "progress": 25, "label": "最終講評を踏まえて次の質問を整理中..."})
        await asyncio.sleep(0.03)

        llm_result = None
        async for event in _stream_question_fields(_build_continue_prompt(payload)):
            if event.type == "string_chunk" and event.path == "question":
                yield _sse_event("string_chunk", {"path": "question", "text": event.text})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {"message": error.message if error else "追加の面接質問を生成できませんでした。"})
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or not isinstance(llm_result.data, dict):
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {"message": error.message if error else "追加の面接質問を生成できませんでした。"})
            return

        next_stage = str(llm_result.data.get("question_stage") or "motivation_fit")
        if next_stage not in {"experience", "company_understanding", "motivation_fit"}:
            next_stage = "motivation_fit"
        focus = _sanitize_focus(llm_result.data.get("focus"), next_stage)
        next_state["currentStage"] = next_stage
        next_state["stageQuestionCounts"] = {
            **next_state["stageQuestionCounts"],
            next_stage: int(next_state["stageQuestionCounts"].get(next_stage, 0)) + 1,
        }
        next_state["totalQuestionCount"] = int(next_state["totalQuestionCount"]) + 1
        next_state["lastQuestionFocus"] = focus

        transition_line = _sanitize_transition_line(llm_result.data.get("transition_line"))
        question = _normalize_question_text(str(llm_result.data.get("question", "")).strip(), payload.company_name)

        yield _sse_event("field_complete", {"path": "focus", "value": focus})
        yield _sse_event("field_complete", {"path": "question_stage", "value": next_stage})
        yield _sse_event("field_complete", {"path": "stage_status", "value": _build_stage_status(next_stage)})
        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "transition_line": transition_line,
                    "focus": focus,
                    "question_stage": next_stage,
                    "stage_status": _build_stage_status(next_stage),
                    "question_flow_completed": False,
                    "turn_state": next_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] continue failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


async def _generate_feedback_progress(payload: InterviewFeedbackRequest) -> AsyncGenerator[str, None]:
    try:
        turn_state = _normalize_turn_state(payload.turn_state, payload.conversation_history)
        final_turn_state = {
            **turn_state,
            "currentStage": "feedback",
            "completedStages": list(QUESTION_STAGE_ORDER),
            "nextAction": "feedback",
        }
        yield _sse_event("progress", {"step": "feedback", "progress": 30, "label": "最終講評を整理中..."})
        await asyncio.sleep(0.03)
        prompt = _build_feedback_prompt(payload)
        llm_result = None

        async for event in _stream_feedback_fields(prompt):
            if event.type == "string_chunk" and event.path in {"overall_comment", "improved_answer"}:
                yield _sse_event("string_chunk", {"path": event.path, "text": event.text})
            elif event.type == "field_complete":
                if event.path in {"scores", "premise_consistency"}:
                    yield _sse_event("field_complete", {"path": event.path, "value": event.value})
            elif event.type == "array_item_complete":
                if isinstance(event.path, str) and event.path.split(".")[0] in {
                    "strengths",
                    "improvements",
                    "preparation_points",
                }:
                    yield _sse_event("array_item_complete", {"path": event.path, "value": event.value})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {"message": error.message if error else "最終講評の生成に失敗しました。"})
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or not isinstance(llm_result.data, dict):
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {"message": error.message if error else "最終講評の生成に失敗しました。"})
            return

        data = llm_result.data
        yield _sse_event("field_complete", {"path": "scores", "value": data.get("scores", {})})
        yield _sse_event("field_complete", {"path": "premise_consistency", "value": data.get("premise_consistency", 0)})
        for key in ("strengths", "improvements", "preparation_points"):
            items = data.get(key, [])
            if isinstance(items, list):
                for index, item in enumerate(items):
                    yield _sse_event("array_item_complete", {"path": f"{key}.{index}", "value": item})
        yield _sse_event("field_complete", {"path": "stage_status", "value": _build_stage_status("feedback")})

        yield _sse_event(
            "complete",
            {
                "data": {
                    "overall_comment": str(data.get("overall_comment", "")).strip(),
                    "scores": data.get("scores", {}),
                    "strengths": data.get("strengths", []),
                    "improvements": data.get("improvements", []),
                    "improved_answer": str(data.get("improved_answer", "")).strip(),
                    "preparation_points": data.get("preparation_points", []),
                    "premise_consistency": int(data.get("premise_consistency", 0) or 0),
                    "question_flow_completed": True,
                    "question_stage": "feedback",
                    "stage_status": _build_stage_status("feedback"),
                    "turn_state": final_turn_state,
                }
            },
        )
    except Exception as exc:
        logger.exception("[Interview] feedback failed")
        yield _sse_event("error", {"message": f"予期しないエラーが発生しました: {str(exc)}"})


def _stream_response(generator: AsyncGenerator[str, None]) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/start")
@limiter.limit("60/minute")
async def start_interview(payload: InterviewStartRequest, request: Request):
    try:
        _sanitize_base_request(payload)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=2000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=2000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=2000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_start_progress(payload))


@router.post("/turn")
@limiter.limit("60/minute")
async def next_interview_turn(payload: InterviewTurnRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=2000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=2000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=2000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_turn_progress(payload))


@router.post("/continue")
@limiter.limit("60/minute")
async def continue_interview(payload: InterviewContinueRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=2000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=2000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=2000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_continue_progress(payload))


@router.post("/feedback")
@limiter.limit("60/minute")
async def interview_feedback(payload: InterviewFeedbackRequest, request: Request):
    try:
        _sanitize_base_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(status_code=400, detail="入力内容を見直して、もう一度お試しください。")

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(payload.motivation_summary or "なし", max_length=2000)
    payload.gakuchika_summary = sanitize_prompt_input(payload.gakuchika_summary or "なし", max_length=2000)
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    payload.seed_summary = sanitize_prompt_input(payload.seed_summary or "なし", max_length=2000)
    payload.selected_industry = sanitize_prompt_input(payload.selected_industry or "未設定", max_length=120)
    payload.selected_role = sanitize_prompt_input(payload.selected_role or "未設定", max_length=200)
    return _stream_response(_generate_feedback_progress(payload))
