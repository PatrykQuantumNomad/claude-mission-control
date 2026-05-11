---
phase: 24-shell-density-containment-primitives
plan: 06
subsystem: testing
tags: [eslint, eslint-flat-config, typescript-eslint, testid-registry, z-index-ladder, url-contract, affordance-checklist, poli-09, poli-12, poli-13, poli-14, cont-05]

# Dependency graph
requires:
  - phase: 24-shell-density-containment-primitives
    provides: "Plan 01 (--cmc-z-* CSS variables on :root + z-index ladder values); Plans 02/03/04 (the testids that now populate docs/testid-registry.md)"
provides:
  - "docs/z-index-ladder.md — 11-layer ladder reference with --cmc-z-* CSS variables"
  - "docs/affordance-checklist.md — 15 keyboard/pointer/a11y affordances enumerated with verification specs"
  - "docs/url-contract.md — 7 preserved v1.2-baseline URL patterns + validateSearch shapes; consumed by backend/tests/test_url_contract.py (plan 05)"
  - "docs/testid-registry.md — exact-match + dynamic-pattern catalog of every Playwright/vitest data-testid; consumed by cmc/testid-registry-only ESLint rule"
  - "frontend/eslint.config.js — flat ESM config wiring two custom invariant-enforcing rules"
  - "frontend/eslint-rules/{index.cjs,testid-registry-only.cjs,no-raw-z-index.cjs} — custom CMC ESLint plugin"
  - "frontend/package.json lint script (pnpm lint, --max-warnings 0)"
affects: [phase 25 saved views, phase 26 per-route adoption I, phase 27 per-route adoption II, phase 28 layout customization, phase 24 plan 07 close gate]

# Tech tracking
tech-stack:
  added: [eslint@^9.39, typescript-eslint@^8.59, @typescript-eslint/parser@^8.59]
  patterns:
    - "Flat ESLint config (ESM) bridging CJS rule plugins via createRequire — package.json has type:module, custom rules use .cjs extension to stay CJS, imported through createRequire"
    - "Custom invariant-enforcing ESLint rule pattern: load a docs/*.md registry file once at module init, parse bullet items into Set/RegExp, visit JSXAttribute, report on misses"
    - "Stub-plugin shim for unloaded rules referenced in eslint-disable-next-line: define a no-op rule (react-hooks/exhaustive-deps) so existing v1.2 disable directives resolve without 'rule not found' errors when the real plugin is intentionally deferred"
    - "reportUnusedDisableDirectives: 'off' for the lint scope — unused-directive flagger is informational, not invariant-enforcing, and would derail --max-warnings 0 on v1.2 baseline"

key-files:
  created:
    - "docs/z-index-ladder.md"
    - "docs/affordance-checklist.md"
    - "docs/url-contract.md"
    - "docs/testid-registry.md"
    - "frontend/eslint.config.js"
    - "frontend/eslint-rules/index.cjs"
    - "frontend/eslint-rules/testid-registry-only.cjs"
    - "frontend/eslint-rules/no-raw-z-index.cjs"
  modified:
    - "frontend/package.json (lint script + 3 devDeps)"
    - "frontend/pnpm-lock.yaml"

key-decisions:
  - "eslint-rules/index.cjs (CommonJS) consumed via createRequire from ESM eslint.config.js — `.js` would be ESM by default due to package.json type:module, but the rule files use require('node:fs'); chose CJS plugin index + ESM flat config bridge so rule files stay self-contained CJS"
  - "react-hooks/* stub-plugin shim defines no-op rules so v1.2 baseline `eslint-disable-next-line react-hooks/exhaustive-deps` directives resolve without errors; real react-hooks plugin intentionally deferred per research OQ#5 minimal-scope mandate"
  - "reportUnusedDisableDirectives: 'off' on the lint scope — unused-directive reporting is noise here, not invariant signal; reinstate when phases 25+ adopt broader rule coverage"
  - "Generic vitest sentinel testids (page, row, rows, inner, ico, lhs, rhs, some-test-id, sheet-body) are registered as exact-matches in docs/testid-registry.md — they live in src/**/__tests__/*.test.tsx files which ARE inside the lint scope; not registering them would block the entire vitest suite from passing lint"
  - "density-option-{value} added to dynamic-patterns AND density-option-compact/comfortable/cozy added to exact-matches — covers both the JSX construction site (template literal) and any Playwright/vitest assertions that use the literal value"

patterns-established:
  - "Custom ESLint invariant rule: read companion docs/*.md as source-of-truth, parse with /^-\\s+`([^`]+)`/gm regex on bullet lines, separate exact-match (Set) and dynamic-pattern (RegExp[]) buckets. Future phases that introduce new invariants (e.g., 'no-raw-spacing-px in styled JSX', 'no-cross-route imports') can fork this pattern."
  - "Template-literal data-testid reconstruction: a JSX `data-testid={\\`prefix-${expr}-suffix\\`}` is reconstructed as `prefix-{x}-suffix` for pattern matching, regardless of how many interpolation slots exist."
  - "ESLint flat config + CJS plugin interop: createRequire(import.meta.url) inside the ESM config is the cleanest bridge. Avoid mixing module syntaxes inside a single file."

# Metrics
duration: ~6 min
completed: 2026-05-11
---

# Phase 24 Plan 06: POLI docs + ESLint invariant rules Summary

**Shipped 4 markdown reference docs + minimal-scope ESLint flat config with 2 custom invariant-enforcing rules (cmc/testid-registry-only + cmc/no-raw-z-index), wiring docs/testid-registry.md and docs/z-index-ladder.md into CI as drift gates.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-11T10:25:11Z
- **Completed:** 2026-05-11T10:30:45Z
- **Tasks:** 3
- **Files modified:** 10 (8 created + 2 modified)
- **Frontend vitest:** 353/353 preserved (no production code touched)
- **Frontend tsc --noEmit:** clean
- **pnpm lint:** exits 0 against v1.2 baseline + Phase 24 codebase
- **backend pytest tests/test_url_contract.py:** 2/2 passing (was skipped before this plan landed docs/url-contract.md)

## Accomplishments

1. **POLI-09 / CONT-05 z-index ladder doc** — 11 layers, --cmc-z-* CSS variable names, integer values, sibling-above-same-family `calc(var(...)+1)` pattern, conflict-history footnote.
2. **POLI-12 affordance checklist** — 15 numbered keyboard/pointer/a11y affordances with Playwright spec OR manual VISUAL-CHECK references; mobile-out-of-scope + ResizeObserver browser-floor footnotes.
3. **POLI-13 URL contract** — 7 preserved v1.2-baseline routes documented with validateSearch shapes; consumed by `backend/tests/test_url_contract.py` (parallel plan 05) — that pytest now passes (2/2) after this plan landed the doc.
4. **POLI-14 testid registry + cmc/testid-registry-only ESLint rule** — every Playwright/vitest data-testid in the tree catalogued (45 exact-match + 3 dynamic patterns); rule fails CI on unregistered IDs.
5. **CONT-05 cmc/no-raw-z-index ESLint rule** — fails CI on `style={{ zIndex: <number> }}` JSX literals; forces use of --cmc-z-* CSS variables from styles.css :root.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author z-index-ladder.md, affordance-checklist.md, url-contract.md** — `3698bf3` (docs)
2. **Task 2: Author docs/testid-registry.md** — `e700a9e` (docs)
3. **Task 3: ESLint custom rules + flat config + lint script** — `5e6bb73` (feat)

## Files Created/Modified

### Created

- `docs/z-index-ladder.md` — 11-layer z-index ladder reference (POLI-09 + CONT-05)
- `docs/affordance-checklist.md` — 15 keyboard/pointer/a11y affordances (POLI-12)
- `docs/url-contract.md` — 7 preserved URL patterns + validateSearch shapes (POLI-13)
- `docs/testid-registry.md` — testid registry consumed by ESLint rule (POLI-14)
- `frontend/eslint.config.js` — flat ESM ESLint config; wires typescript-eslint recommended + cmc/* rules + react-hooks stub
- `frontend/eslint-rules/index.cjs` — CMC ESLint plugin module (CJS)
- `frontend/eslint-rules/testid-registry-only.cjs` — bans unregistered data-testid literals
- `frontend/eslint-rules/no-raw-z-index.cjs` — bans raw zIndex integers in JSX inline style

### Modified

- `frontend/package.json` — added `lint` script; added eslint@^9, typescript-eslint@^8, @typescript-eslint/parser@^8 devDeps
- `frontend/pnpm-lock.yaml` — lockfile update for the 3 new devDeps

## Decisions Made

1. **`eslint-rules/index.cjs` (CommonJS) + ESM `eslint.config.js` via `createRequire`**
   - `package.json` has `"type": "module"` so a plain `.js` file is ESM by default, but the rule files use `require('node:fs')` / `require('node:path')` and are written as CommonJS.
   - Two interop options were possible: (a) make `index.js` ESM and re-export via `import` (forcing the rule files to also be ESM); (b) make `index.cjs` CommonJS and consume it from the ESM config via `createRequire`.
   - Chose **(b)** — keeps the rule files self-contained CJS (the ESLint plugin ecosystem still defaults to CJS in 2026), and the ESM config bridge is a single `createRequire` line at the top.

2. **`react-hooks` stub-plugin shim**
   - v1.2-baseline `frontend/src/components/ui/RangeToggle.tsx:59` carries `// eslint-disable-next-line react-hooks/exhaustive-deps` (and `frontend/tests/e2e/v13-a11y.spec.ts` has two `// eslint-disable-next-line no-console` directives).
   - ESLint 9 reports "Definition for rule 'react-hooks/exhaustive-deps' was not found" as a fatal error when a disable directive references an unknown rule.
   - Defining a stub plugin with a no-op rule (`{ meta: {...}, create: () => ({}) }`) lets the disable directive resolve without loading the real `eslint-plugin-react-hooks`. Real react-hooks coverage is intentionally deferred per research OQ#5.
   - Alternative considered: strip the v1.2 disable comments. Rejected because the comments are useful documentation for the eventual phase that DOES load `eslint-plugin-react-hooks`, and the stub is 5 lines.

3. **`reportUnusedDisableDirectives: 'off'`**
   - ESLint flat config default is to warn on unused-disable directives. With `--max-warnings 0`, those warnings would block the build.
   - Pre-existing `// eslint-disable-next-line no-console` in `tests/e2e/v13-a11y.spec.ts` targets a rule we don't load — the directive is unused under our minimal config.
   - Silencing `reportUnusedDisableDirectives` keeps `pnpm lint` clean today without churning v1.2 code; revisit when phases 25+ adopt broader rule coverage.

4. **Generic vitest sentinel testids (page, row, rows, inner, ico, lhs, rhs, some-test-id, sheet-body) registered as exact-matches**
   - These IDs live in `src/**/__tests__/*.test.tsx` files which fall under the lint scope (`src/**/*.{ts,tsx}`).
   - Initially considered an "ignore tests" alternative, but the testid registry's purpose is to enumerate EVERY targeted DOM-attribute string in the tree — false negatives via ignored paths would defeat POLI-14.
   - Registered them under their own "Generic UI test fixtures (v1.2 baseline — vitest-only)" subsection with a footnote.

5. **`density-option-{value}` registered as BOTH a dynamic pattern AND three exact-match entries (`density-option-compact`/`comfortable`/`cozy`)**
   - DensityToggle.tsx constructs the testid via template literal: `data-testid={\`density-option-${t.value}\`}` — matched by the dynamic pattern.
   - Playwright/vitest assertions reference the resolved values as literals: `getByTestId('density-option-compact')` — matched by the exact-match entries.
   - Registering both shapes lets the rule pass at the JSX construction site AND at the test-side assertion site without needing the rule to evaluate template values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing eslint-disable directives target unloaded rules**

- **Found during:** Task 3 (initial `pnpm lint` run after wiring the config)
- **Issue:** `src/components/ui/RangeToggle.tsx:59` carries `// eslint-disable-next-line react-hooks/exhaustive-deps` and `tests/e2e/v13-a11y.spec.ts:53,58` carry `// eslint-disable-next-line no-console`. The plan's minimal-scope config loads neither plugin, so ESLint 9 reports a fatal "rule not found" + two unused-directive warnings.
- **Fix:** Added a stub `react-hooks` plugin (no-op rules for `exhaustive-deps` and `rules-of-hooks`) and set `linterOptions.reportUnusedDisableDirectives: 'off'`. Both fixes documented inline in `eslint.config.js`.
- **Files modified:** `frontend/eslint.config.js`
- **Verification:** `pnpm lint` exits 0; negative-test probe (unregistered testid + raw zIndex) still fires both custom rules.
- **Committed in:** `5e6bb73` (Task 3 commit)

**2. [Rule 3 - Blocking] `src/routes/routeTree.gen.ts` ignore path was wrong**

- **Found during:** Task 3 (initial `pnpm lint` run)
- **Issue:** Plan specified ignoring `src/routes/routeTree.gen.ts` but the actual generated file lives at `src/routeTree.gen.ts` (no `routes/` subdir prefix in this codebase). ESLint reported a spurious unused-directive warning on the generated file's `/* eslint-disable */` banner.
- **Fix:** Added `src/routeTree.gen.ts` to the `ignores` array alongside the original path (kept the original entry for forward-compat if the file location ever changes).
- **Files modified:** `frontend/eslint.config.js`
- **Verification:** `pnpm lint` no longer descends into the generated file.
- **Committed in:** `5e6bb73` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Stylistic typescript-eslint rules trigger noise on v1.2 baseline**

- **Found during:** Task 3 (initial `pnpm lint` runs while tuning the config)
- **Issue:** `typescript-eslint/recommended` includes rules that fire across the v1.2 codebase (`no-unused-vars`, `no-explicit-any`, `no-empty-object-type`, `no-empty-function`, `ban-ts-comment`, `no-require-imports`, plus core `no-empty`, `no-useless-escape`, `no-prototype-builtins`). Plan listed 3 disables; codebase needed 9 to keep `pnpm lint` clean.
- **Fix:** Appended 6 additional `'off'` entries to the `rules` block. Each is intentionally silenced — the minimal-scope mandate per research OQ#5 says invariant enforcement only, no project-wide style sweep.
- **Files modified:** `frontend/eslint.config.js`
- **Verification:** `pnpm lint` exits 0; the two CMC custom rules still fire (negative-test probe confirmed).
- **Committed in:** `5e6bb73` (Task 3 commit)

**4. [Rule 2 - Missing Critical] testid registry initially under-populated for vitest sentinel IDs**

- **Found during:** Task 2 (drafting docs/testid-registry.md against the grep output)
- **Issue:** The v1.2-baseline grep returned 9 generic IDs (`page`, `row`, `rows`, `inner`, `ico`, `lhs`, `rhs`, `some-test-id`, `sheet-body`) that live in vitest test files under `src/**/__tests__/`. Plan's example registry only listed "shell + UI primitives" sections and didn't enumerate these. Not registering them would have failed lint on dozens of v1.2 test files when Task 3 ran.
- **Fix:** Added a "Generic UI test fixtures (v1.2 baseline — vitest-only)" subsection to docs/testid-registry.md enumerating all 9 generic IDs with a footnote explaining they are vitest sentinel attributes, not Playwright selectors.
- **Files modified:** `docs/testid-registry.md`
- **Verification:** `pnpm lint` exits 0 across the entire `src/**` lint scope.
- **Committed in:** `e700a9e` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical)
**Impact on plan:** All four auto-fixes were necessary for `pnpm lint` to exit 0 on the v1.2 baseline + Phase 24 codebase, which is the plan's stated success criterion. No scope creep; the minimal-scope invariant (research OQ#5: enforce testid-registry-only + no-raw-z-index ONLY) is fully preserved.

## Issues Encountered

1. **Parallel-agent shared-worktree coordination:** Plan 05 was running concurrently and added `frontend/tests/e2e/v13-*.spec.ts`, `frontend/lighthouserc.json`, `backend/tests/test_url_contract.py`. I avoided touching their files; the only shared file (`frontend/pnpm-lock.yaml`) was modified by my `pnpm add eslint typescript-eslint @typescript-eslint/parser` but plan 05's lockfile additions (lighthouse-cli was already on the lockfile from Plan 01) didn't collide. A transient stale-Read-cache event was observed (system-reminder reported `package.json` at line 16 lacking a comma, but the on-disk reality had the comma — `git diff` confirmed my changes were present). No content loss.

2. **`backend/tests/test_url_contract.py` cross-plan dependency:** Plan 05 authored the pytest gate before I authored `docs/url-contract.md`; the test would have been skipping or failing until my Task 1 commit. After my Task 1 + Plan 05's commit landed, `python -m pytest backend/tests/test_url_contract.py` now passes 2/2 — confirming the cross-plan handshake worked as designed.

## User Setup Required

None — no external service configuration needed.

## Next Phase Readiness

- Plan 06 + Plan 05 (parallel Wave 4) both complete; Wave 5 (Plan 07 close gate) ready.
- `docs/testid-registry.md` registers every testid present today, including Phase 25/26 placeholders (`time-picker-trigger`, `save-view-button`) — future phases adopting those primitives just remove `display: none` + wire `onClick`, the testid is already approved.
- ESLint rules will fire automatically on any future plan that adds an unregistered `data-testid="..."` literal OR a raw `style={{ zIndex: <n> }}` — the contract is now self-enforcing.
- `pnpm lint` + `pnpm tsc --noEmit` + `pnpm vitest run` + `python -m pytest backend/tests/test_url_contract.py` all green.

## TDD Gate Compliance

Plan type is `execute` (not `tdd`); no RED/GREEN/REFACTOR cycle expected. Negative-test probe (transient `__lint_probe__.tsx` files created and removed) confirmed both custom rules fire on unregistered testid AND raw zIndex literal — verification was performed inline during Task 3 execution.

## Self-Check: PASSED

- Files created (8): all present.
- Files modified (2): all updated.
- Commits (3): 3698bf3, e700a9e, 5e6bb73 — all in `git log`.
- `pnpm lint`: exits 0.
- `pnpm tsc --noEmit`: clean.
- `pnpm vitest run`: 353/353.
- `python -m pytest backend/tests/test_url_contract.py`: 2/2 pass.

---
*Phase: 24-shell-density-containment-primitives*
*Completed: 2026-05-11*
