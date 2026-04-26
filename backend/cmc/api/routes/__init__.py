"""Router aggregation. Each new resource adds its router here.

Two router groups, each with a different mount strategy:

  all_routers()  -> mounted under /api  (ordinary application API)
  raw_routers()  -> mounted at root      (paths fixed by an external spec)

Phase 1: only health (under /api).
Phase 2 added: ingest router (Plan 02-03) at root because the OTLP/HTTP spec
fixes the paths at /v1/logs and /v1/metrics, and sync router (Plan 02-05)
under /api for the manual ingestion trigger (INGST-10).
Phase 3 Wave 1 adds: system (Plan 03-02), sessions (Plan 03-03),
observability (Plan 03-04), mcp + skills (Plan 03-05) routers (under /api).
Phase 4 will add: hitl (decisions, inbox), tasks, schedules routers
(under /api).
"""
from fastapi import APIRouter

from cmc.api.routes.health import router as health_router
from cmc.api.routes.ingest import router as ingest_router
from cmc.api.routes.mcp import router as mcp_router
from cmc.api.routes.observability import router as observability_router
from cmc.api.routes.sessions import router as sessions_router
from cmc.api.routes.skills import router as skills_router
from cmc.api.routes.sync import router as sync_router
from cmc.api.routes.system import router as system_router


def all_routers() -> list[APIRouter]:
    """Routers mounted under the /api prefix."""
    return [
        health_router,
        sync_router,
        mcp_router,
        sessions_router,
        observability_router,
        system_router,
        skills_router,
    ]


def raw_routers() -> list[APIRouter]:
    """Routers mounted at root (no /api prefix).

    Used for paths whose URL is fixed by an external contract — currently
    OTLP/HTTP /v1/logs and /v1/metrics (Plan 02-03). These MUST still be
    registered BEFORE the SPA static mount in the factory (Pitfall 8).
    """
    return [ingest_router]
