"""Unit tests for `_validate_or_repair_question` fallback behavior and logging.

Covers:
- B-1 (P2-3): フォールバック発火時に理由コード + stage で logger.info が呼ばれる
- B-3 (P2-6): 80 文字制限が `80 + len(company_name)` で動的化されている
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.routers import motivation as motivation_module
from app.routers.motivation import _validate_or_repair_question


def _call(question: str, stage: str = "company_reason", **kwargs) -> str:
    defaults = dict(
        question=question,
        stage=stage,
        company_name="株式会社テスト",
        selected_industry=None,
        selected_role=None,
        desired_work=None,
        grounded_company_anchor=None,
        gakuchika_episode=None,
        gakuchika_strength=None,
        confirmed_facts=None,
    )
    defaults.update(kwargs)
    return _validate_or_repair_question(**defaults)


def _fallback_reasons(info_mock) -> list[str]:
    """mock.call_args_list から reason code を抽出."""
    reasons = []
    for call in info_mock.call_args_list:
        args = call.args
        # logger.info("[Motivation] question_fallback reason=%s stage=%s", reason, stage)
        if len(args) >= 2 and "question_fallback" in args[0]:
            reasons.append(args[1])
    return reasons


class TestQuestionFallbackLogging:
    """B-1: 各 fallback 分岐で構造化ログが出る."""

    def test_empty_question_logs_empty(self) -> None:
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call("", stage="company_reason")
        assert "empty" in _fallback_reasons(info_mock)

    def test_generic_blocklist_logs_reason(self) -> None:
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call("もう少し詳しく教えてください", stage="company_reason")
        assert "generic_blocklist" in _fallback_reasons(info_mock)

    def test_too_long_logs_reason(self) -> None:
        # 既定 company_name="株式会社テスト" (7 文字) → 上限は 87 文字。
        # 確実に超過させるため 100 文字以上の質問で検証する
        with patch.object(motivation_module.logger, "info") as info_mock:
            long_question = "貴社の事業" + "あ" * 100 + "？"
            _call(long_question, stage="company_reason")
        assert "too_long" in _fallback_reasons(info_mock)

    def test_missing_keyword_logs_reason(self) -> None:
        # stage=self_connection のキーワード (経験/価値観/強み/つなが/活か/原体験/学び/きっかけ) を含まない。
        # self_connection は other_company 判定対象外なのでそのまま missing_keyword に到達する。
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call("好きな食べ物は何ですか？", stage="self_connection")
        assert "missing_keyword" in _fallback_reasons(info_mock)

    def test_multi_part_question_logs_reason(self) -> None:
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call(
                "貴社の魅力はどこですか？また、他社ではなく貴社を選ぶ理由は何ですか？",
                stage="company_reason",
            )
        reasons = _fallback_reasons(info_mock)
        # multi_part または他の validation で落ちる。fallback ログが存在すればよい
        assert reasons, "複数論点質問で fallback ログが出ていない"

    def test_valid_question_passes_without_fallback_log(self) -> None:
        with patch.object(motivation_module.logger, "info") as info_mock:
            # QUESTION_KEYWORDS_BY_STAGE["company_reason"] の「魅力」を含む自然な質問
            valid = "貴社の事業に最も魅力を感じた点を教えてください。"
            result = _call(valid, stage="company_reason")
        # fallback ログが出ていない = 質問がそのまま通過
        assert result == valid
        assert not _fallback_reasons(info_mock)


class TestDynamicTooLongLimit:
    """B-3 (P2-6): 80 文字制限に company_name 長を上乗せする."""

    def _make_question_at_length(self, target_len: int, *, base_prefix: str = "貴社の事業で最も魅力") -> str:
        """魅力 キーワードを含み、指定文字数ちょうどの質問を作る（末尾に ？ を含む）."""
        assert target_len >= len(base_prefix) + 1
        padding = "あ" * (target_len - len(base_prefix) - 1)
        return f"{base_prefix}{padding}？"

    def test_under_dynamic_limit_passes(self) -> None:
        # 企業名 10 文字 → 上限は 90 文字。89 文字はそのまま通過する
        company = "株式会社テストテスト"  # 10 chars
        assert len(company) == 10
        question = self._make_question_at_length(80 + len(company) - 1)
        assert len(question) == 80 + len(company) - 1
        with patch.object(motivation_module.logger, "info") as info_mock:
            result = _call(question, stage="company_reason", company_name=company)
        # "too_long" は出ない
        assert "too_long" not in _fallback_reasons(info_mock)
        assert result == question

    def test_exactly_at_dynamic_limit_passes(self) -> None:
        # 企業名 10 文字 → 上限は 90 文字。90 文字ちょうども許容される（> のみ棄却）
        company = "株式会社テストテスト"
        question = self._make_question_at_length(80 + len(company))
        assert len(question) == 80 + len(company)
        with patch.object(motivation_module.logger, "info") as info_mock:
            result = _call(question, stage="company_reason", company_name=company)
        assert "too_long" not in _fallback_reasons(info_mock)
        assert result == question

    def test_one_over_dynamic_limit_rejected(self) -> None:
        # 企業名 10 文字 → 上限 90 文字、+1 文字で "too_long" 発火
        company = "株式会社テストテスト"
        question = self._make_question_at_length(80 + len(company) + 1)
        assert len(question) == 80 + len(company) + 1
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call(question, stage="company_reason", company_name=company)
        assert "too_long" in _fallback_reasons(info_mock)

    def test_empty_company_name_keeps_80_limit(self) -> None:
        # company_name が空文字なら従来通り 80 文字上限
        question = self._make_question_at_length(81)
        assert len(question) == 81
        with patch.object(motivation_module.logger, "info") as info_mock:
            _call(question, stage="company_reason", company_name="")
        assert "too_long" in _fallback_reasons(info_mock)
