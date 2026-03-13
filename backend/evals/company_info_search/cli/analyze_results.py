#!/usr/bin/env python3
"""Analyze company info search test results."""

import json
import sys
from collections import defaultdict
from pathlib import Path


def analyze_results(file_path: str):
    """Analyze test results and compute metrics."""

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Extract results array from the data structure
    results = data.get('runs', [])

    # Filter out meta items
    valid_results = [
        r for r in results
        if r.get('kind') not in ['meta', 'company_context']
    ]

    # Initialize counters
    hybrid_pass = 0
    hybrid_total = 0
    legacy_pass = 0
    legacy_total = 0

    kind_stats = defaultdict(lambda: {'hybrid': {'pass': 0, 'total': 0}, 'legacy': {'pass': 0, 'total': 0}})
    company_stats = defaultdict(lambda: {'hybrid': {'pass': 0, 'total': 0}, 'legacy': {'pass': 0, 'total': 0}})

    no_candidates_count = 0
    ranking_failure_count = 0

    failures = []

    # Process each result
    for result in valid_results:
        mode = result.get('mode', 'unknown')
        kind = result.get('kind', 'unknown')
        company = result.get('company_name', 'unknown')
        judgment_data = result.get('judgment')
        candidates = result.get('candidates', [])

        # Skip if judgment is null (not evaluated)
        if judgment_data is None:
            continue

        # Extract passed boolean from judgment dict
        judgment = judgment_data.get('passed', False) if isinstance(judgment_data, dict) else bool(judgment_data)

        # Update totals
        if mode == 'hybrid':
            hybrid_total += 1
            kind_stats[kind]['hybrid']['total'] += 1
            company_stats[company]['hybrid']['total'] += 1
            if judgment:
                hybrid_pass += 1
                kind_stats[kind]['hybrid']['pass'] += 1
                company_stats[company]['hybrid']['pass'] += 1
        elif mode == 'legacy':
            legacy_total += 1
            kind_stats[kind]['legacy']['total'] += 1
            company_stats[company]['legacy']['total'] += 1
            if judgment:
                legacy_pass += 1
                kind_stats[kind]['legacy']['pass'] += 1
                company_stats[company]['legacy']['pass'] += 1

        # Failure analysis
        if not judgment:
            failures.append({
                'company': company,
                'mode': mode,
                'kind': kind,
                'has_candidates': len(candidates) > 0,
                'details': judgment_data.get('details', '') if isinstance(judgment_data, dict) else ''
            })

            if not candidates:
                no_candidates_count += 1
            else:
                ranking_failure_count += 1

    # Print results
    print("=" * 80)
    print("COMPANY INFO SEARCH TEST RESULTS ANALYSIS")
    print("=" * 80)
    print()

    # 1. Overall metrics
    print("1. OVERALL METRICS")
    print("-" * 80)
    total_tests = hybrid_total + legacy_total
    total_pass = hybrid_pass + legacy_pass

    print(f"Hybrid Mode:  {hybrid_pass}/{hybrid_total} = {hybrid_pass/hybrid_total*100:.1f}% pass rate" if hybrid_total > 0 else "Hybrid Mode: N/A")
    print(f"Legacy Mode:  {legacy_pass}/{legacy_total} = {legacy_pass/legacy_total*100:.1f}% pass rate" if legacy_total > 0 else "Legacy Mode: N/A")
    print(f"Overall:      {total_pass}/{total_tests} = {total_pass/total_tests*100:.1f}% pass rate" if total_tests > 0 else "Overall: N/A")
    print()

    # 2. By content type
    print("2. BY CONTENT TYPE (KIND)")
    print("-" * 80)
    for kind in sorted(kind_stats.keys()):
        stats = kind_stats[kind]
        print(f"\n{kind}:")

        if stats['hybrid']['total'] > 0:
            h_rate = stats['hybrid']['pass'] / stats['hybrid']['total'] * 100
            print(f"  Hybrid: {stats['hybrid']['pass']}/{stats['hybrid']['total']} = {h_rate:.1f}%")

        if stats['legacy']['total'] > 0:
            l_rate = stats['legacy']['pass'] / stats['legacy']['total'] * 100
            print(f"  Legacy: {stats['legacy']['pass']}/{stats['legacy']['total']} = {l_rate:.1f}%")
    print()

    # 3. Failure analysis
    print("3. FAILURE ANALYSIS")
    print("-" * 80)
    print(f"No candidates (search returned nothing):     {no_candidates_count}")
    print(f"Ranking failure (candidates exist, wrong):   {ranking_failure_count}")
    print(f"Total failures:                              {len(failures)}")
    print()

    # Show failure details breakdown
    failure_reasons = defaultdict(int)
    for failure in failures:
        details = failure.get('details', 'Unknown')
        if not failure['has_candidates']:
            failure_reasons['No candidates'] += 1
        else:
            # Extract specific failure reason from details
            if 'official_rank=' in details:
                # Extract rank number
                try:
                    rank = int(details.split('official_rank=')[1].split()[0].strip(',)'))
                    failure_reasons[f'Official found but ranked #{rank} (not in top 5)'] += 1
                except:
                    failure_reasons['Official found but ranked too low'] += 1
            elif 'official not found' in details.lower():
                failure_reasons['Official domain not found in results'] += 1
            else:
                failure_reasons[f'Other: {details[:60]}'] += 1

    if failure_reasons:
        print("\nFailure Reasons Breakdown:")
        for reason, count in sorted(failure_reasons.items(), key=lambda x: x[1], reverse=True):
            print(f"  {reason}: {count}")
    print()

    # 4. Worst companies
    print("4. WORST COMPANIES (most failures)")
    print("-" * 80)
    company_failures = defaultdict(int)
    for failure in failures:
        company_failures[failure['company']] += 1

    sorted_failures = sorted(company_failures.items(), key=lambda x: x[1], reverse=True)
    for i, (company, count) in enumerate(sorted_failures[:10], 1):
        print(f"{i:2d}. {company}: {count} failures")
    print()

    # 5. By company breakdown
    print("5. BY COMPANY BREAKDOWN")
    print("-" * 80)
    print(f"{'Company':<40} {'Hybrid':<20} {'Legacy':<20}")
    print("-" * 80)

    for company in sorted(company_stats.keys()):
        stats = company_stats[company]

        h_str = f"{stats['hybrid']['pass']}/{stats['hybrid']['total']}" if stats['hybrid']['total'] > 0 else "N/A"
        if stats['hybrid']['total'] > 0:
            h_rate = stats['hybrid']['pass'] / stats['hybrid']['total'] * 100
            h_str += f" ({h_rate:.0f}%)"

        l_str = f"{stats['legacy']['pass']}/{stats['legacy']['total']}" if stats['legacy']['total'] > 0 else "N/A"
        if stats['legacy']['total'] > 0:
            l_rate = stats['legacy']['pass'] / stats['legacy']['total'] * 100
            l_str += f" ({l_rate:.0f}%)"

        print(f"{company:<40} {h_str:<20} {l_str:<20}")

    # 6. Hybrid vs Legacy Comparison
    print("6. HYBRID VS LEGACY COMPARISON")
    print("-" * 80)
    print(f"Hybrid advantage: +{hybrid_pass - legacy_pass} passes ({(hybrid_pass - legacy_pass)/hybrid_total*100:.1f}% improvement)" if hybrid_pass > legacy_pass else f"Legacy advantage: +{legacy_pass - hybrid_pass} passes ({(legacy_pass - hybrid_pass)/legacy_total*100:.1f}% improvement)")
    print()

    # Show content types where hybrid/legacy significantly differs
    print("Content types with >5% difference:")
    for kind in sorted(kind_stats.keys()):
        stats = kind_stats[kind]
        if stats['hybrid']['total'] > 0 and stats['legacy']['total'] > 0:
            h_rate = stats['hybrid']['pass'] / stats['hybrid']['total'] * 100
            l_rate = stats['legacy']['pass'] / stats['legacy']['total'] * 100
            diff = h_rate - l_rate
            if abs(diff) > 5:
                print(f"  {kind}: Hybrid {h_rate:.1f}% vs Legacy {l_rate:.1f}% (Δ {diff:+.1f}%)")

    print()

    # Show companies where hybrid/legacy significantly differs
    print("Companies with >20% difference:")
    for company in sorted(company_stats.keys()):
        stats = company_stats[company]
        if stats['hybrid']['total'] > 0 and stats['legacy']['total'] > 0:
            h_rate = stats['hybrid']['pass'] / stats['hybrid']['total'] * 100
            l_rate = stats['legacy']['pass'] / stats['legacy']['total'] * 100
            diff = h_rate - l_rate
            if abs(diff) > 20:
                print(f"  {company}: Hybrid {h_rate:.0f}% vs Legacy {l_rate:.0f}% (Δ {diff:+.0f}%)")

    print()
    print("=" * 80)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_results.py <results_file.json>")
        sys.exit(1)

    analyze_results(sys.argv[1])
