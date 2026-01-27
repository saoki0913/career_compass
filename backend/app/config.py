from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "Career Compass API"
    debug: bool = False

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Database (Turso)
    turso_database_url: str = ""
    turso_auth_token: str = ""

    # Frontend URL
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
