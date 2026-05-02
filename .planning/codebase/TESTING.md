# Testing Patterns

**Analysis Date:** 2026-05-02

## Test Framework

### Frontend

**Runner:**
- Vitest 4.x
- Config: `frontend/vitest.config.ts`
- Environment: `happy-dom` (NOT jsdom — Node 25 Web Storage API interference)
- Globals: enabled (`describe`, `it`, `expect` available without imports, though tests import explicitly)

**Assertion Library:**
- `@testing-library/jest-dom` matchers via `@testing-library/jest-dom/vitest` import in setup
- Vitest built-in `expect`

**Component Renderer:**
- `@testing-library/react` 16.x
- `@testing-library/user-event` 14.x for interaction testing
- Custom wrapper at `frontend/src/test/utils.tsx` — ALWAYS import from here, not directly from `@testing-library/react`

**Run Commands:**
```bash
# From frontend/
NODE_OPTIONS=--no-experimental-webstorage vitest run        # Run all tests (single pass)
NODE_OPTIONS=--no-experimental-webstorage vitest            # Watch mode
NODE_OPTIONS=--no-experimental-webstorage vitest run --coverage   # With coverage (v8 provider)
```

### Backend

**Runner:**
- pytest 9.x
- Config: `backend/pyproject.toml` `[tool.pytest.ini_options]`
- Async mode: `asyncio_mode = "auto"` (all async tests auto-discovered)
- Test path: `backend/tests/`

**Run Commands:**
```bash
# From backend/
uv run pytest              # Run all tests
uv run pytest -q           # Quiet mode (default via addopts)
uv run pytest --cov        # With coverage (pytest-cov)
uv run pytest tests/test_tasks_router.py   # Single file
```

**HTTP Client for API tests:**
- `httpx.AsyncClient` with `httpx.ASGITransport` — no real network; exercises full ASGI stack
- Base URL: `http://testserver`

### E2E (Frontend)

**Runner:**
- Playwright 1.x
- Config: `frontend/playwright.config.ts`
- Browser: Chromium only (single-developer macOS dashboard; multi-browser is v2)
- Target: `vite preview` production build at `http://127.0.0.1:4173` (NOT `vite dev`)
- Backend: real uvicorn on `http://127.0.0.1:8765`
- Serial execution (`fullyParallel: false`, `workers: 1`) — schedule tests mutate server state

```bash
# From frontend/
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Interactive Playwright UI
```

## Test File Organization

**Frontend Location:**
- Co-located `__tests__/` subdirectory within each component category
- `frontend/src/components/ui/__tests__/` — UI primitive tests
- `frontend/src/components/shell/__tests__/` — shell/navigation tests
- `frontend/src/components/panels/__tests__/` — panel component tests
- `frontend/src/lib/__tests__/` — lib/hook/utility tests
- `frontend/src/__tests__/` — integration tests (boots full router)
- `frontend/src/test/__tests__/` — test harness smoke tests
- E2E tests: `frontend/tests/e2e/*.spec.ts`

**Backend Location:**
- Flat `backend/tests/` directory
- One test file per router or subsystem: `test_tasks_router.py`, `test_dispatcher.py`
- Shared fixtures in `backend/tests/conftest.py`
- Subprocess fixtures in `backend/tests/fixtures/`

**Naming:**
- Frontend unit/integration: `<ComponentName>.test.tsx` or `<util>.test.ts`
- Frontend E2E: `<subject>.spec.ts`
- Backend: `test_<router_or_system>.py`

## Test Structure

### Frontend Suite Organization

```typescript
// Standard pattern for component tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, userEvent } from '../../../test/utils'   // ALWAYS this path
import { ComponentUnderTest } from '../ComponentUnderTest'
import { qk } from '../../../lib/queries'
import type { SomeResponse } from '../../../lib/api'

// Local QueryClient factory — consistent settings across all panel tests
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

// Wrapper component providing required providers
function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// Data factory — overrides pattern
function makeItem(overrides: Partial<SomeItem> = {}): SomeItem {
  return { id: 1, title: 'default', status: 'pending', ...overrides }
}

describe('ComponentName', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders skeleton while loading', () => { ... })
  it('renders data when query resolves', async () => { ... })
  it('renders empty state when items array is empty', async () => { ... })
})
```

### Backend Suite Organization

```python
"""Router tests — TASK-01..07."""

import pytest
from .conftest import make_task_row   # import factory helpers directly

# ---- Schema smoke (synchronous, no DB) ----

def test_schema_validates():
    t = TaskCreate(title="hello")
    assert t.title == "hello"

# ---- Async router tests ----

@pytest.mark.asyncio
async def test_list_endpoint(client) -> None:
    """TASK-01: GET /api/tasks — all rows returned."""
    # seed via sessionmaker directly
    sessionmaker = client._transport.app.state.sessions
    async with sessionmaker() as db:
        db.add(Task(**make_task_row(title="t1")))
        await db.commit()

    r = await client.get("/api/tasks")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "t1"
```

**Patterns:**
- `beforeEach`/`afterEach` with `vi.restoreAllMocks()` in every frontend describe block that spies
- `beforeAll`/`afterAll` used only for console error silencing
- `async with cm:` lifespan entry in backend `seeded_app`/`client` fixtures — DB migrations run before first request

## Mocking

### Frontend — fetch mocking

**Primary pattern:** `vi.spyOn(globalThis, 'fetch')` with per-test `vi.restoreAllMocks()` in `afterEach`

```typescript
// Idle mock (prevents real network calls, returns {} for unmatched)
vi.spyOn(globalThis, 'fetch').mockResolvedValue(
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
)

// URL-discriminating mock for complex tests
vi.spyOn(globalThis, 'fetch').mockImplementation(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'DELETE' && /\/api\/tasks\/\d+$/.test(url)) {
      return new Response(null, { status: 204 })
    }
    return new Response(JSON.stringify(defaultData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
)
```

**Cache seeding — preferred over fetch mocking for data rendering tests:**

```typescript
const client = makeClient()
client.setQueryData(qk.tasks(), mockData)   // pre-seeds cache; component skips fetch
render(<Wrap client={client}><TaskBoard /></Wrap>)
```

**EventSource mocking (SSE/firehose tests):**

```typescript
class MockEventSource extends EventTarget {
  url: string; closed = false
  constructor(url: string) { super(); this.url = url }
  close() { this.closed = true }
}
// Install before test, restore after
;(globalThis as unknown as { EventSource: unknown }).EventSource = MockEventSource
```

**Motion mocking:**
- Handled automatically by custom `render` wrapper in `src/test/utils.tsx`
- Wraps all rendered trees in `<MotionConfig reducedMotion="always">` — never mock framer-motion manually

**Console silencing:**
```typescript
let errSpy: ReturnType<typeof vi.spyOn>
beforeAll(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { errSpy.mockRestore() })
```

### Backend — monkeypatch/unittest.mock

```python
# monkeypatch for env vars
monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
monkeypatch.delenv("CMC_ENV", raising=False)

# unittest.mock for subprocess
from unittest.mock import MagicMock
mock_popen = MagicMock()
monkeypatch.setattr("cmc.tasks.spawn.subprocess.Popen", mock_popen)
monkeypatch.setattr("cmc.tasks.spawn.repo_root", lambda: tmp_path)

# AsyncMock for async service calls
from unittest.mock import AsyncMock
fake_client.messages.create = AsyncMock(return_value=fake_msg)

# psutil mocking via shared fixture
mock_psutil_pids({1234, 5678})   # registers live PIDs; patches psutil.pid_exists globally
```

**What to Mock:**
- `globalThis.fetch` in all frontend component/panel tests
- `EventSource` in firehose/OtelPanel tests
- `subprocess.Popen` in dispatcher spawn tests
- `psutil.pid_exists` in ESTOP/process tests
- `ANTHROPIC_API_KEY` env var in tests that call external AI APIs

**What NOT to Mock:**
- The SQLite database — real in-memory/tmp SQLite used in all backend tests
- TanStack Query — real `QueryClient` instance used; only fetch is mocked
- React Router — real `RouterProvider` with `createMemoryHistory` in integration tests
- Alembic migrations — real migrations run in `client` fixture lifespan

## Fixtures and Factories

### Frontend — Local factory functions

```typescript
// Per-file factory functions with overrides pattern
function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 1, title: 'task-default', status: 'pending',
    priority: 3, quadrant: null, approval: 'auto',
    // ... all required fields ...
    ...overrides,
  }
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}
```

**Location:** Defined locally at the top of each test file. No shared fixture files for component tests.

### Backend — conftest.py factories

Plain module-level helper functions (NOT pytest fixtures) in `backend/tests/conftest.py`:

- `make_session_row(**overrides) -> dict` — returns dict for `Session(**row)` or raw INSERT
- `make_task_row(**overrides) -> dict`
- `make_schedule_row(**overrides) -> dict`
- `make_decision_row(**overrides) -> dict`
- `make_inbox_row(**overrides) -> dict`
- `make_otel_event(**overrides) -> dict`
- `make_token_usage_bucket(**overrides) -> dict`
- `make_tool_call(**overrides) -> dict`
- `make_task_orm(**overrides) -> Task` — returns ORM instance
- `make_schedule_orm(**overrides) -> Schedule`

**Pitfall 4:** All datetime defaults use `datetime.now(UTC)` — NEVER `datetime.utcnow()`

### Backend — pytest fixtures

Defined in `backend/tests/conftest.py`:

- `clean_env` — strips all CMC/ANTHROPIC/TELEGRAM env vars via `monkeypatch`
- `tmp_db_path` — per-test fresh SQLite path in `tmp_path`
- `test_settings` — `Settings(_env_file=None, db_path=tmp_db_path)`; hermetic
- `test_settings_with_static` — variant with real static_dir for SPA tests
- `fake_jsonl_dir` — mimics `~/.claude/projects/<hash>/` layout
- `golden_jsonl_session` — synthetic JSONL with known event mix (used by INGST tests)
- `otlp_log_payload`, `otlp_metric_payload` — minimal valid OTLP payloads
- `seeded_app` — full FastAPI app via `create_app(test_settings)`; returns `(app, lifespan_cm)`
- `client` — `httpx.AsyncClient` bound to `seeded_app` with real lifespan + migrations
- `tmp_pid_dir` — per-test PID directory for ESTOP tests
- `mock_anthropic_client` — patches `AsyncAnthropic` constructor; configurable response
- `tmp_pid_dir_monkey` — PID dir + monkeypatches dispatcher bindings
- `mock_psutil_pids` — returns callable to register live PIDs; patches `psutil.pid_exists`
- `pytest_freezer` (from `pytest-freezer`) — deterministic time for local-day bucket tests

Subprocess fixtures in `backend/tests/fixtures/`:
- `fake_claude_classic.py` — simulates classic mode claude binary output
- `fake_claude_stream.py` — simulates streaming mode output

## Coverage

**Frontend:**
- Provider: `@vitest/coverage-v8`
- Reporters: `text` + `html`
- Includes: `src/**/*.{ts,tsx}`
- Excludes: `src/**/__tests__/**`, `src/routeTree.gen.ts`, `src/**/*.test.{ts,tsx}`
- Target: Not enforced numerically

**Backend:**
- Tool: `pytest-cov`
- Target: Not enforced numerically

**View Coverage:**
```bash
# Frontend
NODE_OPTIONS=--no-experimental-webstorage vitest run --coverage
# Backend
uv run pytest --cov=cmc --cov-report=html
```

## Test Types

**Unit Tests (Frontend):**
- Scope: Individual components in isolation with mocked fetch
- Location: `src/components/ui/__tests__/`, `src/components/panels/__tests__/`, `src/lib/__tests__/`
- Data: Cache pre-seeded via `client.setQueryData(qk.key(), data)`
- Assertions: RTL `screen.getByRole`, `screen.getByText`, `container.querySelector('.cmc-class')`

**Integration Tests (Frontend):**
- Scope: Full app with real `RouterProvider` over generated `routeTree`
- Location: `src/__tests__/integration.test.tsx`
- Data: URL-discriminating `globalThis.fetch` mock returns non-empty payloads for all endpoints
- Assertions: `screen.findByText` (async), heading presence, no error boundary fallback

**Unit Tests (Backend):**
- Schema smoke tests (synchronous, no DB): `test_tasks_schemas_smoke()`
- Service unit tests: `test_foundation_boot.py` settings/engine tests
- Pure function tests: `validate_transition`, `sliceLast14Days`

**Integration Tests (Backend):**
- Router tests: full ASGI stack via `httpx.AsyncClient` + `ASGITransport`
- Lifespan tests: real alembic migrations, real SQLite, real session lifecycle
- All tests in `backend/tests/test_*_router.py` are integration tests

**E2E Tests:**
- Scope: Real backend + real Vite preview build
- Location: `frontend/tests/e2e/*.spec.ts`
- Files: `routes.spec.ts`, `command-palette.spec.ts`, `schedule-composer.spec.ts`, `theme-toggle.spec.ts`

## Common Patterns

**Async Testing (Frontend):**
```typescript
// Waiting for async render
await waitFor(() => {
  expect(container.querySelector('.cmc-task-board__columns')).not.toBeNull()
})

// findBy* queries have built-in waitFor
expect(await screen.findByText('Task Board')).toBeInTheDocument()

// User interactions require setup()
const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: /^Delete$/i }))
```

**Async Testing (Backend):**
```python
@pytest.mark.asyncio          # applied per-test; asyncio_mode=auto means it's optional
async def test_endpoint(client) -> None:
    r = await client.get("/api/tasks")
    assert r.status_code == 200
```

**Radix Portal Assertions:**
```typescript
// AlertDialog content is portaled outside test container — use document.body
expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()
const dialog = document.body.querySelector('[role="alertdialog"]')! as HTMLElement
const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(
  (b) => /^Delete$/i.test(b.textContent ?? ''),
)!
```

**Error Testing (Frontend):**
```typescript
// Silence React's caught-error console output in ErrorBoundary tests
beforeAll(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { errSpy.mockRestore() })
```

**Error Testing (Backend):**
```python
# Error shape is {"error": ...} not {"detail": ...}
assert r.status_code == 400
assert "error" in r.json()    # NOT r.json()["detail"]
```

**Hook Testing:**
```typescript
import { renderHook, act } from '@testing-library/react'
const { result } = renderHook(() => useFirehose({ bufferSize: 2 }))
const es = MockEventSource.instances.at(-1)!
act(() => { es.dispatchEvent(new MessageEvent('otel', { data: JSON.stringify(data) })) })
expect(result.current.events).toHaveLength(1)
```

## Test Setup Infrastructure

**`frontend/src/test/setup.ts`** — global setup loaded by `vitest.config.ts`:
- Installs `IS_REACT_ACT_ENVIRONMENT` bridge on both `globalThis` and `self` (React 19 + RTL 16 compatibility)
- Shims `HTMLElement.prototype.hasPointerCapture/releasePointerCapture/setPointerCapture/scrollIntoView`
- Shims `window.ResizeObserver` (Radix UI requirement)
- Shims `window.matchMedia` (framer-motion requirement)
- `afterEach` calls `cleanup()` and `window.localStorage.clear()` — RTL 16 does NOT auto-cleanup

**`frontend/src/test/utils.tsx`** — custom render wrapper:
- Wraps all renders in `<MotionConfig reducedMotion="always">` for deterministic animation state
- Re-exports all `@testing-library/react` exports and `userEvent`
- All component tests MUST import `{ render, userEvent }` from `'../../../test/utils'`

**Node version flag:**
```bash
NODE_OPTIONS=--no-experimental-webstorage
```
Required on Node 25.x: disables experimental Web Storage API that shadows happy-dom's `localStorage` proxy,
leaving `window.localStorage.setItem` undefined.

---

*Testing analysis: 2026-05-02*
