"""Health, readiness, and utility routes."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db import get_session

router = APIRouter(tags=["system"])
infrastructure_router = APIRouter()


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    """Liveness check — confirms the DB is reachable.

    Phase 1: minimal. Phase 3 (SAPI-02) adds /api/system/health with uptime/memory/etc.
    """
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


@infrastructure_router.get("/healthcheck", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Liveness probe: fast, dependency-free process check."""
    return {"status": "healthy"}


@infrastructure_router.get("/ready", tags=["Health"])
async def readiness_check(request: Request) -> JSONResponse:
    """Dependency-aware readiness probe."""
    registry = request.app.state.readiness_registry
    settings = request.app.state.settings
    results = await registry.run(request.app)
    checks = {
        result.name: result.as_payload(include_detail=settings.readiness_include_details)
        for result in results
    }
    all_healthy = all(result.is_healthy for result in results)
    return JSONResponse(
        status_code=200 if all_healthy else 503,
        content={"status": "ready" if all_healthy else "not_ready", "checks": checks},
    )


@infrastructure_router.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@infrastructure_router.get("/info", tags=["Utility"], response_model=None)
async def app_info(request: Request) -> dict[str, Any] | JSONResponse:
    settings = request.app.state.settings
    if not settings.info_endpoint_enabled:
        return JSONResponse({"error": "not found"}, status_code=404)
    return {"app": settings.app_name, "version": settings.app_version, "debug": settings.debug}


@infrastructure_router.get("/endpoints", tags=["Utility"])
async def list_endpoints(request: Request) -> JSONResponse:
    settings = request.app.state.settings
    if not settings.endpoints_listing_enabled:
        return JSONResponse({"error": "not found"}, status_code=404)
    endpoints: list[dict[str, str | list[str]]] = [
        {
            "path": route.path,
            "name": route.name,
            "methods": sorted(route.methods) if hasattr(route, "methods") else [],
        }
        for route in request.app.routes
        if hasattr(route, "path")
    ]
    return JSONResponse(content=jsonable_encoder({"endpoints": endpoints}))
