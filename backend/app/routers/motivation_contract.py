"""Compatibility shim for ``motivation_contract``."""

from __future__ import annotations

import sys

from app.services.motivation.contract import *  # noqa: F401,F403
from app.services.motivation import contract as _service_module


sys.modules[__name__] = _service_module
