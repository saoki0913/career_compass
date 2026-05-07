from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.utils.llm_prompt_safety import detect_es_injection_risk, sanitize_es_content

RagInjectionRiskLevel = Literal["none", "medium", "high"]


@dataclass(frozen=True)
class RagInjectionRisk:
    level: RagInjectionRiskLevel
    reasons: list[str]
    quarantine: bool


_DIRECTIVE_PATTERNS = [
    re.compile(r"ignore\s+(all|any|previous|above)\s+instructions", re.IGNORECASE),
    re.compile(r"これまでの指示を無視", re.IGNORECASE),
    re.compile(r"(system|developer)\s+prompt", re.IGNORECASE),
    re.compile(r"(システム|開発者)\s*プロンプト", re.IGNORECASE),
]


def sanitize_rag_context(text: str, *, max_length: int = 8000) -> str:
    """Sanitize stored RAG text before it is formatted into an LLM prompt."""
    sanitized = sanitize_es_content(text or "", max_length=max_length)
    sanitized = sanitized.replace("```", "")
    for pattern in _DIRECTIVE_PATTERNS:
        sanitized = pattern.sub("[removed stored directive]", sanitized)
    return sanitized.strip()


def assess_rag_injection_risk(text: str) -> RagInjectionRisk:
    level, reasons = detect_es_injection_risk(text or "")
    risk_level: RagInjectionRiskLevel
    if level == "high":
        risk_level = "high"
    elif level == "medium":
        risk_level = "medium"
    else:
        risk_level = "none"
    return RagInjectionRisk(
        level=risk_level,
        reasons=reasons,
        quarantine=risk_level == "high",
    )


def is_rag_chunk_quarantined(metadata: dict | None) -> bool:
    meta = metadata or {}
    return bool(meta.get("quarantine")) or str(meta.get("injection_risk_level") or "") == "high"
