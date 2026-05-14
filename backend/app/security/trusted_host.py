from __future__ import annotations

from fastapi.middleware.trustedhost import TrustedHostMiddleware

_PUBLIC_HEALTHCHECK_PATHS = frozenset({"/health", "/health/ready", "/health/version"})


class HealthcheckTrustedHostMiddleware(TrustedHostMiddleware):
    """Apply TrustedHost checks except for public healthcheck endpoints."""

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope["type"] == "http"
            and scope.get("path") in _PUBLIC_HEALTHCHECK_PATHS
        ):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)
