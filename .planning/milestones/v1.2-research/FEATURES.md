# Feature Research — v1.2 Depth & Polish

**Domain:** Local-only single-user observability dashboard for Claude Code agent sessions (depth-pass on existing v1.1 lanes — Skills, Cost, Alerts, Compare).
**Researched:** 2026-05-05
**Confidence:** HIGH (most patterns map directly to documented Datadog / Honeycomb / Langfuse / Grafana behaviour; LOW only on NL-rule grammar edge cases since no other observability tool ships this exact feature today).

---

## Scope Note

v1.2 is a **depth pass** — no new lanes, no new product surfaces. Every item in the carried backlog (SKLP-08..11, ANLY-06..07, ALRT-13..14, CMPR-06..07) extends an existing v1.1 component. This document categorises each item as **table stakes** (v1.2 feels broken without it), **differentiator** (ship if time allows; sets us above generic LLM observability tools), or **anti-feature** (do NOT include — locked out of scope).

The bar across the board: Linear / Raycast / Vercel-level density, dark theme, dialled-in typography, tasteful motion, dense signal. v1.2 is about making the existing four lanes feel *finished*, not adding lanes.

---

## Feature Landscape

### Table Stakes (v1.2 Feels Broken Without These)

These ten backlog items are all backlog — by definition the user expects them after using v1.1 for one cycle. Each ties to a v1.1 surface that already exists.

| Feature | Why Expected | Complexity | v1.1 Dependency |
|---------|--------------|------------|-----------------|
| **SKLP-08 per-project skill breakdown** (which projects use which skills + cost/latency by project) | The existing per-skill detail route `/skills/$name` already shows total cost and latency. Solo dev owns N projects; the obvious next question after "how much did `code-reviewer` cost?" is "how much in *which* project?" Cost lane already breaks down by project at `/api/cost/breakdown?dim=project`; skills lane has a parallel gap. | MEDIUM | New SQL helper (mirror `_BREAKDOWN_BY_SKILL_SQL` in `cmc/api/routes/cost.py:147` joining skill_activated → sessions.cwd). New panel on `/skills/$name` route. |
| **SKLP-09 period-over-period deltas** (7d-vs-prev-7d, 30d-vs-prev-30d for skill cost & invocations) | Every modern SaaS dashboard (Linear, Vercel Analytics, Stripe) shows "$X (+12% vs last week)" pills. Without it, the user can't tell if a skill's cost is climbing or flat. The existing SkillCostCard shows total + sparkline; sparkline alone doesn't communicate delta direction or magnitude at a glance. | MEDIUM | Two queries to existing `_USAGE_TOP_SQL` / `_COST_*_SQL` (current window + previous window). New `DeltaPill` shadcn component (mini sparkline + signed % + colour). Reused on TopSkills, SkillCostCard, per-skill detail. |
| **SKLP-10 "new this week" / "dormant" badges** | Discovery problem: with 20+ skills installed, the user can't see at a glance which are emerging vs. retiring. Linear / GitHub / Slack all use "New" + age badges. Trivial UX surface; high signal for a solo dev curating their own skill library. | LOW | Single SQL query (MIN(ts) per skill_name from otel_events, MAX(ts) per skill_name). Badge component already exists in shadcn registry. Read-time, no schema change. |
| **SKLP-11 per-skill latency overhead breakdown** (skill body vs subagent vs tool calls) | The existing SkillLatencyTable shows p50/p95/max but the user can't tell *where* the latency lives — "is `tdd-coverage-author` slow because the skill body iterates, or because it spawns 8 subagents, or because it does 40 Read tool calls?" This is the core observability question; without breakdown the latency table is descriptive but not actionable. Datadog flame graphs solve the analogous problem for distributed traces. | LARGE | New SQL on otel_events filtering by attrs_skill_name + nested span structure (skill_activated → tool_call_*, subagent_spawn). Likely needs a derived view. New stacked bar component (or horizontal bar with three segments). |
| **ANLY-06 monthly cost forecast** (linear extrapolation of run-rate to month-end) | AWS Cost Explorer, GCP Billing, Vercel Usage all show "projected month total" prominently. The existing CostSummary shows "$X this 7d" but the user has to do mental math for "what's June going to cost?" Solo dev cares about month-end because that's the credit-card statement boundary. | SMALL | Pure read-time math against existing token_usage rollup. New panel on existing cost dashboard route. No new SQL beyond what `/api/cost/summary?range=30d` already returns + a date-arithmetic helper. |
| **ANLY-07 per-project cost breakdown card** (cost by cwd over 7d/30d) | The endpoint *already exists* (`/api/cost/breakdown?dim=project` — see `cmc/api/routes/cost.py:166`) but no panel renders it. The skill lane has TopSkills; the cost lane needs the equivalent "Top Projects" panel. Without it, the user has data but can't see it. | SMALL | UI only — endpoint already shipped. New TopProjects shadcn panel mirroring TopSkills layout. |
| **ALRT-13 full anomaly detection** (rolling mean ± N stddev, extends existing EWMA z-score) | The existing alert engine catches absolute-threshold breaches and EWMA z-score outliers. Rolling mean ± stddev catches a different failure mode: gradual drift where each step is within EWMA tolerance but the whole window has shifted. Datadog ships three anomaly algorithms (basic / agile / robust) for exactly this reason. v1.1 has one; v1.2 needs at least two. | MEDIUM | Extends `cmc/alerts/detector.py`. Reuses the same hysteresis machinery (Phase 17). New AlertRule type + scope. |
| **ALRT-14 NL-authored alert rules via Haiku** ("alert me when haiku skill p95 latency exceeds 5s for 10 minutes" → AlertRule JSON) | The alert system has full primitives but the JSON schema is intimidating for ad-hoc rules. NL authoring is increasingly table-stakes after Grafana 12.2 (LLM-powered SQL expressions) and Grafana Assistant for alert creation shipped in 2025. For a solo dev who already trusts Claude as a tool, this is the natural authoring surface. | MEDIUM | New backend route `POST /api/alerts/rules/from_nl` calling Haiku with structured-output prompt → AlertRule schema. New Cmd+K action + modal. Validates the parsed rule against the existing AlertRule pydantic model before persistence. |
| **CMPR-06 per-skill latency delta in compare view** | The existing two-up compare at `/sessions/compare?a=&b=` shows skill-set diff and tool-counts but NOT per-skill latency delta. After using compare once, the user immediately wants "ok, both sessions used `code-reviewer` — was it slower in B?" Without it, compare is half-built. | MEDIUM | Reuses `/api/skills/{name}/latency` per-session-scoped (need to add `?session_id=` filter). New row in compare table mirroring the existing tool-count diff row. |
| **CMPR-07 Cmd+K "compare with previous session"** | The existing compare flow requires the user to know two session IDs. The most common comparison ("did this run get slower than the last one?") needs zero IDs. Linear, Vercel deployments, GitHub Actions all default to "compare with previous run." Without it, compare is gated on the user remembering session IDs. | SMALL | New Cmd+K action + new backend helper `GET /api/sessions/{id}/previous` (most-recent-completed before current). Routes to existing compare view. |

### Differentiators (Ship If Time — Sets v1.2 Above Generic LLM Observability)

These extend the table-stakes items into truly polished surfaces. None are required for v1.2 to feel finished, but together they're what makes the dashboard feel Linear/Raycast-tier.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **SKLP-08 secondary heatmap mode** (project × skill matrix; cell colour = cost intensity) | Table is the right primary view, but a tab-toggle to a heatmap shows usage *patterns* — "this skill is concentrated in the work project, that one is spread across all five." Honeycomb's BubbleUp + Datadog's heatmap widget both validate the pattern for high-cardinality dimensions. | MEDIUM | Same data as the table; new `HeatmapView` shadcn component. Tab control (table | heatmap) on the per-project breakdown panel. |
| **SKLP-09 sticky reference-period selector** (compare 7d vs prev-7d *or* compare 7d vs 7d-from-30d-ago) | The default rolling-7d-vs-prev-7d catches week-on-week drift. A sticky reference period catches "is this week worse than my best week in the last month?" which is the more interesting question for a solo dev iterating on skills. | MEDIUM | Adds a second `?ref_range=` query param on the underlying delta endpoints. Dropdown in DeltaPill component. |
| **SKLP-10 dormancy reactivation hint** (when a dormant skill fires, auto-clear the badge + emit a one-time toast "skill X reactivated") | Discovery surface for the inverse case — a skill came back from the dead. Costs nothing extra to implement once the dormancy badge data path exists. Removes a class of "huh, when did that come back?" puzzlement. | LOW | Toast on skill_activated event when prior MAX(ts) was >30d. Reuse existing toast plumbing. |
| **SKLP-11 percentile breakdown view** (per-skill, p50/p95 split into body/subagent/tool segments separately) | Showing the breakdown for *just* p95 separately from *just* p50 surfaces "this skill is fast on average but the slow tail is dominated by subagent spawns" — the actionable insight that drives optimisation. Datadog distinguishes mean-flame from p99-flame for this reason. | LARGE | Adds a percentile-tabbed control. Two queries (one for p50-set, one for p95-set), then breakdown computation on each subset. |
| **ANLY-06 confidence band on forecast** (shaded ± stddev around the projected line) | Linear extrapolation alone is misleading on partial-month data — the first 3 days of the month have 10× the variance of days 20-25. A shaded band visually defangs the false-precision problem. AWS Cost Explorer ships this; Vercel doesn't. Differentiator if we do it right. | MEDIUM | Add stddev computation against the daily token_usage series; shaded path component on the forecast line chart. |
| **ANLY-06 partial-month bias correction** (suppress forecast or show "low confidence" banner on month days 1-3) | Day-of-month bias is real: a $20 day-1 burst extrapolated linearly says $600/month. Showing the projection anyway erodes trust. A banner ("forecast confidence low — only 2 days of data this period") is honest and Linear-tier polish. | LOW | Pure UI logic in the forecast panel. Compute days_observed in current month; if ≤3, swap line for "insufficient data" state. |
| **ANLY-07 sortable column set** (cost, tokens, sessions, top-skill-in-this-project, last-active) | Beyond the basic cwd × cost table, surfacing "most expensive skill in this project" as a column makes the breakdown a navigation surface (click-through to skill detail) rather than just a leaderboard. | MEDIUM | Joins skill breakdown SQL into the project breakdown response. Sortable shadcn DataTable. |
| **ALRT-13 algorithm-picker per rule** (basic threshold | EWMA z-score | rolling mean±stddev — user picks per rule) | Datadog exposes its three algorithms (basic / agile / robust) as user choice per monitor; this matches that pattern. Avoids one-size-fits-all by giving the user agency. | MEDIUM | AlertRule schema gains an `algorithm` field. Detector dispatches on the field. |
| **ALRT-14 NL parser preview-mode** (show parsed AlertRule JSON in modal before save; user can edit fields manually before commit) | Trust-building for the LLM authoring path. The user sees what Haiku produced and can tweak it. Defangs the "what if it parsed my intent wrong?" hesitation. | LOW | Modal step between parse and persist. Reuses existing AlertRule form components. |
| **ALRT-14 pre-built grammar templates** (Cmd+K shows 6 example NL rules: "alert me when X exceeds Y for Z" / "tell me if X is anomalous over Z" / etc.) | Cold-start problem: users don't know what NL Haiku can parse. Showing templates that are guaranteed to work seeds the mental model. Linear-tier UX touch. | LOW | Static array of templates rendered as Cmd+K suggestions. |
| **CMPR-06 cost delta alongside latency delta** | Once per-skill latency delta works, per-skill cost delta is a 5-line addition and doubles the analytical density of compare. | LOW | Reuse the same per-session per-skill JOIN with cost compute. |
| **CMPR-07 "compare with same-cwd previous"** | Beyond "previous in time," sometimes you want "previous run in *this project*" — the most-recent-completed session whose cwd matches. Disambiguates when the user is multi-tasking across projects. | LOW | Backend helper takes a `?same_cwd=true` flag. New Cmd+K item. |
| **CMPR-07 sessions-table "compare with..." right-click** | Right-clicking any row in the sessions table to open compare-against-this is the "no-keyboard" entry point. Pairs with the Cmd+K shortcut. | LOW | Add menu item to existing context-menu on sessions table. |

### Anti-Features (Locked Out — Do NOT Build)

These are tempting based on the v1.2 carried backlog but each fails the "is this depth on the four existing lanes?" test or the local-only single-user product fit.

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| **Multi-user collaboration on alert rules** ("share rule" / "team rule library") | NL alert authoring naturally suggests sharing | The product is **local-only single-user**. Sharing implies cloud, identity, sync — every one of those is a new lane v1.2 doesn't open. | Not in scope. Out forever for this app. Hot-take: if user wants this, fork. |
| **NL queries against the whole dataset** ("how many times did claude-code-reviewer fail this month?") | Once Haiku parses NL into AlertRules, the next ask is to parse NL into ad-hoc queries | This is **NL2SQL**. NL2SQL on the otel_events JSON shape is a research project, not a v1.2 polish. Easy to start, hard to make trustworthy. Risk: user trusts a wrong answer. | If the user wants ad-hoc queries, give them the existing `/api/cost/breakdown?dim=` etc. NL stays scoped to AlertRule authoring (a constrained schema). |
| **Predictive alerts** ("alert me before haiku exceeds $5/day") | Once forecast (ANLY-06) and anomaly detection (ALRT-13) both exist, predictive alerts feel like "just combine them" | The combination is non-trivial — forecast confidence intervals × alert hysteresis × stale-data suppression is a research problem. False-positive rate explodes. Datadog's forecast monitors are notoriously fiddly. | Defer to v1.3+. v1.2 ships forecast (visual) and anomaly alerts (reactive) as separate primitives; combining them is a future lane. |
| **Sankey/flow diagram for skill → tool → subagent** | Latency overhead breakdown (SKLP-11) makes the tree structure visible; sankey "shows the whole flow" | Sankey is a chart type that looks impressive in screenshots but is actively bad for the question users ask ("which segment is slow?"). Stacked bars answer that better. Sankeys also break at high cardinality (>5 skills × >5 tools). | Stacked horizontal bar with three segments per skill (body / subagent / tool). Same data, more legible. |
| **Per-project budgets with hard cutoffs** | Per-project cost card (ANLY-07) suggests "well, set a budget" | Budgets imply enforcement. The dashboard is **observational** — no kill-switch into Claude Code. A budget without enforcement is just an alert with extra config; we already have alerts. | If user wants budget alerts, write a threshold AlertRule with scope=project. Same plumbing. |
| **Compare 3+ sessions** (three-up or N-up compare) | After two-up works, "compare A, B, C" is the natural ask | UI density at three columns gets cramped on a 1280-wide laptop. Compare's value is *focus*, not coverage. Datadog explicitly limits trace compare to 2-up for the same reason. | Two-up forever. If user wants N-way comparison, that's the per-skill detail page (which already aggregates across sessions). |
| **Export forecast / anomaly data as CSV** | Solo devs love CSV export; cost forecasting begs for "I want this in a spreadsheet" | Local-only product means everything's already on disk. CSV export is *another* surface to maintain. Anti-feature lockout: data is yours; query the SQLite directly. | Document the SQLite schema in DOCTOR / RESEARCH. User can run their own SQL or wire DBeaver. |
| **Heatmap views with non-table fallback** as the *primary* view for SKLP-08 | Heatmaps are pretty | At v1.2 scale (10-30 skills × 3-10 projects on average for a solo dev), a sortable table is denser-signal than a heatmap. Heatmap is differentiator-tier (toggle-from-table), not table-stakes. | Table is primary; heatmap is a tab toggle. |

---

## Feature Dependencies

```
SKLP-08 (per-project skill breakdown)
    └──enables──> SKLP-09 (period-over-period deltas — same SQL pattern, shifted-window variant)
                       └──enables──> SKLP-10 ("new"/dormant — MIN(ts), MAX(ts) reuse the same skill-keyed query)

SKLP-11 (latency overhead breakdown)
    └──independent of SKLP-08..10──> different SQL surface (otel_events nested-span)

ANLY-07 (per-project cost card)
    └──reuses existing endpoint──> /api/cost/breakdown?dim=project (UI-only ship)
    └──enables──> ANLY-06 (forecast) — once project-scoped numbers are visible, scoped forecasts become the obvious extension (DIFFERENTIATOR, not table-stakes)

ANLY-06 (monthly forecast)
    └──independent──> uses existing /api/cost/summary?range=30d
    └──enhances──> ALRT-13 (forecast band feeds anomaly detection's "expected range")

ALRT-13 (rolling-mean anomaly detection)
    └──extends──> existing detector.py + scopes.py (Phase 17)
    └──enables──> ALRT-14 (NL rules can target the new rule type)

ALRT-14 (NL alert rules)
    └──depends on──> ALRT-13 (or v1.1 EWMA) — needs rule schema to target
    └──depends on──> existing Haiku integration (already wired for follow-ups)

CMPR-06 (per-skill latency delta in compare)
    └──depends on──> SKLP-11 OR existing /api/skills/{name}/latency endpoint
                     (lighter lift if it just uses existing latency endpoint scoped per-session)

CMPR-07 (Cmd+K compare-with-previous)
    └──depends on──> existing two-up compare route (already shipped v1.1)
    └──independent of CMPR-06──> can ship in either order
```

### Dependency Notes

- **SKLP-08 → SKLP-09 → SKLP-10:** Three queries layered on the same skill_activated SQL helper. Ship in order; each is small once the previous is in.
- **SKLP-11 stands alone:** Different data shape (nested spans, not skill-keyed aggregates). Independent of the SKLP-08..10 cluster.
- **ANLY-07 is shovel-ready:** Endpoint exists. Pure UI work. Easiest table-stakes win.
- **ANLY-06 is also shovel-ready** but depends on a new forecast helper module (small, ~50 LOC).
- **ALRT-13 → ALRT-14:** NL parsing (ALRT-14) needs rule-schema *targets* to map to. Land ALRT-13 first so the new rule type is in the schema, then NL maps onto the full grammar.
- **CMPR-06 + CMPR-07 ship independently** but together they make compare feel finished. Land CMPR-07 first (smaller, higher utility), then CMPR-06.

---

## MVP Definition

### v1.2 Must-Ship (Table Stakes)

Without these, v1.2 doesn't justify a milestone — they're the carried backlog because they're the missed-from-v1.1 polish.

- [ ] **SKLP-08** — per-project skill breakdown panel on `/skills/$name`. Table primary view. Sortable.
- [ ] **SKLP-09** — period-over-period delta pills on TopSkills, SkillCostCard, per-skill detail. 7d-vs-prev-7d default; 30d available.
- [ ] **SKLP-10** — "new this week" badge (first seen in last 7d) + "dormant" badge (no use in last 30d). On TopSkills + SkillsRegistry.
- [ ] **SKLP-11** — per-skill latency overhead breakdown (stacked horizontal bar: body / subagent / tool). On per-skill detail route.
- [ ] **ANLY-06** — monthly cost forecast panel on cost dashboard. Linear extrapolation. Show "$X projected" + month-end date.
- [ ] **ANLY-07** — TopProjects panel mirroring TopSkills. Cost + token volume + session count, 7d/30d toggle. Endpoint exists.
- [ ] **ALRT-13** — rolling-mean ± N stddev anomaly detection. Add as a new AlertRule algorithm option. Reuse existing hysteresis machinery.
- [ ] **ALRT-14** — NL-authored alert rules via Haiku. Cmd+K entry. Modal preview before save (basic safety).
- [ ] **CMPR-06** — per-skill latency delta in compare view. New row in existing compare table.
- [ ] **CMPR-07** — Cmd+K "compare with previous session." Routes to existing compare view with N-1 session ID resolved.

### Differentiators (Add If Time)

Cherry-pick from this list once table stakes are solid. Recommended priority order if budget is tight:

1. **ANLY-06 partial-month bias banner** — LOW complexity, prevents user-trust regression on day 1-3 of month. Almost free.
2. **CMPR-07 sessions-table right-click** — LOW complexity, doubles entry points for compare.
3. **SKLP-10 dormancy reactivation toast** — LOW complexity, charming detail.
4. **ALRT-14 grammar templates** — LOW complexity, addresses NL cold-start.
5. **CMPR-06 cost delta alongside latency** — LOW complexity once CMPR-06 exists.
6. **ALRT-14 parser preview-mode** — Already in MVP as "modal preview"; this is the differentiator-tier *editable* preview.
7. **ANLY-06 confidence band** — MEDIUM complexity but high visual impact.
8. **SKLP-08 heatmap toggle** — MEDIUM complexity; ship after table works.
9. **ALRT-13 algorithm-picker per rule** — MEDIUM complexity; only matters if user sets >3 rules.
10. **SKLP-09 sticky reference-period selector** — MEDIUM complexity, niche use.
11. **SKLP-11 percentile-split breakdown** — LARGE complexity, defer to v1.3 unless explicitly requested.

### Future Consideration (v1.3+)

- **Predictive alerts** — combine ANLY-06 forecast with ALRT-13 anomaly. Requires confidence-interval × hysteresis design work.
- **NL queries beyond AlertRule schema** — full NL2SQL is its own milestone.
- **Cross-machine sync** — explicitly out of v1.x scope (local-only is the product).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SKLP-08 per-project skill breakdown | HIGH | MEDIUM | P1 |
| SKLP-09 period-over-period deltas | HIGH | MEDIUM | P1 |
| SKLP-10 new/dormant badges | MEDIUM | LOW | P1 |
| SKLP-11 latency overhead breakdown | HIGH | LARGE | P1 |
| ANLY-06 monthly cost forecast | HIGH | LOW | P1 |
| ANLY-07 per-project cost card | HIGH | LOW | P1 |
| ALRT-13 anomaly detection (rolling) | MEDIUM | MEDIUM | P1 |
| ALRT-14 NL alert authoring | HIGH | MEDIUM | P1 |
| CMPR-06 per-skill latency delta | HIGH | MEDIUM | P1 |
| CMPR-07 Cmd+K compare-with-previous | HIGH | LOW | P1 |
| ANLY-06 partial-month bias banner | MEDIUM | LOW | P2 |
| ALRT-14 grammar templates | MEDIUM | LOW | P2 |
| ANLY-06 confidence band | MEDIUM | MEDIUM | P2 |
| SKLP-08 heatmap toggle | LOW | MEDIUM | P2 |
| SKLP-11 percentile-split | LOW | LARGE | P3 |
| ALRT-13 algorithm-picker | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must ship for v1.2 to feel finished
- P2: Should ship if time permits (high value/cost ratio)
- P3: Defer unless feature-complete on P1+P2

---

## What "Feels Finished" Looks Like (Per Lane)

### Skills Lane (SKLP-08..11)
**Finished feels like:** Open `/skills/$name` for any skill. See total cost, latency p50/p95/max, sparkline over 14d, list of recent invocations, **AND** which projects use this skill (with cost/latency per project), **AND** "+12% vs last week" pill, **AND** if the skill is new/dormant, the badge says so, **AND** the latency breakdown shows whether the time is spent in body/subagent/tool. There is no question the user can ask about a skill that the page doesn't answer at a glance.

### Cost Lane (ANLY-06..07)
**Finished feels like:** Open the cost dashboard. See current 7d cost (existing), see "$X projected for May" prominently (new), see top-5 most expensive projects (new), see by-model breakdown (existing). The user has a holistic answer to "what's my Claude bill going to look like and where's the money going?"

### Alerts Lane (ALRT-13..14)
**Finished feels like:** Cmd+K "create alert" → type "alert me when haiku skill p95 exceeds 5s for 10min" → preview parsed JSON → save. Or, in the alert-rule list, select "rolling-mean" as the algorithm and configure window/stddev. The system catches three classes of failure (threshold breach, EWMA outlier, rolling-mean drift) with three different algorithms, and rules can be authored in three ways (Cmd+K NL, manual JSON, settings UI).

### Compare Lane (CMPR-06..07)
**Finished feels like:** From any session view, hit Cmd+K → "Compare with previous run" → instantly jump to two-up compare with the prior session pre-filled. The compare view shows per-skill latency delta alongside the existing skill-set diff and tool-counts. The user can answer "did this run get slower?" in two keystrokes.

---

## Competitor Feature Analysis

| Feature | Datadog | Honeycomb | Langfuse | Linear/Vercel | Our v1.2 Approach |
|---------|---------|-----------|----------|---------------|-------------------|
| Per-dimension breakdown | Heatmap widget; full GROUP BY in queries | BubbleUp on heatmap | Filter dropdowns on cost dashboard | Linear has per-project filters | Sortable table primary; heatmap toggle as differentiator (SKLP-08) |
| Period-over-period delta | "Show 1d ago overlay" on graphs | Not first-class | Custom dashboards can compute | Linear analytics show "+12%" pills inline | Delta pills on every cost/latency surface (SKLP-09) — Linear-tier |
| New/dormant feature surfacing | Not first-class | Not first-class | N/A | Linear "New" badges on shipped features | Badges on TopSkills + SkillsRegistry (SKLP-10) |
| Latency overhead breakdown | Flame graphs (gold standard) | Flame graphs + waterfall | Trace view shows nested spans | N/A | Stacked horizontal bar (3 segments) — flame graph too heavy for solo-dev density (SKLP-11) |
| Cost forecast | Forecast monitor with linear/seasonal algos + confidence bounds | N/A | Pricing calculator (estimate-only, not dashboard) | Vercel shows current usage, no projection | Linear extrapolation with optional confidence band (ANLY-06) — match Datadog's UX, simpler algo |
| Per-project cost | Tag-based grouping | Dataset-level | Project filter | Per-project breakdown standard | TopProjects panel (ANLY-07) — endpoint already exists |
| Anomaly detection algorithms | basic / agile / robust (3 algos, user-pickable) | None first-class | None | N/A | EWMA z-score (existing) + rolling mean ± stddev (ALRT-13) — two algos, user-pickable as differentiator |
| NL alert authoring | Not yet (as of 2026-05) | Not yet | Not yet | Grafana 12.2 ships NL→SQL but not NL→alert directly | NL→AlertRule via Haiku with structured output + preview (ALRT-14) — genuine differentiator |
| Compare runs | Trace compare (2-up) | Trace diff | Run-to-run compare | Vercel deployment compare (preview vs prod) | Two-up session compare (existing v1.1) + per-skill delta (CMPR-06) + Cmd+K previous (CMPR-07) |

---

## Specific Pattern Decisions

### Per-project skill breakdown (SKLP-08): table primary, heatmap secondary
- **Decision:** Table is the primary view. Heatmap is a tab-toggle differentiator.
- **Rationale:** At v1.2 scale (10-30 skills × 3-10 projects for a solo dev), table is denser-signal. Heatmaps shine at 100+ × 100+ cardinality. Sankey diagrams are ruled out (anti-feature).
- **Columns (sortable):** project (cwd), invocations, total cost, p95 latency, last used.

### Period-over-period (SKLP-09): rolling window, delta pill UI
- **Decision:** Rolling window (7d-vs-prev-7d, 30d-vs-prev-30d) is default. Sticky reference period is differentiator-tier.
- **UI:** Number + delta pill (`$2.34 (+12%)` with green/red colour). Sparkline is *separate* from the pill — sparkline shows shape, pill shows magnitude.
- **Rationale:** Linear, Stripe, Vercel Analytics all do rolling pills. Sticky-reference-period serves a niche use case (best-week comparison) — defer.

### New/dormant thresholds (SKLP-10): 7d new, 30d dormant
- **"New":** First seen in skill_activated within the last **7 days**. Single use is enough — discovery threshold of 1.
- **"Dormant":** No skill_activated event in the last **30 days**.
- **Rationale:** 7d "new" matches Linear's "Recently shipped" cadence. 30d dormant matches the natural attention budget for a solo dev (a month is "I would have noticed if I used it"). Both thresholds tunable via config but defaults shipped as 7/30.

### Latency overhead breakdown (SKLP-11): stacked horizontal bar, three segments
- **Decision:** Stacked horizontal bar per skill: skill body | subagent time | tool call time.
- **Rationale:** Flame graphs are too dense for the per-skill row (one bar per skill, sorted by total). Sankey is anti-feature. Stacked bar is the legible answer to "where's the time?"
- **Hover tooltip:** absolute ms per segment + percentage. Click → drill into per-segment detail (future v1.3).

### Monthly forecast (ANLY-06): linear extrapolation default, optional confidence band
- **Algorithm:** Sum cost over days observed in current month → divide by days observed → multiply by days in month. Linear, simple, predictable.
- **Confidence band (differentiator):** ± 1 stddev of daily cost over the same month. Shaded path component on the line chart.
- **Partial-month bias:** Day 1-3 of month → swap forecast value for "insufficient data" banner. Days 4+ → show forecast with confidence band scaling with sample size.
- **Rationale:** Linear is the simplest honest forecast. Datadog's `linear` algorithm is the same shape. Confidence band makes the false-precision problem visible.

### Per-project cost card (ANLY-07): table-stakes columns
- **Columns (sortable):** project (cwd, abbreviated to last path segment + tooltip with full path), 7d cost, 30d cost, 7d sessions, top-skill-in-this-project (differentiator).
- **Rationale:** Mirrors TopSkills layout. Click-through to filtered cost breakdown. The top-skill column makes the table a navigation surface, not just a leaderboard.

### Anomaly detection (ALRT-13): 14d rolling window, ± 2 stddev
- **Window:** 14 days rolling. Matches Datadog's lower bound for stable seasonal detection (7-14d minimum). 7d is too noisy on weekly cycles; 30d under-reacts to recent shifts.
- **Threshold:** 2 stddev default (matches Datadog `bounds: 2`). User can tune to 3 stddev for less sensitivity.
- **Rationale:** Datadog's `agile` algorithm uses rolling mean + bounds for similar metrics. Their default is 2 stddev. Match the literature.

### NL alert rules (ALRT-14): structured-output Haiku, AlertRule schema as target
- **Grammar that works (table-stakes):**
  - "alert me when [skill] [metric] [exceeds|falls below] [value] for [duration]"
  - "alert me if [skill] errors more than [N] times in [duration]"
  - "tell me when [project] cost exceeds [$X] in [duration]"
- **Edge cases that trip up Haiku-style parsing:**
  - **Unit ambiguity:** "5s" vs "5000ms" vs "5 seconds" — parser must normalise. Pin units to the AlertRule schema's enum.
  - **Implicit metrics:** "alert me when haiku is slow" — no metric or threshold. Parser asks for clarification or refuses.
  - **Nested conditions:** "alert me when haiku p95 > 5s OR errors > 3" — multi-condition not in v1.2 schema. Parser refuses gracefully.
  - **Time-window vs duration confusion:** "alert me daily when X exceeds Y" (cadence) vs "for 10 minutes" (window) — need explicit prompt design to disambiguate.
- **Mitigations:**
  - Structured output: pin Haiku to the AlertRule pydantic schema via tool-use forcing.
  - Always preview parsed JSON before save (modal step).
  - On parse failure, return error + suggested correction.

### Compare delta (CMPR-06): merged column with delta + sparkline
- **Decision:** Single table with columns: skill_name | A_p95 | B_p95 | delta_pill | mini-sparkline.
- **Rationale:** Side-by-side feels more comparative; merged column is denser. The delta pill (signed %, coloured) is the at-a-glance answer; mini-sparkline shows the shape per session.
- **Order:** Sorted by absolute delta descending (biggest changes at top).

### Compare-with-previous (CMPR-07): "previous" = most-recent-completed
- **"Previous"** = most-recent-completed session whose end time precedes current session's start time.
- **NOT same-skill, NOT same-cwd by default.** Same-cwd is a differentiator-tier variant (Cmd+K offers both: "Compare with previous" and "Compare with previous in this project").
- **Rationale:** Time-ordered "previous" is the universal pattern (Linear, Vercel deployments, GitHub Actions all do this). Same-cwd is the niche refinement.

---

## Sources

- [Datadog Anomaly Monitor (algorithms, bounds, seasonality)](https://docs.datadoghq.com/monitors/types/anomaly/) — HIGH confidence (official docs)
- [Datadog Anomaly Monitor Guide](https://docs.datadoghq.com/monitors/guide/anomaly-monitor/) — HIGH (official)
- [Datadog Forecast Monitors (linear / robust algorithms, confidence bounds)](https://docs.datadoghq.com/monitors/types/forecasts/) — HIGH (official)
- [Datadog Heatmap Widget](https://docs.dataddoghq.com/dashboards/widgets/heatmap/) — HIGH (official)
- [Datadog Flame Graph (latency breakdown pattern)](https://www.datadoghq.com/knowledge-center/distributed-tracing/flame-graph/) — HIGH (official)
- [Honeycomb Trace Exploration / BubbleUp pattern](https://docs.honeycomb.io/investigate/analyze/explore-traces) — HIGH (official)
- [Honeycomb UX appreciation (BubbleUp, sankey critique)](https://medium.com/@jjhayes100/the-art-of-observability-4e3fe1c2ab04) — MEDIUM (third-party analysis)
- [Langfuse Token & Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) — HIGH (official)
- [Langfuse Custom Dashboards](https://langfuse.com/docs/metrics/features/custom-dashboards) — HIGH (official)
- [Grafana 12.2 LLM-powered SQL expressions release notes](https://grafana.com/blog/2025/09/25/grafana-12-2-release-all-the-latest-features/) — HIGH (official)
- [Grafana Assistant for alert creation](https://grafana.com/blog/2025/05/07/llm-grafana-assistant) — HIGH (official)
- [AWS Cost Explorer forecast confidence intervals](https://docs.aws.amazon.com/cost-management/latest/userguide/ce-forecast.html) — HIGH (official)
- [Run rate forecasting practices (FinOps)](https://finopsschool.com/blog/run-rate/) — MEDIUM
- [Anomaly detection rolling window guidelines](https://openobserve.ai/blog/ai-anomaly-detection-guide/) — MEDIUM
- [Linear changelog (badge + UI patterns)](https://linear.app/changelog) — HIGH (product reference)
- v1.1 codebase references:
  - `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/skills.py` — SKLP-08..11 dependencies
  - `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/cost.py` — ANLY-06..07 dependencies
  - `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/alerts/detector.py` — ALRT-13..14 dependencies

---

*Feature research for: Claude Mission Control v1.2 Depth & Polish (Skills, Cost, Alerts, Compare lanes)*
*Researched: 2026-05-05*
