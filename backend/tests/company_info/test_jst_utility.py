from datetime import datetime
from zoneinfo import ZoneInfo

from app.utils.jst import JST, now_jst


def test_now_jst_returns_timezone_aware_datetime():
    current = now_jst()

    assert isinstance(current, datetime)
    assert current.tzinfo is not None
    assert current.utcoffset() is not None


def test_now_jst_tzinfo_is_asia_tokyo():
    assert now_jst().tzinfo == ZoneInfo("Asia/Tokyo")


def test_jst_constant_equals_asia_tokyo_zoneinfo():
    assert JST == ZoneInfo("Asia/Tokyo")
