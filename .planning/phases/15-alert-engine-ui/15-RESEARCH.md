# Phase 15: Alert Engine & UI — Research

**Researched:** 2026-05-04
**Domain:** Hysteresis-aware alert detector inside dispatcher tick + decisions/Telegram delivery + `/alerts` CRUD UI
**Confidence:** HIGH (codebase intelligence; no external libraries newly introduced)

## Summary

Phase 15 ships an **in-process** alert engine bolted onto the existing 120s dispatcher heartbeat (`StartInterval=120` in `com.cmc.dispatcher.plist.j2`). It writes nothing new to disk — the schema (`alert_rules`, `alert_state`) already landed in Phase 13 migration `0002_v1_1_alerts_and_skills`. The detector is **hand-rolled stdlib-only math** (~100 LOC: threshold + EWMA z-score). Notification + dedup ride existing rails: `notification_log` UNIQUE constraint, `decisions` partial-unique on `dedup_key WHERE status='pending'`, plain-text `messages.py` formatters, callback dispatch through `dash_router`. Phase 15 *creates* `cmc/telegram/callback_verbs.py` (the file does not exist today; both `dash_router.py` and `handler.py` use string verbs inline) and registers a new `ack_alert` verb.

The frontend mirrors the Phase 14 lib pattern verbatim: `SkillRange`-style narrowed `Literal` types, kebab-prefixed `qk.*` keys (e.g. `'alert-rules'`, `'alert-events'`), per-bucket cadence policy in `queries.ts` only, panels never inline `refetchInterval`. The `/alerts` route gets a `PanelCard` + `DataTable` rules list and a discriminated-union `AlertRuleForm` composer.

The single most load-bearing unspecified detail is **scope_key composition** (focus area #12). REQUIREMENTS.md and STATE.md only say "the dimension key the rule fires on (e.g. `model:claude-opus-4-7` for a per-model cost rule)". The planner must lock per-metric scope_key extractors as part of Plan 01 — see Open Questions.

**Primary recommendation:** Mirror Phase 14's plan layout — Plan 01 ships `cmc/alerts/detector.py` + dispatcher hook + tests; Plan 02 ships the CRUD router + schemas + tests; Plan 03 ships frontend lib plumbing (types, fetchers, hooks, qk); Plan 04 ships `/alerts` route + panels (AlertRulesList, AlertRuleForm); Plan 05 ships Telegram message composer + `ack_alert` callback wiring + `callback_verbs.py` central enum extraction.

<user_constraints>
## User Constraints (from phase_context — no CONTEXT.md exists)

### Locked Decisions (from STATE.md + ROADMAP.md + REQUIREMENTS.md ALRT-01..12)

- **Tick host:** Alert engine lives INSIDE the existing 120s dispatcher tick (no new launchd job).
- **Decisions only (ALRT-12):** Engine MUST NEVER import `cmc.dispatcher.tasks` or create dispatcher tasks. User gates action via existing autonomy controls.
- **Stable dedup_key format:** `alert:{rule_id}:{scope_key}` (no timestamps in key).
- **Schema:** Phase 13 already shipped `alert_rules` + `alert_state` tables in migration `0002_v1_1_alerts_and_skills` with FINAL ALRT-01/02 shape. **Phase 15 ships ZERO migrations.**
- **Hysteresis fields are FIRST-CLASS columns:** `threshold_fire`, `threshold_clear`, `min_dwell_seconds`, `min_samples`, `cooldown_seconds`, `spec_version` + `params_json` overflow.
- **Dedup:** `notification_log` UNIQUE(`kind`, `entity_id`, `chat_id`) constraint already exists — reuse it.
- **Callback verbs central enum:** `cmc/telegram/callback_verbs.py` — register `ack_alert` there (file is NEW in Phase 15).
- **Telegram:** Plain-text only, NO `parse_mode=` (CI grep guard exists at Phase 9-01 unit test; extends in Phase 17).
- **Frontend polling:** 30s for `/alerts`.
- **Anomaly warm-up:** 24h window suppresses notifications when sample count < `min_samples`.
- **Ack:** Suppresses re-notification for 1h without clearing underlying condition.
- **Auto-resolve:** `decisions.status='answered'`, `answered_by='alert_engine'`.

### Claude's Discretion (no CONTEXT.md — planner inherits these)

- Per-metric `scope_key` extractor identity (e.g. `model:foo` for cost-by-model). REQUIREMENTS.md gives one example only — Plan 01 must lock the full scope_key vocabulary.
- Plan structure (Phase 14 used 5 plans; Phase 15 has comparable surface area).
- Telegram message body format for alerts (only constraint: plain-text + reuses `_kb()` helper from `messages.py`).
- AlertRuleForm UX (composer with hysteresis fields; discriminated union over `kind`).
- Initial seeded set of alert metrics — REQUIREMENTS.md gives 2 examples (`cost_usd_24h`, `skill_p95_latency_ms`).

### Deferred Ideas (OUT OF SCOPE — defer to v1.2 / Phase 17)

- **ALRT-13:** Anomaly detection refinement (rolling mean ± stddev with `min_samples` gate refinement).
- **ALRT-14:** NL-authored alert rules ("alert me when daily cost exceeds $20") via Haiku.
- **POLI-02:** CI grep test for `parse_mode=` — Phase 17.
- **POLI-03:** Round-trip unit tests for every callback verb — Phase 17.
- **POLI-04:** Always-firing integration test — Phase 17.
- **TEST-05:** Playwright e2e for `/alerts` — Phase 17.
- Auto-pause / auto-remediation on alert (alerts are sensors, not actuators).
- SLO / error budget tracking (multi-team scope).
- Per-skill alert message templates (single plain-text format).
</user_constraints>

## Standard Stack

### Core (already in project; nothing new added)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stdlib `math` | 3.13 | EWMA + z-score primitives (`sqrt`, `fabs`) | ALRT-03 explicitly says "stdlib `math` only" — ~100 LOC hand-rolled |
| SQLModel | latest pinned | `AlertRule` + `AlertState` models | Already used; tables exist with final shape |
| FastAPI APIRouter | latest pinned | `/api/alerts/*` CRUD | Existing project pattern (`cost.py`, `skills.py`, `schedules.py`) |
| Pydantic v2 | latest pinned | Request/response schemas, `Literal` enums for `range`/`kind` | Existing pattern; `Decimal`-as-JSON-string locked |
| `sqlalchemy.dialects.sqlite.insert` | n/a | `INSERT ON CONFLICT DO NOTHING` for atomic dedup | Existing pattern at `notifier.py::_claim_and_send`, `hitl.py::create_decision` |
| TanStack Query v5 | per project | Polling hooks at 30s for `/alerts` | Existing `lib/queries.ts` cadence policy |
| TanStack Router | per project | `createFileRoute('/alerts')` for the new page | Mirrors `routes/skills.tsx` pattern |

### Frontend Supporting (existing UI primitives)

| Component | Source | Use |
|-----------|--------|-----|
| `PanelCard<T>` | `components/ui/PanelCard.tsx` | Wrap rules list + events list |
| `DataTable<Row>` | `components/ui/DataTable.tsx` | AlertRulesList table |
| `RangeToggle` | `components/ui/RangeToggle.tsx` | Events `?range=` selector (mirrors `cost.py` `Literal["1d","7d","14d","30d"]`) |
| `EmptyState` / `Skeleton` / `Badge` / `StatePill` | `components/ui/` | Form + table affordances |
| (NEW) `AlertRuleForm` | `panels/AlertRuleForm.tsx` | Discriminated-union composer over `kind` |

### Don't Add Anything New

This phase intentionally avoids new dependencies (per ALRT-03 "stdlib `math` only"). No statistics library (`numpy`, `scipy`) — EWMA + rolling z-score are 50 LOC.

## Architecture Patterns

### Recommended File Structure

```
backend/cmc/
├── alerts/                          # NEW package
│   ├── __init__.py
│   └── detector.py                  # ALRT-03 — evaluate(rule, db) -> AlertSignal
├── dispatcher/
│   ├── alerts.py                    # NEW — ALRT-04 evaluate_alerts(db) entry
│   └── heartbeat.py                 # MODIFIED — add try/except call after stamp_tick
├── telegram/
│   ├── callback_verbs.py            # NEW — central StrEnum (ack_alert + existing verbs)
│   ├── dash_router.py               # MODIFIED — import from callback_verbs.py
│   ├── handler.py                   # MODIFIED — handle ack_alert callback
│   └── messages.py                  # MODIFIED — format_alert(rule, state) plain-text
├── api/
│   ├── routes/alerts.py             # NEW — full CRUD + events endpoint
│   ├── schemas/alerts.py            # NEW — request/response models
│   └── routes/__init__.py           # MODIFIED — append alerts_router to all_routers()
└── tests/
    ├── test_alerts_detector.py      # NEW
    ├── test_alerts_dispatcher.py    # NEW (in-memory tick test)
    ├── test_alerts_router.py        # NEW
    └── test_alerts_telegram.py      # NEW

frontend/src/
├── lib/
│   ├── api.ts                       # MODIFIED — Alert* interfaces + 5 fetchers
│   ├── queries.ts                   # MODIFIED — qk.alertRules / qk.alertEvents + 6 hooks/mutations
├── routes/
│   └── alerts.tsx                   # NEW — file-based route (createFileRoute('/alerts'))
└── components/panels/
    ├── AlertRulesList.tsx           # NEW
    ├── AlertRuleForm.tsx            # NEW — discriminated-union composer
    └── index.ts                     # MODIFIED — re-exports
```

### Pattern 1: Dispatcher tick integration (ALRT-04)

**Anatomy of `cmc/dispatcher/heartbeat.py::run_one_cycle()`:**

1. Build engine + sessionmaker.
2. **`stamp_tick(sessions)` FIRST** — wrapped in outer try/finally so SAPI-04 sees liveness on partial failure (Pitfall 5 from existing code).
3. Emergency-stop early return.
4. `sweep_stale_pids()` → set of live PIDs.
5. `materialize_due_schedules(db)` → new task rows.
6. Slot computation + `claim_pending_tasks(engine, slots)`.
7. Per-task fan-out (skill resolve → autonomy gate → spawn runner thread).
8. Cycle ends when all runner threads `t.join()` complete (via `asyncio.to_thread`).

**Where alerts hook in:** Immediately after `stamp_tick`, BEFORE the emergency-stop early return — but per ROADMAP.md SC#1 "after `stamp_tick`" is the single locked anchor. **Recommended placement:** AFTER `stamp_tick` but BEFORE the emergency-stop check, with its own try/except (so a detector raise never poisons the cycle and never blocks the e-stop check). Alternative: AFTER e-stop check (so e-stop disables alerts too — defensible). Plan 01 must lock this; ROADMAP wording allows either.

**Concurrency control:** No advisory lock. Concurrent ticks are serialized at the SQLite WAL level (`BEGIN IMMEDIATE` in `claim_pending_tasks`). Alert evaluation does not contend with claim — a second tick reading `alert_rules` is harmless. **Pitfall:** two concurrent ticks could BOTH evaluate the same rule and BOTH try to insert into `notification_log`. The UNIQUE constraint on (`kind`, `entity_id`, `chat_id`) handles this — `INSERT ON CONFLICT DO NOTHING` returns rowcount=0 for the loser, exactly as `notifier.py::_claim_and_send` does today. **Reuse this idiom verbatim.**

**Tick budget:** No hard timeout enforced today; the test `test_state_stamp_tick_upserts` shows ticks complete in ~10ms when idle. Alert evaluation must not exceed ~1s (rules × scopes × O(SQL) — SQLite local single-user, well within budget for v1.0 rule count of <50).

### Pattern 2: API router trio (cost.py / skills.py precedent)

```python
# Source: backend/cmc/api/routes/cost.py:1-50 + skills.py:62-95
router = APIRouter(tags=["alerts"])

_RANGE_TO_DAYS: dict[str, int] = {"1d": 1, "7d": 7, "14d": 14, "30d": 30}

def _range_start(range_: str) -> datetime:
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(days=_RANGE_TO_DAYS[range_])

@router.get("/alerts/rules", response_model=AlertRuleListResponse)
async def list_rules(db: AsyncSession = Depends(get_session)) -> AlertRuleListResponse:
    ...

@router.post("/alerts/rules", response_model=AlertRuleRow, status_code=201)
async def create_rule(payload: AlertRuleCreate, db: AsyncSession = Depends(get_session)) -> AlertRuleRow:
    ...

@router.patch("/alerts/rules/{rule_id}", response_model=AlertRuleRow)
async def patch_rule(rule_id: int, payload: AlertRulePatch, db: AsyncSession = Depends(get_session)) -> AlertRuleRow:
    ...

@router.delete("/alerts/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_session)) -> None:
    ...

@router.get("/alerts/events", response_model=AlertEventsResponse)
async def list_events(
    db: AsyncSession = Depends(get_session),
    range_: AlertRange = Query("7d", alias="range"),  # Literal["1d","7d","14d","30d"]
) -> AlertEventsResponse:
    ...
```

Then register in `routes/__init__.py::all_routers()`:

```python
# Source: backend/cmc/api/routes/__init__.py:35-55
return [..., cost_router, hitl_router, ..., alerts_router]
```

### Pattern 3: notification_log dedup (TELE-04 / Pitfall P6)

**Verbatim from `notifier.py::_claim_and_send` (the canonical pattern):**

```python
# Source: backend/cmc/telegram/notifier.py:226-260
stmt = (
    sqlite_insert(NotificationLog)
    .values(
        kind=kind,                      # "alert" for Phase 15
        entity_id=entity_id,            # f"alert:{rule_id}:{scope_key}" (the dedup_key)
        chat_id=chat_id,
        sent_at=now,
        status="pending",
    )
    .on_conflict_do_nothing(
        index_elements=["kind", "entity_id", "chat_id"]
    )
)
result = await db.execute(stmt)
await db.commit()
if (result.rowcount or 0) == 0:
    return False  # raced; another tick won the slot
# We own the slot. Format + send.
```

**Existing `kind` values (5 today):** `decision`, `approval`, `failure`, `overdue_schedule`, `inbox`. Phase 15 adds **`alert`** as the 6th kind. `entity_id` becomes the dedup_key string `f"alert:{rule_id}:{scope_key}"`.

### Pattern 4: decisions row (HITL-02 partial-unique)

**Source:** `backend/cmc/db/models/decisions.py` + `backend/cmc/api/routes/hitl.py:97-145`

`decisions` table has partial-unique index `uq_decisions_pending_dedup_key` on `(dedup_key)` WHERE `status='pending'`. Insert pattern:

```python
# Source: backend/cmc/api/routes/hitl.py:110-126
stmt = (
    sqlite_insert(Decision)
    .values(
        session_id=None,                # alerts are not session-scoped
        task_id=None,
        dedup_key=f"alert:{rule_id}:{scope_key}",
        prompt=...,                     # human-readable alert text
        options=[...],                  # ["ack"] or [] depending on UX
        status="pending",
        created_at=datetime.now(UTC),
    )
    .on_conflict_do_nothing(
        index_elements=["dedup_key"],
        index_where=text("status = 'pending'"),
    )
    .returning(Decision)
)
```

**Auto-resolve (ALRT-07):** When the detector flips firing→clear, find the open decision row by `dedup_key` and `status='pending'`, then update:
```python
row.status = "answered"
row.answer = "auto-resolved"
row.answered_by = "alert_engine"
row.answered_at = datetime.now(UTC)
```
NO file-then-DB ordering needed (alert auto-resolve is a server-side state transition; the queue file pattern exists for Telegram-issued or dashboard-issued answers).

### Pattern 5: Telegram callback round-trip

**Today's verb dispatch flow:**
1. `handler.py::dispatch_callback` reads `callback_query.data` (≤64-byte string).
2. `dash_router.decode_callback(data)` → `(verb, args)`.
3. `dash_router.route(verb, args)` → `(METHOD, path, body)`.
4. Handler dispatches HTTP to `http://127.0.0.1:8765{path}`.
5. `answer_callback_query` (within Telegram's 15s contract) + `edit_message_reply_markup` (strip buttons on success).

**Phase 15 additions:**
- **`callback_verbs.py` (NEW):** Central `StrEnum` of all verbs. The user constraint says it's an "enum"; convention from `cmc/api/schemas/common.py::RangeWindow` (StrEnum) confirms StrEnum is the project standard.
- **`ack_alert:<dedup_key>` verb:** Registered in `dash_router.route()` as `("POST", "/api/alerts/rules/_ack", {"dedup_key": ...})` OR as a special method that updates `alert_state.acked_until = now + 1h`. Note the 64-byte cap — `dedup_key` can be long; pass `rule_id:scope_key_hash` instead if needed. Plan 02/05 must lock the encoding.
- **Refactor existing `dash_router.route()`** to read verb constants from `callback_verbs.py` rather than string literals.

### Pattern 6: Frontend lib plumbing (Phase 14 SkillRange precedent)

**Source:** `frontend/src/lib/api.ts:13-16` + `lib/queries.ts:54-96, 222-262`

**Locked Phase 14 conventions to mirror verbatim:**

1. **Narrowed `Literal` type alias:** `export type AlertRange = '1d' | '7d' | '14d' | '30d'` (or whatever range options frontend exposes — Plan 03 locks). Mirrors `SkillRange = '14d' | '30d'`.
2. **Kebab-prefixed `qk.*` keys:** `qk.alertRules: () => ['alert-rules'] as const` and `qk.alertEvents: (range: AlertRange) => ['alert-events', range] as const`. **Never reuse a bare `'alerts'` prefix** — Pitfall 5 from 14-RESEARCH.
3. **Cadence policy in queries.ts only:** Add a `30s — alerts` bucket comment near the existing 30s bucket (pressure / latency / failures / sessions list).
4. **Hooks at `refetchInterval: 30_000, staleTime: 20_000`** — matches existing 30s tier.
5. **Mutations:** `useCreateAlertRule`, `usePatchAlertRule`, `useDeleteAlertRule` — `onSuccess` invalidates `qk.alertRules()`. PATCH on `enabled` toggle CAN be optimistic (idempotent transition); CREATE / PATCH-on-thresholds are NOT optimistic (server may 422 on validation).
6. **Fetcher exports:** Both `api.alertRules / api.alertCreate / ...` map entries AND standalone `fetchAlertRules` aliases (Phase 14 pattern at `api.ts:1088`).

### Anti-Patterns to Avoid

- **Don't import `cmc.dispatcher.tasks` from `cmc/alerts/` or `cmc/dispatcher/alerts.py`** — ALRT-12 prohibits this; the test_alerts_dispatcher.py MUST assert no such import.
- **Don't add a `parse_mode=` argument anywhere** — Phase 9-01 grep guard fails the build (existing test `test_telegram_units.py:15`).
- **Don't put `refetchInterval` in panel components** — cadence is encoded in `lib/queries.ts` (Phase 14 lib pattern).
- **Don't forget `from_attributes=True`** for response schemas built via `model_validate(orm_row)` — use `ORMBase` mixin from `schemas/common.py:37-46`.
- **Don't use `fastapi.encoders.jsonable_encoder`** on Decimal fields — silent precision loss (cost.py header note).
- **Don't put timestamps in `dedup_key`** — ALRT-06 requires stable keys.
- **Don't write a new migration** — ALRT-01/02 already shipped in `0002_v1_1_alerts_and_skills.py` (Phase 13 Plan 02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron parsing | n/a (alerts not cron-driven) | dispatcher tick is the cadence | ALRT-04 locks tick host |
| Concurrent dedup | SELECT-then-INSERT | `INSERT ON CONFLICT DO NOTHING` via `sqlalchemy.dialects.sqlite.insert` | Pitfall P6 in `notifier.py:6` — races would double-send |
| HITL queue | new state machine | Reuse `decisions` partial-unique + `notification_log` UNIQUE | ALRT-06/07 explicit; Phase 9/11 already wired |
| Telegram message formatting | `parse_mode=MarkdownV2` escapes | Plain-text via existing `_kb()` helper in `messages.py` | Phase 9-01 inspect.signature() grep guard |
| Statistical detector | NumPy/SciPy | stdlib `math` (~50 LOC EWMA + z-score) | ALRT-03 explicit |

**Key insight:** Every pattern Phase 15 needs already exists in this codebase. The work is *composition*, not invention. ~600 LOC backend + ~400 LOC frontend, no new dependencies.

## Detector Math (ALRT-03 — stdlib only)

### Threshold detector (~50 LOC)

```python
# Source: hand-rolled per ALRT-03; pseudo-code structure
def evaluate_threshold(rule: AlertRule, current_value: float, state: AlertState) -> AlertSignal:
    """Hysteresis-aware threshold comparator.

    Fire   when value > threshold_fire AND held for min_dwell_seconds.
    Clear  when value < threshold_clear (asymmetric to threshold_fire).
    """
    now = datetime.now(UTC)
    if state.state == "firing":
        if current_value < (rule.threshold_clear or rule.threshold_fire):
            return AlertSignal.CLEAR
        # check cooldown for re-notify
        if state.fired_at and (now - state.fired_at).total_seconds() < rule.cooldown_seconds:
            return AlertSignal.HOLD  # don't re-emit
        return AlertSignal.FIRING
    elif state.state in ("clear", "acked"):
        if current_value > rule.threshold_fire:
            # First crossing: stamp candidate fired_at, but don't emit until min_dwell holds
            if state.fired_at is None:
                # candidate — record intent
                return AlertSignal.PENDING_FIRE
            elapsed = (now - state.fired_at).total_seconds()
            if elapsed >= rule.min_dwell_seconds:
                return AlertSignal.FIRING
            return AlertSignal.PENDING_FIRE
        else:
            return AlertSignal.CLEAR
    else:  # insufficient_data — never reached for threshold (no warm-up)
        return AlertSignal.CLEAR
```

### Z-score (anomaly) detector (~50 LOC)

EWMA primitives needed:
- **EWMA mean:** `mean_t = alpha * x_t + (1 - alpha) * mean_{t-1}`. `alpha` typically `2/(N+1)` for window-N equivalence. Seed: `mean_0 = x_0` on first sample.
- **EWMA variance:** `var_t = alpha * (x_t - mean_{t-1})^2 + (1 - alpha) * var_{t-1}`. Seed: `var_0 = 0`. (Use Welford-style to avoid catastrophic cancellation.)
- **Z-score:** `z = (x_t - mean_t) / sqrt(var_t + epsilon)`.
- **Sample count:** Track in `alert_state.sample_count` (column already exists).

State transitions for anomaly:
- `insufficient_data` → `clear` when `sample_count >= min_samples` AND warm-up window (`now - rule.created_at >= 24h`) has elapsed (ALRT-05).
- `clear` → `firing` when `|z| > threshold_fire` for `min_dwell_seconds`.
- `firing` → `clear` when `|z| < threshold_clear`.

**Stdlib primitives (`math`):** `math.sqrt`, `math.fabs`. Nothing else. Carry mean+var+count in `alert_state.params_json` extension OR in a dedicated columns. Per RESEARCH: use `params_json` for anomaly state — no schema change.

### State transition graph

```
                 +----------------------+
   24h warm-up   |  insufficient_data    |  (anomaly only; sample_count < min_samples)
   <-------------|                       |
                 +-----------+-----------+
                             | sample_count >= min_samples AND warm-up elapsed
                             v
                 +----------------------+    metric > threshold_fire AND held min_dwell
                 |        clear         |---------------------------+
                 +----------+-----------+                            |
                            ^                                        v
                            |                            +----------------------+
                            | metric < threshold_clear   |       firing         |
                            +----------------------------|                      |
                                                         +-----+----------------+
                                                               |
                                                               | user clicks ack_alert
                                                               v
                                                         +----------------------+
                                                         |        acked         |  (acked_until = now+1h)
                                                         |                      |  metric still firing
                                                         +-----+----------------+
                                                               |
                                                               | now > acked_until
                                                               v
                                                         (back to firing)
```

**Cooldown_seconds:** Reduces re-notify cadence after first firing — even if metric stays above threshold_fire, a re-notify (re-insert decision row + Telegram) happens at most every `cooldown_seconds`. Existing `decisions` partial-unique handles "only one open at a time" — once auto-resolved, a fresh firing produces a new row, gated by cooldown.

## Common Pitfalls

### Pitfall 1: scope_key vocabulary lock

**What goes wrong:** Plan 01 ships the detector before locking the per-metric scope_key extractors. Two rules that meant to fire on different scopes share the same scope_key and dedup-collide.

**Why it happens:** REQUIREMENTS.md gives one example (`model:claude-opus-4-7` for cost-by-model). Real metrics may need:
- `cost_usd_24h` → scope_key = `model:<model>` OR `project:<cwd>` OR `<global>` — depends on rule intent.
- `skill_p95_latency_ms` → scope_key = `skill:<skill_name>`.
- `dispatcher_failed_tasks_5m` → scope_key = `<global>` or `task_type:<type>`.

**How to avoid:** Plan 01 must define a `_SCOPE_EXTRACTORS: dict[metric, callable(db) -> dict[scope_key, value]]` table. Each metric maps to (a) the SQL that returns scope→value rows AND (b) the scope_key string format. Document every supported metric — start with 2-3, mark the dict as the lock point.

**Warning signs:** Two rules with same `metric` but different intent (per-model vs global) collide on `dedup_key` because their scope_keys aren't distinct.

### Pitfall 2: Dedup key collision across rule edits

**What goes wrong:** User PATCHes a rule's threshold. The `rule_id` is stable, so `dedup_key = alert:{rule_id}:{scope_key}` is stable — but the open decision row's `prompt` field is now stale relative to the new threshold value.

**How to avoid:** On PATCH, **clear `alert_state` rows for that rule** (or at least reset `fired_at`/`sample_count`/EWMA state). The next tick re-evaluates with fresh state and emits a new prompt. Plan 02 (router) must specify this in the PATCH handler.

**Alternative:** Don't mutate state on PATCH; let next tick auto-resolve old decision (because state is preserved, the new threshold may put state into `clear`, triggering auto-resolve via ALRT-07). This is cleaner but requires careful test coverage.

### Pitfall 3: Cooldown vs ack suppression interaction

**What goes wrong:** User acks at T0 (`acked_until = T0 + 1h`). Cooldown is 30 min. Metric stays firing. At T0+30min cooldown expires but ack is still active — does the engine re-notify?

**Resolution rule (recommended for Plan 01):** **Ack takes precedence.** While `acked_until > now`, NO re-notify regardless of cooldown. After `acked_until` expires AND cooldown is satisfied, re-emit. This matches the user's intent ("I saw it; suppress for 1h").

**Test pattern:** assert that ack within cooldown window suppresses for full hour, not until cooldown ends.

### Pitfall 4: 24h warm-up bypass on rule re-enable

**What goes wrong:** User creates an anomaly rule at T0, lets it run 23h, disables it, re-enables at T+25h. Does the warm-up clock restart?

**Resolution rule (recommended):** Warm-up tied to `alert_rules.created_at`, NOT `enabled` toggles. Re-enabling does NOT reset warm-up. **Disabling**, however, should **clear** `alert_state` rows (so re-enable gets a fresh sample_count). Plan 01/02 lock the semantics.

### Pitfall 5: Cleared-but-not-acked re-fire

**What goes wrong:** Metric flaps above/below threshold. Auto-resolve fires (`status='answered'`, `answered_by='alert_engine'`). Next tick metric crosses threshold again. Does a NEW decision row get created?

**Resolution:** Yes — partial-unique is `WHERE status='pending'`, so an answered row does NOT block a new INSERT with the same dedup_key. **`notification_log`**, however, has a non-partial UNIQUE on (`kind`, `entity_id`, `chat_id`) — re-firing would COLLIDE with the old row. **`notifier.py::cleanup_rerun_failures` has the precedent**: delete the stale `notification_log` row when its underlying entity has left the firing state.

**Plan 01 must add an analogous cleanup** in `evaluate_alerts(db)`: when auto-resolving a firing→clear transition, delete the matching `notification_log` row so re-firing produces a fresh notification. Mirror `notifier.py::cleanup_rerun_failures:55-87` verbatim shape.

### Pitfall 6: Telegram message FAILURE retry

**What goes wrong:** `notification_log` row inserted, but `api.send_message` raises (network blip). `notifier.py::_claim_and_send` already handles this: marks status='failed' on the existing row. **For alerts, replicate the same pattern.** The next tick will skip the entity_id (status='failed' is filtered by `_filter_blocked` only when `status='sent'` or active-snooze). Actually re-reading `_filter_blocked`: status='failed' is NOT in the active-block predicate, so the next tick DOES skip the failed row because the row exists with rowcount=1 already. **This is a known gap in the existing notifier** — alert engine inherits it. Out of scope for Phase 15 unless explicitly added.

### Pitfall 7: Dispatcher race — two ticks evaluating same rule

**What goes wrong:** launchd fires two oneshots concurrently (overlap). Both call `evaluate_alerts(db)`. Both compute the same scope→value, both try to INSERT into `decisions` (idempotent — partial-unique handles it) AND `notification_log` (idempotent — UNIQUE handles it). The loser sees rowcount=0 and skips.

**Resolution:** No new code — the SQLite WAL + UNIQUE constraints handle it for free. Add explicit test in `test_alerts_dispatcher.py` exercising `asyncio.gather(evaluate_alerts(...), evaluate_alerts(...))` and asserting exactly ONE decision row + ONE notification_log row.

### Pitfall 8: `callback_verbs.py` extraction

**What goes wrong:** Phase 15 introduces `callback_verbs.py` as the central enum, but `dash_router.py::route()` already uses string literals (`"approve_task"`, `"answer_decision"`, etc.). If extraction is partial (only `ack_alert` added), the convention "central enum" is fictional.

**How to avoid:** Plan 05 (or wherever telegram wiring lives) MUST refactor `dash_router.py` to import every existing verb from `callback_verbs.py`. Phase 17 POLI-03 then writes round-trip tests against the enum. Keep the existing `route()` if/elif structure — only the verb constant lookups change.

### Pitfall 9: alert_state migration on PATCH that changes thresholds

**What goes wrong:** See Pitfall 2. Already covered.

### Pitfall 10: Tick latency budget

**What goes wrong:** Many rules × many scopes × O(SQL per metric) blows the 120s tick budget.

**Resolution:** v1.0 expected scale is <50 rules. Each rule evaluates one SQL (e.g. `SELECT cost_usd_24h FROM ... GROUP BY model`). Budget is comfortable. **Plan 01 should encode a `MAX_RULES = 100` soft cap** — `evaluate_alerts(db)` logs a warning if more rules exist (defensive). No hard cap in v1.

### Pitfall 11: `attrs_skill_name` BARE event_name

**Source:** `routes/skills.py:225-227`

> "event_name is stored BARE post prefix-strip — SQL filters use 'skill_activated', NOT 'claude_code.skill_activated'."

If alert metrics include skill latency / skill error rate, the SQL must filter on bare event names. Reuse the SQL idioms from `skills.py` (see `_USAGE_TOP_SQL`, `_LATENCY_SQL`, `_ERROR_COUNT_SQL`).

## Code Examples

### Existing dispatcher tick orchestration

```python
# Source: backend/cmc/dispatcher/heartbeat.py:51-147
async def run_one_cycle() -> int:
    settings = load_settings()
    engine = create_engine_for_settings(settings)
    sessions = make_sessionmaker(engine)
    try:
        try:
            await stamp_tick(sessions)        # ALRT-04 anchor: insert evaluate_alerts AFTER this
            # === Phase 15 hook lands here ===
            # try:
            #     async with sessions() as db:
            #         await evaluate_alerts(db)
            # except Exception:
            #     log.exception("dispatcher.alerts_failed_ignore")
            # ================================
            row = (await db.execute(select(SystemState)
                .where(SystemState.key == "emergency_stop"))).scalar_one_or_none()
            if row and row.value == "1":
                return 0
            ...
```

### Existing AlertRule model (verify before planning)

```python
# Source: backend/cmc/db/models/alert_rules.py
class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"
    rule_id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    kind: str            # "threshold" | "anomaly"
    metric: str          # e.g. "cost_usd_24h"
    threshold_fire: float | None = None
    threshold_clear: float | None = None
    min_dwell_seconds: int = Field(default=0)
    min_samples: int = Field(default=1)
    cooldown_seconds: int = Field(default=0)
    enabled: bool = Field(default=True)
    spec_version: int = Field(default=1)
    params_json: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

### Existing AlertState model (verify before planning)

```python
# Source: backend/cmc/db/models/alert_state.py
class AlertState(SQLModel, table=True):
    __tablename__ = "alert_state"
    id: int | None = Field(default=None, primary_key=True)
    rule_id: int = Field(foreign_key="alert_rules.rule_id", index=True)
    scope_key: str = Field(index=True)
    state: str = Field(default="clear")  # firing | clear | acked | insufficient_data
    last_value: float | None = None
    last_evaluated_at: datetime = Field(default_factory=datetime.utcnow)
    fired_at: datetime | None = None
    cleared_at: datetime | None = None
    acked_until: datetime | None = None
    sample_count: int = Field(default=0)
    __table_args__ = (
        UniqueConstraint("rule_id", "scope_key", name="uq_alert_state_rule_scope"),
        Index("idx_alert_state_state", "state"),
    )
```

### Test pattern (in-memory dispatcher tick test)

```python
# Source: backend/tests/test_dispatcher.py:79-138 (_bootstrap_db helper + stamp_tick test)

async def _bootstrap_db(test_settings):
    """Helper: alembic-upgrade a freshly-created engine and return (engine, sessions)."""
    from alembic import command
    from alembic.config import Config
    from cmc.db import create_engine_for_settings, make_sessionmaker

    engine = create_engine_for_settings(test_settings)
    cfg = Config(str(test_settings.alembic_ini_path))
    cfg.set_main_option(
        "script_location", str(test_settings.alembic_ini_path.parent / "migrations")
    )
    async with engine.begin() as conn:
        def _upgrade(sync_conn):
            cfg.attributes["connection"] = sync_conn
            command.upgrade(cfg, "head")
        await conn.run_sync(_upgrade)
    sessions = make_sessionmaker(engine)
    return engine, sessions

# Phase 15 test pattern:
@pytest.mark.asyncio
async def test_alrt04_evaluate_alerts_fires_once(test_settings):
    engine, sessions = await _bootstrap_db(test_settings)
    try:
        # 1. Seed an always-firing rule
        async with sessions() as db:
            db.add(AlertRule(
                name="always-fire", kind="threshold",
                metric="dispatcher_failed_tasks_5m",
                threshold_fire=0.0, threshold_clear=-1.0,
                min_dwell_seconds=0, cooldown_seconds=0,
                enabled=True, params_json={},
            ))
            await db.commit()

        # 2. Seed a fake metric value (insert into otel_events / token_usage / etc.
        #    depending on which metric — Plan 01 locks the seeding helpers).
        # ...

        # 3. Run two evaluate_alerts() concurrently (Pitfall 7)
        async with sessions() as db1, sessions() as db2:
            await asyncio.gather(
                evaluate_alerts(db1),
                evaluate_alerts(db2),
            )

        # 4. Assert exactly one decision row + one notification_log row
        async with sessions() as db:
            decisions = (await db.execute(select(Decision))).scalars().all()
            notifs = (await db.execute(select(NotificationLog))).scalars().all()
        assert len(decisions) == 1
        assert decisions[0].dedup_key.startswith("alert:")
        assert len(notifs) == 1
        assert notifs[0].kind == "alert"
    finally:
        await engine.dispose()
```

### Frontend route + composer skeleton

```typescript
// Source: frontend/src/routes/alerts.tsx (NEW), patterned on routes/skills.tsx
import { createFileRoute } from '@tanstack/react-router'
import { AlertRulesList, AlertRuleForm } from '../components/panels'

function AlertsPage() {
  return (
    <section className="cmc-page" aria-labelledby="alerts-heading">
      <header className="cmc-page__header">
        <span className="cmc-label" style={{ color: 'var(--cmc-text-subtle)' }}>
          Mission Control
        </span>
        <h1 id="alerts-heading" className="cmc-page__heading cmc-page__heading--gradient">
          Alerts
        </h1>
        <p className="cmc-page__subheading">
          Hysteresis-aware alert rules and firing history.
        </p>
      </header>
      <div className="cmc-card-grid">
        <AlertRulesList />
        <AlertRuleForm />
        {/* AlertEventsList — Plan 04 may bundle into AlertRulesList or split */}
      </div>
    </section>
  )
}

export const Route = createFileRoute('/alerts')({ component: AlertsPage })
```

```typescript
// Source: lib/queries.ts additions (NEW), patterned on Phase 14 SkillRange
export const qk = {
  ...existing,
  alertRules: () => ['alert-rules'] as const,
  alertEvents: (range: AlertRange) => ['alert-events', range] as const,
}

export const useAlertRules = () =>
  useQuery<AlertRuleListResponse>({
    queryKey: qk.alertRules(),
    queryFn: api.alertRules,
    refetchInterval: 30_000,    // Phase 15 locked cadence
    staleTime: 20_000,
  })

export const useAlertEvents = (range: AlertRange) =>
  useQuery<AlertEventsResponse>({
    queryKey: qk.alertEvents(range),
    queryFn: () => api.alertEvents(range),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

export function useCreateAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AlertRuleCreate) => api.alertRuleCreate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
    // NOT optimistic — server may 422 on validation
  })
}

export function usePatchAlertRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AlertRulePatch }) =>
      api.alertRulePatch(id, body),
    // Optimistic ONLY for `enabled` toggle (idempotent transition); pattern mirrors
    // usePatchSchedule in queries.ts:594-623.
    onMutate: async ({ id, body }) => { ... },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  })
}
```

### AlertRuleForm — discriminated-union sketch

```typescript
// Source: frontend/src/components/panels/AlertRuleForm.tsx (NEW)
type AlertKind = 'threshold' | 'anomaly'

interface AlertRuleFormState {
  name: string
  kind: AlertKind
  metric: string
  threshold_fire: number | ''
  threshold_clear: number | ''
  min_dwell_seconds: number
  min_samples: number    // anomaly only
  cooldown_seconds: number
  enabled: boolean
  params_json: Record<string, unknown>  // overflow
}

// Validation rules:
//   - kind='threshold' requires threshold_fire (threshold_clear optional, defaults to threshold_fire)
//   - kind='anomaly' requires min_samples >= 1
//   - All numeric fields >= 0
//   - threshold_clear < threshold_fire (hysteresis floor below ceiling) when both set
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline string callback verbs scattered in dash_router.py | Centralized `callback_verbs.py` StrEnum (NEW Phase 15) | This phase | Single source of truth; Phase 17 POLI-03 round-trip tests |
| MarkdownV2 Telegram messages | Plain-text only | Phase 9-01 | inspect.signature() grep guard already in place |
| Stored Decimal as float | Decimal-as-JSON-string (Pydantic v2 default) | Phase 13 | jsonable_encoder forbidden; alerts inherit |
| Alert tables theoretical | Final shape landed in 0002_v1_1_alerts_and_skills | Phase 13 Plan 02 | **Phase 15 ships ZERO migration** |

**Deprecated/outdated:**
- None for this phase. Project conventions are stable as of Phase 14.

## Open Questions (RESOLVED)

1. **scope_key vocabulary lock** (LOAD-BEARING for Plan 01)
   - What we know: REQUIREMENTS.md gives one example (`model:claude-opus-4-7`).
   - What's unclear: Full set of supported metrics + per-metric scope_key extractors. ROADMAP success criteria don't enumerate.
   - Recommendation: Plan 01 must define `_SCOPE_EXTRACTORS: dict[metric_name, ScopeExtractor]` for v1.0 metrics: at minimum `cost_usd_24h` (scope=`model:<model>`), `skill_p95_latency_ms` (scope=`skill:<name>`), `dispatcher_failed_tasks_5m` (scope=`<global>`). Document in plan as a lock.
   - **RESOLVED:** 3 v1.0 metrics locked — cost_usd_24h (model:), skill_p95_latency_ms (skill:), dispatcher_failed_tasks_5m (<global>) → 15-01 D-01.

2. **Where exactly in heartbeat.py the alert hook lands** (Plan 01 lock)
   - What we know: ALRT-04 says "after `stamp_tick`".
   - What's unclear: Before or after the emergency-stop early return? Before or after sweep_stale_pids?
   - Recommendation: Place AFTER stamp_tick, AFTER e-stop early return (so e-stop disables alerts too — defensible). Wrap in try/except. Plan 01 locks placement; tests cover all three positions are equivalent for non-e-stop case.
   - **RESOLVED:** Hook lands AFTER stamp_tick AND AFTER e-stop early return — e-stop disables alerts too → 15-02 D-01.

3. **`ack_alert` callback_data encoding under 64-byte cap**
   - What we know: Telegram callback_data ≤64 bytes; current verbs use compact `verb:arg:arg`.
   - What's unclear: `dedup_key = alert:{rule_id}:{scope_key}` can be ≥30 chars when scope_key is `model:claude-opus-4-7-20251215`. `ack_alert:{dedup_key}` could exceed 64 bytes.
   - Recommendation: Encode as `ack_alert:{rule_id}:{scope_key_hash8}` where scope_key_hash8 is first 8 chars of `sha256(scope_key)`. Resolve back to full key on the backend via state lookup (mirrors `snooze:` RESOLVE_THEN_PATCH idiom in dash_router.py:67-74). Plan 02/05 lock encoding.
   - **RESOLVED:** `ack_alert:{rule_id}:{sha256(scope_key)[:8]}` encoding + Python-side resolver (no SQLite SHA256 dependency) → 15-03 D-01.

4. **AlertRulesList vs separate AlertEventsList panel**
   - What we know: ALRT-09 splits `/api/alerts/rules` from `/api/alerts/events`; ALRT-10 mentions "AlertRulesList + AlertRuleForm".
   - What's unclear: Whether events history is on the same page or only on individual rule drill-in.
   - Recommendation: Plan 04 includes a third panel `AlertEventsList` (history with `?range=` toggle) per ALRT-09 surfacing. Layout: rules list + form side-by-side, events list full-width below.
   - **RESOLVED:** Separate AlertEventsList panel, full-width below rules + form → 15-05 D-01.

5. **Initial seeded rules for v1.0**
   - What we know: REQUIREMENTS.md lists 2 example metrics.
   - What's unclear: Does Phase 15 ship any default rules, or does the user create from scratch?
   - Recommendation: Ship NO default rules (empty state — "Create your first alert"). Phase 17 polish may add seed examples.
   - **RESOLVED:** NONE — empty state on first /alerts render; no Alembic seeds → 15-02 D-05.

6. **Range Literal for events endpoint**
   - What we know: `?range=` is the param.
   - What's unclear: Reuses `Literal["1d","7d","14d","30d"]` or narrower?
   - Recommendation: Reuse `Literal["1d","7d","14d","30d"]` verbatim from cost.py — alerts are likely to be queried at all four ranges depending on user context.
   - **RESOLVED:** Reuse `Literal["1d","7d","14d","30d"]` aliased as AlertRange in schemas/alerts.py → 15-02 D-04.

## Sources

### Primary (HIGH confidence)
- **codebase: backend/cmc/db/models/alert_rules.py** — final ALRT-01 shape (verified)
- **codebase: backend/cmc/db/models/alert_state.py** — final ALRT-02 shape (verified)
- **codebase: backend/migrations/versions/0002_v1_1_alerts_and_skills.py** — schema lands here, Phase 15 ships no migration (verified)
- **codebase: backend/cmc/dispatcher/heartbeat.py** — `run_one_cycle` orchestration (verified)
- **codebase: backend/cmc/dispatcher/state.py** — `stamp_tick` UPSERT pattern (verified)
- **codebase: backend/cmc/db/models/notification_log.py** — UNIQUE(kind, entity_id, chat_id) for dedup reuse (verified)
- **codebase: backend/cmc/db/models/decisions.py** — partial-unique on dedup_key WHERE status='pending' (verified)
- **codebase: backend/cmc/api/routes/hitl.py** — INSERT ON CONFLICT DO NOTHING for decisions (verified)
- **codebase: backend/cmc/telegram/notifier.py:226-294** — `_claim_and_send` dedup pattern (verbatim copy target)
- **codebase: backend/cmc/telegram/dash_router.py** — verb routing skeleton (extension target)
- **codebase: backend/cmc/telegram/handler.py** — callback dispatch flow (extension target)
- **codebase: backend/cmc/telegram/messages.py** — plain-text formatter pattern with `_kb()` helper
- **codebase: backend/cmc/api/routes/cost.py** — Range Literal precedent (`Literal["1d","7d","14d","30d"]`)
- **codebase: backend/cmc/api/routes/skills.py** — Phase 14 dual-attribution pattern; range/limit query params
- **codebase: backend/cmc/api/routes/schedules.py** — full CRUD precedent (GET/POST/PATCH/DELETE + parse-nl)
- **codebase: backend/cmc/api/routes/__init__.py** — router registration pattern
- **codebase: backend/cmc/api/schemas/cost.py / skills.py / common.py** — Pydantic v2 conventions, ORMBase, Literal ranges
- **codebase: backend/cmc/dispatcher/templates/com.cmc.dispatcher.plist.j2:28-29** — `<key>StartInterval</key><integer>120</integer>` confirms 120s tick
- **codebase: backend/tests/test_dispatcher.py** — `_bootstrap_db` helper + tick test pattern
- **codebase: backend/tests/test_telegram_units.py:15-20** — Phase 9-01 inspect.signature() grep guard
- **codebase: frontend/src/lib/api.ts:13-16, 388-486, 866-900, 1080-1090** — SkillRange + 7 interfaces + 4 fetchers + standalone aliases (Phase 14 verbatim template)
- **codebase: frontend/src/lib/queries.ts:54-96, 222-262** — qk kebab-prefix + 30s cadence bucket + Phase 14 hooks (verbatim template)
- **codebase: frontend/src/routes/skills.tsx** — page layout precedent
- **codebase: frontend/src/components/panels/SkillsRegistry.tsx** — DataTable + PanelCard + per-row mutation pattern
- **planning: .planning/REQUIREMENTS.md** — ALRT-01..12 locked; ALRT-13/14 deferred
- **planning: .planning/ROADMAP.md** — Phase 15 success criteria SC#1..5
- **planning: .planning/STATE.md** — accumulated context (line 53: alert engine in 120s tick, decisions only, dedup_key format)

### Secondary (MEDIUM confidence)
- N/A — this phase is fully internal-codebase research; no external library decisions.

### Tertiary (LOW confidence)
- N/A.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive already exists in codebase; ALRT-03 mandates stdlib `math` only.
- Architecture: HIGH — patterns to copy verbatim are explicit and well-tested (`notifier._claim_and_send`, `hitl.create_decision`, Phase 14 lib plumbing).
- Pitfalls: HIGH — codebase has analogous patterns (`cleanup_rerun_failures`, `_filter_blocked`, partial-unique conflict refetch) that surface every interaction risk.
- Scope_key vocabulary: MEDIUM — only 1 example given by REQUIREMENTS; planner must lock 2-4 metrics.
- Telegram callback_data encoding for ack_alert: MEDIUM — 64-byte cap is real; recommended hash8 mitigation needs Plan 02/05 confirmation.

**Research date:** 2026-05-04
**Valid until:** 2026-06-03 (30 days; codebase patterns stable)

## RESEARCH COMPLETE

All 14 focus areas surfaced with concrete file:line citations. No external research needed (no new libraries; stdlib `math` is locked). Two MEDIUM-confidence open questions (scope_key vocabulary, ack_alert encoding) are flagged for Plan 01/02/05 lock-in but do not block planning.
