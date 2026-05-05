import logging

from app.utils.secure_logger import get_logger, log_error


def test_get_logger_redacts_sensitive_message(capsys) -> None:
    logger = get_logger("test_secure_logger_redacts_sensitive_message")
    logger.error("Bearer abcdefghijklmnopqrstuvwxyz student@example.com")

    captured = capsys.readouterr()

    assert "[REDACTED]" in captured.err
    assert "student@example.com" not in captured.err
    assert "abcdefghijklmnopqrstuvwxyz" not in captured.err


def test_log_error_scrubs_nested_extra(capsys) -> None:
    log_error(
        "test_secure_logger_scrubs_nested_extra",
        RuntimeError("guest_device_token=abcdefghijklmnopqrstuvwxyz"),
        {
            "requestId": "req-1",
            "headers": {
                "authorization": "Bearer abcdefghijklmnopqrstuvwxyz",
                "cookie": "guest_device_token=abcdefghijklmnopqrstuvwxyz",
            },
            "prompt": "ES本文",
        },
    )

    captured = capsys.readouterr()

    assert "[REDACTED]" in captured.err
    assert "[DROPPED]" in captured.err
    assert "abcdefghijklmnopqrstuvwxyz" not in captured.err
    assert "ES本文" not in captured.err


def test_get_logger_keeps_single_handler() -> None:
    name = "test_secure_logger_keeps_single_handler"
    logger = get_logger(name)
    count = len(logger.handlers)
    same_logger = get_logger(name)

    assert same_logger is logger
    assert len(logger.handlers) == count
    assert logger.propagate is False
    assert logger.level in {logging.DEBUG, logging.INFO}
