---
phase: 15-alert-engine-ui
verified: 2026-05-04T15:50:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 15: Alert Engine & UI — Verification Report

**Phase Goal:** Ship a hysteresis-aware alert engine that runs inside the existing dispatcher tick, emits decisions + Telegram messages with stable dedup, auto-resolves when conditions clear, and is fully composable from a `/alerts` UI.
**Verified:** 2026-05-04T15:50:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create an alert rule via `POST /api/alerts/rules`, see it persisted with first-class hysteresis fields + `params_json` overflow, and trust that `evaluate_alerts(db)` runs once per dispatcher tick after `stamp_tick` (try/except guarded) | VERIFIED | `AlertRuleCreate` schema has all 9 hysteresis fields (threshold_fire, threshold_clear, min_dwell_seconds, min_samples, cooldown_seconds, spec_version, params_json, kind, metric). `heartbeat.py:84-89` has the try/except hook after e-stop check, before `sweep_stale_pids`. Route registered at `routes/__init__.py:18,56`. |
| 2 | User can trust that one firing condition produces exactly one decision row + one Telegram message regardless of evaluation cycles, via stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing the existing `notification_log` UNIQUE(kind, entity_id, chat_id) constraint — and that anomaly rules suppress notifications during the 24h warm-up | VERIFIED | `dispatcher/alerts.py:127` constructs the dedup_key with no timestamp. `_emit_firing` uses `on_conflict_do_nothing(index_elements=["kind","entity_id","chat_id"])`. `detector.py:239-243` gates INSUFFICIENT on `new_sc < rule.min_samples` AND `age_seconds < WARMUP_SECONDS`. Dispatcher `alerts.py:399-403` routes INSUFFICIENT to `state="insufficient_data"` with no `_emit_firing` call. Tests: `test_evaluate_alerts_idempotent_per_tick`, `test_evaluate_alerts_concurrent_ticks`, `test_evaluate_alerts_anomaly_warmup_suppressed` — all passing. |
| 3 | User can ack an alert via Telegram `ack_alert` callback verb and trust the suppression lasts 1h; alerts auto-resolve when the underlying metric clears via `decisions.status='answered'` with `answered_by='alert_engine'` | VERIFIED | `callback_verbs.py` has `CallbackVerb.ack_alert = "ack_alert"` (8th member). `dash_router.py:90,105` routes it to `POST /api/alerts/_ack`. `routes/alerts.py:383` sets `acked_until = now + timedelta(hours=1)`. `dispatcher/alerts.py:283` checks `state.acked_until > now` before calling detector. `_auto_resolve` sets `answered_by='alert_engine'`, `status='answered'` and deletes the notification_log row. 77 alert tests pass. |
| 4 | User can navigate to `/alerts` and see `AlertRulesList` + `AlertRuleForm` at 30s polling cadence, and hit the full CRUD endpoints (GET/POST/PATCH/DELETE /api/alerts/rules, GET /api/alerts/events?range=) | VERIFIED | `routes/alerts.tsx:50` creates `createFileRoute('/alerts')` composing all 3 panels. `NavBar.tsx:9` has Alerts link. `queries.ts:201-202,208-209` both hooks have `refetchInterval:30_000, staleTime:20_000`. No inline `refetchInterval` in panel files. All 6 CRUD endpoints implemented in `routes/alerts.py`. 30 frontend panel tests pass. |
| 5 | Alert Telegram messages are plain-text only (no `parse_mode=`) and the alert engine NEVER imports `cmc.dispatcher.tasks` | VERIFIED | `grep -nE "parse_mode\s*=" messages.py notifier.py dispatcher/alerts.py` exits 1 (no matches). `grep -nE "^(from cmc.dispatcher.tasks|import cmc.dispatcher.tasks)" alerts.py routes/alerts.py` exits 1. AST-based static import test `test_no_tasks_import` passes. |

**Score: 5/5 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/cmc/alerts/__init__.py` | Package marker | VERIFIED | Exists |
| `backend/cmc/alerts/detector.py` | AlertSignal enum + evaluate_threshold + evaluate_anomaly | VERIFIED | ~278 lines. Full hysteresis state machine. WARMUP_SECONDS=86400. EPSILON=1e-9. stdlib math only. |
| `backend/cmc/alerts/scopes.py` | 3 scope extractors + is_known_metric | VERIFIED | All 3 metrics: cost_usd_24h, skill_p95_latency_ms, dispatcher_failed_tasks_5m. `_SCOPE_EXTRACTORS` dict. `is_known_metric()` helper. |
| `backend/cmc/dispatcher/alerts.py` | evaluate_alerts(db) orchestrator | VERIFIED | ~411 lines. Per-rule exception isolation. dedup_key pattern. _emit_firing + _auto_resolve. No `cmc.dispatcher.tasks` import. |
| `backend/cmc/dispatcher/heartbeat.py` | Alert hook after e-stop, before sweep_stale_pids | VERIFIED | Lines 84-89: try/except wrapped evaluate_alerts between e-stop early-return (line 74) and sweep_stale_pids (line 92). |
| `backend/cmc/api/routes/alerts.py` | 6 endpoints under /api/alerts | VERIFIED | GET/POST /rules, PATCH/DELETE /rules/{id}, GET /events?range=, POST /_ack. alert_state JOIN for last_value (BUG-1 hotfix). |
| `backend/cmc/api/schemas/alerts.py` | AlertRuleCreate + AlertRulePatch + AlertEvent + AlertAckRequest | VERIFIED | All hysteresis fields. model_validator cross-field checks. UTCDatetime on fired_at/cleared_at. |
| `backend/cmc/api/schemas/common.py` | UTCDatetime PlainSerializer | VERIFIED | `when_used='json'` gate. Emits Z suffix. Migrated 8 schema files / 37 datetime fields (BUG-2 hotfix). |
| `backend/cmc/telegram/callback_verbs.py` | CallbackVerb StrEnum with 8 members | VERIFIED | Exactly 8 members: approve_task, reject_task, rerun_task, answer_decision, reply_inbox, snooze, estop, ack_alert. |
| `backend/cmc/telegram/messages.py` | format_alert plain-text composer | VERIFIED | Returns `(text, kb)`. No parse_mode. sha256(scope_key)[:8] callback_data. Single Ack 1h button. |
| `backend/cmc/telegram/notifier.py` | _FORMATTER['alert'] + _send_pending_alerts | VERIFIED | Line 438: `_FORMATTER["alert"]` entry. `_send_pending_alerts` sweep at line 333. Wired into `run_one_cycle` at line 520. |
| `backend/cmc/telegram/dash_router.py` | ack_alert verb routes to /api/alerts/_ack | VERIFIED | Line 90: `if verb == CallbackVerb.ack_alert`. Line 105: returns `/api/alerts/_ack`. No string-literal verb comparisons. |
| `backend/cmc/db/models/alert_rules.py` | AlertRule with all ALRT-01 fields | VERIFIED | All 11 structural columns + params_json overflow. |
| `backend/cmc/db/models/alert_state.py` | AlertState with ALRT-02 lifecycle fields | VERIFIED | (rule_id, scope_key) UNIQUE constraint. acked_until column. state/fired_at/cleared_at lifecycle. |
| `backend/migrations/versions/0002_v1_1_alerts_and_skills.py` | Migration creates both tables | VERIFIED | Creates alert_rules (lines 112-133) and alert_state (lines 136-161) with correct schema. |
| `frontend/src/components/panels/AlertRulesList.tsx` | Rule list + toggle + delete | VERIFIED | 158 lines. DataTable with 7 cols. usePatchAlertRule (enabled-only surgical optimism). useDeleteAlertRule with confirm guard. |
| `frontend/src/components/panels/AlertRuleForm.tsx` | Discriminated-union composer | VERIFIED | 369 lines. 2-tab [Threshold/Anomaly]. KNOWN_METRICS constant. All hysteresis fields. Client-side + 422 validation. |
| `frontend/src/components/panels/AlertEventsList.tsx` | Events history + range toggle | VERIFIED | 113 lines. DataTable with fired_at RelativeTime / StatePill / last_value. 4-tier RangeToggle. |
| `frontend/src/routes/alerts.tsx` | /alerts file-based route | VERIFIED | createFileRoute('/alerts'). 3 panels in 2 .cmc-card-grid rows. |
| `frontend/src/lib/api.ts` | 7 interfaces + 6 fetchers + 6 standalone aliases | VERIFIED | AlertRange, AlertKind, AlertRule, AlertRuleCreate, AlertRulePatch, AlertEvent, AlertEventsResponse, AlertAckRequest. api.alertRules/alertRuleCreate/alertRulePatch/alertRuleDelete/alertEvents/alertAck. All 6 fetchAlert* aliases. |
| `frontend/src/lib/queries.ts` | 2 qk entries + 2 hooks + 4 mutations at 30s cadence | VERIFIED | qk.alertRules() = ['alert-rules'], qk.alertEvents(range) = ['alert-events', range]. Both hooks at refetchInterval=30_000, staleTime=20_000. 4 mutations with correct invalidation keys. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `heartbeat.py` | `evaluate_alerts(db)` | Function-local import in try/except block | VERIFIED | Lines 86-87: `from cmc.dispatcher.alerts import evaluate_alerts; await evaluate_alerts(db)` after e-stop check, before sweep_stale_pids |
| `evaluate_alerts` | `evaluate_threshold / evaluate_anomaly` | `_evaluate_rule` dispatches by `rule.kind` | VERIFIED | `dispatcher/alerts.py:306-317`: threshold→evaluate_threshold; anomaly→evaluate_anomaly |
| `evaluate_alerts` | `_SCOPE_EXTRACTORS` | `extractor = _SCOPE_EXTRACTORS.get(rule.metric)` | VERIFIED | `dispatcher/alerts.py:269` |
| `_emit_firing` | `notification_log` | `sqlite_insert + on_conflict_do_nothing(index_elements=["kind","entity_id","chat_id"])` | VERIFIED | `dispatcher/alerts.py:160-175`. Skips insert when chat_id empty. |
| `_emit_firing` | `decisions` | `sqlite_insert + on_conflict_do_nothing(dedup_key WHERE status='pending')` | VERIFIED | `dispatcher/alerts.py:136-153` |
| `dash_router.route("ack_alert")` | `POST /api/alerts/_ack` | Returns `("/api/alerts/_ack", {rule_id, scope_hash})` | VERIFIED | `dash_router.py:105` |
| `POST /api/alerts/_ack` | `AlertState.acked_until` | `UPDATE AlertState SET acked_until = now + 1h` | VERIFIED | `routes/alerts.py:383` |
| `AlertRuleForm` | `useCreateAlertRule` | `mutation.mutate(body)` on submit | VERIFIED | `AlertRuleForm.tsx` uses `useCreateAlertRule` from queries. Panel tests confirm POST body shape. |
| `AlertRulesList` | `useAlertRules` | Consumes `AlertRuleListResponse` | VERIFIED | 30 frontend tests pass including render + toggle + delete flows. |
| `AlertEventsList` | `useAlertEvents` | Consumes `AlertEventsResponse` with `last_value` from alert_state JOIN | VERIFIED | BUG-1 hotfix in `routes/alerts.py:305-319`. Regression test passes. |
| `format_alert` | `decisions.prompt` | `prompt = format_alert(rule, scope_key, value)[0]` | VERIFIED | `dispatcher/alerts.py:133`. D-06 follow-through: local stub deleted. |
| `alerts_router` | FastAPI app | `routes/__init__.py:18,56` registers `alerts_router` | VERIFIED | Import at line 18, appended at line 56. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `AlertRulesList.tsx` | `useAlertRules()` → `AlertRuleListResponse` | `GET /api/alerts/rules` → `select(AlertRule).order_by(rule_id.desc())` | Yes — real DB query | FLOWING |
| `AlertEventsList.tsx` | `useAlertEvents(range)` → `AlertEventsResponse` | `GET /api/alerts/events?range=` → decisions WHERE dedup_key LIKE 'alert:%' + alert_state JOIN for last_value | Yes — real DB queries with Python-side join | FLOWING |
| `AlertRuleForm.tsx` | `useCreateAlertRule` mutation → posted to `POST /api/alerts/rules` | Inserts AlertRule row and returns created row | Yes — real DB insert | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| Backend alert tests pass (77 tests across 5 test files) | `pytest tests/test_alerts_*.py` | 77 passed in 3.65s | PASS |
| Full backend suite unchanged (540 total) | `pytest` (full suite) | 540 passed, 0 failed | PASS |
| Frontend panel tests pass (30 tests across 4 test files) | `pnpm vitest run lib/__tests__/queries.test.ts components/panels/__tests__/Alert*.test.tsx` | 30 passed | PASS |
| ALRT-12 invariant: no cmc.dispatcher.tasks import | `grep -nE "^(from cmc.dispatcher.tasks|import cmc.dispatcher.tasks)" dispatcher/alerts.py api/routes/alerts.py` | Exit 1 (no matches) | PASS |
| ALRT-11 invariant: no parse_mode= in alert paths | `grep -nE "parse_mode\s*=" messages.py notifier.py dispatcher/alerts.py` | Exit 1 (no matches) | PASS |
| D-02 invariant: no string-literal verb comparisons in dash_router | `grep 'if verb == "' dash_router.py` | Exit 1 (no matches) | PASS |
| ALRT-12 AST audit test passes | `pytest tests/test_alerts_dispatcher.py::test_no_tasks_import` | 1 passed | PASS |
| Heartbeat hook placement (after e-stop, before sweep) | Lines 74-92 of heartbeat.py | e-stop return at line 74, evaluate_alerts at lines 86-87, sweep_stale_pids at line 92 | PASS |
| dedup_key format: no timestamp in key | Code inspection `dispatcher/alerts.py:127` | `f"alert:{rule_id}:{scope_key}"` — no timestamp | PASS |
| UTCDatetime Z-suffix regression test | `pytest tests/test_alerts_router.py::test_datetime_fields_serialize_with_z_suffix` | Included in 540 passing | PASS |
| last_value JOIN regression test | `pytest tests/test_alerts_router.py::test_events_endpoint_surfaces_last_value_via_alert_state_join` | Included in 540 passing | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ALRT-01 | Phase 13 (landed) / Phase 15 (used) | alert_rules table with structural columns + params_json | SATISFIED | `alert_rules.py` model has all 11 columns. Migration `0002_v1_1_alerts_and_skills.py` creates the table. (REQUIREMENTS.md `[ ]` marker is a documentation gap — table exists and is live.) |
| ALRT-02 | Phase 13 (landed) / Phase 15 (used) | alert_state table tracking lifecycle per (rule_id, scope_key) | SATISFIED | `alert_state.py` model has UNIQUE(rule_id, scope_key) + acked_until + sample_count. Migration creates the table. |
| ALRT-03 | Plan 15-01 | detector.py: evaluate_threshold + evaluate_anomaly + AlertSignal | SATISFIED | `cmc/alerts/detector.py` — both functions present, stdlib math only. 19 tests. |
| ALRT-04 | Plan 15-02 | evaluate_alerts(db) called once per dispatcher tick, try/except guarded | SATISFIED | `heartbeat.py:84-89`. try/except wraps the call. After e-stop early return. |
| ALRT-05 | Plan 15-01 | Anomaly rules suppress notifications during 24h warm-up + min_samples gate | SATISFIED | `detector.py:239-243`: dual gate (min_samples AND WARMUP_SECONDS). `dispatcher/alerts.py:399-403`: INSUFFICIENT → no emit. |
| ALRT-06 | Plan 15-02 | One firing condition → one decision + one Telegram message, stable dedup_key | SATISFIED | `dispatcher/alerts.py:127,147-151,160-175`: dedup_key without timestamp, on_conflict_do_nothing on both tables. |
| ALRT-07 | Plan 15-02 | Auto-resolve: decisions.status='answered', answered_by='alert_engine' | SATISFIED | `_auto_resolve` in `dispatcher/alerts.py:193-195`. Also deletes stale notification_log row (Pitfall 5 fix). |
| ALRT-08 | Plan 15-03 | ack_alert Telegram callback verb → 1h suppression | SATISFIED | `callback_verbs.py` has ack_alert. `dash_router.py:90,105` routes to /api/alerts/_ack. `routes/alerts.py:383` stamps acked_until. `dispatcher/alerts.py:283` checks ack before detector. |
| ALRT-09 | Plan 15-02 | GET/POST/PATCH/DELETE /api/alerts/rules + GET /api/alerts/events?range= | SATISFIED | All 6 endpoints implemented in `api/routes/alerts.py`. Router registered. 19 router tests pass. |
| ALRT-10 | Plans 15-04/05 | /alerts route with AlertRulesList + AlertRuleForm at 30s polling | SATISFIED | Route exists. NavBar link present. Both hooks at 30s cadence in queries.ts. 3 panels in 2 grid rows. Browser human-verify APPROVED. |
| ALRT-11 | Plan 15-03 | Alert Telegram messages are plain-text only (no parse_mode=) | SATISFIED | grep exits 1. format_alert returns plain text + reply_markup without parse_mode. Recursive scan test in test_alerts_telegram.py. |
| ALRT-12 | Plan 15-02 | Alert engine never imports cmc.dispatcher.tasks | SATISFIED | grep exits 1. AST test passes. test_no_tasks_import verifies all alert engine modules. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/cmc/db/models/alert_rules.py:30-31` | 30 | `Field(default_factory=datetime.utcnow)` — deprecated utcnow in model defaults | Info | Cosmetic; does not affect HTTP responses (UTCDatetime serializer in schemas handles the Z suffix). Pre-existing pattern across other models. Not a blocker. |
| `.planning/REQUIREMENTS.md` | ALRT-01, ALRT-02 | Still marked `[ ]` (incomplete) despite both tables existing in codebase since Phase 13 | Info | Documentation gap only — code is correct. Tables, models, and migration all exist. Phase 15 closes the requirements functionally. |

No blocker or warning anti-patterns found in the Phase 15 production code surface.

---

### Human Verification Required

The browser end-to-end flow was already performed and APPROVED by the operator prior to invoking the verifier (documented in the 15-05-SUMMARY.md verification trace). Steps covered:

1. Page loads at /alerts with empty state (both panels render)
2. Rule creation via AlertRuleForm (POST, row appears in AlertRulesList)
3. Toggle Off→On round-trip (PATCH optimistic flip)
4. Dispatcher tick triggers alert_state row + decision + notification_log
5. AlertEventsList shows firing event with correct last_value and timestamp (post BUG-1 + BUG-2 hotfix)
6. Telegram delivery (SKIPPED — no bot configured in test env; notification_log row reaches `sent` status)
7. Delete rule → 204 → row removed, alert_state cascades clean
8. Range toggle triggers fresh events query
9. Anomaly tab field swap (discriminated-union UX)

The single human-verify item not covered by automated tests (Telegram round-trip with a live bot) was explicitly accepted by the operator as out of scope for this environment, per the Phase 9 baseline.

---

### Gaps Summary

No gaps identified. All 5 success criteria trace to verified, substantive, wired code with data flowing end-to-end. The two REQUIREMENTS.md documentation items (ALRT-01/ALRT-02 `[ ]` markers) are cosmetic and do not reflect missing implementation — both tables, models, and the migration exist and are exercised by 77 passing automated tests.

---

_Verified: 2026-05-04T15:50:00Z_
_Verifier: Claude (gsd-verifier)_
