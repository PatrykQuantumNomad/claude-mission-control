"""FastAPI app factory.

Per CONTEXT.md: builder pattern, routers-per-resource, lifespan, pretty error UX.
Per RESEARCH.md Pitfall 8: routers MUST register BEFORE any static mount. Plan 07
adds the SPAStaticFiles mount AFTER the routers registered here.
"""
from __future__ import annotations

from fastapi import FastAPI

from cmc.api.routes import all_routers
from cmc.app.lifespan import lifespan
from cmc.config import Settings, load_settings
from cmc.core import configure_logging, register_error_handlers


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create and return the configured FastAPI application.

    If `settings` is None, loads from env/.env via Plan 02's load_settings()
    (which exits cleanly with pretty error on invalid config).
    """
    settings = settings or load_settings()
    configure_logging(settings)

    app = FastAPI(
        title="Claude Mission Control",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings

    register_error_handlers(app)

    # Routers FIRST (per Pitfall 8). Plan 07 adds SPAStaticFiles mount LAST.
    for router in all_routers():
        app.include_router(router, prefix="/api")

    # NOTE: Plan 07 will mount SPAStaticFiles at "/" here.
    # Do NOT mount static in Plan 06 — frontend/dist may not exist yet.

    return app
