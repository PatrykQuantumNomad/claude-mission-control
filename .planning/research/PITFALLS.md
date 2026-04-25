# Pitfalls Research

**Domain:** Local observability dashboard with SQLite, OTEL ingestion, and process dispatching (macOS)
**Researched:** 2026-04-25
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: SQLite WAL Checkpoint Starvation from Long-Running Readers

**What goes wrong:**
The WAL file grows unboundedly when React Query polling keeps read connections alive continuously. With polling at 5s (decisions), 10s (inbox), and 30s (everything else) across multiple query keys, there is always at least one active reader. SQLite cannot truncate the WAL file past any active reader's end mark. A documented production case saw a 2GB database accumulate a 20GB WAL file within hours because the checkpoint could never complete.

**Why it happens:**
aiosqlite opens a new connection per query (or reuses one from a pool), but if any connection holds a read transaction open while new writes arrive, the WAL can only checkpoint up to that reader's mark. FastAPI async request handlers that perform multiple awaited reads within a single connection context extend the read transaction lifetime. The default `wal_autocheckpoint` of 1000 pages assumes readers come and go with gaps, which never happens with continuous polling.

**How to avoid:**
- Use short-lived, single-statement read transactions. Never hold a connection open across multiple awaits.
- Set `PRAGMA journal_size_limit = 67108864` (64MB cap) as a safety net.
- Lower `wal_autocheckpoint` from the default 1000 pages to 100-200.
- Run `PRAGMA wal_checkpoint(TRUNCATE)` on a periodic background timer (every 60s) during a brief pause in reads.
- Monitor WAL file size in the `doctor.py` health check. Alert when WAL exceeds 2x the main database size.

**Warning signs:**
- `data/dashboard.db-wal` file growing steadily over hours.
- Disk usage climbing despite small database.
- `doctor.py` should check `os.path.getsize()` of the WAL file.

**Phase to address:**
Phase 1 (database foundation). Set pragmas and journal_size_limit in the migration/init code from day one.

---

### Pitfall 2: aiosqlite busy_timeout Ignored Due to Deferred Transactions

**What goes wrong:**
Despite setting `PRAGMA busy_timeout=5000`, write operations fail immediately with `sqlite3.OperationalError: database is locked` instead of waiting. This surfaces most during the 120s sync cycle where the JSONL ingester, OTEL writer, and dispatcher all attempt writes simultaneously.

**Why it happens:**
SQLite's default transaction mode is DEFERRED. A `BEGIN` (deferred) statement does not acquire any lock. The lock is acquired only when the first write statement executes within the transaction. If another connection already holds the write lock at that instant, the busy handler fires -- but if the transaction was implicitly opened by a prior read (the common aiosqlite pattern of `SELECT` then `INSERT` on the same connection), it tries to upgrade from a shared lock to an exclusive lock. This upgrade fails immediately because the busy handler only applies to initial lock acquisition, not upgrades. The result: `busy_timeout` is silently ignored for the most common failure scenario.

**How to avoid:**
- Use `BEGIN IMMEDIATE` for any transaction that will write. This acquires the reserved lock upfront and respects `busy_timeout`.
- Separate read connections from write connections entirely. Reads use a pool of connections; writes funnel through a single dedicated writer connection (or a write queue).
- Keep write transactions as small as possible: one INSERT/UPDATE per transaction, committed immediately.
- Set `busy_timeout` to at least 5000ms on every connection, including the sync-loop connection.

**Warning signs:**
- Sporadic `database is locked` errors in logs despite having set busy_timeout.
- Errors correlate with JSONL sync times (every 120s) or heavy OTEL ingest.
- Errors disappear under light load but appear under concurrent activity.

**Phase to address:**
Phase 1 (database foundation). The writer architecture (single writer vs. connection pool) must be decided before any data ingestion code is written.

---

### Pitfall 3: PID Recycling Kills the Wrong Process on Emergency Stop

**What goes wrong:**
The emergency stop feature sends SIGTERM to a PID read from a file in `.tmp/mission-control-queue/pids/`. If the dispatched `claude -p` child has already exited (crashed, completed, or timed out) and macOS has recycled its PID to a new unrelated process, the emergency stop kills an innocent process. On macOS, PID recycling is documented as exploitable -- the kernel reuses PIDs quickly, and with active development tools spawning/killing processes frequently, the window is real.

**Why it happens:**
PID files are a static snapshot. There is a TOCTOU (time-of-check-time-of-use) race: the PID is valid when written but may not be valid when read seconds or minutes later. macOS has no `pidfd_send_signal()` equivalent (that is Linux 5.1+). The `asyncio.subprocess.Process` in Python 3.13 itself has a documented race condition (cpython#127049) where it can signal a recycled PID.

**How to avoid:**
- Record the process start time alongside the PID. Before sending SIGTERM, check that the process start time matches using `ps -p <PID> -o lstart=`. If the start time differs, the PID has been recycled -- skip the kill and clean up the PID file.
- Use process groups (`os.setpgid`) for dispatched children and kill the group (`os.killpg`) instead of individual PIDs, reducing the recycling window.
- Set a maximum lifetime for PID files (e.g., 30 minutes). Stale PID files are never acted on.
- After sending SIGTERM, verify the process actually exited (`os.waitpid` with `WNOHANG`) before cleaning up.
- Delete PID files immediately when the dispatcher detects process exit (in the normal completion path).

**Warning signs:**
- PID files lingering in `.tmp/mission-control-queue/pids/` after tasks complete.
- Emergency stop "succeeds" but the task still appears running (killed wrong process, original is already gone).
- Mysterious process deaths on the developer's machine unrelated to the dashboard.

**Phase to address:**
Phase implementing the dispatcher/Mission Control. This must be correct before emergency stop is exposed in the UI.

---

### Pitfall 4: OTEL Endpoint Failure Silently Drops All Telemetry

**What goes wrong:**
Claude Code's OTEL exporter does not retry on non-transient failures. If the `/v1/logs` or `/v1/metrics` endpoint returns anything other than 200 (including 500, 422, or connection refused), the telemetry batch is dropped permanently. There is no client-side buffer, no disk queue, no replay. The data is gone. Since OTEL events are the only source for `tool_decision`, `hook_execution`, `api_error`, `compaction`, and productivity metrics, an endpoint outage during active sessions creates permanent gaps in the dashboard.

**Why it happens:**
Claude Code uses the standard OTEL JS SDK exporter which retries only for specific transient HTTP codes (429, 502, 503, 504) with exponential backoff, but with a very short retry window (a few attempts over seconds). Connection refused, timeouts, and 4xx errors are treated as permanent failures. The exporter batches events and flushes every 5 seconds for logs and 60 seconds for metrics. If the flush fails, that entire batch is discarded.

**How to avoid:**
- The `/v1/logs` and `/v1/metrics` endpoints must ALWAYS return 200, even if internal processing fails. Accept the payload, return 200, then process asynchronously.
- Validate the OTLP payload structure loosely -- accept and store anything that parses as JSON, even if fields are unexpected.
- Implement an in-endpoint try/except that catches ALL exceptions and still returns 200.
- Write raw OTEL payloads to a `raw_otel_buffer` table first, then process them in a background task. This decouples acceptance from parsing.
- Add a health check in `doctor.py` that POSTs a test payload to the OTEL endpoints and verifies 200 response.

**Warning signs:**
- Gaps in the OTEL firehose panel during times when sessions were known to be active.
- Missing `tool_decision` or `hook_execution` events despite JSONL showing tool calls happened.
- `doctor.py` showing the OTEL endpoint is unreachable.

**Phase to address:**
Phase 1 (OTEL ingestion endpoints). The "always 200" contract must be the very first thing implemented, before any parsing logic.

---

### Pitfall 5: 100MB+ JSONL Parsing Blocks the Event Loop and OOMs the Process

**What goes wrong:**
Session JSONL files can reach 100MB+ for long agent sessions with heavy tool use. Parsing the entire file with `json.loads()` per line, while accumulating results in a list, can consume 400-600MB of RAM (Python's object overhead inflates JSON data 4-6x). If the parser runs in the async event loop, it blocks all HTTP request handling for the duration of the parse (seconds to tens of seconds), causing the OTEL endpoint to time out and drop events (see Pitfall 4), and the UI to go unresponsive.

**Why it happens:**
The sync loop runs every 120 seconds and must scan `~/.claude/projects/` for modified JSONL files. Developers naturally start with `for line in f: data.append(json.loads(line))` which loads everything into memory. Even with incremental parsing (tracking file offsets), a single large file's new lines can still be enormous if the session produced many tool calls since the last sync.

**How to avoid:**
- Track file offsets per JSONL file (store `last_byte_offset` in the database). Only read new bytes since last sync using `f.seek(offset)`.
- Process lines in a streaming fashion: parse each line, extract needed fields, write to SQLite, then discard. Never accumulate all parsed objects in memory.
- Run JSONL parsing in a thread pool executor (`asyncio.to_thread()` or `loop.run_in_executor()`) so it does not block the event loop. The OTEL endpoint must remain responsive during sync.
- Wrap `json.loads()` per line in a try/except to handle corrupted lines gracefully (Claude Code issue #20992 documents concurrent-write corruption producing truncated JSON lines). Log and skip bad lines; do not crash the sync.
- Set a per-file processing budget (e.g., 10 seconds). If a file exceeds this, yield control and continue in the next sync cycle.

**Warning signs:**
- Dashboard UI freezes for 5-30 seconds every 120 seconds (sync cycle timing).
- OTEL events missing during sync windows.
- Python process memory climbing steadily and not releasing after sync.
- `MemoryError` or OS killing the process.

**Phase to address:**
Phase 1 (JSONL ingestion). The offset-tracking and streaming approach must be the initial design, not a later optimization.

---

### Pitfall 6: Stream-Mode Dispatcher Misparses DECISION:/INBOX: Markers Inside Fenced Code Blocks

**What goes wrong:**
The dispatcher reads stdout JSON lines from `claude` (stream mode) looking for `DECISION:` and `INBOX:` markers. But Claude Code's output includes fenced code blocks where these markers can appear as example text, documentation, or string literals. A naive line-by-line parser that greps for `DECISION:` will trigger false positives, creating phantom decision requests or inbox messages from code examples.

**Why it happens:**
Stream mode outputs a mix of assistant text (which may contain markdown with code fences) and structured JSON events. The markers are a convention applied to the assistant's text output. If the LLM generates a code example that says `print("DECISION: should I deploy?")`, the dispatcher's stdout parser sees `DECISION:` and incorrectly creates a pending decision.

**How to avoid:**
- Parse the structured JSON envelope from stream mode, not raw text lines. The JSON events contain a `type` field distinguishing assistant text from tool calls. Only look for markers within the assistant text content of the structured output.
- Track fenced code block state: maintain a boolean `in_code_fence` flag that toggles on lines starting with triple backticks. Only parse for markers when `in_code_fence` is false.
- Require markers to appear at the start of a line (after optional whitespace) in the assistant's message text, not anywhere within it.
- Add a confirmation step for parsed decisions: validate that the extracted decision text looks like a real question, not a code snippet.

**Warning signs:**
- Phantom decisions appearing in the queue that look like code snippets or documentation examples.
- Decisions containing backtick-fenced content or code syntax.
- Dispatcher logs showing marker detection inside content that is clearly code.

**Phase to address:**
Phase implementing the dispatcher/Mission Control stream mode. Must be addressed before stream mode is enabled for any real tasks.

---

### Pitfall 7: Telegram Message Formatting Breaks on DB-Sourced Content with Backticks

**What goes wrong:**
Telegram's `sendMessage` with `parse_mode=Markdown` or `parse_mode=MarkdownV2` returns HTTP 400 (`Bad Request: can't parse entities`) when the message contains unmatched backticks, unclosed formatting delimiters, or special characters. Since message content comes from the database (session titles, error messages, tool outputs, decision text), and that content regularly contains code-related backticks, the Telegram notification fails silently -- the user never receives critical alerts about decisions, failures, or overdue schedules.

**Why it happens:**
Developers set `parse_mode=Markdown` to make messages look nice, then forget that the message body contains user-generated content from Claude Code sessions. A session title like "Fix the `render` function" contains a single backtick that breaks Markdown parsing. MarkdownV2 is even worse -- it requires escaping `.`, `-`, `(`, `)`, `!`, and many other common characters.

**How to avoid:**
- Use `parse_mode=None` (plain text) for all messages containing DB-sourced content. This is already identified as a key decision in PROJECT.md. Enforce it as a hard rule.
- If formatting is desired, use `parse_mode=HTML` instead of Markdown. HTML is more forgiving: only `<`, `>`, and `&` need escaping, and `html.escape()` handles it reliably.
- Never interpolate raw DB content into a Markdown-formatted template. If mixing formatted headers with dynamic content, use HTML mode with `html.escape()` on all dynamic parts.
- Add a `safe_telegram_send()` wrapper that catches HTTP 400, retries without parse_mode, and logs the formatting failure.

**Warning signs:**
- Telegram notifications stop arriving during active sessions (the send failed, but no one noticed).
- Telegram bot logs showing 400 errors.
- Decision queue items going unanswered because the notification never arrived.

**Phase to address:**
Phase implementing the Telegram bridge. Plain text should be the default from the start.

---

### Pitfall 8: Local-Time vs UTC Day Bucketing Splits Evening Sessions Across Days

**What goes wrong:**
Token usage charts show "today's" usage as lower than expected because evening sessions (after midnight UTC but before midnight local time) are bucketed into "tomorrow" in UTC. For a US Pacific user (UTC-7/UTC-8), any work after 4/5 PM local time gets attributed to the next UTC day. The daily stacked bars look wrong, and cumulative token counts for "today" underreport by 30-50% during heavy evening work sessions.

**Why it happens:**
SQLite's `date()` and `strftime()` functions operate on UTC by default. If timestamps from JSONL or OTEL events are stored as UTC (correct for data interchange), but daily aggregation queries use `date(timestamp)` without timezone conversion, the day boundaries are at midnight UTC, not midnight local time. Since developers often work in the evening, this is not an edge case -- it is the common case.

**How to avoid:**
- Store all timestamps as UTC in the database (this is correct and should not change).
- All daily aggregation queries must convert to local time for bucketing: `date(timestamp, 'localtime')` in SQLite, or apply the timezone offset in Python before grouping.
- Define "today" as midnight-to-midnight in the user's local timezone, not UTC.
- Make the timezone configurable (default to system timezone via `time.localtime().tm_zone`). Display the active timezone in the UI footer or settings.
- Test with timestamps that cross midnight UTC but not midnight local: a session at 11 PM EST (04:00 UTC next day) must appear in "today" for EST.

**Warning signs:**
- Token charts showing spikes on days you didn't work, and valleys on days you did.
- "Today" counter resetting at 4-5 PM (US Pacific) or 7 PM (US Eastern) instead of midnight.
- User complaints that the daily breakdown "doesn't match my activity."

**Phase to address:**
Phase implementing token usage and daily aggregation queries. Must be correct in the first SQL queries written.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single aiosqlite connection for everything | Simple setup, no pool config | Blocks event loop on writes, serializes all DB access | Never -- use separate read pool + single writer from day one |
| `json.loads(line)` without try/except in JSONL parser | Clean code, fails fast | One corrupted line crashes entire sync cycle, loses all data from that cycle | Never -- corrupted JSONL lines are documented (claude-code#20992) |
| Storing parsed JSONL data without offset tracking | Simpler sync logic | Re-parses entire file every 120s cycle, O(n) growing cost as files grow | Only for MVP if files are small; must add offsets before any real usage |
| `os.kill(pid, signal.SIGTERM)` without start-time validation | Works for happy path | Kills wrong process on PID recycling | Never for a feature labeled "emergency stop" |
| `SELECT ... INSERT ...` in a single deferred transaction | Reads and writes in one logical operation | Immediate `database is locked` on lock upgrade attempt | Never with concurrent writers; use BEGIN IMMEDIATE or separate transactions |
| Polling the JSONL directory with `os.listdir()` every 120s | No file-watching dependency | Misses rapid file creation/deletion; no ordering guarantee | Acceptable for MVP; consider `fsevents` later if sync gaps observed |

## Integration Gotchas

Common mistakes when connecting to external services and system interfaces.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code OTEL | Returning 4xx/5xx from OTEL endpoints, losing telemetry permanently | Always return 200; accept-then-process pattern |
| Claude Code JSONL | Assuming files are well-formed JSON per line | Wrap every `json.loads()` in try/except; skip and log corrupted lines |
| Claude Code JSONL | Reading files that Claude Code is actively writing to | Use file offset tracking with `seek()`; handle truncated last lines |
| Launchd | Using `KeepAlive: true` without `ThrottleInterval` | Set `ThrottleInterval: 30` to prevent rapid restart loops on crash |
| Launchd | Daemon exits with code 0, expecting launchd to restart it | Exit with non-zero code for crash restarts; `KeepAlive.SuccessfulExit: false` restarts only on crash |
| Telegram Bot API | Using `parse_mode=Markdown` with dynamic content | Use plain text or HTML with `html.escape()` for all DB-sourced content |
| macOS process signals | Sending SIGTERM to PID from file without validation | Verify PID start time before signaling; clean up stale PID files |
| FastAPI static files | Mounting `StaticFiles` without SPA catch-all for client-side routing | Custom `SPAStaticFiles` class that returns `index.html` for non-API, non-file 404s |
| SSE (firehose panel) | Not cleaning up SSE connections on client disconnect | Use `request.is_disconnected()` checks; handle `asyncio.CancelledError`; track active connections |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full JSONL re-parse every sync cycle | Sync takes 30+ seconds; event loop blocked | Offset tracking per file; thread pool for parsing | When any session JSONL exceeds 10MB (~500 tool calls) |
| Unbounded in-memory event accumulation | RAM climbs to 1GB+; OOM kill | Stream-process and discard; never build full list | When total JSONL data exceeds 200MB across all sessions |
| WAL file growth from checkpoint starvation | Disk usage climbing GB/hour during active sessions | journal_size_limit, periodic TRUNCATE checkpoints | With 3+ concurrent polling queries and steady writes |
| Single SQLite connection for async reads | p95 response time >500ms; UI feels sluggish | Read connection pool (3-5 connections); dedicated write connection | When dashboard has 5+ simultaneous query keys polling |
| `SELECT *` on sessions table for list views | Query takes 2+ seconds; transfers MB of JSONL content columns | Select only needed columns; paginate with LIMIT/OFFSET | When sessions table exceeds 1000 rows |
| Unindexed `WHERE date(timestamp)` in aggregation queries | Daily charts take 3+ seconds to render | Add computed columns or expression indexes: `CREATE INDEX idx_ts_date ON tokens(date(created_at))` | When tokens table exceeds 100K rows |
| SSE firehose with no backpressure | Memory grows per connected client; server slows | Bounded channel per client; drop events if consumer is slow | When OTEL events arrive at >100/second during active multi-agent sessions |

## Security Mistakes

Domain-specific security issues for a localhost-only dashboard.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Binding to `0.0.0.0` instead of `127.0.0.1` | Dashboard accessible from LAN; exposes session data, OTEL ingest, and emergency stop to any device on the network | Hardcode `host="127.0.0.1"` in uvicorn config; verify in install.sh |
| No rate limiting on OTEL endpoints | Malicious local process or misconfigured tool floods the DB with fake events | Basic rate limiting (1000 req/s); payload size cap (10MB) |
| Serving `~/.claude/settings.json` content without redaction | API keys, tokens, or other secrets in env vars exposed in "context health" panel | Only display key names, never values; redact anything matching `*KEY*`, `*TOKEN*`, `*SECRET*` patterns |
| PID file in world-readable directory | Another process on the machine could read PID files and manipulate dispatched tasks | Set `.tmp/` directory permissions to `0700`; validate PID file ownership before acting |
| Arbitrary command execution via task composer | User-provided task prompts are passed to `claude -p` which executes tools | Document that this is intentional (user is dispatching their own agent); never expose task creation API to non-localhost |

## UX Pitfalls

Common user experience mistakes in observability dashboards.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing empty panels on first load before initial sync completes | User thinks dashboard is broken; closes tab | Show skeleton loaders with "Initial sync in progress..." message; display countdown |
| Token charts resetting at UTC midnight instead of local midnight | Evening work appears split across two days; "today" underreports | Use local timezone for day bucketing; show timezone indicator |
| Emergency stop button with no confirmation | Accidental click kills active work | Two-step confirmation: click to arm (button turns red), click again within 5s to execute |
| Decision queue showing stale decisions from crashed sessions | User answers a decision that no session is waiting for | Mark decisions as expired if parent session has ended; show session status indicator |
| Sync cycle lag (up to 120s) for JSONL data but near-real-time for OTEL | JSONL-derived panels (sessions, tools) are 2 minutes behind OTEL panels (firehose) | Display data freshness timestamp per panel; explain the two data sources in onboarding |
| Command palette returning too many results from large session history | Fuzzy search is slow or returns irrelevant results | Limit search scope; weight recent sessions higher; cap results at 20 |
| Collapsible sections losing state on navigation | User collapses a panel, navigates away, comes back and it's expanded again | Persist collapsed/expanded state in localStorage keyed by route + section ID |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **OTEL ingestion:** Often missing error handling that returns 200 regardless -- verify that a malformed payload, a DB write failure, and an exception in parsing ALL still return HTTP 200
- [ ] **JSONL sync:** Often missing offset tracking -- verify that a 100MB file is not re-parsed from the start on every sync cycle
- [ ] **JSONL sync:** Often missing corrupted-line resilience -- verify that a truncated JSON line does not crash the sync (test with the corruption pattern from claude-code#20992)
- [ ] **Emergency stop:** Often missing PID validation -- verify that a stale PID file pointing to a recycled PID does NOT result in killing the wrong process
- [ ] **Daily charts:** Often missing timezone conversion -- verify that a session at 11 PM EST appears in "today" for EST, not "tomorrow"
- [ ] **Tool duration pairing:** Often missing orphan handling -- verify that a `tool_use` without a matching `tool_result` is capped at 10 minutes, not left as infinite/null
- [ ] **Telegram notifications:** Often missing fallback for formatting errors -- verify that a message with unmatched backticks still delivers (in plain text)
- [ ] **SPA routing:** Often missing catch-all -- verify that a direct browser navigation to `/activity` or `/skills` returns the React app, not a 404
- [ ] **Launchd plist:** Often missing `ThrottleInterval` -- verify that a rapid-crash loop does not restart the daemon 6 times per minute
- [ ] **React Query polling:** Often missing `refetchInterval` coordination -- verify that two components using the same query key don't double the request rate
- [ ] **SQLite WAL:** Often missing `journal_size_limit` -- verify that the WAL file does not grow unboundedly during a multi-hour session
- [ ] **Write transactions:** Often missing `BEGIN IMMEDIATE` -- verify that concurrent writes from sync + OTEL + dispatcher use immediate locking

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WAL checkpoint starvation (20GB WAL) | LOW | Stop the server; run `sqlite3 data/dashboard.db 'PRAGMA wal_checkpoint(TRUNCATE);'`; restart. Data is preserved. |
| OTEL events lost due to endpoint failure | HIGH | Events are permanently lost. Re-sync JSONL data (partial recovery). OTEL-only data (hook timing, tool decisions) cannot be recovered. |
| Emergency stop killed wrong process | HIGH | No automated recovery. User must identify what was killed. Add PID start-time validation to prevent recurrence. |
| Corrupted JSONL line crashes sync | LOW | Add try/except around json.loads(); skip bad lines. Run the workaround script from claude-code#20992 to remove corrupted files. |
| DB locked errors during sync | MEDIUM | Increase busy_timeout; switch to BEGIN IMMEDIATE; implement write queue. Retry the sync cycle. |
| Telegram notifications failing silently | MEDIUM | Switch to plain text (no parse_mode). Check notification_log table for HTTP 400 errors. Re-send pending decisions. |
| Daily charts showing wrong timezone | LOW | Fix the aggregation SQL to use `date(timestamp, 'localtime')`. Charts correct on next page load. |
| Memory spike during large JSONL parse | MEDIUM | Kill the server process; add offset tracking and streaming parser; restart. No data loss since JSONL files are on disk. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WAL checkpoint starvation | Phase 1: Database foundation | WAL file stays under 64MB during a 4-hour session with continuous polling |
| aiosqlite busy_timeout ignored | Phase 1: Database foundation | Run 3 concurrent writers for 60 seconds with zero `database is locked` errors |
| OTEL endpoint drops telemetry | Phase 1: OTEL ingestion | POST malformed JSON to /v1/logs; verify HTTP 200 response and no crash |
| JSONL OOM on large files | Phase 1: JSONL ingestion | Parse a 100MB JSONL file; verify RSS stays under 200MB and event loop is not blocked |
| Corrupted JSONL lines crash sync | Phase 1: JSONL ingestion | Inject a truncated JSON line; verify sync completes and skips the bad line |
| Local vs UTC day bucketing | Phase 2: Dashboard queries | Query daily tokens at 11 PM local time; verify it appears in "today" bucket |
| PID recycling on emergency stop | Phase 3: Dispatcher/Mission Control | Write a PID file with an expired PID; attempt emergency stop; verify no kill sent |
| Stream-mode marker false positives | Phase 3: Dispatcher/Mission Control | Feed assistant output containing `DECISION:` inside a fenced code block; verify no phantom decision created |
| Telegram formatting breaks | Phase 4: Telegram bridge | Send a notification for a session titled "Fix the \`render\` bug"; verify delivery succeeds |
| SPA routing 404 | Phase 2: Frontend integration | Navigate directly to `localhost:8765/activity` in a new browser tab; verify React app loads |
| Launchd restart loop | Phase 3: Daemon management | Kill the server process 5 times in 30 seconds; verify launchd waits ThrottleInterval between restarts |
| Tool duration orphan handling | Phase 1: Data modeling | Insert a `tool_use` event with no matching `tool_result`; verify duration is capped at 10 minutes |

## Sources

- [SQLite WAL Checkpoint Starvation - 20GB WAL case study](https://loke.dev/blog/sqlite-checkpoint-starvation-wal-growth)
- [SQLite Concurrent Writes and "database is locked" Errors](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [SQLite WAL Mode Official Documentation](https://www.sqlite.org/wal.html)
- [aiosqlite busy_timeout Issue #251](https://github.com/omnilib/aiosqlite/issues/251)
- [macOS PID Reuse - HackTricks](https://book.hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-proces-abuse/macos-ipc-inter-process-communication/macos-xpc/macos-xpc-connecting-process-check/macos-pid-reuse.html)
- [Python asyncio.subprocess PID race condition - cpython#127049](https://github.com/python/cpython/issues/127049)
- [Claude Code JSONL Corruption - anthropics/claude-code#20992](https://github.com/anthropics/claude-code/issues/20992)
- [Claude Code Monitoring/OTEL Documentation](https://code.claude.com/docs/en/monitoring-usage)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [Telegram Bot API - Message Formatting](https://core.telegram.org/bots/api)
- [Telegram Markdown Parse Errors Discussion](https://dev.to/mbelsky/send-message-as-a-telegram-bot-what-may-go-wrong-1adf)
- [FastAPI SPA Routing with React](https://gist.github.com/ultrafunkamsterdam/b1655b3f04893447c3802453e05ecb5e)
- [launchd Plist Documentation](https://keith.github.io/xcode-man-pages/launchd.plist.5.html)
- [launchd ThrottleInterval Notes](https://ilostmynotes.blogspot.com/2016/05/launchd-throttleinterval.html)
- [React Query Important Defaults](https://tanstack.com/query/v4/docs/framework/react/guides/important-defaults)
- [React Query refetchInterval + staleTime Interaction Issue #7721](https://github.com/TanStack/query/issues/7721)
- [Processing Large JSON Files in Python Without Running Out of Memory](https://pythonspeed.com/articles/json-memory-streaming/)

---
*Pitfalls research for: Local observability dashboard with SQLite, OTEL ingestion, and process dispatching (macOS)*
*Researched: 2026-04-25*
