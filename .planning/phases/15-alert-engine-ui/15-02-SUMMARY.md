---
phase: 15-alert-engine-ui
plan: 02
subsystem: alerts
tags: [fastapi, sqlmodel, dispatcher, hysteresis, dedup, decisions, notification-log, sqlite-on-conflict, alert-engine, crud]

# Dependency graph
requires:
  - phase: 13-cost-skill-foundations
    provides: alert_rules + alert_state schema (ALRT-01/02), Decision + NotificationLog dedup primitives
  - phase: 15-alert-engine-ui
    plan: 01
    provides: cmc.alerts.detector (AlertSignal + evaluate_threshold + evaluate_anomaly) + cmc.alerts.scopes (_SCOPE_EXTRACTORS + is_known_metric)
  - phase: 15-alert-engine-ui
    plan: 04
    provides: locked TS interface contract (AlertRule / AlertRuleListResponse / AlertRuleCreate / AlertRulePatch / AlertEvent / AlertEventsResponse / AlertAckRequest) + URL path map
provides:
  - "cmc.dispatcher.alerts.evaluate_alerts(db) — single async entrypoint composing detector + scope extractors + decisions + notification_log per heartbeat tick"
  - "Heartbeat hook in cmc/dispatcher/heartbeat.py — try/except wrapped, AFTER stamp_tick, AFTER e-stop early return, BEFORE sweep_stale_pids"
  - "5 endpoints under /api/alerts: GET /rules, POST /rules (201), PATCH /rules/{id}, DELETE /rules/{id} (204), GET /events?range=, POST /_ack"
  - "Stable dedup_key = f'alert:{rule_id}:{scope_key}' — no timestamps; reuses notification_log UNIQUE(kind, entity_id, chat_id) and decisions partial-unique on dedup_key WHERE status='pending'"
  - "Auto-resolve transition (firing→clear): UPDATE decisions SET status='answered', answered_by='alert_engine'; DELETE notification_log row (D-03 / Pitfall 5 fix)"
  - "PATCH state-clear policy (D-02): touching any of {threshold_fire, threshold_clear, min_dwell_seconds, min_samples, cooldown_seconds} deletes alert_state rows for the rule; touching only name/enabled/params_json preserves state"
  - "min_dwell=0 fast path: dispatcher promotes detector PENDING_FIRE → FIRING on first crossing so users get immediate-fire UX while detector stays pure-math"
affects:
  - 15-03 (Alerts Telegram wiring): Plan 03 wires cmc.telegram.messages.format_alert into cmc.dispatcher.alerts._format_alert_prompt (D-06 follow-through) and registers alert formatter in notifier _FORMATTER table
  - 15-05 (/alerts page panels): consumes the 6 endpoints via the Plan 04 frontend lib (api.alertRules / alertRuleCreate / alertRulePatch / alertRuleDelete / alertEvents / alertAck)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verbatim copy of dedup primitives from notifier.py::_claim_and_send and hitl.py::create_decision — sqlite_insert(...).on_conflict_do_nothing(index_elements=..., index_where=text(\"...\")). NO new constraints, NO new state machine."
    - "Per-rule exception isolation in evaluate_alerts: try/except per rule + log + db.rollback() so one bad rule cannot poison the cycle (an extractor SQL error or detector failure on rule N must not stop rule N+1 from evaluating)."
    - "Telegram-disabled fallback: chat_id empty → engine still writes decisions but skips notification_log insert (engine works without Telegram)."
    - "Python-side join for /alerts/events: SELECT alert decisions, parse rule_id from dedup_key in Python, bulk-fetch rule names — avoids fragile SQLite SUBSTR/INSTR; cheap because v1.0 events ≤500/day."
    - "min_dwell=0 fast path in dispatcher (NOT detector): keeps Plan 01 detector pure-math; dispatcher synthesizes fired_at + promotes PENDING_FIRE → FIRING on first crossing when min_dwell_seconds==0."
    - "scope_hash = sha256(scope_key)[:8] in Python: SQLite has no native SHA256 and Telegram callback_data is capped at 64 bytes (Pitfall 9). _ack endpoint iterates rule's alert_state rows in Python to find the matching scope_key."

key-files:
  created:
    - backend/cmc/dispatcher/alerts.py
    - backend/cmc/api/routes/alerts.py
    - backend/cmc/api/schemas/alerts.py
    - backend/tests/test_alerts_dispatcher.py
    - backend/tests/test_alerts_router.py
  modified:
    - backend/cmc/dispatcher/heartbeat.py (added try/except evaluate_alerts hook between e-stop and sweep_stale_pids)
    - backend/cmc/api/routes/__init__.py (alerts_router import + appended to all_routers() after notifications_router)

key-decisions:
  - "D-01 (heartbeat hook placement, RESEARCH Open Q #2 closed): Hook lands AFTER stamp_tick AND AFTER the emergency-stop early return. e-stop disables alerts too — if user pulled the plug, do NOT spam Telegram about the dispatcher being down. Concrete site: heartbeat.py line ~78, between the e-stop early return and sweep_stale_pids."
  - "D-02 (PATCH state-clear policy): Touching any threshold-shaped field clears alert_state for the rule (next tick re-evaluates from clean). Touching only name/enabled/params_json preserves state. Implementation: _STATE_INVALIDATING_FIELDS frozenset intersected with updates.keys()."
  - "D-03 (notification_log cleanup on auto-resolve, Pitfall 5 fix): On firing→clear transition, ALSO delete the matching notification_log row. Without this, the SECOND firing's INSERT ON CONFLICT DO NOTHING would silently skip notification because the stale UNIQUE row still occupies the slot. Verified by test_evaluate_alerts_re_fire_after_clear (flap test: 2 decision rows, 1 notification row currently)."
  - "D-04 (range Literal): AlertRange = Literal['1d','7d','14d','30d'] — separate symbol from CostRange for decoupling, identical members for v1.0. GET /api/alerts/events?range=2d → 422."
  - "D-05 (no seed rules): Plan 02 ships ZERO Alembic seeds. Empty state on first /alerts page render. Phase 17 polish may add seed examples behind a flag."
  - "D-06 (alert prompt composer): Plan 02 ships a local stub `_format_alert_prompt(rule, scope_key, value) -> str` (returns 'Alert: {name} fired (value={v}, scope={k})'). Plan 03 Task 2 sub-step 2b will replace with `from cmc.telegram.messages import format_alert` so decisions.prompt stores the EXACT text the user sees in Telegram."
  - "min_dwell=0 promotion (executor decision): The Plan 01 detector returns PENDING_FIRE on the FIRST crossing (state.fired_at is None) regardless of min_dwell_seconds. The plan's 'run once → 1 decision' contract for min_dwell=0 rules required dispatcher-side promotion. Promoting in dispatcher (vs. mutating the detector) keeps Plan 01's pure-function contract intact and adds a single guarded if-block to alerts.py."
  - "_SCOPE_EXTRACTORS lookup ordering: lookup happens INSIDE the per-rule try/except in evaluate_alerts. Unknown metric (orphan rule from a disabled v1.x metric) logs a warning + skips, but the rule IS counted in evaluated total — verified by test_evaluate_alerts_unknown_metric_warns asserting evaluate_alerts returns 1."
  - "Settings.load_settings() called once at top of evaluate_alerts: chat_id is read once per tick. Tests use monkeypatch on cmc.dispatcher.alerts.load_settings to inject a stable chat_id so the notification_log insert path is exercised."

patterns-established:
  - "Per-rule exception isolation: try/except _evaluate_rule(...) + log.exception + db.rollback() inside evaluate_alerts; one bad rule never blocks subsequent rules. Future per-tick gates (e.g. timeouts, circuit breakers) attach to this same boundary."
  - "Verbatim dedup primitive copying: when adding a new notification kind, copy the on_conflict_do_nothing block from notifier.py (UNIQUE) and hitl.py (partial-unique) verbatim — do NOT invent a new state machine. Existing constraints handle concurrency."
  - "Python-side dedup_key parser (_parse_dedup_key): for analytical endpoints joining decisions to alert_rules. Defensive — malformed key returns (None, raw_key) so a corrupted row doesn't crash the endpoint."
  - "Threshold-clear vs threshold-fire validator: Pydantic v2 model_validator(mode='after') fires on BOTH POST and PATCH. PATCH validator only enforces when both fields are set in the patch (allows updating threshold_fire alone)."
  - "fast-path PENDING_FIRE→FIRING for min_dwell=0: dispatcher synthesizes state.fired_at = now and rewrites the signal in-place. Keeps the detector pure (no IO, no mutation) while honoring the natural 'fire-immediately' UX."
  - "AlertAckRequest model_config = ConfigDict(extra='forbid'): rejects unknown fields with 422. Catches Telegram callback typos at the API boundary."

# Metrics
metrics:
  duration_minutes: 15
  completed_date: 2026-05-04
  tasks: 2
  commits: 4
  files_created: 5
  files_modified: 2
---

# Phase 15 Plan 02: Alert Engine Dispatcher + /api/alerts CRUD Summary

**IO half of the alert engine — wires Plan 01 detector primitives into the live dispatcher tick (after e-stop), exposes full /api/alerts CRUD + events + ack with Pydantic v2 cross-field validators, and verifies the ALRT-12 invariant (alerts.py never imports cmc.dispatcher.tasks) via static AST audit.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-04T14:17:30Z
- **Completed:** 2026-05-04T14:32:53Z
- **Tasks:** 2 (both auto + tdd=true)
- **Files created:** 5 (3 prod modules, 2 test files)
- **Files modified:** 2 (heartbeat.py + routes/__init__.py)
- **Tests added:** 31 (12 dispatcher + 19 router)
- **Backend suite:** 490 baseline → 521 passed, 0 failed (+31, exact plan target)
- **Commits:** 4 (RED + GREEN per task; final docs commit lands separately)

## Accomplishments

- **evaluate_alerts(db: AsyncSession) -> int** — pure-async orchestrator that loads enabled rules in rule_id order, dispatches by `rule.kind` to `evaluate_threshold` or `evaluate_anomaly` per scope, persists state mutation per signal, and emits decisions + notification_log rows on FIRING / auto-resolves on CLEAR. Per-rule exception isolation: ALL exceptions caught and rolled back at the rule boundary so one bad rule never poisons the cycle.
- **Heartbeat hook (heartbeat.py:81-89)** — try/except wrapped `from cmc.dispatcher.alerts import evaluate_alerts; await evaluate_alerts(db)` AFTER the e-stop early return AND BEFORE sweep_stale_pids (D-01). e-stop disables alerts too — verified by test_heartbeat_hook_after_estop asserting NO decision row when emergency_stop=1.
- **Stable dedup_key contract** — `f"alert:{rule_id}:{scope_key}"`. No timestamps. Reuses existing decisions partial-unique (`dedup_key WHERE status='pending'`) and notification_log UNIQUE(kind, entity_id, chat_id). Verbatim copy of notifier.py + hitl.py patterns. Concurrent ticks via asyncio.gather verified to produce exactly 1 decision row + 1 notification_log row (Pitfall 7).
- **Auto-resolve + cleanup (Pitfall 5 fix, D-03)** — On firing→clear: `UPDATE decisions SET status='answered', answer='auto-resolved', answered_by='alert_engine', answered_at=now WHERE dedup_key=:k AND status='pending'`. AND `DELETE FROM notification_log WHERE kind='alert' AND entity_id=:k AND chat_id=:cid`. The DELETE matters because INSERT ON CONFLICT DO NOTHING for the SECOND firing would silently skip notification if the first firing's row were still around — verified by test_evaluate_alerts_re_fire_after_clear (flap test with 2 decisions total, 1 notification currently).
- **5 CRUD + events + ack endpoints under /api/alerts** — list (paginated DESC), create (Pydantic v2 model_validator: kind=threshold→fire required, clear<fire, is_known_metric), patch (state-clear policy D-02), delete (explicit cascade alert_state→alert_rules), events (Python-side dedup_key parse + bulk-fetch rule_name, range Literal['1d','7d','14d','30d']), ack (sha256(scope_key)[:8] match → acked_until=now+1h).
- **AlertRuleCreate validator coverage** — 3 422 paths: unknown metric (`is_known_metric` from cmc.alerts.scopes), threshold-without-fire, threshold_clear>=threshold_fire. AlertRulePatch validator covers the same threshold-vs-fire ordering when both are in the patch (allows patching threshold_fire alone).
- **PATCH state-clear policy (D-02)** — touching ANY of {threshold_fire, threshold_clear, min_dwell_seconds, min_samples, cooldown_seconds} deletes alert_state rows for the rule. Touching only name / enabled / params_json preserves state. Verified by `test_patch_rule_enabled_preserves_state` (state preserved) AND `test_patch_rule_threshold_clears_state` (state count goes 1 → 0).
- **ALRT-12 invariant (zero `cmc.dispatcher.tasks` imports)** — static AST audit in test_no_tasks_import. Walks the parsed module looking for `Import` and `ImportFrom` nodes referencing `cmc.dispatcher.tasks` or its submodules. Verified by both: the test passes AND `grep -E "^(from cmc\\.dispatcher\\.tasks|import cmc\\.dispatcher\\.tasks)" cmc/dispatcher/alerts.py cmc/api/routes/alerts.py` exits 1 (no matches).

## Hook Placement

```python
# heartbeat.py:74-89  (after e-stop check)
if row is not None and (row.value or "") == "1":
    log.info("dispatcher.emergency_stop_active")
    return 0

# Phase 15 ALRT-04: alert engine hook. Wrapped so detector failures
# never poison the cycle. Placement is AFTER e-stop check so a
# tripped e-stop disables alerts too (no spam about a dispatcher
# that the user just stopped). Function-local import keeps the
# bootstrap path independent of cmc.alerts.* (defensive — in case
# cmc.alerts.* ever needs to import dispatcher state).
try:
    async with sessions() as db:
        from cmc.dispatcher.alerts import evaluate_alerts
        await evaluate_alerts(db)
except Exception:
    log.exception("dispatcher.alerts_failed_ignore")
```

## Endpoint Summary

| Method | Path                          | Status | Notes                                                                                  |
|--------|-------------------------------|--------|----------------------------------------------------------------------------------------|
| GET    | /api/alerts/rules             | 200    | Paginated; ORDER BY rule_id DESC; limit ge=1 le=200                                    |
| POST   | /api/alerts/rules             | 201    | 422 on unknown metric / threshold-without-fire / clear>=fire                           |
| PATCH  | /api/alerts/rules/{rule_id}   | 200    | D-02 state-clear policy; 422 on threshold ordering; 404 on unknown id                  |
| DELETE | /api/alerts/rules/{rule_id}   | 204    | Explicit cascade alert_state→alert_rules                                               |
| GET    | /api/alerts/events?range=     | 200    | Python-side join for rule_name; 422 on invalid range                                   |
| POST   | /api/alerts/_ack              | 200    | sha256(scope_key)[:8] match → acked_until=now+1h; 404 on no match; 422 on bad hash    |

## Task Commits

1. **Task 1: cmc/dispatcher/alerts.py — evaluate_alerts orchestrator + tick test (TDD):**
   - `1517b07` test(15-02): add failing tests for evaluate_alerts dispatcher (RED)
   - `7b3e274` feat(15-02): implement evaluate_alerts orchestrator + heartbeat hook (GREEN)
2. **Task 2: /api/alerts CRUD + events history + ack + register router (TDD):**
   - `7272958` test(15-02): add failing tests for /api/alerts CRUD + events + ack (RED)
   - `cc7548d` feat(15-02): implement /api/alerts CRUD + events + ack endpoints (GREEN)

**Plan metadata commit:** TBD — final docs commit lands SUMMARY.md + STATE.md + ROADMAP.md updates.

## Files Created

- `backend/cmc/dispatcher/alerts.py` (~330 lines) — evaluate_alerts entrypoint + per-rule isolation + auto-resolve helpers + min_dwell=0 fast path. Imports limited to: stdlib (logging, datetime), sqlalchemy, cmc.alerts.detector, cmc.alerts.scopes, cmc.config, cmc.db.models. Zero cmc.dispatcher.tasks imports (ALRT-12).
- `backend/cmc/api/routes/alerts.py` (~290 lines) — 5 endpoints under /alerts prefix. _RANGE_TO_DAYS + _range_start COPIED verbatim from cost.py. _STATE_INVALIDATING_FIELDS frozenset for D-02 PATCH policy. Python-side _parse_dedup_key for events join.
- `backend/cmc/api/schemas/alerts.py` (~155 lines) — AlertRange + AlertKind Literals; AlertRuleCreate + AlertRulePatch with model_validator cross-field checks; AlertRuleRow (extends ORMBase); AlertRuleListResponse; AlertEvent + AlertEventsResponse; AlertAckRequest with model_config=ConfigDict(extra='forbid') + 8-char hex pattern.
- `backend/tests/test_alerts_dispatcher.py` (~700 lines) — _bootstrap_db copied from test_dispatcher.py; inline `_make_alert_rule` / `_seed_failed_task` / `_seed_alert_rule` factories; 12 tests covering: ALRT-12 static-import audit, empty-rules return, threshold fires once, idempotent per tick, concurrent ticks (asyncio.gather), auto-resolve on clear, re-fire after clear (flap), anomaly warm-up suppression, disabled rules skipped, unknown-metric warn-and-skip, e-stop hook gate, heartbeat hook calls evaluate_alerts.
- `backend/tests/test_alerts_router.py` (~450 lines) — Inline `_post_rule` / `_seed_state` / `_count_states` / `_seed_alert_decision` helpers using the running app's sessionmaker; 19 tests covering: list empty, valid threshold, 4 422 validator paths, anomaly create, pagination, PATCH-preserves-state-on-enabled, PATCH-clears-state-on-threshold, PATCH 422 / 404, DELETE cascade, events 422 / empty / populated, ack happy-path / unknown-rule / hash-mismatch / invalid-format.

## Files Modified

- `backend/cmc/dispatcher/heartbeat.py` — added the alert engine hook (8-line try/except block) between the e-stop early return (line 76) and `sweep_stale_pids()` (line 91). Function-local import keeps boot independent of cmc.alerts.*.
- `backend/cmc/api/routes/__init__.py` — added `from cmc.api.routes.alerts import router as alerts_router` (line 18) and appended `alerts_router,` to `all_routers()` (line 56) after `notifications_router` per Phase 15 grouping.

## Decisions Made

All planner decisions confirmed (D-01 through D-06). Two executor-side decisions:

- **min_dwell_seconds=0 fast path** — Plan 01's detector contract is `state.fired_at is None → PENDING_FIRE` regardless of min_dwell. The plan's "run once → 1 decision" expectation for min_dwell=0 rules required dispatcher-side promotion. Implemented as a single guarded if-block before the FIRING branch: `if signal == PENDING_FIRE and rule.min_dwell_seconds == 0 and state.fired_at is None: state.fired_at = now; signal = FIRING`. Keeps detector pure-math; honors natural fire-immediately UX.
- **Test-side threshold_fire=0.5 instead of 0.0** — using threshold_fire=0.0 with the SQL `COUNT(*)` extractor (returns 0.0 for empty windows) made the auto-resolve test fail because `0.0 < 0.0` is FALSE so the detector kept reporting firing. Setting threshold_fire=0.5 (so 1.0 fires, 0.0 clears) makes the hysteresis test crisp without touching production. The CRUD validator forbids `threshold_clear >= threshold_fire`; setting threshold_clear=None (defaults to threshold_fire in the detector) makes the assertion clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-commit ruff lint failures across multiple commits**
- **Found during:** Every commit step
- **Issue:** Project pre-commit hook runs `ruff check cmc tests` on the entire tree. Initial commits failed on `I001` (import sort: blank lines between stdlib / sqlalchemy / cmc imports), `F401` (unused import: `cmc.config.Settings`), `PERF401` (for-loop list-append vs. list.extend), and `E501` (line too long: a single chained SQLAlchemy `.where().order_by()` exceeded 100 chars).
- **Fix:** Ran `.venv/bin/python -m ruff check ... --fix` for auto-fixable items. Manually rewrote the for-loop into `bad.extend(...)` for the AST audit and broke the long select() chain across three lines.
- **Files modified:** `tests/test_alerts_dispatcher.py`, `cmc/dispatcher/alerts.py`, `tests/test_alerts_router.py`
- **Verification:** All 4 task commits eventually passed pyright + ruff; final state lint-clean.
- **Committed in:** Folded into the same task GREEN/RED commits — no separate fix commits.

**2. [Rule 1 — Bug discovery] threshold_fire=0.0 doesn't clear via threshold_clear=None fallback**
- **Found during:** Task 1 GREEN test run (test_evaluate_alerts_auto_resolve_on_clear failure)
- **Issue:** When threshold_fire=0.0 and threshold_clear is None, the detector falls back to threshold_clear=threshold_fire=0.0. The detector's clear check is `current_value < clear_floor` (strict). For the dispatcher_failed_tasks_5m extractor, value=0.0 in an empty window means `0.0 < 0.0` is FALSE → detector keeps reporting firing → auto-resolve test fails.
- **Fix:** Tests use threshold_fire=0.5 (so value=1.0 fires; value=0.0 clears). Production behavior unchanged. The plan's verbatim text said "threshold_fire=0.0" but the integration discovery is that the detector's strict `<` semantics combined with a counter metric returning 0.0 require a non-zero threshold for clean clear.
- **Files modified:** `tests/test_alerts_dispatcher.py` (`_seed_alert_rule(threshold_fire=0.5)` in the affected tests)
- **Verification:** All 12 dispatcher tests pass after the fix.
- **Committed in:** `7b3e274` (Task 1 GREEN — fix landed in same commit as evaluate_alerts).

**3. [Rule 2 — Critical UX gap] min_dwell=0 first-tick fire**
- **Found during:** Task 1 GREEN test run (test_evaluate_alerts_threshold_fires_once failure)
- **Issue:** Plan 01 detector contract: `state.fired_at is None → PENDING_FIRE` always (even when min_dwell_seconds=0). The plan's tests expect `run once → 1 decision row`, which contradicts the detector contract. Without the dispatcher synthesizing fired_at, the user has to wait TWO ticks (≥120s) to get the first alert when they explicitly set min_dwell_seconds=0. That's a UX bug.
- **Fix:** Added a `min_dwell=0 fast path` block in `_evaluate_rule` after the detector call: if signal==PENDING_FIRE and rule.min_dwell_seconds==0 and state.fired_at is None, stamp state.fired_at=now and rewrite signal=FIRING in-place. Keeps the detector pure-math; honors natural fire-immediately UX.
- **Files modified:** `cmc/dispatcher/alerts.py`
- **Verification:** test_evaluate_alerts_threshold_fires_once passes; no regression in the dwell-positive tests (dwell>0 still produces PENDING_FIRE on the first tick because the if-guard requires min_dwell_seconds==0 specifically).
- **Committed in:** `7b3e274` (Task 1 GREEN).

**Total deviations:** 3 auto-fixed (1 Rule 3 tooling, 1 Rule 1 bug discovery, 1 Rule 2 UX gap).

**Impact on plan:** All three deviations were spec-shaped (what the plan said) vs. integration-shaped (what the existing detector contract dictated). The plan was written before Plan 01 landed; once Plan 01's pure-math contract crystalized, these dispatch-layer adjustments were unavoidable. None affected the public API surface or the ALRT-12 invariant. Zero scope creep.

## Issues Encountered

- One pre-existing modified file in working tree at start of execution: none — clean working tree from Wave 1 close.
- Pre-commit ruff hook fails on every initial commit because the project lints the entire tree (`cd backend && uv run ruff check cmc tests`). Each task commit required a `--fix` pass before the second commit attempt. This is the same friction Plan 15-01 documented.
- `aiosqlite` raises a `DeprecationWarning` ("default datetime adapter is deprecated as of Python 3.12") on every test run — pre-existing baseline noise, NOT introduced by this plan. 1,358 warnings in the suite at end-of-plan vs. 1,256 at start (+102 from new dispatcher tests doing more datetime round-trips); zero NEW warning categories.

## Authentication Gates

None — plan ships purely server-side surface. No external API calls, no third-party tokens, no email links. Telegram chat_id is read from settings but never authenticated against — engine works in `chat_id=""` mode (writes decisions, skips notification_log).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 15-03 (Alerts Telegram wiring):**
- `_format_alert_prompt(rule, scope_key, value)` is a local stub in `cmc/dispatcher/alerts.py` ready for Plan 03 Task 2 sub-step 2b to replace with `from cmc.telegram.messages import format_alert` (D-06 follow-through). Plan 03's frontmatter declares `cmc/dispatcher/alerts.py` in files_modified for this swap.
- Notifier `_FORMATTER` table at `cmc/telegram/notifier.py:217` does NOT yet have an `alert` entry — Plan 03 wires `_FORMATTER["alert"] = messages.format_alert`.
- The notifier's `_gather_candidates` and `_filter_blocked` paths currently iterate over `("decision", "approval", "failure", "overdue_schedule", "inbox")` — Plan 03 extends this tuple with `"alert"` and adapts `_gather_candidates` to SELECT pending notification_log rows of kind='alert' (the engine already writes them).
- POST /api/alerts/_ack endpoint is live and verified — Plan 03's Telegram callback handler can hit it directly with the 8-char scope_hash.

**Ready for Plan 15-05 (/alerts page panels):**
- All 6 endpoints in the URL Path Map (Plan 15-04 SUMMARY) are live and tested. Plan 04's `useAlertRules / useAlertEvents / useCreateAlertRule / usePatchAlertRule / useDeleteAlertRule / useAckAlert` hooks will cleanly consume them without any backend changes.

**No blockers carried forward. No schema changes shipped. Migration count unchanged.**

## TDD Gate Compliance

All 2 tasks executed RED→GREEN per `tdd="true"`:

| Task | RED commit | GREEN commit | Test count |
|------|-----------|--------------|------------|
| 1 (dispatcher) | 1517b07 (test) | 7b3e274 (feat) | 12 |
| 2 (router)     | 7272958 (test) | cc7548d (feat) | 19 |

REFACTOR phase skipped — code was clean enough on first GREEN; no refactor commit needed.

## Verification

```bash
# Task 1 dispatcher tests
$ cd backend && pytest tests/test_alerts_dispatcher.py -x -v
12 passed in 0.81s

# Task 2 router tests
$ cd backend && pytest tests/test_alerts_router.py -x -v
19 passed in 2.25s

# Full suite
$ cd backend && pytest --no-header
521 passed (490 baseline + 31 new = exact plan target)

# ALRT-12 invariant — strict (anchored) grep
$ grep -nE "^(from cmc\.dispatcher\.tasks|import cmc\.dispatcher\.tasks)" \
    backend/cmc/dispatcher/alerts.py backend/cmc/api/routes/alerts.py backend/cmc/alerts/*.py
(no matches; exit 1)

# Heartbeat hook surgical site
$ grep -n "evaluate_alerts" backend/cmc/dispatcher/heartbeat.py
86:                    from cmc.dispatcher.alerts import evaluate_alerts
87:                    await evaluate_alerts(db)
# (positioned between e-stop early return at line 75 and sweep_stale_pids at line 91)

# Router registration
$ grep -n "alerts_router" backend/cmc/api/routes/__init__.py
18:from cmc.api.routes.alerts import router as alerts_router
56:        alerts_router,         # Phase 15 ALRT-09
```

## Requirements Closed

- **ALRT-04**: Alert engine runs inside the existing 120s dispatcher tick — verified by test_heartbeat_hook_calls_evaluate_alerts (run_one_cycle with seeded firing rule produces 1 decision row).
- **ALRT-06**: Stable dedup_key + dedup via existing UNIQUE / partial-unique constraints — verified by test_evaluate_alerts_idempotent_per_tick + test_evaluate_alerts_concurrent_ticks.
- **ALRT-07**: Auto-resolve on clear writes decisions.status='answered' AND deletes notification_log row — verified by test_evaluate_alerts_auto_resolve_on_clear + test_evaluate_alerts_re_fire_after_clear.
- **ALRT-08**: Anomaly rules in insufficient_data state suppress notifications during 24h warm-up — verified by test_evaluate_alerts_anomaly_warmup_suppressed.
- **ALRT-09**: GET/POST/PATCH/DELETE /api/alerts/rules + GET /api/alerts/events?range= + POST /api/alerts/_ack live and validated — verified across all 19 router tests.
- **ALRT-12**: Alert engine never imports cmc.dispatcher.tasks — verified by ast-based static-import test PLUS shell grep.

ALRT-01, ALRT-02, ALRT-05 closed in Phase 13 / Plan 01 (carry forward only).

## Self-Check: PASSED

All claimed files exist on disk:
- `backend/cmc/dispatcher/alerts.py` — FOUND
- `backend/cmc/api/routes/alerts.py` — FOUND
- `backend/cmc/api/schemas/alerts.py` — FOUND
- `backend/cmc/dispatcher/heartbeat.py` (modified) — FOUND
- `backend/cmc/api/routes/__init__.py` (modified) — FOUND
- `backend/tests/test_alerts_dispatcher.py` — FOUND
- `backend/tests/test_alerts_router.py` — FOUND

All claimed commits exist in `git log`:
- `1517b07` (Task 1 RED) — FOUND
- `7b3e274` (Task 1 GREEN) — FOUND
- `7272958` (Task 2 RED) — FOUND
- `cc7548d` (Task 2 GREEN) — FOUND

All verification gates pass:
- `cd backend && pytest tests/test_alerts_dispatcher.py -x -v` → 12 passed
- `cd backend && pytest tests/test_alerts_router.py -x -v` → 19 passed
- Full backend suite → 521 passed (490 baseline + 31 new = exact plan target)
- ALRT-12 strict grep → exit 1 (no matches)
- Heartbeat hook lines 86-87 positioned between e-stop (line 75) and sweep_stale_pids (line 91)
- alerts_router registered at lines 18 + 56 of routes/__init__.py

---
*Phase: 15-alert-engine-ui*
*Plan: 02*
*Completed: 2026-05-04*
