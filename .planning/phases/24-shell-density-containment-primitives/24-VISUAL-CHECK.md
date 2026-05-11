# Phase 24 — VISUAL-CHECK

**Operator:** _(to be signed at human-verify checkpoint)_
**Date capture run:** 2026-05-11
**Phase:** 24 — Shell + Density + Containment Primitives
**Plan that produced this evidence:** 07 (close gate)

**Capture commands:**

- Visual:                `cd frontend && pnpm test:e2e -- tests/e2e/v13-visual-capture.spec.ts`
- Axe-core:              `cd frontend && pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts`
- Portal-containment:    `cd frontend && pnpm test:e2e -- tests/e2e/v13-portal-containment.spec.ts`
- Sidebar/density e2e:   `cd frontend && pnpm test:e2e -- tests/e2e/v13-{sidebar,density,truncation,copy-cell}.spec.ts`
- Lighthouse:            `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`
- URL contract:          `cd backend && uv run pytest tests/test_url_contract.py -v`

**Captured PNGs:** `.planning/phases/24-shell-density-containment-primitives/visual-check/` (36 files: 6 routes × 3 densities × 2 themes)

---

## Test counts (vs v1.2 close baseline)

| Suite              | v1.2 baseline               | Phase 24 close                            | Delta             | Notes                                                                |
|--------------------|-----------------------------|-------------------------------------------|-------------------|----------------------------------------------------------------------|
| Backend pytest     | 661 / 0 / 0                 | **663 / 0 / 0**                           | +2                | +2 url-contract tests (Plan 05+06 cross-plan handshake)              |
| Frontend vitest    | 326 / 0 / 0                 | **353 / 0 / 0**                           | +27               | Density (7) + Sidebar/AppShellHeader (9) + containment primitives (11) |
| Playwright e2e     | 13 specs (11 pass + 2 skip) | **20 specs (18 pass + 2 forward-compat skip)** | +7 specs        | v13-* visual / a11y / portal / sidebar / density / truncation / copy |
| `pnpm tsc --noEmit`| clean                       | **clean**                                 | —                 | —                                                                    |
| `pnpm lint`        | (not enforced)              | **exit 0**                                | n/a               | Plan 06 introduced ESLint flat config + 2 custom invariant rules     |
| `pnpm build`       | clean                       | **clean** (CSS comment terminator fix, 1c610d4) | —           | lightningcss-blocking comment in styles.css fixed during this plan   |

---

## Visual capture verdict (36 rows)

Operator: open each PNG in alpha order under `visual-check/`, mark PASS/FAIL, add notes.

Pass criteria: layout coherent, no horizontal scrollbar (except inside DataTable wraps), no clipped content, sidebar visible with correct active-route highlight, header action area not overflowing, density visibly different per tier (Compact tighter, Cozy roomier).

Acceptable to mark FAIL/empty-state: `/sessions/compare` PNGs likely show an empty-state because demo session IDs aren't seeded — note as "PASS (empty-state)" per plan-level acceptance.

| Route × Density × Theme              | Verdict       | Notes |
|--------------------------------------|---------------|-------|
| home__compact__dark.png              | PASS / FAIL   | …     |
| home__compact__light.png             | PASS / FAIL   | …     |
| home__comfortable__dark.png          | PASS / FAIL   | …     |
| home__comfortable__light.png         | PASS / FAIL   | …     |
| home__cozy__dark.png                 | PASS / FAIL   | …     |
| home__cozy__light.png                | PASS / FAIL   | …     |
| activity__compact__dark.png          | PASS / FAIL   | …     |
| activity__compact__light.png         | PASS / FAIL   | …     |
| activity__comfortable__dark.png      | PASS / FAIL   | …     |
| activity__comfortable__light.png     | PASS / FAIL   | …     |
| activity__cozy__dark.png             | PASS / FAIL   | …     |
| activity__cozy__light.png            | PASS / FAIL   | …     |
| skills__compact__dark.png            | PASS / FAIL   | …     |
| skills__compact__light.png           | PASS / FAIL   | …     |
| skills__comfortable__dark.png        | PASS / FAIL   | …     |
| skills__comfortable__light.png       | PASS / FAIL   | …     |
| skills__cozy__dark.png               | PASS / FAIL   | …     |
| skills__cozy__light.png              | PASS / FAIL   | …     |
| cost__compact__dark.png              | PASS / FAIL   | …     |
| cost__compact__light.png             | PASS / FAIL   | …     |
| cost__comfortable__dark.png          | PASS / FAIL   | …     |
| cost__comfortable__light.png         | PASS / FAIL   | …     |
| cost__cozy__dark.png                 | PASS / FAIL   | …     |
| cost__cozy__light.png                | PASS / FAIL   | …     |
| alerts__compact__dark.png            | PASS / FAIL   | …     |
| alerts__compact__light.png           | PASS / FAIL   | …     |
| alerts__comfortable__dark.png        | PASS / FAIL   | …     |
| alerts__comfortable__light.png       | PASS / FAIL   | …     |
| alerts__cozy__dark.png               | PASS / FAIL   | …     |
| alerts__cozy__light.png              | PASS / FAIL   | …     |
| sessions-compare__compact__dark.png  | PASS (empty-state acceptable; full content lands in Phase 26) | … |
| sessions-compare__compact__light.png | PASS (empty-state acceptable) | … |
| sessions-compare__comfortable__dark.png | PASS (empty-state acceptable) | … |
| sessions-compare__comfortable__light.png | PASS (empty-state acceptable) | … |
| sessions-compare__cozy__dark.png     | PASS (empty-state acceptable) | … |
| sessions-compare__cozy__light.png    | PASS (empty-state acceptable) | … |

**Auto-fillable rollup:** 36/36 PNGs captured. 6 sessions-compare PNGs pre-marked as empty-state PASS per the plan. 30 production-route PNGs await operator visual review.

---

## Axe-core results (POLI-10)

**Run command:** `pnpm test:e2e -- tests/e2e/v13-a11y.spec.ts`
**Total runs:** 30 (5 routes × 3 densities × 2 themes — `/`, `/activity`, `/skills`, `/cost`, `/alerts`)
**Tags:** `wcag2a + wcag2aa + wcag21a + wcag21aa`
**Phase 24 regressions cleared in this plan (3):**

| Violation                | Origin                                              | Fix (commit `06f09a2`)                                          |
|--------------------------|-----------------------------------------------------|-----------------------------------------------------------------|
| `aria-prohibited-attr` on `.cmc-skeleton-stack` | Multi-line Skeleton wrapper had `aria-label` without a role | Added `role="status"` (permits aria-label per ARIA 1.2)  |
| `color-contrast` on `.cmc-sidebar__section-header` (Observe / Operate / Configure) | Sidebar IA headers used `var(--cmc-text-subtle)` = 2.77:1 contrast | Bumped to `var(--cmc-text-dim)` = 5.46:1 (clears AA 4.5:1) |
| `v13-a11y.spec.ts` `networkidle` timeout on `/activity`+`/skills` | OTEL/firehose streams never settle | Switched to `domcontentloaded` + 1500ms settle (commit `06f09a2`) |

**Phase 24 regression blocking violations (serious + critical):** **0**

**Pre-existing (v1.2-baseline) `color-contrast` violations on subtle-text components — documented in `## Accepted Exceptions` below.**

---

## Lighthouse CI results (POLI-11 extension)

**Run command:** `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`
**Manifest:** `frontend/.lighthouseci/manifest.json` (9 reports, latest 3 per URL after the post-INP-fix re-run)
**URLs:** `http://127.0.0.1:4173/`, `/activity`, `/skills` (3 URLs × 3 runs = 9 runs)
**Build:** `pnpm build` clean after styles.css comment-terminator fix (commit `1c610d4`).

| URL          | LCP (median, ms) | LCP threshold | CLS (median) | CLS threshold | Performance score | INP                    | Verdict |
|--------------|-----------------:|--------------:|-------------:|--------------:|-------------------:|------------------------|---------|
| /            | **572**          | 2500          | **0**        | 0.1           | **1.0**            | manual (POLI-11 React profiler) | PASS |
| /activity    | **565**          | 2500          | **0.0032**   | 0.1           | **1.0**            | manual (POLI-11 React profiler) | PASS |
| /skills      | **559**          | 2500          | **0**        | 0.1           | **1.0**            | manual (POLI-11 React profiler) | PASS |

**Auto-assertion exit status:** `0` — all 9 runs pass LCP + CLS + performance-score assertions. INP is excluded from automated assertions per the inline `_comment_inp` in `frontend/lighthouserc.json` (Lighthouse's cold-load audit cannot synthesize user interactions). Operator-side INP coverage is the **POLI-11 React DevTools profiler binary gate** (see Perf budget table below).

**LCP margin:** every run is ≥4× under the 2500ms threshold. **CLS margin:** every run is ≥30× under the 0.1 threshold.

---

## Perf budget — binary gates (POLI-11)

| Gate                                              | Result         | Evidence                                                                                 |
|---------------------------------------------------|----------------|------------------------------------------------------------------------------------------|
| **Density toggle React re-render count = 0**     | _(operator)_   | `visual-check/perf-density-toggle.png` — operator-captured React DevTools profiler screenshot (procedure in `## How to verify` below). Architectural guarantee per Plan 02 SUMMARY: DensityProvider deliberately not a React Context, density consumers read CSS cascade only. |
| **Chart polling p95 paint < 16ms**                | _(operator)_   | Chrome DevTools Performance trace (operator-recorded if user wants extra evidence). Lighthouse `total-blocking-time` is 0 across all 9 runs which is the cold-load proxy. |
| **ResponsiveContainer instance count stable**     | **PASS**       | `rg -c "ResponsiveContainer" frontend/src/components/panels/ --glob '!**/__tests__/**'` → **26** (v1.2 baseline: 26). Delta = 0. Phase 24 added zero charts. |

---

## Portal containment probe (CONT-02)

**Run:** `pnpm test:e2e -- tests/e2e/v13-portal-containment.spec.ts`
**Result:** **3/3 PASS** (post spec stabilization, commit `75244ec`)

| Test | Result |
|------|--------|
| Density toggle dropdown content has no transform ancestor | **PASS** |
| Command palette content has no transform ancestor          | **PASS** |
| Hovering a button doesn't put the page into a transform state | **PASS** (Plan 01's `top:-2px + box-shadow` swap holds) |

**Spec-bug fixes during this plan:** the spec was originally over-zealous — it walked from `el.parentElement` into Radix's `[data-radix-popper-content-wrapper]` (which legitimately uses `transform: translate(x, y)` for popover positioning) and into the cmdk panel's own `transform: scale(0.96)` entrance animation. Both were flagged as offenders despite being self/intrinsic transforms, not ancestor traps. Fix: skip `[data-radix-popper-content-wrapper]` during the walk; add a 250ms settle so the cmdk entrance animation completes before assertion. Intent ("no ancestor traps a Portal child as a fixed-positioning containing block") preserved.

---

## URL contract gate (POLI-13)

**Run:** `cd backend && uv run pytest tests/test_url_contract.py -v`
**Result:** **2/2 PASS**

| Test | Result |
|------|--------|
| `test_all_documented_routes_exist_in_tree`         | **PASS** |
| `test_all_tree_routes_documented`                  | **PASS** |

Bidirectional contract: every URL pattern in `docs/url-contract.md` resolves to a file in `frontend/src/routes/`, and every route file is documented.

---

## Sidebar + density + truncation + copy-cell e2e (SHEL-04, DENS-01..03, CONT-03)

| Spec                        | Result | Notes |
|-----------------------------|--------|-------|
| v13-sidebar (2 tests)       | **2 PASS** | Cmd+B collapse + persistence + active accent border survive; collapsed-mode tooltip via Radix Portal (`side="right"`) renders. Spec fix during this plan: added a `waitForFunction(width<70)` after the attribute flip to absorb the 180ms width transition. |
| v13-density (2 tests)       | **2 PASS** | localStorage + `<html data-density>` persistence; cascade reaches Radix Portal DropdownMenu (POLI-11 DENS-02). Spec + CSS fix during this plan: added `font-size: var(--cmc-size-body)` to `.cmc-dropdown` so the cascade resolves at the menu root, not just on items. |
| v13-truncation (1 test)     | **SKIP** (forward-compat, by design) | No `.cmc-cell--truncate` overflow in current demo data; activates when Phase 26/27 wires per-column `wrap:true`. Primitive behavior pinned by vitest. |
| v13-copy-cell (1 test)      | **SKIP** (forward-compat, by design) | No `.cmc-cell--copyable` cells on current routes; activates when Phase 26/27 wires `copyable:true` on session-id / cwd / skill-name columns. Primitive behavior pinned by vitest. |

---

## Accepted Exceptions

Phase 24 fixed all Phase-24-attributable a11y regressions (sidebar section-header contrast, Skeleton aria-label) but did NOT undertake a wholesale color-contrast overhaul of v1.2-baseline components. Per RESEARCH Pitfall 7 ("subtle-text-not-for-body"), the locked policy is: **the eventual fix is a coordinated `--cmc-text-subtle` rebalance landed alongside per-route adoption in Phase 26/27**, NOT in Phase 24.

| Exception                                                                                                                                 | Rationale                                                                                                                          | Unblock condition                                                                                                                            |
|-------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| `color-contrast` (serious) on `.cmc-range-toggle__btn cmc-range-toggle__btn--active` and the active-state button text                     | Pre-existing v1.2 component. The `--active` button uses a desaturated tone for its pressed state; foreground contrast falls under 4.5:1. | Phase 26/27 per-route adoption rebalances `--cmc-range-toggle` color tokens during column-adoption work.                                     |
| `color-contrast` (serious) on `.cmc-badge--{danger,warning,success,info}` text against badge background                                    | Pre-existing v1.2 component. Badge backgrounds + their text tokens collectively under-deliver vs WCAG AA at the body-text size used. | Phase 26/27 status-pill / badge rebalance, OR a dedicated color-contrast pass in v1.4.                                                       |
| `color-contrast` (serious) on `.cmc-schedules-row__{toggle,times,history-trigger}` and inner `.cmc-relative-time` / "Next:" / "Last:" spans | Pre-existing v1.2 component. Uses `--cmc-text-subtle` as body text — the exact Pitfall 7 pattern documented in RESEARCH.            | Phase 26/27 `/cost` route adoption swaps subtle-text body usages for `--cmc-text-dim` (or upgrade `--cmc-text-subtle` globally with a re-audit). |
| `color-contrast` (serious) on `.cmc-link.cmc-mono` skill-name links inside DataTable                                                     | Pre-existing v1.2 component. Monospace link tokens at the table cell font size fall under 4.5:1.                                  | Phase 27 `/skills` route adoption (TDBT-02 column wire-up) re-tunes link contrast.                                                          |
| `color-contrast` (serious) on `<label class="cmc-schedules-row__toggle">…<input type="checkbox">Enabled</label>` row text                | Pre-existing v1.2 schedule row. The "Enabled" label uses subtle-text against the row's filled background.                          | Phase 26 `/cost` route adoption.                                                                                                              |
| `<article class="cmc-card cmc-alert-rule-form">`-internal range-toggle group selector                                                     | Pre-existing v1.2 alert form. The internal `<select>` (the "Range filter" dropdown) inherits low-contrast text.                  | Phase 26 `/alerts` route adoption.                                                                                                            |

**Operator decision required:** sign the verdict below as PASS (acknowledging the Phase 24 surface is clean and the listed pre-existing items are explicitly deferred), or as FAIL (which would block phase close until a dedicated color-contrast pass lands — recommend opening Phase 24-gap plan rather than blocking, since the listed items are uniformly outside Phase 24 scope).

---

## Manual operator steps (require browser + React DevTools extension)

> Required for full sign-off but outside the automated-gate scope. None of these can be CI-gated in v1.3.

### 1. React DevTools profiler — density toggle zero-rerender (POLI-11 binary gate)

1. `cd frontend && pnpm dev`
2. Open `http://localhost:5173/activity` in Chrome with React DevTools extension installed.
3. DevTools → React → Profiler tab → click **Record**.
4. Click the density toggle in the header; select a different density tier (e.g., Compact if currently Comfortable).
5. Click **Stop** on the profiler.
6. **PASS condition:** the commits list shows **only `DensityToggle` re-rendered (1 commit, 1 component)**. Charts, tables, panels, sidebar, AppShellHeader — NONE of them should have re-rendered.
7. Capture the commits-list screenshot, save as `.planning/phases/24-shell-density-containment-primitives/visual-check/perf-density-toggle.png`.
8. Mark the perf-budget binary-gate row in this document as PASS or FAIL.

**Architectural rationale (Plan 02 SUMMARY):** DensityProvider is intentionally NOT a React Context. Density tier persistence happens via `setDensity()` → `localStorage` + `<html data-density>` attribute. Density consumers read the CSS cascade. There is NO React subscription path from a density tier change to any consumer below `DensityToggle` — the profiler test is therefore an architectural assertion, not a discipline-enforced one.

### 2. Manual sidebar smoke test

- Same dev server. Press **Cmd+B** → sidebar collapses to icon-only (52px width).
- Hover any icon → tooltip on the right with route label.
- Press **Cmd+B** again → sidebar expands to 240px.
- Reload → state persists (`localStorage.cmc.sidebar.collapsed`).
- Click density toggle → menu shows three tiers with a check on the current tier. Select a different tier → page re-spaces with **no React-tree re-render** (visible-flash-free).

### 3. Visual matrix review

Open `.planning/phases/24-shell-density-containment-primitives/visual-check/` in Finder. Iterate through all 36 PNGs in alpha order. For each:

- **PASS** if layout is coherent, sidebar visible, header action area not overflowing, density visibly distinct from neighboring tiers.
- **FAIL** if any of the above is broken.

Mark each row in the **Visual capture verdict** table above. Add notes for anything subjective.

---

## Phase verdict

**Operator verdict:** _____ (PASS / FAIL)
**Date verdict signed:** ____________
**Operator name:** ____________
**Notes:**

---

## Self-Check

Automated artifacts produced by this plan:

- [x] 36 PNGs at `.planning/phases/24-shell-density-containment-primitives/visual-check/`
- [x] 9 Lighthouse reports at `frontend/.lighthouseci/` with manifest.json (assertions pass: LCP, CLS, performance-score)
- [x] Axe-core matrix run (30 runs): Phase 24 regressions cleared; pre-existing contrast violations documented as Accepted Exceptions
- [x] Portal-containment 3/3 PASS
- [x] Sidebar/density e2e 4 PASS + 2 forward-compat SKIP
- [x] URL contract pytest 2/2 PASS
- [x] ResponsiveContainer count delta = 0 (26 == 26)
- [x] Frontend `pnpm tsc --noEmit` clean
- [x] Frontend `pnpm vitest run` 353/353
- [x] Backend `uv run pytest` 663/0/0
- [x] Frontend `pnpm build` clean (CSS comment-terminator fix landed)

Manual artifacts pending operator capture (see § Manual operator steps):

- [ ] `visual-check/perf-density-toggle.png` (React DevTools profiler commit list)
- [ ] Visual matrix PASS/FAIL marks on 30 production-route rows (6 sessions-compare pre-marked as empty-state PASS)
- [ ] Operator signature
