#!/usr/bin/env python3
"""
Official misclassification audit for cross-prefix domain collisions.

This script:
1) Loads company_mappings.json and detects cross-prefix/suffix collisions
2) Runs hybrid_web_search for target companies and intents
3) Extracts official URLs and checks for collisions
4) Writes a Markdown report under backend/data/audit

Usage:
  python backend/scripts/audit_official_misclassification.py
  python backend/scripts/audit_official_misclassification.py --limit 5
  python backend/scripts/audit_official_misclassification.py --max-results 10 --cache-mode refresh
  python backend/scripts/audit_official_misclassification.py --all
"""

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.routers.company_info import (  # noqa: E402
    _contains_company_name,
    _domain_pattern_matches,
    _is_irrelevant_url,
    _is_parent_company_site,
    _is_subsidiary,
)
from app.utils.company_names import (  # noqa: E402
    get_company_domain_patterns,
    is_subsidiary_domain,
)
from app.utils.web_search import HAS_DDGS, hybrid_web_search  # noqa: E402

MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "company_mappings.json"
DEFAULT_INTENTS = ["recruitment", "corporate_about", "corporate_ir"]


@dataclass(frozen=True)
class Collision:
    company: str
    company_pattern: str
    other_company: str
    other_pattern: str
    relation: str  # "prefix" | "suffix"


def _load_mappings() -> dict:
    with open(MAPPINGS_FILE, encoding="utf-8") as f:
        return json.load(f)


def _extract_patterns(entry) -> list[str]:
    if isinstance(entry, list):
        return [p for p in entry if isinstance(p, str)]
    if isinstance(entry, dict):
        domains = entry.get("domains", [])
        return [p for p in domains if isinstance(p, str)]
    return []


def _is_effective_pattern(pattern: str, short_allowlist: set[str]) -> bool:
    if len(pattern) >= 3:
        return True
    return pattern.lower() in short_allowlist


def _build_company_patterns(mappings: dict) -> dict[str, list[str]]:
    short_allowlist = {
        p.lower() for p in mappings.get("short_domain_allowlist", [])
    }
    company_patterns: dict[str, list[str]] = {}
    for company, entry in mappings.get("mappings", {}).items():
        if company.startswith("_"):
            continue
        patterns = [
            p.lower().strip()
            for p in _extract_patterns(entry)
            if isinstance(p, str) and p.strip()
        ]
        patterns = [
            p for p in patterns if _is_effective_pattern(p, short_allowlist)
        ]
        if patterns:
            company_patterns[company] = patterns
    return company_patterns


def _build_cross_collisions(
    company_patterns: dict[str, list[str]],
) -> dict[str, dict[str, list[Collision]]]:
    collisions_by_company: dict[str, dict[str, list[Collision]]] = {}
    pattern_list: list[tuple[str, str]] = []
    for company, patterns in company_patterns.items():
        for pattern in patterns:
            pattern_list.append((company, pattern))

    for company, pattern in pattern_list:
        for other_company, other_pattern in pattern_list:
            if company == other_company:
                continue
            relation = None
            if other_pattern.startswith(pattern + "-"):
                relation = "prefix"
            elif other_pattern.endswith("-" + pattern):
                relation = "suffix"
            if not relation:
                continue
            collision = Collision(
                company=company,
                company_pattern=pattern,
                other_company=other_company,
                other_pattern=other_pattern,
                relation=relation,
            )
            collisions_by_company.setdefault(company, {}).setdefault(
                other_pattern, []
            ).append(collision)

    return collisions_by_company


def _filter_hybrid_results(
    results,
    company_name: str,
    domain_patterns: list[str],
    max_results: int,
    allow_snippet_match: bool,
    adjust_for_year: bool,
):
    filtered = []
    for result in results:
        url = result.url
        title = result.title
        snippet = result.snippet

        if _is_irrelevant_url(url):
            continue

        if _is_subsidiary(company_name, title, url):
            continue

        source_type = result.source_type
        adjusted_score = result.combined_score

        if _is_parent_company_site(company_name, title, url):
            adjusted_score *= 0.5
            source_type = "parent"

        is_sub, _sub_name = is_subsidiary_domain(url, company_name)
        if is_sub:
            adjusted_score *= 0.3
            source_type = "subsidiary"

        url_domain = result.domain
        is_official_domain = (
            any(
                _domain_pattern_matches(url_domain, pattern)
                for pattern in domain_patterns
            )
            if domain_patterns
            else False
        )

        if not is_official_domain and not _contains_company_name(
            company_name, title, url, snippet, allow_snippet_match
        ):
            continue

        if adjusted_score >= 0.7 and (source_type == "official" or is_official_domain):
            confidence = "high"
        elif adjusted_score >= 0.5:
            confidence = "medium"
        else:
            confidence = "low"

        if adjust_for_year and not result.year_matched and confidence == "high":
            confidence = "medium"

        filtered.append(
            {
                "url": url,
                "title": (title or url)[:100],
                "confidence": confidence,
                "source_type": source_type
                if source_type
                in ["official", "job_site", "parent", "subsidiary", "blog", "other"]
                else "other",
            }
        )

        if len(filtered) >= max_results:
            break

    return filtered


def _domain_segments(url: str) -> list[str]:
    try:
        domain = urlparse(url).netloc.lower()
    except Exception:
        return []
    segments = [s for s in domain.split(".") if s and s != "www"]
    return segments


async def _run_company_search(
    company_name: str,
    intents: Iterable[str],
    max_results: int,
    cache_mode: str,
    allow_snippet_match: bool,
) -> dict[str, list[dict]]:
    domain_patterns = get_company_domain_patterns(company_name)
    results_by_intent: dict[str, list[dict]] = {}

    for intent in intents:
        hybrid_results = await hybrid_web_search(
            company_name=company_name,
            search_intent=intent,
            max_results=max_results + 10,
            domain_patterns=domain_patterns,
            use_cache=True,
            cache_mode=cache_mode,
        )
        filtered = _filter_hybrid_results(
            hybrid_results,
            company_name=company_name,
            domain_patterns=domain_patterns,
            max_results=max_results,
            allow_snippet_match=allow_snippet_match,
            adjust_for_year=(intent == "recruitment"),
        )
        results_by_intent[intent] = filtered

    return results_by_intent


def _write_markdown_report(
    output_path: Path,
    generated_at: str,
    intents: list[str],
    max_results: int,
    cache_mode: str,
    company_names: list[str],
    official_count: int,
    collision_records: list[dict],
    errors: list[dict],
):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    lines.append("# Official Misclassification Audit Report")
    lines.append("")
    lines.append(f"- Generated at: {generated_at}")
    lines.append(f"- Companies analyzed: {len(company_names)}")
    lines.append(f"- Intents: {', '.join(intents)}")
    lines.append(f"- Max results per intent: {max_results}")
    lines.append(f"- Cache mode: {cache_mode}")
    lines.append(f"- Official URLs found: {official_count}")
    lines.append(f"- Collision records: {len(collision_records)}")
    lines.append("")

    if errors:
        lines.append("## Errors")
        for err in errors:
            lines.append(
                f"- {err['company']} / {err['intent']}: {err['error']}"
            )
        lines.append("")

    lines.append("## Collision Records")
    if not collision_records:
        lines.append("No collisions detected.")
        lines.append("")
    else:
        lines.append(
            "| company | intent | official_url | domain | segment | other_company | other_pattern | relation | company_pattern |"
        )
        lines.append(
            "|---|---|---|---|---|---|---|---|---|"
        )
        for rec in collision_records:
            lines.append(
                f"| {rec['company']} | {rec['intent']} | {rec['url']} | {rec['domain']} | {rec['segment']} | {rec['other_company']} | {rec['other_pattern']} | {rec['relation']} | {rec['company_pattern']} |"
            )
        lines.append("")

    lines.append("## Companies Analyzed")
    for name in company_names:
        lines.append(f"- {name}")
    lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")


async def _main_async(args) -> int:
    if not HAS_DDGS:
        print("Error: ddgs/duckduckgo-search not installed.", file=sys.stderr)
        return 1

    mappings = _load_mappings()
    company_patterns = _build_company_patterns(mappings)
    collisions_by_company = _build_cross_collisions(company_patterns)

    if args.all:
        target_companies = sorted(company_patterns.keys())
    else:
        target_companies = sorted(collisions_by_company.keys())

    if args.limit:
        target_companies = target_companies[: args.limit]

    intents = args.intents or DEFAULT_INTENTS
    cache_mode = args.cache_mode
    max_results = args.max_results

    official_count = 0
    collision_records: list[dict] = []
    errors: list[dict] = []

    semaphore = asyncio.Semaphore(args.concurrency)

    async def _run_one(company_name: str):
        async with semaphore:
            try:
                results = await _run_company_search(
                    company_name=company_name,
                    intents=intents,
                    max_results=max_results,
                    cache_mode=cache_mode,
                    allow_snippet_match=False,
                )
                return company_name, results, None
            except Exception as exc:
                return company_name, None, exc

    if args.concurrency <= 1:
        company_results = []
        for idx, company_name in enumerate(target_companies, start=1):
            print(f"[{idx}/{len(target_companies)}] {company_name}")
            company_name, results, exc = await _run_one(company_name)
            company_results.append((company_name, results, exc))
    else:
        tasks = [_run_one(name) for name in target_companies]
        company_results = await asyncio.gather(*tasks)

    for company_name, results, exc in company_results:
        if exc is not None or results is None:
            for intent in intents:
                errors.append(
                    {
                        "company": company_name,
                        "intent": intent,
                        "error": str(exc),
                    }
                )
            continue

        collisions_for_company = collisions_by_company.get(company_name, {})

        for intent, candidates in results.items():
            for candidate in candidates:
                if candidate.get("source_type") != "official":
                    continue
                official_count += 1
                url = candidate.get("url", "")
                domain = ""
                try:
                    domain = urlparse(url).netloc.lower()
                except Exception:
                    domain = ""

                segments = _domain_segments(url)
                for segment in segments:
                    if segment not in collisions_for_company:
                        continue
                    for collision in collisions_for_company[segment]:
                        collision_records.append(
                            {
                                "company": company_name,
                                "intent": intent,
                                "url": url,
                                "domain": domain,
                                "segment": segment,
                                "other_company": collision.other_company,
                                "other_pattern": collision.other_pattern,
                                "relation": collision.relation,
                                "company_pattern": collision.company_pattern,
                            }
                        )

    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    output_dir = Path(args.output_dir)
    output_file = output_dir / f"official_misclass_report_{datetime.now():%Y-%m-%d}.md"
    _write_markdown_report(
        output_path=output_file,
        generated_at=generated_at,
        intents=intents,
        max_results=max_results,
        cache_mode=cache_mode,
        company_names=target_companies,
        official_count=official_count,
        collision_records=collision_records,
        errors=errors,
    )

    print(f"Report written to: {output_file}")
    print(f"Companies analyzed: {len(target_companies)}")
    print(f"Official URLs found: {official_count}")
    print(f"Collision records: {len(collision_records)}")
    if errors:
        print(f"Errors: {len(errors)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit official misclassification for cross-prefix collisions."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Analyze all companies (not just cross-prefix collision candidates).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of companies for a quick run.",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=10,
        help="Max results per intent (default: 10).",
    )
    parser.add_argument(
        "--cache-mode",
        type=str,
        default="refresh",
        choices=["use", "refresh", "bypass"],
        help="Cache mode for hybrid_web_search (default: refresh).",
    )
    parser.add_argument(
        "--intents",
        nargs="+",
        default=DEFAULT_INTENTS,
        help="Search intents to run.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="backend/data/audit",
        help="Directory for output report.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Number of concurrent companies to process (default: 1).",
    )
    args = parser.parse_args()

    return asyncio.run(_main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
