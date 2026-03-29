import asyncio
import json
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.limiter import limiter
from app.utils.llm import (
    PromptSafetyError,
    call_llm_streaming_fields,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.prompts.notion_registry import get_managed_prompt_content

router = APIRouter(prefix="/api/interview", tags=["interview"])

QUESTION_STAGE_BY_INDEX = {
    1: "opening",
    2: "company_understanding",
    3: "experience",
    4: "motivation_fit",
    5: "motivation_fit",
}
STAGE_ORDER = [
    "opening",
    "company_understanding",
    "experience",
    "motivation_fit",
    "feedback",
]
STAGE_GOALS = {
    "opening": "導入として話しやすい入口を作り、応募者の話し方と志望の軸を掴む。",
    "company_understanding": "企業理解や事業理解が本人の言葉で語れているかを確かめる。",
    "experience": "経験・ガクチカの具体性、再現性、役割を深掘りする。",
    "motivation_fit": "志望動機と企業適合を具体的な役割・貢献イメージまで接続する。",
    "feedback": "面接全体の総評と改善ポイントを整理する。",
}
STAGE_LABELS = {
    "opening": "導入",
    "company_understanding": "企業理解",
    "experience": "経験・ガクチカ",
    "motivation_fit": "志望動機・適合",
    "feedback": "最終講評",
}

_INTERVIEW_QUESTION_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。企業特化模擬面接の次の質問を1つだけ作ってください。

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

{materials_section}

## 現在の段階
- question_index: {question_index}
- current_stage: {current_stage}
- stage_label: {stage_label}
- stage_goal: {stage_goal}
- additional_probe: {additional_probe}

## 会話履歴
{conversation_text}

## ルール
- 質問は1つだけ
- その段階で確認すべき論点だけを深掘りする
- 質問文は1文、自然な日本語
- 「{company_name}の面接に臨むにあたり」「{company_name}を受けるにあたって」などの前置きは付けない
- 企業名は本当に必要なときだけ使い、基本は自然な面接の一問として書く
- 5問目は志望動機・適合の追加深掘りに限定する
- 圧迫的にしない
- JSON以外を出力しない

## 出力形式
{{
  "question": "次の面接質問",
  "focus": "今回の狙い"
}}
"""

_INTERVIEW_FEEDBACK_PROMPT_FALLBACK = """あなたは新卒採用の面接官です。会話履歴を読み、最終講評を構造化して返してください。

## 企業
- 企業名: {company_name}
- 企業情報: {company_summary}

## 会話履歴
{conversation_text}

## 評価軸
- 企業適合
- 具体性
- 論理性
- 説得力

## ルール
- `overall_comment` は先に表示される総評として、簡潔で自然な日本語にする
- 良かった点は最大3件
- 改善点は最大3件
- improved_answer は応募者が次にそのまま言いやすい 120〜220 字
- preparation_points は次に準備すべき論点を最大3件
- JSON以外を出力しない

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
  "preparation_points": ["次に準備すべき論点"]
}}
"""


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class InterviewStartRequest(BaseModel):
    company_name: str = Field(max_length=200)
    company_summary: str = Field(max_length=4000)
    motivation_summary: Optional[str] = Field(default=None, max_length=4000)
    gakuchika_summary: Optional[str] = Field(default=None, max_length=4000)
    es_summary: Optional[str] = Field(default=None, max_length=4000)


class InterviewTurnRequest(InterviewStartRequest):
    conversation_history: list[Message]


class InterviewFeedbackRequest(InterviewStartRequest):
    conversation_history: list[Message]


def _sanitize_optional_text(value: Optional[str], max_length: int) -> Optional[str]:
    if value is None:
        return None
    return sanitize_user_prompt_text(value, max_length=max_length, rich_text=True)


def _sanitize_messages(messages: list[Message]) -> None:
    for message in messages:
        message.content = sanitize_user_prompt_text(
            message.content, max_length=3000, rich_text=True
        )


def _sanitize_start_request(payload: InterviewStartRequest) -> None:
    payload.company_name = sanitize_user_prompt_text(payload.company_name, max_length=200)
    payload.company_summary = sanitize_user_prompt_text(
        payload.company_summary, max_length=4000, rich_text=True
    )
    payload.motivation_summary = _sanitize_optional_text(payload.motivation_summary, 4000)
    payload.gakuchika_summary = _sanitize_optional_text(payload.gakuchika_summary, 4000)
    payload.es_summary = _sanitize_optional_text(payload.es_summary, 4000)


def _format_materials_section(
    motivation_summary: Optional[str],
    gakuchika_summary: Optional[str],
    es_summary: Optional[str],
) -> str:
    sections = [
        f"## 志望動機\n{motivation_summary or 'なし'}",
        f"## ガクチカ\n{gakuchika_summary or 'なし'}",
        f"## ES\n{es_summary or 'なし'}",
    ]
    return "\n\n".join(sections)


def _format_conversation(conversation_history: list[Message]) -> str:
    return "\n".join(
        f"{'面接官' if message.role == 'assistant' else '応募者'}: {message.content}"
        for message in conversation_history
    )


def _get_question_stage(question_index: int) -> str:
    return QUESTION_STAGE_BY_INDEX.get(question_index, "feedback")


def _build_stage_status(current: str) -> dict:
    current_index = STAGE_ORDER.index(current)
    return {
        "current": current,
        "completed": STAGE_ORDER[:current_index],
        "pending": STAGE_ORDER[current_index + 1 :],
    }


def _build_question_prompt(
    payload: InterviewStartRequest,
    question_index: int,
    conversation_text: Optional[str] = None,
) -> str:
    current_stage = _get_question_stage(question_index)
    is_additional_motivation_probe = question_index == 5
    template = get_managed_prompt_content(
        "interview.question",
        fallback=_INTERVIEW_QUESTION_PROMPT_FALLBACK,
    )
    return template.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        materials_section=_format_materials_section(
            payload.motivation_summary,
            payload.gakuchika_summary,
            payload.es_summary,
        ),
        question_index=question_index,
        current_stage=current_stage,
        stage_label=STAGE_LABELS[current_stage],
        stage_goal=STAGE_GOALS[current_stage],
        additional_probe="yes" if is_additional_motivation_probe else "no",
        conversation_text=conversation_text or "まだ会話なし",
    )


def _build_feedback_prompt(
    payload: InterviewFeedbackRequest,
    conversation_text: str,
) -> str:
    template = get_managed_prompt_content(
        "interview.feedback",
        fallback=_INTERVIEW_FEEDBACK_PROMPT_FALLBACK,
    )
    return template.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        conversation_text=conversation_text,
    )


def _sse_event(event_type: str, payload: dict) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


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


async def _stream_question_fields(prompt: str, user_message: str):
    async for event in call_llm_streaming_fields(
        system_prompt=prompt,
        user_message=user_message,
        max_tokens=500,
        temperature=0.4,
        feature="interview",
        schema_hints={
            "question": "string",
            "focus": "string",
        },
        stream_string_fields=["question"],
        partial_required_fields=("question",),
    ):
        yield event


async def _stream_feedback_fields(prompt: str):
    async for event in call_llm_streaming_fields(
        system_prompt=prompt,
        user_message="最終講評を生成してください。",
        max_tokens=900,
        temperature=0.3,
        feature="interview",
        schema_hints={
            "overall_comment": "string",
            "scores": "object",
            "strengths": "array",
            "improvements": "array",
            "improved_answer": "string",
            "preparation_points": "array",
        },
        stream_string_fields=["overall_comment"],
        partial_required_fields=("overall_comment",),
    ):
        yield event


async def _generate_question_progress(
    payload: InterviewStartRequest | InterviewTurnRequest,
    question_index: int,
):
    current_stage = _get_question_stage(question_index)
    stage_status = _build_stage_status(current_stage)
    conversation_text = (
        _format_conversation(payload.conversation_history)
        if isinstance(payload, InterviewTurnRequest)
        else None
    )

    try:
        yield _sse_event(
            "progress",
            {
                "step": "prepare",
                "progress": 25,
                "label": f"{STAGE_LABELS[current_stage]}の質問を準備中...",
            },
        )
        await asyncio.sleep(0.02)

        prompt = _build_question_prompt(payload, question_index, conversation_text)
        llm_result = None
        yield _sse_event(
            "progress",
            {
                "step": "question",
                "progress": 70,
                "label": f"{STAGE_LABELS[current_stage]}の質問を考え中...",
            },
        )

        async for event in _stream_question_fields(prompt, "次の面接質問を生成してください。"):
            if event.type == "string_chunk" and event.path == "question":
                yield _sse_event(
                    "string_chunk",
                    {"path": "question", "text": event.text},
                )
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event(
                    "error",
                    {
                        "message": error.message
                        if error
                        else "面接対策の応答生成に失敗しました。",
                    },
                )
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or llm_result.data is None:
            error = llm_result.error if llm_result else None
            yield _sse_event(
                "error",
                {
                    "message": error.message
                    if error
                    else "面接対策の応答生成に失敗しました。",
                },
            )
            return

        data = llm_result.data
        question = _normalize_question_text(
            str(data.get("question", "")).strip(), payload.company_name
        )
        if not question:
            yield _sse_event(
                "error", {"message": "面接対策の質問文を生成できませんでした。"}
            )
            return

        yield _sse_event(
            "complete",
            {
                "data": {
                    "question": question,
                    "focus": str(data.get("focus", "")).strip()
                    or STAGE_GOALS[current_stage],
                    "question_stage": current_stage,
                    "stage_status": stage_status,
                }
            },
        )
    except Exception as exc:
        yield _sse_event(
            "error",
            {"message": f"予期しないエラーが発生しました: {str(exc)}"},
        )


async def _generate_feedback_progress(payload: InterviewFeedbackRequest):
    conversation_text = _format_conversation(payload.conversation_history)
    stage_status = _build_stage_status("feedback")

    try:
        yield _sse_event(
            "progress",
            {"step": "feedback", "progress": 35, "label": "最終講評を整理中..."},
        )
        await asyncio.sleep(0.02)

        prompt = _build_feedback_prompt(payload, conversation_text)
        llm_result = None
        async for event in _stream_feedback_fields(prompt):
            if event.type == "string_chunk" and event.path == "overall_comment":
                yield _sse_event(
                    "string_chunk",
                    {"path": "overall_comment", "text": event.text},
                )
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event(
                    "error",
                    {
                        "message": error.message
                        if error
                        else "最終講評の生成に失敗しました。",
                    },
                )
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or llm_result.data is None:
            error = llm_result.error if llm_result else None
            yield _sse_event(
                "error",
                {
                    "message": error.message if error else "最終講評の生成に失敗しました。"
                },
            )
            return

        data = llm_result.data
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
                    "stage_status": stage_status,
                }
            },
        )
    except Exception as exc:
        yield _sse_event(
            "error",
            {"message": f"予期しないエラーが発生しました: {str(exc)}"},
        )


def _stream_response(generator) -> StreamingResponse:
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
        _sanitize_start_request(payload)
    except PromptSafetyError:
        raise HTTPException(
            status_code=400, detail="入力内容を見直して、もう一度お試しください。"
        )

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(
        payload.motivation_summary or "なし", max_length=2000
    )
    payload.gakuchika_summary = sanitize_prompt_input(
        payload.gakuchika_summary or "なし", max_length=2000
    )
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    return _stream_response(_generate_question_progress(payload, question_index=1))


@router.post("/turn")
@limiter.limit("60/minute")
async def next_interview_turn(payload: InterviewTurnRequest, request: Request):
    try:
        _sanitize_start_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(
            status_code=400, detail="入力内容を見直して、もう一度お試しください。"
        )

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    payload.motivation_summary = sanitize_prompt_input(
        payload.motivation_summary or "なし", max_length=2000
    )
    payload.gakuchika_summary = sanitize_prompt_input(
        payload.gakuchika_summary or "なし", max_length=2000
    )
    payload.es_summary = sanitize_prompt_input(payload.es_summary or "なし", max_length=2000)
    question_index = len([m for m in payload.conversation_history if m.role == "user"]) + 1
    return _stream_response(_generate_question_progress(payload, question_index))


@router.post("/feedback")
@limiter.limit("60/minute")
async def interview_feedback(payload: InterviewFeedbackRequest, request: Request):
    try:
        _sanitize_start_request(payload)
        _sanitize_messages(payload.conversation_history)
    except PromptSafetyError:
        raise HTTPException(
            status_code=400, detail="入力内容を見直して、もう一度お試しください。"
        )

    payload.company_name = sanitize_prompt_input(payload.company_name, max_length=200)
    payload.company_summary = sanitize_prompt_input(payload.company_summary, max_length=2000)
    return _stream_response(_generate_feedback_progress(payload))
