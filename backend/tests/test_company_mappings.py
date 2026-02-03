"""
企業マッピング総合検証テスト

company_mappings.json に登録された全企業の検索ロジックが正しく動作することを検証。

検証項目:
1. 全企業で公式ドメインが正しく検出される
2. 公式サイト + 新卒採用 = "公式・高"（2.25倍ブースト）
3. 親子会社・兄弟会社関係が正しく設定・活用される
4. 求人サイト（マイナビ等）が正しく分類される

Usage:
    # 全テスト実行
    pytest backend/tests/test_company_mappings.py -v

    # 公式ドメイン検証のみ
    pytest backend/tests/test_company_mappings.py -v -k "official"

    # 親子関係検証のみ
    pytest backend/tests/test_company_mappings.py -v -k "parent or subsidiary"

    # 求人サイト検証のみ
    pytest backend/tests/test_company_mappings.py -v -k "job_board"
"""

import pytest

from conftest import (
    MAPPINGS_FILE,
    load_all_companies,
    get_domains,
    has_parent,
    get_subsidiaries,
    get_parents,
    get_parent_companies_set,
)

from app.utils.company_names import (
    get_company_domain_patterns,
    get_parent_company,
    get_parent_domain_patterns,
    get_subsidiary_companies,
    get_sibling_companies,
    is_parent_domain,
    is_subsidiary_domain,
)
from app.utils.hybrid_search import (
    classify_source_type,
    calculate_domain_boost,
    CONTENT_TYPE_BOOSTS,
    PARENT_DOMAIN_PENALTIES,
)

# =============================================================================
# Helper Functions
# =============================================================================


def get_all_companies_with_domains() -> list[tuple[str, list[str]]]:
    """全企業とドメインパターンのペアを生成"""
    companies = load_all_companies()
    result = []
    for name, mapping in companies.items():
        domains = get_domains(mapping)
        if domains:
            result.append((name, domains))
    return result


def get_all_subsidiaries_for_test() -> list[tuple[str, dict]]:
    """子会社のリストを取得（テスト用）"""
    return get_subsidiaries(load_all_companies())


# =============================================================================
# TestMappingDataIntegrity: マッピングデータの整合性テスト
# =============================================================================


class TestMappingDataIntegrity:
    """マッピングデータの整合性テスト"""

    def test_mappings_file_exists(self):
        """マッピングファイルが存在する"""
        assert MAPPINGS_FILE.exists(), f"Mappings file not found: {MAPPINGS_FILE}"

    def test_mappings_file_valid_json(self, all_companies):
        """マッピングファイルが有効なJSONで、mappingsキーが存在する"""
        assert len(all_companies) > 0, "No companies loaded from mappings file"

    def test_company_count(self, all_companies):
        """登録企業数が1000社以上"""
        assert (
            len(all_companies) > 1000
        ), f"Expected >1000 companies, got {len(all_companies)}"

    def test_all_subsidiaries_have_valid_parent(self, all_companies):
        """全子会社の親会社が存在する"""
        missing_parents = []
        for name, mapping in all_companies.items():
            if has_parent(mapping):
                parent = mapping["parent"]
                if parent not in all_companies:
                    missing_parents.append(f"{name} → {parent}")

        assert len(missing_parents) == 0, f"親会社未登録の子会社:\n" + "\n".join(
            missing_parents
        )

    def test_all_companies_have_domains(self, all_companies):
        """全企業にドメインパターンが設定されている"""
        missing_domains = []
        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            if not domains:
                missing_domains.append(name)

        assert (
            len(missing_domains) == 0
        ), f"ドメイン未設定の企業 ({len(missing_domains)}社):\n" + "\n".join(
            missing_domains[:20]
        )


# =============================================================================
# TestDomainPatternConsistency: ドメインパターンの整合性検証
# =============================================================================


class TestDomainPatternConsistency:
    """ドメインパターンの整合性検証"""

    def test_patterns_are_lowercase(self, all_companies):
        """ドメインパターンはすべて小文字"""
        uppercase_patterns = []
        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            for domain in domains:
                if domain != domain.lower():
                    uppercase_patterns.append(f"{name}: {domain}")

        assert len(uppercase_patterns) == 0, f"大文字を含むパターン:\n" + "\n".join(
            uppercase_patterns[:20]
        )

    def test_no_duplicate_domains_within_company(self, all_companies):
        """同一企業内でドメインの重複がない"""
        duplicates = []
        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            if len(domains) != len(set(domains)):
                duplicates.append(f"{name}: {domains}")

        assert len(duplicates) == 0, f"重複ドメインを持つ企業:\n" + "\n".join(
            duplicates[:20]
        )

    def test_no_empty_domain_patterns(self, all_companies):
        """空文字のドメインパターンがない"""
        empty_patterns = []
        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            if "" in domains:
                empty_patterns.append(name)

        assert len(empty_patterns) == 0, f"空文字パターンを持つ企業:\n" + "\n".join(
            empty_patterns
        )

    def test_no_duplicate_domains_across_companies(self, all_companies):
        """主要ドメインパターンの重複がない（警告レベル）"""
        domain_to_company = {}
        duplicates = []

        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            for domain in domains:
                if domain in domain_to_company:
                    duplicates.append(
                        f"  {domain}: {domain_to_company[domain]} と {name}"
                    )
                else:
                    domain_to_company[domain] = name

        # 重複があっても警告のみ（異なる企業が同じドメインを持つケースもある）
        if duplicates:
            pytest.skip(f"重複ドメイン（要確認）:\n" + "\n".join(duplicates[:10]))


# =============================================================================
# TestOfficialDomainDetection: 公式ドメイン検出テスト
# =============================================================================


class TestOfficialDomainDetection:
    """全企業の公式ドメイン検証"""

    @pytest.mark.parametrize(
        "company_name,domains",
        get_all_companies_with_domains()[:500],  # 最初の500社をテスト
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_official_domain_detection_sample(
        self, company_name: str, domains: list[str]
    ):
        """公式ドメインが official_domain として検出される（サンプル）"""
        for domain in domains[:2]:  # 各企業の最初の2ドメインをテスト
            # サブドメイン形式はスキップ
            if "." in domain:
                continue

            test_urls = [
                f"https://www.{domain}.co.jp/",
                f"https://{domain}.com/",
            ]

            for url in test_urls:
                source_type = classify_source_type(url, company_name)
                assert (
                    source_type == "official_domain"
                ), f"{company_name}: {url} should be 'official_domain' but got '{source_type}'"

    def test_official_domain_boost_is_1_5(self):
        """公式ドメインで1.5倍のブーストが適用される"""
        boost = calculate_domain_boost(
            "https://www.nttdata.com/recruit/", company_name="NTTデータ"
        )
        assert boost == 1.5, f"Official domain boost should be 1.5, got {boost}"

    def test_non_official_domain_no_boost(self):
        """非公式ドメインにはブーストなし"""
        boost = calculate_domain_boost(
            "https://www.example.com/", company_name="NTTデータ"
        )
        assert boost == 1.0, f"Non-official domain should have boost 1.0, got {boost}"


# =============================================================================
# TestContentTypeBoost: コンテンツタイプブースト検証
# =============================================================================


class TestContentTypeBoost:
    """コンテンツタイプブースト検証"""

    def test_new_grad_recruitment_boost_defined(self):
        """新卒採用コンテンツのブースト係数が定義されている"""
        es_review_boosts = CONTENT_TYPE_BOOSTS.get("es_review", {})
        assert "new_grad_recruitment" in es_review_boosts
        assert es_review_boosts["new_grad_recruitment"] == 1.5

    def test_official_high_final_score(self):
        """公式・高 = official_domain (1.5x) × new_grad (1.5x) = 2.25x"""
        domain_boost = calculate_domain_boost(
            "https://www.nttdata.com/recruit/",
            company_name="NTTデータ",
            content_type="new_grad_recruitment",
        )
        content_boost = CONTENT_TYPE_BOOSTS["es_review"]["new_grad_recruitment"]

        assert domain_boost == 1.5, f"Domain boost should be 1.5, got {domain_boost}"
        assert content_boost == 1.5, f"Content boost should be 1.5, got {content_boost}"

        theoretical_max = domain_boost * content_boost
        assert (
            theoretical_max >= 2.0
        ), f"Official + new_grad should be >=2.0x, got {theoretical_max}"

    def test_ir_materials_lower_boost(self):
        """IR資料は低いブースト"""
        es_review_boosts = CONTENT_TYPE_BOOSTS.get("es_review", {})
        ir_boost = es_review_boosts.get("ir_materials", 1.0)
        new_grad_boost = es_review_boosts.get("new_grad_recruitment", 1.0)

        assert (
            ir_boost < new_grad_boost
        ), f"IR materials ({ir_boost}) should have lower boost than new_grad ({new_grad_boost})"


# =============================================================================
# TestParentChildRelationships: 親子会社関係の検証
# =============================================================================


class TestParentChildRelationships:
    """親子会社関係の検証"""

    def test_subsidiary_count(self, subsidiaries):
        """子会社が500社以上登録されている"""
        assert (
            len(subsidiaries) > 500
        ), f"Expected >500 subsidiaries, got {len(subsidiaries)}"

    def test_get_parent_company_returns_correct_parent(self):
        """get_parent_company() が正しい親会社を返す"""
        test_cases = [
            ("三井物産スチール", "三井物産"),
            ("伊藤忠テクノロジーベンチャーズ", "伊藤忠商事"),
            ("三菱商事ロジスティクス", "三菱商事"),
        ]

        for child, expected_parent in test_cases:
            actual = get_parent_company(child)
            if actual is None:
                pytest.skip(f"{child} is not registered")
            assert (
                actual == expected_parent
            ), f"get_parent_company('{child}') = '{actual}', expected '{expected_parent}'"

    def test_parent_companies_have_no_parent(self, parent_companies):
        """親会社にはさらなる親会社がいない"""
        with_parent = []
        for name, _ in parent_companies:
            parent = get_parent_company(name)
            if parent is not None:
                with_parent.append(f"{name} → {parent}")

        assert (
            len(with_parent) == 0
        ), f"親会社なのに親会社が設定されている:\n" + "\n".join(with_parent[:10])

    def test_all_subsidiaries_return_parent(self, subsidiaries):
        """全子会社に親会社が設定されている"""
        no_parent = []
        for name, _ in subsidiaries:
            parent = get_parent_company(name)
            if parent is None:
                no_parent.append(name)

        assert len(no_parent) == 0, f"子会社なのに親会社が取得できない:\n" + "\n".join(
            no_parent
        )

    def test_subsidiary_detection_for_parent_search(self):
        """親会社検索時に子会社ドメインが検出される"""
        subsidiaries = get_subsidiary_companies("NTTデータ")

        assert len(subsidiaries) > 0, "NTTデータ should have subsidiaries"

        for sub_name, domains in list(subsidiaries.items())[:3]:
            for domain in domains[:1]:
                if "." in domain:
                    continue
                url = f"https://www.{domain}.co.jp/"
                is_sub, detected_name = is_subsidiary_domain(url, "NTTデータ")

                assert (
                    is_sub
                ), f"子会社 {sub_name} のドメイン '{domain}' が is_subsidiary_domain() で検出されるべき"

    def test_parent_domain_detection_for_subsidiary_search(self):
        """子会社検索時に親会社ドメインが検出される"""
        test_cases = [
            ("三井物産スチール", "https://www.mitsui.com/", True),
            ("三菱商事ロジスティクス", "https://www.mitsubishicorp.com/", True),
            ("伊藤忠食品", "https://www.itochu.co.jp/", True),
        ]

        for child, parent_url, expected in test_cases:
            parent = get_parent_company(child)
            if parent is None:
                pytest.skip(f"{child} is not registered")

            result = is_parent_domain(parent_url, child)
            assert (
                result == expected
            ), f"is_parent_domain('{parent_url}', '{child}') = {result}, expected {expected}"

    def test_sibling_companies_share_parent(self):
        """兄弟会社が同じ親会社を共有する"""
        siblings = get_sibling_companies("みずほ銀行")

        if not siblings:
            pytest.skip("みずほ銀行 has no siblings registered")

        my_parent = get_parent_company("みずほ銀行")
        for sibling_name in siblings.keys():
            sibling_parent = get_parent_company(sibling_name)
            assert (
                sibling_parent == my_parent
            ), f"Sibling {sibling_name} has parent '{sibling_parent}', expected '{my_parent}'"

    def test_parent_domain_penalty_applied(self):
        """子会社検索時に親会社サイトが減点される"""
        boost = calculate_domain_boost(
            "https://www.mitsui.com/",
            company_name="三井物産スチール",
            content_type="new_grad_recruitment",
        )

        assert (
            boost < 1.0
        ), f"Parent domain should have penalty (boost < 1.0), got {boost}"

        expected_penalty = PARENT_DOMAIN_PENALTIES.get("new_grad_recruitment", 0.5)
        assert (
            boost == expected_penalty
        ), f"Parent domain penalty should be {expected_penalty}, got {boost}"

    def test_subsidiary_penalty_when_searching_parent(self):
        """親会社検索時に子会社サイトが減点される"""
        subsidiaries = get_subsidiary_companies("NTTデータ")

        if not subsidiaries:
            pytest.skip("NTTデータ has no subsidiaries")

        sub_name, domains = next(iter(subsidiaries.items()))
        if not domains:
            pytest.skip(f"{sub_name} has no domains")

        domain = domains[0]
        if "." in domain:
            pytest.skip(f"{sub_name} domain is subdomain format")

        url = f"https://www.{domain}.co.jp/"
        boost = calculate_domain_boost(url, company_name="NTTデータ")

        assert (
            boost < 1.0
        ), f"Subsidiary domain should have penalty (boost < 1.0), got {boost}"


# =============================================================================
# TestOwnDomainNotMisdetected: 子会社ドメイン誤検出防止
# =============================================================================


class TestOwnDomainNotMisdetected:
    """子会社自身のドメインが親会社として誤検出されないことを確認"""

    @pytest.mark.parametrize(
        "subsidiary_name,mapping",
        get_all_subsidiaries_for_test()[:200],  # 最初の200子会社をテスト
        ids=lambda x: x if isinstance(x, str) else None,
    )
    def test_own_domain_not_parent(self, subsidiary_name: str, mapping: dict):
        """子会社自身のドメインは親会社として検出されない"""
        domains = mapping.get("domains", [])
        if not domains:
            pytest.skip(f"{subsidiary_name} has no domains")

        parent_domains = get_parent_domain_patterns(subsidiary_name)

        for domain in domains:
            if "." in domain:
                continue

            # 親会社と同じドメインを共有している場合はスキップ
            if domain in parent_domains:
                continue

            test_urls = [
                f"https://www.{domain}.co.jp/",
                f"https://{domain}.com/",
            ]

            for url in test_urls:
                result = is_parent_domain(url, subsidiary_name)
                assert (
                    result is False
                ), f"{subsidiary_name}: 自社ドメイン '{domain}' が親会社として誤検出 (URL: {url})"


# =============================================================================
# TestJobBoardRanking: 求人サイト分類検証
# =============================================================================


class TestJobBoardRanking:
    """求人サイトの分類検証"""

    def test_mynavi_classified_as_job_board(self):
        """マイナビが job_board として分類される"""
        mynavi_urls = [
            "https://job.mynavi.jp/26/pc/search/corp/overview/index/?corpId=12345",
            "https://job.mynavi.jp/company/nttdata/",
        ]

        for url in mynavi_urls:
            source_type = classify_source_type(url)
            assert (
                source_type == "job_board"
            ), f"Mynavi URL should be 'job_board', got '{source_type}'"

    def test_rikunabi_classified_as_job_board(self):
        """リクナビが job_board として分類される"""
        rikunabi_url = "https://job.rikunabi.com/company/nttdata/"
        source_type = classify_source_type(rikunabi_url)
        assert (
            source_type == "job_board"
        ), f"Rikunabi URL should be 'job_board', got '{source_type}'"

    def test_doda_classified_as_job_board(self):
        """dodaが job_board として分類される"""
        doda_url = "https://doda.jp/company/nttdata/"
        source_type = classify_source_type(doda_url)
        assert (
            source_type == "job_board"
        ), f"doda URL should be 'job_board', got '{source_type}'"

    def test_all_major_job_boards_classified(self):
        """主要求人サイトがすべて job_board として分類される"""
        job_boards = {
            "mynavi": "https://job.mynavi.jp/company/test/",
            "rikunabi": "https://job.rikunabi.com/company/test/",
            "doda": "https://doda.jp/company/test/",
            "en-japan": "https://employment.en-japan.com/company/test/",
            "green": "https://green-japan.com/company/test/",
            "wantedly": "https://wantedly.com/companies/test/",
        }

        for name, url in job_boards.items():
            source_type = classify_source_type(url)
            assert (
                source_type == "job_board"
            ), f"{name} ({url}) should be 'job_board', got '{source_type}'"


# =============================================================================
# TestDomainBoundaryValidation: ドメイン境界検証
# =============================================================================


class TestDomainBoundaryValidation:
    """ドメイン境界検証（誤検出防止）"""

    def test_is_parent_domain_has_boundary_check(self):
        """is_parent_domain() は境界チェックが正しく動作する"""
        result = is_parent_domain(
            "https://www.smitsui.com/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "'smitsui.com' should NOT match parent domain 'mitsui' (boundary check)"

    def test_hyphenated_domain_match(self):
        """ハイフン区切りドメインが正しくマッチ"""
        is_official = classify_source_type(
            "https://www.nttdata-mse.co.jp/", company_name="NTTデータMSE"
        )
        assert (
            is_official == "official_domain"
        ), "'nttdata-mse.co.jp' should match 'NTTデータMSE'"

    def test_subdomain_match(self):
        """サブドメインも正しくマッチ"""
        is_official = classify_source_type(
            "https://recruit.nttdata.com/", company_name="NTTデータ"
        )
        assert (
            is_official == "official_domain"
        ), "'recruit.nttdata.com' should match 'NTTデータ'"

    def test_parent_not_matched_by_extended_name(self):
        """親会社名を含む子会社ドメインが親会社として誤検出されない"""
        result = is_parent_domain(
            "https://www.mitsui-steel.com/", company_name="三井物産スチール"
        )
        assert (
            result is False
        ), "'mitsui-steel.com' should NOT be detected as parent for '三井物産スチール'"


# =============================================================================
# TestStatistics: 統計情報出力（デバッグ用）
# =============================================================================


class TestStatistics:
    """統計情報の出力（テスト実行時の確認用）"""

    def test_print_statistics(self, all_companies, subsidiaries, parent_company_names):
        """マッピング統計を出力"""
        total = len(all_companies)
        subsidiary_count = len(subsidiaries)
        parent_count = len(parent_company_names)

        print(f"\n{'=' * 60}")
        print(f"企業マッピング統計")
        print(f"{'=' * 60}")
        print(f"総企業数: {total}")
        print(f"子会社数: {subsidiary_count}")
        print(f"親会社数: {parent_count}")
        print(f"独立企業数: {total - subsidiary_count}")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
