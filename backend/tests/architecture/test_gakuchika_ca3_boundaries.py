"""Architecture checks for the Gakuchika CA-3 service extraction."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
GAKUCHIKA_ROUTER = PROJECT_ROOT / "app" / "routers" / "gakuchika.py"
GAKUCHIKA_ROUTER_HELPERS = PROJECT_ROOT / "app" / "routers"
GAKUCHIKA_SERVICES = PROJECT_ROOT / "app" / "services" / "gakuchika"


def _imports(path: Path) -> list[tuple[str, int]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend((alias.name, node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append((node.module or "", node.lineno))
    return imports


def test_gakuchika_service_modules_do_not_import_router_modules() -> None:
    service_files = sorted(
        path for path in GAKUCHIKA_SERVICES.glob("*.py") if path.name != "__init__.py"
    )

    assert service_files, "Gakuchika service package must contain implementation modules"

    violations: list[str] = []
    for path in service_files:
        for module, line in _imports(path):
            if module == "app.routers" or module.startswith("app.routers."):
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{line}")

    assert not violations


def test_gakuchika_main_router_depends_on_service_layer() -> None:
    imports = _imports(GAKUCHIKA_ROUTER)

    assert any(module.startswith("app.services.gakuchika.") for module, _ in imports)

    legacy_helper_imports = [
        f"{module}:{line}"
        for module, line in imports
        if module.startswith("app.routers.gakuchika_")
    ]
    assert not legacy_helper_imports


def test_gakuchika_router_helper_modules_are_compatibility_shims() -> None:
    helper_files = sorted(GAKUCHIKA_ROUTER_HELPERS.glob("gakuchika_*.py"))

    assert helper_files, "Gakuchika router helper shims must remain for import compatibility"

    oversized_helpers = [
        f"{path.relative_to(PROJECT_ROOT)}:{len(path.read_text(encoding='utf-8').splitlines())}"
        for path in helper_files
        if len(path.read_text(encoding="utf-8").splitlines()) > 20
    ]
    assert not oversized_helpers
