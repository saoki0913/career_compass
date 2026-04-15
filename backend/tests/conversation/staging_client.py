"""
Async HTTP client for authenticated API calls to the staging (Next.js) server.

Replaces Playwright's page.context().request.fetch() with pure httpx.
Used by AI Live conversation tests (gakuchika, motivation, interview) to
call Next.js API routes on the staging server.

Auth flow mirrors e2e/google-auth.ts:188-237 and e2e/fixtures/auth.ts.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

import httpx

# Cookie names — must stay in sync with src/lib/auth/ci-e2e.ts
_DEFAULT_SESSION_COOKIE = "better-auth.session_token"
_SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token"
_CSRF_COOKIE = "csrf_token"
_CSRF_HEADER = "x-csrf-token"

# Methods that require CSRF protection
_STATE_CHANGING_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _is_https(base_url: str) -> bool:
    return urlparse(base_url).scheme == "https"


def _session_cookie_candidates(base_url: str) -> list[str]:
    """
    Return the ordered list of session cookie names to look for.

    For HTTPS the __Secure- prefixed name is primary (and better-auth may set
    both), so we check both.  For HTTP only the unprefixed name is issued.

    Mirrors getBetterAuthSessionCookieCandidates() in src/lib/auth/ci-e2e.ts.
    """
    if _is_https(base_url):
        return [_SECURE_SESSION_COOKIE, _DEFAULT_SESSION_COOKIE]
    return [_DEFAULT_SESSION_COOKIE]


def _parse_set_cookie(header_value: str) -> tuple[str, str] | None:
    """
    Extract (name, value) from a Set-Cookie header string.

    Example input:
        __Secure-better-auth.session_token=abc123; Path=/; HttpOnly; Secure; SameSite=Lax
    Returns:
        ("__Secure-better-auth.session_token", "abc123")
    """
    # Take only the first segment (name=value) — ignore attributes
    first_part = header_value.split(";")[0].strip()
    sep = first_part.find("=")
    if sep <= 0:
        return None
    name = first_part[:sep]
    value = first_part[sep + 1:]
    return (name, value)


def _build_cookie_header(cookies: dict[str, str]) -> str:
    """Build the Cookie header string from a name→value mapping."""
    return "; ".join(f"{name}={value}" for name, value in cookies.items() if name and value)


class StagingClient:
    """
    Async HTTP client that authenticates against the CI test-auth endpoint and
    wraps common Next.js API calls used by AI Live conversation tests.

    Usage (as an async context manager)::

        async with StagingClient() as client:
            company = await client.create_company("テスト株式会社")
            ...
            await client.delete_company(company["id"])

    Or manually::

        client = StagingClient()
        await client.authenticate()
        try:
            ...
        finally:
            await client.close()
    """

    def __init__(
        self,
        base_url: str | None = None,
        auth_secret: str | None = None,
        scope: str | None = None,
    ) -> None:
        self.base_url = (
            base_url
            or os.environ.get("AI_LIVE_BASE_URL")
            or os.environ.get("PLAYWRIGHT_BASE_URL")
            or "https://stg.shupass.jp"
        ).rstrip("/")

        self.auth_secret = auth_secret or os.environ.get("CI_E2E_AUTH_SECRET", "")
        self.scope = scope or os.environ.get("CI_E2E_SCOPE", "")

        # Manually managed cookie store: name → value
        self._cookies: dict[str, str] = {}
        self._authenticated = False

        self._http = httpx.AsyncClient(
            timeout=60.0,
            follow_redirects=True,
        )

    # ------------------------------------------------------------------
    # Lifecycle helpers
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "StagingClient":
        await self.authenticate()
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the underlying httpx client."""
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def authenticate(self) -> None:
        """
        Step 1: POST /api/internal/test-auth/login with Bearer token.
                Parse Set-Cookie headers for session cookies.
        Step 2: GET /api/csrf to obtain the csrf_token cookie.

        Mirrors ensureCiE2EAuthSession() in e2e/google-auth.ts:188-237.
        """
        if not self.auth_secret:
            raise RuntimeError(
                "CI_E2E_AUTH_SECRET is not set. "
                "Cannot authenticate against the staging test-auth endpoint."
            )

        login_headers: dict[str, str] = {
            "Authorization": f"Bearer {self.auth_secret}",
            "Content-Type": "application/json",
        }
        if self.scope:
            login_headers["x-ci-e2e-scope"] = self.scope

        response = await self._http.post(
            f"{self.base_url}/api/internal/test-auth/login",
            headers=login_headers,
        )

        if response.status_code != 200:
            body_snippet = response.text[:300]
            raise RuntimeError(
                f"CI test-auth login failed: status={response.status_code} "
                f"url={self.base_url}/api/internal/test-auth/login "
                f"body={body_snippet!r}"
            )

        # Parse Set-Cookie headers and keep the session cookies
        candidates = set(_session_cookie_candidates(self.base_url))
        for header_value in response.headers.get_list("set-cookie"):
            parsed = _parse_set_cookie(header_value)
            if parsed is None:
                continue
            name, value = parsed
            # Store all cookies (session + others like csrf_token if set here)
            self._cookies[name] = value

        # Verify at least one session cookie was obtained
        has_session = any(name in self._cookies for name in candidates)
        if not has_session:
            raise RuntimeError(
                f"CI test-auth login succeeded but no session cookie was set. "
                f"Expected one of: {sorted(candidates)}. "
                f"Received Set-Cookie names: {sorted(self._cookies.keys())}"
            )

        # Step 2: fetch CSRF token if not already present
        if _CSRF_COOKIE not in self._cookies:
            await self._fetch_csrf()

        self._authenticated = True

    async def _fetch_csrf(self) -> None:
        """
        GET /api/csrf to populate the csrf_token cookie.

        Mirrors ensureCsrfToken() in e2e/fixtures/auth.ts:163-177.
        """
        response = await self._http.get(
            f"{self.base_url}/api/csrf",
            headers={
                "Accept": "application/json",
                "Cookie": _build_cookie_header(self._cookies),
            },
        )
        for header_value in response.headers.get_list("set-cookie"):
            parsed = _parse_set_cookie(header_value)
            if parsed:
                self._cookies[parsed[0]] = parsed[1]

    # ------------------------------------------------------------------
    # Core request primitive
    # ------------------------------------------------------------------

    async def request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """
        Make an authenticated HTTP request.

        - Includes Origin, Referer, Content-Type, and Cookie headers.
        - For state-changing methods (POST/PUT/PATCH/DELETE) includes the
          x-csrf-token header; fetches the CSRF token first if missing.
        - On 401: re-authenticates once and retries.

        Mirrors apiRequestAsAuthenticatedUser() in e2e/fixtures/auth.ts:421-451.
        """
        response = await self._make_request(method, path, json)

        if response.status_code == 401 and self.auth_secret:
            # Re-authenticate and retry exactly once
            self._authenticated = False
            self._cookies.clear()
            await self.authenticate()
            response = await self._make_request(method, path, json)

        return response

    async def _make_request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None,
    ) -> httpx.Response:
        method_upper = method.upper()

        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Origin": self.base_url,
            "Referer": f"{self.base_url}/",
        }

        # Ensure CSRF token is present for state-changing requests
        if method_upper in _STATE_CHANGING_METHODS:
            if _CSRF_COOKIE not in self._cookies:
                await self._fetch_csrf()
            csrf_value = self._cookies.get(_CSRF_COOKIE, "")
            if csrf_value:
                headers[_CSRF_HEADER] = csrf_value

        cookie_header = _build_cookie_header(self._cookies)
        if cookie_header:
            headers["Cookie"] = cookie_header

        url = f"{self.base_url}{path}"

        response = await self._http.request(
            method=method_upper,
            url=url,
            headers=headers,
            json=json,
        )

        # Absorb any new cookies set by the server (e.g. refreshed session)
        for header_value in response.headers.get_list("set-cookie"):
            parsed = _parse_set_cookie(header_value)
            if parsed:
                self._cookies[parsed[0]] = parsed[1]

        return response

    # ------------------------------------------------------------------
    # Domain helpers
    # ------------------------------------------------------------------

    async def list_companies(self) -> list[dict[str, Any]]:
        """GET /api/companies — return the companies list."""
        response = await self.request("GET", "/api/companies")
        response.raise_for_status()
        data = response.json()
        # The endpoint may return {"companies": [...]} or a bare list
        if isinstance(data, list):
            return data
        return data.get("companies", data)

    async def create_company(self, name: str, industry: str = "") -> dict[str, Any]:
        """POST /api/companies — create a company and return {"id": ..., "name": ...}."""
        body: dict[str, Any] = {"name": name}
        if industry:
            body["industry"] = industry
        response = await self.request("POST", "/api/companies", json=body)
        response.raise_for_status()
        return response.json()

    async def delete_company(self, company_id: str) -> None:
        """DELETE /api/companies/{company_id}."""
        response = await self.request("DELETE", f"/api/companies/{company_id}")
        response.raise_for_status()

    async def create_application(
        self,
        company_id: str,
        name: str,
        type: str = "main",
    ) -> dict[str, Any]:
        """POST /api/companies/{company_id}/applications."""
        body: dict[str, Any] = {"name": name, "type": type}
        response = await self.request(
            "POST", f"/api/companies/{company_id}/applications", json=body
        )
        response.raise_for_status()
        return response.json()

    async def create_job_type(
        self,
        application_id: str,
        name: str,
    ) -> dict[str, Any]:
        """POST /api/applications/{application_id}/job-types."""
        body: dict[str, Any] = {"name": name}
        response = await self.request(
            "POST", f"/api/applications/{application_id}/job-types", json=body
        )
        response.raise_for_status()
        return response.json()

    async def create_gakuchika(
        self,
        title: str,
        content: str,
        char_limit_type: str = "400",
    ) -> dict[str, Any]:
        """POST /api/gakuchika — create a gakuchika entry."""
        body: dict[str, Any] = {
            "title": title,
            "content": content,
            "charLimitType": char_limit_type,
        }
        response = await self.request("POST", "/api/gakuchika", json=body)
        response.raise_for_status()
        return response.json()

    async def delete_gakuchika(self, gakuchika_id: str) -> None:
        """DELETE /api/gakuchika/{gakuchika_id}."""
        response = await self.request("DELETE", f"/api/gakuchika/{gakuchika_id}")
        response.raise_for_status()

    async def create_document(
        self,
        title: str,
        type: str,
        company_id: str | None = None,
        content: list[Any] | None = None,
    ) -> dict[str, Any]:
        """POST /api/documents — create a document (ES draft etc.)."""
        body: dict[str, Any] = {"title": title, "type": type}
        if company_id is not None:
            body["companyId"] = company_id
        if content is not None:
            body["content"] = content
        response = await self.request("POST", "/api/documents", json=body)
        response.raise_for_status()
        return response.json()

    async def delete_document(self, document_id: str) -> None:
        """DELETE /api/documents/{document_id}."""
        response = await self.request("DELETE", f"/api/documents/{document_id}")
        response.raise_for_status()
