"""Auth & cache-mode helpers for company-info router."""

from __future__ import annotations

from fastapi import HTTPException

from app.routers.company_info_config import CACHE_MODES
from app.security.career_principal import CareerPrincipal


def _normalize_cache_mode(cache_mode: str | None, fallback: str) -> str:
    if cache_mode in CACHE_MODES:
        return cache_mode
    return fallback


def _assert_principal_owns_company(
    principal: CareerPrincipal, expected_company_id: str
) -> None:
    """Enforce that the decoded principal was minted for this company_id.

    Defense-in-depth against a misbehaving BFF: the service JWT already says
    "this request came from next-bff", and this check adds "…acting on behalf
    of someone authorized for ``expected_company_id``". See V-1 in
    ``docs/review/security/security_audit_2026-04-14.md``.
    """
    if principal.company_id != expected_company_id:
        raise HTTPException(
            status_code=403,
            detail="career principal company_id mismatch",
        )
