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
CORE_BUILD_ELEMENTS = ("context", "task", "action", "result")
DRAFT_QUALITY_CHECK_KEYS = (
    "task_clarity",
    "action_ownership",
    "role_clarity",
    "role_required",
    "result_traceability",
    "learning_reusability",
)
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
ROLE_REQUIRED_HINT_PATTERNS = (
    "チーム",
    "メンバー",
    "サークル",
    "研究室",
    "ゼミ",
    "アルバイト",
    "委員",
    "運営",
    "店舗",
    "部活",
    "複数",
    "企画",
)
ROLE_CLARITY_PATTERNS = ("主担当", "担当", "リーダー", "役割", "分担", "責任", "任され", "私が", "私は", "自分が")
TASK_PATTERNS = ("課題", "問題", "悩み", "不足", "滞り", "停滞", "伸び悩み", "困って", "混雑", "詰まり", "非効率", "逃して")
ACTION_PATTERNS = ("提案", "導入", "作成", "設計", "改善", "見直", "分析", "整理", "調整", "実施", "企画", "再設計")
ACTION_WEAK_PATTERNS = ("頑張", "工夫", "意識", "努力", "対応", "取り組")
RESULT_PATTERNS = ("増", "減", "向上", "改善", "安定", "短縮", "達成", "上が", "下が", "変わ", "任され", "評価")
LEARNING_PATTERNS = ("学び", "学ん", "気づ", "再現", "活か", "次", "今後", "原則")
LEARNING_GENERIC_PATTERNS = ("大切", "重要", "必要", "協力の大切さ", "継続の大切さ")
ACTION_REASON_PATTERNS = ("理由", "判断", "なぜ", "比較", "根拠", "優先", "見立て")
CONNECTIVE_PATTERNS = ("ため", "ので", "から", "結果", "その結果", "ことにより", "につなが")

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
    "role": {
        "question": "その経験では、ご自身が主にどこを担当していたのか教えていただけますか。",
        "answer_hint": "自分が任されていた範囲と、周囲と分担していた範囲を分けて書くと伝わりやすいです。",
        "progress_label": "役割を整理中",
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
    input_richness_mode: str | None = Field(default=None, max_length=32)
    missing_elements: list[str] = Field(default_factory=list)
    draft_quality_checks: dict[str, bool] = Field(default_factory=dict)
    causal_gaps: list[str] = Field(default_factory=list)
    completion_checks: dict[str, bool] = Field(default_factory=dict)
    ready_for_draft: bool = False
    draft_readiness_reason: str | None = Field(default=None, max_length=240)
    draft_text: str | None = Field(default=None, max_length=3000)
    strength_tags: list[str] = Field(default_factory=list)
    issue_tags: list[str] = Field(default_factory=list)
    deepdive_recommendation_tags: list[str] = Field(default_factory=list)
    credibility_risk_tags: list[str] = Field(default_factory=list)
    deepdive_stage: str | None = Field(default=None, max_length=40)
    deepdive_complete: bool = False
    completion_reasons: list[str] = Field(default_factory=list)
    asked_focuses: list[str] = Field(default_factory=list)
    resolved_focuses: list[str] = Field(default_factory=list)
    deferred_focuses: list[str] = Field(default_factory=list)
    blocked_focuses: list[str] = Field(default_factory=list)
    focus_attempt_counts: dict[str, int] = Field(default_factory=dict)
    last_question_signature: str | None = Field(default=None, max_length=120)

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
    next_action: str = "ask"
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
    one_line_core_answer: str = ""
    likely_followup_questions: list[str] = []
    weak_points_to_prepare: list[str] = []
    two_minute_version_outline: list[str] = []


class GakuchikaESDraftRequest(BaseModel):
    gakuchika_title: str = Field(max_length=200)
    conversation_history: list[Message]
    char_limit: int = Field(default=400, ge=300, le=500)


class GakuchikaESDraftResponse(BaseModel):
    draft: str
    char_count: int
    followup_suggestion: str = "更に深掘りする"
    draft_diagnostics: dict[str, list[str]] | None = None
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


def _clean_bool_map(value: object, allowed_keys: tuple[str, ...]) -> dict[str, bool]:
    if not isinstance(value, dict):
        return {}
    cleaned: dict[str, bool] = {}
    for key in allowed_keys:
        if key in value:
            cleaned[key] = bool(value[key])
    return cleaned


def _contains_any(text: str, patterns: tuple[str, ...]) -> bool:
    return any(pattern in text for pattern in patterns)


def _contains_digit(text: str) -> bool:
    return bool(re.search(r"\d", text))


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _classify_input_richness(text: str) -> str:
    normalized = _normalize_text(text)
    if not normalized:
        return "seed_only"

    sentences = [part for part in re.split(r"[。！？\n]", normalized) if part.strip()]
    score = 0
    if _contains_any(normalized, TASK_PATTERNS):
        score += 1
    if _contains_any(normalized, ACTION_PATTERNS):
        score += 1
    if _contains_any(normalized, RESULT_PATTERNS) or _contains_digit(normalized):
        score += 1
    if _contains_any(normalized, CONNECTIVE_PATTERNS):
        score += 1
    if len(normalized) <= 18 and len(sentences) <= 1:
        return "seed_only"
    if score >= 3 and len(normalized) >= 55:
        return "almost_draftable"
    if len(normalized) <= 24 and score == 0:
        return "seed_only"
    return "rough_episode"


def _role_required(text: str) -> bool:
    normalized = _normalize_text(text)
    return _contains_any(normalized, ROLE_REQUIRED_HINT_PATTERNS) or (
        _contains_any(normalized, RESULT_PATTERNS) and _contains_digit(normalized)
    )


def _build_draft_quality_checks(text: str) -> dict[str, bool]:
    normalized = _normalize_text(text)
    role_required = _role_required(normalized)
    action_specific = _contains_any(normalized, ACTION_PATTERNS) and (
        "私" in normalized or "自分" in normalized or _contains_any(normalized, ROLE_CLARITY_PATTERNS)
    )
    result_visible = _contains_any(normalized, RESULT_PATTERNS) or _contains_digit(normalized)
    learning_visible = _contains_any(normalized, LEARNING_PATTERNS)

    return {
        "task_clarity": _contains_any(normalized, TASK_PATTERNS) and _contains_any(normalized, CONNECTIVE_PATTERNS),
        "action_ownership": action_specific,
        "role_required": role_required,
        "role_clarity": (not role_required) or _contains_any(normalized, ROLE_CLARITY_PATTERNS),
        "result_traceability": result_visible and action_specific and _contains_any(normalized, CONNECTIVE_PATTERNS),
        "learning_reusability": learning_visible and _contains_any(normalized, ("活か", "次", "今後", "再現", "原則")),
    }


def _build_causal_gaps(text: str, quality_checks: dict[str, bool]) -> list[str]:
    normalized = _normalize_text(text)
    gaps: list[str] = []
    if quality_checks.get("task_clarity") and quality_checks.get("action_ownership") and not _contains_any(
        normalized, ACTION_REASON_PATTERNS
    ):
        gaps.append("causal_gap_task_action")
    if quality_checks.get("action_ownership") and not quality_checks.get("result_traceability"):
        gaps.append("causal_gap_action_result")
    if _contains_any(normalized, LEARNING_PATTERNS) and not quality_checks.get("learning_reusability"):
        gaps.append("learning_too_generic")
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        gaps.append("role_scope_missing")
    return gaps


def _choose_build_focus(missing_elements: list[str], quality_checks: dict[str, bool], causal_gaps: list[str]) -> str:
    for key in CORE_BUILD_ELEMENTS:
        if key in missing_elements:
            return key
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        return "role"
    if not quality_checks.get("task_clarity"):
        return "task"
    if not quality_checks.get("action_ownership"):
        return "action"
    if not quality_checks.get("result_traceability"):
        return "result"
    if "causal_gap_task_action" in causal_gaps:
        return "task"
    if "causal_gap_action_result" in causal_gaps:
        return "result"
    return "result"


def _build_readiness_reason(quality_checks: dict[str, bool], causal_gaps: list[str], missing_elements: list[str]) -> str:
    if missing_elements:
        return f"{'・'.join(missing_elements[:3])}の材料がまだ不足しています。"
    reasons: list[str] = []
    if not quality_checks.get("task_clarity"):
        reasons.append("課題をなぜ重要と見たかがまだ弱い")
    if not quality_checks.get("action_ownership"):
        reasons.append("自分が担った行動がまだ抽象的")
    if quality_checks.get("role_required") and not quality_checks.get("role_clarity"):
        reasons.append("役割範囲がまだ曖昧")
    if not quality_checks.get("result_traceability"):
        reasons.append("行動と成果のつながりがまだ弱い")
    if not reasons and causal_gaps:
        reasons.append("因果の流れをもう少し補いたい")
    return "。".join(reasons[:2]) + ("。" if reasons else "")


def _build_draft_diagnostics(draft_text: str) -> dict[str, list[str]]:
    normalized = _normalize_text(draft_text)
    strength_tags: list[str] = []
    issue_tags: list[str] = []
    deepdive_recommendation_tags: list[str] = []
    credibility_risk_tags: list[str] = []

    action_visible = _contains_any(normalized, ACTION_PATTERNS)
    result_visible = _contains_digit(normalized) or _contains_any(normalized, ("増", "減", "向上", "改善", "結果"))
    learning_visible = _contains_any(normalized, LEARNING_PATTERNS)

    if action_visible:
        strength_tags.append("action_visible")
    if result_visible:
        strength_tags.append("result_visible")
    if _contains_any(normalized, ROLE_CLARITY_PATTERNS):
        strength_tags.append("ownership_visible")
    if _contains_any(normalized, ("活か", "次", "今後", "再現")):
        strength_tags.append("learning_transfer_visible")

    if not action_visible or _contains_any(normalized, ACTION_WEAK_PATTERNS):
        issue_tags.append("action_specificity_weak")
        deepdive_recommendation_tags.append("deepen_action_reason")
    if not result_visible:
        issue_tags.append("result_evidence_thin")
        deepdive_recommendation_tags.append("collect_result_evidence")
    else:
        deepdive_recommendation_tags.append("result_traceability_check")
        if not _contains_any(normalized, CONNECTIVE_PATTERNS):
            issue_tags.append("result_traceability_weak")
    if not learning_visible:
        issue_tags.append("learning_missing")
        deepdive_recommendation_tags.append("learning_transfer")
    elif _contains_any(normalized, LEARNING_GENERIC_PATTERNS) and not _contains_any(
        normalized, ("活か", "今後", "再現", "原則")
    ):
        issue_tags.append("learning_generic")
        deepdive_recommendation_tags.append("deepen_learning_transfer")
    if _role_required(normalized) and not _contains_any(normalized, ROLE_CLARITY_PATTERNS):
        credibility_risk_tags.append("ownership_ambiguous")
        deepdive_recommendation_tags.append("clarify_role_scope")

    return {
        "strength_tags": list(dict.fromkeys(strength_tags)),
        "issue_tags": list(dict.fromkeys(issue_tags)),
        "deepdive_recommendation_tags": list(dict.fromkeys(deepdive_recommendation_tags)),
        "credibility_risk_tags": list(dict.fromkeys(credibility_risk_tags)),
    }


def _evaluate_deepdive_completion(
    conversation_text: str,
    draft_text: str | list[Message],
    focus_key: str | None = None,
) -> dict[str, object]:
    if isinstance(draft_text, list):
        legacy_eval = _evaluate_deepdive_completion(_format_conversation(draft_text), conversation_text, focus_key)
        return {
            "deepdive_complete": bool(legacy_eval["complete"]),
            "completion_reasons": [] if legacy_eval["complete"] else list(legacy_eval["missing_reasons"]),
        }

    combined = _normalize_text(f"{draft_text}\n{conversation_text}")
    role_needed = _role_required(combined) or focus_key in {"role", "credibility"}
    completed_checks = {
        "role_confirmed": (not role_needed) or _contains_any(combined, ROLE_CLARITY_PATTERNS),
        "challenge_confirmed": _contains_any(combined, TASK_PATTERNS) and _contains_any(combined, CONNECTIVE_PATTERNS),
        "action_reason_confirmed": _contains_any(combined, ACTION_REASON_PATTERNS),
        "result_evidence_confirmed": _contains_digit(combined) or _contains_any(
            combined, ("前後", "変化", "反応", "評価", "増", "減", "向上", "改善")
        ),
        "learning_transfer_confirmed": _contains_any(combined, ("活か", "今後", "再現", "原則", "次")),
        "credibility_confirmed": (
            ((not role_needed) or _contains_any(combined, ROLE_CLARITY_PATTERNS))
            and not _contains_any(
                combined,
                ("先輩が担当", "主に先輩", "他のメンバーが担当", "サポートに回った", "提案はしたが", "実行は主に"),
            )
        ),
    }
    missing_reasons: list[str] = []
    if not completed_checks["role_confirmed"]:
        missing_reasons.append("role_scope_missing")
    if not completed_checks["challenge_confirmed"]:
        missing_reasons.append("challenge_context_missing")
    if not completed_checks["action_reason_confirmed"]:
        missing_reasons.append("action_reason_missing")
    if not completed_checks["result_evidence_confirmed"]:
        missing_reasons.append("result_evidence_missing")
    if not completed_checks["learning_transfer_confirmed"]:
        missing_reasons.append("learning_transfer_missing")
    if not completed_checks["credibility_confirmed"]:
        missing_reasons.append("credibility_risk")
    complete = len(missing_reasons) == 0
    completion_reasons = [key for key, value in completed_checks.items() if value] if complete else []
    return {
        "complete": complete,
        "completion_checks": completed_checks,
        "missing_reasons": missing_reasons,
        "completion_reasons": completion_reasons,
        "focus_key": focus_key or "challenge",
    }


def _default_state(stage: str = "es_building", **kwargs: Any) -> dict[str, Any]:
    return {
        "stage": stage,
        "focus_key": kwargs.get("focus_key"),
        "progress_label": kwargs.get("progress_label"),
        "answer_hint": kwargs.get("answer_hint"),
        "input_richness_mode": kwargs.get("input_richness_mode"),
        "missing_elements": kwargs.get("missing_elements", []),
        "draft_quality_checks": kwargs.get("draft_quality_checks", {}),
        "causal_gaps": kwargs.get("causal_gaps", []),
        "ready_for_draft": kwargs.get("ready_for_draft", False),
        "draft_readiness_reason": kwargs.get("draft_readiness_reason", ""),
        "draft_text": kwargs.get("draft_text"),
        "strength_tags": kwargs.get("strength_tags", []),
        "issue_tags": kwargs.get("issue_tags", []),
        "deepdive_recommendation_tags": kwargs.get("deepdive_recommendation_tags", []),
        "credibility_risk_tags": kwargs.get("credibility_risk_tags", []),
        "deepdive_stage": kwargs.get("deepdive_stage"),
        "completion_checks": kwargs.get("completion_checks", {}),
        "deepdive_complete": kwargs.get("deepdive_complete", False),
        "completion_reasons": kwargs.get("completion_reasons", []),
        "asked_focuses": kwargs.get("asked_focuses", []),
        "resolved_focuses": kwargs.get("resolved_focuses", []),
        "deferred_focuses": kwargs.get("deferred_focuses", []),
        "blocked_focuses": kwargs.get("blocked_focuses", []),
        "focus_attempt_counts": kwargs.get("focus_attempt_counts", {}),
        "last_question_signature": kwargs.get("last_question_signature"),
    }


def _fallback_build_meta(focus_key: str) -> dict[str, str]:
    if focus_key == "role":
        return DEEPDIVE_FOCUS_FALLBACKS["role"]
    return BUILD_FOCUS_FALLBACKS.get(focus_key, BUILD_FOCUS_FALLBACKS["overview"])


def _fallback_deepdive_meta(focus_key: str) -> dict[str, str]:
    return DEEPDIVE_FOCUS_FALLBACKS.get(focus_key, DEEPDIVE_FOCUS_FALLBACKS["challenge"])


def _build_focus_meta(focus_key: str) -> dict[str, str]:
    if focus_key == "role":
        return _fallback_deepdive_meta("role")
    return _fallback_build_meta(focus_key)


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


def _build_user_corpus(messages: list[Message], *, initial_content: str | None = None, draft_text: str | None = None) -> str:
    parts: list[str] = []
    if initial_content:
        parts.append(initial_content.strip())
    parts.extend(msg.content.strip() for msg in messages if msg.role == "user" and msg.content.strip())
    if draft_text:
        parts.append(draft_text.strip())
    return "\n".join(part for part in parts if part)


def _normalize_missing_elements(value: object) -> list[str]:
    items = [item for item in _clean_string_list(value, max_items=len(CORE_BUILD_ELEMENTS)) if item in CORE_BUILD_ELEMENTS]
    seen: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def _normalize_focus_list(value: object) -> list[str]:
    return [item for item in _clean_string_list(value, max_items=12) if item in (*BUILD_ELEMENTS, *DEEPDIVE_FOCUSES)]


def _normalize_focus_attempt_counts(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    counts: dict[str, int] = {}
    for key, raw in value.items():
        if key not in (*BUILD_ELEMENTS, *DEEPDIVE_FOCUSES):
            continue
        try:
            count = int(raw)
        except (TypeError, ValueError):
            continue
        if count > 0:
            counts[key] = count
    return counts


def _build_core_missing_elements(text: str, quality_checks: dict[str, bool]) -> list[str]:
    normalized = _normalize_text(text)
    missing: list[str] = []
    if len(normalized) < 12:
        missing.append("context")
    if not quality_checks.get("task_clarity"):
        missing.append("task")
    if not quality_checks.get("action_ownership"):
        missing.append("action")
    result_present = _contains_digit(normalized) or _contains_any(
        normalized, ("前後", "変化", "反応", "評価", "増", "減", "向上", "改善", "短縮", "達成", "任され")
    )
    if not result_present:
        missing.append("result")
    return missing


def _critical_causal_gaps(causal_gaps: list[str]) -> list[str]:
    return [gap for gap in causal_gaps if gap in {"causal_gap_action_result", "role_scope_missing"}]


def _resolve_next_action(state: dict[str, Any]) -> str:
    stage = _clean_string(state.get("stage")) or "es_building"
    draft_text = _clean_string(state.get("draft_text"))
    if stage == "interview_ready":
        return "show_interview_ready"
    if stage == "draft_ready":
        return "continue_deep_dive" if draft_text else "show_generate_draft_cta"
    return "ask"


def _derive_focus_tracking(
    fallback_state: ConversationStateInput | None,
    *,
    stage: str,
    focus_key: str | None,
    missing_elements: list[str],
    quality_checks: dict[str, bool],
    should_record_focus: bool,
) -> tuple[list[str], list[str], list[str], list[str], dict[str, int], str | None]:
    prior_asked = _normalize_focus_list(fallback_state.asked_focuses if fallback_state else [])
    prior_resolved = _normalize_focus_list(fallback_state.resolved_focuses if fallback_state else [])
    prior_deferred = _normalize_focus_list(fallback_state.deferred_focuses if fallback_state else [])
    prior_blocked = _normalize_focus_list(fallback_state.blocked_focuses if fallback_state else [])
    prior_attempts = _normalize_focus_attempt_counts(fallback_state.focus_attempt_counts if fallback_state else {})
    last_signature = _clean_string(fallback_state.last_question_signature if fallback_state else None)

    asked = list(dict.fromkeys(prior_asked + ([focus_key] if should_record_focus and focus_key else [])))
    resolved = list(dict.fromkeys([
        *prior_resolved,
        *[key for key in CORE_BUILD_ELEMENTS if key not in missing_elements],
        *(["learning"] if quality_checks.get("learning_reusability") else []),
    ]))
    deferred = list(dict.fromkeys([
        *prior_deferred,
        *(["learning"] if stage == "draft_ready" and not quality_checks.get("learning_reusability") else []),
    ]))

    attempts = dict(prior_attempts)
    blocked = list(prior_blocked)
    if should_record_focus and focus_key:
        attempts[focus_key] = attempts.get(focus_key, 0) + 1
        if focus_key not in resolved and attempts[focus_key] >= 2 and focus_key not in blocked:
            blocked.append(focus_key)

    return asked, resolved, deferred, blocked, attempts, last_signature


def _detect_es_focus_from_missing(missing_elements: list[str]) -> str:
    for key in CORE_BUILD_ELEMENTS:
        if key in missing_elements:
            return key
    return "result"


def _determine_deepdive_phase(question_count: int) -> tuple[str, str, list[str]]:
    if question_count <= 2:
        return ("es_aftercare", "ES本文の骨格に対して判断理由と役割の解像度を上げる", ["challenge", "role", "action_reason"])
    if question_count <= 5:
        return ("evidence_enhancement", "成果の根拠・信憑性・再現可能性を補強する", ["result_evidence", "credibility", "learning_transfer"])
    return ("interview_expansion", "将来展望や原体験まで含めて人物像を厚くする", ["future", "backstory", "learning_transfer"])


def _normalize_es_build_payload(
    payload: object,
    fallback_state: ConversationStateInput | None,
    *,
    conversation_text: str = "",
    input_richness_mode: str | None = None,
    question_count: int = 0,
) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    missing_elements = _normalize_missing_elements(data.get("missing_elements"))
    quality_checks = _build_draft_quality_checks(conversation_text) if conversation_text else _clean_bool_map(
        data.get("draft_quality_checks"), DRAFT_QUALITY_CHECK_KEYS
    )
    causal_gaps = _build_causal_gaps(conversation_text, quality_checks) if conversation_text else _clean_string_list(
        data.get("causal_gaps"), max_items=4
    )
    if conversation_text:
        missing_elements = _build_core_missing_elements(conversation_text, quality_checks)
    readiness_reason = _clean_string(data.get("draft_readiness_reason"))
    focus_key = _clean_string(data.get("focus_key"))
    if focus_key not in BUILD_ELEMENTS and focus_key != "role":
        focus_key = _choose_build_focus(missing_elements, quality_checks, causal_gaps)
    blocked_focuses = _normalize_focus_list(fallback_state.blocked_focuses if fallback_state else [])
    if focus_key in blocked_focuses:
        focus_key = _choose_build_focus(
            [item for item in missing_elements if item not in blocked_focuses],
            quality_checks,
            [gap for gap in causal_gaps if gap not in {"learning_too_generic"}],
        )
    meta = _build_focus_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    server_ready = bool(data.get("ready_for_draft"))
    if conversation_text:
        critical_gaps = _critical_causal_gaps(causal_gaps)
        core_ready = len(missing_elements) == 0
        role_gap = quality_checks.get("role_required", False) and not quality_checks.get("role_clarity", False)
        question_cap_ready = question_count >= 6 and core_ready and not role_gap and "causal_gap_action_result" not in critical_gaps
        server_ready = (
            ((core_ready and quality_checks.get("task_clarity", False)) or question_cap_ready)
            and quality_checks.get("action_ownership", False)
            and (
                quality_checks.get("result_traceability", False)
                or "result" not in missing_elements
            )
            and (not quality_checks.get("role_required", False) or quality_checks.get("role_clarity", False))
            and not critical_gaps
        )
        if not readiness_reason:
            readiness_reason = _build_readiness_reason(quality_checks, causal_gaps, missing_elements)

    asked_focuses, resolved_focuses, deferred_focuses, blocked_focuses, focus_attempt_counts, _ = _derive_focus_tracking(
        fallback_state,
        stage="draft_ready" if server_ready else "es_building",
        focus_key=focus_key,
        missing_elements=missing_elements,
        quality_checks=quality_checks,
        should_record_focus=not server_ready,
    )
    last_question_signature = f"{focus_key}:{(focus_attempt_counts.get(focus_key, 0) or 1)}" if focus_key else None

    if server_ready:
        state = _default_state(
            "draft_ready",
            focus_key=focus_key,
            progress_label="ESを作成できます",
            answer_hint="ここまででES本文を書ける最低限の材料は揃っています。",
            input_richness_mode=input_richness_mode or (fallback_state.input_richness_mode if fallback_state else None),
            missing_elements=missing_elements,
            draft_quality_checks=quality_checks,
            causal_gaps=causal_gaps,
            ready_for_draft=True,
            draft_readiness_reason=readiness_reason or "ES本文に必要な材料が揃っています。",
            draft_text=fallback_state.draft_text if fallback_state else None,
            strength_tags=fallback_state.strength_tags if fallback_state else [],
            issue_tags=fallback_state.issue_tags if fallback_state else [],
            deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
            credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
            asked_focuses=asked_focuses,
            resolved_focuses=resolved_focuses,
            deferred_focuses=deferred_focuses,
            blocked_focuses=blocked_focuses,
            focus_attempt_counts=focus_attempt_counts,
            last_question_signature=last_question_signature,
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
        input_richness_mode=input_richness_mode or (fallback_state.input_richness_mode if fallback_state else None),
        missing_elements=missing_elements,
        draft_quality_checks=quality_checks,
        causal_gaps=causal_gaps,
        ready_for_draft=False,
        draft_readiness_reason=readiness_reason or _build_readiness_reason(quality_checks, causal_gaps, missing_elements),
        draft_text=fallback_state.draft_text if fallback_state else None,
        strength_tags=fallback_state.strength_tags if fallback_state else [],
        issue_tags=fallback_state.issue_tags if fallback_state else [],
        deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
        credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
        asked_focuses=asked_focuses,
        resolved_focuses=resolved_focuses,
        deferred_focuses=deferred_focuses,
        blocked_focuses=blocked_focuses,
        focus_attempt_counts=focus_attempt_counts,
        last_question_signature=last_question_signature,
    )
    return question, state, source


def _normalize_deepdive_payload(
    payload: object,
    fallback_state: ConversationStateInput | None,
    *,
    conversation_text: str = "",
    draft_text: str = "",
) -> tuple[str, dict[str, Any], str]:
    data = payload if isinstance(payload, dict) else {}
    focus_key = _clean_string(data.get("focus_key")) or "challenge"
    if focus_key not in DEEPDIVE_FOCUSES:
        focus_key = "challenge"
    meta = _fallback_deepdive_meta(focus_key)
    question = _clean_string(data.get("question"))
    answer_hint = _clean_string(data.get("answer_hint")) or meta["answer_hint"]
    progress_label = _clean_string(data.get("progress_label")) or meta["progress_label"]
    deepdive_stage = _clean_string(data.get("deepdive_stage")) or "es_aftercare"
    completion = (
        _evaluate_deepdive_completion(conversation_text, draft_text or (fallback_state.draft_text if fallback_state else ""), focus_key)
        if conversation_text or draft_text or (fallback_state and fallback_state.draft_text)
        else None
    )
    explicit_interview_ready = deepdive_stage == "interview_ready"
    deepdive_complete = explicit_interview_ready or bool(completion and completion["complete"])
    completion_reasons = [] if explicit_interview_ready else list(completion["completion_reasons"]) if completion else []
    asked_focuses, resolved_focuses, deferred_focuses, blocked_focuses, focus_attempt_counts, _ = _derive_focus_tracking(
        fallback_state,
        stage="interview_ready" if deepdive_complete else "deep_dive_active",
        focus_key=focus_key,
        missing_elements=fallback_state.missing_elements if fallback_state else [],
        quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
        should_record_focus=not deepdive_complete,
    )
    last_question_signature = f"{focus_key}:{(focus_attempt_counts.get(focus_key, 0) or 1)}" if focus_key else None

    if deepdive_complete:
        state = _default_state(
            "interview_ready",
            focus_key=focus_key,
            progress_label="面接準備完了",
            answer_hint="ここまでで面接に向けた補足材料も揃っています。",
            input_richness_mode=fallback_state.input_richness_mode if fallback_state else None,
            missing_elements=fallback_state.missing_elements if fallback_state else [],
            draft_quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
            causal_gaps=fallback_state.causal_gaps if fallback_state else [],
            ready_for_draft=True,
            draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
            draft_text=fallback_state.draft_text if fallback_state else None,
            strength_tags=fallback_state.strength_tags if fallback_state else [],
            issue_tags=fallback_state.issue_tags if fallback_state else [],
            deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
            credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
            deepdive_stage="interview_ready",
            completion_checks=completion["completion_checks"] if completion else {},
            deepdive_complete=True,
            completion_reasons=completion_reasons,
            asked_focuses=asked_focuses,
            resolved_focuses=resolved_focuses,
            deferred_focuses=deferred_focuses,
            blocked_focuses=blocked_focuses,
            focus_attempt_counts=focus_attempt_counts,
            last_question_signature=last_question_signature,
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
        input_richness_mode=fallback_state.input_richness_mode if fallback_state else None,
        missing_elements=fallback_state.missing_elements if fallback_state else [],
        draft_quality_checks=fallback_state.draft_quality_checks if fallback_state else {},
        causal_gaps=fallback_state.causal_gaps if fallback_state else [],
        ready_for_draft=True,
        draft_readiness_reason=fallback_state.draft_readiness_reason if fallback_state else "",
        draft_text=fallback_state.draft_text if fallback_state else None,
        strength_tags=fallback_state.strength_tags if fallback_state else [],
        issue_tags=fallback_state.issue_tags if fallback_state else [],
        deepdive_recommendation_tags=fallback_state.deepdive_recommendation_tags if fallback_state else [],
        credibility_risk_tags=fallback_state.credibility_risk_tags if fallback_state else [],
        deepdive_stage=deepdive_stage,
        completion_checks=completion["completion_checks"] if completion else {},
        deepdive_complete=False,
        completion_reasons=list(completion["missing_reasons"]) if completion else [],
        asked_focuses=asked_focuses,
        resolved_focuses=resolved_focuses,
        deferred_focuses=deferred_focuses,
        blocked_focuses=blocked_focuses,
        focus_attempt_counts=focus_attempt_counts,
        last_question_signature=last_question_signature,
    )
    return question, state, source


def _is_deepdive_request(request: NextQuestionRequest) -> bool:
    state = request.conversation_state
    if not state:
        return False
    return bool(state.draft_text) or state.stage in {"deep_dive_active", "interview_ready"}


def _build_es_prompt(request: NextQuestionRequest) -> str:
    input_richness_mode = (
        request.conversation_state.input_richness_mode
        if request.conversation_state and request.conversation_state.input_richness_mode
        else _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
    )
    return ES_BUILD_AND_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        conversation=_format_conversation(request.conversation_history),
        known_facts=_build_known_facts(request.conversation_history),
        input_richness_mode=input_richness_mode,
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        es_build_question_principles=ES_BUILD_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )


def _build_deepdive_prompt(request: NextQuestionRequest) -> str:
    phase_name, phase_description, preferred_focuses = _determine_deepdive_phase(request.question_count)
    draft_text = request.conversation_state.draft_text if request.conversation_state else ""
    draft_diagnostics_json = json.dumps(
        {
            "strength_tags": request.conversation_state.strength_tags if request.conversation_state else [],
            "issue_tags": request.conversation_state.issue_tags if request.conversation_state else [],
            "deepdive_recommendation_tags": (
                request.conversation_state.deepdive_recommendation_tags if request.conversation_state else []
            ),
            "credibility_risk_tags": (
                request.conversation_state.credibility_risk_tags if request.conversation_state else []
            ),
        },
        ensure_ascii=False,
    )
    return STAR_EVALUATE_AND_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        draft_text=sanitize_prompt_input(draft_text or "記載なし", max_length=1800),
        conversation=_format_conversation(request.conversation_history),
        phase_name=phase_name,
        phase_description=phase_description,
        preferred_focuses=", ".join(preferred_focuses),
        draft_diagnostics_json=draft_diagnostics_json,
        question_tone_and_alignment_rules=QUESTION_TONE_AND_ALIGNMENT_RULES,
        deepdive_question_principles=DEEPDIVE_QUESTION_PRINCIPLES,
        reference_guide_rubric=REFERENCE_GUIDE_RUBRIC,
        prohibited_expressions=_PROHIBITED_EXPRESSIONS,
    )


async def _generate_initial_question(request: NextQuestionRequest) -> tuple[str, dict[str, Any]]:
    input_richness_mode = _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
    if not request.gakuchika_content:
        fallback = _fallback_build_meta("context")
        state = _default_state(
            "es_building",
            focus_key="context",
            progress_label=fallback["progress_label"],
            answer_hint=fallback["answer_hint"],
            input_richness_mode=input_richness_mode,
            missing_elements=list(CORE_BUILD_ELEMENTS),
            draft_quality_checks={},
            causal_gaps=[],
            ready_for_draft=False,
            draft_text=None,
        )
        return fallback["question"], state

    prompt = INITIAL_QUESTION_PROMPT.format(
        gakuchika_title=sanitize_prompt_input(request.gakuchika_title, max_length=200),
        gakuchika_content=sanitize_prompt_input(request.gakuchika_content, max_length=2000),
        input_richness_mode=input_richness_mode,
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
        question, state, _ = _normalize_es_build_payload(
            llm_result.data,
            None,
            conversation_text=request.gakuchika_content or "",
            input_richness_mode=input_richness_mode,
            question_count=request.question_count,
        )
        if question or state["ready_for_draft"]:
            return question or _fallback_build_meta("context")["question"], state

    fallback_focus = random.choice(["context", "task", "action"])
    fallback = _fallback_build_meta(fallback_focus)
    return fallback["question"], _default_state(
        "es_building",
        focus_key=fallback_focus,
        progress_label=fallback["progress_label"],
        answer_hint=fallback["answer_hint"],
        input_richness_mode=input_richness_mode,
        missing_elements=list(CORE_BUILD_ELEMENTS),
        draft_quality_checks={},
        causal_gaps=[],
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
                    "next_action": _resolve_next_action(state),
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
            question, state, source = _normalize_deepdive_payload(
                llm_result.data,
                fallback_state,
                conversation_text=_build_user_corpus(
                    request.conversation_history,
                    initial_content=request.gakuchika_content,
                    draft_text=request.conversation_state.draft_text if request.conversation_state else None,
                ),
                draft_text=request.conversation_state.draft_text if request.conversation_state else "",
            )
        else:
            question, state, source = _normalize_es_build_payload(
                llm_result.data,
                fallback_state,
                conversation_text=_build_user_corpus(
                    request.conversation_history,
                    initial_content=request.gakuchika_content,
                ),
                input_richness_mode=(
                    request.conversation_state.input_richness_mode
                    if request.conversation_state
                    else _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
                ),
                question_count=request.question_count,
            )

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
                "next_action": _resolve_next_action(state),
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
            next_action=_resolve_next_action(state),
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
        question, state, _ = _normalize_deepdive_payload(
            data,
            request.conversation_state,
            conversation_text=_build_user_corpus(
                request.conversation_history,
                initial_content=request.gakuchika_content,
                draft_text=request.conversation_state.draft_text if request.conversation_state else None,
            ),
            draft_text=request.conversation_state.draft_text if request.conversation_state else "",
        )
    else:
        question, state, _ = _normalize_es_build_payload(
            data,
            request.conversation_state,
            conversation_text=_build_user_corpus(
                request.conversation_history,
                initial_content=request.gakuchika_content,
            ),
            input_richness_mode=(
                request.conversation_state.input_richness_mode
                if request.conversation_state
                else _classify_input_richness(request.gakuchika_content or request.gakuchika_title)
            ),
            question_count=request.question_count,
        )

    return NextQuestionResponse(
        question=question,
        conversation_state=state,
        next_action=_resolve_next_action(state),
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
        one_line_core_answer=_clean_string(data.get("one_line_core_answer")),
        likely_followup_questions=_clean_string_list(data.get("likely_followup_questions"), max_items=4),
        weak_points_to_prepare=_clean_string_list(data.get("weak_points_to_prepare"), max_items=3),
        two_minute_version_outline=_clean_string_list(data.get("two_minute_version_outline"), max_items=4),
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
    draft_diagnostics = _build_draft_diagnostics(draft)
    return GakuchikaESDraftResponse(
        draft=draft,
        char_count=len(draft),
        followup_suggestion=followup_suggestion,
        draft_diagnostics=draft_diagnostics,
        internal_telemetry=consume_request_llm_cost_summary("gakuchika_draft"),
    )
