import pytest

from app.config import Settings


def test_trusted_hosts_accept_json_array_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "BACKEND_TRUSTED_HOSTS",
        '["localhost","stg-api.shupass.jp"]',
    )

    settings = Settings(_env_file=None)

    assert settings.trusted_hosts == ["localhost", "stg-api.shupass.jp"]


def test_deployed_requires_non_local_trusted_hosts() -> None:
    with pytest.raises(ValueError, match="BACKEND_TRUSTED_HOSTS"):
        Settings(
            _env_file=None,
            app_env="production",
            internal_api_jwt_secret="a" * 32,
            career_principal_hmac_secret="b" * 32,
            tenant_key_secret="c" * 32,
            openai_api_key="sk-test-valid-key",
            anthropic_api_key="sk-ant-test-valid-key",
            cors_origins=["https://www.shupass.jp"],
        )


def test_deployed_rejects_wildcard_trusted_hosts() -> None:
    with pytest.raises(ValueError, match="wildcard"):
        Settings(
            _env_file=None,
            app_env="production",
            internal_api_jwt_secret="a" * 32,
            career_principal_hmac_secret="b" * 32,
            tenant_key_secret="c" * 32,
            openai_api_key="sk-test-valid-key",
            anthropic_api_key="sk-ant-test-valid-key",
            cors_origins=["https://www.shupass.jp"],
            trusted_hosts=["*"],
        )
