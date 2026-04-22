from __future__ import annotations

import copy
import logging
from typing import Any

from app.routers._interview.contracts import INTERVIEW_SCORE_SCHEMA, SEVEN_AXIS_KEYS
from app.utils.llm import call_llm_with_error

logger = logging.getLogger(__name__)

CALIBRATION_JUDGE_SYSTEM = """あなたは就活面接の独立評価者です。以下の模擬面接の会話ログだけを根拠に、候補者の回答品質を 7 軸で厳密に採点してください。

## 採点方針
- 7 軸は `company_fit`, `role_fit`, `specificity`, `logic`, `persuasiveness`, `consistency`, `credibility`
- 各軸 0-5 の整数で採点する
- 0 は会話ログから判断不能または根拠不足
- 厳しめだが一貫した基準で採点する
- 他の評価者の採点は存在しない前提で、会話ログだけを見て独立に判断する
- 推測で持ち上げず、発話内の明示情報に基づいて採点する

## 軸の見方
- company_fit: 企業理解と志望先との接続の深さ
- role_fit: 志望職種の理解と自分の適性の接続
- specificity: エピソード・数字・固有情報の具体性
- logic: 話の因果、構造、結論の明瞭さ
- persuasiveness: 面接官を納得させる説得力
- consistency: 会話全体での主張の一貫性
- credibility: 誇張の少なさ、実現可能性、発言の信頼感

## 出力ルール
- JSON のみを返す
- `scores` は 7 軸すべてを含める
- `rationale_by_axis` は 7 軸すべてを含め、各軸 1-2 文の日本語で根拠を書く
- コードフェンス、前置き、総評は不要
"""


def _calibration_output_schema() -> dict[str, Any]:
    rationale_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {axis: {"type": "string"} for axis in SEVEN_AXIS_KEYS},
        "required": list(SEVEN_AXIS_KEYS),
    }
    return {
        "name": "interview_calibration_judge",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "scores": copy.deepcopy(INTERVIEW_SCORE_SCHEMA),
                "rationale_by_axis": rationale_schema,
            },
            "required": ["scores", "rationale_by_axis"],
        },
    }


def _format_conversation_history(conversation_history: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for index, turn in enumerate(conversation_history, start=1):
        role = str(turn.get("role") or "unknown")
        content = str(turn.get("content") or "").strip()
        lines.append(f"{index}. {role}: {content}")
    return "\n".join(lines)


def _build_user_prompt(
    case: dict[str, Any],
    conversation_history: list[dict[str, Any]],
    company_info: dict[str, Any],
) -> str:
    company_name = str(company_info.get("name") or case.get("company", {}).get("name") or "")
    company_summary = str(company_info.get("summary") or case.get("company", {}).get("summary") or "")
    company_industry = str(company_info.get("industry") or case.get("company", {}).get("industry") or "")
    transcript = _format_conversation_history(conversation_history)
    return (
        "## ケース情報\n"
        f"- case_id: {case['case_id']}\n"
        f"- format: {case['format']}\n"
        f"- stage: {case['stage']}\n"
        f"- strictness: {case['strictness']}\n"
        f"- role_track: {case['role_track']}\n"
        f"- interviewer: {case['interviewer']}\n"
        "\n"
        "## 企業情報\n"
        f"- company_name: {company_name}\n"
        f"- industry: {company_industry}\n"
        f"- summary: {company_summary}\n"
        "\n"
        "## 会話ログ\n"
        f"{transcript}\n"
    )


async def run_calibration_judge(
    case: dict[str, Any],
    conversation_history: list[dict[str, Any]],
    company_info: dict[str, Any],
) -> dict[str, dict[str, Any]] | None:
    try:
        result = await call_llm_with_error(
            model="gpt-5.4",
            system_prompt=CALIBRATION_JUDGE_SYSTEM,
            user_message=_build_user_prompt(case, conversation_history, company_info),
            temperature=0.1,
            max_tokens=1400,
            feature="interview_calibration_judge",
            response_format="json_schema",
            json_schema=_calibration_output_schema(),
        )
    except Exception:
        logger.exception("Calibration judge crashed for case_id=%s", case.get("case_id"))
        return None

    if not result.success or not isinstance(result.data, dict):
        detail = getattr(result.error, "message", str(result.error))
        logger.error("Calibration judge failed for case_id=%s: %s", case.get("case_id"), detail)
        return None

    raw_scores = result.data.get("scores")
    raw_rationales = result.data.get("rationale_by_axis")
    if not isinstance(raw_scores, dict) or not isinstance(raw_rationales, dict):
        logger.error("Calibration judge returned malformed payload for case_id=%s", case.get("case_id"))
        return None

    scores = {axis: max(0, min(5, int(raw_scores.get(axis, 0)))) for axis in SEVEN_AXIS_KEYS}
    rationale_by_axis = {axis: str(raw_rationales.get(axis) or "").strip() for axis in SEVEN_AXIS_KEYS}
    return {
        "scores": scores,
        "rationale_by_axis": rationale_by_axis,
    }
