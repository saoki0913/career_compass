from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.limiter import limiter
from app.routers import health, company_info, es_review, gakuchika, motivation
from app.utils.secure_logger import get_logger
from app.utils.llm import reset_request_llm_cost_summary

logger = get_logger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request id so frontend and backend logs can be correlated."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-Id") or str(uuid4())
        request.state.request_id = request_id
        reset_request_llm_cost_summary()
        try:
            response = await call_next(request)
        finally:
            reset_request_llm_cost_summary()
        response.headers["X-Request-Id"] = request_id
        return response


app = FastAPI(
    title="就活Pass API",
    description="Backend API for 就活Pass",
    version="0.1.0",
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware (applied to all responses)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIdMiddleware)

# CORS middleware - explicitly specify allowed methods and headers for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Device-Token", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
)


# Startup event to log CORS configuration
@app.on_event("startup")
async def startup_event():
    """Log security-critical configuration on startup."""
    logger.info(f"[Security] CORS allowed origins: {settings.cors_origins}")
    logger.info(f"[Security] Frontend URL: {settings.frontend_url}")
    logger.info("[Reranker] lazy load enabled")


# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(company_info.router)
app.include_router(es_review.router)
app.include_router(gakuchika.router)
app.include_router(motivation.router)


@app.get("/")
async def root():
    return {"message": "就活Pass API", "version": "0.1.0"}
