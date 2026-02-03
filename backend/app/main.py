from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import health, company_info, es_review, gakuchika, motivation

app = FastAPI(
    title="Career Compass API",
    description="Backend API for Career Compass",
    version="0.1.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(company_info.router)
app.include_router(es_review.router)
app.include_router(gakuchika.router)
app.include_router(motivation.router)


@app.get("/")
async def root():
    return {"message": "Career Compass API", "version": "0.1.0"}
