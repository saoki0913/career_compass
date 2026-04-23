"""P4-2: gpt-nano セマンティック確認の post-capture 補正ロジックのユニットテスト.

`_apply_semantic_confirmation_post_capture` は capture チェーン直後に呼ばれ、
keyword で False になった slot に対し、feature flag ON のとき LLM ミニコールで
意味判定して `confirmedFacts` を補正する。
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.routers.motivation import (
    _apply_semantic_confirmation_post_capture,
    _semantic_answer_confirmation,
)


# ---------------------------------------------------------------------------
# _apply_semantic_confirmation_post_capture (flag / pre-conditions)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSemanticConfirmFlagOff:
    async def test_flag_off_does_not_call_llm(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=False)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            result = await _apply_semantic_confirmation_post_capture(
                ctx,
                "御社のDXによる社会変革に深い共感を覚えています。",
                settings=settings,
            )
            mock_llm.assert_not_called()
            assert result["confirmedFacts"]["company_reason_confirmed"] is False


@pytest.mark.asyncio
class TestSemanticConfirmShortAnswer:
    async def test_under_14_chars_skips_llm(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            await _apply_semantic_confirmation_post_capture(
                ctx,
                "短い回答",  # 4 chars
                settings=settings,
            )
            mock_llm.assert_not_called()


@pytest.mark.asyncio
class TestSemanticConfirmAlreadyConfirmed:
    async def test_keyword_already_true_skips_llm(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": True},
            }
            await _apply_semantic_confirmation_post_capture(
                ctx,
                "御社のDXによる社会変革に深い共感を覚えています。",
                settings=settings,
            )
            mock_llm.assert_not_called()


@pytest.mark.asyncio
class TestSemanticConfirmNegativeAnswer:
    async def test_unresolved_signal_skips_llm(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            await _apply_semantic_confirmation_post_capture(
                ctx,
                "正直まだよくわからないですが、考え中です",  # unresolved
                settings=settings,
            )
            mock_llm.assert_not_called()


# ---------------------------------------------------------------------------
# _apply_semantic_confirmation_post_capture (LLM-driven correction)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSemanticConfirmLLMCorrection:
    async def test_yes_response_corrects_confirmed_facts(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            result = await _apply_semantic_confirmation_post_capture(
                ctx,
                "御社のDXによる社会変革に深い共感を覚えています。",
                settings=settings,
            )
            mock_llm.assert_called_once()
            assert result["confirmedFacts"]["company_reason_confirmed"] is True
            assert "openSlots" in result

    async def test_no_response_does_not_change_confirmed_facts(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=False),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            result = await _apply_semantic_confirmation_post_capture(
                ctx,
                "御社のDXによる社会変革に深い共感を覚えています。",
                settings=settings,
            )
            mock_llm.assert_called_once()
            assert result["confirmedFacts"]["company_reason_confirmed"] is False


@pytest.mark.asyncio
class TestSemanticConfirmCache:
    async def test_second_call_uses_cache(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ) as mock_llm:
            ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            await _apply_semantic_confirmation_post_capture(
                ctx, "御社のDXによる社会変革に深い共感を覚えています。", settings=settings
            )
            # 2 回目: confirmedFacts が True になっているので LLM 不要のはず
            await _apply_semantic_confirmation_post_capture(
                ctx, "御社のDXによる社会変革に深い共感を覚えています。", settings=settings
            )
            assert mock_llm.call_count == 1

    async def test_different_answer_re_evaluates_same_stage(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(side_effect=[False, True]),
        ) as mock_llm:
            first_ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
            }
            await _apply_semantic_confirmation_post_capture(
                first_ctx,
                "御社に興味はありますが、理由はまだ整理しきれていません。",
                settings=settings,
            )
            assert first_ctx["confirmedFacts"]["company_reason_confirmed"] is False

            second_ctx: dict[str, Any] = {
                "questionStage": "company_reason",
                "confirmedFacts": {"company_reason_confirmed": False},
                "semanticConfirmationCache": dict(first_ctx.get("semanticConfirmationCache") or {}),
            }
            await _apply_semantic_confirmation_post_capture(
                second_ctx,
                "現場でDX支援を通じて顧客課題を解ける点に強く惹かれています。",
                settings=settings,
            )
            assert mock_llm.call_count == 2
            assert second_ctx["confirmedFacts"]["company_reason_confirmed"] is True


@pytest.mark.asyncio
class TestSemanticConfirmSelfConnection:
    async def test_self_connection_yes_sets_origin_and_fit_flags(self) -> None:
        settings = MagicMock(motivation_semantic_confirm=True)
        with patch(
            "app.routers.motivation._semantic_answer_confirmation",
            new=AsyncMock(return_value=True),
        ):
            ctx: dict[str, Any] = {
                "questionStage": "self_connection",
                "confirmedFacts": {"self_connection_confirmed": False},
            }
            result = await _apply_semantic_confirmation_post_capture(
                ctx,
                "学生時代の研究で粘り強く課題に取り組んだ経験があります。",
                settings=settings,
            )
            facts = result["confirmedFacts"]
            assert facts.get("self_connection_confirmed") is True
            assert facts.get("origin_experience_confirmed") is True
            assert facts.get("fit_connection_confirmed") is True


# ---------------------------------------------------------------------------
# _semantic_answer_confirmation (LLM call wrapper)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSemanticAnswerConfirmation:
    async def test_yes_response_returns_true(self) -> None:
        from app.utils.llm import LLMResult

        with patch(
            "app.routers.motivation.call_llm_with_error",
            new=AsyncMock(return_value=LLMResult(success=True, raw_text="yes")),
        ):
            assert (
                await _semantic_answer_confirmation(
                    "御社のDXに深く共感しています。", "company_reason"
                )
                is True
            )

    async def test_no_response_returns_false(self) -> None:
        from app.utils.llm import LLMResult

        with patch(
            "app.routers.motivation.call_llm_with_error",
            new=AsyncMock(return_value=LLMResult(success=True, raw_text="no")),
        ):
            assert (
                await _semantic_answer_confirmation("具体的な回答ではない", "company_reason")
                is False
            )

    async def test_llm_failure_returns_false(self) -> None:
        from app.utils.llm import LLMResult

        with patch(
            "app.routers.motivation.call_llm_with_error",
            new=AsyncMock(return_value=LLMResult(success=False, raw_text=None)),
        ):
            assert (
                await _semantic_answer_confirmation("any", "company_reason") is False
            )

    async def test_timeout_returns_false(self) -> None:
        async def slow_call(*args: Any, **kwargs: Any) -> Any:
            import asyncio

            await asyncio.sleep(5)

        with patch(
            "app.routers.motivation.call_llm_with_error",
            new=AsyncMock(side_effect=slow_call),
        ):
            result = await _semantic_answer_confirmation(
                "any answer", "company_reason", timeout_seconds=0.05
            )
            assert result is False
