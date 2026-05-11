# Z-index ladder

Single source of truth for stacking order in the dashboard surface. Every overlay primitive MUST use a `--cmc-z-*` CSS variable; raw integers are forbidden in `frontend/src/styles.css` (except inside `:root`) and in component-level inline `style={{ zIndex: ... }}`. The `cmc/no-raw-z-index` ESLint rule enforces the JSX side.

Established: Phase 24 (CONT-05 + POLI-09). Variable definitions live in `frontend/src/styles.css :root`.

## Order (low to high)

| Layer            | CSS variable                          | Value | Use case |
|------------------|---------------------------------------|------:|----------|
| Base flow        | `--cmc-z-base`                        |     0 | Default content |
| Sticky chrome    | `--cmc-z-sticky`                      |    10 | Sticky table headers; sticky filter bars |
| Shell chrome     | `--cmc-z-sidebar` / `--cmc-z-header`  |    20 | Sidebar + AppShellHeader |
| Tooltip          | `--cmc-z-tooltip`                     |    30 | Hover/focus tooltips |
| Popover          | `--cmc-z-popover`                     |    40 | Time picker (Phase 26), info popovers |
| DropdownMenu     | `--cmc-z-dropdown`                    |    50 | Density picker, row actions, save-view menu (Phase 25) |
| Sheet            | `--cmc-z-sheet` (panel = sheet + 1)   | 60/61 | Side-drawer overlays + panel |
| AlertDialog      | `--cmc-z-dialog` (panel = dialog + 1) | 70/71 | Destructive confirms |
| Cmd+K palette    | `--cmc-z-cmdk`                        |    80 | Above all routine overlays |
| Toast / pip      | `--cmc-z-toast`                       |    90 | Transient notifications (Copied, etc.) |
| Emergency banner | `--cmc-z-banner`                      |   100 | Top-priority safety signal |

11 named layers. Spacing is intentionally `10` per step so future overlays slot into the gaps (`15`, `35`, `55`, ...) by adding a new variable in `styles.css :root` AND updating this doc in the same commit.

## Rules

- **Never use a raw integer for z-index** in component CSS or inline style. Use a `--cmc-z-*` variable.
- **Never break the ladder.** New layers slot into the gaps (`15`, `35`, `55`, ...) by adding a new variable in `styles.css :root` AND updating this doc in the same commit.
- **Sibling-above-same-family** overlays (Sheet panel above Sheet overlay, Dialog panel above Dialog overlay) use `calc(var(--cmc-z-X) + 1)` to keep the named ladder clean (no `--cmc-z-sheet-panel` proliferation).
- **Tooltips inside Sheets/Dialogs:** the tooltip's portal mounts at `document.body`, so its stacking context is the root. Tooltip z-index (30) is BELOW Sheet (60) — meaning a tooltip mounted while a Sheet is open will be hidden behind the Sheet. This is the intended behavior for v1.3.

## ESLint enforcement

`frontend/eslint-rules/no-raw-z-index.cjs` bans:

- `style={{ zIndex: <number> }}` literals in JSX.
- (CSS-side enforcement is policy-only; `styles.css` is hand-curated and human-reviewed.)

## Conflict history

Pre-Phase 24, Tooltip (50) and CommandPalette (50) collided. Resolution: Tooltip dropped to 30, CommandPalette raised to 80 (well above all routine overlays). AlertDialog moved up from 45/46 to 70/71 to sit above Sheet, matching the destructive-confirm priority.
