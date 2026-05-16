# URL contract

Every URL pattern in this document is preserved across phases. Breaking a pattern requires explicit migration planning + a deprecation phase. The `backend/tests/test_url_contract.py` pytest gate (Phase 24 plan 05) fails CI if a documented pattern is missing from `frontend/src/routes/`, or if a route file in `frontend/src/routes/` is not documented here.

Established: Phase 24 (POLI-13). Locked invariant from REQUIREMENTS.md milestone constraints: "Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are forbidden."

## Routes

| URL pattern         | Route file                       | Description                            | validateSearch shape |
|---------------------|----------------------------------|----------------------------------------|----------------------|
| `/`                 | `routes/index.tsx`               | Mission Control / Home                 | Phase 26 / TIME-01: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13). Phase 28 / LAYO-01..04 APPENDS `hidden_panels` + `panel_order` PRESENT (both CSV via shared `asHiddenPanels` / `asPanelOrder`; default `undefined` per Pitfall 2) |
| `/activity`         | `routes/activity.tsx`            | Activity heatmap + sessions list       | Phase 26 / TIME-01: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13). Phase 28 / LAYO-01..04 APPENDS `hidden_panels` + `panel_order` PRESENT (both CSV via shared `asHiddenPanels` / `asPanelOrder`; default `undefined` per Pitfall 2) |
| `/skills`           | `routes/skills.tsx`              | Skills registry                        | Phase 27 / SC#1: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`). Phase 28 / LAYO-01..04 APPENDS `hidden_panels` + `panel_order` PRESENT (both CSV via shared `asHiddenPanels` / `asPanelOrder`; default `undefined` per Pitfall 2) |
| `/skills/$name`     | `routes/skills_.$name.tsx`       | Skill detail (per-skill panels)        | Phase 25 / VIEW-01: `range` PRESERVED (one of `7d`/`14d`/`30d`; defaults to `14d`). Phase 27 / SC#1 APPENDS `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`). Phase 28 OUT OF SCOPE — see "Phase 28 effects" below (single-column stack; no grid to reorder; no meaningful split-pane). |
| `/sessions/compare` | `routes/sessions_.compare.tsx`   | Session compare (TWO-arg required)     | `{ a: string, b: string }` (validated; v1.2 baseline). Phase 26 / TIME-01 adds `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined`). Phase 28 / LAYO-03 APPENDS `split_sizes` PRESENT (CSV groups via shared `asSplitSizes`; default `undefined` per Pitfall 2) |
| `/cost`             | `routes/cost.tsx`                | Cost analytics                         | Phase 27 / SC#2: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`). Phase 28 / LAYO-01..04 APPENDS `hidden_panels` + `panel_order` PRESENT (both CSV via shared `asHiddenPanels` / `asPanelOrder`; default `undefined` per Pitfall 2) |
| `/alerts`           | `routes/alerts.tsx`              | Alert rules + events                   | Phase 27 Plan 06: `time_from` + `time_to` PRESENT (both Grafana-style tokens via shared `asTimeToken`; default `undefined` per Pitfall 13) + `compare_panels` PRESENT (CSV via shared `asComparePanels`; default `undefined`). Phase 28 / LAYO-01..04 APPENDS `hidden_panels` + `panel_order` PRESENT (both CSV via shared `asHiddenPanels` / `asPanelOrder`; default `undefined` per Pitfall 2) |

## Stability rules

- **Adding a search param to an existing route is BACKWARDS-COMPATIBLE if and only if** the new param has a default value that reproduces the pre-change behavior. Rolling forward Phase 25 / 26 / 27 / 28 changes adhere to this rule.
- **Removing a search param requires a deprecation phase.** Telegram deep-links and browser bookmarks must continue to resolve.
- **Renaming a route file requires a phase-level migration plan + a redirect** from old to new (or graceful 404 with explanation). Forbidden as a silent rename.
- **`schemaVersion` field on every route's `validateSearch` shape (Phase 25)** — append-only schema evolution.

## Phase 24 effects on URL contract

- No new routes added; no `validateSearch` shapes changed. Phase 24 is shell + primitives + quality gates only.
- The `cmc.density`, `cmc.theme`, `cmc.sidebar.collapsed` keys are localStorage-only — they intentionally do NOT enter the URL.

## Phase 28 effects on URL contract

Phase 28 (Layout Customization, LAYO-01..04) adds **three new APPEND-ONLY optional search params** to in-scope routes. All three default to `undefined` at the validator — per-route / per-panel fallbacks live at the read site (mirrors the Phase 26/27 pattern locked above for `time_from` / `time_to` / `compare_panels`). Setting a default IN THE VALIDATOR would defeat `DefaultViewLoader`'s bare-URL gate (Phase 25 Plan 10 Accepted Exception, RESEARCH Pitfall 2).

- **`hidden_panels?: string`** (CSV of registered panel ids; regex `^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$`). Added on: `/`, `/activity`, `/cost`, `/skills`, `/alerts`. Default `undefined` (NEVER an empty-string default — Pitfall 2). Validator: shared `asHiddenPanels` in `frontend/src/lib/searchSchemas.ts`. Shape-invalid values (uppercase, trailing comma, unknown chars) strip to `undefined` via defense-in-depth. Unknown panel ids that survive the regex are filtered AT THE READ SITE via `PANEL_REGISTRY` membership (Pitfall 7) — they remain in the URL CSV but are silently ignored when computing visibility, so a stale saved view referencing a deleted panel id resolves to a no-op rather than crashing.
- **`panel_order?: string`** (CSV groups; regex `^[a-z0-9_-]+:[a-z0-9_-]+(?:,[a-z0-9_-]+)*(?:;[a-z0-9_-]+:[a-z0-9_-]+(?:,[a-z0-9_-]+)*)*$`). Added on: `/`, `/activity`, `/cost`, `/skills`, `/alerts`. Default `undefined`. Validator: shared `asPanelOrder`. Group keys are `columnId` slugs (e.g. `column-a`, `column-b`); values are CSVs of panel ids in render order. Unknown panel ids are filtered AT THE READ SITE via `PANEL_REGISTRY` (Pitfall 7); missing panel ids fall back to the route's defaultOrder for any panels not enumerated in the URL group.
- **`split_sizes?: string`** (CSV groups of percentages 0-100; regex `^[a-z0-9_-]+:\d{1,3}(?:,\d{1,3})+(?:;[a-z0-9_-]+:\d{1,3}(?:,\d{1,3})+)*$`). Added on `/sessions/compare` only in v1. Default `undefined`. Validator: shared `asSplitSizes`. Group keys are `groupId` slugs matching the `ResizablePanelGroup` instance id (e.g. `compare` for `/sessions/compare`). Values are CSVs of percentages that MUST sum to 100 (validated at write time; shape-invalid reads strip to `undefined`).

**SCHEMA_VERSION stays at 1.** All three params are optional fields defaulting to `undefined`, reproducing pre-Phase-28 behavior identically. No route rename. No removed search params.

**Reset semantics (LAYO-04 SC#3 + Pitfall 11):** The per-panel "Reset layout" menu item AND the SavedViewMenu chrome "Reset Layout" action both clear EXACTLY these three keys (`hidden_panels`, `panel_order`, `split_sizes`). All other URL keys — `time_from`, `time_to`, `compare_panels`, `range`, `a`, `b`, `schemaVersion` — are preserved verbatim. The Playwright LAYO-04 e2e tests (`tests/e2e/v13-layout.spec.ts`) enforce this contract.

**`/skills/$name` is explicitly OUT OF SCOPE for Phase 28** (RESEARCH.md §5 + Question 11 Pitfall 12): the route renders a single-column vertical stack with no grid to reorder and no panels suitable for a meaningful split-pane. Future-phase candidate if/when the surface grows multi-column.

## Locked invariants (Phase 28)

- **Panel ids are APPEND-ONLY** (Pitfall 9). Panel ids registered in `frontend/src/lib/layout/panelRegistry.ts` cannot be renamed or repurposed once they ship in a URL. New panels add entries; deleted panels leave their id retired (registry entry removed; saved views referencing the id resolve to no-op via the `PANEL_REGISTRY` membership filter at the read site). This guarantees a Telegram deep-link captured before a panel is retired still loads the route cleanly — the retired panel id is silently ignored rather than crashing the page.
- **Panel id vocabulary:** lowercase ASCII alphanumeric plus `_` and `-` (matches the `asHiddenPanels` regex). No dots, no colons, no slashes — those characters are reserved for the CSV group separators (`:` and `;`) and CSV item separator (`,`).
- **`/skills/$name` will not gain `hidden_panels` / `panel_order` / `split_sizes` in v1** (Pitfall 12). Lifting this is a separate phase-level decision once the route grows multi-column.
- **Reset clears LAYOUT KEYS ONLY** (Pitfall 11, LAYO-04 SC#3). Resetting layout NEVER touches `time_from` / `time_to` / `compare_panels` / `range` / `a` / `b` / `schemaVersion`. The reset surface (per-panel + SavedViewMenu) operates as a layout-specific URL-key purger, not a route-state purger.
- **`split_sizes` lives on `/sessions/compare` only in v1.** Other in-scope routes use a fixed grid (CSS Grid columns) rather than a `ResizablePanelGroup`; adding split-pane to additional routes is a separate phase decision.

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
