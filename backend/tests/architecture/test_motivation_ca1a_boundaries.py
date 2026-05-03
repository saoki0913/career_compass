"""Architecture checks for the motivation CA-1A maintainability pilot."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MOTIVATION_ROUTER = PROJECT_ROOT / "app" / "routers" / "motivation.py"
MOTIVATION_SERVICES = PROJECT_ROOT / "app" / "services" / "motivation"


def test_motivation_router_stays_slim() -> None:
    lines = MOTIVATION_ROUTER.read_text(encoding="utf-8").splitlines()

    assert len(lines) <= 200


def test_motivation_services_do_not_import_router_modules() -> None:
    service_files = sorted(MOTIVATION_SERVICES.glob("*.py"))

    assert service_files, "motivation service package must contain implementation modules"

    violations: list[str] = []
    for path in service_files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "app.routers" or alias.name.startswith("app.routers."):
                        violations.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module == "app.routers" or module.startswith("app.routers."):
                    violations.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}")

    assert not violations
