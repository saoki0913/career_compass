"""
DDG Search Response Snapshot Cache

SQLite-based cache for DuckDuckGo search responses.
Enables reproducible, fast test reruns without live DDG queries.

Modes:
- live_only:  No caching. All queries go to DDG.
- capture:    Queries go to DDG, responses are saved to the snapshot DB.
- fallback:   Try snapshot first; if miss, query DDG live and save.
- snapshot_only: Use only cached responses. Return empty for cache misses.

Usage in tests:
    cache = SnapshotCache(mode="fallback", db_path="path/to/snapshots.db")
    cached_search = cache.wrap(_search_ddg_async)
    monkeypatch.setattr(web_search_mod, "_search_ddg_async", cached_search)
"""

import hashlib
import json
import logging
import sqlite3
import time
from enum import Enum
from pathlib import Path
from typing import Callable, Awaitable, Optional

logger = logging.getLogger(__name__)


class SnapshotMode(Enum):
    LIVE_ONLY = "live_only"
    CAPTURE = "capture"
    FALLBACK = "fallback"
    SNAPSHOT_ONLY = "snapshot_only"


DEFAULT_DB_PATH = Path(__file__).parent.parent / "output" / "ddg_snapshots.db"


def _query_key(query: str, max_results: int) -> str:
    """Generate a deterministic cache key for a query."""
    raw = f"{query}||{max_results}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class SnapshotCache:
    """SQLite-backed DDG response snapshot cache."""

    def __init__(
        self,
        mode: str | SnapshotMode = SnapshotMode.LIVE_ONLY,
        db_path: str | Path | None = None,
    ):
        if isinstance(mode, str):
            mode = SnapshotMode(mode)
        self.mode = mode
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self._conn: Optional[sqlite3.Connection] = None
        self._stats = {"hits": 0, "misses": 0, "saves": 0, "errors": 0}

        if self.mode != SnapshotMode.LIVE_ONLY:
            self._init_db()

    def _init_db(self):
        """Initialize SQLite database and create table if needed."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path))
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                key TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                max_results INTEGER NOT NULL,
                response_json TEXT NOT NULL,
                result_count INTEGER NOT NULL,
                captured_at REAL NOT NULL
            )
            """
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_query ON snapshots(query)"
        )
        self._conn.commit()

        count = self._conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
        logger.info(
            f"[SnapshotCache] Initialized mode={self.mode.value}, "
            f"db={self.db_path}, entries={count}"
        )

    def _get_cached(self, key: str) -> Optional[list[dict]]:
        """Look up a cached response by key."""
        if self._conn is None:
            return None
        row = self._conn.execute(
            "SELECT response_json FROM snapshots WHERE key = ?", (key,)
        ).fetchone()
        if row:
            self._stats["hits"] += 1
            return json.loads(row[0])
        self._stats["misses"] += 1
        return None

    def _save(self, key: str, query: str, max_results: int, response: list[dict]):
        """Save a response to the cache."""
        if self._conn is None:
            return
        try:
            response_json = json.dumps(response, ensure_ascii=False)
            self._conn.execute(
                """
                INSERT OR REPLACE INTO snapshots
                (key, query, max_results, response_json, result_count, captured_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (key, query, max_results, response_json, len(response), time.time()),
            )
            self._conn.commit()
            self._stats["saves"] += 1
        except Exception as e:
            logger.warning(f"[SnapshotCache] Failed to save: {e}")
            self._stats["errors"] += 1

    def wrap(
        self,
        live_fn: Callable[..., Awaitable[list[dict]]],
    ) -> Callable[..., Awaitable[list[dict]]]:
        """
        Wrap a live search function with snapshot caching.

        Args:
            live_fn: The original async search function
                     (e.g., _search_ddg_async(query, max_results))

        Returns:
            Wrapped async function with the same signature.
        """

        async def wrapped(query: str, max_results: int = 8) -> list[dict]:
            key = _query_key(query, max_results)

            if self.mode == SnapshotMode.LIVE_ONLY:
                return await live_fn(query, max_results)

            if self.mode == SnapshotMode.SNAPSHOT_ONLY:
                cached = self._get_cached(key)
                if cached is not None:
                    return cached
                logger.debug(
                    f"[SnapshotCache] MISS (snapshot_only): {query[:60]}..."
                )
                return []

            if self.mode == SnapshotMode.FALLBACK:
                cached = self._get_cached(key)
                if cached is not None:
                    return cached
                # Cache miss — query live and save
                result = await live_fn(query, max_results)
                if result:  # Only cache non-empty results
                    self._save(key, query, max_results, result)
                return result

            if self.mode == SnapshotMode.CAPTURE:
                result = await live_fn(query, max_results)
                if result:  # Only cache non-empty results
                    self._save(key, query, max_results, result)
                return result

            return await live_fn(query, max_results)

        return wrapped

    @property
    def stats(self) -> dict:
        """Return cache statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0
        return {**self._stats, "total": total, "hit_rate_pct": round(hit_rate, 1)}

    def entry_count(self) -> int:
        """Return number of cached entries."""
        if self._conn is None:
            return 0
        return self._conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]

    def close(self):
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    def __del__(self):
        self.close()
