"""Shared SSE helpers for SAPI-05 firehose and SESS-05 live stream.

Per RESEARCH §3 + Pitfall 1 (memory leak from un-disposed generators) and
Pitfall 3 (cursor lifetime in long-running SSE generator):
  - Always check `await request.is_disconnected()` each loop iteration.
  - Exhaust query results to a list before sleeping (no held cursors).
  - Cap loop duration (60 minutes) — clients reconnect.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.otel_events import OtelEvent

SSE_POLL_INTERVAL_S = 1.0
SSE_MAX_DURATION_S = 60 * 60  # 1 hour cap (Pitfall 1)
SSE_BATCH_LIMIT = 100


async def tail_otel_events(
    request: Request,
    db: AsyncSession,
    *,
    since_id: int | None = None,
    event_name: str | None = None,
) -> AsyncIterator[dict]:
    """Yield SSE-formatted dicts ({event, data, id}) for new otel_events.

    Generator exits cleanly when:
      - request.is_disconnected() (client closed)
      - SSE_MAX_DURATION_S reached (client should reconnect)
    """
    last_id = since_id or 0
    if last_id == 0:
        # default: start at MAX(id) - 100, so reconnects don't replay history
        row = await db.execute(select(func.coalesce(func.max(OtelEvent.id), 0)))
        last_id = max(0, (row.scalar_one() or 0) - 100)
    start = datetime.now(UTC)
    while True:
        if await request.is_disconnected():
            return
        if (datetime.now(UTC) - start).total_seconds() > SSE_MAX_DURATION_S:
            return
        stmt = select(OtelEvent).where(OtelEvent.id > last_id)
        if event_name:
            stmt = stmt.where(OtelEvent.event_name == event_name)
        stmt = stmt.order_by(OtelEvent.id.asc()).limit(SSE_BATCH_LIMIT)
        rows = (await db.execute(stmt)).scalars().all()
        for row in rows:
            last_id = row.id
            yield {
                "event": "otel",
                "id": str(row.id),
                "data": json.dumps(
                    {
                        "id": row.id,
                        "ts": row.ts.isoformat() if row.ts else None,
                        "event_name": row.event_name,
                        "session_id": row.session_id,
                        "attrs_mcp_server": row.attrs_mcp_server,
                        "attrs_mcp_tool": row.attrs_mcp_tool,
                    },
                    separators=(",", ":"),
                ),
            }
        await asyncio.sleep(SSE_POLL_INTERVAL_S)
