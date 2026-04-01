"""Shared reference-note extraction for ES / gakuchika / motivation / interview."""

from __future__ import annotations

from hashlib import md5
from html import unescape
from typing import Iterable
import re


_SUMMARY_RE = re.compile(r"<summary>(.*?)</summary>")
_HEADING_RE = re.compile(r"^\s*###\s+(.+?)\s*$")
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"[ \t]+")
_QUESTION_LINE_RE = re.compile(r"^\s*(?:[-*]\s*)?(?:\*\*)?(?:Q|質問)\s*[：:]\s*(.+?)\s*(?:\*\*)?\s*$")
_ANSWER_LINE_RE = re.compile(r"^\s*(?:[-*]\s*)?(?:\*\*)?(?:A|回答)\s*[：:]\s*(.+?)\s*(?:\*\*)?\s*$")
_CHAR_MAX_RE = re.compile(r"(\d{2,4})\s*字")

ES_KIND_MAP: dict[str, str] = {
    "company_motivation": "company_motivation",
    "gakuchika": "gakuchika",
    "self_pr": "self_pr",
    "post_join_goals": "post_join_goals",
    "role_reason": "role_course_reason",
    "work_values": "work_values",
}


def normalize_inline_text(text: str) -> str:
    normalized = unescape(text or "")
    normalized = normalized.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    normalized = re.sub(r"<span[^>]*>(.*?)</span>", r"\1", normalized)
    normalized = normalized.replace("<empty-block/>", "")
    normalized = _TAG_RE.sub("", normalized)
    normalized = _WHITESPACE_RE.sub(" ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _flush_section(sections: list[dict[str, str]], title: str | None, lines: list[str]) -> None:
    if not title:
        return
    text = "\n".join(line for line in lines if line.strip())
    cleaned = normalize_inline_text(text)
    if cleaned:
        sections.append({"title": normalize_inline_text(title), "text": cleaned})


def extract_outline_sections(content: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for raw_line in (content or "").splitlines():
        heading_match = _HEADING_RE.match(raw_line)
        summary_match = _SUMMARY_RE.search(raw_line)
        if heading_match:
            _flush_section(sections, current_title, current_lines)
            current_title = heading_match.group(1)
            current_lines = []
            continue
        if summary_match:
            _flush_section(sections, current_title, current_lines)
            current_title = summary_match.group(1)
            current_lines = []
            continue
        if current_title:
            current_lines.append(raw_line)

    _flush_section(sections, current_title, current_lines)
    return sections


def infer_reference_kind(
    question_text: str | None,
    answer_text: str,
    note_type: str | None = None,
    section_title: str | None = None,
) -> str:
    joined = normalize_inline_text(
        "\n".join(part for part in (section_title or "", question_text or "", answer_text, note_type or "") if part)
    ).lower()
    primary = normalize_inline_text("\n".join(part for part in (section_title or "", question_text or "") if part)).lower()

    if "逆質問" in joined:
        return "reverse_questions"
    if "志望理由" in primary or "志望動機" in primary or "なぜ当社" in primary or "なぜ弊社" in primary:
        return "company_motivation"
    if "企業理解" in joined or "他社比較" in joined:
        return "company_understanding"
    if "就活の軸" in primary or "仕事観" in primary or "価値観" in primary or "企業に求めるもの" in primary:
        return "work_values"
    if "業界志望" in joined or "なぜこの業界" in joined or "金融業界" in joined or "it業界" in joined:
        return "industry_reason"
    if "職種" in joined or "itスペシャリスト" in joined or "コース" in joined or "role" in joined:
        return "role_reason"
    if "入社後" in joined or "将来" in joined or "長期的に何をやってみたい" in joined:
        return "post_join_goals"
    if "ガクチカ深" in joined or ("ガクチカ" in joined and "深" in joined):
        return "gakuchika_followup"
    if "学生時代に力を入れた" in joined or "ガクチカ" in joined or "最も力を入れた" in joined:
        return "gakuchika"
    if "自己pr" in primary or "自己紹介" in primary or "強みが発揮" in primary or "強み・弱み" in primary:
        return "self_pr"
    if "研究" in primary or ("研究" in joined and "志望" not in primary):
        return "research"
    if "適合" in joined or "初期貢献" in joined or "貢献" in joined:
        return "motivation_fit"
    if "面接" in joined or "ob訪問" in joined or "obog" in joined or "内定術" in joined:
        return "interview_tips"
    if note_type and note_type.strip() == "自己分析":
        return "personal"
    return "other"


def infer_feature_targets(reference_kind: str) -> list[str]:
    mapping = {
        "company_motivation": ["es_review", "motivation", "interview"],
        "industry_reason": ["motivation", "interview"],
        "role_reason": ["es_review", "motivation", "interview"],
        "post_join_goals": ["es_review", "motivation", "interview"],
        "work_values": ["es_review", "motivation", "interview"],
        "gakuchika": ["es_review", "gakuchika", "interview"],
        "gakuchika_followup": ["gakuchika", "interview"],
        "self_pr": ["es_review", "gakuchika", "interview"],
        "research": ["motivation", "interview"],
        "personal": ["gakuchika", "motivation", "interview"],
        "company_understanding": ["motivation", "interview"],
        "motivation_fit": ["motivation", "interview"],
        "reverse_questions": ["interview"],
        "interview_tips": ["es_review", "gakuchika", "motivation", "interview"],
        "other": [],
    }
    return mapping.get(reference_kind, [])


def _make_entry(
    page: dict,
    *,
    question_text: str | None,
    answer_text: str,
    extraction_unit: str,
) -> dict:
    normalized_question = normalize_inline_text(question_text or "")
    normalized_answer = normalize_inline_text(answer_text)
    reference_kind = infer_reference_kind(normalized_question or None, normalized_answer, page.get("note_type"))
    seed = f"{page['source_page_id']}::{normalized_question}::{normalized_answer[:160]}"

    return {
        "id": md5(seed.encode("utf-8")).hexdigest()[:16],
        "source_page_id": page["source_page_id"],
        "source_page_title": page["source_page_title"],
        "source_url": page["source_url"],
        "note_type": page["note_type"],
        "company_name": page.get("company_name"),
        "is_company_specific": bool(page.get("is_company_specific", False)),
        "question_text": normalized_question or None,
        "answer_text": normalized_answer,
        "extraction_unit": extraction_unit,
        "reference_kind": reference_kind,
        "feature_targets": infer_feature_targets(reference_kind),
        "matched_signals": list(page.get("matched_signals", [])),
        "capture_kind": page.get("capture_kind", "full_excerpt"),
        "char_max": None,
    }


def _extract_explicit_qa(section_text: str) -> tuple[str | None, str | None]:
    question_parts: list[str] = []
    answer_parts: list[str] = []

    for raw_line in (section_text or "").splitlines():
        question_match = _QUESTION_LINE_RE.match(raw_line)
        answer_match = _ANSWER_LINE_RE.match(raw_line)
        if question_match:
            question_parts.append(question_match.group(1).strip())
            continue
        if answer_match:
            answer_parts.append(answer_match.group(1).strip())
            continue
        if answer_parts and raw_line.strip():
            answer_parts.append(raw_line.strip())

    question = normalize_inline_text("\n".join(question_parts)) or None
    answer = normalize_inline_text("\n".join(answer_parts)) or None
    return question, answer


def extract_reference_units(content: str) -> list[dict[str, str | None]]:
    units: list[dict[str, str | None]] = []
    for section in extract_outline_sections(content):
        question_text, answer_text = _extract_explicit_qa(section["text"])
        if question_text and answer_text:
            units.append(
                {
                    "question_text": question_text,
                    "answer_text": answer_text,
                    "section_title": section["title"],
                    "extraction_unit": "qa_pair",
                }
            )
            continue
        cleaned_text = normalize_inline_text(section["text"])
        if cleaned_text:
            units.append(
                {
                    "question_text": section["title"],
                    "answer_text": cleaned_text,
                    "section_title": section["title"],
                    "extraction_unit": "standalone_answer",
                }
            )
    return units


def extract_char_max(question_text: str | None) -> int | None:
    if not question_text:
        return None
    match = _CHAR_MAX_RE.search(question_text)
    if not match:
        return None
    return int(match.group(1))


def build_corpus_entries(page: dict) -> list[dict]:
    content = page.get("content", "") or ""
    units = extract_reference_units(content)
    if not units:
        fallback_text = normalize_inline_text(content)
        if not fallback_text:
            return []
        return [
            _make_entry(
                page,
                question_text=page.get("source_page_title"),
                answer_text=fallback_text,
                extraction_unit="standalone_answer",
            )
        ]

    entries: list[dict] = []
    for unit in units:
        question_text = unit.get("question_text")
        answer_text = unit.get("answer_text")
        if not answer_text:
            continue
        entry = _make_entry(
            page,
            question_text=question_text,
            answer_text=answer_text,
            extraction_unit=str(unit["extraction_unit"]),
        )
        entry["reference_kind"] = infer_reference_kind(
            question_text=question_text,
            answer_text=answer_text,
            note_type=page.get("note_type"),
            section_title=unit.get("section_title"),
        )
        entry["feature_targets"] = infer_feature_targets(entry["reference_kind"])
        entry["char_max"] = extract_char_max(question_text)
        entries.append(entry)
    return entries


def build_es_view_entries(corpus_entries: Iterable[dict]) -> list[dict]:
    entries: list[dict] = []
    seen: set[tuple[str, str | None, str]] = set()

    for item in corpus_entries:
        question_type = ES_KIND_MAP.get(item.get("reference_kind", ""))
        if not question_type:
            continue
        key = (question_type, item.get("company_name"), item.get("answer_text", ""))
        if key in seen:
            continue
        seen.add(key)
        entries.append(
            {
                "id": f"notes_{item['id']}",
                "question_type": question_type,
                "company_name": item.get("company_name"),
                "char_max": item.get("char_max"),
                "title": item.get("source_page_title") or item.get("question_text") or question_type,
                "text": item.get("answer_text", ""),
                "source_question": item.get("question_text"),
                "source_page_id": item.get("source_page_id"),
                "source_url": item.get("source_url"),
                "capture_kind": item.get("capture_kind", "full_excerpt"),
            }
        )
    return entries


def build_feature_view_entries(corpus_entries: Iterable[dict], target: str) -> list[dict]:
    return [item for item in corpus_entries if target in item.get("feature_targets", [])]
