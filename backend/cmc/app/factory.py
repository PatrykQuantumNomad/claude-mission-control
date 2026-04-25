"""FastAPI app factory.

Per CONTEXT.md: builder pattern, routers-per-resource, lifespan, pretty error UX.
Per RESEARCH.md Pitfall 8: routers MUST register BEFORE any static mount.

Path resolution: settings.static_dir is ABSOLUTE (Plan 02's
`model_validator(mode="after")` resolves it under repo_root()). The factory
trusts that path — if `index.html` is missing, log a warning and skip the
mount (the API still works without the SPA).
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from cmc.api.routes import all_routers
from cmc.app.lifespan import lifespan
from cmc.config import Settings, load_settings
from cmc.core import SPAStaticFiles, configure_logging, register_error_handlers

log = logging.getLogger(__name__)


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

    # Routers FIRST (per Pitfall 8: static mount at "/" would shadow them otherwise).
    for router in all_routers():
        app.include_router(router, prefix="/api")

    # SPA static mount LAST. settings.static_dir is absolute (Plan 02 model_validator).
    # If frontend/dist/index.html doesn't exist, log a warning and skip the mount
    # (API still works; the SPA is just unavailable).
    static_dir = settings.static_dir
    if static_dir.is_dir() and (static_dir / "index.html").is_file():
        app.mount(
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

    return app
