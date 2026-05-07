"""Compatibility shim for ``motivation_company``."""

from __future__ import annotations

import sys

from app.services.motivation.company import *  # noqa: F401,F403
from app.services.motivation import company as _service_module


sys.modules[__name__] = _service_module
