# Codebase Concerns

**Analysis Date:** 2026-05-02

## Tech Debt

**Deprecated `datetime.utcnow()` in every ORM model:**
- Issue: All SQLModel model files use `Field(default_factory=datetime.utcnow)` — a deprecated form that returns a naive datetime (no tzinfo). The rest of the codebase uses the correct `datetime.now(UTC)` pattern.
- Files: `backend/cmc/db/models/tasks.py:47`, `backend/cmc/db/models/decisions.py:45`, `backend/cmc/db/models/sessions.py:17`, `backend/cmc/db/models/otel_events.py:31`, `backend/cmc/db/models/otel_metrics.py:23`, `backend/cmc/db/models/schedules.py:30-31`, `backend/cmc/db/models/skills.py:28`, `backend/cmc/db/models/mcp_stats.py:27`, `backend/cmc/db/models/system_state.py:23`, `backend/cmc/db/models/notification_log.py:21`, `backend/cmc/db/models/live_state.py:30`, `backend/cmc/db/models/token_usage.py:26`, `backend/cmc/db/models/activities.py:25`, `backend/cmc/db/models/inbox.py:41`
- Impact: Python 3.12 deprecated `datetime.utcnow()`; Python 3.14 may remove it. All DB `created_at` / `updated_at` / `synced_at` defaults produce naive datetimes, which forces compensating `.replace(tzinfo=UTC)` calls at read time (seen in routes and observability helpers). Inconsistency between naive defaults and UTC-aware in-flight values can cause comparison bugs.
- Fix approach: Replace every `default_factory=datetime.utcnow` with `default_factory=lambda: datetime.now(UTC)` in all model files. Add `from datetime import UTC` import. Low-risk, purely additive.

**`@deprecated` API method aliases in `api.ts`:**
- Issue: `backend/cmc/api/routes/system.py` comments state `status` is hard-coded to `"ok"` pending a degradation heuristic. Simultaneously, `frontend/src/lib/api.ts` contains 13 `@deprecated` method aliases (e.g. `deleteTask`, `approveTask`, `rerunTask`, `triggerDispatcher`, `createSchedule`, `patchSchedule`, `deleteSchedule`, `parseNlSchedule`, `answerDecision`, `readInbox`, `replyInbox`) that duplicate every write-path function.
- Files: `frontend/src/lib/api.ts:830-963`
- Impact: New feature work must be careful not to accidentally call deprecated aliases. The aliases cannot be removed until all callers are audited — which has not happened.
- Fix approach: Grep for usage of deprecated names across frontend source, migrate callers to canonical names, then delete the alias block.

**`tasks.skill` is a free-text column with no FK enforcement:**
- Issue: `backend/cmc/db/models/tasks.py:34` notes `skill` is a free-text reference to `skills.name` with no foreign-key constraint, accepted deliberately to avoid migration churn. A typo in skill assignment is silently accepted.
- Files: `backend/cmc/db/models/tasks.py`, `backend/cmc/dispatcher/heartbeat.py:163`
- Impact: Tasks whose `skill` is misspelled will silently receive `None` when the dispatcher resolves the skill, then fall through to `run_classic` without the intended configuration.
- Fix approach: Add a DB-level CHECK constraint, or at minimum add a validation in the task-create route that queries the skills table for name existence before persisting.

**Hardcoded `LOCAL_API` URL in Telegram handler and notifier:**
- Issue: `backend/cmc/telegram/handler.py:54` and `backend/cmc/telegram/notifier.py:33` both declare `LOCAL_API = "http://127.0.0.1:8765"` as a module-level constant rather than reading from `Settings.host` / `Settings.port`.
- Files: `backend/cmc/telegram/handler.py:54`, `backend/cmc/telegram/notifier.py:33`
- Impact: If the operator changes the default port (`CMC_PORT=9000`), the Telegram subsystem silently fails to reach the API without an obvious error — the address is wrong even though settings load correctly.
- Fix approach: Pass `settings.port` (and `settings.host`) into the notifier and handler, construct the base URL at call time. Settings are already available in both call paths.

**Dispatcher log files accumulate indefinitely:**
- Issue: `backend/cmc/tasks/spawn.py` and `backend/cmc/dispatcher/run_stream.py` and `backend/cmc/dispatcher/run_classic.py` all write per-task log files under `.tmp/mission-control-queue/dispatcher-logs/` but no cleanup or rotation is implemented. At analysis time 1,030 files are present.
- Files: `backend/cmc/tasks/spawn.py:21-25`, `backend/cmc/dispatcher/run_stream.py:86-88`, `backend/cmc/dispatcher/run_classic.py:70-73`
- Impact: Unbounded disk growth. On a system processing many tasks the logs directory will eventually consume significant disk space. The `.tmp/` directory is not in `.gitignore`-equivalent cleanup (it is tracked as a runtime directory).
- Fix approach: Add a log rotation or prune step in the dispatcher oneshot cycle — delete files older than N days at the start of `run_one_cycle`. Alternatively, use a fixed-count rolling window.

**`_input_format_spike.py` left in production module tree:**
- Issue: `backend/cmc/dispatcher/_input_format_spike.py` is a one-time verification script that was never removed. Its docstring explicitly says "This module is NOT a runtime dependency of run_stream — it is a one-time operator/CI verification."
- Files: `backend/cmc/dispatcher/_input_format_spike.py`
- Impact: Misleads readers about what is production code. The file is importable and could accidentally be included in coverage reports or linting checks.
- Fix approach: Move to `backend/scripts/` or `backend/tools/` and update its docstring reference, or delete it if the verification is no longer needed.

**`status` field in `SystemHealthResponse` is permanently hard-coded to `"ok"`:**
- Issue: `backend/cmc/api/routes/system.py:118` documents: `"status" is hard-coded to "ok" until a degradation heuristic lands`. The field type is `'ok' | 'degraded'` in the schema but the route never returns `'degraded'`.
- Files: `backend/cmc/api/routes/system.py:118`, `backend/cmc/api/schemas/system.py`
- Impact: Consumers (including `SystemHealthStrip` frontend panel) that rely on this field for actual health signals will never receive a degradation signal, defeating the purpose of the field.
- Fix approach: Implement degradation heuristic based on daemon stale thresholds (already computed as `daemon_ages` in the same handler) and last otel event age.

## Security Considerations

**Authentication is opt-in and disabled by default:**
- Risk: `Settings.auth_enabled` defaults to `False` (`backend/cmc/config/settings.py:131`). Every API endpoint is publicly accessible on the default installation. The system is designed for `localhost`-only use, but a misconfigured proxy or network exposure could expose all data and write operations without authentication.
- Files: `backend/cmc/config/settings.py:131`, `backend/cmc/auth/service.py`
- Current mitigation: Default `trusted_hosts` is `["127.0.0.1", "localhost", ...]`. TrustedHostMiddleware and CORS are configured to localhost-only origins by default.
- Recommendations: Add a `settings.auth_enabled=True` recommendation in setup docs for any non-localhost deployment. Consider logging a startup warning when `auth_enabled=False` and `host != "127.0.0.1"`.

**Rate limiting is opt-in and disabled by default:**
- Risk: `Settings.rate_limit_enabled` defaults to `False` (`backend/cmc/config/settings.py:152`). Without rate limiting, the OTLP ingest endpoints (`/v1/logs`, `/v1/metrics`) and all API write paths are unbounded.
- Files: `backend/cmc/config/settings.py:152`, `backend/cmc/middleware/rate_limit.py`
- Current mitigation: Body size cap (`max_request_body_bytes=10MB`) is always applied. OTLP endpoints cap at `otlp_max_body_bytes`.
- Recommendations: Same as auth — document and consider enabling for non-loopback deployments.

**`TELEGRAM_ALLOWED_USER_IDS` is the sole Telegram authorization gate:**
- Risk: If `telegram_allowed_user_ids` is left empty AND `telegram_chat_id` is unset, the `is_user_allowed` check in `backend/cmc/telegram/handler.py:86-96` will return `False` for every message — silently dropping all Telegram messages rather than raising an error. A misconfigured (empty) allowlist effectively disables Telegram routing without any operator warning.
- Files: `backend/cmc/telegram/handler.py:86-96`
- Current mitigation: Handler drops unauthorized messages with a `log.info`, not a `log.warning`, making misconfiguration quiet.
- Recommendations: Log a `warning` (not `info`) when a message is dropped due to empty allowlist, or on startup when Telegram is enabled but both `telegram_chat_id` and `telegram_allowed_user_ids` are unset.

**`queue_path` helper does not validate path traversal:**
- Risk: `backend/cmc/core/queue.py:20-28` includes the comment: "Caller MUST sanitize `key`... — this helper does NOT path-traversal-check." Callers pass `str(int(decision_id))` which is safe, but the contract relies on caller discipline rather than enforced validation.
- Files: `backend/cmc/core/queue.py:20-28`
- Current mitigation: All current callers cast to `int` before passing. Pydantic models validate integer IDs at API boundary.
- Recommendations: Add a `Path.resolve()` check inside `queue_path` to assert the resolved path stays under `QUEUE_ROOT` as a defense-in-depth measure.

**`anthropic_api_key` stored in `.env` and loaded into `Settings`:**
- Risk: `Settings.anthropic_api_key` (`backend/cmc/config/settings.py:250-258`) exposes the API key as a Python string in process memory. The field docstring acknowledges this is intentional for launchd subprocess injection. If Settings state were accidentally logged or serialized, the key would be exposed.
- Files: `backend/cmc/config/settings.py:250-258`, `backend/cmc/telegram/handler.py:113-115`
- Current mitigation: `_render_pretty` explicitly avoids logging field values (`settings.py:316-329`). Rejected env values are never printed.
- Recommendations: Override `__repr__`/`__str__` on Settings (or use `SecretStr` for the key field) to prevent accidental logging in future debug code.

## Performance Bottlenecks

**`answer_poll` uses DB polling at 2-second intervals for up to 1 hour:**
- Problem: `backend/cmc/dispatcher/answer_poll.py` opens a fresh DB session every 2 seconds per pending decision for up to `dispatcher_decision_timeout_s=3600` seconds (1 hour). With `dispatcher_max_concurrent=3` tasks, this can produce 1.5 DB queries/second sustained.
- Files: `backend/cmc/dispatcher/answer_poll.py`, `backend/cmc/config/settings.py:200-210`
- Cause: No event/notification primitive is available from SQLite. The fresh-session-per-iteration approach is documented as intentional to avoid connection pool exhaustion.
- Improvement path: Replace polling with a lightweight in-process asyncio `Event` stored in app state (keyed by decision_id). HITL answer endpoint sets the event; `wait_for_answer` awaits it. This removes all DB polling while the dispatcher is co-located with the API process (oneshot mode). For cross-process use the file-queue `decisions/{id}.jsonl` already provides the notification path.

**Observability router issues 2–3 raw SQL queries with correlated subqueries per request:**
- Problem: Several endpoints in `backend/cmc/api/routes/observability.py` (notably `sessions_failures` at line 724 and `sessions_outcomes` at line 153) use CTEs with `EXISTS (SELECT 1 FROM otel_events WHERE session_id = ...)` — a correlated subquery per session row. As `otel_events` grows this becomes an O(sessions * otel_events) scan without index coverage on `(session_id, event_name)`.
- Files: `backend/cmc/api/routes/observability.py:153-184`, `backend/cmc/api/routes/observability.py:724-754`
- Cause: Read-time outcome classification avoids a denormalized `outcome` column but pays the query cost on every request.
- Improvement path: Add a compound index on `otel_events(session_id, event_name)` in a new Alembic migration. Alternatively, materialize the outcome on `sessions.outcome` during JSONL ingest.

**MCP aggregator (`aggregator.py`) runs window-function queries on entire `otel_events` and `tools` tables:**
- Problem: `backend/cmc/mcp/aggregator.py` runs three large SQL queries with `ROW_NUMBER()` window functions across full table scans for each `/api/mcp/stats` sync. As `otel_events` grows (each Claude Code session emits many events), these queries will become the slowest operations in the system.
- Files: `backend/cmc/mcp/aggregator.py`
- Cause: No pre-materialization; stats are recomputed on demand.
- Improvement path: The aggregator already writes results to `mcp_stats` table. Schedule aggregation as a background task on a time interval rather than per-request, and serve reads from `mcp_stats` directly.

**JSONL ingest scans all files every 120 seconds regardless of modification:**
- Problem: `backend/cmc/ingest/scheduler.py:67` globs `*/*.jsonl` and checks each file's mtime. With a large `~/.claude/projects` directory containing many old sessions, this is an O(files) filesystem scan every 2 minutes.
- Files: `backend/cmc/ingest/scheduler.py:41-78`
- Cause: Simple glob-all approach with skip-if-unchanged logic. Documented as intentional for simplicity.
- Improvement path: Use `inotify`/`FSEvents` for filesystem watching, or maintain a mtime-indexed cache to skip unmodified directories entirely.

## Fragile Areas

**`run_stream` threading model — 3 concurrent threads per task:**
- Files: `backend/cmc/dispatcher/run_stream.py`
- Why fragile: Each stream-mode task spawns a dedicated asyncio loop thread (`loop_thread`), a reader thread (`reader`), and a follow-up pump thread (`pump_thread`). The teardown sequence is carefully ordered (pump.stop → close stdin → reader.join → pump_thread.join → loop.stop → loop_thread.join). Any exception or hang in one thread can leave others stuck since `join(timeout=10)` silently proceeds on timeout.
- Safe modification: Do not reorder the teardown sequence documented in `run_stream.py:281-292`. When adding new features that need to write to `proc.stdin`, they MUST route through `FollowUpPump`, never write directly.
- Test coverage: `backend/tests/test_dispatcher.py` is 3786 lines and covers the main paths. Edge cases around teardown ordering and concurrent decision timeouts are tested but the thread synchronization logic itself is hard to mock exhaustively.

**Dispatcher concurrency relies on SQLite WAL serialization:**
- Files: `backend/cmc/dispatcher/claim.py`
- Why fragile: The `BEGIN IMMEDIATE` pattern in `claim_pending_tasks` depends on SQLite WAL mode being active and `busy_timeout=5000` being set. If the pragma application at connect time silently fails (the pragma listener is in `backend/cmc/db/engine.py` and has a known workaround for the `isolation_level` issue), two concurrent dispatcher cycles could double-claim a row.
- Safe modification: Never change the WAL pragma setup in `backend/cmc/db/engine.py` without verifying the `BEGIN IMMEDIATE` claim contract still holds. The `isolation_level=None` toggle for pragma execution is a documented non-obvious pattern.
- Test coverage: `backend/tests/test_dispatcher.py` tests atomic claim but uses an in-process test DB, not a multi-process concurrent setup.

**Telegram `relay_text_to_claude` is synchronous and blocks the event loop:**
- Files: `backend/cmc/telegram/handler.py:99-139`
- Why fragile: `relay_text_to_claude` calls `subprocess.run(..., timeout=120)` synchronously inside `async def run_handler_loop`. This blocks the asyncio event loop for up to 120 seconds per message. Under launchd (the intended deployment), only one handler runs at a time, so the impact is limited — but it's architecturally incorrect and would cause severe problems if the handler were ever moved to a shared event loop.
- Safe modification: Wrap the `subprocess.run` call with `await asyncio.to_thread(relay_text_to_claude, ...)` if `run_handler_loop` is ever converted to a true async function.
- Test coverage: `backend/tests/test_telegram_handler.py` mocks `subprocess.run`, so the blocking nature is not caught by tests.

**`queue_path` creates directories as a side effect in hot paths:**
- Files: `backend/cmc/core/queue.py:20-28`
- Why fragile: `queue_path()` calls `qdir.mkdir(parents=True, exist_ok=True)` every time it is called, including in the answer-poll hot path. On most filesystems `mkdir` with `exist_ok=True` on an existing directory is cheap, but on network filesystems or under high contention it can be unexpectedly slow.
- Safe modification: Consider caching the directory existence check, or splitting the concern: create directories during startup, not per-call.

## Scaling Limits

**SQLite single-writer constraint:**
- Current capacity: Single SQLite file at `data/cmc.db`. WAL mode allows one writer at a time with busy_timeout=5000ms.
- Limit: Under high OTLP ingestion load (many concurrent `POST /v1/logs` requests) combined with active dispatcher writes, write contention will surface as 5-second stalls. The OTLP ingest contract (`backend/cmc/api/routes/ingest.py:9-18`) states it always returns 200, so stalls are invisible to the Claude Code exporter.
- Scaling path: Not a concern for single-user local deployment. If multi-user or high-throughput is needed, migrate to PostgreSQL (SQLAlchemy dialect is already async, so driver swap is the primary change).

**Dispatcher concurrency cap is a global in-code constant:**
- Current capacity: `Settings.dispatcher_max_concurrent = 3`
- Limit: The constant `MAX_CONCURRENT = 3` on `backend/cmc/dispatcher/heartbeat.py:48` is a historical artifact — the runtime reads from `settings.dispatcher_max_concurrent` correctly. However, the live-PID sweep (`sweep_stale_pids`) uses OS-level `psutil.pid_exists`, which returns `True` for any process with that PID — not specifically a dispatcher subprocess. A PID collision (unlikely but possible) could falsely reduce available slots.
- Scaling path: Write the subprocess `start_time` alongside the PID in the `.pid` file and validate both with `psutil.Process(pid).create_time()` in the sweep.

## Dependencies at Risk

**`sqlmodel==0.0.38` pins an old pre-1.0 release:**
- Risk: SQLModel 0.0.x is a pre-stable release series. The project has been slow to reach 1.0 and the API has had breaking changes between minor versions. Pinning to `0.0.38` means the codebase could lag behind security fixes or require significant migration effort if SQLAlchemy 3.x is released.
- Impact: `backend/cmc/db/models/` — all 14 model files use SQLModel's `Field` and table classes.
- Migration plan: Watch for SQLModel 0.1.x / 1.0 release. The migration is primarily updating `Field` imports and potentially `__table_args__` syntax.

**`pydantic-settings==2.14.0` pinned tight:**
- Risk: Pinned to an exact version while `pydantic==2.13.3` is also pinned. Cross-version compatibility between exact pydantic and pydantic-settings pins can cause conflicts when either upstream releases a breaking change.
- Impact: `backend/cmc/config/settings.py` — all settings parsing.
- Migration plan: Convert pins to `>=` lower bounds with an upper cap (e.g. `pydantic>=2.13,<3`).

## Missing Critical Features

**No log / JSONL file cleanup for `.tmp/mission-control-queue/`:**
- Problem: The `.tmp/mission-control-queue/` directory accumulates `dispatcher-logs/*.log`, `decisions/*.jsonl`, `inbox/*.jsonl`, and `messages/task-*.jsonl` files indefinitely. Only `unlink_pid_file` provides any cleanup (for `.pid` files only).
- Blocks: Long-running deployments will fill disk.

**No health degradation signal from `GET /system/health`:**
- Problem: The `status` field in `SystemHealthResponse` is permanently `"ok"`. The `daemon_ages` field contains stale-daemon data that the `AttentionBar` component uses, but the top-level health endpoint never surfaces `"degraded"`.
- Blocks: Automated monitoring or alerting that keys on the health endpoint status field will never receive a degradation alert even when daemons are completely stale.

## Test Coverage Gaps

**Dispatcher teardown race conditions:**
- What's not tested: The ordered teardown sequence in `run_stream` (pump.stop → stdin close → reader.join → pump_thread.join → loop teardown) under conditions where one step hangs or raises. The `join(timeout=10)` failure path (reader still alive after 10 seconds) is not tested.
- Files: `backend/cmc/dispatcher/run_stream.py:279-326`
- Risk: A reader-thread hang would silently leave the task in `running` state indefinitely.
- Priority: Medium

**Telegram blocking event loop in `relay_text_to_claude`:**
- What's not tested: The asyncio event-loop blocking behavior when `subprocess.run` takes the full 120-second timeout inside an async function.
- Files: `backend/cmc/telegram/handler.py:99-139`
- Risk: Under a real slow claude invocation the entire `run_handler_loop` stalls.
- Priority: Low (single-process launchd deployment mitigates impact)

**Frontend integration tests use a mock API only:**
- What's not tested: `frontend/src/__tests__/integration.test.tsx` tests component integration against mocked API responses. There are no end-to-end tests (Playwright tests exist at `frontend/playwright.config.ts` but require a running backend).
- Files: `frontend/src/__tests__/integration.test.tsx`, `frontend/playwright.config.ts`
- Risk: API shape drift between backend Pydantic schemas and frontend TypeScript interfaces (`frontend/src/lib/api.ts`) goes undetected until runtime.
- Priority: Medium

**OTLP ingest protobuf path:**
- What's not tested: `backend/cmc/api/routes/ingest.py:18` notes "A protobuf request (Content-Type: application/x-protobuf) will fail JSON parsing here and return 200 anyway." This silent acceptance of malformed protobuf data is tested nowhere.
- Files: `backend/cmc/api/routes/ingest.py`
- Risk: Operators using protobuf-encoded OTLP exporters receive a 200 OK but no data is ingested. Difficult to diagnose.
- Priority: Low

---

*Concerns audit: 2026-05-02*
