---
phase: 24-shell-density-containment-primitives
plan: 05
subsystem: testing
tags: [playwright, axe-core, lighthouse-ci, pytest, e2e, a11y, perf, url-contract]

# Dependency graph
requires:
  - phase: 24-shell-density-containment-primitives/01
    provides: density tokens on :root, --cmc-z-* ladder, @axe-core/playwright + @lhci/cli installed
  - phase: 24-shell-density-containment-primitives/02
    provides: DensityToggle + DensityProvider (data-testids density-toggle-trigger, density-option-*)
  - phase: 24-shell-density-containment-primitives/03
    provides: TruncatedCell (.cmc-cell--truncate), CopyIconButton (.cmc-cell--copyable, data-testid cell-copy-btn)
  - phase: 24-shell-density-containment-primitives/04
    provides: Sidebar (.cmc-sidebar, data-testid sidebar-link-*, sidebar-collapse-toggle), cmc.sidebar.collapsed key, Cmd+B handler
provides:
  - POLI-09 visual auto-capture matrix (36-PNG sweep)
  - POLI-10 axe-core a11y gate (30-run sweep; serious+critical block)
  - POLI-11 Lighthouse CI config (3-URL perf budget with CWV thresholds)
  - POLI-13 URL contract pytest gate (bidirectional doc↔route)
  - CONT-02 portal-containment runtime probe (transform-ancestor walker)
  - SHEL-04 e2e (Cmd+B + collapse persistence + tooltip)
  - DENS-01..03 e2e (toggle persistence + cascade to Portal content)
  - CONT-03 e2e (truncation tooltip + copy-cell clipboard)
affects:
  - 24-06 (POLI docs ship the docs/url-contract.md the pytest reads)
  - 24-07 (phase close gate runs every spec + axe matrix + Lighthouse + pytest)
  - 25-* (saved views — perf budgets carry forward to /saved-view routes)
  - 26-* (sessions/compare demo-seeding lights up truncation + copy-cell skips)
  - 27-* (skill-detail column adoption lights up further truncation paths)

# Tech tracking
tech-stack:
  added: []  # all libraries already present from plan 01
  patterns:
    - "Density+theme matrix sweep via for-loop test generation in Playwright spec"
    - "Portal-containment runtime probe: page.evaluate walks parentElement up to document.body, collecting ancestors with computedStyle.transform !== 'none'"
    - "Forward-compat test.skip with concrete future-phase reference (Phase 26/27) for paths blocked on demo-data adoption"
    - "Bidirectional URL contract: docs⇄route file derivation, both directions assertable, skip when docs absent"
    - "Lighthouse CI binary perf gates (LCP/CLS/INP) via assertions block, filesystem upload (no LHCI server needed)"
    - "ESM __dirname workaround: fileURLToPath(import.meta.url) + path.dirname — required for package.json type=module specs"

key-files:
  created:
    - frontend/tests/e2e/v13-visual-capture.spec.ts
    - frontend/tests/e2e/v13-a11y.spec.ts
    - frontend/tests/e2e/v13-portal-containment.spec.ts
    - frontend/tests/e2e/v13-sidebar.spec.ts
    - frontend/tests/e2e/v13-density.spec.ts
    - frontend/tests/e2e/v13-truncation.spec.ts
    - frontend/tests/e2e/v13-copy-cell.spec.ts
    - frontend/lighthouserc.json
    - backend/tests/test_url_contract.py
    - .planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep
  modified:
    - .gitignore

key-decisions:
  - "Lighthouse target list research-corrected to / + /activity + /skills — excludes /sessions/compare (RESEARCH Pitfall 5: requires demo session-id seeding; empty-state LCP would produce noise)"
  - "axe a11y matrix excludes /sessions/compare for the same reason (no chart elements = false negatives for chart-aware rules)"
  - "v13-truncation and v13-copy-cell use test.skip when /skills demo data exposes no overflowing .cmc-cell--truncate or .cmc-cell--copyable — vitest unit tests pin the primitive behavior in plan 03; e2e activates once Phase 26/27 wires per-column adoption"
  - "URL contract pytest uses pytest.skip when docs/url-contract.md is absent so plan 05 lands cleanly regardless of plan-06 ordering — both tests transition SKIP→PASS once plan 06 ships"
  - "Portal-containment probe covers DropdownMenu + cmdk dialog + .cmc-btn:hover (the three highest-risk Portal mount paths in v1.2 + plan 04). Sheet + AlertDialog left for future phases as routes adopt them"
  - "Lighthouse uses Vite preview (pnpm preview --port 4173 --strictPort --host 127.0.0.1), matching the existing playwright.config.ts webServer URL — IPv4 explicit, no localhost ambiguity"

patterns-established:
  - "Per-plan e2e specs prefixed v13- so playwright --grep='v13-' can isolate the v1.3 gate suite cleanly from prior v1.2 specs"
  - "test.afterEach resets localStorage keys touched by the spec (cmc.density / cmc.sidebar.collapsed) to keep BrowserContext-shared workers hermetic"
  - "Matrix sweeps use addInitScript to set localStorage BEFORE first paint — guarantees applyDensity()/applyTheme() in main.tsx see the test's chosen value, no FOUC"
  - "page.locator('body').click() + ControlOrMeta+KeyX before any global keyboard test — guarantees focus is in the page (URL bar would otherwise swallow the press)"

# Metrics
duration: 17min
completed: 2026-05-11
---

# Phase 24 Plan 05: Quality Gate Playwright + Lighthouse + URL Contract Summary

**Ships the full v1.3 phase-close test surface: 7 Playwright spec files (75 tests), Lighthouse CI config with CWV thresholds, and a bidirectional URL contract pytest gate — all wired against the primitives delivered in plans 01–04 and ready for plan 07's matrix run.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-11T10:24:14Z
- **Completed:** 2026-05-11T10:41:09Z
- **Tasks:** 3
- **Files created:** 10 (7 specs + lighthouserc.json + test_url_contract.py + .gitkeep)
- **Files modified:** 1 (.gitignore)

## Accomplishments

- 7 v13-*.spec.ts files in `frontend/tests/e2e/` covering POLI-09 (visual), POLI-10 (axe), CONT-02 (portal-containment), SHEL-04 (sidebar), DENS-01..03 (density), CONT-03 (truncation + copy-cell). Playwright discovers **75 tests** across the suite (36 visual + 30 a11y + 3 portal + 2 sidebar + 2 density + 1 truncation + 1 copy).
- Lighthouse CI config at `frontend/lighthouserc.json` with research-corrected 3-URL list (`/`, `/activity`, `/skills` — `/sessions/compare` excluded per RESEARCH Pitfall 5), CWV thresholds (LCP<2500ms / CLS<0.1 / INP<200ms), filesystem upload, vite preview server on 127.0.0.1:4173.
- `backend/tests/test_url_contract.py` bidirectional gate — passes against the existing 7-route tree (`/`, `/activity`, `/skills`, `/skills/$name`, `/sessions/compare`, `/cost`, `/alerts`). Plan 06 shipped `docs/url-contract.md` in parallel; both pytest assertions PASS today (not skip).
- Backend pytest: **663 passing** (was 661 baseline; +2 from URL contract tests).
- Frontend vitest: **353 passing** (preserved exactly).
- Frontend `pnpm tsc --noEmit` clean.

## Task Commits

1. **Task 1: Visual capture + axe + portal-containment specs** — `d1304ea` (test)
2. **Task 2: Sidebar + density + truncation + copy-cell specs** — `5872663` (test)
3. **Task 3: Lighthouse CI config + URL contract pytest** — `cdeda8d` (feat)
4. **Auto-fix (Rule 1): ESM __dirname in v13-visual-capture** — `51f36b6` (fix)

## Files Created/Modified

- `frontend/tests/e2e/v13-visual-capture.spec.ts` — POLI-09 matrix: 6 routes × 3 densities × 2 themes = 36 fullPage PNGs into the phase visual-check dir
- `frontend/tests/e2e/v13-a11y.spec.ts` — POLI-10 axe gate: 5 routes × 3 × 2 = 30 axe-core runs; fails on serious/critical; moderate/minor surface as console.warn
- `frontend/tests/e2e/v13-portal-containment.spec.ts` — CONT-02 runtime probe: DropdownMenu, cmdk dialog, `.cmc-btn:hover` — walks parentElement up to body collecting transform offenders
- `frontend/tests/e2e/v13-sidebar.spec.ts` — SHEL-04 Cmd+B + reload persistence + collapsed-mode tooltip + active border-left ≥ 3px survives collapse
- `frontend/tests/e2e/v13-density.spec.ts` — DENS toggle writes localStorage + dataset.density; `--cmc-padding-card` resolves to Compact tier 16px; cozy DropdownMenu font-size = 16px (Portal cascade)
- `frontend/tests/e2e/v13-truncation.spec.ts` — CONT-03: finds overflowing `.cmc-cell--truncate` on /skills, asserts Tooltip surfaces full value; `test.skip` when demo data has no overflow
- `frontend/tests/e2e/v13-copy-cell.spec.ts` — CONT-03: CopyIconButton clipboard write + stopPropagation; `test.skip` when no `.cmc-cell--copyable` on /skills
- `frontend/lighthouserc.json` — 3-URL collect, CWV assertions, filesystem upload
- `backend/tests/test_url_contract.py` — Bidirectional docs⇄route file derivation; `pytest.skip` when docs absent
- `.planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep` — preserves dir so plan-07 auto-capture can write into it; PNGs themselves are gitignored
- `.gitignore` — appended `.lighthouseci/` and `.planning/phases/*/visual-check/*.png`

## Decisions Made

All decisions were inherited from PLAN.md and RESEARCH:

- **Lighthouse URL list:** `/`, `/activity`, `/skills` (research-corrected to skip `/sessions/compare` per RESEARCH Pitfall 5)
- **A11y matrix scope:** 5 routes × 3 densities × 2 themes; `/sessions/compare` excluded (no chart elements ⇒ false negatives for chart-aware rules)
- **Forward-compat skips** in v13-truncation and v13-copy-cell are explicit and reference Phase 26/27 adoption — vitest already pins the primitive behavior
- **URL contract test bidirectionality:** Both "documented but missing route file" AND "route file but undocumented" fail loudly with the offending set printed in the assertion message

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] ESM `__dirname` undefined in v13-visual-capture spec**

- **Found during:** Post-Task-3 sanity verification via `pnpm playwright test --list -g "v13-"`
- **Issue:** `frontend/package.json` declares `"type": "module"`, so Playwright loads specs as ESM. `__dirname` is undefined at ESM module scope, causing a `ReferenceError` during spec parsing → all 7 v13 specs failed to register with Playwright (`Total: 0 tests in 0 files`).
- **Fix:** Replaced `__dirname` with `path.dirname(fileURLToPath(import.meta.url))` — the canonical ESM equivalent. Added a 2-line comment explaining the workaround.
- **Files modified:** `frontend/tests/e2e/v13-visual-capture.spec.ts`
- **Verification:** `pnpm playwright test --list -g "v13-"` now reports `Total: 75 tests in 7 files` (matches the expected 36+30+3+2+2+1+1 sum exactly). `pnpm tsc --noEmit` remains clean.
- **Committed in:** `51f36b6` (separate from Task 1 commit because Task 1 had already been committed — using `--amend` would have rewritten history per the per-task commit protocol).

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Essential fix — without it the 75-test scaffolding would be invisible to Playwright at plan 07's matrix run. No scope creep; the fix changed only the module-scope `__dirname` resolution.

## Issues Encountered

- **Parallel-plan collision risk (mitigated):** Plan 06 ran in parallel and shipped `frontend/package.json` + `frontend/pnpm-lock.yaml` + `frontend/eslint.config.js` + `frontend/eslint-rules/` + the `docs/` directory between my Task 2 and Task 3 commits. I left those files untouched (per plan instructions) and staged only my Task 3 artifacts (`frontend/lighthouserc.json`, `backend/tests/test_url_contract.py`) — the pre-commit hook ran cleanly against the partial-stage state.
- **System python is 3.11; backend requires 3.13.** First pytest run failed on PEP 695 `type X = ...` syntax. Switched to `uv run pytest` (per backend tooling convention) → ran clean. Recorded for future-plan reference: backend pytest must invoke `uv run pytest`, not bare `python -m pytest`.
- **URL contract test transitioned SKIP→PASS during the plan window** because plan 06 merged `docs/url-contract.md` mid-execution. The final pytest run shows **2 passed, 0 skipped** — exactly the desired phase-close state.

## User Setup Required

None — no external service configuration needed. Lighthouse CI runs locally via `npx lhci autorun` against the vite preview server; axe-core and Playwright bundle the rule sets they need.

## Next Phase Readiness

**Ready for plan 06 close** (already complete in parallel — `docs/url-contract.md` is the doc plan 05's pytest consumes; both passing today).

**Ready for plan 07 (phase close gate):**

- Plan 07 invokes the v13-* Playwright suite (75 tests), the axe matrix (30 runs), the visual capture matrix (36 PNGs), the Lighthouse CI run (3 URLs × 3 numberOfRuns = 9 LHRs), and `uv run pytest backend/tests/test_url_contract.py`.
- Operator review at plan 07 should focus on: (1) visual-check PNG matrix for density+theme regressions; (2) Lighthouse LCP/CLS/INP scores; (3) any axe moderate/minor console warnings (logged but non-blocking) worth filing as follow-ups.

**Known forward-compat skips for plan 07 to expect:**

- `v13-truncation.spec.ts` will skip if `/skills` demo data has no overflowing `.cmc-cell--truncate`. Vitest unit covers the primitive.
- `v13-copy-cell.spec.ts` will skip if `/skills` has no `.cmc-cell--copyable`. Phase 26/27 wires per-column adoption.
- These are deliberate, documented, and reference the future-phase that activates them. NOT blockers.

## Self-Check: PASSED

**Files verified present:**
- frontend/tests/e2e/v13-visual-capture.spec.ts ✓
- frontend/tests/e2e/v13-a11y.spec.ts ✓
- frontend/tests/e2e/v13-portal-containment.spec.ts ✓
- frontend/tests/e2e/v13-sidebar.spec.ts ✓
- frontend/tests/e2e/v13-density.spec.ts ✓
- frontend/tests/e2e/v13-truncation.spec.ts ✓
- frontend/tests/e2e/v13-copy-cell.spec.ts ✓
- frontend/lighthouserc.json ✓
- backend/tests/test_url_contract.py ✓
- .planning/phases/24-shell-density-containment-primitives/visual-check/.gitkeep ✓

**Commits verified in git log:**
- d1304ea (Task 1) ✓
- 5872663 (Task 2) ✓
- cdeda8d (Task 3) ✓
- 51f36b6 (Rule 1 fix) ✓

**Verification commands:**
- `pnpm tsc --noEmit` → exit 0
- `pnpm vitest run` → 353/353 passing (baseline preserved)
- `uv run pytest -q` (backend) → 663 passing (was 661; +2 from URL contract)
- `pnpm playwright test --list -g "v13-"` → `Total: 75 tests in 7 files`
- `uv run pytest backend/tests/test_url_contract.py -v` → 2 passed (against plan 06's docs/url-contract.md)

---
*Phase: 24-shell-density-containment-primitives*
*Plan: 05*
*Completed: 2026-05-11*
