#!/usr/bin/env python3
"""Convert Notion page exports (/tmp/notion_pages.json) into reference JSONL files.

Usage:
    python backend/scripts/import_notion_references.py [--dry-run] [--input /tmp/notion_pages.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from hashlib import md5
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.prompts.reference_notes_importer import (
    build_corpus_entries,
    build_es_view_entries,
    extract_char_max,
    infer_reference_kind,
    normalize_inline_text,
)
from app.prompts.reference_interview_importer import (
    classify_section_type,
    extract_outline_sections as extract_interview_sections,
)

REFERENCE_DIR = ROOT / "app" / "reference"
ES_DIR = REFERENCE_DIR / "es_review"
INTERVIEW_DIR = REFERENCE_DIR / "interview"

SUPPORTED_ES_TYPES = {
    "gakuchika",
    "company_motivation",
    "self_pr",
    "intern_reason",
    "intern_goals",
    "work_values",
    "post_join_goals",
    "role_course_reason",
    "basic",
}

ES_KIND_TO_QUESTION_TYPE = {
    "company_motivation": "company_motivation",
    "gakuchika": "gakuchika",
    "self_pr": "self_pr",
    "post_join_goals": "post_join_goals",
    "role_reason": "role_course_reason",
    "work_values": "work_values",
    "industry_reason": "company_motivation",
    "motivation_fit": "company_motivation",
}

COMPANY_NAME_MAP = {
    "三井不動産": "mitsui_fudosan",
    "KPMG": "KPMG",
    "三菱UFJ": "mufg_digital",
    "三菱UFJデジタル": "mufg_digital",
    "JAL": "JAL",
    "PFN": "PFN",
    "三井物産": "mitsui_bussan",
    "東京海上": "tokio_marine",
    "東京海上日動": "tokio_marine",
    "三菱総合研究所": "mri",
    "三菱総研": "mri",
    "三菱地所": "mitsubishi_estate",
    "サイバーエージェント": "cyber_agent",
    "CA": "cyber_agent",
    "PKSHA": "pksha",
    "レバレジーズ": "leverages",
    "Cisco": "Cisco",
    "IBM": "IBM",
    "NTTデータ": "ntt_data",
    "みずほ": "mizuho",
    "みずほ銀行": "mizuho",
    "日立製作所": "hitachi",
    "富士通": "fujitsu",
    "アクセンチュア": "accenture",
    "デロイト": "deloitte",
    "野村総合研究所": "nri",
    "NRI": "nri",
    "CTC": "ctc",
    "P&G": "pg",
    "KIRIN": "kirin",
    "アサヒ": "asahi",
    "SanSan": "sansan",
    "キーエンス": "keyence",
    "三菱重工": "mhi",
    "NS": "ns",
    "disco": "disco",
    "三菱商事": "mitsubishi_shoji",
    "三井住友銀行": "smbc",
    "ゴールドマン・サックス": "goldman_sachs",
    "セールスフォース": "salesforce",
    "日本郵船": "nyk",
    "東急不動産": "tokyu_fudosan",
    "丸紅": "marubeni",
    "日本経済新聞社": "nikkei",
    "エムスリー": "m3",
    "住友不動産": "sumitomo_fudosan",
    "リクルート": "recruit",
    "サントリー": "suntory",
    "商船三井": "mol",
    "東京ガス": "tokyo_gas",
    "豊田通商": "toyota_tsusho",
    "JR東海": "jr_tokai",
    "三井住友海上": "ms_aioi",
    "東京建物": "tokyo_tatemono",
    "ホンダ": "honda",
    "NTT東日本": "ntt_east",
    "NTTドコモ": "ntt_docomo",
    "トヨタ自動車": "toyota",
    "日本総研": "jri",
    "KDDI": "kddi",
    "SONY": "sony",
    "SAP": "sap",
    "NEC": "nec",
    "Panasonic": "panasonic",
}

QUESTION_ACTION_PHRASES = (
    "教えてください",
    "述べてください",
    "記入してください",
    "お書きください",
    "ご記入",
    "答えてください",
)

_CHAR_MAX_RE = re.compile(r"(\d{2,4})\s*字")


def romanize_company(name: str) -> str:
    if not name:
        return "generic"
    if name in COMPANY_NAME_MAP:
        return COMPANY_NAME_MAP[name]
    ascii_name = unicodedata.normalize("NFKD", name)
    ascii_name = re.sub(r"[^\w\s-]", "", ascii_name)
    ascii_name = re.sub(r"[\s]+", "_", ascii_name).strip("_")
    return ascii_name.lower() or "unknown"


def make_es_id(company_ascii: str, question_type: str, seed: str) -> str:
    h = md5(seed.encode("utf-8")).hexdigest()[:8]
    return f"{company_ascii}_{question_type}_{h}"


def make_interview_id(company_ascii: str, category: str, seed: str) -> str:
    h = md5(seed.encode("utf-8")).hexdigest()[:8]
    return f"{company_ascii}_{category}_{h}"


def is_text_usable(text: str) -> bool:
    if len(text) < 20:
        return False
    if any(phrase in text for phrase in QUESTION_ACTION_PHRASES):
        return False
    return True


def classify_question_type_direct(question_text: str, answer_text: str) -> str | None:
    """Direct classification using broader keyword matching for Notion ES pages."""
    q = (question_text or "").lower().replace(" ", "")
    a = (answer_text or "").lower()

    if "自己pr" in q or "自己紹介" in q or "強み" in q or "あなたの長所" in q:
        return "self_pr"
    if "ガクチカ" in q or "学生時代に力を入れた" in q or "最も力を入れた" in q:
        return "gakuchika"
    if "成し遂げた" in q or "挑戦した" in q or "困難を乗り越えた" in q:
        return "gakuchika"
    if "メンバーと協力" in q or "チームで取り組" in q or "協働" in q:
        return "gakuchika"
    if "創意工夫" in q or "工夫して取り組" in q:
        return "gakuchika"
    if "最も努力" in q or "熱中した" in q or "リーダーシップを発揮" in q:
        return "gakuchika"
    if "モチベーション" in q or "やりがい" in q:
        return "gakuchika"
    if "力を入れて取り組" in q or "力を入れた取り組" in q:
        return "gakuchika"
    if "困難" in q or "逆境" in q or "粘り強く" in q:
        return "gakuchika"
    if "周囲を動かし" in q or "チームで行動" in q or "人を巻き込" in q:
        return "gakuchika"
    if "志望理由" in q or "志望動機" in q or "なぜ当社" in q or "応募した理由" in q or "応募いただいた動機" in q:
        return "company_motivation"
    if "入社後" in q or "将来" in q or "実現したいこと" in q or "キャリア" in q:
        return "post_join_goals"
    if "手掛けてみたい" in q or "やりたいこと" in q or "取り組みたい" in q:
        return "post_join_goals"
    if "就活の軸" in q or "仕事観" in q or "企業選びの基準" in q:
        return "work_values"
    if "職種" in q or "コース" in q or "なぜこの職種" in q:
        return "role_course_reason"
    if "ワークショップ" in q and ("参加" in q or "理由" in q or "志望" in q):
        return "intern_reason"
    if "インターン" in q and ("志望" in q or "動機" in q or "理由" in q or "期待" in q or "応募" in q):
        return "intern_reason"
    if "参加したい理由" in q or "応募した理由" in q or "選んだ理由" in q:
        return "intern_reason"
    if "インターン" in q and ("やってみたい" in q or "経験したい" in q or "目標" in q):
        return "intern_goals"
    if "習得したい" in q or "学びたい" in q or "身につけたい" in q:
        return "intern_goals"
    if "研究" in q and ("内容" in q or "テーマ" in q or "概要" in q):
        return "basic"
    if "開発経験" in q or "プログラミング" in q or "技術" in q:
        return "basic"
    if "没頭" in q or "興味" in q or "趣味" in q:
        return "basic"
    if "制作物" in q or "ポートフォリオ" in q or "成果物" in q:
        return "basic"
    return None


def process_es_page(page: dict) -> list[dict]:
    corpus = build_corpus_entries(page)
    results = []

    # First try the standard ES view pipeline
    es_view = build_es_view_entries(corpus)
    for item in es_view:
        text = item.get("text", "")
        if not is_text_usable(text):
            continue

        question_type = item.get("question_type", "")
        if question_type not in SUPPORTED_ES_TYPES:
            continue

        company_name = item.get("company_name") or page.get("company_name") or ""
        company_ascii = romanize_company(company_name)
        seed = f"{page['source_page_id']}::{item.get('source_question', '')}::{text[:160]}"

        char_max = item.get("char_max")
        if char_max is None:
            char_max = extract_char_max(item.get("source_question"))

        record = {
            "id": make_es_id(company_ascii, question_type, seed),
            "text": text,
            "question_type": question_type,
            "capture_kind": "full_text",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
            "source_provenance": "self_owned_reference_es",
            "char_max": char_max,
            "company_name": company_name,
            "title": item.get("title") or page.get("source_page_title", ""),
        }
        results.append(record)

    # Then try direct classification for entries missed by the standard pipeline
    seen_texts = {r["text"][:100] for r in results}
    for item in corpus:
        answer_text = item.get("answer_text", "")
        if answer_text[:100] in seen_texts:
            continue
        if not is_text_usable(answer_text):
            continue

        question_text = item.get("question_text", "")
        question_type = classify_question_type_direct(question_text, answer_text)
        if not question_type:
            continue
        if question_type not in SUPPORTED_ES_TYPES:
            continue

        company_name = item.get("company_name") or page.get("company_name") or ""
        company_ascii = romanize_company(company_name)
        seed = f"{page['source_page_id']}::{question_text}::{answer_text[:160]}"
        char_max = extract_char_max(question_text)

        record = {
            "id": make_es_id(company_ascii, question_type, seed),
            "text": answer_text,
            "question_type": question_type,
            "capture_kind": "full_text",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
            "source_provenance": "self_owned_reference_es",
            "char_max": char_max,
            "company_name": company_name,
            "title": page.get("source_page_title", ""),
        }
        results.append(record)
        seen_texts.add(answer_text[:100])

    return results


def process_interview_page(page: dict) -> list[dict]:
    corpus = build_corpus_entries(page)
    results = []

    for item in corpus:
        if "interview" not in item.get("feature_targets", []):
            continue
        question_text = item.get("question_text") or ""
        answer_text = item.get("answer_text") or ""
        if not question_text or not answer_text:
            continue
        if not is_text_usable(answer_text):
            continue

        company_name = item.get("company_name") or page.get("company_name") or ""
        company_ascii = romanize_company(company_name)
        reference_kind = item.get("reference_kind", "other")
        category = _map_interview_category(reference_kind)
        seed = f"{page['source_page_id']}::{question_text}::{answer_text[:160]}"

        record = {
            "id": make_interview_id(company_ascii, category, seed),
            "question": question_text,
            "answer": answer_text,
            "category": category,
            "company_name": company_name,
            "capture_kind": "full_text",
            "usage_consent": True,
            "anonymized": True,
            "anonymization_level": "self_owned",
            "source_provenance": "self_owned_reference_interview",
        }
        results.append(record)

    return results


def _map_interview_category(reference_kind: str) -> str:
    mapping = {
        "company_motivation": "company_motivation",
        "gakuchika": "gakuchika",
        "gakuchika_followup": "gakuchika_followup",
        "self_pr": "self_pr",
        "work_values": "work_values",
        "post_join_goals": "post_join_goals",
        "role_reason": "role_reason",
        "research": "research",
        "reverse_questions": "reverse_questions",
        "industry_reason": "industry_reason",
        "interview_tips": "other",
        "company_understanding": "company_motivation",
        "motivation_fit": "company_motivation",
        "personal": "self_pr",
    }
    return mapping.get(reference_kind, "other")


def write_es_jsonl(records: list[dict], dry_run: bool = False) -> dict[str, int]:
    by_type: dict[str, list[dict]] = {}
    for r in records:
        qt = r["question_type"]
        by_type.setdefault(qt, []).append(r)

    counts = {}
    for qt, items in sorted(by_type.items()):
        outdir = ES_DIR / qt
        outdir.mkdir(parents=True, exist_ok=True)
        outpath = outdir / "references.jsonl"
        counts[qt] = len(items)
        if not dry_run:
            with outpath.open("w", encoding="utf-8") as f:
                for item in items:
                    f.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    return counts


def write_interview_jsonl(records: list[dict], dry_run: bool = False) -> dict[str, int]:
    by_company: dict[str, list[dict]] = {}
    for r in records:
        company_ascii = romanize_company(r.get("company_name", ""))
        by_company.setdefault(company_ascii, []).append(r)

    counts = {}
    for company, items in sorted(by_company.items()):
        outdir = INTERVIEW_DIR / company
        outdir.mkdir(parents=True, exist_ok=True)
        outpath = outdir / "references.jsonl"
        counts[company] = len(items)
        if not dry_run:
            with outpath.open("w", encoding="utf-8") as f:
                for item in items:
                    f.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
    return counts


def main():
    parser = argparse.ArgumentParser(description="Import Notion pages into reference JSONL")
    parser.add_argument("--input", default="/tmp/notion_pages.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as f:
        pages = json.load(f)

    es_records = []
    interview_records = []
    skipped = []

    for page in pages:
        note_type = (page.get("note_type") or "").strip()
        if note_type == "ES":
            es = process_es_page(page)
            if not es:
                skipped.append({"page": page.get("source_page_title"), "reason": "no_es_entries"})
            es_records.extend(es)
        elif note_type in ("面接準備", "面接対策", "interview"):
            intv = process_interview_page(page)
            if not intv:
                skipped.append({"page": page.get("source_page_title"), "reason": "no_interview_qa"})
            interview_records.extend(intv)
        else:
            es = process_es_page(page)
            intv = process_interview_page(page)
            if es:
                es_records.extend(es)
            if intv:
                interview_records.extend(intv)
            if not es and not intv:
                skipped.append({"page": page.get("source_page_title"), "reason": "unclassified"})

    es_counts = write_es_jsonl(es_records, dry_run=args.dry_run)
    intv_counts = write_interview_jsonl(interview_records, dry_run=args.dry_run)

    print(json.dumps({
        "mode": "dry_run" if args.dry_run else "write",
        "es_total": len(es_records),
        "es_by_type": es_counts,
        "interview_total": len(interview_records),
        "interview_by_company": intv_counts,
        "skipped": skipped,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
