"""
Cache utilities for RAG context and ES review results.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from typing import Any, Optional

try:
    import redis.asyncio as redis
except Exception:
    redis = None  # type: ignore

from app.config import settings


def build_cache_key(*parts: str) -> str:
    """Build a stable hash key from arbitrary string parts."""
    payload = "||".join([p or "" for p in parts])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class BaseCache:
    """Base cache wrapper with JSON helpers."""

    def __init__(self, redis_url: str):
        self._enabled = bool(redis and redis_url)
        self._redis = (
            redis.from_url(redis_url, decode_responses=True) if self._enabled else None
        )

    def enabled(self) -> bool:
        return self._enabled and self._redis is not None

    async def get_json(self, key: str) -> Optional[Any]:
        if not self.enabled():
            return None
        try:
            value = await self._redis.get(key)
        except Exception as e:
            print(f"[Cache] ⚠️ get失敗: {e}")
            return None
        if not value:
            return None
        try:
            return json.loads(value)
        except Exception:
            return None

    async def set_json(self, key: str, value: Any, ttl: int) -> None:
        if not self.enabled():
            return
        try:
            await self._redis.setex(key, ttl, json.dumps(value, ensure_ascii=False))
        except Exception as e:
            print(f"[Cache] ⚠️ set失敗: {e}")

    async def delete_pattern(self, pattern: str) -> None:
        if not self.enabled():
            return
        try:
            async for key in self._redis.scan_iter(match=pattern):
                await self._redis.delete(key)
        except Exception as e:
            print(f"[Cache] ⚠️ delete失敗: {e}")


class RAGCache(BaseCache):
    """Cache for RAG context results."""

    def _context_key(self, company_id: str, query_hash: str) -> str:
        return f"rag:context:{company_id}:{query_hash}"

    async def get_context(self, company_id: str, query_hash: str) -> Optional[dict]:
        return await self.get_json(self._context_key(company_id, query_hash))

    async def set_context(
        self, company_id: str, query_hash: str, context: dict, ttl: int = 43200
    ) -> None:
        await self.set_json(self._context_key(company_id, query_hash), context, ttl)

    async def invalidate_company(self, company_id: str) -> None:
        await self.delete_pattern(f"rag:context:{company_id}:*")


class ESReviewCache(BaseCache):
    """Cache for ES review results."""

    def _review_key(self, review_hash: str) -> str:
        return f"es:review:{review_hash}"

    async def get_review(self, review_hash: str) -> Optional[dict]:
        return await self.get_json(self._review_key(review_hash))

    async def set_review(
        self, review_hash: str, review: dict, ttl: int = 86400
    ) -> None:
        await self.set_json(self._review_key(review_hash), review, ttl)


@lru_cache()
def get_rag_cache() -> Optional[RAGCache]:
    if not settings.redis_url:
        return None
    return RAGCache(settings.redis_url)


@lru_cache()
def get_es_review_cache() -> Optional[ESReviewCache]:
    if not settings.redis_url:
        return None
    return ESReviewCache(settings.redis_url)
