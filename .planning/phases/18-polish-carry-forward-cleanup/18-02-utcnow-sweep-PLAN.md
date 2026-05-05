---
phase: 18-polish-carry-forward-cleanup
plan: 02
type: execute
wave: 2
depends_on: [18-01]
files_modified:
  - backend/cmc/db/models/activities.py
  - backend/cmc/db/models/alert_rules.py
  - backend/cmc/db/models/alert_state.py
  - backend/cmc/db/models/decisions.py
  - backend/cmc/db/models/inbox.py
  - backend/cmc/db/models/live_state.py
  - backend/cmc/db/models/mcp_stats.py
  - backend/cmc/db/models/notification_log.py
  - backend/cmc/db/models/otel_events.py
  - backend/cmc/db/models/otel_metrics.py
  - backend/cmc/db/models/pricing.py
  - backend/cmc/db/models/schedules.py
  - backend/cmc/db/models/sessions.py
  - backend/cmc/db/models/skills.py
  - backend/cmc/db/models/system_state.py
  - backend/cmc/db/models/tasks.py
  - backend/cmc/db/models/token_usage.py
  - backend/cmc/pricing.py
  - backend/tests/test_pricing.py
autonomous: true
requirements: [POLI-06]
must_haves:
  truths:
    - "Field(default_factory=datetime.utcnow) is gone from the codebase — all 22 sites call now_utc instead."
    - "ruff check --select UP passes clean across backend/."
    - "git grep -nE 'datetime\\.utcnow|from datetime import .*utcnow' returns ZERO matches across the entire repo (excluding planning docs and historical SUMMARYs which are read-only artifacts)."
    - "Backend pytest suite remains green (~561 passed) AND the deprecation-warning count for datetime.utcnow drops from ~1429 to 0."
  artifacts:
    - path: "backend/cmc/db/models/*.py"
      provides: "20 Field(default_factory=now_utc) sites across 17 model files (some files have 2 timestamp fields)"
      pattern: "default_factory=now_utc"
    - path: "backend/cmc/pricing.py"
      provides: "Inline call site converted to now_utc()"
      pattern: "loaded_at=now_utc\\(\\)"
    - path: "backend/tests/test_pricing.py"
      provides: "Test inline call site converted to now_utc()"
      pattern: "loaded_at=now_utc\\(\\)"
  key_links:
    - from: "backend/cmc/db/models/*.py"
      to: "backend/cmc/core/time.py"
      via: "from cmc.core.time import now_utc (added to each model file's import block)"
      pattern: "from cmc\\.core\\.time import now_utc"
    - from: "backend/cmc/pricing.py"
      to: "backend/cmc/core/time.py"
      via: "from cmc.core.time import now_utc"
      pattern: "from cmc\\.core\\.time import now_utc"
---

<objective>
Execute the mechanical sweep that replaces every `datetime.utcnow` call site with the Plan-01 `now_utc` helper. Single sweep commit per CONTEXT — bisect-friendly, atomic, no half-migrated state.

Purpose: This is the "follow-up commit" half of the locked two-commit migration (D-Sweep-style). Plan 01 created the destination; this plan moves all 22 traffic to it. The phase's POLI-06 verify gate (BOTH `ruff check --select UP` clean AND `git grep` zero matches) lives at this plan's close.

Output:
- 22 call sites swept: 20 `Field(default_factory=...)` defaults across 17 model files + 2 inline `datetime.utcnow()` calls (pricing.py:182, test_pricing.py:139).
- Each touched file imports `now_utc` from `cmc.core.time` (or `cmc.core` — both valid per Plan 01).
- Pytest deprecation-warning count for `datetime.utcnow` drops from ~1429/run to 0.
- Both verify gates green: `ruff check --select UP` AND `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow'` returns 0 across `backend/`.
</objective>

<execution_context>
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/work/git/claude-mission-control/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/18-polish-carry-forward-cleanup/18-CONTEXT.md
@.planning/phases/18-polish-carry-forward-cleanup/18-RESEARCH.md
@.planning/phases/18-polish-carry-forward-cleanup/18-01-SUMMARY.md

<interfaces>
<!-- Plan 01 contract (assumed live before this plan starts): -->

```python
# backend/cmc/core/time.py
def now_utc() -> datetime: ...   # returns datetime.now(UTC).replace(tzinfo=None)
UTCDatetime = Annotated[datetime, PlainSerializer(...)]   # canonical home (re-exported by common.py)

# backend/cmc/core/__init__.py re-exports now_utc — both import forms work:
from cmc.core.time import now_utc          # explicit (preferred for module files)
from cmc.core import now_utc                # ergonomic (acceptable)
```

<!-- Pattern lock (D-Field-factories): direct function reference, NO parens, NO module-level constant. -->

```python
# CORRECT — function reference, evaluated per instantiation:
created_at: datetime = Field(default_factory=now_utc)

# WRONG — Pitfall 7 — parens freeze the value at import time:
created_at: datetime = Field(default_factory=now_utc())   # ← never write this

# CORRECT for inline call sites where a VALUE is wanted (pricing.py:182, test_pricing.py:139):
loaded_at=now_utc()   # parens, because we want the value at THIS line, not a factory
```

<!-- Enumerated 22 sites (verified against HEAD `ac63767`): -->

```
backend/cmc/db/models/activities.py:25         updated_at      Field(default_factory=…)
backend/cmc/db/models/alert_rules.py:30        created_at      Field(default_factory=…)
backend/cmc/db/models/alert_rules.py:31        updated_at      Field(default_factory=…)
backend/cmc/db/models/alert_state.py:20        last_evaluated_at  Field(default_factory=…)
backend/cmc/db/models/decisions.py:45          created_at      Field(default_factory=…)
backend/cmc/db/models/inbox.py:41              created_at      Field(default_factory=…)
backend/cmc/db/models/live_state.py:30         updated_at      Field(default_factory=…)
backend/cmc/db/models/mcp_stats.py:27          computed_at     Field(default_factory=…)
backend/cmc/db/models/notification_log.py:21   sent_at         Field(default_factory=…)
backend/cmc/db/models/otel_events.py:33        received_at     Field(default_factory=…)
backend/cmc/db/models/otel_metrics.py:23       received_at     Field(default_factory=…)
backend/cmc/db/models/pricing.py:30            loaded_at       Field(default_factory=…)
backend/cmc/db/models/schedules.py:30          created_at      Field(default_factory=…)
backend/cmc/db/models/schedules.py:31          updated_at      Field(default_factory=…)
backend/cmc/db/models/sessions.py:17           synced_at       Field(default_factory=…)
backend/cmc/db/models/skills.py:28             updated_at      Field(default_factory=…)
backend/cmc/db/models/system_state.py:23       updated_at      Field(default_factory=…)
backend/cmc/db/models/tasks.py:47              created_at      Field(default_factory=…)
backend/cmc/db/models/token_usage.py:28        updated_at      Field(default_factory=…)
backend/cmc/pricing.py:182                     loaded_at       inline call: datetime.utcnow()
backend/tests/test_pricing.py:139              loaded_at       inline call: datetime.utcnow()
backend/tests/conftest.py:451                  comment only — see action notes
```

<!-- Note on conftest.py:451 — the line is a COMMENT (`# datetime.utcnow() (deprecated path).`). -->
<!-- Do NOT delete the comment; the rule of "zero matches" applies to executable code. -->
<!-- However, since the comment is now stale (the deprecated pattern no longer appears in the codebase), -->
<!-- update the comment to reference `now_utc()` instead, OR delete the comment line entirely. -->
<!-- This satisfies `git grep -nE 'datetime\.utcnow'` returning 0 within `backend/`. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sweep all 19 Field(default_factory=datetime.utcnow) sites in cmc/db/models/</name>
  <files>backend/cmc/db/models/activities.py, backend/cmc/db/models/alert_rules.py, backend/cmc/db/models/alert_state.py, backend/cmc/db/models/decisions.py, backend/cmc/db/models/inbox.py, backend/cmc/db/models/live_state.py, backend/cmc/db/models/mcp_stats.py, backend/cmc/db/models/notification_log.py, backend/cmc/db/models/otel_events.py, backend/cmc/db/models/otel_metrics.py, backend/cmc/db/models/pricing.py, backend/cmc/db/models/schedules.py, backend/cmc/db/models/sessions.py, backend/cmc/db/models/skills.py, backend/cmc/db/models/system_state.py, backend/cmc/db/models/tasks.py, backend/cmc/db/models/token_usage.py</files>
  <action>
    Per D-Sweep-style (single sweep commit) and D-Field-factories (direct function reference):

    For each of the 17 model files listed in <files>, apply this uniform mechanical edit:

    1. ADD `from cmc.core.time import now_utc` to the import block. Order it alphabetically among existing `cmc.*` imports (most files already have `from cmc.…` imports — match the existing import-ordering convention in each file).
    2. REPLACE every `default_factory=datetime.utcnow` with `default_factory=now_utc` (function reference — NO PARENS, see Pitfall 7).
    3. If `from datetime import datetime` is the ONLY remaining usage of `datetime` in the file (the timestamp field still has `datetime` as its type annotation), KEEP that import. If the import is now unused (rare — a file where the type annotation also went away — none of the 17 files match this), remove it.

    Per file:
    - `activities.py`: 1 site (line ~25, `updated_at`).
    - `alert_rules.py`: 2 sites (lines ~30 + ~31, `created_at` + `updated_at`).
    - `alert_state.py`: 1 site (line ~20, `last_evaluated_at`).
    - `decisions.py`: 1 site (line ~45, `created_at`).
    - `inbox.py`: 1 site (line ~41, `created_at`).
    - `live_state.py`: 1 site (line ~30, `updated_at`).
    - `mcp_stats.py`: 1 site (line ~27, `computed_at`).
    - `notification_log.py`: 1 site (line ~21, `sent_at`).
    - `otel_events.py`: 1 site (line ~33, `received_at`).
    - `otel_metrics.py`: 1 site (line ~23, `received_at`).
    - `pricing.py`: 1 site (line ~30, `loaded_at`). Note: this is `cmc/db/models/pricing.py`, NOT `cmc/pricing.py` — the latter is Task 2's scope.
    - `schedules.py`: 2 sites (lines ~30 + ~31, `created_at` + `updated_at`).
    - `sessions.py`: 1 site (line ~17, `synced_at`).
    - `skills.py`: 1 site (line ~28, `updated_at`).
    - `system_state.py`: 1 site (line ~23, `updated_at`).
    - `tasks.py`: 1 site (line ~47, `created_at`).
    - `token_usage.py`: 1 site (line ~28, `updated_at`).

    Total: 19 `Field` default_factory sites across 17 files. (Note: 19 sites = 17 files × 1 + 2 files with 2 sites each = `alert_rules.py` and `schedules.py`.)

    Pitfall checks (verify before claiming done):
    - Pitfall 7: `git grep -nE 'default_factory=now_utc\(\)'` MUST return 0 — guard against accidental parens.
    - Pitfall 2: app must still start (no circular import). `cmc.core.time` imports only `pydantic` + stdlib; `cmc.db.models.*` imports `cmc.core.time` — no cycle. Verify via `python -c "import cmc.app.lifespan"` (or any module that triggers full app import).

    After all 17 files are edited, run the touched-file pytest sample to confirm models still work:
    `cd backend && uv run pytest tests/test_pricing.py tests/test_alerts_dispatcher.py tests/test_models.py 2>/dev/null -q --tb=line`
    (Skip any test file that doesn't exist — the sample is "best-effort touch coverage", not exhaustive; full suite runs in Task 3.)

    Per D-Aggressive-cleanup, if `ruff check` flags any non-`UP` issue in any of these touched files (E, F, I, B, PERF, RUF rules), fix it inline as part of this sweep — bigger diff is acceptable per CONTEXT.
  </action>
  <verify>
    <automated>cd backend && git grep -nE 'datetime\.utcnow' -- 'cmc/db/models/' | wc -l | tr -d ' ' &amp;&amp; cd backend &amp;&amp; git grep -nE 'default_factory=now_utc\(\)' | wc -l | tr -d ' ' &amp;&amp; cd backend &amp;&amp; uv run python -c "import cmc.app.lifespan; print('import OK')"</automated>
    <expected>First grep: `0` (no remaining utcnow in models). Second grep: `0` (Pitfall 7 — no accidental parens). Import: `import OK`.</expected>
  </verify>
  <done>
    - All 19 `Field(default_factory=datetime.utcnow)` sites in `cmc/db/models/*.py` are now `Field(default_factory=now_utc)`.
    - Each touched model file imports `now_utc` from `cmc.core.time` (or `cmc.core`).
    - `git grep -nE 'datetime\.utcnow' -- 'backend/cmc/db/models/'` returns 0.
    - `git grep -nE 'default_factory=now_utc\(\)'` returns 0 across the repo.
    - App imports cleanly: `cd backend &amp;&amp; uv run python -c "import cmc.app.lifespan"` succeeds.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sweep the 2 inline datetime.utcnow() call sites + verify both gates green + drop deprecation-warning count to 0</name>
  <files>backend/cmc/pricing.py, backend/tests/test_pricing.py, backend/tests/conftest.py</files>
  <action>
    Per Pitfall 8 (inline calls are NOT factories — replacement is `now_utc()` WITH parens because we want the value at the call site, not a factory reference):

    1. Edit `backend/cmc/pricing.py`:
       - ADD `from cmc.core.time import now_utc` to the import block.
       - At line ~182 inside the `sqlite_insert(...).values(...)` block, replace `loaded_at=datetime.utcnow(),` with `loaded_at=now_utc(),`.
       - If `datetime` is no longer used elsewhere in the file, remove the now-orphaned `from datetime import datetime` import. If still used (likely — pricing.py uses datetime types broadly), keep it.

    2. Edit `backend/tests/test_pricing.py`:
       - ADD `from cmc.core.time import now_utc` to the import block.
       - At line ~139, replace `loaded_at=datetime.utcnow(),` with `loaded_at=now_utc(),`.
       - Same orphan-import handling as above.

    3. Edit `backend/tests/conftest.py`:
       - At line ~451, the line is a stale comment: `# datetime.utcnow() (deprecated path).`
       - UPDATE the comment to reference `now_utc()` instead (e.g., `# now_utc() — canonical replacement for the deprecated datetime.utcnow().`), OR delete the comment line entirely.
       - This is the last `datetime.utcnow` token in `backend/`; after this edit `git grep` returns 0 on the verify gate.

    Per CONTEXT-locked dual-gate verify:
    - GATE 1: `cd backend &amp;&amp; uv run ruff check --select UP` returns "All checks passed!".
    - GATE 2: `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/` returns ZERO matches.
    - GATE 3 (signal cross-check, not in CONTEXT but locked by ROADMAP SC4): `cd backend &amp;&amp; uv run pytest -q --tb=no 2>&amp;1 | tail -3` shows 561 (or higher) passed AND zero `DeprecationWarning: datetime.datetime.utcnow` lines in the warning summary.

    Per D-Aggressive-cleanup: if a full-repo `ruff check` (no select filter) surfaces any other `UP`/`E`/`F`/`I`/`B`/`PERF`/`RUF` finding in `backend/`, fix it in this same task — Phase 18 doubles as a lint-debt cleanup pass per CONTEXT. Run `cd backend &amp;&amp; uv run ruff check` after the sweep; address every finding inline. Bigger diff is acceptable.

    Per Pitfall 5: `--select UP` is necessary but not sufficient — it does NOT catch `datetime.utcnow` directly (DTZ003 does, and DTZ is not in project select). The `git grep` gate is the load-bearing one. Do NOT add DTZ to project ruff select in this plan (Open-Question 3 in RESEARCH defers that decision to a separate STATE.md todo — would surface 38 unrelated DTZ findings including local-time-affecting ones in `cmc/api/routes/cost.py`).

    Per Open-Question 3: if during the sweep you encounter a `datetime.now()` (DTZ005, no `tz=` arg) call that is semantically naive-UTC (matches the `now_utc()` contract), migrate it inline. If it is local-time-intentional (e.g., a user-facing display computation), leave it and append the file:line to a "DTZ-005 follow-on" note in the plan SUMMARY for STATE.md elevation. Do NOT migrate ambiguous DTZ005 sites blindly.
  </action>
  <verify>
    <automated>cd backend && git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- 'backend/' | wc -l | tr -d ' ' &amp;&amp; cd backend &amp;&amp; uv run ruff check --select UP 2>&amp;1 | tail -1 &amp;&amp; cd backend &amp;&amp; uv run pytest -q --tb=no 2>&amp;1 | tail -3 &amp;&amp; cd backend &amp;&amp; uv run pytest -q --tb=no 2>&amp;1 | grep -c 'datetime\.datetime\.utcnow' | tr -d ' '</automated>
    <expected>git grep: `0`. ruff: `All checks passed!`. pytest: `561 passed` (or higher) `in Xs`. deprecation-warning grep: `0`.</expected>
  </verify>
  <done>
    - `cmc/pricing.py:182` and `tests/test_pricing.py:139` use `now_utc()` (with parens — value form).
    - `tests/conftest.py:451` comment updated or deleted.
    - GATE 1 green: `ruff check --select UP` passes clean.
    - GATE 2 green: `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- backend/` returns 0.
    - GATE 3 green: pytest passes at the same baseline (~561) AND deprecation-warning count for `datetime.utcnow` is 0 (down from ~1429).
    - Full-repo `ruff check` (no filter) is also green on touched files (D-Aggressive-cleanup).
  </done>
</task>

<task type="auto">
  <name>Task 3: Run the full backend suite + lint pass to confirm sweep is non-regressive and capture the warning-count delta</name>
  <files>(none — verification-only task)</files>
  <action>
    Final non-regression gate before handing off to Plan 05's baseline recording.

    Run, in order:
    1. `cd backend &amp;&amp; uv run pytest -q --tb=short 2>&amp;1 | tee /tmp/phase18-plan02-pytest.log` — full backend suite. Pass count must equal or exceed the pre-Phase-18 baseline (561 from RESEARCH A1). Failure count must be 0. If a test fails, diagnose immediately — most likely cause is Pitfall 2 (import ordering) or Pitfall 7 (parens on factory).
    2. `cd backend &amp;&amp; uv run ruff check 2>&amp;1 | tail -10` — full backend lint pass (project-default select). Must return clean. If non-`UP` findings appear in files OTHER than the 19 touched in Tasks 1–2, fix them inline per D-Aggressive-cleanup (CONTEXT explicitly authorizes broader lint-debt cleanup as part of Phase 18). Files outside `backend/cmc/db/models/`, `backend/cmc/pricing.py`, and `backend/tests/test_pricing.py` may be added to this plan's `files_modified` if touched — note them in the SUMMARY.
    3. `grep -c 'datetime\.datetime\.utcnow' /tmp/phase18-plan02-pytest.log` — confirms zero `DeprecationWarning: datetime.datetime.utcnow()` lines (the reverse-direction signal from RESEARCH §"Cross-cutting"). Pre-sweep baseline: ~1429. Target: 0.
    4. Optionally run `cd backend &amp;&amp; uv run pyright cmc/core/time.py cmc/db/models/` to catch any naive-UTC type drift introduced by the sweep (Pitfall 7 fallback detection — pyright flags `Callable[[], T]` mismatches if parens crept in). Skip if pyright is slow; the test suite + ruff already cover the main failure modes.

    If full-suite warning count is significantly higher than (pre-sweep total − ~1429), investigate — there may be other DeprecationWarning sources unrelated to POLI-06 that the aggressive-cleanup discipline allows fixing in-phase, but those should be tracked separately in the SUMMARY for STATE.md elevation if not fixed.

    Per D-Aggressive-cleanup (chunk-strategy discretion): commit each adjacent fix discovered in step 2 as its own commit so the diff stays reviewable (e.g., `chore(18): fix RUF012 in cmc/api/routes/foo.py`). The POLI-06 sweep itself remains a single mechanical commit (the union of Tasks 1+2 of this plan).
  </action>
  <verify>
    <automated>cd backend && uv run pytest -q --tb=no 2>&amp;1 | tee /tmp/phase18-plan02-final.log | tail -3 &amp;&amp; grep -c 'datetime\.datetime\.utcnow' /tmp/phase18-plan02-final.log | tr -d ' ' &amp;&amp; cd backend &amp;&amp; uv run ruff check 2>&amp;1 | tail -1</automated>
    <expected>pytest: `561 passed` (or higher), `0 failed`. deprecation-grep: `0`. ruff: `All checks passed!`.</expected>
  </verify>
  <done>
    - Full backend pytest suite green, pass count >= 561.
    - Zero `DeprecationWarning: datetime.datetime.utcnow` lines in the pytest output.
    - Full-repo `ruff check` clean (project-default select).
    - SUMMARY records: pre-sweep warning count (1429), post-sweep warning count (0), pytest pass count, any DTZ-005 follow-ons deferred to STATE.md, any adjacent lint fixes performed (with their file paths).
  </done>
</task>

</tasks>

<verification>
Phase-level POLI-06 verify gate (BOTH must pass per CONTEXT D-Verify-gate):

```bash
# GATE 1 — Ruff UP rules clean (necessary, not sufficient — see Pitfall 5)
cd backend && uv run ruff check --select UP
# Expected: All checks passed!

# GATE 2 — Zero datetime.utcnow tokens anywhere in backend/ (load-bearing gate)
git grep -nE 'datetime\.utcnow|from datetime import .*utcnow' -- 'backend/'
# Expected: (no output) — exit code may be non-zero if grep finds nothing, that is OK

# Cross-check — Pitfall 7 guard
git grep -nE 'default_factory=now_utc\(\)'
# Expected: (no output)

# Cross-check — pytest non-regression + deprecation warning kill
cd backend && uv run pytest -q --tb=no 2>&amp;1 | tail -3
cd backend && uv run pytest -q --tb=no 2>&amp;1 | grep -c 'datetime\.datetime\.utcnow'
# Expected: 561+ passed; 0 utcnow deprecation warnings.

# Full-repo lint pass (D-Aggressive-cleanup)
cd backend && uv run ruff check
# Expected: All checks passed!
```
</verification>

<success_criteria>
1. POLI-06 dual gate green: `ruff check --select UP` clean AND `git grep` returns zero matches across `backend/`.
2. Backend pytest suite green at >= 561 passed, zero failures, zero `DeprecationWarning: datetime.datetime.utcnow` lines in the warning summary.
3. All 22 enumerated call sites are migrated (19 model `Field` defaults + 2 inline calls + 1 stale comment in conftest.py).
4. No Pitfall-7 instance exists: `git grep -nE 'default_factory=now_utc\(\)'` returns 0.
5. App imports cleanly (no circular import per Pitfall 2): `cd backend &amp;&amp; uv run python -c "import cmc.app.lifespan"` succeeds.
6. The sweep is bisect-friendly — atomic single mechanical-replacement commit (Tasks 1+2 union); adjacent lint fixes from Task 3 are separate commits per D-Aggressive-cleanup.
7. No new dependencies introduced (`uv lock` unchanged); no `Field` constants or module-level `NOW_UTC` indirection (D-Field-factories — direct function reference only).
</success_criteria>

<output>
After completion, create `.planning/phases/18-polish-carry-forward-cleanup/18-02-SUMMARY.md` documenting:
- Pre-sweep vs post-sweep `datetime.utcnow` deprecation-warning counts (target: 1429 → 0).
- Pre-sweep vs post-sweep pytest pass counts (target: same or higher).
- The exact 22 call sites migrated (file:line list — sourced from this plan's `<interfaces>` block).
- Any adjacent lint/DTZ-005 fixes performed (with file:line + rationale) — for STATE.md elevation if any items were deferred.
- Confirmation that both POLI-06 dual gates are green at plan close.
</output>
