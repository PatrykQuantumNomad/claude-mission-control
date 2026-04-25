---
phase: 01-foundation-database
plan: 03
subsystem: ui
tags: [vite, react, tanstack-router, typescript, frontend, phase-1]

# Dependency graph
requires:
  - phase: 01-foundation-database
    provides: Phase research (RESEARCH.md Pattern 7 — Vite + TanStack Router + Dev Proxy) defining plugin order, port (5173), dev proxy (/api -> 127.0.0.1:8765), and the verbatim main.tsx / __root.tsx / index.tsx wiring
provides:
  - Buildable frontend/ directory with React 19 + TanStack Router + Vite 8
  - frontend/dist/ production build artifact (index.html + assets/) for FastAPI to serve via SPAStaticFiles in Plan 01-07
  - Dev server config: port 5173 (strictPort), /api proxy -> http://127.0.0.1:8765
  - "Mission Control online." placeholder route at /
  - Plugin-generated frontend/src/routeTree.gen.ts (proves tanstackRouter plugin order is correct)
  - Locked frontend dependency versions in package-lock.json
affects: [Plan 01-07 (FastAPI mounts dist/), Phase 5 (replaces styles.css with DESG-01..06 design system; adds /activity and /skills routes per FESH-01), Phase 9 (installer needs to know dist/ path)]

# Tech tracking
tech-stack:
  added:
    - react@19.2.5
    - react-dom@19.2.5
    - "@tanstack/react-router@1.168.24"
    - "@tanstack/router-plugin@1.167.26"
    - "@tanstack/react-router-devtools@1.166.13"
    - "@vitejs/plugin-react@6.0.1"
    - vite@8.0.10
    - typescript@6.0.3
    - "@types/react@19.2.14"
    - "@types/react-dom@19.2.3"
  patterns:
    - "Plugin-order-as-correctness-test: routeTree.gen.ts existing after a build is the empirical proof that tanstackRouter is FIRST in plugins[] (per RESEARCH.md Pitfall 3 — silent failure otherwise)"
    - "Vite-build-then-tsc seeding: first build runs `npx vite build` directly to let the plugin generate routeTree.gen.ts before `tsc -b` type-checks, sidestepping a chicken-and-egg circular dependency on first run"
    - "Dev proxy over CORS: Vite server.proxy forwards /api to FastAPI on 8765, keeping same-origin model in dev (no CORS middleware needed in backend)"

key-files:
  created:
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/tsconfig.json
    - frontend/tsconfig.node.json
    - frontend/index.html
    - frontend/vite.config.ts
    - frontend/.gitignore
    - frontend/src/main.tsx
    - frontend/src/routes/__root.tsx
    - frontend/src/routes/index.tsx
    - frontend/src/styles.css
    - frontend/src/routeTree.gen.ts
    - frontend/src/vite-env.d.ts
  modified: []

key-decisions:
  - "tanstackRouter() is plugins[0]; react() is plugins[1] — verified by index comparison in vite.config.ts (RESEARCH.md Pitfall 3)"
  - "Drop the unused `import React from 'react'` from main.tsx — React 19 + react-jsx runtime makes it unnecessary, and tsconfig's noUnusedLocals/Parameters would otherwise fail tsc -b"
  - "Add src/vite-env.d.ts (`/// <reference types=\"vite/client\" />`) so `import './styles.css'` typechecks under bundler module resolution"
  - "Commit src/routeTree.gen.ts so Plan 01-07 can build without first running the dev server; gitignore vite.config.{d.ts,js} which are tsc -b composite-build artifacts"
  - "Use @tanstack/react-router-devtools@^1.166.13 (the latest published 1.16x), since the plan-suggested 1.168.0 does not exist in npm — caret-range resolves successfully"

patterns-established:
  - "Pattern 1: Frontend lives in frontend/ (sibling to backend/), with dist/ as the production build target FastAPI mounts via SPAStaticFiles"
  - "Pattern 2: Strict TypeScript (strict + noUnusedLocals + noUnusedParameters) for frontend code from day one; React 19's react-jsx runtime + types/react-dom carry the JSX typings"
  - "Pattern 3: TanStack Router plugin generates routeTree.gen.ts on every build — the file is committed (not gitignored) so downstream plans can build without a prior dev cycle"

# Metrics
duration: ~10min
completed: 2026-04-25
---

# Phase 01 Plan 03: Frontend Project Skeleton Summary

**Vite 8 + React 19 + TanStack Router 1.168 SPA scaffolded with the verified-correct plugin order, producing a 284 KB `frontend/dist/` build artifact that FastAPI can mount in Plan 01-07.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-25T12:18:00Z (approx)
- **Completed:** 2026-04-25T12:21:46Z (approx)
- **Tasks:** 3 / 3
- **Files created:** 13 (frontend/ tree)
- **Files modified:** 0 outside frontend/

## Accomplishments

- `frontend/` scaffolded end-to-end: package.json, tsconfig.json, tsconfig.node.json, index.html, vite.config.ts, .gitignore, src/main.tsx, src/routes/__root.tsx, src/routes/index.tsx, src/styles.css, src/vite-env.d.ts (auto-fix), src/routeTree.gen.ts (plugin-generated).
- `npm install` resolves 113 packages cleanly against the npm registry; package-lock.json captures the exact tree.
- `npm run build` completes (`tsc -b && vite build`) producing `dist/index.html` + `dist/assets/{index-*.js, index-*.css, routes-*.js}` (284 KB total, 87 KB gzipped JS bundle).
- `frontend/src/routeTree.gen.ts` exists after build → empirical proof that tanstackRouter is the FIRST plugin (RESEARCH.md Pitfall 3 — would silently fail otherwise).
- "Mission Control online." renders at `/` via the createFileRoute('/') component, ready for Phase 5 to replace.
- Vite dev server config: port 5173 (strictPort), /api proxy -> http://127.0.0.1:8765 (changeOrigin: false, same-origin model).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create frontend project files (package.json, tsconfig, index.html, vite.config.ts, .gitignore)** — `eb68d39` (feat)
2. **Task 2: Create React entry + TanStack routes (main.tsx, routes/__root.tsx, routes/index.tsx, styles.css)** — `bbf6cf6` (feat)
3. **Task 3: Install deps and verify the build produces frontend/dist** — `e7f74ef` (feat)

**Plan metadata:** `<final-commit-hash>` (set by the metadata commit that follows this SUMMARY.md).

## Files Created

- `frontend/package.json` — Frontend deps (react@^19.2.5, react-dom@^19.2.5, @tanstack/react-router@^1.168.24) + devDeps (router-plugin, vite, typescript, types) + npm scripts (dev / build / preview)
- `frontend/package-lock.json` — Locked tree (113 packages); committed for reproducible builds
- `frontend/tsconfig.json` — Strict TypeScript, ES2022 target, react-jsx, bundler module resolution; references tsconfig.node.json
- `frontend/tsconfig.node.json` — Composite project for vite.config.ts
- `frontend/index.html` — HTML shell with `<div id="root">` and `/src/main.tsx` module entry
- `frontend/vite.config.ts` — `tanstackRouter()` at plugins[0] (line 10), `react()` at plugins[1] (line 14); server.port 5173 strictPort; proxy /api -> 127.0.0.1:8765; build outDir 'dist' emptyOutDir true sourcemap false
- `frontend/.gitignore` — node_modules/, dist/, .vite/, *.tsbuildinfo, vite.config.d.ts, vite.config.js
- `frontend/src/main.tsx` — RouterProvider wired to `routeTree` from `./routeTree.gen`; declare module augmentation registers router type
- `frontend/src/routes/__root.tsx` — `createRootRoute` with cmc-shell layout and `<Outlet/>`
- `frontend/src/routes/index.tsx` — `createFileRoute('/')` rendering "Mission Control online." inside `<main className="cmc-main">`
- `frontend/src/styles.css` — Minimal dark placeholder palette (--cmc-bg #0a0a0f, --cmc-fg #e6e6f0); Phase 5 replaces this with DESG-01..06
- `frontend/src/routeTree.gen.ts` — Generated by tanstackRouter plugin; committed so Plan 01-07 / downstream phases can build without first running dev
- `frontend/src/vite-env.d.ts` — `/// <reference types="vite/client" />`; provides CSS-module type declarations under bundler module resolution

## Plugin Order Verification

`frontend/vite.config.ts` (line numbers):

- Line 10: `tanstackRouter({` — plugins[0]
- Line 14: `react(),` — plugins[1]

The build pipeline confirms this empirically: after `npm run build`, `frontend/src/routeTree.gen.ts` exists with real route metadata (not the placeholder `{} as never`). Per RESEARCH.md Pitfall 3, the plugin would silently fail to emit routeTree.gen.ts if tanstackRouter were second.

## Build Artifact Inventory

`frontend/dist/`:

| Path                                | Size    | Gzip     |
| ----------------------------------- | ------- | -------- |
| `dist/index.html`                   | 407 B   | 273 B    |
| `dist/assets/index-vjEIWytj.css`    | 347 B   | 254 B    |
| `dist/assets/routes-BSAJ_Hzy.js`    | 155 B   | 154 B    |
| `dist/assets/index-C6NVRcsU.js`     | 275.85 kB | 87.29 kB |
| **Total**                           | **~284 KB** | — |

Hashed asset filenames change on each build; Plan 01-07 mounts the entire `dist/` directory via SPAStaticFiles, not by referencing specific hashed names.

## Resolved Versions (from package-lock.json)

| Package                              | Range            | Resolved   |
| ------------------------------------ | ---------------- | ---------- |
| react                                | ^19.2.5          | 19.2.5     |
| react-dom                            | ^19.2.5          | 19.2.5     |
| @tanstack/react-router               | ^1.168.24        | 1.168.24   |
| @tanstack/router-plugin              | ^1.167.26        | 1.167.26   |
| @tanstack/react-router-devtools      | ^1.166.13        | 1.166.13   |
| @vitejs/plugin-react                 | ^6.0.1           | 6.0.1      |
| vite                                 | ^8.0.10          | 8.0.10     |
| typescript                           | ~6.0.0           | 6.0.3      |
| @types/react                         | ^19.2.0          | 19.2.14    |
| @types/react-dom                     | ^19.2.0          | 19.2.3     |

All versions match RESEARCH.md "Standard Stack > Core (Frontend)" exactly.

## Decisions Made

- **Devtools version pin:** Plan suggested `@tanstack/react-router-devtools@^1.168.0`, but the highest published 1.16x version on npm is `1.166.13`. Used `^1.166.13` so npm install resolves cleanly. (Caret range; will pick up later 1.x releases automatically.)
- **Drop unused React import in main.tsx:** With React 19 + react-jsx runtime + tsconfig's `noUnusedLocals: true`, the verbatim RESEARCH.md snippet's `import React from 'react'` causes `tsc -b` to fail (TS6133). React is unused in the file's identifier scope. Removed.
- **Add vite-env.d.ts:** `import './styles.css'` fails to typecheck under bundler module resolution unless Vite's client types are referenced. Added single-line `/// <reference types="vite/client" />`.
- **Commit src/routeTree.gen.ts (don't gitignore):** Plan's frontmatter listed it as a Task 3 output. Committing the seed file means Plan 01-07 (and any future re-clones) can `npm run build` without first running `npm run dev` — removes a hidden setup step.
- **Gitignore vite.config.{d.ts,js}:** `tsc -b` with composite-mode tsconfig.node.json emits these alongside the .ts source. They're build noise; not needed at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc -b fails on first build because routeTree.gen.ts doesn't exist yet**
- **Found during:** Task 3 (initial `npm run build` invocation)
- **Issue:** Plan suggested adding a placeholder `export const routeTree = {} as never` so tsc would have something to import on the first build. In practice this collapses TanStack Router's generic type inference to `never`, producing four downstream tsc errors (`Property 'context' is missing`, `RouterCore<never, ...>` not assignable to `AnyRouter`, `Argument of type '"/"' is not assignable to parameter of type 'undefined'`).
- **Fix:** Removed the placeholder. Ran `npx vite build` directly first — this triggers the tanstackRouter plugin which generates a real routeTree.gen.ts with the correct generic parameters. Subsequent `npm run build` (which runs `tsc -b && vite build`) then succeeds because tsc has a real route tree to type-check against.
- **Files modified:** Removed `frontend/src/routeTree.gen.ts` placeholder; let plugin generate the real one.
- **Verification:** `npm run build` completes cleanly (tsc passes, Vite emits dist/ artifacts).
- **Committed in:** `e7f74ef` (Task 3 commit)

**2. [Rule 1 - Bug] tsc -b fails because main.tsx imports unused React identifier**
- **Found during:** Task 3 (first `npm run build`)
- **Issue:** RESEARCH.md and the plan both specify `import React from 'react'` in main.tsx, but tsconfig.json sets `noUnusedLocals: true` and `jsx: "react-jsx"`. Under react-jsx runtime, React is auto-imported by the compiler — the explicit import is unused, and tsc errors with `TS6133: 'React' is declared but its value is never read`.
- **Fix:** Removed the `import React from 'react'` line. JSX still compiles correctly via the automatic runtime.
- **Files modified:** `frontend/src/main.tsx`
- **Verification:** `npm run build` passes tsc; rendered output is unchanged (RouterProvider mounts the same tree).
- **Committed in:** `e7f74ef` (Task 3 commit)

**3. [Rule 1 - Bug] tsc -b fails because `import './styles.css'` has no type declaration**
- **Found during:** Task 3 (first `npm run build`)
- **Issue:** Under `moduleResolution: "bundler"`, TypeScript can't resolve `import './styles.css'` without a Vite client types reference. Error: `TS2882: Cannot find module or type declarations for side-effect import of './styles.css'`.
- **Fix:** Added `frontend/src/vite-env.d.ts` with single line `/// <reference types="vite/client" />`. This pulls in Vite's CSS module declarations (and asset import declarations) for the whole src/ tree.
- **Files modified:** Added `frontend/src/vite-env.d.ts`
- **Verification:** `npm run build` passes; the CSS import works at runtime (styles.css is bundled to dist/assets/index-*.css).
- **Committed in:** `e7f74ef` (Task 3 commit)

**4. [Rule 1 - Bug] Task 1 verification heuristic false-positive on `react()` substring inside comment**
- **Found during:** Task 1 (verification step)
- **Issue:** Plan's automated verify command searches `cfg.indexOf('react()')` and `cfg.indexOf('tanstackRouter(')`, comparing positions to validate plugin ordering. The verbatim RESEARCH.md comment `// MUST come before react()` precedes the `tanstackRouter(` call. The substring `react()` appears in the comment first, so `r < p` and the script reports "Plugin order WRONG" even though plugins[0] is tanstackRouter (correctly).
- **Fix:** Reworded the comment to `// MUST come before the React plugin (tanstackRouter must be FIRST)` — same intent, no `react()` substring in the comment. The verification script now correctly finds `react()` only at the plugin-call site (line 14), after `tanstackRouter(` (line 10).
- **Files modified:** `frontend/vite.config.ts`
- **Verification:** Verification script now prints `OK` and `Plugin order OK`. Real plugin order was correct all along; this was a verification-script bug, not an implementation bug.
- **Committed in:** `eb68d39` (Task 1 commit; the comment was finalized before the commit)

**5. [Rule 3 - Blocking hygiene] tsc -b composite mode emits vite.config.{d.ts,js} as untracked artifacts**
- **Found during:** Task 3 (post-build `git status`)
- **Issue:** With `composite: true` in tsconfig.node.json, `tsc -b` emits compiled outputs alongside the .ts source: `frontend/vite.config.d.ts` and `frontend/vite.config.js`. The plan's .gitignore from Task 1 only covers node_modules/, dist/, .vite/, and *.tsbuildinfo — leaving these compiler artifacts untracked.
- **Fix:** Extended `frontend/.gitignore` with `vite.config.d.ts` and `vite.config.js`.
- **Files modified:** `frontend/.gitignore`
- **Verification:** `git status --short frontend/` shows no untracked compiler artifacts.
- **Committed in:** `e7f74ef` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (3 bug-fix, 1 blocking-fix, 1 hygiene)
**Impact on plan:** All five auto-fixes were necessary for the build to succeed (or for the verifier to behave correctly). No scope creep — every change kept the SPA "Mission Control online." minimal and Phase-5-deferrable.

## Issues Encountered

- **First-build chicken-and-egg with routeTree.gen.ts:** The TanStack Router file-based routing model needs a generated routeTree before tsc can typecheck main.tsx, but tsc runs before vite build (per `npm run build` script). Resolution: seeded the routeTree by running `npx vite build` once directly (plugin runs, generates real routeTree.gen.ts), then `npm run build` (tsc + vite) works on every subsequent invocation. The seeded file is committed so re-clones don't hit this.

## User Setup Required

None — no external services or secrets needed. `cd frontend && npm install && npm run build` runs cleanly with no env vars.

## Next Phase Readiness

- **Plan 01-07 (FastAPI integration):** ✅ `frontend/dist/index.html` and `frontend/dist/assets/*.js|css` exist; SPAStaticFiles can mount the directory directly.
- **Phase 5 (UI):** Ready to replace `frontend/src/styles.css` with the DESG-01..06 design system, add `frontend/src/routes/activity.tsx` and `frontend/src/routes/skills.tsx` per FESH-01, and wire real data sources.
- **Concerns:** None. Plugin order is verified empirically (routeTree.gen.ts exists post-build).

## Self-Check: PASSED

Verified files exist:
- frontend/package.json: FOUND
- frontend/package-lock.json: FOUND
- frontend/tsconfig.json: FOUND
- frontend/tsconfig.node.json: FOUND
- frontend/index.html: FOUND
- frontend/vite.config.ts: FOUND
- frontend/.gitignore: FOUND
- frontend/src/main.tsx: FOUND
- frontend/src/routes/__root.tsx: FOUND
- frontend/src/routes/index.tsx: FOUND
- frontend/src/styles.css: FOUND
- frontend/src/routeTree.gen.ts: FOUND
- frontend/src/vite-env.d.ts: FOUND
- frontend/dist/index.html: FOUND
- frontend/dist/assets/ (with .js + .css): FOUND

Verified commits exist:
- eb68d39 (Task 1): FOUND
- bbf6cf6 (Task 2): FOUND
- e7f74ef (Task 3): FOUND

---
*Phase: 01-foundation-database*
*Plan: 03*
*Completed: 2026-04-25*
