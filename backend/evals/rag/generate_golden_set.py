#!/usr/bin/env python3
"""Generate golden evaluation JSONL from local BM25 data files."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

BM25_DIR = ROOT / "data" / "bm25"
OUTPUT_DIR = Path(__file__).resolve().parent / "golden"

QUERY_TEMPLATES: dict[str, list[str]] = {
    "new_grad_recruitment": ["{company}の新卒採用情報"],
    "corporate_site": ["{company}の企業概要"],
    "ir_materials": ["{company}のIR情報 決算"],
    "ceo_message": ["{company}の社長メッセージ"],
    "employee_interviews": ["{company}の社員インタビュー"],
    "csr_sustainability": ["{company}のCSR サステナビリティ"],
    "midterm_plan": ["{company}の中期経営計画"],
    "press_release": ["{company}のプレスリリース ニュース"],
    "midcareer_recruitment": ["{company}の中途採用情報"],
    "corporate_general": ["{company}の会社情報"],
    "corporate_ir": ["{company}の投資家向け情報"],
}

MIN_DOCS = 5
MIN_CONTENT_TYPES = 2
MAX_QUERIES_PER_COMPANY = 3
TARGET_TOTAL = 20


def _load_bm25_files() -> dict[str, dict]:
    companies: dict[str, dict] = {}
    for path in sorted(BM25_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        cid = data.get("company_id")
        docs = data.get("documents") or []
        if not cid or not docs or "version" not in data:
            continue
        if cid in companies:
            continue

        name = None
        content_types: dict[str, set[str]] = defaultdict(set)
        for doc in docs:
            meta = doc.get("metadata") or {}
            if not name and meta.get("company_name"):
                name = meta["company_name"]
            ct = meta.get("content_type", "")
            src = meta.get("source_url", "")
            if ct and src:
                content_types[ct].add(src)

        if name and len(docs) >= MIN_DOCS and len(content_types) >= MIN_CONTENT_TYPES:
            existing = next(
                (v for v in companies.values() if v["name"] == name), None
            )
            if existing and existing["num_docs"] >= len(docs):
                continue
            if existing:
                companies = {k: v for k, v in companies.items() if v["name"] != name}
            companies[cid] = {
                "name": name,
                "num_docs": len(docs),
                "content_types": {ct: sorted(urls) for ct, urls in content_types.items()},
            }

    return companies


def _generate_queries(companies: dict[str, dict]) -> list[dict]:
    items: list[dict] = []

    ranked = sorted(companies.items(), key=lambda x: -x[1]["num_docs"])

    for cid, info in ranked:
        count = 0
        for ct, urls in sorted(info["content_types"].items()):
            if count >= MAX_QUERIES_PER_COMPANY:
                break
            templates = QUERY_TEMPLATES.get(ct)
            if not templates:
                continue

            query = templates[0].format(company=info["name"])
            items.append({
                "company_id": cid,
                "query": query,
                "gold_sources": urls[:3],
                "metadata": {
                    "company_name": info["name"],
                    "target_content_type": ct,
                    "source": "auto_bm25",
                },
            })
            count += 1

        if len(items) >= TARGET_TOTAL:
            break

    return items[:TARGET_TOTAL]


def main() -> int:
    companies = _load_bm25_files()
    print(f"Found {len(companies)} qualifying companies (>={MIN_DOCS} docs, >={MIN_CONTENT_TYPES} types)")

    items = _generate_queries(companies)
    print(f"Generated {len(items)} golden queries")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "company_info_v1.jsonl"
    with output_path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Written to {output_path}")

    for item in items:
        meta = item["metadata"]
        print(f"  {meta['company_name']:20s} [{meta['target_content_type']}] {item['query']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
