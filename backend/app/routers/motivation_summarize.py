"""Compatibility shim for ``motivation_summarize``."""

from __future__ import annotations

from app.services.motivation.summarize import *  # noqa: F401,F403
from app.services.motivation import summarize as _service_module
from app.services.motivation.router_shim import install_router_shim


install_router_shim(globals(), __name__, _service_module)
