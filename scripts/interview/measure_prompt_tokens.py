#!/usr/bin/env python3
"""Measure tiktoken counts for the 5 interview prompt builders.

Usage:
    python scripts/interview/measure_prompt_tokens.py --label before_dedup
    python scripts/interview/measure_prompt_tokens.py --label after_dedup

Prints a markdown table summarising the token count for each builder so the
caller can compare measurement points (before/after dedup, with/without a new
behavior block, ...).

Run with the backend venv so backend imports succeed:
    backend/.venv/bin/python scripts/interview/measure_prompt_tokens.py --label before_dedup

If `tiktoken` is missing, install it first:
    backend/.venv/bin/python -m pip install tiktoken
"""

from __future__ import annotations

import argparse
import os
import sys
import traceback
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"

# Ensure `backend/app/...` is importable when invoked from repo root.
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Avoid tripping config validation that demands real env values.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("GOOGLE_API_KEY", "test-google-key")


def _load_tiktoken_encoder():
    try:
        import tiktoken  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised only when missing.
        raise SystemExit(
            "tiktoken is required. Install it inside the backend venv:\n"
            "    backend/.venv/bin/python -m pip install tiktoken"
        ) from exc
    return tiktoken.get_encoding("cl100k_base")


def _build_dummy_payloads():
    """Construct minimal-but-realistic request payloads for each builder.

    The fields touch every f-string placeholder used inside the 5 fallback
    templates so the measurement reflects a near-worst-case render (no empty
    strings collapse the prompt artificially).
    """
    from app.routers.interview import (  # noqa: WPS433 - intentional late import.
        InterviewBaseRequest,
        InterviewContinueRequest,
        InterviewFeedbackRequest,
        InterviewStartRequest,
        InterviewTurnRequest,
        Message,
    )

    common_fields: dict[str, object] = {
        "company_name": "サンプル株式会社",
        "company_summary": (
            "サンプル株式会社は中堅 SaaS ベンダー。中小企業向けに業務効率化 "
            "プロダクトを提供しており、近年は AI 活用に注力している。"
        ),
        "motivation_summary": (
            "中小企業の業務効率化を AI で底上げしたいと考え、御社の "
            "プロダクトと開発文化に共感している。"
        ),
        "gakuchika_summary": (
            "学生団体で 30 名のオペレーションを再設計し、月次の事務処理 "
            "時間を 40% 削減した。"
        ),
        "academic_summary": (
            "情報科学を専攻し、機械学習による文書分類の研究に取り組んだ。"
        ),
        "research_summary": (
            "卒論で BERT を用いた日本語 ES の品質スコアリングモデルを構築。"
        ),
        "es_summary": (
            "学生時代に最も力を入れたことは、サークル運営の改革と "
            "システム化である。"
        ),
        "selected_industry": "IT/SaaS",
        "selected_role": "バックエンドエンジニア",
        "selected_role_source": "user_input",
        "role_track": "backend_engineer",
        "interview_format": "standard_behavioral",
        "selection_type": "fulltime",
        "interview_stage": "mid",
        "interviewer_type": "hr",
        "strictness_mode": "standard",
        "seed_summary": "面接全体の進行メモ。",
    }

    start_payload = InterviewStartRequest(**common_fields)

    conversation = [
        Message(role="assistant", content="まず自己紹介をお願いします。"),
        Message(
            role="user",
            content=(
                "情報科学専攻で、SaaS 企業のインターンでバックエンド開発を "
                "経験しました。チームで API 設計とパフォーマンス改善を担当しました。"
            ),
        ),
        Message(role="assistant", content="その API 設計で最も難しかった意思決定は?"),
        Message(
            role="user",
            content=(
                "RDB と検索エンジンの責務分離です。整合性とレイテンシの "
                "トレードオフを踏まえ、書き込みは RDB に集約しました。"
            ),
        ),
    ]

    turn_payload = InterviewTurnRequest(
        **common_fields,
        conversation_history=conversation,
        turn_state={
            "lastQuestion": "API 設計で最も難しかった意思決定は?",
            "lastAnswer": "RDB と検索エンジンの責務分離です。",
            "lastTopic": "experience",
            "coveredTopics": ["motivation_fit", "experience"],
            "remainingTopics": ["company_understanding", "role_reason"],
            "coverageState": [
                {"topic": "motivation_fit", "status": "satisfied"},
                {"topic": "experience", "status": "in_progress"},
            ],
            "recentQuestionSummariesV2": [
                {"intent_key": "experience:reason_check", "summary": "意思決定理由"}
            ],
            "formatPhase": "behavioral_core",
        },
        turn_events=[
            {"event": "topic_shift", "from": "motivation_fit", "to": "experience"}
        ],
    )

    feedback_payload = InterviewFeedbackRequest(
        **common_fields,
        conversation_history=conversation,
        turn_state={
            "interviewPlan": {
                "interview_type": "new_grad_behavioral",
                "priority_topics": ["motivation_fit", "experience"],
                "opening_topic": "motivation_fit",
                "must_cover_topics": ["motivation_fit", "role_reason"],
                "risk_topics": ["credibility_check"],
                "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
            }
        },
        turn_events=[
            {"event": "topic_shift", "from": "motivation_fit", "to": "experience"}
        ],
    )

    continue_payload = InterviewContinueRequest(
        **common_fields,
        conversation_history=conversation,
        turn_state={
            "interviewPlan": {
                "interview_type": "new_grad_behavioral",
                "priority_topics": ["motivation_fit", "experience"],
                "opening_topic": "motivation_fit",
                "must_cover_topics": ["motivation_fit", "role_reason"],
                "risk_topics": ["credibility_check"],
                "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
            }
        },
        latest_feedback={
            "overall_comment": "全体としては論理は通っているが具体性が弱い。",
            "improvements": ["定量的な根拠を 1 つ加える", "意思決定の選択肢比較を述べる"],
            "next_preparation": ["過去経験の定量化", "競合比較の整理"],
        },
    )

    interview_plan = {
        "interview_type": "new_grad_behavioral",
        "priority_topics": ["motivation_fit", "experience", "role_reason"],
        "opening_topic": "motivation_fit",
        "must_cover_topics": ["motivation_fit", "role_reason", "credibility"],
        "risk_topics": ["credibility_check", "specificity_gap"],
        "suggested_timeflow": ["導入", "論点1", "論点2", "締め"],
    }

    turn_state_for_turn_builder = turn_payload.turn_state or {}
    turn_meta_seed = {
        "topic": "experience",
        "turn_action": "deepen",
        "focus_reason": "意思決定の根拠確認",
        "depth_focus": "specificity",
        "followup_style": "evidence_check",
        "intent_key": "experience:evidence_check",
        "should_move_next": False,
    }

    return {
        "start": start_payload,
        "turn": turn_payload,
        "feedback": feedback_payload,
        "continue": continue_payload,
        "interview_plan": interview_plan,
        "turn_state": turn_state_for_turn_builder,
        "turn_meta": turn_meta_seed,
    }


def _builder_callables(payloads: dict[str, object]) -> dict[str, Callable[[], str]]:
    from app.routers.interview import (  # noqa: WPS433 - intentional late import.
        _build_continue_prompt,
        _build_feedback_prompt,
        _build_opening_prompt,
        _build_plan_prompt,
        _build_turn_prompt,
    )

    return {
        "plan": lambda: _build_plan_prompt(payloads["start"]),
        "opening": lambda: _build_opening_prompt(
            payloads["start"], payloads["interview_plan"]
        ),
        "turn": lambda: _build_turn_prompt(
            payloads["turn"],
            payloads["interview_plan"],
            payloads["turn_state"],
            payloads["turn_meta"],
        ),
        "continue": lambda: _build_continue_prompt(payloads["continue"]),
        "feedback": lambda: _build_feedback_prompt(payloads["feedback"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--label",
        default="unlabeled",
        help="Measurement label (e.g. before_dedup, after_dedup, with_block).",
    )
    args = parser.parse_args()

    encoder = _load_tiktoken_encoder()
    payloads = _build_dummy_payloads()
    builders = _builder_callables(payloads)

    rows: list[tuple[str, int | None, str | None]] = []
    total: int = 0
    any_failure = False
    for name in ("plan", "opening", "turn", "continue", "feedback"):
        builder = builders[name]
        try:
            prompt = builder()
        except Exception as exc:  # noqa: BLE001 - intentional broad catch per spec.
            any_failure = True
            err = f"{type(exc).__name__}: {exc}"
            traceback.print_exc()
            rows.append((name, None, err))
            continue
        token_count = len(encoder.encode(prompt))
        total += token_count
        rows.append((name, token_count, None))

    print(f"# Interview prompt token measurement (label: {args.label})")
    print()
    print("| Builder | Tokens |")
    print("|---------|-------:|")
    for name, count, err in rows:
        if count is None:
            print(f"| {name} | ERROR ({err}) |")
        else:
            print(f"| {name} | {count} |")
    print(f"| **合計** | **{total}** |")

    return 1 if any_failure else 0


if __name__ == "__main__":
    sys.exit(main())
