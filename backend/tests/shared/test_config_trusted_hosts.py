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
