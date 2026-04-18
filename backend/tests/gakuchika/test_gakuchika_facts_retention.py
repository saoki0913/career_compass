"""
Battery D: facts retention measurement for gakuchika ES drafts.

Computes:
- quote_retention: student own-words quotes preserved in draft
- fact_retention: nouns (top 20) + numerals (all) preserved in draft

Used by:
- pytest unit tests of the helpers (this file)
- Phase 0.4 ABC measurement script (calls analyze_drafts_from_file with saved drafts)

Plan: /Users/saoki/.claude/plans/gakuchika-quality-improvement-plan-web-a-cheerful-marshmallow.md
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import _extract_student_expressions (no edits to source)
# ---------------------------------------------------------------------------
try:
    from app.normalization.gakuchika_payload import _extract_student_expressions

    _HAS_EXTRACT = True
except Exception as _exc:  # pragma: no cover
    logger.warning("Could not import _extract_student_expressions: %s", _exc)
    _HAS_EXTRACT = False

    def _extract_student_expressions(messages: list[Any], max_items: int = 5) -> list[str]:  # type: ignore[misc]
        return []


# ---------------------------------------------------------------------------
# Import tokenizer (with fallback)
# ---------------------------------------------------------------------------
try:
    from app.utils.japanese_tokenizer import tokenize as _mecab_tokenize

    _HAS_TOKENIZER = True
except Exception as _exc:  # pragma: no cover
    logger.warning("Could not import japanese_tokenizer: %s", _exc)
    _HAS_TOKENIZER = False

    def _mecab_tokenize(text: str) -> list[str]:  # type: ignore[misc]
        return []


# ---------------------------------------------------------------------------
# Numeral extraction
# ---------------------------------------------------------------------------

# Units recognized for numeral+unit patterns (order matters: longer first)
_UNITS = (
    "ヶ月",
    "時間",
    "箇所",
    "ポイント",
    "ポイント",
    "人",
    "枚",
    "倍",
    "%",
    "件",
    "円",
    "年",
    "月",
    "日",
    "分",
    "秒",
    "回",
    "位",
    "個",
    "名",
    "割",
    "台",
    "本",
    "冊",
    "km",
    "kg",
    "mb",
    "gb",
    "kb",
    "g",
)

_UNIT_PATTERN_STR = "|".join(re.escape(u) for u in _UNITS)

# Matches: digits (half- or full-width) optionally followed by a unit.
# Also catches bare numeric literals without a unit.
_NUMERAL_RE = re.compile(
    r"\d+(?:[.,]\d+)?(?:" + _UNIT_PATTERN_STR + r")?",
    re.IGNORECASE,
)

# Full-width digit normalizer
_FULLWIDTH_TABLE = str.maketrans(
    "０１２３４５６７８９．，",
    "0123456789.,",
)


def _normalize_digits(text: str) -> str:
    """Convert full-width digits/punctuation to half-width."""
    return text.translate(_FULLWIDTH_TABLE)


def extract_numerals(text: str) -> list[str]:
    """Extract numeral expressions (digits + optional unit) verbatim.

    Returns unique numerals in order of first appearance.
    Recognized units: 人 / 枚 / 倍 / % / ポイント / 件 / 円 / 年 / ヶ月 / 月 / 日 /
    時間 / 分 / 秒 / 回 / 位 / 個 / 名 / 箇所 / 割 / 台 / 本 / 冊 / km / kg / g / mb / gb / kb
    """
    normalized = _normalize_digits(text)
    seen: set[str] = set()
    results: list[str] = []
    for m in _NUMERAL_RE.finditer(normalized):
        token = m.group(0)
        if token not in seen:
            seen.add(token)
            results.append(token)
    return results


# ---------------------------------------------------------------------------
# Extra blacklist for noun heuristic (common verb/aux remnants that survive
# MeCab stopwords in the fallback or in certain conjugation forms)
# ---------------------------------------------------------------------------
_NOUN_BLACKLIST: frozenset[str] = frozenset(
    {
        "した",
        "ある",
        "ない",
        "なる",
        "いる",
        "できる",
        "れる",
        "られる",
        "せる",
        "させる",
        "てい",
        "でき",
        "あり",
        "おり",
        "なり",
        "しま",
        "です",
        "ます",
        "した",
        "ませ",
        "まし",
        "こと",
        "とき",
        "ため",
        "よう",
        "もの",
        "ほど",
        "だけ",
        "など",
        "ながら",
        "また",
        "ただ",
        "その",
        "この",
        "あの",
        "それ",
        "これ",
        "あれ",
        "どの",
        "どれ",
        "いく",
        "おく",
    }
)


def _is_noun_like(token: str) -> bool:
    """Heuristic: length >= 2, not all-digit, not in extra blacklist."""
    if len(token) < 2:
        return False
    if token.isdigit():
        return False
    if token in _NOUN_BLACKLIST:
        return False
    return True


def _tokenize_student_text(text: str) -> list[str]:
    """Tokenize with MeCab; fall back to regex-based split when unavailable."""
    if _HAS_TOKENIZER:
        tokens = _mecab_tokenize(text)
        # The fallback in japanese_tokenizer returns the whole sentence as one
        # token when MeCab is unavailable. Detect that and re-split.
        if len(tokens) == 1 and len(tokens[0]) > 10:
            # MeCab not available — use our own split
            tokens = _regex_split(text)
    else:
        tokens = _regex_split(text)
    return tokens


def _regex_split(text: str) -> list[str]:
    """Split Japanese text into rough tokens by CJK character runs and words."""
    # Normalize full-width alphanumeric
    text = text.translate(
        str.maketrans(
            "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ"
            "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ"
            "０１２３４５６７８９",
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "abcdefghijklmnopqrstuvwxyz"
            "0123456789",
        )
    )
    # Split on whitespace and punctuation, extract CJK runs and ASCII words
    tokens: list[str] = []
    # CJK unified ideographs, Hiragana, Katakana
    for chunk in re.split(r"[\s\u3000、。，,.!！?？「」『』【】（）()・:：;；\-–—\n\r\t]+", text):
        if not chunk:
            continue
        # Split further: run of kanji/kata, run of alpha-num, etc.
        for sub in re.findall(
            r"[\u4e00-\u9fff\u3040-\u30ff\uff65-\uff9f\u31f0-\u31ff]+"
            r"|[a-zA-Z0-9]+",
            chunk,
        ):
            tokens.append(sub)
    return tokens


def extract_top_nouns(text: str, top_k: int = 20) -> list[str]:
    """Tokenize and return top-K most-frequent noun-like tokens.

    Filters: length >= 2, not all-digit, not in extra blacklist (e.g.
    common verbs that survived MeCab stopwords).
    Returns tokens sorted by frequency desc, then by first appearance.
    """
    raw_tokens = _tokenize_student_text(text)
    noun_candidates = [t for t in raw_tokens if _is_noun_like(t)]

    freq = Counter(noun_candidates)
    # Preserve first-appearance order for tie-breaking
    first_seen: dict[str, int] = {}
    for i, t in enumerate(noun_candidates):
        if t not in first_seen:
            first_seen[t] = i

    sorted_tokens = sorted(
        freq.keys(),
        key=lambda t: (-freq[t], first_seen[t]),
    )
    return sorted_tokens[:top_k]


# ---------------------------------------------------------------------------
# Student quotes
# ---------------------------------------------------------------------------


class _TranscriptMessage:
    """Thin adapter so dict-shaped transcript items work with _extract_student_expressions."""

    __slots__ = ("role", "content")

    def __init__(self, role: str, content: str) -> None:
        self.role = role
        self.content = content


def extract_student_quotes(transcript: list[dict]) -> list[str]:
    """Wrap _extract_student_expressions for transcript-shaped input.

    transcript items: {"role": "user"|"assistant", "content": str}
    Returns the student's notable own-words quotes (max 5).
    """
    messages = [_TranscriptMessage(t.get("role", ""), t.get("content", "")) for t in transcript]
    return _extract_student_expressions(messages)


# ---------------------------------------------------------------------------
# quote_retention
# ---------------------------------------------------------------------------


def compute_quote_retention(transcript: list[dict], draft: str) -> float:
    """Fraction of student quotes preserved in draft (substring match).

    Returns 0.0 if no quotes extracted.
    """
    quotes = extract_student_quotes(transcript)
    # Remove empty quotes
    quotes = [q.strip() for q in quotes if q.strip()]
    if not quotes:
        return 0.0
    preserved = sum(1 for q in quotes if q in draft)
    return preserved / len(quotes)


# ---------------------------------------------------------------------------
# fact_retention
# ---------------------------------------------------------------------------


def _collect_student_text(transcript: list[dict]) -> str:
    """Join all user-turn content into a single string."""
    parts = [t.get("content", "") for t in transcript if t.get("role") == "user"]
    return " ".join(parts)


def compute_fact_retention(
    transcript: list[dict], draft: str, top_k: int = 20
) -> dict[str, float]:
    """Fraction of student-side nouns and numerals preserved in draft.

    Returns:
        {
            "noun_retention": float,    # top-K nouns from student turns
            "numeral_retention": float, # all numerals from student turns
            "combined": float,          # avg of both (if numerals present), else noun_retention
            "noun_count": int,
            "numeral_count": int,
        }
    """
    student_text = _collect_student_text(transcript)

    nouns = extract_top_nouns(student_text, top_k=top_k)
    numerals = extract_numerals(student_text)

    noun_preserved = sum(1 for n in nouns if n in draft)
    noun_retention = noun_preserved / len(nouns) if nouns else 0.0

    numeral_preserved = sum(1 for n in numerals if n in draft)
    numeral_retention = numeral_preserved / len(numerals) if numerals else 0.0

    if numerals:
        combined = (noun_retention + numeral_retention) / 2
    else:
        combined = noun_retention

    return {
        "noun_retention": noun_retention,
        "numeral_retention": numeral_retention,
        "combined": combined,
        "noun_count": len(nouns),
        "numeral_count": len(numerals),
    }


# ---------------------------------------------------------------------------
# Combined entry point
# ---------------------------------------------------------------------------


def measure_facts_retention(transcript: list[dict], draft: str) -> dict[str, Any]:
    """Combined entry: quote + fact retention with diagnostic detail.

    Returns:
        {
            "quote_retention": float,
            "quote_total": int,
            "quote_preserved": int,
            "noun_retention": float,
            "numeral_retention": float,
            "combined_fact_retention": float,
            "noun_count": int,
            "numeral_count": int,
        }
    """
    quotes = [q.strip() for q in extract_student_quotes(transcript) if q.strip()]
    quote_total = len(quotes)
    quote_preserved = sum(1 for q in quotes if q in draft)
    quote_retention = quote_preserved / quote_total if quote_total else 0.0

    fact = compute_fact_retention(transcript, draft)

    return {
        "quote_retention": quote_retention,
        "quote_total": quote_total,
        "quote_preserved": quote_preserved,
        "noun_retention": fact["noun_retention"],
        "numeral_retention": fact["numeral_retention"],
        "combined_fact_retention": fact["combined"],
        "noun_count": fact["noun_count"],
        "numeral_count": fact["numeral_count"],
    }


# ---------------------------------------------------------------------------
# Batch analysis helper (Phase 0.4 ABC measurement script)
# ---------------------------------------------------------------------------


def analyze_drafts_from_file(json_path: str | Path) -> dict[str, Any]:
    """Read a JSON file containing list of {case_id, sample_idx, transcript, draft} entries
    and return aggregated metrics per case_id.

    JSON shape:
    [
        {"case_id": "gak_golden_01", "sample_idx": 0, "transcript": [...], "draft": "..."},
        ...
    ]

    Returns:
        {
            "per_sample": [
                {"case_id": ..., "sample_idx": ..., **measure_facts_retention(...)},
                ...
            ],
            "per_case": {
                case_id: {"mean_quote_retention": ..., "mean_combined_fact_retention": ..., "n_samples": ...}
            },
            "overall": {"mean_quote_retention": ..., "mean_combined_fact_retention": ...},
        }
    """
    path = Path(json_path)
    with path.open(encoding="utf-8") as f:
        entries: list[dict] = json.load(f)

    per_sample: list[dict[str, Any]] = []
    case_buckets: dict[str, list[dict[str, Any]]] = {}

    for entry in entries:
        case_id = entry["case_id"]
        sample_idx = entry["sample_idx"]
        transcript = entry["transcript"]
        draft = entry["draft"]

        metrics = measure_facts_retention(transcript, draft)
        row = {"case_id": case_id, "sample_idx": sample_idx, **metrics}
        per_sample.append(row)
        case_buckets.setdefault(case_id, []).append(row)

    per_case: dict[str, Any] = {}
    for case_id, rows in case_buckets.items():
        n = len(rows)
        per_case[case_id] = {
            "mean_quote_retention": sum(r["quote_retention"] for r in rows) / n,
            "mean_combined_fact_retention": sum(r["combined_fact_retention"] for r in rows) / n,
            "n_samples": n,
        }

    all_quote = [r["quote_retention"] for r in per_sample]
    all_fact = [r["combined_fact_retention"] for r in per_sample]
    overall: dict[str, float] = {}
    if all_quote:
        overall["mean_quote_retention"] = sum(all_quote) / len(all_quote)
        overall["mean_combined_fact_retention"] = sum(all_fact) / len(all_fact)

    return {
        "per_sample": per_sample,
        "per_case": per_case,
        "overall": overall,
    }


# ===========================================================================
# Unit tests (pytest)
# ===========================================================================

import pytest  # noqa: E402  (intentional: tests at end of file)


# --- extract_top_nouns ---


def test_extract_top_nouns_filters_short_tokens() -> None:
    """Single-character or pure-digit tokens must not appear in output."""
    text = "A 学 祭 学園祭 50 実行委員"
    nouns = extract_top_nouns(text)
    for n in nouns:
        assert len(n) >= 2, f"short token leaked: {n!r}"
        assert not n.isdigit(), f"digit token leaked: {n!r}"


def test_extract_top_nouns_top_k_limits_output() -> None:
    """top_k parameter must cap the result length."""
    text = "学園祭 実行委員 リーダー チーム 来場者 待機列 担当 改善 提案 導入"
    nouns = extract_top_nouns(text, top_k=3)
    assert len(nouns) <= 3


def test_extract_numerals_handles_units() -> None:
    """Numeral+unit patterns are extracted as combined tokens."""
    text = "50人のチームで30%改善し、2ヶ月間取り組んだ"
    nums = extract_numerals(text)
    assert "50人" in nums or "50" in nums  # unit presence depends on regex order
    assert any("30%" in n or "30" in n for n in nums)
    assert any("2ヶ月" in n or "2" in n for n in nums)


def test_extract_numerals_dedupes_repeated() -> None:
    """The same numeral appearing multiple times is returned only once."""
    text = "50人が来場し、また50人が増えた"
    nums = extract_numerals(text)
    count_50 = sum(1 for n in nums if "50" in n)
    assert count_50 == 1, f"duplicate found: {nums}"


def test_extract_student_quotes_returns_only_user_turns() -> None:
    """Assistant-turn content must not be included in extracted quotes."""
    transcript = [
        {"role": "assistant", "content": "「失敗から学ぶことが大切です」と思いますか？"},
        {"role": "user", "content": "自分で整理番号制を導入しました。"},
        {"role": "assistant", "content": "「素晴らしい工夫ですね」とはどういう意味ですか？"},
    ]
    quotes = extract_student_quotes(transcript)
    # The assistant's quoted text must not appear
    assert not any("失敗から学ぶことが大切です" in q for q in quotes)
    assert not any("素晴らしい工夫ですね" in q for q in quotes)


def test_compute_quote_retention_full_match() -> None:
    """All student quotes present in draft -> retention == 1.0."""
    transcript = [
        {"role": "user", "content": "待機列が50%短くなりました。"},
        {"role": "assistant", "content": "どう対処しましたか？"},
    ]
    # The numeral+surrounding context that _extract_student_expressions picks up
    quotes = extract_student_quotes(transcript)
    # Build a draft that contains every extracted quote verbatim
    draft = "私は" + "".join(quotes) + "という成果を出しました。"
    result = compute_quote_retention(transcript, draft)
    assert result == pytest.approx(1.0)


def test_compute_quote_retention_partial() -> None:
    """Partial quote presence -> retention between 0 and 1 (exclusive)."""
    transcript = [
        {"role": "user", "content": "参加者が30%増え、待機時間も15分短縮した。"},
        {"role": "assistant", "content": "詳しく教えてください。"},
    ]
    quotes = extract_student_quotes(transcript)
    if len(quotes) < 2:
        pytest.skip("Not enough quotes extracted for partial test")
    # Include only the first quote in the draft
    draft = "私は" + quotes[0] + "という成果を出した。"
    result = compute_quote_retention(transcript, draft)
    assert 0.0 < result < 1.0


def test_compute_quote_retention_no_match() -> None:
    """No quotes present in draft -> retention == 0.0."""
    transcript = [
        {"role": "user", "content": "参加者が30%増えた。"},
        {"role": "assistant", "content": "詳しく教えてください。"},
    ]
    draft = "私はイベント運営に貢献しました。"
    result = compute_quote_retention(transcript, draft)
    assert result == pytest.approx(0.0)


def test_compute_fact_retention_with_numbers_and_nouns() -> None:
    """Nouns and numerals from student turns are tracked correctly."""
    transcript = [
        {"role": "user", "content": "学園祭実行委員として50人の来場者に対応しました。"},
        {"role": "assistant", "content": "具体的にどんな工夫をしましたか？"},
        {"role": "user", "content": "整理番号制を導入し待機列を30%削減しました。"},
    ]
    draft = "私は学園祭実行委員として50人規模のイベントを運営し、整理番号制を導入して30%の待機列削減を達成した。"
    result = compute_fact_retention(transcript, draft)
    assert result["noun_retention"] >= 0.0
    assert result["numeral_retention"] > 0.0  # 50 and 30% are in draft
    assert "combined" in result
    assert result["noun_count"] >= 0
    assert result["numeral_count"] >= 1


def test_measure_facts_retention_combined_keys_present() -> None:
    """measure_facts_retention must return all documented keys."""
    transcript = [
        {"role": "user", "content": "50人の行列ができた"},
        {"role": "assistant", "content": "対応どうしましたか"},
        {"role": "user", "content": "整理番号制に切り替えた"},
    ]
    draft = "私は50人の行列に対し整理番号制を導入した"
    result = measure_facts_retention(transcript, draft)
    expected_keys = {
        "quote_retention",
        "quote_total",
        "quote_preserved",
        "noun_retention",
        "numeral_retention",
        "combined_fact_retention",
        "noun_count",
        "numeral_count",
    }
    assert expected_keys == set(result.keys())
    # All float fields must be in [0, 1]
    for key in ("quote_retention", "noun_retention", "numeral_retention", "combined_fact_retention"):
        assert 0.0 <= result[key] <= 1.0, f"{key}={result[key]} out of range"


def test_analyze_drafts_from_file_aggregates_correctly(tmp_path: Path) -> None:
    """analyze_drafts_from_file must read JSON and compute per_case / overall."""
    entries = [
        {
            "case_id": "gak_golden_01",
            "sample_idx": 0,
            "transcript": [
                {"role": "user", "content": "50人の行列ができた"},
                {"role": "assistant", "content": "対応どうしましたか"},
                {"role": "user", "content": "整理番号制に切り替えた"},
            ],
            "draft": "私は50人の行列に対し整理番号制を導入した",
        },
        {
            "case_id": "gak_golden_01",
            "sample_idx": 1,
            "transcript": [
                {"role": "user", "content": "参加者が30%増えた"},
                {"role": "assistant", "content": "どう対処しましたか"},
                {"role": "user", "content": "導線を改善した"},
            ],
            "draft": "私は参加者30%増の課題に対し導線を改善した",
        },
        {
            "case_id": "gak_golden_02",
            "sample_idx": 0,
            "transcript": [
                {"role": "user", "content": "チームをまとめた"},
                {"role": "assistant", "content": "具体的には？"},
                {"role": "user", "content": "3名のリーダーを任された"},
            ],
            "draft": "私は3名のリーダーを担いチームを牽引した",
        },
    ]
    json_file = tmp_path / "drafts.json"
    json_file.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")

    result = analyze_drafts_from_file(json_file)

    # Structure checks
    assert "per_sample" in result
    assert "per_case" in result
    assert "overall" in result

    assert len(result["per_sample"]) == 3
    assert set(result["per_case"].keys()) == {"gak_golden_01", "gak_golden_02"}

    # per_case for gak_golden_01 should have n_samples == 2
    assert result["per_case"]["gak_golden_01"]["n_samples"] == 2
    assert result["per_case"]["gak_golden_02"]["n_samples"] == 1

    # overall keys present
    assert "mean_quote_retention" in result["overall"]
    assert "mean_combined_fact_retention" in result["overall"]

    # all retention values in [0, 1]
    for row in result["per_sample"]:
        assert 0.0 <= row["quote_retention"] <= 1.0
        assert 0.0 <= row["combined_fact_retention"] <= 1.0
