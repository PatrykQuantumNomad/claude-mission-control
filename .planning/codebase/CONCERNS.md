# Codebase Concerns

**Analysis Date:** 2026-05-02

## Tech Debt

**Naive `datetime.utcnow()` across all DB models:**
- Issue: Every SQLModel default uses `datetime.utcnow` (deprecated in Python 3.12+); stored datetimes are tz-naive, requiring defensive `.replace(tzinfo=UTC)` patches at read-time.
- Files: `backend/cmc/db/models/activities.py:25`, `backend/cmc/db/models/decisions.py:45`, `backend/cmc/db/models/schedules.py:30-31`, `backend/cmc/db/models/skills.py:28`, `backend/cmc/db/models/system_state.py:23`, `backend/cmc/db/models/sessions.py:17`, `backend/cmc/db/models/tasks.py:47`, `backend/cmc/db/models/otel_events.py:31`, `backend/cmc/db/models/mcp_stats.py:27`, `backend/cmc/db/models/token_usage.py:26`, `backend/cmc/db/models/notification_log.py:21`, `backend/cmc/db/models/inbox.py:41`, `backend/cmc/db/models/live_state.py:30`, `backend/cmc/db/models/otel_metrics.py:23`
- Impact: Tz-naive values silently round-trip through SQLite. Routes defensively coerce on read (`replace(tzinfo=UTC)`) in several places — e.g. `backend/cmc/api/routes/system.py:141-145`, `backend/cmc/api/routes/observability.py:764-769`. Any new code that forgets the coerce will produce wrong comparisons.
- Fix approach: Replace all `default_factory=datetime.utcnow` with `default_factory=lambda: datetime.now(UTC)` in models. Single-pass change; test suite will surface any missed sites.

**`otel_events` / `tools` tables grow without retention policy:**
- Issue: `otel_events` and `tools` are append-only with no DELETE, VACUUM, or partition scheme. High-activity installs accumulate unbounded rows.
- Files: `backend/cmc/db/models/otel_events.py`, `backend/cmc/db/models/tools.py`, `backend/cmc/ingest/repository.py`
- Impact: SQLite file grows indefinitely. Observability queries at `backend/cmc/api/routes/observability.py` (790 lines, 10+ raw SQL blocks) run full-table scans and will degrade over time. PRAGMA `journal_size_limit` and `synchronous=NORMAL` mitigate I/O but not row count.
- Fix approach: Add a background retention job (Alembic migration + periodic task) that deletes `otel_events` and `tools` rows older than N days. Configurable via a `retention_days` settings field.

**`ANTHROPIC_API_KEY` read from `os.environ` instead of `Settings` in two LLM helpers:**
- Issue: `backend/cmc/schedules/nlcron.py:27` and `backend/cmc/dispatcher/skill_router.py:54` read `ANTHROPIC_API_KEY` directly from `os.environ` — bypassing the `Settings` trust boundary that launchd-spawned daemons rely on.
- Files: `backend/cmc/schedules/nlcron.py`, `backend/cmc/dispatcher/skill_router.py`
- Impact: In install mode the key is stored in `~/.command-centre/.env` and surfaced through `Settings.anthropic_api_key`. If the daemon process does not inherit the shell env (launchd does not), these two callers silently degrade to `None` and emit 503/skill-router-skips instead of surfacing the key correctly.
- Fix approach: Thread `settings.anthropic_api_key` into `nl_to_cron()` and `pick_skill()` callers rather than re-reading `os.environ`.

**`Task.skill` is a free-text column with no FK enforcement:**
- Issue: `backend/cmc/db/models/tasks.py:34` stores skill as `Optional[str]` with a comment noting this was accepted as-is. Nothing prevents a task from referencing a deleted or renamed skill.
- Files: `backend/cmc/db/models/tasks.py`, `backend/cmc/dispatcher/heartbeat.py`
- Impact: `_resolve_skill_for_task` in `backend/cmc/dispatcher/heartbeat.py:188` will simply return `skill=None` when the name is stale — the task falls back to auto-routing. This is silent; no error or attention item surfaces the dangling reference.
- Fix approach: Add an Alembic migration to convert `tasks.skill` to a real FK with `ON DELETE SET NULL`. A pre-migration data audit to fix existing orphan rows may be required.

**Duplicate `MAX_CONCURRENT` constant shadowing `Settings.dispatcher_max_concurrent`:**
- Issue: `backend/cmc/dispatcher/heartbeat.py:49` defines `MAX_CONCURRENT = 3` as a "historical constant" while the code correctly reads `settings.dispatcher_max_concurrent` at runtime. The constant is never used but creates misleading dead code.
- Files: `backend/cmc/dispatcher/heartbeat.py:49`
- Impact: Low — purely a readability / misleading artifact. A future author reading the file top-to-bottom might assume that constant is the effective limit.
- Fix approach: Delete the `MAX_CONCURRENT = 3` line.

**Token attribution smear for multi-day sessions:**
- Issue: `backend/cmc/ingest/repository.py:13-15` documents that multi-day sessions attribute all tokens to the latest sync date in the system tz, not to the actual usage day.
- Files: `backend/cmc/ingest/repository.py`
- Impact: Token usage charts (`/api/usage/tokens`) will show incorrect per-day breakdowns for sessions that span midnight or are synced days after they ended. Acknowledged as "acceptable for v1" in the docstring.
- Fix approach: Revisit accumulate_token_usage to attribute tokens by parser-derived daily buckets rather than primary sync date.

---

## Known Bugs

**Telegram inbox reply is a NOOP in v1:**
- Symptoms: Pressing "reply" on an inbox notification in Telegram sends `"reply via dashboard"` feedback and does nothing to the inbox record.
- Files: `backend/cmc/telegram/handler.py:215-218`, `backend/cmc/telegram/dash_router.py:15`, `backend/cmc/telegram/dash_router.py:66`
- Trigger: Any Telegram callback_query with `reply_inbox:<id>` verb.
- Workaround: User must visit the dashboard to reply to inbox messages.

**`system_health` status field hardcoded to `"ok"`:**
- Symptoms: `GET /api/system/health` always returns `"status": "ok"` even when daemons are stale or database is unhealthy.
- Files: `backend/cmc/api/routes/system.py:118-120` (comment: `"status" is hard-coded to "ok" until a degradation heuristic lands`)
- Trigger: Checking system health via the API or dashboard SystemHealthStrip when a daemon has crashed.
- Workaround: Check `daemon_ages[*].age_seconds` and compare manually against thresholds.

---

## Security Considerations

**Authentication disabled by default (`auth_enabled: bool = False`):**
- Risk: The API is unauthenticated out of the box. Anyone with network access to port 8765 can read session transcripts, HITL decisions, task data, and trigger dispatcher actions.
- Files: `backend/cmc/config/settings.py:131`, `backend/.env.example`
- Current mitigation: `HOST=127.0.0.1` binds only to loopback; `TrustedHostMiddleware` rejects non-localhost `Host` headers by default; `CORS_ALLOWED_ORIGINS` restricts origins to `http://127.0.0.1:5173` and `http://localhost:5173`.
- Recommendations: Document that `HOST` must never be changed to `0.0.0.0` without also enabling `AUTH_ENABLED=true`. Add a `cmc doctor` check that warns when `HOST != 127.0.0.1` and `auth_enabled=False`.

**API docs and OpenAPI schema enabled by default:**
- Risk: `docs_enabled=True` and `openapi_enabled=True` expose `/api/docs` and `/api/openapi.json` to anyone with network access. On a machine where the server is inadvertently exposed (e.g. misconfigured firewall), the full API surface is discoverable.
- Files: `backend/cmc/config/settings.py:76-78`
- Current mitigation: Localhost-only binding (see above).
- Recommendations: Default `docs_enabled=False` and `openapi_enabled=False` in production/install mode; document how to re-enable for development.

**`ANTHROPIC_API_KEY` surface in `Settings.anthropic_api_key`:**
- Risk: The key is printed to stderr on `ValidationError` via `_render_pretty`. The code currently only prints field names, not values (Security Domain V7), but a future contributor could accidentally add `err["input"]` in the error renderer.
- Files: `backend/cmc/config/settings.py:316-330`
- Current mitigation: `_render_pretty` explicitly avoids `err["input"]`; the field name `ANTHROPIC_API_KEY` is printed, not the value.
- Recommendations: Add a unit test that asserts the rejected value does not appear in `_render_pretty` output for sensitive fields.

---

## Performance Bottlenecks

**`observability.py` router is a single 790-line file with 10+ full-table SQL scans:**
- Problem: Each of the 10 observability endpoints issues one or more raw `SELECT` queries against `otel_events`, `sessions`, `tools`, and `token_usage`. No query-level caching or materialized views. At scale (months of data), cold queries on `otel_events` without narrow date filters will be slow.
- Files: `backend/cmc/api/routes/observability.py`
- Cause: All aggregate computations are read-time. The `activities` table exists as a precomputed cache (per `backend/cmc/db/models/activities.py:8`) but most OBSV routes don't use it.
- Improvement path: Extend the periodic sync loop to maintain the `activities` table as a proper materialized rollup so observability reads query the small aggregation table instead of the full `otel_events` set.

**Hook activity FIFO pairing is pure Python in the request path:**
- Problem: `backend/cmc/api/routes/observability.py:370-396` loads all hook events in the time window into memory, then pairs them with a Python FIFO per `(session_id, pair_key)`. For large windows (30d) with high hook volume this could be hundreds of thousands of rows.
- Files: `backend/cmc/api/routes/observability.py:360-399`
- Cause: The comment says "cleaner than nested SQL window functions" — this was a deliberate trade-off for OBSV-05.
- Improvement path: Move the pairing to a SQL window-function CTE similar to the MCP aggregator at `backend/cmc/mcp/aggregator.py`.

**`sync_once` processes all JSONL files sequentially:**
- Problem: `backend/cmc/ingest/scheduler.py:67-75` iterates `*/*.jsonl` files sequentially. Each file's parse is off-thread via `asyncio.to_thread`, but the overall loop still serializes file processing.
- Files: `backend/cmc/ingest/scheduler.py`
- Cause: One `AsyncSession` per file (transaction boundary). Sequential design is safe but slow for users with hundreds of session files.
- Improvement path: Use `asyncio.gather` with a semaphore (concurrency cap) to process files in parallel. Each file already has its own session so there is no shared state to protect.

---

## Fragile Areas

**`run_stream` threading model (mixed asyncio + threads):**
- Files: `backend/cmc/dispatcher/run_stream.py`
- Why fragile: Creates a dedicated `asyncio.new_event_loop()` in a thread, uses `asyncio.run_coroutine_threadsafe` from the reader thread back into that loop, and coordinates teardown across 4 threads (loop thread, reader thread, pump thread, and the calling thread). The teardown sequence is carefully ordered and documented but any future modification risks a deadlock or resource leak.
- Safe modification: Read the teardown comment block (lines 280-327) in full before touching teardown order. Always stop pump before closing stdin. Never call `reader.join` before closing `proc.stdin`.
- Test coverage: `backend/tests/test_dispatcher.py` has extensive stream-mode tests (~3786 lines) but integration tests requiring a real `claude` binary are skipped.

**SQLite WAL on iCloud / NFS will silently corrupt data:**
- Files: `backend/.env.example:11` (comment: "WAL does NOT work on NFS / iCloud"), `backend/cmc/db/engine.py`
- Why fragile: The default `data/cmc.db` path is under the repo root. If the repo is stored on iCloud Drive or a network share, WAL mode will fail or corrupt. There is no startup check.
- Safe modification: Add a `cmc doctor` check (alongside check #5 for port) that verifies the `DB_PATH` filesystem supports WAL by probing `PRAGMA journal_mode`.

**Dispatcher `claim.py` uses raw `BEGIN IMMEDIATE` which conflicts with SQLAlchemy session auto-begin:**
- Files: `backend/cmc/dispatcher/claim.py`
- Why fragile: Takes `AsyncEngine` (not `AsyncSession`) specifically to avoid auto-BEGIN interference. If a future refactor passes a session or wraps the call in a session context manager, the double-transaction will cause silent claim failures rather than a runtime error.
- Safe modification: The module docstring explicitly states "Locked pattern: takes the AsyncEngine". Do not change the calling convention without re-reading the docstring and updating tests.

**`heartbeat.py` imports `asyncio` inside the function body:**
- Files: `backend/cmc/dispatcher/heartbeat.py:136`
- Why fragile: `import asyncio as _asyncio` inside `run_one_cycle()` is unusual and will confuse linters or static analysis. The module-level `import asyncio` is absent; the local import is the only one.
- Safe modification: Hoist `import asyncio` to the module level.

---

## Scaling Limits

**SQLite single-writer:**
- Current capacity: One concurrent writer at a time; `busy_timeout=5000ms` queues concurrent writes.
- Limit: Under high concurrent task dispatch (>3 tasks), the `BEGIN IMMEDIATE` lock in `claim.py` plus the ingestion scheduler's per-file sessions will contend. Observed as 5s timeouts in the PRAGMA settings.
- Scaling path: SQLite is appropriate for this single-user, local tool; a migration to PostgreSQL would be required for multi-user or team-scale deployments.

**`MemoryRateLimitStore` is not shared between processes:**
- Current capacity: Rate limit state is in-process memory. The dispatcher is a separate process; launchd runs multiple processes.
- Limit: Each process gets its own bucket; rate limits are not enforced across process boundaries.
- Scaling path: Configure `RATE_LIMIT_STORAGE_URL` with a Redis URL for cross-process enforcement (`backend/cmc/middleware/rate_limit.py:65-91`).

---

## Dependencies at Risk

**`SQLModel` dual-ORM surface:**
- Risk: `SQLModel` wraps both SQLAlchemy and Pydantic, which can produce surprising behaviour when Pydantic validation and SQLAlchemy column definitions diverge. The project uses `sa_column=Column(...)` overrides in several models to bypass SQLModel's defaults — a pattern that is fragile across SQLModel version bumps.
- Impact: Model field definitions may silently change meaning after SQLModel upgrades.
- Migration plan: Pin `sqlmodel` strictly in `pyproject.toml` and run the full test suite before upgrading.

**Single Alembic migration (`0001_initial`) for all 15 tables:**
- Risk: All 15 tables are created in one revision with no intermediate checkpoints. Future schema changes must add revision `0002+`. If the initial migration is applied to a database that already has some tables (partial install), `alembic upgrade head` will fail on the first `CREATE TABLE` for the existing table.
- Impact: Installs that manually created tables before running the migration will fail on upgrade.
- Migration plan: The `_column_exists` helper in `backend/migrations/versions/0001_initial.py:40-54` exists for this scenario but is only documented, not used in the current migration. Future revisions should use `IF NOT EXISTS` guards.

---

## Missing Critical Features

**No data retention / cleanup for append-only tables:**
- Problem: `otel_events`, `tools`, and `otel_metrics` accumulate indefinitely with no purge mechanism.
- Blocks: Long-running installs will experience progressively slower observability queries and growing disk usage.

**Telegram inbox reply not implemented (`NOOP`):**
- Problem: The Telegram callback router returns `"NOOP"` for `reply_inbox` verbs; replies from Telegram do not reach the backend.
- Blocks: Full bidirectional Telegram interaction for inbox messages.

**No `cmc doctor` check for WAL-incompatible DB path:**
- Problem: If `DB_PATH` is on iCloud Drive or NFS, WAL mode silently fails but the server starts without error.
- Blocks: Early detection of a common macOS install mistake.

---

## Test Coverage Gaps

**Dispatcher stream-mode integration tests require real `claude` binary:**
- What's not tested: Full end-to-end stream dispatch with actual subprocess output, real NDJSON parsing, and live decision callbacks.
- Files: `backend/tests/test_dispatcher.py` (3786 lines — largest test file)
- Risk: The reader thread, FollowUpPump, and decision wait logic interact across 4 threads; unit-level mocking may miss race conditions.
- Priority: Medium — unit coverage is extensive but the threading model is inherently hard to test without the subprocess.

**Frontend E2E tests exist but have unknown scope:**
- What's not tested: Whether `frontend/tests/e2e/` covers the full dashboard flow (task creation, HITL decision, Telegram callback).
- Files: `frontend/tests/e2e/`
- Risk: UI regressions in panel interactions (e.g. `TaskBoard`, `DecisionsCard`, `InboxCard`) are only caught at the component test level.
- Priority: Low — the backend API surface has good coverage; UI regressions are visual.

**No test for `system_health` degradation path:**
- What's not tested: The `status` field in `SystemHealthResponse` is hardcoded `"ok"`. There is no test verifying that it changes to `"degraded"` when thresholds are exceeded (because the behaviour does not yet exist).
- Files: `backend/tests/test_system_router.py`, `backend/cmc/api/routes/system.py:118`
- Risk: When the degradation heuristic is eventually implemented, there will be no existing test scaffolding for it.
- Priority: Low — placeholder behaviour is tested; the risk is future.

---

*Concerns audit: 2026-05-02*
