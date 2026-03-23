import socket

import pytest

from app.utils.public_url_guard import validate_public_url


def test_validate_public_url_rejects_private_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(*args, **kwargs):
        return [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.12", 443)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)

    result = validate_public_url("https://corp.example.com/recruit")

    assert result.allowed is False
    assert result.reason == "内部アドレスにはアクセスできません。"


def test_validate_public_url_rejects_non_standard_port(monkeypatch: pytest.MonkeyPatch) -> None:
    result = validate_public_url("https://corp.example.com:8443/recruit")
    assert result.allowed is False
    assert result.reason == "公開された HTTPS のURLのみ利用できます。"
