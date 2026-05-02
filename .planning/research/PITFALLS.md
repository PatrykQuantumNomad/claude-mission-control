# Pitfalls Research

**Domain:** Adding skill observability + cost intelligence + alerting + session comparison to an existing local Claude Code dashboard (v1.1 Skills & Cost Intelligence milestone)
**Researched:** 2026-05-02
**Confidence:** HIGH (anchored to v1.0 in-repo conventions and Anthropic OTEL/pricing surface; web access denied — pricing-fluctuation pitfalls flagged accordingly)

---

## Scope

This file complements `.planning/milestones/v1.0-research/PITFALLS.md` (which covered SQLite WAL, busy_timeout, PID recycling, OTEL always-200, JSONL OOM, fenced-marker false positives, Telegram parse_mode, UTC vs localtime). Those are still in force — they are not repeated here.

Below are the pitfalls **specific to the new v1.1 surface area**:

1. Skill event ingestion (OTEL + JSONL fallback)
2. Cost math (cache tiers, tier drift, attribution)
3. Alert engine (brand-new infra; well-known antipatterns)
4. Per-skill latency math
5. Session-comparison UX
6. Skill timeline / firehose
7. Integration with v1 systems already running in production (Telegram, decisions queue, polling cadences, autonomy gate, useFirehose, low-sample badge convention)

Each pitfall lists: warning sign, prevention (concrete pattern), and the phase that should address it. Phase numbering uses the indicative v1.1 sequence: **P0 Spike → P1 Ingest → P2 Cost foundation → P3 Skill panels → P4 Alert engine → P5 Session compare → P6 Timeline & polish**. The roadmap consumer can renumber.

---

## Critical Pitfalls

### Pitfall 1: Treating `claude_code.skill_invoked` as a guaranteed signal before P0 spike

**What goes wrong:**
The v1.1 plan assumes Claude Code emits a `claude_code.skill_invoked` OTEL event with attributes like `skill_name`, `skill_version`, `args_summary`. In practice this event may not exist, may be named differently (`claude_code.skill.invocation`, `claude.skills.invoked`, `claude_code.skill_use`), or may be emitted only on premium plans / behind a feature flag. ACTV-04 and SKLP-02 were specifically deferred from v1.0 ("placeholder cards in production UI (need `claude_code.skill_invoked` OTEL event)") — that deferral is not a vague promise; it is a **known unknown**. Building four panels on top of an event that doesn't ship at the assumed shape causes a cascading rewrite.

**Why it happens:**
Claude Code's OTEL event surface evolves between releases. Training data on the dashboard side (or the original PROJECT.md author's recollection) is one or two minor versions stale. Panels get half-built before someone runs `tail -f /v1/logs` payloads and discovers the event is missing.

**How to avoid:**
- P0 SPIKE is non-negotiable and must produce a written artifact in `.planning/research/` *before* P1 ingest schema is locked. The spike must:
  1. Run `make setup-otel` against a current Claude Code, drive a session that exercises a skill (e.g. write-and-run, web-search), and `SELECT event_name, attrs_* FROM otel_events ORDER BY id DESC LIMIT 50` directly.
  2. Record verbatim event names — do not paraphrase. If the canonical name is `claude_code.skill.invoked` (with a dot, not underscore), every downstream filter changes.
  3. Capture the **actual attribute set**: which of `skill.name`, `skill.id`, `skill.version`, `skill.args_summary`, `skill.outcome`, `skill.duration_ms`, `session.id` exist? Note absences explicitly.
  4. If the event is not present, fall back to **derive-from-JSONL**: identify which JSONL `tool_use` payloads correspond to skills (e.g. tool_name prefix, sidecar `skill_invocation` envelope) and lock that as the v1.1 source. Document the swap.
- Treat the spike output as a **lock decision** in the same sense as the FastAPI chassis lock — downstream phases reference it by name.

**Warning signs:**
- Anyone writing `WHERE event_name = 'claude_code.skill_invoked'` before the spike artifact lands.
- Schema migration for `skill_invocations` table includes columns named after assumed attributes.
- TopSkills panel design reviewed before raw event payloads are pasted into the spike doc.

**Phase to address:**
P0 (Spike). Hard-blocks P1 ingest. Roadmap should make P1 explicitly depend on P0 deliverable filename.

---

### Pitfall 2: Skill name treated as a stable identifier when it carries path/version suffixes

**What goes wrong:**
Skill names from `~/.claude/skills/*/SKILL.md` (personal) and `<repo>/skills/*/SKILL.md` (project) collide on the bare `name` column. v1.0 already exposes this — `tasks.skill` is a free-text reference to `skills.name` "with no foreign-key constraint, accepted deliberately to avoid migration churn" (CONCERNS.md). For v1.1 cost attribution, two skills named `commit-helper` (one personal, one project) get summed into a single row in TopSkills, and the user sees impossible totals like "127 invocations of commit-helper" when neither alone hit 64.

**Why it happens:**
SKIL-01 already uses `Skill.name` as the ORM key. When OTEL events fire `skill.name="commit-helper"` without an `environment` or `path` attribute, the ingester has no signal to disambiguate. Worse: skill versioning ("commit-helper@2") may appear inline in the name field on some Claude Code versions, fragmenting the rollup arbitrarily.

**How to avoid:**
- Compute a **canonical skill key** at ingest: `(environment, name)` — `(personal|project|unknown, name_without_version_suffix)`. Use this tuple as the join key for cost rollups and the TopSkills aggregation.
- Strip a trailing `@\d+(\.\d+)*` version suffix into a separate `version` column at ingest. Never let the version contaminate the rollup key.
- If the OTEL event lacks an `environment` attribute, resolve it at ingest by looking up the bare name in the existing `skills` table populated by SKIL-02 — write `environment="unknown"` only if both lookups fail.
- Add a unit test that ingests two events for personal `foo` and project `foo` and asserts the TopSkills query returns **two** rows, not one.

**Warning signs:**
- A `WHERE skill_name = ?` clause anywhere in the v1.1 codebase. (Should always be `WHERE skill_environment = ? AND skill_name = ?`.)
- TopSkills row counts that don't match `SELECT COUNT(DISTINCT name) FROM skills`.
- Cost-per-skill totals that don't sum to ≤ daily token totals (a sign of double-counting from ambiguous joins).

**Phase to address:**
P1 (Ingest). The canonical key must be locked in the migration that creates `skill_invocations`, not retrofitted later — retrofits require backfill, which is hard once cost rollups are cached.

---

### Pitfall 3: Hardcoded $/token rates go stale silently and underreport for a week

**What goes wrong:**
The cost card writes a constants table like `MODEL_PRICES = {"claude-sonnet-4-7": {"input": 3.0, "output": 15.0, "cache_write_5m": 3.75, "cache_write_1h": 6.0, "cache_read": 0.30}}`. Two weeks later Anthropic ships Sonnet 4.8 with a different rate, or adjusts cache pricing, or introduces a new model variant. The dashboard silently reports prior-tier numbers — the user trusts the line "Today: $4.23" when reality is $5.10. There is no error, no log, no warning. ANLYT-01's whole value proposition is undermined invisibly.

**Why it happens:**
Three forces compound: (1) Anthropic's pricing page is not a stable, machine-readable feed — there is no `/v1/pricing` endpoint to poll; (2) developers naturally inline rates as constants because it's the simplest thing that compiles; (3) the dashboard's job is to *show* numbers, not to *validate* them, so wrong-but-rendered numbers look correct.

**How to avoid:**
- **Externalize pricing**: ship a `backend/cmc/cost/pricing.py` module that loads rates from `data/pricing.json` (or `backend/.env` overrides), not Python constants. Document the file format. Bundle a default with a `_pricing_version` and `_published_at` field.
- **Surface "as-of" in the UI**: every cost number renders alongside a small caption "rates as of YYYY-MM-DD (Sonnet 4.7 tier)". If the active model isn't in the table, show the cost with an `unpriced` badge — never silently fall back to a default rate.
- **Detect the unpriced case**: ingest writes rows for *every* token-bearing event; the cost reader joins against the pricing table. Rows without a pricing match are counted into an `unpriced_tokens` metric exposed in `doctor.py`. When `unpriced_tokens > 0` for the current day, doctor surfaces it as a warning.
- **Never recompute cost at read time across a wide range**: at the daily-rollup level, materialize cost into a `costs_daily` table at JSONL/OTEL ingest time using the rates active on that day. Never apply *today's* rates to *historical* tokens — historical totals must remain stable. (This is the "read-time vs ingest-time" tradeoff: read-time is correct only if rates never change, which is false.)
- Add a doctor.py check that fetches Anthropic's pricing page hash quarterly and warns if the hash differs from when `pricing.json` was last edited. (Optional; even without scraping, the as-of caption is enough.)

**Warning signs:**
- `MODEL_PRICES = {...}` literal in any `.py` file under `backend/cmc/cost/`.
- Cost queries that multiply tokens by a rate at read time without joining a pricing-version-tagged table.
- "Today's cost" changes for a past day after a pricing update.

**Phase to address:**
P2 (Cost foundation). The decision *where* and *when* costs are computed is irreversible without a backfill. Pricing externalization must land before any cost number renders in the UI.

---

### Pitfall 4: Cache token math conflates write-5m, write-1h, and read tiers

**What goes wrong:**
Cache writes are not free — they are billed at a multiplier of the input rate (the typical structure is 1.25x for 5m TTL and 2x for 1h TTL, while reads are 0.1x). The JSONL parser today only stores `tokens_cache_create` and `tokens_cache_read`. There is no breakdown of *which TTL tier* the cache write went into. If the cost card multiplies `tokens_cache_create * input_rate * 1.25`, it underreports any 1h writes by 60%. Worse: if Anthropic rebalances the multipliers, `cache_creation` is no longer a sum of two homogeneous things — it is a sum of two things with different rates, mixed at unknown ratios.

**Why it happens:**
The JSONL `usage` envelope today gives a flat `cache_creation_input_tokens` integer. The richer breakdown (`cache_creation: { ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }`) exists in the API response but may or may not be threaded through to JSONL transcripts depending on Claude Code version. v1.0 took the flat number because that's all that was needed for cache-hit-rate rendering.

**How to avoid:**
- P0 spike must answer: does the JSONL `usage` payload contain `cache_creation.ephemeral_5m_input_tokens` and `cache_creation.ephemeral_1h_input_tokens`? Paste a real payload into the spike doc.
- If yes: add columns `tokens_cache_create_5m` and `tokens_cache_create_1h` to `token_usage`. Never sum them in storage; the read path can sum if needed.
- If no: explicitly document in PROJECT.md and ANLYT-01 that cache-write cost is approximated as **5m-rate × total**, with a UI caption "1h cache writes not separable in this Claude Code version" — and lower the cost card's confidence to MEDIUM.
- Add a unit test that fixtures a `usage` block with both tiers and asserts the cost row has both columns populated. A second fixture with only the legacy field asserts the fallback path is exercised.
- Never mix `cache_read` into the same column as `cache_write`. v1.0 has them separate (`tokens_cache_read` vs `tokens_cache_create`); preserve that and add the TTL split alongside.

**Warning signs:**
- A migration that adds a single `cache_tokens` column. (Should be at least three: read, write_5m, write_1h.)
- Cost-card SQL that multiplies `tokens_cache_create` by a single rate.
- Disagreement between cache panel "hit rate" (which uses `tokens_cache_read / tokens_cache_create`) and cost card "cache spend" of more than the rate ratio — a sign that one of them is treating cache writes as cache reads.

**Phase to address:**
P1 (Ingest schema) AND P2 (Cost foundation) jointly — the schema lock and the cost computation must land together. If P1 lands first with only flat columns, P2 cannot retrofit without backfill.

---

### Pitfall 5: Alert flapping — borderline conditions fire repeatedly

**What goes wrong:**
A rule like "alert when p95 skill latency > 5s" fires at 19:00 (p95=5.1s, alert sent), the noisy invocation drops out of the window at 19:05 (p95=4.9s, alert resolved), the next slow run at 19:08 pushes p95 back to 5.2s (alert sent again). The user gets three Telegram notifications in 10 minutes for a metric oscillating around the threshold. After two of these episodes the user mutes the bot and stops trusting the alert channel — which then misses real fires.

**Why it happens:**
Single-threshold alert rules with no hysteresis treat every threshold crossing as an independent event. The rolling window's edge effects (an old slow data point falling out, a new one entering) are exactly the same magnitude as real signal at the boundary — the two are mathematically indistinguishable to a single-threshold rule.

**How to avoid:**
- **Hysteresis**: separate fire and clear thresholds. Fire when p95 > 5.0s **for two consecutive evaluation windows**. Clear when p95 < 4.0s for two consecutive windows. The clear band is deliberately lower than the fire band — the gap is what kills oscillation.
- **Minimum re-fire interval**: even if a rule re-arms, suppress duplicate notifications within 15 minutes. Implement this in the alert engine, not in the notification channel — Telegram dedup alone won't help if a Decisions row also flapped.
- **Rule-level dwell time**: a rule's spec includes `min_duration_seconds` (default 120) — the condition must hold for at least that long before firing. This kills micro-spikes.
- Store recent alert state per `(rule_id, scope_key)` in a `alert_state` table with `last_fired_at`, `last_cleared_at`, `consecutive_breach_count`. Evaluate the rule against this state, not stateless against current metric.

**Warning signs:**
- A rule's evaluation function signature is `(metric_value, threshold) -> bool`. Should be `(metric_window, alert_state) -> Action`.
- Telegram log shows the same alert message 3+ times within 30 minutes.
- User asks how to mute a specific rule (sign that flapping has trained them to mute, not investigate).

**Phase to address:**
P4 (Alert engine). Hysteresis must be in the rule schema from day one — adding it later requires every existing rule to be migrated.

---

### Pitfall 6: Cold-start anomaly alerts fire on insufficient data

**What goes wrong:**
A z-score anomaly rule ("alert if today's skill cost > 3σ above 14-day mean") fires at 09:30 the day after install when the dashboard has 18 hours of data. The "14-day mean" is computed over 4 data points — its standard deviation is meaningless, the z-score is garbage, and the rule fires for every skill that ran more than once. The user gets 12 false alerts the day they set up alerting and concludes the feature is broken.

**Why it happens:**
Anomaly math (z-score, percentile, EWMA) requires a minimum sample size to produce stable estimates. Developers writing anomaly rules naturally encode "alert if z > 3" and assume the math will self-regularize as data accumulates. It does not — small-sample standard deviation underestimates true variance, making 3σ trivially crossable.

**How to avoid:**
- **Apply v1.0's low-sample badge convention to alerts**: every anomaly rule has a `min_samples` field (default 14 days, or N invocations, whichever larger). If the population is below `min_samples`, the rule's status is `insufficient_data` (not `ok`, not `firing`) and **no notification is sent**. The UI surfaces the badge — same component family as the cache panel's "Low sample" badge (`CacheEfficiencyCard.tsx:55`).
- **Warm-up window**: when a rule is first created (or reactivated after a long silence), suppress notifications for 24 hours — let the rule observe before it acts. The state is `warming` during this window, visible in the rule list UI.
- **Robust statistics**: use median + MAD (median absolute deviation) rather than mean + stddev for the anomaly threshold, especially for skewed distributions like skill cost. MAD is far more stable on small samples.
- For brand-new skills (never seen before), there is no baseline at all — the rule should default to `insufficient_data` for that skill until it accumulates `min_samples` invocations, even if other skills' baselines are established.

**Warning signs:**
- An anomaly rule that fires within 24 hours of a fresh install.
- Rule evaluation code that does not check `count(samples) >= min_samples` before computing the threshold.
- `numpy.std` or `statistics.stdev` called without an upstream count guard.

**Phase to address:**
P4 (Alert engine), specifically the anomaly rule type. Threshold rules with fixed numeric breakpoints don't have this problem; anomaly rules do — the gating must be type-specific.

---

### Pitfall 7: Alert notification dedup misses cross-channel duplication

**What goes wrong:**
The alert engine writes to the decisions queue (so the dashboard shows it on the Skills page) AND fires Telegram (TELE-02 notifier). Both are correct. But the notifier loops every 30s; the alert engine inserts the decision row at T0; the notifier sends Telegram at T+15s. Then at T+60s the alert engine re-evaluates, the condition is still true, it inserts a *second* decision row (different `dedup_key` because the engine encoded `now()` into it), and Telegram sends *another* message. The user gets two Telegram cards for one ongoing alert, and two pending decisions to answer for the same root condition.

**Why it happens:**
The decisions queue has a partial-unique index on `(dedup_key) WHERE status='pending'` (HITL-02), enforced via `INSERT OR IGNORE`. This dedup is correct for human-driven decision creation — the same dedup_key blocks a second pending row. But if the alert engine *generates* the dedup_key from a timestamp ("alert-skill-foo-2026-05-02T19:30:00Z"), each evaluation cycle gets a new key and bypasses the dedup. The notifier then independently dedups by `(notification_log.kind='alert', entity_id=decision_id)` — which is per-decision, not per-rule, so two decisions yield two notifications.

**How to avoid:**
- **Stable dedup_key per active alert state**: the alert engine computes `dedup_key = f"alert:{rule_id}:{scope_key}"` — no timestamp. While the alert is firing, the same key is reused; `INSERT OR IGNORE` correctly elides the second insert. Only when the alert *clears* and *re-fires* later does a new row appear (because the prior row has moved to `status='answered'` and is outside the partial-unique scope).
- **Single source of truth for "alert is currently active"**: the `alert_state` table (introduced in Pitfall 5) tracks fired/cleared per rule. The decisions queue and Telegram both **observe** this state — they are not the truth. The engine writes the decision row only on the fire-edge, not on every evaluation.
- **Notifier audit at startup**: TELE-02 already does `cleanup_rerun_failures` to handle stale failure rows (`backend/cmc/telegram/notifier.py:55-...`). Add an analogous `cleanup_resolved_alerts` step that suppresses Telegram for any alert whose `alert_state` is now `cleared` even if the decision is still pending — the human-answer path should clear the alert independently (see Pitfall 8).
- Test: trigger the same rule's condition for 60 minutes continuously. Assert: one decision row, one Telegram message, regardless of evaluation cadence.

**Warning signs:**
- A `dedup_key` value that contains `now().isoformat()` or a UUID.
- Multiple identical-text Telegram messages within an hour.
- The Skills page decisions queue showing 4 pending alerts for the same skill, with timestamps 15s apart.

**Phase to address:**
P4 (Alert engine). The dedup_key contract is part of the engine's interface to the existing decisions queue — get it right at the boundary.

---

### Pitfall 8: Alert ack / resolve flow is undefined — alerts pile up forever

**What goes wrong:**
An alert fires, gets a decision row, gets a Telegram message. The user reads the Telegram, says "yeah I know, the test suite is slow today," and moves on. The decision stays pending forever. The Skills page accumulates 47 unanswered alert decisions over a week. The next time a real alert arrives, it is buried in noise. There is no "mark resolved" button because nobody specified one.

**Why it happens:**
v1.0's decisions queue is designed for *agent-asks-human* decisions — the agent pauses, asks "should I deploy?", waits for a yes/no answer, then acts on the answer. Alerts are different: they are *system-tells-human*, and the human's response is informational ("seen") not directive. Reusing the decision row without specifying the lifecycle leaves the row with no terminal state.

**How to avoid:**
- **Lifecycle separation**: alerts use the decisions queue but follow a distinct lifecycle:
  - `pending` (alert is firing, action awaited)
  - `acknowledged` (human said "seen", alert is still firing but suppressed from queue UI)
  - `resolved` (alert cleared automatically when the underlying condition went away) → equivalent to v1.0's `answered` terminal state
- **Auto-resolve on clear**: the alert engine's clear-edge writes `decisions.status='answered'` with `answered_by='alert_engine'` and `answer='auto-resolved'`. No human action required.
- **Ack is a Telegram callback verb**: extend `dash_router.py`'s callback dispatcher with a new verb `ack_alert:{decision_id}` (mirrors `answer_decision`/`snooze` patterns). The button label is "Seen" rather than "Yes/No".
- **Ack does NOT clear the alert** — the underlying metric is still bad. Ack only suppresses re-notification for that rule for 1 hour (configurable per rule).
- **Stale alert sweep**: a daily cleanup task moves alert decisions older than 7 days into `answered` with `answered_by='ttl'`, so the queue cannot grow unboundedly. Document that this is sweep-grade cleanup, not loss of signal — the alert state itself remains in `alert_state` table.

**Warning signs:**
- Decisions queue length growing monotonically with no bound.
- A "pending" decision whose underlying metric has been healthy for 6 hours.
- User mutes Telegram bot (a downstream sign of unresolved-alert fatigue).

**Phase to address:**
P4 (Alert engine), specifically the alert-decision integration with HITL queue. The Telegram callback verb addition is small; the lifecycle change is the substantive piece.

---

### Pitfall 9: Alert rule storage as opaque JSON in SQLite — schema evolution becomes painful

**What goes wrong:**
The first cut stores rules as `alert_rules.spec_json TEXT NOT NULL` containing `{"type": "threshold", "metric": "skill_p95_latency", "skill": "commit-helper", "threshold": 5000}`. v1.1.1 adds hysteresis: every existing rule needs `clear_threshold` defaulted. v1.2 adds anomaly rule type with z-score parameters. v1.3 changes "skill" to require `(environment, name)` (Pitfall 2). Every change requires running an Alembic migration that JSON-walks every row, mutates the dict, and writes it back. SQLite JSON1 helps but it's still a custom migration per change, error-prone.

**Why it happens:**
JSON-in-SQLite is the path of least resistance — it lets the engine evolve without DB schema churn. But "without schema churn" is illusory; the schema migrates implicitly inside the JSON, and the migration tooling becomes ad-hoc Python.

**How to avoid:**
- **Hybrid storage**: structural fields (rule type, scope, fire/clear thresholds, dwell time, min_samples, enabled) are first-class columns in `alert_rules`. Type-specific overflow goes into `params_json` — and the engine refuses to load a rule whose `type` is unknown.
- **Versioned spec**: `alert_rules.spec_version INTEGER NOT NULL DEFAULT 1`. The engine has a registry `SPEC_LOADERS = {1: load_v1, 2: load_v2}`. New versions add a loader; old rules continue to load via their original loader. Migrations bump version *only when* shape genuinely changes.
- **Pydantic models, not raw dicts**: a rule's `params_json` round-trips through `RuleParamsV1` (Pydantic). At load time, validation rejects malformed rules with a startup warning rather than crashing the engine. At save time, serialization is deterministic.
- **Default values in code, not in JSON**: when a new field is added (e.g. `min_samples`), the loader supplies the default for old rows — no DB-side backfill needed. The next save persists the new field; until then it's computed.
- For the "edit a rule" UI, render forms based on the rule's `type` and `spec_version` — never offer a free-text JSON editor. (That route leads to user-broken rule rows nobody can debug.)

**Warning signs:**
- A migration script that reads every row, parses JSON, mutates, and writes back.
- Rule loading code with `try: rule['threshold']; except KeyError: rule['threshold'] = 0`.
- Two rules that look identical in the UI behave differently because one has an old JSON shape.

**Phase to address:**
P4 (Alert engine). Spec versioning has to be in the original migration; retrofitting is expensive.

---

### Pitfall 10: p95 latency renders without a low-sample badge — meaningless on low-volume skills

**What goes wrong:**
A skill that ran 4 times this week has a "p95 latency" displayed as 12.3s. That number is essentially the slowest of 4 runs — it's the max with extra steps. The user sees it next to skill X (1,200 invocations, p95=2.1s) and concludes skill Y is "much slower," when really Y's sample is too small to support the conclusion. The cache panel has a `low_sample` badge at <10K billable tokens (`CacheEfficiencyCard.tsx:55`); the per-tool latency panel has a sorted-by-p95 view at OPNL-08. v1.1 must apply the same convention to per-skill latency.

**Why it happens:**
Latency math (p50/p95/max) is statistically meaningful only at sample counts where percentile estimation has bounded error. p95 of 20 samples is the 19th-of-20 max — high variance. The instinct is to show the number anyway; the discipline is to gate it.

**How to avoid:**
- Define a `MIN_LATENCY_SAMPLES` constant (start at 30; revisit if user feedback). Skills below this in the rolling window render p95 as `—` with a `Low sample` badge — same `<Badge variant="warning">Low sample</Badge>` component family as the cache panel.
- The TopSkills sort defaults to **frequency**, not p95, so low-volume skills don't accidentally rank as "slowest."
- For the per-skill latency panel: display the sample count (n=4) inline with the metric so the user can self-calibrate. v1.0's per-tool latency panel does this implicitly via call count — make it explicit for skills.
- Anomaly alert rules on skill latency must respect `min_samples` (Pitfall 6) — same threshold as the badge.

**Warning signs:**
- A panel showing p95=12s for a skill with 3 invocations.
- Sort orders that surface low-sample skills to the top of "slowest" lists.
- No "n=" annotation on percentile metrics.

**Phase to address:**
P3 (Skill panels), specifically the per-skill latency panel. Reuse the existing `Badge` component and the convention from `CacheEfficiencyCard.tsx`.

---

### Pitfall 11: Skill latency conflated with the underlying tool latency the skill triggered

**What goes wrong:**
A skill `commit-helper` invokes the Bash tool to run `git commit`, which takes 8s because the pre-commit hooks are slow. The skill latency is reported as 8s. But "commit-helper invocation time" semantically means "time the user/agent spent in this skill's control flow," and Bash latency is an attribute of Bash, not commit-helper. If commit-helper is on the slow-skills list, the user investigates commit-helper's prompt/logic — and finds nothing wrong, because the slowness is in the underlying tool. The signal points at the wrong layer.

**Why it happens:**
A "skill invocation" is a wrapper around N tool calls. Without an explicit start/end event for the skill itself, the only available proxy is "time between first and last tool call attributed to this skill" — which is dominated by tool latency, not skill overhead.

**How to avoid:**
- The P0 spike must answer: does Claude Code emit a paired skill-start / skill-end event, or only a single "invoked" event? If single, what does its `duration_ms` actually measure?
- If only a single event with bundled duration: explicitly document on the per-skill latency panel "Latency includes underlying tool time." Add a sibling metric "skill overhead" computed as `total_skill_duration - sum(child_tool_durations)` — that one is the genuinely skill-attributable component.
- If paired events exist: prefer the explicit duration. Still surface the breakdown so users can see "skill X took 9s, of which 8s was in Bash."
- For the slowest-skills sort, allow toggling between `total` and `overhead` — surface the toggle, don't hide it.
- Concurrent invocations: if the same skill runs twice in parallel within one session (rare but possible), do not naively sum durations — that double-counts wall time. Use `max(end) - min(start)` for the wall metric and `sum(durations)` for the cumulative metric, label both clearly.

**Warning signs:**
- "Slowest skills" list dominated by skills that are mostly thin wrappers around Bash or WebSearch.
- User feedback: "I optimized the skill prompt and the latency didn't change."
- A latency calculation that does not subtract child tool time.

**Phase to address:**
P3 (Skill panels), per-skill latency. The decision to show overhead vs total — or both — is a UX call that should be made before the panel ships.

---

### Pitfall 12: Session comparison UI degrades past N tool calls — no scaling strategy

**What goes wrong:**
A user picks two long sessions (300 tool calls each) and the diff view tries to render both timelines side-by-side. The DOM has 600 row components; framer-motion is animating expansion of every row; React rerenders every 30s on the polling tick. The browser tab pegs a CPU core and scroll judders. After two such attempts the user stops using session compare.

**Why it happens:**
Sessions vary wildly in length. The natural design ("show both timelines as parallel lists") is O(n) in DOM nodes for n tool calls. v1.0's session detail drawer handles a single session's timeline because there's only one column. Doubling that and aligning by index breaks visual scaling.

**How to avoid:**
- **Diff at the right level by default**: top-level summary (token totals, cost, skill counts, outcomes) renders as a compact card. Drill-in is opt-in via expand affordances. Don't show 600 rows on first paint.
- **Collapse equivalent runs**: if both sessions invoke the same tool/skill the same number of times with similar parameters, show one collapsed row "Bash × 14 (both sessions)" rather than 28 rows.
- **Cap visible rows**: virtualize the timeline (react-window or TanStack Virtual). Don't render rows outside the viewport.
- **Set a hard input limit**: if either session has > 500 tool calls, the compare UI shows the summary but disables the per-row diff with a banner "Session too long for inline diff — use export." Document the threshold; pick it via measurement, not guess.
- **Normalize diffs by time, not by index**: aligning "row 47 of session A" with "row 47 of session B" is meaningless if A made 100 tool calls and B made 300. Diff by elapsed-time-bucket (5-min windows) or by tool/skill name, not by ordinal position.

**Warning signs:**
- Tab CPU usage > 50% sustained while compare is open.
- User reports compare "freezes" on long sessions.
- The compare component imports framer-motion at the row level.

**Phase to address:**
P5 (Session compare). The cap and the default summary level are part of the initial design — measuring CPU on real long sessions during P5 is mandatory before shipping.

---

### Pitfall 13: Session-pick UX competes with v1.0 Cmd+K palette and URL state

**What goes wrong:**
The compare view needs to pick two sessions. Three possible UX patterns: (a) Cmd+K palette twice, (b) two side-by-side dropdown pickers in the page chrome, (c) URL state (`/compare?a=sess-1&b=sess-2`). v1.0 already commits to Cmd+K for global search (FESH-07). If compare adds its own picker that doesn't integrate with Cmd+K, users have two skills to learn ("how do I find a session normally" vs "how do I find a session for compare"). If compare uses URL state but the picker UI doesn't update the URL, deep-linking is broken.

**Why it happens:**
Each pattern is independently sensible. The integration constraint is unwritten until someone implements both halves and sees the friction.

**How to avoid:**
- **Pick one and stick to it**: URL state is the source of truth. The page reads `?a=...&b=...` and renders accordingly. The picker UI updates the URL on selection.
- **Reuse Cmd+K** for the picker action: from the compare page, opening Cmd+K filters its results to "select left session" / "select right session" based on which pane is focused. This avoids inventing a second search surface.
- Empty state: when no sessions are picked, the page shows a single "Pick two sessions to compare" affordance with a Cmd+K hint (`⌘K`). Don't render skeleton diff cards on empty state — that signals "loading" and confuses the user.
- Deep-link compatible: pasting `/compare?a=X&b=Y` into a new tab works without intermediate clicks.

**Warning signs:**
- Picker UI exists but URL doesn't update — deep links break.
- Compare state stored in `localStorage` or React state instead of URL.
- A second command palette ("session picker") that duplicates Cmd+K.

**Phase to address:**
P5 (Session compare). UX decision; lock at design review before implementation.

---

### Pitfall 14: SSE backpressure on a high-volume skill firehose drops events silently

**What goes wrong:**
The skill timeline is implemented as a new SSE channel emitting one frame per skill invocation. A long agent session executes 200 skill invocations in 30s. The server pushes 200 frames; the browser buffers them in `events` state; `useFirehose`'s ring-buffer cap (default 500) absorbs them but the React `setState` calls cause a render storm — the component rerenders 200 times. UI freezes for several seconds. If the cap is set lower (say 100) the browser silently drops the older 100 events and the user sees a partial timeline with no indication that data was discarded.

**Why it happens:**
v1.0's `useFirehose` was designed for OTEL events at typical Claude-Code rates (a few per second). Skill invocations during heavy agentic work can burst much higher. The hook's pattern of `setEvents(prev => [...prev, evt])` is O(n) per event due to the spread; at 200 events/sec it costs.

**How to avoid:**
- **Reuse `useFirehose`, but extend it**: do NOT spawn a third SSE endpoint. Add a server-side `event_name` filter (already supported by `useFirehose`) to the existing `/api/firehose` route, scoped to skill events. The `useFirehose` hook already passes `event_name` server-side.
- **Batch state updates on the client**: accumulate incoming frames in a `useRef` queue and flush to React state on a 100ms `requestAnimationFrame` timer. The user does not need 60fps timeline updates; 10fps is plenty.
- **Surface drop-count in the UI**: when the ring buffer wraps, render a banner "47 older events dropped — open in detail view." The user must know data was silently discarded — silently-dropped events are the worst failure mode of a firehose UI.
- **Server-side rate cap**: SSE generator caps emission at 50 events/second per connection, spilling overflow to a "skipped events" counter in the next emitted frame's metadata.
- Test scenario: feed 1000 skill events in 5 seconds; assert UI remains responsive (>30fps scroll), no events lost without indication, ring buffer behavior is correct.

**Warning signs:**
- Skill timeline rerenders profiled at >100Hz.
- Ring buffer wraps with no UI affordance.
- Events appear out-of-order (a sign of multi-channel race; consolidate to one channel).

**Phase to address:**
P6 (Timeline). Extending `useFirehose` rather than forking it is a v1-systems-integration decision documented at design lock.

---

### Pitfall 15: Polling cadence collisions — what's the right cadence for skill panels?

**What goes wrong:**
v1.0's `lib/queries.ts` locks polling cadences as the single source of truth. v1.1 adds 4-6 new query keys for skill panels. Default-copying a 30s cadence everywhere triples the load on the API at the same instant every 30s — every poll tick fires N requests in parallel, the API serializes through the read pool, p95 latency on legitimate requests spikes. Default-copying 60s loses near-real-time feel for the timeline. There's no "correct" answer — but picking unthinkingly is wrong.

**Why it happens:**
`queries.ts` is dense and prescriptive ("polling cadences are encoded HERE"). The default-copy temptation is strong. The cadence schedule is implicit — there's no comment explaining why decisions are 5s but observability is 30s, so a new contributor can't deduce the right cadence for skill panels.

**How to avoid:**
- **Document the cadence ladder** at the top of `lib/queries.ts`: "5s = HITL action items; 10s = inbox; 15s = HITL queues with derived state; 30s = observability (default); 60s = aggregations; 120s = expensive rollups; 300s = config." Map skill panels to the right tier:
  - TopSkills (rollup): 60s
  - Skill cost card: 60s
  - Per-skill latency: 30s
  - Skill timeline: SSE (no polling)
  - Alert rules list: 30s
  - Session compare: 60s, with `enabled` gated on having two sessions selected
- **Stagger the start**: set `refetchIntervalInBackground: false` so collisions don't compound when the tab is backgrounded. React Query already jitters by default.
- **No new 5s cadence panels**: 5s is reserved for decisions/inbox/attention bar. Adding a skill panel at 5s is a smell.
- For SSE (skill timeline), do NOT also poll a list endpoint — the SSE stream is the source of truth. The list endpoint is only for initial load.

**Warning signs:**
- A new entry in `lib/queries.ts` with a copy-pasted comment block.
- Network tab shows 8+ requests fire at the same 30s tick.
- A skill panel that polls AND subscribes to SSE for the same data.

**Phase to address:**
P3 (Skill panels) and P6 (Timeline). The cadence ladder doc-comment is a 5-minute task that pays back across all v1.1 panels.

---

### Pitfall 16: Telegram alert formatting reverts to Markdown and breaks on backtick-heavy content

**What goes wrong:**
A new alert template formatter writes `f"⚠️ Alert: skill `{skill_name}` exceeded threshold"` and is sent with `parse_mode="Markdown"` for nicer rendering. The alert message body is concatenated with the active rule description, which the user wrote as `cost > $5/day, see Slack #ops thread`. The `$` and parens break MarkdownV2; the unmatched backtick from the f-string breaks Markdown classic. Telegram returns 400, the alert never delivers, the user is unaware. v1.0 already navigated this exact pitfall (P3 in v1.0 PITFALLS — "plain text only, no parse_mode"); v1.1 must not re-litigate it.

**Why it happens:**
Each new feature in a project tends to make its own template choices. The alert-formatter author looks at `messages.py` once, sees plain-text formatters, but reaches for Markdown anyway because the alert content has natural code-formatting needs (skill names, metric names). The institutional memory of *why* plain text is not transmitted with the code.

**How to avoid:**
- **Add a single line to `cmc/telegram/api.py`**: assert that `send_message` has no `parse_mode` parameter. v1.0 already has a grep test for this in Phase 9-01 (`inspect.signature()`). Make it a unit test that fails CI if `parse_mode` is reintroduced.
- **Alert templates live in `cmc/telegram/messages.py`**: keep the convention that all formatters return `(text, reply_markup)` and `text` is plain. Reuse `format_decision`-style buttons for the "Ack" action.
- **Skill names with backticks/special chars**: if a skill has a name like `commit-helper` (already safe), don't wrap it in backticks. Use prose: `Skill "commit-helper" exceeded threshold...`.
- **Length cap**: Telegram message is 4096 chars. Alert payloads with full skill arg dumps blow this cap and cause 400. Truncate at 3500 chars with `… [truncated]`.

**Warning signs:**
- Any `parse_mode=` argument anywhere in `cmc/telegram/`.
- Alert templates in a file other than `messages.py`.
- Telegram delivery success rate < 99% in `notification_log`.

**Phase to address:**
P4 (Alert engine), specifically the alert-Telegram integration. The grep test guards regression.

---

### Pitfall 17: Alert callback verb collides with v1.0 callback parser

**What goes wrong:**
The new "ack alert" callback is named `ack:{decision_id}`. v1.0's `dash_router.py` uses verbs `answer_decision`, `snooze`, `reply_inbox`. The compact callback_data format (max 64 bytes) parses as `verb:arg:arg:arg`. A new verb that matches an existing prefix (`ack` matching nothing currently — fine) or that uses the wrong number of args breaks the parser silently. Worse: if the verb format diverges (e.g., `ack-alert:123` with a hyphen instead of colon), the `split(":")` parser swallows it and dispatches to the default branch (which ack-acks-nothing).

**Why it happens:**
The callback verb registry is implicit — defined by switch-statement style code in `dash_router.py`. New verbs are added by editing two places (the formatter that emits the verb, the router that dispatches). When the two diverge by typo, the symptom is "button does nothing" with no log.

**How to avoid:**
- **Centralize the verb enum**: a `cmc/telegram/callback_verbs.py` module exposing `class Verb(str, Enum): answer_decision = "answer_decision"; snooze = "snooze"; reply_inbox = "reply_inbox"; ack_alert = "ack_alert"`. Both formatters and routers import from this module.
- **Use snake_case consistently** — `ack_alert`, never `ack-alert` or `ackAlert`.
- **Test the callback round-trip**: a unit test asserts `parse_callback(format_alert(...).reply_markup.callback_data) == expected_ack_action`. Add this for every new verb.
- **Length budget**: 64 bytes is tight. Plan for `ack_alert:{decision_id}` (≈18 bytes) — leaves room. Don't encode skill names or arbitrary strings into callback_data; reference by ID and look up server-side.

**Warning signs:**
- Telegram button click returns no acknowledgement; logs show "unknown verb."
- A callback string longer than 64 bytes (Telegram silently rejects).
- Two formatters emitting the same verb with different arg counts.

**Phase to address:**
P4 (Alert engine), Telegram integration sub-task. Verb enum is a 30-minute refactor that prevents a class of bugs.

---

### Pitfall 18: Alert routing ignores the dispatcher autonomy gate

**What goes wrong:**
An alert fires that recommends an action (e.g., "skill X is slow — consider disabling"). The alert engine, feeling helpful, auto-creates a *task* in the dispatcher queue to disable skill X. The dispatcher's autonomy gate is configured to block on unknown skills, but the task is for *its own internal use* (no skill assigned), so it slips past the gate. A skill is auto-disabled overnight without user consent. The user wakes up to a silent regression.

**Why it happens:**
The dispatcher's autonomy gate (`autonomy_gate.py`) is keyed on `skill.autonomy` — if no skill is assigned, the task bypasses the gate (`if skill is None: return ('proceed', None)`). Alerts that synthesize tasks without skills slide through.

**How to avoid:**
- **Alerts NEVER create dispatcher tasks directly**. Alerts create *decisions* (which are HITL — the human acts) or *inbox messages* (informational). If a decision is answered "yes, take the recommended action," THEN a task is created — and the task carries an explicit skill assignment so the autonomy gate evaluates it correctly.
- **Document the trust boundary**: alerts are sensors, not actuators. The boundary is enforceable by code review — any PR that adds `tasks.insert(...)` from the alert engine is rejected.
- If an alert genuinely needs to take action without human review (rare; e.g., "kill runaway session"), it must go through a dedicated path with explicit autonomy semantics, not the general dispatcher.

**Warning signs:**
- Alert engine code that imports `cmc.dispatcher` or `cmc.tasks`.
- A task appearing in the queue with no `created_by` user attribution.
- Skills changing autonomy state without a corresponding answered decision.

**Phase to address:**
P4 (Alert engine). The "no task creation from alerts" rule is a design constraint; lock it before any alert action types are designed.

---

### Pitfall 19: Late-arriving / duplicate / out-of-order skill events corrupt rollups

**What goes wrong:**
The OTEL export pipeline batches events. A burst of skill invocations at T-15s arrives at the dashboard at T+5s due to network/process scheduling. The ingester sees event id=104 then 102 then 103 then 104-again (a retry). Today's rollup at 14:00:00 captures 102+103; the duplicate 104 lands later and double-counts; 104's first arrival was at 13:59:58 but its `ts` claims 13:59:55. When the day changes at midnight, an event with `ts=23:59:58` arriving at 00:00:03 is bucketed correctly only if the rollup uses event timestamps, not arrival time — but if rollup is materialized at midnight, the late event misses entirely.

**Why it happens:**
OTEL exporters batch and retry. Network reordering is real. The dashboard's existing OTEL ingestion handles single-event idempotency (always-200), but the "always-200" contract is acceptance, not ordering. Daily rollups assume all events arrive within the day they happened — usually true, sometimes false.

**How to avoid:**
- **Idempotent ingest**: write skill events with `(session_id, event_id_from_otel, ts)` as a unique key. Duplicate inserts use `INSERT OR IGNORE`. v1.0 already follows this pattern for OTEL — extend to the new `skill_invocations` table.
- **Rollup uses event ts, not arrival time**: daily aggregations group by `date(ts, 'localtime')` (carrying forward v1.0 Pitfall 8's localtime fix). Late arrivals correctly land in their day's bucket on the next aggregation cycle.
- **Re-aggregate recent days**: if rollups are materialized (Pitfall 3 recommends this for cost), re-aggregate yesterday's bucket once at 00:30 local time to absorb late arrivals. Document the 30-minute grace window in the data freshness caption.
- **Detection metric**: log a counter `skill_events_late_arriving_seconds` (now - event_ts when > 60s). Surface in `doctor.py`. If late-arrival rate trends up, network/exporter is degrading.

**Warning signs:**
- A skill invocation count for "today" that decreases on refresh (impossible unless dedup ran late).
- Two `skill_invocations` rows with identical OTEL event id.
- Cost rollup for yesterday changes after midnight without explanation — a sign that late events arrived but no re-aggregation happened.

**Phase to address:**
P1 (Ingest). The unique key and idempotent insert must be in the schema migration.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode token rates as Python constants | Compiles, ships fast | Wrong cost numbers after Anthropic adjusts pricing; no signal that they're stale | Never — externalize from day one (Pitfall 3) |
| `WHERE skill_name = ?` (no environment scope) | Simpler queries | Personal/project skills with same name silently merge in rollups | Never — canonical key from day one (Pitfall 2) |
| Compute cost at read time across all of history | No new tables | Pricing changes mutate historical totals; historical reports become irreproducible | Acceptable for rendering "current rate × current tokens" debug view; never for the cost card on the Skills page |
| Store alert rule spec as opaque JSON | Engine evolves without migrations | Every shape change becomes a JSON-walking Python migration | Acceptable for true-overflow type-specific params; never for structural fields like enabled/threshold/scope (Pitfall 9) |
| Single-threshold alert (no hysteresis) | One config field | Flapping; user mutes the channel | Never for production alerting (Pitfall 5) |
| Anomaly rules without min_samples gate | Looks impressive in demo | False alerts on day 1 destroy trust (Pitfall 6) | Never |
| New SSE endpoint per panel | Independent control | Cross-channel ordering/dedup; ring buffers per panel; client connection overhead | Acceptable only if the data shape genuinely diverges from `useFirehose`'s OtelEvent (Pitfall 14) |
| Skill latency = wall time of the invocation | Easy to compute | Confounds skill overhead with tool latency (Pitfall 11) | Acceptable as a primary metric IF "overhead" is shown alongside |
| Reuse decisions queue for alerts without lifecycle changes | No new tables | Alerts pile up without auto-resolve; queue becomes noise (Pitfall 8) | Never — define ack/auto-resolve before shipping alerts |
| Free-text JSON editor for alert rules in UI | Maximally flexible | Users break their own rules; nobody can debug | Never for end-user UI; acceptable for an "advanced" form behind a feature flag |

---

## Integration Gotchas

Common mistakes when wiring v1.1 features into v1.0 systems already in production.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Existing `useFirehose` (frontend) | Forking it for skill timeline | Extend with `event_name` server-side filter; same hook, same ring buffer, same reconnect (Pitfall 14) |
| Existing OTEL `/v1/logs` always-200 contract | Returning 4xx on unrecognized skill event shapes | Continue accepting; log at WARN; record raw payload for spike analysis |
| Decisions queue (HITL-02) | Generating dedup_key with timestamps for alerts | Stable `alert:{rule_id}:{scope_key}` so partial-unique INSERT OR IGNORE actually elides duplicates (Pitfall 7) |
| Decisions answered_by provenance | Alerts auto-resolving with no provenance | Set `answered_by='alert_engine'` when auto-resolving; `answered_by='telegram'` already exists for Telegram answers — preserve it (Pitfall 8) |
| Dispatcher autonomy gate | Alert engine creating tasks that bypass the gate | Alerts emit decisions only; the human-answered decision creates the task carrying the skill assignment (Pitfall 18) |
| Telegram api.py `send_message` | Adding `parse_mode="Markdown"` for nice alert formatting | Plain text only; v1.0 P3 enforced — extend the grep test to cover alert paths (Pitfall 16) |
| Telegram callback verbs | Hyphenated or camelCase verb name for `ack_alert` | snake_case enum in `cmc/telegram/callback_verbs.py`; test round-trip (Pitfall 17) |
| `lib/queries.ts` polling cadence ladder | Copy-paste 30s for every new panel | Map to documented tier (Pitfall 15) |
| `cmc/api/sse.py` shared helpers | New SSE handlers re-implementing tail loop | Reuse `tail_otel_events`-style generator; same disconnect check, same 60-min cap |
| Low-sample badge (CacheEfficiencyCard) | Skipping the badge on per-skill latency | Same `<Badge variant="warning">Low sample</Badge>` component family; `MIN_LATENCY_SAMPLES` constant (Pitfall 10) |
| `tasks.skill` free-text column | Alert engine writing tasks with skill names that don't exist | Validate skill exists at create time; add CHECK or FK in v1.1 if practical (CONCERNS.md tech debt) |
| `data/cmc.db` schema | Alert tables creating their own conventions | Follow v1.0 patterns: `created_at`/`updated_at` defaults using `lambda: datetime.now(UTC)` (NOT deprecated `datetime.utcnow`); UPSERT via `sqlite_insert(...).on_conflict_do_update(...)` |
| Dispatcher `oneshot` cycle | Alert engine running on its own daemon | Run the alert evaluator inside the dispatcher heartbeat (every 120s) — no new daemon, no new launchd plist (Pitfall 20 below) |
| `notification_log` table | Alert notifications skipping the dedup ledger | Reuse `notification_log` with a new `kind='alert'`; `(kind, entity_id)` UNIQUE prevents double-sends (mirrors v1.0 failure path, including the `cleanup_*` housekeeping pattern) |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Skill timeline SSE rerenders per event | UI freezes on bursty agent sessions | Batch state updates via rAF (Pitfall 14) | When skill events exceed 30/sec in a burst |
| Alert engine evaluates all rules on every event | Engine CPU saturates | Evaluate rules on a fixed cadence (60s) over windowed metrics, not per-event | When rule count > 20 or event rate > 100/sec |
| TopSkills query scans `otel_events` without index | Skills page p95 > 2s | Compound index on `(event_name, ts)` + materialized `skill_invocations` table | When `otel_events` exceeds 500K rows |
| Cost rollup recomputes from raw events on every page load | Skills page slow | Materialize `costs_daily` at ingest, render from rollup | When token events exceed 100K rows |
| Session compare diffs full timelines | Tab CPU pegged | Virtualize, summarize-by-default, hard cap at 500 tool calls (Pitfall 12) | When either session has > 100 tool calls |
| Alert state stored only in decisions table | Cleared alerts re-fire on dispatcher restart | Dedicated `alert_state` table with `last_fired_at`/`last_cleared_at` per `(rule, scope)` (Pitfall 5) | At first dispatcher restart with active alerts |
| Re-aggregating costs by replaying every event nightly | Cron takes 30+ min | Incremental aggregation: only re-process the last 48h grace window (Pitfall 19) | When event volume exceeds 1M rows |
| Per-skill p95 computed via `numpy.percentile` on full history | Memory + CPU spike on read | Use SQLite-side window functions or pre-bucketed approximations; cap window to 14 days | When per-skill event count exceeds 10K |

---

## Security Mistakes

Domain-specific issues for the v1.1 surface area.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Alert rule UI accepts free-text Python expressions for thresholds | Stored eval / RCE on localhost | Threshold is a numeric field; rule type is an enum; never eval user input |
| Skill name displayed unescaped in Telegram alerts | Telegram itself doesn't render HTML in plain mode (safe), but the dashboard does — XSS surface in skill registry / TopSkills if names contain `<script>` | Always render skill names through React's default escaping; never `dangerouslySetInnerHTML` for any DB-sourced content |
| Alert rules stored with no audit trail | A rule changes silently; user cannot reconstruct which rule fired which alert when | Append-only `alert_rule_revisions` table OR include `rule_version` snapshot in every fire event |
| Cost-attribution data leaked across "projects" | If multiple projects' sessions are visible to the same dashboard, per-project cost might leak — but v1.0 is single-user, single-machine, so this is informational not a leak | Document that the Skills page aggregates across all `~/.claude/projects/*` and project-scoped views require an explicit filter |
| Rule storage permits scope key = "*" without confirmation | A rule applied to all skills with a low threshold floods alerts | UI requires explicit scope; "all skills" requires an extra confirmation toggle |
| Alert webhook delivery beyond Telegram (future) | Outbound network from a localhost-only tool | v1.1 ships Telegram + decisions queue only; no generic webhook. If added later, gate on an explicit `auth_enabled=true` and a destination allowlist |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| p95 latency shown for skills with n=3 invocations | User makes wrong optimization decisions | Low-sample badge gates display (Pitfall 10) |
| TopSkills sorted by p95 by default | Low-volume noise dominates | Default to frequency; sort-by-p95 is a toggle (Pitfall 10) |
| Cost card without "as-of" caption | User trusts stale numbers | Always show "rates as of YYYY-MM-DD" (Pitfall 3) |
| Alert without ack button | Decisions queue accumulates noise | Ack verb in Telegram + auto-resolve on metric clear (Pitfall 8) |
| Compare empty state shows skeleton diff | User thinks it's loading | Empty state shows a single "Pick two sessions" affordance with `⌘K` hint (Pitfall 13) |
| Compare diff at row level by default for long sessions | Tab freezes | Summary-by-default; row diff is opt-in (Pitfall 12) |
| Skill timeline loses events with no indication | User trusts an incomplete timeline | Banner "N events dropped — switch to detail view" (Pitfall 14) |
| Anomaly alert fires on day 1 of install | User concludes feature is broken; mutes | Insufficient-data badge until `min_samples` reached (Pitfall 6) |
| Alert rule edit form is raw JSON | Users break their own rules | Type-aware form; raw JSON only behind a feature flag (Pitfall 9) |
| Skill latency rendered without tool-overhead breakdown | Users optimize the wrong layer | Show overhead alongside total (Pitfall 11) |
| Two skills named "foo" merge in TopSkills | User sees wrong totals | Display environment badge (`personal` / `project`) next to name (Pitfall 2) |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **P0 spike:** Often missing the verbatim event-name capture — verify the spike doc pastes a real `SELECT event_name FROM otel_events WHERE event_name LIKE '%skill%'` result, not paraphrased event names
- [ ] **Skill ingest:** Often missing the canonical `(environment, name)` key — verify two skills with the same bare name in different environments don't merge
- [ ] **Cost card:** Often missing the "as-of" caption — verify the rate-source date renders next to every cost number
- [ ] **Cost card:** Often missing the unpriced-token counter — verify a session using an unrecognized model surfaces an `unpriced` badge, not a silent 0
- [ ] **Cache cost math:** Often missing the 5m vs 1h split — verify both columns exist in `token_usage` (or document the explicit fallback)
- [ ] **Alert engine:** Often missing hysteresis — verify a fire/clear pair with thresholds 5/4 doesn't oscillate at 4.95
- [ ] **Alert engine:** Often missing min_samples gating — verify an anomaly rule on a fresh install does NOT fire within 24 hours
- [ ] **Alert engine:** Often missing stable dedup_key — verify the same firing condition does not produce two decision rows over a 30-min window
- [ ] **Alert engine:** Often missing auto-resolve on clear — verify the decision row transitions to `answered` when the metric returns to normal
- [ ] **Alert UI:** Often missing the Telegram ack callback — verify the `ack_alert` verb is registered in the central enum and round-trips through `dash_router`
- [ ] **Per-skill latency:** Often missing the low-sample badge — verify p95 renders as `—` for skills with < `MIN_LATENCY_SAMPLES`
- [ ] **Per-skill latency:** Often missing the overhead breakdown — verify total and overhead are both displayed
- [ ] **Skill timeline SSE:** Often missing batched setState — verify 200 events in 5s does not cause >100Hz rerenders
- [ ] **Skill timeline SSE:** Often missing dropped-events banner — verify ring buffer wrap surfaces in UI
- [ ] **Session compare:** Often missing URL state — verify `/compare?a=X&b=Y` deep-link works in a fresh tab
- [ ] **Session compare:** Often missing the long-session cap — verify a 600-tool session displays the summary-only fallback
- [ ] **Polling cadences:** Often missing the documented ladder — verify `lib/queries.ts` has a top-of-file comment mapping tier → cadence
- [ ] **Telegram alert formatting:** Often missing the parse_mode regression test — verify the grep/inspect test in CI rejects `parse_mode=` anywhere in `cmc/telegram/`
- [ ] **Late-arriving events:** Often missing idempotent insert — verify duplicate OTEL event id is `INSERT OR IGNORE`'d at the skill_invocations table
- [ ] **Late-arriving events:** Often missing yesterday-grace re-aggregation — verify a 02:00 event landing at 00:01 next day appears in yesterday's rollup after the 00:30 re-agg

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Hardcoded pricing went stale, historical totals are wrong | MEDIUM | Externalize rates; tag historical rows with the rate version active at their timestamp; do NOT retroactively rewrite history (it's wrong-but-stable, which is better than wrong-and-changing) |
| Skill rollups merged personal/project skills | HIGH | Backfill the canonical key from the existing `skills` table by name lookup; document that pre-fix rollups are blended; expose an "environment unknown" slice |
| Alert flapping trained user to mute Telegram | MEDIUM | Add hysteresis + min-duration; offer a one-click "reset alert state" UI to re-arm cleanly; communicate in-product that flapping is fixed |
| Cold-start anomaly fired N false alerts on install | LOW | Auto-resolve all alerts older than 7 days from a rule that's now in `warming` state; surface a one-line apology in the UI |
| Decisions queue accumulated 100+ alert rows | LOW | TTL sweep moves decisions older than 7 days to `answered` with `answered_by='ttl'`; document the sweep so users don't think their data was lost |
| Skill timeline ring buffer dropped events without UI signal | LOW | Add the dropped-count banner; old missed events are not recoverable from frontend state but are durable in `otel_events` — link to the historical view |
| Session compare hung the browser tab | MEDIUM | Add the 500-tool cap retroactively; add a "session too long" guard at compare-page entry, not at render time |
| Alert rule schema-evolved into an unparseable JSON | HIGH | Add a `spec_version=0` loader that quarantines unparseable rules; surface them in a "needs migration" UI; never silently delete |
| OTEL event field names diverged from spike assumption | MEDIUM | The ingester writes raw payloads to `otel_events` regardless — recoverable by re-parsing into `skill_invocations` with corrected attribute paths via a one-shot migration |

---

## Pitfall-to-Phase Mapping

How v1.1 phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. `skill_invoked` shape assumption | P0 Spike | Verbatim event-name capture in `.planning/research/SPIKE.md`; downstream phases reference filename |
| 2. Skill name as identifier | P1 Ingest | Two skills with same bare name in different environments produce two TopSkills rows |
| 3. Hardcoded pricing | P2 Cost foundation | `MODEL_PRICES = {...}` literal grep returns zero hits; cost UI shows "as-of" caption |
| 4. Cache token tier conflation | P1 Ingest + P2 Cost (joint) | `token_usage` migration includes 5m/1h columns OR explicit fallback documented in PROJECT.md |
| 5. Alert flapping | P4 Alert engine | Stress test: condition oscillates around threshold for 60min; ≤ 1 fire per hysteresis cycle |
| 6. Cold-start anomaly | P4 Alert engine | Fresh install with anomaly rule active; zero notifications in first 24h |
| 7. Cross-channel dedup | P4 Alert engine | Same condition firing for 60min produces 1 decision row + 1 Telegram message |
| 8. Alert ack lifecycle | P4 Alert engine | Cleared alert auto-transitions to `answered` with provenance `alert_engine` |
| 9. Rule JSON schema evolution | P4 Alert engine | `spec_version` column exists in `alert_rules` migration; loader registry pattern used |
| 10. p95 without low-sample | P3 Skill panels | Skills with n<30 render `—` and a "Low sample" badge (matches CacheEfficiencyCard) |
| 11. Skill latency = wall time | P3 Skill panels | Per-skill latency panel shows both total and overhead |
| 12. Compare DOM blowup | P5 Session compare | 500+ tool comparison shows summary-only fallback; CPU profile clean |
| 13. Compare picker UX | P5 Session compare | URL deep-link `/compare?a=X&b=Y` works in fresh tab; Cmd+K integration verified |
| 14. SSE backpressure | P6 Timeline | 1000 events / 5s burst: ≥30fps scroll, no silent drops, banner shown if buffer wraps |
| 15. Polling cadence collisions | P3 Skill panels (foundational), used by P3-P6 | `lib/queries.ts` ladder doc-comment exists; new keys map to documented tiers |
| 16. Telegram alert Markdown regression | P4 Alert engine | CI grep test rejects `parse_mode=` in `cmc/telegram/` |
| 17. Callback verb collision | P4 Alert engine | Verb enum exists in `cmc/telegram/callback_verbs.py`; round-trip unit test |
| 18. Autonomy gate bypass | P4 Alert engine | Alert engine code does not import `cmc.dispatcher` or `cmc.tasks`; reviewed at PR |
| 19. Late/duplicate events | P1 Ingest | `(session_id, otel_event_id)` UNIQUE; duplicate insert is INSERT OR IGNORE; 00:30 re-agg job exists |

---

## Sources

Anchored to in-repo conventions (HIGH confidence):

- `.planning/milestones/v1.0-research/PITFALLS.md` — v1.0 pitfall families (WAL, busy_timeout, PID recycling, OTEL always-200, JSONL OOM, fenced markers, Telegram parse_mode, UTC vs localtime)
- `backend/cmc/telegram/notifier.py` — INSERT ON CONFLICT DO NOTHING dedup pattern + `cleanup_rerun_failures` housekeeping
- `backend/cmc/telegram/messages.py` — plain-text formatter contract
- `backend/cmc/api/routes/hitl.py` — partial-unique dedup_key + file-then-DB ordering invariant
- `backend/cmc/dispatcher/autonomy_gate.py` — conservative-by-default autonomy contract
- `backend/cmc/api/sse.py` — SSE generator safety rules (is_disconnected, batch limit, 60-min cap)
- `frontend/src/lib/useFirehose.ts` — ring-buffer + EventSource cleanup pattern
- `frontend/src/lib/queries.ts` — locked polling cadences (5/10/15/30/60/120/300s)
- `frontend/src/components/panels/CacheEfficiencyCard.tsx` — `low_sample` badge convention
- `.planning/codebase/CONCERNS.md` — v1.0 tech debt: deprecated `datetime.utcnow`, `tasks.skill` free-text, hardcoded LOCAL_API, dispatcher log accumulation
- `backend/cmc/ingest/jsonl_parser.py` — `cache_creation_input_tokens` flat extraction (line 203) — **the gap that v1.1 must extend**

Web access denied during this research; conclusions about Anthropic pricing/OTEL specifics are MEDIUM confidence and the pitfalls flag those areas explicitly (P0 spike, "as-of" captions, externalized pricing, flat-vs-tiered cache fallback).

Confidence summary:
- Integration with v1 systems: **HIGH** (read directly from in-repo code)
- Alert engine antipatterns: **HIGH** (well-known in the monitoring/SRE literature; flapping/cold-start/dedup/ack are textbook)
- Skill event ingestion: **MEDIUM** (P0 spike will validate; pitfalls written to absorb either outcome)
- Cost math: **MEDIUM** (pricing structure is publicly documented but not fetched here; pitfalls flag the externalization requirement so the actual rates can be validated independently)
- Latency math + UX patterns: **HIGH** (statistical reasoning + v1.0 conventions to mirror)

---
*Pitfalls research for: v1.1 Skills & Cost Intelligence milestone — adding skill observability, cost intelligence, alerting, session comparison*
*Researched: 2026-05-02*
