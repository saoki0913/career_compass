"""
Web Search Query Generation Module

Extracted from web_search.py — contains company name variant generation,
query alias management, and search query variation logic.
"""

import re
from datetime import datetime

# =============================================================================
# Company Name Constants
# =============================================================================

# Company name suffixes to normalize
COMPANY_SUFFIXES = [
    "株式会社",
    "（株）",
    "(株)",
    "㈱",
    "有限会社",
    "合同会社",
    "合資会社",
    "Inc.",
    "Inc",
    "Ltd.",
    "Ltd",
    "Co.,Ltd.",
    "Co.,Ltd",
    "Co., Ltd.",
    "Corporation",
    "Corp.",
    "Corp",
    "Holdings",
    "ホールディングス",
    "HD",
    "グループ",
]

# Long company name shortening suffixes (domain-specific, not legal)
COMPANY_DOMAIN_SUFFIXES = [
    "火災保険",
    "海上火災",
    "ホールディングス",
    "グループ",
    "フィナンシャルグループ",
    "フィナンシャル",
]

# Company-specific query aliases (used to improve recall for brand/English names)
COMPANY_QUERY_ALIASES = {
    "BCG": ["BCG", "Boston Consulting Group"],
    "PwC": ["PwC", "PricewaterhouseCoopers"],
    "KPMG": ["KPMG"],
    "P&G": ["P&G", "P&G Japan", "Procter & Gamble", "Procter and Gamble", "Procter Gamble", "PG"],
    "SUBARU": ["SUBARU"],
    "NTTデータ": ["NTT DATA", "NTTData"],
    "NTTドコモ": ["docomo", "ドコモ"],
    "三菱UFJ銀行": ["MUFG", "MUFG Bank", "MUFGBANK"],
    "JFE商事": ["JFE商事", "JFETC"],
    "三越伊勢丹": ["IMHDS", "IMHD", "三越伊勢丹ホールディングス"],
    "AGC": ["AGC株式会社", "AGC 旭硝子"],
    "TDK": ["TDK株式会社", "TDK Corporation"],
    "NEC": ["NEC", "日本電気株式会社"],
    "NTT": ["NTT", "日本電信電話株式会社"],
    "JR東日本": ["JR東日本", "東日本旅客鉄道"],
    "JR西日本": ["JR西日本", "西日本旅客鉄道"],
    "JR東海": ["JR東海", "東海旅客鉄道"],
    "DMG森精機": ["DMG MORI", "DMG森精機株式会社"],
    "ENEOS": ["ENEOS", "ENEOSホールディングス"],
    "INPEX": ["INPEX", "株式会社INPEX"],
    "TOTO": ["TOTO株式会社", "TOTO 衛生陶器"],
    "YKK": ["YKK株式会社", "YKK AP"],
    "IHI": ["IHI", "株式会社IHI"],
    "DIC": ["DIC株式会社", "DIC 化学"],
    "SGホールディングス": ["SGホールディングス", "佐川急便"],
    "KDDI": ["KDDI株式会社", "KDDI au"],
    "SCSK": ["SCSK株式会社", "SCSK IT"],
    "JFEスチール": ["JFEスチール", "JFE Steel"],
    "日本IBM": ["日本IBM", "IBM Japan"],
    "日本HP": ["日本HP", "HP Japan", "日本ヒューレット・パッカード"],
    "LINE": ["LINE株式会社", "LINEヤフー"],
    "DeNA": ["DeNA", "株式会社ディー・エヌ・エー"],
    "ZOZO": ["ZOZO", "株式会社ZOZO"],
    "凸版印刷": ["凸版印刷", "TOPPANホールディングス", "TOPPAN"],
    "資生堂": ["資生堂", "SHISEIDO"],
    "ユニクロ": ["ユニクロ", "ファーストリテイリング", "UNIQLO"],
    "読売新聞": ["読売新聞社", "読売新聞グループ"],
    "九電工": ["九電工", "株式会社九電工"],
}


# =============================================================================
# Company Name Utilities
# =============================================================================


def normalize_company_name(name: str) -> str:
    """Normalize company name by removing legal suffixes."""
    result = name
    for suffix in COMPANY_SUFFIXES:
        result = result.replace(suffix, "")
    return result.strip()


def extract_ascii_name(name: str) -> str | None:
    """Extract ASCII/romanized version of company name."""
    # Check for ASCII-only portions
    ascii_parts = re.findall(r"[A-Za-z]{2,}", name)
    if ascii_parts:
        return ascii_parts[0].lower()
    return None


def generate_company_variants(company_name: str) -> list[str]:
    """
    Generate company name variants for search queries.

    Returns list of variants: [original, normalized, ascii, short forms]
    """
    variants = [company_name]

    # Normalized (without legal suffix)
    normalized = normalize_company_name(company_name)
    if normalized != company_name and normalized:
        variants.append(normalized)

    # ASCII/romanized version
    ascii_name = extract_ascii_name(company_name)
    if ascii_name:
        variants.append(ascii_name)

    # Short variant for long names (remove domain-specific suffixes)
    short = normalized
    for suffix in COMPANY_DOMAIN_SUFFIXES:
        if short.endswith(suffix):
            short = short[: -len(suffix)].strip()
            break
    if short and short != normalized and len(short) >= 3:
        variants.append(short)

    # Remove duplicates while preserving order
    seen = set()
    unique_variants = []
    for v in variants:
        v_lower = v.lower()
        if v_lower not in seen and v:
            seen.add(v_lower)
            unique_variants.append(v)

    return unique_variants


def _merge_query_aliases(company_name: str, base_variants: list[str]) -> list[str]:
    aliases = COMPANY_QUERY_ALIASES.get(company_name, [])
    if not aliases:
        return base_variants

    merged = list(base_variants)
    seen = {v.lower() for v in base_variants if v}
    for alias in aliases:
        alias_normalized = alias.lower()
        if alias_normalized in seen or not alias:
            continue
        merged.append(alias)
        seen.add(alias_normalized)

    return merged


def _get_graduation_year() -> int:
    """Calculate the current target graduation year."""
    now = datetime.now()
    # If before October, target next year + 2 (e.g., 2024年1月 → 2026卒)
    # If October or later, target next year + 3 (e.g., 2024年10月 → 2027卒)
    if now.month < 10:
        return now.year + 2
    return now.year + 3


def generate_query_variations(
    company_name: str,
    search_intent: str = "recruitment",
    graduation_year: int | None = None,
    selection_type: str | None = None,
) -> list[str]:
    """
    Generate diverse search query variations for improved recall.

    Args:
        company_name: Company name to search for
        search_intent: "recruitment" | "corporate_ir" | "corporate_about"
        graduation_year: Target graduation year (e.g., 2027)
        selection_type: "main_selection" | "internship" | None

    Returns:
        List of 6-8 unique search queries
    """
    # Late import to avoid circular dependency (web_search -> web_search_query -> web_search)
    from app.utils.web_search import WEB_SEARCH_MAX_QUERIES

    queries = []
    base_variants = generate_company_variants(company_name)
    company_variants = _merge_query_aliases(company_name, base_variants)
    if not company_variants:
        primary_name = company_name or ""
    else:
        primary_name = company_variants[0]
    short_name = company_variants[1] if len(company_variants) > 1 else primary_name
    alias_name = company_variants[2] if len(company_variants) > 2 else None
    ascii_name = base_variants[2] if len(base_variants) > 2 else None

    grad_year = graduation_year or _get_graduation_year()
    grad_year_short = grad_year % 100

    def add_queries(suffixes: list[str]):
        for suffix in suffixes:
            queries.append(f"{primary_name} {suffix}")
            if short_name != primary_name:
                queries.append(f"{short_name} {suffix}")

    if search_intent in {"recruitment", "new_grad"}:
        if alias_name:
            queries.extend([f"{alias_name} 新卒採用", f"{alias_name} Graduate Recruitment"])
        if selection_type == "internship":
            add_queries(
                [
                    f"インターン {grad_year_short}卒",
                    f"インターン 選考スケジュール {grad_year_short}卒",
                    "インターンシップ 募集",
                    f"インターン 募集要項 {grad_year}",
                    f"サマーインターン {grad_year}",
                    "インターン エントリー",
                ]
            )
        else:
            add_queries(
                [
                    f"新卒採用 {grad_year_short}卒",
                    f"選考スケジュール {grad_year_short}卒",
                    f"新卒採用 {grad_year}",
                    f"募集要項 {grad_year}",
                    "新卒採用情報",
                    "新卒 採用HP",
                    "エントリー 締切",
                    "Graduate Recruitment",
                    "Early Career",
                ]
            )
        if ascii_name:
            queries.append(f"{ascii_name} graduate recruitment")
        trusted_site_queries = [
            f"{primary_name} 新卒採用 {grad_year} site:job.mynavi.jp",
            f"{primary_name} 新卒採用 {grad_year} site:job.rikunabi.com",
            f"{primary_name} {grad_year_short}卒 site:onecareer.jp",
        ]
        queries.extend(trusted_site_queries)

    elif search_intent == "midcareer":
        if alias_name:
            queries.extend([f"{alias_name} キャリア採用", f"{alias_name} Job Openings"])
        add_queries(
            [
                "中途採用",
                "キャリア採用",
                "経験者採用",
                "Job Openings",
                "Experienced Hire",
            ]
        )

    elif search_intent == "corporate_ir":
        add_queries(
            [
                "IR",
                "投資家情報",
                "有価証券報告書",
                "決算説明資料",
                "統合報告書",
                "決算短信",
            ]
        )

    elif search_intent == "corporate_about":
        add_queries(["会社概要", "企業情報", "事業内容", "会社案内"])

    elif search_intent == "ceo_message":
        add_queries(
            [
                "社長メッセージ",
                "代表挨拶",
                "トップメッセージ",
                "CEO Message",
                "社長挨拶",
                "ごあいさつ",
            ]
        )

    elif search_intent == "employee_interviews":
        add_queries(
            [
                "社員インタビュー",
                "社員紹介",
                "社員の声",
                "Employee Interview",
                "Culture",
                "先輩社員",
                "働く人",
            ]
        )

    elif search_intent == "csr":
        add_queries(
            [
                "CSR",
                "サステナビリティ",
                "ESG",
                "サステナビリティレポート",
                "ESG Report",
            ]
        )

    elif search_intent == "midterm_plan":
        add_queries(
            [
                "中期経営計画",
                "中期計画",
                "中期経営方針",
                "Medium-Term Plan",
                "経営計画",
                "長期ビジョン",
            ]
        )

    elif search_intent == "press_release":
        add_queries(
            [
                "プレスリリース",
                "ニュースリリース",
                "報道発表",
                "Press Release",
            ]
        )

    # Deduplicate while preserving order
    seen = set()
    unique_queries = []
    for q in queries:
        q_normalized = q.lower().strip()
        if q_normalized not in seen:
            seen.add(q_normalized)
            unique_queries.append(q)

    return unique_queries[:WEB_SEARCH_MAX_QUERIES]


def _reformulate_empty_query(original_query: str, company_name: str) -> str:
    """Reformulate a query that returned 0 DDG results."""
    q = re.sub(r"site:\S+", "", original_query).strip()
    if company_name and len(company_name) <= 4 and company_name.isascii():
        q = f"株式会社{company_name}" if company_name not in q else q
    if "公式" not in q and "ホームページ" not in q:
        q = f"{q} 公式サイト"
    return q
