from app.utils.sanitizer import redact_sensitive, scrub_exception, scrub_mapping, scrub_value


def test_redact_sensitive_redacts_common_identifiers() -> None:
    text = "Bearer abcdefghijklmnopqrstuvwxyz student@example.com guest_device_token=abcdefghijklmnopqrstuvwxyz"

    redacted = redact_sensitive(text)

    assert "[REDACTED]" in redacted
    assert "student@example.com" not in redacted
    assert "abcdefghijklmnopqrstuvwxyz" not in redacted


def test_scrub_mapping_drops_sensitive_nested_keys() -> None:
    scrubbed = scrub_mapping(
        {
            "requestId": "req-1",
            "headers": {
                "authorization": "Bearer abcdefghijklmnopqrstuvwxyz",
                "cookie": "guest_device_token=abcdefghijklmnopqrstuvwxyz",
            },
            "nested": {
                "email": "student@example.com",
                "prompt": "ES本文",
            },
        }
    )

    assert scrubbed == {
        "requestId": "req-1",
        "headers": {
            "authorization": "[DROPPED]",
            "cookie": "[DROPPED]",
        },
        "nested": {
            "email": "[REDACTED]",
            "prompt": "[DROPPED]",
        },
    }


def test_scrub_value_handles_exceptions_without_leaking_tokens() -> None:
    error = RuntimeError("token=abcdefghijklmnopqrstuvwxyz")

    scrubbed = scrub_value(error)

    assert "[REDACTED]" in str(scrubbed)
    assert "abcdefghijklmnopqrstuvwxyz" not in str(scrubbed)


def test_scrub_exception_is_json_safe() -> None:
    scrubbed = scrub_exception(ValueError("student@example.com"))

    assert scrubbed["name"] == "ValueError"
    assert scrubbed["message"] == "[REDACTED]"
