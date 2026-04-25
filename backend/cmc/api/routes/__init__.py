"""Router aggregation. Each new resource adds its router here.

Two router groups, each with a different mount strategy:

  all_routers()  -> mounted under /api  (ordinary application API)
  raw_routers()  -> mounted at root      (paths fixed by an external spec)

Phase 1: only health (under /api).
Phase 2 added: ingest router (Plan 02-03) at root because the OTLP/HTTP spec
fixes the paths at /v1/logs and /v1/metrics, and Phase 2 will also add a
sync route under /api (Plan 02-05).
Phase 3 will add: sessions, observability, mcp, skills routers (under /api).
Phase 4 will add: hitl (decisions, inbox), tasks, schedules, system routers
(under /api).
"""
from fastapi import APIRouter

from cmc.api.routes.health import router as health_router
from cmc.api.routes.ingest import router as ingest_router


def all_routers() -> list[APIRouter]:
    """Routers mounted under the /api prefix."""
    return [health_router]


def raw_routers() -> list[APIRouter]:
    """Routers mounted at root (no /api prefix).

    Used for paths whose URL is fixed by an external contract — currently
    OTLP/HTTP /v1/logs and /v1/metrics (Plan 02-03). These MUST still be
    registered BEFORE the SPA static mount in the factory (Pitfall 8).
    """
    return [ingest_router]
