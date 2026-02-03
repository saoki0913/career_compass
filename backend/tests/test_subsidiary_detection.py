"""
子会社判定ロジックのテスト

_is_subsidiary(), _is_parent_company_site(), is_subsidiary_domain() 等の
子会社判定ロジックの正確性を検証。

Usage:
    pytest backend/tests/test_subsidiary_detection.py -v
    pytest backend/tests/test_subsidiary_detection.py -v -k "TestSubsidiaryBasics"
    pytest backend/tests/test_subsidiary_detection.py -v -k "wildcard"
"""

import pytest

from app.routers.company_info import _is_subsidiary, _is_parent_company_site
from app.utils.company_names import (
    is_parent_domain,
    is_subsidiary_domain,
    get_parent_company,
    get_subsidiary_companies,
    get_company_domain_patterns,
)
from app.utils.hybrid_search import calculate_domain_boost

# =============================================================================
# TestSubsidiaryBasics: 基本的な子会社判定テスト
# =============================================================================


class TestSubsidiaryBasics:
    """子会社判定のドメインホワイトリストテスト"""

    def test_mfr_not_subsidiary(self):
        """三井不動産レジデンシャル公式サイトは子会社判定されない"""
        result = _is_subsidiary(
            company_name="三井不動産レジデンシャル",
            title="新卒採用情報｜三井不動産レジデンシャル株式会社",
            url="https://www.mfr.co.jp/recruit/new/",
        )
        assert result is False, "mfr.co.jp should NOT be detected as subsidiary"

    def test_mfr_entry_page_not_subsidiary(self):
        """三井不動産レジデンシャルのエントリーページも子会社判定されない"""
        result = _is_subsidiary(
            company_name="三井不動産レジデンシャル",
            title="エントリー｜新卒採用情報｜三井不動産レジデンシャル株式会社",
            url="https://www.mfr.co.jp/recruit/new/entry/",
        )
        assert result is False, "Entry page should NOT be detected as subsidiary"

    def test_mfr_main_recruit_page_not_subsidiary(self):
        """三井不動産レジデンシャルの採用トップページも子会社判定されない"""
        result = _is_subsidiary(
            company_name="三井不動産レジデンシャル",
            title="採用情報：三井不動産レジデンシャル株式会社",
            url="https://www.mfr.co.jp/recruit/",
        )
        assert result is False, "Recruit top page should NOT be detected as subsidiary"

    def test_subsidiary_still_detected_for_unregistered_domain(self):
        """未登録ドメインで子会社キーワードがある場合は子会社として検出"""
        result = _is_subsidiary(
            company_name="三井物産",
            title="三井物産プラスチック株式会社",
            url="https://www.unknown-domain.co.jp/",
        )
        assert result is True, "Subsidiary with unregistered domain should be detected"

    def test_no_parent_name_not_subsidiary(self):
        """親会社名が含まれない場合は子会社判定しない"""
        result = _is_subsidiary(
            company_name="三井物産", title="株式会社ABC", url="https://www.abc.co.jp/"
        )
        assert result is False, "No parent name should not be subsidiary"

    def test_registered_domain_bypasses_keyword_check(self):
        """登録済みドメインは子会社キーワードチェックをバイパス"""
        result = _is_subsidiary(
            company_name="三井不動産",
            title="三井不動産 | 不動産総合デベロッパー",
            url="https://www.mitsuifudosan.co.jp/",
        )
        assert result is False, "Registered domain should bypass subsidiary check"


# =============================================================================
# TestParentDomainExclusion: 親会社サイト除外テスト
# =============================================================================


class TestParentDomainExclusion:
    """子会社検索時の親会社サイト除外テスト"""

    def test_parent_domain_detection_mitsui(self):
        """三井物産スチール検索時に三井物産サイトが親会社として検出される"""
        result = is_parent_domain(
            url="https://career.mitsui.com/recruit/", company_name="三井物産スチール"
        )
        assert result is True, "career.mitsui.com should be detected as parent domain"

    def test_subsidiary_own_domain_not_parent(self):
        """子会社自身のドメインは親会社として検出されない"""
        result = is_parent_domain(
            url="https://www.msi-steel.co.jp/recruit/", company_name="三井物産スチール"
        )
        assert result is False, "Subsidiary's own domain should NOT be parent domain"

    def test_unrelated_domain_not_parent(self):
        """無関係なドメインは親会社として検出されない"""
        result = is_parent_domain(
            url="https://www.example.com/", company_name="三井物産スチール"
        )
        assert result is False, "Unrelated domain should NOT be parent domain"

    def test_parent_company_site_excluded(self):
        """子会社検索時に親会社サイトが除外対象として検出される"""
        result = _is_parent_company_site(
            company_name="三井物産スチール",
            title="三井物産 新卒採用",
            url="https://career.mitsui.com/recruit/",
        )
        assert result is True, "Parent company site should be excluded"

    def test_subsidiary_own_site_not_excluded(self):
        """子会社の専用サイトは除外されない"""
        result = _is_parent_company_site(
            company_name="三井物産スチール",
            title="三井物産スチール 採用情報",
            url="https://www.msi-steel.co.jp/recruit/",
        )
        assert result is False, "Subsidiary's own site should NOT be excluded"

    def test_parent_company_not_excluded_for_itself(self):
        """親会社を直接検索した場合は除外されない"""
        result = _is_parent_company_site(
            company_name="三井物産",
            title="三井物産 新卒採用",
            url="https://career.mitsui.com/recruit/",
        )
        assert (
            result is False
        ), "Parent company searching for itself should NOT be excluded"

    def test_mitsubishi_group_parent_detection(self):
        """三菱商事グループの親ドメイン検出テスト"""
        result = is_parent_domain(
            url="https://career-mc.mitsubishicorp.com/",
            company_name="三菱商事ロジスティクス",
        )
        assert result is True, "Mitsubishi Corp site should be detected as parent"


# =============================================================================
# TestDomainBoundaryValidation: ドメイン境界チェックテスト
# =============================================================================


class TestDomainBoundaryValidation:
    """ドメイン境界チェックのテスト - 部分文字列マッチの誤検出防止"""

    def test_exact_domain_match(self):
        """完全一致するドメインセグメント"""
        result = is_parent_domain(
            url="https://mitsui.com/recruit/", company_name="三井物産スチール"
        )
        assert result is True, "Exact domain match should be detected as parent"

    def test_subdomain_match(self):
        """サブドメインを含むマッチ"""
        result = is_parent_domain(
            url="https://career.mitsui.com/recruit/", company_name="三井物産スチール"
        )
        assert result is True, "Subdomain match should be detected as parent"

    def test_no_partial_match_prefix(self):
        """部分マッチ（接頭辞）は除外 - smitsui != mitsui"""
        result = is_parent_domain(
            url="https://smitsui.com/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "Partial match (prefix) should NOT be detected as parent"

    def test_no_partial_match_suffix(self):
        """部分マッチ（接尾辞）は除外 - permitsui != mitsui"""
        result = is_parent_domain(
            url="https://permitsui.com/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "Partial match (suffix) should NOT be detected as parent"

    def test_no_partial_match_embedded(self):
        """部分マッチ（埋め込み）は除外 - amitsuit != mitsui"""
        result = is_parent_domain(
            url="https://amitsuit.com/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "Partial match (embedded) should NOT be detected as parent"

    def test_hyphenated_pattern_prefix(self):
        """ハイフン付きパターン（接頭辞）"""
        result = is_parent_domain(
            url="https://mitsui-career.jp/", company_name="三井物産スチール"
        )
        assert (
            result is True
        ), "Hyphenated pattern (prefix) should be detected as parent"

    def test_hyphenated_pattern_suffix(self):
        """ハイフン付きパターン（接尾辞）"""
        result = is_parent_domain(
            url="https://career-mitsui.jp/", company_name="三井物産スチール"
        )
        assert (
            result is True
        ), "Hyphenated pattern (suffix) should be detected as parent"

    def test_no_match_similar_company(self):
        """類似企業名は誤マッチしない - sumitomo != mitsui"""
        result = is_parent_domain(
            url="https://sumitomo.com/", company_name="三井物産スチール"
        )
        assert result is False, "Similar but different company should NOT match"

    def test_subsidiary_own_hyphenated_domain_not_parent(self):
        """子会社のハイフン付きドメインは親会社として検出されない"""
        result = is_parent_domain(
            url="https://www.mitsui-steel.com/recruit/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "Subsidiary's own hyphenated domain should NOT be parent"


# =============================================================================
# TestWildcardSubsidiaryDetection: ワイルドカード子会社検出テスト
# =============================================================================


class TestWildcardSubsidiaryDetection:
    """ワイルドカードパターンによる未登録子会社検出のテスト"""

    def test_nttdata_sbc_detected(self):
        """NTTデータSBC（nttdata-sbc）が子会社として検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdata-sbc.co.jp/recruit/", parent_name="NTTデータ"
        )
        assert is_sub is True, "nttdata-sbc should be detected as subsidiary"
        assert name == "NTTデータSBC", f"Expected 'NTTデータSBC', got '{name}'"

    def test_nttdata_force_detected(self):
        """NTTデータフォース（nttdata-force）が子会社として検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdata-force.co.jp/", parent_name="NTTデータ"
        )
        assert is_sub is True, "nttdata-force should be detected as subsidiary"
        assert (
            name == "NTTデータフォース"
        ), f"Expected 'NTTデータフォース', got '{name}'"

    def test_unregistered_nttdata_xxx_detected(self):
        """未登録のnttdata-xxxドメインがワイルドカード検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdata-newsubsidiary.co.jp/", parent_name="NTTデータ"
        )
        assert (
            is_sub is True
        ), "nttdata-newsubsidiary should be detected as unregistered subsidiary"
        assert "未登録子会社" in name, f"Should indicate unregistered, got '{name}'"

    def test_nttdata_official_not_wildcard_detected(self):
        """NTTデータ公式（nttdata.com）はワイルドカード検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://www.nttdata.com/", parent_name="NTTデータ"
        )
        assert is_sub is False, "nttdata.com should NOT be detected as subsidiary"

    def test_nttdata_recruit_official_not_detected(self):
        """NTTデータ採用サイト（nttdata-recruit.com）は子会社として検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://nttdata-recruit.com/", parent_name="NTTデータ"
        )
        assert (
            is_sub is False
        ), "nttdata-recruit.com should NOT be detected as subsidiary"

    def test_nttdata_career_official_not_detected(self):
        """NTTデータキャリアサイト（nttdata-career.com）は子会社として検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://nttdata-career.com/", parent_name="NTTデータ"
        )
        assert (
            is_sub is False
        ), "nttdata-career.com should NOT be detected as subsidiary"

    def test_nttdft_detected_as_subsidiary(self):
        """nttdft.com（NTTデータフィナンシャルテクノロジー）が子会社として検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdft.com/recruit/", parent_name="NTTデータ"
        )
        assert is_sub is True, "nttdft.com should be detected as subsidiary"
        assert (
            name == "NTTデータフィナンシャルテクノロジー"
        ), f"Expected 'NTTデータフィナンシャルテクノロジー', got '{name}'"

    def test_mitsui_unregistered_detected(self):
        """未登録の三井物産関連ドメインがワイルドカード検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.mitsui-newcompany.co.jp/", parent_name="三井物産"
        )
        assert (
            is_sub is True
        ), "mitsui-newcompany should be detected as unregistered subsidiary"
        assert "未登録子会社" in name, f"Should indicate unregistered, got '{name}'"

    def test_mitsui_official_not_detected(self):
        """三井物産公式（mitsui.com）はワイルドカード検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://www.mitsui.com/", parent_name="三井物産"
        )
        assert is_sub is False, "mitsui.com should NOT be detected as subsidiary"


# =============================================================================
# TestParentSearchSubsidiaryDetection: 親会社検索時の子会社検出テスト
# =============================================================================


class TestParentSearchSubsidiaryDetection:
    """親会社検索時に子会社サイトが検出されることを確認"""

    def test_nttdata_detects_mse(self):
        """NTTデータ検索でNTTデータMSEサイトが検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://nttdmse-recruit.snar.jp/", parent_name="NTTデータ"
        )
        assert is_sub is True, "NTTデータMSE should be detected as subsidiary"
        assert name == "NTTデータMSE", f"Expected 'NTTデータMSE', got '{name}'"

    def test_nttdata_detects_strategy(self):
        """NTTデータ検索でNTTデータ経営研究所サイトが検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdata-strategy.com/recruit/", parent_name="NTTデータ"
        )
        assert is_sub is True, "NTTデータ経営研究所 should be detected as subsidiary"
        assert (
            name == "NTTデータ経営研究所"
        ), f"Expected 'NTTデータ経営研究所', got '{name}'"

    def test_nttdata_detects_kansai(self):
        """NTTデータ検索でNTTデータ関西サイトが検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.nttdata-kansai.co.jp/", parent_name="NTTデータ"
        )
        assert is_sub is True, "NTTデータ関西 should be detected as subsidiary"
        assert name == "NTTデータ関西", f"Expected 'NTTデータ関西', got '{name}'"

    def test_nttdata_official_not_detected(self):
        """NTTデータ公式サイトは子会社として検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://www.nttdata.com/global/ja/recruit/", parent_name="NTTデータ"
        )
        assert (
            is_sub is False
        ), "NTTデータ official site should NOT be detected as subsidiary"

    def test_mitsui_detects_steel(self):
        """三井物産検索で三井物産スチールサイトが検出される"""
        is_sub, name = is_subsidiary_domain(
            url="https://www.mitsui-steel.com/recruit/", parent_name="三井物産"
        )
        assert is_sub is True, "三井物産スチール should be detected as subsidiary"
        assert name == "三井物産スチール", f"Expected '三井物産スチール', got '{name}'"

    def test_mitsui_official_not_detected(self):
        """三井物産公式サイトは子会社として検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://career.mitsui.com/recruit/", parent_name="三井物産"
        )
        assert (
            is_sub is False
        ), "三井物産 official site should NOT be detected as subsidiary"

    def test_unrelated_domain_not_detected(self):
        """無関係なドメインは子会社として検出されない"""
        is_sub, _ = is_subsidiary_domain(
            url="https://www.example.com/", parent_name="NTTデータ"
        )
        assert is_sub is False, "Unrelated domain should NOT be detected as subsidiary"


# =============================================================================
# TestDomainBoostPenalty: ドメインブースト/ペナルティテスト
# =============================================================================


class TestDomainBoostPenalty:
    """ドメインブースト/ペナルティ計算のテスト"""

    def test_subsidiary_penalty(self):
        """子会社サイトは0.3xペナルティ"""
        boost = calculate_domain_boost(
            source_url="https://www.nttdata-strategy.com/",
            company_name="NTTデータ",
            content_type="new_grad_recruitment",
        )
        assert boost == 0.3, f"Subsidiary site should have 0.3x penalty, got {boost}"

    def test_no_penalty_for_official_site(self):
        """公式サイトはペナルティなし"""
        boost = calculate_domain_boost(
            source_url="https://www.nttdata.com/",
            company_name="NTTデータ",
            content_type="new_grad_recruitment",
        )
        assert boost >= 1.0, f"Official site should have no penalty, got {boost}"


# =============================================================================
# TestParentCompanyPatternExclusion: 親会社パターン除外テスト
# =============================================================================


class TestParentCompanyPatternExclusion:
    """親会社パターンが検索対象から除外されるテスト"""

    def test_nttdata_search_excludes_ntt_pattern(self):
        """NTTデータ検索でNTTパターンが含まれない（ntt.suaramerdeka.comなどの誤検出を防ぐ）"""
        patterns = get_company_domain_patterns("NTTデータ")
        assert "nttdata" in patterns, "nttdata pattern should be included"
        assert (
            "ntt" not in patterns
        ), "ntt pattern should NOT be included (parent company pattern)"

    def test_nttdata_search_includes_own_patterns(self):
        """NTTデータ検索で自社パターンは含まれる"""
        patterns = get_company_domain_patterns("NTTデータ")
        assert "nttdata" in patterns, "nttdata pattern should be included"

    def test_ntt_search_includes_ntt_pattern(self):
        """NTT検索ではnttパターンが含まれる"""
        patterns = get_company_domain_patterns("NTT")
        assert "ntt" in patterns, "ntt pattern should be included for NTT search"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
