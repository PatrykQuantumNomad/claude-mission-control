# Affordance checklist

16 keyboard / pointer / a11y affordances every route must honor. Verified at every phase close as part of `.planning/phases/{N}/{N}-VISUAL-CHECK.md`.

Established: Phase 24 (POLI-12). Surface scope: every route under `frontend/src/routes/`.

| #  | Affordance | Verification spec | Notes |
|---:|------------|-------------------|-------|
|  1 | `Cmd+K` opens command palette from any route | `frontend/tests/e2e/command-palette.spec.ts` | v1.0 baseline; preserved by Phase 24 |
|  2 | `Esc` closes Sheet, AlertDialog, DropdownMenu, Cmd+K | Manual + axe-core `keyboard` rule via `tests/e2e/v13-a11y.spec.ts` | Radix default behavior |
|  3 | `Cmd+B` (or `Ctrl+B`) toggles sidebar collapsed state | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-04; window-level + preventDefault + cross-platform modifier |
|  4 | Click outside Sheet/Popover/DropdownMenu closes it | Radix default; verified by axe-core fixture | All overlays must use Radix Portal |
|  5 | `Tab` cycles focus inside Sheet without escaping | Radix default; assert focus stays in Sheet panel | Manual verification in VISUAL-CHECK |
|  6 | Closing Sheet returns focus to its trigger | Radix default; assert `document.activeElement === trigger` | Manual verification |
|  7 | `Tab` reaches every interactive element on every route | Manual tab-walk audit + axe-core `tabindex` rule | Verified at phase close |
|  8 | Visible focus ring on every focusable element | axe-core `focus-order-semantics` | Tested by `tests/e2e/v13-a11y.spec.ts` |
|  9 | Theme toggle persists via localStorage `cmc.theme` | `frontend/tests/e2e/theme-toggle.spec.ts` | v1.0 baseline; preserved |
| 10 | Density toggle persists via localStorage `cmc.density` | `frontend/tests/e2e/v13-density.spec.ts` | Phase 24 DENS-03 |
| 11 | Sidebar collapsed state persists via localStorage `cmc.sidebar.collapsed` | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-04 |
| 12 | Click-to-copy on session-id / cwd / skill-name shows confirmation pip | `frontend/tests/e2e/v13-copy-cell.spec.ts` | Activates fully in Phase 26/27 column adoption |
| 13 | Truncated cells show full value on hover via tooltip | `frontend/tests/e2e/v13-truncation.spec.ts` | Phase 24 CONT-03; activates fully in Phase 26/27 column adoption |
| 14 | Active route highlighted in sidebar (left-edge bar + tinted bg) — visible in collapsed mode too | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-03 |
| 15 | Sheet body scrolls internally; outer page does not gain a scrollbar | `frontend/tests/e2e/v13-portal-containment.spec.ts` (related) + manual VISUAL-CHECK | Per-route adoption is Phase 26/27 (`bounded` prop opt-in) |
| 16 | `Cmd+Shift+C` copies current time range to clipboard; `Cmd+Shift+V` pastes clipboard time range and navigates the active route. Toast feedback on every event (`success`/`message`/`error`). | `frontend/src/components/time/__tests__/TimePicker.test.tsx` | Phase 26 Plan 03 (TIME-03); window-level keydown listener mounted by `TimePicker` in `AppShellHeader` — fires on every route. |

## Mobile / narrow viewport

Out of scope for v1.3. The dashboard is local-only single-user macOS. Below 768px viewport width, the sidebar overflows; that's accepted. Re-evaluate in v2 if multi-browser coverage becomes a goal.

## ResizeObserver browser floor

`tests/e2e/v13-truncation.spec.ts` and `frontend/src/components/ui/TruncatedCell.tsx` use `ResizeObserver` (Chrome 64+, Safari 13.1+, Firefox 69+). macOS Sonoma 14+ is the assumed user environment.
