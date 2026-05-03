"""Compatibility shim for ``motivation_summarize``."""

from __future__ import annotations

import sys

from app.services.motivation.summarize import *  # noqa: F401,F403
from app.services.motivation import summarize as _service_module


sys.modules[__name__] = _service_module
