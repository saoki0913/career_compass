"""Compatibility facade for motivation endpoints and helper exports."""

from __future__ import annotations

from app.services.motivation import facade as _facade
from app.services.motivation.facade import *  # noqa: F401,F403
from app.services.motivation.router_shim import install_router_shim


install_router_shim(globals(), __name__, _facade)
