"""DISP-01 one-cycle orchestrator.

Plan 08-01 shipped the orchestration shell. Plan 08-04 finalizes the per-task
fan-out: for each claimed row we resolve the skill (Haiku router for unassigned
tasks), check the autonomy gate (review/manual → awaiting_approval), then spawn
either run_classic or run_stream in a thread keyed on `execution_mode`.

Order of operations (see SAPI-04 + Pitfall 5 + Pitfall 7):
  1. Build engine + sessionmaker (per-cycle; FastAPI's engine lives elsewhere).
  2. Stamp tick FIRST (try/finally so SAPI-04 sees liveness on partial failure).
  3. Emergency-stop check → early return 0 if `system_state.emergency_stop=='1'`.
  4. Sweep stale PIDs → set[int] of live pids.
  5. Materialize due schedules (writes new pending Task rows).
  6. Claim up to (max_concurrent - len(live_pids)) pending tasks atomically.
  7. Per-task fan-out:
     a. Resolve skill (pick_skill if task.skill is None) — persist to DB.
     b. Autonomy gate (skill.autonomy review/manual → block + awaiting_approval).
     c. Mode-aware runner spawn (interactive/classic → run_classic; stream → run_stream).
     d. Each runner runs in its own non-daemon thread; cycle joins all before return.

The tick stamp is wrapped in try/finally so it ALWAYS runs even when sweep /
claim / materialize raises — SAPI-04's liveness check would otherwise silently
fail when the dispatcher is wedged.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy import update as _upd

from cmc.config import load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.db.models.skills import Skill
from cmc.db.models.system_state import SystemState
from cmc.db.models.tasks import Task
from cmc.dispatcher.autonomy_gate import check_autonomy
from cmc.dispatcher.claim import claim_pending_tasks
from cmc.dispatcher.materialize import materialize_due_schedules
from cmc.dispatcher.run_classic import run_classic
from cmc.dispatcher.run_stream import run_stream
from cmc.dispatcher.skill_router import pick_skill
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

            # 7. Per-task fan-out (Plan 08-04 finalizes the Plan-01 TODO).
            threads: list[threading.Thread] = []
            for row in claimed:
                # 7a. Resolve skill (router pick + DB persist for unassigned).
                row, skill = await _resolve_skill_for_task(row, sessions)

                # 7b. Autonomy gate.
                decision, reason = await check_autonomy(row, skill, sessions)
                if decision == "block":
                    log.info(
                        "dispatcher.fan_out.blocked",
                        extra={"task_id": row.get("id"), "reason": reason},
                    )
                    continue

                # 7c. Mode → runner. RESEARCH §A8: interactive maps to classic.
                mode = (row.get("execution_mode") or "classic").lower()
                if mode == "stream":
                    target = run_stream
                else:
                    # 'classic', 'interactive', or unknown → classic.
                    target = run_classic

                t = threading.Thread(
                    target=target,
                    args=(row, settings, sessions),
                    kwargs={"skill": skill},
                    daemon=False,
                    name=f"dispatcher-{mode}-{row.get('id')}",
                )
                t.start()
                threads.append(t)

            # 7d. Cycle ends when ALL runner threads exit (each is bounded by
            # per-task timeouts: dispatcher_classic_timeout_s / decision timeout).
            for t in threads:
                t.join()

            return 0
        finally:
            # Plan 01 contract: tick stamp at top runs even on exception. No
            # additional stamp here — sequence kept minimal so the try/finally
            # boundary unambiguously protects the early stamp_tick call.
            pass
    finally:
        await engine.dispose()


async def _resolve_skill_for_task(
    task_row: dict, sessions
) -> tuple[dict, Optional[Skill]]:
    """Returns (possibly-rebuilt task_row dict, resolved Skill or None).

    If task.skill is unset: ask the router (Haiku), persist the chosen name
    to the DB, and return a NEW dict with skill populated. Caller MUST
    reassign — Python dict mutation in a helper does NOT propagate back to
    the caller's `row` variable, so we return a rebuilt dict explicitly.

    DB row is the source of truth for `tasks.skill`; idempotent re-runs that
    encounter the just-persisted value skip the router call entirely.
    """
    task_skill_name = task_row.get("skill")
    if not task_skill_name:
        # DISP-11: ask Haiku for an unassigned task.
        async with sessions() as db:
            picked = await pick_skill(
                db,
                task_row.get("title") or "",
                task_row.get("description") or "",
            )
        if not picked:
            return (dict(task_row), None)
        task_skill_name = picked
        # Persist the chosen skill on the task (DB is source of truth;
        # idempotent re-runs skip the router call).
        async with sessions() as db:
            await db.execute(
                _upd(Task)
                .where(Task.id == int(task_row["id"]))
                .values(skill=task_skill_name)
            )
            await db.commit()
        # Rebuild the in-memory row dict so downstream sees the chosen skill.
        new_row = dict(task_row)
        new_row["skill"] = task_skill_name
        task_row = new_row
    async with sessions() as db:
        skill = (
            await db.execute(select(Skill).where(Skill.name == task_skill_name))
        ).scalar_one_or_none()
    return (dict(task_row), skill)
