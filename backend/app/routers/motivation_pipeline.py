"""Compatibility shim for ``motivation_pipeline``."""

from __future__ import annotations

import sys

from app.services.motivation.pipeline import *  # noqa: F401,F403
from app.services.motivation import pipeline as _service_module


sys.modules[__name__] = _service_module
