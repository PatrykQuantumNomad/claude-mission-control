---
phase: 09-telegram-setup-testing
plan: 05
plan_id: 09-05
subsystem: frontend-testing
tags:
  - playwright
  - e2e
  - theme-toggle
  - close-out
  - phase-9-final
dependency_graph:
  requires:
    - 09-01 (telegram primitives + 5 Settings + notifications router)
    - 09-02 (notifier oneshot + dedup ledger)
    - 09-03 (handler long-poll + setup_telegram wizard)
    - 09-04 (install.sh + cc CLI + doctor + setup_otel + server plist)
    - 07-04 (ScheduleComposer — TPNL-04 — required for TEST-03 flow)
    - 05-01 (NavBar shell — required for ThemeToggle mount point)
  provides:
    - "Phase 9 close-out artifacts: theme toggle (Q1=A locked) + Playwright e2e gate"
  affects:
    - frontend/src/components/shell/NavBar.tsx (added ThemeToggle child)
    - frontend/src/main.tsx (applyTheme() before render)
    - frontend/src/styles.css ([data-theme=\"light\"] override block)
    - frontend/package.json (@playwright/test devDep + test:e2e scripts)
tech_stack:
  added:
    - "@playwright/test (^1.59.1) — Playwright test runner"
    - "@types/node — required by playwright.config.ts (Node-only `process` global)"
  patterns:
    - "data-theme attribute + CSS variable override for theme switching (no provider, no CSS-in-JS)"
    - "Playwright webServer multi-process (uvicorn + vite preview) with reuseExistingServer=true"
    - "vite preview --host 127.0.0.1 to force IPv4 match for Playwright health probe"
    - "ControlOrMeta+KeyK keypress so the cmd-k spec works on macOS AND Linux runners"
    - "afterEach DELETE /api/schedules/{id} cleanup so the e2e suite leaves no test data"
key_files:
  created:
    - frontend/src/lib/theme.ts
    - frontend/src/components/shell/ThemeToggle.tsx
    - frontend/playwright.config.ts
    - frontend/tests/e2e/routes.spec.ts
    - frontend/tests/e2e/command-palette.spec.ts
    - frontend/tests/e2e/schedule-composer.spec.ts
    - frontend/tests/e2e/theme-toggle.spec.ts
    - .planning/phases/09-telegram-setup-testing/09-VERIFICATION.md
  modified:
    - frontend/src/components/shell/NavBar.tsx
    - frontend/src/main.tsx
    - frontend/src/styles.css
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/.gitignore
decisions:
  - "Theme toggle ships as ~50 LOC of new frontend code per Q1=A LOCKED. CSS-variable override on [data-theme=\"light\"]; no provider, no MUI/Chakra, no CSS-in-JS. Light theme is functional only — visual polish deferred to v2."
  - "applyTheme() runs in main.tsx BEFORE ReactDOM.createRoot so data-theme is set during first paint — avoids a flash of wrong theme on cold load."
  - "Playwright config locks chromium-only (RESEARCH §D8 — single-developer macOS dashboard, multi-browser is v2)."
  - "webServer launches `vite preview` (production build), NEVER `vite dev` (Pitfall P9 — HMR causes flake)."
  - "Vite preview uses --host 127.0.0.1 explicitly because the default `localhost` may resolve to ::1 only on macOS, which Playwright's webServer health check at http://127.0.0.1:4173 then misses."
  - "TEST-02 uses ControlOrMeta+KeyK instead of Meta+K so the spec works on macOS AND Linux executors."
  - "TEST-03 uses the Advanced cron field (`0 9 * * 1-5`) instead of the time/days chip composition to drive the form deterministically; afterEach DELETE /api/schedules/{id} keeps the SQLite DB clean across runs."
  - "TEST-04 explicitly clears localStorage `cmc.theme` AND reloads at the start of the spec so prior runs (or persisted developer state) don't bias the default-theme assertion."
  - "Q6 LOCKED — manual `npm run test:e2e` gate in v1; no CI workflow added."
metrics:
  duration_minutes: 16
  completed_date: 2026-04-28
  task_count: 2
  file_count: 14
  test_results:
    backend_total: 373
    backend_passing: 373
    frontend_unit_total: 234
    frontend_unit_passing: 234
    frontend_e2e_total: 6
    frontend_e2e_passing: 6
---

# Phase 9 Plan 05: Wave 4 Close-out — Theme toggle + Playwright e2e Summary

Final plan of Phase 9 lands the theme toggle (Q1=A LOCKED, ~50 LOC: `lib/theme.ts` + `ThemeToggle.tsx` + `[data-theme="light"]` CSS overrides + NavBar mount + `main.tsx` boot hook) and a four-spec Playwright suite (TEST-01..04: routes / Cmd+K / ScheduleComposer / theme persistence) running against `vite preview` on chromium-only. Suite passes 6/6 (4 spec files; routes.spec has 3 sub-tests); backend stays 373/373; frontend unit stays 234/234. The plan ends with a close-out human-verify checkpoint walking the user through all 5 ROADMAP success criteria — agent execution paused per the plan's `autonomous: false` contract.

## What Shipped

### Theme toggle (Task 1 — Q1=A LOCKED)

- **`frontend/src/lib/theme.ts`** — 30-line module exporting `getTheme()`, `setTheme(theme)`, `applyTheme()`, and `DEFAULT_THEME = 'dark'`. Persists to `localStorage['cmc.theme']`; mutates `document.documentElement.dataset.theme` so `[data-theme="light"]` CSS overrides take effect synchronously. SSR-safe (`typeof window` / `typeof document` guards) for unit-test ergonomics.
- **`frontend/src/components/shell/ThemeToggle.tsx`** — single-button component with inline sun/moon SVGs (no new icon library). Mounts with `useState('dark')` then syncs to persisted value in `useEffect` to avoid React 19 StrictMode warnings around localStorage reads during render. `data-testid="theme-toggle"` is the locked Playwright locator.
- **`frontend/src/components/shell/NavBar.tsx`** — ThemeToggle imported and rendered as the last child of the navbar (right of the Cmd+K trigger). Existing NavBar test stays green because it asserts on presence of named landmarks, not exact child count.
- **`frontend/src/styles.css`** — Two new blocks:
  1. `[data-theme="light"]` overriding the core surface/text/border tokens (`--cmc-bg`, `--cmc-surface`, `--cmc-surface-2`, `--cmc-surface-3`, `--cmc-border`, `--cmc-border-glow`, `--cmc-text`, `--cmc-text-dim`, `--cmc-text-subtle`). Minimal palette flip; visual polish (gradient recolour, accent contrast, shadow tuning) deferred to v2.
  2. `.cmc-theme-toggle` — compact 32×32 icon button matching the existing `.cmc-cmdk-trigger` aesthetic (surface-2 bg, border, hover state, focus-visible accent outline).
- **`frontend/src/main.tsx`** — `applyTheme()` called BEFORE `ReactDOM.createRoot(...)` so the `data-theme` attribute is set during the first paint. Prevents a flash of wrong theme on cold load when the user has previously selected light.

### Playwright e2e suite (Task 2 — TEST-01..04)

- **`frontend/package.json`** — `@playwright/test` (^1.59.1) + `@types/node` (^25.6.0) added as devDeps; `test:e2e` and `test:e2e:ui` npm scripts; chromium browser binary installed via `npx playwright install chromium`.
- **`frontend/playwright.config.ts`** — chromium-only project; `webServer` array launches BOTH the backend (`uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765`) probing `/api/health`, AND `npm run preview -- --port 4173 --strictPort --host 127.0.0.1` probing `/`. `reuseExistingServer: true` so a developer who already has `cc start` running OR a stray vite preview from a prior run doesn't conflict. `fullyParallel: false` and `workers: 1` because TEST-03 mutates server state. baseURL is `http://127.0.0.1:4173` (explicit IPv4).
- **`frontend/tests/e2e/routes.spec.ts` (TEST-01)** — 3 sub-tests: navigate to `/`, `/activity`, `/skills`; assert each h1 (`#cmd-heading`, `#activity-heading`, `#skills-heading`) renders the right text; assert the React error-boundary fallback ("Couldn't reach the dashboard server.") has `count(0)`.
- **`frontend/tests/e2e/command-palette.spec.ts` (TEST-02)** — navigate to `/`, click body to focus, press `ControlOrMeta+KeyK` (Playwright maps to Meta on macOS, Ctrl elsewhere — both modifiers are accepted by the cmdk handler in `CommandPalette.tsx`), assert the dialog (`role="dialog"`, `aria-label="Mission Control command palette"`) becomes visible, plus a sanity check that the search input with the spec's placeholder copy renders.
- **`frontend/tests/e2e/schedule-composer.spec.ts` (TEST-03)** — open `/skills`, click the SchedulesCard's `+ New` button, fill `Name` and `Advanced cron` (`0 9 * * 1-5` — bypasses the time/days chip composition for deterministic driving), submit, assert the new row appears, then capture the schedule's id via `request.get('/api/schedules')` and `afterEach` DELETE it. Cleanup is critical because the e2e suite runs against a real backend with persistent SQLite — without DELETE, schedules accumulate across runs.
- **`frontend/tests/e2e/theme-toggle.spec.ts` (TEST-04)** — load `/`, clear `localStorage['cmc.theme']`, reload, assert `<html data-theme="dark">` (default), click the toggle, assert `data-theme="light"` AND `localStorage['cmc.theme']` is `'light'`, reload, assert `data-theme="light"` STILL — persistence verified. `afterEach` clears the key so subsequent runs/specs start hermetic.
- **`frontend/.gitignore`** — added `test-results/`, `playwright-report/`, `playwright/.cache/` so Playwright runtime artifacts never check in.

### 09-VERIFICATION.md (Task 3 — close-out evidence document)

`.planning/phases/09-telegram-setup-testing/09-VERIFICATION.md` mirrors the format of `08-VERIFICATION.md`: SC1–SC5 walkthrough tables with manual command + expected + result columns. SC5 (Playwright) is marked VERIFIED with the executor's run output baked in; SC1–SC4 are pending until the user runs the close-out checkpoint walkthrough.

## Architecture Notes

**Theme toggle data-flow:**

```
main.tsx applyTheme() ──┐
                        ├──► document.documentElement.dataset.theme = "dark" | "light"
ThemeToggle click ──────┤
                        ▼
                 [data-theme="light"] CSS overrides core tokens
                        │
                        ▼
                 React re-renders → light surfaces
                        │
                        ▼
                 setTheme() writes localStorage["cmc.theme"]
                        │
                        ▼ (next page load)
                 main.tsx applyTheme() reads localStorage → restores
```

The single source of truth is `localStorage["cmc.theme"]`; all other state derives from it. There is no React context, no provider, no theme variable in any component — components read `--cmc-bg` etc. directly from CSS, and the override block does the work.

**Playwright server lifecycle:**

```
playwright test
   │
   ├──► webServer[0]: uv run uvicorn ... --port 8765 (probes /api/health)
   │       └─ if already running (cc start), reuseExistingServer=true skips spawn
   │
   ├──► webServer[1]: npm run preview -- --port 4173 --host 127.0.0.1 (probes /)
   │       └─ same reuse semantics
   │
   └──► chromium project runs each spec at baseURL=http://127.0.0.1:4173
```

`vite preview` (the production build) is locked over `vite dev` per Pitfall P9 — HMR causes `page.click → page.locator` race flakes that we have no good way to mitigate inside specs.

## Test Coverage Gain

| Layer | Before | After | Δ |
|-------|--------|-------|---|
| Backend (Python) | 373 | 373 | 0 (no changes — Plan 09-05 is frontend-only) |
| Frontend unit (Vitest) | 234 | 234 | 0 (NavBar test still green; theme toggle persistence is tested by TEST-04) |
| Frontend e2e (Playwright) | 0 specs | 4 specs / 6 tests | +6 (TEST-01..04 — 4 spec files; routes.spec has 3 sub-tests so the runner reports 6) |

The TEST-04 unit-test trade-off was deliberate: a Vitest test would mock `localStorage` and `document.documentElement` and verify only the binding logic; the Playwright test verifies the full end-to-end persistence (including `applyTheme()` running before render in main.tsx) — strictly higher confidence for ~the same line count. No NavBar component test was needed because the existing test asserts on landmarks/roles, not child count.

## Decisions Made

1. **Theme = data-attribute + CSS-variable override (NO provider).** Q1=A LOCKED says ~50 LOC; a provider pattern would burn 30 LOC on context boilerplate without any benefit because no component needs to read the theme value at render time — they read CSS variables.
2. **`applyTheme()` BEFORE `ReactDOM.createRoot`, not inside an effect.** Inside an effect, you'd see a one-frame flash of dark before light kicks in. Synchronously mutating `document.documentElement.dataset.theme` before render means CSS resolution happens with the right `[data-theme="light"]` selector active.
3. **`@types/node` shipped alongside `@playwright/test`.** Playwright's config types reference Node globals (`process.env`); without `@types/node`, `tsc -b` errors. Cheap fix, no runtime cost (devDep only).
4. **`--host 127.0.0.1` on `vite preview`.** Vite's default `localhost` may resolve to `::1` only on macOS Sequoia, which Playwright's `http://127.0.0.1:4173` health probe then misses (timeout after 30s). Explicit IPv4 fixes this and costs nothing.
5. **`ControlOrMeta+KeyK` instead of `Meta+K`.** Playwright maps `ControlOrMeta` to Meta on macOS and Control on Linux; CommandPalette accepts either via `e.metaKey || e.ctrlKey`. Picking ControlOrMeta means the spec doesn't have to branch on `process.platform`.
6. **Advanced-cron field for TEST-03.** The composer's time/days chip composition is harder to drive (chips are bespoke `<button aria-pressed>`, day order is Sun-first not Mon-first). Filling `Advanced cron` with `0 9 * * 1-5` overrides the chip composition (per the composer's `computedCron` memo) and is a single accessible label query.
7. **`fullyParallel: false`, `workers: 1`.** TEST-03 creates+deletes a real schedule. Running specs in parallel could let a second worker observe a half-deleted state. Serial execution costs ~5s of clock time and removes a class of flake.
8. **`reuseExistingServer: true`.** A solo developer often has `cc start` running while editing. The webServer entries skip spawning if the health probe already responds — the suite "just works" against either a manually-started or auto-started backend.
9. **Q6 LOCKED — manual gate, no CI.** Mission Control's CI story is post-v1; the Playwright suite is the hand-pulled cord at close-out. Future revision can add a GitHub Actions matrix once the project goes public.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocker] vite preview health-check timeout**
- **Found during:** Task 2 — first `npm run test:e2e` run.
- **Issue:** Playwright webServer probe at `http://127.0.0.1:4173` timed out after 30s even though `npm run preview -- --port 4173 --strictPort` started successfully. Vite's default `localhost` host resolves to `::1` (IPv6) only on this macOS host, which Playwright's IPv4 probe misses.
- **Fix:** Added `--host 127.0.0.1` to the preview command in `playwright.config.ts`.
- **Files modified:** `frontend/playwright.config.ts`
- **Commit:** `70e8a65`

**2. [Rule 3 — Blocker] TEST-02 dialog locator timing**
- **Found during:** Task 2 — second `npm run test:e2e` run (first with both webServers green).
- **Issue:** `getByRole('dialog', { name: '...' })` failed with "element(s) not found" after pressing `Meta+K`. Playwright's `Meta+K` macro doesn't always land on chromium with a metaKey modifier set, depending on focus state.
- **Fix:** Swapped to `ControlOrMeta+KeyK` (Playwright maps to Meta on macOS, Ctrl elsewhere) and bumped the visibility timeout from 2s to 5s. CommandPalette already accepts both `metaKey || ctrlKey` so the keypress reliably triggers `setOpen(true)`.
- **Files modified:** `frontend/tests/e2e/command-palette.spec.ts`
- **Commit:** `70e8a65`

Both auto-fixes happened during the same Task 2 development cycle and are bundled into commit `70e8a65`.

### Architectural Deviations

None — the plan executed exactly per Q1=A and Q6=manual locked decisions.

## Authentication Gates

None — Plan 09-05 is purely frontend tooling. Auth gates (Telegram bot token, ANTHROPIC_API_KEY) are exercised by the close-out human-verify checkpoint (SC3, SC4) which the user runs against their own credentials.

## Known Stubs

None. Theme toggle is fully wired (no mock localStorage, no placeholder palette); Playwright suite tests real backend + real frontend; light theme palette is functional (legible against the existing component set).

## Phase 9 Roll-up

This plan closes Phase 9 (the final phase of v1.0). Cumulative across the phase:

- **09-01:** Telegram primitives (`cmc.telegram.api`, `cmc.telegram.messages`, `cmc.telegram.dash_router`), 2 plist templates (notifier + handler), `notifications` router, 5 new Settings fields. +33 backend tests (298 → 331).
- **09-02:** Notifier oneshot daemon (TELE-02 with TELE-04 dedup ledger + snooze + rerun cleanup). +14 backend tests (331 → 345).
- **09-03:** Handler long-poll daemon (TELE-05 + TELE-06 dispatch + ANTHROPIC_API_KEY scrub) + setup_telegram wizard (TELE-01). +18 backend tests (345 → 363).
- **09-04:** install.sh + cc shim + start.sh + stop.sh + doctor.py (8 checks) + setup_otel.py (6 LOCKED keys, atomic merge) + com.cmc.server.plist.j2 + plist_render. +10 backend tests (363 → 373).
- **09-05:** Theme toggle (Q1=A) + Playwright e2e suite (TEST-01..04). 0 backend test changes; 6 frontend e2e tests added.

**Final v1.0 totals:** 45/45 plans complete (Phase 1–9). Backend 373/373 green. Frontend unit 234/234 green. Frontend e2e 6/6 green.

## Self-Check: PASSED

- File `frontend/src/lib/theme.ts` — FOUND
- File `frontend/src/components/shell/ThemeToggle.tsx` — FOUND
- File `frontend/playwright.config.ts` — FOUND
- File `frontend/tests/e2e/routes.spec.ts` — FOUND
- File `frontend/tests/e2e/command-palette.spec.ts` — FOUND
- File `frontend/tests/e2e/schedule-composer.spec.ts` — FOUND
- File `frontend/tests/e2e/theme-toggle.spec.ts` — FOUND
- File `.planning/phases/09-telegram-setup-testing/09-VERIFICATION.md` — FOUND
- Commit `9252585` (feat 09-05 theme toggle) — FOUND in `git log`
- Commit `70e8a65` (test 09-05 playwright suite) — FOUND in `git log`

All Plan 09-05 artifacts present and accounted for. The close-out human-verify checkpoint is the next gate — agent has paused per `autonomous: false` per `<execution_flow>` Pattern B.
