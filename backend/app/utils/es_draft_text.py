"""Normalize ES draft body to a single paragraph (no line breaks)."""

import re


def normalize_es_draft_single_paragraph(text: str) -> str:
    s = (text or "").replace("\r\n", "\n")
    s = re.sub(r"\s*\n+\s*", " ", s)
    s = re.sub(r"[ \u3000]+", " ", s).strip()
    return s
