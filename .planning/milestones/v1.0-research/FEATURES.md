# Feature Research

**Domain:** Local developer observability dashboard / AI agent command centre for Claude Code
**Researched:** 2026-04-25
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. Every Claude Code monitoring tool on the market (claude-view, claude-usage, claude-code-monitor, Claude-Code-Agent-Monitor) ships these. Omitting any one makes the dashboard look like a toy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Session list with search** | Every competitor has it. Users need to find past sessions by project, model, date, or keyword. claude-view has full-text search across messages, tool calls, and file paths. | MEDIUM | Paginated table with range/source/model filters. Full-text search is the bar now — claude-view set it. |
| **Token usage breakdown** | The #1 reason users install these tools. Anthropic's billing page shows a number; users want daily/weekly/monthly stacked bars by model, split by input/output/cache-read/cache-create. Every competitor (claude-usage, claude-code-monitor) tracks this. | MEDIUM | Daily stacked bars with today/7d/30d toggles. Must handle both JSONL-derived and OTEL-derived token counts. |
| **Cost estimation** | Direct corollary of token tracking. Users on API plans need dollar amounts. Pro/Max users want "what would this have cost on API?" context. claude-usage and claude-code-monitor both show this. | LOW | Apply per-model pricing to token counts. Keep pricing table updatable. |
| **Live session monitoring** | Users running multi-agent workflows need to see what is happening right now. claude-view, Claude-Code-Agent-Monitor both provide this. Without it the dashboard is a historical report, not a command centre. | MEDIUM | Sessions modified in last 5 minutes, showing title, model, tokens, duration. Auto-refresh at 5-10s intervals. |
| **Tool latency (p50/p95/max + error rate)** | Core observability metric. Every serious monitoring platform (Langfuse, AgentOps, Datadog) tracks per-tool latency distributions. Users need to know which tool is slow or broken. | MEDIUM | Sorted by p95 descending. Error rate as a percentage column. Derived from tool_use/tool_result timestamp deltas. |
| **Session outcomes** | Users need to know their failure rate. Are sessions erroring, rate-limiting, truncating? This is the "reliability" view. Langfuse and AgentOps both surface similar outcome categorization. | MEDIUM | Daily stacked bars: errored/rate_limited/truncated/unfinished/ok. Mutually exclusive categories. |
| **System health indicator** | Every dashboard needs a "is everything OK?" signal at the top. Grafana has health strips, Datadog has service maps, Linear has status indicators. Without it users don't know if the dashboard itself is working. | LOW | Strip showing: API status, ingestion lag, DB size, last sync time. Always visible, every page. |
| **Dark theme, dense layout** | The quality bar is Linear/Raycast/Vercel. Developer tools in 2026 default to dark. claude-view ships dark-only. Sparse or light themes signal "hobby project." | MEDIUM | Dark-only is correct for v1. Dense information panels, not cards-with-whitespace. JetBrains Mono for data, Inter for prose. |
| **Project breakdown** | Users run Claude Code across multiple repos. They need per-project session counts and token rollups. claude-view groups by project in Kanban swimlanes. | LOW | Group by cwd. Show session count, total tokens, last active. |
| **Cache efficiency** | Unique to Claude Code (prompt caching is a major cost lever). Users paying for Max need to know their cache hit rate. No competitor surfaces this well — but users expect it because Anthropic documents it. | LOW | Overall hit rate percentage, daily trend line. Low-sample badge when window is quiet. |
| **One-command install** | claude-view installs with one shell command. claude-usage uses npx. Users will not tolerate multi-step manual setup. | MEDIUM | `install.sh` with OTEL wizard, Telegram wizard, launchd plist generation. `cc` CLI shim for start/stop/restart. |
| **Localhost-only, zero telemetry** | Privacy is a selling point in this space. claude-view emphasizes "100% local, zero telemetry." claude-usage stores in ~/.claude/. Users choosing local tools over Langfuse Cloud do so specifically for privacy. | LOW | Bind 127.0.0.1 only. No outbound network except optional Telegram. No accounts, no auth. |

### Differentiators (Competitive Advantage)

Features that set Claude Mission Control apart from every existing tool. These are where the product competes. No single competitor has more than two of these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **MCP server drill-down (centerpiece)** | No competitor surfaces per-MCP-server, per-tool latency breakdown. This is the panel that catches the 14-second Notion MCP call nobody knows about. MCP Inspector exists for debugging individual servers, but no dashboard aggregates production MCP performance across all servers over time. | HIGH | Per-server latency rollup, expandable to per-tool within server. p50/p95/max/error-rate. Requires OTEL attribution data or JSONL tool_use events with server identification. |
| **HITL decision queue** | Most dashboards are read-only. claude-view has basic "approve/reject." Mission Control (builderz-labs) has a 6-column Kanban. But nobody has a structured DECISION: marker system where agents ask questions and the dashboard answers them, flowing the answer back into the running session. This turns the dashboard from observer to participant. | HIGH | Pending/answered queue. Agent writes DECISION: markers, dashboard surfaces them, user answers, answer flows back via file or API. 5s polling for responsiveness. |
| **HITL inbox (agent-to-user messaging)** | Distinct from decisions. Agents send INBOX: messages that are informational, not blocking. User can read and reply. No competitor separates decisions (blocking) from messages (non-blocking). This distinction matters for autonomy tuning. | MEDIUM | Read/unread state, reply capability. 10s polling. Separate from decision queue. |
| **Task board with lifecycle** | claude-view and Claude-Code-Agent-Monitor don't dispatch tasks. Mission Control (builderz-labs) has a Kanban but uses a different agent dispatch model. Claude Mission Control's task board has a composer sheet, approval flow, rerun, delete — and integrates directly with the dispatcher that spawns `claude -p` processes. | HIGH | 3 columns: pending/running/done. Composer sheet for new tasks. Approve/rerun/delete actions. Links to live sessions when running. |
| **Schedule system with cron** | Mission Control (builderz-labs) has natural-language scheduling. Claude Mission Control has a cron composer with enabled toggle, stale detection, and run history. Scheduled automation of Claude Code sessions is rare — most tools are passive observers. | HIGH | Cron expression composer UI, enabled/disabled toggle, stale detection (schedule didn't fire), run history with outcome. Materializes tasks for dispatcher. |
| **Mission Control dispatcher** | The dispatcher is a separate launchd process that claims pending tasks atomically and spawns `claude -p` or `claude` (stream mode) as subprocesses. This is orchestration, not just observation. No Claude-specific competitor does this with launchd + PID tracking. | HIGH | Stream/classic execution modes. DECISION:/INBOX: marker parsing from output. PID-based process tracking via `.tmp/` files. 120s heartbeat via launchd. |
| **Emergency stop** | KILLSWITCH.md is an emerging standard (2026). claude-view doesn't kill processes. The emergency stop here SIGTERMs only dispatcher-launched children via PID files — surgical, not a blanket kill. This is a safety feature that becomes critical once you automate agent dispatch. | MEDIUM | SIGTERM dispatcher-launched `claude -p` children only. PID files in `.tmp/mission-control-queue/pids/`. Button in dashboard UI. Does NOT kill user-launched sessions. |
| **Telegram pager bridge** | No Claude Code dashboard integrates Telegram for notifications. Grafana OnCall does Telegram, but it's a full incident management platform. Having decisions, approval requests, failures, overdue schedules, and inbox messages forwarded to Telegram with inline button callbacks is unique in this space. | HIGH | Notifier for: decisions, approvals, failures, overdue schedules, inbox. Inline button callbacks for approve/reject. Chat routing. Plain text (no parse_mode — DB content breaks markdown). |
| **Skill registry with autonomy controls** | claude-view has a "skills" concept (3 skills mentioned). Mission Control (builderz-labs) has a Skills Hub with security scanning. Claude Mission Control adds per-environment autonomy controls — deciding which skills run freely vs. require approval. This is the "policy layer" for agent governance. | HIGH | Registry of available skills. Per-environment autonomy toggles (auto/approve/deny). Skill economics (token cost per skill). |
| **Agent fanout tracking** | Claude Code's Agent tool spawns sub-agents. No competitor except claude-view tracks the sub-agent tree with per-agent cost. Claude Mission Control surfaces "sessions using Agent tool" as a first-class metric for understanding multi-agent behavior. | MEDIUM | Count and list sessions that used the Agent tool. Show fan-out depth. Link to sub-agent sessions. |
| **Edit acceptance rates** | Unique metric from Claude Code's tool_decision events. When Claude proposes an edit and the user accepts/rejects, this ratio reveals trust calibration. No competitor tracks this. | LOW | Acceptance percentage from tool_decision events (OTEL). Daily trend. Per-tool breakdown if data supports it. |
| **OTEL firehose panel** | Raw event stream with SSE and filtering. Langfuse has traces; this is the raw firehose. Useful for debugging and understanding exactly what Claude Code emits. Developer power-tool. | MEDIUM | SSE streaming of OTEL events. Filterable by event type. Scrollable log view. |
| **Command palette (Cmd+K)** | Linear, Raycast, Vercel, Notion — every premium developer tool has this. None of the Claude Code dashboards do. Fuzzy search across pages + quick-task action elevates the dashboard from "thing I look at" to "thing I operate from." | MEDIUM | Cmd+K trigger. Fuzzy search across pages, sessions, tasks. Quick-task creation action. framer-motion animation. |
| **Context health scanner** | Read-only scan of settings.json + CLAUDE.md to show configuration state. No competitor does this. Helps users understand what Claude Code sees before a session starts. | LOW | Read-only display. Shows env vars, MCP server configs, CLAUDE.md contents. No modification capability. |
| **Activity heatmap** | GitHub-style 30-day contribution grid applied to Claude Code usage. Visually compelling, makes usage patterns obvious at a glance. claude-view doesn't have this; neither do other competitors. | LOW | 30-day grid, color-coded by session count or token usage. 14-day token charts by model alongside. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Explicitly NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Cloud deployment / remote access** | "I want to check from my phone" | Destroys the privacy model. Adds auth, TLS, port forwarding, security surface. The entire value prop is "runs on your Mac, touches nothing else." | Telegram bridge covers remote notification/approval. For viewing, SSH tunnel or Tailscale if advanced users want it — but not our problem to solve. |
| **WebSocket-based real-time everything** | "I want instant updates, no polling lag" | WebSocket adds connection management complexity, reconnection logic, state synchronization bugs. For a single-user local dashboard, SSE + polling at 5-30s intervals is indistinguishable from "real-time." | SSE for firehose panel, polling everywhere else. 5s for decisions (urgent), 10s for inbox, 30s for analytics (not urgent). |
| **PostgreSQL / Supabase / external DB** | "SQLite won't scale" | For a single-user local dashboard, SQLite with WAL handles millions of rows with sub-millisecond reads. External DB adds deployment complexity, connection management, migration tooling. Kills the "one file, delete anytime" story. | SQLite single-file in `data/`. WAL mode for read concurrency. Periodic VACUUM if needed. |
| **Mobile app** | "I want a native iOS app" | Massive scope expansion for minimal value. The dashboard is dense data — not a phone-friendly interface. Maintaining two frontends doubles UI work forever. | Telegram bridge for notifications. Browser works on tablets. |
| **Voice interfaces / agent avatars** | "Make it conversational, add a character" | YouTube AI demo fodder. Adds massive complexity (speech-to-text, character animation, prompt engineering for personality) with zero productivity value. The target user wants dense signal, not a chatbot. | Dense data panels with good typography. The data speaks; it doesn't need a face. |
| **Multi-user / team features** | "Our team of 5 wants to share a dashboard" | Adds auth, RBAC, user management, data isolation. Fundamentally changes the architecture from single-file SQLite to a proper multi-tenant system. Not the product we're building. | Each developer runs their own instance. Team aggregation is a different product (see claude-code-otel for Grafana-based team dashboards). |
| **Session replay / time-travel debugging** | "Show me exactly what happened, step by step" | AgentOps has this and it's impressive, but it requires capturing full state snapshots at every step. Massive storage cost, complex player UI, and the JSONL already contains every message — users can read it. | Session detail drawer with chronological tool-call timeline. Full message history available via JSONL. Not a video player, but all the data is there. |
| **ORM / SQLAlchemy** | "Raw SQL is unmaintainable" | For a read-heavy dashboard with a known, stable schema, raw SQL is simpler, faster, and more transparent. ORM adds abstraction layers that hide performance characteristics and complicate migration. | Raw SQL via `aiosqlite`. `CREATE TABLE IF NOT EXISTS` with idempotent `_migrate_add_column` helper. 15 tables, all documented. |
| **Posture audits panel** | "Security scoring for agent behavior" | Mission Control (builderz-labs) has this with trust scoring 0-100. It's a community/enterprise feature that adds significant complexity (scoring algorithms, policy definitions, threshold tuning). Not part of this build. | Context health scanner (read-only settings.json + CLAUDE.md scan) covers the "am I configured right?" question without the policy engine. |
| **Cowork integration** | "Track cowork sessions too" | Cowork sessions are server-side; the JSONL data available locally is incomplete. Supporting partial data creates confusion. Defer to post-v1. | Exclude cowork sessions from ingestion. Document the limitation. |

## Feature Dependencies

```
[SQLite schema + migrations]
    |
    +---> [JSONL ingestion]
    |         |
    |         +---> [Session list with search]
    |         +---> [Token usage breakdown] ---> [Cost estimation]
    |         +---> [Session outcomes]
    |         +---> [Tool latency]
    |         +---> [Project breakdown]
    |         +---> [Cache efficiency]
    |         +---> [Agent fanout tracking]
    |         +---> [Live session monitoring]
    |
    +---> [OTEL ingestion endpoints]
    |         |
    |         +---> [OTEL firehose panel]
    |         +---> [Hook activity]
    |         +---> [Edit acceptance rates]
    |         +---> [Productivity counters]
    |         +---> [System pressure]
    |         +---> [MCP server drill-down] (enriches JSONL-derived data)
    |
    +---> [Task board]
    |         |
    |         +---> [Schedule system] (materializes tasks)
    |         +---> [Mission Control dispatcher] (claims + runs tasks)
    |                   |
    |                   +---> [Emergency stop] (kills dispatcher children)
    |                   +---> [HITL decision queue] (DECISION: markers from dispatcher output)
    |                   +---> [HITL inbox] (INBOX: markers from dispatcher output)
    |
    +---> [Telegram bridge]
              |
              +--requires---> [HITL decision queue] (forwards decisions)
              +--requires---> [Task board] (forwards approvals)
              +--requires---> [Schedule system] (forwards overdue alerts)
              +--requires---> [HITL inbox] (forwards messages)

[Command palette] ──enhances──> [All pages] (navigation + quick actions)
[Context health scanner] ──independent── (reads filesystem, no DB dependency)
[Activity heatmap] ──requires──> [Session list] (derives from session data)
[Skill registry] ──enhances──> [Task board] (skills used by tasks)
[Dark theme] ──required-by──> [All UI components]
```

### Dependency Notes

- **Task board requires SQLite schema:** Tasks table must exist before any task management.
- **Schedule system requires Task board:** Schedules materialize tasks; without the board there's nowhere to put them.
- **Dispatcher requires Task board:** Claims tasks from the board's pending column.
- **Emergency stop requires Dispatcher:** Only kills dispatcher-launched children; meaningless without dispatcher.
- **HITL decisions/inbox require Dispatcher:** DECISION:/INBOX: markers only appear in dispatcher output.
- **Telegram bridge requires HITL + Tasks + Schedules:** Without these, there's nothing meaningful to notify about.
- **MCP drill-down benefits from both JSONL and OTEL:** JSONL gives tool_use events with server hints; OTEL gives explicit MCP attribution. Best with both, functional with either.
- **Command palette enhances all pages:** No hard dependency but needs routing and entity lists to search.
- **Token usage and cost estimation are tightly coupled:** Cost is just tokens multiplied by pricing. Build together.

## MVP Definition

### Launch With (v1)

Minimum viable product — the dashboard that makes users say "this replaces my terminal scrolling."

- [ ] **SQLite schema + WAL mode** — Foundation for everything else
- [ ] **JSONL ingestion** (boot + 120s sync) — Primary data source, always available
- [ ] **OTEL ingestion endpoints** (`/v1/logs`, `/v1/metrics`) — Secondary data source for richer telemetry
- [ ] **System health strip** — User must know the dashboard is working
- [ ] **Live session monitoring** — The "what's happening now" view
- [ ] **Session list with search** — The "what happened before" view
- [ ] **Token usage breakdown** — The #1 reason users install these tools
- [ ] **Cost estimation** — Direct corollary of token tracking
- [ ] **Tool latency** — Core observability metric
- [ ] **Session outcomes** — Reliability signal
- [ ] **Cache efficiency** — Unique Claude Code metric, high user interest
- [ ] **MCP server drill-down** — Centerpiece differentiator, no competitor has this
- [ ] **Project breakdown** — Multi-repo context
- [ ] **Dark theme, dense layout** — Quality bar must be met from day one
- [ ] **One-command install + cc CLI** — Users won't tolerate multi-step setup

### Add After Validation (v1.x)

Features to add once core observability is stable and ingestion is proven reliable.

- [ ] **Task board with lifecycle** — Trigger: users want to dispatch work from the dashboard, not just watch it
- [ ] **HITL decision queue** — Trigger: dispatcher is running and agents need to ask questions
- [ ] **HITL inbox** — Trigger: users want non-blocking agent communication alongside decisions
- [ ] **Mission Control dispatcher** — Trigger: task board is working and users want automated execution
- [ ] **Emergency stop** — Trigger: dispatcher is running and users need a safety valve
- [ ] **Command palette** — Trigger: dashboard has enough entities to benefit from fuzzy search
- [ ] **Schedule system** — Trigger: dispatcher is proven and users want recurring automation
- [ ] **Agent fanout tracking** — Trigger: users running multi-agent workflows need this visibility
- [ ] **Edit acceptance rates** — Trigger: OTEL ingestion is stable and tool_decision events are flowing
- [ ] **Hook activity** — Trigger: OTEL ingestion is stable
- [ ] **OTEL firehose panel** — Trigger: OTEL ingestion is working, power users want raw events

### Future Consideration (v2+)

Features to defer until the core product is battle-tested.

- [ ] **Telegram bridge** — Why defer: significant integration surface (bot API, inline keyboards, chat routing). Only valuable after HITL and scheduling are solid.
- [ ] **Skill registry with autonomy controls** — Why defer: governance layer that requires clear skill definitions and policy model. Needs user feedback on what autonomy controls actually matter.
- [ ] **Skill economics** — Why defer: requires skill registry and accurate token-per-skill attribution.
- [ ] **Context health scanner** — Why defer: nice-to-have, read-only. No urgency.
- [ ] **Activity heatmap** — Why defer: vanity metric, looks great but not actionable.
- [ ] **Productivity counters** — Why defer: controversial metric (lines of code, commits). Needs careful framing to avoid Goodhart's Law traps.
- [ ] **System pressure** — Why defer: retry exhaustion, compaction, API errors — important but requires mature OTEL pipeline.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session list with search | HIGH | MEDIUM | P1 |
| Token usage breakdown | HIGH | MEDIUM | P1 |
| Cost estimation | HIGH | LOW | P1 |
| Live session monitoring | HIGH | MEDIUM | P1 |
| Tool latency | HIGH | MEDIUM | P1 |
| Session outcomes | HIGH | MEDIUM | P1 |
| Cache efficiency | HIGH | LOW | P1 |
| MCP server drill-down | HIGH | HIGH | P1 |
| System health strip | HIGH | LOW | P1 |
| Project breakdown | MEDIUM | LOW | P1 |
| Dark theme, dense layout | HIGH | MEDIUM | P1 |
| One-command install | HIGH | MEDIUM | P1 |
| Task board | HIGH | HIGH | P2 |
| HITL decision queue | HIGH | HIGH | P2 |
| HITL inbox | MEDIUM | MEDIUM | P2 |
| Dispatcher | HIGH | HIGH | P2 |
| Emergency stop | HIGH | MEDIUM | P2 |
| Command palette | MEDIUM | MEDIUM | P2 |
| Schedule system | MEDIUM | HIGH | P2 |
| Agent fanout | MEDIUM | MEDIUM | P2 |
| Edit acceptance rates | MEDIUM | LOW | P2 |
| Hook activity | MEDIUM | LOW | P2 |
| OTEL firehose | MEDIUM | MEDIUM | P2 |
| Telegram bridge | MEDIUM | HIGH | P3 |
| Skill registry | MEDIUM | HIGH | P3 |
| Skill economics | LOW | MEDIUM | P3 |
| Context health | LOW | LOW | P3 |
| Activity heatmap | LOW | LOW | P3 |
| Productivity counters | LOW | LOW | P3 |
| System pressure | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — the observability core
- P2: Should have — the "command centre" layer (task dispatch, HITL, automation)
- P3: Nice to have — polish, governance, notification integrations

## Competitor Feature Analysis

| Feature | claude-view | claude-usage | Claude-Code-Agent-Monitor | Mission Control (builderz-labs) | Claude Mission Control (ours) |
|---------|-------------|--------------|---------------------------|-------------------------------|-------------------------------|
| Session list + search | Full-text search, 142K+ sessions | Basic list | Kanban board | 6-column Kanban | Searchable paginated table with filters |
| Token tracking | Per-session, sub-agent | Daily/weekly/all-time by model | Live USD costs | Per-model + trend | Daily stacked bars, today/7d/30d, by model + source |
| Cost estimation | Yes | Yes (API pricing) | Yes | Yes | Yes |
| Live sessions | Real-time WebSocket | No | Real-time hooks | Heartbeat monitoring | 5s polling, tool-call timeline drawer |
| Tool latency | Per-tool cards | No | No | No | p50/p95/max/error-rate sorted by p95 |
| MCP drill-down | No | No | No | MCP tool auditing | Per-server + per-tool latency breakdown (centerpiece) |
| Session outcomes | No | No | No | No | Daily stacked bars by outcome category |
| Cache efficiency | 89-94% shown | No | No | No | Hit rate + daily trend + low-sample badge |
| Task dispatch | No | No | No | 6-column Kanban + dispatch | 3-column board + dispatcher + lifecycle |
| HITL decisions | Basic approve/reject | No | No | No | Structured DECISION: queue with dashboard answering |
| Scheduling | No | No | No | Natural language cron | Cron composer + enabled toggle + stale detection |
| Emergency stop | No | No | No | No | SIGTERM dispatcher children via PID |
| Telegram | No | No | No | Webhooks | Full bridge: notify + inline callbacks + chat routing |
| Command palette | No | No | No | No | Cmd+K fuzzy search + quick actions |
| Sub-agent tracking | Tree view | No | Subagent orchestration | Agent lifecycle | Agent fanout metrics + session linking |
| Install method | Shell + npx | npx | npm | Docker / npm | install.sh + cc CLI + launchd plist |
| Stack | Rust + React | Node.js + Chart.js | Node.js + React | Next.js + SQLite | Python/FastAPI + React + SQLite |
| Privacy | 100% local, zero telemetry | Local | Local | Self-hosted | Localhost-only, zero telemetry, 127.0.0.1 bind |

### Competitive Positioning

**claude-view** is the closest competitor: Rust-powered, fast, local, with 85 MCP tools and full-text search. It's the "read-only observer" done well. Claude Mission Control differentiates by being the "active command centre" — it doesn't just show you what's happening, it lets you dispatch work, queue decisions, schedule automation, and kill runaway processes.

**Mission Control (builderz-labs)** is the closest competitor on the orchestration side: 6-column Kanban, scheduling, multi-agent dispatch. But it's framework-agnostic (OpenClaw, CrewAI, LangGraph) and doesn't deeply understand Claude Code's data model (JSONL sessions, OTEL events, MCP attribution, cache efficiency). Claude Mission Control is purpose-built for Claude Code.

**claude-usage** and **claude-code-monitor** are simpler tools focused purely on token/cost tracking. They validate that this is the minimum viable use case but leave massive feature gaps.

**Langfuse, AgentOps, Braintrust** are cloud-first LLM observability platforms. They're comprehensive but require accounts, send data externally, and aren't tailored to Claude Code's specific data sources. Claude Mission Control's "zero cloud" positioning targets users who explicitly chose against these platforms.

## Sources

- [claude-view](https://claudeview.ai/) — Rust-powered Claude Code monitoring dashboard (HIGH confidence, direct competitor)
- [Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) — Hook-based agent monitoring with Kanban (HIGH confidence, direct competitor)
- [claude-usage](https://github.com/phuryn/claude-usage) — Token tracking dashboard (HIGH confidence, direct competitor)
- [claude-code-monitor](https://github.com/zcquant/claude-code-monitor) — OTEL-based token monitor (HIGH confidence, direct competitor)
- [Mission Control (builderz-labs)](https://github.com/builderz-labs/mission-control) — AI agent orchestration platform (HIGH confidence, indirect competitor)
- [Langfuse](https://langfuse.com/) — Open source LLM observability platform (HIGH confidence, category reference)
- [AgentOps](https://www.agentops.ai/) — AI agent monitoring with session replay (HIGH confidence, category reference)
- [KILLSWITCH.md](https://killswitch.md/) — Emergency stop standard for AI agents (MEDIUM confidence, emerging standard)
- [Sentry AI Agent Observability Guide](https://blog.sentry.io/ai-agent-observability-developers-guide-to-agent-monitoring/) — Industry practices (MEDIUM confidence)
- [MCP Debugging docs](https://modelcontextprotocol.io/docs/tools/debugging) — MCP Inspector and debugging patterns (HIGH confidence, official docs)
- [Speakeasy MCP Monitoring](https://www.speakeasy.com/mcp/monitoring-mcp-servers) — MCP server monitoring best practices (MEDIUM confidence)
- [Command Palette UX Patterns](https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1) — UX design patterns (MEDIUM confidence)
- [Command K Bars](https://maggieappleton.com/command-bar) — Command palette design reference (MEDIUM confidence)
- [HITL Best Practices](https://dev.to/taimoor__z/-human-in-the-loop-hitl-for-ai-agents-patterns-and-best-practices-5ep5) — Human-in-the-loop patterns (MEDIUM confidence)
- [Mastra HITL Guide](https://mastra.ai/blog/human-in-the-loop-when-to-use-agent-approval) — Agent approval patterns (MEDIUM confidence)

---
*Feature research for: Claude Mission Control — local developer observability dashboard / AI agent command centre*
*Researched: 2026-04-25*
