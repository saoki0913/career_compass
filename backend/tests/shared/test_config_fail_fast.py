import warnings

import pytest

from app.config import Settings


VALID_PRODUCTION_KWARGS = {
    "app_env": "production",
    "internal_api_jwt_secret": "a" * 32,
    "career_principal_hmac_secret": "b" * 32,
    "tenant_key_secret": "c" * 32,
    "openai_api_key": "sk-test-valid-key",
    "anthropic_api_key": "sk-ant-test-valid-key",
    "cors_origins": ["https://www.shupass.jp", "https://shupass.jp"],
    "trusted_hosts": ["shupass-backend-production.up.railway.app"],
    "redis_url": "rediss://default:password@example.upstash.io:6379",
    "redis_namespace": "production",
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


def test_production_rejects_missing_redis_url() -> None:
    with pytest.raises(ValueError, match="REDIS_URL"):
        Settings(_env_file=None, **_production_kwargs(redis_url=""))


def test_production_rejects_mismatched_redis_namespace() -> None:
    with pytest.raises(ValueError, match="APP_ENV"):
        Settings(_env_file=None, **_production_kwargs(redis_namespace="staging"))


def test_production_rejects_localhost_trusted_hosts() -> None:
    with pytest.raises(ValueError, match="BACKEND_TRUSTED_HOSTS"):
        Settings(_env_file=None, **_production_kwargs(trusted_hosts=["localhost"]))


def test_staging_also_rejects() -> None:
    with pytest.raises(ValueError, match="INTERNAL_API_JWT_SECRET"):
        Settings(
            _env_file=None,
            **_production_kwargs(
                app_env="staging",
                redis_namespace="staging",
                internal_api_jwt_secret="",
            ),
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
        app_env="development",
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
    ("app_env", "expected_production", "expected_staging", "expected_deployed"),
    [
        ("production", True, False, True),
        ("staging", False, True, True),
        ("development", False, False, False),
    ],
)
def test_environment_properties(
    app_env: str,
    expected_production: bool,
    expected_staging: bool,
    expected_deployed: bool,
) -> None:
    kwargs = (
        _production_kwargs(
            app_env=app_env,
            redis_namespace=app_env,
        )
        if app_env in {"production", "staging"}
        else {"app_env": app_env}
    )

    settings = Settings(_env_file=None, **kwargs)

    assert settings.is_production is expected_production
    assert settings.is_staging is expected_staging
    assert settings.is_deployed is expected_deployed


def test_invalid_app_env_rejected() -> None:
    with pytest.raises(ValueError, match="APP_ENV"):
        Settings(_env_file=None, app_env="prod")


def test_railway_deployed_rejects_local_app_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")

    with pytest.raises(ValueError, match="APP_ENV"):
        Settings(_env_file=None, app_env="development")


def test_railway_deployed_requires_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")

    with pytest.raises(ValueError, match="APP_ENV"):
        Settings(_env_file=None)


def test_railway_deployed_allows_split_project_production_environment_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")

    settings = Settings(
        _env_file=None,
        **_production_kwargs(app_env="staging", redis_namespace="staging"),
    )

    assert settings.logical_app_environment == "staging"
    assert settings.is_staging is True


def test_environment_alias_is_not_used_for_app_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")

    settings = Settings(_env_file=None)

    assert settings.environment == "development"
    assert settings.logical_app_environment == "local"
    assert settings.is_deployed is False


def test_app_env_alias_is_supported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    settings = Settings(
        _env_file=None,
        **_production_kwargs(app_env=None, redis_namespace="staging"),
    )

    assert settings.environment == "staging"
    assert settings.logical_app_environment == "staging"


def test_app_env_alias_does_not_emit_deprecation_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "staging")

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        settings = Settings(
            _env_file=None,
            **_production_kwargs(app_env=None, redis_namespace="staging"),
        )

    assert settings.logical_app_environment == "staging"
    assert not any(item.category is DeprecationWarning for item in recorded)


def test_sentry_environment_fallback() -> None:
    settings = Settings(_env_file=None, **_production_kwargs(sentry_environment=""))

    assert settings.sentry_environment == "production"


def test_sentry_environment_explicit_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "custom")

    settings = Settings(_env_file=None, **_production_kwargs(sentry_environment=None))

    assert settings.sentry_environment == "custom"


def test_backend_sentry_dsn_env_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_FASTAPI_DSN", "https://fastapi@sentry.io/1")
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://backend@sentry.io/1")
    monkeypatch.setenv("SENTRY_DSN", "https://legacy@sentry.io/1")

    settings = Settings(_env_file=None)

    assert settings.sentry_dsn == "https://fastapi@sentry.io/1"


def test_backend_sentry_dsn_falls_back_to_backend_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SENTRY_FASTAPI_DSN", raising=False)
    monkeypatch.setenv("BACKEND_SENTRY_DSN", "https://backend@sentry.io/1")
    monkeypatch.setenv("SENTRY_DSN", "https://legacy@sentry.io/1")

    settings = Settings(_env_file=None)

    assert settings.sentry_dsn == "https://backend@sentry.io/1"


def test_backend_sentry_dsn_falls_back_to_legacy_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SENTRY_FASTAPI_DSN", raising=False)
    monkeypatch.delenv("BACKEND_SENTRY_DSN", raising=False)
    monkeypatch.setenv("SENTRY_DSN", "https://legacy@sentry.io/1")

    settings = Settings(_env_file=None)

    assert settings.sentry_dsn == "https://legacy@sentry.io/1"
