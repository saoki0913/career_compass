"""Compatibility shim for ``motivation_question``."""

from __future__ import annotations

import sys

from app.services.motivation.question import *  # noqa: F401,F403
from app.services.motivation import question as _service_module


sys.modules[__name__] = _service_module
