"""Compatibility shim for ``motivation_validation``."""

from __future__ import annotations

import sys

from app.services.motivation.validation import *  # noqa: F401,F403
from app.services.motivation import validation as _service_module


sys.modules[__name__] = _service_module
