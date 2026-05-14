"""LLM-based quality validation for ES rewrite candidates."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

LLM_VALIDATION_SCHEMA = {
    "type": "object",
    "properties": {
        "conclusion_first": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "company_grounding": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "style_unity": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "structure_clarity": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "fact_preservation": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "expression_diversity": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
        "theme_focus": {
            "type": "object",
            "properties": {"pass": {"type": "boolean"}, "reason": {"type": "string"}},
            "required": ["pass", "reason"],
        },
    },
    "required": [
        "conclusion_first",
        "company_grounding",
        "style_unity",
        "structure_clarity",
        "fact_preservation",
        "expression_diversity",
        "theme_focus",
    ],
}

_VALIDATION_SYSTEM_PROMPT = """あなたはES（エントリーシート）の品質検証官である。
添削済みの本文を7つの観点で評価し、JSON で結果を返す。

<evaluation_criteria>
1. conclusion_first: 1文目が設問への答えになっているか。前置きや背景説明から入っていないか。
2. company_grounding: 企業への言及が設問タイプに応じて適切か。
   - required: 企業固有の根拠が1点以上含まれている
   - assistive: 企業言及が0〜2回で補助的に使われている（なくても可）
   - none: 企業言及がない
3. style_unity: だ・である調で統一されているか。「です」「ます」が混在していないか。
4. structure_clarity: 論理の流れが追えるか。各文に役割があり、同趣旨の繰り返しがないか。
5. fact_preservation: 元回答の具体的事実（数値、固有名詞、経験、役割）が保持されているか。元にない具体的事実（数値、固有名詞、未経験の出来事）が追加されていないか。
   ただし以下は事実追加ではなく構造改善であり、pass=true とする:
   - 行動の具体化: 「頑張った」→「提案した」のように元回答の行動を具体的な動詞に置き換える
   - 論理接続の補強: 文の順序変更、因果関係の明示、冗長部分の圧縮
   - 能力・貢献の抽象化: 元回答の行動・成果から論理的に導ける能力名や貢献像を加える（例: 交渉活動の記述がある → 「交渉力を培った」は pass）
   - 構成の再編成: 結論ファーストへの並べ替え、重複の統合
   fail とするのは: 元回答にない数値の追加、元にない固有名詞（企業名・プロジェクト名・技術名）の追加、元にない経験や出来事の創作。
6. expression_diversity: 同じ概念を異なる文でほぼ同じ表現で繰り返していないか。類似フレーズの近接反復がないか。
7. theme_focus: 本文の主題が設問タイプに合致しているか。志望動機にガクチカ詳細が過半を占めていないか。設問が求める回答（動機・強み・ビジョン等）が本文の主軸になっているか。
</evaluation_criteria>

<output_format>
JSON で以下の構造を返す:
{
  "conclusion_first": {"pass": true/false, "reason": "..."},
  "company_grounding": {"pass": true/false, "reason": "..."},
  "style_unity": {"pass": true/false, "reason": "..."},
  "structure_clarity": {"pass": true/false, "reason": "..."},
  "fact_preservation": {"pass": true/false, "reason": "..."},
  "expression_diversity": {"pass": true/false, "reason": "..."},
  "theme_focus": {"pass": true/false, "reason": "..."}
}
- pass=false の場合、reason に具体的な問題箇所と改善方向を30字以内で書く
- pass=true の場合、reason は空文字列
</output_format>"""


@dataclass(frozen=True)
class LlmValidationResult:
    passed: bool
    failed_checks: list[str] = field(default_factory=list)
    retry_hint: str = ""
    warned_checks: list[str] = field(default_factory=list)

    def __iter__(self):
        """Keep legacy 3-value tuple unpacking working."""
        yield self.passed
        yield self.failed_checks
        yield self.retry_hint


def _extract_json_result(result: Any) -> dict[str, Any] | None:
    if isinstance(result, dict):
        return result
    data = getattr(result, "data", None)
    if isinstance(data, dict):
        return data
    return None


async def _call_json_validation(
    json_caller: Callable[..., Any],
    *,
    system_prompt: str,
    user_prompt: str,
) -> Any:
    kwargs: dict[str, Any] = {
        "system_prompt": system_prompt,
        "user_message": user_prompt,
        "feature": "es_review_validation",
        "max_tokens": 600,
        "temperature": 0.1,
        "response_format": "json_object",
        "json_schema": LLM_VALIDATION_SCHEMA,
        "retry_on_parse": True,
    }
    try:
        return await json_caller(**kwargs)
    except TypeError:
        kwargs["user_prompt"] = kwargs.pop("user_message")
        return await json_caller(**kwargs)


async def _validate_rewrite_with_llm(
    candidate: str,
    *,
    template_type: str,
    question: str | None,
    user_answer: str,
    company_name: str | None,
    grounding_mode: str,
    json_caller: Callable[..., Any],
    axis_modes: dict[str, str] | None = None,
) -> LlmValidationResult:
    """LLM で品質判定。Returns (overall_pass, failed_checks, retry_hint)."""
    user_prompt = f"""<context>
設問タイプ: {template_type}
設問: {question or '（設問なし）'}
企業接地モード: {grounding_mode}
企業名: {company_name or '（企業名なし）'}
</context>

<original_answer>
{user_answer}
</original_answer>

<rewritten_text>
{candidate}
</rewritten_text>"""

    try:
        raw_result = await _call_json_validation(
            json_caller,
            system_prompt=_VALIDATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
    except Exception:
        logger.warning("LLM validation failed, falling back to pass", exc_info=True)
        return LlmValidationResult(True, [], "")

    result = _extract_json_result(raw_result)
    if not isinstance(result, dict):
        return LlmValidationResult(True, [], "")

    failed_checks: list[str] = []
    warned_checks: list[str] = []
    hints: list[str] = []
    modes = axis_modes or {}
    for key in (
        "conclusion_first",
        "company_grounding",
        "style_unity",
        "structure_clarity",
        "fact_preservation",
        "expression_diversity",
        "theme_focus",
    ):
        mode = modes.get(key, "required")
        if mode == "skip":
            continue
        item = result.get(key, {})
        if isinstance(item, dict) and not item.get("pass", True):
            if mode == "warn":
                warned_checks.append(key)
            else:
                failed_checks.append(key)
            reason = str(item.get("reason") or "").strip()
            if reason:
                hints.append(reason)

    overall_pass = len(failed_checks) == 0
    retry_hint = "。".join(hints) if hints else ""
    return LlmValidationResult(overall_pass, failed_checks, retry_hint, warned_checks)


__all__ = ["LLM_VALIDATION_SCHEMA", "LlmValidationResult", "_validate_rewrite_with_llm"]
