"""Compatibility shim for ``motivation_draft``."""

from __future__ import annotations

import sys

from app.services.motivation.draft import *  # noqa: F401,F403
from app.services.motivation import draft as _service_module


sys.modules[__name__] = _service_module
