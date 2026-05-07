"""Compatibility shim for ``motivation_context``."""

from __future__ import annotations

import sys

from app.services.motivation.context import *  # noqa: F401,F403
from app.services.motivation import context as _service_module


sys.modules[__name__] = _service_module
