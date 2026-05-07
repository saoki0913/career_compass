"""Architecture checks for the motivation CA-1A maintainability pilot."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MOTIVATION_ROUTER = PROJECT_ROOT / "app" / "routers" / "motivation.py"
MOTIVATION_ROUTER_HELPERS = PROJECT_ROOT / "app" / "routers"
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


def test_motivation_router_shims_do_not_replace_sys_modules_directly() -> None:
    helper_files = sorted(MOTIVATION_ROUTER_HELPERS.glob("motivation*.py"))

    assert helper_files, "motivation router compatibility modules must remain importable"

    violations: list[str] = []
    for path in helper_files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        uses_installer = any(
            isinstance(node, ast.Name) and node.id == "install_router_shim"
            for node in ast.walk(tree)
        )
        direct_sys_modules_assignment = any(
            isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Subscript)
                and isinstance(target.value, ast.Attribute)
                and isinstance(target.value.value, ast.Name)
                and target.value.value.id == "sys"
                and target.value.attr == "modules"
                for target in node.targets
            )
            for node in ast.walk(tree)
        )
        if direct_sys_modules_assignment or not uses_installer:
            violations.append(f"{path.relative_to(PROJECT_ROOT)}")

    assert not violations


def test_motivation_sys_modules_facade_is_isolated_to_router_shim() -> None:
    violations: list[str] = []

    for path in sorted(MOTIVATION_SERVICES.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        references_sys_modules = any(
            isinstance(node, ast.Attribute)
            and isinstance(node.value, ast.Name)
            and node.value.id == "sys"
            and node.attr == "modules"
            for node in ast.walk(tree)
        )
        if references_sys_modules and path.name != "router_shim.py":
            violations.append(f"{path.relative_to(PROJECT_ROOT)}")

    assert not violations
