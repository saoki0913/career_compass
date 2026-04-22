"""Phase 2 Stage 7 — Weakness drill tests.

drill/start と drill/score の決定論 (prompt builder) と、FastAPI endpoint の
最小動作 (LLM モンキーパッチ → 4 field 返却 / delta 計算) を検証する。

LLM 呼び出しは `call_llm_with_error` を直接モンキーパッチして回避する。
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers._interview import endpoints as _drill_endpoints
from app.routers.interview import (
    SEVEN_AXIS_KEYS,
    InterviewDrillScoreRequest,
    InterviewDrillStartRequest,
    _build_drill_score_prompt,
    _build_drill_start_prompt,
    _coerce_retry_scores,
)
from app.security.internal_service import require_internal_service


@pytest.fixture(autouse=True)
def _bypass_internal_auth():
    """Drill endpoints are mounted behind ``require_internal_service``. Bypass
    the JWT check in tests so POST requests don't need a valid internal token.
    """
    app.dependency_overrides[require_internal_service] = lambda: {
        "service": "next-bff",
        "mode": "test",
    }
    yield
    app.dependency_overrides.pop(require_internal_service, None)


# ---------------------------------------------------------------------------
# Prompt builder determinism tests
# ---------------------------------------------------------------------------


def _make_drill_start_payload(**kwargs: Any) -> InterviewDrillStartRequest:
    defaults = dict(
        conversation_id="conv-001",
        weakest_turn_id="turn-3",
        weakest_question="なぜ当社を志望していますか。",
        weakest_answer="事業の社会性に惹かれたからです。",
        weakest_axis="company_fit",
        original_score=2,
        weakest_evidence=["事業の社会性"],
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        selected_role="コンサルタント",
        interview_format="standard_behavioral",
        interviewer_type="hr",
        strictness_mode="standard",
    )
    defaults.update(kwargs)
    return InterviewDrillStartRequest(**defaults)


def _make_drill_score_payload(**kwargs: Any) -> InterviewDrillScoreRequest:
    defaults = dict(
        conversation_id="conv-001",
        weakest_turn_id="turn-3",
        retry_question="もう一度、当社だからこそ志望する理由を具体的に教えてください。",
        retry_answer=(
            "御社の DX 事業は中小製造業の在庫回転率 15% 改善という成果があり、"
            "学生時代に在庫最適化を研究してきた自分の知見を最も活かせると考えました。"
        ),
        original_scores={
            "company_fit": 2,
            "role_fit": 3,
            "specificity": 2,
            "logic": 3,
            "persuasiveness": 3,
            "consistency": 3,
            "credibility": 3,
        },
        weakest_axis="company_fit",
        company_name="テスト株式会社",
        company_summary="DX 支援を行う企業。",
        selected_role="コンサルタント",
    )
    defaults.update(kwargs)
    return InterviewDrillScoreRequest(**defaults)


def test_build_drill_start_prompt_includes_weakest_info() -> None:
    """drill/start prompt に最弱情報 (question / answer / axis / score / evidence) が含まれる。"""
    payload = _make_drill_start_payload()
    prompt = _build_drill_start_prompt(payload)
    # 最弱情報 5 点セットが全て prompt に embed されている。
    assert "なぜ当社を志望していますか。" in prompt
    assert "事業の社会性に惹かれたからです。" in prompt
    assert "company_fit" in prompt
    assert "2/5" in prompt
    assert "事業の社会性" in prompt  # evidence
    # 4 field の生成を LLM に指示している。
    assert "why_weak" in prompt
    assert "improvement_pattern" in prompt
    assert "model_rewrite" in prompt
    assert "retry_question" in prompt


def test_build_drill_start_prompt_falls_back_when_evidence_empty() -> None:
    """evidence 空でも prompt が「(なし)」で埋まり壊れない。"""
    payload = _make_drill_start_payload(weakest_evidence=[])
    prompt = _build_drill_start_prompt(payload)
    assert "(なし)" in prompt
    assert "why_weak" in prompt


def test_build_drill_score_prompt_requests_seven_axis_scoring() -> None:
    """drill/score prompt が 7 軸採点を要求し、original_scores と weakest_axis を含む。"""
    payload = _make_drill_score_payload()
    prompt = _build_drill_score_prompt(payload)
    # 7 軸キーが全て embed されている (スコア JSON の中に)。
    for key in SEVEN_AXIS_KEYS:
        assert key in prompt
    # retry_question / retry_answer / weakest_axis が含まれる。
    assert "もう一度、当社だからこそ志望する理由を具体的に教えてください。" in prompt
    assert "御社の DX 事業は中小製造業" in prompt
    assert "company_fit" in prompt
    # rationale の生成指示がある。
    assert "rationale" in prompt


def test_coerce_retry_scores_clamps_and_fills_missing() -> None:
    """_coerce_retry_scores が 0-5 にクランプし、欠落軸を 0 で埋める。"""
    raw = {
        "company_fit": 7,  # over 5 → 5
        "role_fit": -3,  # below 0 → 0
        "specificity": 3.7,  # float → 3
        "logic": "abc",  # non-numeric → 0
        # persuasiveness / consistency / credibility 欠落 → 0
    }
    result = _coerce_retry_scores(raw)
    assert result["company_fit"] == 5
    assert result["role_fit"] == 0
    assert result["specificity"] == 3
    assert result["logic"] == 0
    assert result["persuasiveness"] == 0
    assert result["consistency"] == 0
    assert result["credibility"] == 0
    # 全 7 軸が揃っている。
    assert set(result.keys()) == set(SEVEN_AXIS_KEYS)


def test_coerce_retry_scores_handles_non_dict() -> None:
    """_coerce_retry_scores に非 dict を渡すと全軸 0 の dict を返す。"""
    result = _coerce_retry_scores(None)
    assert result == {key: 0 for key in SEVEN_AXIS_KEYS}
    result = _coerce_retry_scores("invalid")  # type: ignore[arg-type]
    assert result == {key: 0 for key in SEVEN_AXIS_KEYS}


# ---------------------------------------------------------------------------
# Endpoint integration tests (LLM モンキーパッチで安定実行)
# ---------------------------------------------------------------------------


def _fake_llm_result(data: dict[str, Any]) -> SimpleNamespace:
    """call_llm_with_error の戻り値をシミュレートする。"""
    return SimpleNamespace(success=True, data=data, error=None)


def _fake_llm_failure() -> SimpleNamespace:
    return SimpleNamespace(
        success=False,
        data=None,
        error=SimpleNamespace(message="forced failure"),
    )


def test_drill_start_endpoint_returns_4_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /api/interview/drill/start が 4 field + prompt_version を返す。"""
    captured: dict[str, Any] = {}

    async def fake_call_llm(**kwargs: Any) -> SimpleNamespace:
        captured["prompt"] = kwargs.get("system_prompt")
        return _fake_llm_result(
            {
                "why_weak": "evidence が抽象的で企業固有の論点と接続していません。",
                "improvement_pattern": "固有名詞・数字を加え、企業の事業と自分の経験を接続する。",
                "model_rewrite": "御社の DX 事業は〜というテーマに近いと考え〜 (150-250 字の模範回答)。",
                "retry_question": "企業固有の論点と自分の経験の接続を、具体例で答え直してください。",
            }
        )

    monkeypatch.setattr(_drill_endpoints, "call_llm_with_error", fake_call_llm)

    client = TestClient(app, base_url="http://127.0.0.1")
    response = client.post(
        "/api/interview/drill/start",
        json={
            "conversation_id": "conv-001",
            "weakest_turn_id": "turn-3",
            "weakest_question": "なぜ当社を志望していますか。",
            "weakest_answer": "事業の社会性に惹かれたからです。",
            "weakest_axis": "company_fit",
            "original_score": 2,
            "weakest_evidence": ["事業の社会性"],
            "company_name": "テスト株式会社",
            "company_summary": "DX 支援を行う企業。",
            "selected_role": "コンサルタント",
            "interview_format": "standard_behavioral",
            "interviewer_type": "hr",
            "strictness_mode": "standard",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body.keys()) >= {
        "why_weak",
        "improvement_pattern",
        "model_rewrite",
        "retry_question",
        "prompt_version",
    }
    assert body["why_weak"].strip() != ""
    assert body["retry_question"].endswith("。") or body["retry_question"].endswith("?")
    # prompt 側に weakest_question が embed されていることを確認。
    assert "なぜ当社を志望していますか。" in captured["prompt"]


def test_drill_start_endpoint_uses_fallback_when_llm_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """LLM 失敗時は deterministic fallback で 4 field が埋まる。"""

    async def fake_call_llm(**kwargs: Any) -> SimpleNamespace:
        return _fake_llm_failure()

    monkeypatch.setattr(_drill_endpoints, "call_llm_with_error", fake_call_llm)

    client = TestClient(app, base_url="http://127.0.0.1")
    response = client.post(
        "/api/interview/drill/start",
        json={
            "conversation_id": "conv-001",
            "weakest_turn_id": "turn-3",
            "weakest_question": "なぜ当社ですか。",
            "weakest_answer": "理念に共感しました。",
            "weakest_axis": "company_fit",
            "original_score": 1,
            "weakest_evidence": [],
            "company_name": "テスト株式会社",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["retry_question"] != ""
    assert body["why_weak"] != ""
    assert body["improvement_pattern"] != ""
    assert body["model_rewrite"] != ""


def test_drill_score_endpoint_returns_delta(monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /api/interview/drill/score が retry_scores / delta_scores / rationale を返す。"""

    async def fake_call_llm(**kwargs: Any) -> SimpleNamespace:
        return _fake_llm_result(
            {
                "retry_scores": {
                    "company_fit": 4,
                    "role_fit": 3,
                    "specificity": 4,
                    "logic": 3,
                    "persuasiveness": 3,
                    "consistency": 3,
                    "credibility": 3,
                },
                "rationale": "company_fit と specificity が向上し、固有名詞と数値が加わりました。",
            }
        )

    monkeypatch.setattr(_drill_endpoints, "call_llm_with_error", fake_call_llm)

    client = TestClient(app, base_url="http://127.0.0.1")
    response = client.post(
        "/api/interview/drill/score",
        json={
            "conversation_id": "conv-001",
            "weakest_turn_id": "turn-3",
            "retry_question": "もう一度、当社だからこそ志望する理由を具体的に教えてください。",
            "retry_answer": "御社の DX 事業は〜 (具体的な回答)。",
            "original_scores": {
                "company_fit": 2,
                "role_fit": 3,
                "specificity": 2,
                "logic": 3,
                "persuasiveness": 3,
                "consistency": 3,
                "credibility": 3,
            },
            "weakest_axis": "company_fit",
            "company_name": "テスト株式会社",
            "selected_role": "コンサルタント",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body["retry_scores"].keys()) == set(SEVEN_AXIS_KEYS)
    assert set(body["delta_scores"].keys()) == set(SEVEN_AXIS_KEYS)
    # 重点軸の delta が +2 になっている (retry=4 − original=2)。
    assert body["delta_scores"]["company_fit"] == 2
    assert body["delta_scores"]["specificity"] == 2
    assert body["delta_scores"]["role_fit"] == 0
    assert body["rationale"] != ""


def test_drill_score_endpoint_fallback_rationale_when_llm_returns_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """rationale 空で返ってきても delta をもとに deterministic な要約を埋める。"""

    async def fake_call_llm(**kwargs: Any) -> SimpleNamespace:
        return _fake_llm_result(
            {
                "retry_scores": {
                    "company_fit": 3,
                    "role_fit": 3,
                    "specificity": 3,
                    "logic": 3,
                    "persuasiveness": 3,
                    "consistency": 3,
                    "credibility": 3,
                },
                "rationale": "",
            }
        )

    monkeypatch.setattr(_drill_endpoints, "call_llm_with_error", fake_call_llm)

    client = TestClient(app, base_url="http://127.0.0.1")
    response = client.post(
        "/api/interview/drill/score",
        json={
            "conversation_id": "conv-001",
            "weakest_turn_id": "turn-3",
            "retry_question": "書き直しの質問",
            "retry_answer": "書き直しの回答",
            "original_scores": {
                "company_fit": 3,
                "role_fit": 3,
                "specificity": 3,
                "logic": 3,
                "persuasiveness": 3,
                "consistency": 3,
                "credibility": 3,
            },
            "weakest_axis": "company_fit",
            "company_name": "テスト株式会社",
        },
    )
    assert response.status_code == 200
    body = response.json()
    # 全軸 delta = 0 なので「明確な変化は見られませんでした」fallback。
    assert body["rationale"] != ""
    assert all(v == 0 for v in body["delta_scores"].values())
