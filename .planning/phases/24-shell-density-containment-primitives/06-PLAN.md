---
phase: 24-shell-density-containment-primitives
plan: 06
type: execute
wave: 4
depends_on: [04]
files_modified:
  - docs/z-index-ladder.md
  - docs/affordance-checklist.md
  - docs/url-contract.md
  - docs/testid-registry.md
  - frontend/eslint.config.js
  - frontend/eslint-rules/index.js
  - frontend/eslint-rules/testid-registry-only.cjs
  - frontend/eslint-rules/no-raw-z-index.cjs
  - frontend/package.json
autonomous: true

must_haves:
  truths:
    - "docs/z-index-ladder.md documents the 11-layer ladder with CSS variable names + integer values"
    - "docs/affordance-checklist.md enumerates 15 keyboard/pointer/a11y affordances with Playwright spec references"
    - "docs/url-contract.md enumerates the 7 preserved URL patterns with validateSearch shapes; backend/tests/test_url_contract.py (plan 05) consumes this doc"
    - "docs/testid-registry.md lists every Playwright-targeted data-testid in the v1.3 surface; testid-registry-only ESLint rule fails CI on unregistered IDs"
    - "frontend/eslint.config.js (flat config) wires the two custom CMC rules; pnpm lint script runs them on src + tests/e2e"
  artifacts:
    - path: "docs/z-index-ladder.md"
      provides: "POLI-09 + CONT-05 — z-index ladder reference doc"
      contains: "--cmc-z-tooltip"
    - path: "docs/affordance-checklist.md"
      provides: "POLI-12 — 15 keyboard/pointer/a11y affordances"
      contains: "Cmd+B"
    - path: "docs/url-contract.md"
      provides: "POLI-13 — URL contract reference (consumed by backend/tests/test_url_contract.py)"
      contains: "/sessions/compare"
    - path: "docs/testid-registry.md"
      provides: "POLI-14 — testid registry consumed by ESLint rule"
      contains: "density-toggle-trigger"
    - path: "frontend/eslint.config.js"
      provides: "Flat ESLint config wiring custom CMC rules; minimal setup (rules are scoped — full lint sweep deferred per research OQ#5)"
      contains: "testid-registry-only"
    - path: "frontend/eslint-rules/testid-registry-only.cjs"
      provides: "Custom ESLint rule — bans data-testid literals not present in docs/testid-registry.md"
      contains: "data-testid"
    - path: "frontend/eslint-rules/no-raw-z-index.cjs"
      provides: "Custom ESLint rule — bans raw z-index integers in inline style and forces --cmc-z-* CSS variables"
      contains: "z-index"
  key_links:
    - from: "frontend/eslint-rules/testid-registry-only.cjs"
      to: "docs/testid-registry.md"
      via: "rule reads markdown bullet list at rule-init; matches JSXAttribute name=data-testid against parsed registry"
      pattern: "testid-registry"
    - from: "backend/tests/test_url_contract.py (plan 05)"
      to: "docs/url-contract.md"
      via: "regex-parses backtick-quoted URL patterns from the routes table"
      pattern: "url-contract"
    - from: "frontend/package.json"
      to: "frontend/eslint.config.js"
      via: "lint script: 'eslint . --max-warnings 0'"
      pattern: "\"lint\":"
---

<objective>
Ship every documentation artifact + ESLint scaffolding required by POLI-09 (z-index reference), POLI-12 (affordance checklist), POLI-13 (URL contract — paired with the pytest gate from plan 05), and POLI-14 (testid registry + ESLint rule).

This plan is documentation-and-config heavy by design. No new React components; no styles.css edits. The two custom ESLint rules are minimal (per research OQ#5: "minimal ESLint setup that runs only the cmc/testid-registry-only rule + the cmc/no-raw-z-index rule on commit hook. Full lint sweep is deferred."). The intent is **invariant enforcement, not project-wide stylistic linting**.

Output:
- 4 markdown docs under `docs/` (newly created top-level directory).
- `frontend/eslint.config.js` flat config + `frontend/eslint-rules/` plugin module + 2 rule files.
- `frontend/package.json` `lint` script entry.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md
@.planning/phases/24-shell-density-containment-primitives/24-01-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-04-SUMMARY.md

@frontend/src/styles.css
@frontend/src/routes/index.tsx
@frontend/package.json

<interfaces>
Z-index ladder integer values (from plan 01 styles.css):
- --cmc-z-base: 0
- --cmc-z-sticky: 10
- --cmc-z-sidebar: 20
- --cmc-z-header: 20
- --cmc-z-tooltip: 30
- --cmc-z-popover: 40
- --cmc-z-dropdown: 50
- --cmc-z-sheet: 60 (panel = 61)
- --cmc-z-dialog: 70 (panel = 71)
- --cmc-z-cmdk: 80
- --cmc-z-toast: 90
- --cmc-z-banner: 100

Routes (from frontend/src/routes/, verified):
- `/` (index.tsx)
- `/activity` (activity.tsx)
- `/skills` (skills.tsx)
- `/skills/$name` (skills_.$name.tsx)
- `/sessions/compare?a=...&b=...` (sessions_.compare.tsx) — only existing validateSearch route in v1.2
- `/cost` (cost.tsx)
- `/alerts` (alerts.tsx)

Testids introduced by Phase 24 (consolidate from plans 02, 04, 03):
- Plan 02: `density-toggle-trigger`, `density-option-compact`, `density-option-comfortable`, `density-option-cozy`
- Plan 04: `sidebar-collapse-toggle`, `sidebar-link-{slug}` (pattern), `time-picker-trigger`, `save-view-button`, `cmdk-trigger`
- Plan 03: `cell-copy-btn`

v1.2 baseline testids: extracted via grep `data-testid=` across `frontend/src/`. Plan 06 task 4 must enumerate the v1.2 baseline + Phase 24 additions to seed testid-registry.md.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author z-index-ladder.md, affordance-checklist.md, url-contract.md</name>
  <files>docs/z-index-ladder.md, docs/affordance-checklist.md, docs/url-contract.md</files>
  <action>
Create the `docs/` top-level directory if it doesn't exist (verified absent by `ls /Users/patrykattc/work/git/claude-mission-control/docs/` — the dir is new in Phase 24). Then write the three docs below.

1. **`docs/z-index-ladder.md`** (CONT-05):
   ```markdown
   # Z-index ladder

   Single source of truth for stacking order in the dashboard surface. Every overlay primitive MUST use a `--cmc-z-*` CSS variable; raw integers are forbidden in `frontend/src/styles.css` (except inside `:root`) and in component-level inline `style={{ zIndex: ... }}`. The `cmc/no-raw-z-index` ESLint rule enforces this.

   Established: Phase 24 (CONT-05). Variable definitions live in `frontend/src/styles.css :root`.

   ## Order (low to high)

   | Layer            | CSS variable                       | Value | Use case |
   |------------------|------------------------------------|------:|----------|
   | Base flow        | `--cmc-z-base`                     |     0 | Default content |
   | Sticky chrome    | `--cmc-z-sticky`                   |    10 | Sticky table headers; sticky filter bars |
   | Shell chrome     | `--cmc-z-sidebar` / `--cmc-z-header` |  20 | Sidebar + AppShellHeader |
   | Tooltip          | `--cmc-z-tooltip`                  |    30 | Hover/focus tooltips |
   | Popover          | `--cmc-z-popover`                  |    40 | Time picker (Phase 26), info popovers |
   | DropdownMenu     | `--cmc-z-dropdown`                 |    50 | Density picker, row actions, save-view menu (Phase 25) |
   | Sheet            | `--cmc-z-sheet` (panel +1)         | 60/61 | Side-drawer overlays + panel |
   | AlertDialog      | `--cmc-z-dialog` (panel +1)        | 70/71 | Destructive confirms |
   | Cmd+K palette    | `--cmc-z-cmdk`                     |    80 | Above all routine overlays |
   | Toast / pip      | `--cmc-z-toast`                    |    90 | Transient notifications (Copied, etc.) |
   | Emergency banner | `--cmc-z-banner`                   |   100 | Top-priority safety signal |

   ## Rules

   - **Never use a raw integer for z-index** in component CSS or inline style. Use a `--cmc-z-*` variable.
   - **Never break the ladder.** New layers slot into the gaps (15, 35, 55, ...) by adding a new variable in `styles.css :root` AND updating this doc in the same commit.
   - **Tooltips inside Sheets/Dialogs:** the tooltip's portal mounts at `document.body`, so its stacking context is the root. Tooltip z-index (30) is BELOW Sheet (60) — meaning a tooltip mounted while a Sheet is open will be hidden behind the Sheet. This is the intended behavior for v1.3.

   ## ESLint enforcement

   `frontend/eslint-rules/no-raw-z-index.cjs` bans:
   - `style={{ zIndex: <number> }}` literals in JSX.
   - (CSS-side enforcement is policy-only; styles.css is hand-curated and human-reviewed.)

   ## Conflict history

   Pre-Phase 24, Tooltip (50) and CommandPalette (50) collided. Resolution: Tooltip → 30, CommandPalette → 80 (well above all routine overlays). AlertDialog moved up from 45/46 → 70/71 to sit above Sheet, matching the destructive-confirm priority.
   ```

2. **`docs/affordance-checklist.md`** (POLI-12 — 15 entries enumerated):
   ```markdown
   # Affordance checklist

   15 keyboard / pointer / a11y affordances every route must honor. Verified at every phase close as part of `.planning/phases/{N}/{N}-VISUAL-CHECK.md`.

   Established: Phase 24 (POLI-12). Surface scope: every route under `frontend/src/routes/`.

   | # | Affordance | Verification spec | Notes |
   |--:|------------|-------------------|-------|
   | 1 | `Cmd+K` opens command palette from any route | `frontend/tests/e2e/command-palette.spec.ts` | v1.0 baseline; preserved by Phase 24 |
   | 2 | `Esc` closes Sheet, AlertDialog, DropdownMenu, Cmd+K | Manual + axe-core `keyboard` rule via `tests/e2e/v13-a11y.spec.ts` | Radix default behavior |
   | 3 | `Cmd+B` (or `Ctrl+B`) toggles sidebar collapsed state | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-04 |
   | 4 | Click outside Sheet/Popover/DropdownMenu closes it | Radix default; verified by axe-core fixture | All overlays must use Radix Portal |
   | 5 | `Tab` cycles focus inside Sheet without escaping | Radix default; assert focus stays in Sheet panel | Manual verification in VISUAL-CHECK |
   | 6 | Closing Sheet returns focus to its trigger | Radix default; assert `document.activeElement === trigger` | Manual verification |
   | 7 | `Tab` reaches every interactive element on every route | Manual tab-walk audit + axe-core `tabindex` rule | Verified at phase close |
   | 8 | Visible focus ring on every focusable element | axe-core `focus-order-semantics` | Tested by `tests/e2e/v13-a11y.spec.ts` |
   | 9 | Theme toggle persists via localStorage `cmc.theme` | `frontend/tests/e2e/theme-toggle.spec.ts` | v1.0 baseline; preserved |
   | 10 | Density toggle persists via localStorage `cmc.density` | `frontend/tests/e2e/v13-density.spec.ts` | Phase 24 DENS-03 |
   | 11 | Sidebar collapsed state persists via localStorage `cmc.sidebar.collapsed` | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-04 |
   | 12 | Click-to-copy on session-id / cwd / skill-name shows confirmation pip | `frontend/tests/e2e/v13-copy-cell.spec.ts` | Activates fully in Phase 26/27 column adoption |
   | 13 | Truncated cells show full value on hover via tooltip | `frontend/tests/e2e/v13-truncation.spec.ts` | Phase 24 CONT-03; activates fully in Phase 26/27 column adoption |
   | 14 | Active route highlighted in sidebar (left-edge bar + tinted bg) — visible in collapsed mode too | `frontend/tests/e2e/v13-sidebar.spec.ts` | Phase 24 SHEL-03 |
   | 15 | Sheet body scrolls internally; outer page does not gain a scrollbar | `frontend/tests/e2e/v13-portal-containment.spec.ts` (related) + manual VISUAL-CHECK | Per-route adoption is Phase 26/27 (`bounded` prop opt-in) |

   ## Mobile / narrow viewport

   Out of scope for v1.3. The dashboard is local-only single-user macOS. Below 768px viewport width, the sidebar overflows; that's accepted. Re-evaluate in v2 if multi-browser coverage becomes a goal.

   ## ResizeObserver browser floor

   `tests/e2e/v13-truncation.spec.ts` and `frontend/src/components/ui/TruncatedCell.tsx` use `ResizeObserver` (Chrome 64+, Safari 13.1+, Firefox 69+). macOS Sonoma 14+ is the assumed user environment.
   ```

3. **`docs/url-contract.md`** (POLI-13 — paired with backend/tests/test_url_contract.py from plan 05):
   ```markdown
   # URL contract

   Every URL pattern in this document is preserved across phases. Breaking a pattern requires explicit migration planning + a deprecation phase. The `backend/tests/test_url_contract.py` pytest gate fails CI if a documented pattern is missing from `frontend/src/routes/`.

   Established: Phase 24 (POLI-13). Locked invariant from REQUIREMENTS.md milestone constraints: "Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive validateSearch changes are forbidden."

   ## Routes

   | URL pattern         | Route file                       | Description                            | validateSearch shape |
   |---------------------|----------------------------------|----------------------------------------|----------------------|
   | `/`                 | `routes/index.tsx`               | Mission Control / Home                 | none in v1.2; Phase 26 may add |
   | `/activity`         | `routes/activity.tsx`            | Activity heatmap + sessions list       | none in v1.2; Phase 26 may add |
   | `/skills`           | `routes/skills.tsx`              | Skills registry                        | none in v1.2 |
   | `/skills/$name`     | `routes/skills_.$name.tsx`       | Skill detail (per-skill panels)        | none in v1.2 |
   | `/sessions/compare` | `routes/sessions_.compare.tsx`   | Session compare (TWO-arg required)     | `{ a: string, b: string }` (validated; v1.2 baseline) |
   | `/cost`             | `routes/cost.tsx`                | Cost analytics                         | none in v1.2 |
   | `/alerts`           | `routes/alerts.tsx`              | Alert rules + events                   | none in v1.2 |

   ## Stability rules

   - **Adding a search param to an existing route is BACKWARDS-COMPATIBLE if and only if** the new param has a default value that reproduces the pre-change behavior. Rolling forward Phase 25 / 26 / 27 / 28 changes adhere to this rule.
   - **Removing a search param requires a deprecation phase.** Telegram deep-links and browser bookmarks must continue to resolve.
   - **Renaming a route file requires a phase-level migration plan + a redirect** from old to new (or graceful 404 with explanation). Forbidden as a silent rename.
   - **`schemaVersion` field on every route's `validateSearch` shape (Phase 25)** — append-only schema evolution.

   ## Phase 24 effects on URL contract

   - No new routes added; no validateSearch shapes changed. Phase 24 is shell + primitives + quality gates only.
   - The `cmc.density`, `cmc.theme`, `cmc.sidebar.collapsed` keys are localStorage-only — they intentionally do NOT enter the URL.

   ## Test gate

   `backend/tests/test_url_contract.py` (Phase 24 plan 05) parses this doc and asserts:
   1. Every URL pattern documented here has a corresponding route file in `frontend/src/routes/`.
   2. Every route file in `frontend/src/routes/` (excluding `__root.tsx` and `routeTree.gen.ts`) is documented here.

   Both directions enforce drift-free coverage.
   ```

4. Verify the regex-parsed URL patterns in `docs/url-contract.md` match what `backend/tests/test_url_contract.py` (plan 05) produces. The test-side regex is `r"\|\s*\`(/[\w$./-]+)\`"` — it captures backtick-quoted strings starting with `/`. The 7 documented patterns must each appear as `` `/pattern` `` in the table. Verify after writing.
  </action>
  <verify>
    <automated>test -f docs/z-index-ladder.md && test -f docs/affordance-checklist.md && test -f docs/url-contract.md && grep -q '\-\-cmc-z-tooltip' docs/z-index-ladder.md && grep -q 'Cmd+B' docs/affordance-checklist.md && grep -c '^| 1[0-5]' docs/affordance-checklist.md && grep -q '/sessions/compare' docs/url-contract.md && grep -q '/skills/\$name' docs/url-contract.md && cd backend && python -m pytest tests/test_url_contract.py -v --no-header 2>&1 | head -30</automated>
  </verify>
  <done>3 docs exist; z-index-ladder.md lists all 11 layers; affordance-checklist.md has exactly 15 numbered rows; url-contract.md lists all 7 routes with backtick-quoted patterns. After this task, `backend/tests/test_url_contract.py` (plan 05) PASSES (no longer skipped).</done>
</task>

<task type="auto">
  <name>Task 2: Author docs/testid-registry.md from v1.2 baseline grep + Phase 24 additions</name>
  <files>docs/testid-registry.md</files>
  <action>
1. Extract every existing `data-testid=` literal from `frontend/src/`:
   ```bash
   cd frontend && rg -h "data-testid=[\"']([^\"'\\$]+)[\"']" src/ -o -r '$1' | sort -u
   ```
   Capture the result. These are the v1.2 baseline testids.

2. Extract dynamic testid patterns (template literals or expressions):
   ```bash
   cd frontend && rg -n "data-testid=\\{" src/ | head -50
   ```
   For each, identify the pattern (e.g., `sidebar-link-${slug}` produces `sidebar-link-{slug}`). These become "patterns" in the registry, not exact IDs.

3. Add Phase 24 testids (from plan 02, 03, 04):
   - `density-toggle-trigger`
   - `density-option-compact`, `density-option-comfortable`, `density-option-cozy`
   - `sidebar-collapse-toggle`
   - `sidebar-link-{slug}` (pattern; slugs: `home`, `activity`, `sessions-compare`, `skills`, `cost`, `alerts`)
   - `time-picker-trigger`
   - `save-view-button`
   - `cmdk-trigger`
   - `cell-copy-btn`

4. Write `docs/testid-registry.md` with the following structure:

   ```markdown
   # data-testid registry

   Every Playwright-targeted DOM element MUST have its `data-testid` value listed here.
   Adding a new testid without updating this doc fails the `cmc/testid-registry-only`
   ESLint rule (frontend/eslint-rules/testid-registry-only.cjs).

   Established: Phase 24 (POLI-14). Skip count locked at v1.2 baseline of 2 known skips
   (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`); exceeding 2
   skips fails phase verification.

   ## Static testids (exact-match)

   ### Shell (Phase 24)
   - `density-toggle-trigger` — `frontend/src/components/shell/DensityToggle.tsx`
   - `density-option-compact` — DensityToggle DropdownMenu item
   - `density-option-comfortable` — DensityToggle DropdownMenu item
   - `density-option-cozy` — DensityToggle DropdownMenu item
   - `sidebar-collapse-toggle` — `frontend/src/components/shell/Sidebar.tsx`
   - `time-picker-trigger` — `frontend/src/components/shell/AppShellHeader.tsx` (placeholder; wired in Phase 26)
   - `save-view-button` — `frontend/src/components/shell/AppShellHeader.tsx` (placeholder; wired in Phase 25)
   - `cmdk-trigger` — `frontend/src/components/shell/AppShellHeader.tsx`

   ### UI primitives (Phase 24)
   - `cell-copy-btn` — `frontend/src/components/ui/CopyIconButton.tsx`

   ### Pre-Phase-24 baseline (extracted via `rg -h "data-testid=[\"']([^\"'\$]+)[\"']" src/ -o -r '$1' | sort -u`)
   {LIST EVERY EXACT-MATCH testid extracted from the v1.2 codebase here, one per bullet}

   ## Dynamic testids (pattern-match)

   These testids are constructed at runtime from variable input (e.g., row id, route slug). The ESLint rule recognizes them via the `data-testid-pattern` annotation (placed as a JSDoc-adjacent comment on the JSXAttribute):

   - `sidebar-link-{slug}` — `frontend/src/components/shell/SidebarNavLink.tsx`. Slug is derived from `to` prop. Phase 24 routes: `home`, `activity`, `sessions-compare`, `skills`, `cost`, `alerts`.
   {LIST EVERY DYNAMIC testid pattern from the v1.2 codebase here, with the file location and the variable source}

   ## Skip count

   - v1.2 baseline: 2 known skips.
   - Phase 24 additions: 0 (no new skips introduced).
   - Skip count locked at 2. Exceeding it fails phase verification.

   ## ESLint enforcement

   `frontend/eslint-rules/testid-registry-only.cjs` bans:
   - JSX `data-testid="..."` literals not present in this doc's static-testids list.
   - JSX `data-testid={\`...${expr}\`}` expressions without a matching `data-testid-pattern` annotation referencing this doc's dynamic-testids list.

   To add a new testid:
   1. Add a bullet to the relevant section above.
   2. Use the testid in code.
   3. ESLint passes; commit lands.
   ```

5. Run the v1.2 baseline grep CAREFULLY — record every exact-match testid found. The illustrative `{LIST EVERY...}` placeholders MUST be replaced with the actual results from the grep. If the grep finds no testids (unlikely — Playwright tests must target SOMETHING), document that and proceed with only the Phase 24 additions.
  </action>
  <verify>
    <automated>test -f docs/testid-registry.md && grep -q 'density-toggle-trigger' docs/testid-registry.md && grep -q 'sidebar-link' docs/testid-registry.md && grep -q 'cell-copy-btn' docs/testid-registry.md && grep -q 'cmdk-trigger' docs/testid-registry.md && grep -q 'time-picker-trigger' docs/testid-registry.md && grep -q 'save-view-button' docs/testid-registry.md</automated>
  </verify>
  <done>`docs/testid-registry.md` lists Phase 24 additions (9 static + 1 pattern) AND every v1.2 baseline testid extracted via grep. Skip count documented. ESLint rule contract documented.</done>
</task>

<task type="auto">
  <name>Task 3: Author the two custom ESLint rules + flat config + lint script</name>
  <files>frontend/eslint-rules/index.js, frontend/eslint-rules/testid-registry-only.cjs, frontend/eslint-rules/no-raw-z-index.cjs, frontend/eslint.config.js, frontend/package.json</files>
  <action>
1. Verify ESLint and required packages are installed (research OQ#5: no ESLint config existed in repo today). Install minimum:
   ```bash
   cd frontend && pnpm add -D eslint@^9 typescript-eslint@^8 @typescript-eslint/parser@^8
   ```
   ESLint 9 uses flat config by default. typescript-eslint v8 is React-19 compatible.

2. **Create `frontend/eslint-rules/testid-registry-only.cjs`**:
   ```js
   /**
    * cmc/testid-registry-only — POLI-14.
    * Forbids JSX `data-testid="..."` literals not present in docs/testid-registry.md.
    * For dynamic values (template literals with expressions), requires a
    * `data-testid-pattern` annotation comment matching a registered pattern.
    *
    * Implementation:
    *   1. Load docs/testid-registry.md once at rule init; parse bullet items.
    *   2. Visit JSXAttribute name="data-testid"; check membership.
    */
   const fs = require('node:fs')
   const path = require('node:path')

   function loadRegistry() {
     // docs/ lives at the repo root; from frontend/eslint-rules/, go up two levels.
     const docPath = path.resolve(__dirname, '..', '..', 'docs', 'testid-registry.md')
     if (!fs.existsSync(docPath)) return { exact: new Set(), patterns: [] }
     const text = fs.readFileSync(docPath, 'utf8')
     const exact = new Set()
     const patterns = []
     // Match bullet list items with backtick-quoted IDs at the start.
     // Lines like "- `density-toggle-trigger` — description"
     for (const m of text.matchAll(/^-\s+`([^`]+)`/gm)) {
       const id = m[1]
       if (id.includes('{') && id.includes('}')) {
         // dynamic: convert sidebar-link-{slug} to a regex
         const re = new RegExp('^' + id.replace(/\{[^}]+\}/g, '[^\\s"\']+') + '$')
         patterns.push(re)
       } else {
         exact.add(id)
       }
     }
     return { exact, patterns }
   }

   const REGISTRY = loadRegistry()

   module.exports = {
     meta: {
       type: 'problem',
       docs: { description: 'Restricts data-testid usage to the values registered in docs/testid-registry.md' },
       schema: [],
       messages: {
         unregistered: 'data-testid "{{id}}" is not registered in docs/testid-registry.md',
         dynamicUnregistered: 'Dynamic data-testid template "{{template}}" matches no pattern in docs/testid-registry.md',
       },
     },
     create(context) {
       return {
         JSXAttribute(node) {
           if (!node.name || node.name.name !== 'data-testid') return
           const v = node.value
           if (!v) return
           // string literal
           if (v.type === 'Literal' && typeof v.value === 'string') {
             if (!REGISTRY.exact.has(v.value)) {
               context.report({ node, messageId: 'unregistered', data: { id: v.value } })
             }
             return
           }
           // template literal (e.g., `sidebar-link-${slug}`)
           if (v.type === 'JSXExpressionContainer' && v.expression.type === 'TemplateLiteral') {
             const tpl = v.expression
             if (tpl.expressions.length === 0) {
               // pure template, treat as literal
               const raw = tpl.quasis.map(q => q.value.cooked).join('')
               if (!REGISTRY.exact.has(raw)) {
                 context.report({ node, messageId: 'unregistered', data: { id: raw } })
               }
               return
             }
             // Reconstruct as `prefix${X}suffix` -> matches pattern with placeholder
             const reconstructed = tpl.quasis.map((q, i) => q.value.cooked + (i < tpl.expressions.length ? '{x}' : '')).join('')
             const ok = REGISTRY.patterns.some(p =>
               p.test(reconstructed.replace(/\{x\}/g, 'XXX')) ||
               p.test(reconstructed.replace(/\{x\}/g, ''))
             )
             if (!ok) {
               context.report({ node, messageId: 'dynamicUnregistered', data: { template: reconstructed } })
             }
           }
         },
       }
     },
   }
   ```

3. **Create `frontend/eslint-rules/no-raw-z-index.cjs`**:
   ```js
   /**
    * cmc/no-raw-z-index — CONT-05 enforcement.
    * Bans JSX `style={{ zIndex: <number> }}` literals. CSS files are policy-only
    * (out of scope for ESLint; reviewed via PR).
    */
   module.exports = {
     meta: {
       type: 'problem',
       docs: { description: 'Disallows raw zIndex integers in JSX inline style; use --cmc-z-* CSS variables.' },
       schema: [],
       messages: {
         rawZIndex: 'Raw zIndex {{value}} in inline style — use a --cmc-z-* CSS variable from styles.css :root.',
       },
     },
     create(context) {
       return {
         Property(node) {
           if (!node.key) return
           const keyName = node.key.name || node.key.value
           if (keyName !== 'zIndex') return
           const v = node.value
           if (v.type === 'Literal' && typeof v.value === 'number') {
             context.report({ node, messageId: 'rawZIndex', data: { value: String(v.value) } })
           }
         },
       }
     },
   }
   ```

4. **Create `frontend/eslint-rules/index.js`** (plugin module):
   ```js
   module.exports = {
     rules: {
       'testid-registry-only': require('./testid-registry-only.cjs'),
       'no-raw-z-index': require('./no-raw-z-index.cjs'),
     },
   }
   ```

5. **Create `frontend/eslint.config.js`** (flat config — ESLint 9 default):
   ```js
   import tseslint from 'typescript-eslint'
   import cmc from './eslint-rules/index.js'

   export default [
     {
       ignores: ['dist/**', 'node_modules/**', 'src/routes/routeTree.gen.ts'],
     },
     ...tseslint.configs.recommended,
     {
       files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
       plugins: { cmc },
       rules: {
         'cmc/testid-registry-only': 'error',
         'cmc/no-raw-z-index': 'error',
         // Per research OQ#5: minimal scope. Disable noisy typescript-eslint
         // rules that would require a full lint sweep — that's deferred.
         '@typescript-eslint/no-explicit-any': 'off',
         '@typescript-eslint/no-unused-vars': 'off',
         '@typescript-eslint/no-empty-object-type': 'off',
       },
     },
   ]
   ```
   The minimal scope (research OQ#5: "minimal ESLint setup that runs only the cmc/testid-registry-only rule + the cmc/no-raw-z-index rule") is intentional. A full lint sweep is deferred — phases 25+ may opt in to additional rules if they choose.

   Note: `eslint-rules/index.js` uses CommonJS `module.exports` while `eslint.config.js` uses ESM `import`. Node resolves `./eslint-rules/index.js` as ESM by default (since `package.json` likely lacks `"type": "commonjs"`). Verify by trying `node --input-type=module -e "import('./frontend/eslint-rules/index.js').then(m => console.log(Object.keys(m.default.rules)))"`. If ESM/CJS interop fails, rename `eslint-rules/index.js` to `eslint-rules/index.cjs` AND change the import to `import cmc from './eslint-rules/index.cjs'`. Document the chosen extension in the plan SUMMARY.

6. **Update `frontend/package.json`**: add to the `scripts` block:
   ```json
   "lint": "eslint . --max-warnings 0"
   ```

7. **Run `pnpm lint` to confirm cleanliness.** Expected outcome:
   - The two custom rules fire on any unregistered testid or raw zIndex.
   - `typescript-eslint/recommended` rules fire on TS hygiene issues. The disable list above silences the most likely offenders for v1.2 carry-forward code; if other rules fire too aggressively, append more disables to the rules block. **The goal is that `pnpm lint` exits 0 on the existing v1.2-baseline + Phase 24 codebase.**

   If a v1.2 file uses a testid that the grep missed (and thus isn't in `docs/testid-registry.md`), the lint failure points to it — add the testid to the registry and re-run. This is the intended bootstrap path.
  </action>
  <verify>
    <automated>cd frontend && test -f eslint.config.js && test -f eslint-rules/testid-registry-only.cjs && test -f eslint-rules/no-raw-z-index.cjs && grep -q '"lint":' package.json && pnpm lint 2>&1 | tail -20</automated>
  </verify>
  <done>ESLint flat config loads. Both custom rules registered. `pnpm lint` exits 0 against the existing codebase + Phase 24 additions. If lint exits non-zero on a legitimate v1.2 testid, the registry was incomplete — task 2 should be re-run with the missing IDs added. The custom rules WILL fire if a future plan introduces an unregistered testid OR a raw zIndex literal — that's the contract.</done>
</task>

</tasks>

<verification>
```bash
# Docs sanity
test -f docs/z-index-ladder.md
test -f docs/affordance-checklist.md
test -f docs/url-contract.md
test -f docs/testid-registry.md

# URL contract pytest now passes (was skipping pre-plan-06).
cd backend && python -m pytest tests/test_url_contract.py -v

# ESLint clean.
cd frontend && pnpm lint

# Existing test counts unchanged (no production code touched in this plan).
cd frontend && pnpm vitest run --reporter=dot
cd backend && python -m pytest -q
```
</verification>

<success_criteria>
1. `docs/` directory exists with 4 markdown files (z-index-ladder, affordance-checklist, url-contract, testid-registry).
2. z-index-ladder.md lists all 11 layers + integer values + ESLint enforcement note.
3. affordance-checklist.md has exactly 15 numbered rows; each row references a Playwright spec or manual verification path.
4. url-contract.md lists all 7 v1.2-baseline routes; the `backend/tests/test_url_contract.py` pytest passes (no longer skipping).
5. testid-registry.md catalogs every v1.2-baseline testid (extracted via grep) + 9 Phase 24 static testids + at least 1 dynamic pattern (`sidebar-link-{slug}`).
6. `frontend/eslint.config.js` (flat config) loads typescript-eslint recommended + cmc/* custom rules.
7. `frontend/eslint-rules/testid-registry-only.cjs` fires on unregistered testids; tested via a quick negative case if desired.
8. `frontend/eslint-rules/no-raw-z-index.cjs` fires on raw `zIndex: <number>` in JSX inline style.
9. `package.json` `lint` script defined.
10. `pnpm lint` exits 0 on the current codebase.
11. Frontend vitest + backend pytest counts unchanged from plan 04 close (no production code touched here; only docs + ESLint config + the URL-contract pytest now PASSING instead of skipping).
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-06-SUMMARY.md` per the standard SUMMARY template, recording:
- Final v1.2-baseline testid list extracted from `frontend/src/`
- Whether `eslint-rules/index.js` ended up as CJS or ESM (interop note)
- Any typescript-eslint rule disables added beyond the initial 3 to keep `pnpm lint` clean
- Confirmation that `backend/tests/test_url_contract.py` PASSES (no longer skipping)
</output>
