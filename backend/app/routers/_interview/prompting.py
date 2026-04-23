"""Prompt-builder helpers for the interview router.

Each ``_build_*_prompt`` combines a fallback template from ``contracts`` with
the per-format ``behavioral_block`` to produce the final LLM system prompt.
"""

from __future__ import annotations

import json
from typing import Any

from app.prompts.interview_prompts import ANSWER_GAP_DESCRIPTIONS, build_behavioral_block
from app.routers._interview.contracts import (
    RECENT_QUESTION_SUMMARIES_WINDOW,
    _CONTINUE_FALLBACK,
    _DRILL_SCORE_FALLBACK,
    _DRILL_START_FALLBACK,
    _FEEDBACK_FALLBACK,
    _OPENING_FALLBACK,
    _PLAN_FALLBACK,
    _TURN_FALLBACK,
    InterviewBaseRequest,
    InterviewContinueRequest,
    InterviewDrillScoreRequest,
    InterviewDrillStartRequest,
    InterviewFeedbackRequest,
    InterviewTurnRequest,
)
from app.routers._interview.setup import (
    _build_setup,
    _format_conversation,
    _trim_conversation_history,
)

# ---------------------------------------------------------------------------
# Render helpers (compact summaries of complex nested state)
# ---------------------------------------------------------------------------


def _summarize_latest_feedback(latest_feedback: dict[str, Any] | None) -> str:
    """latest_feedback 全体の JSON dump の代わりに、continue で必要な 4 要素だけ抽出する。

    Phase 2 Stage 1-5: `_build_continue_prompt` で使われるヘルパ。
    Continue フェーズで LLM が参照するのは以下 4 要素のみ:
      - overall_comment: 総評 (次の論点選択の前提)
      - weakest_question_snapshot: 最弱設問 (優先深掘り対象)
      - improved_answer: 模範回答 (応募者との比較基準)
      - improvements[:3]: 改善点 top 3 (深掘り候補)

    full JSON dump と比べ 40-60% のトークン削減を図る。
    """
    fb = latest_feedback or {}
    if not isinstance(fb, dict):
        fb = {}
    overall = str(fb.get("overall_comment") or "").strip() or "(なし)"
    weakest = str(fb.get("weakest_question_snapshot") or "").strip() or "(なし)"
    improved = str(fb.get("improved_answer") or "").strip() or "(なし)"
    improvements_raw = fb.get("improvements") or []
    improvements_items: list[str] = []
    if isinstance(improvements_raw, list):
        for item in improvements_raw[:3]:
            s = str(item).strip()
            if s:
                improvements_items.append(s)
    improvements_joined = " / ".join(improvements_items) if improvements_items else "(なし)"
    return (
        f"- 総評: {overall}\n"
        f"- 最弱設問: {weakest}\n"
        f"- 模範回答: {improved}\n"
        f"- 改善点 (top 3): {improvements_joined}"
    )


def _render_coverage_state(coverage_state: list[Any] | None) -> str:
    """coverage_state を JSON dump から 1 行/エントリの可読形式に変換する。

    Phase 2 Stage 1: JSON dump は 1 エントリあたり 70-100 tokens、
    圧縮形式は 20-30 tokens。
    欠落 checklist のみ抽出することで LLM が次の深掘り候補を判断しやすくなる。
    """
    if not coverage_state:
        return "(なし)"
    lines: list[str] = []
    for entry in coverage_state:
        if not isinstance(entry, dict):
            continue
        topic = str(entry.get("topic") or "?")
        status = str(entry.get("status") or "?")
        deepening = entry.get("deepeningCount") if "deepeningCount" in entry else entry.get("deepening_count")
        hint = str(entry.get("llmCoverageHint") or entry.get("llm_coverage_hint") or "?")
        required = entry.get("requiredChecklist") or entry.get("required_checklist") or []
        passed = entry.get("passedChecklistKeys") or entry.get("passed_checklist_keys") or []
        if isinstance(required, list) and isinstance(passed, list):
            missing = [k for k in required if k not in passed]
        else:
            missing = []
        lines.append(
            f"- {topic}: status={status}, deepening={deepening}, hint={hint}, missing={missing}"
        )
    if not lines:
        return "(なし)"
    return "\n".join(lines)


def _build_case_brief_section(
    interview_plan: dict[str, Any] | None,
    setup: dict[str, Any],
) -> str:
    """Phase 2 Stage 3: CASE BRIEF セクションを組み立てる。

    case format の plan に case_brief が詰まっている場合のみ出力する。
    それ以外は空文字列 (plan テンプレートの placeholder はそのまま消費されるが
    空行を残さないよう leading '\n' を含めない)。

    opening/turn プロンプトで同じ出力を使う。LLM はここで提示された題材を
    そのまま使うよう指示される (自由な題材生成は禁止)。

    Token 最適化: turn prompt budget (2500) と opening budget (2000) に収めるため、
    プロンプト側に流すのは再現性に必要な 3 要素に絞る:
      - 文脈 (business_context): 事業シナリオ
      - 問い (candidate_task): 応募者が答える中心的な問い
      - 深掘り候補 (case_followup_topics): 深掘りトピックのヒント
    KPI / 制約 / 狙い (target_metric / constraints / why_this_company) は
    plan.case_brief 本体に残し、LLM 参照はオプショナルにする (必要なら 1 行で join 可)。

    目標サイズ: 50-120 tokens (Japanese content + Unicode のため tiktoken では係数高め)。
    """
    if setup.get("interview_format") != "case":
        return ""
    case_brief = (interview_plan or {}).get("case_brief")
    if not isinstance(case_brief, dict):
        return ""

    def _j(value: Any) -> str:
        if isinstance(value, list):
            return " / ".join(str(v) for v in value if v)
        return str(value or "").strip()

    business_context = _j(case_brief.get("business_context"))
    candidate_task = _j(case_brief.get("candidate_task"))

    # case_followup_topics は plan.case_brief に残し、turn/opening prompt には出さない
    # (2500/2000 budget 内に収めるため)。LLM は INTERVIEW_FORMAT_INSTRUCTIONS["case"]
    # の「CASE BRIEF があればそれを最優先」指示 + 文脈 + 問い から再現性を確保する。
    lines = [
        "",  # 先頭改行で前ブロックと区切る
        "## CASE BRIEF",
        f"- 文脈: {business_context}",
        f"- 問い: {candidate_task}",
    ]
    return "\n".join(lines) + "\n"


def _render_recent_question_summaries(
    summaries: list[Any] | None,
    *,
    limit: int = RECENT_QUESTION_SUMMARIES_WINDOW,
) -> str:
    """recent_question_summaries_v2 を JSON ではなく 1 行ずつの可読形式に変換する。

    Phase 2 Stage 1-4: keyed 配列の JSON dump
    (`[{"intentKey":"...","normalizedSummary":"...",...}, ...]`) は tiktoken で 40-60%
    のオーバーヘッドがあるため、各 summary を
    `- turn-{turnId}: [{topic}/{followupStyle}] {normalizedSummary}` の 1 行に圧縮する。

    入力の recentQuestionSummariesV2 は既存の camelCase スキーマ
    (`intentKey`, `normalizedSummary`, `topic`, `followupStyle`, `turnId`) を想定する。
    空入力・不正エントリは "(履歴なし)" にフォールバックする。
    """
    if not summaries:
        return "(履歴なし)"
    # 末尾 N 件のみ (新しい順に出力)。slice は元の順序を保つため、reverse して表示する。
    tail = list(summaries)[-limit:]
    lines: list[str] = []
    # 新しい順 = リスト末尾が最新なので、末尾から辿る
    for entry in reversed(tail):
        if not isinstance(entry, dict):
            continue
        turn_id = str(entry.get("turnId") or entry.get("turn_id") or "?")
        topic = str(entry.get("topic") or "?")
        followup_style = str(entry.get("followupStyle") or entry.get("followup_style") or "?")
        summary = str(
            entry.get("normalizedSummary")
            or entry.get("normalized_summary")
            or entry.get("intentKey")
            or entry.get("intent_key")
            or ""
        )
        lines.append(f"- {turn_id}: [{topic}/{followup_style}] {summary}")
    if not lines:
        return "(履歴なし)"
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt builders (plan / opening / turn / continue / feedback)
# ---------------------------------------------------------------------------


def _build_plan_prompt(payload: InterviewBaseRequest) -> str:
    setup = _build_setup(payload)
    # Phase 2 Stage 1-3: plan フェーズは質問生成しないため grounding_legal 不要。
    # strictness/interviewer/repetition も plan 段階では過剰なので除外 (Stage 1 budget)。
    behavioral_block = build_behavioral_block(
        setup,
        include={"grounding_core", "format", "stage"},
    )
    # Phase 2 Stage 1: plan テンプレートでは応募者材料を 1 行化し、
    # 旧 `_format_materials_section()` による重複包含を解消する (motivation/gakuchika/
    # academic/research/es/seed が individual field と materials_section で二重に
    # レンダリングされていた)。
    return _PLAN_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        behavioral_block=behavioral_block,
        seed_summary_line=(payload.seed_summary or "なし"),
    )


def _build_opening_prompt(payload: InterviewBaseRequest, interview_plan: dict[str, Any]) -> str:
    setup = _build_setup(payload)
    # Phase 2 Stage 1-3: opening は新規質問を生成するため grounding_legal 必須。
    # Stage 1 token budget のため repetition は外す (opening は 1 問目なので反復リスクなし)。
    behavioral_block = build_behavioral_block(
        setup,
        include={
            "grounding_core",
            "grounding_legal",
            "strictness",
            "interviewer",
            "stage",
            "format",
            "question_design",
        },
    )
    # Phase 2 Stage 3: case format かつ plan.case_brief が preset 由来で詰まっている場合のみ
    # CASE BRIEF セクションを注入する。他 format では空文字列。
    case_brief_section = _build_case_brief_section(interview_plan, setup)
    return _OPENING_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        behavioral_block=behavioral_block,
        # Phase 2 Stage 1-1: interview_plan の full JSON dump を捨て、
        # 必要 5 フィールドを個別列挙 (priority_topics/must_cover/risk_topics は
        # json.dumps で配列をコンパクトに渡す)。
        interview_type=str(interview_plan.get("interview_type") or f"new_grad_{setup['interview_format']}"),
        opening_topic=str(interview_plan.get("opening_topic") or "motivation_fit"),
        priority_topics=json.dumps(interview_plan.get("priority_topics") or [], ensure_ascii=False),
        must_cover_topics=json.dumps(interview_plan.get("must_cover_topics") or [], ensure_ascii=False),
        risk_topics=json.dumps(interview_plan.get("risk_topics") or [], ensure_ascii=False),
        case_brief_section=case_brief_section,
        # Phase 2 Stage 1: 応募者材料は 1 行化し、旧 _format_materials_section の
        # 重複包含を解消。
        seed_summary_line=(payload.seed_summary or "なし"),
    )


def _build_turn_prompt(
    payload: InterviewBaseRequest,
    interview_plan: dict[str, Any],
    turn_state: dict[str, Any],
    turn_meta: dict[str, Any],
) -> str:
    setup = _build_setup(payload)
    # Phase 2 Stage 1-3: turn は hot path (新規質問生成 + 反復防止必須)。
    # grounding_core + grounding_legal + 深掘り系を全て含める。
    behavioral_block = build_behavioral_block(
        setup,
        include={
            "grounding_core",
            "grounding_legal",
            "strictness",
            "interviewer",
            "stage",
            "deepening",
            "format",
            "question_design",
            "repetition",
        },
    )
    # Phase 2 Stage 1-4: recent_question_summaries_v2 を JSON 配列から人間可読行に変換。
    # 各 summary の intentKey / normalizedSummary / topic / followupStyle / turnId を
    # 1 行にまとめ、40-60% のトークン削減を図る。
    recent_summaries_rendered = _render_recent_question_summaries(
        turn_state.get("recentQuestionSummariesV2") or []
    )
    # Phase 2 Stage 1: coverage_state も JSON から compact に変換。
    coverage_state_rendered = _render_coverage_state(turn_state.get("coverageState") or [])
    # Phase 2 Stage 1: 直近の要点セクションも空フィールドで行を浪費しないよう圧縮。
    _last_q = str(turn_state.get("lastQuestion") or "").strip()
    _last_a = str(turn_state.get("lastAnswer") or "").strip()
    _last_t = str(turn_state.get("lastTopic") or "").strip()
    if _last_q or _last_a or _last_t:
        last_turn_digest = (
            f"- 前回質問: {_last_q or '(なし)'}\n"
            f"- 前回回答: {_last_a or '(なし)'}\n"
            f"- 直前論点: {_last_t or '(なし)'}"
        )
    else:
        last_turn_digest = "(初回ターン)"
    # Phase 2 Stage 4: allowed followup styles を turn prompt に注入する。
    # turn_meta.allowed_followup_styles が詰まっている場合のみ ultra-compact な
    # 2 行ディレクティブを出力する (JP 説明文は tiktoken コストが高いため避け、
    # gap key を英語キーのみで渡す)。ディレクティブ自体に「allowed から選ぶ」
    # セマンティクスを込め、テンプレートのルール側には追記しない (token budget)。
    # ANSWER_GAP_DESCRIPTIONS は import 済 (将来の可視化 / debug 用途で維持)。
    allowed_styles = turn_meta.get("allowed_followup_styles") if turn_meta else None
    answer_gap = turn_meta.get("answer_gap") if turn_meta else None
    if allowed_styles:
        allowed_joined = ",".join(str(s) for s in allowed_styles)
        gap_key = str(answer_gap) if answer_gap else "unknown"
        # 単一行ディレクティブ (≈20 tokens)。`followup_policy gap=xxx: [...]` は
        # 「この gap の場合 followup_style は以下から選ぶ」と読める machine-parseable
        # 形式。テンプレート側が前後に改行を備えているので leading/trailing newline は
        # 自前では付けない (token を 2 節約)。JP 説明文は避けて tiktoken コストを抑える。
        allowed_styles_section = (
            f"followup_policy gap={gap_key}: [{allowed_joined}]"
        )
    else:
        allowed_styles_section = ""
    _ = ANSWER_GAP_DESCRIPTIONS  # module-level import の明示利用
    # Phase 2 Stage 3: case format かつ plan.case_brief が詰まっている場合のみ
    # CASE BRIEF セクションを注入する (opening/turn 共通ヘルパ)。
    case_brief_section = _build_case_brief_section(interview_plan, setup)
    return _TURN_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        behavioral_block=behavioral_block,
        # Phase 2 Stage 1-1: interview_plan JSON dump を捨て、必要 5 フィールドを列挙。
        interview_type=str(interview_plan.get("interview_type") or f"new_grad_{setup['interview_format']}"),
        opening_topic=str(interview_plan.get("opening_topic") or "motivation_fit"),
        priority_topics=json.dumps(interview_plan.get("priority_topics") or [], ensure_ascii=False),
        must_cover_topics=json.dumps(interview_plan.get("must_cover_topics") or [], ensure_ascii=False),
        risk_topics=json.dumps(interview_plan.get("risk_topics") or [], ensure_ascii=False),
        case_brief_section=case_brief_section,
        conversation_text=_format_conversation(
            _trim_conversation_history(payload.conversation_history)
            if isinstance(payload, InterviewTurnRequest)
            else []
        ),
        last_turn_digest=last_turn_digest,
        coveredTopics=json.dumps(turn_state.get("coveredTopics") or [], ensure_ascii=False),
        remainingTopics=json.dumps(turn_state.get("remainingTopics") or [], ensure_ascii=False),
        coverage_state=coverage_state_rendered,
        recent_question_summaries_v2=recent_summaries_rendered,
        allowed_styles_section=allowed_styles_section,
        format_phase=str(turn_state.get("formatPhase") or "opening"),
        turn_events=json.dumps(
            (payload.turn_events if isinstance(payload, InterviewTurnRequest) else None) or [],
            ensure_ascii=False,
        ),
    )


def _build_feedback_prompt(payload: InterviewFeedbackRequest) -> str:
    setup = _build_setup(payload)
    # Phase 2 Stage 1-3: feedback は既存発言の採点のみ、新規質問生成しないので legal 不要。
    behavioral_block = build_behavioral_block(
        setup,
        include={"grounding_core", "rubric"},
    )
    interview_plan = payload.turn_state.get("interviewPlan") if isinstance(payload.turn_state, dict) else None
    if not isinstance(interview_plan, dict):
        interview_plan = {
            "interview_type": f"new_grad_{setup['interview_format']}",
            "priority_topics": [setup["role_track"]],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
        }
    return _FEEDBACK_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        behavioral_block=behavioral_block,
        interview_plan=json.dumps(interview_plan, ensure_ascii=False),
        conversation_text=_format_conversation(payload.conversation_history),
        turn_events=json.dumps(payload.turn_events or [], ensure_ascii=False),
    )


def _build_continue_prompt(payload: InterviewContinueRequest) -> str:
    setup = _build_setup(payload)
    # Phase 2 Stage 1-3: continue は再開の最小プロンプト。
    # format/deepening/repetition/grounding_legal は外して budget 1800 に収める。
    behavioral_block = build_behavioral_block(
        setup,
        include={
            "grounding_core",
            "strictness",
            "interviewer",
            "stage",
            "question_design",
        },
    )
    interview_plan = payload.turn_state.get("interviewPlan") if isinstance(payload.turn_state, dict) else None
    if not isinstance(interview_plan, dict):
        interview_plan = {
            "interview_type": f"new_grad_{setup['interview_format']}",
            "priority_topics": [setup["role_track"]],
            "opening_topic": "motivation_fit",
            "must_cover_topics": ["motivation_fit", "role_understanding"],
            "risk_topics": ["credibility_check"],
            "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
        }
    # Phase 2 Stage 1-5: latest_feedback 全体の JSON dump を捨て、continue で実際に
    # 必要な 4 要素 (総評 / 最弱設問 / 模範回答 / 改善点 top 3) のみ列挙する。
    latest_feedback_summary = _summarize_latest_feedback(payload.latest_feedback)
    return _CONTINUE_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=payload.company_summary,
        motivation_summary=payload.motivation_summary or "なし",
        gakuchika_summary=payload.gakuchika_summary or "なし",
        academic_summary=payload.academic_summary or "なし",
        research_summary=payload.research_summary or "なし",
        es_summary=payload.es_summary or "なし",
        selected_role_line=setup["selected_role_line"],
        role_track=setup["role_track"],
        interview_format=setup["interview_format"],
        selection_type=setup["selection_type"],
        interview_stage=setup["interview_stage"],
        interviewer_type=setup["interviewer_type"],
        strictness_mode=setup["strictness_mode"],
        behavioral_block=behavioral_block,
        interview_type=str(interview_plan.get("interview_type") or f"new_grad_{setup['interview_format']}"),
        opening_topic=str(interview_plan.get("opening_topic") or "motivation_fit"),
        priority_topics=json.dumps(interview_plan.get("priority_topics") or [], ensure_ascii=False),
        must_cover_topics=json.dumps(interview_plan.get("must_cover_topics") or [], ensure_ascii=False),
        conversation_text=_format_conversation(_trim_conversation_history(payload.conversation_history)),
        latest_feedback_summary=latest_feedback_summary,
    )


# ---------------------------------------------------------------------------
# Phase 2 Stage 7: Weakness drill prompt builders
# ---------------------------------------------------------------------------


def _build_drill_start_prompt(payload: InterviewDrillStartRequest) -> str:
    """drill/start の prompt を組み立てる。

    LLM から why_weak / improvement_pattern / model_rewrite / retry_question の
    4 field を JSON で生成する。behavioral_block は drill コーチング特化なので
    追加せず、fallback template を最小の置換だけで使う (token budget ≤ 2,000)。
    """
    evidence_raw = list(payload.weakest_evidence or [])
    # 最大 3 件、空文字除外。引用符で視認性を確保。
    evidence_trimmed = [str(item).strip() for item in evidence_raw if str(item).strip()][:3]
    if evidence_trimmed:
        evidence_section = "\n".join(f"- 「{item}」" for item in evidence_trimmed)
    else:
        evidence_section = "(なし)"
    return _DRILL_START_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=(payload.company_summary or "なし"),
        selected_role=(payload.selected_role or "未設定"),
        interview_format=payload.interview_format,
        interviewer_type=payload.interviewer_type,
        strictness_mode=payload.strictness_mode,
        weakest_axis=payload.weakest_axis,
        original_score=payload.original_score,
        weakest_question=payload.weakest_question,
        weakest_answer=payload.weakest_answer,
        weakest_evidence=evidence_section,
    )


def _build_drill_score_prompt(payload: InterviewDrillScoreRequest) -> str:
    """drill/score の prompt を組み立てる。

    retry_answer を 7 軸で再採点し、rationale (delta の解説) を生成させる。
    INTERVIEW_SCORE_SCHEMA を再利用して厳密な整数スコアを強制する。
    """
    scores_dict: dict[str, int] = {}
    for key in (
        "company_fit",
        "role_fit",
        "specificity",
        "logic",
        "persuasiveness",
        "consistency",
        "credibility",
    ):
        value = payload.original_scores.get(key)
        scores_dict[key] = int(value) if isinstance(value, (int, float)) else 0
    original_scores_rendered = json.dumps(scores_dict, ensure_ascii=False)
    return _DRILL_SCORE_FALLBACK.format(
        company_name=payload.company_name,
        company_summary=(payload.company_summary or "なし"),
        selected_role=(payload.selected_role or "未設定"),
        retry_question=payload.retry_question,
        retry_answer=payload.retry_answer,
        original_scores=original_scores_rendered,
        weakest_axis=payload.weakest_axis,
    )


__all__ = [
    "_summarize_latest_feedback",
    "_render_coverage_state",
    "_render_recent_question_summaries",
    "_build_case_brief_section",
    "_build_plan_prompt",
    "_build_opening_prompt",
    "_build_turn_prompt",
    "_build_feedback_prompt",
    "_build_continue_prompt",
    # Phase 2 Stage 7: Weakness drill
    "_build_drill_start_prompt",
    "_build_drill_score_prompt",
]
