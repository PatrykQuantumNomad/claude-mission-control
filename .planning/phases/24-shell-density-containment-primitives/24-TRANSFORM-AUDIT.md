# Phase 24 — Transform Audit (CONT-02)

**Audited:** 2026-05-10
**Method:** Static CSS grep (`rg -n "transform:" src/styles.css`) + React grep
(`rg -n "motion\.\w+|framer-motion" src/components/`) + manual triage of every hit.
Runtime Playwright probe lives at `frontend/tests/e2e/v13-portal-containment.spec.ts`
(plan 05) and is the dynamic complement to this static enumeration.

**Containing-block primer (the rule we are guarding against):** A `position: fixed`
descendant resolves its containing block to the viewport — UNLESS an ancestor has
a non-`none` `transform`, `filter`, `perspective`, `will-change: transform`, OR
`contain: strict|content|paint`. When such an ancestor exists, the fixed element
is positioned relative to it instead. Radix Portals mount their `position: fixed`
overlay/content into `document.body`, but ONLY in the DOM tree — they remain
descendants of any transform-bearing ancestor in the layout tree. So an animated
trigger (button hover lift, sheet panel slide) that wraps a Radix Tooltip /
DropdownMenu / Popover trigger silently traps the portaled overlay.

(Reference: MDN, "Identifying the containing block",
<https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block>.)

## CSS transform-bearing classes

Every static `transform:` declaration in `frontend/src/styles.css`. `text-transform: uppercase`
hits are filtered out (they are unrelated to the CSS `transform` property).

| File | Line | Class / @keyframes | Disposition | Notes |
|------|------|---------------------|-------------|-------|
| `frontend/src/styles.css` | 364 | `.cmc-btn:hover:not(:disabled)` (originally `transform: translateY(-2px)`) | **Mitigated** (Plan 01) | Replaced with `position: relative; top: -2px; box-shadow: ...`. No transform → no containing block. Visual lift preserved. Phase 24 Plan 01 commit `2e064cc`. |
| `frontend/src/styles.css` | 366 | `.cmc-btn:disabled { transform: none; }` | **Accept** | `transform: none` does NOT establish a containing block (only non-`none` transforms do). Defensive carryover from the legacy `:hover` rule; harmless. |
| `frontend/src/styles.css` | 446–447 | `@keyframes cmc-tooltip-in` (`transform: translateY(4px → 0)`) | **Accept** | Animation is on the tooltip body itself (the Portal child), not an ancestor. The portaled tooltip can carry its own transform without trapping anything because there is no further `position: fixed` descendant inside it (Radix Tooltip does not nest Portals). Future-proof guidance: do NOT mount a Popover inside a Tooltip body (which would create a Portal-in-Portal); v1.3 has no such site. |
| `frontend/src/styles.css` | 569 | `.cmc-collapsible__chevron[data-state="closed"] { transform: rotate(-90deg); }` | **Accept** | Rotation is on the chevron `<svg>` itself, which has no Portal descendants. The chevron is a sibling of the Collapsible.Trigger label, not an ancestor of any overlay. Even if a future phase mounts a Tooltip on the chevron, the chevron's transform would only affect a portaled tooltip if the Tooltip Trigger were the chevron AND the Tooltip Content were not portaled — Radix portals tooltips by default. No mitigation required. |
| `frontend/src/styles.css` | 594–595 | `@keyframes cmc-cmdk-panel-in` (`transform: scale(0.96 → 1)`) | **Accept** | Animation is on the cmdk command palette panel itself. cmdk does not host Radix Portal children inside its body (no nested Tooltip / Popover / DropdownMenu in the v1.2/v1.3 cmdk command list — palette items are plain elements). If Phase 25+ adds e.g. a Tooltip on a palette item, switch to `@keyframes` that animate `opacity` only (drop the scale). |
| `frontend/src/styles.css` | 695–696 | `@keyframes cmc-page-in` (`transform: translateY(8px → 0)`) | **Follow-up — Phase 26/27** | Page-level entrance animation on `.cmc-page`. The animated element WRAPS every route's panel grid, including any panel that hosts Sheet/DropdownMenu/Popover triggers. While the animation is short (default duration), portaled overlays mounted DURING the entrance window would attach to the page's transformed bounds. **Mitigation deferred** because: (a) animation is brief, (b) no overlay-on-mount pattern in v1.3, (c) cleanest fix is to switch to `opacity`-only entrance + a 0px-to-natural-position via flex (no transform). Action item: when Phase 26/27 adopts `BoundedPanelCard` per route, swap `cmc-page-in` to opacity-only at the same time. |
| `frontend/src/styles.css` | 819 | `.cmc-heatmap-cell:hover { transform: scale(1.15); }` | **Accept (conditional)** | Heatmap cells render no Radix Portal children in v1.2. **Conditional mitigation:** if a future phase mounts a Tooltip on a heatmap cell (REQ candidate: hover-tooltip showing exact bucket value + count), swap `transform: scale(1.15)` for `box-shadow: 0 0 0 2px var(--cmc-accent)` + `z-index` bump. Recorded for the v1.4 visual-polish backlog. |
| `frontend/src/styles.css` | 1487 | `.cmc-alertdialog { transform: translate(-50%, -50%); }` | **Accept** | This is the standard "centered fixed dialog" pattern (`top: 50%; left: 50%; transform: translate(-50%, -50%)`). The transform is REQUIRED for centering — removing it breaks layout. The AlertDialog body in v1.2/v1.3 contains only confirm/cancel buttons + body text — no Radix Portal children. If a future phase mounts a Tooltip / DropdownMenu inside an AlertDialog (unlikely; alert dialogs are terminal-action surfaces), use Radix's `container` prop on the inner Portal to escape via DOM tree. |
| `frontend/src/styles.css` | 426–429, 462–465, 1579–1582 | `@keyframes cmc-pulse`, `cmc-skeleton-pulse`, `cmc-estop-pulse` | **Accept** | These keyframes animate `opacity` / `background` only. No `transform` declarations. Listed for completeness — not an offender. |

## framer-motion sites

Every `motion.*` usage in `frontend/src/components/`.

| File | Line | Component | Disposition | Notes |
|------|------|-----------|-------------|-------|
| `frontend/src/components/ui/Sheet.tsx` | 41, 53 | `motion.div` Sheet panel + Sheet overlay | **Accept (v1.2 baseline safe)** | Sheet panel uses framer-motion `transform: translateX(...)` for its slide-from-right animation. v1.2 audit confirmed: NO Radix Portal children inside Sheet body in any current consumer (`SessionSheet`, `SkillRunSheet`, `AlertSheet`, etc.). **Future-proof guidance**: if Phase 25+ mounts a `DropdownMenu` / `Popover` inside a Sheet body, swap framer-motion for a CSS-keyframe animation that animates non-transform properties (e.g., `right: 0 → -100%`), OR use Radix's `container` prop to mount the inner Portal outside the Sheet's transform tree. Header annotation added in plan 03 task 3 (commit pending). |
| `frontend/src/components/ui/CollapsibleSection.tsx` | 68 | `motion.div` collapsible content | **Accept** | framer-motion animates `height: 0 → auto` and `opacity: 0 → 1`. **Neither property establishes a containing block** — `height` is layout-only and `opacity` is paint-only. (Per MDN's containing-block rule, only `transform`, `filter`, `perspective`, `will-change: transform`, and `contain: strict|content|paint` create one.) Safe to host Radix Portal children inside collapsible bodies without further mitigation. |

## Mitigations applied in Phase 24

- **Plan 01** — `.cmc-btn:hover` `transform: translateY(-2px)` swapped for `position: relative; top: -2px; box-shadow: 0 2px 8px rgba(0,0,0,0.15)` (commit `2e064cc`). This was the v1.2-vintage offender that trapped Tooltip / DropdownMenu trigger overlays under hovered buttons.
- **Plan 03 task 3** — `frontend/src/components/ui/Sheet.tsx` header carries the v1.2-baseline-safe disposition and a future-proof guidance block referencing this audit document.

## Mitigations deferred (with conditions)

- `.cmc-heatmap-cell:hover` — defer until a Tooltip-on-heatmap pattern lands. Trigger condition: a REQ that mounts a Radix Tooltip on `.cmc-heatmap-cell`. Mitigation playbook: swap `transform: scale(1.15)` for `box-shadow: 0 0 0 2px var(--cmc-accent); z-index: var(--cmc-z-elevated)`.
- `cmc-page-in` page-entrance keyframe — defer until Phase 26/27 per-route adoption of `BoundedPanelCard`. Mitigation playbook: rewrite the keyframe to animate `opacity` only; let layout drive the position.
- `Sheet.tsx` framer-motion translateX — defer until a nested-Portal-in-Sheet pattern lands. Trigger condition: any Sheet-body consumer adds `<DropdownMenu>` / `<Popover>` / a Tooltip on a Sheet-internal element. Mitigation playbook: switch to CSS keyframe that animates `right`, OR use Radix `container={sheetBodyRef}` on the inner Portal.

## Runtime probe (plan 05)

Plan 05 ships `frontend/tests/e2e/v13-portal-containment.spec.ts` which, for every route × every Sheet/DropdownMenu/Tooltip mount path, opens the overlay then walks `document.body` for any element whose `getComputedStyle().transform !== 'none'` AND that is an ancestor of the Portal-mounted content. Fails on detection. The static audit above is the *enumeration*; the runtime probe is the *enforcement*.

## Net-new offenders found beyond the research enumeration

The 24-RESEARCH.md enumeration named only `.cmc-btn:hover` (mitigated in plan 01), `.cmc-heatmap-cell:hover`, and the `Sheet.tsx` framer-motion site. The static grep this plan ran surfaced four additional sites that the research had not enumerated:

1. **`.cmc-collapsible__chevron[data-state="closed"]`** (`styles.css:569`) — accept (chevron is a leaf SVG; no Portal descendants).
2. **`@keyframes cmc-cmdk-panel-in`** (`styles.css:594–595`) — accept (palette body has no nested Portals in v1.3).
3. **`@keyframes cmc-page-in`** (`styles.css:695–696`) — **follow-up Phase 26/27** (mitigation deferred to per-route shell adoption).
4. **`.cmc-alertdialog`** (`styles.css:1487`) — accept (centering transform is required for layout; no Portal children in alert body).
5. **`@keyframes cmc-tooltip-in`** (`styles.css:446–447`) — accept (tooltip body itself; no nested Portal pattern).
6. **`CollapsibleSection.tsx` `motion.div`** (`CollapsibleSection.tsx:68`) — accept (animates `height` + `opacity` only; neither is a containing-block trigger).

The first four CSS hits + the `CollapsibleSection.tsx` framer-motion site are NEW relative to the research. The single follow-up requiring future action is `cmc-page-in`, scheduled for the same edit cadence as Phase 26/27's `BoundedPanelCard` per-route adoption.

## References

- MDN — *Identifying the containing block* (rule for `position: fixed` descendants): <https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block>
- `.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md` — section "Recharts ResponsiveContainer transform root-cause audit (CONT-02)". Note: the original v1.3 CONTEXT framed recharts' ResponsiveContainer as the transform offender; the research re-verified by reading `node_modules/recharts/lib/component/ResponsiveContainer.js` and confirmed ResponsiveContainer applies NO `transform`. The real offenders are the six CSS sites + two framer-motion sites enumerated above.
- `frontend/src/components/ui/Sheet.tsx` (header annotation, plan 03 task 3) — links back to this document.
