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
