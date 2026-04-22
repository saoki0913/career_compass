"""Planning and plan-progress helpers for the interview router.

Covers:
- Interview plan / turn-meta / feedback normalization and fallback builders
- Coverage-state construction and merge logic
- Recent-question summary rendering helpers
- Feedback default enrichment and conversation-based backfill
- Case-seed version / prompt version metadata extraction
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from app.prompts.interview_prompts import (
    FOLLOWUP_POLICY_VERSION,
    PROMPT_VERSION,
    choose_followup_style,
)
from app.routers._interview.contracts import (
    LEGACY_STAGE_ORDER,
    QUESTION_STAGE_ORDER,
    CaseBrief,
    InterviewBaseRequest,
    InterviewContinueRequest,
    InterviewStartRequest,
    InterviewTurnRequest,
    Message,
    _LEGACY_FORMAT_PHASE_MAP,
)
from app.routers._interview.setup import (
    _default_stage_question_counts,
    _default_turn_state,
    _format_phase_for_setup,
    _infer_stage_from_topic,
    _normalize_string_list,
    _question_stage_from_turn_meta,
)

# ---------------------------------------------------------------------------
# Checklist per topic — feeds coverage state
# ---------------------------------------------------------------------------


def _checklist_for_topic(topic: str, setup: dict[str, Any]) -> list[str]:
    normalized = topic.lower()
    if setup.get("interview_format") == "case" or "case" in normalized or "structured" in normalized:
        checklist = ["structure", "hypothesis", "prioritization"]
    elif setup.get("interview_format") == "technical" or "technical" in normalized:
        checklist = ["decision_reason", "tradeoff", "reproducibility"]
    elif setup.get("interview_format") == "life_history" or any(
        key in normalized for key in ["narrative", "life_story", "turning", "jisekishi", "自分史"]
    ):
        checklist = ["turning_point", "values", "action_result_link"]
    elif any(key in normalized for key in ["motivation", "company", "compare", "career"]):
        checklist = ["core_reason", "company_reason", "experience_link"]
    elif any(key in normalized for key in ["role", "skill"]):
        checklist = ["role_reason", "evidence", "transfer"]
    else:
        checklist = ["situation", "action", "result", "reproducibility"]

    if setup.get("interview_stage") == "final":
        if "company_compare" not in checklist and any(key in normalized for key in ["motivation", "company", "career"]):
            checklist.extend(["company_compare", "decision_axis", "commitment"])
    elif setup.get("interview_stage") == "early":
        # early ステージは最低限の基本確認に絞る
        checklist = checklist[:2]

    # strictness_mode による調整
    strictness = setup.get("strictness_mode", "standard")
    if strictness == "strict" and "consistency_check" not in checklist:
        checklist.append("consistency_check")
    elif strictness == "supportive":
        checklist = checklist[:2]

    # interviewer_type による調整
    interviewer = setup.get("interviewer_type", "hr")
    if interviewer == "executive" and "career_vision" not in checklist:
        checklist.append("career_vision")
    elif interviewer == "line_manager" and "practical_skill" not in checklist:
        checklist.append("practical_skill")

    return checklist


# ---------------------------------------------------------------------------
# Initial coverage state construction
# ---------------------------------------------------------------------------


def _build_initial_coverage_state(interview_plan: dict[str, Any], setup: dict[str, Any]) -> list[dict[str, Any]]:
    topics = _normalize_string_list(interview_plan.get("must_cover_topics")) or [
        str(interview_plan.get("opening_topic") or "motivation_fit")
    ]
    return [
        {
            "topic": topic,
            "status": "active" if index == 0 else "pending",
            "requiredChecklist": _checklist_for_topic(topic, setup),
            "passedChecklistKeys": [],
            "deterministicCoveragePassed": False,
            "llmCoverageHint": None,
            "deepeningCount": 0,
            "lastCoveredTurnId": None,
        }
        for index, topic in enumerate(topics)
    ]


# ---------------------------------------------------------------------------
# Normalization helpers for incoming turn_state / plan / feedback
# ---------------------------------------------------------------------------


def _normalize_recent_question_summaries_v2(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        normalized_summary = str(item.get("normalizedSummary") or "").strip()
        if not normalized_summary:
            continue
        items.append(
            {
                "intentKey": str(item.get("intentKey") or "unknown_intent").strip() or "unknown_intent",
                "normalizedSummary": normalized_summary,
                "topic": str(item.get("topic") or "").strip() or None,
                "followupStyle": str(item.get("followupStyle") or "").strip() or None,
                "turnId": str(item.get("turnId") or "").strip() or None,
            }
        )
    return items[-8:]


def _normalize_coverage_state(value: Any, interview_plan: dict[str, Any], setup: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return _build_initial_coverage_state(interview_plan, setup)

    fallback_by_topic = {
        item["topic"]: item for item in _build_initial_coverage_state(interview_plan, setup)
    }
    normalized: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        topic = str(item.get("topic") or "").strip()
        if not topic:
            continue
        fallback = fallback_by_topic.get(topic, {
            "requiredChecklist": _checklist_for_topic(topic, setup),
        })
        status = str(item.get("status") or "pending").strip()
        if status not in {"pending", "active", "covered", "exhausted"}:
            status = "pending"
        normalized.append(
            {
                "topic": topic,
                "status": status,
                "requiredChecklist": _normalize_string_list(item.get("requiredChecklist")) or fallback["requiredChecklist"],
                "passedChecklistKeys": _normalize_string_list(item.get("passedChecklistKeys")),
                "deterministicCoveragePassed": bool(item.get("deterministicCoveragePassed", False)),
                "llmCoverageHint": str(item.get("llmCoverageHint") or "").strip() or None,
                "deepeningCount": int(item.get("deepeningCount", 0) or 0),
                "lastCoveredTurnId": str(item.get("lastCoveredTurnId") or "").strip() or None,
            }
        )

    if not normalized:
        return _build_initial_coverage_state(interview_plan, setup)
    return normalized


def _covered_topics_from_coverage_state(coverage_state: list[dict[str, Any]]) -> list[str]:
    return [
        item["topic"]
        for item in coverage_state
        if item.get("deterministicCoveragePassed") is True
    ]


def _build_question_summary(text: Optional[str], fallback: str) -> str:
    if not text:
        return fallback
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:60] if compact else fallback


def _build_recent_question_summary_v2(turn_meta: dict[str, Any], fallback: str, turn_id: str) -> dict[str, Any]:
    return {
        "intentKey": str(turn_meta.get("intent_key") or f"{turn_meta.get('topic') or 'unknown'}:{turn_meta.get('followup_style') or 'reason_check'}"),
        "normalizedSummary": _build_question_summary(turn_meta.get("focus_reason"), fallback),
        "topic": str(turn_meta.get("topic") or "").strip() or None,
        "followupStyle": str(turn_meta.get("followup_style") or "").strip() or None,
        "turnId": turn_id,
    }


def _normalize_interview_plan(value: Any) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    interview_type = str(data.get("interview_type") or "new_grad_behavioral").strip()
    priority_topics = _normalize_string_list(data.get("priority_topics"))
    if isinstance(data.get("opening_topic"), str) and data["opening_topic"].strip():
        opening_topic = data["opening_topic"].strip()
    else:
        opening_topic = priority_topics[0] if priority_topics else "motivation_fit"
    must_cover_topics = _normalize_string_list(data.get("must_cover_topics")) or [opening_topic]
    risk_topics = _normalize_string_list(data.get("risk_topics"))
    suggested_timeflow = _normalize_string_list(data.get("suggested_timeflow")) or ["導入", "論点1", "論点2", "締め"]
    normalized: dict[str, Any] = {
        "interview_type": interview_type,
        "priority_topics": priority_topics or [opening_topic],
        "opening_topic": opening_topic,
        "must_cover_topics": must_cover_topics,
        "risk_topics": risk_topics,
        "suggested_timeflow": suggested_timeflow,
    }
    # Phase 2 Stage 3: case_brief は case format でのみ load され、他 format では
    # 存在しない (キー省略) のが正。dict のまま通過させ、不正形式は drop する。
    case_brief = data.get("case_brief")
    if isinstance(case_brief, dict):
        try:
            CaseBrief(**case_brief)
        except Exception:  # noqa: BLE001 — 不正形式は drop
            pass
        else:
            normalized["case_brief"] = case_brief
    return normalized


def _normalize_turn_meta(value: Any, fallback_topic: str = "motivation_fit") -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    topic = str(data.get("topic") or fallback_topic).strip() or fallback_topic
    turn_action = str(data.get("turn_action") or "ask").strip()
    if turn_action not in {"ask", "deepen", "shift"}:
        turn_action = "ask"
    depth_focus = str(data.get("depth_focus") or "logic").strip()
    if depth_focus not in {"company_fit", "role_fit", "specificity", "logic", "persuasiveness", "consistency", "credibility"}:
        depth_focus = "logic"
    followup_style = str(data.get("followup_style") or "reason_check").strip()
    if not followup_style:
        followup_style = "reason_check"
    raw_gap = data.get("answer_gap")
    answer_gap = str(raw_gap).strip() if raw_gap is not None and str(raw_gap).strip() else "sufficient"
    raw_styles = data.get("allowed_followup_styles")
    allowed_followup_styles: list[str] = []
    if isinstance(raw_styles, list):
        allowed_followup_styles = [str(s).strip() for s in raw_styles if str(s).strip()]
    return {
        "topic": topic,
        "turn_action": turn_action,
        "focus_reason": str(data.get("focus_reason") or "").strip(),
        "depth_focus": depth_focus,
        "followup_style": followup_style,
        "intent_key": str(data.get("intent_key") or f"{topic}:{followup_style}").strip() or f"{topic}:{followup_style}",
        "should_move_next": bool(data.get("should_move_next", False)),
        "answer_gap": answer_gap,
        "allowed_followup_styles": allowed_followup_styles,
    }


# Phase 2 Stage 5: Evidence-Linked Rubric — 7 軸の順序は INTERVIEW_SCORE_SCHEMA と揃える。
SEVEN_AXES: tuple[str, ...] = (
    "company_fit",
    "role_fit",
    "specificity",
    "logic",
    "persuasiveness",
    "consistency",
    "credibility",
)


def _normalize_feedback(value: Any) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    scores = data.get("scores") if isinstance(data.get("scores"), dict) else {}
    normalized_scores = {
        "company_fit": int(scores.get("company_fit", 0) or 0),
        "role_fit": int(scores.get("role_fit", 0) or 0),
        "specificity": int(scores.get("specificity", 0) or 0),
        "logic": int(scores.get("logic", 0) or 0),
        "persuasiveness": int(scores.get("persuasiveness", 0) or 0),
        "consistency": int(scores.get("consistency", 0) or 0),
        "credibility": int(scores.get("credibility", 0) or 0),
    }

    # Phase 2 Stage 5: Evidence-Linked Rubric.
    # LLM からの 3 field を安全に取り出す (形式不正 / 欠落は空 dict fallback)。
    raw_evidence = data.get("score_evidence_by_axis")
    if not isinstance(raw_evidence, dict):
        raw_evidence = {}
    raw_rationale = data.get("score_rationale_by_axis")
    if not isinstance(raw_rationale, dict):
        raw_rationale = {}
    raw_confidence = data.get("confidence_by_axis")
    if not isinstance(raw_confidence, dict):
        raw_confidence = {}

    score_evidence: dict[str, list[str]] = {}
    score_rationale: dict[str, str] = {}
    confidence: dict[str, str] = {}
    for axis in SEVEN_AXES:
        evidence_list = raw_evidence.get(axis, [])
        if isinstance(evidence_list, list):
            score_evidence[axis] = [
                str(item).strip()
                for item in evidence_list[:3]
                if str(item).strip()
            ]
        else:
            score_evidence[axis] = []

        rationale = raw_rationale.get(axis, "")
        score_rationale[axis] = str(rationale).strip() if rationale is not None else ""

        raw_conf = raw_confidence.get(axis, "low")
        confidence[axis] = (
            raw_conf if raw_conf in ("high", "medium", "low") else "low"
        )

    return {
        "overall_comment": str(data.get("overall_comment") or "").strip(),
        "scores": normalized_scores,
        "strengths": _normalize_string_list(data.get("strengths")),
        "improvements": _normalize_string_list(data.get("improvements")),
        "consistency_risks": _normalize_string_list(data.get("consistency_risks")),
        "weakest_question_type": str(data.get("weakest_question_type") or "motivation").strip() or "motivation",
        "weakest_turn_id": str(data.get("weakest_turn_id") or "").strip() or None,
        "weakest_question_snapshot": str(data.get("weakest_question_snapshot") or "").strip() or None,
        "weakest_answer_snapshot": str(data.get("weakest_answer_snapshot") or "").strip() or None,
        "improved_answer": str(data.get("improved_answer") or "").strip(),
        "next_preparation": _normalize_string_list(data.get("next_preparation")),
        "premise_consistency": int(data.get("premise_consistency", 0) or 0),
        "satisfaction_score": int(data.get("satisfaction_score", 0) or 0)
        if data.get("satisfaction_score") is not None
        else None,
        # Phase 2 Stage 5: Evidence-Linked Rubric
        "score_evidence_by_axis": score_evidence,
        "score_rationale_by_axis": score_rationale,
        "confidence_by_axis": confidence,
    }


def _normalize_turn_state(value: Optional[dict[str, Any]], setup: dict[str, Any]) -> dict[str, Any]:
    state = _default_turn_state(setup)
    if not isinstance(value, dict):
        state["formatPhase"] = "opening"
        return state

    phase = str(value.get("phase") or "opening").strip()
    if phase not in {"plan", "opening", "turn", "feedback"}:
        phase = "opening"
    state["phase"] = phase
    format_phase = str(value.get("formatPhase") or "").strip()
    format_phase = _LEGACY_FORMAT_PHASE_MAP.get(format_phase, format_phase)
    if format_phase not in {
        "opening",
        "standard_main",
        "case_main",
        "case_closing",
        "technical_main",
        "life_history_main",
        "feedback",
    }:
        format_phase = "opening" if phase == "opening" else _format_phase_for_setup(setup)
    state["formatPhase"] = format_phase

    current_stage = str(value.get("currentStage") or value.get("question_stage") or "opening").strip()
    if current_stage not in LEGACY_STAGE_ORDER:
        current_stage = _infer_stage_from_topic(value.get("lastTopic"), current_stage)
    state["currentStage"] = current_stage

    for key in ("questionCount", "totalQuestionCount", "turnCount"):
        raw = value.get(key)
        if isinstance(raw, int) and raw >= 0:
            state[key] = raw

    if isinstance(value.get("stageQuestionCounts"), dict):
        counts: dict[str, int] = {}
        for stage in QUESTION_STAGE_ORDER:
            raw = value["stageQuestionCounts"].get(stage, 0)
            counts[stage] = raw if isinstance(raw, int) and raw >= 0 else 0
        state["stageQuestionCounts"] = counts

    state["completedStages"] = [stage for stage in _normalize_string_list(value.get("completedStages")) if stage in QUESTION_STAGE_ORDER]
    state["coverageState"] = _normalize_coverage_state(
        value.get("coverageState"),
        _normalize_interview_plan(value.get("interviewPlan") or value.get("plan")),
        setup,
    )
    state["coveredTopics"] = _normalize_string_list(value.get("coveredTopics")) or _covered_topics_from_coverage_state(state["coverageState"])
    state["remainingTopics"] = _normalize_string_list(value.get("remainingTopics")) or [
        item["topic"] for item in state["coverageState"] if item["topic"] not in state["coveredTopics"]
    ]
    state["recentQuestionSummaries"] = _normalize_string_list(value.get("recentQuestionSummaries"))[-5:]
    state["recentQuestionSummariesV2"] = _normalize_recent_question_summaries_v2(value.get("recentQuestionSummariesV2")) or [
        {
            "intentKey": f"legacy-summary-{index + 1}",
            "normalizedSummary": summary,
            "topic": None,
            "followupStyle": None,
            "turnId": None,
        }
        for index, summary in enumerate(state["recentQuestionSummaries"])
    ]
    state["lastQuestion"] = str(value.get("lastQuestion")).strip() if isinstance(value.get("lastQuestion"), str) and value.get("lastQuestion").strip() else None
    state["lastAnswer"] = str(value.get("lastAnswer")).strip() if isinstance(value.get("lastAnswer"), str) and value.get("lastAnswer").strip() else None
    state["lastTopic"] = str(value.get("lastTopic")).strip() if isinstance(value.get("lastTopic"), str) and value.get("lastTopic").strip() else None
    state["lastQuestionFocus"] = str(value.get("lastQuestionFocus")).strip() if isinstance(value.get("lastQuestionFocus"), str) and value.get("lastQuestionFocus").strip() else None
    next_action = str(value.get("nextAction") or "ask").strip()
    state["nextAction"] = next_action if next_action in {"ask", "feedback"} else "ask"
    state["interviewPlan"] = _normalize_interview_plan(value.get("interviewPlan") or value.get("plan"))
    state["turnMeta"] = _normalize_turn_meta(
        value.get("turnMeta") or value.get("turn_meta"),
        state["lastTopic"] or state["interviewPlan"]["opening_topic"],
    )
    return state


# ---------------------------------------------------------------------------
# Derived turn-state for a newly issued question
# ---------------------------------------------------------------------------


def _derive_turn_state_for_question(base: dict[str, Any], turn_meta: dict[str, Any], *, phase: str) -> dict[str, Any]:
    state = {**base}
    legacy_stage = "feedback" if phase == "feedback" else _question_stage_from_turn_meta(turn_meta)
    state["phase"] = phase
    state["formatPhase"] = "feedback" if phase == "feedback" else state.get("formatPhase") or _format_phase_for_setup(state)
    state["currentStage"] = legacy_stage
    state["lastTopic"] = turn_meta.get("topic")
    state["turnMeta"] = turn_meta
    state["lastQuestionFocus"] = turn_meta.get("focus_reason") or state.get("lastQuestionFocus")
    state["nextAction"] = "feedback" if phase == "feedback" else "ask"
    state["turnCount"] = int(state.get("turnCount", 0) or 0) + (0 if phase == "feedback" else 1)
    state["questionCount"] = int(state.get("questionCount", 0) or 0) + (0 if phase == "feedback" else 1)
    state["totalQuestionCount"] = int(state.get("totalQuestionCount", 0) or 0) + (0 if phase == "feedback" else 1)
    if phase != "feedback":
        counts = dict(state.get("stageQuestionCounts") or _default_stage_question_counts())
        counts[legacy_stage] = int(counts.get(legacy_stage, 0) or 0) + 1
        state["stageQuestionCounts"] = counts
    state["completedStages"] = [stage for stage in LEGACY_STAGE_ORDER if stage in LEGACY_STAGE_ORDER[: LEGACY_STAGE_ORDER.index(legacy_stage)]]
    return state


# ---------------------------------------------------------------------------
# Deterministic fallback plans / opening / turn / continue
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Phase 2 Stage 3: CaseBrief preset loader
# ---------------------------------------------------------------------------
# 業界キーワード → preset industry の対応表。宣言順が優先順位。
# seed_summary と selected_industry の双方に適用する。
# 将来的に企業 RAG や学習データで拡張する予定。
_CASE_BRIEF_INDUSTRY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "finance": ("金融", "銀行", "証券", "保険", "投資", "finance", "fintech"),
    "saas": ("SaaS", "サブスク", "subscription", "B2B", "BtoB"),
    "retail": ("小売", "EC", "電子商取引", "アパレル", "retail"),
    "manufacturing": ("製造", "メーカー", "製造業", "manufacturing"),
    "consulting": ("コンサル", "戦略ファーム", "consulting"),
    "media": ("メディア", "広告", "代理店", "media", "advertising"),
    "infrastructure": ("インフラ", "通信", "電力", "エネルギー", "infrastructure"),
}

# preset JSON のキャッシュ (プロセス内で 1 回読み込むだけ)。
# デプロイ後に preset を差し替える運用は想定していないため、in-memory cache で十分。
_CASE_BRIEF_CACHE: dict[str, Optional[dict[str, Any]]] = {}


def _case_seeds_dir() -> Path:
    """preset JSON を配置するディレクトリ。`backend/app/data/case_seeds/`。"""
    # planning.py → _interview → routers → app → (app/data/case_seeds)
    return Path(__file__).parent.parent.parent / "data" / "case_seeds"


def _load_case_brief_preset(industry: str) -> Optional[dict[str, Any]]:
    """industry に対応する preset JSON を読み込む。

    見つからなければ None。preset は本関数内でバリデーションし、
    `CaseBrief(**preset)` で pydantic 層にも通す (形式不正時は None を返して
    fallback させる)。
    """
    if industry in _CASE_BRIEF_CACHE:
        return _CASE_BRIEF_CACHE[industry]
    preset_path = _case_seeds_dir() / f"{industry}.json"
    if not preset_path.exists():
        _CASE_BRIEF_CACHE[industry] = None
        return None
    try:
        with preset_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        _CASE_BRIEF_CACHE[industry] = None
        return None
    # pydantic バリデーションを通しておく (不正形式は None)。
    try:
        CaseBrief(**data)
    except Exception:  # noqa: BLE001 — preset はローカル JSON で起因特定不要
        _CASE_BRIEF_CACHE[industry] = None
        return None
    _CASE_BRIEF_CACHE[industry] = data
    return data


def _select_case_brief(
    setup: dict[str, Any],
    seed_summary: Optional[str],
) -> Optional[dict[str, Any]]:
    """Phase 2 Stage 3: case format の plan フェーズで呼ばれる。

    優先順位:
      1. seed_summary に含まれる業界キーワードが preset industry と一致するならそれを使う
      2. 一致しない場合は selected_industry から industry を推定 → preset を使う
      3. どちらも不明 or preset 未配置なら None (= 従来の fallback シナリオを使う)

    同じ (setup, seed_summary) に対して常に同じ CaseBrief を返す (決定論性)。
    """
    haystack = f"{seed_summary or ''} {setup.get('selected_industry') or ''}"
    if not haystack.strip():
        return None

    matched: Optional[str] = None
    for industry, keywords in _CASE_BRIEF_INDUSTRY_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            matched = industry
            break

    if not matched:
        return None

    return _load_case_brief_preset(matched)


def _fallback_plan(payload: InterviewBaseRequest, setup: dict[str, Any]) -> dict[str, Any]:
    fmt = setup["interview_format"]
    if fmt == "case":
        opening_topic = "case_fit"
    elif fmt == "life_history":
        opening_topic = "life_narrative_core"
    else:
        opening_topic = "motivation_fit"
    interview_type_map = {
        "case": "new_grad_case",
        "technical": "new_grad_technical",
        "life_history": "new_grad_life_history",
    }
    interview_type = interview_type_map.get(fmt, "new_grad_behavioral")
    must_cover = [opening_topic, "role_understanding", "company_fit"]
    if fmt == "life_history":
        must_cover = [
            "life_narrative_core",
            "turning_point_values",
            "motivation_bridge",
            "role_understanding",
        ]
    if setup["interview_stage"] == "final":
        must_cover.extend(["company_compare_check", "career_alignment"])
    if setup["selection_type"] == "internship":
        must_cover.append("learning_motivation")

    # role_track 固有の must_cover 追加 (既存 + 新 5 種)
    role_track = setup.get("role_track") or ""
    if role_track == "research_specialist":
        must_cover.append("research_application")
    elif role_track == "it_product":
        must_cover.append("work_understanding")
    elif role_track in {"frontend_engineer", "backend_engineer"} or fmt == "technical":
        for extra in ("technical_depth", "design_decision"):
            if extra not in must_cover:
                must_cover.append(extra)
    elif role_track == "data_ai":
        for extra in ("analytical_approach", "data_handling"):
            if extra not in must_cover:
                must_cover.append(extra)
    elif role_track == "infra_platform":
        for extra in ("system_design", "reliability"):
            if extra not in must_cover:
                must_cover.append(extra)
    elif role_track == "product_manager":
        for extra in ("user_understanding", "prioritization"):
            if extra not in must_cover:
                must_cover.append(extra)

    # strictness_mode による risk_topics 調整
    strictness = setup.get("strictness_mode", "standard")
    if strictness == "strict":
        risk_topics = [
            "credibility_check",
            "consistency_check",
            "pressure_followup",
            "consistency_risk_direct",
            "over_claim",
        ]
    elif strictness == "supportive":
        risk_topics = ["credibility_check"]
    else:
        risk_topics = ["credibility_check", "consistency_check"]

    # priority_topics の生成 (重複を抑えつつ interviewer_type で先頭を優先配置)
    interviewer = setup.get("interviewer_type", "hr")
    priority_prefix: list[str] = []
    if interviewer == "executive":
        priority_prefix = ["career_alignment", "company_compare_check"]
    elif interviewer == "line_manager":
        priority_prefix = ["work_understanding", "technical_depth"]
    else:  # hr / mixed_panel などは HR 軸の優先度
        priority_prefix = ["motivation_fit", "personality"]

    priority_topics: list[str] = []
    seen: set[str] = set()
    for item in priority_prefix + must_cover:
        if item and item not in seen:
            priority_topics.append(item)
            seen.add(item)
    priority_topics = priority_topics[:4]

    plan: dict[str, Any] = {
        "interview_type": interview_type,
        "priority_topics": priority_topics,
        "opening_topic": opening_topic,
        "must_cover_topics": must_cover,
        "risk_topics": risk_topics,
        "suggested_timeflow": (
            ["導入", "ケース設定", "仮説と検証", "締め"]
            if fmt == "case"
            else ["導入", "転機と価値観", "行動の根拠", "締め"]
            if fmt == "life_history"
            else ["導入", "技術判断", "前提とトレードオフ", "締め"]
            if fmt == "technical"
            else ["導入", "志望動機", "具体例", "締め"]
        ),
    }

    # Phase 2 Stage 3: case format は preset CaseBrief を load して plan に埋め込む。
    # 他 format では case_brief キー自体を省略する (None にしない) ことで
    # 既存 plan consumer (test_interview_deterministic の snapshot 等) の挙動を保つ。
    if fmt == "case":
        seed_summary = getattr(payload, "seed_summary", None)
        case_brief = _select_case_brief(setup, seed_summary)
        if case_brief is not None:
            plan["case_brief"] = case_brief

    return plan


# ---------------------------------------------------------------------------
# Phase 2 Stage 4: answer_gap 判定 (deterministic)
# ---------------------------------------------------------------------------

# 数字 (半角) 検出 — 具体性のシグナル
_NUMERIC_PATTERN = re.compile(r"\d+")
# 3 文字以上のカタカナ連続 — 固有名詞 / 専門用語の手がかり
_KATAKANA_PATTERN = re.compile(r"[\u30A0-\u30FF]{3,}")


def detect_answer_gap(
    last_answer: Optional[str],
    last_question: Optional[str],
    setup: dict[str, Any],
    turn_count: int = 0,
) -> str:
    """応募者の直近回答を deterministic に分析し、答案の不足タイプを返す。

    戻り値は ``ANSWER_GAP_DESCRIPTIONS`` のキーのいずれか
    (abstract / consistent_gap / missing_hypothesis / surface_analysis /
     lacks_tradeoff / low_ownership / low_commitment / thin_narrative /
     sufficient)。

    ``last_answer`` が欠落/極端に短い場合は ``abstract`` を返す。
    """
    del last_question, turn_count  # 現状は未使用だが将来の一貫性判定用に受け取る

    if not last_answer or len(last_answer.strip()) < 10:
        return "abstract"

    answer = last_answer.strip()
    interview_format = str(setup.get("interview_format") or "standard_behavioral")
    interview_stage = str(setup.get("interview_stage") or "mid")

    # 具体性チェック: 数字ゼロ + 3 文字以上のカタカナなし + 短文 → 抽象
    has_number = bool(_NUMERIC_PATTERN.search(answer))
    has_proper_noun = bool(_KATAKANA_PATTERN.search(answer))

    if not has_number and not has_proper_noun and len(answer) < 150:
        return "abstract"

    # 個人行動 vs チーム: 一人称が無くチーム主語だけ → low_ownership
    has_individual = any(
        key in answer for key in ["私は", "僕は", "自分は", "私が", "僕が", "自分が"]
    )
    has_team_only = (
        any(key in answer for key in ["チームで", "みんなで", "メンバーで"])
        and not has_individual
    )
    if has_team_only:
        return "low_ownership"

    # format 固有の判定
    if interview_format == "case":
        # ケース: 仮説/理由/根拠のシグナルが一切無い → missing_hypothesis
        if not any(
            key in answer
            for key in ["仮説", "理由", "根拠", "と考えます", "だと思います"]
        ):
            return "missing_hypothesis"
        # 結論のみで短く、トレードオフ議論なし → surface_analysis
        if len(answer) < 200 and not any(
            key in answer for key in ["一方", "逆に", "ただし", "しかし"]
        ):
            return "surface_analysis"

    if interview_format == "technical":
        # 技術面接: 比較/代替案の語が無い → lacks_tradeoff
        if not any(
            key in answer
            for key in [
                "トレードオフ",
                "代替案",
                "選択肢",
                "メリット",
                "デメリット",
                "別の方法",
                "比較",
            ]
        ):
            return "lacks_tradeoff"

    if interview_format == "life_history":
        # 人生面接: 変化・学びのシグナルが無い → thin_narrative
        if not any(
            key in answer
            for key in ["変わった", "学んだ", "気づいた", "転機", "きっかけ"]
        ):
            return "thin_narrative"

    # 最終面接 + 企業言及なし → low_commitment
    if interview_stage == "final":
        has_company_ref = any(
            key in answer for key in ["御社", "貴社", "この会社", "この企業"]
        )
        if not has_company_ref:
            return "low_commitment"

    return "sufficient"


def _fallback_turn_meta(
    turn_state: dict[str, Any],
    interview_plan: dict[str, Any],
    setup: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    remaining = _normalize_string_list(turn_state.get("remainingTopics"))
    topic = remaining[0] if remaining else str(interview_plan.get("opening_topic") or "motivation_fit")
    topic = str(topic or interview_plan.get("opening_topic") or "motivation_fit")
    covered_topics = turn_state.get("coveredTopics", []) or []
    is_covered = topic in covered_topics

    depth_focus = "logic"
    if "company" in topic:
        depth_focus = "company_fit"
    elif "role" in topic:
        depth_focus = "role_fit"
    elif "credibility" in topic or "consistency" in topic:
        depth_focus = "credibility"

    followup_style = "reason_check"
    turn_action = "deepen" if is_covered else "shift"

    # setup が指定されていない場合は既存動作を完全維持 (後方互換)
    if setup is not None:
        strictness = setup.get("strictness_mode", "standard")
        if strictness == "strict":
            # covered トピックでも deepen を優先 (深掘り重視)
            turn_action = "deepen"
        elif strictness == "supportive":
            # 早めに shift (次の論点へ進みやすく)
            turn_action = "shift"

        interviewer = setup.get("interviewer_type", "hr")
        if interviewer == "executive":
            depth_focus = "company_fit" if "company" in topic or "career" in topic else "credibility"
            followup_style = "future_vision_check" if "career" in topic or "future" in topic else "reason_check"
        elif interviewer == "line_manager":
            depth_focus = "specificity" if not is_covered else "logic"
            followup_style = (
                "technical_difficulty_check"
                if any(key in topic for key in ("technical", "design", "system", "role", "skill"))
                else "specificity_check"
            )
        elif interviewer == "mixed_panel":
            depth_focus = "consistency"

    result: dict[str, Any] = {
        "topic": topic,
        "turn_action": turn_action,
        "focus_reason": "面接計画の優先論点に沿って確認するため",
        "depth_focus": depth_focus,
        "followup_style": followup_style,
        "should_move_next": False,
    }

    # Phase 2 Stage 4: answer_gap 判定 + allowed followup styles を付加。
    # setup が指定されたケースだけで policy を適用し、setup=None の後方互換経路は
    # 旧 shape (answer_gap / allowed_followup_styles なし) を維持する。
    if setup is not None:
        last_answer = turn_state.get("lastAnswer") or turn_state.get("last_answer")
        last_question = turn_state.get("lastQuestion") or turn_state.get("last_question")
        turn_count = int(turn_state.get("turnCount", 0) or 0)
        answer_gap = detect_answer_gap(last_answer, last_question, setup, turn_count)
        allowed = choose_followup_style(
            str(setup.get("interview_format") or "standard_behavioral"),
            str(setup.get("interview_stage") or "mid"),
            answer_gap,
        )
        # 既存の followup_style が allowed に含まれていれば維持、なければ先頭を採用
        current_style = result.get("followup_style")
        chosen_style = current_style if current_style in allowed else allowed[0]

        result["followup_style"] = chosen_style
        result["answer_gap"] = answer_gap
        result["allowed_followup_styles"] = list(allowed)
        # intent_key を (topic:followup_style) 規約に合わせて再生成
        result["intent_key"] = f"{result['topic']}:{chosen_style}"

    return result


# ---------------------------------------------------------------------------
# Phase 2 Stage 6: Per-turn short coaching (deterministic fallback)
# ---------------------------------------------------------------------------

# answer_gap → good/missing/next_edit の固定テンプレート。
# LLM が short_coaching を返さない場合や初回ターンで空文字の場合に使う。
# 各値は 30-60 字目安で人間が読みやすいトーン。
_SHORT_COACHING_BY_GAP: dict[str, dict[str, str]] = {
    "abstract": {
        "good": "主張の方向性は伝わっています。",
        "missing": "具体的な数字や固有名詞が不足しており、他社でも通用する内容にとどまっています。",
        "next_edit": "次の回答では数字 1 つと固有名詞 1 つを入れて具体化してみてください。",
    },
    "consistent_gap": {
        "good": "経験自体は語れています。",
        "missing": "ES や直前回答と食い違う部分があり、一貫性を確認したい状態です。",
        "next_edit": "次の回答では ES の記述と今の発言の接続点を 1 文で補強してください。",
    },
    "missing_hypothesis": {
        "good": "結論を明示できた点は良いです。",
        "missing": "結論までの仮説や根拠が省略されており、思考プロセスが見えません。",
        "next_edit": "次の回答では「仮説は〜、根拠は〜」の順で仮説と根拠を明示してください。",
    },
    "surface_analysis": {
        "good": "結論に到達できた点は評価できます。",
        "missing": "根拠が薄く、選択肢の比較や前提条件の整理が足りません。",
        "next_edit": "次の回答では「他の選択肢は〜、それでもこれを選んだのは〜」で深掘りしてみてください。",
    },
    "lacks_tradeoff": {
        "good": "技術判断の結論は明確です。",
        "missing": "トレードオフや代替案の議論が抜けており、唯一解のように聞こえます。",
        "next_edit": "次の回答では「代替案は〜、選ばなかった理由は〜」でトレードオフを明示してください。",
    },
    "low_ownership": {
        "good": "チームで取り組んだ状況は伝わっています。",
        "missing": "個人として何をしたかが不明で、再現性の判断ができません。",
        "next_edit": "次の回答では「私個人としては〜」を文頭に置いて自分の行動を語ってください。",
    },
    "low_commitment": {
        "good": "志望する方向性は示せています。",
        "missing": "なぜこの会社でなければならないかの理由が弱く、他社でも同じ回答になりそうです。",
        "next_edit": "次の回答では「御社で特に〜」という固有論点を 1 つ入れてください。",
    },
    "thin_narrative": {
        "good": "転機の存在は語られています。",
        "missing": "価値観の変化や学びの深さが薄く、ナラティブとして表面的です。",
        "next_edit": "次の回答では「その経験で変わった価値観は〜」を 1 文追加してください。",
    },
    "sufficient": {
        "good": "具体性と論理のバランスが取れた回答でした。",
        "missing": "現時点での弱点は少ないですが、次の論点への接続余地があります。",
        "next_edit": "次の質問では前の経験を踏まえた応用を意識してみてください。",
    },
}


def _fallback_short_coaching(
    turn_state: dict[str, Any],
    turn_meta: dict[str, Any],
    setup: Optional[dict[str, Any]] = None,
) -> dict[str, str]:
    """LLM が short_coaching を返さない場合の deterministic fallback。

    ``turn_meta.answer_gap`` (Stage 4 で既に埋まっている場合) を優先して
    ``_SHORT_COACHING_BY_GAP`` から good / missing / next_edit を機械的に組む。

    ``turn_state.lastAnswer`` が空または欠落している場合 (= 初回ターンで
    応募者発言がない状態) は 3 フィールド空文字で返し、UI 側で非表示に
    することを想定する。

    ``setup`` が渡された場合、``company_name`` を coaching テンプレートに
    埋め込みパーソナライズする (空なら汎用文言を維持)。

    Args:
        turn_state: 現在の turn_state。``lastAnswer`` と Stage 4 の
            ``answer_gap`` の取得に使う。
        turn_meta: 直近の turn_meta。``answer_gap`` が直接詰まっているか
            チェックする (fallback_turn_meta の戻り値 or LLM レスポンスで
            埋まるため)。
        setup: interview setup (format / stage / etc)。``company_name`` を
            coaching テンプレートに埋め込む。
    """
    last_answer = str(turn_state.get("lastAnswer") or "").strip()
    if not last_answer:
        # 初回ターン (会話履歴空) は空文字列で返し、UI 側で非表示にする。
        return {"good": "", "missing": "", "next_edit": ""}

    # turn_meta.answer_gap が既に埋まっているなら優先 (Stage 4 の deterministic
    # 判定 or LLM 出力の尊重)。空 / 未知なら "sufficient" fallback。
    answer_gap_raw = turn_meta.get("answer_gap") if isinstance(turn_meta, dict) else None
    answer_gap = str(answer_gap_raw).strip() if answer_gap_raw else ""
    result = dict(_SHORT_COACHING_BY_GAP.get(answer_gap or "sufficient", _SHORT_COACHING_BY_GAP["sufficient"]))

    # company_name パーソナライズ: setup.company_name が存在する場合、
    # 「他社でも通用する」→「{company_name}固有の」、「御社」→「{company_name}」に置換。
    company_name = ""
    if isinstance(setup, dict):
        company_name = str(setup.get("company_name") or "").strip()
    if company_name:
        for key in ("good", "missing", "next_edit"):
            result[key] = result[key].replace("他社でも通用する内容", f"{company_name}固有でない内容")
            result[key] = result[key].replace("他社でも同じ回答になりそう", f"{company_name}でなければならない理由が見えない")
            result[key] = result[key].replace("御社", company_name)
            result[key] = result[key].replace("この会社", company_name)

    return result


# ---------------------------------------------------------------------------
# Pure helper: case scenario from interview_plan.case_brief
# ---------------------------------------------------------------------------


def _build_case_scenario_from_plan(
    interview_plan: dict[str, Any],
    payload: InterviewStartRequest,
    setup: dict[str, Any],
) -> str:
    """case format の fallback opening 用シナリオ文を構築する pure helper。

    ``interview_plan["case_brief"]`` が存在し ``business_context`` と
    ``candidate_task`` を持つ場合はそこからケース題材を構成する。
    case_brief がない / パース失敗時は seed_summary / selected_industry で
    業界連動させ、最終的に汎用の小売チェーンシナリオにフォールバックする。
    """
    # 1) case_brief 参照 (try/except で保護)
    try:
        case_brief = interview_plan.get("case_brief") if isinstance(interview_plan, dict) else None
        if isinstance(case_brief, dict):
            biz_ctx = str(case_brief.get("business_context") or "").strip()
            candidate_task = str(case_brief.get("candidate_task") or "").strip()
            if biz_ctx and candidate_task:
                return f"{biz_ctx}。{candidate_task}"
    except Exception:
        pass  # パース失敗時は後続の固定シナリオにフォールバック

    # 2) seed_summary / selected_industry による業界連動 (既存ロジック維持)
    seed_summary = (getattr(payload, "seed_summary", None) or "").strip()
    selected_industry = (setup.get("selected_industry") or "").strip()
    scenario = "ある小売チェーンの売上が前年同期比で10%下がっているとします"
    if seed_summary:
        if "SaaS" in seed_summary or "サブスク" in seed_summary:
            scenario = "ある BtoB SaaS の新規契約数が前年同期比で15%下がっているとします"
        elif "製造" in seed_summary or "メーカー" in seed_summary:
            scenario = "あるメーカーの主力製品の出荷数が前年同期比で10%下がっているとします"
        elif "金融" in seed_summary or "銀行" in seed_summary:
            scenario = "ある地方銀行の個人向け新規口座開設数が前年同期比で12%下がっているとします"
        elif "広告" in seed_summary or "マーケティング" in seed_summary:
            scenario = "ある広告代理店の既存顧客の出稿額が前年同期比で10%下がっているとします"
    elif selected_industry:
        if "小売" in selected_industry:
            scenario = "ある小売チェーンの売上が前年同期比で10%下がっているとします"
        elif "製造" in selected_industry or "メーカー" in selected_industry:
            scenario = "あるメーカーの主力製品の出荷数が前年同期比で10%下がっているとします"
        elif "金融" in selected_industry or "銀行" in selected_industry:
            scenario = "ある地方銀行の個人向け新規口座開設数が前年同期比で12%下がっているとします"
        elif "IT" in selected_industry or "SaaS" in selected_industry:
            scenario = "ある BtoB SaaS の新規契約数が前年同期比で15%下がっているとします"
    return scenario


def _build_fallback_opening_payload(
    payload: InterviewStartRequest,
    interview_plan: dict[str, Any],
    setup: dict[str, Any],
) -> dict[str, Any]:
    company_name = payload.company_name
    selected_role_line = setup["selected_role_line"]
    interview_format = setup["interview_format"]
    opening_topic = str(interview_plan.get("opening_topic") or "motivation_fit")

    strictness = setup.get("strictness_mode", "standard")
    # strict/supportive で質問トーンを微調整するサフィックス/プレフィックス
    def _apply_tone(question: str) -> str:
        if strictness == "strict":
            return question + "前提も含めて、結論から順に論理立てて説明してください。"
        if strictness == "supportive":
            return question + "まずは思い浮かぶところから、一緒に整理しながら話してもらって大丈夫です。"
        return question

    def _with_intent_key(turn_meta: dict[str, Any]) -> dict[str, Any]:
        # 既存規約: `topic:followup_style`
        topic = str(turn_meta.get("topic") or "unknown")
        followup_style = str(turn_meta.get("followup_style") or "reason_check")
        turn_meta = {**turn_meta, "intent_key": f"{topic}:{followup_style}"}
        return turn_meta

    if interview_format == "case":
        # case_brief が interview_plan にあれば business_context + candidate_task で
        # シナリオを構成。パース失敗やキー欠落時は既存の固定シナリオにフォールバック。
        scenario = _build_case_scenario_from_plan(interview_plan, payload, setup)
        question = _apply_tone(
            f"ケース面接として、{scenario}。まず何から切り分けて考えますか。"
        )
        return {
            "question": question,
            "question_stage": "opening",
            "focus": "構造化と仮説の置き方",
            "interview_setup_note": "今回は論点分解と仮説の置き方を中心に見ます",
            "turn_meta": _with_intent_key({
                "topic": opening_topic if opening_topic != "motivation_fit" else "structured_thinking",
                "turn_action": "shift",
                "focus_reason": "ケース面接の基本である論点分解を確認するため",
                "depth_focus": "logic",
                "followup_style": "theme_choice_check",
                "should_move_next": False,
            }),
        }

    if interview_format == "technical":
        question = _apply_tone(
            f"これまでの開発経験の中で、{selected_role_line}として設計判断が難しかった題材を1つ選び、何をどう設計したかを順に説明してください。"
        )
        return {
            "question": question,
            "question_stage": "opening",
            "focus": "設計判断の理由",
            "interview_setup_note": "今回は専門性と設計判断の説明力を中心に見ます",
            "turn_meta": _with_intent_key({
                "topic": opening_topic if opening_topic != "motivation_fit" else "technical_depth",
                "turn_action": "shift",
                "focus_reason": "技術面接として設計判断の背景と責務を確認するため",
                "depth_focus": "logic",
                "followup_style": "technical_difficulty_check",
                "should_move_next": False,
            }),
        }

    if interview_format == "life_history":
        question = _apply_tone(
            "これまでの学生生活の中で、自分の価値観や行動のクセがはっきり見えた転機となった出来事を一つ選び、"
            "そのとき何が起き、あなたはどう考えどう動いたかを時系列で教えてください。"
        )
        return {
            "question": question,
            "question_stage": "opening",
            "focus": "転機と価値観の一貫性",
            "interview_setup_note": "今回は自分史として、転機・価値観・行動のつながりを中心に見ます",
            "turn_meta": _with_intent_key({
                "topic": opening_topic if opening_topic != "motivation_fit" else "life_narrative_core",
                "turn_action": "shift",
                "focus_reason": "自分史面接として、自己理解の核となるエピソードを確認するため",
                "depth_focus": "consistency",
                "followup_style": "value_change_check",
                "should_move_next": False,
            }),
        }

    question = _apply_tone(
        f"まず、なぜ{company_name}の{selected_role_line}を志望しているのか、これまでの経験とのつながりも含めて教えてください。"
    )
    return {
        "question": question,
        "question_stage": "opening",
        "focus": "志望理由の核",
        "interview_setup_note": "今回は志望理由の核と職種理解を中心に見ます",
        "turn_meta": _with_intent_key({
            "topic": opening_topic,
            "turn_action": "shift",
            "focus_reason": "初回導入として志望理由の核を確認するため",
            "depth_focus": "company_fit",
            "followup_style": "company_reason_check",
            "should_move_next": False,
        }),
    }


def _fallback_question_by_strictness(setup: dict[str, Any]) -> str:
    """strictness_mode に応じた fallback 質問文を返す pure helper。"""
    strictness = str(setup.get("strictness_mode") or "standard").strip()
    if strictness == "strict":
        return "前回の回答で述べた判断について、別の可能性を検討しましたか？"
    if strictness == "supportive":
        return "直前の経験について、特にうまくいった点をもう少し詳しく教えてください。"
    return "直前の経験について、具体的な場面と行動をもう少し詳しく教えてください。"


def _fallback_depth_focus_by_interviewer(setup: dict[str, Any]) -> str:
    """interviewer_type に応じた depth_focus を返す pure helper。"""
    interviewer = str(setup.get("interviewer_type") or "hr").strip()
    mapping = {
        "executive": "company_fit",
        "line_manager": "specificity",
        "hr": "consistency",
        "mixed_panel": "logic",
    }
    return mapping.get(interviewer, "specificity")


def _fallback_followup_style_by_interviewer(setup: dict[str, Any]) -> str:
    """interviewer_type に応じた followup_style を返す pure helper。"""
    interviewer = str(setup.get("interviewer_type") or "hr").strip()
    mapping = {
        "executive": "company_reason_check",
        "line_manager": "specificity_check",
        "hr": "consistency_check",
        "mixed_panel": "reason_check",
    }
    return mapping.get(interviewer, "reason_check")


def _build_fallback_turn_payload(
    payload: InterviewTurnRequest,
    interview_plan: dict[str, Any],
    setup: dict[str, Any],
    turn_state: dict[str, Any],
) -> dict[str, Any]:
    """/turn の LLM 失敗時に使う decision-deterministic fallback。

    setup から strictness_mode / interviewer_type を参照して質問文 /
    depth_focus / followup_style を個別化する。
    payload は将来の拡張余地のため受け取るが現時点では参照しない。
    """
    del payload  # 将来の拡張余地
    topic = str(interview_plan.get("opening_topic") or "motivation_fit").strip() or "motivation_fit"
    question = _fallback_question_by_strictness(setup)
    depth_focus = _fallback_depth_focus_by_interviewer(setup)
    followup_style = _fallback_followup_style_by_interviewer(setup)
    turn_meta = {
        "topic": topic,
        "turn_action": "deepen",
        "focus_reason": "計画に沿って深掘りするため",
        "depth_focus": depth_focus,
        "followup_style": followup_style,
        "intent_key": f"{topic}:{followup_style}",
        "should_move_next": False,
    }
    covered_topics = list(turn_state.get("coveredTopics") or [])
    remaining_topics = _normalize_string_list(interview_plan.get("must_cover_topics"))
    return {
        "question": question,
        "question_stage": "turn",
        "focus": "次の論点",
        "turn_meta": turn_meta,
        "plan_progress": {
            "covered_topics": covered_topics,
            "remaining_topics": remaining_topics,
        },
    }


def _build_fallback_continue_payload(
    payload: InterviewContinueRequest,
    interview_plan: dict[str, Any],
    setup: dict[str, Any],
    turn_state: dict[str, Any],
) -> dict[str, Any]:
    """/continue の LLM 失敗時に使う再開質問 fallback。"""
    del payload, interview_plan, setup, turn_state  # 現状は決定論文言のみ
    followup_style = "reason_check"
    topic = "motivation_fit"
    return {
        "question": "ここまでの講評を踏まえて、最も伸ばしたい点を 1 つ挙げ、その理由を教えてください。",
        "question_stage": topic,
        "focus": "再開",
        "transition_line": "それでは続きを始めます。",
        "turn_meta": {
            "topic": topic,
            "turn_action": "shift",
            "focus_reason": "講評を踏まえて再開するため",
            "depth_focus": "consistency",
            "followup_style": followup_style,
            "intent_key": f"{topic}:{followup_style}",
            "should_move_next": False,
        },
    }


# ---------------------------------------------------------------------------
# Opening-question format compatibility check
# ---------------------------------------------------------------------------


def _opening_question_matches_format(question: str, interview_format: str) -> bool:
    normalized = question.strip()
    if not normalized:
        return False
    if interview_format == "case":
        return any(keyword in normalized for keyword in ["ケース", "構造化", "仮説", "切り分け", "売上", "要因"])
    if interview_format == "technical":
        return any(keyword in normalized for keyword in ["設計", "実装", "開発", "技術", "アーキテクチャ", "システム"])
    if interview_format == "life_history":
        return any(
            keyword in normalized
            for keyword in ["転機", "価値観", "エピソード", "きっかけ", "自分史", "一貫", "行動", "学生生活"]
        )
    return True


def _normalize_question_text(question: str, company_name: str) -> str:
    normalized = re.sub(r"\s+", " ", question).strip()
    patterns = [
        r"^(本日は)?お疲れ(さま|様)です[。、]?\s*",
        r"^(本日は)?よろしくお願い(いた)?します[。、]?\s*",
        r"^こんにちは[。、]?\s*",
        r"^ようこそ[。、]?\s*",
        # Commentary/feedback prefix patterns
        r"^(なるほど|興味深い|良い点|素晴らしい|おっしゃる通り)[^。]*[。、]\s*",
        r"^(これまでの|先ほどの|今の)(お話|回答|ご回答|内容)[^。]*[。、]\s*",
        r"^[^。]{0,30}(一貫して|筋が通って|整合性が)[^。]*[。、]\s*",
        r"^(確かに|たしかに)[^。]*[。、]\s*",
        rf"^{re.escape(company_name)}の面接に臨むにあたり、?",
        rf"^{re.escape(company_name)}を受けるにあたって、?",
        rf"^{re.escape(company_name)}を志望するうえで、?",
        r"^この企業の面接に臨むにあたり、?",
        r"^今回の面接に臨むにあたり、?",
    ]
    for pattern in patterns:
        normalized = re.sub(pattern, "", normalized).strip()
    return normalized or question.strip()


# ---------------------------------------------------------------------------
# Feedback post-processing (default enrichment + backfill from conversation)
# ---------------------------------------------------------------------------


def _fallback_improvement_for_score(score_key: str) -> str:
    mapping = {
        "company_fit": "なぜこの会社なのかを他社比較まで含めて一言で言えるようにする",
        "role_fit": "志望職種で求められる役割と、自分の経験のつながりを具体化する",
        "specificity": "経験を話すときは状況・役割・行動・結果を数値や固有名詞で補強する",
        "logic": "結論から話し、理由と具体例を分けて説明する",
        "persuasiveness": "相手が納得しやすい根拠を先に置き、主張とのつながりを明示する",
        "consistency": "志望理由・経験・将来像のつながりを同じ軸で説明できるようにする",
        "credibility": "自分の関与範囲と再現性を必要以上に大きく見せずに説明する",
    }
    return mapping.get(score_key, "回答の根拠を具体化する")


def _fallback_preparation_for_score(score_key: str, weakest_question_type: str) -> str:
    mapping = {
        "company_fit": "『なぜこの会社か』を競合比較込みで30秒で言えるように整理する",
        "role_fit": "応募職種の役割と必要能力を、自分の経験に引きつけて説明できるようにする",
        "specificity": "代表エピソードを1つ選び、STARで60秒版と120秒版を作る",
        "logic": "結論→理由→具体例の順で話す練習をする",
        "persuasiveness": "主張ごとに根拠を1つずつ添えて話す練習をする",
        "consistency": "志望理由・ガクチカ・将来像の接続を1本のストーリーにまとめる",
        "credibility": "自分の役割・意思決定・成果を誇張なく説明できるよう事実を整理する",
    }
    if weakest_question_type == "case":
        return "ケース面接の基本として、論点分解と優先順位付けの型を3題ほど練習する"
    if weakest_question_type == "life_history":
        return "転機・価値観・具体行動を一本の線でつなぐ60秒版と120秒版の自分史を用意する"
    return mapping.get(score_key, "想定質問への回答を1分で言えるように整理する")


def _enrich_feedback_defaults(
    feedback: dict[str, Any],
    *,
    setup: dict[str, Any],
) -> dict[str, Any]:
    scores = feedback["scores"]
    ordered_score_keys = sorted(scores.keys(), key=lambda key: (scores[key], key))
    weakest_score_key = ordered_score_keys[0] if ordered_score_keys else "logic"

    if not feedback["overall_comment"]:
        feedback["overall_comment"] = (
            f"{setup['interview_format']} 面接として見ると、全体の方向性は大きく外していませんが、"
            f"{weakest_score_key} の観点で説明をもう一段具体化すると通過率を上げやすい状態です。"
        )

    if not feedback["improvements"]:
        feedback["improvements"] = [
            _fallback_improvement_for_score(score_key)
            for score_key in ordered_score_keys[:2]
        ]

    if not feedback["next_preparation"]:
        weakest_question_type = str(feedback.get("weakest_question_type") or "motivation")
        feedback["next_preparation"] = [
            _fallback_preparation_for_score(score_key, weakest_question_type)
            for score_key in ordered_score_keys[:2]
        ]

    if not feedback["consistency_risks"] and scores.get("consistency", 0) <= 4:
        feedback["consistency_risks"] = [
            "志望理由と経験のつながりが弱く見えるため、経験から志望理由への接続を一言で補強してください。"
        ]

    if not feedback["improved_answer"]:
        weakest_question = str(feedback.get("weakest_question_snapshot") or "").strip()
        weakest_answer = str(feedback.get("weakest_answer_snapshot") or "").strip()
        if weakest_question and weakest_answer:
            company_name = str(setup.get("company_name") or "企業").strip() or "企業"
            selected_role = str(setup.get("selected_role") or "").strip()
            # _build_setup は selected_role が空のとき sentinel "未設定" を詰めるため、
            # 文面上は志望者フレーズに畳む。
            if not selected_role or selected_role == "未設定":
                role_phrase = f"{company_name}の志望者として"
            else:
                role_phrase = f"{company_name}の{selected_role}として"
            feedback["improved_answer"] = (
                f"{weakest_question} への回答は、まず「{role_phrase}」"
                "という結論を示し、根拠となる経験、入社後に出したい価値を一文ずつつなぐ。"
            )
        else:
            feedback["improved_answer"] = ""

    feedback["improvements"] = feedback["improvements"][:3]
    feedback["next_preparation"] = feedback["next_preparation"][:3]
    feedback["consistency_risks"] = feedback["consistency_risks"][:3]

    # Phase 2 Stage 5: Evidence-Linked Rubric — LLM が 3 field を返さなかった / 部分欠落した場合の
    # deterministic fallback。各軸の evidence / rationale / confidence を 7 軸全てで補完する。
    evidence_map = feedback.get("score_evidence_by_axis")
    if not isinstance(evidence_map, dict):
        evidence_map = {}
    rationale_map = feedback.get("score_rationale_by_axis")
    if not isinstance(rationale_map, dict):
        rationale_map = {}
    confidence_map = feedback.get("confidence_by_axis")
    if not isinstance(confidence_map, dict):
        confidence_map = {}

    for axis in SEVEN_AXES:
        axis_evidence = evidence_map.get(axis) or []
        if not isinstance(axis_evidence, list):
            axis_evidence = []
        evidence_map[axis] = axis_evidence

        # evidence が空 かつ confidence 未設定 → low 固定
        if not axis_evidence and axis not in confidence_map:
            confidence_map[axis] = "low"
        elif confidence_map.get(axis) not in ("high", "medium", "low"):
            # 不正値は low に寄せる (evidence があっても LLM が誤出力した場合)
            confidence_map[axis] = "low"

        # rationale が空なら score に応じた暗黙デフォルトを入れる
        if not rationale_map.get(axis):
            score = int(scores.get(axis, 0) or 0)
            if score == 0:
                rationale_map[axis] = "evidence なし、評価不能"
            elif score <= 2:
                rationale_map[axis] = (
                    f"{axis} について根拠が薄く、他社でも通用する内容に留まる"
                )
            else:
                rationale_map[axis] = (
                    f"{axis} について具体性と論理の対応は確認できるが、深掘り余地あり"
                )

    feedback["score_evidence_by_axis"] = evidence_map
    feedback["score_rationale_by_axis"] = rationale_map
    feedback["confidence_by_axis"] = confidence_map
    return feedback


def _backfill_feedback_linkage_from_conversation(
    feedback: dict[str, Any],
    conversation_history: list[Message],
) -> dict[str, Any]:
    if (
        feedback.get("weakest_turn_id")
        and feedback.get("weakest_question_snapshot")
        and feedback.get("weakest_answer_snapshot")
    ):
        return feedback

    last_question = next(
        (message.content for message in reversed(conversation_history) if message.role == "assistant"),
        None,
    )
    last_answer = next(
        (message.content for message in reversed(conversation_history) if message.role == "user"),
        None,
    )
    assistant_count = sum(1 for message in conversation_history if message.role == "assistant")

    return {
        **feedback,
        "weakest_turn_id": feedback.get("weakest_turn_id") or (f"turn-{assistant_count}" if assistant_count > 0 else None),
        "weakest_question_snapshot": feedback.get("weakest_question_snapshot") or last_question,
        "weakest_answer_snapshot": feedback.get("weakest_answer_snapshot") or last_answer,
    }


# ---------------------------------------------------------------------------
# Coverage merge (LLM response + deterministic checklist closure)
# ---------------------------------------------------------------------------


def _merge_plan_progress(turn_state: dict[str, Any], data: dict[str, Any], turn_meta: dict[str, Any]) -> dict[str, Any]:
    llm_covered = _normalize_string_list(data.get("plan_progress", {}).get("covered_topics") if isinstance(data.get("plan_progress"), dict) else None)
    remaining = _normalize_string_list(data.get("plan_progress", {}).get("remaining_topics") if isinstance(data.get("plan_progress"), dict) else None)
    topic = str(turn_meta.get("topic") or "motivation_fit")
    covered = list(turn_state.get("coveredTopics") or [])
    coverage_state = list(turn_state.get("coverageState") or [])
    if coverage_state:
        updated_coverage_state: list[dict[str, Any]] = []
        next_turn_id = f"turn-{int(turn_state.get('turnCount', 0) or 0) + 1}"
        for item in coverage_state:
            item_topic = str(item.get("topic") or "").strip()
            required_checklist = _normalize_string_list(item.get("requiredChecklist"))
            passed_checklist = _normalize_string_list(item.get("passedChecklistKeys"))
            deterministic_passed = bool(item.get("deterministicCoveragePassed")) or (
                bool(required_checklist) and all(key in passed_checklist for key in required_checklist)
            )
            llm_hint = "covered" if item_topic in llm_covered else (str(item.get("llmCoverageHint") or "").strip() or None)
            status = str(item.get("status") or "pending").strip()
            if deterministic_passed:
                status = "covered"
            elif item_topic == topic:
                status = "active"
            elif status not in {"pending", "active", "covered", "exhausted"}:
                status = "pending"
            updated_coverage_state.append(
                {
                    **item,
                    "status": status,
                    "passedChecklistKeys": passed_checklist,
                    "deterministicCoveragePassed": deterministic_passed,
                    "llmCoverageHint": llm_hint,
                    "deepeningCount": int(item.get("deepeningCount", 0) or 0) + (1 if item_topic == topic else 0),
                    "lastCoveredTurnId": next_turn_id if deterministic_passed and item_topic == topic else item.get("lastCoveredTurnId"),
                }
            )
        coverage_state = updated_coverage_state
        covered = _covered_topics_from_coverage_state(coverage_state)
    if not remaining:
        interview_plan = turn_state.get("interviewPlan") or {}
        must_cover = _normalize_string_list(interview_plan.get("must_cover_topics"))
        remaining = [topic for topic in must_cover if topic not in covered]
    return {
        **turn_state,
        "coverageState": coverage_state,
        "coveredTopics": covered,
        "remainingTopics": remaining,
    }


# ---------------------------------------------------------------------------
# Version metadata helpers (Phase 2 Stage 0-3 — surfaced on SSE complete)
# ---------------------------------------------------------------------------


def _extract_case_seed_version(
    setup: dict[str, Any],
    interview_plan: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Phase 2 Stage 0-3: case 形式の面接で、使用した CaseBrief の case_seed_version を取り出す。

    Stage 3 (CASE_BRIEF_SCHEMA) で ``interview_plan["case_brief"]["case_seed_version"]``
    に値が入るようになる。それまでは全フォーマットで ``None`` を返す。
    """
    if str(setup.get("interview_format") or "").strip() != "case":
        return None
    plan = interview_plan or {}
    case_brief = plan.get("case_brief") if isinstance(plan, dict) else None
    if isinstance(case_brief, dict):
        value = case_brief.get("case_seed_version")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _version_metadata(
    setup: dict[str, Any],
    interview_plan: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Phase 2 Stage 0-3: SSE ``complete`` payload に含める世代メタデータを返す。"""
    return {
        "prompt_version": PROMPT_VERSION,
        "followup_policy_version": FOLLOWUP_POLICY_VERSION,
        "case_seed_version": _extract_case_seed_version(setup, interview_plan),
    }


__all__ = [
    "SEVEN_AXES",
    "_checklist_for_topic",
    "_build_initial_coverage_state",
    "_normalize_recent_question_summaries_v2",
    "_normalize_coverage_state",
    "_covered_topics_from_coverage_state",
    "_build_question_summary",
    "_build_recent_question_summary_v2",
    "_normalize_interview_plan",
    "_normalize_turn_meta",
    "_normalize_feedback",
    "_normalize_turn_state",
    "_derive_turn_state_for_question",
    "_fallback_plan",
    "_select_case_brief",
    "_load_case_brief_preset",
    "_fallback_turn_meta",
    "detect_answer_gap",
    "_fallback_short_coaching",
    "_build_case_scenario_from_plan",
    "_fallback_question_by_strictness",
    "_fallback_depth_focus_by_interviewer",
    "_fallback_followup_style_by_interviewer",
    "_build_fallback_opening_payload",
    "_build_fallback_turn_payload",
    "_build_fallback_continue_payload",
    "_opening_question_matches_format",
    "_normalize_question_text",
    "_fallback_improvement_for_score",
    "_fallback_preparation_for_score",
    "_enrich_feedback_defaults",
    "_backfill_feedback_linkage_from_conversation",
    "_merge_plan_progress",
    "_extract_case_seed_version",
    "_version_metadata",
]
