"""DISP-07 decision answer poll — blocks until status flips or timeout elapses.

When the agent emits a DECISION: marker, run_stream INSERTs a Decision row and
calls wait_for_answer. The HITL UI / CLI / Telegram bridge POSTs an answer
which flips status to 'answered'. We poll the row every poll_s seconds until
status='answered' (return the answer string) or timeout_s elapses (return None).

Pitfall: open a FRESH session per iteration. Pinning a single AsyncSession
across `await asyncio.sleep(poll_s)` would hold a connection out of the pool
for hours under default settings.dispatcher_decision_timeout_s=3600 — fine in
isolation, dangerous under load.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from cmc.db.models.decisions import Decision

log = logging.getLogger(__name__)


async def wait_for_answer(
    sessions,
    decision_id: int,
    *,
    timeout_s: float = 3600,
    poll_s: float = 2.0,
) -> Optional[str]:
    """Poll decisions table every poll_s seconds; return answer or None on timeout.

    Args:
        sessions: async_sessionmaker (callable returning an AsyncSession context manager).
        decision_id: PK of the Decision row to watch.
        timeout_s: Total wall-clock cap for the poll loop (default 3600s = 1h).
        poll_s: Sleep between polls (default 2.0s — Settings.dispatcher_answer_poll_s).

    Returns:
        The `answer` column when status flips to 'answered' (may itself be None
        if user explicitly skipped); or None on timeout.
    """
    deadline = datetime.now(timezone.utc).timestamp() + timeout_s
    while datetime.now(timezone.utc).timestamp() < deadline:
        # Fresh session per iteration — see module docstring.
        async with sessions() as db:
            row = (
                await db.execute(select(Decision).where(Decision.id == decision_id))
            ).scalar_one_or_none()
            if row is not None and row.status == "answered":
                return row.answer  # may be None if user explicitly skipped
        await asyncio.sleep(poll_s)
    log.info("dispatcher.answer_poll.timeout", extra={"decision_id": decision_id})
    return None
