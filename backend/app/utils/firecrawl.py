from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings
from app.utils.secure_logger import get_logger

logger = get_logger(__name__)


@dataclass
class FirecrawlScrapeResult:
    success: bool
    structured_data: dict[str, Any] | None = None
    markdown: str = ""
    html: str = ""
    raw_html: str = ""
    links: list[str] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)


async def scrape_url_with_schema(
    url: str,
    *,
    schema: dict[str, Any],
    system_prompt: str,
    prompt: str,
) -> FirecrawlScrapeResult:
    api_key = (settings.firecrawl_api_key or "").strip()
    if not api_key:
        return FirecrawlScrapeResult(
            success=False,
            diagnostics={"error": "firecrawl_not_configured"},
        )

    payload = {
        "url": url,
        "onlyMainContent": True,
        "formats": ["markdown", "html", "links", "json"],
        "parsePDF": True,
        "timeout": max(1000, int(settings.firecrawl_timeout_seconds) * 1000),
        "jsonOptions": {
            "schema": schema,
            "systemPrompt": system_prompt,
            "prompt": prompt,
        },
    }
    endpoint = f"{settings.firecrawl_base_url.rstrip('/')}/v1/scrape"

    try:
        async with httpx.AsyncClient(timeout=float(settings.firecrawl_timeout_seconds)) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        response.raise_for_status()
    except Exception as exc:
        logger.warning(f"[firecrawl] scrape failed for {url}: {exc}")
        return FirecrawlScrapeResult(
            success=False,
            diagnostics={"error": str(exc)},
        )

    body = response.json()
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        return FirecrawlScrapeResult(
            success=False,
            diagnostics={"error": "missing_data"},
        )

    structured_data = None
    json_payload = data.get("json")
    if isinstance(json_payload, dict):
        structured_data = json_payload
    elif all(key in data for key in ("deadlines", "required_documents", "application_method", "selection_process")):
        structured_data = data

    links_raw = data.get("links")
    links = [str(link).strip() for link in links_raw] if isinstance(links_raw, list) else []

    return FirecrawlScrapeResult(
        success=bool(body.get("success", True)),
        structured_data=structured_data,
        markdown=str(data.get("markdown") or ""),
        html=str(data.get("html") or ""),
        raw_html=str(data.get("rawHtml") or ""),
        links=links,
        diagnostics={
            "status_code": response.status_code,
            "warning": data.get("warning"),
        },
    )
