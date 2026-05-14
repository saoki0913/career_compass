from __future__ import annotations

import ast
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _mapping_assignment_source(relative_path: str) -> str:
    tree = ast.parse((BACKEND_ROOT / relative_path).read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == "MAPPINGS_FILE" for target in node.targets):
                return ast.unparse(node.value)
    raise AssertionError(f"{relative_path} does not define MAPPINGS_FILE")


def test_company_info_scripts_use_backend_mapping_file() -> None:
    expected = BACKEND_ROOT / "data" / "company_mappings.json"

    audit_expr = _mapping_assignment_source(
        "scripts/company_info/audit_official_misclassification.py"
    )
    subsidiaries_expr = _mapping_assignment_source(
        "scripts/company_info/find_missing_subsidiaries.py"
    )

    assert "parents[2]" in audit_expr
    assert "parents[2]" in subsidiaries_expr
    assert expected.exists()
