from fastapi.routing import APIRoute

from app.routers.es_review import router


def test_es_review_stream_route_is_registered() -> None:
    routes = [
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/api/es/review/stream"
        and "POST" in route.methods
    ]

    assert len(routes) == 1
