# Phase 18: Polish & Carry-Forward Cleanup - Research

**Researched:** 2026-05-05
**Domain:** Carried-debt discharge — Python deprecated stdlib sweep, vitest determinism, Playwright strict-mode selector cleanup
**Confidence:** HIGH (every claim verified against the live repository state at HEAD)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Time helper API (POLI-06)**
- **Module:** `cmc/core/time.py` — single canonical home for naive-UTC time concerns.
- **Primary function:** `now_utc()` — returns `datetime.now(UTC).replace(tzinfo=None)` (naive UTC, matches the existing `UTCDatetime` PlainSerializer contract).
- **Module shape:** Small kit, not a single function. Promote a helper into the module if the same pattern appears 3+ times during the sweep (e.g., `today_utc()`, `parse_iso_utc()`); otherwise stay minimal. No speculative helpers.
- **Colocation:** The existing `UTCDatetime` PlainSerializer type moves into (or is re-exported from) `cmc/core/time.py` so all naive-UTC concerns live in one module. Import-update churn from this colocation is part of the same sweep.
- **No deprecation shim.** Hard-delete every `datetime.utcnow` call site in the same PR as the helper introduction.

**Migration sweep approach (POLI-06)**
- **Sweep style:** Single sweep commit. Helper + colocated `UTCDatetime` land first; one follow-up commit replaces all 18+ sites in one mechanical diff. Reviewer sees a uniform pattern; bisect-friendly because the sweep is atomic.
- **Tooling:** Claude's discretion — pick whichever combination of `ruff --select UP --fix`, manual edits, and targeted codemod minimizes risk of subtle behavior change. No requirement to introduce a one-off codemod tool dependency.
- **Field factories:** `Field(default_factory=now_utc)` — direct function reference, no module-level constant, no indirection.
- **Verify gate (both required):** `ruff check --select UP` passes clean AND `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow'` returns zero matches across the repo. Both gates must be green to call the sweep done.

**Cleanup scope discipline (aggressive green-baseline)**
- **Flaky tests:** Fix every flake encountered during the sweep, not just POLI-07's `SchedulesCard > stale row`. Goal is "green CI baseline" — a lurking flake that fires next week defeats the purpose. Each adjacent flake fix is a separate commit so the diff stays reviewable.
- **Lint debt:** Fix everything `ruff` flags in touched files and during the full-repo `ruff check` pass — not just `UP` rules. Phase 18 doubles as a lint-debt cleanup pass so v1.2 feature phases start genuinely clean. Bigger diff is acceptable.
- **Playwright selectors:** Sweep all e2e specs, not just `schedule-composer.spec.ts` and `alerts.spec.ts`. Run the full Playwright suite in strict mode; fix every ambiguity surfaced. Phase exits with a fully strict-mode-clean e2e suite.
- **Deferred bin:** Anything genuinely out of scope (truly orthogonal cleanup, anything touching feature behavior) is captured in **both** this CONTEXT.md's Deferred Ideas section AND elevated to STATE.md pending todos for milestone-wide visibility.

**data-testid convention (POLI-08)**
- **Naming pattern:** `feature-component-element` (kebab-case, path-style). Examples: `schedule-composer-submit`, `alerts-firehose-skill-filter`, `skills-detail-projects-table`. Predictable for grep, scoped by feature, collision-resistant.
- **Documentation location:** Frontend e2e README (e.g., `frontend/tests/e2e/README.md`) — lives next to the Playwright specs that enforce it. CONTRIBUTING.md is **not** updated for this convention; the rule lives where the tooling does.
- **Migration scope:** Sweep all e2e specs. Replace text- and role-based selectors with `data-testid` everywhere strict-mode collides; consistent with the broader "sweep all selectors" cleanup-scope decision.
- **Where the attribute lives:** Source components. Add `data-testid` attrs directly to React components — standard Playwright pattern, simpler tests, no test-only wrapper infra.

**POLI-07 implementation notes**
- Refactor `SchedulesCard.test.tsx > stale row` to use `vi.spyOn(Date, 'now')` rather than `vi.useFakeTimers` (locked by ROADMAP success criterion).
- Verify determinism by running the suite under both `TZ=UTC` and `TZ=America/New_York` at simulated 23:55 boundary (locked by ROADMAP success criterion).
- During the broader cleanup sweep: audit other vitest specs for similar `useFakeTimers` patterns and migrate them to `vi.spyOn(Date, 'now')` if they exhibit the same time-of-day flake risk (in scope per aggressive cleanup decision above).

**Verifier baseline**
- At phase close, the verifier records baseline pass counts (backend pytest count, frontend vitest count, Playwright e2e count) for downstream Phase 19–23 verifiers to compare against. Recording location is Claude's discretion — likely the phase VERIFICATION.md or a `BASELINE.md` checked into the phase directory.

### Claude's Discretion
- Codemod tooling for the `datetime.utcnow` sweep (manual / `ruff --fix` / one-off libcst — pick whichever is fastest with lowest risk).
- Which "small kit" helpers (if any) to promote into `cmc/core/time.py` beyond `now_utc()`.
- Exact `data-testid` strings on individual components (must follow `feature-component-element` pattern).
- Whether to colocate `UTCDatetime` in `cmc/core/time.py` via move-and-update-imports vs re-export-only (whichever minimizes import churn).
- Recording mechanism for verifier baseline pass counts (PHASE.md / VERIFICATION.md / dedicated BASELINE.md).
- Whether to chunk adjacent flake/lint fixes into separate commits per fix or one cleanup commit per category — whichever keeps diffs reviewable.

### Deferred Ideas (OUT OF SCOPE)
None at discussion time — discussion stayed within phase scope. Any adjacent issues uncovered during the sweep itself that are NOT fixed in-phase will be appended here at phase close AND elevated to STATE.md pending todos for milestone-wide visibility.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLI-06 | Replace deprecated `Field(default_factory=datetime.utcnow)` across 18+ sites with `cmc/core/time.py.now_utc()` returning `datetime.now(UTC).replace(tzinfo=None)`; `ruff check --select UP` passes | Verified 22 call sites in repo (20 model defaults + 2 explicit calls). UTCDatetime imported from 9 files. `from datetime import datetime` is the standard import shape — no `from datetime import utcnow` form found. |
| POLI-07 | Stabilize `SchedulesCard.test.tsx > stale row` time-of-day flake — fix via `vi.spyOn(Date, 'now')` (NOT `vi.useFakeTimers`); deterministic across all clock conditions | Verified test currently fails (1/293 tests, run 2026-05-05): fixture's `id: 1` row has hard-coded `last_run_at: '2026-04-27T15:00:00Z'` so today both rows are stale. Fix requires BOTH `Date.now()` lock AND fixture overhaul — see Common Pitfalls §1. |
| POLI-08 | Disambiguate Playwright strict-mode selector ambiguity; establish `data-testid` convention; convention documented in frontend e2e README | Verified strict-mode failure in `schedule-composer.spec.ts:54` — `getByLabel('Name')` matches both `<span>Name</span>` (composer) AND `aria-label="Filter skill name"` (SkillTimeline) on the `/skills` route because Playwright's getByLabel matches aria-label substrings. `frontend/tests/e2e/README.md` does not exist; create new. |
</phase_requirements>

## Summary

Phase 18 is a discharge sweep of three carried-debt items. All three have been ground-truthed against the live repository at HEAD (commit `ac63767`):

1. **POLI-06 (Python `datetime.utcnow` sweep):** 22 call sites total — 20 `Field(default_factory=datetime.utcnow)` defaults across `cmc/db/models/`, plus 2 explicit `datetime.utcnow()` calls in `cmc/pricing.py:182` and `tests/test_pricing.py:139`. Pytest emits **1429 deprecation warnings per run** because `default_factory` callbacks fire on every model instantiation — sweep eliminates the warning noise entirely. The existing `UTCDatetime` PlainSerializer (in `cmc/api/schemas/common.py:29`) is imported by 9 files. The CONTEXT-required `ruff check --select UP` gate currently passes clean **but is insufficient** — `UP` does not flag `datetime.utcnow` (the relevant rule is `DTZ003`, in the unselected `flake8-datetimez` group). The combined `ruff --select UP` + `git grep` two-gate verification in CONTEXT is the correct guard.

2. **POLI-07 (vitest determinism):** The test is **already failing today** — not just flaking. Vitest baseline: 65 files, 293 tests, 1 failed (`SchedulesCard > stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class`). Root cause is twofold: (a) `Date.now()` is unfaked so the test reads wall clock, and (b) the fresh-row fixture hard-codes `last_run_at: '2026-04-27T15:00:00Z'` which is now ~8 days old — both rows compute as stale. POLI-07's fix as locked (`vi.spyOn(Date, 'now')`) is necessary but **not sufficient** without also fixing the fresh-row fixture to use a relative timestamp (e.g., `Date.now() - 5 * 60_000`). Two other vitest specs use `useFakeTimers` (`RelativeTime.test.tsx`, `EmergencyStopBanner.test.tsx`); both are load-bearing for non-time-of-day reasons (fixed system time, 5000ms timer advancement) and should NOT be migrated.

3. **POLI-08 (Playwright strict-mode):** Live e2e baseline (8 tests, run 2026-05-05): 6 passed, 1 skipped (alerts requires recent failed task — Pitfall 6 carryover), 1 failed (`schedule-composer`). Only ONE strict-mode collision currently fires — `getByLabel('Name')` in `schedule-composer.spec.ts:54` matches both the composer's `<span>Name</span>` and SkillTimeline's `aria-label="Filter skill name"` (Playwright treats aria-label substrings as label matches). The CONTEXT mention of an "alerts.spec.ts firehose Filter skill name" collision refers to a **latent** risk: alerts.spec.ts does not currently use that selector but any new test on `/skills` is vulnerable. No `frontend/tests/e2e/README.md` exists — must be created.

**Primary recommendation:** Wave structure — Wave 0 (test fixtures pinned), Wave 1 (POLI-06 backend sweep ‖ POLI-07 vitest fix ‖ POLI-08 e2e fixes), Wave 2 (verifier baseline + e2e README). The three lanes are fully independent (Python backend / TypeScript test refactor / Playwright e2e specs touch disjoint trees), so Wave 1 can parallelize cleanly. The aggressive-cleanup scope (sweep all useFakeTimers candidates, all selector ambiguities, full-repo ruff debt) extends each lane but does not couple them.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Naive-UTC time generation | Backend (Python stdlib helper) | — | Pure stdlib refactor; no API surface change; `cmc/core/` is the canonical cross-cutting module per repo convention |
| `UTCDatetime` PlainSerializer (Pydantic JSON output) | Backend (API schema layer) | Backend (core/time colocation) | The serializer lives at the API/Pydantic boundary, but its semantics (naive UTC → ISO-Z) are a time-domain concern; CONTEXT locks colocation in `cmc/core/time.py` |
| Vitest test-time clock determinism | Frontend (unit test) | — | Pure test-fixture concern; production code (`SchedulesCard.tsx`) does not change |
| React component test-id attributes | Frontend (component source) | Frontend (e2e spec selectors) | CONTEXT locks `data-testid` at the source component, not test-only wrappers — both source components AND e2e specs are touched |
| Selector strategy documentation | Frontend (e2e/README) | — | CONTEXT locks docs adjacent to the enforcing tool (Playwright), not in top-level CONTRIBUTING.md |
| CI baseline pass-count snapshot | Phase artifact (`.planning/phases/18-…/`) | — | Cross-cutting verifier concern; not application code |

## Standard Stack

**Note:** Phase 18 is pure carried-debt discharge — **zero net-new dependencies** per v1.2 milestone-wide decision (STATE.md). The stack below is the *existing* toolchain the phase relies on.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python stdlib `datetime` | 3.13 (`requires-python = ">=3.13"`) | Source of `now(UTC)`/`replace(tzinfo=None)` replacement | `datetime.utcnow` is deprecated since 3.12 — official Python docs prescribe `datetime.now(timezone.utc)` |
| Pydantic | 2.13.3 (pinned in pyproject.toml) | `Field(default_factory=now_utc)` accepts the helper directly | Pydantic v2 documentation explicitly supports zero-arg callable factories invoked per instantiation |
| ruff | 0.15.12 (verified via `uv run ruff --version`) | `--select UP` lint gate; full-repo `ruff check` clean pass | Project's pinned linter; `[tool.ruff.lint] select = ["E", "F", "I", "UP", "B", "PERF", "RUF"]` |
| pytest | >=9.0 | Backend test runner; baseline 561 tests passing | Project's pinned test runner |
| vitest | (frontend pinned) | `vi.spyOn(Date, 'now')` for non-timer Date mocking | vitest official docs distinguish spyOn (targeted Date) vs useFakeTimers (Date + setTimeout) |
| Playwright | (frontend pinned) | Strict-mode locator engine; `getByTestId`/`getByRole`/`getByLabel` API | Project's pinned e2e tool; strict-mode collisions are the failure mode being fixed |

**Version verification:**
- `python_requires`: confirmed `>=3.13` in `backend/pyproject.toml:4`
- `pydantic`: confirmed `pydantic==2.13.3` in `backend/pyproject.toml`
- `ruff`: confirmed `0.15.12` via `uv run ruff --version`
- All other versions inherited from existing pinned dependencies — no upgrades in scope.

### Supporting (already in `[project.optional-dependencies] dev`)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| pytest-freezer | Deterministic time for local-day bucket tests | Already used (per pyproject.toml comment) — NOT needed for POLI-06; helper migration uses live `datetime.now(UTC)` |
| pyright | Backend typecheck | Run after sweep to catch any naive-UTC type drift |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `datetime.now(UTC).replace(tzinfo=None)` | `datetime.now(UTC)` (tz-aware) | Tz-aware would break the `UTCDatetime` PlainSerializer's `if value.tzinfo is None` branch and the SQLite naive-storage contract. Locked decision: stay naive. |
| Manual sweep | `ruff check --select UP --fix` | UP rules don't catch `datetime.utcnow` — the relevant rule is `DTZ003` (not in project's select). Partial automation only. CONTEXT permits Claude's discretion on tooling. |
| Move `UTCDatetime` into `cmc/core/time.py` | Re-export from `common.py` | 9 import sites currently use `from cmc.api.schemas.common import …, UTCDatetime`. Re-export path keeps existing imports working; full move requires touching all 9 files. CONTEXT permits whichever minimizes churn — re-export wins by import count. |

**Installation:** None. Phase is pure refactor — `uv lock` and `pnpm-lock.yaml` should not change.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Phase 18 — three independent lanes, parallel after Wave 0            │
└──────────────────────────────────────────────────────────────────────┘

  Wave 0 (sequential): Pin fixtures, baseline counts
       │
       ├─→ pytest baseline    (561 passed, 1429 warnings)  ── recorded
       ├─→ vitest baseline    (293 tests, 1 failing)       ── recorded
       └─→ playwright baseline (8 tests, 1 fail, 1 skip)   ── recorded

  Wave 1 (parallel, three independent lanes):

       Lane A: POLI-06 backend sweep            Lane B: POLI-07 vitest        Lane C: POLI-08 e2e
       ──────────────────────────────────       ────────────────────          ──────────────────
       1. Create cmc/core/time.py               1. Patch SchedulesCard         1. Add data-testid attrs
          │  └─ now_utc() helper                   fixture                       to colliding source
          │  └─ UTCDatetime re-export             │  └─ id:1 last_run_at         components (source-
          │                                       │     uses Date.now()-5m       of-truth tier)
          ▼                                       │                              │
       2. Sweep 22 call sites                    2. vi.spyOn(Date, 'now')        ▼
          │  └─ 20 Field defaults                   wraps stale-test           2. Update e2e specs
          │  └─ 2 explicit calls                   │                              to getByTestId
          ▼                                       ▼                              │
       3. Hard-delete imports                   3. (sweep) audit other          ▼
          │  └─ git grep -nE                       useFakeTimers specs        3. Create
          │     'datetime\.utcnow'                 — none migrate (load-         frontend/tests/e2e/
          ▼                                       bearing per Common              README.md
       4. Verify gate:                            Pitfalls §3)                    │
          ruff --select UP clean                 │                              ▼
          + git grep zero matches                ▼                            4. Verify gate:
          + pytest 561 passing                4. Verify gate:                    full e2e strict-mode
          + ZERO datetime.utcnow                  vitest run                     clean (no skipped
          DeprecationWarnings                     TZ=UTC, TZ=America/             collisions)
                                                  New_York at 23:55

  Wave 2 (sequential): Verifier baseline + commit

       1. Re-run all three baselines after Wave 1 → BASELINE.md / VERIFICATION.md
       2. Confirm net-zero dependency change (uv lock + pnpm-lock unchanged)
       3. Phase close commit
```

**Reading the diagram:** Lanes A, B, C operate on disjoint file trees (`backend/cmc/db/models/*.py` + `backend/cmc/pricing.py` for A; `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` for B; `frontend/src/components/panels/*.tsx` + `frontend/tests/e2e/*.spec.ts` for C). Wave 0 is sequential because each baseline must be captured *before* any lane mutates the codebase — this is the verifier's reference point. Wave 2 re-runs to record the post-fix baseline.

### Recommended Project Structure (Wave 1, Lane A — new files)

```
backend/cmc/core/
├── __init__.py        # may need export update if `now_utc` is re-exported here
├── errors.py          # (existing)
├── logging.py         # (existing)
├── paths.py           # (existing)
├── process.py         # (existing)
├── queue.py           # (existing)
├── static.py          # (existing)
└── time.py            # NEW — now_utc(), UTCDatetime re-export, optional helpers
```

```
frontend/tests/e2e/
├── README.md                        # NEW — data-testid convention docs
├── alerts.spec.ts
├── command-palette.spec.ts
├── routes.spec.ts
├── schedule-composer.spec.ts
├── sessions-compare.spec.ts
└── theme-toggle.spec.ts
```

### Pattern 1: Naive-UTC helper module

**What:** Single function returning `datetime.now(UTC).replace(tzinfo=None)`. Pydantic Field uses it as `default_factory=now_utc`.
**When to use:** Every prior `datetime.utcnow()` call site without exception.

```python
# Source: cmc/core/time.py (NEW per CONTEXT)
# Verified pattern: Pydantic v2 default_factory accepts any zero-arg callable
# returning the field's annotated type, invoked per model instantiation.
# https://pydantic.dev/docs/validation/latest/concepts/fields/

from datetime import UTC, datetime
from typing import Annotated
from pydantic import PlainSerializer


def now_utc() -> datetime:
    """Return current time as naive UTC datetime.

    Replaces the deprecated `datetime.utcnow()` (Python 3.12+ deprecation).
    Naive shape preserves the SQLite-compatible storage contract used by
    every model in cmc/db/models/ and the UTCDatetime PlainSerializer.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def _serialize_utc(value: datetime) -> str:
    """Emit ISO-8601 in UTC with `Z` suffix.

    Moved from cmc/api/schemas/common.py so all naive-UTC concerns live
    in one module (CONTEXT locked colocation).
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]
```

### Pattern 2: Re-export from `cmc/api/schemas/common.py`

**What:** Keep the import path stable so the 9 importing files don't need to change.
**When to use:** When the move-vs-re-export tradeoff favors not touching unrelated files.

```python
# Source: cmc/api/schemas/common.py (UPDATED — re-export only)
# Existing 9 imports `from cmc.api.schemas.common import … UTCDatetime`
# remain valid. Internal canonical home is now cmc/core/time.py.

from cmc.core.time import UTCDatetime  # noqa: F401  (re-export)
```

### Pattern 3: vitest `vi.spyOn(Date, 'now')`

**What:** Target only `Date.now()` reads, leave timers alone.
**When to use:** Component tests where the assertion depends on a single `Date.now()` reading and the component does NOT use `setTimeout`/`setInterval`.

```typescript
// Source: vitest official docs (https://vitest.dev/api/vi.html)
// Pattern locked by CONTEXT for SchedulesCard > stale row.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('SchedulesCard stale heuristic', () => {
  // Pin a deterministic "now" — choose a fixed UTC instant and assert
  // both fresh and stale rows relative to it.
  const NOW_MS = new Date('2026-05-05T12:00:00Z').getTime()
  let dateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dateSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
  })
  afterEach(() => {
    dateSpy.mockRestore()
  })

  it('stale row gets cmc-schedules-row--stale class', async () => {
    // Fixture must use NOW_MS-relative timestamps too — see Pitfall §1.
    const fresh = new Date(NOW_MS - 5 * 60_000).toISOString()    // 5 min ago
    const stale = new Date(NOW_MS - 72 * 3600_000).toISOString() // 72h ago
    // …render with fresh + stale rows, assert classes…
  })
})
```

### Pattern 4: Playwright `data-testid` for strict-mode collisions

**What:** Add `data-testid` to the React source component, then use `page.getByTestId(...)` in the spec.
**When to use:** Only when role+name or label-based selectors collide. Per Playwright official docs: testid is a **fallback**, not a primary strategy.

```tsx
// Source: frontend/src/components/panels/ScheduleComposer.tsx (UPDATED)
// Adds data-testid to the Name input. Convention: feature-component-element.
// Naming locked by CONTEXT.

<label className="cmc-composer__field">
  <span>Name</span>
  <input
    type="text"
    className="cmc-input"
    data-testid="schedule-composer-name"  // NEW
    value={draft.name}
    onChange={(e) => update('name', e.target.value)}
    maxLength={120}
    required
    disabled={m.isPending}
  />
</label>
```

```typescript
// Source: frontend/tests/e2e/schedule-composer.spec.ts (UPDATED)
// Was: await page.getByLabel('Name').fill(name)
// Now: scoped to the composer component via testid.

await page.getByTestId('schedule-composer-name').fill(name)
```

### Anti-Patterns to Avoid

- **Anti-pattern: Replace every `datetime.utcnow()` with `datetime.now(UTC)` directly.** This silently changes the storage shape from naive to tz-aware, violating the SQLite contract and the `UTCDatetime` serializer's `if value.tzinfo is None` branch. **Always** go through `now_utc()` which preserves naive shape.
- **Anti-pattern: Migrate all `useFakeTimers` callers to `spyOn(Date, 'now')`.** `EmergencyStopBanner.test.tsx` uses `useFakeTimers({ shouldAdvanceTime: false })` to deterministically advance a load-bearing 5000ms re-disarm timer — `spyOn(Date)` cannot replace that. `RelativeTime.test.tsx` uses `vi.setSystemTime(...)` for a fixed-clock test, which is a perfectly valid, non-flake-prone use. **Migrate only specs where the failure mode is time-of-day-dependent.**
- **Anti-pattern: Replace `getByRole`/`getByLabel` with `getByTestId` everywhere.** Playwright official guidance: testid is a fallback when user-facing locators collide. Most current selectors (`getByRole('button', { name: 'Create schedule' })`, `#cmd-heading` ID locators) are correct as-is. **Only convert collisions.**
- **Anti-pattern: Add `default_factory=now_utc()` (with parens).** This calls the function at *import time*, not per-instantiation, freezing every model's default to a single timestamp. Always pass the function reference: `default_factory=now_utc`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO-8601 UTC serialization with `Z` suffix | Custom string formatter | Existing `_serialize_utc` (move into `cmc/core/time.py`) | Already battle-tested; preserves Pydantic v2 `when_used="json"` gate that prevents double-serialization in non-JSON contexts |
| Codemod for `Field(default_factory=datetime.utcnow)` → `Field(default_factory=now_utc)` | One-off libcst transformer | `git grep` + manual edits, OR sed targeted at the 20 model files | 22 sites is small enough that manual is faster than scripting; libcst introduces a transient dev dependency; the CONTEXT explicitly permits manual or `ruff --fix` (with the caveat that `ruff --fix` does NOT cover this rule) |
| Playwright "strict-mode-clean" detection | Bash glob + grep over spec files | `npx playwright test` against the live `vite preview` — fails immediately on collision | Strict-mode is the runtime contract; only running the suite catches collisions reliably |
| Custom test-id attribute resolver in tests | Helper that strips `data-testid="…"` from rendered HTML | `page.getByTestId('…')` (built-in) | Playwright already accepts `data-testid` by default; configurable via `testIdAttribute` if a different attr name is preferred (not in scope) |
| Date-mocking helper for vitest | Wrap `Date.now()` in a context-aware shim | `vi.spyOn(Date, 'now').mockReturnValue(…)` | Idiomatic vitest API; auto-cleans with `mockRestore()` |

**Key insight:** Every Phase 18 mechanical change has a stdlib, library, or already-imported tool that does the work. The high-leverage discipline is **scope control** (sweep what the CONTEXT marks as in-scope, defer the rest into STATE.md), not custom infrastructure.

## Runtime State Inventory

This phase is a refactor sweep, so the runtime-state checklist applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — `datetime.utcnow()` returns the *same* value as `datetime.now(UTC).replace(tzinfo=None)` (both are naive UTC). Existing rows in `data/cmc.db` were written with the old function and are bit-identical to what the new helper would produce. | None — no data migration. |
| **Live service config** | None — no external service (Datadog, Tailscale, etc.) embeds the function name `datetime.utcnow` in its config. The migration is purely in-source. | None. |
| **OS-registered state** | None — no Windows/launchd/systemd reference to `datetime.utcnow` (this is a Python source-only refactor). The macOS launchd plists in `scripts/` reference `cmc start`, not Python internals. | None. |
| **Secrets and env vars** | None — no env var contains `datetime.utcnow`. | None. |
| **Build artifacts / installed packages** | `backend/.venv/` and `pnpm` `node_modules/` may have stale `__pycache__` / Vite caches. The `pyproject.toml` is unchanged (no version bump on `pydantic`/`sqlmodel`/etc.). | Sweep should `uv sync` if the team conventionally re-syncs after touching `cmc/core/`. No `pip-install` action needed. Vite/playwright `test-results/` directory will be regenerated by re-running e2e. |

**Cross-cutting:** The 1429 `DeprecationWarning` records in `pytest`'s warning summary will drop to ZERO post-sweep — that's the reverse-direction signal of the migration completing. Verifier should track this delta.

## Common Pitfalls

### Pitfall 1: SchedulesCard fresh-row fixture is bit-rotted, not just flake-prone
**What goes wrong:** Even after applying `vi.spyOn(Date, 'now')`, the test still fails if you only mock the clock. The fresh-row fixture (`id: 1` "every-5-min") hard-codes `last_run_at: '2026-04-27T15:00:00Z'` via `makeSchedule()` defaults. Today (2026-05-05) that's ~8 days old → both rows compute as stale → "fresh row should NOT have stale class" assertion fires.
**Why it happens:** The fixture was written ~2026-04-27 when `Date.now() - new Date('2026-04-27T15:00:00Z').getTime()` was ~0h. Real wall-clock drift made the fresh fixture stale.
**How to avoid:** When applying `vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)`, also rewrite the populated-fixture's fresh row to `last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString()`. **Both fixes are required**; locking the clock alone is necessary but not sufficient. The roadmap success criterion (`vi.spyOn(Date, 'now')`) is correct in mechanism but underspecified in implementation.
**Warning signs:** "fresh row should NOT have stale class" still failing post-clock-mock; both rows in DOM have `cmc-schedules-row--stale` class.

### Pitfall 2: `Field(default_factory=now_utc)` sites in ORM models are SQLModel, not pure Pydantic
**What goes wrong:** SQLModel inherits from Pydantic but routes `Field` through its own re-export. The `default_factory=now_utc` pattern works identically (verified — SQLModel passes through to Pydantic's BaseModel internals), but if `now_utc` is imported via the new module path, the import line in each model file needs to be updated correctly to avoid a circular import (`cmc.core.time` imports `pydantic`; `cmc.db.models.*` imports `now_utc` — no cycle, but verify).
**Why it happens:** The `cmc/db/models/*.py` files all use `from sqlmodel import Field`, then `Field(default_factory=datetime.utcnow)`. Each must add `from cmc.core.time import now_utc` and replace the factory.
**How to avoid:** Apply the import change atomically in each file (imports + factory in same diff hunk). A `git grep -nE 'datetime\.utcnow' cmc/db/models/` after the sweep catches misses.
**Warning signs:** `ImportError` at app startup mentioning `cmc.core.time`; pytest collection errors.

### Pitfall 3: `useFakeTimers` is sometimes load-bearing for non-time-of-day reasons
**What goes wrong:** Blanket-migrating all 3 vitest specs that use `useFakeTimers` to `spyOn(Date, 'now')` breaks `EmergencyStopBanner.test.tsx` which depends on `vi.useFakeTimers({ shouldAdvanceTime: false })` advancing a deterministic 5000ms re-disarm timer (`act(() => vi.advanceTimersByTime(5_001))`). `spyOn(Date)` cannot replace `advanceTimersByTime`.
**Why it happens:** `useFakeTimers` does two things — controls Date AND controls setTimeout/setInterval. Tests using only the Date capability can migrate; tests using setTimeout advancement cannot.
**How to avoid:** Audit before migrating. The decision matrix: keep `useFakeTimers` if the test calls `advanceTimersByTime`, `runAllTimers`, `setSystemTime` (the last is fine, but is itself non-flaky), `runOnlyPendingTimers`, or any timer-control API. `RelativeTime.test.tsx` uses `setSystemTime` for a fixed clock — keep as-is (no flake risk; the test asserts on a fixed `NOW`).
**Warning signs:** Migrated test now hangs forever (timer never fires) or asserts on stale state (re-disarm never triggers).

### Pitfall 4: Playwright `getByLabel` matches `aria-label` substrings, not just `<label for=…>`
**What goes wrong:** `page.getByLabel('Name')` matches `<input aria-label="Filter skill name">` because Playwright accessibility-tree heuristics include partial matches against aria-label values. This is the root of the schedule-composer collision: SkillTimeline's `aria-label="Filter skill name"` (on `/skills`) is matched by the spec's `getByLabel('Name')` even though the test author intended the composer's `<span>Name</span>` label.
**Why it happens:** Playwright's locator engine deliberately matches accessible names with substring tolerance to mirror user perception. Strict mode then catches the multiplicity.
**How to avoid:** When fixing, prefer `page.getByRole('textbox', { name: 'Name' }).getByLabel('Name')` (role-narrowed) OR `page.getByTestId('schedule-composer-name')` (CONTEXT-locked). The CONTEXT decision goes with testid — apply consistently across all collisions.
**Warning signs:** Strict-mode error message lists multiple matches with one being an `aria-label` substring of the queried name.

### Pitfall 5: `ruff --select UP` does NOT catch `datetime.utcnow`
**What goes wrong:** Verified live: `ruff check --select UP` returns "All checks passed!" on the current repo even though 22 `datetime.utcnow` call sites exist. The CONTEXT prescribes a two-gate verification (`UP` clean + `git grep` zero matches) precisely because `UP` is insufficient on its own.
**Why it happens:** The `datetime.utcnow` deprecation is flagged by `flake8-datetimez` (`DTZ003`), not `pyupgrade` (`UP`). `DTZ` is not in the project's ruff `select` list (current select: `["E", "F", "I", "UP", "B", "PERF", "RUF"]`).
**How to avoid:** Trust the CONTEXT's two-gate verification. Optionally consider adding `DTZ` to the project ruff select **after** the sweep (38 DTZ findings exist today across utcnow, naive `datetime()` constructors, and `date.today()` calls — would surface other deprecation debt). But adding `DTZ` to ruff config is itself a scope-expansion decision; treat as deferred unless the planner explicitly carves a sub-task.
**Warning signs:** "ruff says clean but pytest still emits DeprecationWarning for `datetime.utcnow`" — that's the symptom of relying on `UP` alone.

### Pitfall 6: alerts.spec.ts skip is unrelated to this phase but persistent
**What goes wrong:** `alerts.spec.ts` (TEST-05a) skips on databases without a recently-failed task — Pitfall 6 carryover from prior research. Verifier may interpret a skipped test as "Phase 18 broke it" if not warned.
**Why it happens:** The dispatcher_failed_tasks_5m extractor's strict-`>` threshold requires at least one task with `ended_at >= now - 5m`. The dev DB doesn't always have one.
**How to avoid:** Document in BASELINE.md that "1 skipped" is the steady state for this spec; verifier compares failed counts only, not skip counts. Phase 18 must NOT touch alerts.spec.ts in a way that adds a new skip — only fix selectors if collisions surface.
**Warning signs:** Verifier diff showing "playwright skipped: 1 → 2" after Phase 18 close.

### Pitfall 7: `default_factory=now_utc` evaluated at import time vs instantiation time
**What goes wrong:** Easy typo: `default_factory=now_utc()` (with parens) freezes the model's default to the import-time timestamp — every row gets the same created_at. The pattern must be `default_factory=now_utc` (function reference).
**Why it happens:** Calling vs referencing confusion. `Field(default=now_utc())` would also be wrong (it's a default *value*, not a factory).
**How to avoid:** A `git grep -nE 'default_factory=now_utc\(\)'` after the sweep catches this. Pyright will also flag the type mismatch (Pydantic expects `Callable[[], T]`, parens give `T`).
**Warning signs:** All new rows have identical timestamps; pyright error on the model files.

### Pitfall 8: `pricing.py:182` and `test_pricing.py:139` are explicit calls, not factories
**What goes wrong:** The CONTEXT says "18+ sites" — there are actually 22, including 2 `datetime.utcnow()` calls inside function bodies (`loaded_at=datetime.utcnow(),` in `cmc/pricing.py:182` and `tests/test_pricing.py:139`). These are NOT `Field(default_factory=…)` patterns — they're inline expressions. The replacement is `loaded_at=now_utc(),` (note: WITH parens, because here we want the value, not the factory).
**Why it happens:** Mixing the two patterns. `Field(default_factory=now_utc)` wants the function; `loaded_at=now_utc()` wants the value.
**How to avoid:** Don't pattern-match on `Field(default_factory=…)` only. Use `git grep -nE 'datetime\.utcnow'` (all forms) to find every call site.
**Warning signs:** A grep after the sweep that finds `datetime.utcnow` only in `cmc/pricing.py` or `test_pricing.py` — these are the easy-to-miss inline forms.

### Pitfall 9: 9 importers of `UTCDatetime` already work — re-export is the lower-churn path
**What goes wrong:** Choosing "move and update all 9 imports" instead of "leave imports, add re-export" multiplies the diff size and adds ~9 trivial file changes that aren't part of the deprecation discharge.
**Why it happens:** "Make it consistent" instinct overruns the practical "minimize churn" rule.
**How to avoid:** CONTEXT explicitly permits re-export. Verified: 9 files import `UTCDatetime` from `cmc.api.schemas.common`. Re-export adds 1 line to `common.py`; full move requires editing all 9 schema files. Re-export wins by 9×.
**Warning signs:** Diff includes touches to schema files (`alerts.py`, `tasks.py`, `skills.py`, `sessions.py`, `observability.py`, `hitl.py`, `schedules.py`, `mcp.py`, `routes/sessions.py`) that aren't otherwise relevant to the cleanup.

## Code Examples

### POLI-06 sweep example — model file before/after

```python
# BEFORE: backend/cmc/db/models/sessions.py (current)
from datetime import datetime
from sqlmodel import Field, SQLModel

class Session(SQLModel, table=True):
    synced_at: datetime = Field(default_factory=datetime.utcnow)
    # ↑ raises DeprecationWarning every time a Session is instantiated
```

```python
# AFTER: backend/cmc/db/models/sessions.py (post-sweep)
from datetime import datetime
from sqlmodel import Field, SQLModel
from cmc.core.time import now_utc

class Session(SQLModel, table=True):
    synced_at: datetime = Field(default_factory=now_utc)
    # ↑ same naive-UTC value, no deprecation warning
```

### POLI-06 explicit-call site (pricing.py:182)

```python
# BEFORE: backend/cmc/pricing.py:182
ins = (
    sqlite_insert(PricingRow.__table__)
    .values(
        ...
        loaded_at=datetime.utcnow(),
        ...
    )
)
```

```python
# AFTER: backend/cmc/pricing.py:182
from cmc.core.time import now_utc  # add to imports

ins = (
    sqlite_insert(PricingRow.__table__)
    .values(
        ...
        loaded_at=now_utc(),  # NOTE: parens — call the function for a value
        ...
    )
)
```

### POLI-07 — full deterministic test rewrite

```typescript
// Source: vitest official docs (https://vitest.dev/api/vi.html)
// Rewrite of SchedulesCard.test.tsx > stale row.

const NOW_MS = new Date('2026-05-05T12:00:00Z').getTime()

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
  // … existing fetch mock …
})

const populated: ScheduleListResponse = {
  items: [
    makeSchedule({
      id: 1,
      name: 'every-5-min',
      cron: '*/5 * * * *',
      enabled: true,
      // FRESH: 5 minutes ago relative to mocked NOW_MS — never crosses the 48h boundary
      last_run_at: new Date(NOW_MS - 5 * 60_000).toISOString(),
    }),
    makeSchedule({
      id: 2,
      name: 'old-stale',
      cron: '0 9 * * 1-5',
      enabled: true,
      // STALE: 72h ago relative to mocked NOW_MS
      last_run_at: new Date(NOW_MS - 72 * 3600 * 1000).toISOString(),
    }),
  ],
  total: 2,
}
```

### POLI-08 — frontend/tests/e2e/README.md skeleton

```markdown
# Playwright e2e tests — selector conventions

These specs run against `vite preview` (production build) plus the live FastAPI
backend (see `playwright.config.ts`). They exercise real cross-component flows
that vitest's component tests cannot cover.

## Selector hierarchy (Playwright official guidance)

Prefer selectors in this order:

1. `page.getByRole(...)` — closest to assistive-tech perception. **Default.**
2. `page.getByLabel(...)` — form fields with `<label>` or `aria-label`.
3. `page.getByText(...)` — non-interactive text content.
4. `page.getByTestId(...)` — **fallback** when role/label collide under strict mode.

## When to add `data-testid`

Add `data-testid` to a React component **only** when strict-mode locator
ambiguity surfaces (multiple elements match the user-facing locator). Do not
preemptively decorate components.

## `data-testid` naming convention

Format: `feature-component-element` (kebab-case, path-style).

Examples:
- `schedule-composer-name` (input field on the schedule composer)
- `schedule-composer-submit` (submit button on the schedule composer)
- `alerts-firehose-skill-filter` (skill-name filter on the alerts firehose panel)
- `skills-detail-projects-table` (projects table on the skill detail page)

The format is predictable for grep, scoped by feature, and collision-resistant
across pages that share elements.

## Where the attribute lives

`data-testid` lives on the source React component (e.g.
`frontend/src/components/panels/ScheduleComposer.tsx`), NOT on a test-only
wrapper. Specs reference it via `page.getByTestId('…')`.

## Running

```bash
cd frontend
pnpm run test:e2e            # full suite
pnpm run test:e2e:ui         # interactive UI mode
npx playwright test schedule-composer  # single spec
```

The suite expects a backend on `http://127.0.0.1:8765` and a frontend preview
on `http://127.0.0.1:4173`. `playwright.config.ts` launches both via the
`webServer` config with `reuseExistingServer=true`.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `datetime.utcnow()` (naive UTC) | `datetime.now(UTC).replace(tzinfo=None)` (naive UTC, explicit) | Python 3.12 (deprecation) | `datetime.utcnow` removal scheduled for a future Python; project pins `>=3.13` so warnings already fire |
| `vi.useFakeTimers()` for time-of-day flakes | `vi.spyOn(Date, 'now')` for non-timer Date mocking | vitest 0.x onward | Targeted spy avoids interfering with React act/effect timer machinery; faster & narrower |
| `getByLabel('Name')` (loose substring match) | `getByTestId('schedule-composer-name')` (exact) | Playwright 1.27+ (strict mode default) | Strict mode forces author intent; collisions surface at test time, not on a flaky reload later |

**Deprecated/outdated:**
- `datetime.utcnow`: deprecated Python 3.12, removal planned in a later release (no firm version yet — Python docs say "scheduled for removal in a future version"). Project's pyproject pins `requires-python = ">=3.13"` so warnings already fire on every model instantiation.
- vitest `useFakeTimers` for non-timer Date mocking: not deprecated, but Vitest official docs distinguish it from `spyOn(Date, 'now')` — use `spyOn` when only `Date.now()` reads matter.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Backend pytest baseline is exactly 561 passing | Summary, Pitfall 6 | If actual is 562/560 due to interleaved repo state, the verifier baseline number is stale. Re-run during Wave 0 of Phase 18 to confirm. **Mitigation:** Wave 0 sequential step explicitly captures live baseline. |
| A2 | Vitest baseline is 65 files / 293 tests / 1 failure | Summary, POLI-07 | Same as A1 — re-baseline in Wave 0. The 1-failure count specifically is a live observation (run 2026-05-05), but a transient vitest cache or environment difference could shift it. **Mitigation:** Wave 0 capture. |
| A3 | Playwright baseline is 8 tests / 6 pass / 1 skip / 1 fail | Summary, POLI-08, Pitfall 6 | The skip count depends on dev DB state (alerts.spec.ts skip condition). Re-baseline in Wave 0. **Mitigation:** Document "1 skipped is steady state for alerts.spec.ts on this DB" in BASELINE.md. |
| A4 | `cmc/core/__init__.py` does not need a re-export of `now_utc` | Pattern 1 | If downstream code expects `from cmc.core import now_utc` (none found in current grep), that ergonomic shortcut won't exist. **Mitigation:** Trivial 1-line addition to `cmc/core/__init__.py` if the planner deems it preferable. |
| A5 | The 9 `from cmc.api.schemas.common import … UTCDatetime` import sites are the complete set | Pitfall 9 | A wildcard import (`from cmc.api.schemas.common import *`) elsewhere could re-export `UTCDatetime` transparently. **Mitigation:** `git grep -nE 'UTCDatetime|from cmc\.api\.schemas\.common'` enumerates both. |
| A6 | No new strict-mode collisions surface when running e2e against the post-sweep frontend | POLI-08 | Re-running the full Playwright suite during Wave 1 Lane C is the live check. **Mitigation:** Lane C explicitly re-runs the full suite at gate-close. |
| A7 | Adding `DTZ` to ruff `select` is OUT of scope (would discover 38 unrelated findings) | Pitfall 5 | If the planner interprets "lint debt cleanup" aggressively, they may add DTZ. CONTEXT permits aggressive lint-debt cleanup but the 38 findings include `date.today()` calls in `cmc/api/routes/cost.py` that touch query semantics — risky. **Mitigation:** Treat DTZ select-expansion as a Wave 2 deferred decision; Phase 18 only fixes the `datetime.utcnow` subset. |

## Open Questions

1. **Should `cmc/core/__init__.py` re-export `now_utc` for ergonomic `from cmc.core import now_utc`?**
   - What we know: Existing `cmc/core/__init__.py` re-exports `register_error_handlers`, `configure_logging`, `repo_root`, `resolve_under_repo_root`, `SPAStaticFiles`. It is the project's convention to re-export commonly-used cross-cutting symbols.
   - What's unclear: Whether the planner wants the shorter import path (`from cmc.core import now_utc`) or the explicit one (`from cmc.core.time import now_utc`). Both work; the latter is more explicit about which module owns the symbol.
   - Recommendation: Re-export from `cmc/core/__init__.py` for consistency with the existing pattern. Trivial 1-line addition; saves typing in 20+ model files.

2. **Should the BASELINE.md / VERIFICATION.md format include warning counts as a regression guard?**
   - What we know: Pre-sweep pytest emits 1429 warnings, ~1400 of which are `datetime.utcnow` deprecations. Post-sweep should drop to a small residual (any remaining warnings unrelated to POLI-06).
   - What's unclear: Whether the verifier should treat "warnings count regression" as a phase-close blocker.
   - Recommendation: Record warning count alongside test count in BASELINE.md. Down-only gate is reasonable for v1.2 phases (Phase 19+ verifiers compare against this baseline). Up-trend warns but does not fail.

3. **Should Phase 18 also fix the `cmc/dispatcher/run_classic.py:72` and `cmc/dispatcher/run_stream.py:87` naive `datetime.now()` calls (DTZ005)?**
   - What we know: These are `datetime.now()` without `tz=` argument — a separate deprecation surface (DTZ005, not DTZ003).
   - What's unclear: Whether they're semantically naive-UTC (and should migrate to `now_utc()`) or intentionally local-time (and should migrate to `datetime.now(tz=...)`).
   - Recommendation: Out of scope for POLI-06's letter (which targets `datetime.utcnow` specifically). If found to be naive-UTC equivalents during the sweep, fix in-line under the aggressive cleanup discipline; if local-time, defer to STATE.md as DTZ-cleanup follow-on. **Treat as discovery-driven**, not pre-planned.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Backend sweep, pytest baseline | ✓ | 3.13 (per `requires-python`) | — |
| uv | `uv run pytest`, `uv run ruff` | ✓ | (project standard) | — |
| ruff | POLI-06 verify gate | ✓ | 0.15.12 | — |
| pytest | Backend baseline | ✓ | >=9.0 | — |
| pnpm | Frontend test runner | ✓ | (verified via `pnpm-lock.yaml`) | — |
| vitest | POLI-07 fix + frontend baseline | ✓ | (frontend pinned) | — |
| Playwright | POLI-08 fix + e2e baseline | ✓ | (frontend pinned, chromium-only project per `playwright.config.ts`) | — |
| Node.js | vite preview server (e2e) | ✓ | (frontend pinned) | — |
| `vite preview` web server | Playwright `webServer` block | ✓ | port 4173 (per playwright.config.ts) | — |
| `uvicorn` backend | Playwright `webServer` block | ✓ | port 8765 (per playwright.config.ts) | — |
| `git grep` | POLI-06 verify gate | ✓ | (system git) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest >=9.0 (with pytest-asyncio, pytest-freezer, pytest-cov) |
| Backend config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` (testpaths=["tests"], asyncio_mode="auto", addopts="-q") |
| Backend quick run command | `cd backend && uv run pytest -q tests/test_pricing.py tests/test_alerts_dispatcher.py` (focused on touched test files) |
| Backend full suite command | `make test-backend` (= `cd backend && uv run pytest`) — 561 tests, ~3min |
| Frontend framework | vitest (component) + Playwright (e2e) |
| Frontend config files | `frontend/vitest.config.ts`, `frontend/playwright.config.ts` |
| Frontend unit quick command | `cd frontend && pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx` |
| Frontend unit full command | `make test-frontend` (= `cd frontend && pnpm test` = `vitest run`) — 293 tests, ~7s |
| E2e command | `make test-e2e` (= `cd frontend && pnpm run test:e2e` = `playwright test`) — 8 tests, ~7s + backend boot |
| Lint full command | `make lint` (= `lint-backend typecheck`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLI-06 | All `Field(default_factory=...)` and explicit calls migrate to `now_utc` | unit (regression) | `cd backend && uv run pytest -q && uv run ruff check --select UP && git grep -nE 'datetime\.utcnow\|from datetime import .*utcnow' \| wc -l` (must equal 0) | ✅ existing pytest suite covers behavior; verify-gate is shell |
| POLI-06 | `now_utc()` returns naive UTC datetime | unit | `cd backend && uv run pytest tests/test_core_time.py` (NEW — Wave 0 gap) | ❌ Wave 0 |
| POLI-07 | `SchedulesCard > stale row (last_run_at > 48h ago) gets cmc-schedules-row--stale class` deterministic across `TZ=UTC` and `TZ=America/New_York` at 23:55 | unit | `cd frontend && TZ=UTC pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx && TZ=America/New_York pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx` | ✅ exists, must be patched |
| POLI-08 | `schedule-composer.spec.ts` passes Playwright strict-mode | e2e | `cd frontend && npx playwright test schedule-composer` | ✅ exists, must be patched |
| POLI-08 | Full Playwright suite passes strict-mode (no new collisions surface) | e2e | `cd frontend && npx playwright test` | ✅ |
| POLI-08 | `frontend/tests/e2e/README.md` exists with `data-testid` convention | manual (file existence) | `test -f frontend/tests/e2e/README.md && grep -q "feature-component-element" frontend/tests/e2e/README.md` | ❌ Wave 0 (must be created) |
| Phase gate | Backend + frontend + e2e all green | full suites | `make test-backend && make test-frontend && make test-e2e` | ✅ |
| Phase gate | Verifier baseline recorded | manual | Inspect `BASELINE.md` / phase VERIFICATION.md for pytest count + vitest count + playwright count + warning count | ❌ created at phase close |

### Sampling Rate
- **Per task commit (Wave 1 Lane A):** `cd backend && uv run pytest tests/test_pricing.py tests/test_models.py tests/test_alerts_dispatcher.py -q` (touched-file pytest); confirm zero `DeprecationWarning: datetime.datetime.utcnow` lines.
- **Per task commit (Wave 1 Lane B):** `cd frontend && pnpm exec vitest run src/components/panels/__tests__/SchedulesCard.test.tsx`; both `TZ=UTC` and `TZ=America/New_York` runs.
- **Per task commit (Wave 1 Lane C):** `cd frontend && npx playwright test --reporter=line` (full suite, ~7s).
- **Per wave merge:** `make test-backend && make test-frontend && make test-e2e && make lint` end-to-end.
- **Phase gate:** Full suite green + verifier baseline recorded + zero `datetime.utcnow` `DeprecationWarning` in pytest output + `git grep -nE 'datetime\.utcnow'` returns zero matches.

### Wave 0 Gaps
- [ ] `backend/tests/test_core_time.py` — covers POLI-06 (helper returns naive UTC; `default_factory=now_utc` invocation pattern; `UTCDatetime` re-export resolves to canonical home). 1 file, ~3-5 unit tests.
- [ ] `frontend/tests/e2e/README.md` — covers POLI-08 documentation requirement.
- [ ] BASELINE capture (transient — captured during Wave 0, recorded at phase close). Not a file commit per se, but a step in the phase plan.
- [ ] Capture pre-sweep `pytest -q --tb=no 2>&1 | tail -5` output for warning-count delta.

*(No new test fixtures or shared `conftest.py` extensions needed — existing infra covers the assertions.)*

## Sources

### Primary (HIGH confidence)
- **Live repository state at HEAD `ac63767`** — every count, file, and line reference verified by direct grep / read. Authoritative for all repo-internal claims.
- **Live test runs (2026-05-05)** —
  - `cd backend && uv run pytest -q --tb=no` → 561 passed, 1429 warnings
  - `cd frontend && pnpm exec vitest run` → 65 files, 293 tests, 1 failed (SchedulesCard stale row)
  - `cd frontend && npx playwright test` → 8 tests: 6 passed, 1 skipped (alerts), 1 failed (schedule-composer strict-mode)
  - `cd backend && uv run ruff check --select UP` → All checks passed
  - `cd backend && uv run ruff check --select DTZ --statistics` → 38 errors (22 DTZ001, 10 DTZ011, 4 DTZ005, 2 DTZ003)
- **Python official docs** — https://docs.python.org/3/library/datetime.html#datetime.datetime.utcnow (`datetime.utcnow()` deprecated since 3.12; recommended replacement `datetime.now(timezone.utc)`).
- **Pydantic v2 official docs** — https://pydantic.dev/docs/validation/latest/concepts/fields/ (`default_factory` accepts zero-arg callable, invoked per model instantiation).
- **Vitest official docs** — https://vitest.dev/api/vi.html (`vi.spyOn(Date, 'now')` vs `vi.useFakeTimers()` distinction).
- **Playwright official docs** — https://playwright.dev/docs/locators (locator hierarchy; `getByTestId` as fallback; strict-mode resolution guidance).
- **CONTEXT.md** at `.planning/phases/18-polish-carry-forward-cleanup/18-CONTEXT.md` — locked decisions verbatim above.

### Secondary (MEDIUM confidence)
- (None used — all claims verified against primary sources.)

### Tertiary (LOW confidence)
- (None used.)

## Project Constraints (from CLAUDE.md)
- No `./CLAUDE.md` exists at project root (verified via `cat`). No project-level constraint sheet to enforce. The repo's de facto conventions live in `.planning/PROJECT.md` and `.planning/STATE.md`, both honored by the CONTEXT.md decisions reproduced above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version pinned in pyproject.toml or pnpm-lock.yaml; verified by direct read.
- Architecture: HIGH — every file path, line number, and call site verified by grep against HEAD.
- Pitfalls: HIGH — five of nine pitfalls confirmed by live test runs (failure messages quoted verbatim from playwright + vitest output); the remaining four are mechanical consequences of the locked CONTEXT decisions.
- POLI-07 root cause: HIGH (live failure reproduced) — the bit-rotted-fixture finding (Pitfall 1) is a planning-relevant addition to the CONTEXT's mechanism-only fix.
- POLI-08 strict-mode collision count: HIGH — full Playwright suite executed against live `vite preview`; only the schedule-composer collision currently fires.

**Research date:** 2026-05-05
**Valid until:** 2026-06-04 (30 days — stable refactor surface; no upstream churn expected). Re-baseline pytest/vitest/playwright counts immediately before Wave 0 since they're time-sensitive in fast-moving repos.
