"""DISP-01 schedules→tasks materializer.

For each `enabled=True AND next_run_at <= now` Schedule, INSERT a Task row from
its task_template, then advance schedule.last_run_at = now and
schedule.next_run_at = next_run(cron, now).

Pitfall 7 (per-row defensive): a malformed task_template (typo, unknown column,
wrong type) MUST NOT abort the whole cycle. We catch TypeError per schedule,
log+skip, AND DELIBERATELY DO NOT advance next_run_at — leaves the lag visible
through SAPI-04's dispatcher_last_tick_at + schedule next_run_at comparison so
the operator notices a misconfigured schedule.

Pitfall 3 cousin (cron failure): if next_run() raises (corrupt cron string),
log + leave next_run_at alone; same SAPI-04 visibility logic applies.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.schedules import Schedule
from cmc.db.models.tasks import Task
from cmc.schedules.cron import next_run

log = logging.getLogger(__name__)


async def materialize_due_schedules(db: AsyncSession) -> list[int]:
    """Insert Task rows for every due schedule; return list of new task ids.

    Per-schedule defensive boundary (Pitfall 7): bad task_template (typo,
    unknown column, missing NOT-NULL field, type mismatch) caught + logged;
    schedule's next_run_at left untouched so SAPI-04 surfaces the lag.

    Each schedule is wrapped in a SAVEPOINT so an IntegrityError on one row
    does NOT poison the session for subsequent schedules in the same cycle.
    """
    now = datetime.now(UTC)
    due: list[Schedule] = (
        await db.execute(
            select(Schedule)
            .where(Schedule.enabled == True)  # noqa: E712 — explicit for SQLite
            .where(Schedule.next_run_at <= now)
        )
    ).scalars().all()

    created: list[int] = []
    for s in due:
        # Construct + INSERT under a savepoint per schedule (Pitfall 7).
        # TypeError can fire at construction (unknown kwarg if Pydantic strict);
        # IntegrityError at flush (NOT NULL violation, FK violation).
        try:
            sp = await db.begin_nested()
            try:
                t = Task(
                    **(s.task_template or {}),
                    schedule_id=s.id,
                    status="pending",
                    created_at=now,
                    scheduled_for=now,
                )
                db.add(t)
                await db.flush()
            except (TypeError, IntegrityError, SQLAlchemyError, ValueError) as exc:
                await sp.rollback()
                # Bad template — log + skip; do NOT advance next_run_at.
                log.error(
                    "dispatcher.materialize.bad_template",
                    extra={"schedule_id": s.id, "err": str(exc)},
                )
                continue
            else:
                await sp.commit()
        except Exception as exc:
            # Catch-all so one schedule's failure can't break the loop.
            log.exception(
                "dispatcher.materialize.unexpected",
                extra={"schedule_id": s.id, "err": str(exc)},
            )
            continue

        created.append(t.id)
        s.last_run_at = now
        try:
            s.next_run_at = next_run(s.cron, now)
        except Exception as exc:
            # Defensive: leave next_run_at where it was so operator sees the lag.
            log.error(
                "dispatcher.materialize.bad_cron",
                extra={"schedule_id": s.id, "err": str(exc)},
            )

    await db.commit()
    return created
