"""
不足子会社マッピングの検出テスト

Perplexity APIで主要企業グループの子会社一覧を取得し、
company_mappings.json に未登録の子会社を検出・提案する。

Usage:
    # 全親会社の不足子会社を検出
    pytest backend/tests/test_missing_subsidiaries.py -v -s

    # 特定の親会社のみ
    pytest backend/tests/test_missing_subsidiaries.py -v -s -k "NTTデータ"

    # APIキーなしで登録済み子会社を確認
    pytest backend/tests/test_missing_subsidiaries.py -v -s -k "test_show_registered"

Required:
    PERPLEXITY_API_KEY 環境変数が必要（APIを使用するテストのみ）
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

import httpx
import pytest

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.company_names import get_company_domain_patterns

# =============================================================================
# 設定
# =============================================================================

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "company_mappings.json"

# 主要親会社リスト（カテゴリ別）
MAJOR_PARENT_COMPANIES = {
    "IT・通信": [
        "NTTデータ",
        "NTT",
        "富士通",
        "NEC",
        "日立製作所",
        "野村総合研究所",
        "SCSK",
        "TIS",
    ],
    "商社": [
        "三井物産",
        "三菱商事",
        "伊藤忠商事",
        "丸紅",
        "住友商事",
    ],
    "金融": [
        "三菱UFJフィナンシャル・グループ",
        "みずほフィナンシャルグループ",
        "三井住友フィナンシャルグループ",
    ],
    "メーカー": [
        "トヨタ自動車",
        "ソニー",
        "パナソニック",
    ],
}

# 親会社の主要ドメインパターン（ドメイン推定に使用）
PARENT_PRIMARY_DOMAINS = {
    "NTTデータ": "nttdata",
    "NTT": "ntt",
    "富士通": "fujitsu",
    "NEC": "nec",
    "日立製作所": "hitachi",
    "野村総合研究所": "nri",
    "SCSK": "scsk",
    "TIS": "tis",
    "三井物産": "mitsui",
    "三菱商事": "mitsubishi",
    "伊藤忠商事": "itochu",
    "丸紅": "marubeni",
    "住友商事": "sumitomo",
    "三菱UFJフィナンシャル・グループ": "mufg",
    "みずほフィナンシャルグループ": "mizuho",
    "三井住友フィナンシャルグループ": "smfg",
    "トヨタ自動車": "toyota",
    "ソニー": "sony",
    "パナソニック": "panasonic",
}

# 全親会社リスト（テスト用）
ALL_PARENT_COMPANIES = [
    company for companies in MAJOR_PARENT_COMPANIES.values() for company in companies
]


# =============================================================================
# ユーティリティ関数
# =============================================================================


def load_all_companies() -> dict:
    """company_mappings.json から全企業を読み込む"""
    with open(MAPPINGS_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return {k: v for k, v in data.get("mappings", {}).items() if not k.startswith("_")}


def get_registered_subsidiaries(parent_name: str, all_companies: dict) -> set[str]:
    """指定親会社の登録済み子会社を取得"""
    return {
        name
        for name, mapping in all_companies.items()
        if isinstance(mapping, dict) and mapping.get("parent") == parent_name
    }


def estimate_domain_pattern(company_name: str, parent_name: str) -> list[str]:
    """企業名からドメインパターンを推定"""
    patterns = []

    # 親会社のプライマリドメインを取得
    parent_domain = PARENT_PRIMARY_DOMAINS.get(parent_name, "")

    # サフィックス抽出（親会社名を除去）
    suffix = company_name.replace(parent_name, "").strip()
    suffix = re.sub(r"[・\s株式会社]", "", suffix)  # 中黒・スペース・株式会社を除去

    if suffix and parent_domain:
        # アルファベット変換を試みる
        suffix_lower = suffix.lower()

        # 日本語サフィックスの場合はローマ字化を試みる
        if re.search(r"[ぁ-んァ-ヶ一-龥]", suffix):
            # 既存のドメインパターンから推測
            existing = get_company_domain_patterns(company_name)
            if existing:
                return existing[:2]  # 最大2つ

        # "NTTデータSBC" → "nttdata-sbc"
        patterns.append(f"{parent_domain}-{suffix_lower}")

    return patterns


def generate_mapping_entry(company_name: str, parent_name: str) -> str:
    """マッピングエントリのJSON形式を生成"""
    domains = estimate_domain_pattern(company_name, parent_name)
    return f'    "{company_name}": {{"domains": {json.dumps(domains)}, "parent": "{parent_name}"}},'


async def search_subsidiaries_perplexity(parent_name: str) -> list[str]:
    """Perplexity APIで子会社リストを取得"""
    if not PERPLEXITY_API_KEY:
        return []

    prompt = f"""{parent_name}の主要な子会社・グループ会社を列挙してください。

以下の形式で回答してください:
- 会社名1
- 会社名2
...

注意:
- 正式な会社名を使用（株式会社は省略可）
- 日本国内の子会社・関連会社を優先
- 新卒採用を行っている企業を優先
- 持株会社・投資会社よりも事業会社を優先
"""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.1-sonar-small-128k-online",
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()

        # レスポンスから会社名を抽出
        content = data["choices"][0]["message"]["content"]

        # "- 会社名" または "・会社名" 形式をパース
        companies = re.findall(r"^[-・•]\s*(.+?)$", content, re.MULTILINE)

        # クリーンアップ
        result = []
        for c in companies:
            name = c.strip()
            # 括弧内の説明を除去
            name = re.sub(r"\s*[（(].+[）)]$", "", name)
            # 番号を除去
            name = re.sub(r"^\d+\.\s*", "", name)
            if name and len(name) > 1:
                result.append(name)

        return result

    except Exception as e:
        print(f"Perplexity API error for {parent_name}: {e}")
        return []


# =============================================================================
# テストクラス
# =============================================================================


class TestMissingSubsidiaries:
    """不足子会社の検出テスト"""

    @pytest.fixture(scope="class")
    def all_companies(self):
        """登録済み全企業"""
        return load_all_companies()

    def test_show_registered_subsidiaries(self, all_companies):
        """登録済み子会社の一覧を表示（APIキー不要）"""
        print("\n" + "=" * 70)
        print("登録済み子会社一覧")
        print("=" * 70)

        for category, parents in MAJOR_PARENT_COMPANIES.items():
            print(f"\n### {category} ###")
            for parent in parents:
                subsidiaries = get_registered_subsidiaries(parent, all_companies)
                print(f"\n{parent} ({len(subsidiaries)}社):")
                for sub in sorted(subsidiaries):
                    print(f"  - {sub}")

    @pytest.mark.parametrize("parent_name", ALL_PARENT_COMPANIES)
    def test_find_missing_subsidiaries(self, parent_name, all_companies):
        """親会社ごとに不足子会社を検出（Perplexity API使用）"""
        if not PERPLEXITY_API_KEY:
            pytest.skip("PERPLEXITY_API_KEY not set")

        # 登録済み子会社
        registered = get_registered_subsidiaries(parent_name, all_companies)

        # Perplexity APIで子会社リストを取得
        found = asyncio.run(search_subsidiaries_perplexity(parent_name))

        if not found:
            pytest.skip(f"No subsidiaries found for {parent_name}")

        # 不足を検出（完全一致でない場合も検出）
        missing = []
        for company in found:
            # 正規化して比較
            normalized = company.replace("株式会社", "").strip()
            if normalized not in registered and company not in registered:
                # 部分一致もチェック
                if not any(normalized in r or r in normalized for r in registered):
                    missing.append(company)

        if missing:
            print(f"\n{'=' * 70}")
            print(f"=== {parent_name} の不足子会社 ({len(missing)}社) ===")
            print("=" * 70)
            print("\n// 以下を company_mappings.json に追加:")
            for name in sorted(missing):
                print(generate_mapping_entry(name, parent_name))

            # テスト自体は成功（検出結果を報告するため）
            pytest.skip(f"Found {len(missing)} missing subsidiaries for {parent_name}")
        else:
            print(f"\n{parent_name}: すべての子会社が登録済み ✓")


class TestSpecificParent:
    """特定の親会社をテスト（デバッグ用）"""

    @pytest.fixture(scope="class")
    def all_companies(self):
        return load_all_companies()

    def test_nttdata_subsidiaries(self, all_companies):
        """NTTデータの子会社を確認"""
        parent = "NTTデータ"
        registered = get_registered_subsidiaries(parent, all_companies)

        print(f"\n{parent} の登録済み子会社 ({len(registered)}社):")
        for sub in sorted(registered):
            mapping = all_companies.get(sub, {})
            domains = mapping.get("domains", []) if isinstance(mapping, dict) else []
            print(f"  - {sub}: {domains}")

        # 期待される子会社（ユーザーから指摘されたもの）
        expected_missing = ["NTTデータSBC", "NTTデータフォース"]
        actual_missing = [e for e in expected_missing if e not in registered]

        if actual_missing:
            print(f"\n未登録の子会社:")
            for name in actual_missing:
                print(generate_mapping_entry(name, parent))


class TestDomainEstimation:
    """ドメインパターン推定のテスト"""

    @pytest.mark.parametrize(
        "company_name,parent_name,expected_pattern",
        [
            ("NTTデータSBC", "NTTデータ", "nttdata-sbc"),
            ("NTTデータフォース", "NTTデータ", "nttdata-force"),
            ("富士通Japan", "富士通", "fujitsu-japan"),
            ("三井物産スチール", "三井物産", "mitsui-steel"),
        ],
    )
    def test_estimate_domain_pattern(
        self, company_name: str, parent_name: str, expected_pattern: str
    ):
        """ドメインパターン推定が正しく動作"""
        patterns = estimate_domain_pattern(company_name, parent_name)
        assert expected_pattern in patterns or any(
            expected_pattern.lower() in p.lower() for p in patterns
        ), f"Expected '{expected_pattern}' in {patterns}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
