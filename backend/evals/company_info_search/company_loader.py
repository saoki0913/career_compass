"""Company loading and sampling logic for live search evaluation."""

from __future__ import annotations

import json
import random
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

from evals.company_info_search.config import SearchTestConfig


def _build_industry_map(mappings: dict) -> dict[str, str]:
    """Parse _section_XX markers in mappings to build company -> industry map.

    Section markers follow the pattern:
      "_section_01": "=== 商社 ==="
    Companies between _section_01 and _section_02 belong to "商社".
    """
    industry_map: dict[str, str] = {}
    current_industry: str | None = None

    for key, value in mappings.items():
        if key.startswith("_section_") and isinstance(value, str):
            label = value.strip().strip("=").strip()
            current_industry = label if label else None
            continue
        if key.startswith("_"):
            continue
        if current_industry and isinstance(key, str) and key:
            industry_map[key] = current_industry

    return industry_map


def _load_company_sample_by_industry(
    mappings_path: Path,
    total_sample_size: int,
    seed: int,
    per_industry_min: int = 1,
) -> tuple[list[str], dict[str, str]]:
    """Sample companies with industry coverage guarantee."""
    raw = json.loads(mappings_path.read_text(encoding="utf-8"))
    mappings = raw.get("mappings") if isinstance(raw, dict) else None
    if not isinstance(mappings, dict):
        return [], {}

    industry_map = _build_industry_map(mappings)

    by_industry: dict[str, list[str]] = {}
    for name, industry in industry_map.items():
        by_industry.setdefault(industry, []).append(name)

    rng = random.Random(seed)
    sampled: list[str] = []
    sampled_set: set[str] = set()

    for industry in sorted(by_industry.keys()):
        companies = by_industry[industry]
        k = min(per_industry_min, len(companies))
        chosen = rng.sample(companies, k)
        for c in chosen:
            if c not in sampled_set:
                sampled.append(c)
                sampled_set.add(c)

    remaining = total_sample_size - len(sampled)
    if remaining > 0:
        pool = [name for name in industry_map if name not in sampled_set]
        rng.shuffle(pool)
        for c in pool[:remaining]:
            sampled.append(c)
            sampled_set.add(c)

    sampled_industry = {c: industry_map[c] for c in sampled if c in industry_map}
    return sampled, sampled_industry


def _load_curated_companies(
    fixtures_path: Path,
) -> tuple[list[str], dict[str, str], int]:
    """Load the curated company list from fixtures.

    Returns (company_names, company_industry_map, version).
    """
    curated_path = fixtures_path / "popular_companies_300.json"
    if not curated_path.exists():
        return [], {}, 0

    raw = json.loads(curated_path.read_text(encoding="utf-8"))
    companies_data = raw.get("companies", [])
    version = raw.get("_version", 0)

    names = [c["name"] for c in companies_data]
    industry_map = {c["name"]: c["industry"] for c in companies_data}

    return names, industry_map, version


def _sample_from_list(
    companies: list[str],
    industry_map: dict[str, str],
    sample_size: int,
    seed: int,
    per_industry_min: int = 1,
) -> tuple[list[str], dict[str, str]]:
    """Industry-aware sampling from a pre-loaded company list."""
    by_industry: dict[str, list[str]] = {}
    for name in companies:
        ind = industry_map.get(name, "unknown")
        by_industry.setdefault(ind, []).append(name)

    rng = random.Random(seed)
    sampled: list[str] = []
    sampled_set: set[str] = set()

    for industry in sorted(by_industry.keys()):
        pool = by_industry[industry]
        k = min(per_industry_min, len(pool))
        chosen = rng.sample(pool, k)
        for c in chosen:
            if c not in sampled_set:
                sampled.append(c)
                sampled_set.add(c)

    remaining = sample_size - len(sampled)
    if remaining > 0:
        extras = [n for n in companies if n not in sampled_set]
        rng.shuffle(extras)
        for c in extras[:remaining]:
            sampled.append(c)
            sampled_set.add(c)

    sampled_industry = {c: industry_map[c] for c in sampled if c in industry_map}
    return sampled, sampled_industry


class CompanyLoader:
    """Load companies based on config (curated / random / override)."""

    def __init__(self, config: SearchTestConfig, backend_root: Path):
        self.config = config
        self.backend_root = backend_root

    def load(self) -> tuple[list[str], dict[str, str], str, int]:
        """Load companies and their industry map.

        Returns:
            (companies, industry_map, company_source, curated_version)
        """
        mappings_path = self.backend_root / "data" / "company_mappings.json"
        fixtures_path = self.backend_root / "evals" / "company_info_search" / "fixtures"

        curated_version = 0
        company_source = "unknown"

        if self.config.companies_override:
            override_list = [
                c.strip()
                for c in self.config.companies_override.split(",")
                if c.strip()
            ]
            if override_list:
                raw_mappings = json.loads(mappings_path.read_text(encoding="utf-8"))
                full_industry_map = _build_industry_map(
                    raw_mappings.get("mappings", {})
                    if isinstance(raw_mappings, dict)
                    else {}
                )
                companies = override_list
                industry_map = {
                    c: full_industry_map.get(c, "unknown") for c in companies
                }
                return companies, industry_map, "override", 0

        if self.config.company_source == "curated":
            companies, industry_map, curated_version = _load_curated_companies(
                fixtures_path
            )
            if companies:
                total = len(companies)
                if self.config.sample_size < total:
                    companies, industry_map = _sample_from_list(
                        companies,
                        industry_map,
                        self.config.sample_size,
                        self.config.sample_seed,
                        self.config.per_industry_min,
                    )
                sys.__stdout__.write(
                    f"[live-search] Using curated list v{curated_version} "
                    f"({len(companies)}/{total} companies)\n"
                )
                return companies, industry_map, "curated", curated_version
            else:
                sys.__stdout__.write(
                    "[live-search] WARNING: Curated list not found, "
                    "falling back to random sampling\n"
                )

        # Random sampling (fallback or explicit)
        companies, industry_map = _load_company_sample_by_industry(
            mappings_path=mappings_path,
            total_sample_size=self.config.sample_size,
            seed=self.config.sample_seed,
            per_industry_min=self.config.per_industry_min,
        )
        company_source = f"random_seed{self.config.sample_seed}"
        return companies, industry_map, company_source, 0

    @staticmethod
    def log_industry_coverage(
        companies: list[str],
        industry_map: dict[str, str],
    ) -> None:
        """Log industry distribution to stdout."""
        industry_counts: Counter[str] = Counter()
        for c in companies:
            industry_counts[industry_map.get(c, "unknown")] += 1
        sys.__stdout__.write(
            f"[live-search] Industry coverage: {dict(industry_counts)}\n"
        )
        sys.__stdout__.flush()
