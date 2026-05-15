# URL contract

Every URL pattern in this document is preserved across phases. Breaking a pattern requires explicit migration planning + a deprecation phase. The `backend/tests/test_url_contract.py` pytest gate (Phase 24 plan 05) fails CI if a documented pattern is missing from `frontend/src/routes/`, or if a route file in `frontend/src/routes/` is not documented here.

Established: Phase 24 (POLI-13). Locked invariant from REQUIREMENTS.md milestone constraints: "Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are forbidden."

## Routes

| URL pattern         | Route file                       | Description                            | validateSearch shape |
|---------------------|----------------------------------|----------------------------------------|----------------------|
| `/`                 | `routes/index.tsx`               | Mission Control / Home                 | Phase 26 / TIME-01: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) |
| `/activity`         | `routes/activity.tsx`            | Activity heatmap + sessions list       | Phase 26 / TIME-01: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) |
| `/skills`           | `routes/skills.tsx`              | Skills registry                        | Phase 27 / SC#1: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`) |
| `/skills/$name`     | `routes/skills_.$name.tsx`       | Skill detail (per-skill panels)        | Phase 25 / VIEW-01: `range` PRESERVED (one of `7d`/`14d`/`30d`; defaults to `14d`). Phase 27 / SC#1 APPENDS `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`) |
| `/sessions/compare` | `routes/sessions_.compare.tsx`   | Session compare (TWO-arg required)     | `{ a: string, b: string }` (validated; v1.2 baseline). Phase 26 / TIME-01 adds `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined`) |
| `/cost`             | `routes/cost.tsx`                | Cost analytics                         | Phase 27 / SC#2: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`) |
| `/alerts`           | `routes/alerts.tsx`              | Alert rules + events                   | Phase 27 Plan 06: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`) |

## Stability rules

- **Adding a search param to an existing route is BACKWARDS-COMPATIBLE if and only if** the new param has a default value that reproduces the pre-change behavior. Rolling forward Phase 25 / 26 / 27 / 28 changes adhere to this rule.
- **Removing a search param requires a deprecation phase.** Telegram deep-links and browser bookmarks must continue to resolve.
- **Renaming a route file requires a phase-level migration plan + a redirect** from old to new (or graceful 404 with explanation). Forbidden as a silent rename.
- **`schemaVersion` field on every route's `validateSearch` shape (Phase 25)** — append-only schema evolution.

## Phase 24 effects on URL contract

- No new routes added; no `validateSearch` shapes changed. Phase 24 is shell + primitives + quality gates only.
- The `cmc.density`, `cmc.theme`, `cmc.sidebar.collapsed` keys are localStorage-only — they intentionally do NOT enter the URL.

## Phase 27 effects on URL contract

- **Append-only extension on `/skills`:** ACCEPTS `?time_from` + `?time_to` (Grafana-style tokens via shared `asTimeToken`) + `?compare_panels` (CSV via shared `asComparePanels`). Validator returns `undefined` for missing/invalid values (Pitfall 13 — per-route panel default `'14d'` is applied AT THE PANEL READ SITE via `useRouteRangeVocab('14d', snapToSkillRange)`, NOT in the validator). SCHEMA_VERSION stays at 1. No route rename.
- **Append-only extension on `/skills/$name` (LOAD-BEARING: Pitfall 2 LOCK):** The existing Phase 25 `?range=` first-class filter is PRESERVED (default `'14d'`, accepts `7d`/`14d`/`30d`). Phase 27 APPENDS `?time_from` + `?time_to` + `?compare_panels` as additional optional fields. Operator-locked precedence: when both `time_from` + `time_to` are present, the global picker WINS over the route-local `?range=`; when absent, the route-local `?range=` is used; final fallback is `'14d'`. Defense in depth: removing `?range=` from the validator is a regression (`test_url_contract.py` continues to enforce by-route documentation).
- **Append-only extension on `/cost` (SC#2):** ACCEPTS `?time_from` + `?time_to` (Grafana-style tokens via shared `asTimeToken`) + `?compare_panels` (CSV via shared `asComparePanels`). Validator returns `undefined` for missing/invalid values (Pitfall 13 — the per-panel default `'7d'` for CostByProjectCard is applied AT THE PANEL READ SITE via `useRouteRangeVocab('7d', snapToCostRange)`, NEVER in the validator). The v1.2 `RangeToggle persistKey='cost-by-project'` localStorage round-trip is REPLACED by URL state — reload preserves the choice via the URL, not via localStorage. SCHEMA_VERSION stays at 1. No route rename. **TIME-04 compare-overlay caveat:** the `CostByProjectCard` mounts `<CompareToggle panelId='cost-by-project' />` for URL-round-trip parity with `TokenUsageCard`, but the prior-period DeltaPill column is NOT rendered because `useCostBreakdown` returns rolled-up per-project totals (no time bucketing), so client-side prior-period slicing is not possible without a backend window-shift API. Documented as an Accepted Exception (escape path (i)) — the toggle's URL write contract is preserved for forward compatibility, the column rendering will land when the backend exposes bucketed cost-by-project data.
- **Append-only extension on `/alerts` (Plan 06):** ACCEPTS `?time_from` + `?time_to` (Grafana-style tokens via shared `asTimeToken`) + `?compare_panels` (CSV via shared `asComparePanels`). Validator returns `undefined` for missing/invalid values (Pitfall 13 — the per-panel default `'7d'` for AlertEventsList is applied AT THE PANEL READ SITE via `useRouteRangeVocab('7d', snapToAlertRange)`, NEVER in the validator). The v1.2 `RangeToggle persistKey='alert-events-range'` localStorage round-trip is REPLACED by URL state — pre-existing localStorage entries under `alert-events-range` become dead values (matches Plan 27-05's stance for `cost-by-project`). SCHEMA_VERSION stays at 1. No route rename.

## Phase 26 effects on URL contract

- **Append-only extension on `/`, `/activity`, `/sessions/compare`:** Three routes now ACCEPT `?time_from` + `?time_to` Grafana-style relative tokens (`now`, `now-Nu`, `now/u`, `now-Nu/u`) or ISO-8601 absolute timestamps. Shape-invalid values strip to `undefined` (defense in depth). No route file renames; no breaking changes.
- **Validator default is `undefined`, NOT a per-route fallback** (RESEARCH Pitfall 13). Per-route panel fallback (24h on `/`, 1h on `/activity`, 7d on `/sessions/compare`) is applied AT THE PANEL READ SITE in Wave 3 plans. Defaulting in the validator would defeat `DefaultViewLoader`'s bare-URL gate (Phase 25 Plan 10 Accepted Exception).
- **SCHEMA_VERSION stays at 1.** Optional fields defaulting to `undefined` reproduce pre-Phase-26 behavior identically.
- **`cmc.recents.routes` localStorage key (Phase 26 Plan 02 / SHEL-05 + CMDK-04):** A new cross-route FIFO ring tracks recently-visited routes. localStorage-only — does NOT enter the URL. Single source of truth in `frontend/src/lib/recents.ts`.

## Test gate

`backend/tests/test_url_contract.py` (Phase 24 plan 05) parses this doc and asserts:

1. Every URL pattern documented here has a corresponding route file in `frontend/src/routes/`.
2. Every route file in `frontend/src/routes/` (excluding `__root.tsx` and `routeTree.gen.ts`) is documented here.

Both directions enforce drift-free coverage.
