"""Compatibility shim for ``motivation_streaming``."""

from __future__ import annotations

import sys

from app.services.motivation.streaming import *  # noqa: F401,F403
from app.services.motivation import streaming as _service_module


sys.modules[__name__] = _service_module
