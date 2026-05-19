from app.utils.redis_keys import redis_key, redis_pattern
from app.config import settings


def test_redis_key_uses_logical_app_environment(monkeypatch):
    monkeypatch.setattr(settings, "environment", "staging")
    monkeypatch.setattr(settings, "redis_namespace", "staging")

    assert (
        redis_key("rag", "context", "tenant 1", "company/1", "query")
        == "cc:staging:rag:context:tenant%201:company%2F1:query"
    )


def test_redis_pattern_preserves_wildcard(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "redis_namespace", "production")

    assert (
        redis_pattern("rag", "context", "tenant", "company", "*")
        == "cc:production:rag:context:tenant:company:*"
    )


def test_redis_key_rejects_mismatched_namespace(monkeypatch):
    monkeypatch.setattr(settings, "environment", "staging")
    monkeypatch.setattr(settings, "redis_namespace", "production")

    try:
        redis_key("sse", "concurrent", "actor", "lease")
    except RuntimeError as exc:
        assert "REDIS_NAMESPACE" in str(exc)
    else:
        raise AssertionError("mismatched namespace should fail")
