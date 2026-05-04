"""Phase 15 Plan 01 — pure-math detector tests.

ALRT-03 + ALRT-05 surface tests. Threshold hysteresis (Task 1) + EWMA z-score
+ warm-up gates (Task 2) + scope_key vocabulary lock (Task 3).

NO database fixtures here for the detector tests — evaluate_threshold and
evaluate_anomaly are pure functions over (rule, value, state, *, now). The
scope-extractor tests use the standard `client` fixture (Phase 13 P06) since
those exercise SQL.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from cmc.alerts.detector import (
    AlertSignal,
    evaluate_threshold,
)

from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState

# ---- Test factories — keyword-only so each test overrides only what it needs

def _make_rule(
    *,
    rule_id: int = 1,
    name: str = "test-rule",
    kind: str = "threshold",
    metric: str = "cost_usd_24h",
    threshold_fire: float | None = 10.0,
    threshold_clear: float | None = None,
    min_dwell_seconds: int = 0,
    min_samples: int = 1,
    cooldown_seconds: int = 0,
    enabled: bool = True,
    spec_version: int = 1,
    params_json: dict | None = None,
    created_at: datetime | None = None,
) -> AlertRule:
    """Build an in-memory AlertRule. NOT db.add'ed — pure-function tests only."""
    if created_at is None:
        # Default: rule is "old enough" so anomaly warm-up is satisfied.
        created_at = datetime(2026, 1, 1, 0, 0, 0)
    return AlertRule(
        rule_id=rule_id,
        name=name,
        kind=kind,
        metric=metric,
        threshold_fire=threshold_fire,
        threshold_clear=threshold_clear,
        min_dwell_seconds=min_dwell_seconds,
        min_samples=min_samples,
        cooldown_seconds=cooldown_seconds,
        enabled=enabled,
        spec_version=spec_version,
        params_json=params_json or {},
        created_at=created_at,
        updated_at=created_at,
    )


def _make_state(
    *,
    rule_id: int = 1,
    scope_key: str = "<global>",
    state: str = "clear",
    last_value: float | None = None,
    last_evaluated_at: datetime | None = None,
    fired_at: datetime | None = None,
    cleared_at: datetime | None = None,
    acked_until: datetime | None = None,
    sample_count: int = 0,
    params_json: dict | None = None,
) -> AlertState:
    """Build an in-memory AlertState. NOT db.add'ed.

    Note: AlertState model doesn't carry params_json (that lives on AlertRule
    in the schema). For the detector's anomaly state read/write, we attach a
    `params_json` attribute dynamically here so the helper can read EWMA
    state from `state.params_json` per Plan 01 D-03. The real persistence
    (Plan 02) writes back into `state.params_json` via a JSON column on
    AlertState — but Plan 01 keeps the schema untouched per `<execution_context>`,
    so we simulate the column by attaching the dict to the in-memory object.
    """
    if last_evaluated_at is None:
        last_evaluated_at = datetime(2026, 1, 1, 0, 0, 0)
    s = AlertState(
        rule_id=rule_id,
        scope_key=scope_key,
        state=state,
        last_value=last_value,
        last_evaluated_at=last_evaluated_at,
        fired_at=fired_at,
        cleared_at=cleared_at,
        acked_until=acked_until,
        sample_count=sample_count,
    )
    # Attach params_json dynamically — Plan 01 doesn't migrate the schema; the
    # caller (Plan 02 dispatcher) is responsible for persisting EWMA state.
    # For pure-function tests we just attach it as an attribute.
    s.params_json = params_json if params_json is not None else {}
    return s


# ============================================================================
# Task 1: evaluate_threshold — hysteresis + dwell + cooldown
# ============================================================================


def test_threshold_clear_to_pending_fire():
    """state='clear', fired_at=None, value > threshold_fire → PENDING_FIRE.

    Detector is stateless WRT fired_at stamping — the caller (Plan 02) stamps
    fired_at on the FIRST PENDING_FIRE return.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0, min_dwell_seconds=30)
    state = _make_state(state="clear", fired_at=None)
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.PENDING_FIRE


def test_threshold_pending_fire_to_firing_after_dwell():
    """state='clear', fired_at=now-60s, min_dwell=30s, value > fire → FIRING."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    fired = now - timedelta(seconds=60)
    rule = _make_rule(threshold_fire=10.0, min_dwell_seconds=30)
    state = _make_state(state="clear", fired_at=fired)
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.FIRING


def test_threshold_pending_fire_holds_under_dwell():
    """state='clear', fired_at=now-10s, min_dwell=30s, value > fire → PENDING_FIRE."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    fired = now - timedelta(seconds=10)
    rule = _make_rule(threshold_fire=10.0, min_dwell_seconds=30)
    state = _make_state(state="clear", fired_at=fired)
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.PENDING_FIRE


def test_threshold_clear_stays_clear_below_fire():
    """state='clear', value < threshold_fire → CLEAR."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0)
    state = _make_state(state="clear", fired_at=None)
    assert evaluate_threshold(rule, 5.0, state, now=now) == AlertSignal.CLEAR


def test_threshold_firing_to_clear_below_clear_floor():
    """state='firing', threshold_clear=5.0, value=4.0 → CLEAR (hysteresis floor)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0, threshold_clear=5.0)
    state = _make_state(state="firing", fired_at=now - timedelta(seconds=120))
    assert evaluate_threshold(rule, 4.0, state, now=now) == AlertSignal.CLEAR


def test_threshold_firing_holds_within_cooldown():
    """state='firing', cooldown=600s, fired_at=now-300s, value > fire → HOLD."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0, cooldown_seconds=600)
    state = _make_state(state="firing", fired_at=now - timedelta(seconds=300))
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.HOLD


def test_threshold_firing_re_emits_after_cooldown():
    """state='firing', cooldown=600s, fired_at=now-700s, value > fire → FIRING."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0, cooldown_seconds=600)
    state = _make_state(state="firing", fired_at=now - timedelta(seconds=700))
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.FIRING


def test_threshold_clear_floor_defaults_to_fire_when_null():
    """rule.threshold_clear=None → uses threshold_fire as floor (no asymmetric hyst)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0, threshold_clear=None, cooldown_seconds=0)
    # value just under threshold_fire → CLEAR (floor == fire)
    state = _make_state(state="firing", fired_at=now - timedelta(seconds=120))
    assert evaluate_threshold(rule, 9.999, state, now=now) == AlertSignal.CLEAR
    # value at threshold_fire → does NOT clear (clear requires value < floor); cooldown=0
    # so re-emits FIRING.
    assert evaluate_threshold(rule, 10.0, state, now=now) == AlertSignal.FIRING


def test_threshold_insufficient_data_returns_clear():
    """state='insufficient_data' (synthetic for threshold) → CLEAR.

    Threshold rules never set this state in production; defensive return.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=10.0)
    state = _make_state(state="insufficient_data", fired_at=None)
    assert evaluate_threshold(rule, 12.0, state, now=now) == AlertSignal.CLEAR


def test_threshold_no_float_drift():
    """0.1 + 0.2 != 0.3 in float — but our comparator must remain deterministic.

    threshold_fire=0.3, value=0.1+0.2 (= 0.30000000000000004 in float). value > 0.3
    is TRUE. PENDING_FIRE on first crossing (fired_at None).
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(threshold_fire=0.3, min_dwell_seconds=0)
    state = _make_state(state="clear", fired_at=None)
    val = 0.1 + 0.2  # 0.30000000000000004
    assert val > 0.3  # sanity — float quirk holds
    assert evaluate_threshold(rule, val, state, now=now) == AlertSignal.PENDING_FIRE
