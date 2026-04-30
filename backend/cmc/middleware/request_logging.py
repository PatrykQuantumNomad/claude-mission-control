"""Structured request logging middleware."""

import logging
from time import perf_counter
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from cmc.middleware.request_id import RequestIDMiddleware

_REDACTED = "[redacted]"


class RequestLoggingMiddleware:
    """Emit one access-style structured log record per HTTP request."""

    def __init__(
        self,
        app: ASGIApp,
        logger_name: str = "cmc.request",
        redact_headers: bool = False,
    ) -> None:
        self.app = app
        self.logger = logging.getLogger(logger_name)
        self.redact_headers = redact_headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = perf_counter()
        status_code = 500
        request_id = "-"
        correlation_id = "-"
        response_bytes: int | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code, request_id, correlation_id, response_bytes
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = {key.lower(): value for key, value in message.get("headers", [])}
                request_id = headers.get(
                    RequestIDMiddleware.HEADER_NAME.lower().encode("latin-1"), b"-"
                ).decode("utf-8", errors="replace")
                correlation_id = headers.get(
                    RequestIDMiddleware.CORRELATION_HEADER_NAME.lower().encode("latin-1"),
                    b"-",
                ).decode("utf-8", errors="replace")
                content_length = headers.get(b"content-length")
                if content_length is not None:
                    try:
                        response_bytes = int(content_length.decode("ascii"))
                    except ValueError:
                        response_bytes = None
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            headers = {key.lower(): value for key, value in scope.get("headers", [])}
            query_bytes = scope.get("query_string", b"")
            query = query_bytes.decode("utf-8", errors="replace") if query_bytes else ""
            duration_ms = (perf_counter() - start) * 1000
            client = scope.get("client")
            self.logger.info(
                "http_request_completed",
                extra={
                    "event": "http.request.completed",
                    "request_id": request_id,
                    "correlation_id": correlation_id,
                    "http_method": scope.get("method", "-"),
                    "http_path": scope.get("path", "-"),
                    "http_query": self._sanitize_query_string(query),
                    "http_status_code": status_code,
                    "http_status_class": f"{status_code // 100}xx",
                    "duration_ms": round(duration_ms, 2),
                    "client_ip": client[0] if client else "-",
                    "user_agent": self._header(headers, b"user-agent"),
                    "referer": self._header(headers, b"referer"),
                    "request_bytes": self._parse_ascii_int(headers.get(b"content-length")),
                    "response_bytes": response_bytes,
                    "outcome": self._outcome_from_status(status_code),
                },
            )

    def _header(self, headers: dict[bytes, bytes], key: bytes) -> str:
        if self.redact_headers:
            return _REDACTED
        value = headers.get(key)
        return value.decode("utf-8", errors="replace") if value is not None else "-"

    @staticmethod
    def _parse_ascii_int(value: bytes | None) -> int | None:
        if value is None:
            return None
        try:
            return int(value.decode("ascii"))
        except ValueError:
            return None

    @staticmethod
    def _outcome_from_status(status_code: int) -> str:
        if status_code >= 500:
            return "server_error"
        if status_code >= 400:
            return "client_error"
        return "success"

    @staticmethod
    def _sanitize_query_string(query_string: str) -> str:
        if not query_string:
            return ""
        return urlencode(
            [(key, "[redacted]") for key, _ in parse_qsl(query_string, keep_blank_values=True)],
            doseq=True,
        )
