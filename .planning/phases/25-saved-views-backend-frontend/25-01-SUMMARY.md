---
phase: 25
plan: 01
subsystem: backend / db
tags: [backend, alembic, sqlmodel, saved-views, VIEW-02]
dependency_graph:
  requires:
    - "backend/cmc/core/time.py (now_utc canonical naive-UTC factory; locked invariant)"
    - "backend/migrations/versions/0003_project_key.py (chain parent)"
    - "backend/cmc/db/base.py (SQLModel re-export)"
    - "backend/cmc/app/lifespan.py (command.upgrade(alembic_cfg, 'head') on boot)"
  provides:
    - "saved_views SQLite table (8 columns + 1 index + 1 UNIQUE constraint)"
    - "cmc.db.models.saved_views.SavedView SQLModel class"
    - "Alembic migration 0004_saved_views (forward + reverse, both clean)"
  affects:
    - "backend/cmc/db/models/__init__.py (one side-effect import for autogen)"
    - "backend/tests/test_foundation_boot.py (table count 18 → 19, both lifespan + alembic assertions)"
tech_stack:
  added: []
  patterns:
    - "SQLModel + sqlalchemy JSON Column for opaque-JSON state blobs (mirrors schedules.task_template)"
    - "batch_alter_table for index + unique constraint on SQLite (env.py:34 render_as_batch=True; mirrors 0003)"
    - "named UNIQUE constraint via op.create_unique_constraint (declared identity preserved in CREATE TABLE DDL even though SQLite uses an autoindex for enforcement)"
key_files:
  created:
    - backend/cmc/db/models/saved_views.py
    - backend/migrations/versions/0004_saved_views.py
  modified:
    - backend/cmc/db/models/__init__.py
    - backend/tests/test_migrations.py
    - backend/tests/test_foundation_boot.py
decisions:
  - "state_json declared as sqlalchemy.JSON (not String) — locked OPAQUE-to-backend invariant per VIEW-02; backend never deserializes the dict, only round-trips it."
  - "UNIQUE (route, name) chosen over (route, name) non-unique index — surfaces duplicate-name attempts as a 409 conflict in Plan 02's POST handler instead of leaking the bug to UX."
  - "Migration body is hand-written, not autogen-derived — Pitfall 10 (any side-effect in upgrade() re-runs on every dev boot via lifespan.py:100); ddl-only enforces that."
  - "Test pattern mirrors test_0003_* line-for-line (tmp_path + _alembic_cfg + raw sqlite3) — Plan text speculated about temp_alembic_db/get_tables/get_columns/get_indexes helpers that do not exist in this codebase; source-of-truth scan won."
  - "Test asserts both DDL identity (uq_saved_views_route_name name in CREATE TABLE sql) AND runtime enforcement (unique index covering (route, name) + duplicate-insert IntegrityError probe) — SQLite stores table-level UNIQUE constraints as autoindexes whose names differ from the declared constraint name, but the constraint name remains symbolically valid for future op.drop_constraint."
metrics:
  duration_minutes: 16
  completed_date: 2026-05-12
  tasks_completed: 3
  files_created: 2
  files_modified: 3
  commits: 3
---

# Phase 25 Plan 01: SavedView Foundation — Backend Table + Migration Summary

**One-liner:** Server-persisted `saved_views` SQLite table (id, name, description, route, state_json JSON, schema_version, timestamps) with `idx_saved_views_route` + `uq_saved_views_route_name (route, name)` UNIQUE constraint, shipped as Alembic migration 0004 chained off 0003_project_key — foundation for Phase 25 VIEW-02 frontend work.

## What Was Built

The Phase 25 backend foundation: a single new SQLite table whose `state_json` column is OPAQUE to the backend (validation lives in the route's frontend `validateSearch` per VIEW-02 lock). The table is reachable both via Alembic CLI (`uv run alembic upgrade head`) and via `cmc start` lifespan boot (`backend/cmc/app/lifespan.py:100` runs `command.upgrade(alembic_cfg, "head")` on every dev startup), so the existing app picks it up on next boot with no manual intervention.

### Schema shape

```python
class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="")
    route: str             # e.g. "/", "/activity", "/skills", "/skills/$name", "/cost", "/alerts", "/sessions/compare"
    state_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    schema_version: int = Field(default=1)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
    __table_args__ = (
        Index("idx_saved_views_route", "route"),
        UniqueConstraint("route", "name", name="uq_saved_views_route_name"),
    )
```

### Migration chain (post-plan)

```
<base> -> 0001_initial -> 0002_v1_1_alerts_and_skills -> 0003_project_key -> 0004_saved_views (head)
```

## Verification

| Check | Result |
|---|---|
| `uv run pytest tests/test_migrations.py -k 0004 -v` | 2/2 PASS |
| `uv run pytest` (full backend suite) | 665 / 0 / 0 (baseline 663 + 2 = expected 665) |
| `uv run alembic history` linkage | `0003_project_key -> 0004_saved_views (head)` |
| `python -c "...; assert 'saved_views' in SQLModel.metadata.tables"` | `registered` |
| `test_alembic_upgrade_creates_all_tables` | `len(app_tables) == 19` + `'saved_views' in app_tables` PASS |
| `test_lifespan_creates_all_tables` | `len(app_tables) == 19` + `'saved_views' in app_tables` PASS |
| Pre-commit (pyright + ruff) for every commit | PASS |
| Backend deps delta | 0 (no new packages) |

## Test names + count delta

Backend pytest: **663 → 665 / 0 / 0** (`+2` net new from this plan).

New tests added in `backend/tests/test_migrations.py`:

1. `test_0004_upgrade_from_0003` — verifies table presence, all 8 columns, route index (non-unique), UNIQUE constraint DDL identity (`uq_saved_views_route_name` in CREATE TABLE sql), runtime enforcement (any unique index covering (route, name)), and an end-to-end duplicate-insert `sqlite3.IntegrityError` probe.
2. `test_0004_downgrade_to_0003` — verifies clean reversal: table exists at head, absent after downgrade.

(Modifications to existing tests in `test_foundation_boot.py` are mechanical table-count updates; they are not net-new tests.)

## Deviations from Plan

### Rule 1 — Bug fix

**1. [Rule 1 - Bug] Test pattern: plan text speculated about fixtures/helpers that don't exist**

- **Found during:** Task 3
- **Issue:** Plan said to use `temp_alembic_db` fixture + `upgrade_to`/`downgrade_to`/`get_tables`/`get_columns`/`get_indexes` helpers. None exist in `backend/tests/test_migrations.py`. The actual pattern in the file is `tmp_path` + `_alembic_cfg(db_path)` + raw `sqlite3.connect(...)` with PRAGMA queries.
- **Fix:** Mirrored the actual `test_0003_*` shape line-for-line — exactly what the plan's IMPORTANT bullet under Task 3 directed (`The PATTERN to mirror is test_0003_* — match it line-for-line`). Plan text speculation overridden by source-of-truth scan.
- **Files modified:** `backend/tests/test_migrations.py`
- **Commit:** `b0aa566`

**2. [Rule 1 - Bug] SQLite stores table-level UNIQUE constraints under an autoindex name, not the declared name**

- **Found during:** Task 3 (first run of `test_0004_upgrade_from_0003`)
- **Issue:** Initial test asserted `'uq_saved_views_route_name' in index_by_name` against `PRAGMA index_list`. SQLite reported the index as `sqlite_autoindex_saved_views_1` (origin `'u'`, unique=1) covering columns (route, name) — the declared constraint name does NOT appear in `index_list`, only in the CREATE TABLE DDL.
- **Fix:** Adjusted the assertion to verify both (a) DDL identity (the symbolic constraint name appears in the saved_views CREATE TABLE SQL so future `op.drop_constraint("uq_saved_views_route_name")` remains valid) AND (b) runtime enforcement (a unique index covers exactly (route, name) regardless of name, PLUS a duplicate-insert `sqlite3.IntegrityError` probe). The migration itself is correct — only the test's assertion shape was wrong.
- **Files modified:** `backend/tests/test_migrations.py`
- **Commit:** `b0aa566`

**3. [Rule 1 - Bug] Two pre-existing tests pinned the schema-wide table count (18) and broke when 0004 landed**

- **Found during:** Task 3 (full-suite pytest after the 0004 tests passed)
- **Issue:** `test_alembic_upgrade_creates_all_tables` and `test_lifespan_creates_all_tables` in `backend/tests/test_foundation_boot.py` both hardcoded `len(app_tables) == 18`. Migration 0004 brought the count to 19, breaking both.
- **Fix:** Updated both assertions to 19 and added an explicit `'saved_views' in app_tables` assertion to each (provides early break-glass signal if a future migration silently changes the count without adding the named table). Comments in both docstrings updated to reflect the new total + Phase 25 VIEW-02 reference.
- **Files modified:** `backend/tests/test_foundation_boot.py`
- **Commit:** `b0aa566`

**4. [Rule 1 - Bug] Ruff E501 line-too-long on the `route` column comment**

- **Found during:** Task 1 (pre-commit ruff hook on first commit attempt)
- **Issue:** The plan's exact model text for the `route` field placed a long usage-example comment after the type annotation, exceeding the project's 100-char ruff line limit by 8 chars.
- **Fix:** Moved the example comment to the line ABOVE the `route: str` declaration — semantically identical, no longer triggers E501.
- **Files modified:** `backend/cmc/db/models/saved_views.py`
- **Commit:** `06f3e77`

**5. [Rule 1 - Bug] Ruff B007 unused loop variables in unique-index walk**

- **Found during:** Task 3 (pre-commit ruff hook on Task 3 commit attempt)
- **Issue:** `for seq, idx_name, is_unique, origin, partial in indexes:` — three of the five tuple elements (`seq`, `origin`, `partial`) are unused inside the loop body.
- **Fix:** Renamed each unused name with a leading underscore per ruff's suggestion (`_seq`, `_origin`, `_partial`).
- **Files modified:** `backend/tests/test_migrations.py`
- **Commit:** `b0aa566`

### No Rule 2 / Rule 3 / Rule 4 deviations

No missing-critical-functionality (Rule 2) discoveries, no blocking-other-things (Rule 3) discoveries, no architectural-change (Rule 4) needs. The plan's spec was correct in shape; the deviations above are surface-level mechanical adjustments.

## Authentication Gates

None — fully autonomous backend-only plan.

## Known Stubs

None — no UI rendering paths added in this plan. Endpoints + UI ship in Plan 02 (backend POST/GET) and frontend plans (Phase 25 Plans 03+).

## Threat Flags

None new. `saved_views` is a localhost-only SQLite table; no auth surface added. Plan 02's `POST /api/saved_views` is the next add — that plan inherits the Phase 25 threat model.

## Where to Look First — Hint for Plan 02's Author

`SavedView` lives at `backend/cmc/db/models/saved_views.py` — import via `from cmc.db.models.saved_views import SavedView`. Mirror the route-handler shape of `backend/cmc/api/routes/schedules.py` (the schedules table is the closest precedent: same SQLModel + JSON column pattern, same UNIQUE constraint, same per-route-style listing). The `uq_saved_views_route_name` UNIQUE constraint will raise `sqlalchemy.exc.IntegrityError` on duplicate POST — translate to HTTP 409 Conflict in the handler (Research OQ#1 recommendation; the existing `cmc.api.errors`-style translation pattern in `cmc/api/routes/schedules.py` is the model).

## TDD Gate Compliance

This plan was NOT type=tdd at the frontmatter level (`type: execute`); the per-task tdd attribute was not set on any task. TDD gate enforcement is not required. The plan delivered `feat + feat + test` rather than RED-then-GREEN because Tasks 1 and 2 had no implementation to drive via failing tests (model + migration are DDL, not behavior; the tests in Task 3 are the round-trip verification of that DDL). All three commits are atomic and each pre-commit hook ran clean.

## Self-Check: PASSED

All claimed files exist on disk:

- `backend/cmc/db/models/saved_views.py` FOUND
- `backend/migrations/versions/0004_saved_views.py` FOUND
- `backend/cmc/db/models/__init__.py` FOUND
- `backend/tests/test_migrations.py` FOUND
- `backend/tests/test_foundation_boot.py` FOUND
- `.planning/phases/25-saved-views-backend-frontend/25-01-SUMMARY.md` FOUND

All claimed commits exist in the git log:

- `06f3e77` FOUND — `feat(25-01): add SavedView SQLModel + register for autogenerate`
- `03df53f` FOUND — `feat(25-01): add Alembic migration 0004_saved_views`
- `b0aa566` FOUND — `test(25-01): add migration 0004_saved_views round-trip tests`
