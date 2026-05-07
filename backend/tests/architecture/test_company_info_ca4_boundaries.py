"""Architecture checks for the company_info CA-4 service extraction."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
COMPANY_INFO_ROUTER = PROJECT_ROOT / "app" / "routers" / "company_info.py"
COMPANY_INFO_ROUTER_HELPERS = PROJECT_ROOT / "app" / "routers"
COMPANY_INFO_SERVICES = PROJECT_ROOT / "app" / "services" / "company_info"
CA4_HELPER_NAMES = {
    "company_info_schedule.py",
    "company_info_schedule_service.py",
    "company_info_schedule_links.py",
    "company_info_schedule_extraction.py",
    "company_info_rag_service.py",
    "company_info_ingest_service.py",
}


def _imports(path: Path) -> list[tuple[str, int]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend((alias.name, node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append((node.module or "", node.lineno))
    return imports


def test_company_info_service_modules_do_not_import_router_modules() -> None:
    service_files = sorted(
        path for path in COMPANY_INFO_SERVICES.glob("*.py") if path.name != "__init__.py"
    )

    assert service_files, "Company info service package must contain implementation modules"

    violations: list[str] = []
    for path in service_files:
        for module, line in _imports(path):
            if module == "app.routers" or module.startswith("app.routers."):
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{line}")

    assert not violations


def test_company_info_main_router_depends_on_service_layer_for_ca4() -> None:
    imports = _imports(COMPANY_INFO_ROUTER)

    assert any(module.startswith("app.services.company_info.") for module, _ in imports)

    legacy_helper_imports = [
        f"{module}:{line}"
        for module, line in imports
        if module in {
            "app.routers.company_info_schedule",
            "app.routers.company_info_schedule_service",
            "app.routers.company_info_schedule_links",
            "app.routers.company_info_schedule_extraction",
            "app.routers.company_info_rag_service",
            "app.routers.company_info_ingest_service",
        }
    ]
    assert not legacy_helper_imports


def test_company_info_ca4_router_helper_modules_are_compatibility_shims() -> None:
    helper_files = sorted(
        path
        for path in COMPANY_INFO_ROUTER_HELPERS.glob("company_info_*.py")
        if path.name in CA4_HELPER_NAMES
    )

    assert len(helper_files) == len(CA4_HELPER_NAMES)

    oversized_helpers = [
        f"{path.relative_to(PROJECT_ROOT)}:{len(path.read_text(encoding='utf-8').splitlines())}"
        for path in helper_files
        if len(path.read_text(encoding="utf-8").splitlines()) > 20
    ]
    assert not oversized_helpers
