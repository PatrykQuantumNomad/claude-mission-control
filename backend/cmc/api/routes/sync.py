"""POST /api/sync — manual ingestion trigger (INGST-10).

Reuses cmc.ingest.scheduler.sync_once (the same coroutine the lifespan calls
on boot and the periodic loop calls every 120s). The HTTP wrapper is
intentionally trivial: parse no body, return the summary dict as JSON.

This guarantees zero divergence between boot-sync, periodic-sync, and
manual-sync behavior — there is exactly one ingestion code path.

Response shape:
  {
    "status": "ok",
    "files_seen": int,
    "files_updated": int,
    "errors": int,
    "duration_ms": int,
  }
"""

import logging

from fastapi import APIRouter, Request

from cmc.ingest.scheduler import sync_once

log = logging.getLogger(__name__)

router = APIRouter(tags=["system"])


@router.post("/sync")
async def manual_sync(request: Request) -> dict:
    """Trigger a single sync cycle. Returns a summary dict.

    The route is `/sync` because all_routers() registers it under `/api`,
    so the actual URL is POST /api/sync.

    This endpoint lets the dashboard or operator trigger a manual re-scrape
    on demand.
    """
    summary = await sync_once(request.app.state.sessions, request.app.state.settings)
    log.info("ingest.manual_sync %s", summary)
    return {"status": "ok", **summary}
