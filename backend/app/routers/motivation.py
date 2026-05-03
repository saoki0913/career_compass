"""Compatibility facade for motivation endpoints and helper exports."""

from __future__ import annotations

import sys

from app.services.motivation import facade as _facade
from app.services.motivation.facade import *  # noqa: F401,F403


sys.modules[__name__] = _facade
