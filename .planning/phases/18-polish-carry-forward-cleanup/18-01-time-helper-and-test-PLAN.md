---
phase: 18-polish-carry-forward-cleanup
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/cmc/core/time.py
  - backend/cmc/core/__init__.py
  - backend/cmc/api/schemas/common.py
  - backend/tests/test_core_time.py
autonomous: true
requirements: [POLI-06]
must_haves:
  truths:
    - "Calling cmc.core.time.now_utc() returns a naive UTC datetime (tzinfo is None) within 100ms of wall-clock now."
    - "Importing UTCDatetime from cmc.api.schemas.common still resolves (re-export preserved) AND from cmc.core.time also resolves (canonical home)."
    - "backend/tests/test_core_time.py runs green and asserts the helper contract before any sweep happens."
    - "backend pytest suite remains green (~561 tests passing) — adding the helper module does not break any existing test."
  artifacts:
    - path: "backend/cmc/core/time.py"
      provides: "now_utc() naive-UTC helper + colocated UTCDatetime PlainSerializer (canonical home)"
      contains: "def now_utc"
      contains_also: "UTCDatetime"
    - path: "backend/cmc/api/schemas/common.py"
      provides: "Re-export of UTCDatetime from cmc.core.time (preserves 9 existing import sites)"
      contains: "from cmc.core.time import UTCDatetime"
    - path: "backend/tests/test_core_time.py"
      provides: "Unit tests asserting now_utc() is naive UTC and matches the UTCDatetime contract"
      min_lines: 25
    - path: "backend/cmc/core/__init__.py"
      provides: "Optional ergonomic re-export of now_utc (matches existing core re-export convention)"
  key_links:
    - from: "backend/cmc/api/schemas/common.py"
      to: "backend/cmc/core/time.py"
      via: "from cmc.core.time import UTCDatetime  # noqa: F401  (re-export)"
      pattern: "from cmc\\.core\\.time import UTCDatetime"
    - from: "backend/tests/test_core_time.py"
      to: "backend/cmc/core/time.py"
      via: "import + assertion that now_utc() returns a naive datetime in UTC"
      pattern: "from cmc\\.core\\.time import now_utc"
---

<objective>
Establish the canonical naive-UTC time module that the rest of Phase 18 (Plan 02) sweeps onto.

Purpose: POLI-06 is a two-commit migration per CONTEXT — "helper lands first, then one mechanical replacement commit". This plan IS that first commit. It MUST NOT touch any of the 22 `datetime.utcnow` call sites; it only creates the destination they will be swept to. Decoupling helper-creation from helper-adoption keeps the diff bisect-friendly and lets the sweep commit (Plan 02) be a uniform mechanical pattern.

Output:
- `backend/cmc/core/time.py` (NEW) — `now_utc()` returning `datetime.now(UTC).replace(tzinfo=None)` and the colocated `UTCDatetime` PlainSerializer.
- `backend/cmc/api/schemas/common.py` — UPDATED to re-export `UTCDatetime` from the new canonical home (1 line change; preserves 9 existing import sites without churn per D-Pitfall-9).
- `backend/cmc/core/__init__.py` — UPDATED to re-export `now_utc` (matches the existing `cmc/core/__init__.py` convention of re-exporting cross-cutting symbols like `register_error_handlers`, `repo_root`).
- `backend/tests/test_core_time.py` (NEW) — unit tests covering the helper contract (naive shape, UTC value, factory-call semantics).
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-polish-carry-forward-cleanup/18-CONTEXT.md
@.planning/phases/18-polish-carry-forward-cleanup/18-RESEARCH.md

# Existing files this plan touches (read before editing)
@backend/cmc/api/schemas/common.py
@backend/cmc/core/__init__.py

<interfaces>
<!-- Existing UTCDatetime contract that MUST be preserved verbatim. -->
<!-- Source: backend/cmc/api/schemas/common.py (current). -->

```python
# Current shape (will be moved to cmc/core/time.py and re-exported here):
from datetime import UTC, datetime
from typing import Annotated
from pydantic import PlainSerializer


def _serialize_utc(value: datetime) -> str:
    """Emit ISO-8601 in UTC with 'Z' suffix (when_used='json' gate prevents
    double-serialization in non-JSON contexts)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]
```

<!-- 9 import sites currently use this — re-export preserves them: -->
<!--   backend/cmc/api/schemas/{sessions,hitl,mcp,alerts,tasks,observability,skills,schedules}.py -->
<!--   plus any additional importers found via `git grep -nE 'UTCDatetime'`. -->
<!-- DO NOT touch those 9 files in this plan; the re-export keeps their imports valid. -->

<!-- Existing cmc/core/__init__.py re-export pattern: -->
```python
# from cmc.core.errors import register_error_handlers
# from cmc.core.logging import configure_logging
# from cmc.core.paths import repo_root, resolve_under_repo_root
# from cmc.core.static import SPAStaticFiles
# (extend with: from cmc.core.time import now_utc)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create cmc/core/time.py with now_utc + colocated UTCDatetime, plus failing unit tests</name>
  <files>backend/cmc/core/time.py, backend/tests/test_core_time.py</files>
  <behavior>
    Test: backend/tests/test_core_time.py
    - test_now_utc_returns_naive_datetime: `now_utc()` returns a `datetime` with `tzinfo is None`.
    - test_now_utc_returns_current_utc: `now_utc()` is within 5 seconds of `datetime.now(UTC).replace(tzinfo=None)` (sanity).
    - test_now_utc_factory_pattern: passing `now_utc` (no parens) to `Field(default_factory=...)` produces a model where each new instance gets a fresh timestamp (verifies the function-reference, not call, semantics — guards against Pitfall 7).
    - test_utc_datetime_serializer_roundtrip: a Pydantic v2 model with a `UTCDatetime` field serializes a naive datetime to an ISO-8601 string ending in `Z` (e.g., `2026-05-05T12:00:00Z`), preserving the existing `when_used='json'` gate behavior.
    - test_utc_datetime_reexport_path: `from cmc.api.schemas.common import UTCDatetime` and `from cmc.core.time import UTCDatetime` resolve to the SAME object (`is` identity check) — proves the re-export does not duplicate the type.
  </behavior>
  <action>
    Per D-Time-helper-API and D-Colocation (CONTEXT.md):

    Create `backend/cmc/core/time.py` containing:
    1. Module docstring explaining this is the canonical home for naive-UTC time concerns (replaces deprecated `datetime.utcnow`).
    2. `from datetime import UTC, datetime` and `from typing import Annotated` and `from pydantic import PlainSerializer`.
    3. `def now_utc() -> datetime:` returning `datetime.now(UTC).replace(tzinfo=None)`. Docstring MUST mention: replaces `datetime.utcnow()` (Python 3.12+ deprecation), preserves SQLite-naive storage contract, callers should pass the function reference (not call it) to `Field(default_factory=...)`.
    4. `def _serialize_utc(value: datetime) -> str:` MOVED verbatim from `backend/cmc/api/schemas/common.py` (same body — `if value.tzinfo is None: value = value.replace(tzinfo=UTC); return value.astimezone(UTC).isoformat().replace("+00:00", "Z")`).
    5. `UTCDatetime = Annotated[datetime, PlainSerializer(_serialize_utc, return_type=str, when_used="json")]` — moved verbatim. Per D-Colocation, this is now the canonical home (re-export from `common.py` happens in Task 2).

    Do NOT introduce speculative helpers (`today_utc`, `parse_iso_utc`) — D-Module-shape locks "promote helpers only at 3+ uses; no speculative". Plan 02's sweep determines if any pattern hits the threshold; if so, Plan 02 promotes them inline.

    Create `backend/tests/test_core_time.py` with the five unit tests listed in <behavior>. Tests must be importable as a standalone module — no fixtures from conftest.py beyond what already exists. The reexport-path test imports from BOTH `cmc.core.time` and `cmc.api.schemas.common`; this test will FAIL until Task 2 lands, which is intentional RED→GREEN within this plan (re-export is the GREEN move).

    Run `cd backend && uv run pytest tests/test_core_time.py -q` — confirm 4/5 tests pass and the reexport-path test fails with `ImportError` or identity mismatch (this is the expected RED state after Task 1; Task 2 turns it GREEN).
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_core_time.py -q --tb=short 2>&1 | grep -E '(passed|failed|error)' | tail -3</automated>
    <expected>4 passed, 1 failed (test_utc_datetime_reexport_path) — this is the RED state Task 2 will close.</expected>
  </verify>
  <done>
    - `backend/cmc/core/time.py` exists, contains `def now_utc` and `UTCDatetime = Annotated[...]`, no other helpers.
    - `backend/tests/test_core_time.py` exists with 5 tests; 4 pass, the re-export identity test fails (intentional, closed by Task 2).
    - `python -c "from cmc.core.time import now_utc; print(now_utc().tzinfo)"` prints `None` from inside `backend/`.
    - No call site in `backend/cmc/db/models/` or `backend/cmc/pricing.py` is modified by this task — that is Plan 02's scope.
  </done>
</task>

<task type="auto">
  <name>Task 2: Re-export UTCDatetime from cmc/api/schemas/common.py and ergonomic re-export of now_utc from cmc/core/__init__.py</name>
  <files>backend/cmc/api/schemas/common.py, backend/cmc/core/__init__.py</files>
  <action>
    Per D-Colocation (re-export path chosen — D-Pitfall-9 in RESEARCH proves re-export saves touching 9 schema files):

    1. Edit `backend/cmc/api/schemas/common.py`:
       - DELETE the local definition of `_serialize_utc` and `UTCDatetime` (now lives in `cmc.core.time`).
       - DELETE the now-orphaned `from datetime import UTC, datetime` import IF nothing else in the file uses it (verify with `grep`); otherwise leave it.
       - DELETE the now-orphaned `from typing import Annotated` and `from pydantic import PlainSerializer` imports IF unused elsewhere in the file.
       - ADD `from cmc.core.time import UTCDatetime  # noqa: F401  (re-export — canonical home is cmc.core.time per Phase 18 D-Colocation)` at the appropriate import-block position.
       - The 8+ other importers (`backend/cmc/api/schemas/{sessions,hitl,mcp,alerts,tasks,observability,skills,schedules}.py` per `git grep -nE 'from cmc\.api\.schemas\.common import.*UTCDatetime'`) MUST continue to work without modification — verify by re-running their existing tests in the verify block below.

    2. Edit `backend/cmc/core/__init__.py`:
       - ADD `from cmc.core.time import now_utc` to the existing re-export block (matches the existing pattern of re-exporting `register_error_handlers`, `configure_logging`, `repo_root`, `resolve_under_repo_root`, `SPAStaticFiles`).
       - This enables both `from cmc.core.time import now_utc` (explicit) and `from cmc.core import now_utc` (ergonomic) — Plan 02's sweep can pick either form, Claude's discretion.
       - If the existing `__init__.py` uses `__all__`, append `"now_utc"` to it.

    Do NOT touch any of the 9 schema importers. Do NOT touch any model file. Do NOT introduce a deprecation shim (D-No-deprecation-shim).

    Run the previously-failing test from Task 1 to confirm GREEN.
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/test_core_time.py -q --tb=short 2>&1 | grep -E '(passed|failed|error)' | tail -3 &amp;&amp; echo '---' &amp;&amp; cd backend &amp;&amp; uv run pytest tests/test_pricing.py tests/test_alerts_dispatcher.py -q --tb=line 2>&amp;1 | tail -5 &amp;&amp; echo '---' &amp;&amp; cd backend &amp;&amp; uv run python -c "from cmc.api.schemas.common import UTCDatetime as A; from cmc.core.time import UTCDatetime as B; assert A is B, 'identity broken'; from cmc.core import now_utc; print('OK', now_utc().tzinfo)"</automated>
    <expected>5 passed (test_core_time.py); existing pytest suites for pricing + alerts still green; identity check prints `OK None`.</expected>
  </verify>
  <done>
    - `backend/cmc/api/schemas/common.py` re-exports `UTCDatetime` from `cmc.core.time` (1 import line; original definition deleted).
    - `backend/cmc/core/__init__.py` re-exports `now_utc`.
    - `cd backend &amp;&amp; uv run pytest tests/test_core_time.py` shows 5/5 passing.
    - Existing schema importers (sessions/hitl/mcp/alerts/tasks/observability/skills/schedules) compile and their tests pass without modification.
    - `git grep -nE 'datetime\.utcnow' -- backend/` STILL returns 22 hits — Plan 02's responsibility, not this plan's.
  </done>
</task>

</tasks>

<verification>
Plan-level checks (run after both tasks complete):

```bash
# Helper contract
cd backend && uv run pytest tests/test_core_time.py -q

# Full backend suite — must remain green (helper module is purely additive at this stage)
cd backend && uv run pytest -q --tb=no 2>&amp;1 | tail -3

# Re-export integrity — both import paths resolve to the SAME annotated type
cd backend && uv run python -c "from cmc.api.schemas.common import UTCDatetime as A; from cmc.core.time import UTCDatetime as B; assert A is B"

# Confirm sweep is NOT yet done (this plan's scope explicitly excludes it)
git grep -cE 'datetime\.utcnow' -- backend/  # expect 22 (or 21 — pricing.py:182 may be touched only by Plan 02)
```

Lint sanity (touched files only):

```bash
cd backend && uv run ruff check cmc/core/time.py cmc/core/__init__.py cmc/api/schemas/common.py tests/test_core_time.py
```
</verification>

<success_criteria>
1. `backend/cmc/core/time.py` exports exactly `now_utc` and `UTCDatetime` (and the private `_serialize_utc`); no speculative helpers.
2. `backend/tests/test_core_time.py` passes 5/5 — including the identity check that `cmc.api.schemas.common.UTCDatetime is cmc.core.time.UTCDatetime`.
3. The 9 existing `from cmc.api.schemas.common import …, UTCDatetime` import sites continue to work unchanged (none of them are modified by this plan).
4. Backend pytest suite remains green at the same pass count baseline (~561 passed) — this plan must not regress any existing test.
5. `git grep -nE 'datetime\.utcnow' -- backend/` STILL returns 22 hits at plan close — sweep is Plan 02's scope. (Confirms this plan stayed within its single concern.)
</success_criteria>

<output>
After completion, create `.planning/phases/18-polish-carry-forward-cleanup/18-01-SUMMARY.md` documenting:
- The exact symbols exported from `cmc.core.time` (so Plan 02 has a stable contract).
- The chosen re-export path (`from cmc.core.time import UTCDatetime` in `common.py`, `from cmc.core.time import now_utc` in `cmc/core/__init__.py`).
- Confirmation that NO sweep was attempted in this plan (Plan 02's scope).
- Backend pytest pass count at plan close (sanity check that helper introduction is non-regressive).
</output>
