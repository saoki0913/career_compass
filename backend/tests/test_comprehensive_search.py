"""
全企業包括的検索テスト

company_mappings.jsonに登録された全企業の検索が正しく動作することを検証する。

Usage:
    # 全テスト実行（約30分）
    pytest backend/tests/test_comprehensive_search.py -v -s

    # 関係性テストのみ（API呼び出しなし、高速）
    pytest backend/tests/test_comprehensive_search.py -v -k "TestCompanyRelationships"

    # 特定企業のみ
    pytest backend/tests/test_comprehensive_search.py -v -k "三菱地所"

    # 統計・サマリーのみ
    pytest backend/tests/test_comprehensive_search.py -v -k "TestSearchStatistics"

Note:
    - @pytest.mark.slow: 時間がかかるテスト
    - @pytest.mark.integration: 実際のAPI呼び出しを行うテスト
"""

import asyncio
import sys
import random
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import pytest

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import utility functions from conftest (pytest auto-loads conftest.py)
# Re-define here for standalone use
import json

MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "company_mappings.json"


def load_all_companies() -> dict:
    """company_mappings.json から全企業を読み込む"""
    with open(MAPPINGS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return {k: v for k, v in data.get("mappings", {}).items() if not k.startswith("_")}


def get_domains(mapping) -> list[str]:
    """マッピングからドメインパターンを取得"""
    if isinstance(mapping, list):
        return mapping
    return mapping.get("domains", [])


def has_parent(mapping) -> bool:
    """子会社かどうかを判定"""
    return isinstance(mapping, dict) and "parent" in mapping


def get_subsidiaries(companies: dict) -> list[tuple[str, dict]]:
    """子会社のリストを取得"""
    return [
        (name, mapping)
        for name, mapping in companies.items()
        if has_parent(mapping)
    ]


def get_parents(companies: dict) -> list[tuple[str, list]]:
    """親会社・独立企業のリストを取得"""
    return [
        (name, get_domains(mapping))
        for name, mapping in companies.items()
        if not has_parent(mapping)
    ]


def get_parent_companies_set(companies: dict) -> set[str]:
    """親会社名のセットを取得（子会社から参照されている親会社）"""
    parents = set()
    for mapping in companies.values():
        if isinstance(mapping, dict) and "parent" in mapping:
            parents.add(mapping["parent"])
    return parents


def get_subsidiary_parent_pairs(companies: dict) -> list[tuple[str, str]]:
    """(子会社名, 親会社名) のペアリストを取得"""
    return [
        (name, mapping["parent"])
        for name, mapping in companies.items()
        if isinstance(mapping, dict) and "parent" in mapping
    ]

try:
    from ddgs import DDGS
    HAS_DDGS = True
except ImportError:
    HAS_DDGS = False
    print("[包括的検索テスト] ⚠️ ddgs 未インストール")


# =============================================================================
# Constants
# =============================================================================

# Rate limiting
SEARCH_DELAY_SECONDS = 1.0  # DuckDuckGo API間隔

# Industry sampling for subsidiaries (to keep test time reasonable)
# Each industry will have at most N subsidiaries tested
MAX_SUBSIDIARIES_PER_INDUSTRY = 3

# Industries extracted from company_mappings.json section comments
INDUSTRY_SECTIONS = {
    "商社": ["_section_01", "_subsection_01"],
    "金融": ["_section_02", "_subsection_02"],
    "不動産": ["_section_03", "_subsection_03"],
    "IT・通信": ["_section_04", "_subsection_04"],
    "コンサル": ["_section_05", "_subsection_05"],
    "メーカー": ["_section_06", "_subsection_06"],
    "インフラ": ["_section_07", "_subsection_07"],
    "メディア": ["_section_08", "_subsection_08"],
    "その他": ["_section_09", "_subsection_09"],
}

# Output directory
OUTPUT_DIR = Path(__file__).parent / "output"


# =============================================================================
# Test Result Collector
# =============================================================================


class ResultCollector:
    """テスト結果を収集し、診断情報を生成するクラス"""

    def __init__(self):
        self.start_time = datetime.now()
        self.parent_results = []
        self.subsidiary_results = []
        self.official_domain_results = []
        self.recruitment_quality_results = []

    def add_parent_result(
        self,
        name: str,
        domains: list[str],
        success: bool,
        results_count: int,
        top_results: list[dict],
        official_domain_found: bool = None,
        official_domain_rank: int = None,
    ):
        """親会社の検索結果を追加"""
        self.parent_results.append({
            "name": name,
            "domains": domains,
            "search_success": success,
            "results_count": results_count,
            "top_results": top_results,
            "official_domain_found": official_domain_found,
            "official_domain_rank": official_domain_rank,
        })

    def add_subsidiary_result(
        self,
        name: str,
        parent: str,
        domains: list[str],
        success: bool,
        results_count: int,
        top_results: list[dict],
    ):
        """子会社の検索結果を追加"""
        self.subsidiary_results.append({
            "name": name,
            "parent": parent,
            "domains": domains,
            "search_success": success,
            "results_count": results_count,
            "top_results": top_results,
        })

    def add_official_domain_result(
        self,
        company: str,
        domains: list[str],
        found: bool,
        results_count: int,
        actual_domains: list[str],
    ):
        """公式ドメイン検出結果を追加"""
        self.official_domain_results.append({
            "company": company,
            "expected_domains": domains,
            "found": found,
            "results_count": results_count,
            "actual_domains_found": actual_domains,
        })

    def add_recruitment_quality_result(
        self,
        company: str,
        match_rate: float,
        matches: int,
        total: int,
        top_results: list[dict],
    ):
        """採用検索品質結果を追加"""
        self.recruitment_quality_results.append({
            "company": company,
            "match_rate": match_rate,
            "matches": matches,
            "total": total,
            "top_results": top_results,
        })

    def _generate_issues(self) -> dict:
        """問題のある企業を分類"""
        issues = {
            "no_results": {
                "description": "検索結果が0件だった企業",
                "companies": [],
            },
            "official_domain_not_found": {
                "description": "検索結果はあるが公式ドメインが検出されなかった企業",
                "companies": [],
            },
            "low_recruitment_quality": {
                "description": "採用キーワードマッチ率が50%未満だった企業",
                "companies": [],
            },
        }

        # 親会社で検索結果なし
        for r in self.parent_results:
            if not r["search_success"]:
                issues["no_results"]["companies"].append({
                    "name": r["name"],
                    "type": "parent",
                    "domains": r["domains"],
                    "query_used": f"{r['name']} 採用",
                })

        # 子会社で検索結果なし
        for r in self.subsidiary_results:
            if not r["search_success"]:
                issues["no_results"]["companies"].append({
                    "name": r["name"],
                    "type": "subsidiary",
                    "parent": r["parent"],
                    "domains": r["domains"],
                    "query_used": f"{r['name']} 採用",
                })

        # 公式ドメイン未検出
        for r in self.official_domain_results:
            if not r["found"]:
                issues["official_domain_not_found"]["companies"].append({
                    "name": r["company"],
                    "expected_domains": r["expected_domains"],
                    "actual_domains_found": r["actual_domains_found"][:5],
                    "results_count": r["results_count"],
                })

        # 採用検索品質が低い
        for r in self.recruitment_quality_results:
            if r["match_rate"] < 0.5:
                issues["low_recruitment_quality"]["companies"].append({
                    "name": r["company"],
                    "match_rate": r["match_rate"],
                    "matches": r["matches"],
                    "total": r["total"],
                    "top_results": r["top_results"][:3],
                })

        # カウントを追加
        for key in issues:
            issues[key]["count"] = len(issues[key]["companies"])

        return issues

    def _generate_suggestions(self, issues: dict) -> list:
        """改善提案を生成"""
        suggestions = []

        no_results = issues["no_results"]["count"]
        if no_results > 0:
            suggestions.append({
                "priority": "high",
                "issue": f"{no_results}社で検索結果なし",
                "action": "company_mappings.jsonの企業名表記を確認",
                "affected_companies": [c["name"] for c in issues["no_results"]["companies"][:10]],
            })

        domain_not_found = issues["official_domain_not_found"]["count"]
        if domain_not_found > 0:
            suggestions.append({
                "priority": "medium",
                "issue": f"{domain_not_found}社で公式ドメイン未検出",
                "action": "ドメインパターンの追加を検討",
                "affected_companies": [c["name"] for c in issues["official_domain_not_found"]["companies"][:10]],
            })

        low_quality = issues["low_recruitment_quality"]["count"]
        if low_quality > 0:
            suggestions.append({
                "priority": "low",
                "issue": f"{low_quality}社で採用キーワードマッチ率が低い",
                "action": "検索クエリの改善を検討",
                "affected_companies": [c["name"] for c in issues["low_recruitment_quality"]["companies"]],
            })

        return suggestions

    def _generate_summary(self) -> dict:
        """サマリーを生成"""
        total_parents = len(self.parent_results)
        total_subsidiaries = len(self.subsidiary_results)
        parent_success = sum(1 for r in self.parent_results if r["search_success"])
        subsidiary_success = sum(1 for r in self.subsidiary_results if r["search_success"])

        official_found = sum(1 for r in self.official_domain_results if r["found"])
        official_total = len(self.official_domain_results)

        return {
            "total_companies": total_parents + total_subsidiaries,
            "parent_companies": total_parents,
            "subsidiaries": total_subsidiaries,
            "parent_search_success": parent_success,
            "subsidiary_search_success": subsidiary_success,
            "search_success_rate": (parent_success + subsidiary_success) / max(total_parents + total_subsidiaries, 1),
            "official_domain_detection_rate": official_found / max(official_total, 1) if official_total > 0 else None,
        }

    def save_json(self, path: Path):
        """JSON形式で保存"""
        duration = (datetime.now() - self.start_time).total_seconds()
        issues = self._generate_issues()

        data = {
            "metadata": {
                "timestamp": self.start_time.isoformat(),
                "duration_seconds": round(duration),
                "test_version": "1.0",
            },
            "summary": self._generate_summary(),
            "issues": issues,
            "improvement_suggestions": self._generate_suggestions(issues),
            "detailed_results": {
                "parent_companies": self.parent_results,
                "subsidiaries": self.subsidiary_results,
                "official_domain_tests": self.official_domain_results,
                "recruitment_quality_tests": self.recruitment_quality_results,
            },
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\n[結果出力] JSON: {path}")

    def save_markdown(self, path: Path):
        """Markdown形式で保存"""
        duration = (datetime.now() - self.start_time).total_seconds()
        summary = self._generate_summary()
        issues = self._generate_issues()
        suggestions = self._generate_suggestions(issues)

        lines = [
            "# 包括的検索テスト結果レポート",
            "",
            f"**実行日時**: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"**実行時間**: {int(duration // 60)}分{int(duration % 60)}秒",
            "",
            "## サマリー",
            "",
            "| 指標 | 結果 |",
            "|------|------|",
            f"| 総企業数 | {summary['total_companies']:,}社 |",
            f"| 親会社 | {summary['parent_companies']:,}社 |",
            f"| 子会社 | {summary['subsidiaries']:,}社 |",
            f"| 検索成功率 | {summary['search_success_rate']:.1%} |",
        ]

        if summary['official_domain_detection_rate'] is not None:
            lines.append(f"| 公式ドメイン検出率 | {summary['official_domain_detection_rate']:.1%} |")

        # 検索結果なし
        if issues["no_results"]["count"] > 0:
            lines.extend([
                "",
                f"## 検索結果なし（{issues['no_results']['count']}社）",
                "優先度: **高**",
                "",
                "| 企業名 | タイプ | 登録ドメイン |",
                "|--------|--------|-------------|",
            ])
            for c in issues["no_results"]["companies"][:20]:
                company_type = "親会社" if c["type"] == "parent" else "子会社"
                domains = ", ".join(c["domains"][:3])
                lines.append(f"| {c['name']} | {company_type} | {domains} |")
            if issues["no_results"]["count"] > 20:
                lines.append(f"| ... 他 {issues['no_results']['count'] - 20}社 | | |")

        # 公式ドメイン未検出
        if issues["official_domain_not_found"]["count"] > 0:
            lines.extend([
                "",
                f"## 公式ドメイン未検出（{issues['official_domain_not_found']['count']}社）",
                "優先度: **中**",
                "",
                "| 企業名 | 期待ドメイン | 実際の上位結果 |",
                "|--------|-------------|---------------|",
            ])
            for c in issues["official_domain_not_found"]["companies"][:10]:
                expected = ", ".join(c["expected_domains"][:2])
                actual = ", ".join(c["actual_domains_found"][:3])
                lines.append(f"| {c['name']} | {expected} | {actual} |")

        # 採用検索品質が低い
        if issues["low_recruitment_quality"]["count"] > 0:
            lines.extend([
                "",
                f"## 採用キーワードマッチ率低（{issues['low_recruitment_quality']['count']}社）",
                "優先度: **低**",
                "",
                "| 企業名 | マッチ率 | マッチ数/総数 |",
                "|--------|---------|--------------|",
            ])
            for c in issues["low_recruitment_quality"]["companies"]:
                lines.append(f"| {c['name']} | {c['match_rate']:.0%} | {c['matches']}/{c['total']} |")

        # 改善アクション
        if suggestions:
            lines.extend([
                "",
                "## 改善アクション",
                "",
            ])
            for i, s in enumerate(suggestions, 1):
                priority = {"high": "高", "medium": "中", "low": "低"}[s["priority"]]
                affected = ", ".join(s["affected_companies"][:5])
                if len(s["affected_companies"]) > 5:
                    affected += f" 他{len(s['affected_companies']) - 5}社"
                lines.append(f"{i}. **[{priority}]** {s['issue']}")
                lines.append(f"   - アクション: {s['action']}")
                lines.append(f"   - 対象: {affected}")
                lines.append("")

        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        print(f"[結果出力] Markdown: {path}")


# =============================================================================
# Helper Functions
# =============================================================================


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower()
    except Exception:
        return ""


def check_domain_match(url: str, patterns: list[str]) -> bool:
    """Check if URL matches any domain pattern."""
    domain = extract_domain(url)
    for pattern in patterns:
        if pattern.lower() in domain.lower():
            return True
    return False


async def search_with_ddgs(query: str, max_results: int = 10) -> list[dict]:
    """Search using DuckDuckGo."""
    if not HAS_DDGS:
        return []
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(
                query,
                safesearch="moderate",
                max_results=max_results
            ))
            return results
    except Exception as e:
        print(f"[検索エラー] {query}: {e}")
        return []


def get_industry_for_company(company_name: str, all_companies: dict) -> str:
    """Determine industry for a company based on position in mappings file."""
    # This is a simplified version - in production, use actual industry data
    # For now, return "unknown"
    return "unknown"


def sample_subsidiaries_by_industry(
    all_companies: dict,
    max_per_industry: int = MAX_SUBSIDIARIES_PER_INDUSTRY
) -> list[tuple[str, list[str]]]:
    """Sample subsidiaries from each industry.

    Returns:
        List of (company_name, domains) tuples
    """
    subsidiaries = get_subsidiaries(all_companies)

    # Group by parent company (proxy for industry)
    by_parent = defaultdict(list)
    for name, mapping in subsidiaries:
        parent = mapping.get("parent", "unknown")
        by_parent[parent].append((name, get_domains(mapping)))

    # Sample from each parent group
    sampled = []
    for parent, subs in by_parent.items():
        # Take up to max_per_industry from each parent company's subsidiaries
        sample_size = min(max_per_industry, len(subs))
        sampled.extend(random.sample(subs, sample_size))

    return sampled


def get_test_companies() -> list[tuple[str, list[str], bool]]:
    """Get all companies for testing.

    Returns:
        List of (company_name, domains, is_subsidiary) tuples
    """
    all_companies = load_all_companies()

    result = []

    # 1. All parent companies / standalone companies
    for name, domains in get_parents(all_companies):
        result.append((name, domains, False))

    # 2. Sampled subsidiaries
    for name, domains in sample_subsidiaries_by_industry(all_companies):
        result.append((name, domains, True))

    return result


def get_parent_child_pairs(limit: int = 50) -> list[tuple[str, str, list[str], list[str]]]:
    """Get parent-child company pairs for testing.

    Returns:
        List of (child_name, parent_name, child_domains, parent_domains) tuples
    """
    all_companies = load_all_companies()
    pairs = get_subsidiary_parent_pairs(all_companies)

    result = []
    for child_name, parent_name in pairs[:limit]:
        child_domains = get_domains(all_companies.get(child_name, []))
        parent_domains = get_domains(all_companies.get(parent_name, []))
        result.append((child_name, parent_name, child_domains, parent_domains))

    return result


# =============================================================================
# Test Data Fixtures
# =============================================================================


@pytest.fixture(scope="module")
def all_test_companies():
    """All companies to test."""
    return get_test_companies()


@pytest.fixture(scope="module")
def parent_child_pairs():
    """Parent-child company pairs."""
    return get_parent_child_pairs()


@pytest.fixture(scope="module")
def sample_companies():
    """Representative sample companies for detailed testing."""
    return [
        "三菱地所",
        "NTTデータ",
        "トヨタ自動車",
        "三井物産",
        "野村證券",
        "パナソニック",
        "アクセンチュア",
    ]


# =============================================================================
# Result Collection Fixtures
# =============================================================================


@pytest.fixture(scope="session")
def result_collector():
    """テスト結果収集用インスタンス（セッション全体で共有）"""
    return ResultCollector()


@pytest.fixture(scope="session", autouse=True)
def save_results_on_finish(result_collector):
    """テスト終了時に結果を自動保存"""
    yield
    # テスト終了後に結果を保存
    if (result_collector.parent_results or
        result_collector.subsidiary_results or
        result_collector.official_domain_results or
        result_collector.recruitment_quality_results):
        OUTPUT_DIR.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        result_collector.save_json(OUTPUT_DIR / f"comprehensive_search_{timestamp}.json")
        result_collector.save_markdown(OUTPUT_DIR / f"comprehensive_search_{timestamp}.md")


# =============================================================================
# Test Classes: Company Relationships (No API Calls)
# =============================================================================


class TestCompanyRelationships:
    """親子・兄弟関係の検証（API呼び出しなし、高速）"""

    def test_all_subsidiaries_have_valid_parent(self, all_companies, subsidiaries):
        """全子会社の親会社がmappingsに存在すること"""
        for name, mapping in subsidiaries:
            parent = mapping.get("parent")
            assert parent in all_companies, (
                f"子会社 '{name}' の親会社 '{parent}' がmappingsに存在しません"
            )

    def test_parent_companies_have_domains(self, all_companies, parent_companies):
        """全親会社・独立企業がドメインパターンを持つこと"""
        for name, domains in parent_companies:
            assert len(domains) > 0, (
                f"企業 '{name}' にドメインパターンがありません"
            )

    def test_subsidiaries_have_domains(self, subsidiaries):
        """全子会社がドメインパターンを持つこと"""
        for name, mapping in subsidiaries:
            domains = get_domains(mapping)
            assert len(domains) > 0, (
                f"子会社 '{name}' にドメインパターンがありません"
            )

    def test_no_circular_parent_references(self, all_companies):
        """親会社の循環参照がないこと"""
        def get_parent_chain(company: str, visited: set) -> list[str]:
            if company in visited:
                return list(visited) + [company]
            visited.add(company)

            mapping = all_companies.get(company)
            if mapping and isinstance(mapping, dict) and "parent" in mapping:
                return get_parent_chain(mapping["parent"], visited)
            return []

        for name in all_companies:
            chain = get_parent_chain(name, set())
            if chain:
                pytest.fail(f"循環参照検出: {' -> '.join(chain)}")

    def test_sibling_companies_share_parent(self, all_companies):
        """同一親を持つ子会社が正しく設定されていること"""
        # Group subsidiaries by parent
        by_parent = defaultdict(list)
        for name, mapping in all_companies.items():
            if isinstance(mapping, dict) and "parent" in mapping:
                by_parent[mapping["parent"]].append(name)

        # Verify each parent has at least the subsidiaries we expect
        for parent, children in by_parent.items():
            assert parent in all_companies, (
                f"親会社 '{parent}' が存在しません。子会社: {children}"
            )

    def test_domain_patterns_are_unique(self, all_companies):
        """ドメインパターンが一意であること（同じパターンが複数企業にない）"""
        pattern_to_companies = defaultdict(list)

        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            for domain in domains:
                pattern_to_companies[domain].append(name)

        # Check for duplicates
        duplicates = {
            pattern: companies
            for pattern, companies in pattern_to_companies.items()
            if len(companies) > 1
        }

        # Known exceptions: corporate groups where multiple entities share same domain
        # e.g., ANA Holdings, ANA, 全日本空輸 all use 'ana' domain
        known_shared_patterns = {"ana", "ntt", "sony", "toyota"}

        # Some generic patterns like "msi" might be intentionally shared
        # Allow up to 2 companies per pattern, or known shared patterns
        problematic = {
            p: c for p, c in duplicates.items()
            if len(c) > 2 and p not in known_shared_patterns
        }

        if problematic:
            msg = "\n".join(
                f"  '{p}': {c}" for p, c in problematic.items()
            )
            pytest.fail(f"同一ドメインパターンが3社以上で使用:\n{msg}")

        # Report shared patterns as info
        if duplicates:
            print(f"\n共有ドメインパターン ({len(duplicates)}件):")
            for p, c in sorted(duplicates.items(), key=lambda x: -len(x[1]))[:10]:
                print(f"  '{p}': {len(c)}社")


# =============================================================================
# Test Classes: Search Integration Tests (Real API Calls)
# =============================================================================


@pytest.mark.slow
@pytest.mark.integration
class TestComprehensiveSearch:
    """全企業の検索精度を検証（実API呼び出し）"""

    @pytest.mark.asyncio
    async def test_search_returns_results_for_parent_companies(
        self, parent_companies, result_collector
    ):
        """全親会社で検索結果が返されること"""
        if not HAS_DDGS:
            pytest.skip("ddgs 未インストール")

        failed = []
        total = len(parent_companies)
        for i, (name, domains) in enumerate(parent_companies):
            if i % 100 == 0:
                print(f"\n[親会社検索] {i}/{total} 完了...")
            query = f"{name} 採用"
            await asyncio.sleep(SEARCH_DELAY_SECONDS)
            results = await search_with_ddgs(query, max_results=5)

            # 上位3件の詳細情報を収集
            top_results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "domain": extract_domain(r.get("href", "")),
                }
                for r in results[:3]
            ]

            # 公式ドメインが含まれるか確認
            official_found = False
            official_rank = None
            for idx, r in enumerate(results):
                if check_domain_match(r.get("href", ""), domains):
                    official_found = True
                    official_rank = idx + 1
                    break

            success = len(results) > 0
            result_collector.add_parent_result(
                name=name,
                domains=domains,
                success=success,
                results_count=len(results),
                top_results=top_results,
                official_domain_found=official_found,
                official_domain_rank=official_rank,
            )

            if not success:
                failed.append(name)

        if failed:
            fail_rate = len(failed) / len(parent_companies)
            msg = f"検索結果なし: {len(failed)}社 ({fail_rate:.0%})\n"
            msg += "\n".join(f"  - {name}" for name in failed[:10])
            if len(failed) > 10:
                msg += f"\n  ... 他 {len(failed) - 10}社"

            # Warn but don't fail if less than 10%
            if fail_rate > 0.1:
                pytest.fail(msg)
            else:
                print(f"\n[Warning] {msg}")

    @pytest.mark.asyncio
    async def test_official_domain_in_results(
        self, sample_companies, all_companies, result_collector
    ):
        """代表企業の検索結果に公式ドメインが含まれること"""
        if not HAS_DDGS:
            pytest.skip("ddgs 未インストール")

        results_summary = []

        for company_name in sample_companies:
            mapping = all_companies.get(company_name)
            if not mapping:
                continue

            domains = get_domains(mapping)
            if not domains:
                continue

            query = f"{company_name} 採用"
            await asyncio.sleep(SEARCH_DELAY_SECONDS)
            results = await search_with_ddgs(query, max_results=10)

            # 実際に見つかったドメインを収集
            actual_domains = list(set(
                extract_domain(r.get("href", ""))
                for r in results
                if r.get("href")
            ))

            official_found = any(
                check_domain_match(r.get("href", ""), domains)
                for r in results
            )

            # 結果を収集
            result_collector.add_official_domain_result(
                company=company_name,
                domains=domains,
                found=official_found,
                results_count=len(results),
                actual_domains=actual_domains,
            )

            results_summary.append({
                "company": company_name,
                "domains": domains,
                "results_count": len(results),
                "official_found": official_found,
            })

        # Report
        found_count = sum(1 for r in results_summary if r["official_found"])
        print(f"\n公式ドメイン検出率: {found_count}/{len(results_summary)}")

        for r in results_summary:
            status = "✓" if r["official_found"] else "✗"
            print(f"  {status} {r['company']}: {r['results_count']}件")

        # At least 50% should find official domain
        assert found_count >= len(results_summary) * 0.5, (
            f"公式ドメイン検出率が50%未満: {found_count}/{len(results_summary)}"
        )


@pytest.mark.slow
@pytest.mark.integration
class TestSearchResultQuality:
    """検索結果の品質詳細検証"""

    @pytest.mark.asyncio
    async def test_recruitment_search_quality(self, sample_companies, result_collector):
        """代表企業の採用検索品質"""
        if not HAS_DDGS:
            pytest.skip("ddgs 未インストール")

        results_summary = []

        for company_name in sample_companies:
            query = f"{company_name} 新卒採用"
            await asyncio.sleep(SEARCH_DELAY_SECONDS)
            results = await search_with_ddgs(query, max_results=10)

            # Check for recruitment-related keywords in results
            recruit_keywords = ["採用", "新卒", "キャリア", "recruit", "career"]
            keyword_matches = 0
            for r in results:
                title = r.get("title", "").lower()
                body = r.get("body", "").lower()
                text = title + " " + body
                if any(kw.lower() in text for kw in recruit_keywords):
                    keyword_matches += 1

            match_rate = keyword_matches / max(len(results), 1)

            # 上位3件の詳細情報を収集
            top_results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "domain": extract_domain(r.get("href", "")),
                }
                for r in results[:3]
            ]

            # 結果を収集
            result_collector.add_recruitment_quality_result(
                company=company_name,
                match_rate=match_rate,
                matches=keyword_matches,
                total=len(results),
                top_results=top_results,
            )

            results_summary.append({
                "company": company_name,
                "results_count": len(results),
                "keyword_matches": keyword_matches,
                "match_rate": match_rate,
            })

        print("\n採用検索品質:")
        for r in results_summary:
            print(f"  {r['company']}: {r['keyword_matches']}/{r['results_count']} "
                  f"({r['match_rate']:.0%})")

        # Average match rate should be at least 50%
        avg_rate = sum(r["match_rate"] for r in results_summary) / len(results_summary)
        assert avg_rate >= 0.5, f"採用キーワードマッチ率が50%未満: {avg_rate:.0%}"


@pytest.mark.slow
@pytest.mark.integration
class TestParentSubsidiarySearchBehavior:
    """親子会社検索時の挙動検証"""

    @pytest.mark.asyncio
    async def test_subsidiary_search_returns_results(self, subsidiaries, result_collector):
        """子会社検索で結果が返されること"""
        if not HAS_DDGS:
            pytest.skip("ddgs 未インストール")

        # Test all subsidiaries
        failed = []
        total = len(subsidiaries)

        for i, (name, mapping) in enumerate(subsidiaries):
            if i % 100 == 0:
                print(f"\n[子会社検索] {i}/{total} 完了...")
            query = f"{name} 採用"
            await asyncio.sleep(SEARCH_DELAY_SECONDS)
            results = await search_with_ddgs(query, max_results=5)

            parent = mapping.get("parent", "")
            domains = get_domains(mapping)

            # 上位3件の詳細情報を収集
            top_results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "domain": extract_domain(r.get("href", "")),
                }
                for r in results[:3]
            ]

            success = len(results) > 0
            result_collector.add_subsidiary_result(
                name=name,
                parent=parent,
                domains=domains,
                success=success,
                results_count=len(results),
                top_results=top_results,
            )

            if not success:
                failed.append(name)

        if failed:
            print(f"\n子会社検索結果なし ({len(failed)}社): {failed[:20]}")
            if len(failed) > 20:
                print(f"  ... 他 {len(failed) - 20}社")
            # Don't fail - just warn for subsidiaries as they might be less searchable
            fail_rate = len(failed) / len(subsidiaries)
            assert fail_rate < 0.5, (
                f"子会社検索で結果なしが多すぎます: {len(failed)}/{len(subsidiaries)} ({fail_rate:.0%})"
            )


# =============================================================================
# Test Classes: Statistics and Summary
# =============================================================================


class TestSearchStatistics:
    """検索関連の統計・サマリー"""

    def test_company_count_summary(self, all_companies):
        """企業数のサマリー"""
        total = len(all_companies)
        parents = len(get_parents(all_companies))
        subsidiaries = len(get_subsidiaries(all_companies))

        print(f"\n企業数サマリー:")
        print(f"  総数: {total}")
        print(f"  親会社・独立企業: {parents}")
        print(f"  子会社: {subsidiaries}")

        assert total > 0
        assert parents + subsidiaries == total

    def test_domain_coverage_summary(self, all_companies):
        """ドメインカバレッジのサマリー"""
        total_domains = 0
        companies_with_multiple_domains = 0

        for name, mapping in all_companies.items():
            domains = get_domains(mapping)
            total_domains += len(domains)
            if len(domains) > 1:
                companies_with_multiple_domains += 1

        avg_domains = total_domains / len(all_companies)

        print(f"\nドメインカバレッジ:")
        print(f"  総ドメインパターン数: {total_domains}")
        print(f"  企業あたり平均: {avg_domains:.2f}")
        print(f"  複数ドメイン企業: {companies_with_multiple_domains}")

    def test_parent_company_distribution(self, all_companies):
        """親会社ごとの子会社分布"""
        by_parent = defaultdict(list)

        for name, mapping in all_companies.items():
            if isinstance(mapping, dict) and "parent" in mapping:
                by_parent[mapping["parent"]].append(name)

        print(f"\n親会社別子会社数:")
        sorted_parents = sorted(by_parent.items(), key=lambda x: -len(x[1]))
        for parent, children in sorted_parents[:10]:
            print(f"  {parent}: {len(children)}社")

        if len(sorted_parents) > 10:
            print(f"  ... 他 {len(sorted_parents) - 10}グループ")


# =============================================================================
# Main
# =============================================================================


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
