"""Helpers for router compatibility shims."""

from __future__ import annotations

import sys
from types import ModuleType
from typing import Any


def install_router_shim(namespace: dict[str, Any], module_name: str, service: ModuleType) -> None:
    """Expose a service module through a legacy router module path."""

    class ServiceShim(ModuleType):
        def __getattr__(self, name: str) -> Any:
            return getattr(service, name)

        def __setattr__(self, name: str, value: Any) -> None:
            if not name.startswith("__") and name != "_service":
                setattr(service, name, value)
            super().__setattr__(name, value)

    exported = [name for name in dir(service) if not name.startswith("__")]
    namespace.update({name: getattr(service, name) for name in exported})
    namespace["__all__"] = exported
    sys.modules[module_name].__class__ = ServiceShim
