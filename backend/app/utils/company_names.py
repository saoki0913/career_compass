"""
企業名バリアント生成ユーティリティ

企業名からドメインパターンを生成し、公式サイト検出に使用する。
マッピングデータは backend/data/company_mappings.json で管理。
"""

import json
import re
from functools import lru_cache
from pathlib import Path

# マッピングファイルのパス
MAPPINGS_FILE = Path(__file__).parent.parent.parent / "data" / "company_mappings.json"


@lru_cache(maxsize=1)
def _load_company_mappings() -> dict[str, list[str]]:
    """
    JSONファイルから企業マッピングをロード（キャッシュ付き）。

    Returns:
        企業名→ドメインパターンリストの辞書
    """
    if MAPPINGS_FILE.exists():
        try:
            with open(MAPPINGS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                return data.get("mappings", {})
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def get_company_domain_patterns(company_name: str, ascii_name: str | None = None) -> list[str]:
    """
    企業名から可能なドメインパターンを生成。

    1. 登録済みマッピングから取得
    2. 企業名の部分一致でマッピング検索
    3. ASCII名からバリアント生成
    4. 企業名の読みからパターン生成

    Args:
        company_name: 企業名（日本語）
        ascii_name: ローマ字企業名（オプション、既に正規化済みの場合）

    Returns:
        ドメインパターンのリスト（優先度順）
    """
    patterns: list[str] = []
    mappings = _load_company_mappings()

    # 1. 完全一致でマッピング検索
    if company_name in mappings:
        patterns.extend(mappings[company_name])

    # 2. 部分一致でマッピング検索（株式会社などを除去した名前で）
    normalized = _normalize_for_lookup(company_name)
    if normalized != company_name and normalized in mappings:
        patterns.extend(mappings[normalized])

    # 3. 含む検索（企業グループ名の一部など）
    for key, domain_patterns in mappings.items():
        # 登録名が検索名に含まれる、または検索名が登録名に含まれる
        if key != company_name and (key in company_name or company_name in key):
            for p in domain_patterns:
                if p not in patterns:
                    patterns.append(p)

    # 4. ASCII名からバリアント生成
    if ascii_name:
        # フルネーム
        if ascii_name not in patterns:
            patterns.append(ascii_name)

        # 短縮名（6文字以上の場合、前半を使用）
        if len(ascii_name) >= 6:
            short_name = ascii_name[:len(ascii_name) // 2]
            if len(short_name) >= 3 and short_name not in patterns:
                patterns.append(short_name)

    # 5. 企業名から抽出可能なパターン（カタカナ企業名など）
    extracted = _extract_domain_hints(company_name)
    for hint in extracted:
        if hint not in patterns:
            patterns.append(hint)

    return patterns


def _normalize_for_lookup(company_name: str) -> str:
    """
    企業名をマッピング検索用に正規化。

    株式会社、（株）などの法人格を除去。
    """
    # 法人格を除去
    suffixes = [
        "株式会社", "（株）", "(株)", "㈱",
        "有限会社", "（有）", "(有)",
        "合同会社", "合名会社", "合資会社",
        "一般社団法人", "一般財団法人",
        "ホールディングス", "HD", "グループ",
    ]

    result = company_name
    for suffix in suffixes:
        result = result.replace(suffix, "")

    return result.strip()


def _extract_domain_hints(company_name: str) -> list[str]:
    """
    企業名からドメインヒントを抽出。

    カタカナ企業名、英字企業名などからパターンを生成。
    """
    hints = []

    # 英字部分を抽出（全角・半角両方）
    ascii_pattern = re.compile(r'[A-Za-zＡ-Ｚａ-ｚ]+')
    matches = ascii_pattern.findall(company_name)
    for match in matches:
        # 全角を半角に変換
        normalized = match.translate(str.maketrans(
            'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        )).lower()
        if len(normalized) >= 3:
            hints.append(normalized)

    return hints


def reload_mappings() -> None:
    """
    マッピングキャッシュをクリアして再読み込みを強制。

    開発時やマッピング更新時に使用。
    """
    _load_company_mappings.cache_clear()


# 既知のブログプラットフォーム
BLOG_PLATFORMS = [
    "hatenablog.com",
    "hatenablog.jp",
    "hateblo.jp",
    "hatenadiary.org",
    "hatenadiary.jp",
    "ameblo.jp",
    "ameba.jp",
    "fc2.com",
    "livedoor.jp",
    "livedoor.blog",
    "seesaa.net",
    "cocolog-nifty.com",
    "muragon.com",
    "yaplog.jp",
    "jugem.jp",
    "exblog.jp",
    "goo.ne.jp/blog",
    "wordpress.com",
    "blogger.com",
    "blogspot.com",
    "blogspot.jp",
    "medium.com",
    "note.com",
    "note.mu",
    "zenn.dev",
    "qiita.com",
    "wix.com",
    "jimdo.com",
    "weebly.com",
    "tumblr.com",
]

# 個人サイトを示唆するドメインパターン
PERSONAL_SITE_PATTERNS = [
    # 一般的なパターン
    "kun",
    "chan",
    "san",
    "sensei",
    "dochi",
    "-no-",
    "blog",
    "diary",
    "memo",
    "note",
    # URLパスパターン
    "/blog/",
    "/diary/",
    "/column/",
    "/personal/",
    "/member/",
    "/user/",
    "~",
]


def is_blog_platform(domain: str) -> bool:
    """
    ドメインがブログプラットフォームかどうかを判定。

    Args:
        domain: ドメイン名

    Returns:
        ブログプラットフォームならTrue
    """
    domain_lower = domain.lower()
    return any(platform in domain_lower for platform in BLOG_PLATFORMS)


def has_personal_site_pattern(url: str, domain: str) -> bool:
    """
    URLまたはドメインに個人サイトパターンが含まれるか判定。

    Args:
        url: 完全なURL
        domain: ドメイン名

    Returns:
        個人サイトパターンが見つかればTrue
    """
    url_lower = url.lower()
    domain_lower = domain.lower()

    for pattern in PERSONAL_SITE_PATTERNS:
        if pattern in domain_lower or pattern in url_lower:
            return True

    return False
