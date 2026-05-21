import pytest

from app.routers.es_review_fact_guard import (
    HARD_BLOCK_HALLUCINATION_CODES,
    _compute_hallucination_score,
    _detect_fact_hallucination_warnings,
    _extract_numeric_expressions,
    _extract_role_titles,
)


class TestExtractNumericExpressions:
    def test_arabic_with_unit(self):
        result = _extract_numeric_expressions("5人のチームで活動した")
        assert len(result) == 1
        assert result[0]["normalized"] == 5.0
        assert result[0]["unit"] == "人"

    def test_kanji_number(self):
        result = _extract_numeric_expressions("五人のチームで活動した")
        assert len(result) == 1
        assert result[0]["normalized"] == 5.0

    def test_month_variants(self):
        result = _extract_numeric_expressions("3か月間の活動")
        assert len(result) >= 1


class TestExtractRoleTitles:
    def test_vice_president(self):
        roles = _extract_role_titles("サークルの副会長として活動")
        assert "副会長" in roles

    def test_multiple_roles(self):
        roles = _extract_role_titles("会長と副部長を経験")
        assert "会長" in roles
        assert "副部長" in roles


class TestDetectFactHallucination:
    def test_number_mutation_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "50人のチームで活動した",
            "5人のチームで活動した",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "number_mutation" in codes

    def test_number_preserved_synonym(self):
        warnings = _detect_fact_hallucination_warnings(
            "5名のチームで活動した",
            "5人のチームで活動した",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "number_mutation" not in codes

    def test_kanji_number_match(self):
        warnings = _detect_fact_hallucination_warnings(
            "5人のチームで活動した",
            "五人のチームで活動した",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "number_mutation" not in codes

    def test_role_promotion_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "サークルの会長として活動した",
            "サークルの副会長として活動した",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "role_title_mutation" in codes

    def test_metric_fabrication_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "売上を20%向上させた",
            "売上を向上させた",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "metric_fabrication" in codes

    def test_ordinal_not_flagged(self):
        warnings = _detect_fact_hallucination_warnings(
            "1つ目に、リーダーシップを発揮した",
            "リーダーシップを発揮した",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "metric_fabrication" not in codes

    def test_experience_fabrication_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "海外留学で得た経験を活かした",
            "大学で得た経験を活かした",
            template_type="gakuchika",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "experience_fabrication" in codes

    def test_research_experience_generalization_is_allowed(self):
        warnings = _detect_fact_hallucination_warnings(
            "研究経験を価値へ変えたい。",
            "研究で仮説検証を重ねた。",
            template_type="company_motivation",
            char_max=400,
        )
        codes = [w["code"] for w in warnings]
        assert "experience_fabrication" not in codes

    @pytest.mark.parametrize("term", ["人工知能研究", "共同研究", "医学研究", "AI研究"])
    def test_specific_research_fabrication_is_detected(self, term: str):
        warnings = _detect_fact_hallucination_warnings(
            f"{term}で得た経験を活かした。",
            "研究で仮説検証を重ねた。",
            template_type="company_motivation",
            char_max=400,
        )
        assert any(
            warning["code"] == "experience_fabrication" and term in warning["detail"]
            for warning in warnings
        )

    @pytest.mark.parametrize("term", ["DXプロジェクト", "Webインターン"])
    def test_latin_prefixed_experience_fabrication_is_detected(self, term: str):
        warnings = _detect_fact_hallucination_warnings(
            f"{term}で得た経験を活かした。",
            "大学で得た経験を活かした。",
            template_type="company_motivation",
            char_max=400,
        )
        assert any(
            warning["code"] == "experience_fabrication" and term in warning["detail"]
            for warning in warnings
        )

    def test_research_experience_is_detected_when_source_has_no_research(self):
        warnings = _detect_fact_hallucination_warnings(
            "研究経験を価値へ変えたい。",
            "大学で得た経験を活かした。",
            template_type="company_motivation",
            char_max=400,
        )
        assert any(warning["code"] == "experience_fabrication" for warning in warnings)

    def test_award_fabrication_is_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "全国大会優勝の経験を活かした。",
            "大会で努力した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "award_fabrication" for warning in warnings)

    @pytest.mark.parametrize("text", ["受賞した経験を活かした。", "優勝した経験を活かした。"])
    def test_bare_award_fabrication_is_detected(self, text: str):
        warnings = _detect_fact_hallucination_warnings(
            text,
            "大会で努力した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "award_fabrication" for warning in warnings)

    def test_praise_is_not_award_fabrication(self):
        warnings = _detect_fact_hallucination_warnings(
            "顧客から賞賛された経験を活かした。",
            "顧客に喜ばれた。",
            template_type="gakuchika",
            char_max=400,
        )
        assert not any(warning["code"] == "award_fabrication" for warning in warnings)

    def test_added_role_title_is_detected_even_without_source_role(self):
        warnings = _detect_fact_hallucination_warnings(
            "リーダーとして活動した。",
            "活動した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "role_title_mutation" for warning in warnings)

    @pytest.mark.parametrize("term", ["インターン経験", "アルバイトで"])
    def test_bare_experience_category_fabrication_is_detected(self, term: str):
        warnings = _detect_fact_hallucination_warnings(
            f"{term}改善した。",
            "大学で改善した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "experience_fabrication" for warning in warnings)

    def test_japanese_proper_noun_fabrication_is_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "東京大学で研究した。",
            "大学で研究した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "proper_noun_fabrication" for warning in warnings)

    def test_latin_proper_noun_fabrication_is_detected(self):
        warnings = _detect_fact_hallucination_warnings(
            "Pythonを使って改善した。",
            "分析して改善した。",
            template_type="gakuchika",
            char_max=400,
        )
        assert any(warning["code"] == "proper_noun_fabrication" for warning in warnings)

    def test_allowed_fact_text_is_treated_as_source_of_truth(self):
        warnings = _detect_fact_hallucination_warnings(
            "Pythonを使って改善した。",
            "分析して改善した。",
            template_type="gakuchika",
            char_max=400,
            allowed_fact_text="別設問でPythonを使った経験がある。",
        )
        assert not any(warning["code"] == "proper_noun_fabrication" for warning in warnings)


class TestHallucinationScoring:
    def test_tier2_on_number_mutation(self):
        warnings = [{"code": "number_mutation", "detail": "test"}]
        result = _compute_hallucination_score(warnings, template_type="gakuchika")
        assert result["tier"] == 2

    def test_tier1_on_experience_fabrication_only(self):
        warnings = [{"code": "experience_fabrication", "detail": "test"}]
        result = _compute_hallucination_score(warnings, template_type="gakuchika")
        assert result["tier"] == 1

    def test_hard_block_codes(self):
        assert "number_mutation" in HARD_BLOCK_HALLUCINATION_CODES
        assert "role_title_mutation" in HARD_BLOCK_HALLUCINATION_CODES
        assert "metric_fabrication" in HARD_BLOCK_HALLUCINATION_CODES
        assert "experience_fabrication" in HARD_BLOCK_HALLUCINATION_CODES
        assert "award_fabrication" in HARD_BLOCK_HALLUCINATION_CODES
        assert "proper_noun_fabrication" in HARD_BLOCK_HALLUCINATION_CODES
