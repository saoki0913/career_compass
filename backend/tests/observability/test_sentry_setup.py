import sys
import types
from types import SimpleNamespace

from app.observability.sentry_setup import (
    _before_send,
    _before_send_transaction,
    init_sentry,
    scrub_sentry_value,
)


def test_scrub_sentry_value_removes_request_pii() -> None:
    scrubbed = scrub_sentry_value(
        {
            "request": {
                "headers": {
                    "authorization": "Bearer abcdefghijklmnopqrstuvwxyz",
                    "cookie": "guest_device_token=abcdefghijklmnopqrstuvwxyz",
                },
            },
            "breadcrumbs": [{"message": "学生時代にサークル運営で成果を出しました", "data": {"prompt": "ES本文"}}],
            "exception": {"values": [{"value": "志望動機の本文が混ざりました"}]},
        }
    )

    serialized = str(scrubbed)
    assert "[SCRUBBED_TEXT]" in serialized
    assert "[DROPPED]" in serialized
    assert "学生時代" not in serialized
    assert "志望動機" not in serialized
    assert "ES本文" not in serialized


def test_before_send_drops_fastapi_request_details() -> None:
    scrubbed = _before_send(
        {
            "request": {
                "url": "https://api.shupass.jp/review?token=secret#fragment",
                "headers": {"authorization": "Bearer abcdefghijklmnopqrstuvwxyz"},
                "cookies": {"guest_device_token": "abcdefghijklmnopqrstuvwxyz"},
                "data": {"essay": "学生時代にサークル運営で成果を出しました"},
                "query_string": "token=secret",
            }
        },
        {},
    )

    assert scrubbed is not None
    request = scrubbed["request"]
    assert request["url"] == "https://api.shupass.jp/review"
    assert request["headers"] == "[DROPPED]"
    assert request["cookies"] == "[DROPPED]"
    assert request["data"] == "[DROPPED]"
    assert request["query_string"] == "[DROPPED]"
    assert "secret" not in str(scrubbed)
    assert "学生時代" not in str(scrubbed)


def test_before_send_transaction_uses_same_request_scrub_policy() -> None:
    scrubbed = _before_send_transaction(
        {
            "type": "transaction",
            "request": {
                "url": "https://api.shupass.jp/dashboard?guest_device_token=secret",
                "headers": {"cookie": "guest_device_token=abcdefghijklmnopqrstuvwxyz"},
                "query_string": "guest_device_token=secret",
            },
        },
        {},
    )

    assert scrubbed is not None
    assert scrubbed["request"]["url"] == "https://api.shupass.jp/dashboard"
    assert scrubbed["request"]["headers"] == "[DROPPED]"
    assert scrubbed["request"]["query_string"] == "[DROPPED]"
    assert "secret" not in str(scrubbed)


def test_init_sentry_uses_backend_dsn_and_sets_tags(monkeypatch) -> None:
    init_kwargs = {}
    tags = {}

    sentry_sdk = types.ModuleType("sentry_sdk")
    sentry_sdk.init = lambda **kwargs: init_kwargs.update(kwargs)
    sentry_sdk.set_tag = lambda key, value: tags.update({key: value})

    integrations = types.ModuleType("sentry_sdk.integrations")
    fastapi = types.ModuleType("sentry_sdk.integrations.fastapi")
    starlette = types.ModuleType("sentry_sdk.integrations.starlette")
    fastapi.FastApiIntegration = lambda **kwargs: ("fastapi", kwargs)
    starlette.StarletteIntegration = lambda **kwargs: ("starlette", kwargs)

    monkeypatch.setitem(sys.modules, "sentry_sdk", sentry_sdk)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations", integrations)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.fastapi", fastapi)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.starlette", starlette)

    settings = SimpleNamespace(
        sentry_fastapi_dsn="https://fastapi@sentry.io/1",
        backend_sentry_dsn="https://backend@sentry.io/1",
        sentry_dsn="https://legacy@sentry.io/1",
        sentry_environment="staging",
        environment="development",
        sentry_release="abc123",
        sentry_traces_sample_rate=0.01,
    )

    assert init_sentry(settings) is True
    assert init_kwargs["dsn"] == "https://fastapi@sentry.io/1"
    assert init_kwargs["send_default_pii"] is False
    assert init_kwargs["traces_sample_rate"] == 0.0
    assert "before_send_transaction" in init_kwargs
    assert tags == {"service": "career-compass-backend", "runtime": "fastapi"}
