---
phase: 25-saved-views-backend-frontend
type: validation-architecture
status: draft
authoritative_source: 25-RESEARCH.md §Validation Architecture (lines 1006–1052)
references:
  - .planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
---

# Phase 25 — Validation Architecture

This document maps every Phase 25 behavior — locked invariant, REQUIREMENTS.md item, and ROADMAP success criterion — to the evidence source that proves it. It is the bridge between the plan-level `<verify>` blocks (automated, mechanical) and the operator close-gate (Plan 11 → `25-VISUAL-CHECK.md`).

Sourced from `25-RESEARCH.md §Validation Architecture`; this file extracts the per-plan and per-criterion mapping with explicit automated-vs-manual classification.

## 1. Coverage Model

Phase 25 splits validation into three concentric loops:

| Loop | Cadence | Authoritative file | Who runs it |
|------|---------|--------------------|-------------|
| Per-task verify | Each `<task>` close | The `<verify>` `<automated>` block inside each plan | Executor agent (autonomous) |
| Per-plan verify | Plan close (post-task) | The `<verification>` section at the bottom of each plan | Executor agent (autonomous) |
| Phase close-gate | After all Wave 1–5 plans land | Plan 11 + `25-VISUAL-CHECK.md` | Operator (manual sign-off after automated gates green) |

Plans 01–10 are **fully automatable** — every `<verify>` block in those plans wraps shell commands in `<automated>...</automated>` tags. Plan 11 mixes: its Task 1 and Task 2 verify blocks are `<automated>` (Playwright e2e + axe-core + visual capture commands), and its Task 3 is `checkpoint:human-verify` — operator-signed verdict in `25-VISUAL-CHECK.md`.

## 2. Test Framework Baseline

(Pulled from `25-RESEARCH.md` lines 1010–1019 — no framework installs required; everything below exists at Phase 24 close.)

| Property | Value |
|----------|-------|
| Backend test runner | `pytest 9.x` + `pytest-asyncio` |
| Backend fixtures | `backend/tests/conftest.py` — provides `client` async fixture + `async_session` |
| Frontend unit | `vitest 4.1.5` |
| Frontend e2e | `Playwright 1.59.1` |
| Accessibility | `@axe-core/playwright 4.11.3` |
| Visual capture | existing `v13-visual-capture.spec.ts` matrix (3 densities × 2 themes × N routes) |
| Lighthouse | `@lhci/cli` against `v13-lighthouserc.json` (3 URLs × 3 runs = 9 audits) |
| Python version | 3.13 via `uv run` (system Python is 3.11.7 per `STATE.md`) |

## 3. Plan-by-Plan Automated Coverage

Every plan's `<verify>` block has been wrapped in `<automated>` so the executor harness can collect machine-verifiable evidence without operator intervention. The table below summarizes what each plan automates.

| Plan | Wave | Automated evidence (what `<automated>` proves) | Source of truth |
|------|------|------------------------------------------------|-----------------|
| 01 — Saved view model + 0004 migration | 1 | `pytest tests/test_migrations.py -k 0004` (upgrade + downgrade reversible) + Python import smoke for `SavedView` + `SQLModel.metadata.tables['saved_views']` | Plan 01 Tasks 1–3 verify blocks |
| 02 — Schemas + router + CRUD tests | 1 | `pytest tests/test_views_router.py` (≥18 cases: 5 happy paths + UNIQUE conflict + 50-cap + route-optional filter + 404 + PATCH replace semantics) + router import smoke | Plan 02 Tasks 1–3 verify blocks |
| 03 — validateSearch on 5 non-skills routes | 2 | `pnpm tsc --noEmit` (routeTree.gen.ts regenerated) + `pnpm test --run` (existing 353+ vitest cases) + new `searchSchemas.test.ts` (6 routes × append-only schemaVersion assertions) | Plan 03 Tasks 1–2 verify blocks |
| 04 — validateSearch on /skills/$name + range | 2 | `pnpm tsc --noEmit` + `pnpm test --run` includes `skillsDetailRange.test.tsx` (≥7 cases: range default + deep-link override + schemaVersion stamp) | Plan 04 Tasks 1–3 verify blocks |
| 05 — API verbs + hooks + storage helpers | 3 | `pnpm tsc --noEmit` + `pnpm test --run src/lib/__tests__/savedViews.test.ts src/lib/__tests__/queries.savedViews.test.ts` (≥14 cases covering default pointer, pinned, recent FIFO + cap warning, hook fetch + invalidation) | Plan 05 Tasks 1–4 verify blocks |
| 06 — SavedViewMenu + SaveViewDialog + UnsavedPip + AppShell mount | 4 | `pnpm tsc --noEmit` + `pnpm lint` (testid registry green) + `pnpm test --run src/components/savedviews/__tests__` (≥12 cases across the 3 components) | Plan 06 Tasks 1–4 verify blocks |
| 07 — EditOrForkDialog + 3-branch wiring | 5 | `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test --run src/components/savedviews/__tests__/EditOrForkDialog.test.tsx` (≥5 cases covering each branch + null-loaded-view guard) | Plan 07 Tasks 1–3 verify blocks |
| 08 — CommandPalette Saved Views group | 5 | `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test --run src/components/ui/__tests__/CommandPalette.savedViews.test.tsx` (≥4 cases: ordering, empty, navigation, dynamic-route guard) | Plan 08 Tasks 1–2 verify blocks |
| 09 — Sidebar Pinned section | 5 | `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test --run src/components/savedviews/__tests__/PinnedViewsSection.test.tsx` (≥5 cases: empty, ids filter, navigation, active-state on full match, active-state negative) | Plan 09 Tasks 1–3 verify blocks |
| 10 — DefaultViewLoader + RecentStateTracker (AppShell side-effects) | 5 | `pnpm tsc --noEmit` + `pnpm test --run` includes `DefaultViewLoader.test.tsx` + `RecentStateTracker.test.tsx` (≥9 cases: empty-search default-apply, deep-link wins, one-shot per entry, in-scope filter, dedupe) | Plan 10 Tasks 1–3 verify blocks |
| 11 — e2e + axe + visual capture + operator close-gate | 6 | `pnpm test:e2e v13-saved-views.spec.ts` (≥9 e2e blocks covering ROADMAP success criteria 1–4 + cap warning); axe-core sweep on saved-views surfaces (0 NEW violations); Lighthouse 9/9 audits PASS against `v13-lighthouserc.json` | Plan 11 Tasks 1–2 verify blocks |

**Aggregate automated deltas at Phase 25 close (vs. Phase 24 baseline):**
- Backend pytest: 663 → ≥683 (+2 from migration tests in Plan 01, +18 from router tests in Plan 02).
- Frontend vitest: 353 → ≥403 (+~50 across Plans 03–10).
- Frontend e2e: existing v13-*.spec.ts + new `v13-saved-views.spec.ts` (≥9 blocks) + extensions to `v13-sidebar.spec.ts`, `v13-a11y.spec.ts`, `command-palette.spec.ts`, `v13-visual-capture.spec.ts`.
- Visual frames: 36 baseline → ~60 (+~24 across SavedViewMenu open / SaveViewDialog / EditOrForkDialog / sidebar pinned populated, each × 3 densities × 2 themes).

## 4. ROADMAP Success Criteria → Evidence Map

The five ROADMAP Phase 25 success criteria are the authoritative gate. Each maps to:
- **Automated source** — a specific test command from §3 above whose passing is necessary but not sufficient.
- **Manual source** — the operator-confirmed flow captured in `25-VISUAL-CHECK.md` (Plan 11 Task 3 deliverable) that proves end-to-end user experience.

| # | ROADMAP Success Criterion | Automated source(s) | Manual source (operator gate) |
|---|---------------------------|---------------------|-------------------------------|
| 1 | User saves the current filter combination on `/skills/$name` as a named view, navigates away, returns, and the view auto-loads as the per-route default | Plan 04's `skillsDetailRange.test.tsx` (range round-trip) + Plan 05's hook tests + Plan 06's `SavedViewMenu.test.tsx` (save dialog opens) + Plan 10's `DefaultViewLoader.test.tsx` (empty-search default-apply) + Plan 11 e2e `v13-saved-views.spec.ts` test block "saves a view + sets default + return-to-route applies default" | `25-VISUAL-CHECK.md` operator flow: `/skills/<name>` → SavedViewMenu → "Save current view…" → name → submit → Set as default → navigate to `/alerts` → navigate back → URL gains saved filters automatically; with explicit `?range=14d` deep-link wins |
| 2 | User modifies a loaded view; the EditOrForkDialog blocks silent overwrites; user picks save / fork / discard | Plan 07's `EditOrForkDialog.test.tsx` (each of the 3 branches asserted) + Plan 06's `UnsavedPip.test.tsx` (divergence detection) + Plan 11 e2e block "edit-vs-fork dialog appears + each branch acts" | `25-VISUAL-CHECK.md` operator flow: load a view, modify a filter, see UnsavedPip light up, open menu, click "Edit '<name>'…", see 3-button dialog, exercise each of save-changes / save-as-fork / discard |
| 3 | Cmd+K Saved Views group lists views; current-route first; selection navigates with full state restore | Plan 08's `CommandPalette.savedViews.test.tsx` (ordering, empty state, navigation, dynamic-route guard) + Plan 11 extension to `command-palette.spec.ts` (Saved Views group e2e + ordering) | `25-VISUAL-CHECK.md` operator flow: from `/cost`, Cmd+K → "Saved Views" group lists the seeded view; type partial name → filters; Enter → navigates to `/cost?<state>`; switching to `/skills/<name>` then Cmd+K shows cross-route views with current-route first |
| 4 | Pinned views appear in the sidebar; one-click navigation; active accent when both pathname AND search match | Plan 09's `PinnedViewsSection.test.tsx` (5+ cases: pinned-only render, navigation, active-state positive + negative, dynamic-segment guard) + Plan 11 extension to `v13-sidebar.spec.ts` ("Pinned section exists between Operate and Configure" + pin/unpin + active-state) | `25-VISUAL-CHECK.md` operator flow: pin a view from SavedViewMenu → reload → see view in Sidebar Pinned section between Operate and Configure; navigate to another route → no active accent; navigate to the pinned view's route with matching search → active accent lights |
| 5 | Backend CRUD round-trip via curl evidence; all locked invariants honored (UNIQUE constraint, 50-cap, append-only schemaVersion, opaque state_json) | Plan 01's `test_migrations.py -k 0004` (upgrade + downgrade) + Plan 02's `test_views_router.py` (≥18 cases including UNIQUE conflict, 50-cap, optional `route=` filter, 404, PATCH replace semantics) + Plan 03's `searchSchemas.test.ts` (append-only schemaVersion proof on all 6 routes) + Plan 11 backend gate (`uv run pytest` ≥683 / 0 / 0) | `25-VISUAL-CHECK.md` operator flow: `cmc start` → curl all 5 endpoints with happy paths + duplicate-name (409) + 51st-insert (400 cap exceeded); inspect `cmc.savedView.recent.*` localStorage entries for FIFO behavior; sign verdict |

## 5. Locked Invariants — Carrier Tests

These cross-phase invariants must not regress; each has an explicit automated guard.

| Invariant | Carrier test | Plan that owns the guard |
|-----------|--------------|--------------------------|
| URL contract append-only (no removed or renamed search params) | `backend/tests/test_url_contract.py` (existing 2 tests must stay green) + new `searchSchemas.test.ts` assertions | Plan 03 (new vitest) + Plan 11 (backend gate runs the existing url_contract suite) |
| Density / z-index / portal-containment Phase 24 locks | Existing Phase 24 vitest + e2e suites (e.g. `portal-containment.spec.ts`) — must stay green | Plan 11 close-gate (full `pnpm test:e2e`) |
| testid registry exhaustive (ESLint `cmc/testid-registry-only`) | `pnpm lint` exit 0 — registry MUST list every new Phase 25 testid before commit | Plans 06–10 verify blocks + Plan 11 close-gate |
| 50-cap on saved views (per-route) | `test_views_router.py::test_post_returns_400_when_cap_exceeded` | Plan 02 |
| UNIQUE (route, name) enforcement | `test_views_router.py::test_post_returns_409_on_duplicate_name` | Plan 02 |
| AlertDialog 2-button primitive preserved (Phase 24 lock) | Plan 07 ships `EditOrForkDialog` as a NEW Radix Dialog component — no AlertDialog edits; verified by file diff during execution | Plan 07 (component scope) |
| Deep-link wins over per-route default (Pitfall 8) | `DefaultViewLoader.test.tsx` case: non-empty search → no navigate call | Plan 10 |
| schemaVersion stripped before URL-state divergence comparison (Pitfall 7) | `UnsavedPip.test.tsx` case: stable-stringify ignores `schemaVersion` | Plan 06 |
| state_json wholesale replacement on PATCH (no deep-merge) | `test_views_router.py::test_patch_replaces_state_json_wholesale` | Plan 02 |

## 6. Sampling Rates (Mirrors RESEARCH §Sampling Rate)

- **Per task commit:** `cd backend && uv run pytest tests/test_views_router.py tests/test_migrations.py -x` (~3–5s) + `cd frontend && pnpm test --run src/components/savedviews src/lib/__tests__/savedViews.test.ts` (~5s).
- **Per wave merge:** full backend pytest + full frontend vitest + targeted e2e specs (`v13-saved-views.spec.ts`, extensions to `command-palette.spec.ts` / `v13-sidebar.spec.ts`).
- **Phase gate (Plan 11):** full backend pytest + full frontend vitest + full Playwright e2e + axe-core sweep + Lighthouse 9/9 + visual matrix spot-check + `25-VISUAL-CHECK.md` operator verdict.

## 7. Manual Operator Gates — Why They Exist

Three behaviors resist full automation and therefore require operator confirmation in `25-VISUAL-CHECK.md`:

1. **Visual fidelity** — screenshot diffs surface pixel-level regressions only when a human compares against the v1.3 design language. Captured via `v13-visual-capture.spec.ts` + force-added `visual-check/operator-*.png`.
2. **Density × theme cascade through new chrome** — the new SavedViewMenu, SaveViewDialog, EditOrForkDialog, UnsavedPip, and PinnedViewsSection must inherit Phase 24's density tokens and theme classes without override. Operator confirms this across 3 densities × 2 themes via the visual matrix.
3. **End-to-end ROADMAP success criteria** — automated e2e proves the wiring; operator confirms the *experience* (e.g., that the auto-applied default feels natural, that the 3-button dialog reads correctly, that the pinned section's slot between Operate and Configure feels right).

If any operator gate fails, Plan 11's close-gate ladder routes to either an inline fix (≤3 small commits) or a gap-closure plan via `/gsd:plan-phase --gaps`.

## 8. Wave 0 Gap Status

(Mirrors RESEARCH §Wave 0 Gaps — items the executor MUST create before tests can run.)

- [ ] `backend/tests/test_views_router.py` — NEW. Owned by Plan 02 Task 3.
- [ ] `backend/tests/conftest.py` — EXTEND with `make_saved_view_row` factory. Owned by Plan 02 Task 3.
- [ ] `backend/tests/test_migrations.py` — EXTEND with `test_0004_upgrade_from_0003` + `test_0004_downgrade_to_0003`. Owned by Plan 01 Task 3.
- [ ] `frontend/tests/e2e/v13-saved-views.spec.ts` — NEW. Owned by Plan 11 Task 1.
- [ ] `frontend/src/components/savedviews/__tests__/` — NEW directory. Owned by Plans 06–10.
- [ ] `frontend/src/lib/__tests__/savedViews.test.ts` — NEW. Owned by Plan 05 Task 4.

No framework installs required at any wave — the Phase 24 close baseline is sufficient.

## 9. Verdict Path

The Phase 25 verdict is set in `25-VISUAL-CHECK.md` (Plan 11 Task 3 deliverable) after the operator confirms:

- All 11 automated gate commands listed in Plan 11 Task 3 exit 0.
- All 5 ROADMAP success criteria observable via the manual flow column in §4 above.
- 0 NEW axe-core blocking violations attributable to Phase 25.
- Lighthouse 9/9 PASS with delta within the v13 budget.
- All testids in `docs/testid-registry.md` used in tree (ESLint clean).

**PASS** — phase closes, ROADMAP row checked, REQUIREMENTS.md status table updated (VIEW-01..09 + CMDK-01 + SHEL-06 → Complete), STATE.md advances to Phase 26 readiness.

**FAIL** — gap analysis in `25-VERIFICATION.md`, route through `/gsd:plan-phase --gaps`, do not promote.
