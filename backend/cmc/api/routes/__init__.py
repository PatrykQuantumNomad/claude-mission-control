"""Router aggregation. Each new resource adds its router here.

Phase 1: only health.
Phase 2 will add: ingestion sync route.
Phase 3 will add: sessions, observability, mcp, skills routers.
Phase 4 will add: hitl (decisions, inbox), tasks, schedules, system routers.
"""
from fastapi import APIRouter

from cmc.api.routes.health import router as health_router


def all_routers() -> list[APIRouter]:
    """Return every router that should be mounted under /api."""
    return [health_router]
