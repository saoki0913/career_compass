"""
backend/tests/interview/harness/evaluator.py

Phase 2 Stage 0-2: 4 層評価のユーティリティ群。

評価層:
  Layer 1 — Deterministic checks (CI で毎回)
  Layer 2 — Forbidden checks (CI で毎回)
  Layer 3 — LLM judge (夜間バッチ・週次、CI 外)
  Layer 4 — Score drift / prompt token baseline (週次)

公開 API:
  check_deterministic(case) -> list[str]
  check_forbidden_in_text(text) -> list[str]
  collect_prompt_tokens(case) -> dict[str, int]
  make_llm_judge_prompt(case, question) -> str
  load_snapshot(name) -> dict
  save_snapshot(name, data) -> None
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import tiktoken

from app.routers.interview import (
    InterviewContinueRequest,
    _build_continue_prompt,
    _build_feedback_prompt,
    _build_opening_prompt,
    _build_plan_prompt,
    _build_setup,
    _build_turn_prompt,
    _fallback_plan,
    _fallback_turn_meta,
)
from tests.interview.harness.fixtures import make_feedback_payload, make_start_payload, make_turn_payload

# ---------------------------------------------------------------------------
# Snapshot ストレージ
# ---------------------------------------------------------------------------

_SNAPSHOTS_DIR = Path(__file__).parent / "snapshots"


def load_snapshot(name: str) -> dict:
    """snapshots/{name}.json を読み込む。存在しない場合は空 dict を返す。"""
    path = _SNAPSHOTS_DIR / f"{name}.json"
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_snapshot(name: str, data: dict) -> None:
    """snapshots/{name}.json に書き出す (indent=2, ensure_ascii=False)。"""
    _SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    path = _SNAPSHOTS_DIR / f"{name}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


# ---------------------------------------------------------------------------
# Layer 1: Deterministic checks
# ---------------------------------------------------------------------------

# turn_meta の必須フィールド (opening / turn 共通)
_TURN_META_REQUIRED_FIELDS = frozenset(
    {"topic", "turn_action", "focus_reason", "depth_focus", "followup_style", "should_move_next"}
)

# question_stage の outward allowlist (Phase 1 規約)
QUESTION_STAGE_ALLOWLIST = frozenset(
    {"opening", "turn", "experience", "company_understanding", "motivation_fit", "role_reason"}
)

# depth_focus の許容値
_DEPTH_FOCUS_ALLOWLIST = frozenset(
    {"company_fit", "role_fit", "specificity", "logic", "persuasiveness", "consistency", "credibility"}
)

# turn_action の許容値
_TURN_ACTION_ALLOWLIST = frozenset({"ask", "deepen", "shift"})

# prompt token の hot path budget.
# Phase 2 Stage 1 で hard gate 化済。詳細は `test_prompt_budget.py` を参照。
# ここの定数は legacy warn-only `test_prompt_tokens_recorded` から参照される。
# hard gate は Stage 1 の最終 budget に一致させる。
_TOKEN_BUDGET_CURRENT: dict[str, int] = {
    "plan": 1_200,
    "opening": 2_000,
    "turn": 2_500,
    "continue": 1_800,
    "feedback": 2_800,
}

# intent_key スキーマ: `topic:followup_style` 形式
_INTENT_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$")


def _check_intent_key_schema(intent_key: str) -> str | None:
    """intent_key が `topic:followup_style` 規約に従うか検証する。
    違反があれば violation メッセージを返す。None なら pass。
    """
    if not isinstance(intent_key, str) or not intent_key:
        return f"intent_key が空または非文字列: {intent_key!r}"
    if not _INTENT_KEY_PATTERN.match(intent_key):
        return f"intent_key が `topic:followup_style` 規約 (^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$) に違反: {intent_key!r}"
    return None


def check_deterministic(case: dict[str, Any]) -> list[str]:
    """Layer 1 の deterministic チェックを実行し、violation メッセージのリストを返す。

    空リストは全 pass を意味する。
    """
    violations: list[str] = []
    case_id: int = case["case_id"]

    start = make_start_payload(case_id)
    turn = make_turn_payload(case_id)
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)
    turn_state = turn.turn_state or {}
    turn_meta = _fallback_turn_meta(turn_state, plan, setup)

    # ---- (a) _fallback_plan の必須フィールド ----
    for field in ("interview_type", "priority_topics", "opening_topic", "must_cover_topics", "risk_topics"):
        if field not in plan:
            violations.append(f"case {case_id}: _fallback_plan に必須フィールド {field!r} がない")
        elif field in ("priority_topics", "must_cover_topics", "risk_topics"):
            if not isinstance(plan[field], list):
                violations.append(f"case {case_id}: _fallback_plan[{field!r}] がリストでない")

    # ---- (b) _fallback_turn_meta の必須フィールド ----
    missing_fields = _TURN_META_REQUIRED_FIELDS - set(turn_meta.keys())
    if missing_fields:
        violations.append(f"case {case_id}: _fallback_turn_meta に必須フィールドがない: {sorted(missing_fields)}")

    # ---- (c) turn_meta.turn_action が許容値か ----
    turn_action = turn_meta.get("turn_action", "")
    if turn_action not in _TURN_ACTION_ALLOWLIST:
        violations.append(f"case {case_id}: turn_action が不正値: {turn_action!r}")

    # ---- (d) turn_meta.depth_focus が許容値か ----
    depth_focus = turn_meta.get("depth_focus", "")
    if depth_focus not in _DEPTH_FOCUS_ALLOWLIST:
        violations.append(f"case {case_id}: depth_focus が不正値: {depth_focus!r}")

    # ---- (e) fallback opening payload の turn_meta.intent_key 規約 ----
    from app.routers.interview import _build_fallback_opening_payload

    opening_payload = _build_fallback_opening_payload(start, plan, setup)
    opening_turn_meta = opening_payload.get("turn_meta", {})

    intent_key = opening_turn_meta.get("intent_key", "")
    violation = _check_intent_key_schema(intent_key)
    if violation:
        violations.append(f"case {case_id}: opening payload {violation}")

    # ---- (f) opening の question_stage が outward allowlist に通るか ----
    question_stage = opening_payload.get("question_stage", "")
    if question_stage not in QUESTION_STAGE_ALLOWLIST:
        violations.append(
            f"case {case_id}: opening question_stage={question_stage!r} が allowlist 外"
        )

    # ---- (g) fallback turn payload の intent_key 規約 ----
    from app.routers.interview import _build_fallback_turn_payload

    turn_payload = _build_fallback_turn_payload(turn, plan, setup, turn_state)
    turn_payload_meta = turn_payload.get("turn_meta", {})
    turn_intent_key = turn_payload_meta.get("intent_key", "")
    turn_violation = _check_intent_key_schema(turn_intent_key)
    if turn_violation:
        violations.append(f"case {case_id}: fallback turn payload {turn_violation}")

    # ---- (h) fallback turn payload の question_stage が allowlist に通るか ----
    turn_question_stage = turn_payload.get("question_stage", "")
    if turn_question_stage not in QUESTION_STAGE_ALLOWLIST:
        violations.append(
            f"case {case_id}: fallback turn question_stage={turn_question_stage!r} が allowlist 外"
        )

    return violations


# ---------------------------------------------------------------------------
# Layer 2: Forbidden checks
# ---------------------------------------------------------------------------

# 厚労省 14 事項の差別禁止 regex (false positive を最小化)
FORBIDDEN_DISCRIMINATORY_PATTERNS: list[str] = [
    r"本籍",
    r"出生地",
    r"家族の(職業|続柄|健康|地位|学歴|収入|資産)",
    r"(父|母|兄|姉|弟|妹)[はが](?:どこ|何を|どう)",
    r"住宅(?:は|の)(?:間取り|部屋数|種類|近隣)",
    r"(?:支持|支援)政党",
    r"(?:思想|信条|人生観|生活信条)",
    r"(?:尊敬する人物|愛読(?:書|する本)|購読(?:新聞|雑誌))",
    r"労働組合",
    r"学生運動",
    r"(?:結婚|出産)の予定",
    r"(?:お子さん|子供)はいますか",
    r"身元調査",
    r"(?:宗教|信仰)(?!学)",  # 「宗教学」などアカデミック文脈を除外
]

# 未置換 placeholder の regex
_PLACEHOLDER_PATTERNS: list[str] = [
    r"<未回答>",
    r"<placeholder>",
    r"\{[a-zA-Z_][a-zA-Z0-9_]*\}",  # {some_var} のような未展開テンプレート
]

# 人物名の regex (stub — Phase 2 後半で完全実装)
# 現状は「苗字+さん」の典型例のみ検出 (false positive を避けるため最低限)
_PERSON_NAME_STUB_PATTERNS: list[str] = [
    r"(?:田中|山田|佐藤|鈴木|高橋|渡辺)(?:さん|様|氏)",
]

_compiled_forbidden: list[re.Pattern[str]] = [
    re.compile(p) for p in FORBIDDEN_DISCRIMINATORY_PATTERNS
]
_compiled_placeholder: list[re.Pattern[str]] = [
    re.compile(p) for p in _PLACEHOLDER_PATTERNS
]
_compiled_person: list[re.Pattern[str]] = [
    re.compile(p) for p in _PERSON_NAME_STUB_PATTERNS
]


def check_forbidden_in_text(text: str) -> list[str]:
    """Layer 2 の forbidden チェックを実行し、検出された violation メッセージのリストを返す。

    空リストは全 pass を意味する。

    検査内容:
      - FORBIDDEN_DISCRIMINATORY_PATTERNS (厚労省 14 事項)
      - 未置換 placeholder
      - 人物名 (stub; 典型的な苗字+敬称のみ)
    """
    violations: list[str] = []
    if not text:
        return violations

    for pattern in _compiled_forbidden:
        m = pattern.search(text)
        if m:
            violations.append(f"差別禁止パターン検出 [{pattern.pattern!r}]: {m.group()!r}")

    for pattern in _compiled_placeholder:
        m = pattern.search(text)
        if m:
            violations.append(f"未置換 placeholder 検出 [{pattern.pattern!r}]: {m.group()!r}")

    for pattern in _compiled_person:
        m = pattern.search(text)
        if m:
            violations.append(f"人物名 (stub) 検出 [{pattern.pattern!r}]: {m.group()!r}")

    return violations


# ---------------------------------------------------------------------------
# Layer 4: Token counting
# ---------------------------------------------------------------------------

_enc: tiktoken.Encoding | None = None


def _get_encoder() -> tiktoken.Encoding:
    global _enc
    if _enc is None:
        _enc = tiktoken.get_encoding("cl100k_base")
    return _enc


def _count_tokens(text: str) -> int:
    return len(_get_encoder().encode(text))


def collect_prompt_tokens(case: dict[str, Any]) -> dict[str, int]:
    """全 5 builder の prompt token count を返す。

    Returns:
        {"plan": int, "opening": int, "turn": int, "continue": int, "feedback": int}
    """
    case_id: int = case["case_id"]
    start = make_start_payload(case_id)
    turn_req = make_turn_payload(case_id)
    feedback_req = make_feedback_payload(case_id)
    setup = _build_setup(start)
    plan = _fallback_plan(start, setup)
    turn_state = turn_req.turn_state or {}
    turn_meta = _fallback_turn_meta(turn_state, plan, setup)

    plan_prompt = _build_plan_prompt(start)
    opening_prompt = _build_opening_prompt(start, plan)
    turn_prompt = _build_turn_prompt(turn_req, plan, turn_state, turn_meta)
    feedback_prompt = _build_feedback_prompt(feedback_req)

    # continue prompt には InterviewContinueRequest が必要
    continue_req = InterviewContinueRequest(
        company_name=start.company_name,
        company_summary=start.company_summary,
        motivation_summary=start.motivation_summary,
        gakuchika_summary=start.gakuchika_summary,
        academic_summary=start.academic_summary,
        research_summary=start.research_summary,
        es_summary=start.es_summary,
        selected_industry=start.selected_industry,
        selected_role=start.selected_role,
        selected_role_source=start.selected_role_source,
        role_track=start.role_track,
        interview_format=start.interview_format,
        selection_type=start.selection_type,
        interview_stage=start.interview_stage,
        interviewer_type=start.interviewer_type,
        strictness_mode=start.strictness_mode,
        conversation_history=turn_req.conversation_history,
        turn_state=turn_req.turn_state,
    )
    continue_prompt = _build_continue_prompt(continue_req)

    return {
        "plan": _count_tokens(plan_prompt),
        "opening": _count_tokens(opening_prompt),
        "turn": _count_tokens(turn_prompt),
        "continue": _count_tokens(continue_prompt),
        "feedback": _count_tokens(feedback_prompt),
    }


# ---------------------------------------------------------------------------
# Layer 3: LLM judge (夜間バッチ・週次、CI 外)
# ---------------------------------------------------------------------------

def make_llm_judge_prompt(case: dict[str, Any], question: str) -> str:
    """Layer 3 で使う LLM judge prompt を組み立てる。

    Args:
        case: HARNESS_CASES の 1 エントリ。
        question: 評価対象の質問文。

    Returns:
        Claude Sonnet 4.6 に渡すプロンプト文字列。
    """
    return f"""以下は面接 AI の質問です。設定情報を踏まえて、この質問が設定を反映しているか 1-5 で採点してください:

# 設定
- 面接方式: {case['format']}
- 面接段階: {case['stage']}
- 面接官タイプ: {case['interviewer']}
- 厳しさ: {case['strictness']}

# 生成された質問
{question}

# 採点基準
- 5: 設定の特徴が明確に反映 (例: strict なら圧迫寄り、executive なら経営視点)
- 4: 設定の特徴が 1-2 点反映
- 3: 一部反映されているが一般的すぎる
- 2: 設定と無関係な一般的質問
- 1: 設定と矛盾

# 出力
{{"score": 1-5, "reasoning": "..."}}"""
