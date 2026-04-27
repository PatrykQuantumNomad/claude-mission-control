"""DISP-04 part 2 — autonomy gate.

Enforces the per-skill autonomy contract for the heartbeat fan-out: a skill
declares `autonomy=auto|review|manual` and the gate either lets the runner
spawn ('proceed') or PATCHes the task to `awaiting_approval` ('block').

Pitfall 12 (conservative-by-default): unknown autonomy values fall back to
'manual' (block). NEVER treat unknown as 'auto' — that would silently widen
the trust radius for misconfigured skills.

Contract (Plan 08-04 Truth #6):
- skill is None → ('proceed', None). No-skill tasks bypass the gate.
- skill.autonomy='auto' → ('proceed', None).
- skill.autonomy='review' → ('block', 'review'); task → 'awaiting_approval'.
- skill.autonomy='manual' → ('block', 'manual'); task → 'awaiting_approval'.
- skill.autonomy=<anything else> → ('block', 'manual') (Pitfall 12).
"""
from __future__ import annotations

import logging
from typing import Any, Mapping, Optional

from sqlalchemy import update as _upd

from cmc.db.models.tasks import Task

log = logging.getLogger(__name__)


async def check_autonomy(
    task_row: Mapping[str, Any],
    skill: Optional[Any],
    sessions,
) -> tuple[str, Optional[str]]:
    """Returns ('proceed'|'block', reason|None).

    Args:
        task_row: Mapping with at least 'id'. Used to scope the PATCH on block.
        skill: Optional Skill ORM instance (or anything with a `.autonomy` attr).
        sessions: async_sessionmaker — used to open a session for the PATCH on
                  block. Not touched on proceed.

    Returns:
        On proceed: ('proceed', None).
        On block:   ('block', 'review') or ('block', 'manual').

    Side effects (block path only):
        UPDATEs `tasks.status='awaiting_approval'` for the given task_id and
        commits in a fresh AsyncSession.
    """
    if skill is None:
        return ("proceed", None)
    autonomy = (getattr(skill, "autonomy", None) or "manual").lower()
    if autonomy == "auto":
        return ("proceed", None)

    # review, manual, or unknown → all block.
    reason = "review" if autonomy == "review" else "manual"
    task_id = int(task_row["id"])
    async with sessions() as db:
        await db.execute(
            _upd(Task)
            .where(Task.id == task_id)
            .values(status="awaiting_approval", ended_at=None)
        )
        await db.commit()
    log.info(
        "dispatcher.autonomy_gate.blocked",
        extra={"task_id": task_id, "reason": reason},
    )
    return ("block", reason)
