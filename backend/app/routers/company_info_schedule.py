"""Schedule extraction helpers for company info router."""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.routers.company_info_search import (
    _classify_company_relation,
    _get_source_type,
    _normalize_recruitment_source_type,
    _score_to_confidence,
)
from app.utils.web_search import COMPANY_QUERY_ALIASES

SCHEDULE_FOLLOW_LINK_KEYWORDS = (
    ("締切", 6),
    ("エントリー", 5),
    ("entry", 5),
    ("募集要項", 5),
    ("応募要項", 5),
    ("application", 4),
    ("guideline", 4),
    ("schedule", 4),
    ("選考", 4),
    ("flow", 3),
    ("マイページ", 3),
    ("mypage", 3),
    ("要項", 3),
)
SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS = {
    "privacy", "policy", "news", "ir", "investor", "company", "about", "faq",
    "contact", "sitemap", "terms", "legal", "mypage", "login", "signin", "account",
}
SCHEDULE_MAX_FOLLOW_LINKS = 1
SCHEDULE_MAX_PDF_FOLLOW_LINKS = 1
SCHEDULE_MAX_OCR_CALLS = 1
SCHEDULE_MIN_TEXT_CHARS = 40
SCHEDULE_HTML_EXTRACT_MAX_CHARS = 8192
SCHEDULE_LLM_TEXT_MAX_CHARS = 6000
SCHEDULE_LLM_FALLBACK_MAX_CHARS = 4500
SCHEDULE_LLM_TEXT_CONTEXT_LINES = 2
SCHEDULE_EXTREME_PAGE_CHARS = 80_000
SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME = 4000
SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME = 3200
SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME = 3
SCHEDULE_EXTREME_TAIL_LINES = 400
SCHEDULE_LLM_MAX_OUTPUT_TOKENS = 1500
_SCHEDULE_FOLLOW_KW = tuple(k for k, _ in SCHEDULE_FOLLOW_LINK_KEYWORDS)
SCHEDULE_CONTENT_KEYWORDS: tuple[str, ...] = tuple(
    dict.fromkeys(
        _SCHEDULE_FOLLOW_KW
        + (
            "書類", "提出", "提出物", "エントリーシート", "webテスト", "適性検査", "適性", "面接",
            "説明会", "内定", "内定承諾", "スケジュール", "日程", "新卒", "採用", "本選考",
            "一次", "二次", "三次", "試験", "応募方法", "選考フロー", "通過", "合格",
            "deadline", "application", "recruitment",
        )
    )
)
_SCHEDULE_DATE_LINE_HINT_RE = re.compile(
    r"(?:\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{4}\s*[-/／]\s*\d{1,2}\s*[-/／]\s*\d{1,2})"
)


def _schedule_text_chunk_matches_keyword(chunk: str) -> bool:
    stripped = chunk.strip()
    if not stripped:
        return False
    lower = stripped.lower()
    for kw in SCHEDULE_CONTENT_KEYWORDS:
        if kw.isascii():
            if kw in lower:
                return True
        elif kw in stripped:
            return True
    return False


def _schedule_line_signals_schedule_content(line: str, *, extreme_page: bool) -> bool:
    if _schedule_text_chunk_matches_keyword(line):
        return True
    if extreme_page and _SCHEDULE_DATE_LINE_HINT_RE.search(line):
        return True
    return False


def _compress_schedule_page_text_for_llm(text: str) -> str:
    if not text:
        return text
    text = text.strip()
    if not text:
        return text
    extreme = len(text) > SCHEDULE_EXTREME_PAGE_CHARS
    max_chars = SCHEDULE_LLM_TEXT_MAX_CHARS_EXTREME if extreme else SCHEDULE_LLM_TEXT_MAX_CHARS
    fallback_chars = SCHEDULE_LLM_FALLBACK_MAX_CHARS_EXTREME if extreme else SCHEDULE_LLM_FALLBACK_MAX_CHARS
    ctx = SCHEDULE_LLM_TEXT_CONTEXT_LINES_EXTREME if extreme else SCHEDULE_LLM_TEXT_CONTEXT_LINES

    lines = text.split("\n")
    n = len(lines)
    hit = [False] * n
    for i, line in enumerate(lines):
        if _schedule_line_signals_schedule_content(line, extreme_page=extreme):
            hit[i] = True

    if any(hit):
        take = [False] * n
        for i in range(n):
            if not hit[i]:
                continue
            lo = max(0, i - ctx)
            hi = min(n, i + ctx + 1)
            for j in range(lo, hi):
                take[j] = True
        merged = "\n".join(lines[i] for i in range(n) if take[i])
    else:
        paras = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
        selected = [p for p in paras if _schedule_line_signals_schedule_content(p, extreme_page=extreme)]
        if not selected:
            if extreme:
                tail = "\n".join(lines[-min(SCHEDULE_EXTREME_TAIL_LINES, n):]).strip()
                return (tail[:fallback_chars] if tail else "")[:fallback_chars]
            return text[:fallback_chars]
        merged = "\n\n".join(selected)

    if not merged.strip():
        if extreme:
            tail = "\n".join(lines[-min(SCHEDULE_EXTREME_TAIL_LINES, n):]).strip()
            return (tail[:fallback_chars] if tail else "")[:fallback_chars]
        return text[:fallback_chars]
    return merged[:max_chars] if len(merged) > max_chars else merged


def _build_schedule_source_metadata(
    url: str,
    company_name: str | None,
    page_text: str,
    graduation_year: int | None,
    *,
    get_graduation_year=None,
    detect_other_graduation_years=None,
) -> dict[str, str | bool | int | None]:
    get_graduation_year = get_graduation_year or _default_get_graduation_year
    detect_other_graduation_years = (
        detect_other_graduation_years or _default_detect_other_graduation_years
    )
    used_graduation_year = graduation_year or get_graduation_year()
    relation = (
        _classify_company_relation(url, company_name)
        if company_name
        else {"source_type": "other", "relation_company_name": None, "is_official": False, "is_parent": False, "is_subsidiary": False}
    )
    source_type = _normalize_recruitment_source_type(url, None, relation)
    other_years = detect_other_graduation_years(url, "", (page_text or "")[:8000], used_graduation_year)
    year_matched = not bool(other_years)
    return {
        "source_type": source_type,
        "relation_company_name": relation.get("relation_company_name") if isinstance(relation.get("relation_company_name"), str) else None,
        "year_matched": year_matched,
        "used_graduation_year": used_graduation_year,
    }


def _build_recruit_queries(
    company_name: str,
    industry: str | None,
    custom_query: str | None,
    graduation_year: int | None = None,
    selection_type: str | None = None,
    *,
    get_graduation_year=None,
) -> list[str]:
    get_graduation_year = get_graduation_year or _default_get_graduation_year
    if custom_query:
        return [custom_query]
    grad_year = graduation_year or get_graduation_year()
    grad_year_short = grad_year % 100
    alias_names = COMPANY_QUERY_ALIASES.get(company_name, [])
    alias_name = alias_names[0] if alias_names else None
    if selection_type == "internship":
        queries = [
            f"{company_name} インターン {grad_year_short}卒",
            f"{company_name} インターン 選考スケジュール {grad_year_short}卒",
            f"{company_name} インターンシップ 募集",
            f"{company_name} インターン 募集要項 {grad_year}",
        ]
    elif selection_type == "main_selection":
        queries = [
            f"{company_name} 本選考 {grad_year_short}卒",
            f"{company_name} 選考スケジュール {grad_year_short}卒",
            f"{company_name} 新卒採用 {grad_year} 募集要項",
            f"{company_name} エントリー 締切",
        ]
    else:
        queries = [
            f"{company_name} 新卒採用 {grad_year_short}卒",
            f"{company_name} 選考スケジュール {grad_year_short}卒",
            f"{company_name} 採用サイト {grad_year}",
            f"{company_name} 募集要項 {grad_year}",
        ]
    if alias_name:
        alias_queries = [
            f"{alias_name} {'インターン' if selection_type == 'internship' else '本選考' if selection_type == 'main_selection' else '新卒採用'} {grad_year_short}卒",
            f"{alias_name} 選考スケジュール {grad_year_short}卒",
        ]
        queries = alias_queries + queries
    if industry:
        queries.append(f"{company_name} {industry} 採用")
    seen: set[str] = set()
    result: list[str] = []
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        result.append(q)
    return result[:6]


def _build_schedule_relation_signature(url: str, company_name: str | None) -> tuple[str, str | None]:
    if not company_name:
        return "other", None
    relation = _classify_company_relation(url, company_name)
    source_type = _normalize_recruitment_source_type(url, None, relation)
    relation_company_name = relation.get("relation_company_name") if isinstance(relation.get("relation_company_name"), str) else None
    return source_type, relation_company_name


def _normalize_url(url: str) -> str:
    from urllib.parse import urlunparse

    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))
    except Exception:
        return url


def _score_schedule_follow_link(url: str, anchor_text: str) -> int:
    path = urlparse(url).path.lower()
    if not path or path == "/":
        return 0
    haystack = f"{anchor_text} {url}".lower()
    if any(keyword in haystack for keyword in SCHEDULE_FOLLOW_LINK_NEGATIVE_KEYWORDS):
        return 0
    if any(keyword in path for keyword in ("mypage", "login", "signin", "account")):
        return 0
    score = 0
    for keyword, weight in SCHEDULE_FOLLOW_LINK_KEYWORDS:
        if keyword in haystack:
            score += weight
    if path.endswith(".pdf"):
        score += 2
    if any(keyword in path for keyword in ("recruit", "saiyo", "entry", "mypage")):
        score += 1
    return score


def _extract_schedule_follow_links(html: bytes, base_url: str, company_name: str | None) -> list[str]:
    if not html or not company_name:
        return []
    base_source_type, base_relation_name = _build_schedule_relation_signature(base_url, company_name)
    if base_source_type not in {"official", "parent", "subsidiary", "job_site"}:
        return []
    soup = BeautifulSoup(html, "html.parser")
    seen_urls = {_normalize_url(base_url)}
    html_candidates: list[tuple[int, str]] = []
    pdf_candidates: list[tuple[int, str]] = []
    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        absolute_url = urljoin(base_url, href)
        parsed = urlparse(absolute_url)
        if parsed.scheme not in {"http", "https"}:
            continue
        normalized_url = _normalize_url(absolute_url)
        if normalized_url in seen_urls:
            continue
        candidate_source_type, candidate_relation_name = _build_schedule_relation_signature(absolute_url, company_name)
        if candidate_source_type != base_source_type:
            continue
        if candidate_source_type in {"parent", "subsidiary"} and candidate_relation_name != base_relation_name:
            continue
        anchor_text = anchor.get_text(" ", strip=True)
        score = _score_schedule_follow_link(absolute_url, anchor_text)
        if score <= 0:
            continue
        seen_urls.add(normalized_url)
        (pdf_candidates if parsed.path.lower().endswith(".pdf") else html_candidates).append((score, absolute_url))
    html_candidates.sort(key=lambda item: (-item[0], len(item[1])))
    pdf_candidates.sort(key=lambda item: (-item[0], len(item[1])))
    combined: list[str] = []
    for _, candidate_url in html_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS:
            break
        combined.append(candidate_url)
    pdf_added = 0
    for _, candidate_url in pdf_candidates:
        if len(combined) >= SCHEDULE_MAX_FOLLOW_LINKS or pdf_added >= SCHEDULE_MAX_PDF_FOLLOW_LINKS:
            break
        combined.append(candidate_url)
        pdf_added += 1
    return combined


def _classify_url_confidence(url: str, title: str, company_name: str = "", *, score_recruit_candidate) -> str:
    score = score_recruit_candidate(url, title, "", company_name, "")
    if score is None:
        return "low"
    source_type = _get_source_type(url, company_name) if company_name else "other"
    return _score_to_confidence(score, source_type)


def _default_get_graduation_year() -> int:
    now = datetime.now()
    return now.year + 2 if now.month >= 4 else now.year + 1


def _default_detect_other_graduation_years(
    url: str, title: str, snippet: str, target_year: int
) -> list[int]:
    combined = f"{url} {title} {snippet}"
    text = (combined or "").lower()
    recruit_context_terms = (
        "採用",
        "新卒",
        "インターン",
        "entry",
        "recruit",
        "career",
        "graduate",
        "freshers",
        "intern",
    )
    if not any(term in text for term in recruit_context_terms):
        return []

    patterns = [
        r"(20\d{2})\s*卒",
        r"(?<!\d)(\d{2})\s*卒",
        r"(20\d{2})\s*年度",
        r"(?:fy|fiscal)\s*[-/]?\s*(20\d{2})",
        r"(?:fy|fiscal)\s*[-/]?\s*(\d{2})",
        r"(20\d{2})\s*年(?:度)?\s*(?:新卒|採用|entry|recruit)",
    ]

    detected_years: set[int] = set()
    min_year = max(2020, target_year - 5)
    max_year = target_year + 3
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            year_str = match.group(1)
            if not year_str:
                continue
            year = int(year_str)
            if year < 100:
                year = 2000 + year
            if year == target_year:
                continue
            if min_year <= year <= max_year:
                detected_years.add(year)
    return sorted(detected_years)
