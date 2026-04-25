"""GET /api/health — liveness check. Phase 3 (SAPI-01) extends this; Phase 1 is minimal."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db import get_session

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    """Liveness check — confirms the DB is reachable.

    Phase 1: minimal. Phase 3 (SAPI-02) adds /api/system/health with uptime/memory/etc.
    """
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
