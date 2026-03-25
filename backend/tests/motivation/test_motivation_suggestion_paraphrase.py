from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.routers.motivation import (
    SuggestionOption,
    _build_element_guidance_for_question_prompt,
    _paraphrase_suggestion_options,
)


def test_element_guidance_ignores_weakest_in_early_stages():
    text = _build_element_guidance_for_question_prompt(
        "industry_reason",
        "自己分析",
        "「自己分析」で不足: 具体例",
    )
    assert "参照しない" in text or "後続" in text


def test_element_guidance_includes_weakest_in_late_stages():
    text = _build_element_guidance_for_question_prompt(
        "fit_connection",
        "差別化",
        "「差別化」で不足: 他社比較",
    )
    assert "弱い要素" in text
    assert "差別化" in text


@pytest.mark.asyncio
async def test_paraphrase_updates_labels_when_llm_succeeds():
    options = [
        SuggestionOption(
            id="opt-1",
            label="顧客課題の整理と提案を通じて価値を出したいと考えているため",
            sourceType="company",
            intent="company_reason",
        ),
        SuggestionOption(
            id="opt-2",
            label="企画職としてDX支援に関わり学びを深めたいため",
            sourceType="profile",
            intent="company_reason",
        ),
    ]
    rewritten = [
        "顧客課題を整理し、提案を通じて価値を出していきたいです。",
        "企画職としてDX支援に関わり、学びを深めていきたいです。",
    ]
    with patch(
        "app.routers.motivation.call_llm_with_error",
        new_callable=AsyncMock,
    ) as mock_llm:
        mock_llm.return_value = SimpleNamespace(
            success=True,
            data={"labels": rewritten},
            error=None,
        )
        out = await _paraphrase_suggestion_options(
            options,
            question="どの点に魅力を感じますか？",
            stage="company_reason",
        )
    assert [o.label for o in out] == rewritten
    mock_llm.assert_awaited_once()


@pytest.mark.asyncio
async def test_paraphrase_falls_back_when_llm_fails():
    options = [
        SuggestionOption(
            id="opt-1",
            label="顧客課題の整理と提案を通じて価値を出したいと考えているため",
            sourceType="company",
            intent="company_reason",
        ),
    ]
    with patch(
        "app.routers.motivation.call_llm_with_error",
        new_callable=AsyncMock,
    ) as mock_llm:
        mock_llm.return_value = SimpleNamespace(success=False, data=None, error=None)
        out = await _paraphrase_suggestion_options(
            options,
            question="どの点に魅力を感じますか？",
            stage="company_reason",
        )
    assert out[0].label == options[0].label


@pytest.mark.asyncio
async def test_paraphrase_falls_back_on_label_count_mismatch():
    options = [
        SuggestionOption(
            id="opt-1",
            label="顧客課題の整理と提案を通じて価値を出したいと考えているため",
            sourceType="company",
            intent="company_reason",
        ),
        SuggestionOption(
            id="opt-2",
            label="企画職としてDX支援に関わり学びを深めたいため",
            sourceType="profile",
            intent="company_reason",
        ),
    ]
    with patch(
        "app.routers.motivation.call_llm_with_error",
        new_callable=AsyncMock,
    ) as mock_llm:
        mock_llm.return_value = SimpleNamespace(
            success=True,
            data={"labels": ["1つだけ"]},
            error=None,
        )
        out = await _paraphrase_suggestion_options(
            options,
            question="どの点に魅力を感じますか？",
            stage="company_reason",
        )
    assert [o.label for o in out] == [o.label for o in options]


@pytest.mark.asyncio
async def test_paraphrase_rejects_rewrite_that_introduces_other_company_name():
    options = [
        SuggestionOption(
            id="opt-1",
            label="顧客課題の整理と提案を通じて価値を出したいと考えているため",
            sourceType="company",
            intent="company_reason",
        ),
    ]
    with patch(
        "app.routers.motivation.call_llm_with_error",
        new_callable=AsyncMock,
    ) as mock_llm:
        mock_llm.return_value = SimpleNamespace(
            success=True,
            data={"labels": ["堀江篤マテリアルソリューションのDX支援に惹かれたためです。"]},
            error=None,
        )
        out = await _paraphrase_suggestion_options(
            options,
            question="株式会社テストのどの点に魅力を感じますか？",
            stage="company_reason",
        )
    assert [o.label for o in out] == [o.label for o in options]
