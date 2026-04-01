"""Normalize Notion interview-reference notes into local JSON records."""

from __future__ import annotations

from hashlib import md5
from html import unescape
import re


_SUMMARY_RE = re.compile(r"<summary>(.*?)</summary>")
_HEADING_RE = re.compile(r"^\s*###\s+(.+?)\s*$")
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"[ \t]+")
_INTERVIEW_KEYWORDS = (
    "面接",
    "自己紹介",
    "逆質問",
    "ガクチカ",
    "深堀",
    "志望理由",
    "志望動機",
    "研究",
    "就活の軸",
    "強み",
    "弱み",
    "価値観",
    "ob訪問",
    "obog",
)


def _normalize_inline_text(text: str) -> str:
    normalized = unescape(text)
    normalized = normalized.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    normalized = re.sub(r"\*\*(.*?)\*\*", r"\1", normalized)
    normalized = re.sub(r"<span[^>]*>(.*?)</span>", r"\1", normalized)
    normalized = normalized.replace("<empty-block/>", "")
    normalized = _TAG_RE.sub("", normalized)
    normalized = _WHITESPACE_RE.sub(" ", normalized)
    return normalized.strip()


def _flush_section(sections: list[dict[str, str]], title: str | None, lines: list[str]) -> None:
    if not title:
        return
    text = "\n".join(line for line in lines if line.strip())
    cleaned = _normalize_inline_text(text)
    if cleaned:
        sections.append({"title": _normalize_inline_text(title), "text": cleaned})


def extract_outline_sections(content: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    current_title: str | None = None
    current_lines: list[str] = []

    for raw_line in content.splitlines():
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


def classify_section_type(title: str) -> str:
    normalized = _normalize_inline_text(title).lower()

    if "逆質問" in normalized:
        return "reverse_questions"
    if "自己紹介" in normalized:
        return "self_intro"
    if "研究" in normalized:
        return "research"
    if "ガクチカ深堀" in normalized or ("ガクチカ" in normalized and "深" in normalized):
        return "gakuchika_followup"
    if "ガクチカ" in normalized or "学生時代に力を入れた" in normalized:
        return "gakuchika"
    if "志望理由" in normalized or "志望動機" in normalized:
        return "motivation"
    if "企業理解" in normalized or "他社比較" in normalized:
        return "company_fit"
    if (
        "パーソナル" in normalized
        or "自己分析" in normalized
        or "価値観" in normalized
        or "就活の軸" in normalized
        or "強み" in normalized
        or "弱み" in normalized
    ):
        return "personal"
    if (
        "面接対策" in normalized
        or "内定術" in normalized
        or "ob訪問" in normalized
        or "obog" in normalized
        or "フィードバック" in normalized
    ):
        return "interview_tips"
    return "other"


def _looks_interview_related(title: str, text: str) -> bool:
    joined = f"{title}\n{text}".lower()
    return any(keyword in joined for keyword in _INTERVIEW_KEYWORDS)


def _make_entry(page: dict, section_title: str, section_text: str) -> dict:
    seed = f"{page['source_page_id']}::{section_title}::{section_text[:120]}"
    return {
        "id": md5(seed.encode("utf-8")).hexdigest()[:16],
        "source_page_id": page["source_page_id"],
        "source_page_title": page["source_page_title"],
        "source_url": page["source_url"],
        "note_type": page["note_type"],
        "company_name": page.get("company_name"),
        "generic": bool(page.get("generic", False)),
        "section_type": classify_section_type(section_title),
        "section_title": _normalize_inline_text(section_title),
        "text": _normalize_inline_text(section_text),
        "matched_signals": list(page.get("matched_signals", [])),
        "is_company_specific": not bool(page.get("generic", False)),
    }


def build_reference_entries(page: dict) -> list[dict]:
    content = page.get("content", "") or ""
    outline_sections = extract_outline_sections(content)
    entries: list[dict] = []
    note_type = (page.get("note_type") or "").strip()

    for section in outline_sections:
        section_type = classify_section_type(section["title"])
        if note_type == "面接準備" or section_type != "other" or _looks_interview_related(
            section["title"], section["text"]
        ):
            entries.append(_make_entry(page, section["title"], section["text"]))

    if entries:
        return entries

    fallback_text = _normalize_inline_text(content)
    if not fallback_text:
        return []
    return [_make_entry(page, page["source_page_title"], fallback_text)]
