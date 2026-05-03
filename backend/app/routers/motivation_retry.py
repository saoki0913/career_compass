"""Compatibility shim for ``motivation_retry``."""

from __future__ import annotations

import sys

from app.services.motivation.retry import *  # noqa: F401,F403
from app.services.motivation import retry as _service_module


sys.modules[__name__] = _service_module
