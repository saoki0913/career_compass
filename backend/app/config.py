from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path


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

    # OpenAI
    openai_api_key: str = ""

    # Anthropic (Claude)
    anthropic_api_key: str = ""

    # LLM Model Settings
    # 開発環境デフォルト: Sonnet（品質重視）
    # コスト節約時は .env で Haiku に変更可能
    claude_model: str = "claude-sonnet-4-5-20250929"
    openai_model: str = "gpt-4o-mini"

    model_config = SettingsConfigDict(
        # Try multiple env file locations
        # Path: backend/app/config.py → .parent = app/ → .parent.parent = backend/ → .parent.parent.parent = career_compass/
        env_file=(
            Path(__file__).parent.parent.parent / ".env.local",  # Root .env.local
            Path(__file__).parent.parent.parent / ".env",  # Root .env
            ".env",  # Local .env (for Docker/deployment)
        ),
        env_file_encoding="utf-8",
        extra="ignore",  # Ignore extra env vars
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
