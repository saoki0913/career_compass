#!/usr/bin/env python3
"""
Domain auto-discovery tool.

Searches DDG for "{company_name} 公式サイト" and extracts official domain candidates.
Compares discovered domains with existing company_mappings.json to find gaps.

Usage:
    python -m evals.company_info_search.cli.discover_domains --output domain_candidates.json
    python -m evals.company_info_search.cli.discover_domains --companies "AGC,TDK,NEC"
    python -m evals.company_info_search.cli.discover_domains --weak-only --limit 50
    python -m evals.company_info_search.cli.discover_domains --dry-run --limit 10
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MAPPINGS_PATH = BACKEND_ROOT / "data" / "company_mappings.json"
FIXTURES_PATH = (
    BACKEND_ROOT / "evals" / "company_info_search" / "fixtures"
)
DEFAULT_OUTPUT_PATH = (
    BACKEND_ROOT / "evals" / "company_info_search" / "output" / "domain_candidates.json"
)

# ---------------------------------------------------------------------------
# Domain scoring constants
# ---------------------------------------------------------------------------

# TLD confidence tiers
TLD_CONFIDENCE: dict[str, float] = {
    ".co.jp": 0.95,
    ".or.jp": 0.90,
    ".go.jp": 0.90,
    ".ne.jp": 0.80,
    ".jp": 0.85,
    ".com": 0.70,
    ".net": 0.60,
    ".org": 0.60,
}
DEFAULT_TLD_CONFIDENCE = 0.40

# Bonus for domain containing a fragment of the company name
NAME_FRAGMENT_BONUS = 0.10

# Penalty for domains that look like job boards rather than official sites
JOB_BOARD_DOMAINS = frozenset({
    "en-hyouban.com",
    "en-japan.com",
    "en.wikipedia.org",
    "ja.wikipedia.org",
    "jobtalk.jp",
    "kaisha-hyouban.com",
    "mynavi.jp",
    "openwork.jp",
    "recruit.co.jp",
    "rikunabi.com",
    "shukatsu-kaigi.jp",
    "vorkers.com",
    "wikipedia.org",
    "yahoo.co.jp",
    "google.com",
    "google.co.jp",
    "linkedin.com",
    "glassdoor.com",
    "indeed.com",
    "doda.jp",
    "type.jp",
    "bizreach.jp",
    "wantedly.com",
    "note.com",
    "prtimes.jp",
    "nikkei.com",
    "toyokeizai.net",
    "diamond.jp",
    "newspicks.com",
    "bunshun.jp",
    "president.jp",
    "onecareer.jp",
    "unistyleinc.com",
    "goodfind.jp",
    "offerbox.jp",
    "nikki.ne.jp",
    "shukatsu-mirai.com",
    "careerpark.jp",
    "gaishishukatsu.com",
    "liiga.me",
    "fashionsnap.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "amazon.co.jp",
    "amazon.com",
    "bloomberg.com",
    "reuters.com",
})

# Maximum number of DDG results to fetch per query
DDG_MAX_RESULTS = 5

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class DiscoveredDomain:
    """A single domain candidate discovered from search."""
    domain: str
    confidence: float
    source_url: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "domain": self.domain,
            "confidence": round(self.confidence, 3),
            "source_url": self.source_url,
        }


@dataclass
class CompanyCandidate:
    """Discovery result for one company."""
    company_name: str
    current_patterns: list[str]
    discovered_domains: list[DiscoveredDomain] = field(default_factory=list)
    recommendation: str = "skip"  # "add", "skip", "already_has_dotted", "no_result"
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "company_name": self.company_name,
            "current_patterns": self.current_patterns,
            "discovered_domains": [dd.to_dict() for dd in self.discovered_domains],
            "recommendation": self.recommendation,
        }
        if self.error:
            d["error"] = self.error
        return d


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_mappings() -> dict[str, Any]:
    """Load company_mappings.json."""
    raw = json.loads(MAPPINGS_PATH.read_text(encoding="utf-8"))
    return raw


def _get_company_patterns(mappings: dict[str, Any], company_name: str) -> list[str]:
    """Get existing domain patterns for a company from mappings."""
    m = mappings.get("mappings", {})
    patterns = m.get(company_name, [])
    if isinstance(patterns, list):
        return patterns
    if isinstance(patterns, dict):
        domains = patterns.get("domains", [])
        if isinstance(domains, list):
            return domains
    return []


def _has_dotted_pattern(patterns: list[str]) -> bool:
    """Check if any pattern contains a dot (i.e. is a real domain)."""
    return any("." in p for p in patterns)


def _is_weak_pattern(patterns: list[str]) -> bool:
    """A company has a 'weak' pattern if it has only non-dotted entries."""
    if not patterns:
        return True
    return not _has_dotted_pattern(patterns)


def _load_company_list() -> list[dict[str, Any]]:
    """Load company list from popular_companies_300.json fixture."""
    path = FIXTURES_PATH / "popular_companies_300.json"
    if not path.exists():
        logger.error("Company fixture not found: %s", path)
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw.get("companies", [])


def _extract_domain(url: str) -> str | None:
    """Extract the registrable domain from a URL.

    Returns the domain without www. prefix, or None if parsing fails.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return None
        # Strip www. prefix
        if host.startswith("www."):
            host = host[4:]
        return host.lower()
    except Exception:
        return None


def _is_job_board(domain: str) -> bool:
    """Check if a domain belongs to a known job board or news site."""
    for jb in JOB_BOARD_DOMAINS:
        if domain == jb or domain.endswith("." + jb):
            return True
    return False


def _tld_confidence(domain: str) -> float:
    """Score a domain based on its TLD."""
    for tld, score in sorted(TLD_CONFIDENCE.items(), key=lambda x: -len(x[0])):
        if domain.endswith(tld):
            return score
    return DEFAULT_TLD_CONFIDENCE


def _normalize_name_for_matching(name: str) -> str:
    """Create a lowered ASCII-ish representation for fuzzy domain matching."""
    # Remove common corporate suffixes and normalize
    import unicodedata

    name = name.lower()
    # Remove common suffixes
    for suffix in [
        "株式会社", "ホールディングス", "グループ", "フィナンシャル",
        "コーポレーション", "ジャパン",
    ]:
        name = name.replace(suffix, "")
    # Keep only alphanumeric chars
    result = ""
    for ch in unicodedata.normalize("NFKC", name):
        if ch.isalnum():
            result += ch
    return result


def _name_fragment_in_domain(company_name: str, domain: str, existing_patterns: list[str]) -> bool:
    """Check if the company name or an existing pattern fragment appears in the domain."""
    domain_lower = domain.lower().replace(".", "").replace("-", "")

    # Check existing patterns
    for pat in existing_patterns:
        pat_clean = pat.lower().replace(".", "").replace("-", "")
        if len(pat_clean) >= 3 and pat_clean in domain_lower:
            return True

    # Check normalized company name
    norm = _normalize_name_for_matching(company_name)
    if len(norm) >= 3 and norm in domain_lower:
        return True

    return False


def _score_domain(
    domain: str,
    source_url: str,
    company_name: str,
    existing_patterns: list[str],
) -> float:
    """Compute a confidence score for a discovered domain."""
    if _is_job_board(domain):
        return 0.0

    score = _tld_confidence(domain)

    if _name_fragment_in_domain(company_name, domain, existing_patterns):
        score = min(1.0, score + NAME_FRAGMENT_BONUS)

    return score


def _deduplicate_domains(
    domains: list[DiscoveredDomain],
) -> list[DiscoveredDomain]:
    """Keep only the highest-confidence entry per domain."""
    best: dict[str, DiscoveredDomain] = {}
    for dd in domains:
        existing = best.get(dd.domain)
        if existing is None or dd.confidence > existing.confidence:
            best[dd.domain] = dd
    # Sort by confidence descending
    return sorted(best.values(), key=lambda d: -d.confidence)


# ---------------------------------------------------------------------------
# DDG search
# ---------------------------------------------------------------------------


def _search_company_domains(
    company_name: str,
    existing_patterns: list[str],
    delay: float = 1.0,
) -> list[DiscoveredDomain]:
    """Search DDG for official domain candidates for a company.

    Returns a list of DiscoveredDomain sorted by confidence (descending).
    """
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore[no-redef]
        except ImportError:
            logger.error("ddgs / duckduckgo_search package not installed")
            return []

    query = f"{company_name} 公式サイト"
    candidates: list[DiscoveredDomain] = []

    try:
        with DDGS() as ddgs:
            # Pass query as positional arg for compat with both
            # ddgs (query=) and duckduckgo_search (keywords=) packages
            results = ddgs.text(query, max_results=DDG_MAX_RESULTS)
            if not results:
                return []

            for result in results:
                url = result.get("href", "") or result.get("link", "")
                if not url:
                    continue
                domain = _extract_domain(url)
                if not domain:
                    continue
                confidence = _score_domain(
                    domain, url, company_name, existing_patterns
                )
                if confidence > 0.0:
                    candidates.append(
                        DiscoveredDomain(
                            domain=domain,
                            confidence=confidence,
                            source_url=url,
                        )
                    )
    except Exception as exc:
        logger.warning("DDG search failed for '%s': %s", company_name, exc)
        raise

    return _deduplicate_domains(candidates)


# ---------------------------------------------------------------------------
# Core discovery logic
# ---------------------------------------------------------------------------


def discover_domains(
    companies: list[dict[str, Any]] | None = None,
    company_names_filter: list[str] | None = None,
    weak_only: bool = False,
    limit: int | None = None,
    delay: float = 1.0,
    progress_callback: Any = None,
) -> tuple[list[CompanyCandidate], dict[str, int]]:
    """Run domain discovery for a list of companies.

    Args:
        companies: List of company dicts from popular_companies_300.json.
            If None, loads from the default fixture.
        company_names_filter: If set, only process companies with these names.
        weak_only: Only process companies with single non-dotted patterns.
        limit: Maximum number of companies to process.
        delay: Delay in seconds between DDG API calls.
        progress_callback: Optional callable(current, total, company_name) for progress.

    Returns:
        (candidates, stats) where stats has counts for reporting.
    """
    mappings_data = _load_mappings()

    if companies is None:
        companies = _load_company_list()
    if not companies:
        logger.error("No companies to process")
        return [], {"total_companies": 0}

    # Build lookup of all company names in mappings
    all_mappings = mappings_data.get("mappings", {})

    # Filter by name if requested
    if company_names_filter:
        filter_set = set(company_names_filter)
        companies = [c for c in companies if c["name"] in filter_set]

    # Build candidates list with pattern info
    work_items: list[tuple[dict[str, Any], list[str]]] = []
    for comp in companies:
        name = comp["name"]
        patterns = _get_company_patterns(mappings_data, name)
        work_items.append((comp, patterns))

    # Filter weak-only if requested
    if weak_only:
        work_items = [(c, p) for c, p in work_items if _is_weak_pattern(p)]

    # Apply limit
    if limit is not None and limit > 0:
        work_items = work_items[:limit]

    total = len(work_items)
    stats = {
        "total_companies": total,
        "already_have_dotted": 0,
        "new_discoveries": 0,
        "no_result": 0,
        "errors": 0,
        "skipped_weak_filter": 0,
    }

    candidates: list[CompanyCandidate] = []

    for idx, (comp, patterns) in enumerate(work_items):
        name = comp["name"]

        if progress_callback:
            progress_callback(idx + 1, total, name)

        candidate = CompanyCandidate(
            company_name=name,
            current_patterns=list(patterns),
        )

        # Check if already has dotted domain
        if _has_dotted_pattern(patterns):
            candidate.recommendation = "already_has_dotted"
            stats["already_have_dotted"] += 1
            candidates.append(candidate)
            continue

        # Search DDG
        try:
            discovered = _search_company_domains(name, patterns, delay=delay)
            candidate.discovered_domains = discovered

            if discovered:
                # Check if any discovery is genuinely new
                existing_domains = {p for p in patterns if "." in p}
                new_domains = [
                    d for d in discovered
                    if d.domain not in existing_domains and d.confidence >= 0.5
                ]
                if new_domains:
                    candidate.recommendation = "add"
                    stats["new_discoveries"] += 1
                else:
                    candidate.recommendation = "skip"
            else:
                candidate.recommendation = "no_result"
                stats["no_result"] += 1

        except Exception as exc:
            candidate.error = str(exc)
            candidate.recommendation = "no_result"
            stats["errors"] += 1
            stats["no_result"] += 1
            logger.warning("Error discovering domains for %s: %s", name, exc)

        candidates.append(candidate)

        # Rate limiting
        if idx < total - 1:
            time.sleep(delay)

    return candidates, stats


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def build_output(
    candidates: list[CompanyCandidate],
    stats: dict[str, int],
) -> dict[str, Any]:
    """Build the final JSON output structure."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "generated_at": now,
        "candidates": [c.to_dict() for c in candidates],
        "stats": stats,
    }


def print_summary(
    candidates: list[CompanyCandidate],
    stats: dict[str, int],
) -> None:
    """Print a human-readable summary to stdout."""
    out = sys.stdout

    out.write("\n=== Domain Discovery Summary ===\n\n")
    out.write(f"  Total companies processed: {stats['total_companies']}\n")
    out.write(f"  Already have dotted domain: {stats.get('already_have_dotted', 0)}\n")
    out.write(f"  New discoveries (recommend add): {stats.get('new_discoveries', 0)}\n")
    out.write(f"  No result: {stats.get('no_result', 0)}\n")
    out.write(f"  Errors: {stats.get('errors', 0)}\n\n")

    # Show top discoveries
    add_candidates = [c for c in candidates if c.recommendation == "add"]
    if add_candidates:
        out.write("--- Top Discoveries ---\n")
        for c in add_candidates[:30]:
            top_domain = c.discovered_domains[0] if c.discovered_domains else None
            if top_domain:
                out.write(
                    f"  {c.company_name}: {top_domain.domain} "
                    f"(confidence={top_domain.confidence:.2f}) "
                    f"current={c.current_patterns}\n"
                )
        if len(add_candidates) > 30:
            out.write(f"  ... and {len(add_candidates) - 30} more\n")
    else:
        out.write("  No new domain discoveries.\n")

    # Show errors
    error_candidates = [c for c in candidates if c.error]
    if error_candidates:
        out.write("\n--- Errors ---\n")
        for c in error_candidates[:10]:
            out.write(f"  {c.company_name}: {c.error}\n")

    out.write("\n")
    out.flush()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover official domains for companies via DDG search.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Output JSON path (default: {DEFAULT_OUTPUT_PATH.relative_to(BACKEND_ROOT)})",
    )
    parser.add_argument(
        "--companies",
        type=str,
        default=None,
        help='Comma-separated company names to process (e.g. "AGC,TDK,NEC")',
    )
    parser.add_argument(
        "--weak-only",
        action="store_true",
        default=False,
        help="Only process companies with single non-dotted pattern (weak matching)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of companies to process",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Delay in seconds between DDG API calls (default: 1.0)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Don't write output file, just print summary",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        default=False,
        help="Enable verbose logging",
    )
    return parser.parse_args(argv)


def _progress_printer(current: int, total: int, name: str) -> None:
    """Simple progress callback that writes to stderr."""
    sys.stderr.write(f"\r  [{current}/{total}] {name}...")
    sys.stderr.flush()
    if current == total:
        sys.stderr.write("\n")
        sys.stderr.flush()


def main(argv: list[str] | None = None) -> int:
    """Entry point for the domain discovery CLI."""
    args = _parse_args(argv)

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )

    # Parse company filter
    company_names_filter: list[str] | None = None
    if args.companies:
        company_names_filter = [c.strip() for c in args.companies.split(",") if c.strip()]
        if not company_names_filter:
            logger.error("--companies argument parsed to empty list")
            return 1

    sys.stdout.write(f"Domain discovery starting...\n")
    sys.stdout.write(f"  Mappings: {MAPPINGS_PATH}\n")
    sys.stdout.write(f"  Fixture: {FIXTURES_PATH / 'popular_companies_300.json'}\n")
    if company_names_filter:
        sys.stdout.write(f"  Filter: {company_names_filter}\n")
    if args.weak_only:
        sys.stdout.write(f"  Mode: weak-only\n")
    if args.limit:
        sys.stdout.write(f"  Limit: {args.limit}\n")
    sys.stdout.write(f"  Delay: {args.delay}s\n")
    sys.stdout.flush()

    # Run discovery
    candidates, stats = discover_domains(
        companies=None,  # Load from default fixture
        company_names_filter=company_names_filter,
        weak_only=args.weak_only,
        limit=args.limit,
        delay=args.delay,
        progress_callback=_progress_printer,
    )

    # Print summary
    print_summary(candidates, stats)

    # Write output
    if not args.dry_run:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_data = build_output(candidates, stats)
        output_path.write_text(
            json.dumps(output_data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        sys.stdout.write(f"Output written to: {output_path}\n")
    else:
        sys.stdout.write("Dry run -- no output file written.\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
