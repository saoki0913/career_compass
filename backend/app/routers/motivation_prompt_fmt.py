"""Compatibility shim for ``motivation_prompt_fmt``."""

from __future__ import annotations

import sys

from app.services.motivation.prompt_fmt import *  # noqa: F401,F403
from app.services.motivation import prompt_fmt as _service_module


sys.modules[__name__] = _service_module
