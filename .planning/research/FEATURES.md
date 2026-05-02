# Feature Research — v1.1 Skills & Cost Intelligence

**Domain:** Local LLM-agent observability & cost dashboard (single-user, localhost-only)
**Researched:** 2026-05-02
**Confidence:** HIGH (Datadog APM, Honeycomb BubbleUp, Langfuse, Vercel Analytics surveyed via Context7; mapped against existing v1.0 patterns in this codebase)

---

## Scope Note

This is a milestone-scoped feature landscape, NOT a greenfield product survey. v1.0 already shipped 21 observability panels, the HITL decisions queue, dispatcher, Telegram bridge, OTLP ingest, Cmd+K palette, and the Linear/Raycast/Vercel-grade dark theme. v1.1 closes two placeholder cards and adds five net-new feature categories on top of that chassis.

The seven feature categories below correspond 1:1 to the milestone's REQUIREMENTS:

1. **Skill frequency** (closes ACTV-04)
2. **Skill cost** (closes SKLP-02)
3. **Skill latency + error rate** (mirrors per-tool latency from v1.0)
4. **Skill timeline / event firehose** (mirrors OTEL firehose from v1.0)
5. **Skill-level alerts** (anomaly + threshold → Telegram + decisions queue)
6. **Session comparison** (pick 2 sessions, diff skills/cost/outcomes)
7. **Cost estimation foundation** (ANLYT-01 — token-pricing math reused by SkillCostCard, future panels)

Patterns are validated against four reference dashboards:
- **Datadog APM** Service Catalog (services list, watchdog anomalies, tag-based cost allocation)
- **Honeycomb** BubbleUp / outlier comparison
- **Langfuse** custom dashboards + cost-by-model + side-by-side compare view (Nov 2025)
- **Vercel** Web Analytics / Speed Insights (top-N pages, p75 web vitals, period-over-period delta)

---

## Feature Landscape

### Category 1: Skill Frequency (closes ACTV-04 TopSkills panel)

User question this answers: *"Which skills did I invoke most this week, and where?"*

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Top-N skills ranked by invocation count | Datadog "Top Operations" tile, Vercel "Top Pages" — universal pattern in any catalog dashboard. Table feels broken without it. | LOW | Reuse existing per-tool latency panel pattern. Sort by count desc, show top 10, "see all" link. Default range: last 7 days (matches v1.0 14-day token charts cadence). |
| Range toggle (24h / 7d / 14d / 30d) | Vercel Analytics, Datadog Service Catalog all gate by time. Same skill can be #1 today but invisible last month. | LOW | Match existing token-chart cadences. Persist selection in localStorage like other panels. Default 7d. |
| Skill name + count + sparkline | Vercel "Top Pages" and Datadog Top Endpoints both show inline sparkline. Trend on the same row makes ranking actionable. | MEDIUM | 14-day sparkline per row. Reuse Recharts/visx primitive already in v1.0 token charts. |
| Click-row drill-in to skill detail | Linear, Datadog, Honeycomb — all rows in a Top-N are interactive. A non-clickable row violates dashboard expectations. | LOW | Drill target = the existing Skills page filtered by skill_name. Already routed via TanStack file-based routing. |
| Empty/loading/zero-data states | v1.0 SkillCostCard shipped as "placeholder" — that pattern was an explicit defer. Production panels need proper empty copy. | LOW | "No skill invocations in this range" + "Confirm `claude_code.skill_invoked` events arriving" hint. |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-project breakdown inside each skill row | Datadog scopes per `env`/`service` — Mission Control's analog is `cwd`. "Did I use git-helper in personal projects or only at work?" is the question only this scope can answer. | MEDIUM | Expandable row showing top 3 projects by invocation. Reuse existing project-breakdown panel join logic (display_path normalisation). |
| Delta vs previous period (▲ +24% / ▼ −8%) | Vercel Speed Insights, Datadog "Compare to last week" — period-over-period delta turns a static count into a signal. Without it, the user has to remember last week's number. | MEDIUM | Compute previousValue from the same window shifted back. Honeycomb pattern. Color: green for "more usage" is neutral, red only for cost-context cards. |
| "New this week" / "Dormant" badges | Datadog Watchdog highlights newly-emerging signals. For a solo developer, "I started using `code-review` skill last Tuesday" is genuinely useful provenance. | MEDIUM | First-seen / last-seen timestamps already trivial from event_log. Badge on row. |
| Co-occurrence: "Often invoked alongside…" | Langfuse trace-grouping pattern. Sessions where `skill A` fires often fire `skill B` — surfaces de-facto pipelines. | HIGH | Requires session-level join (which skills fired in same session_id). High value but high effort — defer to v1.2 unless cheap. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Skill leaderboard across users" | Cargo-culted from team SaaS dashboards | Single-user tool by design (PROJECT.md "Out of Scope"). Adds schema complexity and zero value. | Don't build. Per-project breakdown is the legitimate scope axis. |
| Real-time auto-refresh under 30s | "Live dashboard" reflex | Skill invocation isn't a metric you watch tick-by-tick — it's reviewed hourly/daily. Fast polling burns battery and adds load. | 30s polling matches v1.0 lockstep. Manual "refresh" affordance via Cmd+K. |
| Charts of every possible cut (skill × hour × project × model) | Maximalism ("more is better") | Datadog learned this — explorers go to the explorer (firehose / Activity page), tiles show one strong signal. | Top-N panel does Top-N. Drill-in handles further cuts. Don't overload the tile. |

---

### Category 2: Skill Cost (closes SKLP-02 SkillCostCard)

User question this answers: *"Which skill cost the most this week — in tokens AND in dollars?"*

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tokens AND dollars (not one or the other) | Langfuse `langfuse_cost_usd` + `langfuse_total_units` are first-class side-by-side. Showing tokens alone is a "you do the math" foot-gun; showing dollars without tokens hides cache discipline. | LOW | Two columns per row: total_tokens, est_cost_usd. Compute on read using ANLYT-01 pricing math. |
| Input vs output token split | Langfuse `inputUsage`/`outputUsage` — output tokens cost ~5× input on Claude. Aggregate "total tokens" hides the asymmetry that drives cost. | LOW | Stacked bar or two-column display. Match v1.0 token-by-model panel's stacking convention. |
| Cache-hit context (cache_read tokens called out) | Anthropic-specific — cache reads are ~10% the price of input tokens. v1.0 already exposes cache hit rate panel. Cost panel without cache awareness will mislead. | MEDIUM | Use existing token_usage table cache columns. Show cache savings as a sub-line ("$X saved via cache"). |
| Per-day trend (last 14 days) | Vercel/Datadog/Langfuse all chart cost over time. A static total invites "is this normal?" with no answer. | MEDIUM | 14-day sparkline per skill, matching v1.0 token-charts cadence. |
| "Confidence: estimate" disclaimer | Pricing math is local — model prices can change, prompt caching has subtleties. Datadog Cloud Cost is explicit about "allocated_spend_type" being inferred. Honesty here matters. | LOW | Footer caveat: "Estimates based on published model pricing as of {date}. Actual billing may differ." |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cost per invocation (not just total) | "Skill A cost $5 because it fired 1000 times cheaply; Skill B cost $5 because it fired 5 times expensively" — totally different optimisation signals. Datadog APM shows latency-per-request not just total. | LOW | Trivial division: total_cost / count. Render as second column. |
| Cost per session (skill efficiency) | Helps identify which skills are heavyweight per use. Langfuse trace-cost analysis pattern. | MEDIUM | Group by session_id, average. Useful when session_id is the natural unit. |
| Model breakdown per skill | A skill that ran on Sonnet vs Haiku has 5× cost difference. v1.0 already has model dimension on token_usage. | LOW | Show model badge inline (sonnet/haiku/opus chip from existing design system). |
| Forecast / "On track for $X this month" | Vercel billing pattern. For a solo dev paying out-of-pocket, the projected end-of-month spend is the actual emotional signal. | MEDIUM | Linear extrapolation from MTD. Show as KPI strip addition. Caveat label. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hard $ budget caps that block invocation | "Stop me from overspending" reflex | Mission Control is observability + dispatcher gate, not a billing intercept. Killing a running session because of a soft budget is destructive UX, and Anthropic enforces real limits server-side anyway. | Cost-based ALERT (Category 5) → Telegram + decisions queue. User decides. |
| Currency switcher | "International users" | Single user. USD only — all Anthropic pricing is published USD. | Don't build. |
| Per-skill cost optimisation suggestions ("use Haiku instead") | "AI-driven recommendations" | Suggestion quality is poor without per-skill quality eval, and quality eval is out of scope for v1.1. | Show the data (model breakdown). Let the user decide. |
| Cost history beyond 90 days in the panel | Datadog/Vercel keep deep history in dedicated reports | A panel is a glance surface. Beyond 30 days, performance and visual density both degrade. | 30-day max in panel; Activity page can show longer if ever needed. |

---

### Category 3: Skill Latency + Error Rate

User question this answers: *"Which skill is slow or failing more than usual?"*

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| p50 / p95 / max latency (not just average) | Datadog APM: "throughput, latency percentile distributions, and error rates" is the canonical service-row triple. Average is a known anti-pattern in latency. v1.0 per-tool panel already does this — skill panel must match. | MEDIUM | Reuse "Pattern 4" percentile calc from v1.0 OPNL-08. Same SQL window function logic. |
| Error / failure rate as a percent | Datadog: "error rate" is the third leg of every service row. Without it, latency in isolation can't prioritize. | MEDIUM | Definition needs locking: error = explicit `error=true` on `claude_code.skill_invoked` event, or skill present in failed-session result event. Capture decision in PITFALLS.md. |
| Sortable by p95 desc (default) | Datadog APM Services list defaults to p95 desc — "find the slow ones first" is the query. Sorting alphabetically is a strictly worse default. | LOW | Default sort matches per-tool panel convention. |
| Sample-size badge for low-volume skills | v1.0 cache panel already implemented "<10K billable tokens → low-sample badge". Same discipline applies — p95 of n=3 is meaningless. | LOW | Badge below 50 samples in window. Reuse v1.0 badge component. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sparkline of p95 over time (not just current value) | Honeycomb / Datadog all show inline trend. Current p95 = 2.3s could mean "stable" or "spiking now"; the sparkline disambiguates instantly. | MEDIUM | Reuse v1.0 inline-sparkline primitive. |
| Error-rate change vs previous period | Watchdog-style "was 0.5%, now 4.2% (▲ 8x)" is the actual signal worth alerting on. | MEDIUM | Same delta calc as Category 1. Drives Category 5 alerts. |
| Latency histogram on drill-in | Honeycomb's heatmap-on-drill pattern. p95 is a summary; the distribution shows whether you have a long tail or a bimodal cluster. | HIGH | Defer unless cheap. Recharts has histogram support. Most users won't drill this deep at v1.1; can ship without and add later if needed. |
| First-failure / last-failure timestamps | "Started failing at 14:23" on a row is more actionable than "4.2% errors". Linear-style metadata-on-row treatment. | LOW | Two timestamp columns. Cheap given existing event_log. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| SLO / error budget tracking | Honeycomb / Datadog SLO products | SLOs assume traffic patterns and team contracts that don't exist for a solo dev's local skills. Adds a config layer with no payoff. | Threshold alerts (Category 5) cover the legitimate part of this. |
| Auto-pause skills exceeding error rate | "Smart" reflex | Same problem as cost caps — destroys data and surprises the user. Autonomy gate already covers explicit deny. | Alert into decisions queue. User decides. |
| Latency by tool inside a skill (skill × tool matrix) | Maximalism | A skill IS a composition of tool calls; this cross-product explodes the panel without a clear user question. | Drill-in to skill detail, then existing per-tool latency table is right there. |

---

### Category 4: Skill Timeline / Event Firehose

User question this answers: *"What just happened? Which skill fired in which project, in what order?"*

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Live stream of recent skill invocations | v1.0 already ships OTEL firehose (ACTV-03) with SSE. Skills firehose is the same primitive scoped to `claude_code.skill_invoked`. Anything less feels like a regression. | MEDIUM | Reuse `useFirehose` hook + per-router SSE helper. New filter mode `event.name=claude_code.skill_invoked`. |
| Project / session / cwd context per row | Datadog APM live trace stream shows service+endpoint+latency per row. Naked event rows are useless without locating context. | LOW | Event payload already carries cwd + session_id. Render as inline chips. |
| Pause / resume button | OTEL firehose already has this. Reading a stream that never pauses is impossible. | LOW | Reuse v1.0 pause primitive. |
| Filter by skill name + by project | Datadog log explorer convention. A firehose without filters becomes a wall of noise within a day of usage. | MEDIUM | Free-text filter + project chip filter. Match v1.0 firehose UX. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Click-row → jump to session drawer | v1.0 already has the session detail drawer. Threading the firehose into existing drill paths makes both more valuable. | LOW | TanStack Router navigation. Cheap. |
| Inline cost-per-event ("$0.04, 1.2K tokens") | Vercel deployment logs show cost-per-invocation inline. Lets the firehose double as a real-time cost ticker without a separate panel. | MEDIUM | Compute on write to event_log or join with token_usage on read. |
| Auto-collapse repeated events ("×7 in 4s") | Linear notification grouping pattern. A burst of identical skill calls shouldn't fill the visible viewport. | MEDIUM | Client-side dedupe with a rolling 4s window. |
| Compact / expanded mode toggle | v1.0 OTEL firehose already has expand/collapse JSON. Same affordance keeps this consistent. | LOW | Reuse component. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Persistent search across all-time skill events | "Searchable history" reflex | Sessions table (ACTV-06) already paginates events by session — that's the search interface. Firehose is by definition recent + ephemeral. | Use the existing sessions table for historical search. |
| Color-coded severity levels (info/warn/error) | Logs-style reflex | Skill events aren't logs — they're data points. Severity badges add visual noise without a real taxonomy. | Error badge on failed events only. Keep uniform otherwise. |
| Attaching arbitrary metadata to events | "Custom tagging" reflex | OTEL events are immutable telemetry. Augmenting them post-hoc is a separate annotations feature, not a firehose feature. | Annotations could be a v1.2 feature if there's demand. Don't shoehorn here. |

---

### Category 5: Skill-Level Alerts (anomaly + threshold)

User question this answers: *"Tell me when a skill starts failing more than usual, OR costing more than X, OR running slower than Y — without me having to check."*

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Threshold alerts (cost > $X / day, error rate > Y%) | Datadog "monitors" 101. The simplest form of alerting and the easiest to get right. Every observability tool ships this on day one. | MEDIUM | Periodic evaluator (every 5min, runs in dispatcher heartbeat). Compares window aggregate to user-configured threshold. |
| Telegram delivery (existing bridge) | v1.0 Telegram bridge is the single notification channel. Adding alerts without using it would be a system inconsistency. | LOW | Reuse `notifier.py` + plain-text format (Pitfall P3). New alert type added to existing `notification_log` table. |
| Decisions queue entry per alert | v1.0 decisions queue is the canonical "needs human attention" surface. Telegram is push, dashboard queue is pull — both must fire. | MEDIUM | Insert into decisions table with a new `kind=alert` discriminator. Approve/Reject/Snooze parity with existing flow (Phase 10 callback parity in v1.0). |
| Alert dedup / cooldown | Without cooldown, a single sustained anomaly fires every 5min for hours = pager fatigue. Datadog's `alert_window` + `interval` enforce this. | MEDIUM | Per-alert cooldown timestamp in alert config. Default 1h. Snooze callback extends cooldown. |
| Configure-via-UI (not just config file) | A solo dev tweaks thresholds frequently as they learn the data. Forcing config-file edits adds friction. | MEDIUM | Add an alert composer sheet (mirror schedule composer pattern from v1.0 TPNL-03/04). |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Anomaly detection (not just thresholds) | Datadog Watchdog: "automatically identify unusual patterns in latency, errors, and request volume — eliminates the need for manual threshold configuration". Solo devs don't know what threshold is right; an anomaly detector that fires when "today differs from baseline" is more useful than guessed thresholds. | HIGH | Simple version: rolling 14-day mean + stddev; alert when current window > N stddev. Datadog calls this `basic` algorithm. Avoids the seasonality complexity. |
| Snooze with NL duration ("snooze 2h") | v1.0 already has NL-cron via Haiku. Same pattern works for snooze. Telegram callback "Snooze 1h / 4h / 24h" already shipped. | LOW | Three preset durations as inline buttons (already pattern). NL parsing optional. |
| "Alert preview" — fire the message without triggering | Linear / Sentry pattern. Lets the user verify the Telegram template renders correctly before committing. | LOW | "Send test" button in composer. |
| Alert history view (last 30 fires + outcome) | Datadog monitor history. Crucial for tuning thresholds — without it, the user can't tell if an alert is too noisy or too quiet. | MEDIUM | Reuse `notification_log` + new "Alerts" tab on Activity page. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Email / SMS / Slack delivery | "Multi-channel notifications" reflex | Mission Control ships exactly one channel: Telegram. Multi-channel = multi-config, multi-failure-mode, multi-rate-limit. Out of scope for single-user local tool. | Telegram only. Decisions queue is the second surface. |
| Alert dependencies / rule chaining ("if A fires AND B fires…") | Datadog composite monitors | Composite logic is genuinely useful at scale, but solo dev with <50 skills doesn't have the cardinality to need it. Adds UI and config burden. | Per-skill alerts only. Rule chaining can come at v1.2 if signal warrants. |
| Auto-remediation runbooks | "Self-healing" reflex | Killing/throttling is destructive; the autonomy gate already covers blanket deny. Mission Control delegates remediation to the human in HITL — that's its identity. | Alert → decisions queue → user approves a follow-up task. |
| Per-skill custom message templates | "Personalisation" reflex | Plain-text Telegram messages (Pitfall P3) constrain templating anyway. Configurability here trades clarity for flexibility. | Single message format with skill name + metric + value + threshold. Done. |

---

### Category 6: Session Comparison

User question this answers: *"How did session A differ from session B in skills used, cost, and outcome?"*

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Two-up side-by-side layout | Langfuse shipped exactly this in Nov 2025 ("Side-by-Side Comparison"). The mental model of "diff" requires two columns. A tabbed view doesn't read as comparison. | MEDIUM | Two-column page (or modal). Both sessions selected via Cmd+K or sessions-table action. |
| Skill-set diff (in A only / in B only / in both) | The fundamental question. Without this, you've just opened two session drawers next to each other. | MEDIUM | Set difference computed client-side from already-loaded session-event data. |
| Token / cost delta (A vs B with absolute and %) | Langfuse "Compare prompts" baseline-vs-candidate pattern. Without numerical delta the visual comparison is anecdotal. | LOW | Two scalars + delta. Reuse cost pricing math from ANLYT-01. |
| Outcome row (ok / errored / rate_limited / truncated) | v1.0 already classifies session outcomes (OPNL-07). The comparison must surface this — sessions that differ in skill usage but converged to "ok" tell a different story than divergent outcomes. | LOW | Read from existing outcome classification. Reuse outcome chip from v1.0. |
| Selection UX from sessions table | Langfuse: "Click any row in the comparison view". v1.0 sessions table (ACTV-06) needs an action menu / multi-select to feed comparison. | MEDIUM | Add "Compare with…" action on session row → triggers picker for the second session. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-skill latency delta (slower/faster) | Comparing the same skill across two sessions is where the signal lives. "skill X took 2s in session A but 8s in session B" is the actual debug payload. | MEDIUM | Per-skill p50 from each session's events. Render side-by-side. |
| Tool-call sequence diff (timeline alignment) | Honeycomb trace comparison shows aligned timelines. For agent sessions specifically, "the order of operations differed" is a primary signal. | HIGH | Aligned vertical timelines with diff coloring. Significantly more work. Defer unless cheap. |
| Pre-set comparison: "today's session vs yesterday's same task" | Langfuse "baseline vs candidate" idiom. For repeatable scheduled tasks, comparing the latest run against the previous is the natural workflow. | MEDIUM | Look up by schedule_id parent, fetch latest two runs. Adds value for scheduled tasks specifically. |
| Cmd+K "compare two sessions" action | v1.0 Cmd+K palette is the canonical entry point. A power-user shortcut elevates this from "occasional UI flow" to "muscle-memory tool". | LOW | Add palette action that opens picker. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 3+ way comparison | "Why limit to 2?" | The page layout of N-way comparison fundamentally degrades — Linear, Honeycomb, Langfuse all stop at 2 for this reason. Visual density collapses. | Pairwise only. Run multiple pairs if needed. |
| Auto-suggest comparisons | "Smart" reflex | Suggestions need context the dashboard doesn't have ("which two sessions matter to me right now"). Adds suggestion quality work without payoff. | User picks. |
| Saved comparisons | "Bookmarks" reflex | Sessions are point-in-time snapshots. Saving a comparison creates a stale artifact. Schedules already give you "rerun this regularly" capability. | URL state is sufficient (encode session-A and session-B in URL params for shareability). |
| Diff of LLM message contents | "Show me the prompts" reflex | Sessions can carry sensitive data; rendering raw user/assistant turns side-by-side is a privacy + performance footgun. v1.0 already has session detail drawer — that's where message content lives. | Compare metadata (skills, cost, outcome). Drawers handle content. |

---

### Category 7: Cost Estimation Foundation (ANLYT-01)

User question this answers: *"How do we compute dollar amounts consistently from token counts everywhere they're shown?"*

This is infrastructure, not a panel — it's the math + table reused by SkillCostCard, future cost panels, alerts, comparison view, and the KPI strip. Treating it as a "feature" prevents copy-paste pricing logic.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pricing table per (model, token_type) | Anthropic publishes prices per model × per (input / output / cache_read / cache_creation). Hard-coded numbers will drift; a table makes updates one diff. | LOW | New `model_pricing` table (model, input_per_mtoken, output_per_mtoken, cache_read_per_mtoken, cache_creation_per_mtoken, effective_from). Alembic migration. |
| Single `compute_cost(usage)` function | DRY principle. Five places reading prices = five places to break when a model is added. | LOW | Pure function in `cmc/cost/pricing.py`. Pass token_usage row, return dollars. Unit-tested with golden fixtures. |
| Effective-date awareness | Prices change. A computation done today over yesterday's data should use yesterday's price (audit-trail honesty). Datadog Cloud Cost is explicit about this. | MEDIUM | `effective_from` lookup by event timestamp. Alternatively, denormalize cost into token_usage at write time (locks in price). |
| Sensible defaults shipped in seed data | Out-of-the-box install must show reasonable USD numbers. A blank pricing table = $0 everywhere = "the panel is broken" reaction. | LOW | Migration includes seed for sonnet, haiku, opus current pricing as of v1.1 ship date. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pricing override via config (not just DB edit) | Power user with custom Anthropic pricing tier (rare but exists). Settings-level override avoids DB editing for these users. | LOW | Optional `MODEL_PRICING_OVERRIDES` env var (JSON map). |
| Cost-as-of-now vs cost-at-the-time view | "What did this session actually cost when it ran?" vs "What would it cost at today's prices?" — both are legitimate questions. | MEDIUM | Two views in API, default to "as-of-time" everywhere except billing-forecast. |
| `cmc doctor` check for stale pricing | A pricing table that's 6 months old silently produces wrong numbers. Doctor check that warns "model_pricing.effective_from > 90 days ago" closes the loop. | LOW | Add to existing `doctor.py`. Reuses existing readiness pattern. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-fetch latest prices from Anthropic | "Stay current automatically" | Anthropic doesn't expose a stable price API; scraping is fragile and out-of-band traffic violates the privacy-first / localhost-only stance. | Manual update via migration + doctor warning when stale. Honest. |
| Per-user cost attribution | "Multi-tenant ready" | Single user. Don't introduce dimensions there's no user for. | Skill / session / project are the real dimensions. |
| Cost in the firehose, async-computed by a worker | "Microservice" reflex | At single-user scale, computing cost on read for the visible window is < 5ms. A worker adds eventual-consistency surprises. | Synchronous read-time computation. Cache the function result if profiling demands it. |

---

## Feature Dependencies

```
Category 7 (Cost Estimation Foundation)
    ├──enables──> Category 2 (Skill Cost panel)
    ├──enables──> Category 5 (Cost-threshold alerts)
    ├──enables──> Category 6 (Session comparison cost delta)
    └──enables──> Category 4 (Inline cost-per-event in firehose)

Spike: claude_code.skill_invoked event verification (REQUIREMENTS prerequisite)
    └──gates──> ALL skill panels (Cat 1, 2, 3, 4, 5)
                Without this event landing in event_log, every skill panel is impossible.

Category 1 (Skill Frequency)
    └──enhances──> Category 5 (anomaly baseline = "frequency you usually see")

Category 3 (Skill Latency + Error Rate)
    └──enables──> Category 5 (latency / error-rate threshold alerts)

Category 4 (Skill Timeline / Firehose)
    └──enhances──> Category 6 (drill from comparison row to live event context)

Existing v1.0 infrastructure REUSED (not rebuilt):
    event_log + OTEL ingest        ──supports──> Cat 1, 2, 3, 4
    SSE firehose + useFirehose     ──supports──> Cat 4
    Sessions table (ACTV-06)       ──supports──> Cat 6 (selection UX)
    Decisions queue (HPNL-01)      ──supports──> Cat 5
    Telegram bridge + notifier     ──supports──> Cat 5
    Schedule composer pattern      ──supports──> Cat 5 (alert composer mirrors)
    Cmd+K palette                  ──supports──> Cat 6 (compare action)
    Per-tool latency Pattern 4     ──supports──> Cat 3 (percentile SQL)
    Cache hit-rate panel logic     ──supports──> Cat 2 (cache-aware cost)
    KPI strip + delta-vs-prev      ──supports──> Cat 1, 2 (period delta)
```

### Dependency Notes

- **Spike on `claude_code.skill_invoked` is the milestone gate.** PROJECT.md is explicit — both ACTV-04 and SKLP-02 were deferred at v1.0 specifically because this OTEL event wasn't landing in the ingest pipeline. Until verified, every skill panel in this milestone is theoretical. The roadmap MUST sequence the spike before any panel work.
- **Category 7 is the bottleneck for cost-related categories.** Building SkillCostCard before the pricing math means rebuilding it. Building cost alerts before pricing math means hard-coding numbers in two places.
- **Categories 1–4 are independently shippable** once the spike clears. They can ship in parallel.
- **Category 5 (Alerts) requires data from 1, 2, 3** to have something to alert on. It is logically last.
- **Category 6 (Comparison) is independently shippable** — only needs existing session/event data + Cat 7 for cost delta.

---

## MVP Definition

### Launch With (v1.1)

Minimum viable milestone — what's needed to credibly close the deferred panels and ship the headline value.

- [x] **Spike: verify `claude_code.skill_invoked` ingest** — Gate everything. Without it, the milestone is impossible.
- [ ] **Category 7: Cost estimation foundation** — Pricing table, `compute_cost()` function, seed data, doctor check. Infrastructure for everything else.
- [ ] **Category 1: Top skills panel (table stakes only)** — Top-N by count with sparkline + range toggle + drill-in. Closes ACTV-04.
- [ ] **Category 2: Skill cost card (table stakes only)** — Tokens + dollars + input/output split + cache context + 14-day trend + estimate disclaimer. Closes SKLP-02.
- [ ] **Category 3: Per-skill latency + error rate (table stakes only)** — p50/p95/max + error % + sample-size badge + sortable. Mirrors v1.0 per-tool panel.
- [ ] **Category 4: Skill timeline / firehose (table stakes only)** — SSE stream filtered to skill events + project context + filters + pause. Reuses v1.0 firehose primitive.
- [ ] **Category 5: Skill-level alerts (table stakes only)** — Threshold alerts (cost / error rate / latency), Telegram + decisions queue delivery, alert composer UI, dedup/cooldown.
- [ ] **Category 6: Session comparison (table stakes only)** — Two-up layout, skill-set diff, token/cost delta, outcome row, sessions-table selection action.

### Add After Validation (v1.2)

Differentiator-tier features once core panels prove out and patterns settle.

- [ ] **Cat 1 differentiators:** Per-project breakdown in row, period-over-period delta, "new this week" / "dormant" badges
- [ ] **Cat 2 differentiators:** Cost per invocation, model breakdown per skill, monthly forecast
- [ ] **Cat 3 differentiators:** p95 sparkline per row, error-rate change, first/last failure timestamps
- [ ] **Cat 4 differentiators:** Click-to-session-drawer, inline cost-per-event, repeated-event auto-collapse
- [ ] **Cat 5 differentiator:** Anomaly detection (rolling mean ± stddev "basic" algorithm)
- [ ] **Cat 6 differentiator:** Per-skill latency delta + Cmd+K compare action
- [ ] **Cat 7 differentiator:** Pricing override via config + as-of-now / as-of-time toggle

### Future Consideration (v1.3+)

- [ ] Co-occurrence ("often invoked alongside") — needs more session data and clear user demand
- [ ] Latency histogram on drill-in — high effort, low likelihood of frequent use
- [ ] Tool-call sequence timeline alignment in comparison — nice to have, complex
- [ ] Alert history dashboard tab — useful once user has a corpus of alert fires to learn from
- [ ] Pre-set "today vs yesterday for this schedule" comparison — depends on user actually using scheduled tasks heavily

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Spike: verify `claude_code.skill_invoked` event | HIGH (gate) | LOW | P0 |
| Cat 7: Cost estimation foundation (pricing math) | HIGH | LOW | P0 |
| Cat 1: Top skills panel (closes ACTV-04 placeholder) | HIGH | MEDIUM | P1 |
| Cat 2: Skill cost card (closes SKLP-02 placeholder) | HIGH | MEDIUM | P1 |
| Cat 3: Per-skill latency + error rate | HIGH | MEDIUM | P1 |
| Cat 4: Skill timeline / firehose | MEDIUM | LOW (reuse) | P1 |
| Cat 5: Threshold alerts → Telegram + decisions | HIGH | MEDIUM | P1 |
| Cat 6: Session comparison view | MEDIUM | MEDIUM | P1 |
| Cat 1 differentiators (delta, badges, per-project) | MEDIUM | MEDIUM | P2 |
| Cat 2 differentiators (per-invocation, forecast) | MEDIUM | LOW | P2 |
| Cat 3 differentiators (sparkline, delta) | MEDIUM | MEDIUM | P2 |
| Cat 5 anomaly detection (rolling mean ± stddev) | MEDIUM | HIGH | P2 |
| Cat 6 differentiators (latency delta, Cmd+K) | LOW | LOW | P3 |
| Cat 4 inline cost-per-event in firehose | LOW | MEDIUM | P3 |
| Co-occurrence / sequence diff / latency histogram | LOW | HIGH | P3 |

**Priority key:**
- **P0:** Gate / blocker — must land first or nothing else works
- **P1:** Must have to credibly ship v1.1 ("closes deferred panels", headline alerts + comparison)
- **P2:** Should have, add when possible — differentiators that make the milestone feel polished
- **P3:** Nice to have, future consideration — defer to v1.2+ unless trivially cheap

---

## Competitor Feature Analysis

| Feature | Datadog APM | Honeycomb | Langfuse | Vercel | Mission Control v1.1 |
|---------|-------------|-----------|----------|--------|----------------------|
| Top-N entities by count | ✓ Top Endpoints | ✓ via GROUP BY queries | ✓ Top traces / users | ✓ Top Pages | ✓ Top skills (Cat 1) |
| Cost dashboard with token-level math | ✗ (cloud cost only) | ✗ | ✓ first-class | ✗ | ✓ Cat 2 + Cat 7 |
| p50/p95/max latency per entity | ✓ canonical | ✓ canonical | ✓ via observation latency | ✓ Web Vitals p75 | ✓ Cat 3 (mirrors v1.0 per-tool) |
| Live event firehose with filters | ✓ Live Tail | ✓ Trace stream | ✓ Live traces | ✗ | ✓ Cat 4 (reuses v1.0 primitive) |
| Threshold alerts | ✓ Monitors | ✓ Triggers | ✓ via webhook + Slack (limited) | ✓ Spend alerts | ✓ Cat 5 → Telegram + decisions |
| Anomaly detection | ✓ Watchdog | ✓ on heatmap | ✗ | ✗ | Differentiator (Cat 5 v1.2) |
| Side-by-side comparison | ✗ (week-over-week graphs only) | ✓ BubbleUp outliers | ✓ Compare view (Nov 2025) | ✗ | ✓ Cat 6 (Langfuse pattern) |
| Period-over-period delta | ✓ "Compare to last week" | ✓ via queries | ✓ baseline vs candidate | ✓ FCP/LCP delta | Differentiator (Cat 1, 2 v1.2) |
| Telegram delivery | ✗ (PagerDuty / Slack / email) | ✗ | Slack only | Slack/email | ✓ first-class (existing v1.0) |
| HITL approval queue integration | ✗ | ✗ | ✗ | ✗ | ✓ unique (existing v1.0) |
| Single-user / localhost-only privacy | ✗ | ✗ | self-host option | ✗ | ✓ unique stance |

**Mission Control's competitive position:**

What Mission Control gives up vs. SaaS dashboards: cardinality, retention, multi-user team workflows, broad ecosystem integrations. None of those matter for a solo Claude Code developer.

What Mission Control offers that none of them does:
1. **HITL alerts → decisions queue → human approves a follow-up task** — a feedback loop that closes the OODA loop locally without leaving the dashboard.
2. **Telegram-as-pager built in** — no PagerDuty/email config; one bot, three callbacks, done.
3. **Privacy-first telemetry** — your skill usage and cost data never leave the laptop.
4. **Skills as a first-class entity** — Datadog/Honeycomb don't model Claude Code skills; Langfuse models LLM generations but not skill abstraction; Mission Control treats skill as a top-level dimension across cost, latency, frequency, and alerts uniformly.

These four are the milestone's differentiators against the broader market. Within the milestone, every Category should ship in a way that exercises at least one of them.

---

## Anti-Feature Stance Summary

A consolidated list, since downstream consumers (roadmap creator) need to be sure scope is locked:

1. **No multi-user / team / leaderboard features** — single-user tool, full stop.
2. **No hard cost caps that block invocation** — alerts only, user decides.
3. **No auto-pause / auto-remediation on errors** — alerts only, decisions queue handles human action.
4. **No multi-channel notifications** — Telegram + decisions queue only. Not email, not Slack, not SMS.
5. **No 3+ way session comparison** — pairwise only.
6. **No real-time sub-30s polling** — 30s lockstep matches v1.0; firehose is SSE so doesn't poll.
7. **No auto-fetch of model pricing** — manual seed + doctor warning.
8. **No SLO / error budget tracking** — solo dev doesn't have SLO contracts; threshold alerts cover the legitimate part.
9. **No alert message templating per-skill** — single plain-text format.
10. **No saved-comparison bookmarks** — URL state for shareability is enough.
11. **No raw LLM message diff in comparison** — metadata only; existing session drawer handles content.
12. **No 3rd-party annotation / tagging on telemetry events** — events are immutable.

Each of these has a "users will ask for it; we say no because…" answer above. If a roadmap phase proposes any of these, it's a scope break.

---

## Sources

- **Datadog APM:** Service Catalog (`/datadog/documentation`), Watchdog anomaly detection, Cloud Cost Allocation tag-pipelines, Anomaly Monitor query format. HIGH confidence (canonical patterns).
- **Honeycomb:** BubbleUp outlier identification, multi-service SLO heatmap drilldown, query-builder filtering. HIGH confidence (Context7 official docs).
- **Langfuse:** Custom dashboards (May 2025 launch), Cost Optimization Dashboard pattern, Side-by-Side Comparison (Nov 2025 baseline-vs-candidate), `/api/public/metrics/daily` shape, `langfuse_cost_usd` event schema. HIGH confidence (Context7 official docs).
- **Vercel:** Web Analytics top-pages, Speed Insights p75 + previousValue delta pattern, web vitals dashboard ergonomics. MEDIUM confidence (relevant patterns, less detail in docs).
- **Mission Control v1.0:** PROJECT.md, REQUIREMENTS verified at v1.0 audit, codebase analysis (`STRUCTURE.md`, `INTEGRATIONS.md`). HIGH confidence (canonical existing infrastructure).

---

*Feature research for: Claude Mission Control v1.1 Skills & Cost Intelligence*
*Researched: 2026-05-02*
