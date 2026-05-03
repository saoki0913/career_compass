"""Compatibility shim for ``motivation_planner``."""

from __future__ import annotations

import sys

from app.services.motivation.planner import *  # noqa: F401,F403
from app.services.motivation import planner as _service_module


sys.modules[__name__] = _service_module
