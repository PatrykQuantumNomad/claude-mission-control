"""Configurable fixed-window rate limiting middleware."""

import hashlib
import importlib
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cmc.middleware.proxy import (
    get_forwarded_client_ip,
    is_trusted_proxy,
    parse_trusted_proxies,
)


@dataclass(slots=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_at_epoch: int


class RateLimitStore(ABC):
    @abstractmethod
    async def hit(self, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        """Record a hit and return the current rate-limit decision."""


class MemoryRateLimitStore(RateLimitStore):
    def __init__(self) -> None:
        self._buckets: dict[str, tuple[int, int]] = {}

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        now = int(time.time())
        bucket = now // window_seconds
        self._prune_expired_buckets(bucket)
        bucket_key = f"{key}:{bucket}"
        _, current_count = self._buckets.get(bucket_key, (bucket, 0))
        current_count += 1
        self._buckets[bucket_key] = (bucket, current_count)
        reset_at = (bucket + 1) * window_seconds
        return RateLimitDecision(
            allowed=current_count <= limit,
            limit=limit,
            remaining=max(limit - current_count, 0),
            reset_at_epoch=reset_at,
        )

    def _prune_expired_buckets(self, current_bucket: int) -> None:
        expired_keys = [
            bucket_key
            for bucket_key, (bucket, _) in self._buckets.items()
            if bucket < current_bucket
        ]
        for bucket_key in expired_keys:
            self._buckets.pop(bucket_key, None)


class RedisRateLimitStore(RateLimitStore):
    def __init__(self, storage_url: str) -> None:
        try:
            redis_asyncio = importlib.import_module("redis.asyncio")
        except ImportError:
            raise ImportError(
                "The 'redis' package is required for Redis-backed rate limiting. "
                "Install it with: uv sync --extra redis"
            ) from None
        self._client: Any = redis_asyncio.from_url(
            storage_url, encoding="utf-8", decode_responses=True
        )

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        now = int(time.time())
        bucket = now // window_seconds
        reset_at = (bucket + 1) * window_seconds
        redis_key = f"rate_limit:{bucket}:{key}"
        count = await self._client.incr(redis_key)
        if count == 1:
            await self._client.expire(redis_key, window_seconds)
        return RateLimitDecision(
            allowed=count <= limit,
            limit=limit,
            remaining=max(limit - count, 0),
            reset_at_epoch=reset_at,
        )


class RateLimitMiddleware:
    """Apply fixed-window rate limiting before route handlers execute."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limit: int,
        window_seconds: int,
        key_strategy: str,
        storage_url: str,
        trust_proxy_headers: bool,
        proxy_headers: list[str],
        trusted_proxies: list[str],
        exempt_paths: list[str],
    ) -> None:
        self.app = app
        self.limit = limit
        self.window_seconds = window_seconds
        self.key_strategy = key_strategy
        self.storage_url = storage_url
        self.trust_proxy_headers = trust_proxy_headers
        self.proxy_headers = [header.lower() for header in proxy_headers]
        self.trusted_proxies = parse_trusted_proxies(trusted_proxies)
        self.exempt_paths = set(exempt_paths)
        self.store: RateLimitStore = (
            RedisRateLimitStore(storage_url) if storage_url else MemoryRateLimitStore()
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        decision = await self.store.hit(
            self._build_key(scope),
            self.limit,
            self.window_seconds,
        )
        if not decision.allowed:
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limited",
                    "detail": "Request rate limit exceeded",
                    "retry_after_seconds": max(decision.reset_at_epoch - int(time.time()), 0),
                },
                headers=_decision_headers(decision),
            )
            await response(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(raw=message.setdefault("headers", []))
                for key, value in _decision_headers(decision).items():
                    headers[key] = value
            await send(message)

        await self.app(scope, receive, send_wrapper)

    def _build_key(self, scope: Scope) -> str:
        headers = Headers(raw=scope.get("headers", []))
        if self.key_strategy == "authorization":
            authorization = headers.get("authorization")
            if authorization:
                token = (
                    authorization[7:].strip()
                    if authorization.lower().startswith("bearer ")
                    else authorization
                )
                digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
                return f"authorization:{digest}"

        client = scope.get("client")
        client_host = client[0] if client else "unknown"
        if self.trust_proxy_headers and is_trusted_proxy(client_host, self.trusted_proxies):
            forwarded_ip = get_forwarded_client_ip(
                headers, self.proxy_headers, self.trusted_proxies
            )
            if forwarded_ip:
                return f"ip:{forwarded_ip}"
        return f"ip:{client_host}"


def _decision_headers(decision: RateLimitDecision) -> dict[str, str]:
    return {
        "X-RateLimit-Limit": str(decision.limit),
        "X-RateLimit-Remaining": str(decision.remaining),
        "X-RateLimit-Reset": str(decision.reset_at_epoch),
        "Retry-After": str(max(decision.reset_at_epoch - int(time.time()), 0)),
    }
