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
        assert "experience_fabrication" not in HARD_BLOCK_HALLUCINATION_CODES
