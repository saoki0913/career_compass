"""Prompt formatting helpers for motivation question/draft generation."""

from __future__ import annotations

import re
from typing import Any

from app.routers.motivation_context import (
    REQUIRED_MOTIVATION_STAGES,
    STAGE_LABELS,
    _coerce_string_list,
    _normalize_confirmed_facts,
    _normalize_conversation_context,
)
from app.routers.motivation_models import Message
from app.routers.motivation_planner import SLOT_FILL_INTENTS
from app.routers.motivation_sanitizers import format_conversation as _format_conversation


def _trim_conversation_for_evaluation(
    messages: list[Message], max_messages: int = 8
) -> list[Message]:
    """Trim conversation to recent messages for evaluation stability."""
    if len(messages) <= max_messages:
        return messages
    return messages[-max_messages:]


def _format_recent_conversation_for_prompt(
    messages: list[Message],
    max_messages: int = 6,
) -> str:
    if not messages:
        return "（まだ会話履歴なし）"
    return _format_conversation(
        _trim_conversation_for_evaluation(messages, max_messages=max_messages)
    )


def _build_question_messages(messages: list[Message]) -> list[dict[str, str]] | None:
    if not messages:
        return None
    return [{"role": msg.role, "content": msg.content} for msg in messages]


def _build_question_user_message(messages: list[Message]) -> str:
    if not messages:
        return "会話開始用の最初の深掘り質問を1問生成してください。"
    return "次の深掘り質問を生成してください。"


def _format_gakuchika_for_prompt(
    gakuchika_context: list[dict] | None,
    max_items: int = 3,
) -> str:
    """Format gakuchika summaries into prompt-friendly text."""
    if not gakuchika_context:
        return "（ガクチカ情報なし）"

    sections = []
    for g in gakuchika_context[:max_items]:
        title = g.get("title", "経験")
        strengths = []
        for s in g.get("strengths", [])[:2]:
            if isinstance(s, dict):
                strengths.append(s.get("title", ""))
            elif isinstance(s, str):
                strengths.append(s)
        strengths = [s for s in strengths if s]
        action = str(g.get("action_text", ""))[:80]
        result = str(g.get("result_text", ""))[:60]
        numbers = [str(n) for n in g.get("numbers", [])[:3]]

        parts = [f"- {title}"]
        if strengths:
            parts.append(f"  強み: {', '.join(strengths)}")
        if action:
            parts.append(f"  行動: {action}")
        if result:
            parts.append(f"  成果: {result}")
        if numbers:
            parts.append(f"  数字: {', '.join(numbers)}")
        sections.append("\n".join(parts))

    return "\n".join(sections)


def _extract_gakuchika_strength(gakuchika_context: list[dict] | None) -> str | None:
    """Extract the first strength title from gakuchika context for personalization."""
    if not gakuchika_context:
        return None
    for g in gakuchika_context:
        for s in g.get("strengths", []):
            title = s.get("title") if isinstance(s, dict) else s
            if title and isinstance(title, str) and len(title) >= 2:
                return title
    return None


def _extract_motivation_student_expressions(
    conversation_history: list[Message],
    *,
    max_items: int = 5,
) -> list[str]:
    """Extract student-origin phrasing to preserve voice in motivation drafts."""
    if not conversation_history or max_items <= 0:
        return []

    quoted_pattern = re.compile(r"「([^「」\n]{2,30})」")
    digit_unit_pattern = re.compile(
        r"[^\s。、,.!?！？「」『』]{0,6}"
        r"\d+(?:[.,]\d+)?"
        r"(?:%|％|人|件|倍|年|月|日|分|時間|秒|社|回)"
        r"[^\s。、,.!?！？「」『』]{0,6}"
    )
    action_pattern = re.compile(
        r"(?:私|自分|僕)(?:が|は|の|で)?[^\s。、,.!?！？「」『』]{2,25}"
        r"(?:した|しました|する|します|やった|行った|担当した|取り組んだ|"
        r"決めた|作った|書いた|考えた|提案した|変えた|見直した|改善した|"
        r"設計した|導入した|始めた|続けた|乗り越えた|巻き込んだ|任された)"
    )

    results: list[str] = []
    seen: set[str] = set()

    def _push(value: str) -> bool:
        cleaned = value.strip().strip("、。,.・:：;；")
        if not (3 <= len(cleaned) <= 30) or cleaned in seen:
            return False
        seen.add(cleaned)
        results.append(cleaned)
        return len(results) >= max_items

    for msg in conversation_history:
        if msg.role != "user" or not msg.content.strip():
            continue
        for pattern in (quoted_pattern, digit_unit_pattern, action_pattern):
            for match in pattern.finditer(msg.content):
                captured = match.group(1) if pattern is quoted_pattern else match.group(0)
                if _push(captured):
                    return results
    return results


def _build_slot_summary_section(
    slot_summaries: dict[str, str | None] | None,
    slot_evidence_sentences: dict[str, list[str]] | None,
) -> str:
    """P4-5: ユーザーの確定済み回答を構造化された一次材料として整形する。"""
    summaries = slot_summaries or {}
    evidence = slot_evidence_sentences or {}
    if not any(summaries.get(stage) for stage in REQUIRED_MOTIVATION_STAGES):
        return ""
    lines = ["【一次材料：骨格要約（優先的に反映すること）】"]
    for stage in REQUIRED_MOTIVATION_STAGES:
        label = STAGE_LABELS.get(stage, stage)
        summary = summaries.get(stage)
        if not summary:
            continue
        lines.append(f"- {label}: {summary}")
        ev = evidence.get(stage) or []
        if ev:
            joined = "; ".join(ev[:2])
            lines.append(f"  根拠: {joined}")
    return "\n".join(lines)


def _build_draft_primary_material(
    *,
    conversation_text: str,
    slot_summaries: dict[str, str | None] | None,
    slot_evidence_sentences: dict[str, list[str]] | None,
) -> tuple[str, str]:
    """Return primary-material heading/body for motivation draft generation."""
    slot_section = _build_slot_summary_section(slot_summaries, slot_evidence_sentences)
    if slot_section:
        return (
            "【一次材料：骨格要約】",
            slot_section + "\n\n【三次材料：会話ログ（補完用）】\n" + conversation_text,
        )
    return ("【会話ログ】", conversation_text)


def _format_evidence_cards_for_prompt(
    evidence_cards: list[dict] | None,
    max_items: int = 3,
) -> str:
    """P4-6: 企業エビデンスカードを質問生成プロンプトに構造化して渡す。"""
    if not evidence_cards:
        return ""
    cards = evidence_cards[:max_items]
    if not cards:
        return ""
    lines = ["## 利用可能な企業エビデンス"]
    idx = 1
    for card in cards:
        if not isinstance(card, dict):
            continue
        content_type = str(
            card.get("contentType") or card.get("content_type") or "情報"
        )
        excerpt = str(card.get("excerpt") or "").strip()
        if not excerpt:
            continue
        if len(excerpt) > 80:
            excerpt = excerpt[:80] + "..."
        lines.append(f"- E{idx} ({content_type}): {excerpt}")
        idx += 1
    if len(lines) == 1:
        return ""
    return "\n".join(lines)


def _format_profile_for_prompt(profile_context: dict[str, Any] | None) -> str:
    if not isinstance(profile_context, dict):
        return "（プロフィール情報なし）"

    lines: list[str] = []
    if profile_context.get("university"):
        lines.append(f"- 大学: {profile_context['university']}")
    if profile_context.get("faculty"):
        lines.append(f"- 学部学科: {profile_context['faculty']}")
    if profile_context.get("graduation_year"):
        lines.append(f"- 卒業年度: {profile_context['graduation_year']}")

    industries = _coerce_string_list(profile_context.get("target_industries"), max_items=4)
    job_types = _coerce_string_list(profile_context.get("target_job_types"), max_items=4)
    if industries:
        lines.append(f"- 志望業界: {', '.join(industries)}")
    if job_types:
        lines.append(f"- 志望職種: {', '.join(job_types)}")

    return "\n".join(lines) if lines else "（プロフィール情報なし）"


def _format_application_jobs_for_prompt(
    application_job_candidates: list[str] | None,
) -> str:
    candidates = _coerce_string_list(application_job_candidates, max_items=6)
    if not candidates:
        return "（応募中・検討中の職種情報なし）"
    return "\n".join(f"- {candidate}" for candidate in candidates)


def _format_conversation_context_for_prompt(
    conversation_context: dict[str, Any] | None,
) -> str:
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = _normalize_confirmed_facts(context["confirmedFacts"])
    last_question_meta = context.get("lastQuestionMeta") or {}
    lines = [
        f"- 確定業界: {context['selectedIndustry'] or '未確定'}",
        f"- 業界志望理由: {context['industryReason'] or '未整理'}",
        f"- 企業志望理由: {context['companyReason'] or '未整理'}",
        f"- 志望職種: {context['selectedRole'] or '未整理'}",
        f"- 自分との接続: {context['selfConnection'] or '未整理'}",
        f"- やりたい仕事: {context['desiredWork'] or '未整理'}",
        f"- 価値発揮: {context['valueContribution'] or '未整理'}",
        f"- 他社ではなくこの企業の理由: {context['differentiationReason'] or '未整理'}",
        f"- 現在段階: {STAGE_LABELS.get(context['questionStage'], context['questionStage'])}",
        f"- 段階再質問回数: {context['stageAttemptCount']}",
        (
            "- confirmed facts: "
            f"industry={confirmed_facts['industry_reason_confirmed']}, "
            f"company={confirmed_facts['company_reason_confirmed']}, "
            f"self_connection={confirmed_facts['self_connection_confirmed']}, "
            f"desired_work={confirmed_facts['desired_work_confirmed']}, "
            f"value_contribution={confirmed_facts['value_contribution_confirmed']}, "
            f"differentiation={confirmed_facts['differentiation_confirmed']}"
        ),
    ]
    if last_question_meta:
        lines.append(
            "- 前回質問メタ: "
            f"stage={last_question_meta.get('question_stage') or 'なし'}, "
            f"focus={last_question_meta.get('question_focus') or 'なし'}, "
            f"attempt={last_question_meta.get('stage_attempt_count') or 0}"
        )
    if context["companyRoleCandidates"]:
        lines.append(f"- 企業職種候補: {', '.join(context['companyRoleCandidates'])}")
    if context["companyWorkCandidates"]:
        lines.append(f"- 企業仕事内容候補: {', '.join(context['companyWorkCandidates'])}")
    return "\n".join(lines)


def _format_answer_contract_for_prompt(
    *,
    stage: str,
    weakness_tag: str | None = None,
    wording_level: int = 1,
) -> str:
    from app.routers.motivation_question import _build_answer_contract

    contract = _build_answer_contract(stage, weakness_tag=weakness_tag)
    forbidden = contract.get("forbidden_topics") or []
    forbidden_text = ", ".join(str(item) for item in forbidden) if forbidden else "なし"
    return (
        "## 回答契約\n"
        f"- 期待する答え: {contract.get('expected_answer')}\n"
        f"- 最低限の具体性: {contract.get('min_specificity')}\n"
        f"- 禁止論点: {forbidden_text}\n"
        f"- 許容文数: {contract.get('allow_sentence_count')}文まで\n"
        f"- 質問レベル: {wording_level}"
    )
