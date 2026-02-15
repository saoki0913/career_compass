from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.limiter import limiter
from app.routers import health, company_info, es_review, gakuchika, motivation
from app.utils.secure_logger import get_logger

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


app = FastAPI(
    title="就活Compass API",
    description="Backend API for 就活Compass",
    version="0.1.0",
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware (applied to all responses)
app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware - explicitly specify allowed methods and headers for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Device-Token"],
)


# Startup event to log CORS configuration
@app.on_event("startup")
async def startup_event():
    """Log security-critical configuration on startup."""
    logger.info(f"[Security] CORS allowed origins: {settings.cors_origins}")
    logger.info(f"[Security] Frontend URL: {settings.frontend_url}")

    # Cross-encoder reranker health check
    from app.utils.reranker import check_reranker_health

    health = check_reranker_health()
    if health["available"]:
        logger.info(f"[Reranker] OK: {health['model_name']} (test_score={health['test_score']:.4f})")
    else:
        logger.warning(f"[Reranker] WARNING: {health['error']}")


# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(company_info.router)
app.include_router(es_review.router)
app.include_router(gakuchika.router)
app.include_router(motivation.router)


@app.get("/")
async def root():
    return {"message": "就活Compass API", "version": "0.1.0"}
