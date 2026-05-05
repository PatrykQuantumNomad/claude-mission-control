# Pitfalls Research

**Domain:** Claude Mission Control v1.2 — Depth & Polish (differentiator features added on top of shipped v1.1 single-user observability dashboard).
**Researched:** 2026-05-05
**Confidence:** HIGH (every pitfall is grounded in actual file:line in the v1.1 codebase or in the locked v1.1 invariants enumerated in `.planning/STATE.md` Decisions log).

**Research scope note:** This is a SUBSEQUENT-MILESTONE pitfall pass, not a foundational one. Cross-cutting pitfalls already addressed by v1.1 (ALRT-12 alert-engine isolation, UTCDatetime PlainSerializer, idempotent ON CONFLICT skill ingest, read-time cost compute, stable `dedup_key`, sha256[:8] callback_data, plain-text Telegram, CMPR-04 over-cap=render, CMPR-05 tabular-only, trailing-underscore route opt-out, hand-written `validateSearch`) are NOT re-researched here. Each pitfall below is specific to a v1.2 feature and its interaction with those v1.1 invariants.

## Critical Pitfalls

### Pitfall 1: ALRT-13 anomaly detector duplicates ALRT-05 EWMA detector

**What goes wrong:**
A second "anomaly detector" is added under a new name (e.g. `evaluate_rolling_stddev`) that computes rolling mean ± N·stddev over a fixed-N window. The detector is conceptually parallel to the already-shipped `evaluate_anomaly` (EWMA z-score) in `backend/cmc/alerts/detector.py:176` — the dispatcher now has two anomaly code paths to keep in sync, two warm-up gates, two state-shape conventions, and the form's `kind` discriminated union (`'threshold' | 'anomaly'` at `frontend/src/components/panels/AlertRuleForm.tsx:35-40`) needs a third option to expose the new variant. The naming collision is the warning sign: an "anomaly" alert can mean either EWMA z-score (v1.1) or rolling-mean ± stddev (v1.2 ALRT-13) and operators cannot tell which they have without inspecting `params_json`.

**Why it happens:**
"Full anomaly detection" in the SKLP/ALRT-13 carry-over backlog reads as a NEW feature, but the existing ALRT-05 EWMA z-score detector ALREADY satisfies most of the same use case. EWMA *is* the rolling-mean-and-stddev family — it just uses an exponentially-weighted window (alpha = 2/(N+1)) instead of a fixed-N sliding window. Implementer reads "rolling mean ± stddev" literally and writes a parallel detector before realizing the shipped one is the same thing, only with smoother weighting.

**How to avoid:**
ALRT-13 should be framed as enabling/exposing the existing `evaluate_anomaly` not adding a parallel detector. Concretely:
1. Keep the `kind` discriminated union as `threshold | anomaly` (no new third kind). The shipped `params_json.window_n` already controls window length per `_resolve_window_n` (`backend/cmc/alerts/detector.py:163`).
2. If ALRT-13 truly needs *fixed-N sliding window* (vs EWMA's exponential decay), extend `evaluate_anomaly` with `params_json.window_kind: 'ewma' | 'sliding'` rather than adding a sibling function. One detector function, one warm-up gate, one state shape.
3. Update the AlertRuleForm to surface the existing `min_samples` and `window_n` knobs to operators — they are already wired on the backend (`backend/cmc/api/schemas/alerts.py:49`).

**Warning signs:**
- A new module appears under `backend/cmc/alerts/` (e.g. `rolling_anomaly.py`).
- `_SCOPE_EXTRACTORS` (`backend/cmc/alerts/scopes.py:171`) gains a vocabulary entry whose name parallels an existing one (e.g. `cost_usd_24h_anomaly`).
- The dispatcher (`backend/cmc/dispatcher/alerts.py:268`) grows a second `if rule.kind == ...` branch alongside the existing threshold/anomaly fork.

**Phase to address:**
Phase that delivers ALRT-13. The phase plan must explicitly answer "is this extending `evaluate_anomaly` or adding a sibling?" before any code is written, and the answer is locked in plan front-matter.

**Audit hook:**
Add a unit test `test_alerts_detector.py::test_single_anomaly_detector_function` that asserts `dir(cmc.alerts.detector)` contains exactly one symbol matching `r'^evaluate_(threshold|anomaly)$'` — guards against drift.

---

### Pitfall 2: ALRT-13 numerical stability — naive variance vs Welford's

**What goes wrong:**
A second anomaly detector (or extended path inside `evaluate_anomaly`) computes variance via the textbook `E[X²] - E[X]²` formula instead of the Welford-style streaming update used in the shipped detector. For long-running streams (`cost_usd_24h` evaluated every dispatcher tick — could be hundreds of thousands of samples over weeks), this catastrophically loses precision: `Var ≈ small_difference_of_two_huge_numbers` produces negative variances, NaN z-scores, or randomly-drifting baselines. The dispatcher's per-rule isolation block (`backend/cmc/dispatcher/alerts.py:227`) catches the resulting `math.sqrt` ValueError but logs it once per cycle — operator sees rule "silently never fires."

**Why it happens:**
Implementer reads the v1.2 brief literally: "rolling mean ± stddev". `numpy.std` and naive Python `statistics.stdev` *do* use the textbook formula and are fine for small batches. The streaming context (one new sample per tick, indefinite history) is what makes Welford mandatory, and that context is implicit in the dispatcher's design rather than spelled out in the formula.

**How to avoid:**
The shipped detector ALREADY uses Welford-style EWMA variance recurrence with explicit comment (`backend/cmc/alerts/detector.py:226-229`):
```python
new_mean = alpha * x + (1.0 - alpha) * prior_mean
new_var  = alpha * (x - prior_mean)^2 + (1.0 - alpha) * prior_var
```
Reuse this recurrence verbatim. Stdlib `math` only — no numpy/scipy, mirroring the "Stdlib math ONLY" lock at `backend/cmc/alerts/detector.py:16-17`. Hard-ban `statistics.variance` and any path that subtracts mean² from mean-of-squares.

**Warning signs:**
- `import statistics` or `import numpy` appears in `cmc/alerts/`.
- A unit test seeds the detector with a constant series (e.g. 10000 samples of `value=1.0`) and observes `ewma_var > EPSILON` (should be 0 + EPSILON).
- The detector emits z-scores larger than 10 on a low-variance series.

**Phase to address:**
Phase that delivers ALRT-13. Reject any PR that adds a new variance-computing code path without a `# Welford recurrence` comment.

**Audit hook:**
Add `test_alerts_detector.py::test_constant_series_zero_variance` — feed 10000 identical values, assert `abs_z < 1e-3` and `ewma_var < 1e-6`. Existing `import math` grep guard pattern from `test_telegram_grep.py` can be cloned: regex `r"import\s+(numpy|scipy|statistics)"` over `cmc/alerts/` should match zero files.

---

### Pitfall 3: ALRT-13 false-positive storm at warm-up boundary

**What goes wrong:**
When `now - rule.created_at` crosses the 24h `WARMUP_SECONDS` boundary (`backend/cmc/alerts/detector.py:45`), the detector flips from `INSUFFICIENT` to live evaluation in the same dispatcher tick. If the metric happened to be running near `threshold_fire` during warmup (because warmup is suppression of the *signal*, not of the *value*), every active rule fires simultaneously the moment warmup ends. Operator gets paged with a Telegram storm at exactly 24h after creating any new ALRT-13 rule — and the dedup_key (`alert:{rule_id}:{scope_key}`) is per-rule-per-scope, so a 10-rule batch creates 10 simultaneous alerts.

**Why it happens:**
The shipped warmup gate prevents notifications during warmup but does NOT seed `state.fired_at` so that the post-warmup transition goes through `PENDING_FIRE` first. The detector's existing min_dwell hysteresis is bypassed because `state.fired_at is None` after warmup → returns `PENDING_FIRE` (good) only on the FIRST tick post-warmup, but the second tick can already FIRE if `min_dwell_seconds` is short or zero. ALRT-13's "rolling mean ± N stddev" will commonly use `min_dwell_seconds=0` (anomalies are point-in-time) which removes that hysteresis safety net.

**How to avoid:**
1. After warmup ends, force the rule through one full `PENDING_FIRE → FIRING` cycle even when `min_dwell_seconds == 0` — i.e., the warmup→live transition itself counts as one "first observation" and emits PENDING, never FIRING. Implement in `evaluate_anomaly` as an explicit branch: `if age_seconds >= WARMUP_SECONDS and prior_age_seconds < WARMUP_SECONDS: return PENDING_FIRE`.
2. Set `min_dwell_seconds` default to a non-zero floor (e.g. 60s) for anomaly rules in the AlertRuleForm draft factory (`backend/cmc/api/schemas/alerts.py:49` already enforces `ge=0`; adjust `defaultAnomalyDraft` at `frontend/src/components/panels/AlertRuleForm.tsx:80-93` to seed `min_dwell_seconds: '60'`).
3. Document the warmup-edge contract in `backend/cmc/alerts/detector.py` docstring so the rule applies to the future ALRT-13 extension automatically.

**Warning signs:**
- E2E test or local dev: created an anomaly rule, exactly 24h later receive multiple Telegram alerts within seconds.
- `decisions` table has rows with `created_at` clustered within 30s of `(rule.created_at + 24h)`.

**Phase to address:**
Phase that delivers ALRT-13.

**Audit hook:**
New test `test_alerts_detector.py::test_warmup_to_live_transition_emits_pending` — construct a state where `now - rule.created_at == WARMUP_SECONDS + 1s` AND `current_value > threshold_fire`, assert returned signal is `PENDING_FIRE`, not `FIRING`.

---

### Pitfall 4: ALRT-14 Haiku grammar drift produces silently-miscoded rules

**What goes wrong:**
A user types "alert me when latency for the deploy skill goes above 5 seconds" into the NL composer. Haiku returns:
```json
{"name": "deploy slow", "metric": "skill_latency_p95", "threshold_fire": 5000}
```
Note: `skill_latency_p95` is NOT in `_SCOPE_EXTRACTORS` (which has `skill_p95_latency_ms` — different word order). The Pydantic validator at `backend/cmc/api/schemas/alerts.py:69` rejects it with `"unknown metric: skill_latency_p95"` → 422. UX shows a generic error. Worse: if the user accepts a "best guess" fallback, the rule is silently created against the wrong metric (e.g., `cost_usd_24h`) and never fires, or fires on the wrong dimension.

**Why it happens:**
1. Haiku does not have access to the `_SCOPE_EXTRACTORS` vocabulary at inference time unless we pass it in the system prompt, but operators write metric names by feel ("p95 latency", "tail latency", "slow skills"). Even with vocabulary in-context, Haiku will paraphrase.
2. The shipped Haiku integrations (`backend/cmc/schedules/nlcron.py:21`, `backend/cmc/dispatcher/skill_router.py:39`) handle this in two opposing ways: nl_to_cron returns `None` on unparseable input (forces user to retry); skill_router returns the *exact* skill name (validated against the local registry — `skill_router.py:98-103`). The skill_router pattern is the right one for ALRT-14.

**How to avoid:**
Mirror `skill_router.py` exactly:
1. **Pass the vocabulary in the system prompt.** Build the prompt by enumerating `_SCOPE_EXTRACTORS.keys()` with one-line human descriptions, then instruct Haiku to output `{"metric": "<exact-key>", ...}` from the provided list ONLY.
2. **Hard-validate the response.** Same pattern as `skill_router.py:98-103`: `if chosen not in valid_metrics: log "hallucinated_metric"; return None`. Add `if not is_known_metric(parsed["metric"])` (already importable from `cmc.alerts.scopes`) as the second-line defense.
3. **NEVER ship a "best-guess" fallback rule.** On parse/validate failure, the UI MUST show "Couldn't parse — please use the form" and prefill the form with raw NL text + nothing else. The user explicitly clicks "Create" on the form, never on the NL preview.
4. **Lazy-import AsyncAnthropic** inside the function body (`backend/cmc/schedules/nlcron.py:30`, `backend/cmc/dispatcher/skill_router.py:76` — both do this) so module import does not require ANTHROPIC_API_KEY.

**Warning signs:**
- A test seeds Haiku with an obvious request ("alert when cost over $50") and the parse fails with a metric outside `_SCOPE_EXTRACTORS`.
- Log line `dispatcher.alerts.nl_parser.hallucinated_metric` appears in `data/logs/server.log`.
- A user-reported alert "doesn't fire" — investigation reveals `rule.metric` is a plausible-but-unknown string (the AlertRuleCreate validator should have rejected it; if it slipped through, the validator was bypassed).

**Phase to address:**
Phase that delivers ALRT-14.

**Audit hook:**
1. New test `test_alerts_nl_parser.py::test_hallucinated_metric_returns_none` — mock AsyncAnthropic, force return of `{"metric": "fake_metric"}`, assert parser returns None and logs `hallucinated_metric`.
2. New test `test_alerts_nl_parser.py::test_vocabulary_in_system_prompt` — inspect the constructed system prompt string, assert every key from `_SCOPE_EXTRACTORS` appears verbatim.
3. AST grep guard: `cmc/alerts/nl_parser.py` (or wherever ALRT-14 lands) must NOT have a path that returns an `AlertRuleCreate` object directly to the API without going through `is_known_metric()`.

---

### Pitfall 5: ALRT-14 NL parser cost balloons (no caching)

**What goes wrong:**
Every keystroke / form-debounce in the NL composer hits Anthropic at ~$0.25 per million input tokens. With a 600-token vocabulary system prompt + 50-token user prompt × 100 form-edit cycles per session × ~5 sessions per day, the user runs $0.05+/day on a feature most users will use ~5 times total. `cmc.pricing.compute_cost` doesn't track ALRT-14's outbound spend (the read-time `compute_cost` only attributes ingested API calls FROM Claude Code sessions, not OUR app's calls).

**Why it happens:**
The NL→cron precedent (`backend/cmc/schedules/nlcron.py`) is rate-naive — it just calls Haiku per request with no caching. That's fine because cron NL parsing happens once-per-schedule-creation. ALRT-14 is also once-per-rule-creation IF the UX is right, but the natural temptation is to live-preview the parsed rule as the user types, which multiplies API calls 10-50×.

**How to avoid:**
1. **No live-preview.** NL→AlertRule fires only on explicit "Parse" button click or form-blur, never on keystroke. Mirror the schedule composer's `getByLabel('Advanced cron').blur()` debounce path (verified in `frontend/tests/e2e/schedule-composer.spec.ts:60`).
2. **Cache by exact input string.** Use TanStack Query with `queryKey: ['nlAlertParse', trimmedPrompt]` and `staleTime: Infinity` — same input string returns the same parsed rule without re-hitting Haiku. Mirror the cadence-bucket convention at `frontend/src/lib/queries.ts:124+` (no NEW polling cadence — this query is on-demand, not interval-driven).
3. **Never poll.** This violates the 30s React Query cadence convention (see Pitfall 17).

**Warning signs:**
- Every keystroke in the NL composer emits a `useNlAlertParse` network call (visible in browser DevTools network tab).
- The Anthropic API usage dashboard shows hundreds of `claude-haiku-4-5` requests against the user's key in a day.

**Phase to address:**
Phase that delivers ALRT-14.

**Audit hook:**
Component test `AlertRuleForm.test.tsx::nl_parse_does_not_fire_on_each_keystroke` — fire 10 input-change events, assert `vi.mocked(fetchNlParse)` was called ≤ 1 time.

---

### Pitfall 6: ANLY-06 cost forecast — partial-month bias projects 4× usage

**What goes wrong:**
Linear extrapolation of week-1 cost to the full month: spent $50 in 7 days → forecast = $50 × (30/7) ≈ $214. The user panics and disables auto-runs. In reality, the user's pattern is "burst on Monday, idle weekends," and the actual month-end cost is $80. The forecast is wildly wrong because it assumes uniform daily distribution, ignores weekday/weekend bias, and has no smoothing for week-1 volatility.

**Why it happens:**
"Linear extrapolation" reads as the simplest possible math — `total_so_far / days_elapsed × days_in_month`. It is also nearly-useless for monthly-bursty cost series where 80% of the spend lands on 3 weekdays. The shipped 24h cost extractor (`backend/cmc/alerts/scopes.py:57-85`) computes a 24h window, which by symmetry has a similar (but smaller) bias near hour-1 of any 24h period.

**How to avoid:**
1. **Suppress forecast when sample is too small.** If `days_elapsed < 7`, return `forecast=null` + UI shows "Forecast available after 7 days of data." Mirror the `low_sample` discipline shipped at `frontend/src/components/panels/SkillLatencyTable.tsx:14-17` — backend is source of truth.
2. **Use a 14-day rolling baseline as the forecast denominator**, NOT `days_elapsed_in_month`. `forecast = (cost_last_14_days / 14) × days_remaining_in_month + cost_so_far_this_month`. This collapses the partial-month bias because the rolling window is full-length even on day 1 of a new month.
3. **Forecast on weekday-weighted average** when the rolling sample has both weekdays and weekends. Group-by `strftime('%w', day)` to weight each day-of-week by its remaining-in-month count. This is one extra `GROUP BY` over `token_usage` — cheap.
4. **Render forecast with explicit confidence band** in the UI: "Projected $80–$140" not "Forecast: $112". A range communicates uncertainty; a point estimate misleads.
5. **Document the algorithm in the panel as a tooltip.** "Based on 14d rolling average, weekday-weighted." Operator can reason about the number.

**Warning signs:**
- Forecast jumps by >2× between consecutive days early in the month.
- Forecast on day-1 of a new month is exactly equal to (previous-month total × 30 ÷ 1).
- Test fixture seeds 7 days of bursty data, forecast deviates from the next-7-day actual by more than 30%.

**Phase to address:**
Phase that delivers ANLY-06.

**Audit hook:**
1. New test `test_cost_forecast.py::test_partial_window_returns_null` — seed `token_usage` with 3 days of data, assert response has `forecast: None` and `confidence: "insufficient_data"`.
2. New test `test_cost_forecast.py::test_weekend_weighted_baseline` — seed 14 days where weekdays cost 10× weekends, assert forecast at end-of-week-1 is within 15% of an end-of-month replay.

---

### Pitfall 7: ANLY-07 / SKLP-08 cwd cardinality blowup + privacy leak

**What goes wrong:**
Per-project breakdown groups by `cwd`, which is a free-form filesystem path. A power user has:
- `/Users/alice/work/git/secret-customer-project/`
- `/Users/alice/work/git/secret-customer-project` (no trailing slash, written by a different shell session)
- `/Users/alice/work/git/secret-customer-project/.worktrees/feature-x/`
- `/private/tmp/scratch-2026-04-12/`

These render as 4 separate "projects" in the SKLP-08 / ANLY-07 cards. Worse: the full cwd string is sent to the frontend (`backend/cmc/api/routes/observability.py:464` `cwd=r["cwd"]`) — full paths leak into HAR exports, Sentry breadcrumbs (if any), and `data/logs/server.log` request bodies. The `_HOME_RE = re.compile(r"^/Users/[^/]+/")` (`observability.py:448`) only strips the home prefix at *display* time; the raw cwd is still in the JSON response.

**Why it happens:**
The shipped `ProjectBreakdownCard` (`frontend/src/components/panels/ProjectBreakdownCard.tsx:1-9`) deliberately chose cwd-as-key with a comment "Backend already supplies display_path (home-dir stripped) — never re-implement the regex client-side." That's correct for display, but the *grouping key* still exposes the full cwd in API responses. v1.2 panels copying this pattern inherit both the cardinality blowup and the leak.

**How to avoid:**
1. **Normalize cwd before grouping.** Backend computes `project_id = sha1(realpath(rstrip('/').rstrip('\\')))[:12]` and groups by `project_id`. The display_path comes from a separate column. This collapses (a) trailing-slash variants and (b) symlinks pointing to the same project, while never sending the cardinality-blowing variants to the client. Add a migration to backfill an indexed `sessions.project_key` column and switch the breakdown queries to `GROUP BY project_key`.
2. **Cap rendered projects.** Top-N=20 + "everything else" rollup row. Prevents a 50-project workspace from rendering 50 rows. Mirror `MIN_LATENCY_SAMPLES = 30` cap pattern at `backend/cmc/api/routes/skills.py:368` — backend caps, frontend trusts.
3. **Privacy at API boundary, not just at render.** The /api/sessions/by-project response should return `display_path` and `project_key` ONLY. Drop the raw `cwd` from the response model (`backend/cmc/api/schemas/observability.py:106`). Existing single-project deep-link views (e.g. session details) can keep `cwd` since they're already past the project picker.
4. **Skill breakdown gets the same treatment.** SKLP-08 per-project skill breakdown JOINs `sessions.project_key` not `sessions.cwd`.

**Warning signs:**
- The /api/sessions/by-project response contains 30+ items with paths that share a common prefix (e.g. 5 `worktrees/feature-*` of the same root).
- A network-trace screenshot pasted into a bug report contains a private project path.
- Test: create the same session under both `/foo/bar/` and `/foo/bar`, expect 1 row in the rollup, get 2.

**Phase to address:**
Phase that delivers ANLY-07 (and SKLP-08 in the same wave — these share the project-key normalization).

**Audit hook:**
1. Migration test `test_migrations.py::test_project_key_backfill` — apply migration, assert `sessions.project_key IS NOT NULL` for all rows.
2. Schema test `test_observability_router.py::test_by_project_response_no_raw_cwd` — assert `'cwd' not in response.json()['items'][0]`.
3. Cardinality test `test_observability_router.py::test_trailing_slash_collapses` — insert 2 sessions cwd `/x/y` and `/x/y/`, assert `len(items) == 1`.

---

### Pitfall 8: SKLP-09 period-over-period — DST and month-end edge cases

**What goes wrong:**
"This week vs last week" is computed as `(now, now - 7d)` and `(now - 7d, now - 14d)`. On the DST transition week, the "this week" window is 7d×24h = 168h but contains only 167 wall-clock hours (or 169). The previous-period delta is computed over a 168h window. Result: a 0.6% phantom delta on every DST boundary. Worse: month-end "this month vs last month" comparing February (28 days) to January (31 days) reports a 10% drop that is purely calendar-driven.

**Why it happens:**
`datetime.now(UTC) - timedelta(days=7)` is the obvious-and-wrong way to define "this week vs last week." The shipped scope extractors (`backend/cmc/alerts/scopes.py:66`) use `now - timedelta(hours=24)` — fine for a sensor metric but wrong for a UI delta where the user sees "−10%" and reads it as a behavior change.

**How to avoid:**
1. **Use day-boundaries, not hour-boundaries.** `since = datetime(now.year, now.month, now.day, tzinfo=UTC) - timedelta(days=7)` snaps to local midnight. Alembic migration not required — this is a query-time change.
2. **For "month over month," use full-month chunks** with explicit calendar-aware day-count normalization. `delta_pct = (current_total / current_days_elapsed) / (previous_total / previous_days_in_month) - 1` — compares daily averages, not month totals.
3. **Reference period is "prior period of the same length, ending at start of current period."** Sticky, not rolling. "Last 7 days" delta uses days `[now-14, now-7]` — never `[now-13.5, now-6.5]`.
4. **Document the comparison window in the panel.** `"vs prior 7d (Apr 22 – Apr 28)"` — operator can verify the boundaries.

**Warning signs:**
- Delta non-zero on a metric that hasn't changed (synthetic test: same data in both windows → delta should be 0.0%).
- Delta jumps by >5% on the DST transition day with no actual usage change.
- Month-end "this month vs last month" delta dominated by `(days_in_this_month / days_in_last_month)` term.

**Phase to address:**
Phase that delivers SKLP-09.

**Audit hook:**
New test `test_skills_router.py::test_period_over_period_constant_series` — seed 14 days of identical daily totals, assert delta = 0.0 (currently with hour-arithmetic, this would deviate around DST).

---

### Pitfall 9: SKLP-10 "new" / "dormant" badges — cold start makes everything new

**What goes wrong:**
On first install, every skill in `~/.claude/skills/` is "new this week" because it has no prior `skill_activated` events. The Skills page paints a wall of "New" badges. After 2 weeks, every skill ages out into a stable state... unless the user adds a new skill to the directory (genuine "new"), in which case the badge is correct. The threshold isn't tunable and the cold-start case isn't distinguished from real novelty.

A second failure: a user renames a skill from `deploy-prod` to `deploy-production`. Old name's `attrs_skill_name` events stop landing; new name's events have no history, so the new name is "new" (cosmetically true) and the old name is "dormant" (also cosmetically true) — but the user sees both badges and is confused: "did the skill stop working?" Both badges fire on the same logical skill.

The skills table (`backend/cmc/db/models/skills.py`) has NO `first_seen_at` column. Without it, "new" can only be inferred from the absence of `skill_activated` events older than 7 days — which is exactly what causes the cold-start storm.

**Why it happens:**
Skill identity is keyed on `name` (PRIMARY KEY at `backend/cmc/db/models/skills.py:19`). Renames break identity. Cold start has no concept of "first-app-launch" reference time.

**How to avoid:**
1. **Add `skills.first_seen_at` column** in a migration. Default = `coalesce(MIN(otel_events.ts) WHERE attrs_skill_name = name, skills.updated_at)`. "New" = `first_seen_at` within last 7 days AND `app_install_age > 7 days`. This eliminates the cold-start storm.
2. **Track app-install age.** Add a singleton row in `system_state` table (it already exists per `backend/cmc/db/models/system_state.py`) with key `installed_at` set on first migration apply. Suppress all "new"/"dormant" badges when `now - installed_at < 7d`.
3. **For renames: do not auto-detect.** A renamed skill IS a new skill from the data's perspective. Add a "Skill renamed?" affordance in the Skills detail page (manual operator action) that copies `first_seen_at` and `last_seen_at` from old name to new name. v1.2 ships without auto-rename detection — that's a v1.3+ heuristic.
4. **Threshold tuning surfaces in Settings, not as constants.** Two thresholds (`new_window_days = 7`, `dormant_window_days = 14`) live in `Settings` so power users can tune; defaults are hard-coded sensible values.

**Warning signs:**
- Fresh local install with no JSONL history shows "New" on every skill.
- A skill that has run 1000 times in the last hour has the "Dormant" badge because of a name typo somewhere upstream.
- The Skills registry shows two skills with similar names, one "New" + one "Dormant," logged within the same hour.

**Phase to address:**
Phase that delivers SKLP-10.

**Audit hook:**
1. Migration test `test_migrations.py::test_first_seen_at_backfill` — run migration on a DB with N skills and N×100 otel_events, assert every skill has `first_seen_at == MIN(events.ts)`.
2. Component test `SkillsRegistry.test.tsx::test_cold_start_no_badges` — render with `installed_at = now - 1d`, assert zero "New" and zero "Dormant" badges in the DOM regardless of skill data.

---

### Pitfall 10: SKLP-11 latency overhead breakdown — the data isn't there

**What goes wrong:**
SKLP-11 spec says "per-skill latency overhead breakdown — body vs subagent vs tool decomposition." The existing `skill_activated` event has only ONE latency field: `duration_ms` (a single end-to-end measurement, capped at 600_000ms per `backend/cmc/ingest/jsonl_parser.py:284`). There is no `body_ms`, `subagent_ms`, or `tool_ms` decomposition in the OTEL payload, no separate timing in the JSONL ingest, and no schema column for it. Implementer either (a) ships a fake decomposition computed by ratio guesswork, (b) adds a new event type that no producer emits, or (c) discovers this mid-phase and either descopes or blocks.

**Why it happens:**
The roadmap calls this out as carry-over from v1.1 deferred work and the brief mentions Phase 14's `SkillTimeline`, but Phase 14's timeline shows per-event latency as a single `duration_ms` (`backend/cmc/api/routes/skills.py:600`). The decomposition data has never existed in the codebase — implementer assumes it's in `attrs` or in the OTEL body but actually has to design and emit it.

**How to avoid:**
1. **Phase entry gate: feasibility spike.** Before the SKLP-11 plan locks, run a 2-hour spike: open a sample `data/.claude/projects/<hash>/<session>.jsonl` and a sample OTEL log, search for any per-phase timing field. If absent, escalate immediately.
2. **Workaround: derive from JOIN, not from a new field.** Per-skill latency overhead can be APPROXIMATED as `skill_activated.duration_ms - SUM(tools.duration_ms WHERE session_id = X AND tool_name IN ('Task','SubAgent') AND started_at BETWEEN skill_activated.ts AND skill_activated.ts + duration_ms)`. The `tools` table has `duration_ms` (`backend/cmc/db/models/tools.py:36`) and timestamps. This is a SQL-only solution — no schema change, no new event.
3. **Document the approximation in the panel.** "Body = end-to-end minus tool calls; subagents are tool calls of name=Task." Operator knows what they're looking at.
4. **If the JOIN proves unreliable** (e.g., subagent spawns happen outside the `skill_activated` window), descope SKLP-11 to a v1.3 SPIKE phase. Do NOT ship a fake decomposition.

**Warning signs:**
- A new `attrs_body_ms` index is proposed in a migration — means the implementer thinks the field exists.
- The phase plan front-matter doesn't enumerate the source columns for body_ms / subagent_ms / tool_ms.
- The component renders three identical numbers because the decomposition fell back to `[total/3, total/3, total/3]`.

**Phase to address:**
Phase that delivers SKLP-11. The phase MUST include a research-first plan (or a separate SPIKE phase) that locks the data source before any UI work.

**Audit hook:**
Phase plan acceptance criterion: `Plan front-matter must cite the SQL or schema column that supplies each of body_ms / subagent_ms / tool_ms`. Without those citations, the plan is rejected.

---

### Pitfall 11: CMPR-06 per-skill latency delta — sample-size mismatch silently misleads

**What goes wrong:**
Session A used `deploy` skill 50 times with p95=1200ms. Session B used `deploy` skill 1 time with duration=4500ms. The compare view shows "deploy: +275% latency." The user reads this as a regression. In reality, session B's single sample is uninformative — the +275% is sampling noise. The shipped `SkillLatencyTable` solved this with the `low_sample` Badge (`frontend/src/components/panels/SkillLatencyTable.tsx:59-63` — threshold `MIN_LATENCY_SAMPLES = 30` at `backend/cmc/api/routes/skills.py:368`). The compare-view delta does NOT inherit that discipline.

A second failure: skill `deploy` is in session A's `skills_used` list but not in session B's. The compare view either (a) doesn't render a row at all (delta info lost), (b) renders a row with `null/null/?` (operator confusion), or (c) renders "−100%" (numerically vacuous, suggests deletion).

**Why it happens:**
SKLP-05's low-sample badge is on the per-skill latency endpoint, not on the per-skill compare endpoint. CMPR-06 adds a NEW computation (delta between two sessions) and the implementer sees only "compute the delta," not "guard the delta."

**How to avoid:**
1. **Reuse `MIN_LATENCY_SAMPLES = 30`.** When EITHER side has `sample_count < 30`, render the row with the `Low sample` Badge (same component, same threshold) AND suppress the percentage delta. Show absolute values + Badge instead of "+275%."
2. **For "skill present in only one session," render explicit "—" in the absent column** + a "Only in session A" tag in the row. Same treatment as the existing `SkillSetDiff.only_a / only_b` (`backend/cmc/api/routes/sessions.py:298-302`). This is a UI affordance, not a delta.
3. **Backend-driven low_sample flag.** Add `low_sample_a: bool, low_sample_b: bool` to the per-skill compare row schema. Server is source of truth — frontend mirrors. Same convention as `SkillLatencyResponse.low_sample`.
4. **CMPR-04 over-cap interaction.** When `over_cap=true` on either side, the per-skill compare rollup MUST be skipped on that side (return `tool_counts={}` already, plus add `skill_latency={}` for the rollup). Mirror the existing `if over_cap: tool_counts = {}` branch at `backend/cmc/api/routes/sessions.py:165-166`. The 9-SQL-per-request budget (cited in `backend/cmc/api/routes/sessions.py:128-131` ("denormalized sessions.tool_call_count column") still applies — CMPR-06 must NOT add per-skill SQL outside the existing two `_build_compare_side` calls.

**Warning signs:**
- Delta shown as "+275%" with no badge for a row where one side has sample_count=1.
- Compare view renders a row with `p95=null` on one side and a numeric delta column.
- New SQL queries appear in `_build_compare_side` (`backend/cmc/api/routes/sessions.py:121`); the budget was already 5 (skills, outcome, tool_counts × 2 sides + cost via Python).

**Phase to address:**
Phase that delivers CMPR-06.

**Audit hook:**
1. Component test `SessionCompareView.test.tsx::test_low_sample_suppresses_delta` — render with side A sample_count=50, side B sample_count=1, assert delta-percentage element is absent and `Low sample` badge is present.
2. SQL-budget test `test_sessions_router.py::test_compare_query_count_within_budget` — instrument SQLAlchemy events.before_cursor_execute, assert ≤ 9 statements per /api/sessions/compare request including over_cap path.

---

### Pitfall 12: CMPR-07 Cmd+K "compare with previous" — "previous" is ambiguous

**What goes wrong:**
The shortcut "Compare with previous session" has at least 4 plausible definitions and the wrong default is silently shipped:
1. Most-recent session globally (regardless of cwd / skill) — easy to implement, often wrong intent.
2. Most-recent session in the SAME cwd — "previous version of the same project" — usually correct.
3. Most-recent session that ran the SAME skill set — useful for skill-debugging.
4. Most-recent COMPLETED session (excluding the active one we're in) — relevant when the current session is paused.

A second failure: shortcut bypasses the self-compare guard. The shipped code at `frontend/src/components/ui/CommandPalette.tsx:32` and the backend at `backend/cmc/api/routes/sessions.py:271-274` both block `a == b`. CMPR-07's automated previous-resolver could pick `previous = current` if "current" is the only completed session of that cwd → frontend POSTs `a=X&b=X` → backend returns 400 "cannot compare a session with itself" → shortcut appears broken.

A third failure: "previous" of an ACTIVE session is undefined. If the user invokes Cmd+K on a still-running session, do we wait? Compare to its current snapshot? Skip?

**Why it happens:**
"Previous" is a UX word that maps to multiple data definitions. Without a locked decision, implementer picks #1 (simplest). The self-compare guard is in two places (CommandPalette + backend) and the new shortcut is a third location that has to enforce the same guard.

**How to avoid:**
1. **Lock the definition in the phase plan front-matter:** "previous = most-recent session with the same cwd that has `ended_at IS NOT NULL` AND `session_id != current_session_id`." This is the one-line spec; everything else follows.
2. **Centralize the resolver** in a backend endpoint: `GET /api/sessions/{id}/previous → {session_id} | 404`. Single source of truth; the Cmd+K shortcut calls it; future "Compare with…" affordances also call it. NOT a frontend-side computation.
3. **Self-compare guard is endpoint-level.** `/sessions/{id}/previous` returns 404 when no eligible previous exists (don't return 200 with `session_id == id`). The Cmd+K UX shows a toast: "No previous session found for this project." Mirror the empty-state pattern at `frontend/src/components/ui/EmptyState.tsx`.
4. **Active-session policy: 404.** "Previous of an active session" returns 404 with reason "current session is still running." Compare requires two completed sessions. Document this in the endpoint docstring AND the toast.
5. **Cmd+K self-compare guard parity.** The existing CommandPalette guard at `frontend/src/components/ui/CommandPalette.tsx:110` (`if (chosenSid === currentA) return // self-compare guard (defensive)`) MUST also fire for the new shortcut. Add a unit test that proves the guard is reached.

**Warning signs:**
- "Compare with previous" silently navigates with `a=X&b=X` and the page renders the 400-error state.
- Two separate "previous" computations exist — one in `CommandPalette.tsx` and one in another component.
- Pressing the shortcut on an active session returns the same active session as "previous."

**Phase to address:**
Phase that delivers CMPR-07.

**Audit hook:**
1. New test `test_sessions_router.py::test_previous_session_endpoint_active_returns_404` — create a session with `ended_at = NULL`, call /api/sessions/{id}/previous, assert 404.
2. New test `test_sessions_router.py::test_previous_session_endpoint_only_session_returns_404` — single session in cwd, call /previous, assert 404 (not the same session).
3. Component test `CommandPalette.test.tsx::test_compare_with_previous_self_guard` — mock fetcher to return `session_id == currentA`, assert `navigate` is NOT called.

---

## Polish-tier Pitfalls

### Pitfall 13: `datetime.utcnow` mass-replace breaks tests that mock specific datetime behavior

**What goes wrong:**
Mechanically replacing all 18+ `Field(default_factory=datetime.utcnow)` sites (enumerated above: `mcp_stats.py:27`, `activities.py:25`, `tasks.py:47`, `sessions.py:17`, `otel_metrics.py:23`, `notification_log.py:21`, `live_state.py:30`, `skills.py:28`, `alert_state.py:20`, `decisions.py:45`, `inbox.py:41`, `alert_rules.py:30-31`, `token_usage.py:28`, `system_state.py:23`, `pricing.py:30+182`, `otel_events.py:33`, `schedules.py:30-31`) with `Field(default_factory=lambda: datetime.now(UTC))` does two things:
1. Changes the return-type from naive `datetime` (offset=None) to aware `datetime` (offset=UTC). Code that compares stored datetimes against naive UTC (e.g. SQL `text("WHERE ... >= datetime(:since)")` with `since.isoformat()` at `backend/cmc/alerts/scopes.py:163-164`) will now get an ISO string with `+00:00` suffix, which SQLite's `datetime()` function may parse differently.
2. Tests that use `freeze_time("2026-04-25T00:00:00")` (naive) and compare model fields (now aware) will get `TypeError: can't compare offset-naive and offset-aware datetimes`.

The shipped `_utcnow_naive()` helper at `backend/cmc/dispatcher/alerts.py:73-75` exists exactly to bridge this — it returns naive UTC. The mass-replace must preserve naive-ness for SQLite-storage compat.

**Why it happens:**
The Pydantic v2 / Python 3.13 deprecation message for `datetime.utcnow` says "use `datetime.now(UTC)`" — which returns AWARE. The replacement seems trivial, but the storage and comparison conventions throughout cmc rely on NAIVE UTC.

**How to avoid:**
1. **Replace with naive-UTC.** `Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None))` — exact mirror of `_utcnow_naive()` at `backend/cmc/dispatcher/alerts.py:73-75`.
2. **Centralize the helper.** Move `_utcnow_naive` to `cmc/core/time.py` (new file) and have all 18+ sites import it. One function, one definition, easy to grep.
3. **Add a grep guard.** Same pattern as `test_telegram_grep.py:29` (`re.compile(r"\bparse_mode\s*=(?!=)"))` — guard regex `r"datetime\.utcnow\b"` over `cmc/` should match zero files post-cleanup.
4. **Run full test suite + integration**: 245+ tests across backend; verify zero new failures, zero new aware-vs-naive comparison errors.

**Warning signs:**
- New `TypeError: can't compare offset-naive and offset-aware datetimes` failures in tests.
- `data/cmc.db` SQL queries return wrong row counts after the replace (silently — they don't error).
- A scope extractor query that filtered on `ts >= datetime(:since)` starts matching zero rows or all rows.

**Phase to address:**
Phase that delivers the polish pass.

**Audit hook:**
1. Grep guard test `test_no_datetime_utcnow.py::test_zero_utcnow_in_cmc` — `assert subprocess.run(["grep", "-rn", "datetime.utcnow", "cmc/"], capture_output=True).stdout == b""`.
2. Single-source helper test — every model class with a `default_factory` for datetime fields imports from `cmc.core.time`, not from `datetime` directly. AST-grep rule.

---

### Pitfall 14: `SchedulesCard.test.tsx > stale row` — `Date.now()` flake (NOT `vi.useFakeTimers`)

**What goes wrong:**
The brief suggests `vi.useFakeTimers` is "likely needed" for the time-of-day flake. Looking at the actual test (`frontend/src/components/panels/__tests__/SchedulesCard.test.tsx:53`):
```typescript
last_run_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
```
And the implementation at `frontend/src/components/panels/SchedulesCard.tsx:182`:
```typescript
const ageMs = Date.now() - new Date(s.last_run_at).getTime()
return ageMs > 48 * 3600 * 1000
```
The flake is NOT a timer-callback issue (no `setTimeout`, no `setInterval`). It's a `Date.now()` mismatch: between fixture-construction (line 53) and component-render (downstream of line 78 `client.setQueryData`), `Date.now()` advances by O(1ms). Almost always 72h > 48h holds. But on a very slow CI run (or a clock with millisecond skew), the fixture is constructed at the boundary of a timezone-DST minute and the render side reads `Date.now()` after a clock jump — boundary breaks. `vi.useFakeTimers` would NOT help unless the fixture ALSO advances the fake clock between construction and render, which the test doesn't do.

**Why it happens:**
"Time-of-day flake" sounds like timer issue → reach for `vi.useFakeTimers`. The actual fix is to make the test deterministic by using a CONSTANT `Date` reference, not the live `Date.now()`.

**How to avoid:**
1. **Don't use `vi.useFakeTimers`** — it's the wrong tool here. `vi.useFakeTimers` is for `setTimeout` / `setInterval` callbacks (verified: `EmergencyStopBanner.test.tsx:63` uses it for the 5_000ms re-disarm timer; `RelativeTime.test.tsx:36` for relative-time updates). Neither pattern applies to SchedulesCard.
2. **Inject `Date.now()` via `vi.spyOn`.** Pin `Date.now` to a constant: `vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-27T15:00:00Z').getTime())`. Both the fixture and the implementation now read the same epoch ms.
3. **Inline the fixture's last_run_at.** Replace `new Date(Date.now() - 72 * 3600 * 1000).toISOString()` with a literal `'2026-04-24T15:00:00Z'` paired with `Date.now()` mocked to `'2026-04-27T15:00:00Z'`. 72h fixed; no boundary risk.
4. **Verify the assertion.** The 48h cutoff at `SchedulesCard.tsx:183` is not the flake source; the input data is. After mocking, `ageMs = (2026-04-27T15:00) - (2026-04-24T15:00) = 72h` exactly.

**Warning signs:**
- The fix uses `vi.useFakeTimers()` AND `vi.advanceTimersByTime` AND the test passes — but only because `setQueryData` happens to flush within the advanced window. Actual root cause unaddressed; flake returns under load.
- Test passes locally (fast machine) and fails on slow CI runners.

**Phase to address:**
Polish phase.

**Audit hook:**
After the fix, `git log -p -- frontend/src/components/panels/__tests__/SchedulesCard.test.tsx` should show `vi.spyOn(Date, 'now')` added, NOT `vi.useFakeTimers()`.

---

### Pitfall 15: `schedule-composer.spec.ts` aria-label collision — wrong fix is brittler than no fix

**What goes wrong:**
The user note suggests "Playwright `getByRole('combobox', { name: /Filter skill name/, exact: true })` strict-mode pitfall — better to use `data-testid`." Inspection: `frontend/src/components/panels/SkillTimeline.tsx:74` has `aria-label="Filter skill name"`. ScheduleComposer at `frontend/src/components/panels/ScheduleComposer.tsx:207` has `aria-label="Days of week"`. The Playwright spec at `frontend/tests/e2e/schedule-composer.spec.ts:54` uses `page.getByLabel('Name')` — does NOT currently filter by skill name and does NOT collide on the skills page in v1.1.

The collision arises in v1.2 when the schedule composer is opened from `/skills` (already the case — line 39 `await page.goto('/skills')`) AND a new SKLP-08 panel renders SkillTimeline-style controls on the same page. The two `aria-label="Filter skill name"` instances fail Playwright strict mode.

The naive fix is `getByLabel('Filter skill name')` → `getByLabel('Filter skill name').first()`. This is brittle: silently picks element-0 in DOM order, which can flip when panel order changes in a future phase.

The brief's `data-testid` suggestion is correct but needs to be applied to BOTH controls and the SELECTOR must use `getByTestId`, not `getByRole/Label`.

**Why it happens:**
1. The skills page renders multiple panels (SkillsRegistry, SchedulesCard, SkillTimeline, etc.); each panel has its own filter affordances; aria-label collisions are inevitable as panel count grows.
2. Playwright strict-mode rejects ambiguous role/label matches. Strict mode is on by default in `@playwright/test ≥ 1.30`.

**How to avoid:**
1. **Add `data-testid` to controls that are referenced from E2E specs.** Pattern: `data-testid="skill-timeline-filter"`, `data-testid="schedules-card-filter"`, etc. Namespace by component.
2. **Selector pattern: `page.getByTestId('skill-timeline-filter')`.** No role/label dance. Works under strict mode regardless of how many similar controls render on the page.
3. **`data-testid` is a convention, not a leak.** Don't strip it in production builds — it's a few bytes per element. Vite default is to keep it.
4. **DO NOT** use `.first()` / `.nth(0)` as a fix. That's a band-aid that re-fires the moment DOM order changes.
5. **Document the convention.** A short note in `frontend/tests/e2e/README.md` (create if absent) — "All E2E-targeted controls use `data-testid` namespaced by component."

**Warning signs:**
- A fix uses `.first()` or `.last()` on a `getByRole` / `getByLabel` matcher.
- Two separate components in the SAME page render the same `aria-label` string.
- E2E test passes after fix but a new spec written 2 weeks later hits the same collision.

**Phase to address:**
Polish phase.

**Audit hook:**
1. Lint rule (eslint-plugin-jsx-a11y or custom) flagging duplicate `aria-label` strings within the same route is overkill — instead: a spec-level convention test that scans `frontend/tests/e2e/` for `getByRole.*name` and warns if `name` is a regex (regex-based name match is the strict-mode trap).
2. After the fix, re-run the spec with `--workers=4` to verify no flakiness from parallel runs.

---

## Integration / cross-feature Pitfalls

### Pitfall 16: KNOWN_METRICS desync between backend and frontend

**What goes wrong:**
Adding any new metric (cost forecast for ANLY-06, per-project cost for ANLY-07, period-over-period delta for SKLP-09, anomaly metric for ALRT-13) requires updating BOTH:
- Backend: `_SCOPE_EXTRACTORS` at `backend/cmc/alerts/scopes.py:171` AND its accompanying SQL/extractor.
- Frontend: `KNOWN_METRICS` at `frontend/src/components/panels/AlertRuleForm.tsx:35-39`.

Implementer adds the metric to one side, ships it, doesn't notice the other side is stale until a user tries to create an alert rule for the new metric and the form's dropdown doesn't show it. Or: backend rejects the rule with 422 because the frontend constant has a typo (`'cost_usd_30d'` vs the backend's `'cost_usd_24h'`). The shipped comment at `frontend/src/components/panels/AlertRuleForm.tsx:9-13` flags this as a known sync risk: "Phase 17 may fetch dynamically. Server still validates via is_known_metric so a stale client constant 422s cleanly."

**Why it happens:**
Two separate constants + two separate languages + two separate code-review surfaces. Easy to update one and forget the other.

**How to avoid:**
1. **Server-driven vocabulary.** New endpoint `GET /api/alerts/metrics → {items: [{value, label, kind}]}` that enumerates `_SCOPE_EXTRACTORS.keys()` server-side. Frontend `useAlertMetrics()` query with `staleTime: Infinity` (vocabulary is process-lifetime constant; only changes on app restart). Eliminates the constant-mirror drift entirely.
2. **Phase-plan acceptance criterion:** Any phase that adds a new metric MUST include a step "update KNOWN_METRICS" in the plan. Don't rely on memory.
3. **CI sync test.** Until the dynamic endpoint ships: test `test_alerts_router.py::test_known_metrics_sync` reads `_SCOPE_EXTRACTORS.keys()` and `frontend/src/components/panels/AlertRuleForm.tsx`, asserts the SET of values matches.

**Warning signs:**
- A user reports "I created the alert but it doesn't appear in the dropdown" — symptom of frontend-stale.
- A user reports "I select X in the dropdown and creation fails 422" — symptom of backend-stale.
- A new metric appears in `_SCOPE_EXTRACTORS` and `git grep KNOWN_METRICS` shows zero matches in the same PR diff.

**Phase to address:**
Any phase that adds a new metric. Best handled by shipping the dynamic-endpoint solution in the SAME phase as the first new metric (one-time investment, eliminates the class).

**Audit hook:**
Sync test `test_alerts_router.py::test_metric_vocabulary_matches_frontend_constant` — until the dynamic endpoint ships.

---

### Pitfall 17: React Query polling cadence violation (5s/10s panels for "responsiveness")

**What goes wrong:**
A new SKLP-09 / SKLP-10 / ANLY-06 / ANLY-07 panel is built with `refetchInterval: 5_000` because "delta deserves to feel snappy." Now the dashboard makes 12 panels × 0.2 polls/sec = 2.4 RPS background load on the FastAPI server, the SQLite WAL grows, and the Chrome tab burns more CPU. The shipped convention at `frontend/src/lib/queries.ts:124+` is documented:
- 5_000ms ONLY for live ingest (firehose, live sessions).
- 10_000ms for active feedback loops (decisions awaiting answer).
- 30_000ms for "monitoring" panels (alerts, schedules).
- 60_000ms for slow-changing aggregates (skill summaries, project rollups).

Every v1.2 panel is a "monitoring" or "slow aggregate" — 30s or 60s — never 5s.

**Why it happens:**
The implementer copies a nearby query without inspecting its cadence. Or chases a perceived UX win ("delta feels stale at 30s"). Or copies from a v1.0 commit predating the cadence convention.

**How to avoid:**
1. **Read the convention header.** `frontend/src/lib/queries.ts:1-15` documents the four cadence buckets. Every new query must justify its cadence by referencing one of them.
2. **Phase plan front-matter:** new query keys list their cadence-bucket explicitly. PR review rejects any cadence < 30s without justification.
3. **No interval polling for forecast / period delta / per-project cost.** Those are display-time computations off rolling daily aggregates — refresh on user navigation or on manual refresh button. `refetchInterval: false` + `staleTime: 60_000`.
4. **Window-focus refetch is the cheap win.** If the user backgrounds the tab for 5 minutes and returns, refetch then — not on a fixed interval. `refetchOnWindowFocus: true` (default), `refetchInterval: false`.

**Warning signs:**
- New query in `lib/queries.ts` with `refetchInterval` < 30_000 and the metric isn't ingest-related.
- Backend logs (`data/logs/server.log`) show /api/cost/forecast hit 12+ times per minute from a single tab.
- The browser DevTools Network tab shows a continuous green-bar pattern for non-firehose endpoints.

**Phase to address:**
Every phase that adds a new query.

**Audit hook:**
Lint rule or grep guard: `grep -rn "refetchInterval: [0-9]_*" frontend/src/lib/queries.ts | grep -E "[1-9]_?000," | grep -v "_5_000.*firehose\|_10_000.*decisions"` — flags low-cadence queries; manual review needed for each match.

---

### Pitfall 18: ALRT-12 invariant accidentally broken by ALRT-14 NL parser

**What goes wrong:**
Implementing ALRT-14 (NL → AlertRule) tempts the implementer to "make it useful" by also auto-spawning a related task: "alert me about deploys, and run the verifier when it fires." The NL prompt could plausibly request a task action; the parser could plausibly emit `task_template=...`. If the parser then writes BOTH an alert rule AND queues a task, it has imported `cmc.dispatcher.tasks` directly or indirectly — the ALRT-12 invariant ("alert engine is sensors not actuators, NEVER imports `cmc.dispatcher.tasks`") is broken. The shipped invariant test at `backend/tests/test_alerts_dispatcher.py::test_no_tasks_import` (referenced at `backend/cmc/dispatcher/alerts.py:14-15`) breaks.

**Why it happens:**
ALRT-14's "NL → rule" framing reads like NL → "automation," and "automation" naturally bundles trigger + action. The invariant lives in a comment + a test; the implementer who skipped reading the comment writes the natural feature.

**How to avoid:**
1. **NL parser MUST output ONLY `AlertRuleCreate`.** No `TaskCreate`, no `ScheduleCreate`. The phase plan locks the output schema in front-matter with a "MUST NOT include" list.
2. **Read the existing invariant test before writing the parser.** `backend/tests/test_alerts_dispatcher.py::test_no_tasks_import` is the ALRT-12 lock. Run it before AND after the parser lands.
3. **If the NL prompt requests an action ("notify me AND run verifier")**, the parser splits the request: returns the alert rule, AND surfaces a follow-up affordance "you also asked for a task; create that separately?" Two explicit user actions, not one merged write.

**Warning signs:**
- `cmc/alerts/nl_parser.py` (or wherever ALRT-14 lands) has `from cmc.dispatcher.tasks import ...` or any indirect path through it.
- The parser's output includes a `task_template` field.
- `test_no_tasks_import` fails or is modified.

**Phase to address:**
Phase that delivers ALRT-14.

**Audit hook:**
Existing AST test `test_alerts_dispatcher.py::test_no_tasks_import` extends to scan ALL modules under `cmc/alerts/` (not just the dispatcher). Add `cmc/alerts/nl_parser.py` to its scope explicitly.

---

### Pitfall 19: Phase 17 `parse_mode=` grep guard regression

**What goes wrong:**
ALRT-13 anomaly alert formatting needs richer text — implementer adds `parse_mode='HTML'` or `parse_mode='Markdown'` to the new alert composer in `cmc/telegram/messages.py` to render bold metric names, code-blocked thresholds, etc. The test at `backend/tests/test_telegram_grep.py::test_no_parse_mode_assignments_in_telegram_pkg` (regex `\bparse_mode\s*=(?!=)` over `cmc/telegram/`) fails. Implementer is tempted to add an `# noqa: parse_mode_grep` exemption to bypass.

**Why it happens:**
Plain-text Telegram is a v1.1 invariant (Phase 17 lock). The reason is documented at `backend/tests/test_telegram_grep.py:17-22`: rich-format injection from user-controlled fields (skill names, scope keys, rule names) is a Telegram-side rendering vulnerability. The regex IS the lock — bypassing it removes the lock.

**How to avoid:**
1. **Plain text only.** New alert formatters compose plain UTF-8 strings. Use leading emoji (🚨 ✅ ⚠️) and newlines for structure, never markdown.
2. **DO NOT add `parse_mode=`.** The grep test is a directory-wide guard, not a per-call exemption point.
3. **If formatting truly needs richness, escape user-controlled fields first** — but this is out of scope for v1.2 polish. Defer to v1.3+ with an explicit RFC.

**Warning signs:**
- A new line `parse_mode='HTML'` (or 'Markdown', or 'MarkdownV2') in `cmc/telegram/`.
- `pytest backend/tests/test_telegram_grep.py` red after a v1.2 alert formatter PR.

**Phase to address:**
Any phase that touches `cmc/telegram/` (most likely the ALRT-13/14 phases).

**Audit hook:**
Existing grep guard `test_telegram_grep.py::test_no_parse_mode_assignments_in_telegram_pkg` — already in place. Verify it remains green at every phase verifier checkpoint.

---

### Pitfall 20: Wave-1/wave-2 single-writer convention broken on REQUIREMENTS.md

**What goes wrong:**
Two phases in the same wave both edit `.planning/REQUIREMENTS.md` (e.g. SKLP-08 phase adds a row + ANLY-07 phase adds a row, both running in parallel waves). Git merge conflict on the traceability table. Resolution requires hand-editing the merge marker — which often discards one phase's row silently. The Phase 16-04 / 17-06 precedent (`.planning/STATE.md` Decisions log) established the wave-1/wave-2 single-writer convention specifically to prevent this.

**Why it happens:**
Multiple phases land in parallel; each phase's plan independently includes "add row to REQUIREMENTS.md traceability table"; the orchestrator forgets to enforce the single-writer rule.

**How to avoid:**
1. **One wave = one writer to REQUIREMENTS.md.** Roadmap phase ordering must put REQUIREMENTS.md edits in wave-1 (single phase) OR wave-2 (single phase), never both. Phase 16-04 and 17-06 are the cited precedent.
2. **Rest of the wave's phases stage their REQUIREMENTS.md changes as comment blocks** in the phase summary file (`.planning/phases/<phase>/SUMMARY.md`), and the writer phase batches them into one commit.
3. **The MILESTONE-AUDIT documents the cosmetic checkbox markers carry-over** — these are fixed in the same single-writer pass that adds new v1.2 rows, not in a separate phase.

**Warning signs:**
- Two open PRs both modify `.planning/REQUIREMENTS.md`.
- A merge conflict on REQUIREMENTS.md mid-roadmap.
- A v1.1 audit cosmetic item ("ALRT-01/02 `[ ]` markers") still present after v1.2 ships.

**Phase to address:**
Roadmap design phase (lock the writer assignment) + the polish phase (which is the writer).

**Audit hook:**
Git pre-commit hook that fails if `.planning/REQUIREMENTS.md` is edited in a phase whose `phase.json` doesn't have `requirements_writer: true`. (Or simpler: phase-plan acceptance criterion.)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Live-preview NL→AlertRule on every keystroke | Snappy UX | Anthropic spend balloons; rate limits; cache warmup needed in v1.3 | Never — debounce-on-blur or explicit Parse button only. |
| Add `parallel anomaly detector` rather than extending `evaluate_anomaly` | Parallel feature flag, no risk to v1.1 detector | Two warm-up gates, two state shapes, frontend kind-union grows | Never — extend the shipped detector. |
| Use `Date.now()` directly in test fixtures | Test reads naturally | Time-of-day flakes, CI flakes, DST flakes | Never in tests — `vi.spyOn(Date, 'now')` always. |
| Strip raw `cwd` only at render, not at API boundary | One-line fix | Privacy leak in HAR exports, log lines, error reports | Never for project-keyed endpoints; OK for single-session deep-link views. |
| Hardcode `MIN_LATENCY_SAMPLES` mirror in frontend | Decouples deploys | Threshold drift between frontend/backend | OK for a v1.0 ship; not for v1.2 — inherit from backend response. |
| `getByLabel` regex with `.first()` to bypass strict mode | One-line green | Re-fires every time DOM order changes | Never — `data-testid` is the convention. |
| `parse_mode='Markdown'` for richer alert text | Bold rule names | User-controlled field injection | Never in `cmc/telegram/`. |
| `refetchInterval: 5_000` for non-firehose panel | Snappy panel | Background server load × N panels | Never outside the firehose / live-sessions / decisions buckets. |
| Skip `is_known_metric()` validation on NL-parsed rule | Less code | Silently miscoded alerts | Never — backend validator is the lock. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic Haiku (`AsyncAnthropic`) | Module-level instantiation requiring `ANTHROPIC_API_KEY` at import | Lazy import + lazy construct inside the function — mirror `nlcron.py:30`. |
| Anthropic Haiku output | Trust the JSON | Validate against local registry / `is_known_metric()` — mirror `skill_router.py:98-103`. |
| Anthropic Haiku cost | Per-keystroke calls | Cache on exact input string with TanStack Query `staleTime: Infinity`. |
| Telegram alert formatting | Use `parse_mode='HTML'` for rich text | Plain UTF-8 with emoji + newlines. |
| Telegram callback_data | Concat full scope_key (>64 bytes) | `sha256(scope_key)[:8]` per `messages.py:135`. |
| SQLite WAL + cwd group | Group on raw cwd | Group on normalized `project_key = sha1(realpath(rstrip('/'))).hex[:12]`. |
| TanStack Query polling | `refetchInterval: 5_000` for "responsive" panels | Respect the 4-bucket cadence convention at `lib/queries.ts:1-15`. |
| Pydantic `default_factory=datetime.utcnow` | Replace with `datetime.now(UTC)` (returns aware) | Replace with naive-UTC helper from `cmc/core/time.py`. |
| Playwright strict mode | `getByLabel(...).first()` band-aid | `data-testid` convention. |
| Vitest fake timers | `vi.useFakeTimers()` for clock issues | Use `vi.useFakeTimers()` ONLY for `setTimeout`/`setInterval`; use `vi.spyOn(Date, 'now')` for clock pinning. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Naive variance (`E[X²] − E[X]²`) for streaming anomaly | Negative variances, NaN z-scores after weeks of running | Welford recurrence (already shipped pattern at `detector.py:226-229`) | After ~10⁶ samples — i.e. ~3 weeks of `cost_usd_24h` ticks. |
| Per-keystroke Anthropic call | Visible network spam in DevTools; Anthropic spend > $1/day per user | Debounce-on-blur + cache by exact input | Immediately on first heavy NL composer use. |
| Per-skill compare via N+1 SQL | /api/sessions/compare > 200ms p95; 9-SQL budget exceeded | Single rollup query per side; reuse denormalized columns where possible | When session has 50+ unique skills. |
| `cwd` cardinality without normalization | Per-project breakdown panel shows 50+ rows; fuzzy duplicates | Normalize to `project_key`; cap at top-N=20 + rollup | At ~20 distinct projects. |
| Forecast on day-1 of new month | Forecast jumps 30× day-over-day | 14d rolling baseline + insufficient_data flag for <7 days | Every 1st of the month. |
| Polling-cadence drift | 12+ panels each polling 5s | 4-bucket cadence convention | Immediately as panels accumulate. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Full `cwd` in /api/sessions/by-project response | Path leak in HAR exports / Sentry / browser history | API returns `display_path` + `project_key`; `cwd` only in single-session deep-link views. |
| Haiku output rendered to user without escaping | XSS via NL prompt → output reflected in form | NL parser output is parsed JSON, rendered as form-field values (React escapes) — never `dangerouslySetInnerHTML`. |
| `parse_mode='HTML'` in new Telegram alert | Telegram-side injection from rule names / scope keys | Plain text only; grep guard `test_telegram_grep.py` enforces. |
| User-typed NL prompt logged at INFO with API key in scope | Prompt content in `data/logs/server.log` for debugging | Log NL prompts at DEBUG only; redact in INFO/ERROR; never log API key. |
| Storing forecast computation in DB | Stale forecast persists across pricing-table updates | Always compute at read-time; cache in TanStack Query, not in SQLite. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Forecast as point estimate ("Forecast: $112") | False precision; user makes decisions on noise | Range estimate ("Projected $80–$140") + confidence band. |
| "New" / "Dormant" badge on every skill at cold start | Wall of badges → user ignores them | Suppress all skill badges when `now - installed_at < 7d`. |
| Per-skill latency delta on 1-sample side ("+275%") | User reports false regression | Reuse `Low sample` Badge from `SkillLatencyTable.tsx:59-63`; suppress percentage when sample_count < 30. |
| "Compare with previous" silently picks wrong session | User sees unrelated comparison | Lock "previous = same-cwd, ended_at IS NOT NULL"; 404 on no eligible match. |
| NL parser silent-fallback rule | User has a rule that "doesn't fire" — debugging nightmare | NEVER ship a fallback; "couldn't parse — please use the form." |
| DST-driven phantom delta | "Why is my cost 1% higher this week?" tickets | Day-boundary windowing, not hour-arithmetic. |
| Parallel anomaly detector with same name | Operators can't tell which detector their rule uses | Single detector; vary by `params_json.window_kind`. |

## "Looks Done But Isn't" Checklist

- [ ] **ALRT-13 anomaly:** Verify only ONE detector function in `cmc/alerts/detector.py` matching `evaluate_(threshold|anomaly)$`.
- [ ] **ALRT-13 anomaly:** Constant-series test passes (Welford check).
- [ ] **ALRT-13 anomaly:** Warmup-to-live transition emits PENDING_FIRE, never FIRING.
- [ ] **ALRT-14 NL parser:** AlertRuleCreate output passes through `is_known_metric()` AND the local validator.
- [ ] **ALRT-14 NL parser:** No `cmc.dispatcher.tasks` import (ALRT-12 invariant).
- [ ] **ALRT-14 NL parser:** Caches by exact input string; no per-keystroke Anthropic call.
- [ ] **ANLY-06 forecast:** Returns `null` + `insufficient_data` when `days_elapsed < 7`.
- [ ] **ANLY-06 forecast:** Uses 14d rolling baseline, NOT month-to-date denominator.
- [ ] **ANLY-07 / SKLP-08:** Group by `project_key`, not raw `cwd`. API response excludes raw `cwd`.
- [ ] **ANLY-07 / SKLP-08:** Top-N=20 + rollup row.
- [ ] **SKLP-09 period delta:** Day-boundary windowing; constant-series test = 0.0% delta.
- [ ] **SKLP-10 badges:** Suppressed during 7d cold-start window.
- [ ] **SKLP-10 badges:** `skills.first_seen_at` column added by migration; backfilled.
- [ ] **SKLP-11 latency overhead:** Phase plan cites SQL columns for body/subagent/tool decomposition (no fake decomposition).
- [ ] **CMPR-06 per-skill delta:** `low_sample_a` / `low_sample_b` flags in API; UI badge suppresses percentage.
- [ ] **CMPR-06 per-skill delta:** SQL count ≤ 9 per /api/sessions/compare request.
- [ ] **CMPR-07 Cmd+K previous:** Endpoint `/api/sessions/{id}/previous`; 404 on active or no-match; self-compare guard.
- [ ] **Polish: datetime.utcnow:** Centralized helper in `cmc/core/time.py`; grep guard `test_no_datetime_utcnow.py`.
- [ ] **Polish: SchedulesCard test:** `vi.spyOn(Date, 'now')`, NOT `vi.useFakeTimers`.
- [ ] **Polish: schedule-composer.spec:** `data-testid` convention, NOT `.first()`.
- [ ] **All phases:** `parse_mode=` grep guard green.
- [ ] **All phases:** No new `refetchInterval < 30_000` outside firehose/live-sessions/decisions buckets.
- [ ] **All phases:** KNOWN_METRICS sync — backend `_SCOPE_EXTRACTORS` keys match frontend constant (or dynamic endpoint shipped).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitfall 1 (parallel anomaly detector shipped) | MEDIUM | Refactor sibling function into `evaluate_anomaly` extension behind `params_json.window_kind`; migrate existing rules; remove old function. ~1 day. |
| Pitfall 4 (NL parser miscoded rule slipped through) | LOW | The 422 validator catches it pre-write — no DB cleanup. Audit log for "hallucinated_metric" warnings; tune the system prompt. |
| Pitfall 7 (cwd leaked into responses) | HIGH | Migration to backfill `project_key` + change /api/sessions/by-project response shape (BREAKING for any external consumer; v1.2 has none). Coordinated frontend release. |
| Pitfall 9 (cold-start badge storm shipped) | LOW | Hotfix: hard-suppress badges for 7d after first migration apply (read `system_state.installed_at`). One-line config flip. |
| Pitfall 10 (fake SKLP-11 decomposition shipped) | MEDIUM | Hide the panel; mark SKLP-11 incomplete; descope to v1.3 SPIKE. UI banner: "Latency breakdown coming soon." |
| Pitfall 13 (datetime.utcnow replace broke storage) | HIGH | Roll back the replace; investigate aware-vs-naive comparison sites; replace iteratively with `_utcnow_naive` import. |
| Pitfall 17 (5s polling shipped) | LOW | Single-line cadence change in `lib/queries.ts`; deploy. No DB impact. |
| Pitfall 18 (NL parser imported tasks dispatcher) | MEDIUM | The `test_no_tasks_import` test catches it pre-merge. If shipped: revert the parser, audit `decisions` and `tasks` tables for parser-spawned rows, hotfix the parser. |
| Pitfall 19 (parse_mode= shipped) | LOW | The grep test catches pre-merge. Revert one line. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Parallel anomaly detector | ALRT-13 phase | `test_alerts_detector.py::test_single_anomaly_detector_function` |
| 2. Naive variance | ALRT-13 phase | `test_alerts_detector.py::test_constant_series_zero_variance` + import-grep guard |
| 3. Warmup boundary storm | ALRT-13 phase | `test_alerts_detector.py::test_warmup_to_live_transition_emits_pending` |
| 4. Haiku grammar drift | ALRT-14 phase | `test_alerts_nl_parser.py::test_hallucinated_metric_returns_none` + `::test_vocabulary_in_system_prompt` |
| 5. NL parser cost balloon | ALRT-14 phase | `AlertRuleForm.test.tsx::nl_parse_does_not_fire_on_each_keystroke` |
| 6. Forecast partial-month bias | ANLY-06 phase | `test_cost_forecast.py::test_partial_window_returns_null` + `::test_weekend_weighted_baseline` |
| 7. cwd cardinality + privacy | ANLY-07 phase (and SKLP-08 in same wave) | `test_observability_router.py::test_by_project_response_no_raw_cwd` + `::test_trailing_slash_collapses` + migration test |
| 8. Period-over-period DST/month edges | SKLP-09 phase | `test_skills_router.py::test_period_over_period_constant_series` |
| 9. Cold-start badges | SKLP-10 phase | `SkillsRegistry.test.tsx::test_cold_start_no_badges` + migration test for `first_seen_at` backfill |
| 10. SKLP-11 missing data | SKLP-11 phase (or SPIKE) | Phase-plan acceptance criterion: cite SQL columns for each component of the decomposition |
| 11. Per-skill delta low-sample | CMPR-06 phase | `SessionCompareView.test.tsx::test_low_sample_suppresses_delta` + SQL-budget test |
| 12. "Previous" ambiguity | CMPR-07 phase | `test_sessions_router.py::test_previous_session_endpoint_*` + `CommandPalette.test.tsx::test_compare_with_previous_self_guard` |
| 13. datetime.utcnow replace | Polish phase | `test_no_datetime_utcnow.py::test_zero_utcnow_in_cmc` (grep guard) |
| 14. SchedulesCard flake | Polish phase | After-fix grep: `vi.spyOn(Date, 'now')` present, `vi.useFakeTimers` absent |
| 15. aria-label collision | Polish phase | After-fix spec uses `getByTestId`, not `getByLabel` regex |
| 16. KNOWN_METRICS sync | Any new-metric phase (or one-time dynamic endpoint) | `test_alerts_router.py::test_metric_vocabulary_matches_frontend_constant` |
| 17. Polling cadence drift | Every panel-adding phase | Manual review of `refetchInterval` in PR diff against the 4-bucket convention |
| 18. ALRT-12 invariant break | ALRT-14 phase | `test_alerts_dispatcher.py::test_no_tasks_import` (extended to `cmc/alerts/`) |
| 19. parse_mode= regression | Any phase touching `cmc/telegram/` | `test_telegram_grep.py::test_no_parse_mode_assignments_in_telegram_pkg` |
| 20. REQUIREMENTS.md double-write | Roadmap design + polish phase | Phase-plan `requirements_writer` flag |

## Sources

All citations are file:line within `/Users/patrykattc/work/git/claude-mission-control/`:

- v1.1 ALRT-12 invariant: `backend/cmc/dispatcher/alerts.py:14-15`, `backend/tests/test_alerts_dispatcher.py::test_no_tasks_import`
- v1.1 EWMA detector (Welford recurrence, EPSILON, WARMUP_SECONDS): `backend/cmc/alerts/detector.py:36-49, 176-277`
- v1.1 `_SCOPE_EXTRACTORS` vocabulary lock: `backend/cmc/alerts/scopes.py:171-184`
- v1.1 `is_known_metric` validator: `backend/cmc/api/schemas/alerts.py:69`
- v1.1 frontend KNOWN_METRICS constant + sync warning: `frontend/src/components/panels/AlertRuleForm.tsx:9-39`
- v1.1 Haiku integration patterns (lazy import, JSON validate, hallucination guard): `backend/cmc/schedules/nlcron.py:1-46`, `backend/cmc/dispatcher/skill_router.py:1-104`
- v1.1 telegram callback_data sha256[:8]: `backend/cmc/telegram/messages.py:135`
- v1.1 telegram parse_mode grep guard: `backend/tests/test_telegram_grep.py:1-46`
- v1.1 cwd / project rollup pattern: `backend/cmc/api/routes/observability.py:420-473`, `frontend/src/components/panels/ProjectBreakdownCard.tsx:1-9`
- v1.1 `MIN_LATENCY_SAMPLES` low-sample discipline: `backend/cmc/api/routes/skills.py:365-368`, `frontend/src/components/panels/SkillLatencyTable.tsx:14-17, 59-63`
- v1.1 CMPR-04 over-cap render branch + 9-SQL budget: `backend/cmc/api/routes/sessions.py:56-58, 121-193, 244-313`
- v1.1 self-compare guard (backend + Cmd+K): `backend/cmc/api/routes/sessions.py:271-274`, `frontend/src/components/ui/CommandPalette.tsx:32, 110`
- v1.1 React Query cadence convention: `frontend/src/lib/queries.ts:1-15, 124-260`
- v1.1 `_utcnow_naive` helper: `backend/cmc/dispatcher/alerts.py:73-75`
- v1.1 `datetime.utcnow` deprecated sites (18 enumerated): `backend/cmc/db/models/{mcp_stats,activities,tasks,sessions,otel_metrics,notification_log,live_state,skills,alert_state,decisions,inbox,alert_rules,token_usage,system_state,pricing,otel_events,schedules}.py` + `backend/cmc/pricing.py:182`
- v1.1 SchedulesCard stale flake source: `frontend/src/components/panels/__tests__/SchedulesCard.test.tsx:53, 166-187`, `frontend/src/components/panels/SchedulesCard.tsx:179-184`
- v1.1 schedule-composer e2e + aria-label colliders: `frontend/tests/e2e/schedule-composer.spec.ts:39-66`, `frontend/src/components/panels/SkillTimeline.tsx:74`
- v1.1 `tools.duration_ms` (SKLP-11 workaround source): `backend/cmc/db/models/tools.py:36`
- v1.1 `skill_activated` event single duration_ms: `backend/cmc/api/routes/skills.py:225-237, 552-620`
- v1.1 trailing-underscore route opt-out: `frontend/src/routes/sessions_.compare.tsx:4-7`, `frontend/src/routes/skills_.$name.tsx:4-9`
- v1.1 hand-written validateSearch UUID: `frontend/src/routes/sessions_.compare.tsx:16-71`
- v1.2 milestone scope + carried decisions: `.planning/STATE.md` (Decisions log + Deferred Items table)
- v1.1 audit (REQUIREMENTS.md cosmetic markers, wave-1/wave-2 single-writer precedent): `.planning/milestones/v1.1-MILESTONE-AUDIT.md:23, 27, 53, 88, 157-167`

---
*Pitfalls research for: Claude Mission Control v1.2 Depth & Polish*
*Researched: 2026-05-05*
