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

# Generic domain patterns that should not be treated as company identifiers
# (used to avoid false conflict detection, e.g., "recruit")
GENERIC_DOMAIN_PATTERNS = {
    "recruit",
    "recruitment",
    "career",
    "careers",
    "job",
    "jobs",
    "saiyo",
    "saiyou",
    "entry",
    "newgrad",
    "newgrads",
    "graduate",
    "fresh",
    "freshers",
    "intern",
    "internship",
    "mypage",
}


@lru_cache(maxsize=1)
def _load_mapping_data() -> dict:
    """
    JSONファイルから企業マッピングの生データをロード（キャッシュ付き）。
    """
    if MAPPINGS_FILE.exists():
        try:
            with open(MAPPINGS_FILE, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


@lru_cache(maxsize=1)
def _load_company_mappings() -> dict[str, dict | list[str]]:
    """
    JSONファイルから企業マッピングをロード（キャッシュ付き）。

    新形式（オブジェクト）と旧形式（配列）の両方をサポート。

    Returns:
        企業名→マッピングデータの辞書
        新形式: {"domains": [...], "parent": "親会社名"}
        旧形式: [...]（ドメインパターンの配列）
    """
    data = _load_mapping_data()
    return data.get("mappings", {}) if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def _get_short_domain_allowlist() -> dict[str, list[str]]:
    """
    3文字未満パターンの例外許可リストを取得。

    Returns:
        {企業名: [短いパターン...], ...}
    """
    data = _load_mapping_data()
    if not isinstance(data, dict):
        return {}
    allowlist = data.get("short_domain_allowlist", {})
    if not isinstance(allowlist, dict):
        return {}

    normalized: dict[str, list[str]] = {}
    for company_name, patterns in allowlist.items():
        if not isinstance(patterns, list):
            continue
        filtered = [p for p in patterns if isinstance(p, str) and p.strip()]
        if filtered:
            normalized[company_name] = filtered
    return normalized


@lru_cache(maxsize=1)
def get_short_domain_allowlist_patterns() -> set[str]:
    """
    3文字未満パターンの許可リスト（全企業分）を取得。
    """
    allowlist = _get_short_domain_allowlist()
    patterns = set()
    for pattern_list in allowlist.values():
        for pattern in pattern_list:
            patterns.add(pattern.lower())
    return patterns


@lru_cache(maxsize=1)
def _get_domain_pattern_index() -> dict[str, set[str]]:
    """
    ドメインパターン -> 企業名セットのインデックス。
    """
    mappings = _load_company_mappings()
    allowlisted_short = get_short_domain_allowlist_patterns()
    index: dict[str, set[str]] = {}

    for company_name, mapping in mappings.items():
        if company_name.startswith("_"):
            continue
        patterns = _get_domains_from_mapping(mapping)
        for pattern in patterns:
            if not isinstance(pattern, str):
                continue
            pattern_lower = pattern.lower()
            if pattern_lower in GENERIC_DOMAIN_PATTERNS:
                continue
            if len(pattern_lower) < 3 and pattern_lower not in allowlisted_short:
                continue
            index.setdefault(pattern_lower, set()).add(company_name)

    # 3文字未満の許可パターンをインデックスに追加
    short_allowlist = _get_short_domain_allowlist()
    for company_name, patterns in short_allowlist.items():
        for pattern in patterns:
            pattern_lower = pattern.lower()
            if pattern_lower in GENERIC_DOMAIN_PATTERNS:
                continue
            if pattern_lower:
                index.setdefault(pattern_lower, set()).add(company_name)
    return index


def _get_domains_from_mapping(mapping: dict | list[str] | None) -> list[str]:
    """
    マッピングデータからドメインパターンリストを取得。

    新形式と旧形式の両方をサポート。

    Args:
        mapping: マッピングデータ（dictまたはlist）

    Returns:
        ドメインパターンのリスト
    """
    if mapping is None:
        return []
    if isinstance(mapping, list):
        return mapping
    if isinstance(mapping, dict):
        return mapping.get("domains", [])
    return []


def get_parent_company(company_name: str) -> str | None:
    """
    子会社の親会社名を取得。

    Args:
        company_name: 企業名

    Returns:
        親会社名（存在しない場合はNone）
    """
    mappings = _load_company_mappings()

    # 完全一致
    if company_name in mappings:
        mapping = mappings[company_name]
        if isinstance(mapping, dict):
            return mapping.get("parent")

    # 正規化後の名前で検索
    normalized = _normalize_for_lookup(company_name)
    if normalized != company_name and normalized in mappings:
        mapping = mappings[normalized]
        if isinstance(mapping, dict):
            return mapping.get("parent")

    return None


def get_parent_domain_patterns(company_name: str) -> list[str]:
    """
    親会社のドメインパターンを取得。

    Args:
        company_name: 子会社名

    Returns:
        親会社のドメインパターンリスト（親会社がない場合は空リスト）
    """
    parent = get_parent_company(company_name)
    if not parent:
        return []

    mappings = _load_company_mappings()
    if parent in mappings:
        return _get_domains_from_mapping(mappings[parent])

    return []


def get_parent_allow_content_types(company_name: str) -> set[str]:
    """
    子会社が親会社ドメインを許可するコンテンツタイプを取得。

    Returns:
        許可される content_type のセット
    """
    mappings = _load_company_mappings()

    # 完全一致
    if company_name in mappings:
        mapping = mappings[company_name]
        if isinstance(mapping, dict):
            allowed = mapping.get("allow_parent_domains_for", [])
            if isinstance(allowed, list):
                return {str(x) for x in allowed if isinstance(x, str)}

    # 正規化後の名前で検索
    normalized = _normalize_for_lookup(company_name)
    if normalized != company_name and normalized in mappings:
        mapping = mappings[normalized]
        if isinstance(mapping, dict):
            allowed = mapping.get("allow_parent_domains_for", [])
            if isinstance(allowed, list):
                return {str(x) for x in allowed if isinstance(x, str)}

    return set()


def is_parent_domain_allowed(company_name: str, content_type: str | None) -> bool:
    """
    指定の content_type で親会社ドメインを許可するか判定。
    """
    if not content_type:
        return False
    allowed = get_parent_allow_content_types(company_name)
    return content_type in allowed


def get_company_candidates_for_domain(domain: str) -> set[str]:
    """
    ドメインから該当し得る企業名候補を取得。

    ドメインセグメント/ハイフン分割でパターンを探索し、
    企業マッピングのパターンインデックスから候補を集める。
    """
    if not domain:
        return set()

    index = _get_domain_pattern_index()
    allowlisted_short = get_short_domain_allowlist_patterns()
    candidates: set[str] = set()

    segments = domain.lower().split(".")
    for segment in segments:
        if not segment:
            continue
        # Full segment match (e.g., "mizuho-fg")
        if segment in GENERIC_DOMAIN_PATTERNS:
            continue
        companies = index.get(segment)
        if companies:
            candidates.update(companies)

        # Token match (e.g., "mizuho" from "mizuho-fg")
        for token in re.split(r"[-_]", segment):
            if not token:
                continue
            if token in GENERIC_DOMAIN_PATTERNS:
                continue
            if len(token) < 3 and token not in allowlisted_short:
                continue
            companies = index.get(token)
            if companies:
                candidates.update(companies)

    return candidates


def get_subsidiary_companies(parent_name: str) -> dict[str, list[str]]:
    """
    親会社の全子会社とそのドメインパターンを取得。

    Args:
        parent_name: 親会社名

    Returns:
        {子会社名: [ドメインパターン...], ...} の辞書
    """
    mappings = _load_company_mappings()
    subsidiaries = {}
    for company_name, mapping in mappings.items():
        if isinstance(mapping, dict) and mapping.get("parent") == parent_name:
            subsidiaries[company_name] = _get_domains_from_mapping(mapping)
    return subsidiaries


def get_sibling_companies(company_name: str) -> dict[str, list[str]]:
    """
    兄弟会社（同じ親を持つ他の子会社）とそのドメインパターンを取得。

    金融グループなどで、検索対象企業と同じ親会社を持つ
    別の子会社が子会社扱いされないようにするために使用。

    例: みずほ銀行の兄弟 → みずほ信託銀行、みずほ証券、みずほリース等

    Args:
        company_name: 企業名

    Returns:
        {兄弟会社名: [ドメインパターン...], ...} の辞書（自分自身は含まない）
    """
    parent = get_parent_company(company_name)
    if not parent:
        return {}

    # 親会社の全子会社を取得
    all_siblings = get_subsidiary_companies(parent)

    # 自分自身を除外
    siblings = {
        name: patterns
        for name, patterns in all_siblings.items()
        if name != company_name
    }

    return siblings


def is_subsidiary_domain(url: str, parent_name: str) -> tuple[bool, str | None]:
    """
    URLが親会社の子会社ドメインかどうかを判定（境界チェック付き）。

    親会社検索時に、子会社サイトを検出してペナルティを適用するために使用。
    ドメインセグメント単位でマッチングを行い、部分文字列の誤マッチを防ぐ。

    2段階で検出:
    1. 登録済み子会社のドメインパターンとのマッチング
    2. 未登録でも「親会社パターン-XXX」形式のドメインを子会社として検出

    Args:
        url: 検査対象のURL
        parent_name: 親会社名

    Returns:
        (is_subsidiary, subsidiary_name) - 子会社ドメインならTrue + 子会社名

    Example:
        >>> is_subsidiary_domain("https://nttdmse-recruit.snar.jp/", "NTTデータ")
        (True, "NTTデータMSE")  # 子会社のドメイン「nttdata-mse」を含む

        >>> is_subsidiary_domain("https://www.nttdata-sbc.co.jp/", "NTTデータ")
        (True, "未登録子会社 (nttdata-sbc)")  # 未登録だが親会社パターンで始まる

        >>> is_subsidiary_domain("https://www.nttdata.com/", "NTTデータ")
        (False, None)  # 親会社自身のドメイン
    """
    from urllib.parse import urlparse

    # URLからドメイン部分を抽出
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
    except Exception:
        return False, None

    if not domain:
        return False, None

    # ドメインをセグメントに分割
    domain_segments = domain.split(".")

    # ステップ1: 登録済み子会社のパターンマッチング
    subsidiaries = get_subsidiary_companies(parent_name)
    for sub_name, patterns in subsidiaries.items():
        for pattern in patterns:
            if len(pattern) < 3:
                continue
            pattern_lower = pattern.lower()

            for segment in domain_segments:
                # 完全一致
                if segment == pattern_lower:
                    return True, sub_name
                # ハイフン付きパターン（例: nttdata-mse, nttdmse-recruit）
                if segment.startswith(pattern_lower + "-") or segment.endswith(
                    "-" + pattern_lower
                ):
                    return True, sub_name
                # サブドメインパターン内に含まれる（例: nttdmse の中に nttdata-mse）
                # 注: 厳密なマッチのため、パターンがセグメント全体と一致する場合のみ
                if pattern_lower in segment and len(segment) <= len(pattern_lower) + 10:
                    # パターンがセグメントの主要部分を構成する場合
                    if segment.replace("-", "").replace(
                        "_", ""
                    ) == pattern_lower.replace("-", "").replace("_", ""):
                        return True, sub_name

    # ステップ2: ワイルドカードパターン検出（未登録子会社）
    # 親会社のドメインパターンを取得
    parent_patterns = get_company_domain_patterns(parent_name)
    if not parent_patterns:
        return False, None

    allowlisted_short = get_short_domain_allowlist_patterns()
    official_patterns = {
        p.lower()
        for p in parent_patterns
        if len(p) >= 3 or p.lower() in allowlisted_short
    }
    pattern_index = _get_domain_pattern_index()

    def _has_other_company_prefix(segment: str) -> bool:
        if "-" not in segment:
            return False
        prefix = segment.split("-", 1)[0]
        if prefix in official_patterns:
            return False
        companies = pattern_index.get(prefix)
        if not companies:
            return False
        return True

    # 登録済み子会社のパターンを除外リストに追加
    registered_patterns = set()
    for patterns in subsidiaries.values():
        for p in patterns:
            registered_patterns.add(p.lower())

    # 兄弟会社のパターンを取得（検索対象企業が子会社の場合）
    # 例: みずほ銀行検索時、みずほ信託銀行（兄弟）を子会社扱いしない
    sibling_patterns = set()
    siblings = get_sibling_companies(parent_name)
    for sibling_name, patterns in siblings.items():
        for p in patterns:
            sibling_patterns.add(p.lower())

    # 採用関連キーワード（これらは子会社ではなく公式採用サイト）
    RECRUITMENT_KEYWORDS = {
        "recruit",
        "saiyo",
        "entry",
        "career",
        "careers",
        "graduate",
        "job",
        "jobs",
        "hiring",
    }

    for pattern in parent_patterns:
        if len(pattern) < 3:
            continue
        pattern_lower = pattern.lower()

        for segment in domain_segments:
            # 公式パターン（別名）と一致する場合は子会社扱いしない
            if segment in official_patterns and segment != pattern_lower:
                continue
            if any(
                segment.startswith(official + "-")
                for official in official_patterns
                if official != pattern_lower
            ):
                continue
            # 他社パターンのプレフィックス衝突は除外
            if _has_other_company_prefix(segment):
                continue
            # 「親会社パターン-XXX」形式をチェック（例: nttdata-sbc）
            if segment.startswith(pattern_lower + "-"):
                # 親会社自身のドメインパターンではないことを確認
                if segment == pattern_lower:
                    continue
                # 登録済み子会社パターンではないことを確認
                if segment in registered_patterns:
                    continue
                # 兄弟会社のパターンはスキップ（子会社ではない）
                # 例: みずほ銀行検索時、mizuho-tb（みずほ信託銀行）は兄弟
                if segment in sibling_patterns:
                    continue
                # 兄弟パターンで始まるセグメントもスキップ
                # 例: mizuho-tb-recruit は mizuho-tb（兄弟）の関連サイト
                is_sibling_related = any(
                    segment == sib_pattern or segment.startswith(sib_pattern + "-")
                    for sib_pattern in sibling_patterns
                )
                if is_sibling_related:
                    continue
                # 採用関連キーワードは子会社ではない（公式採用サイト）
                suffix = segment[
                    len(pattern_lower) + 1 :
                ]  # "recruit" from "nttdata-recruit"
                if suffix in RECRUITMENT_KEYWORDS:
                    continue
                # 未登録の子会社として検出
                return True, f"未登録子会社 ({segment})"

    return False, None


def is_parent_domain(url: str, company_name: str) -> bool:
    """
    URLが親会社のドメインかどうかを判定（境界チェック付き）。

    子会社検索時に、親会社サイトを除外するために使用。
    ドメインセグメント単位でマッチングを行い、部分文字列の誤マッチを防ぐ。

    重要: 子会社自身のドメイン（例: mitsui-steel.com）は親会社として判定しない。

    Args:
        url: 検査対象のURL
        company_name: 検索中の子会社名

    Returns:
        親会社ドメインならTrue

    Example:
        >>> is_parent_domain("https://career.mitsui.com/recruit/", "三井物産スチール")
        True  # 親会社「三井物産」のドメイン「mitsui」を含む

        >>> is_parent_domain("https://www.mitsui-steel.com/", "三井物産スチール")
        False  # 子会社自身のドメイン「mitsui-steel」は親会社ではない

        >>> is_parent_domain("https://smitsui.com/", "三井物産スチール")
        False  # 「smitsui」は「mitsui」と完全一致しない（境界チェック）
    """
    from urllib.parse import urlparse

    allowlisted_short = get_short_domain_allowlist_patterns()

    # 1. 子会社自身のドメインパターンを取得
    own_patterns = get_company_domain_patterns(company_name)

    # 2. 親会社のドメインパターンを取得
    parent_patterns = get_parent_domain_patterns(company_name)
    if not parent_patterns:
        return False

    # URLからドメイン部分を抽出
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
    except Exception:
        return False

    if not domain:
        return False

    # ドメインをセグメントに分割（例: "career.mitsui.com" → ["career", "mitsui", "com"]）
    domain_segments = domain.split(".")

    def _matches_domain_pattern(domain: str, pattern: str) -> bool:
        pattern_lower = pattern.lower()
        domain_lower = domain.lower()
        if "." in pattern_lower:
            if domain_lower == pattern_lower:
                return True
            if domain_lower.endswith("." + pattern_lower):
                return True
            # Allow multi-segment patterns like "bk.mufg"
            if re.search(rf"(?:^|\.){re.escape(pattern_lower)}(?:\.|$)", domain_lower):
                return True
            return False

        # Segment-based match (same as _domain_pattern_matches)
        for segment in domain_lower.split("."):
            if segment == pattern_lower:
                return True
            if segment.startswith(pattern_lower + "-") or segment.endswith(
                "-" + pattern_lower
            ):
                return True
        return False

    # 3. まず子会社自身のドメインかチェック（親会社と共通のパターンを除外）
    # 子会社固有のパターン = 子会社パターン - 親会社パターン
    own_unique_patterns = [p for p in own_patterns if p not in parent_patterns]

    for pattern in own_unique_patterns:
        if len(pattern) < 3 and pattern.lower() not in allowlisted_short:
            continue
        if _matches_domain_pattern(domain, pattern):
            return False  # 子会社自身のサイト → 親会社サイトではない

    # 4. 親会社ドメインパターンをチェック
    for pattern in parent_patterns:
        if len(pattern) < 3 and pattern.lower() not in allowlisted_short:
            continue
        if _matches_domain_pattern(domain, pattern):
            return True

    return False


def get_company_domain_patterns(
    company_name: str, ascii_name: str | None = None
) -> list[str]:
    """
    企業名から可能なドメインパターンを生成。

    1. 登録済みマッピングから取得
    2. 企業名の部分一致でマッピング検索
    3. ASCII名からバリアント生成
    4. 企業名の読みからパターン生成

    新形式（オブジェクト）と旧形式（配列）の両方をサポート。

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
        patterns.extend(_get_domains_from_mapping(mappings[company_name]))

    # 2. 部分一致でマッピング検索（株式会社などを除去した名前で）
    normalized = _normalize_for_lookup(company_name)
    if normalized != company_name and normalized in mappings:
        patterns.extend(_get_domains_from_mapping(mappings[normalized]))

    # 2.5. 短いパターンの許可リストを追加
    short_allowlist = _get_short_domain_allowlist()
    allowlist_patterns = short_allowlist.get(company_name, [])
    if normalized != company_name and not allowlist_patterns:
        allowlist_patterns = short_allowlist.get(normalized, [])
    for p in allowlist_patterns:
        if p not in patterns:
            patterns.append(p)

    # 3. 含む検索（企業グループ名の一部など）
    # ただし、親会社のパターンは含めない（例: NTTデータ検索時にNTTのパターンを含めない）
    for key, mapping_data in mappings.items():
        # サブセクションマーカーはスキップ
        if key.startswith("_"):
            continue
        # 登録名が検索名に含まれる、または検索名が登録名に含まれる
        if key != company_name and (key in company_name or company_name in key):
            # 親会社/グループ会社の場合はスキップ（別企業として扱う）
            # 例: "NTT" in "NTTデータ" の場合、NTTは別企業なのでスキップ
            if key in company_name and len(key) < len(company_name):
                # 短い名前が長い名前の先頭に含まれる場合（プレフィックスマッチ）
                # これは通常、親会社/グループ名を示す
                if company_name.startswith(key):
                    continue  # 親会社/グループのパターンはスキップ
            domain_patterns = _get_domains_from_mapping(mapping_data)
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
            short_name = ascii_name[: len(ascii_name) // 2]
            if len(short_name) >= 3 and short_name not in patterns:
                patterns.append(short_name)

    # 5. 企業名から抽出可能なパターン（カタカナ企業名など）
    extracted = _extract_domain_hints(company_name)
    for hint in extracted:
        if hint not in patterns:
            # 既存パターンのプレフィックスの場合はスキップ
            # 例: "ntt" は "nttdata" のプレフィックスなのでスキップ
            is_prefix_of_existing = any(
                p.startswith(hint) and p != hint for p in patterns
            )
            if not is_prefix_of_existing:
                patterns.append(hint)

    return patterns


def _normalize_for_lookup(company_name: str) -> str:
    """
    企業名をマッピング検索用に正規化。

    株式会社、（株）などの法人格を除去。
    """
    # 法人格を除去
    suffixes = [
        "株式会社",
        "（株）",
        "(株)",
        "㈱",
        "有限会社",
        "（有）",
        "(有)",
        "合同会社",
        "合名会社",
        "合資会社",
        "一般社団法人",
        "一般財団法人",
        "ホールディングス",
        "HD",
        "グループ",
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
    ascii_pattern = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ]+")
    matches = ascii_pattern.findall(company_name)
    for match in matches:
        # 全角を半角に変換
        normalized = match.translate(
            str.maketrans(
                "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ",
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
            )
        ).lower()
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
