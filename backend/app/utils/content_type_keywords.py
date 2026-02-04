"""
Content type keywords for corporate page search.

This module provides content-type-specific keywords for:
1. Query building: Generate optimized search queries per content type
2. Scoring: Boost scores for URL/title/snippet matches
3. Validation: Detect content type mismatches
"""

from typing import TypedDict

from app.utils.intent_profile import INTENT_PROFILES


class ContentTypeKeywords(TypedDict):
    """Keyword structure for each content type."""

    url: list[str]  # URL path patterns (e.g., /message/, /interview/)
    title: list[str]  # Title keywords (Japanese)
    snippet: list[str]  # Snippet keywords (Japanese)


CONTENT_TYPE_KEYWORDS: dict[str, ContentTypeKeywords] = {}
for ct, profile in INTENT_PROFILES.items():
    title_keywords = list(profile.strong_keywords)
    snippet_keywords = list(profile.strong_keywords + profile.weak_keywords)
    CONTENT_TYPE_KEYWORDS[ct] = {
        "url": list(profile.url_patterns),
        "title": title_keywords,
        "snippet": snippet_keywords,
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

    # Strong recruitment signals (avoid misclassifying generic "recruit/career")
    newgrad_strong = {"newgrad", "shinsotsu", "graduate", "fresh", "freshers"}
    midcareer_strong = {"midcareer", "tenshoku", "experienced", "chuto", "job-change"}

    if any(p in url_lower for p in midcareer_strong):
        return "midcareer_recruitment"
    if any(p in url_lower for p in newgrad_strong):
        return "new_grad_recruitment"

    # Weak/ambiguous URL patterns that should not alone decide content type
    weak_patterns = {
        "information",
        "topics",
        "message",
        "about",
        "company",
        "corporate",
        "profile",
        "overview",
        "info",
        "recruit",
        "saiyo",
        "entry",
        "career",
    }

    best_match = None
    best_score = 0.0

    for ct, keywords in CONTENT_TYPE_KEYWORDS.items():
        if ct in {"new_grad_recruitment", "midcareer_recruitment"}:
            # Skip weak recruitment patterns unless strong signals matched above
            continue

        score = 0.0
        matched_strong = False
        for pattern in keywords["url"]:
            if pattern in url_lower:
                exact_match = (
                    f"/{pattern}/" in url_lower
                    or url_lower.endswith(f"/{pattern}")
                    or url_lower.endswith(f"/{pattern}.html")
                )
                weight = 0.5 if pattern in weak_patterns else 1.0
                if pattern == "message" and exact_match:
                    weight = 1.0
                score += weight
                if weight >= 1.0:
                    matched_strong = True
                # Exact path match gets bonus
                if exact_match:
                    score += 0.5

        # Require at least one strong signal or a meaningful score
        if score >= 1.0 and (matched_strong or score >= 1.5 or ct == "corporate_site"):
            if score > best_score:
                best_score = score
                best_match = ct

    return best_match


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
