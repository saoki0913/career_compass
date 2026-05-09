"""Extract abstract logic patterns from anonymized reference ES entries."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any
from zoneinfo import ZoneInfo

REFERENCE_ROOT = Path(__file__).resolve().parents[1] / "app" / "reference" / "es_review"
QUESTION_TYPES = (
    "basic",
    "company_motivation",
    "post_join_goals",
    "intern_reason",
    "gakuchika",
    "role_course_reason",
    "self_pr",
    "intern_goals",
    "work_values",
)
MODEL = "gpt-5.5"
JST = ZoneInfo("Asia/Tokyo")

EXTRACTION_SYSTEM_PROMPT = """参考ES群から、本文や固有表現を引用せず、説得構造だけを抽象化して抽出してください。
会社名、個人名、具体的なエピソード、特徴的な言い回し、参考ES本文の連続表現は出力しないでください。
各 approach_description は120文字以内にしてください。"""

EXTRACTION_RESPONSE_SCHEMA: dict[str, Any] = {
    "name": "reference_es_logic_patterns",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "patterns": {
                "type": "array",
                "minItems": 1,
                "maxItems": 4,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "approach_label": {"type": "string"},
                        "approach_description": {"type": "string", "maxLength": 120},
                        "frequency_count": {"type": "integer"},
                        "persuasion_key": {"type": "string"},
                    },
                    "required": [
                        "approach_label",
                        "approach_description",
                        "frequency_count",
                        "persuasion_key",
                    ],
                },
            },
            "section_balance": {"type": "string"},
            "opening_pattern": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"structure": {"type": "string"}},
                "required": ["structure"],
            },
            "closing_pattern": {
                "type": "object",
                "additionalProperties": False,
                "properties": {"structure": {"type": "string"}},
                "required": ["structure"],
            },
        },
        "required": ["patterns", "section_balance", "opening_pattern", "closing_pattern"],
    },
    "strict": True,
}


def _split_sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[。！？!?])", text) if part.strip()]


@dataclass
class ExtractionValidator:
    corpus_texts: list[str]
    known_company_names: set[str] = field(default_factory=set)
    person_names: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.corpus_sentences = [
            sentence
            for text in self.corpus_texts
            for sentence in _split_sentences(text)
            if len(sentence) >= 10
        ]
        self.corpus_numbers = {
            match.group(0)
            for text in self.corpus_texts
            for match in re.finditer(r"\d+(?:\.\d+)?[%％人名件社年カ月ヶ月月日週倍割円万円億円点回位]", text)
        }

    def _char_ngrams(self, text: str, n: int) -> set[str]:
        normalized = re.sub(r"\s+", "", text)
        if len(normalized) < n:
            return set()
        return {normalized[index : index + n] for index in range(len(normalized) - n + 1)}

    def _jaccard(self, a: set[str], b: set[str]) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / len(a | b)

    def _max_ngram_similarity(self, text: str, n: int) -> float:
        target = self._char_ngrams(text, n)
        return max(
            (self._jaccard(target, self._char_ngrams(source, n)) for source in self.corpus_texts),
            default=0.0,
        )

    def validate_pattern(self, text: str) -> dict[str, Any]:
        reasons: list[str] = []
        human_review = False
        reject = False
        stripped = text.strip()

        bigram = self._max_ngram_similarity(stripped, 2)
        trigram = self._max_ngram_similarity(stripped, 3)
        if bigram >= 0.40:
            reject = True
            reasons.append("bigram_similarity")
        elif bigram >= 0.30:
            human_review = True
            reasons.append("bigram_borderline")
        if trigram >= 0.30:
            reject = True
            reasons.append("trigram_similarity")
        elif trigram >= 0.22:
            human_review = True
            reasons.append("trigram_borderline")

        if len(stripped) > 120:
            reject = True
            reasons.append("description_too_long")
        if any(name and name in stripped for name in self.known_company_names):
            reject = True
            reasons.append("company_name")
        if any(name and name in stripped for name in self.person_names):
            reject = True
            reasons.append("person_name")
        if any(number and number in stripped for number in self.corpus_numbers):
            reject = True
            reasons.append("corpus_number")
        if any(sentence in stripped for sentence in self.corpus_sentences):
            reject = True
            reasons.append("verbatim_sentence")

        return {
            "safe": not reject,
            "reject": reject,
            "human_review": human_review,
            "reasons": reasons,
        }


def _load_reference_records(question_type: str) -> list[dict[str, Any]]:
    path = REFERENCE_ROOT / question_type / "references.jsonl"
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict) and record.get("question_type") == question_type:
            records.append(record)
    return records


def _copy_safety_hash(payload: dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return sha256(text.encode("utf-8")).hexdigest()


async def _call_openai_structured(prompt: str) -> dict[str, Any]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI()
    response = await client.responses.create(
        model=MODEL,
        input=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        text={"format": {"type": "json_schema", **EXTRACTION_RESPONSE_SCHEMA}},
    )
    text = response.output_text
    return json.loads(text)


async def extract_patterns_for_type(
    question_type: str,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> dict[str, Any] | None:
    records = _load_reference_records(question_type)
    texts = [str(record.get("text") or "").strip() for record in records if record.get("text")]
    if not texts:
        return None
    output_path = REFERENCE_ROOT / question_type / "patterns.json"
    if output_path.exists() and not force and not dry_run:
        return None

    companies = {str(record.get("company_name") or "").strip() for record in records}
    validator = ExtractionValidator(corpus_texts=texts, known_company_names=companies)
    prompt = "\n\n".join(f"- {text}" for text in texts)
    extracted = await _call_openai_structured(
        f"question_type={question_type}\nsource_count={len(texts)}\n\n{prompt}"
    )
    validation_results = [
        validator.validate_pattern(" ".join(str(pattern.get(key) or "") for key in (
            "approach_label",
            "approach_description",
            "persuasion_key",
        )))
        for pattern in extracted.get("patterns", [])
    ]
    if any(result["reject"] for result in validation_results):
        raise ValueError(f"Unsafe extracted pattern for {question_type}: {validation_results}")

    payload = {
        "question_type": question_type,
        "source_count": len(texts),
        "extraction_version": 1,
        "extracted_at": datetime.now(tz=JST).isoformat(),
        "model": MODEL,
        "human_reviewed": False,
        **extracted,
    }
    payload["copy_safety_hash"] = _copy_safety_hash(payload)
    if not dry_run:
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


async def _main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-type", choices=QUESTION_TYPES)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force-all", action="store_true")
    args = parser.parse_args()

    question_types = [args.question_type] if args.question_type else list(QUESTION_TYPES)
    for question_type in question_types:
        payload = await extract_patterns_for_type(
            question_type,
            dry_run=args.dry_run,
            force=args.force_all,
        )
        status = "skipped" if payload is None else "extracted"
        print(f"{question_type}: {status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
