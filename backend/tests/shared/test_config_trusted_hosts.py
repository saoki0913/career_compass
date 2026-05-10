import pytest

from app.config import Settings


def test_railway_domains_are_trusted_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "BACKEND_TRUSTED_HOSTS",
        '["localhost","stg-api.shupass.jp"]',
    )
    monkeypatch.setenv(
        "RAILWAY_PUBLIC_DOMAIN",
        "career-compass-backend-staging.up.railway.app",
    )
    monkeypatch.setenv(
        "RAILWAY_PRIVATE_DOMAIN",
        "career-compass-backend-staging.railway.internal:8080",
    )

    settings = Settings(_env_file=None)

    assert settings.trusted_hosts == [
        "localhost",
        "stg-api.shupass.jp",
        "career-compass-backend-staging.up.railway.app",
        "career-compass-backend-staging.railway.internal",
    ]


def test_trusted_hosts_are_deduplicated_after_normalizing_railway_domain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "BACKEND_TRUSTED_HOSTS",
        '["localhost","career-compass-backend-staging.up.railway.app"]',
    )
    monkeypatch.setenv(
        "RAILWAY_PUBLIC_DOMAIN",
        "https://career-compass-backend-staging.up.railway.app/health",
    )
    monkeypatch.delenv("RAILWAY_PRIVATE_DOMAIN", raising=False)

    settings = Settings(_env_file=None)

    assert settings.trusted_hosts == [
        "localhost",
        "career-compass-backend-staging.up.railway.app",
    ]
