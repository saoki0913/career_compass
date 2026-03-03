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

from app.utils.company_names import domain_pattern_matches


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
