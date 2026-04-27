"""DISP-01 atomic claim under SQLite WAL.

Contract: two overlapping run_one_cycle invocations must NEVER double-claim a row.
We rely on SQLite's WAL serialization of writers — `BEGIN IMMEDIATE` grabs the
write lock; the second cycle waits (busy_timeout=5000) and re-evaluates the
SELECT after the first cycle commits.

Locked pattern: takes the AsyncEngine (NOT a session). Reasoning:
  - SQLAlchemy 2.0 AsyncSession auto-begins a DEFERRED transaction on first
    execute, which conflicts with explicit `BEGIN IMMEDIATE`.
  - engine.connect() gives us a Connection that hasn't begun a transaction yet,
    so we issue `BEGIN IMMEDIATE` ourselves before any auto-BEGIN.
  - engine.begin() opens a DEFERRED transaction implicitly — also conflicting.

If `BEGIN IMMEDIATE` ever errors due to dialect changes, the documented fallback
is `engine.connect().execution_options(isolation_level="SERIALIZABLE")`, which
on SQLite maps to `BEGIN IMMEDIATE`. The contract — "no double-claim across
overlapping cycles" — is what matters; both routes deliver atomic semantics.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

# Two-step claim: SELECT-then-UPDATE. We use a sub-SELECT inside UPDATE...IN
# (...) so the LIMIT is applied to the SELECT, then UPDATE...RETURNING fetches
# the full row payload. SQLite supports UPDATE...RETURNING in 3.35+.
_CLAIM_SQL = text(
    """
    UPDATE tasks
       SET status = 'running',
           started_at = :now
     WHERE id IN (
         SELECT id FROM tasks
          WHERE status = 'pending'
            AND (scheduled_for IS NULL OR scheduled_for <= :now)
          ORDER BY priority ASC, created_at ASC
          LIMIT :slots
     )
    RETURNING *
    """
)


async def claim_pending_tasks(engine: AsyncEngine, slots: int) -> list[dict]:
    """Atomic claim. Returns rows as plain dicts; never raises on slots <= 0.

    The returned dicts contain every column on tasks (id, title, status,
    priority, started_at, etc.). Callers route by execution_mode.
    """
    if slots <= 0:
        return []
    now = datetime.now(timezone.utc)
    async with engine.connect() as conn:
        # Manually upgrade the transaction from DEFERRED (auto-BEGIN default) to
        # IMMEDIATE by issuing BEGIN IMMEDIATE BEFORE any other statement runs.
        await conn.execute(text("BEGIN IMMEDIATE"))
        try:
            result = await conn.execute(_CLAIM_SQL, {"now": now, "slots": int(slots)})
            rows = [dict(r) for r in result.mappings().all()]
            await conn.commit()
            return rows
        except Exception:
            await conn.rollback()
            raise
