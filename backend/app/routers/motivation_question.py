"""Question planning and response assembly helpers for motivation router."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.utils.llm import call_llm_with_error, consume_request_llm_cost_summary
from app.utils.llm_prompt_safety import sanitize_prompt_input
from app.prompts.motivation_prompts import (
    MOTIVATION_DEEPDIVE_QUESTION_PROMPT,
    MOTIVATION_QUESTION_PROMPT,
)
from app.routers.motivation_context import (
    CONVERSATION_MODE_DEEPDIVE,
    REQUIRED_MOTIVATION_STAGES,
    SLOT_FILL_INTENTS,
    STAGE_CONFIRMED_FACT_KEYS,
    STAGE_LABELS,
    _coerce_risk_flags,
    _coerce_stage_list,
    _legacy_slot_state,
    _normalize_conversation_context,
    _normalize_slot_state,
    _normalize_slot_status_v2,
    _normalize_weak_slot_retries,
)
from app.routers.motivation_models import DeepDiveGap, MotivationScores, NextQuestionRequest, NextQuestionResponse
from app.routers.motivation_planner import _slot_label
from app.routers.motivation_retry import (
    _build_question_retry_hint as _retry_build_question_retry_hint,
    _classify_question_failure_code as _retry_classify_question_failure_code,
)
from app.routers.motivation_validation import (
    _build_reask_instruction_section,
    _ensure_distinct_question,
    _normalize_question_focus,
    _preferred_question_focus_for_turn,
    _question_signature,
    _rotate_question_focus_for_reask,
    _semantic_question_signature,
)
from app.routers.motivation_company import (
    STAGE_ORDER,
    _build_evidence_cards_from_sources,
    _build_evidence_summary_from_sources,
    _build_stage_status,
    _extract_gakuchika_episode,
)
from app.routers.motivation_prompt_fmt import (
    _build_question_messages,
    _build_question_user_message,
    _format_answer_contract_for_prompt,
    _format_application_jobs_for_prompt,
    _format_conversation_context_for_prompt,
    _format_evidence_cards_for_prompt,
    _format_gakuchika_for_prompt,
    _format_profile_for_prompt,
    _format_recent_conversation_for_prompt,
    _extract_gakuchika_strength,
)

if TYPE_CHECKING:
    from app.routers.motivation_pipeline import _MotivationQuestionPrep


QUESTION_DIFFICULTY_MAX = 3

WEAKNESS_TAG_TO_STAGE = {
    "company_reason_generic": "company_reason",
    "desired_work_too_abstract": "desired_work",
    "value_contribution_vague": "value_contribution",
    "differentiation_missing": "differentiation",
    "why_now_missing": "company_reason",
    "self_connection_weak": "self_connection",
}

QUESTION_WORDING_BY_STAGE: dict[str, tuple[str, ...]] = {
    "industry_reason": (
        "その業界を志望する理由として最も近いものを1つ教えてください。",
        "その業界に関心を持つようになったきっかけは何ですか？",
        "その業界を選ぶ理由は、関わりたい課題と働き方のどちらに近いですか？",
    ),
    "company_reason": (
        "{company_name}を志望する理由として最も近いものを1つ教えてください。",
        "{company_name}に惹かれる点は、事業の特徴・仕事の進め方・関われるテーマのどれに近いですか？",
        "{company_name}を選ぶ理由は、扱うテーマと働き方のどちらにより近いですか？",
    ),
    "self_connection": (
        "これまでの経験や価値観は、その仕事とどうつながりますか？",
        "過去の経験のうち、今の志望理由に一番つながるものは何ですか？",
        "その志望理由に近い原体験や価値観があれば、短く教えてください。",
    ),
    "desired_work": (
        "入社後に挑戦したい仕事を1つ教えてください。",
        "入社後に関わりたい相手やテーマは何に近いですか？",
        "まず挑戦したい仕事は、提案・企画・課題整理のどれに近いですか？",
    ),
    "value_contribution": (
        "入社後にどんな価値を出したいかを1文で教えてください。",
        "仕事を通じて相手にどう役立ちたいかを教えてください。",
        "価値発揮のイメージは、整理して前に進めることと提案して動かすことのどちらに近いですか？",
    ),
    "differentiation": (
        "他社ではなくこの企業を選びたい理由を1つ教えてください。",
        "比較したときに、この企業のほうが合うと感じる点は何ですか？",
        "最終的にこの企業を選ぶ理由は、仕事内容と働き方のどちらに近いですか？",
    ),
}

ANSWER_CONTRACTS: dict[str, dict[str, Any]] = {
    "industry_reason": {
        "expected_answer": "業界を志望する理由を1文で答える",
        "forbidden_topics": ["company_reason", "desired_work", "self_pr"],
        "min_specificity": "業界を選ぶ理由が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "company_reason": {
        "expected_answer": "その会社に惹かれる理由を1文で答える",
        "forbidden_topics": ["industry_general_only", "desired_work", "value_contribution_only"],
        "min_specificity": "企業固有性か企業を選ぶ軸が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "self_connection": {
        "expected_answer": "経験・価値観・強みのどれかが志望理由や仕事につながる形で答える",
        "forbidden_topics": ["company_reason_only", "desired_work_only"],
        "min_specificity": "自分の過去と志望の接点があること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "desired_work": {
        "expected_answer": "入社後に挑戦したい仕事を1文で答える",
        "forbidden_topics": ["growth_only", "value_contribution_only"],
        "min_specificity": "仕事像か相手像が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "value_contribution": {
        "expected_answer": "どう価値を出したいかを1文で答える",
        "forbidden_topics": ["desired_work_only", "growth_only"],
        "min_specificity": "相手や組織への価値発揮が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "differentiation": {
        "expected_answer": "他社ではなくその会社である理由を1文で答える",
        "forbidden_topics": ["company_reason_rephrase_only", "industry_general_only"],
        "min_specificity": "比較視点か選ぶ決め手が分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    },
    "deepdive_company_reason_strengthening": {
        "expected_answer": "企業理由と自分の経験・価値観をつないで補強する",
        "forbidden_topics": ["new_fact", "desired_work_only"],
        "min_specificity": "企業理由が自分の経験と因果でつながること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
    "deepdive_desired_work_clarity": {
        "expected_answer": "やりたい仕事の具体像を1〜2文で補強する",
        "forbidden_topics": ["growth_only", "company_reason_only"],
        "min_specificity": "相手・課題・仕事のいずれかが具体化されること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
    "deepdive_value_contribution_clarity": {
        "expected_answer": "価値発揮の仕方を1〜2文で補強する",
        "forbidden_topics": ["desired_work_only", "new_fact"],
        "min_specificity": "価値の出し方が分かること",
        "allow_sentence_count": 2,
        "must_be_direct_answer": True,
    },
}

MAX_STAGE_REASKS = 1


def _build_answer_contract(stage: str, *, weakness_tag: str | None = None) -> dict[str, Any]:
    if weakness_tag:
        key_map = {
            "company_reason_generic": "deepdive_company_reason_strengthening",
            "desired_work_too_abstract": "deepdive_desired_work_clarity",
            "value_contribution_vague": "deepdive_value_contribution_clarity",
        }
        key = key_map.get(weakness_tag)
        if key in ANSWER_CONTRACTS:
            return ANSWER_CONTRACTS[key].copy()
    return ANSWER_CONTRACTS.get(stage, {
        "expected_answer": "質問に直接答える",
        "forbidden_topics": [],
        "min_specificity": "質問への答えが分かること",
        "allow_sentence_count": 1,
        "must_be_direct_answer": True,
    }).copy()


def _allow_sentence_count_for_stage(stage: str, *, weakness_tag: str | None = None) -> int:
    contract = _build_answer_contract(stage, weakness_tag=weakness_tag)
    try:
        return max(int(contract.get("allow_sentence_count") or 1), 1)
    except (TypeError, ValueError):
        return 1


def _question_difficulty_level(stage_attempt_count: int) -> int:
    return min(max(int(stage_attempt_count or 0) + 1, 1), QUESTION_DIFFICULTY_MAX)


def _wording_level_question(stage: str, level: int, *, company_name: str | None = None) -> str | None:
    templates = QUESTION_WORDING_BY_STAGE.get(stage)
    if not templates:
        return None
    index = min(max(level, 1), len(templates)) - 1
    template = templates[index]
    if "{company_name}" in template:
        return template.format(company_name=company_name or "この企業")
    return template


def _repair_generated_question_for_response(
    *,
    question: str,
    stage: str,
    company_name: str,
    company_context: str,
    company_sources: list[dict] | None,
    gakuchika_context: list[dict] | None,
    profile_context: dict[str, Any] | None,
    application_job_candidates: list[str] | None,
    company_role_candidates: list[str] | None,
    company_work_candidates: list[str] | None,
    conversation_context: dict[str, Any] | None,
    validation_report: dict | None = None,
) -> str:
    from app.routers.motivation_validation import _validate_or_repair_question

    context = _normalize_conversation_context(conversation_context)
    selected_role = context["selectedRole"] or (application_job_candidates or [None])[0]
    desired_work = context["desiredWork"]
    grounded_company_anchor = None
    return _validate_or_repair_question(
        question=question,
        stage=stage,
        company_name=company_name,
        selected_industry=context["selectedIndustry"],
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=grounded_company_anchor,
        gakuchika_episode=_extract_gakuchika_episode(gakuchika_context),
        gakuchika_strength=_extract_gakuchika_strength(gakuchika_context),
        confirmed_facts=context.get("confirmedFacts"),
        validation_report=validation_report,
    )


def _get_next_stage(
    conversation_context: dict[str, Any] | None,
    *,
    missing_slots: list[str] | None = None,
    slot_status_v2: dict[str, str] | None = None,
    ready_for_draft: bool = False,
    weakest_element: str | None = None,
    is_complete: bool | None = None,
) -> str:
    if is_complete is True:
        ready_for_draft = True
    context = _normalize_conversation_context(conversation_context)
    confirmed_facts = context["confirmedFacts"]
    slot_states = _normalize_slot_status_v2(slot_status_v2)
    weak_slot_retries = _normalize_weak_slot_retries(context.get("weakSlotRetries"))
    closed_slots = set(_coerce_stage_list(context.get("closedSlots"), max_items=8))
    recently_closed_slots = set(_coerce_stage_list(context.get("recentlyClosedSlots"), max_items=4))
    current_stage = context.get("questionStage") or "industry_reason"
    stage_attempt_count = context.get("stageAttemptCount") or 0

    if slot_status_v2:
        current_state = slot_states.get(current_stage, "missing")
        if current_state == "filled_strong":
            closed_slots.add(current_stage)
        if current_state == "filled_weak" and weak_slot_retries.get(current_stage, 0) >= MAX_STAGE_REASKS:
            closed_slots.add(current_stage)

    current_key = STAGE_CONFIRMED_FACT_KEYS.get(current_stage)
    if (
        current_key
        and not confirmed_facts[current_key]
        and current_stage not in closed_slots
        and (not slot_status_v2 or slot_states.get(current_stage) in {"missing", "partial"})
    ):
        if stage_attempt_count < MAX_STAGE_REASKS:
            return current_stage
        if current_stage in REQUIRED_MOTIVATION_STAGES:
            current_index = REQUIRED_MOTIVATION_STAGES.index(current_stage)
            for next_stage in REQUIRED_MOTIVATION_STAGES[current_index + 1:]:
                next_key = STAGE_CONFIRMED_FACT_KEYS[next_stage]
                if not confirmed_facts[next_key]:
                    return next_stage

    if ready_for_draft:
        return current_stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        if slot_states.get(stage) == "missing" and stage not in closed_slots:
            return stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        if slot_states.get(stage) == "partial" and stage not in closed_slots:
            return stage

    for stage in REQUIRED_MOTIVATION_STAGES:
        if (
            slot_states.get(stage) == "filled_weak"
            and weak_slot_retries.get(stage, 0) < MAX_STAGE_REASKS
            and stage not in closed_slots
            and stage not in recently_closed_slots
        ):
            return stage

    slot_priority = [slot for slot in REQUIRED_MOTIVATION_STAGES if slot in (missing_slots or [])]
    if slot_priority:
        return slot_priority[0]

    for stage in REQUIRED_MOTIVATION_STAGES:
        fact_key = STAGE_CONFIRMED_FACT_KEYS[stage]
        if not confirmed_facts[fact_key]:
            return stage

    return current_stage


def _slot_to_legacy_element(slot: str) -> str:
    mapping = {
        "industry_reason": "company_understanding",
        "company_reason": "company_understanding",
        "self_connection": "self_analysis",
        "desired_work": "career_vision",
        "value_contribution": "career_vision",
        "differentiation": "differentiation",
    }
    return mapping.get(slot, "company_understanding")


def _slot_status_to_scores(slot_status: dict[str, str]) -> MotivationScores:
    score_map = {"missing": 20, "partial": 55, "filled": 82}
    company_score = min(
        score_map.get(slot_status.get("industry_reason", "missing"), 20),
        score_map.get(slot_status.get("company_reason", "missing"), 20),
    )
    self_score = score_map.get(slot_status.get("self_connection", "missing"), 20)
    career_score = min(
        score_map.get(slot_status.get("desired_work", "missing"), 20),
        score_map.get(slot_status.get("value_contribution", "missing"), 20),
    )
    differentiation_score = score_map.get(slot_status.get("differentiation", "missing"), 20)
    return MotivationScores(
        company_understanding=company_score,
        self_analysis=self_score,
        career_vision=career_score,
        differentiation=differentiation_score,
    )


def _self_connection_has_causal_link(
    text: str | None,
    *,
    company_reason: str | None,
    desired_work: str | None,
) -> bool:
    normalized = " ".join((text or "").split()).strip()
    if len(normalized) < 18:
        return False
    has_anchor = any(token in normalized for token in ("経験", "価値観", "強み", "原体験", "培", "学ん"))
    has_link = any(token in normalized for token in ("つなが", "活か", "生か", "だからこそ", "結び", "土台", "につなが"))
    if not (has_anchor and has_link):
        return False
    if company_reason and any(token in normalized for token in ("企業", "御社", "貴社", "志望")):
        return True
    if desired_work and any(token in normalized for token in ("仕事", "入社後", "役割", "提案", "企画", "課題")):
        return True
    return True


def _slot_meets_draft_minimum(state: str | None) -> bool:
    return _normalize_slot_state(state or "") in {"filled_strong", "filled_weak"}


def _compute_draft_gate(
    *,
    slot_status_v2: dict[str, str],
    conversation_context: dict[str, Any] | None,
) -> tuple[bool, list[str]]:
    context = _normalize_conversation_context(conversation_context)
    blockers: list[str] = []
    for stage in ("company_reason", "desired_work", "differentiation"):
        if not _slot_meets_draft_minimum(slot_status_v2.get(stage)):
            blockers.append(stage)
    self_connection_state = slot_status_v2.get("self_connection")
    self_connection_text = context.get("selfConnection")
    if self_connection_state not in {"filled_strong", "filled_weak"}:
        blockers.append("self_connection")
    elif self_connection_text and not _self_connection_has_causal_link(
        self_connection_text,
        company_reason=context.get("companyReason"),
        desired_work=context.get("desiredWork"),
    ):
        blockers.append("self_connection")
    return len(blockers) == 0, blockers


def _coerce_motivation_stage_for_ui(stage: str | None) -> str:
    raw = str(stage or "").strip() or "industry_reason"
    if raw == "closing":
        return "differentiation"
    return raw


def _build_adaptive_rag_query(
    scores: MotivationScores | None = None,
    conversation_text: str = "",
) -> str:
    conversation_text = conversation_text or ""
    if scores is None:
        base_query = "企業の特徴、事業内容、強み、社風、求める人物像"
        if any(keyword in conversation_text for keyword in ["競合", "他社", "比較"]):
            return base_query + "、競合との差別化、独自性"
        return base_query

    weak_threshold = 50
    query_parts: list[str] = []
    if scores.company_understanding < weak_threshold:
        query_parts.append("企業の事業内容、製品、サービス、業界での位置づけ")
    if scores.self_analysis < weak_threshold:
        query_parts.append("求める人物像、必要なスキル、企業文化、働き方")
    if scores.career_vision < weak_threshold:
        query_parts.append("キャリアパス、成長機会、研修制度、配属")
    if scores.differentiation < weak_threshold:
        query_parts.append("競合との差別化、独自の強み、特徴的な取り組み")
    if any(keyword in conversation_text for keyword in ["なぜ今", "今だから", "原体験", "きっかけ"]):
        query_parts.append("採用方針、注力事業、最近の取り組み、今後の方向性")
    if any(keyword in conversation_text for keyword in ["社風", "価値観", "文化", "カルチャー"]):
        query_parts.append("企業理念、価値観、働き方、行動指針")

    if not query_parts:
        return "企業の特徴、事業内容、強み、社風、求める人物像"
    return "、".join(query_parts)


def _role_hint_for_rag(
    conversation_context: dict[str, Any],
    application_job_candidates: list[str] | None,
) -> str | None:
    role = conversation_context.get("selectedRole")
    if isinstance(role, str) and role.strip():
        return role.strip()
    aj = application_job_candidates or []
    if aj and isinstance(aj[0], str) and aj[0].strip():
        return aj[0].strip()
    return None


def _augment_rag_query_with_role(base_query: str, role_hint: str | None) -> str:
    q = (base_query or "").strip()
    if not role_hint:
        return q
    compact = " ".join(role_hint.split())
    if len(compact) > 50:
        compact = compact[:50] + "…"
    tail = f"{compact}に関する仕事内容・役割・求める人物像"
    if tail in q or compact in q:
        return q
    return f"{q}、{tail}" if q else tail


def _format_selected_role_line_for_prompt(
    conversation_context: dict[str, Any],
    application_job_candidates: list[str] | None,
) -> str:
    role = _role_hint_for_rag(conversation_context, application_job_candidates)
    if role:
        return f"志望職種（確定）: {sanitize_prompt_input(role, max_length=80)}"
    return "志望職種（確定）: 会話コンテキストの「志望職種」を必ず参照すること"


def _build_element_guidance_for_question_prompt(
    stage: str,
    weakest_element_jp: str,
    missing_aspects_text: str,
) -> str:
    stage = "self_connection" if stage in {"origin_experience", "fit_connection"} else stage
    late_stages = frozenset({"self_connection", "value_contribution", "differentiation", "closing"})
    if stage in late_stages:
        ma = missing_aspects_text or "（特になし）"
        return (
            "## 評価に基づく補助指針（※当該質問段階の論点を崩さない範囲でだけ参照）\n"
            f"- 相対的に弱い要素: **{weakest_element_jp}**\n"
            f"- 不足しがちな観点: {ma}\n"
            "上記に引きずって段階外の質問にしないこと。"
        )
    return (
        "## 評価に基づく補助指針\n"
        "- いまは **質問段階の論点だけ** を扱う。4要素スコアや「最も弱い要素」の深掘り指示は **このターンでは参照しない**（後続の self_connection / value_contribution / differentiation で反映する）。\n"
        "- スコア欄は参考情報であり、段階を飛ばす理由にならない。"
    )


def _build_motivation_question_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    wording_level = _question_difficulty_level(int(prep.conversation_context.get("stageAttemptCount") or 0))
    selected_role_line = _format_selected_role_line_for_prompt(
        prep.conversation_context,
        request.application_job_candidates,
    )
    safe_company_name = sanitize_prompt_input(request.company_name, max_length=200)
    gakuchika_section = _format_gakuchika_for_prompt(request.gakuchika_context)
    profile_section = _format_profile_for_prompt(request.profile_context)
    application_job_section = _format_application_jobs_for_prompt(request.application_job_candidates)
    conversation_context_section = _format_conversation_context_for_prompt(prep.conversation_context)
    conversation_history_section = _format_recent_conversation_for_prompt(request.conversation_history)
    slot_status = prep.eval_result.get("slot_status_v2") or prep.eval_result.get("slot_status") or {}
    slot_status_section = "\n".join(
        f"- {slot}: {slot_status.get(slot, 'missing')}"
        for slot in (
            "industry_reason",
            "company_reason",
            "self_connection",
            "desired_work",
            "value_contribution",
            "differentiation",
        )
    )
    missing_slots_section = ", ".join(prep.missing_slots) if prep.missing_slots else "（不足要素なし）"
    last_question_meta = prep.conversation_context.get("lastQuestionMeta") or {}
    last_question = str(last_question_meta.get("questionText") or "").strip() or "（なし）"
    last_question_target_slot = str(last_question_meta.get("question_stage") or "").strip() or "（なし）"
    recent_question_summaries = []
    for message in request.conversation_history[-4:]:
        if message.role == "assistant" and message.content.strip():
            recent_question_summaries.append(message.content[:36].strip())
    recent_question_summaries_text = ", ".join(recent_question_summaries) if recent_question_summaries else "（なし）"
    prompt = MOTIVATION_QUESTION_PROMPT.format(
        company_name=safe_company_name,
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        selected_role_line=selected_role_line,
        company_context=prep.company_context or "（企業情報なし）",
        gakuchika_section=gakuchika_section,
        profile_section=profile_section,
        application_job_section=application_job_section,
        conversation_context=conversation_context_section,
        conversation_history=conversation_history_section,
        slot_status_section=slot_status_section,
        missing_slots_section=missing_slots_section,
        draft_readiness_reason=str(prep.eval_result.get("draft_readiness_reason") or "（理由なし）"),
        last_question=last_question,
        last_question_target_slot=last_question_target_slot,
        recent_question_summaries=recent_question_summaries_text,
    )
    evidence_cards_for_prompt = [
        card.model_dump()
        for card in _build_evidence_cards_from_sources(prep.company_sources, max_items=3)
    ]
    evidence_cards_section = _format_evidence_cards_for_prompt(
        evidence_cards_for_prompt,
        max_items=3,
    )
    base_prompt = (
        f"{prompt}\n\n"
        "## このターンで固定されていること\n"
        f"- 対象 slot: {prep.current_slot or prep.stage}\n"
        f"- 質問 intent: {prep.current_intent or SLOT_FILL_INTENTS.get(prep.stage, 'initial_capture')}\n"
        f"- 次に進む条件: {prep.next_advance_condition or '今回の論点について要旨が1つ出れば次へ進みます。'}\n"
        "- このターンでは対象 slot 以外の論点を聞かない\n"
        "- すでに locked の slot は再質問しない\n"
        "- 選択肢の生成には触れない\n\n"
        f"{_format_answer_contract_for_prompt(stage=prep.stage, wording_level=wording_level)}\n"
        "## 追加制約\n"
        f"- 再質問禁止 slot: {', '.join(prep.eval_result.get('do_not_ask_slots') or []) or 'なし'}\n"
        "- 同じ wording を再利用せず、質問レベルに応じて聞き方を変える\n"
        "- 旧仕様のキーは出力しない"
    )
    if evidence_cards_section:
        return f"{base_prompt}\n\n{evidence_cards_section}"
    return base_prompt


def _build_motivation_deepdive_system_prompt(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
) -> str:
    weakness_tag = _infer_weakness_tag_from_eval(prep.eval_result)
    selected_role_line = _format_selected_role_line_for_prompt(
        prep.conversation_context,
        request.application_job_candidates,
    )
    draft_text = prep.generated_draft or "（志望動機 ES は未生成です）"
    last_question_meta = prep.conversation_context.get("lastQuestionMeta") or {}
    last_question = str(last_question_meta.get("questionText") or "").strip() or "（なし）"
    recent_question_summaries = []
    for message in request.conversation_history[-4:]:
        if message.role == "assistant" and message.content.strip():
            recent_question_summaries.append(message.content[:36].strip())
    recent_question_summaries_text = ", ".join(recent_question_summaries) if recent_question_summaries else "（なし）"
    prompt = MOTIVATION_DEEPDIVE_QUESTION_PROMPT.format(
        company_name=sanitize_prompt_input(request.company_name, max_length=200),
        industry=sanitize_prompt_input(prep.industry or "不明", max_length=100),
        selected_role_line=selected_role_line,
        draft_text=draft_text,
        company_context=prep.company_context or "（企業情報なし）",
        conversation_history=_format_recent_conversation_for_prompt(request.conversation_history, max_messages=8),
        last_question=last_question,
        recent_question_summaries=recent_question_summaries_text,
    )
    return (
        f"{prompt}\n\n"
        "## deepdive 制約\n"
        f"- 今回の weak tag: {weakness_tag}\n"
        f"- 補強対象 slot: {prep.current_slot or prep.stage}\n"
        f"- 質問 intent: {prep.current_intent or 'specificity_check'}\n"
        f"- 次に進む条件: {prep.next_advance_condition or '弱い部分が1つ補えれば十分です。'}\n"
        "- 1弱点につき1質問だけ作る\n"
        "- 通常の slot 補完ではなく、既出内容を前提にした補強質問にする\n"
        "- 新しい論点や新事実を増やさない\n"
        "- 選択肢の生成には触れない"
    )


def _deepdive_area_to_stage(target_area: str | None) -> str:
    gap = DeepDiveGap.from_target_area(target_area)
    if gap is None:
        return DeepDiveGap.DIFFERENTIATION.to_stage()
    return gap.to_stage()


def _deepdive_area_to_weakness_tag(target_area: str | None) -> str:
    gap = DeepDiveGap.from_target_area(target_area)
    if gap is None:
        return DeepDiveGap.COMPANY_REASON.to_weakness_tag()
    return gap.to_weakness_tag()


def _infer_weakness_tag_from_eval(eval_result: dict[str, Any] | None) -> str:
    data = eval_result or {}
    blockers = list(data.get("draft_blockers") or [])
    for stage_name in ("company_reason", "desired_work", "value_contribution", "differentiation", "self_connection"):
        if stage_name in blockers:
            gap = DeepDiveGap.from_stage(stage_name)
            if gap is not None:
                return gap.to_weakness_tag()
    return DeepDiveGap.COMPANY_REASON.to_weakness_tag()


def _should_use_deepdive_mode(prep: _MotivationQuestionPrep) -> bool:
    return prep.was_draft_ready and prep.has_generated_draft


def _classify_draft_ready_source(
    *,
    eval_ready: bool,
    planner_unlock: bool,
    unlock_reason: str | None,
) -> str:
    if eval_ready and planner_unlock:
        return "both_agree"
    if planner_unlock and not eval_ready:
        return f"planner_only:{unlock_reason or 'unknown'}"
    if eval_ready and not planner_unlock:
        return "eval_only"
    return "neither"


def _build_draft_ready_telemetry(
    prep: _MotivationQuestionPrep,
    base: dict[str, Any] | None,
) -> dict[str, Any] | None:
    eval_ready = bool(prep.eval_result.get("ready_for_draft"))
    planner_unlock = bool(prep.is_complete)
    telemetry = dict(base) if base else {}
    telemetry["draft_ready_eval"] = eval_ready
    telemetry["draft_ready_planner"] = planner_unlock
    telemetry["draft_ready_source"] = _classify_draft_ready_source(
        eval_ready=eval_ready,
        planner_unlock=planner_unlock,
        unlock_reason=prep.unlock_reason,
    )
    telemetry["planner_unlock_reason"] = prep.unlock_reason
    slot_confidences = prep.eval_result.get("slot_confidences")
    if isinstance(slot_confidences, dict) and slot_confidences:
        telemetry["evaluation_slot_confidences"] = slot_confidences
    return telemetry


def _build_draft_ready_response(prep: _MotivationQuestionPrep) -> NextQuestionResponse:
    stage_status = _build_stage_status(prep.conversation_context, prep.stage)
    return NextQuestionResponse(
        question="",
        should_continue=True,
        suggested_end=True,
        draft_ready=True,
        evaluation=prep.eval_result,
        target_slot=None,
        question_intent=None,
        evidence_summary=_build_evidence_summary_from_sources(prep.company_sources, focus="参考企業情報"),
        evidence_cards=_build_evidence_cards_from_sources(prep.company_sources),
        question_stage=prep.stage,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus="ES作成可能",
        risk_flags=_coerce_risk_flags(prep.eval_result.get("risk_flags"), max_items=2),
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        premise_mode="confirmed_only",
        conversation_mode=prep.conversation_mode,
        current_slot=prep.current_slot,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
    )


def _resolve_call_llm_with_error():
    try:
        from app.routers import motivation as motivation_router

        return getattr(motivation_router, "call_llm_with_error", call_llm_with_error)
    except Exception:  # noqa: BLE001
        return call_llm_with_error


async def _retry_question_generation_if_needed(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
    stage: str,
    validation_report: dict[str, Any],
    validated_question: str,
    selected_role: str | None,
    desired_work: str | None,
    company_anchor: str | None,
    raw_data: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    failure_code = _retry_classify_question_failure_code(validation_report)
    if not failure_code:
        return validated_question, validation_report
    hint = _retry_build_question_retry_hint(
        failure_code,
        stage=stage,
        company_name=request.company_name,
    )
    if not hint:
        return validated_question, validation_report

    prompt = (
        _build_motivation_deepdive_system_prompt(request=request, prep=prep)
        if _should_use_deepdive_mode(prep)
        else _build_motivation_question_system_prompt(request=request, prep=prep)
    )
    retry_prompt = prompt + "\n\n## 質問再生成指示\n- " + hint
    llm_call = _resolve_call_llm_with_error()
    retry_result = await llm_call(
        system_prompt=retry_prompt,
        user_message=_build_question_user_message(request.conversation_history),
        messages=_build_question_messages(request.conversation_history),
        max_tokens=700,
        temperature=0.4,
        feature="motivation",
        retry_on_parse=True,
        disable_fallback=True,
    )
    validation_report["focused_retry_attempted"] = True
    validation_report["focused_retry_failure_code"] = failure_code
    if not retry_result.success or retry_result.data is None:
        return validated_question, validation_report

    retry_data = retry_result.data
    retry_question = str(retry_data.get("question", "")).strip()
    if not retry_question:
        return validated_question, validation_report

    retry_report: dict[str, Any] = {}
    retried_question = _repair_generated_question_for_response(
        question=retry_question,
        stage=stage,
        company_name=request.company_name,
        company_context=prep.company_context,
        company_sources=prep.company_sources,
        gakuchika_context=request.gakuchika_context,
        profile_context=request.profile_context,
        application_job_candidates=request.application_job_candidates,
        company_role_candidates=prep.role_candidates,
        company_work_candidates=prep.work_candidates,
        conversation_context=prep.conversation_context,
        validation_report=retry_report,
    )
    retried_question = await _ensure_distinct_question(
        question=retried_question,
        stage=stage,
        conversation_history=request.conversation_history,
        company_name=request.company_name,
        selected_industry=prep.conversation_context["selectedIndustry"],
        selected_role=selected_role,
        desired_work=desired_work,
        grounded_company_anchor=company_anchor,
        gakuchika_episode=_extract_gakuchika_episode(request.gakuchika_context),
        gakuchika_strength=_extract_gakuchika_strength(request.gakuchika_context),
        semantic_signature=None,
        confirmed_facts=prep.conversation_context.get("confirmedFacts"),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
        validation_report=retry_report,
    )
    if retry_report.get("fallback_used"):
        return validated_question, validation_report

    merged_report = dict(validation_report)
    merged_report["fallback_used"] = False
    merged_report["fallback_reason"] = None
    merged_report["focused_retry_succeeded"] = True
    raw_data.update(retry_data)
    return retried_question, merged_report


async def _assemble_regular_next_question_response(
    *,
    request: NextQuestionRequest,
    prep: _MotivationQuestionPrep,
    data: dict[str, Any],
) -> NextQuestionResponse:
    stage = _coerce_motivation_stage_for_ui(prep.current_slot or prep.stage)
    weakness_tag = _deepdive_area_to_weakness_tag(data.get("target_area")) if _should_use_deepdive_mode(prep) else None
    wording_level = _question_difficulty_level(int(prep.conversation_context.get("stageAttemptCount") or 0))
    company_anchor = prep.company_features[0] if prep.company_features else None
    role_anchor = prep.conversation_context.get("selectedRole")
    precomputed_semantic_signature = _semantic_question_signature(
        stage=stage,
        question_intent=str(data.get("question_intent") or prep.current_intent or STAGE_LABELS.get(stage, stage)),
        company_anchor=company_anchor,
        role_anchor=role_anchor,
        evidence_basis=str(data.get("question_focus") or ""),
        wording_level=wording_level,
    )
    validation_report: dict[str, Any] = {}
    validated_question = _repair_generated_question_for_response(
        question=str(data["question"]),
        stage=stage,
        company_name=request.company_name,
        company_context=prep.company_context,
        company_sources=prep.company_sources,
        gakuchika_context=request.gakuchika_context,
        profile_context=request.profile_context,
        application_job_candidates=request.application_job_candidates,
        company_role_candidates=prep.role_candidates,
        company_work_candidates=prep.work_candidates,
        conversation_context=prep.conversation_context,
        validation_report=validation_report,
    )
    validated_question = await _ensure_distinct_question(
        question=validated_question,
        stage=stage,
        conversation_history=request.conversation_history,
        company_name=request.company_name,
        selected_industry=prep.conversation_context["selectedIndustry"],
        selected_role=prep.conversation_context["selectedRole"] or (request.application_job_candidates or [None])[0],
        desired_work=prep.conversation_context["desiredWork"] or (prep.work_candidates[0] if prep.work_candidates else None),
        grounded_company_anchor=prep.company_features[0] if prep.company_features else (prep.work_candidates[0] if prep.work_candidates else None),
        gakuchika_episode=_extract_gakuchika_episode(request.gakuchika_context),
        gakuchika_strength=_extract_gakuchika_strength(request.gakuchika_context),
        semantic_signature=precomputed_semantic_signature,
        confirmed_facts=prep.conversation_context.get("confirmedFacts"),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
        validation_report=validation_report,
    )
    validated_question, validation_report = await _retry_question_generation_if_needed(
        request=request,
        prep=prep,
        stage=stage,
        validation_report=validation_report,
        validated_question=validated_question,
        selected_role=prep.conversation_context["selectedRole"] or (request.application_job_candidates or [None])[0],
        desired_work=prep.conversation_context["desiredWork"] or (prep.work_candidates[0] if prep.work_candidates else None),
        company_anchor=prep.company_features[0] if prep.company_features else (prep.work_candidates[0] if prep.work_candidates else None),
        raw_data=data,
    )
    question_focus = _rotate_question_focus_for_reask(
        stage=stage,
        question_focus=_normalize_question_focus(stage, data.get("question_focus"), validated_question),
        conversation_context=prep.conversation_context,
    )
    preferred_focus = _preferred_question_focus_for_turn(
        stage,
        stage_attempt_count=int(prep.conversation_context.get("stageAttemptCount") or 0),
        last_question_meta=prep.conversation_context.get("lastQuestionMeta"),
    )
    previous_focus = ""
    if isinstance(prep.conversation_context.get("lastQuestionMeta"), dict):
        previous_focus = str(prep.conversation_context["lastQuestionMeta"].get("question_focus") or "").strip()
    if preferred_focus and question_focus == previous_focus:
        question_focus = preferred_focus
    evidence_summary = data.get("evidence_summary") or _build_evidence_summary_from_sources(
        prep.company_sources, focus="質問の根拠"
    )
    evidence_cards = _build_evidence_cards_from_sources(prep.company_sources)
    semantic_signature = _semantic_question_signature(
        stage=stage,
        question_intent=str(data.get("question_intent") or prep.current_intent or STAGE_LABELS.get(stage, stage)),
        company_anchor=company_anchor,
        role_anchor=role_anchor,
        evidence_basis=question_focus,
        wording_level=wording_level,
    )
    prep.conversation_context["questionStage"] = stage
    prep.conversation_context["conversationMode"] = prep.conversation_mode
    prep.conversation_context["currentIntent"] = prep.current_intent
    prep.conversation_context["nextAdvanceCondition"] = prep.next_advance_condition
    prep.conversation_context["causalGaps"] = prep.causal_gaps
    prep.conversation_context["lastQuestionSignature"] = _question_signature(validated_question)
    prep.conversation_context["lastQuestionSemanticSignature"] = semantic_signature
    prep.conversation_context["lastQuestionMeta"] = {
        "question_signature": _question_signature(validated_question),
        "semantic_question_signature": semantic_signature,
        "question_stage": stage,
        "question_focus": question_focus,
        "stage_attempt_count": prep.conversation_context.get("stageAttemptCount") or 0,
        "question_difficulty_level": wording_level,
        "premise_mode": "confirmed_only",
    }
    stage_status = _build_stage_status(prep.conversation_context, stage)
    risk_flags = _coerce_risk_flags(data.get("risk_flags"), max_items=2) or _coerce_risk_flags(
        prep.eval_result.get("risk_flags"), max_items=2
    )

    return NextQuestionResponse(
        question=validated_question,
        reasoning=data.get("reasoning"),
        should_continue=data.get("should_continue", True),
        suggested_end=bool(data.get("suggested_end", False) or prep.is_complete),
        draft_ready=bool(prep.conversation_context.get("draftReady")),
        evaluation=prep.eval_result,
        target_slot=stage,
        question_intent=prep.current_intent or data.get("question_intent") or STAGE_LABELS.get(stage, stage),
        answer_contract=_build_answer_contract(stage, weakness_tag=weakness_tag),
        target_element=data.get("target_element", prep.weakest_element),
        company_insight=data.get("company_insight"),
        evidence_summary=evidence_summary,
        evidence_cards=evidence_cards,
        question_stage=stage,
        question_focus=question_focus,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus=str(data.get("coaching_focus") or _slot_label(stage)),
        risk_flags=risk_flags,
        question_signature=_question_signature(validated_question),
        semantic_question_signature=semantic_signature,
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        question_difficulty_level=wording_level,
        candidate_validation_summary={
            "total_candidates": 0,
            "deepdive_mode": _should_use_deepdive_mode(prep),
            "fallback_used": bool(validation_report.get("fallback_used", False)),
            "fallback_reason": validation_report.get("fallback_reason"),
            "focused_retry_attempted": bool(validation_report.get("focused_retry_attempted", False)),
            "focused_retry_failure_code": validation_report.get("focused_retry_failure_code"),
        },
        weakness_tag=weakness_tag,
        premise_mode="confirmed_only",
        conversation_mode=prep.conversation_mode,
        current_slot=stage,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
    )


def _build_draft_ready_unlock_response(
    *,
    prep: _MotivationQuestionPrep,
) -> NextQuestionResponse:
    stage_status = _build_stage_status(prep.conversation_context, prep.stage)
    return NextQuestionResponse(
        question="",
        reasoning="志望動機ESの骨格が揃ったため、追加質問を出さずに下書き作成へ進めます。",
        should_continue=True,
        suggested_end=True,
        draft_ready=True,
        evaluation=prep.eval_result,
        target_element=None,
        company_insight=None,
        evidence_summary=_build_evidence_summary_from_sources(prep.company_sources, focus="参考情報"),
        evidence_cards=_build_evidence_cards_from_sources(prep.company_sources),
        question_stage=prep.stage,
        question_focus=None,
        stage_status=stage_status,
        captured_context=prep.conversation_context,
        coaching_focus="ES作成可能",
        risk_flags=_coerce_risk_flags(prep.eval_result.get("risk_flags"), max_items=2),
        question_signature=None,
        stage_attempt_count=prep.conversation_context.get("stageAttemptCount") or 0,
        premise_mode="confirmed_only",
        conversation_mode=prep.conversation_mode,
        current_slot=prep.current_slot,
        current_intent=prep.current_intent,
        next_advance_condition=prep.next_advance_condition,
        progress=prep.progress,
        causal_gaps=prep.causal_gaps,
        internal_telemetry=_build_draft_ready_telemetry(
            prep, consume_request_llm_cost_summary("motivation")
        ),
    )
