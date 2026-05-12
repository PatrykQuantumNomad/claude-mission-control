---
phase: 25-saved-views-backend-frontend
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/cmc/db/models/saved_views.py
  - backend/cmc/db/models/__init__.py
  - backend/migrations/versions/0004_saved_views.py
  - backend/tests/test_migrations.py
autonomous: true

must_haves:
  truths:
    - "saved_views table exists after alembic upgrade head"
    - "0004_saved_views upgrade applies cleanly from 0003_project_key"
    - "0004_saved_views downgrade reverses cleanly back to 0003_project_key"
    - "Model is registered for autogenerate so future migrations detect it"
  artifacts:
    - path: "backend/cmc/db/models/saved_views.py"
      provides: "SavedView SQLModel with route, state_json (JSON), schema_version, timestamps"
      contains: "class SavedView"
    - path: "backend/migrations/versions/0004_saved_views.py"
      provides: "Alembic migration creating saved_views table + idx_saved_views_route + uq_saved_views_route_name"
      contains: "def upgrade"
    - path: "backend/cmc/db/models/__init__.py"
      provides: "Side-effect import for SavedView (autogenerate registration)"
      contains: "from cmc.db.models.saved_views import SavedView"
    - path: "backend/tests/test_migrations.py"
      provides: "test_0004_upgrade_from_0003 + test_0004_downgrade_to_0003"
      contains: "0004_saved_views"
  key_links:
    - from: "backend/cmc/db/models/__init__.py"
      to: "backend/cmc/db/models/saved_views.py"
      via: "side-effect import with # noqa: F401"
      pattern: "saved_views import SavedView"
    - from: "backend/migrations/versions/0004_saved_views.py"
      to: "backend/migrations/versions/0003_project_key.py"
      via: "down_revision chain"
      pattern: "down_revision.*0003_project_key"
    - from: "backend/cmc/app/lifespan.py"
      to: "backend/migrations/versions/0004_saved_views.py"
      via: "command.upgrade(alembic_cfg, 'head') on startup"
      pattern: "command.upgrade"
---

<objective>
Ship the `saved_views` SQLite table + its Alembic migration (VIEW-02). This is the foundation Wave 1: the model + migration must apply cleanly on `cmc start` before anything else in Phase 25 can run. Mirrors `tasks.py` model shape and `0003_project_key.py` migration shape exactly.

Purpose: Persisted, server-stored named filter combinations. Single source of truth for `state_json` blobs; opaque to backend per VIEW-02 lock.
Output: New table `saved_views` with columns `id`, `name`, `description`, `route`, `state_json` (JSON), `schema_version`, `created_at`, `updated_at`; indexes `idx_saved_views_route` and `uq_saved_views_route_name`. Migration tests confirm forward + reverse round-trip.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md

# Reference shapes — do NOT modify, just mirror
@backend/cmc/db/models/tasks.py
@backend/cmc/db/models/schedules.py
@backend/cmc/db/models/__init__.py
@backend/migrations/versions/0003_project_key.py
@backend/migrations/versions/0001_initial.py
@backend/migrations/env.py
@backend/cmc/app/lifespan.py
@backend/tests/test_migrations.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SavedView SQLModel + register for autogenerate</name>
  <files>backend/cmc/db/models/saved_views.py, backend/cmc/db/models/__init__.py</files>
  <action>
Create `backend/cmc/db/models/saved_views.py` mirroring `tasks.py:22-59` shape and `schedules.py:28-30` JSON column pattern.

EXACT model contents:

```python
"""SavedView — server-persisted, per-route, URL-shareable filter combinations.

Phase 25 / VIEW-02. state_json is OPAQUE to the backend — validation lives in
the route's validateSearch on the frontend (REQUIREMENTS.md VIEW-02 lock,
ROADMAP.md Phase 25 success criterion 5).
"""
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="")
    route: str  # e.g. "/", "/activity", "/skills", "/skills/$name", "/cost", "/alerts", "/sessions/compare"
    state_json: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    schema_version: int = Field(default=1)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_saved_views_route", "route"),
        UniqueConstraint("route", "name", name="uq_saved_views_route_name"),
    )
```

Then register the model for Alembic autogenerate by appending the side-effect import to `backend/cmc/db/models/__init__.py` (the file's docstring lines 3-6 warn this is mandatory — without it autogenerate produces an empty migration):

```python
from cmc.db.models.saved_views import SavedView  # noqa: F401
```

Place it alphabetically near the other model imports (Task lives at line 24; place SavedView near it preserving alphabetical order within the existing block).

IMPORTANT:
- Use `now_utc` from `cmc.core.time` — locked invariant per STATE.md (NOT `datetime.utcnow()` or `datetime.now()`).
- `route` is intrinsic to a view's identity; do NOT add a default value.
- UNIQUE constraint `(route, name)` rejects duplicate names per Research OQ#1 recommendation — this prevents a class of UX bugs cheaply and surfaces as 409/400 in Plan 02's POST handler.
  </action>
  <verify>
    <automated>cd backend && uv run python -c "from cmc.db.models.saved_views import SavedView; assert SavedView.__tablename__ == 'saved_views'; print('ok')" && uv run python -c "from cmc.db.models import SQLModel; assert 'saved_views' in SQLModel.metadata.tables; print('registered')"</automated>
  </verify>
  <done>
SavedView class importable; `saved_views` appears in `SQLModel.metadata.tables` after the `db.models` package import (proves autogenerate registration).
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Alembic migration 0004_saved_views</name>
  <files>backend/migrations/versions/0004_saved_views.py</files>
  <action>
Create `backend/migrations/versions/0004_saved_views.py` mirroring the shape of `0003_project_key.py:1-98` and the `create_table` pattern from `0001_initial.py:263-297`.

Hand-write the body — do NOT rely on `alembic revision --autogenerate` output unmodified; the autogen is a starting point only per Pitfall in the research (`0001_initial.py:18-23` precedent).

EXACT migration body:

```python
"""Add saved_views table.

Revision ID: 0004_saved_views
Revises: 0003_project_key
Create Date: 2026-05-12

Phase 25 (VIEW-02) — server-persisted per-route view state. state_json is
opaque to the backend; validation is the route's validateSearch on read.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0004_saved_views"
down_revision: str | None = "0003_project_key"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("route", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("state_json", sa.JSON(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.create_index("idx_saved_views_route", ["route"], unique=False)
        batch_op.create_unique_constraint("uq_saved_views_route_name", ["route", "name"])


def downgrade() -> None:
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.drop_constraint("uq_saved_views_route_name", type_="unique")
        batch_op.drop_index("idx_saved_views_route")
    op.drop_table("saved_views")
```

IMPORTANT:
- Pure DDL only — NO data-seed steps. `cmc/app/lifespan.py:100` runs `command.upgrade(alembic_cfg, "head")` on every boot, so any side-effect in upgrade() would re-run on every dev boot (Pitfall 10).
- Use `op.batch_alter_table(...)` for indexes + constraints. SQLite ALTER TABLE compat requires it (migrations/env.py:34 sets `render_as_batch=True` by default; precedent in 0003).
- `down_revision = "0003_project_key"` — chain to the most recent existing migration.
  </action>
  <verify>
    <automated>cd backend && uv run alembic check && uv run alembic history | grep -E "0004_saved_views.*0003_project_key|0003_project_key.*0004_saved_views"</automated>
  </verify>
  <done>
Migration file exists; `alembic history` shows correct linkage to 0003_project_key; `alembic upgrade head` on a tmp DB succeeds (verified by Task 3 tests).
  </done>
</task>

<task type="auto">
  <name>Task 3: Add migration round-trip tests (upgrade + downgrade)</name>
  <files>backend/tests/test_migrations.py</files>
  <action>
Append two test cases to `backend/tests/test_migrations.py` mirroring the existing test pattern at `test_migrations.py:153-204` (the `test_0003_*` tests).

Use the same fixture / helper shape that's already in the file. Read `backend/tests/test_migrations.py` first to discover the exact fixture name (likely `temp_alembic_db` or similar) and helper functions (`get_columns`, `get_indexes`).

Add these two functions at the END of the file:

```python
def test_0004_upgrade_from_0003(temp_alembic_db):
    """0004_saved_views: upgrade from 0003 creates saved_views table with all
    columns, the route index, and the unique constraint on (route, name)."""
    # Upgrade to 0003 first, then to 0004
    upgrade_to(temp_alembic_db, "0003_project_key")
    upgrade_to(temp_alembic_db, "0004_saved_views")

    # Assert table presence
    assert "saved_views" in get_tables(temp_alembic_db)

    # Assert columns
    cols = {c["name"] for c in get_columns(temp_alembic_db, "saved_views")}
    assert cols == {
        "id", "name", "description", "route",
        "state_json", "schema_version", "created_at", "updated_at",
    }

    # Assert route index
    indexes = get_indexes(temp_alembic_db, "saved_views")
    assert any(ix["name"] == "idx_saved_views_route" for ix in indexes)

    # Assert unique (route, name) constraint — surfaces as a unique index in SQLite
    assert any(
        ix["name"] == "uq_saved_views_route_name" and ix.get("unique", False)
        for ix in indexes
    )


def test_0004_downgrade_to_0003(temp_alembic_db):
    """0004_saved_views: downgrade removes saved_views table cleanly, leaving
    the 0003 schema intact."""
    upgrade_to(temp_alembic_db, "0004_saved_views")
    assert "saved_views" in get_tables(temp_alembic_db)

    downgrade_to(temp_alembic_db, "0003_project_key")
    assert "saved_views" not in get_tables(temp_alembic_db)
```

If the fixture / helper names differ from above (e.g. `_get_tables`, `_get_columns`), use the actual names present in the file. The PATTERN to mirror is `test_0003_*` — match it line-for-line.

IMPORTANT:
- Use `uv run pytest` — system Python is 3.11.7; backend requires 3.13 per STATE.md.
- Tests MUST pass against `0004_saved_views.py` from Task 2 — if they fail, the migration is wrong, not the tests.
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_migrations.py -k 0004 -v && uv run pytest -x</automated>
  </verify>
  <done>
Both new tests pass; backend pytest count = 663 (baseline) + 2 = 665 minimum. No regressions in existing tests.
  </done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest tests/test_migrations.py -k 0004` — 2 tests passing.
2. `cd backend && uv run pytest -x` — full suite green (>= 665 / 0 / 0).
3. `cd backend && uv run alembic history` — chain shows `0001 -> 0002 -> 0003 -> 0004`.
4. `cd backend && uv run python -c "from cmc.db.models.saved_views import SavedView; from cmc.db.models import SQLModel; assert 'saved_views' in SQLModel.metadata.tables"` exits 0.
5. No frontend changes — `pnpm tsc --noEmit` + vitest unchanged from Phase 24 close.
</verification>

<success_criteria>
- saved_views table is creatable via `alembic upgrade head` and droppable via `alembic downgrade -1`.
- Model is registered for autogenerate — `SQLModel.metadata.tables` includes `saved_views` after package import.
- UNIQUE `(route, name)` constraint exists and is testable.
- `idx_saved_views_route` index exists.
- All existing pytest tests still pass; +2 new tests for the migration round-trip.
- This plan is testable independently of all subsequent plans (no frontend deps).
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-01-SUMMARY.md` documenting:
- Migration revision ID + parent chain
- Test names + count delta (`pytest` was 663, now N)
- Any deviation from research recommendations
- One-line "where to look first" hint for Plan 02's author (e.g. "SavedView lives at backend/cmc/db/models/saved_views.py — import via `from cmc.db.models.saved_views import SavedView`")
</output>
