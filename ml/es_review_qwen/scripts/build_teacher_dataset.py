#!/usr/bin/env python3
"""Build teacher data for the Qwen ES review beta."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = ROOT / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from app.prompts.es_templates import (  # noqa: E402
    build_template_fallback_rewrite_prompt,
    build_template_improvement_prompt,
    build_template_rewrite_prompt,
)
from app.prompts.reference_es import build_reference_quality_block  # noqa: E402
from app.routers.es_review import (  # noqa: E402
    _fallback_improvement_points,
    _is_generic_role_label,
    _merge_with_fallback_issues,
    _parse_issues,
    _validate_rewrite_candidate,
)
import app.routers.es_review as es_review_router  # noqa: E402
from app.utils.llm import call_llm_text_with_error, call_llm_with_error  # noqa: E402

IMPROVEMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "top3": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "issue": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["category", "issue", "suggestion"],
            },
        }
    },
    "required": ["top3"],
}


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False) + "\n")


def _normalize_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_list_of_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _resolve_char_bounds(case: dict[str, Any]) -> tuple[int | None, int | None]:
    char_max = case.get("char_max")
    if char_max is None and case.get("char_limit") is not None:
        char_max = case.get("char_limit")
    char_max = int(char_max) if char_max is not None else None
    char_min = case.get("char_min")
    if char_min is None and char_max is not None:
        char_min = max(0, int(char_max) - 10)
    char_min = int(char_min) if char_min is not None else None
    return char_min, char_max


def _stable_split_name(key: str) -> str:
    bucket = int(hashlib.md5(key.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "valid"
    return "test"


def _summarize_issue_for_training(issue: Any) -> dict[str, str]:
    if hasattr(issue, "model_dump"):
        data = issue.model_dump()
    elif isinstance(issue, dict):
        data = issue
    else:
        data = {}
    return {
        "category": str(data.get("category", "") or ""),
        "issue": str(data.get("issue", "") or ""),
        "suggestion": str(data.get("suggestion", "") or ""),
    }


def _render_messages(system_prompt: str, user_prompt: str, assistant_text: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
        {"role": "assistant", "content": assistant_text},
    ]


async def _request_teacher_improvements(
    *,
    system_prompt: str,
    user_prompt: str,
) -> list[dict[str, Any]]:
    result = await call_llm_with_error(
        system_prompt=system_prompt,
        user_message=user_prompt,
        max_tokens=900,
        temperature=0.15,
        model="claude-sonnet",
        feature="es_review_qwen_teacher",
        response_format="json_schema",
        json_schema=IMPROVEMENT_SCHEMA,
        retry_on_parse=True,
        disable_fallback=True,
    )
    if not result.success or not isinstance(result.data, dict):
        detail = result.error.detail if result.error else "teacher improvement generation failed"
        raise RuntimeError(detail or "teacher improvement generation failed")
    return list(result.data.get("top3", []))


async def _request_teacher_rewrite(
    *,
    system_prompt: str,
    user_prompt: str,
    char_max: int | None,
) -> str:
    result = await call_llm_text_with_error(
        system_prompt=system_prompt,
        user_message=user_prompt,
        max_tokens=min(900, max(360, int((char_max or 500) * 2.0))),
        temperature=0.2,
        model="claude-sonnet",
        feature="es_review_qwen_teacher",
        disable_fallback=True,
    )
    if not result.success or not isinstance(result.data, dict):
        detail = result.error.detail if result.error else "teacher rewrite generation failed"
        raise RuntimeError(detail or "teacher rewrite generation failed")
    return str(result.data.get("text", "") or "")


async def _build_case_records(
    case: dict[str, Any],
    *,
    teacher_source: str,
    rewrite_attempts: int,
    skip_reference_overlap_check: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    case_id = str(case.get("id") or case.get("case_id") or "").strip()
    if not case_id:
        raise ValueError("case.id is required")

    template_type = str(case.get("template_type") or "").strip()
    question = str(case.get("question") or "").strip()
    answer = str(case.get("answer") or "").strip()
    if not template_type or not question or not answer:
        raise ValueError(f"{case_id}: template_type/question/answer are required")

    company_name = _normalize_optional_str(case.get("company_name"))
    industry = _normalize_optional_str(case.get("industry"))
    intern_name = _normalize_optional_str(case.get("intern_name"))
    role_name = _normalize_optional_str(case.get("role_name"))
    char_min, char_max = _resolve_char_bounds(case)
    company_evidence_cards = _normalize_list_of_dicts(case.get("company_evidence_cards"))
    allowed_user_facts = _normalize_list_of_dicts(case.get("allowed_user_facts"))
    grounding_mode = str(case.get("grounding_mode") or ("company_general" if company_evidence_cards else "none"))
    evidence_coverage_level = str(
        case.get("evidence_coverage_level") or ("partial" if company_evidence_cards else "none")
    )
    reference_quality_block = build_reference_quality_block(
        template_type,
        char_max=char_max,
        company_name=company_name,
    )
    generic_role_mode = _is_generic_role_label(role_name)

    improvement_system_prompt, improvement_user_prompt = build_template_improvement_prompt(
        template_type=template_type,
        question=question,
        original_answer=answer,
        company_name=company_name,
        company_evidence_cards=company_evidence_cards,
        has_rag=bool(company_evidence_cards),
        char_min=char_min,
        char_max=char_max,
        allowed_user_facts=allowed_user_facts,
        role_name=role_name,
        grounding_mode=grounding_mode,
        reference_quality_block=reference_quality_block,
        generic_role_mode=generic_role_mode,
        evidence_coverage_level=evidence_coverage_level,
    )

    if teacher_source == "existing":
        raw_top3 = case.get("teacher_top3")
        if not isinstance(raw_top3, list):
            raise ValueError(f"{case_id}: teacher_top3 is required when --teacher-source=existing")
    else:
        raw_top3 = await _request_teacher_improvements(
            system_prompt=improvement_system_prompt,
            user_prompt=improvement_user_prompt,
        )

    parsed_issues = _parse_issues(
        raw_top3,
        3,
        role_name=role_name,
        company_rag_available=bool(company_evidence_cards),
    )
    fallback_issues = _fallback_improvement_points(
        question=question,
        original_answer=answer,
        company_rag_available=bool(company_evidence_cards),
        role_name=role_name,
        grounding_mode=grounding_mode,
    )
    issues = _merge_with_fallback_issues(parsed_issues, fallback_issues)
    issue_payload = []
    for issue in issues:
        issue_data = issue.model_dump() if hasattr(issue, "model_dump") else dict(issue)
        issue_payload.append(
            {
                "issue_id": issue_data.get("issue_id"),
                "category": issue_data.get("category"),
                "issue": issue_data.get("issue"),
                "suggestion": issue_data.get("suggestion"),
                "required_action": issue_data.get("required_action"),
                "must_appear": issue_data.get("must_appear"),
            }
        )

    rewrite_system_prompt, rewrite_user_prompt = build_template_rewrite_prompt(
        template_type=template_type,
        company_name=company_name,
        industry=industry,
        question=question,
        answer=answer,
        char_min=char_min,
        char_max=char_max,
        company_evidence_cards=company_evidence_cards,
        has_rag=bool(company_evidence_cards),
        improvement_points=issue_payload,
        allowed_user_facts=allowed_user_facts,
        intern_name=intern_name,
        role_name=role_name,
        grounding_mode=grounding_mode,
        reference_quality_block=reference_quality_block,
        generic_role_mode=generic_role_mode,
        evidence_coverage_level=evidence_coverage_level,
    )

    rewrite_text = _normalize_optional_str(case.get("teacher_rewrite")) if teacher_source == "existing" else None
    final_rewrite = None
    final_reason = "missing"

    for attempt in range(rewrite_attempts):
        is_fallback_prompt = attempt == rewrite_attempts - 1
        if rewrite_text is None:
            if is_fallback_prompt:
                rewrite_system_prompt, rewrite_user_prompt = build_template_fallback_rewrite_prompt(
                    template_type=template_type,
                    company_name=company_name,
                    industry=industry,
                    question=question,
                    answer=answer,
                    char_min=char_min,
                    char_max=char_max,
                    company_evidence_cards=company_evidence_cards,
                    has_rag=bool(company_evidence_cards),
                    improvement_points=issue_payload,
                    allowed_user_facts=allowed_user_facts,
                    intern_name=intern_name,
                    role_name=role_name,
                    grounding_mode=grounding_mode,
                    reference_quality_block=reference_quality_block,
                    generic_role_mode=generic_role_mode,
                    evidence_coverage_level=evidence_coverage_level,
                )
            candidate = await _request_teacher_rewrite(
                system_prompt=rewrite_system_prompt,
                user_prompt=rewrite_user_prompt,
                char_max=char_max,
            )
        else:
            candidate = rewrite_text

        original_overlap_validator = es_review_router._validate_reference_distance
        if skip_reference_overlap_check:
            es_review_router._validate_reference_distance = lambda *args, **kwargs: (True, None)
        try:
            validated_candidate, retry_code, retry_reason, retry_meta = _validate_rewrite_candidate(
                candidate,
                template_type=template_type,
                company_name=company_name,
                char_min=char_min,
                char_max=char_max,
                issues=issues,
                role_name=role_name,
                grounding_mode=grounding_mode,
                company_evidence_cards=company_evidence_cards,
            )
        finally:
            es_review_router._validate_reference_distance = original_overlap_validator
        if validated_candidate:
            final_rewrite = validated_candidate
            final_reason = "ok"
            break

        final_reason = retry_code or retry_reason or "validation_failed"
        if teacher_source == "existing":
            break
        rewrite_text = None

    if not final_rewrite:
        raise ValueError(f"{case_id}: rewrite validation failed ({final_reason})")

    split_key = str(
        case.get("split_key")
        or f"{company_name or 'companyless'}::{template_type}::{question}::{answer[:80]}"
    )
    split = _stable_split_name(split_key)
    simplified_issues = [_summarize_issue_for_training(issue) for issue in issues]

    improvement_record = {
        "id": f"{case_id}::improvement_top3",
        "task": "improvement_top3",
        "messages": _render_messages(
            improvement_system_prompt,
            improvement_user_prompt,
            json.dumps({"top3": simplified_issues}, ensure_ascii=False),
        ),
        "metadata": {
            "source_case_id": case_id,
            "template_type": template_type,
            "company_name": company_name,
            "role_name": role_name,
            "split": split,
        },
    }
    rewrite_record = {
        "id": f"{case_id}::rewrite_text",
        "task": "rewrite_text",
        "messages": _render_messages(
            rewrite_system_prompt,
            rewrite_user_prompt,
            final_rewrite,
        ),
        "metadata": {
            "source_case_id": case_id,
            "template_type": template_type,
            "company_name": company_name,
            "role_name": role_name,
            "split": split,
        },
    }
    teacher_record = {
        "id": case_id,
        "split": split,
        "template_type": template_type,
        "company_name": company_name,
        "industry": industry,
        "intern_name": intern_name,
        "role_name": role_name,
        "question": question,
        "answer": answer,
        "char_min": char_min,
        "char_max": char_max,
        "grounding_mode": grounding_mode,
        "evidence_coverage_level": evidence_coverage_level,
        "company_evidence_cards": company_evidence_cards,
        "allowed_user_facts": allowed_user_facts,
        "teacher_top3": simplified_issues,
        "teacher_rewrite": final_rewrite,
        "json_valid": True,
        "rewrite_validator_pass": True,
        "char_limit_pass": True,
        "reference_overlap_violation": False,
        "failure_reason": None,
    }
    return [improvement_record, rewrite_record], teacher_record


async def _run(args: argparse.Namespace) -> None:
    source_rows = _load_jsonl(Path(args.input))
    if args.max_cases:
        source_rows = source_rows[: args.max_cases]

    accepted_records: list[dict[str, Any]] = []
    teacher_records: list[dict[str, Any]] = []
    rejected_records: list[dict[str, Any]] = []

    semaphore = asyncio.Semaphore(max(1, args.concurrency))

    async def _process(case: dict[str, Any]) -> None:
        async with semaphore:
            case_id = str(case.get("id") or case.get("case_id") or "<unknown>")
            try:
                records, teacher_record = await _build_case_records(
                    case,
                    teacher_source=args.teacher_source,
                    rewrite_attempts=max(1, args.rewrite_attempts),
                    skip_reference_overlap_check=args.skip_reference_overlap_check,
                )
                accepted_records.extend(records)
                teacher_records.append(teacher_record)
            except Exception as error:
                rejected_records.append(
                    {
                        "id": case_id,
                        "failure_reason": str(error),
                    }
                )

    await asyncio.gather(*[_process(case) for case in source_rows])

    output_dir = Path(args.output_dir)
    raw_path = output_dir / "teacher_records.jsonl"
    rejected_path = output_dir / "rejected.jsonl"
    sft_dir = output_dir / "sft"

    split_records: dict[str, list[dict[str, Any]]] = {"train": [], "valid": [], "test": []}
    for record in accepted_records:
        split = str(record.get("metadata", {}).get("split") or "train")
        split_records.setdefault(split, []).append(record)

    _write_jsonl(raw_path, teacher_records)
    _write_jsonl(rejected_path, rejected_records)
    for split_name, rows in split_records.items():
        _write_jsonl(sft_dir / f"{split_name}.jsonl", rows)

    summary = {
        "source_cases": len(source_rows),
        "accepted_cases": len(teacher_records),
        "rejected_cases": len(rejected_records),
        "sft_records": len(accepted_records),
        "teacher_source": args.teacher_source,
        "splits": {split_name: len(rows) for split_name, rows in split_records.items()},
        "teacher_records_path": str(raw_path),
        "rejected_path": str(rejected_path),
    }
    summary_path = output_dir / "summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build teacher data for the Qwen ES review beta.")
    parser.add_argument("--input", required=True, help="Seed case JSONL path")
    parser.add_argument(
        "--teacher-source",
        choices=["existing", "claude"],
        default="existing",
        help="Use prefilled teacher outputs or call the current Claude flow",
    )
    parser.add_argument(
        "--output-dir",
        default=str(ROOT / "ml" / "es_review_qwen" / "data" / "generated"),
        help="Output directory for teacher and SFT datasets",
    )
    parser.add_argument("--rewrite-attempts", type=int, default=3)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--max-cases", type=int, default=0)
    parser.add_argument(
        "--skip-reference-overlap-check",
        action="store_true",
        help="Disable reference overlap validation when building training data",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
