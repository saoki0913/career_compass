"""
Distributed Rate Limiter for pytest-xdist workers.

Uses file-based locking to coordinate API calls across parallel test workers.
Implements token bucket algorithm for rate limiting.
"""

import json
import time
import random
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional, Callable, TypeVar, Any
import asyncio
import logging

from filelock import FileLock, Timeout

logger = logging.getLogger(__name__)

# Rate limiter configuration
RATE_LIMITER_DIR = Path("/tmp/pytest_rate_limiter")
LOCK_FILE = RATE_LIMITER_DIR / "ddg_rate.lock"
STATE_FILE = RATE_LIMITER_DIR / "ddg_rate.state"

# Token bucket parameters
TOKENS_PER_SECOND = 4.0  # Refill rate
MAX_TOKENS = 4.0  # Bucket capacity
LOCK_TIMEOUT = 5.0  # Seconds to wait for lock

# Backoff configuration
MAX_RETRIES = 3
BASE_BACKOFF = 2.0  # Base wait time in seconds
MAX_BACKOFF = 8.0  # Maximum wait time

T = TypeVar("T")


@dataclass
class RateLimiterState:
    """Shared state for distributed rate limiting."""

    last_request_time: float = 0.0
    tokens: float = MAX_TOKENS
    request_count: int = 0
    error_count: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "RateLimiterState":
        return cls(**json.loads(data))


class DistributedRateLimiter:
    """
    Cross-process rate limiter using file-based locking.

    Implements token bucket algorithm synchronized across pytest-xdist workers.
    """

    def __init__(
        self,
        tokens_per_second: float = TOKENS_PER_SECOND,
        max_tokens: float = MAX_TOKENS,
        lock_timeout: float = LOCK_TIMEOUT,
    ):
        self.tokens_per_second = tokens_per_second
        self.max_tokens = max_tokens
        self.lock_timeout = lock_timeout

        # Ensure directory exists
        RATE_LIMITER_DIR.mkdir(parents=True, exist_ok=True)

        self.lock = FileLock(str(LOCK_FILE), timeout=lock_timeout)

    def _load_state(self) -> RateLimiterState:
        """Load shared state from file."""
        try:
            if STATE_FILE.exists():
                return RateLimiterState.from_json(STATE_FILE.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            pass
        return RateLimiterState()

    def _save_state(self, state: RateLimiterState):
        """Save shared state to file."""
        STATE_FILE.write_text(state.to_json())

    def _refill_tokens(self, state: RateLimiterState) -> RateLimiterState:
        """Refill tokens based on elapsed time."""
        now = time.time()
        elapsed = now - state.last_request_time

        # Add tokens based on elapsed time
        new_tokens = min(
            self.max_tokens, state.tokens + (elapsed * self.tokens_per_second)
        )

        state.tokens = new_tokens
        state.last_request_time = now
        return state

    async def acquire(self) -> bool:
        """
        Acquire a token for making an API request.

        Returns True if token acquired, False if rate limit hit.
        Blocks until token is available or timeout.
        """
        max_attempts = 10  # Prevent infinite recursion

        for _ in range(max_attempts):
            try:
                with self.lock:
                    state = self._load_state()
                    state = self._refill_tokens(state)

                    if state.tokens >= 1.0:
                        # Consume token
                        state.tokens -= 1.0
                        state.request_count += 1
                        self._save_state(state)
                        return True
                    else:
                        # Calculate wait time for next token
                        wait_time = (1.0 - state.tokens) / self.tokens_per_second
                        self._save_state(state)

                # Wait outside the lock
                await asyncio.sleep(wait_time + 0.01)  # Small buffer

            except Timeout:
                logger.warning("Rate limiter lock timeout")
                await asyncio.sleep(0.1)

        return False

    def record_error(self):
        """Record an API error (e.g., 429)."""
        try:
            with self.lock:
                state = self._load_state()
                state.error_count += 1
                # Reduce tokens on error to slow down
                state.tokens = max(0, state.tokens - 2)
                self._save_state(state)
        except Timeout:
            pass

    def get_stats(self) -> dict:
        """Get current rate limiter statistics."""
        try:
            with self.lock:
                state = self._load_state()
                return asdict(state)
        except Timeout:
            return {}

    @classmethod
    def reset(cls):
        """Reset rate limiter state (call at test session start)."""
        RATE_LIMITER_DIR.mkdir(parents=True, exist_ok=True)
        state = RateLimiterState()
        STATE_FILE.write_text(state.to_json())


async def rate_limited_request(
    func: Callable[..., T],
    *args: Any,
    rate_limiter: Optional[DistributedRateLimiter] = None,
    max_retries: int = MAX_RETRIES,
    **kwargs: Any,
) -> T:
    """
    Execute an async function with rate limiting and retry logic.

    Args:
        func: Async function to call
        rate_limiter: DistributedRateLimiter instance
        max_retries: Maximum retry attempts on 429 errors
        *args, **kwargs: Arguments to pass to func

    Returns:
        Result from func

    Raises:
        Exception: After max_retries exhausted
    """
    if rate_limiter is None:
        rate_limiter = DistributedRateLimiter()

    last_exception = None

    for attempt in range(max_retries + 1):
        # Acquire rate limit token
        await rate_limiter.acquire()

        try:
            result = await func(*args, **kwargs)
            return result

        except Exception as e:
            last_exception = e
            error_str = str(e).lower()

            # Check for rate limit error (429)
            if "429" in error_str or "rate" in error_str or "too many" in error_str:
                rate_limiter.record_error()

                if attempt < max_retries:
                    # Exponential backoff with jitter
                    backoff = min(BASE_BACKOFF * (2**attempt), MAX_BACKOFF)
                    jitter = random.uniform(0, backoff / 2)
                    wait_time = backoff + jitter

                    logger.warning(
                        f"Rate limit hit (attempt {attempt + 1}/{max_retries + 1}), "
                        f"waiting {wait_time:.1f}s"
                    )
                    await asyncio.sleep(wait_time)
                    continue

            # Re-raise non-rate-limit errors
            raise

    raise Exception(
        f"Max retries ({max_retries}) exceeded for rate-limited request: {last_exception}"
    )
