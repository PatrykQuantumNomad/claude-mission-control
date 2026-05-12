---
phase: 25-saved-views-backend-frontend
plan: 11
type: execute
wave: 6
depends_on: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]
files_modified:
  - frontend/tests/e2e/v13-saved-views.spec.ts
  - frontend/tests/e2e/v13-sidebar.spec.ts
  - frontend/tests/e2e/v13-a11y.spec.ts
  - frontend/tests/e2e/command-palette.spec.ts
  - frontend/tests/e2e/v13-visual-capture.spec.ts
  - visual-check/.gitkeep
  - .planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md
autonomous: false

must_haves:
  truths:
    - "Playwright e2e covers the 5 ROADMAP success criteria end-to-end (save → load default; modify → EditOrForkDialog; Cmd+K saved-view jump; pin → sidebar; backend CRUD via curl evidence in VISUAL-CHECK.md)"
    - "axe-core sweep over /skills/$name + the new saved-views chrome surfaces 0 NEW blocking violations vs Phase 24 baseline"
    - "Lighthouse CI (3 URLs × 3 runs = 9 audits) still passes against the v13-lighthouserc.json budget"
    - "25-VISUAL-CHECK.md exists with operator-signed verdict (PASS / FAIL with notes)"
    - "All testids in docs/testid-registry.md are used in the tree (ESLint rule clean); no dead entries"
  artifacts:
    - path: "frontend/tests/e2e/v13-saved-views.spec.ts"
      provides: "New e2e spec covering save/load/edit-vs-fork/pip flows"
      contains: "saves a view and reloads"
    - path: "frontend/tests/e2e/v13-sidebar.spec.ts"
      provides: "Extension: pin/unpin + Pinned section active-state"
      contains: "pinned section"
    - path: "frontend/tests/e2e/v13-a11y.spec.ts"
      provides: "Extension: SavedViewMenu open + Save dialog open + Pinned section axe scans"
      contains: "saved view"
    - path: "frontend/tests/e2e/command-palette.spec.ts"
      provides: "Extension: Cmd+K Saved Views group → select → navigate"
      contains: "Saved Views"
    - path: ".planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md"
      provides: "Operator verdict + checkpoint evidence"
      contains: "Verdict"
  key_links:
    - from: "all Wave 1-4 plans"
      to: "frontend/tests/e2e/v13-saved-views.spec.ts"
      via: "end-to-end exercise of the full stack"
      pattern: "test\\("
    - from: ".planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md"
      to: "ROADMAP.md Phase 25 success criteria (5 items)"
      via: "operator confirms each criterion"
      pattern: "Success Criterion"
---

<objective>
Run the Phase 25 close gate. Ship Playwright e2e for the 5 ROADMAP success criteria, extend the existing axe-core / sidebar / command-palette / visual-capture specs to cover the new chrome, and produce the operator-signed `25-VISUAL-CHECK.md` verdict. Mirror Phase 24 plan-07's close-gate workflow exactly (`.planning/phases/24-shell-density-containment-primitives/07-PLAN.md`).

Purpose: Independent verification that Phase 25's full stack works end-to-end. Phase 24's quality gates (visual matrix, axe-core, Lighthouse, URL contract, testid registry, ESLint invariants) are LIVE — this plan exercises them against the saved-views surface.
Output: 25-VISUAL-CHECK.md with verdict PASS (or FAIL with specific gaps); +4 e2e specs / extensions; updated visual-capture snapshots for the new chrome.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md

# Phase 24 reference (mirror this close-gate workflow):
@.planning/phases/24-shell-density-containment-primitives/07-PLAN.md
@.planning/phases/24-shell-density-containment-primitives/24-VERIFICATION.md

# Existing specs to extend (read first):
@frontend/tests/e2e/v13-a11y.spec.ts
@frontend/tests/e2e/v13-sidebar.spec.ts
@frontend/tests/e2e/command-palette.spec.ts
@frontend/tests/e2e/v13-visual-capture.spec.ts
@frontend/tests/e2e/v13-portal-containment.spec.ts

# Locks:
@docs/testid-registry.md
@docs/url-contract.md
@docs/affordance-checklist.md
@docs/z-index-ladder.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create v13-saved-views.spec.ts covering 4 ROADMAP success criteria end-to-end</name>
  <files>frontend/tests/e2e/v13-saved-views.spec.ts</files>
  <action>
Create `frontend/tests/e2e/v13-saved-views.spec.ts`. Mirror the existing `v13-*.spec.ts` files for boilerplate (Playwright `test.beforeEach` clears localStorage; navigates; uses `data-testid` selectors per the registry).

Required test blocks (one per ROADMAP success criterion 1–4; criterion 5 is backend-only and is covered by Plan 02's pytest):

```typescript
import { test, expect } from '@playwright/test'

const SKILL_NAME = '/* operator-determined real skill name from /skills */'  // see Note below

test.describe('Phase 25 — Saved Views', () => {
  test.beforeEach(async ({ page }) => {
    // Clear server state via the API + local state
    await page.context().clearCookies()
    await page.addInitScript(() => localStorage.clear())
    // Seed cleanup: delete every saved view from prior runs
    const r = await page.request.get('http://127.0.0.1:8765/api/views')
    const list = await r.json()
    for (const v of list.items) {
      await page.request.delete(`http://127.0.0.1:8765/api/views/${v.id}`)
    }
  })

  // ── Success Criterion 1: save → per-route default → auto-load ──
  test('saves a view on /skills/$name and auto-loads it as the per-route default', async ({ page }) => {
    await page.goto(`/skills/${SKILL_NAME}?range=7d`)
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await page.getByTestId('save-view-dialog-name-input').fill('My 7d view')
    await page.getByTestId('save-view-dialog-submit').click()
    // dialog closes; view appears in menu
    await page.getByTestId('saved-view-menu-trigger').click()
    const viewItem = page.locator('[data-testid^="saved-view-item-"]').first()
    await expect(viewItem).toBeVisible()
    // Set as default via submenu
    await viewItem.hover()
    const id = await viewItem.getAttribute('data-testid').then((s) => s!.replace('saved-view-item-', ''))
    await page.getByTestId(`saved-view-set-default-${id}`).click()

    // Navigate away
    await page.goto('/alerts')
    // Return to /skills/$name with NO query
    await page.goto(`/skills/${SKILL_NAME}`)
    // Default applied — URL has range=7d
    await expect(page).toHaveURL(/range=7d/)
  })

  test('deep link to /skills/$name?range=30d wins over default', async ({ page }) => {
    // [Repeat seed: create + set-as-default]
    // Then navigate to /skills/<name>?range=30d explicitly
    // Assert URL stays at range=30d
  })

  // ── Success Criterion 2: edit → EditOrForkDialog ──
  test('modifying a loaded view triggers EditOrForkDialog with 3 explicit choices', async ({ page }) => {
    await page.goto(`/skills/${SKILL_NAME}?range=7d`)
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await page.getByTestId('save-view-dialog-name-input').fill('Test')
    await page.getByTestId('save-view-dialog-submit').click()

    // Change filter — URL diverges from loaded view
    await page.goto(`/skills/${SKILL_NAME}?range=30d`)
    await expect(page.getByTestId('unsaved-pip')).toBeVisible()

    // Open menu → "Edit '...'..." item visible
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-edit-current').click()

    // Dialog has 3 buttons
    await expect(page.getByTestId('edit-or-fork-dialog')).toBeVisible()
    await expect(page.getByTestId('edit-or-fork-dialog-save')).toBeVisible()
    await expect(page.getByTestId('edit-or-fork-dialog-fork')).toBeVisible()
    await expect(page.getByTestId('edit-or-fork-dialog-discard')).toBeVisible()
  })

  test('save-changes branch persists the new state to the backend', async ({ page }) => {
    // …seed view + change URL + open dialog + click save → assert state_json updated via API call
  })

  test('fork branch opens SaveViewDialog in fork mode', async ({ page }) => {
    // …seed view + change URL + open dialog + click fork → assert save-view-dialog title contains "new"
  })

  test('discard branch reverts URL to loaded view state_json', async ({ page }) => {
    // …seed view + change URL + open dialog + click discard → assert URL matches the loaded view's state
  })

  // ── Success Criterion 3: Cmd+K Saved Views group ──
  test('Cmd+K Saved Views group lists views and navigates to the matching route', async ({ page }) => {
    // …seed view on /cost
    await page.keyboard.press('Meta+k')  // or 'Control+k' on linux
    // Type view name; press Enter
    // Assert URL navigates to /cost with the view's filters
  })

  // ── Success Criterion 4: pinned in sidebar ──
  test('pinning a view via SavedViewMenu surfaces it in the sidebar Pinned section', async ({ page }) => {
    // …seed view + pin
    // After page reload (localStorage limitation per Plan 09 SUMMARY), assert sidebar-pinned-view-<id> visible
    await page.reload()
    const pinned = page.locator('[data-testid^="sidebar-pinned-view-"]').first()
    await expect(pinned).toBeVisible()
    await pinned.click()
    await expect(page).toHaveURL(/\/cost/)  // example assertion
  })

  // ── 50-view cap (success criterion 5 frontend-side UI warning) ──
  test('UI warning surfaces when the 50-view cap is reached', async ({ page }) => {
    // Seed 50 views on a test route via API
    for (let i = 0; i < 50; i++) {
      await page.request.post('http://127.0.0.1:8765/api/views', {
        data: { name: `v${i}`, route: '/cost', state_json: { i } },
      })
    }
    await page.goto('/cost')
    await page.getByTestId('saved-view-menu-trigger').click()
    await page.getByTestId('saved-view-menu-save-new').click()
    await page.getByTestId('save-view-dialog-name-input').fill('v50')
    await page.getByTestId('save-view-dialog-submit').click()
    // Assert error message visible in the dialog (createMutation.error rendered as cmc-field__error)
    await expect(page.locator('.cmc-field__error')).toBeVisible()
    await expect(page.locator('.cmc-field__error')).toContainText(/cap/i)
  })
})
```

NOTE: `SKILL_NAME` should be a real skill name that exists in the demo DB. Options:
- Hard-code `tdd-coverage-author-with-fanout` (a known long name from ROADMAP success criterion 1 of Phase 27).
- Read the first skill from `GET /api/skills` at test setup time.
- Use a synthetic test skill seeded by the test.

Choose the option most consistent with existing v13-*.spec.ts files. If `/skills/` lists demo skills available in dev DB, dynamically pick the first one via API call in `beforeEach`.

IMPORTANT:
- This spec is the primary regression net for ROADMAP success criteria 1–4. Each `test(...)` block maps 1:1 to a success criterion.
- Use `data-testid` selectors EXCLUSIVELY — ESLint enforces the registry; the registry IS the contract.
- `networkidle` is FORBIDDEN on routes with persistent streams (OTEL firehose, skill polling per Phase 24 plan-07 SUMMARY). Use `domcontentloaded` + short settle if needed.
- `page.keyboard.press('Meta+k')` on macOS / Control+k elsewhere — match the existing `command-palette.spec.ts` convention (it likely uses `process.platform === 'darwin' ? 'Meta+k' : 'Control+k'`).
- After each test, the `beforeEach` cleanup wipes server-side views. This is mandatory because Phase 25 introduces persistent server state — without cleanup, runs depend on order.
  </action>
  <verify>
`cd frontend && pnpm test:e2e v13-saved-views.spec.ts` — all 9+ test blocks pass (8 success-criteria flows + cap warning).
  </verify>
  <done>
v13-saved-views.spec.ts exists with all 9+ flows passing; covers ROADMAP success criteria 1–4 end-to-end + 50-cap warning.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extend v13-sidebar.spec.ts + v13-a11y.spec.ts + command-palette.spec.ts + v13-visual-capture.spec.ts</name>
  <files>frontend/tests/e2e/v13-sidebar.spec.ts, frontend/tests/e2e/v13-a11y.spec.ts, frontend/tests/e2e/command-palette.spec.ts, frontend/tests/e2e/v13-visual-capture.spec.ts</files>
  <action>
Extend each existing spec with saved-views coverage. Read each file first to match its conventions.

**v13-sidebar.spec.ts** — add a test block:
- "Pinned section exists between Operate and Configure (IA preserved)".
- "Pinning a view from SavedViewMenu shows it in the Pinned section after reload".
- "Active-state lights up when both pathname and search match".

**v13-a11y.spec.ts** — extend the existing matrix to include:
- SavedViewMenu open state (dropdown visible) on `/skills/$name`.
- SaveViewDialog open state (modal visible).
- EditOrForkDialog open state.
- Sidebar Pinned section with at least one pinned view.
Each axe-core scan asserts `expect(violations).toEqual([])` for the saved-views-attributable surfaces. Pre-existing v1.2 contrast classes are still in the Accepted-Exception list (deferred to Phase 26/27 per Phase 24 plan-07 SUMMARY) — those should NOT regress; if axe surfaces them, that's a baseline carry-over, not a Phase 25 blocker.

**command-palette.spec.ts** — add a test:
- "Saved Views group lists views and navigates on select".
- "Empty state appears when no saved views exist".
- "Current-route views appear before other-route views" (assert by index in the list).

**v13-visual-capture.spec.ts** — add screenshot points for the new chrome:
- `/skills/$name` with SavedViewMenu OPEN (capture the dropdown).
- `/cost` with SaveViewDialog open (capture the modal).
- `/cost` with EditOrForkDialog open.
- `/cost` with sidebar Pinned section populated.
- Each screenshot at 3 densities × 2 themes per existing matrix convention. Total NEW frames: ~4 surfaces × 3 densities × 2 themes = 24 new PNGs.

If the visual matrix already has a baked-in route × density × theme matrix, slot the new surfaces into the existing loops rather than adding parallel loops.

IMPORTANT:
- Phase 24 plan-07 SUMMARY notes that v13-visual-capture uses `domcontentloaded + short settle`, NOT `networkidle`. Preserve that.
- For axe-core, the existing rule-allowlist (`docs/affordance-checklist.md` + Accepted Exceptions in 24-VISUAL-CHECK.md) sets the baseline. Phase 25 expects 0 NEW saved-views-attributable violations.
- Visual capture stores PNGs at `visual-check/v13/*.png`; check the existing path convention.
  </action>
  <verify>
`cd frontend && pnpm test:e2e v13-sidebar.spec.ts v13-a11y.spec.ts command-palette.spec.ts v13-visual-capture.spec.ts` — all extensions pass. axe-core reports 0 NEW blocking violations. Lighthouse 9/9 via `pnpm lhci` still passes (note: Plan 11 does NOT need to re-run Lighthouse from scratch; the existing config covers `/`, `/activity`, `/skills` — verify those URLs still pass).
  </verify>
  <done>
4 specs extended; new e2e tests + visual frames all pass; axe-core clean.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Operator close-gate verification — author 25-VISUAL-CHECK.md and sign verdict</name>
  <files>.planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md, visual-check/.gitkeep</files>
  <what-built>
    Full Phase 25 stack: backend CRUD (Plan 01-02), validateSearch on 6 routes (Plan 03-04), data layer hooks (Plan 05), chrome (SavedViewMenu / SaveViewDialog / UnsavedPip / EditOrForkDialog — Plans 06-07), Cmd+K group (Plan 08), Sidebar Pinned section (Plan 09), per-route default + recent-states tracking (Plan 10), and Plan 11's e2e + visual + axe extensions.
  </what-built>
  <how-to-verify>
    Run the verification matrix in the same order Phase 24 plan-07 did (see `.planning/phases/24-shell-density-containment-primitives/24-VERIFICATION.md` and `24-VISUAL-CHECK.md` for the precise template — author 25-VISUAL-CHECK.md mirroring its structure).

    1. **Backend gate**: `cd backend && uv run pytest` reports baseline + Plan 01 (+2) + Plan 02 (+18) = >= 683 / 0 / 0.
    2. **Frontend unit gate**: `cd frontend && pnpm test --run` reports baseline + all wave unit tests (~50 new tests). Document the exact final count.
    3. **TypeScript gate**: `cd frontend && pnpm tsc --noEmit` exit 0.
    4. **ESLint gate**: `cd frontend && pnpm lint` exit 0. Every new testid is registered in `docs/testid-registry.md`; every overlay primitive uses the z-index ladder.
    5. **Build gate**: `cd frontend && pnpm build` exit 0.
    6. **URL contract gate**: `cd backend && uv run pytest tests/test_url_contract.py` 2/2 PASS.
    7. **Playwright e2e gate**: `cd frontend && pnpm test:e2e` — full matrix green including the new `v13-saved-views.spec.ts` (≥9 tests) + extensions.
    8. **Visual matrix**: 36 baseline Phase 24 frames + ~24 NEW Phase 25 frames = 60+ PNGs. Each operator-spot-checks for visible regressions vs the v1.3 design language.
    9. **Axe-core sweep**: 0 NEW blocking violations on the saved-views surfaces. Accepted-Exception carry-overs from Phase 24 still listed.
    10. **Lighthouse**: 9/9 audits PASS (3 URLs × 3 runs); LCP/CLS/performance unchanged vs Phase 24 baseline (LCP 559-572ms, CLS 0-0.0032, performance 1.0).
    11. **Manual operator flows** — mirror Phase 24 plan-07 SUMMARY's 9-item inline-notes section. For Phase 25 specifically:
        - Save view on `/skills/<name>` → set as default → navigate away → return → default applied (success criterion 1).
        - Modify loaded view → menu → Edit → exercise each of save/fork/discard branches (success criterion 2).
        - Cmd+K → type saved view name → Enter → land on route with filters (success criterion 3).
        - Pin from menu → see in sidebar → click → navigate (success criterion 4).
        - Curl all 5 endpoints; trigger 50-cap; trigger UNIQUE-name conflict (success criterion 5).
        - Visual checkpoint inline notes: SavedViewMenu portal containment, SaveViewDialog z-index, EditOrForkDialog 3-button layout, UnsavedPip visibility/positioning, sidebar Pinned section accent, density token cascade into all new chrome.
    12. **Author `25-VISUAL-CHECK.md`** mirroring 24-VISUAL-CHECK.md's exact section structure: Header table (date, branch, operator, verdict) → Success Criteria table (each of the 5 with evidence + verdict) → Verification matrix (each gate from steps 1-10 above with command, result, evidence) → Manual operator inline notes (step 11 items) → Accepted Exceptions (carry-over from Phase 24 baseline). Sign verdict at the end.
    13. **Force-add operator screenshots** to `visual-check/operator-*.png` via `git add -f` per Phase 24 plan-07 SUMMARY locked pattern (`visual-check/*.png` is `.gitignored`).
    14. **Final commit ladder**: each gap-fix gets its own atomic commit; the VISUAL-CHECK assembly is one commit; the metadata-close (update STATE.md, ROADMAP.md, REQUIREMENTS.md status table) is the last commit. Total expected: 1-3 fix commits + 1 evidence-assembly commit + 1 close commit.

    If ANY gate fails:
    - Diagnose root cause.
    - If it's a Phase-25-attributable defect, fix inline (small commit) and re-run the failing gate.
    - If it's a pre-existing baseline carry-over, document in Accepted Exceptions table — do NOT regress; do NOT chase.

    Phase 25 verdict criteria:
    - **PASS**: all 5 ROADMAP success criteria functionally verified; all 8 verification gates green; e2e + axe + Lighthouse all PASS; ≤3 small inline fix commits acceptable.
    - **FAIL**: any success criterion unverifiable; any baseline regression in test counts; any new axe blocking violation; Lighthouse delta beyond budget. Open gap-closure plan if needed.
  </how-to-verify>
  <resume-signal>Type "approved" with the verdict (PASS or FAIL), or describe specific gates that failed and how they were fixed.</resume-signal>
</task>

</tasks>

<verification>
1. Plan 01 verification: `cd backend && uv run pytest tests/test_migrations.py -k 0004` — 2 tests passing.
2. Plan 02 verification: `cd backend && uv run pytest tests/test_views_router.py` — 18+ tests passing.
3. Full backend: `cd backend && uv run pytest -x` — >= 683 / 0 / 0.
4. Plan 03-04 verification: `cd frontend && pnpm test --run` includes searchSchemas + skillsDetailRange.
5. Plan 05 verification: `pnpm test --run` includes savedViews + queries.savedViews.
6. Plan 06-10 verification: `pnpm test --run` includes all savedviews component specs.
7. Full frontend unit: `pnpm test --run` — final count >= 403 (was 353 at Phase 24 close; +~50 across all Wave 2-4 plans).
8. Plan 11 verification: `pnpm test:e2e` — all `v13-*.spec.ts` files green + extended `command-palette.spec.ts`.
9. axe-core: 0 NEW blocking violations attributable to Phase 25.
10. Lighthouse: 9/9 still PASS.
11. Visual matrix: 60+ frames; operator spot-check PASS.
12. `25-VISUAL-CHECK.md` exists with signed verdict.
</verification>

<success_criteria>
- All 5 ROADMAP Phase 25 success criteria functionally verified.
- 25-VISUAL-CHECK.md authored with operator verdict (PASS or FAIL).
- VIEW-01..09 + CMDK-01 + SHEL-06 (11 requirements) all marked Complete in REQUIREMENTS.md.
- Phase 25 entry in ROADMAP.md updated from `[ ]` to `[x]` with completion date and commit list.
- STATE.md updated to reflect Phase 25 close + Phase 26 readiness.
- v1.3 milestone progress: 2/5 phases complete.
</success_criteria>

<output>
After completion, create `.planning/phases/25-saved-views-backend-frontend/25-11-SUMMARY.md` AND `.planning/phases/25-saved-views-backend-frontend/25-VERIFICATION.md` documenting:
- Final gate matrix (test counts, exit codes per gate)
- Each ROADMAP success criterion with evidence file/line/screenshot link
- Accepted Exceptions carried over (and any new ones, if surfaced — should be zero)
- Inline operator notes (matches Phase 24 plan-07 SUMMARY's 9-item template)
- Phase 26 prep: any patterns / utilities / extracted helpers that Phase 26 will consume

Also update:
- `.planning/STATE.md` — Phase 25 complete, Phase 26 ready
- `.planning/ROADMAP.md` — Phase 25 row checked, milestone progress 2/5
- `.planning/REQUIREMENTS.md` — VIEW-01..09 + CMDK-01 + SHEL-06 all → Complete
</output>
