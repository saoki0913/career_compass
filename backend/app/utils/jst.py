"""JST (Asia/Tokyo) timezone helpers."""

from datetime import datetime
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def now_jst() -> datetime:
    """Return current datetime in Asia/Tokyo timezone."""
    return datetime.now(JST)
