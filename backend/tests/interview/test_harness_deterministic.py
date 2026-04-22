"""
backend/tests/interview/test_harness_deterministic.py

Phase 2 Stage 0-2: 24 ケース × 4 test = 96 assertion (deterministic + forbidden)

CI で毎回実行。LLM 呼出しは一切行わない。
"""

from __future__ import annotations

from typing import Any

import pytest

from app.routers.interview import (
    _build_fallback_opening_payload,
    _build_setup,
    _fallback_plan,
    _fallback_turn_meta,
)
from app.prompts.interview_prompts import PROMPT_VERSION, FOLLOWUP_POLICY_VERSION
from tests.interview.harness.evaluator import (
    QUESTION_STAGE_ALLOWLIST,
    _TOKEN_BUDGET_CURRENT,
    check_deterministic,
    check_forbidden_in_text,
    collect_prompt_tokens,
    load_snapshot,
    save_snapshot,
)
from tests.interview.harness.fixtures import (
    HARNESS_CASES,
    make_start_payload,
    make_turn_payload,
)


# ---------------------------------------------------------------------------
# pytest-mark 登録
# slow / llm_judge は pytest.ini に登録済み
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("case", HARNESS_CASES, ids=[f"case_{c['case_id']}" for c in HARNESS_CASES])
class TestHarnessDeterministic:
    """Layer 1: Deterministic checks — CI で毎回実行。"""

    def test_turn_meta_intent_key_schema(self, case: dict[str, Any]) -> None:
        """_fallback_opening_payload の turn_meta.intent_key が `topic:followup_style` 規約に従う。"""
        violations = check_deterministic(case)
        # intent_key 関連の違反のみ抽出 (他のチェックは別テストで扱う)
        intent_violations = [v for v in violations if "intent_key" in v]
        assert not intent_violations, f"Intent key violations: {intent_violations}"

    def test_turn_meta_required_fields(self, case: dict[str, Any]) -> None:
        """_fallback_turn_meta の戻り値が必須フィールドを全て持つ。

        必須フィールド: topic, turn_action, focus_reason, depth_focus, followup_style, should_move_next
        """
        cid = case["case_id"]
        start = make_start_payload(cid)
        turn = make_turn_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        turn_state = turn.turn_state or {}
        turn_meta = _fallback_turn_meta(turn_state, plan, setup)

        required_fields = {"topic", "turn_action", "focus_reason", "depth_focus", "followup_style", "should_move_next"}
        missing = required_fields - set(turn_meta.keys())
        assert not missing, f"case {cid}: _fallback_turn_meta に必須フィールドがない: {sorted(missing)}"

        # 値の型チェック
        assert isinstance(turn_meta["topic"], str) and turn_meta["topic"], f"case {cid}: topic が空"
        assert turn_meta["turn_action"] in {"ask", "deepen", "shift"}, (
            f"case {cid}: turn_action={turn_meta['turn_action']!r} が不正"
        )
        assert turn_meta["depth_focus"] in {
            "company_fit", "role_fit", "specificity", "logic",
            "persuasiveness", "consistency", "credibility",
        }, f"case {cid}: depth_focus={turn_meta['depth_focus']!r} が不正"
        assert isinstance(turn_meta["should_move_next"], bool), (
            f"case {cid}: should_move_next が bool でない"
        )

    def test_question_stage_in_allowlist(self, case: dict[str, Any]) -> None:
        """_build_fallback_opening_payload の question_stage が outward allowlist に通る。

        allowlist: opening, turn, experience, company_understanding, motivation_fit, role_reason
        """
        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        payload = _build_fallback_opening_payload(start, plan, setup)

        question_stage = payload.get("question_stage", "")
        assert question_stage in QUESTION_STAGE_ALLOWLIST, (
            f"case {cid}: question_stage={question_stage!r} が allowlist 外。"
            f"allowlist={sorted(QUESTION_STAGE_ALLOWLIST)}"
        )

    def test_prompt_tokens_recorded(self, case: dict[str, Any]) -> None:
        """5 builder のトークン数を記録し、現状 budget 上限 (記録のみ) を超えないか確認する。

        Stage 1 で厳格化予定。現状は警告のみで fail させない。
        """
        cid = case["case_id"]
        tokens = collect_prompt_tokens(case)

        # 全 builder が計測できていること
        assert set(tokens.keys()) == {"plan", "opening", "turn", "continue", "feedback"}, (
            f"case {cid}: 期待する builder キーがない: {set(tokens.keys())}"
        )
        for builder, count in tokens.items():
            assert isinstance(count, int) and count > 0, (
                f"case {cid}: {builder} のトークン数が不正: {count}"
            )

        # 現状 budget (3000/3200/3800/3000/2900) を超えているものを記録
        # Stage 1 で厳格化するため、ここでは fail させず warn のみ
        budget_violations = []
        for builder, budget in _TOKEN_BUDGET_CURRENT.items():
            actual = tokens[builder]
            if actual > budget:
                budget_violations.append(
                    f"{builder}: {actual} tokens > budget {budget}"
                )
        if budget_violations:
            import warnings
            warnings.warn(
                f"case {cid} prompt token budget 超過 (Stage 1 で厳格化予定): {budget_violations}",
                stacklevel=2,
            )
        # この時点では fail しない


@pytest.mark.parametrize("case", HARNESS_CASES, ids=[f"case_{c['case_id']}" for c in HARNESS_CASES])
class TestHarnessForbidden:
    """Layer 2: Forbidden checks — CI で毎回実行。"""

    def test_forbidden_discriminatory_patterns_not_in_fallback_questions(
        self, case: dict[str, Any]
    ) -> None:
        """fallback opening payload の質問文に差別禁止パターンが含まれない。

        検証対象パターン (厚労省 14 事項):
          本籍, 出生地, 家族の(職業|続柄|健康|地位|学歴|収入|資産),
          (父|母|兄|姉|弟|妹)[はが](?:どこ|何を|どう),
          住宅(?:は|の)(?:間取り|部屋数|種類|近隣),
          (?:支持|支援)政党, (?:思想|信条|人生観|生活信条),
          (?:尊敬する人物|愛読(?:書|する本)|購読(?:新聞|雑誌)),
          労働組合, 学生運動, (?:結婚|出産)の予定,
          (?:お子さん|子供)はいますか, 身元調査, (?:宗教|信仰)(?!学)
        """
        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        payload = _build_fallback_opening_payload(start, plan, setup)

        question = payload.get("question", "")
        assert question, f"case {cid}: question が空"

        violations = check_forbidden_in_text(question)
        # 差別禁止パターンの違反のみ抽出
        discriminatory_violations = [v for v in violations if "差別禁止パターン" in v]
        assert not discriminatory_violations, (
            f"case {cid}: 差別禁止パターン検出:\n" + "\n".join(discriminatory_violations)
        )

    def test_no_unreplaced_placeholders_in_fallback_questions(
        self, case: dict[str, Any]
    ) -> None:
        """fallback opening payload の質問文に未置換 placeholder が含まれない。

        検証: <未回答>, <placeholder>, {some_var} などのテンプレート残留がない。
        """
        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        payload = _build_fallback_opening_payload(start, plan, setup)

        question = payload.get("question", "")
        violations = check_forbidden_in_text(question)
        placeholder_violations = [v for v in violations if "未置換 placeholder" in v]
        assert not placeholder_violations, (
            f"case {cid}: 未置換 placeholder 検出:\n" + "\n".join(placeholder_violations)
        )


# ---------------------------------------------------------------------------
# Layer 3: LLM judge (CI 外 — --run-llm フラグが必要)
# ---------------------------------------------------------------------------


def pytest_addoption_collector(parser: Any) -> None:
    """--run-llm オプションを pytest に登録するためのフック (conftest から呼ばれる想定)。"""
    parser.addoption(
        "--run-llm",
        action="store_true",
        default=False,
        help="LLM judge テストを実行する (cost があるため CI 外)",
    )


@pytest.mark.slow
@pytest.mark.llm_judge
@pytest.mark.parametrize("case", HARNESS_CASES, ids=[f"case_{c['case_id']}" for c in HARNESS_CASES])
class TestHarnessLLMJudge:
    """Layer 3: LLM judge — 夜間バッチ・週次のみ。CI では skip。

    手動実行: pytest tests/interview/test_harness_deterministic.py -m llm_judge --run-llm
    """

    @pytest.mark.skip(reason="--run-llm フラグが必要。手動実行: pytest -m llm_judge --run-llm")
    def test_question_reflects_format_and_strictness(self, case: dict[str, Any]) -> None:
        """生成された質問が interview_format / strictness_mode / interviewer_type を反映しているか
        LLM judge で 1-5 採点し、4+ で pass とする。

        NOTE: 実際の LLM 呼出しと採点ロジックは Stage 5 以降で実装。
        現時点はスキーマとプレースホルダーのみ。
        """
        from tests.interview.harness.evaluator import make_llm_judge_prompt

        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        payload = _build_fallback_opening_payload(start, plan, setup)
        question = payload.get("question", "")

        judge_prompt = make_llm_judge_prompt(case, question)
        assert judge_prompt, f"case {cid}: judge_prompt が空"

        # TODO: Stage 5 で実装 — call_llm_streaming_fields でスコア取得
        # result = await call_llm_for_judge(judge_prompt)
        # assert result["score"] >= 4, f"case {cid}: LLM judge score={result['score']} < 4"
        pytest.skip("Stage 5 で LLM 呼出しを実装")


# ---------------------------------------------------------------------------
# Layer 3 — Evidence checks (Stage 5 実装後に有効化)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="Stage 5 で実装 — score_evidence_by_axis が feedback schema に追加されてから")
def test_feedback_evidence_not_empty_per_axis() -> None:
    """feedback の score_evidence_by_axis が各軸で少なくとも 1 evidence を持つ。

    Stage 5 で Evidence-Linked Rubric が実装されたら skip を外す。
    """
    pass


# ---------------------------------------------------------------------------
# Snapshot generation (pytest --snapshot-update 相当の手動更新対応)
# ---------------------------------------------------------------------------


def test_snapshot_prompt_tokens_baseline(snapshot_update: bool = False) -> None:
    """全 24 ケースの prompt token count を snapshots/prompt_tokens_baseline.json に保存する。

    初回実行時: スナップショットを新規作成。
    snapshot_update=True 時: 差分を更新。
    通常 CI: 既存スナップショットとの比較 (token 数の記録のみ、現状 fail させない)。
    """
    baseline: dict[str, dict[str, int]] = {}
    for case in HARNESS_CASES:
        cid = case["case_id"]
        tokens = collect_prompt_tokens(case)
        baseline[f"case_{cid}"] = tokens

    existing = load_snapshot("prompt_tokens_baseline")
    if not existing or snapshot_update:
        save_snapshot("prompt_tokens_baseline", baseline)
        return  # 新規作成/更新時はチェックをスキップ

    # 既存スナップショットとの比較 (現状は fail させず warn のみ)
    diffs = []
    for key, tokens in baseline.items():
        if key not in existing:
            diffs.append(f"{key}: スナップショットに存在しない (新規ケース?)")
            continue
        for builder, count in tokens.items():
            old = existing[key].get(builder, 0)
            if old > 0 and abs(count - old) > 50:  # 50 token 以上の変動を記録
                diffs.append(f"{key}.{builder}: {old} → {count} (差分: {count - old:+d})")

    if diffs:
        import warnings
        warnings.warn(
            f"prompt token baseline との差分 (Stage 1 で厳格化予定):\n" + "\n".join(diffs),
            stacklevel=2,
        )
    # 現状は fail させない — スナップショット更新は手動


def test_snapshot_fallback_plan() -> None:
    """全 24 ケースの _fallback_plan() 戻り値を snapshots/fallback_plan_snapshots.json に保存する。"""
    data: dict[str, dict] = {}
    for case in HARNESS_CASES:
        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        data[f"case_{cid}"] = plan

    existing = load_snapshot("fallback_plan_snapshots")
    if not existing:
        save_snapshot("fallback_plan_snapshots", data)
        return

    # 既存スナップショットが存在する場合は must_cover_topics の変化を検出
    diffs = []
    for key, plan in data.items():
        if key not in existing:
            diffs.append(f"{key}: スナップショットに存在しない")
            continue
        old_must = set(existing[key].get("must_cover_topics", []))
        new_must = set(plan.get("must_cover_topics", []))
        if old_must != new_must:
            diffs.append(
                f"{key}.must_cover_topics: 追加={sorted(new_must - old_must)}, 削除={sorted(old_must - new_must)}"
            )

    if diffs:
        import warnings
        warnings.warn(
            f"fallback_plan snapshot との差分:\n" + "\n".join(diffs),
            stacklevel=2,
        )


def test_snapshot_fallback_turn_meta() -> None:
    """全 24 ケースの _fallback_turn_meta(setup=setup) 戻り値を snapshots/fallback_turn_meta_snapshots.json に保存する。"""
    data: dict[str, dict] = {}
    for case in HARNESS_CASES:
        cid = case["case_id"]
        start = make_start_payload(cid)
        turn = make_turn_payload(cid)
        setup = _build_setup(start)
        plan = _fallback_plan(start, setup)
        turn_state = turn.turn_state or {}
        turn_meta = _fallback_turn_meta(turn_state, plan, setup)
        data[f"case_{cid}"] = turn_meta

    existing = load_snapshot("fallback_turn_meta_snapshots")
    if not existing:
        save_snapshot("fallback_turn_meta_snapshots", data)
        return

    diffs = []
    for key, meta in data.items():
        if key not in existing:
            diffs.append(f"{key}: スナップショットに存在しない")
            continue
        for field in ("turn_action", "depth_focus", "followup_style"):
            old_val = existing[key].get(field)
            new_val = meta.get(field)
            if old_val != new_val:
                diffs.append(f"{key}.{field}: {old_val!r} → {new_val!r}")

    if diffs:
        import warnings
        warnings.warn(
            f"fallback_turn_meta snapshot との差分:\n" + "\n".join(diffs),
            stacklevel=2,
        )


def test_snapshot_fallback_checklist() -> None:
    """代表 3 topic の _checklist_for_topic() 戻り値を snapshots/fallback_checklist_snapshots.json に保存する。"""
    from app.routers.interview import _checklist_for_topic

    # 代表 3 topic: format ごとに主要 topic を選択
    REPRESENTATIVE_TOPICS = ["motivation_fit", "technical_depth", "life_narrative_core"]

    data: dict[str, dict[str, list[str]]] = {}
    for case in HARNESS_CASES:
        cid = case["case_id"]
        start = make_start_payload(cid)
        setup = _build_setup(start)
        case_data: dict[str, list[str]] = {}
        for topic in REPRESENTATIVE_TOPICS:
            case_data[topic] = _checklist_for_topic(topic, setup)
        data[f"case_{cid}"] = case_data

    existing = load_snapshot("fallback_checklist_snapshots")
    if not existing:
        save_snapshot("fallback_checklist_snapshots", data)
        return

    diffs = []
    for key, topics_map in data.items():
        if key not in existing:
            diffs.append(f"{key}: スナップショットに存在しない")
            continue
        for topic, checklist in topics_map.items():
            old_checklist = existing[key].get(topic, [])
            if checklist != old_checklist:
                diffs.append(f"{key}.{topic}: {old_checklist} → {checklist}")

    if diffs:
        import warnings
        warnings.warn(
            f"fallback_checklist snapshot との差分:\n" + "\n".join(diffs),
            stacklevel=2,
        )


# ---------------------------------------------------------------------------
# Version metadata 検証
# ---------------------------------------------------------------------------


def test_prompt_version_constants_exist() -> None:
    """PROMPT_VERSION / FOLLOWUP_POLICY_VERSION が interview_prompts.py に定義済みか確認する。"""
    assert PROMPT_VERSION, "PROMPT_VERSION が空"
    assert FOLLOWUP_POLICY_VERSION, "FOLLOWUP_POLICY_VERSION が空"
    assert PROMPT_VERSION == "2026-04-21-phase3-quality", (
        f"PROMPT_VERSION が期待値と異なる: {PROMPT_VERSION!r}"
    )
    assert FOLLOWUP_POLICY_VERSION == "v1.0", (
        f"FOLLOWUP_POLICY_VERSION が期待値と異なる: {FOLLOWUP_POLICY_VERSION!r}"
    )
