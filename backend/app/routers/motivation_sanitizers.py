"""Compatibility shim for ``motivation_sanitizers``."""

from __future__ import annotations

import sys

from app.services.motivation.sanitizers import *  # noqa: F401,F403
from app.services.motivation import sanitizers as _service_module


sys.modules[__name__] = _service_module
