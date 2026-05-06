"""Add sessions.project_key column + index + Python-loop backfill.

Revision ID: 0003_project_key
Revises: 0002_v1_1_alerts_and_skills
Create Date: 2026-05-06

Phase 19 (SKLP-08) — introduces a normalized, low-cardinality, leak-free
`project_key` column on `sessions`. The column is sha1[:12] of
`os.path.realpath(cwd.rstrip('/'))`, computed once at session-insert time
and (in this migration) backfilled from the existing `cwd` value.

Why a Python loop and not pure SQL?
    SQLite cannot resolve symlinks via SQL (no `realpath` builtin), so the
    backfill iterates the existing rows in Python, computes the canonical
    path via stdlib `os.path.realpath`, and emits an UPDATE per row.
    Migration 0002 used pure-SQL backfill (`json_extract`) for session_id
    because it stayed entirely inside SQLite's expression language; this
    migration crosses into the filesystem layer, so Python is required.

Inlined hash logic — defensive against future refactors
-------------------------------------------------------
The sha1[:12] computation below is duplicated from
`cmc.core.project_key.compute_project_key` ON PURPOSE: Alembic migrations
must remain runnable against historical revisions even after the
application module is refactored or moved. Mirrors how migration 0002
inlined its `json_extract` logic instead of importing from
`cmc.ingest.parser`. The unit tests in `tests/test_core_project_key.py`
pin the formula so the helper and the migration cannot silently diverge.

Pitfall 5 (RESEARCH.md)
-----------------------
`os.path.realpath` returns the input unchanged for path components that
don't exist on disk. Historical sessions whose `cwd` no longer exists on
disk (deleted projects) will get a "best-effort" key — current/active
projects hash correctly; deleted-project sessions may have a stale key.
This is acceptable: there is no path leakage either way, and live
analytics target active projects only.

POLI-06 note
------------
This migration performs no time-of-day logic. The deprecated stdlib
naive-UTC factory is not referenced anywhere in this module.
"""
from __future__ import annotations

import hashlib
import os
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers
revision: str = "0003_project_key"
down_revision: str | None = "0002_v1_1_alerts_and_skills"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # === 1. Add column + index via batch_alter_table (SQLite ALTER workaround)
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "project_key",
                sqlmodel.sql.sqltypes.AutoString(length=12),
                nullable=False,
                server_default="",
            )
        )
        batch_op.create_index(
            "idx_sessions_project_key", ["project_key"], unique=False
        )

    # === 2. Python-loop backfill: realpath needs filesystem access (not SQL).
    # Mirrors compute_project_key in cmc.core.project_key — INLINED here so
    # this migration remains correct against future refactors of the helper.
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT session_id, cwd FROM sessions")).fetchall()
    for sid, cwd in rows:
        if not cwd:
            continue
        canonical = os.path.realpath(cwd.rstrip("/"))
        pk = hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
        bind.execute(
            sa.text(
                "UPDATE sessions SET project_key = :pk WHERE session_id = :sid"
            ),
            {"pk": pk, "sid": sid},
        )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_index("idx_sessions_project_key")
        batch_op.drop_column("project_key")
