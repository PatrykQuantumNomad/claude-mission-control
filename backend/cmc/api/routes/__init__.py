"""Router aggregation. Each new resource adds its router here.

Two router groups, each with a different mount strategy:

  all_routers()  -> mounted under /api  (ordinary application API)
  raw_routers()  -> mounted at root      (paths fixed by an external spec)

The ingest router is root-mounted because the OTLP/HTTP spec fixes the
paths at /v1/logs and /v1/metrics. Application features, including sync,
system, sessions, observability, MCP, skills, context, HITL, tasks,
schedules, and notifications, are mounted under /api.
"""
from fastapi import APIRouter

# Re-export the context module under its short name so test fixtures can
# monkeypatch HOME_CLAUDE_DIR for hermetic filesystem testing.
from cmc.api.routes import context as context
from cmc.api.routes.alerts import router as alerts_router
from cmc.api.routes.context import router as context_router
from cmc.api.routes.cost import router as cost_router
from cmc.api.routes.health import infrastructure_router
from cmc.api.routes.health import router as health_router
from cmc.api.routes.hitl import router as hitl_router
from cmc.api.routes.ingest import router as ingest_router
from cmc.api.routes.mcp import router as mcp_router
from cmc.api.routes.notifications import router as notifications_router
from cmc.api.routes.observability import router as observability_router
from cmc.api.routes.schedules import router as schedules_router
from cmc.api.routes.sessions import router as sessions_router
from cmc.api.routes.skills import router as skills_router
from cmc.api.routes.sync import router as sync_router
from cmc.api.routes.system import router as system_router
from cmc.api.routes.tasks import router as tasks_router
from cmc.api.routes.views import router as views_router


def all_routers() -> list[APIRouter]:
    """Routers mounted under the /api prefix.

    Context is placed after skills, which it complements, and before
    workflow routers such as HITL, tasks, schedules, and notifications.
    """
    return [
        health_router,
        sync_router,
        mcp_router,
        sessions_router,
        observability_router,
        system_router,
        skills_router,
        context_router,
        cost_router,            # Phase 13 ANLY-04
        hitl_router,
        tasks_router,
        schedules_router,
        notifications_router,
        alerts_router,         # Phase 15 ALRT-09
        views_router,          # Phase 25 VIEW-03
    ]


def raw_routers() -> list[APIRouter]:
    """Routers mounted at root (no /api prefix).

    Used for paths whose URL is fixed by an external contract — currently
    OTLP/HTTP /v1/logs and /v1/metrics. These MUST still be registered
    BEFORE the SPA static mount in the factory.
    """
    return [infrastructure_router, ingest_router]
