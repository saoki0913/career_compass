from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlparse, urljoin


@dataclass
class PublicUrlCheckResult:
    allowed: bool
    reason: str | None = None
    resolved_ips: list[str] | None = None


ALLOWED_PORTS = {None, 443}
MAX_REDIRECTS = 5


def _is_blocked_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_url(url: str) -> PublicUrlCheckResult:
    try:
        parsed = urlparse(url)
    except ValueError:
        return PublicUrlCheckResult(False, "無効なURLです。", [])

    if parsed.scheme != "https":
        return PublicUrlCheckResult(False, "公開された HTTPS のURLのみ利用できます。", [])
    if parsed.username or parsed.password:
        return PublicUrlCheckResult(False, "認証情報付きURLは利用できません。", [])
    if parsed.port not in ALLOWED_PORTS:
        return PublicUrlCheckResult(False, "公開された HTTPS のURLのみ利用できます。", [])
    if not parsed.hostname:
        return PublicUrlCheckResult(False, "無効なURLです。", [])

    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return PublicUrlCheckResult(False, "URLの安全性を確認できませんでした。", [])

    resolved_ips: list[str] = []
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        address = sockaddr[0]
        if address not in resolved_ips:
            resolved_ips.append(address)

    if not resolved_ips:
        return PublicUrlCheckResult(False, "URLの安全性を確認できませんでした。", [])
    if any(_is_blocked_ip(address) for address in resolved_ips):
        return PublicUrlCheckResult(False, "内部アドレスにはアクセスできません。", resolved_ips)

    return PublicUrlCheckResult(True, None, resolved_ips)


def resolve_redirect_url(current_url: str, location: str) -> str:
    return urljoin(current_url, location)
