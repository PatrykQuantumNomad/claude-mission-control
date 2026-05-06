---
phase: 19-skills-per-project-deltas-badges
plan: 01
type: execute
wave: 1
# why_this_split: Migration + ingest wiring is the foundational schema/data layer all other Phase 19 plans depend on. Owns sessions table mutation + project_key helper; nothing else touches these files.
depends_on: []
files_modified:
  - backend/cmc/core/project_key.py
  - backend/cmc/core/__init__.py
  - backend/migrations/versions/0003_project_key.py
  - backend/cmc/db/models/sessions.py
  - backend/cmc/ingest/scheduler.py
  - backend/cmc/ingest/repository.py
  - backend/tests/test_core_project_key.py
  - backend/tests/test_migrations.py
autonomous: true
requirements: [SKLP-08, SKLP-09, SKLP-10]
must_haves:
  truths:
    - "compute_project_key('/tmp/foo/') and compute_project_key('/tmp/foo') return the same 12-char sha1 hex string."
    - "compute_project_key(None) and compute_project_key('') both return '' (empty sentinel; never raises)."
    - "Alembic upgrade 0002 -> 0003 adds sessions.project_key VARCHAR(12) NOT NULL DEFAULT '' AND idx_sessions_project_key, then backfills every existing session row whose cwd is non-empty."
    - "Alembic downgrade 0003 -> 0002 drops the index and column without error."
    - "After ingesting a new session through scheduler.py, the inserted/updated row has project_key set to compute_project_key(cwd) — never the empty default."
    - "_SESSION_MUTABLE_COLS in repository.py includes 'project_key' so existing sessions get re-keyed when cwd is corrected on a later sync."
    - "git grep 'datetime.utcnow' in backend/migrations/ and backend/cmc/core/project_key.py returns 0 matches (POLI-06 ban honored)."
    - "pytest passes >= 566 (Phase 18 BASELINE.md floor); new tests for project_key + migration 0003 add to total."
  artifacts:
    - path: "backend/cmc/core/project_key.py"
      provides: "compute_project_key(cwd: str | None) -> str — sha1[:12] of realpath(cwd.rstrip('/'))"
      contains: "def compute_project_key"
      contains_also: "hashlib.sha1"
      min_lines: 25
    - path: "backend/migrations/versions/0003_project_key.py"
      provides: "Alembic migration adding sessions.project_key column + index + Python-loop backfill"
      contains: "revision: str = \"0003_project_key\""
      contains_also: "down_revision: str | None = \"0002_v1_1_alerts_and_skills\""
    - path: "backend/cmc/db/models/sessions.py"
      provides: "SQLModel Session model updated with project_key field (max_length=12, default='', index=True)"
      contains: "project_key"
    - path: "backend/cmc/ingest/scheduler.py"
      provides: "Session insert/upsert path now sets sess['project_key'] alongside existing project_hash"
      contains: "compute_project_key"
    - path: "backend/cmc/ingest/repository.py"
      provides: "_SESSION_MUTABLE_COLS includes 'project_key' so re-syncs propagate"
      contains: "\"project_key\""
    - path: "backend/tests/test_core_project_key.py"
      provides: "Unit tests for trailing-slash idempotence, None/empty handling, sha1[:12] length, deterministic same-input-same-output"
      min_lines: 40
    - path: "backend/tests/test_migrations.py"
      provides: "Existing test file extended with test_0003_upgrade_from_0002 and test_0003_downgrade_to_0002"
      contains: "0003_project_key"
  key_links:
    - from: "backend/migrations/versions/0003_project_key.py"
      to: "backend/cmc/core/project_key.py"
      via: "_compute_project_key inlined or imported in upgrade() backfill loop"
      pattern: "hashlib\\.sha1.*hexdigest\\(\\)\\[:12\\]"
    - from: "backend/cmc/ingest/scheduler.py"
      to: "backend/cmc/core/project_key.py"
      via: "from cmc.core.project_key import compute_project_key"
      pattern: "compute_project_key\\("
    - from: "backend/cmc/ingest/repository.py"
      to: "backend/cmc/db/models/sessions.py"
      via: "_SESSION_MUTABLE_COLS now lists 'project_key' so SQL UPDATE includes it"
      pattern: "\"project_key\""
---

<objective>
Land the foundational schema migration and data-layer wiring that Phase 19's three feature plans (and Phase 20 ANLY-07) all depend on. Adds a normalized, low-cardinality, leak-free `project_key` to every session — past, present, and future.

Purpose: ROADMAP success criterion #2 — "Migration `0003_project_key` lands in this phase: `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`, backfilled, indexed; available for ANLY-07 in Phase 20 to consume without migration churn." Per STATE.md v1.2 roadmap-time decision, Phase 19 owns this migration (Phase 20 is downstream consumer).

Output:
- `backend/cmc/core/project_key.py` (NEW) — `compute_project_key(cwd) -> str`. sha1[:12] of `os.path.realpath(cwd.rstrip('/'))`. Empty/None input returns `''`.
- `backend/cmc/core/__init__.py` — UPDATED to re-export `compute_project_key` (matches existing `now_utc` re-export convention).
- `backend/migrations/versions/0003_project_key.py` (NEW) — Alembic migration: `batch_alter_table` to add column + index, then a Python loop running `realpath` over each session's `cwd` (SQLite cannot resolve symlinks; pure-SQL backfill is unavailable per RESEARCH.md Pattern 1).
- `backend/cmc/db/models/sessions.py` — UPDATED Session model with `project_key: str = Field(default="", max_length=12, index=True, nullable=False)`.
- `backend/cmc/ingest/scheduler.py` — UPDATED at line 117-118 region to set `sess["project_key"] = compute_project_key(cwd)` alongside the existing `project_hash` line.
- `backend/cmc/ingest/repository.py` — UPDATED `_SESSION_MUTABLE_COLS` to include `"project_key"` (Pitfall 9: ensures re-sync of existing sessions updates the key).
- `backend/tests/test_core_project_key.py` (NEW) — 5+ unit tests covering trailing-slash idempotence, None/empty, sha1[:12] length invariant, deterministic output, non-existent-path handling (Pitfall 5).
- `backend/tests/test_migrations.py` — EXTENDED with `test_0003_upgrade_from_0002` and `test_0003_downgrade_to_0002` exercising the backfill against seeded session rows.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/19-skills-per-project-deltas-badges/19-RESEARCH.md
@.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md

# Existing files this plan touches (read before editing)
@backend/cmc/db/models/sessions.py
@backend/cmc/ingest/scheduler.py
@backend/cmc/ingest/repository.py
@backend/cmc/core/__init__.py
@backend/migrations/versions/0002_v1_1_alerts_and_skills.py
@backend/tests/test_migrations.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create cmc.core.project_key helper + unit tests</name>
  <files>backend/cmc/core/project_key.py, backend/cmc/core/__init__.py, backend/tests/test_core_project_key.py</files>
  <action>
Create `backend/cmc/core/project_key.py` exporting a single function:

```python
"""Project-key derivation: sha1[:12] of realpath(cwd.rstrip('/')).

Phase 19 (SKLP-08) introduces this as the canonical project identifier.
NEVER expose raw `cwd` in API responses — `project_key` is the only
project-shaped value the user sees (ROADMAP success criterion #1).

Pitfall 5 (RESEARCH.md): os.path.realpath() returns the input unchanged
for path components that don't exist on disk; this is acceptable —
historical sessions for deleted projects may produce a slightly
different key than they would have at recording time, but no path
leakage and no data corruption either way.
"""
from __future__ import annotations

import hashlib
import os


def compute_project_key(cwd: str | None) -> str:
    """sha1[:12] of realpath(cwd.rstrip('/')). Empty/None input -> ''.

    Trailing-slash idempotent: '/tmp/foo' and '/tmp/foo/' produce the
    same key. Symlinks are resolved (canonical identity), so two cwds
    pointing at the same physical directory always collide deterministically.
    """
    if not cwd:
        return ""
    canonical = os.path.realpath(cwd.rstrip("/"))
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
```

Update `backend/cmc/core/__init__.py` to re-export `compute_project_key` alongside the existing exports (mirror the `now_utc` line if present, or follow the same import-then-`__all__` pattern already used).

Create `backend/tests/test_core_project_key.py` with the following test cases (use `pytest`, no fixtures needed — pure functions):
- `test_trailing_slash_idempotent`: `compute_project_key('/tmp/x/')` == `compute_project_key('/tmp/x')`.
- `test_none_returns_empty`: `compute_project_key(None) == ''`.
- `test_empty_string_returns_empty`: `compute_project_key('') == ''`.
- `test_returns_12_char_hex`: For a non-empty cwd, output is exactly 12 chars and matches `[0-9a-f]{12}`.
- `test_deterministic`: Same input produces same output across calls.
- `test_nonexistent_path_does_not_raise`: `compute_project_key('/this/path/does/not/exist/anywhere')` returns a 12-char hex string (Pitfall 5 — realpath does not error on missing components).
- `test_symlink_canonicalized`: Use `tmp_path` fixture, create a symlink, assert both cwd inputs (real path + symlink path) hash to the same key.

DO NOT use `datetime.utcnow` in this module — POLI-06 ban inherited from Phase 18; this module has no datetime usage anyway, but the prohibition applies project-wide.
  </action>
  <verify>
cd backend && uv run pytest tests/test_core_project_key.py -v
Expected: all 7 tests pass.
git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/cmc/core/project_key.py
Expected: no matches (POLI-06 GATE 2).
  </verify>
  <done>
backend/cmc/core/project_key.py exists, exports `compute_project_key`, re-exported via cmc.core.
test_core_project_key.py: 7 tests green.
  </done>
</task>

<task type="auto">
  <name>Task 2: Alembic migration 0003 + sessions model update + ingest wiring</name>
  <files>backend/migrations/versions/0003_project_key.py, backend/cmc/db/models/sessions.py, backend/cmc/ingest/scheduler.py, backend/cmc/ingest/repository.py, backend/tests/test_migrations.py</files>
  <action>
**Step 2a — Create `backend/migrations/versions/0003_project_key.py`:**

Mirror the structure of `0002_v1_1_alerts_and_skills.py`. Use `op.batch_alter_table` for the SQLite ALTER workaround. Reference revision identifiers:
- `revision: str = "0003_project_key"`
- `down_revision: str | None = "0002_v1_1_alerts_and_skills"`

`upgrade()` body:
1. `batch_alter_table("sessions")` adds `project_key` column: `sa.Column("project_key", sqlmodel.sql.sqltypes.AutoString(length=12), nullable=False, server_default="")` and creates `idx_sessions_project_key` (non-unique).
2. After the batch context exits, run a Python-loop backfill:
```python
import hashlib, os
bind = op.get_bind()
rows = bind.execute(sa.text("SELECT session_id, cwd FROM sessions")).fetchall()
for sid, cwd in rows:
    if not cwd:
        continue
    canonical = os.path.realpath(cwd.rstrip("/"))
    pk = hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
    bind.execute(
        sa.text("UPDATE sessions SET project_key = :pk WHERE session_id = :sid"),
        {"pk": pk, "sid": sid},
    )
```
INLINE the hash logic in the migration (do not import from `cmc.core.project_key`) — Alembic migrations should be self-contained against future refactors of application code (RESEARCH.md Pattern 1 follows this convention; mirrors how 0002 inlined its json_extract logic instead of importing from cmc.ingest).

`downgrade()` body: `batch_alter_table("sessions")` drops `idx_sessions_project_key` then drops `project_key` column.

Top-of-file docstring documents Pitfall 5 (realpath returns input unchanged for missing components — historical-deleted-cwd sessions get a best-effort key) and explicitly notes "no datetime.utcnow used; module has no time-of-day logic" so the POLI-06 grep stays clean.

**Step 2b — Update `backend/cmc/db/models/sessions.py`:**

Add to the Session SQLModel:
```python
project_key: str = Field(default="", max_length=12, nullable=False, sa_column_kwargs={"server_default": ""}, index=True)
```
Field order: place near the existing `project_hash` field for readability. Use `from sqlmodel import Field` if not already imported (it should be).

**Step 2c — Update `backend/cmc/ingest/scheduler.py`:**

Around line 117-118 where `sess["project_hash"] = jsonl_path.parent.name` is set, ADD a line setting `sess["project_key"]`. Import `compute_project_key` at the top of the file:
```python
from cmc.core.project_key import compute_project_key
```
Then in the session-record assembly:
```python
sess["project_hash"] = jsonl_path.parent.name
sess["project_key"] = compute_project_key(sess.get("cwd"))
```
Use `sess.get("cwd")` (not direct dict access) to handle records where `cwd` may be missing — `compute_project_key` handles None safely.

**Step 2d — Update `backend/cmc/ingest/repository.py`:**

Add `"project_key"` to the `_SESSION_MUTABLE_COLS` tuple (line 55+). This ensures that when an existing session row is re-synced (e.g., a late-arriving `cwd` value), the project_key is recomputed and written by the SQL UPDATE path.

**Step 2e — Extend `backend/tests/test_migrations.py`:**

Add two test functions following the existing migration-test pattern (the file already tests 0001/0002 transitions):

```python
def test_0003_upgrade_from_0002(tmp_path):
    """Migration 0003 adds project_key column with index and backfills existing rows."""
    # 1. Initialize DB at revision 0002 using alembic.command.upgrade
    # 2. Insert a sessions row with cwd='/tmp/some/test/path' (or use tmp_path/'proj' real dir)
    # 3. Run alembic.command.upgrade to '0003_project_key'
    # 4. Assert: column 'project_key' exists on sessions table.
    # 5. Assert: idx_sessions_project_key exists (PRAGMA index_list('sessions')).
    # 6. Assert: the backfilled row has project_key matching sha1(realpath(cwd.rstrip('/')))[:12].
    # 7. Assert: a second session inserted with cwd='' has project_key='' after backfill.

def test_0003_downgrade_to_0002(tmp_path):
    """Downgrade removes the column and index without error."""
    # Upgrade to 0003, then downgrade to 0002, assert column gone via PRAGMA table_info.
```

Use `hashlib.sha1` directly in the assertion (don't import from cmc.core.project_key — the migration is self-contained, the test verifies that fact).
  </action>
  <verify>
cd backend && uv run pytest tests/test_migrations.py -v -k "0003"
Expected: 2 new tests pass.

cd backend && uv run pytest tests/test_ingest.py -v
Expected: still green (project_key addition does not break existing ingest tests).

cd backend && uv run pytest --tb=no
Expected: passed >= 566 + new tests added by this plan; failed == 0; warnings_datetime_utcnow == 0.

git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/migrations/ backend/cmc/core/project_key.py
Expected: 0 matches (POLI-06 ban honored in new files).

# Verify the sessions model field is wired:
cd backend && uv run python -c "from cmc.db.models.sessions import Session; print('project_key' in Session.__fields__)"
Expected: True
  </verify>
  <done>
Migration 0003 upgrade + downgrade green; project_key column + index present; backfill correctly populates existing rows.
Sessions model has project_key field; scheduler.py sets it on insert; repository.py re-sync includes it.
Phase 18 BASELINE.md verifier: pytest >= 566 pass, failed == 0, warnings_datetime_utcnow == 0 — all preserved.
  </done>
</task>

</tasks>

<verification>
- All 7 unit tests in test_core_project_key.py green.
- 2 new migration tests (0003 up + down) green.
- Backend pytest baseline preserved: >= 566 passed, 0 failed, 0 datetime.utcnow warnings.
- `compute_project_key` is importable as `from cmc.core import compute_project_key` (re-export wired).
- Migration 0003 file is self-contained (no import from cmc.core.project_key in the migration itself — defensive against future refactors).
- Scheduler.py sets project_key on every new session insert; repository.py propagates it on re-sync.
- New ingested sessions, when run through scheduler.ingest_jsonl, land with a non-empty project_key (assuming cwd is set on the source record).
</verification>

<success_criteria>
- ROADMAP success criterion #2 satisfied: migration 0003 lands, indexed, backfilled, ready for Phase 20 ANLY-07.
- All Phase 18 BASELINE.md verifier rules continue to pass.
- POLI-06 ban honored: 0 datetime.utcnow occurrences in any new file.
</success_criteria>

<output>
After completion, create `.planning/phases/19-skills-per-project-deltas-badges/19-01-SUMMARY.md`.
</output>
