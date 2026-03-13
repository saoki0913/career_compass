"""
Global rate limiter instance (slowapi).

Separated from main.py to avoid circular imports when used in routers.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
