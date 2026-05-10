---
phase: 24-shell-density-containment-primitives
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - frontend/src/styles.css
  - frontend/src/components/ui/PanelCard.tsx
  - frontend/src/components/ui/BoundedPanelCard.tsx
  - frontend/src/components/ui/TruncatedCell.tsx
  - frontend/src/components/ui/CopyIconButton.tsx
  - frontend/src/components/ui/DataTable.tsx
  - frontend/src/components/ui/Sheet.tsx
  - frontend/src/components/ui/index.ts
  - frontend/src/components/ui/__tests__/TruncatedCell.test.tsx
  - frontend/src/components/ui/__tests__/CopyIconButton.test.tsx
  - frontend/src/components/ui/__tests__/BoundedPanelCard.test.tsx
  - .planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md
autonomous: true

must_haves:
  truths:
    - "Adding bounded={true} to a PanelCard makes it height-constrained with internal scroll on its content area"
    - "Long unbreakable cell strings (session-id, cwd, skill-name) truncate with ellipsis and show full text on tooltip hover"
    - "Click-to-copy icon appears on cell hover for known-long fields and writes the full value to clipboard without firing the row click handler"
    - "DataTable applies cmc-cell--truncate by default; column with wrap: true opts out and lets content wrap"
    - "Static CSS+React audit identifies every transform-bearing ancestor that could trap a Radix Portal child; mitigations recorded in TRANSFORM-AUDIT.md"
  artifacts:
    - path: "frontend/src/components/ui/BoundedPanelCard.tsx"
      provides: "Opt-in bounded panel primitive (CONT-04). Re-exports PanelCard with bounded preset."
      exports: ["BoundedPanelCard"]
    - path: "frontend/src/components/ui/PanelCard.tsx"
      provides: "Existing primitive extended with optional bounded?: boolean prop (additive — backward compatible)"
      contains: "bounded"
    - path: "frontend/src/components/ui/TruncatedCell.tsx"
      provides: "ResizeObserver-driven scrollWidth>clientWidth truncation+tooltip+optional copy primitive"
      exports: ["TruncatedCell"]
    - path: "frontend/src/components/ui/CopyIconButton.tsx"
      provides: "Hover-revealed clipboard copy button with transient Check confirmation"
      exports: ["CopyIconButton"]
    - path: "frontend/src/components/ui/DataTable.tsx"
      provides: "DataTable extended with per-column wrap?: boolean and copyable?: boolean (additive)"
      contains: "cmc-cell--truncate"
    - path: ".planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md"
      provides: "CONT-02 deliverable: enumeration of transform-bearing classes + framer-motion sites + mitigation status (real offenders per RESEARCH: .cmc-btn:hover (mitigated in plan 01), .cmc-heatmap-cell:hover, framer-motion Sheet)"
  key_links:
    - from: "frontend/src/components/ui/DataTable.tsx"
      to: "frontend/src/components/ui/TruncatedCell.tsx"
      via: "DataTable's cell renderer wraps string-valued content in TruncatedCell unless col.wrap === true"
      pattern: "TruncatedCell"
    - from: "frontend/src/components/ui/TruncatedCell.tsx"
      to: "ResizeObserver API"
      via: "lazy detection of scrollWidth > clientWidth on the inline span"
      pattern: "ResizeObserver"
    - from: "frontend/src/components/ui/PanelCard.tsx"
      to: "frontend/src/styles.css .cmc-card--bounded"
      via: "applies cmc-card--bounded class when bounded prop is true"
      pattern: "cmc-card--bounded"
---

<objective>
Build the containment primitives (CONT-01, CONT-02, CONT-03, CONT-04) so Phases 26/27 can adopt them per-route by changing one prop.

The three named overflow bugs from REQUIREMENTS.md are addressed:

- **CONT-01 + CONT-04** — `BoundedPanelCard` + `bounded?: boolean` on `PanelCard`. The `.cmc-page--bounded` page modifier (a sibling CSS rule) is added but no route adopts it in this phase. Page adoption is Phase 26/27.
- **CONT-02 transform-audit deliverable** — Static CSS grep + React grep produces `24-TRANSFORM-AUDIT.md` enumerating every transform-bearing class and every framer-motion site. Each entry has a disposition (mitigated, accepted-no-Portal-child-risk, follow-up). The runtime Playwright probe lives in plan 05.
- **CONT-03** — `TruncatedCell` (ResizeObserver-based `scrollWidth > clientWidth` lazy detection), `CopyIconButton` (hover-revealed, `stopPropagation` to preserve row-click), DataTable applies `cmc-cell--truncate` by default with per-column `wrap: true` opt-out and `copyable: true` opt-in.

**Locked invariants honored:**
- BoundedPanelCard MUST be opt-in via `bounded` prop — backward compatible. Existing legacy "scroll the whole page" behavior preserved when not opted in.
- No transform-bearing class becomes a containing block for Radix Portal descendants. (`.cmc-btn:hover` is mitigated in plan 01; `.cmc-heatmap-cell:hover` is documented in the audit; framer-motion Sheet is flagged with the v1.2-baseline-safe disposition "no Radix Portal children inside Sheet body in v1.2".)

Output:
- Three new TSX primitives (BoundedPanelCard, TruncatedCell, CopyIconButton) + 3 vitest tests.
- DataTable + PanelCard extended additively.
- New CSS rules in `styles.css` (`.cmc-page--bounded` ladder, `.cmc-card--bounded`, `.cmc-table-wrap`, `.cmc-cell--truncate`, `.cmc-cell--copyable`, `.cmc-cell__copy-btn`).
- `24-TRANSFORM-AUDIT.md` (deliverable for CONT-02).
- Sheet.tsx header annotated with audit follow-up guidance.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md

@frontend/src/components/ui/PanelCard.tsx
@frontend/src/components/ui/DataTable.tsx
@frontend/src/components/ui/Tooltip.tsx
@frontend/src/components/ui/Sheet.tsx
@frontend/src/components/ui/index.ts
@frontend/src/styles.css

<interfaces>
Existing primitives this plan extends (read these files for current shape; the plan is ADDITIVE).

From frontend/src/components/ui/PanelCard.tsx:
- Existing PanelCard generic component. Plan adds optional `bounded?: boolean` prop. When `true`, applies `cmc-card--bounded` class to the card root.

From frontend/src/components/ui/DataTable.tsx:
- Existing `DataTableColumn` interface. Plan adds two optional fields:
  - `wrap?: boolean` — default false (truncate). When true, cell content wraps to multiple lines.
  - `copyable?: boolean` — default false. When true, render copy-icon affordance for the cell value.

From frontend/src/components/ui/Tooltip.tsx:
- Existing Tooltip component wrapping `@radix-ui/react-tooltip` v1.2.8. Reused for TruncatedCell. Default side is `top`; TruncatedCell uses default.

CSS classes from plan 01 (already in styles.css):
- `.cmc-card { min-width: 0; ... }`
- `--cmc-z-tooltip: 30` already on :root

CSS classes plan 03 ADDS to styles.css (specified in task 1):
- `.cmc-page--bounded` (page modifier — opt-in)
- `.cmc-card--bounded` (panel modifier — opt-in)
- `.cmc-table-wrap` (DataTable horizontal scroll wrapper)
- `.cmc-table` (table-layout: fixed)
- `.cmc-cell--truncate` (overflow: hidden + ellipsis)
- `.cmc-cell--copyable` (inline-flex wrapper)
- `.cmc-cell__copy-btn` (hover-revealed button)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Append containment + truncation CSS rules to styles.css</name>
  <files>frontend/src/styles.css</files>
  <action>
Append the following rules at the bottom of `frontend/src/styles.css` under a comment header `/* Containment primitives — Phase 24 (CONT-01, CONT-03, CONT-04) */`. Do NOT edit any existing rule; this task is purely additive.

```css
/* Containment primitives — Phase 24 (CONT-01, CONT-03, CONT-04) */

/* CONT-01 page modifier — opt-in. Pages NOT setting this class keep legacy
 * scroll-the-whole-page behavior. Phase 26/27 adopts per-route. */
.cmc-page--bounded {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cmc-page--bounded > .cmc-card-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cmc-page--bounded .cmc-card { min-height: 0; }
.cmc-page--bounded .cmc-card__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* CONT-04 BoundedPanelCard primitive — opt-in via .cmc-card--bounded modifier
 * set by PanelCard's bounded?: boolean prop. */
.cmc-card--bounded {
  min-height: 0;
  height: 100%;
  overflow: hidden;
  contain: layout paint;
}
.cmc-card--bounded .cmc-card__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* CONT-03 DataTable truncation utilities. */
.cmc-table-wrap { width: 100%; overflow-x: auto; }
.cmc-table { width: 100%; table-layout: fixed; }
.cmc-cell--truncate {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.cmc-cell--copyable {
  display: inline-flex;
  align-items: center;
  gap: var(--cmc-space-2xs);
  max-width: 100%;
}
.cmc-cell--copyable > .cmc-cell--truncate { flex: 1; }
.cmc-cell__copy-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cmc-icon-size-md);
  height: var(--cmc-icon-size-md);
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--cmc-text-dim);
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.cmc-cell--copyable:hover .cmc-cell__copy-btn,
.cmc-cell--copyable:focus-within .cmc-cell__copy-btn { opacity: 1; }
.cmc-cell__copy-btn:hover { color: var(--cmc-text); }
.cmc-cell__copy-btn:focus-visible {
  outline: 2px solid var(--cmc-accent-blue, #4d7cff);
  outline-offset: 2px;
  opacity: 1;
}
```

`contain: layout paint` is intentional — verified MDN: it gives paint isolation but does NOT create a containing block for `position: fixed` descendants (only `transform`, `filter`, `perspective`, `will-change: transform`, and `contain: strict` create one). Radix Portals continue to mount correctly.

These rules co-exist with the v1.2 baseline. No route consumes `.cmc-page--bounded` yet (Phase 26/27); no panel uses `.cmc-card--bounded` until plan 04 (or per-route in Phase 26/27). Plan 03's task 3 wires DataTable cells to use `.cmc-cell--truncate` by default.
  </action>
  <verify>
    <automated>cd frontend && grep -c 'cmc-page--bounded' src/styles.css && grep -c 'cmc-card--bounded' src/styles.css && grep -c 'cmc-cell--truncate' src/styles.css && grep -c 'cmc-cell__copy-btn' src/styles.css && pnpm tsc --noEmit</automated>
  </verify>
  <done>All new class rules (`.cmc-page--bounded`, `.cmc-page--bounded > .cmc-card-grid`, `.cmc-page--bounded .cmc-card__content`, `.cmc-card--bounded`, `.cmc-table-wrap`, `.cmc-cell--truncate`, `.cmc-cell--copyable`, `.cmc-cell__copy-btn`) are present in styles.css. tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build TruncatedCell + CopyIconButton + BoundedPanelCard primitives with tests</name>
  <files>frontend/src/components/ui/TruncatedCell.tsx, frontend/src/components/ui/CopyIconButton.tsx, frontend/src/components/ui/BoundedPanelCard.tsx, frontend/src/components/ui/PanelCard.tsx, frontend/src/components/ui/index.ts, frontend/src/components/ui/__tests__/TruncatedCell.test.tsx, frontend/src/components/ui/__tests__/CopyIconButton.test.tsx, frontend/src/components/ui/__tests__/BoundedPanelCard.test.tsx</files>
  <behavior>
    TruncatedCell:
    - Renders an inline span ref=ref className="cmc-cell--truncate" with the value.
    - Sets isOverflowing via a ResizeObserver-driven scrollWidth greater-than clientWidth check on the span.
    - When isOverflowing is false AND no copyable prop is set, returns the bare span.
    - When isOverflowing is true AND no copyable, wraps the span in a Tooltip with content set to the full value.
    - When copyable is true (regardless of overflow), wraps span+CopyIconButton in cmc-cell--copyable. Adds Tooltip if also overflowing.
    - Uses ResizeObserver, never setInterval/rAF.

    CopyIconButton:
    - Renders a button type=button className=cmc-cell__copy-btn data-testid=cell-copy-btn aria-label set to Copy quote value.
    - On click: calls e.stopPropagation(), then navigator.clipboard.writeText(value). Sets copied=true for 1200ms, swaps Copy icon to Check icon.
    - Calls optional onCopy() callback after successful write.

    PanelCard.bounded:
    - Existing PanelCard accepts new optional bounded?: boolean. Default false.
    - When bounded is true, root element gets additional class cmc-card--bounded alongside existing classes.
    - Otherwise, behavior is identical to current PanelCard.

    BoundedPanelCard:
    - Re-exports PanelCard preset to bounded=true so callers can write BoundedPanelCard ergonomically.
  </behavior>
  <action>
1. Create `frontend/src/components/ui/CopyIconButton.tsx`. Use lucide icons `Copy` and `Check`. Implement the click handler with `e.stopPropagation()` BEFORE the clipboard write. Add 1200ms timeout for the Check-icon confirmation state. The `stopPropagation` is critical: tables with row-click handlers (LiveSessionsCard, SkillRunsTable open Sheet on row-click) must NOT fire the row-click when the copy icon is clicked.

   File header docstring: "CONT-03 — copy-icon affordance for known-long cell values (session-id, cwd, skill-name). Hover-revealed; stopPropagation preserves row-click semantics."

2. Create `frontend/src/components/ui/TruncatedCell.tsx`. Skeleton:

   ```tsx
   import { useEffect, useRef, useState, type ReactNode } from 'react'
   import { Tooltip } from './Tooltip'
   import { CopyIconButton } from './CopyIconButton'

   interface Props {
     value: string
     copyable?: boolean
     onCopy?: () => void
   }

   export function TruncatedCell({ value, copyable, onCopy }: Props): ReactNode {
     const ref = useRef<HTMLSpanElement>(null)
     const [isOverflowing, setIsOverflowing] = useState(false)

     useEffect(() => {
       const el = ref.current
       if (!el) return
       const measure = () => setIsOverflowing(el.scrollWidth > el.clientWidth)
       measure()
       const ro = new ResizeObserver(measure)
       ro.observe(el)
       return () => ro.disconnect()
     }, [value])

     const span = <span ref={ref} className="cmc-cell--truncate">{value}</span>
     if (!copyable && !isOverflowing) return span

     const inner = copyable
       ? <span className="cmc-cell--copyable">{span}<CopyIconButton value={value} onCopy={onCopy} /></span>
       : span
     return isOverflowing ? <Tooltip content={value}>{inner}</Tooltip> : inner
   }
   ```

3. Create `frontend/src/components/ui/BoundedPanelCard.tsx`:
   ```tsx
   import { PanelCard } from './PanelCard'
   import type { ComponentProps } from 'react'

   /**
    * BoundedPanelCard — opt-in CONT-04 primitive.
    * Equivalent to PanelCard with bounded prop preset to true. Use for ergonomics
    * when bounded is the call-site intent (e.g., a table panel that must scroll
    * internally instead of growing the page).
    */
   export function BoundedPanelCard<T>(props: Omit<ComponentProps<typeof PanelCard<T>>, 'bounded'>) {
     return <PanelCard<T> {...(props as ComponentProps<typeof PanelCard<T>>)} bounded />
   }
   ```

4. Edit `frontend/src/components/ui/PanelCard.tsx` to accept `bounded?: boolean`:
   - Add `bounded?: boolean` to the props interface (additive, non-breaking).
   - In the JSX root element, append `cmc-card--bounded` to the className when `bounded === true`. Use the existing className-composition pattern (template string or `[base, bounded && 'cmc-card--bounded'].filter(Boolean).join(' ')`).
   - Do not change any other behavior. The default (bounded omitted or false) MUST render byte-identical output to the current PanelCard.

5. Update `frontend/src/components/ui/index.ts` to export `BoundedPanelCard`, `TruncatedCell`, `CopyIconButton` alongside existing exports.

6. Tests:
   - `__tests__/TruncatedCell.test.tsx`:
     - Render with short value → only the bare span renders, no tooltip wrapping (assert no `[role=tooltip]` after hover, OR assert the rendered output is a single span).
     - Render with a long value, then mock the span ref's `scrollWidth`/`clientWidth` (e.g., `Object.defineProperty(span, 'scrollWidth', { value: 200, configurable: true })` and `clientWidth: 100`); fire a `ResizeObserver` callback (or call the measure manually); assert that hovering the span reveals a tooltip with the full value.
     - Render with `copyable={true}` → CopyIconButton is present inside `.cmc-cell--copyable`.
   - `__tests__/CopyIconButton.test.tsx`:
     - Renders Copy icon initially.
     - Mock `navigator.clipboard.writeText` (or use `vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)`).
     - Click → assert clipboard.writeText called with the value.
     - Click → button shows Check icon (assert via `data-testid="cell-copy-btn"` and rendered icon).
     - Click event has `stopPropagation` invoked (assert by attaching a parent `onClick` that should NOT fire).
   - `__tests__/BoundedPanelCard.test.tsx`:
     - `<BoundedPanelCard ...>` root has class containing `cmc-card--bounded`.
     - `<PanelCard ...>` (no bounded) root does NOT have `cmc-card--bounded`.
     - `<PanelCard bounded ...>` root and `<BoundedPanelCard ...>` root produce identical className composition.

7. None of these primitives are mounted in any route by this plan. Per-route adoption is Phase 26/27.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm vitest run src/components/ui/__tests__/TruncatedCell.test.tsx src/components/ui/__tests__/CopyIconButton.test.tsx src/components/ui/__tests__/BoundedPanelCard.test.tsx --reporter=verbose</automated>
  </verify>
  <done>5 new files compile; 3 vitest test files run green; PanelCard's default behavior (bounded omitted) unchanged (existing PanelCard tests still pass); index.ts exports the new primitives.</done>
</task>

<task type="auto">
  <name>Task 3: Wire DataTable per-column wrap+copyable opt-in/out and write transform-audit deliverable</name>
  <files>frontend/src/components/ui/DataTable.tsx, frontend/src/components/ui/Sheet.tsx, .planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md</files>
  <action>
**Sub-task A — DataTable wiring (CONT-03):**

1. Read existing `frontend/src/components/ui/DataTable.tsx` to confirm current `DataTableColumn` interface and cell-render path. Then extend the `DataTableColumn` interface additively:
   ```ts
   export interface DataTableColumn<T> {
     // existing fields preserved
     /** When true, cell content wraps to multiple lines instead of truncating with tooltip.
      * Default: false (truncate via TruncatedCell). Use for notes/description columns. */
     wrap?: boolean
     /** When true, render copy-icon affordance via TruncatedCell. Used for session-id, cwd, skill-name. */
     copyable?: boolean
   }
   ```

2. In the cell-render path: when `col.wrap !== true` AND the rendered cell value is a primitive string (or trivially coerces to one — i.e., the column has no custom `render` function), wrap in `<TruncatedCell value={stringValue} copyable={col.copyable} />`. When `col.wrap === true`, preserve the existing render path (no TruncatedCell, content allowed to wrap).

3. Ensure the DataTable root has `<div className="cmc-table-wrap"><table className="cmc-table">...</table></div>` structure. If the existing component already has these wrappers, leave them. If not, add them — they enable horizontal scroll containment + table-layout: fixed (which is what makes truncation work; without `table-layout: fixed`, columns auto-size to content and `overflow: hidden` on cells does nothing).

4. **Render-fn columns** (columns with custom `render: (row) => ReactNode` returning JSX like `<Badge>` or `<Link>`): do NOT wrap in TruncatedCell. Only string-valued cells get truncation. Document this in the inline DataTable comment: "TruncatedCell is applied automatically only to columns rendering raw string values; render-fn columns retain full control over their cell output."

5. **Backward compatibility risk:** existing tests may snapshot DataTable output. TruncatedCell renders a bare `<span className="cmc-cell--truncate">{value}</span>` when value fits and is not copyable, so the DOM gains exactly one wrapper span per truncating cell. If snapshot tests break, update the snapshots in this task — do NOT regress the truncation contract. Run `pnpm vitest run --reporter=dot` and inspect any failure: only acceptable failure mode is a snapshot diff caused by the added wrapper span; any other failure is a regression.

**Sub-task B — Sheet.tsx audit annotation (CONT-02):**

Read `frontend/src/components/ui/Sheet.tsx` then PREPEND (above the existing JSDoc) this comment block:

```ts
// CONT-02 audit note (Phase 24): The framer-motion <motion.div> on the Sheet panel
// applies transform: translateX(...). v1.2 baseline has NO Radix Portal children inside
// Sheet body; if a future phase needs to mount a DropdownMenu/Popover inside a Sheet,
// either (a) swap framer-motion for a CSS-keyframe animation that animates non-transform
// properties (e.g., `right`), OR (b) verify the inner Portal mounts correctly via Radix
// `container` prop and visually validate it isn't clipped.
// See .planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md.
```

Do NOT change any Sheet behavior. The annotation is documentation-only.

**Sub-task C — Transform audit deliverable (CONT-02 deliverable):**

Run two static greps from repo root:

```bash
cd frontend && rg -n "transform:\s*(?!none)" src/styles.css || true
cd frontend && rg -n "motion\.\w+|framer-motion" src/components/ || true
```

Capture every result. Then write `.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md` with the following structure (fill in actual line numbers from grep output):

```markdown
# Phase 24 — Transform Audit (CONT-02)

**Audited:** {ISO-date}
**Method:** Static CSS grep + React grep + manual triage. Runtime Playwright probe lives at frontend/tests/e2e/v13-portal-containment.spec.ts (plan 05).

## CSS transform-bearing classes

| File | Line | Class / @keyframes | Disposition | Notes |
|------|------|---------------------|-------------|-------|
| frontend/src/styles.css | (line) | .cmc-btn:hover | Mitigated in plan 01 | transform: translateY(-2px) replaced with top: -2px + box-shadow. No containing block. |
| frontend/src/styles.css | (line) | .cmc-heatmap-cell:hover | Accept | Heatmap cells render no Radix Portal children. If a future phase mounts a Tooltip on a heatmap cell, switch to box-shadow mitigation. |
| frontend/src/styles.css | (line) | @keyframes cmc-tooltip-in | Accept | Animation is on the tooltip itself, not an ancestor. No nested portal pattern in v1.2. |
| frontend/src/styles.css | (line) | @keyframes cmdk dialog | Accept | Cmd+K palette open animation. Cmdk has no Radix Portal children inside it. |

## framer-motion sites

| File | Line | Component | Disposition | Notes |
|------|------|-----------|-------------|-------|
| frontend/src/components/ui/Sheet.tsx | (line) | motion.div Sheet panel | Accept (v1.2 baseline safe) | Sheet panel uses framer-motion transform: translateX. v1.2 audit confirmed: NO Radix Portal children inside Sheet body. Future-proof guidance: if Phase 25+ mounts a DropdownMenu inside a Sheet body, swap framer-motion for CSS keyframe animation that animates non-transform properties (e.g. right). Header annotation added in plan 03 task 3. |

## Mitigations applied in Phase 24

- .cmc-btn:hover swapped to non-transform variant (plan 01, edit E).
- frontend/src/components/ui/Sheet.tsx header documents the v1.2-baseline-safe disposition + future-proof guidance (plan 03 task 3).

## Mitigations deferred (with conditions)

- .cmc-heatmap-cell:hover: defer until a Tooltip-on-heatmap pattern lands.
- Sheet motion.div: defer until a nested-Portal-in-Sheet pattern lands (Phase 25+ may trigger this).

## Runtime probe

Plan 05 ships frontend/tests/e2e/v13-portal-containment.spec.ts which, for every route x every Sheet/DropdownMenu/Tooltip mount path, opens the overlay then walks document.body for any element whose getComputedStyle().transform !== 'none' AND that is an ancestor of the Portal-mounted content. Fails on detection.

## References

- MDN: containing-block rule for position: fixed descendants — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block
- 24-RESEARCH.md section: Recharts ResponsiveContainer transform root-cause audit (CONT-02)
- Note: research confirmed recharts ResponsiveContainer does NOT apply transform (verified by reading node_modules/recharts/lib/component/ResponsiveContainer.js). The "recharts as offender" framing in the original CONTEXT was inaccurate; real offenders are listed above.
```

Every row MUST have a disposition (Mitigated / Accept / Follow-up). If new offenders surface that aren't in the research enumeration, add them with a fresh disposition. Do NOT silently omit results from the grep.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm vitest run --reporter=dot && test -f ../.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md && grep -q 'cmc-btn:hover' ../.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md && grep -q 'framer-motion' ../.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md && grep -q 'CONT-02 audit note' src/components/ui/Sheet.tsx && grep -q 'wrap?:' src/components/ui/DataTable.tsx && grep -q 'copyable?:' src/components/ui/DataTable.tsx && grep -q 'TruncatedCell' src/components/ui/DataTable.tsx</automated>
  </verify>
  <done>DataTable extended with `wrap?` and `copyable?` per-column flags; cells render through TruncatedCell by default for string-valued non-render-fn columns; existing 326+ vitest tests still green (snapshot updates allowed if structurally caused by added wrapper span); Sheet.tsx header carries the audit note; 24-TRANSFORM-AUDIT.md exists with every grep result triaged to a disposition.</done>
</task>

</tasks>

<verification>
```bash
cd frontend
pnpm tsc --noEmit
pnpm vitest run --reporter=dot
# Expected: all prior tests + new ones from plan 02 + plan 03 green; any snapshot updates limited to DataTable wrapper-span addition.

# Manually verify a real long-string truncation case in dev — open localhost:5173/sessions or skills,
# find a long session-id cell, hover; confirm tooltip shows full value; click copy icon, confirm
# clipboard contains the value AND the row click handler did NOT fire.
```
</verification>

<success_criteria>
1. `frontend/src/styles.css` contains the 8 new containment/truncation rules (verified by grep).
2. `BoundedPanelCard.tsx`, `TruncatedCell.tsx`, `CopyIconButton.tsx` exist and are exported from `index.ts`.
3. `PanelCard.tsx` accepts `bounded?: boolean` prop additively; existing call sites unaffected.
4. `DataTable.tsx`'s `DataTableColumn<T>` interface accepts `wrap?: boolean` and `copyable?: boolean` additively; default cell rendering wraps string values in TruncatedCell.
5. `Sheet.tsx` carries a CONT-02 audit-note header comment.
6. `.planning/phases/24-shell-density-containment-primitives/24-TRANSFORM-AUDIT.md` exists with every transform-bearing class + framer-motion site triaged to a disposition.
7. `pnpm vitest run` green (existing tests + 3 new test files); `pnpm tsc --noEmit` clean.
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-03-SUMMARY.md` per the standard SUMMARY template, recording: final exports added to ui/index.ts, DataTable backward-compatibility verification (which existing tests required snapshot updates and why), and any net-new transform offenders found beyond the research enumeration.
</output>
