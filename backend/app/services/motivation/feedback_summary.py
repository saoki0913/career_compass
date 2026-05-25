"""志望動機フィードバックサマリ（面接で話す要点整理）の生成サービス。

ルーター（facade）は薄いエンドポイント定義に限定し、生成・検証・整形は
このモジュールに閉じる。プロンプト本文は motivation_prompts.py に分離している。
"""

from __future__ import annotations

from fastapi import HTTPException

from app.prompts.motivation_prompts import MOTIVATION_FEEDBACK_SUMMARY_PROMPT
from app.services.motivation.models import (
    FeedbackSummaryRequest,
    FeedbackSummaryResponse,
    FeedbackTitledItem,
)
from app.services.motivation.prompt_fmt import _build_slot_summary_section
from app.services.motivation.sanitizers import (
    format_conversation,
    prompt_safety_http_error,
    sanitize_generate_draft_request,
    sanitize_request_text,
)
from app.utils.llm import call_llm_with_error, consume_request_llm_cost_summary
from app.utils.llm_prompt_safety import PromptSafetyError, sanitize_prompt_input


def _clean_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _clean_text_list(value: object, *, max_items: int = 3) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return cleaned[:max_items]


def _coerce_titled_items(value: object, *, max_items: int = 3) -> list[FeedbackTitledItem]:
    """{title, description} のリストに正規化する。文字列だけの配列も許容する。"""
    if not isinstance(value, list):
        return []
    items: list[FeedbackTitledItem] = []
    for raw in value:
        if len(items) >= max_items:
            break
        if isinstance(raw, str):
            title = raw.strip()
            if title:
                items.append(FeedbackTitledItem(title=title, description=""))
        elif isinstance(raw, dict):
            title = _clean_text(raw.get("title"))
            if title:
                items.append(
                    FeedbackTitledItem(title=title, description=_clean_text(raw.get("description")))
                )
    return items


def _sanitize_feedback_summary_request(request: FeedbackSummaryRequest) -> None:
    # company_name / industry / conversation_history / slot_summaries / slot_evidence_sentences を
    # draft 生成と同じロジックでサニタイズし、未処理の slot がそのままプロンプトへ
    # 注入されるのを防ぐ（プロンプトインジェクション対策）。
    sanitize_generate_draft_request(request)
    request.selected_role = sanitize_request_text(request.selected_role, max_length=200)


def _selected_role_line(selected_role: str | None) -> str:
    role = (selected_role or "").strip()
    return f"職種: {role}" if role else "職種: 未指定"


async def generate_feedback_summary_response(
    request: FeedbackSummaryRequest,
) -> FeedbackSummaryResponse:
    if not request.conversation_history:
        raise HTTPException(status_code=400, detail="会話履歴がありません")

    try:
        _sanitize_feedback_summary_request(request)
    except PromptSafetyError:
        raise prompt_safety_http_error()

    slot_section = _build_slot_summary_section(
        request.slot_summaries, request.slot_evidence_sentences
    )
    prompt = MOTIVATION_FEEDBACK_SUMMARY_PROMPT.format(
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(request.industry or "未指定", max_length=100),
        selected_role_line=_selected_role_line(request.selected_role),
        draft_text=sanitize_prompt_input(request.draft_text, max_length=2000),
        slot_summary_section=slot_section or "（骨格要約はまだありません）",
        conversation=format_conversation(request.conversation_history),
    )

    llm_result = await call_llm_with_error(
        system_prompt=prompt,
        user_message="上記の志望動機を、面接で話せるフィードバックメモに整理してください。",
        max_tokens=1200,
        temperature=0.3,
        feature="motivation_summary",
        retry_on_parse=True,
        disable_fallback=True,
    )

    if not llm_result.success or llm_result.data is None:
        error = llm_result.error
        raise HTTPException(
            status_code=503,
            detail={
                "error": error.message if error else "フィードバック生成中にエラーが発生しました。",
                "error_type": error.error_type if error else "unknown",
                "provider": error.provider if error else "unknown",
            },
        )

    data = llm_result.data
    return FeedbackSummaryResponse(
        one_line_core_answer=_clean_text(data.get("one_line_core_answer")),
        strengths=_coerce_titled_items(data.get("strengths"), max_items=2),
        improvements=_coerce_titled_items(data.get("improvements"), max_items=3),
        next_preparation=_clean_text_list(data.get("next_preparation"), max_items=3),
        likely_followup_questions=_clean_text_list(
            data.get("likely_followup_questions"), max_items=3
        ),
        internal_telemetry=consume_request_llm_cost_summary("motivation_summary"),
    )
