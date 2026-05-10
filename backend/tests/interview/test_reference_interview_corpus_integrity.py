import json
from pathlib import Path

INTERVIEW_DIR = Path(__file__).resolve().parents[2] / "app" / "reference" / "interview"

REQUIRED_FIELDS = {"id", "question", "answer", "category", "company_name", "capture_kind", "usage_consent", "anonymized", "anonymization_level", "source_provenance"}

VALID_CATEGORIES = {
    "gakuchika",
    "gakuchika_followup",
    "company_motivation",
    "self_pr",
    "work_values",
    "post_join_goals",
    "research",
    "reverse_questions",
    "industry_reason",
    "role_reason",
    "other",
}


def test_interview_jsonl_files_exist() -> None:
    files = sorted(INTERVIEW_DIR.glob("*/references.jsonl"))
    assert files, f"No interview JSONL files found in {INTERVIEW_DIR}"


def test_interview_records_have_required_fields() -> None:
    files = sorted(INTERVIEW_DIR.glob("*/references.jsonl"))
    for path in files:
        company_dir = path.parent.name
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            missing = REQUIRED_FIELDS - set(record.keys())
            assert not missing, f"{path}:{line_number} missing fields: {missing}"


def test_interview_records_validation() -> None:
    files = sorted(INTERVIEW_DIR.glob("*/references.jsonl"))
    for path in files:
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            rid = record.get("id", "?")

            assert record["capture_kind"] == "full_text", (path, line_number, rid)
            assert record["usage_consent"] is True, (path, line_number, rid)
            assert record["anonymized"] is True, (path, line_number, rid)
            assert record["anonymization_level"] == "self_owned", (path, line_number, rid)
            assert record["source_provenance"] == "self_owned_reference_interview", (path, line_number, rid)
            assert record["category"] in VALID_CATEGORIES, (path, line_number, rid, record["category"])
            assert len(record.get("question", "")) > 0, (path, line_number, rid, "empty question")
            assert len(record.get("answer", "")) >= 20, (path, line_number, rid, "answer too short")
