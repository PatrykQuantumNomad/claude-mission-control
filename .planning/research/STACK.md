# Stack Research

**Domain:** Local developer observability dashboard with task automation
**Researched:** 2026-04-25
**Confidence:** HIGH

## Recommended Stack

### Core Technologies — Backend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Python | 3.13 | Runtime | User preference. Bundles SQLite 3.47 with WAL, FTS5, JSON functions, and window functions out of the box. No `from __future__ import annotations` needed. |
| FastAPI | ~0.136 | HTTP framework | Native SSE via `EventSourceResponse` (added 0.134), Pydantic-native request validation, async-first, Rust-side JSON serialization for SSE. User's established chassis patterns (app factory, builder, lifespan). |
| uvicorn | ~0.46 | ASGI server | Standard FastAPI production server. Handles SSE keep-alive and concurrent connections well for single-user dashboard workload. |
| Pydantic | ~2.13 | Validation/settings | `BaseSettings` for env-driven configuration. v2 is Rust-backed (pydantic-core), 5-50x faster validation than v1. Required by FastAPI. |
| pydantic-settings | ~2.14 | Configuration | Separates settings management from core Pydantic. Supports `.env` files, nested models, environment variable parsing. Matches chassis patterns. |
| aiosqlite | ~0.22 | Async SQLite | Thin async wrapper over stdlib `sqlite3`. Runs queries in a background thread, keeping the event loop responsive. No ORM overhead. Pairs perfectly with raw SQL approach. |
| SQLite | 3.47+ (bundled) | Database | Ships with Python 3.13. WAL mode gives concurrent reads + single writer. JSON, FTS5, window functions built in. Single-file, zero-config, perfect for localhost. |

### Core Technologies — Frontend

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2 | UI framework | Latest stable. Improved Suspense, `use()` hook, ref-as-prop, document metadata. TanStack Query v5 and TanStack Router are fully compatible. Use React 19 for new projects in 2026 -- React 18 is maintenance-only. |
| TypeScript | 6.0 | Type system | Last JS-based release before Go rewrite (TS 7). Stable, well-understood, excellent tooling. Pin to `~6.0` for stability. |
| Vite | 8.x | Build tool | Ships Rolldown (Rust bundler) for 10-30x faster builds. First-class Tailwind v4 plugin support. `@vitejs/plugin-react` v6 uses Oxc instead of Babel -- smaller install, faster transforms. |
| @vitejs/plugin-react | 6.x | React HMR | v6 drops Babel dependency, uses Oxc for React Refresh transforms. Dramatically smaller `node_modules`. |
| Tailwind CSS | 4.2 | Styling | CSS-first config via `@theme` directive (no `tailwind.config.js`). Oxide engine: 2-5x faster builds. First-party Vite plugin `@tailwindcss/vite`. v4 is a significant architectural change from v3 -- start fresh, do not migrate. |
| TanStack Router | ~1.168 | Routing | Type-safe file-based routing with `@tanstack/router-plugin/vite`. First-class search params API. Client-side caching. Three routes needed: `/` (Command), `/activity`, `/skills`. |
| TanStack Query | ~5.99 | Server state | Polling-based data fetching with `refetchInterval`. 20% smaller than v4. Handles stale-while-revalidate, background refetching, cache invalidation. Perfect for 5s/10s/30s polling intervals. |

### Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| launchd | (macOS native) | Process supervision | macOS-native daemon management. No third-party dependency. 120s heartbeat interval for dispatcher. Generates `.plist` files via `install.sh`. |
| uv | ~0.11 | Python package/project manager | 10-100x faster than pip. Replaces pip, pip-tools, virtualenv, pyenv in one tool. Lockfile support. Standard for Python projects in 2026. |

### Supporting Libraries — Backend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| structlog | ~25.5 | Structured logging | JSON/logfmt output, context variables, async-native. Use for all backend logging. Integrates well with request context middleware. |
| httpx | ~0.28 | HTTP client (async) | Telegram API calls, any outbound HTTP. Async-native, HTTP/2 support. Already a dependency of `python-telegram-bot`. |
| python-telegram-bot | ~22.7 | Telegram bridge | Async, pure Python. Handles inline buttons, callbacks, chat routing. Requires httpx 0.27-0.28. Python 3.10+ required. |
| watchfiles | ~1.1 | File system watching | Rust-backed (Notify library). Use for JSONL ingestion polling as alternative to timer-based scanning. `awatch()` provides async file change events. |
| pytest | ~9.0 | Testing | Standard Python test runner. Requires Python 3.10+. Pair with `pytest-asyncio` for async test functions. |
| pytest-asyncio | latest | Async test support | Required for testing aiosqlite queries, FastAPI lifespan, async handlers. |

### Supporting Libraries — Frontend

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| motion | ~12.38 | Animation | Formerly framer-motion (rebranded 2025). Import from `motion/react`. Layout animations, collapsible sections, page transitions. Required for Linear/Raycast polish level. |
| Recharts | ~3.8 | Charts/graphs | React + D3 charting. Stacked bars (token usage, outcomes), area charts (trends), heatmaps. Lightweight, native SVG, declarative API. |
| cmdk | ~1.1 | Command palette | Cmd+K palette with fuzzy search. Unstyled, composable, accessible. Used by Linear, Raycast, Vercel. Stable API, no recent releases needed. |
| lucide-react | ~1.8 | Icons | Tree-shakable icon set. 1500+ icons, consistent design. Fork of Feather Icons with active maintenance. |
| tailwind-merge | ~3.5 | Class merging | Resolves Tailwind class conflicts (e.g., `px-2 px-4` -> `px-4`). v3.5 supports Tailwind v4.0-4.2. Essential for component composition. |
| clsx | ~2.1 | Conditional classes | 239B utility for conditional className strings. Pairs with tailwind-merge for `cn()` helper: `cn(...inputs) => twMerge(clsx(...inputs))`. |
| date-fns | ~4.1 | Date formatting | Tree-shakable date utilities. Format timestamps, relative times, date ranges. Stable API, functional style. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Ruff | ~0.15 | Python linting + formatting | Replaces flake8, black, isort, pyupgrade. Written in Rust, 10-100x faster. Single config in `pyproject.toml`. Use `ruff check` + `ruff format`. |
| Playwright (Node) | ~1.59 | E2e testing | Browser automation for testing dashboard pages, command palette, schedule composer, theme toggle. Use `@playwright/test` npm package. |
| Playwright (Python) | ~1.58 | Optional Python e2e | Available if preferring pytest-playwright over Node Playwright. Same browser automation, Python API. |
| Biome | latest | JS/TS linting + formatting | Alternative: use if Ruff-like speed is desired for frontend. But ESLint ecosystem is more mature for React. Optional -- Vite 8 + TypeScript 6 provide good DX without it. |

## Installation

### Backend (Python)

```bash
# Use uv for package management
uv init
uv add fastapi uvicorn[standard] pydantic pydantic-settings aiosqlite structlog httpx watchfiles python-telegram-bot

# Dev dependencies
uv add --dev pytest pytest-asyncio pytest-cov ruff
```

### Frontend (Node)

```bash
# Core
npm install react@^19.2 react-dom@^19.2 @tanstack/react-router @tanstack/react-query

# UI
npm install tailwindcss@^4.2 @tailwindcss/vite motion recharts cmdk lucide-react tailwind-merge clsx date-fns

# Dev dependencies
npm install -D typescript@~6.0 vite@^8 @vitejs/plugin-react@^6 @tanstack/router-plugin @playwright/test
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| aiosqlite (raw SQL) | SQLAlchemy async | Never for this project. ORM is overkill for a read-heavy dashboard with a known, stable schema. Raw SQL is faster to write, debug, and understand for 15 tables. |
| React 19 | React 18 | Only if a critical dependency is incompatible. TanStack Router and Query both support React 19. React 18 is maintenance-only. |
| Tailwind v4 | Tailwind v3 | Only for brownfield projects. v4 is a clean break -- CSS-first config, no JS config file, Oxide engine. For greenfield, always v4. |
| TanStack Router | React Router v7 | If you need Remix/SSR-style data loading. For SPA with static serving, TanStack Router's type-safe search params and file-based routing are superior. |
| Recharts | Nivo / Victory / Tremor | If you need highly specialized chart types (sankey, chord). Recharts covers stacked bars, area, line, pie -- everything this dashboard needs. Simpler API. |
| motion (framer-motion) | react-spring / CSS transitions | If you want zero JS animation. But for layout animations, collapsible sections, and AnimatePresence (exit animations), motion is the standard. |
| uv | pip + venv | Never for new projects in 2026. uv is faster, provides lockfiles, manages Python versions. |
| Vite 8 | Vite 7 or Webpack | Only if a plugin is incompatible with v8. Vite 8's Rolldown bundler is production-ready and dramatically faster. |
| structlog | stdlib logging | Only if zero dependencies is a hard requirement. structlog gives you structured JSON output, context variables, and clean async support that stdlib logging lacks. |
| cmdk | kbar | If you need a more opinionated, batteries-included command palette. cmdk is unstyled and composable, which gives more control for Linear/Raycast-quality UI. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| SQLAlchemy / any ORM | Project explicitly uses raw SQL. ORM adds complexity, hides query performance, bloats dependencies for a dashboard with simple read patterns. | `aiosqlite` + raw SQL |
| sse-starlette | FastAPI 0.134+ has native `EventSourceResponse` with Rust-side JSON serialization, keep-alive pings, and proper headers. Third-party SSE is now redundant. | `from fastapi.sse import EventSourceResponse` |
| WebSockets | Project is explicitly SSE + polling. WebSockets add connection management complexity for no benefit on a single-user localhost dashboard. | SSE for firehose, polling (React Query `refetchInterval`) elsewhere |
| Next.js / Remix / TanStack Start | No SSR needed. Frontend is pre-built to `ui/dist/` and served as static files by FastAPI. Full-stack JS frameworks are unnecessary overhead. | Vite SPA build |
| PostgreSQL / Supabase | Localhost-only, single-user. SQLite WAL provides excellent read concurrency. External databases add network and configuration overhead for zero benefit. | SQLite with WAL mode |
| Django | Heavyweight, template-oriented, ORM-centric. FastAPI is async-first, lighter, faster, and the user already has production chassis patterns. | FastAPI |
| Axios | Legacy HTTP client. `fetch` is built into browsers. React Query wraps fetch calls. No need for a request library on frontend. | Native `fetch` + React Query |
| Moment.js | Deprecated, massive bundle size (300KB+). | `date-fns` (tree-shakable, ~5KB per function used) |
| styled-components / CSS modules | Tailwind v4 with its CSS-first approach is the styling solution. Adding CSS-in-JS adds runtime cost and complexity. | Tailwind CSS v4 |
| framer-motion (package name) | Renamed to `motion` in 2025. The `framer-motion` npm package is a compatibility shim. | `motion` (import from `motion/react`) |
| Create React App | Deprecated. Vite is the standard React build tool. | Vite 8 |
| Black / isort / flake8 / pyupgrade | Ruff replaces all of these in a single Rust-based tool that is 10-100x faster. | Ruff |
| pip / pip-tools / poetry | uv replaces all of these. Faster, lockfiles, Python version management, single tool. | uv |

## Stack Patterns by Variant

**For the OTEL firehose panel (SSE streaming):**
- Use FastAPI's native `EventSourceResponse` (0.134+)
- Yield `ServerSentEvent` objects from an async generator
- FastAPI auto-sends keep-alive pings every 15s
- On frontend: `EventSource` API + React state, or React Query with SSE adapter

**For the polling-based panels (sessions, tokens, tools, etc.):**
- Use React Query `useQuery` with `refetchInterval`:
  - 30s for general panels (sessions, tokens, tools)
  - 10s for inbox
  - 5s for decisions queue
- FastAPI returns JSON responses, React Query handles caching/dedup

**For the Telegram bridge:**
- Use `python-telegram-bot` v22.7 (async, pure Python)
- Plain text messages (no `parse_mode`) to avoid markdown escaping issues with DB-sourced content
- Inline buttons for approvals/callbacks

**For the database layer:**
- Single `aiosqlite` connection with WAL mode
- `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` on connect
- `PRAGMA optimize` before connection close
- `CREATE TABLE IF NOT EXISTS` for idempotent migrations
- Helper function for `ALTER TABLE ADD COLUMN` that catches "column already exists"

**For the CLI (`cc` shim):**
- Pure Python with `argparse` or `click`
- Subcommands: start/stop/restart/doctor/setup/sync/logs
- Talks to FastAPI via localhost HTTP calls

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| FastAPI ~0.136 | Pydantic ~2.13 | FastAPI pins Pydantic v2. Always upgrade together. |
| FastAPI ~0.136 | uvicorn ~0.46 | Standard pairing. `uvicorn[standard]` installs uvloop + httptools. |
| React 19.2 | TanStack Query ~5.99 | Query v5 supports React 18+. Works with React 19. |
| React 19.2 | TanStack Router ~1.168 | Router is fully React 19 compatible. |
| React 19.2 | motion ~12.38 | motion supports React 18+. Tested with React 19. |
| Tailwind 4.2 | tailwind-merge ~3.5 | tw-merge v3 supports Tailwind v4.0-4.2. Use v2.6 only for Tailwind v3 projects. |
| Tailwind 4.2 | @tailwindcss/vite | First-party Vite plugin. Install together: `tailwindcss @tailwindcss/vite`. |
| Vite 8 | @vitejs/plugin-react 6.x | v6 is built for Vite 8. v5 also works with Vite 8 as fallback. |
| TypeScript ~6.0 | Vite 8 | Full support. TS 6 is the last JS-based compiler (Go rewrite is TS 7). |
| python-telegram-bot ~22.7 | httpx ~0.28 | Requires httpx >=0.27, <0.29. Pin httpx within this range. |
| Python 3.13 | aiosqlite ~0.22 | aiosqlite wraps stdlib sqlite3. Python 3.13 bundles SQLite 3.47. |
| Ruff ~0.15 | Python 3.13 | Full support for 3.13 syntax and features. |

## Sources

- [FastAPI PyPI](https://pypi.org/project/fastapi/) -- version 0.136.1 verified (HIGH confidence)
- [FastAPI SSE docs](https://fastapi.tiangolo.com/tutorial/server-sent-events/) -- native EventSourceResponse since 0.134 (HIGH confidence)
- [React npm](https://www.npmjs.com/package/react) -- version 19.2.5 verified (HIGH confidence)
- [React 19.2 blog post](https://react.dev/blog/2025/10/01/react-19-2) -- release notes (HIGH confidence)
- [Vite releases](https://vite.dev/releases) -- version 8.0.9 verified (HIGH confidence)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) -- Rolldown bundler, plugin-react v6 (HIGH confidence)
- [TanStack Router npm](https://www.npmjs.com/package/@tanstack/react-router) -- version 1.168.23 verified (HIGH confidence)
- [TanStack Query npm](https://www.npmjs.com/package/@tanstack/react-query) -- version 5.99.2 verified (HIGH confidence)
- [TanStack Query installation docs](https://tanstack.com/query/v5/docs/react/installation) -- React 18+ compatibility (HIGH confidence)
- [Tailwind CSS npm](https://www.npmjs.com/package/tailwindcss) -- version 4.2.4 verified (HIGH confidence)
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) -- CSS-first config, Oxide engine (HIGH confidence)
- [Tailwind v4.1 blog](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/blog/tailwindcss-v4-1/index.mdx) -- Vite plugin install (Context7, HIGH confidence)
- [TypeScript npm](https://www.npmjs.com/package/typescript) -- version 6.0.3 verified (HIGH confidence)
- [TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) -- last JS-based release (HIGH confidence)
- [Pydantic PyPI](https://pypi.org/project/pydantic/) -- version 2.13.2 verified (HIGH confidence)
- [pydantic-settings PyPI](https://pypi.org/project/pydantic-settings/) -- version 2.14.0 verified (HIGH confidence)
- [aiosqlite PyPI](https://pypi.org/project/aiosqlite/) -- version 0.22.1 verified (HIGH confidence)
- [uvicorn PyPI](https://pypi.org/project/uvicorn/) -- version 0.46.0 verified (HIGH confidence)
- [motion npm](https://www.npmjs.com/package/motion) -- version 12.38.0 verified (HIGH confidence)
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide) -- framer-motion -> motion rename (HIGH confidence)
- [Recharts npm](https://www.npmjs.com/package/recharts) -- version 3.8.1 verified (HIGH confidence)
- [cmdk npm](https://www.npmjs.com/package/cmdk) -- version 1.1.1 verified (MEDIUM confidence, stable but infrequent releases)
- [lucide-react npm](https://www.npmjs.com/package/lucide-react) -- version 1.8.0 verified (HIGH confidence)
- [tailwind-merge npm](https://www.npmjs.com/package/tailwind-merge) -- version 3.5.0 verified (HIGH confidence)
- [clsx npm](https://www.npmjs.com/package/clsx) -- version 2.1.1 verified (HIGH confidence)
- [date-fns npm](https://www.npmjs.com/package/date-fns) -- version 4.1.0 verified (MEDIUM confidence, no releases in 12+ months but stable API)
- [python-telegram-bot PyPI](https://pypi.org/project/python-telegram-bot/) -- version 22.7 verified (HIGH confidence)
- [structlog docs](https://www.structlog.org/) -- version 25.5.0 verified (HIGH confidence)
- [httpx PyPI](https://pypi.org/project/httpx/) -- version 0.28.1 verified (HIGH confidence)
- [watchfiles PyPI](https://pypi.org/project/watchfiles/) -- version 1.1.1 verified (HIGH confidence)
- [Ruff PyPI](https://pypi.org/project/ruff/) -- version 0.15.11 verified (HIGH confidence)
- [uv docs](https://docs.astral.sh/uv/) -- version 0.11.7 verified (HIGH confidence)
- [pytest PyPI](https://pypi.org/project/pytest/) -- version 9.0.3 verified (HIGH confidence)
- [Playwright npm](https://www.npmjs.com/package/playwright) -- version 1.59.1 verified (HIGH confidence)
- [Python 3.13 sqlite3 docs](https://docs.python.org/3/library/sqlite3.html) -- SQLite 3.47 bundled (HIGH confidence)
- [SQLite WAL docs](https://www.sqlite.org/wal.html) -- concurrent read architecture (HIGH confidence)
- TanStack Router Context7 `/tanstack/router` -- file-based routing, Vite plugin config (HIGH confidence)
- TanStack Query Context7 `/tanstack/query` -- quick start, installation (HIGH confidence)
- Tailwind CSS Context7 `/tailwindlabs/tailwindcss.com` -- v4 install commands, Vite plugin (HIGH confidence)

---
*Stack research for: local developer observability dashboard with task automation*
*Researched: 2026-04-25*
