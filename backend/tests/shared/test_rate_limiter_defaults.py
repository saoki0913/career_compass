from app.limiter import limiter


def test_rate_limiter_has_no_global_default_limits():
    assert getattr(limiter, "_default_limits", []) == []
