from app.observability.sentry_setup import scrub_sentry_value


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
