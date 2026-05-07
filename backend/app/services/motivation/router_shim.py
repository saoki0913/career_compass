"""Compatibility helpers for legacy motivation router module paths."""

from __future__ import annotations

import sys
from types import ModuleType
from typing import Any


def install_router_shim(namespace: dict[str, Any], module_name: str, service: ModuleType) -> None:
    """Expose a service module through a legacy router module path."""

    namespace.update(
        {
            name: getattr(service, name)
            for name in dir(service)
            if name == "router" or not (name.startswith("__") and name.endswith("__"))
        }
    )
    sys.modules[module_name] = service
