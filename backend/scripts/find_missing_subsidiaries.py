#!/usr/bin/env python3
"""
不足子会社マッピングを検出するスクリプト

Perplexity APIで主要企業グループの子会社一覧を取得し、
company_mappings.json に未登録の子会社を検出・提案する。

Usage:
    # 特定の親会社の不足子会社を検出
    python backend/scripts/find_missing_subsidiaries.py "NTTデータ"

    # 全主要グループを検索
    python backend/scripts/find_missing_subsidiaries.py --all

    # 結果をJSONファイルに出力
    python backend/scripts/find_missing_subsidiaries.py --all --output suggestions.json

    # 登録済み子会社を表示
    python backend/scripts/find_missing_subsidiaries.py --show "NTTデータ"

Required:
    PERPLEXITY_API_KEY 環境変数
"""

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import httpx
except ImportError:
    print("Error: httpx is required. Install with: pip install httpx")
    sys.exit(1)

# =============================================================================
# 設定
# =============================================================================

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "company_mappings.json"

# 主要親会社リスト
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

# 親会社のプライマリドメインパターン
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
    parent_domain = PARENT_PRIMARY_DOMAINS.get(parent_name, "")

    # サフィックス抽出
    suffix = company_name.replace(parent_name, "").strip()
    suffix = re.sub(r"[・\s株式会社]", "", suffix)

    if suffix and parent_domain:
        suffix_lower = suffix.lower()
        # 日本語が含まれない場合のみパターン生成
        if not re.search(r"[ぁ-んァ-ヶ一-龥]", suffix):
            patterns.append(f"{parent_domain}-{suffix_lower}")

    return patterns


def generate_mapping_entry(company_name: str, parent_name: str) -> dict:
    """マッピングエントリを生成（dict形式）"""
    domains = estimate_domain_pattern(company_name, parent_name)
    return {
        "name": company_name,
        "domains": domains,
        "parent": parent_name,
    }


def format_mapping_json(company_name: str, parent_name: str) -> str:
    """マッピングエントリをJSON形式の文字列で生成"""
    domains = estimate_domain_pattern(company_name, parent_name)
    return f'    "{company_name}": {{"domains": {json.dumps(domains)}, "parent": "{parent_name}"}},'


async def search_subsidiaries_perplexity(parent_name: str) -> list[str]:
    """Perplexity APIで子会社リストを取得"""
    if not PERPLEXITY_API_KEY:
        print("Error: PERPLEXITY_API_KEY not set", file=sys.stderr)
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

        content = data["choices"][0]["message"]["content"]
        companies = re.findall(r"^[-・•]\s*(.+?)$", content, re.MULTILINE)

        result = []
        for c in companies:
            name = c.strip()
            name = re.sub(r"\s*[（(].+[）)]$", "", name)
            name = re.sub(r"^\d+\.\s*", "", name)
            if name and len(name) > 1:
                result.append(name)

        return result

    except Exception as e:
        print(f"Error: Perplexity API error for {parent_name}: {e}", file=sys.stderr)
        return []


async def find_missing_for_parent(
    parent_name: str, all_companies: dict
) -> tuple[str, list[str], list[dict]]:
    """親会社の不足子会社を検出"""
    registered = get_registered_subsidiaries(parent_name, all_companies)
    found = await search_subsidiaries_perplexity(parent_name)

    if not found:
        return parent_name, [], []

    missing = []
    for company in found:
        normalized = company.replace("株式会社", "").strip()
        if normalized not in registered and company not in registered:
            if not any(normalized in r or r in normalized for r in registered):
                missing.append(company)

    suggestions = [generate_mapping_entry(name, parent_name) for name in missing]
    return parent_name, missing, suggestions


# =============================================================================
# メイン処理
# =============================================================================


def show_registered(parent_name: str, all_companies: dict):
    """登録済み子会社を表示"""
    registered = get_registered_subsidiaries(parent_name, all_companies)
    print(f"\n{parent_name} の登録済み子会社 ({len(registered)}社):")
    for sub in sorted(registered):
        mapping = all_companies.get(sub, {})
        domains = mapping.get("domains", []) if isinstance(mapping, dict) else []
        print(f"  - {sub}: {domains}")


async def find_missing_single(parent_name: str, all_companies: dict):
    """単一の親会社の不足子会社を検出"""
    print(f"\n{parent_name} の子会社を検索中...")
    parent, missing, suggestions = await find_missing_for_parent(
        parent_name, all_companies
    )

    if not missing:
        print(f"\n{parent_name}: すべての子会社が登録済み ✓")
        return []

    print(f"\n{'=' * 70}")
    print(f"=== {parent_name} の不足子会社 ({len(missing)}社) ===")
    print("=" * 70)
    print("\n// 以下を company_mappings.json に追加:")
    for name in sorted(missing):
        print(format_mapping_json(name, parent_name))

    return suggestions


async def find_missing_all(all_companies: dict) -> list[dict]:
    """全主要グループの不足子会社を検出"""
    all_suggestions = []

    for category, parents in MAJOR_PARENT_COMPANIES.items():
        print(f"\n### {category} ###")
        for parent in parents:
            print(f"\n{parent} を検索中...")
            _, missing, suggestions = await find_missing_for_parent(
                parent, all_companies
            )

            if missing:
                print(f"  → {len(missing)}社の不足を検出")
                all_suggestions.extend(suggestions)
            else:
                print(f"  → すべて登録済み ✓")

            # API制限回避のため少し待機
            await asyncio.sleep(1)

    return all_suggestions


def main():
    parser = argparse.ArgumentParser(
        description="不足子会社マッピングを検出",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  %(prog)s "NTTデータ"              # NTTデータの不足子会社を検出
  %(prog)s --all                    # 全主要グループを検索
  %(prog)s --all --output out.json  # 結果をJSONファイルに出力
  %(prog)s --show "NTTデータ"       # 登録済み子会社を表示
        """,
    )
    parser.add_argument("parent", nargs="?", help="検索する親会社名")
    parser.add_argument("--all", action="store_true", help="全主要グループを検索")
    parser.add_argument("--show", metavar="PARENT", help="登録済み子会社を表示")
    parser.add_argument(
        "--output", "-o", metavar="FILE", help="結果をJSONファイルに出力"
    )

    args = parser.parse_args()

    all_companies = load_all_companies()

    # 登録済み子会社の表示
    if args.show:
        show_registered(args.show, all_companies)
        return

    # 不足子会社の検出
    if args.all:
        suggestions = asyncio.run(find_missing_all(all_companies))
    elif args.parent:
        suggestions = asyncio.run(find_missing_single(args.parent, all_companies))
    else:
        parser.print_help()
        return

    # 結果出力
    if args.output and suggestions:
        output_data = {
            "suggestions": suggestions,
            "count": len(suggestions),
        }
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n結果を {args.output} に保存しました ({len(suggestions)}件)")

    # サマリー
    if suggestions:
        print(f"\n{'=' * 70}")
        print(f"合計: {len(suggestions)}社の不足子会社を検出")
        print("=" * 70)


if __name__ == "__main__":
    main()
