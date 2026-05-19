from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.health import router


def make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router)
    return app


def test_health_check_is_public_liveness_only() -> None:
    response = TestClient(make_app()).get("/health", headers={"host": "localhost"})

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_version_check_exposes_minimal_build_metadata(monkeypatch) -> None:
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abcdef1234567890")
    monkeypatch.setenv("BUILD_TIME", "2026-05-13T00:00:00Z")

    from app import config
    from app.routers import health

    class FakeSettings:
        logical_app_environment = "production"

    monkeypatch.setattr(config, "settings", FakeSettings())
    health.BUILD_SHA = "abcdef1234567890"
    health.BUILD_TIME = "2026-05-13T00:00:00Z"

    response = TestClient(make_app()).get("/health/version", headers={"host": "localhost"})

    assert response.status_code == 200
    assert response.json() == {
        "service": "career-compass-backend",
        "sha": "abcdef12",
        "build_time": "2026-05-13T00:00:00Z",
        "environment": "production",
    }
    serialized = str(response.json()).lower()
    assert "railway_git" not in serialized
    assert "repo" not in serialized


def test_readiness_does_not_expose_provider_key_configuration() -> None:
    response = TestClient(make_app()).get("/health/ready", headers={"host": "localhost"})

    assert response.status_code in {200, 503}
    payload = response.json()
    serialized = str(payload)
    assert "llm_key_configured" not in serialized
    assert "openai" not in serialized.lower()
    assert "anthropic" not in serialized.lower()
    assert "google_api_key" not in serialized.lower()
    if payload.get("warnings"):
        assert set(payload["warnings"]) <= {"provider_credentials_unavailable"}
