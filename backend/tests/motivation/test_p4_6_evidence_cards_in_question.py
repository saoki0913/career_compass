"""P4-6: 質問プロンプトへの evidence cards 注入のユニットテスト.

`_format_evidence_cards_for_prompt` が企業エビデンスカードを質問 system prompt
の末尾に追加するための整形済みセクションを生成することを検証する。
"""

from __future__ import annotations

from app.routers.motivation import _format_evidence_cards_for_prompt


class TestFormatEvidenceCardsForPrompt:
    def test_empty_returns_empty(self) -> None:
        assert _format_evidence_cards_for_prompt(None) == ""
        assert _format_evidence_cards_for_prompt([]) == ""

    def test_single_card(self) -> None:
        result = _format_evidence_cards_for_prompt([
            {"contentType": "事業", "excerpt": "AI for X"}
        ])
        assert "## 利用可能な企業エビデンス" in result
        assert "E1 (事業)" in result
        assert "AI for X" in result

    def test_truncates_long_excerpts(self) -> None:
        long_text = "あ" * 200
        result = _format_evidence_cards_for_prompt([
            {"contentType": "事業", "excerpt": long_text}
        ])
        # 80 文字 + ... に短縮されるはず
        assert "あ" * 80 + "..." in result
        # 100 連続は出ない（短縮されている）
        assert "あ" * 100 not in result

    def test_max_3_cards(self) -> None:
        cards = [{"contentType": "事業", "excerpt": f"概要{i}"} for i in range(5)]
        result = _format_evidence_cards_for_prompt(cards, max_items=3)
        assert "概要0" in result
        assert "概要2" in result
        # 4 件目 (index 3) 以降は採用されない
        assert "概要3" not in result
        assert "概要4" not in result

    def test_skips_empty_excerpt(self) -> None:
        """excerpt が空白のみのカードはスキップされ、E 番号は採用順で振り直される."""
        result = _format_evidence_cards_for_prompt([
            {"contentType": "事業", "excerpt": "  "},
            {"contentType": "事業", "excerpt": "valid"},
        ])
        assert "valid" in result
        # 先頭の空 excerpt がスキップされ、有効カードは E1 として登場する
        assert "E1 (事業): valid" in result
        # 空をスキップしているので E2 は本文に現れない
        assert "E2" not in result

    def test_supports_snake_case_content_type(self) -> None:
        """source 由来の content_type (snake_case) も読める."""
        result = _format_evidence_cards_for_prompt([
            {"content_type": "ニュース", "excerpt": "新サービス開始"}
        ])
        assert "(ニュース)" in result
        assert "新サービス開始" in result

    def test_falls_back_to_default_content_type_label(self) -> None:
        """contentType / content_type が未指定なら '情報' になる."""
        result = _format_evidence_cards_for_prompt([
            {"excerpt": "プレーン excerpt"}
        ])
        assert "(情報)" in result
        assert "プレーン excerpt" in result

    def test_only_empty_excerpts_returns_empty(self) -> None:
        """有効カードがゼロなら見出しごと空文字を返す（呼び出し側でセクション省略可能）."""
        result = _format_evidence_cards_for_prompt([
            {"contentType": "事業", "excerpt": ""},
            {"contentType": "事業", "excerpt": "   "},
        ])
        assert result == ""

    def test_ignores_non_dict_entries(self) -> None:
        """不正な要素（None / 文字列）は無視して有効カードのみ整形する."""
        result = _format_evidence_cards_for_prompt([
            None,
            "stray",
            {"contentType": "事業", "excerpt": "valid"},
        ])
        assert "valid" in result
        assert "E1 (事業)" in result
