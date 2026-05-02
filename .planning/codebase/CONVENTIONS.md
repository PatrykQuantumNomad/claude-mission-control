# Coding Conventions

**Analysis Date:** 2026-05-02

## Naming Patterns

**Files:**
- React components: PascalCase — `Button.tsx`, `PanelCard.tsx`, `TaskBoard.tsx`
- Test files: co-located `__tests__/` subdirectory, named after subject — `Button.test.tsx`, `TaskBoard.test.tsx`
- Python modules: snake_case — `settings.py`, `request_logging.py`, `otel_parser.py`
- Python test files: `test_<subject>.py` prefix — `test_tasks_router.py`, `test_foundation_boot.py`

**Functions (TypeScript):**
- React components: PascalCase — `Button`, `PanelCard`, `AppShell`
- Custom hooks: `use` prefix, camelCase — `useFirehose`, `useAttention`, `useSystemHealth`
- Event handlers: `handle` prefix — `handleSubmit`, or inline arrow
- Utility functions: camelCase — `formatRelative`, `sliceLast14Days`, `defaultIsEmpty`

**Variables (TypeScript):**
- camelCase for all variables — `queryClient`, `fetchMock`, `makeClient`
- SCREAMING_SNAKE_CASE for module-level constants — `CONFIG_ENV_VAR`, `DEV_CONFIG_MODES`

**Types/Interfaces (TypeScript):**
- PascalCase interfaces: `ButtonProps`, `PanelCardProps`, `PanelCardEmpty<TData>`
- Response types suffixed with `Response`: `AttentionResponse`, `SystemHealthResponse`
- Item types suffixed with `Item` or `Row`: `AttentionItem`, `TaskListItem`, `SessionListItem`
- Range types aliased explicitly: `type Range = 'today' | '7d' | '30d'`

**Functions (Python):**
- snake_case for all functions — `configure_logging`, `load_settings`, `register_error_handlers`
- Private helpers: `_` prefix — `_render_pretty`, `_resolve_repo_root_paths`, `_parse_telegram_allowed_user_ids`
- Factory helpers in tests: `make_` prefix — `make_task_row`, `make_session_row`, `make_client`

**Classes (Python):**
- PascalCase — `Settings`, `FastAPIAppBuilder`, `ReadinessRegistry`

**CSS Classes:**
- BEM-style with `cmc-` prefix — `.cmc-btn`, `.cmc-btn--primary`, `.cmc-btn--sm`
- Block: `.cmc-<component>` — `.cmc-badge`, `.cmc-panel-card`
- Modifier: `.cmc-<component>--<variant>` — `.cmc-badge--warning`, `.cmc-task-board__banner`
- Element: `.cmc-<block>__<element>` — `.cmc-task-board__columns`, `.cmc-btn__icon-left`

## Code Style

**Formatting (TypeScript):**
- No dedicated prettier config detected — TypeScript strict mode enforced via `tsconfig.json`
- Single quotes in imports/strings
- Trailing commas in multi-line structures

**Linting (Python):**
- Tool: `ruff`
- Line length: 100 characters
- Target: Python 3.13
- Selected rules: `E`, `F`, `I`, `UP`, `B`, `PERF`, `RUF` (errors, pyflakes, isort, modernize, bugbear, performance, ruff-native)
- FastAPI `Depends`, `Query`, `Path`, `Body` declared as immutable calls to silence bugbear B008

**Type checking (TypeScript):**
- TypeScript ~6.0 with `tsc --noEmit` for typecheck pass
- Strict mode enforced; generics used throughout: `PanelCard<T>`, `qk.tokens(range: Range)`

**Type checking (Python):**
- `pyright` in `basic` mode
- Includes: `cmc/` (core, config, middleware, app, auth)
- Excludes from pyright: `cmc/api`, `cmc/db`, `cmc/dispatcher`, `cmc/telegram`, `migrations`, `tests`

## Import Organization

**TypeScript order:**
1. External packages — `import { describe, it } from 'vitest'`, `import { useQuery } from '@tanstack/react-query'`
2. Internal lib — `import { qk } from '../../../lib/queries'`
3. Internal types — `import type { TaskListItem } from '../../../lib/api'`
4. Component imports — `import { render } from '../../../test/utils'`

**Python order (ruff `I` enforces isort):**
1. stdlib — `import logging`, `from pathlib import Path`
2. Third-party — `from fastapi import FastAPI`, `from pydantic import Field`
3. Local — `from cmc.config import Settings`, `from cmc.core import configure_logging`

**Path Aliases (TypeScript):**
- None configured; all imports use relative paths: `../../../lib/queries`, `'./Card'`

**Component imports:**
- Always import from barrel `src/components/ui/index.ts` (the `./` alias), never individual files: `import { Button, Badge } from './'`

## Error Handling

**TypeScript frontend:**
- `ShellErrorBoundary` wraps the full app shell in `src/components/ui/ErrorBoundary.tsx`; shows fallback with "Couldn't reach the dashboard server." heading
- `PanelCard` renders `ErrorState` on `query.isError` with retry button calling `void query.refetch()`
- `ErrorState` component at `src/components/ui/ErrorState.tsx` accepts `message`, `dataNoun`, `onRetry`
- Async functions: `void` prefix on fire-and-forget calls to suppress unhandled promise lint warnings

**Python backend:**
- Centralized exception handlers in `backend/cmc/core/errors.py`
- `HTTPException` → `{"error": exc.detail, "request_id": ...}` (NOT `{"detail": ...}`)
- Unhandled `Exception` → `log.exception(...)` + `{"error": "internal server error", "request_id": ...}` with 500
- Validators use early return with clean messages; `sys.exit(1)` on `ValidationError` in `load_settings()`
- Tests assert on `r.json()["error"]` not `r.json()["detail"]`

## Logging

**Python Framework:** `structlog` + stdlib `logging`

**Pattern:**
- Module-level logger: `log = logging.getLogger(__name__)`
- Structured log calls: `log.exception("unhandled_exception", extra={"request_id": ..., "path": ...})`
- Configuration: `configure_logging(settings)` in `backend/cmc/core/logging.py`
- Text format (dev): `"%(message)s"` — message only
- JSON format (prod): ISO timestamp + level + logger + message via `python-json-logger`
- `structlog` uses `ConsoleRenderer(colors=False)` for dev; merges contextvars

## Comments

**When to Comment:**
- File-level docstrings in every Python module: `"""FastAPI exception handlers."""`
- File-level block comments in TypeScript: `// Button — UI-SPEC FESH-06 + DESG-05. variant=primary uses...`
- Inline decision comments with spec/pitfall references: `// Pitfall 5 mitigation — IS_REACT_ACT_ENVIRONMENT bridge`
- Locked decisions documented inline: `// Locked decisions per Design note:`
- `NOTE:` prefix for non-obvious caveats in config: `# NOTE: claude_bin is INTENTIONALLY OMITTED...`

**Docstrings (Python):**
- All public functions/methods have docstrings
- Pattern: short summary sentence, then blank line, then detail with `Pitfall` or `BLOCKER` references
- Class docstrings on fixtures describe purpose, hermetic guarantees, and usage

## Function Design

**Size:** Functions kept focused; `PanelCard` and `FastAPIAppBuilder` are the largest at ~80 lines

**Parameters:**
- TypeScript: Prop interfaces with optional fields defaulted: `variant?: 'primary' | 'secondary' | 'ghost'`
- Python: Keyword arguments with explicit defaults throughout `conftest.py` factory helpers

**Return Values:**
- TypeScript: Explicit return types on hooks and utilities; `void` for side-effect functions
- Python: Return type annotations on all public functions; `-> None`, `-> Self`, `-> Settings`
- `forwardRef` used on all interactive UI primitives to expose the DOM ref: `forwardRef<HTMLButtonElement, ButtonProps>`

## Module Design

**TypeScript Exports:**
- Named exports only — no default exports in component files
- `displayName` set on all `forwardRef` components: `Button.displayName = 'Button'`
- Barrel file `src/components/ui/index.ts` re-exports all primitives with both value and type exports: `export { PanelCard }` and `export type { PanelCardEmpty }`

**Python Exports:**
- `__init__.py` aggregates public API from submodules
- Private helpers prefixed with `_` are not exposed in `__init__.py`

## Query Key Management

**Pattern:**
- All TanStack Query cache keys are defined on the `qk` factory object in `src/lib/queries.ts`
- Keys use `as const` for type inference
- Polling cadences are encoded in `queries.ts` — never inlined in panel components
- Cache invalidation uses partial key prefixes: `['sessions']` invalidates all session queries

---

*Convention analysis: 2026-05-02*
