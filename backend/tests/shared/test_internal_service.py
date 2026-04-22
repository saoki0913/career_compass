import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException


def _make_request(hostname: str = "localhost") -> MagicMock:
    req = MagicMock()
    req.url.hostname = hostname
    req.headers.get.return_value = ""
    return req


def test_production_rejects_localhost_without_jwt(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INTERNAL_API_JWT_SECRET", "")
    from app.security.internal_service import require_internal_service
    from app.config import settings

    monkeypatch.setattr(settings, "internal_api_jwt_secret", "")
    with pytest.raises(HTTPException) as exc_info:
        require_internal_service(_make_request("localhost"))
    assert exc_info.value.status_code == 401


def test_development_allows_localhost_without_jwt(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    from app.security.internal_service import require_internal_service
    from app.config import settings

    monkeypatch.setattr(settings, "internal_api_jwt_secret", "")
    result = require_internal_service(_make_request("localhost"))
    assert result["mode"] == "local-dev"
