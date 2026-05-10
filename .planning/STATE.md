---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Surface Redesign
status: Plans 01-03 shipped (Wave 1 + Wave 2). Ready for Plan 04 execution.
last_updated: "2026-05-10T14:05:00.000Z"
last_activity: 2026-05-10 — 24-03-SUMMARY.md authored. Plan 03 wave-2 complete: commits 939cd3e (CSS containment + truncation rules), dddae8d (RED tests), eb43306 (GREEN: BoundedPanelCard + TruncatedCell + CopyIconButton), eafa47a (DataTable wrap+copyable + Sheet annotation + 24-TRANSFORM-AUDIT.md). Plan 02 ran in parallel and landed commits 49c135a + b9d5e2e independently.
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 7
  completed_plans: 3
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-10 after v1.3 milestone start)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.3 Surface Redesign — Phase 24 Plans 01-03 complete (Wave 1 substrate + Wave 2 density UX + containment primitives). Substrate + DENS-01..03 + CONT-01/04 ready; Plan 04 (shell redesign + first visual checkpoint) is next.

## Current Position

Phase: 24 — Shell + Density + Containment Primitives (3/7 plans complete)
Plan: 02 ✅ + Plan 03 ✅ (parallel wave) → next: 04 (shell redesign)
Status: Plans 01-03 shipped (Wave 1 + Wave 2). Ready for Plan 04 execution.
Last activity: 2026-05-10 — 24-03-SUMMARY.md authored. Plan 03 wave-2 complete: 4 task commits (939cd3e CSS, dddae8d RED, eb43306 GREEN, eafa47a DataTable+Sheet+audit). Plan 02 ran in parallel (commits 49c135a + b9d5e2e).

Progress (Phase 24 plans): [████░░░░░░] 43% (3/7 plans complete)

## Performance Metrics

**v1.2 close baselines (verifier targets for v1.3 phases):**

- Backend pytest: 661 / 0 / 0 (passed/failed/skipped)
- Frontend vitest: 326 / 0 / 0
- Playwright e2e: 13 specs (11 passing + 2 dev-DB-state-dependent skips: `alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`)
- LOC: ~62,883 (~40,071 Python + ~22,812 TypeScript/TSX)
- Deprecation warnings: 0 (POLI-06 baseline)

**v1.3 net new dependency budget (locked at requirements):**

- Frontend (3): `@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `react-resizable-panels@4.11.0`
- Backend: 1 Alembic migration (`0004_saved_views`); 0 Python deps

## Accumulated Context

### Decisions

Cumulative decision log lives in `.planning/PROJECT.md` Key Decisions table. v1.2 ship-time additions (full inventory in Key Decisions table):

- `cmc/core/time::now_utc` is the canonical naive-UTC factory across the codebase
- `project_key = sha1[:12](realpath(cwd))` is the project-identity normalization (migration 0003)
- `_resolve_alpha` helper inside single `evaluate_anomaly` (no parallel detector; ALRT-13)
- NL alert parser returns `None` on hallucination — no fallback rule (ALRT-14)
- Decimal-only OLS in `cmc/cost/forecast.py` — no numpy/scipy
- `/cost` is the only new top-level v1.2 route (sole exception to "extend existing pages")
- CMPR-06 single-rollup-SQL-per-side preserves CMPR-04's 9-SQL-per-request budget
- `ActiveSessionContext` lives in React Context, not a route parameter
- Spike-gated phase pattern: mandatory data-availability spike with binary YES/NO outcome banner (Phase 22 first use)
- `BASELINE.md` lives in the phase directory, not at `.planning/` root, with verifier rules embedded as prose-with-bounds

**v1.3 roadmap-time decisions:**

- Phase 24 establishes ALL primitives (containment, density, shell chrome, quality-gate scaffolding) BEFORE any per-route adoption. Anti-pattern explicitly avoided: do not adopt primitives mid-phase per route.
- Saved views are server-persisted (SQLite `saved_views` table) — chosen over localStorage-only for durability + future export/import; chosen over cloud-sync (out of scope; localhost-only).
- `validateSearch` schemas are append-only (locked invariant) — non-additive changes break Telegram deep-links and browser bookmarks.
- Density variables MUST be on `:root` (locked invariant) — never on a subtree (Radix Portal cascade requirement).
- Density toggle MUST be CSS-only (locked invariant) — `[data-density]` attribute on `<html>`, no React re-renders, no chart re-mounts.
- BoundedPanelCard MUST be opt-in via `bounded` prop (locked invariant) — backward compatibility for legacy "scroll whole page" behavior on routes that don't opt in.
- Saved view `state_json` MUST be opaque to backend (locked invariant) — schema validation lives in route's `validateSearch` on read.
- All Sheet/Popover/DropdownMenu content MUST go through Radix Portal (locked invariant) — no bare positioning.
- `data-testid` MUST come from registry (`docs/testid-registry.md`) — Playwright selector stability invariant.
- 50-view cap on saved views per route + 50-state cap on recent ad-hoc states — bounded localStorage growth.
- Formal per-phase visual checkpoint pattern (POLI-09) — each phase ends with operator-driven visual review at `.planning/phases/{N}/VISUAL-CHECK.md`. Verifier gates on visual checkpoint pass.
- Phase 28 (Layout Customization) ships LAST — depends on stable `validateSearch` shapes (Phase 25) and saved-view `state_json` (Phase 25). Layout state piggybacks on `state_json` (no new DB table).
- Tech debt closure (TDBT-01..03) lives in Phase 27 — bundled with `/skills`/`/cost`/`/alerts` per-route adoption because the shell rework makes the fixes natural.

**v1.3 Phase 24 plan-01 execution decisions:**

- `lib/density.ts` is a near-exact clone of `lib/theme.ts` (same SSR guards, 5-symbol export surface, KEY=`cmc.density`, default=`comfortable`). Established pattern: any future :root-scoped UX preference (motion=normal|reduced, etc.) follows this shape.
- `applyDensity()` runs BEFORE `applyTheme()` in main.tsx so density tokens resolve on :root before any [data-theme="light"] rule depends on them — guaranteed by execution order at boot.
- Z-index ladder spaced by 10 with `calc(var(--cmc-z-X) + 1)` for sibling-above-same-family overlays — keeps the named ladder clean (no `--cmc-z-sheet-panel` proliferation).
- `--cmc-*` token namespace coexists with legacy `--space-*`/`--size-*`. Per-route migration is explicitly Phase 26/27; mid-phase token rewrites would break the v1.2 vitest baseline before plan 04's visual checkpoint.
- AlertDialog selector names verified against tree before edit — actual classes are singular `.cmc-alertdialog-overlay` / `.cmc-alertdialog`, not BEM `__overlay`/`__panel`. Plan-text speculation overridden by source-of-truth scan.
- `.cmc-btn:hover` lifts via `top: -2px` + `box-shadow` (NOT `transform`) — locked invariant for any future hover-lift effect on a Radix Portal trigger.

**v1.3 Phase 24 plan-02 execution decisions:**

- DensityProvider is INTENTIONALLY not a React Context. POLI-11 zero-rerender becomes an architectural guarantee, not a discipline-enforced one — every density consumer reads the CSS cascade, no React subscription path exists. Adding a context here at any future point would silently break the invariant.
- DensityToggle's local `useState` exists ONLY to drive the check-mark indicator inside the toggle's own DropdownMenu. Persistence + DOM mutation happens via `setDensity()` from `lib/density.ts`. This split (local state for own UI, no shared state for the value) is the same shape as ThemeToggle.
- happy-dom (and jsdom) does NOT propagate `:root` CSS variables through `getComputedStyle` on descendants — verified empirically with a probe test against a bare `<div>` appended to `document.body`. Result: vitest cascade tests pin the html-element-level cascade and the data-density attribute flip; full Portal-descendant cascade verification (DENS-02) is delegated to Plan 05's Playwright fixture. Documented in plan-02 SUMMARY for plan 05's author.
- Plan 02 vitest tests inject a minimal `[data-density="…"]` stylesheet rather than importing styles.css (vitest config sets `css: false`). Keeps the test focused on the cascade contract, avoids coupling unit tests to styles.css drift.
- Sliders icon (NOT SlidersHorizontal/Vertical) is the locked density-toggle glyph per Phase 24 research — no substitution.

**v1.3 Phase 24 plan-02 execution coordination notes:**

- Pre-commit hook stashes unstaged files before tsc, so a sibling parallel agent's mid-TDD-cycle RED commit can transiently break the project tsc gate even when MY changes are isolated. Resolution: poll `pnpm tsc --noEmit` until the sibling agent reaches GREEN, then commit. Logged for orchestrator awareness — plans whose pre-commit hooks run project-wide tsc must tolerate transient red states from parallel TDD-RED commits.
- Parallel-agent shared-worktree filesystem can lose tracked files via cross-agent pre-commit stash interactions or `git clean`-class operations. Plan-02 saw `frontend/src/__tests__/integration.test.tsx` deleted from working tree by sibling-agent activity; restored via `git checkout HEAD -- <file>` (single-file defensive recovery, not a destructive op). Counted as Rule 3 deviation in plan-02 SUMMARY. Worktree-isolation hardening (#3097) would prevent this.

### Resolved Blockers

(Cleared at milestone close — see `.planning/milestones/v1.2-MILESTONE-AUDIT.md` for the full v1.2 issues-resolved log.)

### Open Blockers / Carried Items

**Operational (non-blocking, one-time apply on next `cmc start`):**

- Apply Alembic migration 0003 to live `data/cmc.db` (auto-applies on lifespan boot via `command.upgrade(alembic_cfg, "head")`)

**Tech debt (mapped into v1.3 Phase 27 as TDBT-01..03):**

- TDBT-01: Wire APIs (`SessionListItemFull`, `SessionCompareSide`) don't expose `project_key` — Phase 23 frontend compare picker uses `cwd` as proxy. Phase 27 exposes `project_key` on those wire shapes for picker correctness in edge cases.
- TDBT-02: KNOWN_METRICS frontend constant still exists as fallback path despite `useAlertMetrics` hook + `test_alerts_metrics_sync.py` regex guard. Phase 27 finishes removing the constant entirely.
- TDBT-03: Phase 21-03 frontend NL input couples to a 503 collapse on `POST /api/alerts/parse-nl` (no graceful retry/queue UX). Phase 27 surfaces honest "credentials missing — retry" affordance.

**Tech debt (NOT in v1.3 scope, carried forward):**

- 3 `_utcnow_naive()` local helpers in `cmc/dispatcher/alerts.py:73`, `cmc/api/routes/alerts.py:77`, `tests/test_doctor.py:20` — duplicate `now_utc()` logic but use the correct API; stylistic redundancy only.
- REQUIREMENTS.md doc-drift in archived v1.2: line 30 said CMPR-07 endpoint resolves "most-recent same-cwd session" — code uses `project_key` correctly. Audit-noted; archived as-is.
- Two pre-existing Playwright skips at v1.2 close (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`) — both dev-DB-state-dependent. v1.3 baseline should re-record after seed refresh (operational, not in scope).
- Cosmetic: `TO_BE_UPDATED_BY_SUMMARY` placeholder in `22-01-SPIKE-FINDINGS.md` line 26 (commit SHA verifiable from `git log`).

**Honestly deferred (carried to v1.4+ unless re-evaluated):**

- SKLP-11 — per-skill body/subagent/tool latency overhead breakdown — deferred to v1.4+ (Phase 22 spike negative finding still holds; unblock condition: upstream OTEL data availability change making `duration_ms` decomposition reliable).
- LAYO-05 — full 2D drag-resize grid via `react-grid-layout` — deferred (React 19.2 key-prop warnings open per GitHub Issue #2045).
- CMPR-10 — 3+ way session compare — defaulted OUT for v1.3 (no reference product ships >2-way; layout collapses below 1024px).

## Session Continuity

**v1.3 milestone progression:**

1. ✅ Project context update (PROJECT.md updated 2026-05-10)
2. ✅ Research (SUMMARY/STACK/FEATURES/ARCHITECTURE/PITFALLS authored 2026-05-10)
3. ✅ Requirements definition (REQUIREMENTS.md authored 2026-05-10 — 45 active across 9 categories)
4. ✅ Roadmap creation (ROADMAP.md authored 2026-05-10 — Phases 24-28, 45/45 mapped)
5. ✅ Phase 24 plans authored (01-07-PLAN.md present)
6. ⏳ Phase 24 execution (3/7 plans complete: Plans 01-03 shipped 2026-05-10)
7. Phase 24 → 25 → 26 → 27 → 28 execution
8. v1.3 milestone audit + close

**Phase 24 plan execution log:**

| Plan | Status | Commits | Notes |
|---|---|---|---|
| 01 — Foundation primitives | ✅ Complete (2026-05-10) | 396c092, 2e064cc | density tokens + z-index ladder + 3 CSS overflow fixes (CONT-02/03/05) + lib/density.ts + 4 v1.3 deps |
| 02 — DensityToggle | ✅ Complete (2026-05-10) | 49c135a, b9d5e2e | DensityToggle (Radix DropdownMenu, 3 tiers) + DensityProvider (no Context) + 7 vitest tests; POLI-11 zero-rerender locked by architecture; happy-dom Portal cascade limit deferred to Plan 05 Playwright |
| 03 — BoundedPanelCard | ✅ Complete (2026-05-10) | 939cd3e, dddae8d, eb43306, eafa47a | parallel wave with plan 02; BoundedPanelCard + TruncatedCell + CopyIconButton primitives + DataTable wrap/copyable + 24-TRANSFORM-AUDIT.md (CONT-02 deliverable). CONT-01/02/03/04 all shipped. |
| 04 — Shell redesign | ⏳ next | — | consumes plan 01 z-index/density tokens; mounts DensityToggle in header; first visual checkpoint |
| 05 — Saved views | pending | — | new Alembic migration `0004_saved_views`; depends on plan 04 shell; ALSO add density-cascade Playwright spec (DENS-02 e2e gate) |
| 06 — Docs | pending | — | docs/testid-registry.md + z-index-ladder.md |
| 07 — Quality gates | pending | — | wires lhci + axe-playwright (installed in plan 01) into CI |

## Next Step

Run `/gsd:execute-phase 24 04` to continue Phase 24 execution (shell redesign + first visual checkpoint).
