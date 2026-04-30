"""Request and correlation ID middleware."""

import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestIDMiddleware:
    """Attach a per-hop request ID and propagated correlation ID."""

    HEADER_NAME = "X-Request-ID"
    CORRELATION_HEADER_NAME = "X-Correlation-ID"

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        request_id = str(uuid.uuid4())
        correlation_id = (
            headers.get(self.CORRELATION_HEADER_NAME.lower().encode("latin-1"))
            or headers.get(self.HEADER_NAME.lower().encode("latin-1"))
            or request_id.encode("utf-8")
        ).decode("utf-8", errors="replace")

        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        state["correlation_id"] = correlation_id
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            correlation_id=correlation_id,
        )

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                mutable_headers = list(message.get("headers", []))
                self._upsert_header(
                    mutable_headers,
                    self.HEADER_NAME.encode("latin-1"),
                    request_id.encode("utf-8"),
                )
                self._upsert_header(
                    mutable_headers,
                    self.CORRELATION_HEADER_NAME.encode("latin-1"),
                    correlation_id.encode("utf-8"),
                )
                message["headers"] = mutable_headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            structlog.contextvars.clear_contextvars()

    @staticmethod
    def _upsert_header(headers: list[tuple[bytes, bytes]], key: bytes, value: bytes) -> None:
        for idx, (header_key, _) in enumerate(headers):
            if header_key.lower() == key.lower():
                headers[idx] = (header_key, value)
                return
        headers.append((key, value))
