"""Architecture checks for the ES review CA-2 service extraction."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ES_REVIEW_ROUTER = PROJECT_ROOT / "app" / "routers" / "es_review.py"
ES_REVIEW_ROUTER_HELPERS = PROJECT_ROOT / "app" / "routers"
ES_REVIEW_SERVICES = PROJECT_ROOT / "app" / "services" / "es_review"


def _imports(path: Path) -> list[tuple[str, int]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend((alias.name, node.lineno) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append((node.module or "", node.lineno))
    return imports


def _service_files() -> list[Path]:
    return sorted(
        path for path in ES_REVIEW_SERVICES.glob("*.py") if path.name != "__init__.py"
    )


def test_es_review_service_modules_do_not_import_router_modules() -> None:
    service_files = _service_files()

    assert service_files, "ES review service package must contain implementation modules"

    violations: list[str] = []
    for path in service_files:
        for module, line in _imports(path):
            if module == "app.routers" or module.startswith("app.routers."):
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{line}")

    assert not violations


def test_es_review_service_modules_do_not_reference_router_reverse_dependencies() -> None:
    violations: list[str] = []

    for path in _service_files():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == "_lazy_es_review":
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}:_lazy_es_review")
            if (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value.startswith("app.routers.es_review")
            ):
                violations.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}:{node.value}")
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id in {"__import__", "import_module"}
            ):
                first_arg = node.args[0] if node.args else None
                if (
                    isinstance(first_arg, ast.Constant)
                    and isinstance(first_arg.value, str)
                    and first_arg.value.startswith("app.routers.es_review")
                ):
                    violations.append(f"{path.relative_to(PROJECT_ROOT)}:{node.lineno}:{first_arg.value}")

    assert not violations


def test_es_review_main_router_depends_on_service_layer() -> None:
    imports = _imports(ES_REVIEW_ROUTER)

    assert any(module.startswith("app.services.es_review.") for module, _ in imports)

    legacy_helper_imports = [
        f"{module}:{line}"
        for module, line in imports
        if module.startswith("app.routers.es_review_")
    ]
    assert not legacy_helper_imports


def test_es_review_router_does_not_own_orchestrator_stage_wiring() -> None:
    tree = ast.parse(ES_REVIEW_ROUTER.read_text(encoding="utf-8"), filename=str(ES_REVIEW_ROUTER))
    forbidden_stage_names = {
        "prepare_review_context",
        "execute_rewrite_loop",
        "execute_recovery_pipeline",
        "assemble_review_response",
    }
    violations: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "app.services.es_review.orchestrator":
            for alias in node.names:
                if alias.name in forbidden_stage_names:
                    violations.append(f"{alias.name}:{node.lineno}")
        elif isinstance(node, ast.Name) and node.id in forbidden_stage_names:
            violations.append(f"{node.id}:{node.lineno}")

    assert not violations


def test_es_review_router_helper_modules_are_compatibility_shims() -> None:
    helper_files = sorted(ES_REVIEW_ROUTER_HELPERS.glob("es_review_*.py"))

    assert helper_files, "ES review router helper shims must remain for import compatibility"

    oversized_helpers = [
        f"{path.relative_to(PROJECT_ROOT)}:{len(path.read_text(encoding='utf-8').splitlines())}"
        for path in helper_files
        if len(path.read_text(encoding="utf-8").splitlines()) > 20
    ]
    assert not oversized_helpers
