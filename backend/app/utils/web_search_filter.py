"""
Web Search Pre-filter Module

Extracted from web_search.py — contains domain exclusion lists, intent gate
constants, and the _prefilter_results() function that removes irrelevant
results before scoring.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.utils.company_names import (
    classify_company_domain_relation,
    domain_pattern_matches,
    get_conflicting_companies_for_domain,
    normalize_company_result_source_type,
)

if TYPE_CHECKING:
    from app.utils.web_search import WebSearchResult

# =============================================================================
# Domain / Category Constants
# =============================================================================

# Excluded domains
EXCLUDED_DOMAINS = [
    "youtube.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "note.com",
    "ameblo.jp",
    "hatena.ne.jp",
    "prtimes.jp",
    "news.yahoo.co.jp",
    "nikkei.com",
    "wikipedia.org",
    "tickerreport.com",
    "aum13f.com",
    "ibankie.com",
    "cryptonews.com",
    "tapwage.com",
    "interviewanswers.com",
    "skymizer.ai",
    "yell.com",
    "ncsy.org",
    "nttdatafoundation.com",
    "presseportal.de",
    "telcomagazine.com",
    "test-dev-site.site",
    "i-webs.jp",
    "snar.jp",
    "hrmos.co.jp",
    "hrmos.co",
]

# Job aggregator sites (lower score but not excluded)
AGGREGATOR_DOMAINS = [
    "rikunabi.com",
    "mynavi.jp",
    "onecareer.jp",
    "unistyle.jp",
    "goodfind.jp",
    "offerbox.jp",
    "wantedly.com",
    "indeed.com",
    "en-japan.com",
    "doda.jp",
    "careerpark.jp",
    "rikeinavi.com",
    "reashu.com",
    "ut-board.com",
    "talentsquare.co.jp",
    "renew-career.com",
    "abuild-c.com",
    "pasonacareer.jp",
    "r-agent.com",
    "careerup-media.com",
    "syukatsu-kaigi.jp",
]

# FAQ/Help-like paths to exclude in certain categories
FAQ_LIKE_PATTERNS = [
    "faq",
    "help",
    "support",
    "shop",
    "campaign",
    "loan",
    "net_simulation",
    "tenpoinfo",
    "branch",
    "store",
]

# Categories where external sites should be excluded entirely
EXTERNAL_STRICT_CATEGORIES = {
    "new_grad_recruitment",
    "midcareer_recruitment",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
}

# Categories where FAQ/help-like pages should be excluded
FAQ_EXCLUDE_CATEGORIES = {
    "ceo_message",
    "employee_interviews",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
}

# Categories where intent gate should be enforced
INTENT_GATE_CATEGORIES = {
    "new_grad_recruitment",
    "midcareer_recruitment",
    "ir_materials",
    "csr_sustainability",
    "midterm_plan",
    "press_release",
    "ceo_message",
    "employee_interviews",
}

INTENT_GATE_THRESHOLD = 0.55
INTENT_GATE_RELAXED_THRESHOLD = 0.35


# =============================================================================
# Pre-filter
# =============================================================================


def _prefilter_results(
    results: list[WebSearchResult],
    company_name: str,
    official_patterns: list[str],
    strict_match: bool,
    allow_aggs: bool,
    allow_snippet_match: bool,
    short_name_guard: bool,
    content_type: str | None,
    target_intent: str,
    preferred_domain: str | None = None,
) -> list[WebSearchResult]:
    # Late imports to avoid circular dependency (web_search -> web_search_filter -> web_search)
    from app.utils.web_search import (
        LOG_MAX_ITEMS,
        _calculate_intent_match_score,
        _contains_company_name,
        _debug_log,
    )

    lower_content_type = content_type or ""
    exclude_external = lower_content_type in EXTERNAL_STRICT_CATEGORIES
    exclude_faq = lower_content_type in FAQ_EXCLUDE_CATEGORIES
    enforce_intent_gate = lower_content_type in INTENT_GATE_CATEGORIES

    def _run_filter_pass(
        *,
        phase: str,
        intent_gate_threshold: float,
        relax_external_for_company_match: bool,
    ) -> tuple[list[WebSearchResult], dict[str, int], list[dict]]:
        filtered_local: list[WebSearchResult] = []
        debug_records_local: list[dict] = []
        exclude_counts_local: dict[str, int] = {}

        for result in results:
            domain = result.domain
            url_lower = (result.url or "").lower()
            exclude_reason = None

            if any(excl in domain for excl in EXCLUDED_DOMAINS):
                exclude_reason = "excluded_domain"

            is_aggregator = any(agg in domain for agg in AGGREGATOR_DOMAINS)
            if not allow_aggs and is_aggregator:
                exclude_reason = "aggregator_excluded"

            relation = classify_company_domain_relation(
                result.url,
                company_name,
                content_type=content_type,
            )
            is_official = bool(relation["is_official"])
            is_parent_site = bool(relation["is_parent"])
            is_related_company = is_parent_site or bool(relation["is_subsidiary"])
            result.is_parent = is_parent_site
            result.is_subsidiary = bool(relation["is_subsidiary"])

            if exclude_faq and any(pattern in url_lower for pattern in FAQ_LIKE_PATTERNS):
                exclude_reason = "faq_excluded"

            company_match = _contains_company_name(
                company_name,
                title=result.title,
                url=result.url,
                snippet=result.snippet,
                allow_snippet_match=allow_snippet_match,
            )
            result.company_name_matched = company_match
            result.is_official = is_official
            result.source_type = normalize_company_result_source_type(
                "aggregator" if is_aggregator else result.source_type,
                relation,
            )
            is_likely_official = is_official or (
                company_match
                and not is_aggregator
                and (
                    any(domain_pattern_matches(domain, pat) for pat in official_patterns)
                    or (
                        preferred_domain
                        and domain_pattern_matches(domain, preferred_domain)
                    )
                )
            )

            if exclude_external and not is_likely_official and not is_related_company:
                if not (relax_external_for_company_match and company_match):
                    exclude_reason = "external_excluded"

            conflicts = get_conflicting_companies_for_domain(domain, company_name)
            if conflicts:
                result.is_conflict = True
                if not is_official and not is_related_company:
                    exclude_reason = "conflict_domain"

            if short_name_guard and not is_official and not is_related_company:
                exclude_reason = "short_name_guard"

            intent_gate_score = None
            if enforce_intent_gate:
                intent_gate_score = _calculate_intent_match_score(result, target_intent)
                result.score_breakdown["intent_gate"] = intent_gate_score
                if not is_likely_official and intent_gate_score < intent_gate_threshold:
                    exclude_reason = "intent_gate"

            if exclude_reason:
                exclude_counts_local[exclude_reason] = (
                    exclude_counts_local.get(exclude_reason, 0) + 1
                )
                if len(debug_records_local) < LOG_MAX_ITEMS:
                    debug_records_local.append(
                        {
                            "phase": phase,
                            "url": result.url,
                            "domain": domain,
                            "official": is_official,
                            "likely_official": is_likely_official,
                            "preferred": bool(
                                preferred_domain
                                and domain_pattern_matches(domain, preferred_domain)
                            ),
                            "parent": is_parent_site,
                            "company_match": company_match,
                            "intent_gate": intent_gate_score,
                            "exclude_reason": exclude_reason,
                        }
                    )
                continue

            filtered_local.append(result)

        return filtered_local, exclude_counts_local, debug_records_local

    filtered, exclude_counts, debug_records = _run_filter_pass(
        phase="strict",
        intent_gate_threshold=INTENT_GATE_THRESHOLD,
        relax_external_for_company_match=False,
    )

    if not filtered:
        filtered, exclude_counts, debug_records = _run_filter_pass(
            phase="relax_intent_gate",
            intent_gate_threshold=INTENT_GATE_RELAXED_THRESHOLD,
            relax_external_for_company_match=False,
        )
        if filtered:
            _debug_log(
                "[WebSearch] Prefilter recovered with relaxed intent gate (%d results)",
                len(filtered),
            )

    if not filtered and exclude_external:
        filtered, exclude_counts, debug_records = _run_filter_pass(
            phase="relax_external_company_match",
            intent_gate_threshold=INTENT_GATE_RELAXED_THRESHOLD,
            relax_external_for_company_match=True,
        )
        if filtered:
            _debug_log(
                "[WebSearch] Prefilter recovered with external relaxation (%d results)",
                len(filtered),
            )

    if exclude_counts:
        _debug_log(
            "[WebSearch] Prefilter stats total=%d kept=%d excluded=%d by_reason=%s",
            len(results),
            len(filtered),
            len(results) - len(filtered),
            exclude_counts,
        )
    if debug_records:
        _debug_log("[WebSearch] Prefilter samples=%s", debug_records[:LOG_MAX_ITEMS])

    return filtered
