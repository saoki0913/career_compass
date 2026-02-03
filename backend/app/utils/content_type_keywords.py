"""
Content type keywords for corporate page search.

This module provides content-type-specific keywords for:
1. Query building: Generate optimized search queries per content type
2. Scoring: Boost scores for URL/title/snippet matches
3. Validation: Detect content type mismatches
"""

from typing import TypedDict


class ContentTypeKeywords(TypedDict):
    """Keyword structure for each content type."""

    url: list[str]  # URL path patterns (e.g., /message/, /interview/)
    title: list[str]  # Title keywords (Japanese)
    snippet: list[str]  # Snippet keywords (Japanese)


CONTENT_TYPE_KEYWORDS: dict[str, ContentTypeKeywords] = {
    "new_grad_recruitment": {
        "url": [
            "recruit",
            "shinsotsu",
            "newgrad",
            "entry",
            "saiyo",
            "graduate",
            "freshers",
        ],
        "title": [
            "新卒採用",
            "新卒",
            "25卒",
            "26卒",
            "27卒",
            "28卒",
            "エントリー",
            "採用情報",
            "募集要項",
        ],
        "snippet": ["新卒", "採用", "選考フロー", "募集要項", "エントリー", "説明会"],
    },
    "midcareer_recruitment": {
        "url": [
            "career",
            "midcareer",
            "tenshoku",
            "experienced",
            "chuto",
            "job-change",
        ],
        "title": ["中途採用", "キャリア採用", "経験者採用", "転職", "即戦力", "求人"],
        "snippet": ["中途", "キャリア", "即戦力", "経験者", "転職"],
    },
    "ceo_message": {
        "url": [
            "message",
            "ceo",
            "president",
            "greeting",
            "topmessage",
            "chairman",
            "representative",
        ],
        "title": [
            "社長",
            "メッセージ",
            "代表取締役",
            "CEO",
            "挨拶",
            "トップメッセージ",
            "経営者",
            "会長",
        ],
        "snippet": ["社長", "メッセージ", "代表", "経営理念", "ビジョン", "挨拶"],
    },
    "employee_interviews": {
        "url": ["interview", "voice", "story", "people", "staff", "member", "senpai"],
        "title": [
            "インタビュー",
            "社員の声",
            "社員紹介",
            "先輩社員",
            "若手社員",
            "社員メッセージ",
        ],
        "snippet": ["インタビュー", "社員", "働く", "キャリア", "やりがい", "1日"],
    },
    "press_release": {
        "url": [
            "news",
            "press",
            "release",
            "newsroom",
            "information",
            "topics",
            "oshirase",
        ],
        "title": [
            "プレスリリース",
            "ニュース",
            "お知らせ",
            "リリース",
            "報道発表",
            "ニュースルーム",
        ],
        "snippet": ["プレスリリース", "発表", "リリース", "お知らせ", "報道"],
    },
    "ir_materials": {
        "url": [
            "ir",
            "investor",
            "financial",
            "stock",
            "kabunushi",
            "kessan",
            "securities",
        ],
        "title": [
            "IR",
            "投資家",
            "株主",
            "決算",
            "有価証券報告書",
            "統合報告書",
            "財務情報",
        ],
        "snippet": ["IR", "投資家", "決算", "財務", "株主", "有価証券"],
    },
    "csr_sustainability": {
        "url": [
            "csr",
            "esg",
            "sustainability",
            "sdgs",
            "social",
            "environment",
            "responsible",
        ],
        "title": [
            "CSR",
            "サステナビリティ",
            "ESG",
            "社会貢献",
            "環境",
            "SDGs",
            "持続可能",
        ],
        "snippet": ["CSR", "サステナビリティ", "ESG", "社会責任", "環境", "SDGs"],
    },
    "midterm_plan": {
        "url": ["plan", "strategy", "mtp", "medium-term", "chuki", "keiei", "vision"],
        "title": [
            "中期経営計画",
            "中期計画",
            "中計",
            "経営方針",
            "MTP",
            "経営戦略",
            "事業計画",
        ],
        "snippet": ["中期経営計画", "経営方針", "事業戦略", "成長戦略", "計画"],
    },
    "corporate_site": {
        "url": ["about", "company", "corporate", "overview", "profile", "info"],
        "title": ["会社概要", "企業情報", "会社案内", "企業概要", "沿革", "組織"],
        "snippet": ["会社", "企業", "概要", "沿革", "拠点", "組織"],
    },
}


# Content type to search type fallback mapping
CONTENT_TYPE_TO_SEARCH_TYPE: dict[str, str] = {
    "new_grad_recruitment": "about",
    "midcareer_recruitment": "about",
    "ceo_message": "about",
    "employee_interviews": "about",
    "press_release": "about",
    "ir_materials": "ir",
    "csr_sustainability": "about",
    "midterm_plan": "ir",
    "corporate_site": "about",
}


def get_content_type_keywords(content_type: str) -> ContentTypeKeywords | None:
    """Get keywords for a specific content type.

    Args:
        content_type: One of the 9 content types

    Returns:
        ContentTypeKeywords dict or None if not found
    """
    return CONTENT_TYPE_KEYWORDS.get(content_type)


def get_search_type_for_content_type(content_type: str) -> str:
    """Get the fallback search type for a content type.

    Args:
        content_type: One of the 9 content types

    Returns:
        search_type: "ir", "business", or "about"
    """
    return CONTENT_TYPE_TO_SEARCH_TYPE.get(content_type, "about")


def get_all_url_patterns_for_content_type(content_type: str) -> set[str]:
    """Get all URL patterns that indicate a specific content type.

    Args:
        content_type: One of the 9 content types

    Returns:
        Set of URL patterns
    """
    keywords = get_content_type_keywords(content_type)
    if keywords:
        return set(keywords["url"])
    return set()


def detect_content_type_from_url(url: str) -> str | None:
    """Attempt to detect content type from URL patterns.

    Args:
        url: The URL to analyze

    Returns:
        Detected content type or None
    """
    url_lower = url.lower()

    # Score each content type
    best_match = None
    best_score = 0

    for ct, keywords in CONTENT_TYPE_KEYWORDS.items():
        score = 0
        for pattern in keywords["url"]:
            if pattern in url_lower:
                score += 1
                # Exact path match gets bonus
                if f"/{pattern}/" in url_lower or url_lower.endswith(f"/{pattern}"):
                    score += 1

        if score > best_score:
            best_score = score
            best_match = ct

    return best_match if best_score > 0 else None


def get_conflicting_content_types(content_type: str) -> list[str]:
    """Get content types that might be confused with the given type.

    Args:
        content_type: The target content type

    Returns:
        List of potentially conflicting content types
    """
    conflicts = {
        "ceo_message": ["employee_interviews"],  # Both have "message"
        "employee_interviews": ["ceo_message"],
        "ir_materials": ["midterm_plan"],  # Both IR-related
        "midterm_plan": ["ir_materials"],
        "new_grad_recruitment": ["midcareer_recruitment"],  # Both recruitment
        "midcareer_recruitment": ["new_grad_recruitment"],
    }
    return conflicts.get(content_type, [])
