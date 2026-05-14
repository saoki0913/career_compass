import pytest

from app.config import Settings


VALID_PRODUCTION_KWARGS = {
    "environment": "production",
    "internal_api_jwt_secret": "a" * 32,
    "career_principal_hmac_secret": "b" * 32,
    "tenant_key_secret": "c" * 32,
    "openai_api_key": "sk-test-valid-key",
    "anthropic_api_key": "sk-ant-test-valid-key",
    "cors_origins": ["https://www.shupass.jp", "https://shupass.jp"],
}


def _production_kwargs(**overrides):
    kwargs = {**VALID_PRODUCTION_KWARGS, "sentry_dsn": "https://example@sentry.io/1"}
    kwargs.update(overrides)
    return {key: value for key, value in kwargs.items() if value is not None}


def test_production_rejects_empty_jwt() -> None:
    with pytest.raises(ValueError, match="INTERNAL_API_JWT_SECRET"):
        Settings(_env_file=None, **_production_kwargs(internal_api_jwt_secret=""))


def test_production_rejects_short_jwt() -> None:
    with pytest.raises(ValueError, match="32 文字以上"):
        Settings(_env_file=None, **_production_kwargs(internal_api_jwt_secret="a" * 31))


def test_production_rejects_placeholder_jwt() -> None:
    with pytest.raises(ValueError, match="プレースホルダー"):
        Settings(_env_file=None, **_production_kwargs(internal_api_jwt_secret="changeme"))


def test_production_rejects_empty_principal() -> None:
    with pytest.raises(ValueError, match="CAREER_PRINCIPAL_HMAC_SECRET"):
        Settings(_env_file=None, **_production_kwargs(career_principal_hmac_secret=""))


def test_production_rejects_empty_tenant_key() -> None:
    with pytest.raises(ValueError, match="TENANT_KEY_SECRET"):
        Settings(_env_file=None, **_production_kwargs(tenant_key_secret=""))


def test_production_rejects_no_openai_key() -> None:
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        Settings(_env_file=None, **_production_kwargs(openai_api_key=""))


def test_production_rejects_no_anthropic_key() -> None:
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        Settings(_env_file=None, **_production_kwargs(anthropic_api_key=""))


def test_production_rejects_localhost_cors() -> None:
    with pytest.raises(ValueError, match="localhost"):
        Settings(
            _env_file=None,
            **_production_kwargs(
                cors_origins=["https://shupass.jp", "http://localhost:3000"]
            ),
        )


def test_production_rejects_empty_cors() -> None:
    with pytest.raises(ValueError, match="CORS_ORIGINS"):
        Settings(_env_file=None, **_production_kwargs(cors_origins=[]))


def test_staging_also_rejects() -> None:
    with pytest.raises(ValueError, match="INTERNAL_API_JWT_SECRET"):
        Settings(
            _env_file=None,
            **_production_kwargs(environment="staging", internal_api_jwt_secret=""),
        )


def test_deployed_rejects_live_es_review_capture_debug() -> None:
    with pytest.raises(ValueError, match="LIVE_ES_REVIEW_CAPTURE_DEBUG"):
        Settings(
            _env_file=None,
            **_production_kwargs(live_es_review_capture_debug=True),
        )


def test_development_allows_empty() -> None:
    settings = Settings(
        _env_file=None,
        environment="development",
        internal_api_jwt_secret="",
        career_principal_hmac_secret="",
        tenant_key_secret="",
        openai_api_key="",
        anthropic_api_key="",
        cors_origins=[],
    )

    assert settings.is_deployed is False


def test_production_golden_path() -> None:
    settings = Settings(_env_file=None, **_production_kwargs())

    assert settings.is_production is True
    assert settings.is_deployed is True


@pytest.mark.parametrize(
    ("environment", "expected_production", "expected_staging", "expected_deployed"),
    [
        ("production", True, False, True),
        ("staging", False, True, True),
        ("development", False, False, False),
    ],
)
def test_environment_properties(
    environment: str,
    expected_production: bool,
    expected_staging: bool,
    expected_deployed: bool,
) -> None:
    kwargs = (
        _production_kwargs(environment=environment)
        if environment in {"production", "staging"}
        else {"environment": environment}
    )

    settings = Settings(_env_file=None, **kwargs)

    assert settings.is_production is expected_production
    assert settings.is_staging is expected_staging
    assert settings.is_deployed is expected_deployed


def test_railway_environment_still_marks_deployed_when_environment_is_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")

    with pytest.raises(ValueError, match="LIVE_ES_REVIEW_CAPTURE_DEBUG"):
        Settings(
            _env_file=None,
            **_production_kwargs(
                environment="development",
                live_es_review_capture_debug=True,
            ),
        )


def test_environment_alias_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")

    settings = Settings(
        _env_file=None,
        **_production_kwargs(environment=None),
    )

    assert settings.environment == "staging"
    assert settings.is_staging is True
    assert settings.is_production is True


def test_sentry_environment_fallback() -> None:
    settings = Settings(_env_file=None, **_production_kwargs(sentry_environment=""))

    assert settings.sentry_environment == "production"


def test_sentry_environment_explicit_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "custom")

    settings = Settings(_env_file=None, **_production_kwargs(sentry_environment=None))

    assert settings.sentry_environment == "custom"
