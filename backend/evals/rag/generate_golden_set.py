#!/usr/bin/env python3
"""Generate golden evaluation JSONL candidates from tenant-aware BM25 data."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

DEFAULT_BM25_DIR = ROOT / "data" / "bm25"
DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parent / "golden" / "company_info_v1.jsonl"

QUERY_TEMPLATES: dict[str, list[tuple[str, str, str]]] = {
    "new_grad_recruitment": [
        ("{company}の新卒採用情報", "fact-lookup", "easy"),
        ("{company}の新卒採用で重視される人物像は？", "single-hop", "medium"),
        ("{company}の採用情報をESの志望理由にどう接続できる？", "reasoning", "hard"),
    ],
    "corporate_site": [
        ("{company}の企業概要", "fact-lookup", "easy"),
        ("{company}の事業内容を就活生向けに要約して", "single-hop", "medium"),
        ("{company}の事業特徴と自分の経験をどう結びつける？", "reasoning", "hard"),
    ],
    "ir_materials": [
        ("{company}のIR情報 決算", "fact-lookup", "easy"),
        ("{company}の成長領域や重点投資は？", "multi-hop", "medium"),
        ("{company}のIR情報から志望動機に使える論点は？", "reasoning", "hard"),
    ],
    "ceo_message": [
        ("{company}の社長メッセージ", "fact-lookup", "easy"),
        ("{company}のトップメッセージで強調される価値観は？", "single-hop", "medium"),
        ("{company}の経営メッセージを自己PRにどう反映できる？", "reasoning", "hard"),
    ],
    "employee_interviews": [
        ("{company}の社員インタビュー", "fact-lookup", "easy"),
        ("{company}で働く人の雰囲気や挑戦機会は？", "single-hop", "medium"),
        ("{company}の社員インタビューから職種理解を深めたい", "conversational", "medium"),
    ],
    "csr_sustainability": [
        ("{company}のCSR サステナビリティ", "fact-lookup", "easy"),
        ("{company}の社会課題への向き合い方は？", "single-hop", "medium"),
        ("{company}のサステナビリティ活動を志望動機に使える？", "reasoning", "hard"),
    ],
    "midterm_plan": [
        ("{company}の中期経営計画", "fact-lookup", "easy"),
        ("{company}の中期計画で示される重点領域は？", "multi-hop", "medium"),
        ("{company}の中期計画と自分の将来像をどう接続する？", "reasoning", "hard"),
    ],
    "press_release": [
        ("{company}のプレスリリース ニュース", "fact-lookup", "easy"),
        ("{company}の最近の取り組みでESに使える材料は？", "multi-hop", "medium"),
        ("{company}のニュースから企業理解を深めたい", "conversational", "medium"),
    ],
    "midcareer_recruitment": [
        ("{company}の中途採用情報", "fact-lookup", "easy"),
        ("{company}の職種別に求められる経験や力は？", "single-hop", "medium"),
        ("{company}の職種理解を志望理由にどうつなげる？", "reasoning", "hard"),
    ],
    "corporate_general": [
        ("{company}の会社情報", "fact-lookup", "easy"),
        ("{company}の特徴を面接前に確認したい", "conversational", "medium"),
    ],
    "corporate_ir": [
        ("{company}の投資家向け情報", "fact-lookup", "easy"),
        ("{company}の事業戦略をIRから読み取りたい", "multi-hop", "medium"),
    ],
}

QUERY_TYPES = {"single-hop", "multi-hop", "reasoning", "conversational", "fact-lookup"}
DIFFICULTIES = {"easy", "medium", "hard"}
TENANT_KEY_LENGTH = 32
TARGET_TOTAL = 50
MIN_DOCS = 5
MIN_CONTENT_TYPES = 2
MAX_QUERIES_PER_COMPANY = 8
MAX_GOLD_SOURCES = 3
TENANT_SCOPED_FILENAME_RE = re.compile(r"^(?P<tenant_key>[0-9a-f]{32})__(?P<company_id>.+)$")


def _parse_tenant_scoped_filename(path: Path) -> tuple[str, str] | None:
    match = TENANT_SCOPED_FILENAME_RE.fullmatch(path.stem)
    if not match:
        return None
    return match.group("tenant_key"), match.group("company_id")


def load_bm25_files(
    bm25_dir: Path = DEFAULT_BM25_DIR,
    *,
    min_docs: int = MIN_DOCS,
    min_content_types: int = MIN_CONTENT_TYPES,
) -> dict[str, dict[str, Any]]:
    companies: dict[str, dict[str, Any]] = {}
    for path in sorted(bm25_dir.glob("*.json")):
        parsed_name = _parse_tenant_scoped_filename(path)
        if parsed_name is None:
            continue
        tenant_key, path_company_id = parsed_name
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        company_id = data.get("company_id")
        docs = data.get("documents") or []
        if not company_id or company_id != path_company_id or not docs or "version" not in data:
            continue

        name = ""
        content_types: dict[str, set[str]] = defaultdict(set)
        for doc in docs:
            metadata = doc.get("metadata") or {}
            if not name and isinstance(metadata.get("company_name"), str):
                name = metadata["company_name"]
            content_type = metadata.get("content_type")
            source_url = metadata.get("source_url")
            if isinstance(content_type, str) and isinstance(source_url, str) and source_url:
                content_types[content_type].add(source_url)

        if not name or len(docs) < min_docs or len(content_types) < min_content_types:
            continue

        existing_key = next((key for key, value in companies.items() if value["name"] == name), None)
        if existing_key is not None and companies[existing_key]["num_docs"] >= len(docs):
            continue
        if existing_key is not None:
            del companies[existing_key]

        companies[company_id] = {
            "tenant_key": tenant_key,
            "name": name,
            "num_docs": len(docs),
            "content_types": {content_type: sorted(urls) for content_type, urls in content_types.items()},
        }

    return companies


def _query_id(company_id: str, content_type: str, template_index: int) -> str:
    safe_company = re.sub(r"[^a-zA-Z0-9_-]+", "-", company_id).strip("-")
    return f"company-info-{safe_company}-{content_type}-{template_index + 1:02d}"


def generate_queries(
    companies: dict[str, dict[str, Any]],
    *,
    target_total: int = TARGET_TOTAL,
    max_queries_per_company: int = MAX_QUERIES_PER_COMPANY,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    ranked = sorted(companies.items(), key=lambda item: (-item[1]["num_docs"], item[1]["name"]))

    for company_id, info in ranked:
        per_company_count = 0
        content_types = sorted(info["content_types"].items())
        for content_type, urls in content_types:
            templates = QUERY_TEMPLATES.get(content_type)
            if not templates:
                continue
            for template_index, (template, query_type, difficulty) in enumerate(templates):
                if per_company_count >= max_queries_per_company or len(items) >= target_total:
                    break
                query = template.format(company=info["name"])
                items.append(
                    {
                        "query_id": _query_id(company_id, content_type, template_index),
                        "company_id": company_id,
                        "tenant_key": info["tenant_key"],
                        "query": query,
                        "query_type": query_type,
                        "difficulty": difficulty,
                        "gold_sources": urls[:MAX_GOLD_SOURCES],
                        "metadata": {
                            "company_name": info["name"],
                            "target_content_type": content_type,
                            "source": "auto_bm25",
                            "review_status": "candidate",
                        },
                    }
                )
                per_company_count += 1
            if per_company_count >= max_queries_per_company or len(items) >= target_total:
                break
        if len(items) >= target_total:
            break

    return items


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate RAG golden JSONL candidates from BM25 files")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_BM25_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--target-total", type=int, default=TARGET_TOTAL)
    parser.add_argument("--max-queries-per-company", type=int, default=MAX_QUERIES_PER_COMPANY)
    parser.add_argument("--min-docs", type=int, default=MIN_DOCS)
    parser.add_argument("--min-content-types", type=int, default=MIN_CONTENT_TYPES)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    companies = load_bm25_files(
        args.input_dir,
        min_docs=args.min_docs,
        min_content_types=args.min_content_types,
    )
    print(
        f"Found {len(companies)} qualifying tenant-aware companies "
        f"(>={args.min_docs} docs, >={args.min_content_types} types)"
    )

    items = generate_queries(
        companies,
        target_total=args.target_total,
        max_queries_per_company=args.max_queries_per_company,
    )
    print(f"Generated {len(items)} golden candidates")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Written to {args.output}")
    for item in items:
        metadata = item["metadata"]
        print(f"  {metadata['company_name']:20s} [{metadata['target_content_type']}] {item['query']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
