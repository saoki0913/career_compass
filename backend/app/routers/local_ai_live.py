from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.security.career_principal import CareerPrincipal, require_career_principal, require_tenant_key

router = APIRouter(prefix="/internal/local-ai-live", tags=["local-ai-live"])

LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def _ensure_local_host(request: Request) -> None:
    host = (request.url.hostname or "").strip().lower()
    if host not in LOCAL_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="local ai live principal preflight is only available on localhost",
        )


@router.get("/principal-preflight/ai-stream")
async def principal_preflight_ai_stream(
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("ai-stream")),
):
    _ensure_local_host(request)
    return {
        "success": True,
        "scope": principal.scope,
        "actorKind": principal.actor_kind,
        "actorId": principal.actor_id,
        "plan": principal.plan,
        "companyId": principal.company_id,
    }


@router.get("/principal-preflight/company")
async def principal_preflight_company(
    request: Request,
    principal: CareerPrincipal = Depends(require_career_principal("company")),
):
    _ensure_local_host(request)
    require_tenant_key(principal)
    return {
        "success": True,
        "scope": principal.scope,
        "actorKind": principal.actor_kind,
        "actorId": principal.actor_id,
        "plan": principal.plan,
        "companyId": principal.company_id,
        "tenantKeyConfigured": True,
    }
