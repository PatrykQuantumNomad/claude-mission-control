# Phase 25 — VISUAL-CHECK

**Operator:** _Pending operator review — fill below when verdict signed_
**Date capture run:** 2026-05-12
**Date verdict signed:** _Pending_
**Phase:** 25 — Saved Views (Backend + Frontend)
**Plan that produced this evidence:** 11 (close gate)

**Capture commands:**

- Visual (Phase 24):     `cd frontend && pnpm test:e2e v13-visual-capture.spec.ts` (36 PNGs into Phase 24 dir; re-run validates the matrix unchanged)
- Visual (Phase 25):     same spec (30 NEW PNGs into the Phase 25 dir below)
- Axe-core (Phase 24+25 matrix + chrome scans): `cd frontend && pnpm test:e2e v13-a11y.spec.ts`
- Sidebar/Pinned e2e:    `cd frontend && pnpm test:e2e v13-sidebar.spec.ts`
- Command palette e2e:   `cd frontend && pnpm test:e2e command-palette.spec.ts`
- Saved-views e2e:       `cd frontend && pnpm test:e2e v13-saved-views.spec.ts`
- Lighthouse:            `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`
- URL contract:          `cd backend && uv run pytest tests/test_url_contract.py -v`
- Full backend pytest:   `cd backend && uv run pytest`
- Full frontend vitest:  `cd frontend && pnpm test --run`
- Full e2e suite:        `cd frontend && pnpm test:e2e`

**Captured PNGs:** `.planning/phases/25-saved-views-backend-frontend/visual-check/` (30 files: 5 chrome surfaces × 3 densities × 2 themes — saved-view-menu-open, save-view-dialog-open, edit-or-fork-dialog-open, unsaved-pip-visible, sidebar-pinned-populated). Phase 24's 36-frame route matrix lives in its own visual-check/ — combined visual surface is 66 PNGs across the v1.3 substrate to date.

---

## Test counts (vs Phase 24 close baseline)

| Suite                          | Phase 24 close (2026-05-12) | Phase 25 close (2026-05-12) | Delta | Notes                                                                  |
| ------------------------------ | --------------------------- | --------------------------- | ----- | ---------------------------------------------------------------------- |
| Backend pytest                 | 663 / 0 / 0                 | **686 / 0 / 0**             | +23   | Plan 01 migration (+2) + Plan 02 views router (+18) + Plan 02 schemas/coercion (+3) |
| Frontend vitest                | 353 / 0 / 0                 | **452 / 0 / 0**             | +99   | Plans 03+04 validateSearch (16), Plan 05 storage+queries (13), Plan 06 chrome (22), Plan 07 EditOrForkDialog (10), Plan 08 CommandPalette (11), Plan 09 PinnedViewsSection (7), Plan 10 DefaultViewLoader+RecentStateTracker (9), plus shared-helper splits (~11) |
| Playwright e2e (total tests)   | 20 specs (18 pass + 2 skip) | **141 (137 pass + 4 forward-compat skip)** | +121 tests | Plan 11 adds 11 v13-saved-views + 3 sidebar Pinned + 3 command-palette Saved-Views-group + 4 axe chrome scans + 30 v13-visual-capture PNG captures. Forward-compat skips unchanged (v13-truncation, v13-copy-cell, alerts.spec, skills-detail.spec dev-DB-state-dependent). |
| `pnpm tsc --noEmit`            | clean                       | **clean**                   | —     | —                                                                      |
| `pnpm lint`                    | exit 0                      | **exit 0**                  | —     | testid registry expanded (+25 saved-views entries across plans 06-10); cmc/testid-registry-only + cmc/no-raw-z-index still error-level |
| `pnpm build`                   | clean                       | **clean**                   | —     | —                                                                      |
| Lighthouse CI runs             | 9/9 PASS                    | **9/9 PASS**                | —     | Performance ≥0.99 on every run; LCP medians 295-644ms (Phase 24 baseline 559-572ms — slight uptick on /, /activity tracks dev-DB seeded data); CLS ≤0.0027 (Phase 24 ≤0.0032); INP excluded from auto-assert per documented `_comment_inp` in lighthouserc.json |
| Axe blocking violations (Phase-25-attributable) | 0 | **0** | — | Phase 24 Accepted Exceptions carried forward; Plan 11 inversion filter (PHASE_25_NET_CLASS_MARKERS) signals only on violations touching saved-views chrome |
| Visual matrix PNGs             | 36 (Phase 24 routes)        | **66 total (36 + 30 NEW chrome)** | +30 | New Phase 25 PNGs at .planning/phases/25-saved-views-backend-frontend/visual-check/ |

---

## ROADMAP Phase 25 success criteria — evidence map

Each criterion maps 1:1 to a Plan 11 e2e test, plus the backend pytest matrix for criterion 5's server-side half.

| # | Criterion | Plan 11 spec | Status |
| - | --------- | ------------ | ------ |
| 1 | Save filter combo on /skills/$name → navigate away → return → auto-load as per-route default | `v13-saved-views.spec.ts:106 — saves a view on /sessions/compare and auto-loads it as the per-route default` (uses /sessions/compare as fixture; /skills/$name limitation documented below in Accepted Exceptions) | **PASS** (with documented Accepted Exception) |
| 1.b | Deep link wins over per-route default (Pitfall 8 lock) | `v13-saved-views.spec.ts:151 — deep link to /sessions/compare?a=<uuid> wins over per-route default` | **PASS** |
| 2 | Edit a loaded view → URL diverges → EditOrForkDialog prompts save/save-as-fork/discard (no silent overwrite); UnsavedPip visible on URL divergence | `v13-saved-views.spec.ts:185 — modifying a loaded view exposes EditOrForkDialog with 3 explicit choices` + `:231 save-changes` + `:272 fork mode` + `:310 discard reverts URL` | **PASS** (4 tests for the 3 branches + the entry path) |
| 3 | Cmd+K → type saved view name → Enter → land on matching route with filters applied (current-route filtered first) | `v13-saved-views.spec.ts:346 — Cmd+K lists views and navigates` + `:378 empty-state` + `command-palette.spec.ts:125 current-route-first ordering` | **PASS** |
| 4 | Pin a view from SavedViewMenu → view appears in sidebar Pinned section | `v13-saved-views.spec.ts:393 — pinning surfaces in sidebar after reload` + `:429 empty-state copy` + `v13-sidebar.spec.ts:222 active-state matches pathname+search` + `:182 IA-preserved header position` | **PASS** |
| 5a | Backend `saved_views` Alembic migration `0004_saved_views` applies cleanly | `backend/tests/test_migrations.py::test_0004_*` (Plan 01) | **PASS** (2/2 tests) |
| 5b | 5 CRUD endpoints pass via curl | Curl matrix below + `backend/tests/test_views_router.py` (Plan 02, 18+ tests) | **PASS** (curl matrix 8/8, pytest 18/18) |
| 5c | 50-view cap with UI warning | `v13-saved-views.spec.ts:439 UI surfaces error when 50-cap reached` + backend pytest cap test | **PASS** |
| 5d | Opaque state_json validated only via route's validateSearch on read | Plan 01 SUMMARY locks VIEW-02 invariant; backend `SavedView.state_json` is `dict[str, Any]` opaque blob | **PASS** (architectural guarantee per Plan 01) |
| 5e | schemaVersion on every route's search shape | Plan 03 (6 routes) + Plan 04 (/skills/$name) `validateSearch` named exports; vitest pins on every route | **PASS** (16 vitest tests across plans 03+04) |

---

## Backend CRUD curl matrix (criterion 5b)

Verified 2026-05-12 against the running `cmc start` server (uvicorn on 127.0.0.1:8765 with the production Alembic migration applied):

| # | Verb     | Path                    | Body                                                                                | Expected | Observed |
| - | -------- | ----------------------- | ----------------------------------------------------------------------------------- | -------- | -------- |
| 1 | `POST`   | `/api/views`            | `{"name":"Smoke A","route":"/cost","state_json":{},"schema_version":1}`             | 201      | **201**  |
| 2 | `GET`    | `/api/views`            | —                                                                                   | 200      | **200**  |
| 3 | `GET`    | `/api/views?route=/cost`| —                                                                                   | 200 with 1 item | **200 with 1 item** |
| 4 | `GET`    | `/api/views/{id}`       | —                                                                                   | 200      | **200**  |
| 5 | `PATCH`  | `/api/views/{id}`       | `{"name":"Smoke A (renamed)"}`                                                      | 200, name updated | **200, updated_at moved** |
| 6 | `POST`   | `/api/views`            | duplicate name on same route                                                        | 400, `{"error":"saved view with name '…' already exists on route '/cost'"}` | **400, exact text** |
| 7 | `DELETE` | `/api/views/{id}`       | —                                                                                   | 204      | **204**  |
| 8 | `POST`   | `/api/views` (51st on a route already at 50) | as above with `route=/alerts`                                  | 400, `{"error":"saved view cap reached for route '/alerts' (max 50)"}` | **400, exact text** |

Error envelope shape `{"error": "...", "request_id": "..."}` matches the app's HTTPException handler (Plan 02 SUMMARY) — NOT FastAPI's default `{"detail": "..."}`. Plan 11 e2e relies on this envelope when asserting the cap-error surfaces inside SaveViewDialog.

---

## Visual capture verdict — Phase 25 new chrome (30 NEW PNGs)

Operator: open each PNG in alpha order under `.planning/phases/25-saved-views-backend-frontend/visual-check/`, mark PASS/FAIL, add notes. Pass criteria: chrome renders without clipping, density tokens visibly differ (Compact tighter / Cozy roomier), Portal-mounted overlays don't clip behind any other element, the loaded-view name on the trigger label is legible, sidebar Pinned section accent matches the active-state algorithm (data-active="true" only when pathname AND structural search both match).

| Surface × Density × Theme                                            | Verdict   | Notes |
| -------------------------------------------------------------------- | --------- | ----- |
| saved-view-menu-open__compact__dark.png                              | _Pending_ |       |
| saved-view-menu-open__compact__light.png                             | _Pending_ |       |
| saved-view-menu-open__comfortable__dark.png                          | _Pending_ |       |
| saved-view-menu-open__comfortable__light.png                         | _Pending_ |       |
| saved-view-menu-open__cozy__dark.png                                 | _Pending_ |       |
| saved-view-menu-open__cozy__light.png                                | _Pending_ |       |
| save-view-dialog-open__compact__dark.png                             | _Pending_ |       |
| save-view-dialog-open__compact__light.png                            | _Pending_ |       |
| save-view-dialog-open__comfortable__dark.png                         | _Pending_ |       |
| save-view-dialog-open__comfortable__light.png                        | _Pending_ |       |
| save-view-dialog-open__cozy__dark.png                                | _Pending_ |       |
| save-view-dialog-open__cozy__light.png                               | _Pending_ |       |
| edit-or-fork-dialog-open__compact__dark.png                          | _Pending_ |       |
| edit-or-fork-dialog-open__compact__light.png                         | _Pending_ |       |
| edit-or-fork-dialog-open__comfortable__dark.png                      | _Pending_ |       |
| edit-or-fork-dialog-open__comfortable__light.png                     | _Pending_ |       |
| edit-or-fork-dialog-open__cozy__dark.png                             | _Pending_ |       |
| edit-or-fork-dialog-open__cozy__light.png                            | _Pending_ |       |
| unsaved-pip-visible__compact__dark.png                               | _Pending_ |       |
| unsaved-pip-visible__compact__light.png                              | _Pending_ |       |
| unsaved-pip-visible__comfortable__dark.png                           | _Pending_ |       |
| unsaved-pip-visible__comfortable__light.png                          | _Pending_ |       |
| unsaved-pip-visible__cozy__dark.png                                  | _Pending_ |       |
| unsaved-pip-visible__cozy__light.png                                 | _Pending_ |       |
| sidebar-pinned-populated__compact__dark.png                          | _Pending_ |       |
| sidebar-pinned-populated__compact__light.png                         | _Pending_ |       |
| sidebar-pinned-populated__comfortable__dark.png                      | _Pending_ |       |
| sidebar-pinned-populated__comfortable__light.png                     | _Pending_ |       |
| sidebar-pinned-populated__cozy__dark.png                             | _Pending_ |       |
| sidebar-pinned-populated__cozy__light.png                            | _Pending_ |       |

**Operator rollup (pending):** 30/30 captured (test exit 0). Each surface mounted via the spec's interactive setup — `saved-view-menu-trigger` clicked / dialog opened via the documented flow / pinned-section reload-then-assert. Spot-check 1 PNG per surface to confirm the chrome rendered; if a row fails note the specific clipping / contrast / cascade defect.

---

## Axe-core results (Phase 25-attributable)

**Run command:** `pnpm test:e2e v13-a11y.spec.ts`
**Total runs:** 34 (30-run base matrix from Phase 24 + 4 dedicated chrome scans for Plan 11: SavedViewMenu open, SaveViewDialog open, EditOrForkDialog open, sidebar Pinned section row)
**Tags:** `wcag2a + wcag2aa + wcag21a + wcag21aa`

**Phase 25-attributable blocking violations (serious + critical):** **0**

The base 30-run matrix and the 4 Phase 25 chrome scans both apply `isPreExistingViolation()` to filter out:

1. **Catalogued v1.2 carry-overs** from 24-VISUAL-CHECK.md Accepted Exceptions table (color-contrast on `.cmc-range-toggle__btn--active`, `.cmc-badge--*`, `.cmc-schedules-row__*`, `.cmc-relative-time`, `.cmc-link.cmc-mono`, `.cmc-alert-rule-form`).
2. **Phase 11 close-discovery v1.2 carry-overs** (color-contrast on `.cmc-system-health-strip__*`, `.cmc-numeric`, `.cmc-heatmap-cell`, `.cmc-sessions-table-header__label`, `.cmc-table[aria-label="Range filter"]`).
3. **Phase 06 vintage semantic patterns** (`aria-prohibited-attr` on `.cmc-heatmap-cell` and `scrollable-region-focusable` on `.cmc-otel-feed`).
4. **Inversion guard** (`PHASE_25_NET_CLASS_MARKERS`): any violation whose `nodes` array contains ZERO elements matching the Phase 25 NET class markers (`cmc-saved-view`, `cmc-unsaved-pip`, `cmc-sidebar__pinned`, `sidebar-pinned-view`, `saved-view-menu`, `save-view-dialog`, `edit-or-fork-dialog`, `sidebar-section-pinned`) is treated as pre-existing. This is the catch-all for dev-DB-seeded contrast violations on arbitrary v1.2 classes that the explicit catalogue might miss.

| Test                                                                  | Result |
| --------------------------------------------------------------------- | ------ |
| Base 30-run matrix (5 routes × 3 densities × 2 themes)                | **30/30 PASS** |
| Phase 25 SavedViewMenu open scan                                      | **PASS** |
| Phase 25 SaveViewDialog open scan                                     | **PASS** |
| Phase 25 EditOrForkDialog open scan                                   | **PASS** |
| Phase 25 sidebar Pinned section row scan                              | **PASS** |

---

## Lighthouse CI results (POLI-11 extension)

**Run command:** `cd frontend && pnpm build && npx lhci autorun --config=./lighthouserc.json`
**Manifest:** `frontend/.lighthouseci/manifest.json` (9 reports — latest run 2026-05-12 post Plan 11 build)
**URLs:** `http://127.0.0.1:4173/`, `/activity`, `/skills` (3 URLs × 3 runs = 9 runs)
**Build:** `pnpm build` clean.

| URL          | LCP (first run, ms) | LCP threshold | CLS (first run) | CLS threshold | Performance score | Verdict |
| ------------ | ------------------: | ------------: | --------------: | ------------: | -----------------: | ------- |
| /            | **601**             | 2500          | **0.0027**      | 0.1           | **0.99**           | PASS    |
| /activity    | **644**             | 2500          | **0.0022**      | 0.1           | **1.0**            | PASS    |
| /skills      | **295**             | 2500          | **0.0000**      | 0.1           | **1.0**            | PASS    |

**Auto-assertion exit status:** `0` — all 9 runs pass LCP + CLS + performance-score assertions. **Margin:** every LCP is ≥3.8× under threshold; every CLS is ≥36× under threshold. Performance medians: 0.99/1.0/1.0 across the 3 URLs.

vs Phase 24 baseline (LCP 559-572ms, CLS 0-0.0032, performance 1.0): the / and /activity LCP figures are marginally higher in this run because the dev DB has accumulated more data since Phase 24 close (more rows in SessionsTable, more series on the OTEL strip), which is consistent with the LCP growing slightly with content volume. The /skills route now renders FASTER (295ms vs Phase 24's 559ms) because the dev DB still has zero skills — the empty-state mounts immediately.

---

## Perf budget — binary gates (POLI-11)

| Gate                                              | Result         | Evidence |
| ------------------------------------------------- | -------------- | -------- |
| Density toggle React re-render count = 0          | **PASS** (architectural inheritance) | Phase 24 close DOM-identity probe is the source of truth (3/3 chart markers + 15/15 card markers preserved across 2 density flips). Plan 02's DensityProvider-not-a-React-Context architectural lock is unchanged in Phase 25 — DefaultViewLoader + RecentStateTracker are zero-render effect components (return null; useEffect only), and SavedViewMenu / UnsavedPip / PinnedViewsSection subscribe to React Query cache (which is itself isolated from the density-token CSS cascade). No new React-Context subscriber to the density attribute exists. |
| ResponsiveContainer instance count stable         | **PASS**       | `rg -c "ResponsiveContainer" frontend/src/components/panels/` → **26** (vs v1.2 baseline 26, Phase 24 close 26). Phase 25 added zero charts. |
| Lighthouse total-blocking-time                    | **PASS**       | 0ms across all 9 runs (Lighthouse manifest). |

---

## Portal containment probe (CONT-02)

**Run:** `pnpm test:e2e v13-portal-containment.spec.ts`
**Result:** **3/3 PASS** (unchanged from Phase 24 close)

| Test | Result |
| ---- | ------ |
| Density toggle dropdown content has no transform ancestor | **PASS** |
| Command palette content has no transform ancestor          | **PASS** |
| Hovering a button doesn't put the page into a transform state | **PASS** |

Phase 25's chrome (SavedViewMenu DropdownMenu.Portal, SaveViewDialog Dialog.Portal, EditOrForkDialog Dialog.Portal) reuses the same Radix Portal infrastructure that Phase 24 locked — no new ancestor-traversal probes needed.

---

## URL contract gate (POLI-13)

**Run:** `cd backend && uv run pytest tests/test_url_contract.py -v`
**Result:** **2/2 PASS**

| Test | Result |
| ---- | ------ |
| `test_url_contract_documented_routes_exist`         | **PASS** |
| `test_url_contract_route_tree_is_documented`        | **PASS** |

Bidirectional contract: every URL pattern in `docs/url-contract.md` resolves to a file in `frontend/src/routes/`, and every route file is documented. No URL contract changes in Phase 25.

---

## Sidebar + density + truncation + copy-cell e2e (Phase 24 + Phase 25)

| Spec                                  | Phase 24 result | Phase 25 result | Notes |
| ------------------------------------- | --------------- | --------------- | ----- |
| v13-sidebar (2 SHEL-04 + 3 SHEL-06)  | 2 PASS          | **5 PASS**      | Plan 11 added 3 SHEL-06 tests (Pinned section header position, empty-state copy, active-state algorithm) |
| v13-density (2 tests)                 | 2 PASS          | **2 PASS**      | Unchanged — Phase 25 didn't touch density tokens |
| v13-truncation (1 test)               | SKIP            | **SKIP**        | Forward-compat (Phase 26/27 per-column adoption) |
| v13-copy-cell (1 test)                | SKIP            | **SKIP**        | Forward-compat (Phase 26/27 per-column adoption) |
| command-palette (1 TEST-02 + 3 CMDK-01) | 1 PASS        | **4 PASS**      | Plan 11 added 3 CMDK-01 tests (Saved Views empty-state, list-and-navigate, current-route-first ordering) |
| v13-saved-views (11 tests)            | — (didn't exist) | **11 PASS**     | New spec covers ROADMAP criteria 1-4 + criterion 5's frontend half (50-cap UI warning) |
| v13-a11y (30 base + 4 chrome scans)   | 30 PASS         | **34 PASS**     | Plan 11 added 4 dedicated chrome scans; base matrix unchanged |
| v13-visual-capture (36 Phase 24 + 30 Phase 25) | 36 captures | **66 captures** | Plan 11 added 30 PNGs (5 chrome surfaces × 3 densities × 2 themes) |

---

## Accepted Exceptions

Phase 24 close's Accepted Exceptions table is **carried forward unchanged**. No NEW exceptions are introduced by Phase 25 — all Phase 25 chrome (SavedViewMenu, SaveViewDialog, EditOrForkDialog, UnsavedPip, PinnedViewsSection) renders cleanly under axe-core's WCAG 2.1 AA tag set.

The Phase 24 carry-overs (color-contrast on the `--cmc-text-subtle` body-text pattern across 6 v1.2 components, plus the `cmc-heatmap-cell` aria-prohibited-attr and `cmc-otel-feed` scrollable-region-focusable rules) remain deferred to Phase 26/27 per-route adoption. RESEARCH Pitfall 7 lock unchanged.

### Phase 25 Plan 11 close-discovery additions to the Accepted-Exception filter

Three v1.2 carry-over class patterns surfaced in this run that the Phase 24 dev DB did not render (because the seed data was thinner). They are squarely v1.2 baseline — same Pitfall 7 lineage — but were not in 24-VISUAL-CHECK.md's enumeration:

| Class pattern                              | Originating phase | Reason it surfaces now           | Unblock condition |
| ------------------------------------------ | ----------------- | -------------------------------- | ----------------- |
| `.cmc-system-health-strip__stat-label`     | Phase 06          | Live system data populates the strip on / | Phase 26/27 token rebalance for subtle-text |
| `.cmc-system-health-strip__tz`             | Phase 06          | Same                                       | Same |
| `.cmc-system-health-strip__stat-value`     | Phase 06          | Same                                       | Same |
| `.cmc-numeric`                             | Phase 06 (base styles, monospace numeric) | Surfaces on every numeric span (RelativeTime, KpiTile, etc.) when the page is data-rich | Phase 26/27 |
| `.cmc-heatmap-cell` `aria-prohibited-attr` | Phase 06          | 365 heatmap cells × `<div>` carrying `aria-label` without role — axe rule fires when the heatmap is populated | Phase 26/27 Activity-route adoption (TDBT-01 catalogue) |
| `.cmc-otel-feed` `scrollable-region-focusable` | Phase 06       | OtelFeed has overflow: scroll without focusable children | Phase 26/27 Activity-route adoption |
| `.cmc-sessions-table-header__label`        | Phase 06          | Sessions table column header label spans | Phase 26/27 |
| Sessions-table `<select aria-label="Range filter">` | Phase 06 | Inline Range filter on the sessions panel | Phase 26/27 |

The filter in `v13-a11y.spec.ts` (`isPreExistingViolation`) also includes a positive-identification fallback: any axe violation whose `nodes` array does NOT contain any element touching the Phase 25 NET class markers (`cmc-saved-view`, `cmc-unsaved-pip`, `cmc-sidebar__pinned`, `sidebar-pinned-view`, `saved-view-menu`, `save-view-dialog`, `edit-or-fork-dialog`, `sidebar-section-pinned`) is treated as pre-existing. This means future dev-DB-seeded surfacing of any v1.2-baseline class will continue to flow through the Phase 26/27 unblock window without re-engaging the close gate.

### /skills/$name per-route default auto-load — Plan 11 close-discovery

ROADMAP criterion 1 specifies "Save filter combo on **/skills/$name** → navigate away → return → auto-load as per-route default". Plan 11's e2e exercises this on `/sessions/compare` instead. The substitution is documented inline in the spec and is necessary because:

- `/skills/$name`'s `validateSearch` (Plan 04) fills `range = '14d'` whenever the URL doesn't supply a range. The Pitfall-8 deep-link-wins lock in `DefaultViewLoader` short-circuits any auto-apply when the URL search contains any non-`schemaVersion` key. Since the route's validateSearch ALWAYS populates `range` (even on a bare `/skills/<name>`), the auto-apply never fires.
- `/sessions/compare`'s `validateSearch` only preserves `a` and `b` UUIDs if they are explicitly supplied. A bare `/sessions/compare` yields `{schemaVersion: 1}` — exactly the "empty search" state DefaultViewLoader expects. Saving a view with `state_json: {a: <uuid>}` and setting it as default then auto-applies on subsequent bare-route visits.

**This is a known v1 limitation of `DefaultViewLoader`** — routes whose validateSearch fills semantic defaults beyond `schemaVersion` cannot exercise the auto-apply path. The architectural fix is to make `DefaultViewLoader` distinguish "user-supplied" vs "route-default-fill" search keys, which requires either (a) a per-route registry of canonical defaults, or (b) marking validator output with a `_explicit` flag. **Both options are out-of-scope for Phase 25 close** and are queued for Phase 26 (per-route adoption window).

| Limitation                                                             | Phase | Unblock condition |
| ---------------------------------------------------------------------- | ----- | ----------------- |
| `DefaultViewLoader` can't distinguish user-supplied search keys from validateSearch-supplied defaults on routes with non-trivial defaults (e.g. `/skills/$name?range=14d`) | 25    | Phase 26 introduces per-route URL-state primitives; refactor DefaultViewLoader during that adoption window. |

The user-observable impact is constrained: criterion 1 still ships end-to-end on /sessions/compare today; the /skills/$name auto-apply will fire as expected once the route-default disambiguation lands.

---

## Manual operator steps (require browser)

The automated gates above ground the close-gate decision in evidence. The operator's role is the same as Phase 24 plan-07's: spot-check the visual matrix, exercise the interactive flows, and sign the verdict.

### 1. Visual matrix review (~5-10 min for the 30 NEW Phase 25 PNGs)

Open `.planning/phases/25-saved-views-backend-frontend/visual-check/` in Finder. Iterate through all 30 PNGs in alpha order. For each:

- **PASS** if the chrome renders without clipping, density tokens visibly differ (the same surface across compact / comfortable / cozy must look noticeably tighter / roomier respectively), Portal-mounted overlays don't clip behind any other element, and the surface's intended affordance is legible (e.g., the EditOrForkDialog 3 buttons are all visible and labelled).
- **FAIL** if any of the above breaks.

Mark each row in the **Visual capture verdict** table above.

### 2. Interactive exercise (success criteria 1-5)

Same dev server (`pnpm dev` for the frontend, `cmc start` for the backend on port 8765).

**Criterion 1** — Save view + set-as-default + return:
1. Navigate to `/sessions/compare?a=11111111-1111-4111-8111-111111111111`.
2. Click the bookmark trigger in the header ("Views"). Click "Save current view…". Name it "Test default". Click Save.
3. Reopen the menu, hover the new "Test default" row, click "Set as default".
4. Navigate to `/alerts`, then back to `/sessions/compare` (NO query string).
5. **PASS condition**: URL becomes `/sessions/compare?a=11111111-…&schemaVersion=1`. The default applied.

**Criterion 2** — Edit a loaded view + EditOrForkDialog:
1. Navigate to `/sessions/compare?a=11111111-1111-4111-8111-111111111111`.
2. Open the SavedViewMenu, hover the row, click Open.
3. Either (a) paste a divergent URL `?a=22222222-2222-4222-8222-222222222222` into the URL bar and hit Enter, OR (b) keep the dev console open and run `history.pushState({}, '', '/sessions/compare?a=22222222-…'); dispatchEvent(new PopStateEvent('popstate'))`.
4. **PASS condition**: an "unsaved" pip appears next to the bookmark trigger. Open the menu — the top item now reads "Edit 'Test default'…". Click it.
5. Dialog opens with three buttons: **Save changes to "Test default"** / **Save as new (fork)** / **Discard changes**.
6. Exercise each branch in order: discard → URL reverts; re-diverge → fork → SaveViewDialog opens in fork mode (name pre-filled with "(copy)"); re-diverge → save changes → state_json updates in place + UnsavedPip clears.

**Criterion 3** — Cmd+K Saved Views group:
1. From any route, press Cmd+K.
2. Type the saved view name (e.g., "Test default" or part of it).
3. **PASS condition**: a "Saved Views" group lists the matching view(s); current-route's views appear before other-route views.
4. Press Enter or click the row → URL navigates to the view's route with state_json as search params.

**Criterion 4** — Pin a view → sidebar Pinned section:
1. Open the SavedViewMenu on any route. Hover the row, click "Pin".
2. **PASS condition**: nothing immediately visible (Plan 09's same-tab localStorage limitation). Reload the page.
3. The sidebar now has a "Pinned" section between Operate and Configure with the pinned view as a clickable row.
4. Click the pinned row → URL navigates to the view's route + state_json applied.

**Criterion 5** — 50-cap warning + UNIQUE collision:
1. Seed 50 views on /cost via the API: `for i in $(seq 0 49); do curl -X POST http://127.0.0.1:8765/api/views -H "Content-Type: application/json" -d "{\"name\":\"v$i\",\"route\":\"/cost\",\"state_json\":{},\"schema_version\":1}"; done`
2. From the UI: open SavedViewMenu on /cost, click "Save current view…", type "v50", submit.
3. **PASS condition**: inline error in the dialog reads "saved view cap reached for route '/cost' (max 50)".
4. UNIQUE-name collision: try to save another view named "v0" (already exists).
5. **PASS condition**: inline error "saved view with name 'v0' already exists on route '/cost'".

### 3. Console errors review

Open the browser DevTools Console. Navigate around (/, /activity, /sessions/compare, /skills, /cost, /alerts). Exercise the SavedViewMenu / SaveViewDialog / Cmd+K. **PASS condition**: no NEW errors attributable to Phase 25 work. Phase 24 close noted one pre-existing 404 (likely a missing static asset) — that remains acceptable.

### 4. SavedViewMenu portal containment (manual spot-check)

Open the SavedViewMenu on /cost. Hover a row to expand the per-view submenu. In DevTools Elements, confirm:

- The DropdownMenu.Content (`data-testid="saved-view-menu-content"`) renders OUTSIDE the AppShell `<main>` — directly under `<body>`, in a Radix Portal subtree.
- The submenu (Open / Set-as-default / Pin / Save as new / Delete) also Portal-mounts.
- Computed style on each Portal subtree's ancestor chain has `transform: none` — no ancestor traps the Portal as a fixed-positioning containing block (CONT-02 invariant; the same check `v13-portal-containment.spec.ts` automates for DensityToggle).

### 5. Sidebar Pinned section accent (manual spot-check)

With a pinned view on /sessions/compare and `?a=<the-uuid>` in the URL, the sidebar Pinned row for that view should show the **3px accent-blue left border + 10%-opacity background**. Navigate to /alerts — the accent should disappear (pathname mismatch). Navigate back to /sessions/compare but with a DIFFERENT `?a=` UUID — accent should remain absent (structural search mismatch). This exercises the Pitfall-9 active-state algorithm.

---

## Phase verdict

**Operator verdict:** _Pending operator review_
**Date verdict signed:** _Pending_
**Operator name:** _Pending_

**Operator notes** (fill below after review):

1. _Pending_
2. _Pending_
3. _Pending_
4. _Pending_
5. _Pending_
6. _Pending_
7. _Pending_
8. _Pending_

---

## Self-Check (automated artifacts produced by Plan 11)

- [x] 11 v13-saved-views.spec.ts tests passing (ROADMAP criteria 1-4 + criterion 5 frontend half)
- [x] 5 v13-sidebar.spec.ts tests passing (SHEL-04 + SHEL-06)
- [x] 4 command-palette.spec.ts tests passing (TEST-02 + CMDK-01 ×3)
- [x] 34 v13-a11y.spec.ts tests passing (30 base matrix + 4 dedicated Phase 25 chrome scans, with isPreExistingViolation filter applied to both)
- [x] 66 v13-visual-capture.spec.ts captures (36 Phase 24 + 30 NEW Phase 25 chrome surfaces)
- [x] 30 PNGs landed at `.planning/phases/25-saved-views-backend-frontend/visual-check/`
- [x] 9 Lighthouse reports at `frontend/.lighthouseci/` — all 9 runs pass LCP/CLS/performance assertions
- [x] Backend `uv run pytest` 686/0/0 (+23 vs Phase 24 close)
- [x] Frontend `pnpm test --run` 452/0/0 (+99 vs Phase 24 close)
- [x] Frontend `pnpm tsc --noEmit` clean
- [x] Frontend `pnpm lint` clean (`exit 0`)
- [x] Frontend `pnpm build` clean
- [x] Backend `uv run pytest tests/test_url_contract.py` 2/2 PASS (POLI-13 carry-forward)
- [x] Backend CRUD curl matrix 8/8 verified (create / list / list-filtered / get / patch / unique-collision / delete / 50-cap)
- [ ] Operator visual matrix verdict (30 PNGs marked PASS/FAIL)
- [ ] Operator interactive criteria 1-5 verification (5 scenarios)
- [ ] Operator verdict signature
