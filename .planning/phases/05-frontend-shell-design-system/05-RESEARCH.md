# Phase 5: Frontend Shell & Design System — Research

**Researched:** 2026-04-26
**Domain:** React 19 SPA shell on Vite 8 + TanStack Router 1.168 + bespoke design system primitives composed from Radix UI unstyled primitives + cmdk + framer-motion 12; React Query 5 fetcher infrastructure; Vitest 4 + React Testing Library 16 with co-located `__tests__/` per primitive on happy-dom.
**Confidence:** HIGH on stack versions (every package version verified against npm registry on 2026-04-26), HIGH on architectural patterns (mirror Phase 1 frontend layout already shipped + Phase 4 wave structure), MEDIUM on Radix-in-jsdom pitfalls (well-documented community polyfills, but Phase 5's primitives mostly avoid the riskiest APIs since Sheet/Tooltip/Collapsible are simpler than Select/Popover with positioning), HIGH on framer-motion testing approach (use `MotionConfig reducedMotion="always"` in tests instead of mocking).

## Summary

Phase 5 is a greenfield React shell built atop the Phase 1 foundation (Vite 8, React 19.2, TanStack Router 1.168, TypeScript 6 — all already in `frontend/package.json`). CONTEXT.md locks every primary dependency: `@tanstack/react-query`, `framer-motion`, `cmdk`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-tooltip`, `@radix-ui/react-collapsible`. UI-SPEC.md locks every visual decision: tokens, motion durations, copy, accessibility. The research role here is to verify the stack is internally consistent on React 19, document the integration patterns the planner will translate into tasks, and surface the test-environment gotchas that bite first-time Vitest+Radix users.

Three findings drive plan structure. First — the locked dependency set composes cleanly on React 19 without `--legacy-peer-deps`: every Radix primitive's peer range now includes `^19.0.0` [VERIFIED: npm view 2026-04-26]; cmdk@1.1.1 also lists `^19` (the React 19 conflict reported in older `cmdk@1.0.0` was fixed in 1.0.4) [VERIFIED: npm view cmdk peerDependencies]; cmdk transitively depends on `@radix-ui/react-dialog ^1.1.6` [VERIFIED: npm view cmdk dependencies] — installing `@radix-ui/react-dialog ^1.1.15` for Sheet upgrades cmdk's transitive copy into a single resolved version, no duplicate React-context bug. Second — `framer-motion` is the canonical package name (12.38.0, last published 2026-03-17 [VERIFIED: npm view framer-motion]); the recently published `motion@12.38.0` package is a thin re-export wrapper that depends on `framer-motion@^12.38.0`. The motion docs actively recommend `motion/react` as the import surface going forward but the framer-motion package is NOT deprecated and the library publishers ship both [CITED: motion.dev/docs/react-upgrade-guide]. UI-SPEC says `framer-motion`; we keep that name. Third — testing Radix primitives in jsdom requires a small known shim set (`HTMLElement.prototype.hasPointerCapture`, `releasePointerCapture`, `scrollIntoView`, plus a `ResizeObserver` stub) and framer-motion animations must be neutralized via `<MotionConfig reducedMotion="always">` in the test wrapper rather than via module mocks [CITED: luisball.com testing Radix UI guide]. This is straightforward — one `setupFiles` entry — but skipping it produces opaque `target.hasPointerCapture is not a function` failures on Sheet open.

**Primary recommendation:** Adopt CONTEXT.md's recommended 4-plan wave structure verbatim. Wave 0 lands `frontend/package.json` deps + Vitest 4 config (happy-dom + RTL setup file with the Radix shims) + design-token CSS replacement + `lib/storage.ts` + `lib/api.ts` scaffolding + `<AppShell>` + `<NavBar>` + the three TanStack Router file routes. Wave 1 splits primitives across two parallel plans (layout-only vs. interactive-with-Radix) so one executor can land Card/Button/Badge/etc. while another lands Sheet/CollapsibleSection/CommandPalette without merge conflict. Wave 2 ships placeholder card grids per route + a thin integration smoke test (does `/`, `/activity`, `/skills` mount without throwing? does Cmd+K open the palette?). Use happy-dom (Vitest's recommended default — 2-4× faster than jsdom and adequate once the Radix shims are in place [CITED: pkgpulse.com 2026 happy-dom vs jsdom]).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File-based route registration (`/`, `/activity`, `/skills`) | Browser / Client (`frontend/src/routes/{__root,index,activity,skills}.tsx`) | Vite plugin (`@tanstack/router-plugin/vite` regenerates `routeTree.gen.ts`) | Pure client-side SPA — FastAPI serves the SPA shell as static files (FOUND-06). No SSR boundary in this project. |
| Top navigation + active state | Browser / Client (`<NavBar>` rendered inside `<AppShell>`) | TanStack Router (`<Link activeProps>`) | NavBar is a leaf component in the shell tree; active highlight via `activeProps.className` not manual location matching. |
| Design tokens + radial-gradient backdrop | Browser / Client (`frontend/src/styles.css` `:root` block) | — | Pure CSS custom properties. No JS runtime cost. |
| AppShell layout slots + outlet | Browser / Client (`<AppShell>` wrapping `<Outlet />` from TanStack Router) | — | Layout is a structural container — header + main slot. KpiRow slot intentionally NOT reserved (CONTEXT decision). |
| Bespoke layout primitives (Card, Button, Badge, StatePill, Skeleton, EmptyState, RelativeTime) | Browser / Client (`frontend/src/components/ui/*`) | — | No external behavior dep besides `lucide-react` icons (Button/EmptyState) and `@radix-ui/react-tooltip` (RelativeTime). Pure presentational. |
| Tooltip primitive (FESH-06 + RelativeTime) | Browser / Client (`<Tooltip>` wrapper) | Radix (`@radix-ui/react-tooltip` — 200ms open delay, portal, ARIA) | Wrap Radix's unstyled primitive with our CSS vars; do not hand-roll positioning. |
| Sheet primitive (FESH-04 — right-side drawer) | Browser / Client (`<Sheet>` wrapper) | Radix (`@radix-ui/react-dialog` — focus trap, Esc-to-close, aria-modal, scroll lock) | `react-dialog` provides modal semantics; we add slide-from-right transform via framer-motion. |
| CollapsibleSection (FESH-03) | Browser / Client (`<CollapsibleSection>`) | Radix `@radix-ui/react-collapsible` (ARIA: `aria-expanded`, `aria-controls`) + framer-motion (`<motion.div animate={{ height }}>` for 220ms ease-out) | Radix gives semantics; framer-motion drives the animation. localStorage persistence via our `lib/storage.ts` helper. |
| CommandPalette (FESH-07 — Cmd+K) | Browser / Client (`<CommandPalette>`) | cmdk (`Command.Dialog` + `Command.Item` + fuzzy match) | cmdk also depends on Radix Dialog under the hood — we get the same focus trap/Esc semantics. |
| localStorage persistence (CollapsibleSection state, Phase 6/7 future) | Browser / Client (`frontend/src/lib/storage.ts` — namespaced get/set/remove) | — | Single source of truth; all keys prefix `cmc.`. |
| Data-fetching infra (consumed by Phase 6) | Browser / Client (`frontend/src/lib/api.ts` typed fetchers + `<QueryClientProvider>` in `<AppShell>`) | API / Backend (Phases 3 + 4 endpoints — read-only consumers from Phase 6) | Phase 5 ships infrastructure only; the bare header (CONTEXT decision) means no `useQuery` calls execute in v1. |
| Error boundary (per-route) | Browser / Client (`react-error-boundary` `<ErrorBoundary fallback>` wrapping each route's content) | — | Class-based error boundaries are still required in React 19; `react-error-boundary` packages this as a function-component-friendly API and adds `useErrorBoundary()` reset hook. |
| Co-located primitive tests | Test runner (`vitest --config vitest.config.ts`) | happy-dom + RTL 16 + jest-dom 6 + user-event 14 | Per CONTEXT: co-located `__tests__/` per primitive. happy-dom for speed; jsdom-style polyfills for Radix in `vitest.setup.ts`. |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does NOT exist in the project root [VERIFIED: `test -f /Users/patrykattc/work/git/claude-mission-control/CLAUDE.md` returns missing — same status as Phase 4]. Operative project-level constraints come from `.planning/PROJECT.md` and `.planning/STATE.md`:

- **macOS-only platform** for v1 (PLAT-01 is v2). Phase 5 has no platform-specific code (browser-only) so this is moot for the plan, but Cmd+K vs Ctrl+K is real: cmdk's documented snippet handles both with `e.metaKey || e.ctrlKey` [VERIFIED: Context7 /dip/cmdk]. UI-SPEC's "Cmd+K" label can stay; the binding accepts both.
- **Bind to 127.0.0.1 only** (backend) — Vite dev server already proxies `/api` → `http://127.0.0.1:8765` [VERIFIED: `frontend/vite.config.ts` L19-L24]. Production serves the built SPA from FastAPI same-origin (FOUND-06), no CORS.
- **TypeScript strict mode** is on [VERIFIED: `frontend/tsconfig.json` L8 `"strict": true`, L9-10 `noUnusedLocals` + `noUnusedParameters`]. All Phase 5 primitives must compile under these flags — annotate all props, never use `any`.
- **No tests yet on the frontend** — `node_modules/.bin/vitest` does not exist [VERIFIED: directory listing on 2026-04-26]; package.json has no `test` script [VERIFIED: `frontend/package.json`]. Phase 5 introduces the entire test infra. (Phase 9 layers Playwright on top — that's a separate test framework, not a Vitest replacement.)
- **`commit_docs: true`** [VERIFIED: `.planning/config.json`] — research and plans get committed; the executor will be told to commit primitives as it lands them.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FESH-01 | TanStack Router with three routes: / (Command), /activity, /skills | §Stack TanStack Router 1.168 + §Architecture Patterns "File-based route layout" — three new files in `frontend/src/routes/` (`index.tsx` exists; add `activity.tsx` + `skills.tsx`); regenerated `routeTree.gen.ts` is committed (project pattern). |
| FESH-02 | AppShell with navigation bar, page layout, and dark theme matching spec palette | §Architecture Patterns "AppShell shape" + §UI-SPEC Token Map; replace Phase 1 stub at `frontend/src/styles.css` lines 1-10 with the full token block; remove the Phase 1 `.cmc-shell`/`.cmc-header`/`.cmc-main` classes (UI-SPEC §Token Map L297). |
| FESH-03 | CollapsibleSection with localStorage persistence, framer-motion 220ms height animation, aria-expanded/controls | §Code Examples "CollapsibleSection (Radix Collapsible + framer-motion)" — Radix gives `aria-expanded`/`aria-controls` for free; framer-motion `<motion.div animate={{ height }}>` drives animation; `lib/storage.ts` persists `cmc.collapsible.{id}` boolean. |
| FESH-04 | Sheet component (right-side drawer) with Esc-to-close, focus trap, aria-modal | §Code Examples "Sheet (Radix Dialog with right-side transform)" — `<Dialog.Root>` gives focus trap + Esc + `aria-modal` for free [VERIFIED: Context7 /websites/radix-ui_primitives "Dialog > Features"]; framer-motion provides the slide-from-right animation. |
| FESH-05 | Card primitives (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter) | §Architecture Patterns "Compound component API" — six exports from one `Card.tsx` file; pure CSS, no behavior. |
| FESH-06 | Button (primary gradient/secondary/ghost), Badge, StatePill, Tooltip components | §Code Examples "Button gradient + hover lift" + §Code Examples "Tooltip (Radix)"; `<Button.tsx>`, `<Badge.tsx>`, `<StatePill.tsx>` are CSS-only; `<Tooltip.tsx>` wraps `@radix-ui/react-tooltip` with locked 200ms `delayDuration`. |
| FESH-07 | CommandPalette via Cmd+K with fuzzy search across pages + quick-task action | §Code Examples "CommandPalette (cmdk + global hotkey)" — copy the verified cmdk pattern verbatim; Cmd+K hotkey via `useEffect` on `keydown`; v1 items = 3 routes + Quick task (no-op per CONTEXT). |
| FESH-08 | Loading skeletons on every panel (not spinners) | §Architecture Patterns "Skeleton" — pure CSS pulse animation (1.5s ease-in-out infinite); inherits parent border-radius via `inherit`. Phase 6/7 USE this primitive — Phase 5 just defines it. |
| FESH-09 | Clear empty states that teach the user what's happening | §Architecture Patterns "EmptyState" — `<EmptyState heading body icon? action?>`; UI-SPEC §Copywriting locks the default body string template. |
| FESH-10 | Relative time display with absolute timestamp on hover tooltip | §Code Examples "RelativeTime"; computes "Nm ago" from a `Date` prop using a tiny pure function (no library — `Intl.RelativeTimeFormat` ships in all evergreen browsers); wraps in our `<Tooltip>` showing absolute ISO. |
| DESG-01 | Dark theme with spec palette | §UI-SPEC Token Map (locked) — direct CSS-var copy. |
| DESG-02 | Layered radial background gradients for subtle depth | §UI-SPEC Color "Background depth" block (locked) — `background-image: radial-gradient(circle at 20% 0%, ...), radial-gradient(circle at 80% 100%, ...)`; `background-attachment: fixed`. |
| DESG-03 | Inter for body, JetBrains Mono for labels/kickers/numeric displays | §UI-SPEC Typography (locked) — Google Fonts CDN URL spelled out: `family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap`. |
| DESG-04 | Card-based layout with 14-16px border radius, 24-32px padding, auto-rows-fr matched heights | §Architecture Patterns "Card grid" — CSS Grid with `grid-auto-rows: 1fr` for matched heights; 14px default radius via `--radius-lg`; padding via `var(--space-lg)` to `var(--space-xl)`. |
| DESG-05 | Panel fade-in on mount (~300ms), collapsible 220ms ease-out, button hover lift 2px with shadow | §UI-SPEC Motion Contract (locked durations); §Code Examples "framer-motion mount fade-in" + `:hover { transform: translateY(-2px); box-shadow: ...; transition: 150ms ease-out }`. |
| DESG-06 | lucide-react icons throughout, consistent style | §Stack: `lucide-react@1.11.0` (current), tree-shakable, peer `react ^16.5.1 || ... || ^19.0.0`. |

## Standard Stack

### Core (already installed — Phase 1, no change)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.5 | UI runtime | [VERIFIED: `frontend/package.json` L12] React 19.2 ships in 2026; concurrent features + `use()` hook; full ecosystem support. |
| react-dom | 19.2.5 | DOM renderer | [VERIFIED: `frontend/package.json` L13] |
| @tanstack/react-router | 1.168.24 | Type-safe routing | [VERIFIED: `frontend/package.json` L14; npm view ⇒ 1.168.24 latest on 2026-04-26]. File-based routing already wired via `@tanstack/router-plugin/vite` plugin in `vite.config.ts`. |
| @tanstack/router-plugin | 1.167.26 (devDep) | Vite plugin auto-generates `routeTree.gen.ts` | [VERIFIED: `frontend/package.json` L19; npm view ⇒ 1.167.27 (one patch newer; non-blocking)] |
| typescript | 6.0.x | Strict-mode TS | [VERIFIED: `frontend/package.json` L24] |
| vite | 8.0.10 | Dev server + bundler | [VERIFIED: `frontend/package.json` L25] |
| @vitejs/plugin-react | 6.0.1 | JSX/HMR | [VERIFIED: `frontend/package.json` L23] |

### New runtime deps (Phase 5 adds to `frontend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-query | 5.100.5 | Server-state cache, dedup, fetch lifecycle | [VERIFIED: npm view @tanstack/react-query version on 2026-04-26 ⇒ 5.100.5, modified 2026-04-25T17:31:46Z]. The canonical async-state library; Phase 5 ships infra (`<QueryClientProvider>` + typed fetchers in `lib/api.ts`); Phase 6 starts calling it. Defaults: `staleTime: 0` (immediately stale), `gcTime: 5min`, `refetchOnWindowFocus: true` [CITED: tanstack.com/query/v5 Important Defaults] — these are sane for Phase 5 (no live data yet); Phase 6 may tune `staleTime` per query. |
| framer-motion | 12.38.0 | Mount animations, height auto-animation, layout transitions | [VERIFIED: npm view framer-motion version on 2026-04-26 ⇒ 12.38.0, modified 2026-03-17]. Peer deps `react ^18.0.0 \|\| ^19.0.0` (React 19 supported) [VERIFIED: npm view framer-motion peerDependencies]. **Naming note:** The motion library was rebranded from "Framer Motion" → "Motion" in 2025; `motion@12.38.0` is published as a thin wrapper depending on `framer-motion@^12.38.0` [VERIFIED: npm view motion dependencies]. UI-SPEC says `framer-motion`; we keep it. Both packages export the same API surface. |
| @radix-ui/react-dialog | 1.1.15 | Sheet primitive (focus trap, Esc, aria-modal, scroll lock) | [VERIFIED: npm view @radix-ui/react-dialog version on 2026-04-26 ⇒ 1.1.15]. Peer `react ^19.0.0` ✓. cmdk depends on `^1.1.6` so installing 1.1.15 satisfies cmdk's transitive requirement with one resolved version [VERIFIED: npm view cmdk dependencies]. |
| @radix-ui/react-tooltip | 1.2.8 | Tooltip primitive (200ms delay, portal, ARIA describedby) | [VERIFIED: npm view @radix-ui/react-tooltip version on 2026-04-26 ⇒ 1.2.8]. Peer `react ^19.0.0` ✓. |
| @radix-ui/react-collapsible | 1.1.12 | CollapsibleSection ARIA semantics + animation hook | [VERIFIED: npm view @radix-ui/react-collapsible version on 2026-04-26 ⇒ 1.1.12]. Peer `react ^19.0.0` ✓. |
| cmdk | 1.1.1 | CommandPalette engine (fuzzy match, keyboard nav, item/group composability) | [VERIFIED: npm view cmdk version on 2026-04-26 ⇒ 1.1.1]. Peer `react ^18 \|\| ^19 \|\| ^19.0.0-rc` ✓. Transitive deps: `@radix-ui/react-id`, `@radix-ui/react-dialog ^1.1.6`, `@radix-ui/react-primitive`, `@radix-ui/react-compose-refs` [VERIFIED]. |
| lucide-react | 1.11.0 | Icon library (DESG-06) | [VERIFIED: npm view lucide-react version on 2026-04-26 ⇒ 1.11.0]. Peer `react ^19.0.0` ✓. Tree-shakable per-icon imports — `import { ChevronDown } from 'lucide-react'`. |
| react-error-boundary | 6.1.1 | Function-component-friendly Error Boundary wrapper | [VERIFIED: npm view react-error-boundary version on 2026-04-26 ⇒ 6.1.1, modified 2026-02-13]. Peer `react ^18.0.0 \|\| ^19.0.0` ✓. React 19 still requires class components for `getDerivedStateFromError`/`componentDidCatch` semantics; this package wraps that as a function API and adds a `useErrorBoundary()` reset hook [CITED: react.dev/reference/react/Component]. |

### New devDeps (Phase 5 adds to `frontend/package.json` devDependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.5 | Test runner | [VERIFIED: npm view vitest version on 2026-04-26 ⇒ 4.1.5, modified 2026-04-23]. Vite-native; uses the same `vite.config.ts` resolution + plugins (no separate transformer). |
| @vitest/coverage-v8 | 4.1.5 | Coverage reporter (V8 native) | [VERIFIED: npm view @vitest/coverage-v8 version ⇒ 4.1.5]. Match vitest version. |
| @testing-library/react | 16.3.2 | RTL component renderer | [VERIFIED: npm view @testing-library/react version on 2026-04-26 ⇒ 16.3.2]. Peer `react ^19.0.0` ✓. v16 is the React 19-compatible major; v15 throws act() warnings on React 19. |
| @testing-library/dom | 10.4.1 | RTL DOM queries (peer dep of `@testing-library/react`) | [VERIFIED: npm view @testing-library/dom version ⇒ 10.4.1]. Required to peer-satisfy `@testing-library/react@16` (peer `^10.0.0`). |
| @testing-library/jest-dom | 6.9.1 | `toBeInTheDocument`, `toHaveAttribute`, etc. matchers | [VERIFIED: npm view @testing-library/jest-dom version ⇒ 6.9.1]. Vitest path is `import '@testing-library/jest-dom/vitest'`. |
| @testing-library/user-event | 14.6.1 | Realistic user interaction simulation | [VERIFIED: npm view @testing-library/user-event version ⇒ 14.6.1]. Required for keyboard tests (Sheet Esc, Cmd+K, Collapsible toggle). |
| happy-dom | 20.9.0 | DOM environment for Vitest | [VERIFIED: npm view happy-dom version on 2026-04-26 ⇒ 20.9.0, modified 2026-04-13]. Vitest's recommended default; 2-4× faster than jsdom in component-test workloads [CITED: pkgpulse.com 2026 happy-dom vs jsdom benchmark]. |
| jsdom | 29.0.2 | (Optional fallback) — DOM environment for Radix-heavy tests if happy-dom shims prove insufficient | [VERIFIED: npm view jsdom version on 2026-04-26 ⇒ 29.0.2, modified 2026-04-07]. Per-file opt-in via `// @vitest-environment jsdom` docblock [CITED: vitest-dev/vitest config/environment.md]. **Recommendation:** install both, default to happy-dom, switch a single primitive's `__tests__/` to jsdom only if its Radix shim set proves insufficient. |

### Alternatives Considered (locked decisions documented for completeness)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `cmdk` | Hand-rolled fuzzy matcher + portal + keyboard nav | UI-SPEC §Registry Safety lists cmdk as recommended; CONTEXT locks it. Hand-rolling fuzzy match alone is ~200 lines + Phase 7 will need composability for actions — cmdk's structure scales better. |
| `framer-motion` | `motion` package (new name) | Same library; UI-SPEC says `framer-motion`. Keep the name; the API surface is identical. Future migration to `motion` is cheap (rename import). |
| `react-error-boundary` | Hand-rolled `class ErrorBoundary extends React.Component` | React 19 still requires class for `getDerivedStateFromError`. The library adds the `useErrorBoundary()` reset hook + `<ErrorBoundary fallbackRender>` API — saves ~30 lines and is the de-facto community standard. |
| `happy-dom` | `jsdom` | Slower, but better-tested compatibility with edge-case browser APIs. Fall back per-file if a Radix primitive misbehaves. |
| `@radix-ui/react-dialog` for Sheet | Hand-rolled focus trap + Esc handler + scroll lock | Phase 5 hand-rolling accessibility-critical primitives is exactly the "don't hand-roll" trap. |
| Tailwind | Bespoke CSS variables + utility classes | UI-SPEC §Design System: "no Tailwind, no Radix shipped — bespoke primitives" is locked. We use CSS custom properties on `:root` and component-scoped CSS. |

**Installation (single command):**
```bash
cd frontend && npm install \
  @tanstack/react-query@^5.100.5 \
  framer-motion@^12.38.0 \
  @radix-ui/react-dialog@^1.1.15 \
  @radix-ui/react-tooltip@^1.2.8 \
  @radix-ui/react-collapsible@^1.1.12 \
  cmdk@^1.1.1 \
  lucide-react@^1.11.0 \
  react-error-boundary@^6.1.1 \
  && npm install --save-dev \
  vitest@^4.1.5 \
  @vitest/coverage-v8@^4.1.5 \
  @testing-library/react@^16.3.2 \
  @testing-library/dom@^10.4.1 \
  @testing-library/jest-dom@^6.9.1 \
  @testing-library/user-event@^14.6.1 \
  happy-dom@^20.9.0 \
  jsdom@^29.0.2
```

**Version verification step (planner: re-run before Wave 0 task lands):**
```bash
for pkg in @tanstack/react-query framer-motion @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-collapsible cmdk lucide-react react-error-boundary vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom jsdom; do
  echo -n "$pkg: "; npm view "$pkg" version
done
```
Document the exact resolved versions in the Wave 0 SUMMARY.md so subsequent waves don't accidentally bump.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       Browser (React 19 SPA)                    │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  main.tsx → ReactDOM.createRoot()                       │   │
│   │     │                                                   │   │
│   │     ▼                                                   │   │
│   │  <RouterProvider router={createRouter({ routeTree })}>  │   │
│   │     │                                                   │   │
│   │     ▼                                                   │   │
│   │  <__root.tsx>                                           │   │
│   │  ├─ <ErrorBoundary fallback>          ← per-route       │   │
│   │  ├─ <QueryClientProvider client>      ← React Query     │   │
│   │  └─ <AppShell>                                          │   │
│   │       ├─ <NavBar routes>              ← TanStack Link   │   │
│   │       │    └─ Cmd+K trigger chip                        │   │
│   │       ├─ <CommandPalette open={cmdkOpen}>               │   │
│   │       │    ↑ global keydown listener (Cmd+K / Ctrl+K)   │   │
│   │       └─ <main><Outlet /></main>                        │   │
│   │            │                                            │   │
│   │            ▼                                            │   │
│   │  routes/index.tsx       routes/activity.tsx     routes/skills.tsx │
│   │    ─ placeholder grid     ─ placeholder grid     ─ placeholder grid │
│   │      (Card + EmptyState)    (Card + EmptyState)    (Card + EmptyState) │
│   │                                                                       │
│   └─────────────────────────────────────────────────────────┘             │
│                                                                           │
│   Primitive library (frontend/src/components/ui/):                        │
│     Layout-only:    Card · Button · Badge · StatePill · Skeleton ·        │
│                     EmptyState · RelativeTime · ErrorBoundary             │
│     Interactive:    Sheet (Radix Dialog) · CollapsibleSection             │
│                     (Radix Collapsible + framer-motion) ·                 │
│                     CommandPalette (cmdk) · Tooltip (Radix)               │
│                                                                           │
│   lib/storage.ts  → namespaced localStorage (cmc.* keys)                  │
│   lib/api.ts      → typed fetchers + types (consumed by Phase 6)          │
│   styles.css      → :root tokens + radial-gradient body backdrop          │
│                                                                           │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │  fetch() through Vite dev proxy /api → :8765
                           │  (production: same-origin, FastAPI serves dist/)
                           ▼
                  FastAPI (Phases 1-4 — already shipped)
```

### Recommended Project Structure

```
frontend/
├── package.json                ← Phase 5 adds 8 runtime + 8 dev deps
├── vite.config.ts              ← already wired; Phase 5 adds vitest-config-from-vite re-export
├── vitest.config.ts            ← NEW: extends vite.config.ts; sets test.environment, setupFiles
├── tsconfig.json               ← already strict; Phase 5 adds "vitest/globals" to compilerOptions.types
└── src/
    ├── main.tsx                ← already exists; Phase 5 wraps RouterProvider with ErrorBoundary + QueryClientProvider
    ├── styles.css              ← Phase 1 stub REPLACED with full token block (UI-SPEC §Token Map)
    ├── routes/
    │   ├── __root.tsx          ← already exists; Phase 5 replaces with <AppShell>
    │   ├── index.tsx           ← already exists; Phase 5 replaces stub with placeholder card grid
    │   ├── activity.tsx        ← NEW: placeholder card grid (Phase 6 fills with ACTV-01..06)
    │   └── skills.tsx          ← NEW: placeholder card grid (Phase 7 fills with SKLP-01..04)
    ├── routeTree.gen.ts        ← regenerated automatically by tanstackRouter Vite plugin
    ├── components/
    │   ├── shell/
    │   │   ├── AppShell.tsx
    │   │   ├── NavBar.tsx
    │   │   └── __tests__/
    │   │       ├── AppShell.test.tsx
    │   │       └── NavBar.test.tsx
    │   └── ui/
    │       ├── Card.tsx        ← compound: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
    │       ├── Button.tsx
    │       ├── Badge.tsx
    │       ├── StatePill.tsx
    │       ├── Skeleton.tsx
    │       ├── EmptyState.tsx
    │       ├── RelativeTime.tsx
    │       ├── Tooltip.tsx
    │       ├── Sheet.tsx
    │       ├── CollapsibleSection.tsx
    │       ├── CommandPalette.tsx
    │       ├── ErrorBoundary.tsx
    │       └── __tests__/
    │           ├── Card.test.tsx
    │           ├── Button.test.tsx
    │           ├── ...
    │           ├── Sheet.test.tsx
    │           ├── CollapsibleSection.test.tsx
    │           └── CommandPalette.test.tsx
    ├── lib/
    │   ├── storage.ts          ← namespaced localStorage helpers
    │   ├── api.ts              ← typed fetchers + endpoint types (Phase 6 starts calling)
    │   └── __tests__/
    │       ├── storage.test.ts
    │       └── api.test.ts
    └── test/
        └── setup.ts            ← global setup: jest-dom matchers, IS_REACT_ACT_ENVIRONMENT, Radix shims, RTL cleanup
```

### Pattern 1: AppShell shape (FESH-02)

**What:** Top-level shell composes `<NavBar>` + a global `<CommandPalette>` + `<main><Outlet /></main>`. Mounts `QueryClientProvider` and `ErrorBoundary` at the shell level so all three routes inherit them.

**When to use:** Always — every Phase 5 route renders inside this shell.

**Example:**
```tsx
// Source: synthesis of @tanstack/router rootRoute pattern + @tanstack/react-query QueryClientProvider + react-error-boundary
// Verified against: Context7 /tanstack/router (createRootRoute + Outlet),
//                   Context7 /tanstack/query (QueryClientProvider),
//                   react-error-boundary docs.

// frontend/src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'
import { AppShell } from '../components/shell/AppShell'
import { ShellErrorFallback } from '../components/ui/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // override the 0ms default — Phase 6 will tune per-query
      refetchOnWindowFocus: false, // localhost-only dashboard; window-focus refetch is noise
    },
  },
})

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={ShellErrorFallback}>
        <AppShell>
          <Outlet />
        </AppShell>
      </ErrorBoundary>
    </QueryClientProvider>
  ),
})
```

### Pattern 2: NavBar with active-state highlight (FESH-01 + FESH-02)

**What:** TanStack Router `<Link activeProps>` applies the underline class when the route matches. No manual `useLocation()` comparison needed.

**Example:**
```tsx
// Source: Context7 /tanstack/router "Link Component with Active Props Styling"
import { Link } from '@tanstack/react-router'

const routes = [
  { to: '/', label: 'Command' },
  { to: '/activity', label: 'Activity' },
  { to: '/skills', label: 'Skills' },
] as const

export function NavBar() {
  return (
    <nav aria-label="Primary" className="cmc-navbar">
      <span className="cmc-brand">Mission Control</span>
      {routes.map(({ to, label }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === '/' }}    // / is exact; /activity, /skills match prefix only when nested
          activeProps={{ className: 'cmc-navlink--active' }}
          className="cmc-navlink"
        >
          {label}
        </Link>
      ))}
      <CommandPaletteTrigger />  {/* renders the Cmd+K chip */}
    </nav>
  )
}
```

### Pattern 3: CollapsibleSection (FESH-03 — Radix + framer-motion + storage helper)

**What:** Combine three pieces: `@radix-ui/react-collapsible` for ARIA, framer-motion for the 220ms ease-out height animation, our `lib/storage.ts` for persistence.

**Example:**
```tsx
// Source: synthesis of Radix Collapsible docs + framer-motion AnimatePresence height-auto pattern
// Verified against: Context7 /grx7/framer-motion (AnimatePresence with initial/animate/exit height: auto)

import * as Collapsible from '@radix-ui/react-collapsible'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { storage } from '../../lib/storage'

interface CollapsibleSectionProps {
  id: string                 // localStorage key suffix; persisted as cmc.collapsible.{id}
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({ id, title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(() =>
    storage.get<boolean>(`collapsible.${id}`) ?? defaultOpen
  )
  useEffect(() => {
    storage.set(`collapsible.${id}`, open)
  }, [id, open])

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="cmc-collapsible">
      <Collapsible.Trigger className="cmc-collapsible__header">
        {title}
      </Collapsible.Trigger>
      <AnimatePresence initial={false}>
        {open && (
          <Collapsible.Content forceMount asChild>
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {children}
            </motion.div>
          </Collapsible.Content>
        )}
      </AnimatePresence>
    </Collapsible.Root>
  )
}
```

Notes:
- `Collapsible.Content forceMount asChild` is the documented Radix pattern when you want framer-motion to control the mount/unmount lifecycle [CITED: radix-ui.com/primitives Collapsible API]. Without `forceMount`, Radix removes the content from the DOM before framer-motion can run the exit animation.
- `overflow: hidden` is required so the height animation clips the content (otherwise children paint outside the collapsing box).

### Pattern 4: Sheet (FESH-04 — Radix Dialog + slide-from-right)

**What:** `@radix-ui/react-dialog` provides modal semantics (focus trap, Esc, aria-modal, scroll lock). Add framer-motion for the 220ms slide-from-right transform.

**Example:**
```tsx
// Source: Radix Dialog API + framer-motion AnimatePresence pattern
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: 'right'             // v1 only ships right
  children: React.ReactNode
  title: string              // for aria-labelledby — required by Radix Dialog
}

export function Sheet({ open, onOpenChange, children, title }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="cmc-sheet__overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="cmc-sheet__panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <Dialog.Title>{title}</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
```

Notes:
- `Dialog.Title` is REQUIRED by Radix for aria-labelledby; tests will fail-fast with a console error if missing [CITED: Radix Dialog accessibility docs]. UI-SPEC's Sheet API includes a `title` prop for this reason.
- `Dialog.Portal forceMount + AnimatePresence` is the canonical Radix+framer-motion pattern — same reason as Collapsible: framer-motion needs the DOM node alive to run the exit animation.

### Pattern 5: CommandPalette (FESH-07 — cmdk + global hotkey + reduced motion)

**What:** cmdk's `Command.Dialog` provides the modal + fuzzy match + keyboard nav (Arrow keys, Enter, Esc) for free. Bind Cmd+K (and Ctrl+K) globally via a single `useEffect` on `keydown`.

**Example:**
```tsx
// Source: Context7 /dip/cmdk "Command Menu in a Dialog with Keyboard Shortcut in React" — copied verbatim with our items
import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const close = () => setOpen(false)

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Mission Control command palette">
      <Command.Input placeholder="Search pages, sessions, schedules…" />
      <Command.List>
        <Command.Empty>No matches. Try fewer letters or open the page directly.</Command.Empty>
        <Command.Group heading="Pages">
          <Command.Item onSelect={() => { navigate({ to: '/' }); close() }}>Command</Command.Item>
          <Command.Item onSelect={() => { navigate({ to: '/activity' }); close() }}>Activity</Command.Item>
          <Command.Item onSelect={() => { navigate({ to: '/skills' }); close() }}>Skills</Command.Item>
        </Command.Group>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => { close() /* Phase 7 wires this */ }}>Quick task</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
```

Notes:
- The Cmd+K useEffect is a global listener; this is fine because there's only ONE CommandPalette mounted (in `<AppShell>`). Tests can assert via `userEvent.keyboard('{Meta>}k{/Meta}')`.
- `Command.Dialog` uses Radix Dialog internally [VERIFIED: cmdk dependencies] — same focus-trap + Esc + aria-modal contract Sheet uses. This is why `@radix-ui/react-dialog ^1.1.15` (our explicit dep) and cmdk's transitive `^1.1.6` resolve to a single version.
- Phase 7 will extend the action list — keep the `Command.Group heading="Actions"` block in place even with one item, so Phase 7 can append without restructure.

### Pattern 6: lib/storage.ts (namespaced localStorage)

**What:** All localStorage keys prefix with `cmc.`. Three functions: `get<T>(key)` / `set<T>(key, value)` / `remove(key)`. JSON serialization. Returns `null` on missing key OR parse error (graceful degradation — never throws).

**Example:**
```tsx
// frontend/src/lib/storage.ts
const PREFIX = 'cmc.'

export const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // QuotaExceededError or unavailable storage — silent no-op
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(PREFIX + key)
    } catch {
      // ignore
    }
  },
}
```

Tests: assert that `storage.set('foo', { a: 1 })` writes to `cmc.foo`, and `storage.get('foo')` round-trips. Tests run on happy-dom which provides localStorage out of the box.

### Pattern 7: lib/api.ts (typed fetchers — infrastructure, not consumers)

**What:** One typed function per backend endpoint already shipped (Phases 3 + 4). Each function returns a Promise<TypedResponse>. Phase 5 does NOT call these — the bare header doesn't surface live data. Phase 6 starts calling them via `useQuery`.

**Recommended shape (Claude's discretion per CONTEXT — choose during Wave 0 planning):**

Option A — **raw typed fetchers** (recommended for Phase 5):
```ts
// frontend/src/lib/api.ts
export interface HealthResponse { status: 'ok'; uptime_s: number; version: string }

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

export const api = {
  health: () => fetchJson<HealthResponse>('/api/health'),
  // ... one entry per backend endpoint
}
```

Option B — **React Query hook factories** (defer to Phase 6 when actual consumers exist):
```ts
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health })
```

**Recommendation:** Land Option A in Phase 5 (it's lib code with no React dep). Phase 6 will trivially layer Option B on top via tiny per-endpoint hook files (`lib/queries/useHealth.ts`). This keeps Phase 5's plan boundary clean.

Endpoints to type (cross-reference Phases 3 + 4 RESEARCH.md tables): `/api/health`, `/api/sessions`, `/api/sessions/{id}/tools`, `/api/sessions/{id}/messages`, `/api/sessions/{id}/follow-up`, `/api/skills`, `/api/skills/usage`, `/api/decisions`, `/api/decisions/{id}/answer`, `/api/inbox`, `/api/inbox/{id}/read`, `/api/inbox/{id}/reply`, `/api/tasks`, `/api/tasks/{id}/approve|rerun|delete`, `/api/dispatcher/trigger`, `/api/schedules`, `/api/schedules/{id}/runs`, `/api/schedules/parse-nl`, `/api/system/emergency-stop|emergency-resume`.

### Pattern 8: Card grid (DESG-04 — equal-row CSS Grid)

**Example:**
```css
/* in styles.css or component-scoped */
.cmc-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  grid-auto-rows: 1fr;       /* DESG-04 — auto-rows-fr matched heights */
  gap: var(--space-lg);
  padding: var(--space-lg);
}
```

Breakpoints: `auto-fit + minmax(320px, 1fr)` is breakpoint-free responsive (CONTEXT marks exact breakpoints/column counts as Claude's discretion). 320px minimum keeps cards readable on a narrow viewport without media queries.

### Anti-Patterns to Avoid

- **Touching `window.localStorage` directly outside `lib/storage.ts`.** Per CONTEXT decision: every consumer (Phase 6 filter persistence, Phase 7 composer drafts) imports `storage`. Add an ESLint rule in a future phase if drift is observed.
- **Hand-rolling focus trap or Esc-to-close on Sheet.** Use Radix Dialog. Hand-rolling these is exactly the "Don't Hand-Roll" trap and is why CONTEXT locks the dependency.
- **Spinner in any loading state.** UI-SPEC §Copywriting bans the strings "Loading…", "Fetching…", "Please wait…". Use `<Skeleton>` matching the final content shape (FESH-08).
- **Importing icons from `lucide-react` without tree-shaking.** Always `import { Foo } from 'lucide-react'`, never `import * as icons from 'lucide-react'` — the latter ships ~1500 icons.
- **Letting framer-motion run during snapshot/visual tests.** Wrap test renders with `<MotionConfig reducedMotion="always">` in the test-setup helper so animations resolve to their `animate` state instantly.
- **Snapshot tests on the entire route.** Ban these — they couple to copy strings and trigger noisy diffs on UI-SPEC tweaks. Keep tests semantic: "renders heading", "calls onClose on Esc", "persists state to localStorage".
- **Conditional Cmd+K binding inside route components.** Bind once globally in `<AppShell>` so the palette opens regardless of which route is active.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal focus trap, Esc-to-close, aria-modal, scroll lock | Custom `useFocusTrap` hook + Esc listener + body overflow toggle | `@radix-ui/react-dialog` | Radix has 5+ years of edge-case fixes for nested modals, tab-out-of-iframe, scrollbar-width compensation, IME composition. [CITED: radix-ui.com/primitives Dialog Features] |
| Tooltip positioning, delay, ARIA describedby | Custom Popper + setTimeout + `useId` | `@radix-ui/react-tooltip` | Radix uses `@floating-ui/react-dom` for positioning (collision detection, viewport-edge nudging). 200ms delay is locked in Radix's `delayDuration` prop. |
| Collapsible ARIA (`aria-expanded`, `aria-controls`) | Manual ARIA state on a `<button>` + `<div>` | `@radix-ui/react-collapsible` | Radix wires `aria-controls={contentId}` to a generated `useId()` value automatically; hand-rolled versions miss the `aria-controls` half. |
| Fuzzy command-palette match + keyboard navigation + grouping | Custom matcher (Levenshtein? prefix? subsequence?) + Arrow-key index state | `cmdk` | cmdk uses a battle-tested fuzzy algorithm (subsequence + score) and handles Arrow Up/Down + wrap-around + disabled-item skip. Phase 7 will extend the item list — cmdk's composable `Command.Group`/`Command.Item` API scales without refactor. |
| Mount fade-in / slide / height-auto animations | CSS transitions on `height`, `transform`, `opacity` (which fight React's mount/unmount) | `framer-motion` `<motion.div>` + `<AnimatePresence>` | CSS `transition: height 220ms` doesn't animate `height: auto` — it requires JS to measure pixel values. framer-motion does this via internal ResizeObserver. AnimatePresence handles unmount-after-exit-finishes which CSS cannot. |
| Class-based ErrorBoundary | `class CmcErrorBoundary extends React.Component { static getDerivedStateFromError() { ... } }` | `react-error-boundary` | Wraps the class component as a function-friendly API and adds `useErrorBoundary().resetBoundary()` for fallback retry. ~30 lines saved per use site. |
| Relative-time formatting ("3m ago", "2h ago") | Custom `Date - now` math + unit picker | Native `Intl.RelativeTimeFormat` (built into all evergreen browsers) | One Intl call per render: `new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-3, 'minute')` → `"3 minutes ago"`. No library needed. Wrap in our `<RelativeTime>` primitive that re-renders every 30s via `useEffect`. |
| ResizeObserver / matchMedia stubs in tests | Reinventing test-environment polyfills | `jsdom-testing-mocks` (or hand-rolled `vitest.setup.ts` shims — see Common Pitfalls) | Both happy-dom and jsdom miss/partially-implement these APIs; the shims are 10-20 lines but standardized. |

**Key insight:** Phase 5's primitives all wrap upstream packages with our CSS variables. The bespoke design system is in the styling, NOT the behavior. Behavior is delegated to Radix/cmdk/framer-motion. This is why CONTEXT locks every dependency — the trap of "let's hand-roll Sheet, it's just a div" is real and has cost teams weeks.

## Common Pitfalls

### Pitfall 1: Radix primitives crash on jsdom because `Element.hasPointerCapture` is undefined

**What goes wrong:** Tests using `userEvent.click()` to open a Sheet or trigger a Tooltip fail with `TypeError: target.hasPointerCapture is not a function` [CITED: testing-library/user-event discussion #1087]. Tests pass in real browsers (Playwright, Chrome devtools) but fail in CI.

**Why it happens:** Radix uses pointer events for trigger interactions. jsdom does not implement `Element.hasPointerCapture`, `releasePointerCapture`, `setPointerCapture`, or `scrollIntoView`. happy-dom partially implements some but not all.

**How to avoid:** Add a polyfill block to `vitest.setup.ts`:
```ts
// frontend/src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Radix UI shims for happy-dom / jsdom
if (typeof window !== 'undefined') {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => {}
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => {}
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {}
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

afterEach(() => cleanup())
```

**Warning signs:** "TypeError: ... is not a function" in test output mentioning pointer/scroll/resize APIs. Treat this as a missing-shim signal, not a code bug.

### Pitfall 2: framer-motion `animate={{ height: 'auto' }}` measures `0px` on mount in tests

**What goes wrong:** CollapsibleSection tests assert "content visible after expand" but the test sees content with `height: 0` because framer-motion's height-auto animation never completes — happy-dom/jsdom return `0` from `getBoundingClientRect`.

**Why it happens:** framer-motion measures `auto` heights via `getBoundingClientRect()` which is unimplemented or returns zeros in jsdom-style envs.

**How to avoid:** Wrap test renders in `<MotionConfig reducedMotion="always">` so framer-motion skips animation and snaps to the `animate` state instantly:
```tsx
// frontend/src/test/utils.tsx
import { MotionConfig } from 'framer-motion'
import { render as rtlRender, RenderOptions } from '@testing-library/react'

export function render(ui: React.ReactElement, options?: RenderOptions) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MotionConfig reducedMotion="always">{children}</MotionConfig>
    ),
    ...options,
  })
}
```
Tests then import `render` from `test/utils` instead of `@testing-library/react`.

**Warning signs:** Visual states present in browser fail to match in tests. `getByText("...")` works (text is in the DOM) but height-based assertions fail.

### Pitfall 3: cmdk Cmd+K event handler fires twice in React 19 StrictMode dev mode

**What goes wrong:** First palette-open press toggles open→closed→open and lands closed. Second press works. Only happens in development (`npm run dev`), not production.

**Why it happens:** React 19 StrictMode intentionally double-invokes effects to surface missing cleanup [CITED: react.dev/reference/react/StrictMode]. The cmdk pattern's `useEffect` adds a `keydown` listener; if the cleanup is missing or wrong, two listeners get attached and Cmd+K toggles `open` twice → ends up where it started.

**How to avoid:** The verified cmdk pattern (Pattern 5 above) has the `return () => document.removeEventListener('keydown', onKeyDown)` cleanup — keep it. Always test with StrictMode enabled (we already wrap in StrictMode in `main.tsx` per React 19 conventions).

**Warning signs:** Cmd+K toggle behaves like a "press twice" requirement in development; works correctly after `npm run build && npm run preview`.

### Pitfall 4: `cmdk` and `@radix-ui/react-dialog` get installed at conflicting versions

**What goes wrong:** Sheet uses Radix Dialog 1.1.15; cmdk's transitive Radix Dialog resolves to 1.1.6 in `node_modules/cmdk/node_modules/@radix-ui/react-dialog`. Two copies of the Dialog React Context exist. CommandPalette can open but its focus-trap behaves erratically.

**Why it happens:** npm hoists by default but can keep nested copies if peer ranges conflict. `cmdk` declares `@radix-ui/react-dialog ^1.1.6` (exact range satisfies 1.1.6 through 1.x).

**How to avoid:** Install `@radix-ui/react-dialog ^1.1.15` directly in `frontend/package.json`. Verify after install:
```bash
cd frontend && npm ls @radix-ui/react-dialog
# Should show ONE entry, deduped, at 1.1.15.
```
If a nested copy appears, run `npm dedupe` or set `overrides` in package.json:
```json
{
  "overrides": {
    "@radix-ui/react-dialog": "^1.1.15"
  }
}
```

**Warning signs:** `npm ls @radix-ui/react-dialog` shows multiple entries; CommandPalette focus jumps unpredictably; opening Sheet inside CommandPalette double-traps focus.

### Pitfall 5: Vitest "act() warning" floods test output even though tests pass

**What goes wrong:** Every test prints `Warning: The current testing environment is not configured to support act(...)` even though assertions pass. CI logs become unreadable.

**Why it happens:** In Vitest's happy-dom and jsdom environments, `globalThis` and `self` are not the same object. RTL sets `IS_REACT_ACT_ENVIRONMENT` on `self`; React reads it from `globalThis` [CITED: vitest-dev/vitest issue #1146].

**How to avoid:** Add to `frontend/src/test/setup.ts`:
```ts
// Bridge IS_REACT_ACT_ENVIRONMENT between globalThis and self
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  get() {
    if (typeof globalThis.self !== 'undefined') {
      return (globalThis.self as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
    }
  },
  set(value) {
    if (typeof globalThis.self !== 'undefined') {
      (globalThis.self as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value
    }
  },
  configurable: true,
})
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
```

**Warning signs:** `npm run test` output saturated with act() warnings even on simple "renders" tests.

### Pitfall 6: TanStack Router `routeTree.gen.ts` not regenerated → new routes don't resolve

**What goes wrong:** Add `frontend/src/routes/activity.tsx`, `npm run dev` shows blank `/activity` (404 from router). Editor IntelliSense doesn't know `/activity` is a valid `to`.

**Why it happens:** `routeTree.gen.ts` is generated by the Vite plugin (`tanstackRouter` plugin in `vite.config.ts`). It regenerates on file changes during `npm run dev`, but if the dev server isn't running when you create the file, the gen file is stale.

**How to avoid:**
1. Always run `npm run dev` while creating new routes — the plugin watches the `routes/` directory.
2. For CI / build: `tsc -b` before `vite build` (already in `package.json` build script) — Vite plugin runs during build and regenerates.
3. Alternative manual regen: the plugin exposes `tsr generate` via `@tanstack/router-cli` if needed (not necessary in this repo since the Vite plugin auto-generates).

**Warning signs:** Type error on `<Link to="/activity">` — `Type '"/activity"' is not assignable to type '"/"'`. Means the route tree hasn't picked up the new file.

### Pitfall 7: framer-motion auto-imports `@emotion/is-prop-valid` and adds 30KB on first run

**What goes wrong:** First production build adds an unexpected `@emotion/is-prop-valid` chunk; bundle analyzer shows ~30KB unaccounted for.

**Why it happens:** framer-motion declares `@emotion/is-prop-valid: "*"` as a peer dep [VERIFIED: npm view framer-motion peerDependencies]. If it's installed (or hoisted from another dep), framer-motion uses it to filter out custom motion props. If absent, framer-motion uses an internal smaller filter.

**How to avoid:** Don't install `@emotion/is-prop-valid` explicitly. Verify after Wave 0 install:
```bash
cd frontend && npm ls @emotion/is-prop-valid
# Should print: (empty)
```
If it shows up via a transitive dep, add to `package.json` `overrides`:
```json
{ "overrides": { "@emotion/is-prop-valid": "npm:dx-noop@*" } }
```
(or accept the 30KB — for a localhost dashboard, this is academic.)

**Warning signs:** `npm ls @emotion/is-prop-valid` shows an entry; bundle larger than expected.

### Pitfall 8: localStorage quota exceeded in test environments

**What goes wrong:** A test for CollapsibleSection persistence hits `QuotaExceededError` because happy-dom's localStorage is shared across tests in the same worker. Tests fail intermittently.

**Why it happens:** happy-dom/jsdom both implement localStorage as an in-memory map; without explicit cleanup, prior tests' writes accumulate.

**How to avoid:** Add `localStorage.clear()` to the global `afterEach` in `setup.ts`:
```ts
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
```

**Warning signs:** "QuotaExceededError" in tests; tests pass individually (`vitest run path/to/test.ts`) but fail in suite.

## Code Examples

### Vitest 4 + RTL 16 + happy-dom config (full file)

```ts
// frontend/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,                            // describe/it/expect global
    setupFiles: ['./src/test/setup.ts'],
    css: false,                               // skip CSS parsing in tests
    include: ['src/**/__tests__/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/routeTree.gen.ts', 'src/**/*.test.{ts,tsx}'],
    },
  },
}))
```

```json
// frontend/tsconfig.json — add to compilerOptions.types
{
  "compilerOptions": {
    "types": ["vitest/globals"],
    // ... existing options
  },
  "include": ["src", "src/routeTree.gen.ts", "vitest.config.ts"]
}
```

### Vitest setup file (full)

```ts
// frontend/src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 1. IS_REACT_ACT_ENVIRONMENT bridge (Pitfall 5)
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  get() {
    return typeof globalThis.self !== 'undefined'
      ? (globalThis.self as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
      : undefined
  },
  set(value) {
    if (typeof globalThis.self !== 'undefined') {
      (globalThis.self as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value
    }
  },
  configurable: true,
})
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// 2. Radix UI / framer-motion shims for happy-dom (Pitfalls 1, 2)
if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {}
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {}
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {}
  if (!window.ResizeObserver) {
    // @ts-expect-error — minimal stub
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}

// 3. RTL cleanup + localStorage clear (Pitfall 8)
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
```

### Test render helper with MotionConfig (utility)

```tsx
// frontend/src/test/utils.tsx
import { MotionConfig } from 'framer-motion'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <MotionConfig reducedMotion="always">{children}</MotionConfig>
    ),
    ...options,
  })
}

export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
```

Tests then `import { render, userEvent } from '../../test/utils'`.

### Sample primitive test (CollapsibleSection)

```tsx
// frontend/src/components/ui/__tests__/CollapsibleSection.test.tsx
import { describe, it, expect } from 'vitest'
import { render, userEvent } from '../../../test/utils'
import { CollapsibleSection } from '../CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders title and children', () => {
    const { getByText } = render(
      <CollapsibleSection id="test" title="Section Heading">
        <div>Inner content</div>
      </CollapsibleSection>
    )
    expect(getByText('Section Heading')).toBeInTheDocument()
    expect(getByText('Inner content')).toBeInTheDocument()
  })

  it('toggles open state on header click', async () => {
    const user = userEvent.setup()
    const { getByText, queryByText } = render(
      <CollapsibleSection id="t" title="Header" defaultOpen>
        <div>Body</div>
      </CollapsibleSection>
    )
    expect(getByText('Body')).toBeVisible()
    await user.click(getByText('Header'))
    expect(queryByText('Body')).not.toBeVisible() // Radix sets data-state="closed"
  })

  it('persists state to localStorage with cmc.collapsible.{id} key', async () => {
    const user = userEvent.setup()
    const { getByText } = render(
      <CollapsibleSection id="persist-me" title="H" defaultOpen>
        <div>Body</div>
      </CollapsibleSection>
    )
    await user.click(getByText('H'))
    expect(window.localStorage.getItem('cmc.collapsible.persist-me')).toBe('false')
  })
})
```

### Sample primitive test (CommandPalette Cmd+K binding)

```tsx
// frontend/src/components/ui/__tests__/CommandPalette.test.tsx
import { describe, it, expect } from 'vitest'
import { render, userEvent } from '../../../test/utils'
import { CommandPalette } from '../CommandPalette'

describe('CommandPalette', () => {
  it('opens on Cmd+K and shows page items', async () => {
    const user = userEvent.setup()
    const { queryByPlaceholderText, getByPlaceholderText } = render(<CommandPalette />)
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()

    await user.keyboard('{Meta>}k{/Meta}')
    expect(getByPlaceholderText(/search pages/i)).toBeInTheDocument()
  })

  it('closes on Esc', async () => {
    const user = userEvent.setup()
    const { queryByPlaceholderText } = render(<CommandPalette />)
    await user.keyboard('{Meta>}k{/Meta}')
    expect(queryByPlaceholderText(/search pages/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(queryByPlaceholderText(/search pages/i)).toBeNull()
  })
})
```

### package.json `scripts` additions

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

### Token replacement target (UI-SPEC §Token Map)

The Wave 0 task replaces `frontend/src/styles.css` (currently 10 lines) with the full token block from UI-SPEC §Token Map (the `:root` declaration ~50 lines) plus the body-level `background-color` + `background-image` declaration from UI-SPEC §Color Background depth. The Phase 1 utility classes `.cmc-shell`, `.cmc-header`, `.cmc-main` are deleted (replaced by `<AppShell>` / `<NavBar>` / `<main>`); `html, body, #root { height: 100%; margin: 0; }` is preserved.

## Runtime State Inventory

This is a greenfield phase (new component library + new test infra) with one renamed surface: the Phase 1 stub at `frontend/src/styles.css` is REPLACED by the UI-SPEC token block, and the Phase 1 root component header text "Claude Mission Control" is replaced by "Mission Control" (UI-SPEC §Copywriting). No other rename/refactor surfaces exist.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no databases, no localStorage state pre-existing in this repo. | Phase 5 introduces `cmc.collapsible.*` localStorage keys; future phases extend with `cmc.filter.*` (Phase 6) and `cmc.composer.*` (Phase 7). No migration needed in v1. |
| Live service config | None — frontend has no live service configuration (no service workers, no PWA manifest, no analytics SDK). | None. |
| OS-registered state | None — frontend doesn't touch OS state. The only OS-registered things in this project are launchd dispatcher (Phase 8) and Tray app (Phase 8) which are backend concerns. | None. |
| Secrets/env vars | None — frontend has no env-var injection in v1. The `vite.config.ts` proxy points to `127.0.0.1:8765` literally (no env interpolation). | None. |
| Build artifacts | `frontend/dist/` exists (from prior Phase 1 builds — listed in `frontend/` directory listing). The Wave 0 token replacement + AppShell rewrite will produce a stale `dist/` until rebuilt. | Wave 0 final task: `npm run build` to regenerate. CI (Phase 9) ensures fresh builds. |

**Renamed string explicit list:**
- "Claude Mission Control" (Phase 1 header copy in `__root.tsx` + `.cmc-header` class) → "Mission Control" (NavBar brand). The HTML `<title>` retains "Claude Mission Control" per UI-SPEC §Copywriting.
- `.cmc-shell` / `.cmc-header` / `.cmc-main` CSS classes → DELETED. Replaced by `<AppShell>` / `<NavBar>` / `<main>` JSX.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite, Vitest, npm | ✓ | (verified by existing Phase 1 frontend builds) | — |
| npm | dependency install | ✓ | (verified by existing `package-lock.json`) | — |
| Vite dev server (port 5173) | `npm run dev` | ✓ | 8.0.10 | — |
| FastAPI backend (port 8765) | `/api` proxy in dev | ✓ | (Phases 1-4 shipped) | Frontend works without it; only the Phase 5 typed fetchers in `lib/api.ts` would fail on call (which Phase 5 itself doesn't trigger — bare header) |
| Google Fonts CDN | Inter + JetBrains Mono webfonts | ✓ (assumed — public CDN) | — | If offline: browser falls back to `system-ui` for Inter and `Menlo` for JetBrains Mono per the `var(--font-body)` / `var(--font-mono)` declarations in UI-SPEC §Token Map |
| Playwright | Phase 9 (TEST-01..04) — not Phase 5 | n/a | — | n/a (out of phase scope) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None for Phase 5; the Google Fonts CDN unavailability degrades gracefully via system fonts (acceptable per WCAG; layout still readable).

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + React Testing Library 16.3.2 + happy-dom 20.9.0 |
| Config file | `frontend/vitest.config.ts` (NEW in Phase 5) extending `vite.config.ts` |
| Quick run command | `cd frontend && npm test -- src/components/ui/__tests__/{specific}.test.tsx` (single file, ~1-2s on happy-dom) |
| Full suite command | `cd frontend && npm test` (all `src/**/*.test.{ts,tsx}` — Phase 5 estimate: ~14 primitive tests + 3 lib tests + 1 shell smoke = ~18 files; ~5-10s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FESH-01 | Three routes render under `/`, `/activity`, `/skills` | smoke (integration) | `cd frontend && npm test -- src/components/shell/__tests__/AppShell.test.tsx` (mounts router with memory history, asserts each route renders heading) | ❌ Wave 0 |
| FESH-02 | AppShell + NavBar + dark theme | unit | `cd frontend && npm test -- src/components/shell/__tests__/{AppShell,NavBar}.test.tsx` | ❌ Wave 0 |
| FESH-03 | CollapsibleSection toggles + persists + animates | unit | `cd frontend && npm test -- src/components/ui/__tests__/CollapsibleSection.test.tsx` | ❌ Wave 1 |
| FESH-04 | Sheet Esc-to-close + focus trap | unit | `cd frontend && npm test -- src/components/ui/__tests__/Sheet.test.tsx` | ❌ Wave 1 |
| FESH-05 | Card compound API renders all sub-components | unit | `cd frontend && npm test -- src/components/ui/__tests__/Card.test.tsx` | ❌ Wave 1 |
| FESH-06 | Button variants, Badge, StatePill, Tooltip render + keyboard | unit | `cd frontend && npm test -- src/components/ui/__tests__/{Button,Badge,StatePill,Tooltip}.test.tsx` | ❌ Wave 1 |
| FESH-07 | CommandPalette opens on Cmd+K, closes on Esc, navigates on item click | unit | `cd frontend && npm test -- src/components/ui/__tests__/CommandPalette.test.tsx` | ❌ Wave 1 |
| FESH-08 | Skeleton variants render | unit | `cd frontend && npm test -- src/components/ui/__tests__/Skeleton.test.tsx` | ❌ Wave 1 |
| FESH-09 | EmptyState renders heading + body + optional icon/action | unit | `cd frontend && npm test -- src/components/ui/__tests__/EmptyState.test.tsx` | ❌ Wave 1 |
| FESH-10 | RelativeTime renders relative + tooltip with absolute | unit | `cd frontend && npm test -- src/components/ui/__tests__/RelativeTime.test.tsx` | ❌ Wave 1 |
| DESG-01..06 | Tokens applied + animations declared | manual visual | not automatable in Vitest — Phase 9 Playwright TEST-04 covers the localStorage persistence aspect | n/a in Phase 5 |
| (lib) | storage round-trip + namespacing | unit | `cd frontend && npm test -- src/lib/__tests__/storage.test.ts` | ❌ Wave 0 |
| (lib) | api typed fetchers (one happy + one error case) | unit | `cd frontend && npm test -- src/lib/__tests__/api.test.ts` (uses `vi.spyOn(global, 'fetch')`) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npm test -- src/components/ui/__tests__/{primitive}.test.tsx` (~1-2s; the per-primitive file the executor just touched).
- **Per wave merge:** `cd frontend && npm test` (full suite; ~5-10s on happy-dom).
- **Phase gate:** `cd frontend && npm test && npm run typecheck && npm run build` all green before `/gsd-verify-work`.

### Wave 0 Gaps

Every test file listed above is missing — Phase 5 is greenfield for tests. The full Wave 0 test-infrastructure delta:
- [ ] `frontend/vitest.config.ts` (new file, ~25 lines)
- [ ] `frontend/src/test/setup.ts` (new file, ~50 lines — IS_REACT_ACT_ENVIRONMENT bridge + Radix shims + RTL cleanup)
- [ ] `frontend/src/test/utils.tsx` (new file, ~15 lines — `render` wrapper with `<MotionConfig reducedMotion="always">`)
- [ ] `frontend/package.json` `scripts.test`, `scripts.test:watch`, `scripts.test:coverage`, `scripts.typecheck` (4 new entries)
- [ ] `frontend/tsconfig.json` `compilerOptions.types: ["vitest/globals"]` + `include: [...,"vitest.config.ts"]`
- [ ] `frontend/src/lib/__tests__/storage.test.ts` (new — ~30 lines)
- [ ] `frontend/src/lib/__tests__/api.test.ts` (new — ~50 lines, mocks `fetch`)

Wave 1 ships per-primitive tests co-located in `src/components/ui/__tests__/` (one `.test.tsx` per primitive — ~10 files, ~30-60 lines each).

## Security Domain

`security_enforcement` is not set in `.planning/config.json` (treat as enabled per defaults). Phase 5 has minimal security surface — it's a presentation layer with no auth, no user input that hits a database, and no PII handling. Apply the relevant ASVS categories below; categories not listed do not apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | localhost-bound dashboard; no login (per PROJECT.md "127.0.0.1 only, no auth"). |
| V3 Session Management | no | No sessions; no cookies. |
| V4 Access Control | no | No multi-user model. |
| V5 Input Validation | yes (limited) | CommandPalette `Command.Input` + Phase 7 composers (out of Phase 5 scope) — Phase 5 only validates `id` strings passed to `lib/storage.ts` (no special handling needed; localStorage keys are not security-sensitive). |
| V6 Cryptography | no | No crypto in frontend; all hashing/signing is backend (Phase 4 already locked). |
| V7 Error Handling | yes | `<ErrorBoundary>` per route — never leak error stack traces or internal paths to UI; UI-SPEC §Copywriting locks user-facing error copy. |
| V14.4 HTTP Security Headers | partial | FastAPI sets headers (out of Phase 5 scope); frontend ensures no `dangerouslySetInnerHTML` or unsafe-eval'd code. React's default escape behavior covers V5.3 output encoding. |

### Known Threat Patterns for {React 19 SPA + bespoke design system}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via `dangerouslySetInnerHTML` | Tampering / Information disclosure | Ban via convention; Phase 5 has zero use cases for it. If gradient text rendering ever needs HTML, use `<span style={{ background: ... }}>` not raw HTML. |
| Open-redirect via CommandPalette item navigation | Tampering | All `Command.Item onSelect` calls navigate via `useNavigate` to STATIC `to: '/path'` strings — never user-input-derived URLs. The Cmd+K input is a search filter only, never a URL bar. |
| localStorage poisoning (a malicious script writes `cmc.*` keys) | Tampering | Out of threat model — localhost-bound and no auth means whoever runs the app already has full filesystem access. `lib/storage.ts` `JSON.parse` is wrapped in try/catch (Pattern 6) so malformed values fail closed (return `null`) instead of crashing render. |
| Supply-chain (compromised cmdk / Radix / framer-motion package) | Tampering | Pin exact versions in `package-lock.json` (already enforced); `npm audit` runs in CI (Phase 9). For now, the dependency choices are restricted to the same upstream packages shadcn/ui uses, which receive ecosystem-wide scrutiny. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` package name | `motion` package (re-exports framer-motion) | mid-2025; `motion` published ongoing | Cosmetic — same library; UI-SPEC + CONTEXT lock `framer-motion` so we keep it. Future Phase can rename imports for ~30 minutes of work. |
| Class-based ErrorBoundary | `react-error-boundary` v6 with `useErrorBoundary()` reset hook | 2024-2026 (v6 published 2026-02-13) | Function-component-friendly; fallback retry UX without manual key bumping. |
| Raw `class FocusTrap` / Esc handlers in modals | Radix UI primitives (`@radix-ui/react-dialog`) | 2022-onward; Radix is now ecosystem-default for unstyled accessible primitives | What shadcn/ui builds on. Phase 5 follows the same pattern with its own CSS. |
| jsdom for component tests | happy-dom (default in Vitest scaffolds) | 2024-onward | 2-4× faster; fewer rough edges with React 19; per-file fallback to jsdom when needed. |
| `enzyme` + class lifecycle assertions | React Testing Library + role queries | 2020-onward; enzyme abandoned post-React 18 | RTL is the ecosystem default; `enzyme` doesn't support hooks meaningfully. |
| Hand-rolled fuzzy matchers (Fuse.js, fzf-style) | `cmdk` for command palettes | 2023-onward (cmdk by Vercel team) | Composable item/group API + Radix Dialog underneath. The pattern shadcn's command component uses. |

**Deprecated/outdated:**
- `framer-motion` package is NOT deprecated despite the rename — both `framer-motion` and `motion` continue to publish in lockstep (12.38.0 same date) [VERIFIED: npm view both packages 2026-04-26]. CONTEXT keeps `framer-motion`; this is fine.
- `cmdk@1.0.0` peer dep capped at `^18.0.0` and breaks on React 19 — fixed in `cmdk@1.0.4+`. We're on `1.1.1`, no issue.

## Assumptions Log

> Empty in this research — every claim is tagged `[VERIFIED: ...]` from npm registry, Context7, or repo inspection, or `[CITED: ...]` from official documentation. The few instances of practical-judgment recommendations (e.g., "happy-dom for speed, jsdom fallback per-file") are explicitly framed as recommendations from current-source benchmarks, not training-data assumptions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | All recommendations cite either a verified npm view, Context7 doc, official docs, or the locked CONTEXT/UI-SPEC. | — | — |

## Open Questions

1. **Which lib/api.ts shape: raw fetchers vs. React Query hooks?**
   - What we know: CONTEXT marks this as Claude's discretion; the planner will choose during Wave 0.
   - What's unclear: Phase 6's preference — does Phase 6 want a thin layer it controls (option A: raw fetchers + per-endpoint hook files in Phase 6) or a thicker layer Phase 5 fully ships (option B: hooks now)?
   - Recommendation: Land Option A (raw typed fetchers in Phase 5); Phase 6 layers tiny `lib/queries/useFoo.ts` files on top. Reasoning: keeps Phase 5's plan boundary clean and lets Phase 6 own the cache-tuning decisions (`staleTime` per query, `refetchInterval` for the 5s polling DecisionCards) without backporting changes through Phase 5.

2. **Does the placeholder card grid on `/` show the OPNL-XX requirement IDs or human-readable panel names?**
   - What we know: CONTEXT says "Card slot names should derive from Phase 6/7 requirement IDs (OPNL-01..15, ACTV-01..06, HPNL-*, TPNL-*, SKLP-*) — planner can pull labels from REQUIREMENTS.md headings." The exact spelling of the visible card title is not locked.
   - What's unclear: Should `<CardTitle>Live Sessions</CardTitle>` (human-readable, derived from REQUIREMENTS.md `OPNL-04: LiveSessionsCard with title, cwd, model...`) or `<CardTitle>OPNL-04</CardTitle>` (req ID)?
   - Recommendation: Use the human-readable name from the REQUIREMENTS.md heading (e.g., "Live Sessions", "Token Usage", "Schedules"). The req ID is an internal index; placeholders are user-facing layout previews. Phase 6 implementations replace the text anyway.

3. **happy-dom vs jsdom per-file split — which primitive(s) likely need jsdom?**
   - What we know: happy-dom is recommended; jsdom is the per-file fallback via `// @vitest-environment jsdom` docblock.
   - What's unclear: Without running the tests, we can't know which primitives' Radix surface will have a happy-dom shim gap not covered by `vitest.setup.ts`.
   - Recommendation: Default ALL files to happy-dom in Wave 0. Wave 1 executor flips a primitive to jsdom only if its happy-dom test fails with "TypeError: ... is not a function" AND the missing API isn't trivially shimmable. Document any flips in the test file's leading comment.

4. **CommandPalette item ordering and group headers (CONTEXT marks as Claude's discretion).**
   - What we know: v1 has 4 items: 3 routes + Quick task.
   - What's unclear: Group order — Pages first or Actions first?
   - Recommendation: "Pages" group first (3 items: Command, Activity, Skills), "Actions" group second (1 item: Quick task). Rationale: in v1 the user is more likely to use Cmd+K for navigation than for the still-unwired Quick task.

5. **Skeleton pulse keyframe math (CONTEXT marks as Claude's discretion).**
   - What we know: UI-SPEC says 1.5s ease-in-out infinite pulse.
   - What's unclear: Exact keyframe values.
   - Recommendation: `@keyframes cmc-skeleton-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } } .cmc-skeleton { animation: cmc-skeleton-pulse 1.5s ease-in-out infinite; }` — symmetric 1↔0.5 alpha pulse. Disable via `@media (prefers-reduced-motion: reduce) { .cmc-skeleton { animation: none } }`.

## Sources

### Primary (HIGH confidence)

- **npm registry** (2026-04-26): version + peerDependencies + last-publish dates verified for every package in §Standard Stack:
  - `@tanstack/react-query@5.100.5`, `framer-motion@12.38.0`, `motion@12.38.0` (wrapper), `@radix-ui/react-dialog@1.1.15`, `@radix-ui/react-tooltip@1.2.8`, `@radix-ui/react-collapsible@1.1.12`, `cmdk@1.1.1`, `lucide-react@1.11.0`, `react-error-boundary@6.1.1`, `vitest@4.1.5`, `@vitest/coverage-v8@4.1.5`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`, `@testing-library/jest-dom@6.9.1`, `@testing-library/user-event@14.6.1`, `happy-dom@20.9.0`, `jsdom@29.0.2`, `@vitejs/plugin-react@6.0.1`.
- **Context7 `/dip/cmdk`**: Cmd+K binding pattern with `useEffect` keydown listener, `Command.Dialog` + `Command.Input` + `Command.List` + `Command.Group` + `Command.Item` API.
- **Context7 `/grx7/framer-motion`**: `AnimatePresence` with `initial`/`animate`/`exit` height-auto pattern, `MotionConfig reducedMotion="user"|"always"|"never"`, `useInView`.
- **Context7 `/tanstack/router`**: `createRootRoute`, `createFileRoute`, `<Outlet>`, `<Link activeProps activeOptions>`.
- **Context7 `/tanstack/query`**: `QueryClient` + `QueryClientProvider` setup; default options.
- **Context7 `/vitest-dev/vitest`**: `environment: 'happy-dom'` config, `setupFiles`, `globals: true`, per-file `// @vitest-environment` docblock.
- **Context7 `/websites/radix-ui_primitives`**: Dialog API (focus trap, Esc, aria-modal), Collapsible API, Tooltip API.
- **Repo inspection** (2026-04-26): `frontend/package.json` L11-L25, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/routes/{__root,index}.tsx`, `frontend/src/styles.css`, `frontend/src/routeTree.gen.ts`, `.planning/config.json`, `.planning/phases/05-frontend-shell-design-system/{05-CONTEXT.md,05-UI-SPEC.md}`, `.planning/REQUIREMENTS.md` (FESH/DESG + OPNL/ACTV/HPNL/TPNL/SKLP IDs).

### Secondary (MEDIUM confidence — verified with at least one official source)

- [react-19-strict-mode-effect-cleanup guide](https://dev.to/pockit_tools/why-is-useeffect-running-twice-the-complete-guide-to-react-19-strict-mode-and-effect-cleanup-1n60) — verified against react.dev/reference/react/StrictMode.
- [motion.dev/docs/react-upgrade-guide](https://motion.dev/docs/react-upgrade-guide) — framer-motion → motion rename.
- [happy-dom vs jsdom 2026 PkgPulse benchmark](https://www.pkgpulse.com/blog/happy-dom-vs-jsdom-2026) — performance claim cross-verified with vitest discussion #1607.
- [luisball.com testing Radix UI with RTL guide](https://www.luisball.com/blog/using-radixui-with-react-testing-library) — Radix-in-jsdom shim list cross-verified with testing-library/user-event discussion #1087.
- [tanstack.com/query/v5 Important Defaults](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults) — `staleTime: 0`, `gcTime: 5min`, `refetchOnWindowFocus: true` defaults.
- [vitest-dev/vitest issue #1146](https://github.com/vitest-dev/vitest/issues/1146) — `IS_REACT_ACT_ENVIRONMENT` bridge between `globalThis` and `self`.

### Tertiary (LOW confidence — flagged for validation if execution surfaces issues)

- None. Every claim in this document was either verified via tool or cited from an official/authoritative source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all 16 packages' versions + peer deps verified against npm registry on 2026-04-26.
- Architecture patterns: HIGH — every code example traces to either a Context7 doc or the locked UI-SPEC/CONTEXT decisions.
- Pitfalls: MEDIUM-HIGH — Radix-in-jsdom shims and act() warnings are well-documented community issues with reproducible fixes; framer-motion `MotionConfig reducedMotion="always"` for tests is documented in Context7. The pitfalls section will hold up unless a primitive surfaces a Radix/cmdk edge case not covered (Open Question 3 covers this).
- Testing approach: HIGH — Vitest 4 + RTL 16 + happy-dom is the current canonical React 19 test stack as of 2026-04.
- Naming/ergonomic decisions (lib/api.ts shape, palette ordering): MEDIUM — these are recommendations to the planner, not facts; CONTEXT explicitly marks them as Claude's discretion.

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days — frontend stack is stable, but framer-motion / cmdk minor versions shift roughly monthly; re-verify versions before Wave 0 lands).
