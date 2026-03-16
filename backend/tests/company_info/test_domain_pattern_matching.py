"""
Unit tests for domain_pattern_matches and _resolve_site_domains.

Covers:
- Existing segment-based matching (exact, prefix, suffix)
- Hyphen-normalized matching (Step 2)
- Short pattern guard
- Dotted pattern matching
- _resolve_site_domains non-dotted synthesis (Step 3)
"""

import pytest

from app.utils.company_names import (
    classify_company_domain_relation,
    domain_pattern_matches,
    is_registered_official_domain,
    normalize_company_result_source_type,
)
from app.routers.company_info import _score_corporate_candidate_with_breakdown


# =========================================================================
# Existing segment-based matching
# =========================================================================
class TestSegmentMatching:
    """Tests for the original 3-check segment logic."""

    def test_exact_segment_match(self):
        assert domain_pattern_matches("mec.co.jp", "mec") is True

    def test_exact_segment_longer_domain(self):
        assert domain_pattern_matches("www.mec.co.jp", "mec") is True

    def test_no_substring_match(self):
        """mec should NOT match mecyes (no hyphen boundary)."""
        assert domain_pattern_matches("mecyes.co.jp", "mec") is False

    def test_prefix_match_with_hyphen(self):
        """pattern-X style: mec-recruit, toyota-recruit."""
        assert domain_pattern_matches("mec-recruit.co.jp", "mec") is True  # 3 chars, allowed
        assert domain_pattern_matches("toyota-recruit.co.jp", "toyota") is True

    def test_suffix_match_with_hyphen(self):
        """X-pattern style: recruit-toyota."""
        assert domain_pattern_matches("recruit-toyota.co.jp", "toyota") is True

    def test_no_match_different_domain(self):
        assert domain_pattern_matches("google.com", "toyota") is False

    def test_empty_domain(self):
        assert domain_pattern_matches("", "toyota") is False

    def test_case_insensitive(self):
        assert domain_pattern_matches("TOYOTA.co.jp", "toyota") is True
        assert domain_pattern_matches("toyota.co.jp", "TOYOTA") is True


# =========================================================================
# Short pattern guard
# =========================================================================
class TestShortPatternGuard:
    """Patterns < 3 chars are blocked unless allowlisted."""

    def test_short_pattern_blocked(self):
        """2-char pattern not in allowlist should not match."""
        assert domain_pattern_matches("xy.co.jp", "xy") is False

    def test_three_char_pattern_allowed(self):
        """3-char pattern should work normally."""
        assert domain_pattern_matches("abc.co.jp", "abc") is True


# =========================================================================
# Dotted pattern matching
# =========================================================================
class TestDottedPatternMatching:
    """Tests for patterns containing dots (e.g., 'aws.amazon')."""

    def test_dotted_exact(self):
        assert domain_pattern_matches("aws.amazon.com", "aws.amazon") is True

    def test_dotted_with_subdomain(self):
        assert domain_pattern_matches("www.aws.amazon.com", "aws.amazon") is True

    def test_dotted_no_match(self):
        assert domain_pattern_matches("notaws.amazon.com", "aws.amazon") is False

    def test_dotted_full_domain(self):
        assert domain_pattern_matches("bk.mufg.jp", "bk.mufg") is True


# =========================================================================
# Hyphen-normalized matching (Step 2)
# =========================================================================
class TestHyphenNormalizedMatching:
    """Tests for hyphen normalization: pattern has hyphens, domain doesn't."""

    def test_dehyphenated_exact_match(self):
        """tokiomarine-hd → tokiomarinehd matches tokiomarinehd.com"""
        assert domain_pattern_matches("tokiomarinehd.com", "tokiomarine-hd") is True

    def test_dehyphenated_prefix_match(self):
        """sekisui-chem → sekisuichem matches prefix of sekisuichemical.co.jp
        Length guard: len('sekisuichemical') = 14 <= len('sekisuichem') + 8 = 18 → OK"""
        assert domain_pattern_matches("sekisuichemical.co.jp", "sekisui-chem") is True

    def test_dehyphenated_prefix_too_long(self):
        """Length guard should prevent very long segments from matching."""
        # Pattern 'ab-cd' dehyphenates to 'abcd' (4 chars), max segment = 4+8 = 12
        # 'abcdsomethingverylong' is 21 chars > 12 → should NOT match
        assert domain_pattern_matches("abcdsomethingverylong.com", "ab-cd") is False

    def test_dehyphenated_exact_smbccard(self):
        """smbc-card → smbccard matches smbccard.com"""
        assert domain_pattern_matches("smbccard.com", "smbc-card") is True

    def test_dehyphenated_suffix_match(self):
        """Pattern dehyphenated matches segment suffix."""
        assert domain_pattern_matches("recruittokiomarinehd.com", "tokiomarine-hd") is True

    def test_short_pattern_dehyphenated_blocked(self):
        """If dehyphenated pattern < 4 chars, skip hyphen normalization."""
        # a-b dehyphenates to 'ab' which is < 4
        assert domain_pattern_matches("ab.com", "a-b") is False

    def test_reverse_segment_has_hyphens(self):
        """Domain segment has hyphens, pattern doesn't:
        tokiomarine-hd.com with pattern 'tokiomarinehd' should match."""
        assert domain_pattern_matches("tokiomarine-hd.com", "tokiomarinehd") is True

    def test_reverse_no_false_positive(self):
        """Reverse matching should be exact after dehyphenation."""
        assert domain_pattern_matches("tokio-marine-hd-extra.com", "tokiomarinehd") is False

    def test_both_have_hyphens_different(self):
        """Different hyphenation should still match if dehyphenated forms are equal."""
        assert domain_pattern_matches("tokio-marinehd.com", "tokiomarine-hd") is True

    def test_no_false_positive_short_dehyphen(self):
        """smth should NOT match smtb (no hyphen involved, just different chars)."""
        assert domain_pattern_matches("smtb.jp", "smth") is False

    def test_real_case_matsukiyococokara(self):
        """matsukiyococokara.com with pattern matsukiyococokara → exact match."""
        assert domain_pattern_matches("matsukiyococokara.com", "matsukiyococokara") is True

    def test_real_case_aboutamazon(self):
        """aboutamazon.jp with pattern aboutamazon → exact segment match."""
        assert domain_pattern_matches("aboutamazon.jp", "aboutamazon") is True


# =========================================================================
# _resolve_site_domains (Step 3)
# =========================================================================
class TestResolveSiteDomains:
    """Tests for _resolve_site_domains with non-dotted pattern synthesis."""

    @pytest.fixture
    def resolve_fn(self):
        from app.utils.web_search import _resolve_site_domains
        return _resolve_site_domains

    def test_preferred_domain_overrides(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": ["foo", "bar.com"]},
            preferred_domain="override.com",
        )
        assert result == ["override.com"]

    def test_dotted_patterns_first(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": ["aws.amazon", "smcc"]},
            preferred_domain=None,
        )
        # aws.amazon should come first (dotted), then smcc.co.jp (synthesized)
        assert result[0] == "aws.amazon"
        assert "smcc.co.jp" in result

    def test_non_dotted_synthesis(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": ["smcc"]},
            preferred_domain=None,
        )
        assert result == ["smcc.co.jp"]

    def test_non_dotted_skips_short(self, resolve_fn):
        """Patterns < 3 chars should be skipped in synthesis."""
        result = resolve_fn(
            {"official_patterns": ["ab"]},
            preferred_domain=None,
        )
        assert result == []

    def test_max_domains_limit(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": ["a.com", "b.com", "c.com", "d.com"]},
            preferred_domain=None,
            max_domains=3,
        )
        assert len(result) == 3

    def test_mixed_dotted_and_non_dotted(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": ["tokiomarine-hd.com", "tokiomarine-hd"]},
            preferred_domain=None,
        )
        # Dotted first, then non-dotted synthesis should be deduped if same
        assert result[0] == "tokiomarine-hd.com"
        # The synthesized tokiomarine-hd.co.jp is different from .com, so included
        assert len(result) == 2

    def test_empty_patterns(self, resolve_fn):
        result = resolve_fn(
            {"official_patterns": []},
            preferred_domain=None,
        )
        assert result == []

    def test_no_patterns_key(self, resolve_fn):
        result = resolve_fn({}, preferred_domain=None)
        assert result == []


# =========================================================================
# Integration: domain_pattern_matches with company_mappings.json data
# =========================================================================
class TestRealCompanyPatterns:
    """Validate that known company domains match their registered patterns."""

    @pytest.mark.parametrize(
        "domain,pattern,expected",
        [
            # 東京海上HD
            ("tokiomarinehd.com", "tokiomarine-hd", True),
            ("tokiomarine-hd.com", "tokiomarine-hd", True),
            ("tokiomarinehd.com", "tokiomarinehd", True),
            ("tokiomarineam.co.jp", "tokiomarineam", True),
            # 積水化学工業
            ("sekisui.co.jp", "sekisui", True),
            ("sekisuichemical.co.jp", "sekisui-chem", True),
            # 三井住友カード
            ("smbc-card.com", "smbc-card", True),
            ("smbccard.com", "smbc-card", True),
            # 三井住友銀行
            ("smbc.co.jp", "smbc", True),
            # Amazon
            ("aboutamazon.jp", "aboutamazon", True),
            ("amazon.co.jp", "amazon", True),
            # AWS
            ("aws.amazon.com", "aws.amazon", True),
            # マツモトキヨシ
            ("matsukiyococokara.com", "matsukiyococokara", True),
            ("matsumoto-inc.co.jp", "matsumoto-inc", True),
            # シティグループ
            ("citigroup.com", "citigroup", True),
            ("citi.com", "citi", True),
            ("citibank.co.jp", "citibank", True),
            # 三井住友信託銀行
            ("smtb.jp", "smtb", True),
            ("smtgs.co.jp", "smtgs", True),
            # 三井住友トラスト・ホールディングス subsidiaries
            ("smtrc.jp", "smtrc", True),
            ("smtbs.co.jp", "smtbs", True),
            ("smtss.co.jp", "smtss", True),
            ("smtic.co.jp", "smtic", True),
            # コーセー
            ("kose.co.jp", "kose", True),
            ("koseholdings.co.jp", "koseholdings", True),
            # ワコール
            ("wacoal.co.jp", "wacoal", True),
            ("wacoalholdings.co.jp", "wacoalholdings", True),
            # ソニーミュージック
            ("sonymusic.co.jp", "sonymusic", True),
            ("sonymusicsolutions.co.jp", "sonymusicsolutions", True),
            # 大丸松坂屋
            ("daimaru-matsuzakaya.com", "daimaru-matsuzakaya", True),
            ("daimaru.co.jp", "daimaru", True),
            ("dmdepart.jp", "dmdepart", True),
            # 損害保険ジャパン
            ("sompo-japan.co.jp", "sompo-japan", True),
            ("sompo.jp", "sompo", True),
            # 富士ソフト
            ("fsi.co.jp", "fsi", True),
            ("fujisoft.co.jp", "fujisoft", True),
            # 凸版印刷 (dotted pattern)
            ("toppan.co.jp", "toppan", True),
            ("toppan.co.jp", "toppan.co.jp", True),
            # JR西日本
            ("westjr.co.jp", "westjr", True),
            ("jr-odekake.net", "jr-odekake", True),
            # Negative cases
            ("smtb.jp", "smth", False),  # Similar but different
            ("google.com", "amazon", False),
        ],
    )
    def test_company_domain_matching(self, domain, pattern, expected):
        assert domain_pattern_matches(domain, pattern) is expected


class TestOfficialAndRelationClassification:
    def test_sky_registered_domains_are_official(self):
        assert (
            is_registered_official_domain(
                "https://www.sky-recruit.jp/job/embed-eval/",
                "Sky",
            )
            is True
        )
        assert (
            is_registered_official_domain(
                "https://www.sky-career.jp/company/software.html",
                "Ｓｋｙ株式会社",
            )
            is True
        )

    def test_sky_foreign_group_domain_is_not_official(self):
        assert (
            is_registered_official_domain(
                "https://www.skygroup.sky/about/our-governance/investors",
                "Sky",
            )
            is False
        )

    def test_subsidiary_like_domain_is_not_official_for_parent(self):
        assert (
            is_registered_official_domain(
                "https://watami-takushoku.co.jp/",
                "ワタミ",
            )
            is False
        )

    def test_recruit_affix_domain_remains_official(self):
        assert (
            is_registered_official_domain(
                "https://watami-recruit.co.jp/",
                "ワタミ",
            )
            is True
        )

    def test_parent_domain_is_classified_for_subsidiary_search(self):
        relation = classify_company_domain_relation(
            "https://career.mitsui.com/recruit/",
            "三井物産スチール",
            "corporate_site",
        )
        assert relation["source_type"] == "parent"
        assert relation["is_official"] is False
        assert relation["parent_allowed"] is False
        assert relation["relation_company_name"] == "三井物産"

    def test_parent_domain_can_be_allowed_for_ir_search(self):
        relation = classify_company_domain_relation(
            "https://www.mizuho-fg.co.jp/ir/",
            "みずほ銀行",
            "ir_materials",
        )
        assert relation["source_type"] == "parent"
        assert relation["is_official"] is False
        assert relation["parent_allowed"] is True
        assert relation["relation_company_name"] == "みずほフィナンシャルグループ"

    def test_subsidiary_domain_is_classified_for_parent_search(self):
        relation = classify_company_domain_relation(
            "https://www.mitsui-steel.com/company/",
            "三井物産",
            "corporate_site",
        )
        assert relation["source_type"] == "subsidiary"
        assert relation["is_official"] is False
        assert relation["is_subsidiary"] is True
        assert relation["relation_company_name"] == "三井物産スチール"

    def test_shared_bank_domain_is_not_official_for_parent_company(self):
        relation = classify_company_domain_relation(
            "https://www.smbc.co.jp/",
            "三井住友フィナンシャルグループ",
            "corporate_site",
        )
        assert relation["source_type"] == "subsidiary"
        assert relation["is_official"] is False
        assert relation["is_subsidiary"] is True
        assert relation["relation_company_name"] == "三井住友銀行"

    def test_shared_bank_domain_remains_official_for_bank(self):
        relation = classify_company_domain_relation(
            "https://www.smbc.co.jp/",
            "三井住友銀行",
            "corporate_site",
        )
        assert relation["source_type"] == "official"
        assert relation["is_official"] is True
        assert relation["is_parent"] is False
        assert relation["is_subsidiary"] is False

    def test_bk_mufg_domain_is_not_official_for_group(self):
        relation = classify_company_domain_relation(
            "https://bk.mufg.jp/",
            "三菱UFJフィナンシャル・グループ",
            "corporate_site",
        )
        assert relation["source_type"] == "subsidiary"
        assert relation["is_official"] is False
        assert relation["is_subsidiary"] is True
        assert relation["relation_company_name"] == "三菱UFJ銀行"

    def test_sibling_company_domain_is_not_mislabeled_as_parent(self):
        relation = classify_company_domain_relation(
            "https://www.mizuho-tb.co.jp/",
            "みずほ銀行",
            "corporate_site",
        )
        assert relation["source_type"] == "other"
        assert relation["is_official"] is False
        assert relation["is_parent"] is False
        assert relation["is_subsidiary"] is False

    def test_related_company_relation_cannot_be_promoted_back_to_official(self):
        relation = classify_company_domain_relation(
            "https://career.mitsui.com/recruit/",
            "三井物産スチール",
            "corporate_site",
        )
        assert normalize_company_result_source_type("official", relation) == "parent"

    def test_employee_interview_gate_rejects_ir_title(self):
        from app.routers.company_info import _should_include_corporate_candidate

        keep, reason = _should_include_corporate_candidate(
            "official",
            "employee_interviews",
            {
                "is_official": True,
                "is_parent": False,
                "is_subsidiary": False,
            },
            url="https://www.skygroup.jp/ir/investors/",
            title="Investors",
            snippet="投資家向け情報を掲載しています。",
        )

        assert keep is False
        assert reason == "社員記事不適合"

    def test_employee_interview_gate_accepts_people_article(self):
        from app.routers.company_info import _should_include_corporate_candidate

        keep, reason = _should_include_corporate_candidate(
            "official",
            "employee_interviews",
            {
                "is_official": True,
                "is_parent": False,
                "is_subsidiary": False,
            },
            url="https://www.sky-recruit.jp/people/member01/",
            title="社員インタビュー",
            snippet="若手社員の働き方を紹介します。",
        )

        assert keep is True
        assert reason is None


class TestCompanyInfoConfidenceRules:
    @pytest.fixture
    def company_info_helpers(self):
        from app.routers.company_info import (
            _get_source_type,
            _hybrid_score_to_confidence,
            _score_to_confidence,
        )

        return _get_source_type, _score_to_confidence, _hybrid_score_to_confidence

    def test_get_source_type_marks_parent_site_as_parent(
        self, company_info_helpers
    ):
        get_source_type, _, _ = company_info_helpers
        assert (
            get_source_type(
                "https://career.mitsui.com/recruit/",
                "三井物産スチール",
            )
            == "parent"
        )

    def test_get_source_type_marks_subsidiary_site_as_subsidiary(
        self, company_info_helpers
    ):
        get_source_type, _, _ = company_info_helpers
        assert (
            get_source_type(
                "https://www.smbc.co.jp/",
                "三井住友フィナンシャルグループ",
            )
            == "subsidiary"
        )

    def test_related_company_confidence_is_capped_in_legacy_scores(
        self, company_info_helpers
    ):
        _, score_to_confidence, _ = company_info_helpers
        assert score_to_confidence(12, "parent") == "medium"
        assert score_to_confidence(12, "subsidiary") == "medium"

    def test_related_company_confidence_is_capped_in_hybrid_scores(
        self, company_info_helpers
    ):
        _, _, hybrid_score_to_confidence = company_info_helpers
        assert hybrid_score_to_confidence(0.95, "parent") == "medium"
        assert hybrid_score_to_confidence(0.95, "subsidiary") == "medium"

    def test_official_domain_title_spacing_does_not_trigger_company_mismatch_penalty(self):
        score, breakdown, _ = _score_corporate_candidate_with_breakdown(
            url="https://www.mysite.bk.mufg.jp/career/interview/07.html",
            title="07.安井 大輔 | 行 員紹介 | 三 菱 ＵＦＪ 銀 行 | Career Recruiting",
            snippet="システム・デジタル領域で活躍する社員のインタビュー。",
            company_name="三菱UFJ銀行",
            search_type="business",
            content_type="employee_interviews",
        )

        assert score is not None
        assert "企業不一致ペナルティ" not in breakdown
        assert breakdown.get("ドメインパターン一致") == "+4.0 (registered)"
