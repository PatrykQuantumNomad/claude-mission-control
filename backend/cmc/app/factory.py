"""FastAPI application builder and public factory."""

import logging
from typing import Self

from fastapi import Depends, FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from cmc.api.routes import all_routers, raw_routers
from cmc.api.routes.health import health_check, readiness_check
from cmc.api.routes.health import router as health_router
from cmc.app.lifespan import lifespan
from cmc.auth import get_current_principal
from cmc.config import Settings, load_settings
from cmc.core import SPAStaticFiles, configure_logging, register_error_handlers
from cmc.middleware import (
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestIDMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    TimeoutMiddleware,
)
from cmc.observability import configure_metrics, configure_tracing, instrument_fastapi_app
from cmc.observability.metrics import METRICS_PATH
from cmc.readiness import ReadinessCheckResult, ReadinessRegistry

log = logging.getLogger(__name__)


class FastAPIAppBuilder:
    """Fluent builder for the production-ready FastAPI application."""

    def __init__(
        self,
        settings: Settings | None = None,
        logger: logging.Logger | None = None,
    ) -> None:
        self.settings = settings or load_settings()
        self.logger = logger or logging.getLogger(self.settings.app_name)
        self.app = FastAPI(
            title=self.settings.app_name,
            description=self.settings.app_description,
            version=self.settings.app_version,
            debug=self.settings.debug,
            lifespan=lifespan,
            docs_url="/api/docs" if self.settings.docs_enabled else None,
            redoc_url="/api/redoc" if self.settings.redoc_enabled else None,
            openapi_url="/api/openapi.json" if self.settings.openapi_enabled else None,
        )

    def setup_logging(self) -> Self:
        """Configure application logging before middleware/routes emit logs."""
        configure_logging(self.settings)
        return self

    def setup_settings(self) -> Self:
        """Attach settings and shared service placeholders to application state."""
        self.app.state.settings = self.settings
        self.app.state.auth_service = None
        self.app.state.http_client = None
        self.app.state.readiness_registry = ReadinessRegistry()
        self.app.state.readiness_registry.register("application", _application_ready)
        return self

    def setup_error_handlers(self) -> Self:
        """Register global exception handlers."""
        register_error_handlers(self.app)
        return self

    def setup_observability(self) -> Self:
        """Configure optional tracing and metrics."""
        configure_tracing(self.settings)
        configure_metrics(self.app, self.settings)
        return self

    def setup_middleware(self) -> Self:
        """Configure middleware in the same explicit order as the chassis."""
        self.app.add_middleware(TimeoutMiddleware, timeout=self.settings.request_timeout_s)
        self.app.add_middleware(
            BodySizeLimitMiddleware,
            max_request_body_bytes=self.settings.max_request_body_bytes,
        )
        if self.settings.rate_limit_enabled:
            self.app.add_middleware(
                RateLimitMiddleware,
                limit=self.settings.rate_limit_requests,
                window_seconds=self.settings.rate_limit_window_seconds,
                key_strategy=self.settings.rate_limit_key_strategy,
                storage_url=self.settings.rate_limit_storage_url,
                trust_proxy_headers=self.settings.rate_limit_trust_proxy_headers,
                proxy_headers=self.settings.rate_limit_proxy_headers,
                trusted_proxies=self.settings.rate_limit_trusted_proxies,
                exempt_paths=[
                    self.settings.health_check_path,
                    self.settings.readiness_check_path,
                    METRICS_PATH,
                    "/favicon.ico",
                ],
            )
        self.app.add_middleware(RequestIDMiddleware)
        self.app.add_middleware(
            RequestLoggingMiddleware,
            redact_headers=self.settings.log_redact_headers,
        )
        if self.settings.security_headers_enabled:
            self.app.add_middleware(
                SecurityHeadersMiddleware,
                hsts_enabled=self.settings.security_hsts_enabled,
                hsts_max_age_seconds=self.settings.security_hsts_max_age_seconds,
                referrer_policy=self.settings.security_referrer_policy,
                permissions_policy=self.settings.security_permissions_policy,
                content_security_policy=self.settings.security_content_security_policy,
                trust_proxy_proto_header=self.settings.security_trust_proxy_proto_header,
                trusted_proxies=self.settings.security_trusted_proxies,
            )
        self.app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=self.settings.trusted_hosts,
        )
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=self.settings.cors_allowed_origins,
            allow_credentials=self.settings.cors_allow_credentials,
            allow_methods=self.settings.cors_allowed_methods,
            allow_headers=self.settings.cors_allowed_headers,
            expose_headers=self.settings.cors_expose_headers,
        )
        return self

    def setup_routes(self) -> Self:
        """Register API and raw protocol routers before the SPA catch-all."""
        for router in all_routers():
            dependencies = (
                [Depends(get_current_principal)]
                if self.settings.auth_enabled and router is not health_router
                else None
            )
            self.app.include_router(router, prefix="/api", dependencies=dependencies)
        for router in raw_routers():
            self.app.include_router(router)
        self._register_configured_health_aliases()
        instrument_fastapi_app(self.app, self.settings)
        return self

    def setup_static(self) -> Self:
        """Mount the SPA last so it cannot shadow API or protocol routes."""
        static_dir = self.settings.static_dir
        if static_dir.is_dir() and (static_dir / "index.html").is_file():
            self.app.mount(
                "/",
                SPAStaticFiles(directory=str(static_dir), html=True),
                name="spa",
            )
        else:
            log.warning(
                "Static dir %s missing or has no index.html; SPA not mounted. "
                "Run `cd frontend && npm run build` from the repo root first.",
                static_dir,
            )
        return self

    def build(self) -> FastAPI:
        """Return the fully configured FastAPI application."""
        self.logger.info(
            "%s v%s built successfully",
            self.settings.app_name,
            self.settings.app_version,
        )
        return self.app

    def _register_configured_health_aliases(self) -> None:
        if self.settings.health_check_path != "/healthcheck":
            self.app.add_api_route(self.settings.health_check_path, health_check, methods=["GET"])
        if self.settings.readiness_check_path != "/ready":
            self.app.add_api_route(
                self.settings.readiness_check_path,
                readiness_check,
                methods=["GET"],
            )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and return the configured FastAPI application."""
    return (
        FastAPIAppBuilder(settings=settings)
        .setup_logging()
        .setup_settings()
        .setup_error_handlers()
        .setup_observability()
        .setup_middleware()
        .setup_routes()
        .setup_static()
        .build()
    )


def _application_ready(app: FastAPI) -> ReadinessCheckResult:
    _ = app
    return ReadinessCheckResult.ok("application")
