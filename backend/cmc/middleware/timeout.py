"""Request timeout middleware."""

import asyncio
import logging

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger(__name__)


class TimeoutMiddleware:
    """Enforce a maximum duration for request processing."""

    def __init__(self, app: ASGIApp, timeout: float) -> None:
        self.app = app
        self.timeout = timeout

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False
        response_completed = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started, response_completed
            if message["type"] == "http.response.start":
                response_started = True
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                response_completed = True
            await send(message)

        try:
            await asyncio.wait_for(
                self.app(scope, receive, send_wrapper),
                timeout=self.timeout,
            )
        except TimeoutError:
            request = Request(scope, receive=receive)
            if response_started:
                log.warning("request timed out after response started path=%s", request.url.path)
                if not response_completed:
                    await send({"type": "http.response.body", "body": b"", "more_body": False})
                return
            response = JSONResponse(
                status_code=504,
                content={
                    "error": "gateway_timeout",
                    "detail": f"Request processing exceeded {self.timeout}s limit",
                    "path": request.url.path,
                },
            )
            await response(scope, receive, send)
