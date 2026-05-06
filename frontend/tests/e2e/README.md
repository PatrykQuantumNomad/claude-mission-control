# Frontend E2E (Playwright) — Conventions & Runbook

These specs run against the production build (`vite preview` on
`http://127.0.0.1:4173`) plus the live FastAPI backend (`uvicorn` on
`http://127.0.0.1:8765`) per `playwright.config.ts`'s `webServer` block. They
exercise real cross-component flows (Sheet open → form submit → list update)
that vitest's component tests cannot cover.

`reuseExistingServer=true` is set for both servers, so a developer with
`cmc start` already running won't fight the test runner.

---

## Selector Hierarchy

Playwright's official guidance is to prefer locators that mirror what an
assistive-tech user perceives. In order of preference:

1. `page.getByRole(...)` — accessible to assistive tech; **default**. Use for
   buttons, links, headings, textboxes-with-an-accessible-name. Exact-match
   `name` is collision-resistant.
2. `page.getByLabel(...)` — form fields with an associated `<label>` or
   `aria-label`. **Watch out for aria-label substring matches under strict
   mode (Pitfall 4):** Playwright's `getByLabel` matches `aria-label`
   substrings, so `getByLabel('Name')` will match
   `aria-label="Filter skill name"` on the same page.
3. `page.getByText(...)` — non-interactive text content (paragraphs, headers
   that aren't a `role` element).
4. `page.getByTestId(...)` — **fallback** for when role/label/text collide
   under strict mode and the source component cannot be re-shaped to make a
   user-facing locator unique.

---

## When to Add `data-testid`

Only when strict-mode locator ambiguity surfaces — when multiple elements
match a user-facing locator on the route under test. Do **NOT** preemptively
decorate components: Playwright's official guidance is that test IDs are a
fallback, not a primary strategy, and indiscriminate decoration creates
visual noise in source files plus a false sense of test stability.

If a locator is already unique under strict mode (e.g.,
`getByRole('button', { name: 'Create schedule' })` is exact-match and only
one such button is rendered), leave it alone. Convert to `getByTestId` only
when Playwright reports a `strict mode violation` for the existing locator.

---

## `data-testid` Naming Convention

**Format:** `feature-component-element` (kebab-case, path-style).

This is predictable for grep, scoped by feature, and collision-resistant
across pages that share an element name (e.g., a "Name" input might exist on
both the schedule composer and the alerts firehose).

**Examples:**

- `schedule-composer-name` — the Name input on the schedule composer.
- `schedule-composer-submit` — the submit button on the schedule composer.
- `schedule-composer-cron` — the advanced-cron textarea on the schedule
  composer.
- `alerts-firehose-skill-filter` — the skill-name filter on the alerts
  firehose panel.
- `skills-detail-projects-table` — the projects table on the skill detail
  page.

Use the `feature` segment to match the route or panel context, the
`component` segment to match the React component name (kebab-cased), and the
`element` segment to identify the specific control.

---

## Where the Attribute Lives

`data-testid` lives on the **source React component** — e.g.,
`frontend/src/components/panels/ScheduleComposer.tsx` — NOT on a test-only
wrapper. Specs reference it via `page.getByTestId('…')`.

Reasons:

- Standard Playwright pattern; no test-only wrapper infra to maintain.
- Tests stay simple (one selector call, no extra render layer).
- Source-located attributes are visible to the engineer changing the
  component, so they know not to delete the attribute when refactoring.

---

## Running the Suite

From the `frontend/` directory:

```bash
# Full suite (all spec files)
pnpm run test:e2e

# UI mode (interactive — useful when authoring or debugging)
pnpm run test:e2e:ui

# Single spec
npx playwright test schedule-composer

# Force single-worker (already the default per config; useful when
# investigating cross-test state leaks)
npx playwright test --workers=1
```

The Playwright config auto-launches:

- Backend on `http://127.0.0.1:8765` (`uvicorn cmc.app.factory:create_app`)
- Frontend preview on `http://127.0.0.1:4173` (`vite preview`)

with `reuseExistingServer=true`, so an active dev session with
`cmc start` running will not be preempted. The frontend production build
(`pnpm run build`) must exist before running e2e — `vite preview` serves the
prebuilt `dist/`.

---

## Known Steady-State Skips

`alerts.spec.ts` (TEST-05a) skips when the dev DB has no recently-failed
task to feed the alerts dispatcher (Phase 18 Pitfall 6). The spec checks
for the presence of a recent failure before exercising the firehose; on
most dev databases this condition is not met and the test reports
`1 skipped`.

`skills-detail.spec.ts` (SKLP-08/09/10, Phase 19 Plan 04) skips when the
dev DB has no skills seeded — `/api/skills` returns an empty registry, so
there is no skill name to drill into. Run `cmc start` and
`POST /api/skills/sync` to ingest local Claude Code skills, then re-run.

`cost-dashboard.spec.ts` (ANLY-06/07, Phase 20 Plan 04) may show up to 2
skips on `cost-by-project-card-table has no path-leakage` and
`7d→30d toggle fires a /api/cost/breakdown?range=30d request` when the
dev DB has no `sessions.project_key != ''` rows for the current 7d
window. The path-leakage assertion is structurally vacuous in that
branch (the empty-state PanelCard renders no project keys to leak), and
the RangeToggle trailing slot only mounts in the data branch — so the
toggle test cannot fire a real refetch. Both skips degrade gracefully;
the spec passes when seed data is present (one keyed session within 7d
satisfies both). The first two tests
(`opens /cost and mounts both panels`,
`NavBar Cost link navigates from / to /cost`) are dev-DB-state-
independent and ALWAYS pass.

**`1-3 skipped` is the steady-state baseline** for this suite on a clean
dev database. Phase verifiers compare failed counts only, not skip
counts — do not regress these specs into "fixing" the skip by mocking
state-dependent endpoints.

**Steady-state Playwright baseline (Phase 20 close):**

- Passed: ≥ 8 (Phase 19 floor 7 + Phase 20's `cost-dashboard.spec.ts` 4
  tests minus up-to-2 conditional skips → effective floor 8 when no seed
  data; floor 11 with seeded `project_key` rows).
- Skipped: 1–3 (`alerts.spec.ts` steady-state +
  `skills-detail.spec.ts` when no skill seeded + `cost-dashboard.spec.ts`
  up-to-2 conditional skips when no `project_key` rows).
- Failed: 0.

---

## Strict Mode

Playwright runs in strict mode by default. Any locator that resolves to
more than one element on the page raises `strict mode violation` — the test
fails immediately. The fix is one of:

1. Tighten the user-facing locator (`getByRole('textbox', { name: 'Name' })`
   instead of `getByLabel('Name')`).
2. Scope to a parent (`page.getByRole('region', { name: 'Schedules' }).getByRole('button', { name: '+ New' })`).
3. Add a `data-testid` per the convention above and use `getByTestId(...)`.

Prefer (1) and (2). Use (3) only when the source markup genuinely cannot
yield a unique user-facing locator.
