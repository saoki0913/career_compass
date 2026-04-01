"""
Gakuchika (学生時代に力を入れたこと) router.

The authoring flow is split into:
- ES build: collect enough material to write a credible ES draft quickly
- Deep dive: after the draft exists, sharpen the story for interviews
"""

from __future__ import annotations

import json
import random
import re
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.limiter import limiter
from app.prompts.gakuchika_prompts import (
    DEEPDIVE_QUESTION_PRINCIPLES,
    ES_BUILD_AND_QUESTION_PROMPT,
    ES_BUILD_QUESTION_PRINCIPLES,
    GAKUCHIKA_DRAFT_PROMPT,
    INITIAL_QUESTION_PROMPT,
    PROHIBITED_EXPRESSIONS as _PROHIBITED_EXPRESSIONS,
    QUESTION_TONE_AND_ALIGNMENT_RULES,
    REFERENCE_GUIDE_RUBRIC,
    STAR_EVALUATE_AND_QUESTION_PROMPT,
    STRUCTURED_SUMMARY_PROMPT,
)
from app.utils.llm import (
    _parse_json_response,
    PromptSafetyError,
    call_llm_streaming_fields,
    call_llm_with_error,
    consume_request_llm_cost_summary,
    sanitize_prompt_input,
    sanitize_user_prompt_text,
)
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/gakuchika", tags=["gakuchika"])

INITIAL_QUESTION_MAX_TOKENS = 220
NEXT_QUESTION_MAX_TOKENS = 420
BUILD_ELEMENTS = ("overview", "context", "task", "action", "result", "learning")
DEEPDIVE_FOCUSES = (
    "role",
    "challenge",
    "action_reason",
    "result_evidence",
    "learning_transfer",
    "credibility",
    "future",
    "backstory",
)

BUILD_FOCUS_FALLBACKS: dict[str, dict[str, str]] = {
    "overview": {
        "question": "この経験では、まず何に取り組んでいたのか教えていただけますか。",
        "answer_hint": "活動名だけでなく、どんな役割やテーマの経験だったかまで書くとまとまりやすいです。",
        "progress_label": "取り組みを整理中",
    },
    "context": {
        "question": "そのときは、どんな状況や環境の中で進めていた経験でしたか。",
        "answer_hint": "時期、場面、関わっていた相手や規模感が分かると書きやすくなります。",
        "progress_label": "状況を整理中",
    },
    "task": {
        "question": "その経験で、特にどんな課題に向き合う必要があったのですか。",
        "answer_hint": "何がうまくいっていなかったのか、なぜそれを課題だと見たのかが分かると強くなります。",
        "progress_label": "課題を整理中",
    },
    "action": {
        "question": "その課題に対して、ご自身はまず何をしたのですか。",
        "answer_hint": "頑張った気持ちより、自分が実際に取った行動や工夫を書くと伝わりやすいです。",
        "progress_label": "行動を整理中",
    },
    "result": {
        "question": "その行動のあと、どんな変化や成果がありましたか。",
        "answer_hint": "数字がなくても、前後差や周囲の反応など変化が分かる形で書くと十分です。",
        "progress_label": "結果を整理中",
    },
    "learning": {
        "question": "その経験を通じて、どんな学びや気づきが残りましたか。",
        "answer_hint": "抽象的な反省ではなく、今後にも活かせそうな気づきを一つ書くとまとまります。",
        "progress_label": "学びを整理中",
    },
}

DEEPDIVE_FOCUS_FALLBACKS: dict[str, dict[str, str]] = {
    "role": {
        "question": "その場面では、ご自身がどこまでを担っていたのか教えていただけますか。",
        "answer_hint": "自分が任されていた範囲と、周囲と分担していた範囲を分けて答えると伝わりやすいです。",
        "progress_label": "役割を整理中",
    },
    "challenge": {
        "question": "その状況を、なぜ本当に解くべき課題だと判断したのですか。",
        "answer_hint": "当時見えていた事実や違和感を根拠にすると、判断の筋が伝わります。",
        "progress_label": "課題認識を整理中",
    },
    "action_reason": {
        "question": "その方法を選んだのは、どんな理由や比較があったからですか。",
        "answer_hint": "他のやり方ではなくその打ち手を選んだ判断軸を書くと、行動の説得力が増します。",
        "progress_label": "判断理由を整理中",
    },
    "result_evidence": {
        "question": "その工夫が効いたと判断したのは、どんな前後差や反応が見えたからですか。",
        "answer_hint": "数字、行動の変化、周囲の反応など、成果を裏づける事実を書くとまとまります。",
        "progress_label": "成果の根拠を整理中",
    },
    "learning_transfer": {
        "question": "その経験から得た学びは、次の場面でどう活かせると思いますか。",
        "answer_hint": "感想ではなく、再現できる行動原則として言い換えると強くなります。",
        "progress_label": "学びを整理中",
    },
    "credibility": {
        "question": "その成果の中で、ご自身が特に担った部分はどこでしたか。",
        "answer_hint": "役割範囲を具体的にすると、話の信頼感が上がります。",
        "progress_label": "信憑性を整理中",
    },
    "future": {
        "question": "この経験を踏まえて、今後はどんな挑戦につなげていきたいですか。",
        "answer_hint": "今回の経験で得た強みや学びが、次にどう活きるかを書くとつながりが出ます。",
        "progress_label": "将来展望を整理中",
    },
    "backstory": {
        "question": "そもそもその経験に力を入れようと思った背景には、どんな原体験や価値観がありましたか。",
        "answer_hint": "今の行動につながるきっかけや背景が分かるように書くと、人物像が伝わります。",
        "progress_label": "背景を整理中",
    },
}


class Message(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str = Field(max_length=10000)


class ConversationStateInput(BaseModel):
    stage: str | None = Field(default=None, max_length=40)
    focus_key: str | None = Field(default=None, max_length=40)
    progress_label: str | None = Field(default=None, max_length=80)
    answer_hint: str | None = Field(default=None, max_length=160)
    missing_elements: list[str] = Field(default_factory=list)
    ready_for_draft: bool = False
    draft_readiness_reason: str | None = Field(default=None, max_length=240)
    draft_text: str | None = Field(default=None, max_length=3000)
    deepdive_stage: str | None = Field(default=None, max_length=40)

    model_config = {"extra": "ignore"}


class NextQuestionRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    gakuchika_content: Optional[str] = Field(default=None, max_length=5000)
    char_limit_type: Optional[str] = Field(default=None, pattern=r"^(300|400|500)$")
    conversation_history: list[Message]
    question_count: int = Field(default=0, ge=0)
    conversation_state: Optional[ConversationStateInput] = None


class NextQuestionResponse(BaseModel):
    question: str
    conversation_state: dict[str, Any]
    internal_telemetry: Optional[dict[str, object]] = None


class StructuredSummaryRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    draft_text: str = Field(max_length=3000)
    conversation_history: list[Message]


class StrengthItem(BaseModel):
    title: str
    description: str


class LearningItem(BaseModel):
    title: str
    description: str


class StructuredSummaryResponse(BaseModel):
    situation_text: str
    task_text: str
    action_text: str
    result_text: str
    strengths: list[StrengthItem]
    learnings: list[LearningItem]
    numbers: list[str]
    interviewer_hooks: list[str] = []
    decision_reasons: list[str] = []
    before_after_comparisons: list[str] = []
    credibility_notes: list[str] = []
    role_scope: str = ""
    reusable_principles: list[str] = []
    interview_supporting_details: list[str] = []
    future_outlook_notes: list[str] = []
    backstory_notes: list[str] = []


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    conversation_history: list[Message]
    structured_summary: Optional[dict] = None
    char_limit: int = Field(default=400, ge=300, le=500)


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int
    followup_suggestion: str = "更に深掘りする"
    internal_telemetry: Optional[dict[str, object]] = None


def _format_conversation(messages: list[Message]) -> str:
    formatted = []
    for msg in messages:
        role_label = "質問" if msg.role == "assistant" else "回答"
        content = sanitize_user_prompt_text(msg.content, max_length=3000) if msg.role == "user" else msg.content
        formatted.append(f"{role_label}: {content}")
    return "\n\n".join(formatted)


def _prompt_safety_http_error() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail="内部設定や秘匿情報に関する指示は受け付けられません。",
    )


def _sanitize_messages(messages: list[Message]) -> None:
    for msg in messages:
        if msg.role == "user":
            msg.content = sanitize_user_prompt_text(msg.content, max_length=3000)


def _sanitize_next_question_request(request: NextQuestionRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    if request.gakuchika_content is not None:
        request.gakuchika_content = sanitize_user_prompt_text(
            request.gakuchika_content,
            max_length=5000,
            rich_text=True,
        )
    if request.conversation_state and request.conversation_state.draft_text is not None:
        request.conversation_state.draft_text = sanitize_user_prompt_text(
            request.conversation_state.draft_text,
            max_length=3000,
            rich_text=True,
        )
    _sanitize_messages(request.conversation_history)


def _sanitize_summary_request(request: StructuredSummaryRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    request.draft_text = sanitize_user_prompt_text(request.draft_text, max_length=3000, rich_text=True)
    _sanitize_messages(request.conversation_history)


def _sanitize_es_draft_request(request: GakuchikaESDraftRequest) -> None:
    request.gakuchika_title = sanitize_user_prompt_text(request.gakuchika_title, max_length=200).strip()
    _sanitize_messages(request.conversation_history)


def _clean_string(value: object) -> str:
    return str(value).strip() if isinstance(value, str) else ""


def _clean_string_list(value: object, *, max_items: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        if isinstance(item, str):
            text = item.strip()
            if text:
                cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _default_state(stage: str = "es_building", **kwargs: Any) -> dict[str, Any]:
    return {
        "stage": stage,
        "focus_key": kwargs.get("focus_key"),
        "progress_label": kwargs.get("progress_label"),
        "answer_hint": kwargs.get("answer_hint"),
        "missing_elements": kwargs.get("missing_elements", []),
        "ready_for_draft": kwargs.get("ready_for_draft", False),
        "draft_readiness_reason": kwargs.get("draft_readiness_reason", ""),
        "draft_text": kwargs.get("draft_text"),
        "deepdive_stage": kwargs.get("deepdive_stage"),
    }


def _fallback_build_meta(focus_key: str) -> dict[str, str]:
    return BUILD_FOCUS_FALLBACKS.get(focus_key, BUILD_FOCUS_FALLBACKS["overview"])


def _fallback_deepdive_meta(focus_key: str) -> dict[str, str]:
    return DEEPDIVE_FOCUS_FALLBACKS.get(focus_key, DEEPDIVE_FOCUS_FALLBACKS["challenge"])


def _extract_question_from_text(raw_text: str) -> Optional[str]:
    if not raw_text:
        return None
    stripped = raw_text.strip()
    if not stripped or stripped.startswith("{") or stripped.startswith("```"):
        return None
    line = stripped.splitlines()[0].strip().strip('"')
    return line or None


def _parse_json_payload(raw_text: str) -> dict[str, Any]:
    parsed = _parse_json_response(raw_text)
    if isinstance(parsed, dict):
        return parsed
    question = _extract_question_from_text(raw_text)
    if question:
        return {"question": question}
    return {}


def _build_known_facts(messages: list[Message]) -> str:
    user_answers = [msg.content.strip() for msg in messages if msg.role == "user" and msg.content.strip()]
    if not user_answers:
        return "- まだ整理済みの事実は少ない"
    bullets = [f"- {answer}" for answer in user_answers[-4:]]
    return "\n".join(bullets)


def _normalize_missing_elements(value: object) -> list[str]:
    items = [item for item in _clean_string_list(value, max_items=len(BUILD_ELEMENTS)) if item in BUILD_ELEMENTS]
    seen: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def _detect_es_focus_from_missing(missing_elements: list[str]) -> str:
    for key in BUILD_ELEMENTS:
        if key in missing_elements:
            return key
    return "learning"


def _determine_deepdive_phase(question_count: int) -> tuple[str, str, list[str]]:
    if question_count <= 2:
        return ("es_aftercare", "ES本文の骨格に対して判断理由と役割の解像度を上げる", ["challenge", "role", "action_reason"])
    if question_count <= 5:
        return ("evidence_enhancement", "成果の根拠・信憑性・再現可能性を補強する", ["result_evidence", "credibility", "learning_transfer"])
    return ("interview_expansion", "将来展望や原体験まで含めて人物像を厚くする", ["future", "backstory", "learning_transfer"])


def _normalize_es_build_payload(payload: object, fallback_state: ConversationStateInput | None) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    missing_elements = _normalize_missing_elements(data.get("missing_elements"))
    ready_for_draft = bool(data.get("ready_for_draft"))
    focus_key = _clean_string(data.get("focus_key")) or _detect_es_focus_from_missing(missing_elements)
    if focus_key not in BUILD_ELEMENTS:
        focus_key = _detect_es_focus_from_missing(missing_elements)
    meta = _fallback_build_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    readiness_reason = _clean_string(data.get("draft_readiness_reason"))

    if ready_for_draft:
        state = _default_state(
            "draft_ready",
            focus_key=focus_key,
            progress_label="ES作成可",
            answer_hint="ここまででES本文を書ける最低限の材料は揃っています。",
            missing_elements=missing_elements,
            ready_for_draft=True,
            draft_readiness_reason=readiness_reason or "ES本文に必要な材料が揃っています。",
            draft_text=fallback_state.draft_text if fallback_state else None,
        )
        return "", state, "draft_ready"

    if not question:
        question = meta["question"]
        source = "rule_fallback"
    else:
        source = "full_json"

    state = _default_state(
        "es_building",
        focus_key=focus_key,
        progress_label=progress_label,
        answer_hint=answer_hint,
        missing_elements=missing_elements,
        ready_for_draft=False,
        draft_readiness_reason=readiness_reason,
        draft_text=fallback_state.draft_text if fallback_state else None,
    )
    return question, state, source


def _normalize_deepdive_payload(payload: object, fallback_state: ConversationStateInput | None) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    focus_key = _clean_string(data.get("focus_key")) or "challenge"
    if focus_key not in DEEPDIVE_FOCUSES:
        focus_key = "challenge"
    meta = _fallback_deepdive_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    deepdive_stage = _clean_string(data.get("deepdive_stage")) or "es_aftercare"

    if deepdive_stage == "interview_ready":
        state = _default_state(
            "interview_ready",
            focus_key=focus_key,
            progress_label="面接準備完了",
            answer_hint="ここまでで面接に向けた補足材料も揃っています。",
            missing_elements=fallback_state.missing_elements if fallback_state else [],
            ready_for_draft=True,
            draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
            draft_text=fallback_state.draft_text if fallback_state else None,
            deepdive_stage=deepdive_stage,
        )
        return "", state, "interview_ready"

    if not question:
        question = meta["question"]
        source = "rule_fallback"
    else:
        source = "full_json"

    state = _default_state(
        "deep_dive_active",
        focus_key=focus_key,
        progress_label=progress_label,
        answer_hint=answer_hint,
        missing_elements=fallback_state.missing_elements if fallback_state else [],
        ready_for_draft=True,
        draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
        draft_text=fallback_state.draft_text if fallback_state else None,
        deepdive_stage=deepdive_stage,
    )
    return question, state, source


def _is_deepdive_request(request: NextQuestionRequest) -> bool:
    state = request.conversation_state
    if not state:
        return False
    return bool(state.draft_text) or state.stage in {"draft_ready", "deep_dive_active", "interview_ready"}


def _build_es_prompt(request: NextQuestionRequest) -> str:
    return ES_BUILD_AND_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        conversation=_format_conversation(request.conversation_history),
        known_facts=_build_known_facts(request.conversation_history),
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        es_build_question_principles=ES_BUILD_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )


def _build_deepdive_prompt(request: NextQuestionRequest) -> str:
    phase_name, phase_description, preferred_focuses = _determine_deepdive_phase(request.question_count)
    draft_text = request.conversation_state.draft_text if request.conversation_state else ""
    return STAR_EVALUATE_AND_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        draft_text=sanitize_prompt_input(draft_text or "記載なし", max_length=1800),
        conversation=_format_conversation(request.conversation_history),
        phase_name=phase_name,
        phase_description=phase_description,
        preferred_focuses=", ".join(preferred_focuses),
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        deepdive_question_principles=DEEPDIVE_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )


async def _generate_initial_question(request: NextQuestionRequest) -> tuple[str, dict[str, Any]]:
    if not request.gakuchika_content:
        fallback = _fallback_build_meta("overview")
        state = _default_state(
            "es_building",
            focus_key="overview",
            progress_label=fallback["progress_label"],
            answer_hint=fallback["answer_hint"],
            missing_elements=["context", "task", "action", "result", "learning"],
            ready_for_draft=False,
            draft_text=None,
        )
        return fallback["question"], state

    prompt = INITIAL_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        gakuchika_content=sanitize_prompt_input(request.gakuchika_content, max_length=2000),
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        es_build_question_principles=ES_BUILD_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="最初の質問を生成してください。",
        max_tokens=INITIAL_QUESTION_MAX_TOKENS,
        temperature=0.4,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if llm_result.success and llm_result.data is not None:
        question, state, _ = _normalize_es_build_payload(llm_result.data, None)
        if question or state["ready_for_draft"]:
            return question or _fallback_build_meta("overview")["question"], state

    fallback_focus = random.choice(["overview", "context", "task"])
    fallback = _fallback_build_meta(fallback_focus)
    return fallback["question"], _default_state(
        "es_building",
        focus_key=fallback_focus,
        progress_label=fallback["progress_label"],
        answer_hint=fallback["answer_hint"],
        missing_elements=["context", "task", "action", "result", "learning"],
        ready_for_draft=False,
        draft_text=None,
    )


def _sse_event(event_type: str, data: dict[str, Any]) -> str:
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _stream_schema_hints(is_deepdive: bool) -> dict[str, str]:
    if is_deepdive:
        return {
            "question": "string",
            "answer_hint": "string",
            "progress_label": "string",
            "focus_key": "string",
            "deepdive_stage": "string",
        }
    return {
        "question": "string",
        "answer_hint": "string",
        "progress_label": "string",
        "focus_key": "string",
        "missing_elements": "array",
        "ready_for_draft": "boolean",
        "draft_readiness_reason": "string",
    }


async def _generate_next_question_progress(request: NextQuestionRequest) -> AsyncGenerator[str, None]:
    try:
        if not request.gakuchika_title:
            yield _sse_event("error", {
                "message": "ガクチカのテーマが指定されていません",
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        has_user_response = any(msg.role == "user" for msg in request.conversation_history)
        if not has_user_response and not _is_deepdive_request(request):
            question, state = await _generate_initial_question(request)
            yield _sse_event("complete", {
                "data": {
                    "question": question,
                    "conversation_state": state,
                },
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        is_deepdive = _is_deepdive_request(request)
        prompt = _build_deepdive_prompt(request) if is_deepdive else _build_es_prompt(request)
        fallback_state = request.conversation_state

        yield _sse_event("progress", {
            "step": "analysis",
            "progress": 30,
            "label": "質問の意図を整理中",
        })
        yield _sse_event("progress", {
            "step": "question",
            "progress": 60,
            "label": "次の質問を生成中...",
        })

        llm_result = None
        async for event in call_llm_streaming_fields(
            system_prompt=prompt,
            user_message="上記の会話を分析し、次の質問をJSON形式で生成してください。",
            max_tokens=NEXT_QUESTION_MAX_TOKENS,
            temperature=0.35,
            feature="gakuchika",
            schema_hints=_stream_schema_hints(is_deepdive),
            stream_string_fields=["question"],
            attempt_repair_on_parse_failure=False,
            partial_required_fields=(),
        ):
            if event.type == "string_chunk":
                yield _sse_event("string_chunk", {"path": event.path, "text": event.text})
            elif event.type == "field_complete":
                yield _sse_event("field_complete", {"path": event.path, "value": event.value})
            elif event.type == "array_item_complete":
                yield _sse_event("array_item_complete", {"path": event.path, "value": event.value})
            elif event.type == "error":
                error = event.result.error if event.result else None
                yield _sse_event("error", {
                    "message": error.message if error else "AIサービスに接続できませんでした。",
                    "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
                })
                return
            elif event.type == "complete":
                llm_result = event.result

        if llm_result is None or not llm_result.success or llm_result.data is None:
            error = llm_result.error if llm_result else None
            yield _sse_event("error", {
                "message": error.message if error else "AIサービスに接続できませんでした。",
                "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
            })
            return

        if is_deepdive:
            question, state, source = _normalize_deepdive_payload(llm_result.data, fallback_state)
        else:
            question, state, source = _normalize_es_build_payload(llm_result.data, fallback_state)

        logger.info(
            "[Gakuchika] normalized via %s (stage=%s focus=%s)",
            source,
            state["stage"],
            state["focus_key"],
        )

        yield _sse_event("complete", {
            "data": {
                "question": question,
                "conversation_state": state,
            },
            "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
        })
    except Exception as exc:
        yield _sse_event("error", {
            "message": f"予期しないエラーが発生しました: {str(exc)}",
            "internal_telemetry": consume_request_llm_cost_summary("gakuchika"),
        })


@router.post("/next-question", response_model=NextQuestionResponse)
@limiter.limit("60/minute")
async def get_next_question(payload: NextQuestionRequest, request: Request):
    request = payload
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    has_user_response = any(msg.role == "user" for msg in request.conversation_history)
    if not has_user_response and not _is_deepdive_request(request):
        question, state = await _generate_initial_question(request)
        return NextQuestionResponse(
            question=question,
            conversation_state=state,
            internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
        )

    is_deepdive = _is_deepdive_request(request)
    prompt = _build_deepdive_prompt(request) if is_deepdive else _build_es_prompt(request)
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の会話を分析し、次の質問をJSON形式で生成してください。",
        max_tokens=NEXT_QUESTION_MAX_TOKENS,
        temperature=0.35,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "AIサービスに接続できませんでした。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data if llm_result.data is not None else _parse_json_payload(llm_result.raw_text or "")
    if is_deepdive:
        question, state, _ = _normalize_deepdive_payload(data, request.conversation_state)
    else:
        question, state, _ = _normalize_es_build_payload(data, request.conversation_state)

    return NextQuestionResponse(
        question=question,
        conversation_state=state,
        internal_telemetry=consume_request_llm_cost_summary("gakuchika"),
    )


@router.post("/next-question/stream")
@limiter.limit("60/minute")
async def get_next_question_stream(payload: NextQuestionRequest, request: Request):
    request = payload
    try:
        _sanitize_next_question_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()
    return StreamingResponse(
        _generate_next_question_progress(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/structured-summary")
@limiter.limit("60/minute")
async def generate_structured_summary(payload: StructuredSummaryRequest, request: Request):
    request = payload
    try:
        _sanitize_summary_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    prompt = STRUCTURED_SUMMARY_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        draft_text=sanitize_prompt_input(request.draft_text, max_length=1800),
        conversation=_format_conversation(request.conversation_history),
        deepdive_question_principles=DEEPDIVE_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
    )
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の内容をSTAR構造と面接メモに整理してください。",
        max_tokens=1600,
        temperature=0.3,
        feature="gakuchika",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success or llm_result.data is None:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "構造化サマリー生成中にエラーが発生しました。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
                "detail": error.detail if error else "",
            },
        )

    data = llm_result.data
    strengths = data.get("strengths", [])
    if strengths and isinstance(strengths[0], str):
        strengths = [{"title": item, "description": ""} for item in strengths]
    learnings = data.get("learnings", [])
    if learnings and isinstance(learnings[0], str):
        learnings = [{"title": item, "description": ""} for item in learnings]

    return StructuredSummaryResponse(
        situation_text=_clean_string(data.get("situation_text")),
        task_text=_clean_string(data.get("task_text")),
        action_text=_clean_string(data.get("action_text")),
        result_text=_clean_string(data.get("result_text")),
        strengths=strengths,
        learnings=learnings,
        numbers=_clean_string_list(data.get("numbers")),
        interviewer_hooks=_clean_string_list(data.get("interviewer_hooks"), max_items=3),
        decision_reasons=_clean_string_list(data.get("decision_reasons"), max_items=3),
        before_after_comparisons=_clean_string_list(data.get("before_after_comparisons"), max_items=3),
        credibility_notes=_clean_string_list(data.get("credibility_notes"), max_items=3),
        role_scope=_clean_string(data.get("role_scope")),
        reusable_principles=_clean_string_list(data.get("reusable_principles"), max_items=3),
        interview_supporting_details=_clean_string_list(data.get("interview_supporting_details"), max_items=3),
        future_outlook_notes=_clean_string_list(data.get("future_outlook_notes"), max_items=2),
        backstory_notes=_clean_string_list(data.get("backstory_notes"), max_items=2),
    )


@router.post("/generate-es-draft", response_model=GakuchikaESDraftResponse)
@limiter.limit("60/minute")
async def generate_es_draft(payload: GakuchikaESDraftRequest, request: Request):
    request = payload
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")
    if request.char_limit not in [300, 400, 500]:
        raise HTTPException(status_code=400, detail="文字数は300, 400, 500のいずれかを指定してください")
    try:
        _sanitize_es_draft_request(request)
    except PromptSafetyError:
        raise _prompt_safety_http_error()

    conversation_text = _format_conversation(request.conversation_history)
    char_min = int(request.char_limit * 0.9)
    prompt = GAKUCHIKA_DRAFT_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        conversation=conversation_text,
        char_limit=request.char_limit,
        char_min=char_min,
    )
    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="ガクチカのESを作成してください。",
        max_tokens=1200,
        temperature=0.3,
        feature="gakuchika_draft",
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not llm_result.success or llm_result.data is None:
        if llm_result.raw_text:
            raw = llm_result.raw_text.strip()
            match = re.search(r'"draft"\s*:\s*"((?:[^"\\]|\\.)*)', raw, re.DOTALL)
            if match:
                draft_text = match.group(1).replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
                if not draft_text.endswith(("。", "」", "）")):
                    last_period = draft_text.rfind("。")
                    if last_period > len(draft_text) * 0.5:
                        draft_text = draft_text[: last_period + 1]
                if len(draft_text) >= 100:
                    return GakuchikaESDraftResponse(
                        draft=draft_text,
                        char_count=len(draft_text),
                        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
                    )
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "ES生成中にエラーが発生しました。",
            },
        )

    data = llm_result.data
    draft = _clean_string(data.get("draft"))
    followup_suggestion = _clean_string(data.get("followup_suggestion")) or "更に深掘りする"
    return GakuchikaESDraftResponse(
        draft=draft,
        char_count=len(draft),
        followup_suggestion=followup_suggestion,
        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
    )
