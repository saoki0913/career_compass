"""Compatibility shim for ``motivation_models``."""

from __future__ import annotations

import sys

from app.services.motivation.models import *  # noqa: F401,F403
from app.services.motivation import models as _service_module


sys.modules[__name__] = _service_module
