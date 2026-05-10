from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.security.trusted_host import HealthcheckTrustedHostMiddleware


async def health(_request):
    return JSONResponse({"status": "healthy"})


async def api(_request):
    return JSONResponse({"ok": True})


def make_client() -> TestClient:
    app = Starlette(
        routes=[
            Route("/health", health),
            Route("/api/example", api),
        ]
    )
    app.add_middleware(
        HealthcheckTrustedHostMiddleware,
        allowed_hosts=["api.example.test"],
    )
    return TestClient(app)


def test_healthcheck_bypasses_trusted_host_validation() -> None:
    client = make_client()

    response = client.get("/health", headers={"host": "railway-healthcheck"})

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_non_health_routes_still_enforce_trusted_host_validation() -> None:
    client = make_client()

    response = client.get("/api/example", headers={"host": "railway-healthcheck"})

    assert response.status_code == 400
