#!/usr/bin/env python3
"""Ingest anonymized reference ES examples into the reference_es collection."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.rag.reference_es import ReferenceEsRecord, ingest_reference_es


def _record_from_json(
    raw: dict[str, Any],
    *,
    default_source_version: str,
    ingest_session_id: str,
) -> ReferenceEsRecord:
    es_id = str(raw.get("es_id") or raw.get("id") or "").strip()
    text = str(raw.get("text") or raw.get("content") or "").strip()
    question_type = str(raw.get("question_type") or "").strip()
    if not es_id:
        raise ValueError("reference ES record missing es_id")
    if len(text) < 20:
        raise ValueError(f"reference ES record {es_id} has too-short text")
    if not question_type:
        raise ValueError(f"reference ES record {es_id} missing question_type")
    if raw.get("anonymized") is not True:
        raise ValueError(f"reference ES record {es_id} must set anonymized=true")
    if raw.get("usage_consent") is not True:
        raise ValueError(f"reference ES record {es_id} must set usage_consent=true")
    anonymization_level = str(raw.get("anonymization_level") or "").strip()
    if anonymization_level not in {"synthetic", "anonymized"}:
        raise ValueError(
            f"reference ES record {es_id} must set anonymization_level to synthetic or anonymized"
        )
    source_provenance = str(raw.get("source_provenance") or "").strip()
    if not source_provenance:
        raise ValueError(f"reference ES record {es_id} missing source_provenance")

    char_max_raw = raw.get("char_max")
    char_max = int(char_max_raw) if char_max_raw not in (None, "") else None
    return ReferenceEsRecord(
        es_id=es_id,
        text=text,
        question_type=question_type,
        industry=str(raw.get("industry") or "").strip() or None,
        char_max=char_max,
        source_version=str(raw.get("source_version") or default_source_version),
        ingest_session_id=ingest_session_id,
        anonymization_level=anonymization_level,
        source_provenance=source_provenance,
        usage_consent=True,
    )


def load_records(
    path: Path,
    *,
    default_source_version: str,
    ingest_session_id: str | None = None,
) -> list[ReferenceEsRecord]:
    session_id = ingest_session_id or f"reference-es-{uuid.uuid4()}"
    records: list[ReferenceEsRecord] = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                if not isinstance(raw, dict):
                    raise ValueError("record must be an object")
                records.append(
                    _record_from_json(
                        raw,
                        default_source_version=default_source_version,
                        ingest_session_id=session_id,
                    )
                )
            except Exception as exc:
                raise ValueError(f"{path}:{line_no}: {exc}") from exc
    return records


def build_dry_run_summary(
    records: list[ReferenceEsRecord],
    *,
    requested_ingest_session_id: str | None = None,
) -> dict[str, Any]:
    question_types: dict[str, int] = {}
    source_versions: dict[str, int] = {}
    for record in records:
        question_types[record.question_type] = (
            question_types.get(record.question_type, 0) + 1
        )
        source_versions[record.source_version] = (
            source_versions.get(record.source_version, 0) + 1
        )

    return {
        "records": len(records),
        "dryRun": True,
        "ingestSessionId": (
            records[0].ingest_session_id if records else requested_ingest_session_id
        ),
        "questionTypes": dict(sorted(question_types.items())),
        "sourceVersions": dict(sorted(source_versions.items())),
        "consentedRecords": sum(1 for record in records if record.usage_consent),
        "anonymizedRecords": sum(
            1
            for record in records
            if record.anonymization_level in {"synthetic", "anonymized"}
        ),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest anonymized reference ES JSONL")
    parser.add_argument("--input", required=True, help="JSONL file with anonymized ES examples")
    parser.add_argument("--source-version", default="v1")
    parser.add_argument(
        "--ingest-session-id",
        help="Audit id for this ingest run. Defaults to reference-es-<uuid4>.",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


async def main_async(args: argparse.Namespace) -> int:
    records = load_records(
        Path(args.input),
        default_source_version=args.source_version,
        ingest_session_id=args.ingest_session_id,
    )
    if args.dry_run:
        print(
            json.dumps(
                build_dry_run_summary(
                    records,
                    requested_ingest_session_id=args.ingest_session_id,
                ),
                ensure_ascii=False,
            )
        )
        return 0
    inserted = await ingest_reference_es(records)
    print(json.dumps({"records": len(records), "ingested": inserted}, ensure_ascii=False))
    return 0


def main() -> int:
    return asyncio.run(main_async(parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
