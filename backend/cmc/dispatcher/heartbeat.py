"""DISP-01 one-cycle orchestrator.

Plan 08-01 ships the orchestration shell. Per-task fan-out (run_classic +
run_stream) is finalized in Plan 08-04 once both runners exist; until then,
claimed rows stay in 'running' state and Plan 04's spawn logic takes over
when wired.

Order of operations (see SAPI-04 + Pitfall 5 + Pitfall 7):
  1. Build engine + sessionmaker (per-cycle; FastAPI's engine lives elsewhere).
  2. Stamp tick FIRST (try/finally so SAPI-04 sees liveness on partial failure).
  3. Emergency-stop check → early return 0 if `system_state.emergency_stop=='1'`.
  4. Sweep stale PIDs → set[int] of live pids.
  5. Materialize due schedules (writes new pending Task rows).
  6. Claim up to (max_concurrent - len(live_pids)) pending tasks atomically.
  7. Per-task fan-out — TODO Plan 04 (currently logs the count and returns).

The tick stamp is wrapped in try/finally so it ALWAYS runs even when sweep /
claim / materialize raises — SAPI-04's liveness check would otherwise silently
fail when the dispatcher is wedged.
"""
from __future__ import annotations

import logging

from sqlalchemy import select

from cmc.config import load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.db.models.system_state import SystemState
from cmc.dispatcher.claim import claim_pending_tasks
from cmc.dispatcher.materialize import materialize_due_schedules
from cmc.dispatcher.state import stamp_tick
from cmc.dispatcher.sweep import sweep_stale_pids

log = logging.getLogger(__name__)

# Historical constant; runtime resolves via Settings.dispatcher_max_concurrent.
MAX_CONCURRENT = 3


async def run_one_cycle() -> int:
    """One launchd-driven heartbeat. Returns 0 on success; nonzero unused for now.

    Re-entrancy: safe to call sequentially. Concurrent invocations are serialized
    by SQLite WAL (BEGIN IMMEDIATE in claim_pending_tasks) so cross-process
    overlap cannot double-claim a row.
    """
    settings = load_settings()
    engine = create_engine_for_settings(settings)
    sessions = make_sessionmaker(engine)

    try:
        try:
            # 2. Tick stamp FIRST so SAPI-04 sees liveness even if body raises.
            await stamp_tick(sessions)

            # 3. Emergency-stop early return.
            async with sessions() as db:
                row = (
                    await db.execute(
                        select(SystemState).where(SystemState.key == "emergency_stop")
                    )
                ).scalar_one_or_none()
            if row is not None and (row.value or "") == "1":
                log.info("dispatcher.emergency_stop_active")
                return 0

            # 4. Sweep stale PIDs.
            live_pids = sweep_stale_pids()

            # 5. Materialize due schedules into Task rows.
            async with sessions() as db:
                new_task_ids = await materialize_due_schedules(db)
            if new_task_ids:
                log.info("dispatcher.materialized", extra={"count": len(new_task_ids)})

            # 6. Compute slots; bail early if cap saturated.
            slots = max(0, settings.dispatcher_max_concurrent - len(live_pids))
            if slots == 0:
                log.info("dispatcher.no_slots", extra={"live": len(live_pids)})
                return 0

            # Pass engine directly (claim owns its own connection + BEGIN IMMEDIATE).
            claimed = await claim_pending_tasks(engine, slots)
            log.info("dispatcher.claimed", extra={"count": len(claimed)})

            # 7. TODO(Plan 08-04): per-task fan-out via run_classic / run_stream.
            #    For Plan 08-01 we end here — claimed rows stay 'running' until
            #    Plan 04 wires the runners + finalize transition.
            return 0
        finally:
            # Plan 01 contract: tick stamp at top runs even on exception. No
            # additional stamp here — sequence kept minimal so the try/finally
            # boundary unambiguously protects the early stamp_tick call.
            pass
    finally:
        await engine.dispose()
