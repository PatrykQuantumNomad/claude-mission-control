// Phase 28 Plan 01 — Layout Customization e2e skeleton.
//
// Maps 1:1 to LAYO-01 / LAYO-02 / LAYO-03 / LAYO-04 requirements. Pattern
// mirrors `v13-tail-routes.spec.ts` (Phase 27 Plan 09) — a single
// `test.describe('Phase 28 — Layout Customization', ...)` block with
// nested groups per REQ id + one extra group for the saved-view
// round-trip + one for the ResponsiveContainer DOM-identity perf gate.
//
// EVERY test below is `test.skip(...)` at Wave 0 commit time. Wave 2
// (Plan 28-03 / hide), Wave 2 (Plan 28-04 / reorder), Wave 3 (Plan
// 28-05 / split-pane), Wave 4 (Plan 28-02 / SavedViewMenu reset) flip
// `test.skip` → `test` and implement. The `// TODO Wave N` comments
// inside each body name the implementing plan number.
//
// Selectors below reference the testid families registered by Task 3 of
// this plan in `docs/testid-registry.md`:
//   - panel-header-menu-{panelId}
//   - panel-hide-{panelId}
//   - panel-drag-grip-{panelId}
//   - panel-reset-layout-{route}
//   - resize-handle-{groupId}
//   - panel-grid-{columnId}
//
// CRITICAL: do NOT import any source modules that do not yet exist —
// the spec MUST list cleanly under `pnpm exec playwright test --list`
// at commit time so the verify command can count `.skip` entries.

import { test, expect } from '@playwright/test'

test.describe('Phase 28 — Layout Customization (LAYO-01..04)', () => {
  // ───────────────────────────────────────────────────────────────────
  // LAYO-01 — Hide panels with URL persistence
  // 5 routes × 1 hide-and-persist journey each = 5 skipped tests.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-01 hide-and-persist', () => {
    test.skip('/: hide System Pressure persists across reload via ?hidden_panels', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      // Selectors: panel-header-menu-system-pressure, panel-hide-system-pressure.
      // Expected URL after hide: ?hidden_panels=system-pressure
      // Reload: panel still hidden, URL preserved.
      await page.goto('/')
      expect(true).toBe(true)
    })

    test.skip('/activity: hide Heatmap persists across reload via ?hidden_panels', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      await page.goto('/activity')
      expect(true).toBe(true)
    })

    test.skip('/cost: hide CostByProjectCard persists across reload via ?hidden_panels', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      await page.goto('/cost')
      expect(true).toBe(true)
    })

    test.skip('/skills: hide TopSkillsCard persists across reload via ?hidden_panels', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      await page.goto('/skills')
      expect(true).toBe(true)
    })

    test.skip('/alerts: hide AlertEventsList persists across reload via ?hidden_panels', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      await page.goto('/alerts')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-02 — Reorder panels (mouse drag + keyboard grab-mode)
  // 2 mouse-drag + 2 keyboard reorder = 4 skipped tests.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-02 reorder', () => {
    test.skip('/cost: mouse drag moves CostByProjectCard before CostForecastCard within column-a', async ({ page }) => {
      // TODO Wave 2 / Plan 28-04 — unskip and implement.
      // Selectors: panel-drag-grip-cost-by-project, panel-grid-column-a.
      // Expected URL after drop: ?panel_order=column-a:cost-by-project,cost-forecast,...
      await page.goto('/cost')
      expect(true).toBe(true)
    })

    test.skip('/cost: mouse drop across columns is ignored (column-a → column-b rejected)', async ({ page }) => {
      // TODO Wave 2 / Plan 28-04 — unskip and implement.
      // Selectors: panel-drag-grip-cost-by-project, panel-grid-column-b.
      // Expected: URL unchanged after a cross-column drop attempt.
      await page.goto('/cost')
      expect(true).toBe(true)
    })

    test.skip('/cost: keyboard reorder via Tab → Space → ArrowDown → Enter writes panel_order', async ({ page }) => {
      // TODO Wave 2 / Plan 28-04 — unskip and implement.
      // Sequence: Tab to focus panel-drag-grip-cost-by-project → Space (grab) →
      //          ArrowDown (move +1) → Enter (commit).
      // Expected URL: ?panel_order=column-a:...
      await page.goto('/cost')
      expect(true).toBe(true)
    })

    test.skip('/cost: keyboard Esc cancels grab-mode without writing URL', async ({ page }) => {
      // TODO Wave 2 / Plan 28-04 — unskip and implement.
      await page.goto('/cost')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-03 — Split-pane resize on /sessions/compare
  // 3 skipped tests: resize persists, refresh preserves, double-click resets.
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-03 split-pane', () => {
    test.skip('/sessions/compare: pointer drag on resize-handle writes ?split_sizes', async ({ page }) => {
      // TODO Wave 3 / Plan 28-05 — unskip and implement.
      // Selector: resize-handle-compare.
      // Expected URL after pointerup: ?split_sizes=compare:60,40 (or similar).
      // CRITICAL Pitfall 1: write fires on onLayoutChanged (pointerup) NOT
      // onLayoutChange (pointermove). Test asserts URL is stable during drag
      // and updates exactly once at pointerup.
      await page.goto('/sessions/compare?a=...&b=...')
      expect(true).toBe(true)
    })

    test.skip('/sessions/compare: refresh after resize preserves split percentages', async ({ page }) => {
      // TODO Wave 3 / Plan 28-05 — unskip and implement.
      await page.goto('/sessions/compare?a=...&b=...&split_sizes=compare:60,40')
      expect(true).toBe(true)
    })

    test.skip('/sessions/compare: double-click on resize-handle resets to 50/50 (no split_sizes in URL)', async ({ page }) => {
      // TODO Wave 3 / Plan 28-05 — unskip and implement.
      // Selector: resize-handle-compare.
      // Expected URL after double-click: no split_sizes param at all.
      await page.goto('/sessions/compare?a=...&b=...&split_sizes=compare:60,40')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // LAYO-04 — Reset layout (per-panel menu + SavedViewMenu chrome)
  // 2 skipped tests: per-panel reset + SavedViewMenu reset.
  // Both MUST preserve time_from/time_to/compare_panels (Pitfall 11).
  // ───────────────────────────────────────────────────────────────────
  test.describe('LAYO-04 reset', () => {
    test.skip('/cost: per-panel Reset layout clears hidden_panels/panel_order/split_sizes and preserves time/compare', async ({ page }) => {
      // TODO Wave 2 / Plan 28-03 — unskip and implement.
      // Selectors: panel-header-menu-cost-by-project, panel-reset-layout-cost.
      // Preconditions URL: ?time_from=now-7d&time_to=now&compare_panels=token-usage&hidden_panels=cost-forecast&panel_order=column-a:cost-by-project
      // After reset URL: ?time_from=now-7d&time_to=now&compare_panels=token-usage
      // (the three layout keys are stripped; the three non-layout keys are preserved verbatim — LAYO-04 SC#3 / Pitfall 11).
      await page.goto('/cost')
      expect(true).toBe(true)
    })

    test.skip('SavedViewMenu Reset Layout chrome clears the same three keys and preserves time/compare', async ({ page }) => {
      // TODO Wave 4 / Plan 28-02 — unskip and implement.
      // Selector: panel-reset-layout-{route} mounted inside saved-view-menu-content.
      // Escape hatch for "all panels hidden" — per RESEARCH.md §7 A2.
      await page.goto('/cost?hidden_panels=cost-by-project,cost-forecast')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Round-trip with saved view — hide → save → navigate → load.
  // ───────────────────────────────────────────────────────────────────
  test.describe('Round-trip with saved view', () => {
    test.skip('hide panel → save current view → navigate away → load view → panel still hidden + URL has hidden_panels', async ({ page }) => {
      // TODO Wave 4 / Plan 28-02 — unskip and implement.
      // Sequence:
      //   1. /cost — hide CostForecastCard via panel-header-menu-cost-forecast → panel-hide-cost-forecast
      //   2. Save current view via saved-view-menu-save-new ("Save current view…")
      //   3. Navigate to / (a different route)
      //   4. Open SavedViewMenu, click the freshly-saved view's Open action
      //   5. Assert URL contains `hidden_panels=cost-forecast`
      //   6. Assert the panel is not in the DOM
      await page.goto('/cost')
      expect(true).toBe(true)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Perf — ResponsiveContainer DOM identity across split-pane drag.
  // Phase 24 lock: ResponsiveContainer count = 8 across panel files.
  // Resize MUST NOT remount the <svg> nodes (chart instance identity).
  // ───────────────────────────────────────────────────────────────────
  test.describe('Perf — ResponsiveContainer DOM identity', () => {
    test.skip('/sessions/compare: chart <svg> element identity is preserved across split-pane drag', async ({ page }) => {
      // TODO Wave 3 / Plan 28-05 — unskip and implement.
      // Sequence: capture an evaluate handle to a chart <svg>, drag the
      // resize-handle, then assert the same handle is still attached
      // (handle.evaluate(node => node.isConnected) === true).
      await page.goto('/sessions/compare?a=...&b=...')
      expect(true).toBe(true)
    })
  })
})
