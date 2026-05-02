# Coding Conventions

**Analysis Date:** 2026-05-02

## Naming Patterns

**Files:**
- `snake_case.py` for all Python modules: `jsonl_parser.py`, `plist_render.py`, `rate_limit.py`
- Test files prefixed `test_`: `test_tasks_router.py`, `test_foundation_boot.py`
- Fixture helpers in `tests/fixtures/` named by purpose: `fake_claude_stream.py`, `fake_claude_classic.py`
- Jinja2 templates in `*/templates/` with `.j2` extension: `com.cmc.server.plist.j2`

**Classes:**
- `PascalCase` for all classes: `Task`, `TaskCreate`, `TaskListItem`, `FastAPIAppBuilder`
- SQLModel ORM models use short nouns matching table names: `Task`, `Schedule`, `Session`
- Pydantic schemas use noun + role suffix: `TaskCreate`, `TaskUpdate`, `TaskListResponse`, `TaskApproveResponse`

**Functions:**
- `snake_case` everywhere: `create_app()`, `load_settings()`, `parse_session_file()`
- Private helpers prefixed `_`: `_resolve_repo_root_paths()`, `_render_pretty()`, `_bootstrap_db()`
- Test factories prefixed `make_`: `make_task_row()`, `make_session_row()`, `make_decision_row()`
- Async route handlers named after HTTP action + resource: `list_tasks()`, `create_task()`, `patch_task()`

**Variables:**
- `snake_case` throughout; single-letter names only in very local scope (`r` for response in tests, `t` for temp ORM object)
- Module-level logger always named `log`: `log = logging.getLogger(__name__)`

**Modules / Packages:**
- Package names are short domain nouns: `cmc/api/`, `cmc/db/`, `cmc/dispatcher/`, `cmc/telegram/`
- Schema files grouped under `cmc/api/schemas/` by domain: `tasks.py`, `sessions.py`, `hitl.py`
- Route files grouped under `cmc/api/routes/` by domain

## Code Style

**Formatting:**
- Tool: Ruff (configured in `backend/pyproject.toml`)
- Line length: 100 characters
- Target Python version: 3.13

**Linting:**
- Ruff rule sets: `E` (pycodestyle), `F` (pyflakes), `I` (isort), `UP` (pyupgrade), `B` (bugbear), `PERF` (perflint), `RUF` (Ruff-specific)
- `B` (bugbear) immutable-calls extended for FastAPI dependency injection: `fastapi.Depends`, `fastapi.Query`, `fastapi.Path`, `fastapi.Body`
- `E402` (module-level import not at top) suppressed for `tests/conftest.py`, `tests/test_ingest.py`, `tests/test_system_router.py`

**Type Checking:**
- Pyright in `basic` mode, Python 3.13
- Applied to `cmc/` root; explicitly excluded: `cmc/api`, `cmc/db`, `cmc/dispatcher`, `cmc/ingest/repository.py`, `cmc/telegram`, `migrations`, `tests`
- Use `from typing import` for `Literal`, `Any`, `Annotated`, `cast` as needed; Python 3.10+ union syntax (`X | Y`) preferred over `Optional[X]`

## Import Organization

**Order (enforced by Ruff `I`):**
1. Standard library imports
2. Third-party packages
3. Local `cmc.*` imports

**Path Aliases:**
- No path aliases; all internal imports use absolute `cmc.*` paths: `from cmc.config import Settings`, `from cmc.db import get_session`

**Deferred imports in tests:**
- Module-level fixture helpers may use deferred imports after the fixture body comment block (conftest.py uses `E402` suppression for this pattern)
- Test functions often import inside the function body to scope module loading: `from cmc.dispatcher.state import write_pid_file`

## Error Handling

**HTTP errors:**
- All HTTP errors raised with `raise HTTPException(status_code=NNN, detail="message")` in route handlers
- The global error handler in `cmc/core/errors.py` wraps `HTTPException` into `{"error": exc.detail, "request_id": ...}` — NOT `{"detail": ...}`
- **Critical:** test assertions must use `r.json()["error"]`, never `r.json()["detail"]`
- Unhandled exceptions caught by `_unexpected` handler: logs with `log.exception()` and returns `{"error": "internal server error"}`

**Configuration errors:**
- `load_settings()` in `cmc/config/settings.py` catches `ValidationError`, renders a per-field error message via `_render_pretty()`, then calls `sys.exit(1)`
- `_render_pretty()` deliberately omits the rejected value (Security Domain V7): only field name + message are printed

**Settings mutation:**
- Use `settings.model_copy(update={...})` to create modified Settings without triggering Pydantic env re-loading — NEVER construct a new `Settings(...)` from an existing instance when only changing one field

## Logging

**Framework:** Python stdlib `logging` with structlog configured at startup

**Pattern:**
- All modules acquire a module-level logger: `log = logging.getLogger(__name__)`
- Structlog configured in `cmc/core/logging.py` via `configure_logging(settings)` at app startup
- Log format switches between `"text"` (dev) and `"json"` (production) based on `settings.log_format`
- Structlog processors: `merge_contextvars`, `add_log_level`, `TimeStamper(fmt="iso")`, `ConsoleRenderer(colors=False)`
- **Not used:** `structlog.get_logger()` — the codebase exclusively uses `logging.getLogger(__name__)`

**What to log:**
- Unexpected/unhandled exceptions: `log.exception("unhandled_exception", extra={...})`
- SPA mount skipped: `log.warning("Static dir %s missing...", static_dir)`
- Build success: `log.info("%s v%s built successfully", ...)`

## Comments

**Module docstrings:**
- Every module has a docstring explaining its purpose, coverage area, and key decisions: see `cmc/api/routes/tasks.py` (explains 7 endpoints, transition design, subprocess safety, error contract)
- Schema files document intent decisions inline: see `cmc/api/schemas/tasks.py` (explains why `TaskTriggerRequest` is absent)

**Inline comments:**
- Inline `# ...` comments on fields explain domain logic, accepted values, and cross-cutting concerns
- `# Pitfall N:` and `# BLOCKER N:` inline markers flag known traps for future readers
- Security notes tagged `# Security Domain VN:`

**Fixture docstrings:**
- All pytest fixtures have docstrings stating what they provide, setup invariants, and usage notes

## Function Design

**Size:** Route handlers are kept small — validation logic delegated to pure functions (e.g., `validate_transition()` in `cmc/tasks/transitions.py`)

**Parameters:**
- FastAPI route handlers inject dependencies via `Depends(get_session)`, `Depends(get_current_principal)`
- Pure domain functions take explicit positional args; no hidden global state

**Return Values:**
- Route handlers always return Pydantic response models (validated via `model_validate(orm_row)`)
- `model_dump(exclude_unset=True)` used in PATCH handlers to avoid overwriting unset fields

## Module Design

**Exports:**
- `__init__.py` files re-export public symbols: `cmc/core/__init__.py` exposes `SPAStaticFiles`, `configure_logging`, `register_error_handlers`
- Internal helpers are prefixed `_` and not re-exported

**Builder pattern:**
- `FastAPIAppBuilder` in `cmc/app/factory.py` exposes a fluent builder: each setup method returns `Self` so calls chain as `builder.setup_logging().setup_settings()...build()`
- `create_app(settings)` is the public entry point wrapping the builder

**Settings isolation:**
- `Settings(_env_file=None)` is the canonical pattern for test-safe instantiation (prevents loading `backend/.env` in tests)
- `load_settings()` is for production startup only; never call it in tests

## Datetime Conventions

- All datetimes are timezone-aware UTC: `datetime.now(UTC)` — **never** `datetime.utcnow()` (deprecated)
- Exception: `Task.created_at` uses `default_factory=datetime.utcnow` (known issue — see CONCERNS.md)
- `datetime.now(UTC)` imported as `from datetime import UTC, datetime`

---

*Convention analysis: 2026-05-02*
