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
    evaluate_anomaly,
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
    # SQLModel inherits Pydantic v2 strict-attribute behavior, so we bypass
    # via object.__setattr__ for pure-function tests only.
    object.__setattr__(s, "params_json", params_json if params_json is not None else {})
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


# ============================================================================
# Task 2: evaluate_anomaly — EWMA z-score + 24h warm-up + min_samples gates
# ============================================================================


def _ago(now: datetime, *, seconds: int = 0, hours: int = 0) -> datetime:
    """Helper: return now minus the offset."""
    return now - timedelta(seconds=seconds, hours=hours)


def test_anomaly_first_sample_returns_insufficient():
    """sample_count=0 → INSUFFICIENT + sample_count_new=1, mean=value, var=0.0.

    Even if current_value is wildly out of any plausible range, the FIRST
    sample seeds the EWMA — there is no prior baseline to compare against.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=1,
        # rule old enough for warm-up gate to be satisfied
        created_at=_ago(now, hours=48),
    )
    state = _make_state(state="clear", sample_count=0, params_json={})
    sig, ewma = evaluate_anomaly(rule, 999.0, state, now=now)
    assert sig == AlertSignal.INSUFFICIENT
    assert ewma["ewma_mean"] == 999.0
    assert ewma["ewma_var"] == 0.0
    assert ewma["sample_count"] == 1


def test_anomaly_warmup_gate_suppresses():
    """Rule created 1h ago, sample_count=10 >= min_samples=5, value 100-sigma
    off → INSUFFICIENT (warm-up not satisfied even with huge z)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=5,
        created_at=_ago(now, hours=1),  # < 24h ago
    )
    state = _make_state(
        state="clear",
        sample_count=10,
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig, _ = evaluate_anomaly(rule, 999.0, state, now=now)
    assert sig == AlertSignal.INSUFFICIENT


def test_anomaly_min_samples_gate_suppresses():
    """Rule 25h old (warm-up satisfied), sample_count=2 < min_samples=10, huge
    z → INSUFFICIENT (min_samples not met)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        created_at=_ago(now, hours=25),
    )
    state = _make_state(
        state="clear",
        sample_count=2,
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig, _ = evaluate_anomaly(rule, 999.0, state, now=now)
    assert sig == AlertSignal.INSUFFICIENT


def test_anomaly_fires_after_warmup_and_min_samples():
    """Rule 25h old, prior mean=50 var=4 sample_count=20, value=80 → |z| > 3
    on first crossing → PENDING_FIRE (fired_at None)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        min_dwell_seconds=30,
        created_at=_ago(now, hours=25),
    )
    state = _make_state(
        state="clear",
        sample_count=20,
        fired_at=None,
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig, ewma = evaluate_anomaly(rule, 80.0, state, now=now)
    assert sig == AlertSignal.PENDING_FIRE
    assert ewma["sample_count"] == 21


def test_anomaly_pending_to_firing_after_dwell():
    """Same as fires_after_warmup but fired_at = now - min_dwell - 10 →
    FIRING (dwell satisfied)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        min_dwell_seconds=30,
        created_at=_ago(now, hours=25),
    )
    state = _make_state(
        state="clear",
        sample_count=20,
        fired_at=_ago(now, seconds=40),
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig, _ = evaluate_anomaly(rule, 80.0, state, now=now)
    assert sig == AlertSignal.FIRING


def test_anomaly_clears_below_threshold_clear():
    """state='firing', threshold_clear=1.0, current_value at +0.5 sigma from
    mean → CLEAR (|z| < 1.0 floor)."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        threshold_clear=1.0,
        min_samples=10,
        created_at=_ago(now, hours=48),
    )
    # mean=50, var=4 (stddev=2). +0.5 sigma -> value=51.0 -> |z| ~= 0.5 < 1.0 floor.
    state = _make_state(
        state="firing",
        sample_count=20,
        fired_at=_ago(now, seconds=600),
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig, _ = evaluate_anomaly(rule, 51.0, state, now=now)
    assert sig == AlertSignal.CLEAR


def test_anomaly_returns_updated_ewma_dict():
    """Returned dict has 3 keys (ewma_mean, ewma_var, sample_count) with
    float types and reasonable post-update ranges."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        params_json={"window_n": 50},
        created_at=_ago(now, hours=48),
    )
    prior_mean = 50.0
    state = _make_state(
        state="clear",
        sample_count=20,
        params_json={"ewma_mean": prior_mean, "ewma_var": 4.0},
    )
    _, ewma = evaluate_anomaly(rule, 51.0, state, now=now)
    assert set(ewma.keys()) == {"ewma_mean", "ewma_var", "sample_count"}
    assert isinstance(ewma["ewma_mean"], float)
    assert isinstance(ewma["ewma_var"], float)
    # alpha = 2/51 ≈ 0.0392 → new_mean ≈ 0.0392*51 + 0.9608*50 ≈ 50.0392
    assert 50.0 <= ewma["ewma_mean"] <= 50.05
    assert ewma["ewma_var"] >= 0.0  # variance never negative
    assert ewma["sample_count"] == 21


def test_anomaly_ewma_recurrence_no_drift():
    """Feed 10 oscillating samples [99,100,99,100,...] starting from
    mean=99.5, var=0.25, sample_count=10. Mean must stay in [99,100],
    var bounded — verifies recurrence math is numerically stable."""
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        params_json={"window_n": 50},
        created_at=_ago(now, hours=48),
    )
    mean = 99.5
    var = 0.25
    sc = 10
    samples = [99.0, 100.0, 99.0, 100.0, 99.0, 100.0, 99.0, 100.0, 99.0, 100.0]
    for x in samples:
        state = _make_state(
            state="clear",
            sample_count=sc,
            params_json={"ewma_mean": mean, "ewma_var": var},
        )
        _, ewma = evaluate_anomaly(rule, x, state, now=now)
        mean = ewma["ewma_mean"]
        var = ewma["ewma_var"]
        sc = int(ewma["sample_count"])
    # Recurrence stability: mean stays in window, variance bounded.
    assert 99.0 <= mean <= 100.0
    assert 0.0 <= var <= 1.0
    assert sc == 20


def test_anomaly_no_numpy_or_scipy_imported():
    """Static-source assertion: no numpy/scipy/pandas/statistics imports in
    detector.py. Guards the stdlib-math-only invariant for ALRT-03."""
    import re
    from pathlib import Path

    src = Path(
        "cmc/alerts/detector.py"
    ).read_text()  # tests run from `backend/` cwd
    forbidden = re.search(
        r"^(import|from)\s+(numpy|scipy|pandas|statistics)\b",
        src,
        flags=re.MULTILINE,
    )
    assert forbidden is None, (
        f"detector.py must use stdlib math only; found: {forbidden.group(0)}"
    )


# ============================================================================
# ALRT-13 (Phase 21): sliding-window anomaly — params_json.window_kind
# discriminator dispatched INSIDE evaluate_anomaly (NOT a parallel detector).
# ============================================================================


def test_anomaly_sliding_seed_returns_insufficient():
    """First sample with window_kind='sliding' → INSUFFICIENT + ewma_mean = value,
    ewma_var = 0.0, sample_count = 1.0. The seed branch is shared between EWMA
    and sliding: there is no prior baseline to compare against either way.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        params_json={"window_kind": "sliding", "window_n": 10},
        created_at=_ago(now, hours=48),  # warmup gate satisfied
    )
    state = _make_state(state="clear", sample_count=0, params_json={})
    sig, ewma = evaluate_anomaly(rule, 42.0, state, now=now)
    assert sig == AlertSignal.INSUFFICIENT
    assert ewma["ewma_mean"] == 42.0
    assert ewma["ewma_var"] == 0.0
    assert ewma["sample_count"] == 1.0


def test_anomaly_sliding_recurrence_uses_uniform_alpha():
    """Sliding alpha = 1/N (uniform-weight rolling-mean ± stddev). Compare against
    EWMA alpha = 2/(N+1) on identical inputs to PROVE the discriminator dispatches:
    same prior state + same current_value → different new_mean per branch.

    With N=10, prior_mean=10.0, prior_var=0.0, current_value=12.0:
      sliding (alpha=1/10):   new_mean = 0.1*12 + 0.9*10 = 10.2
                              new_var  = 0.1*(2.0)^2 + 0.9*0 = 0.4
      ewma    (alpha=2/11):   new_mean ≈ 0.1818*12 + 0.8182*10 ≈ 10.3636
                              new_var  ≈ 0.1818*(2.0)^2 + 0.8182*0 ≈ 0.7273
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    common_kwargs = dict(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=10,
        created_at=_ago(now, hours=48),
    )
    sliding_rule = _make_rule(
        **common_kwargs,
        params_json={"window_kind": "sliding", "window_n": 10},
    )
    ewma_rule = _make_rule(
        **common_kwargs,
        params_json={"window_kind": "ewma", "window_n": 10},
    )
    prior_state = _make_state(
        state="clear",
        sample_count=20,
        params_json={"ewma_mean": 10.0, "ewma_var": 0.0},
    )

    _, sliding = evaluate_anomaly(sliding_rule, 12.0, prior_state, now=now)
    _, ewma = evaluate_anomaly(ewma_rule, 12.0, prior_state, now=now)

    # Sliding: alpha = 1/10 = 0.1
    assert abs(sliding["ewma_mean"] - 10.2) < 1e-9
    assert abs(sliding["ewma_var"] - 0.4) < 1e-9
    # EWMA: alpha = 2/11 ≈ 0.18181818
    assert abs(ewma["ewma_mean"] - (2.0 / 11.0 * 12.0 + 9.0 / 11.0 * 10.0)) < 1e-9
    # Discriminator load-bearing: identical input must produce different output.
    assert sliding["ewma_mean"] != ewma["ewma_mean"]
    assert sliding["ewma_var"] != ewma["ewma_var"]


def test_anomaly_sliding_warmup_boundary_returns_insufficient():
    """Sliding-window warmup-boundary guard (Phase 21 success criterion 2):
    the existing detector warmup gate at detector.py:239-240
    (`new_sc < rule.min_samples`) prevents spurious fires during the first
    window's worth of ticks. Validator-coupled `min_samples >= window_n`
    pins this on the API side.

    To exercise "feed window_n ticks; all return INSUFFICIENT" literally, this
    test uses `min_samples=window_n+1` (=11 here), which satisfies the validator's
    `min_samples >= window_n` constraint AND ensures the gate trips for every
    tick whose new_sc <= window_n. Tick window_n+1 produces new_sc=window_n+1
    which clears the gate.

    NOTE: this is a documented off-by-one tightening of the plan's literal
    `min_samples=window_n=10` — with min_samples=window_n the boundary tick
    (sc=10) clears the gate (10<10 is False). The success criterion's intent
    ("no fire during the entire window") is what's exercised here.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    window_n = 10
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        min_samples=window_n + 1,  # off-by-one tightening (see docstring)
        params_json={"window_kind": "sliding", "window_n": window_n},
        created_at=_ago(now, hours=48),  # 24h warmup gate satisfied
    )

    # Iterate through the first window_n ticks. State carries forward.
    mean = 0.0
    var = 0.0
    sc = 0
    for tick_i in range(1, window_n + 1):  # ticks 1..window_n
        state = _make_state(
            state="clear",
            sample_count=sc,
            params_json={"ewma_mean": mean, "ewma_var": var},
        )
        sig, ewma = evaluate_anomaly(rule, 100.0, state, now=now)
        assert sig == AlertSignal.INSUFFICIENT, (
            f"tick {tick_i} expected INSUFFICIENT (sc_new={ewma['sample_count']} "
            f"vs min_samples={window_n + 1}); got {sig}"
        )
        mean = ewma["ewma_mean"]
        var = ewma["ewma_var"]
        sc = int(ewma["sample_count"])

    # Tick window_n + 1: new_sc = window_n + 1 == min_samples → gate clears.
    state = _make_state(
        state="clear",
        sample_count=sc,
        params_json={"ewma_mean": mean, "ewma_var": var},
    )
    sig, _ = evaluate_anomaly(rule, 100.0, state, now=now)
    # Stable signal (CLEAR or otherwise non-INSUFFICIENT — flat input → |z|≈0,
    # so CLEAR is expected when the gate clears).
    assert sig != AlertSignal.INSUFFICIENT


def test_anomaly_sliding_hysteresis_on_z_score_reuses_state_machine():
    """Sliding rules dispatch through the SAME hysteresis state machine at
    detector.py:254-274 — no second hysteresis branch. Verify CLEAR-from-firing
    on |z| < threshold_clear AND PENDING_FIRE on |z| > threshold_fire when
    fired_at is None. Confirms the state machine is shared between EWMA and
    sliding.

    Note on threshold magnitudes: with sliding alpha=1/N, a single value far
    from the prior mean inflates the variance proportionally to the squared
    diff (`new_var = (1/N)*diff² + (1-1/N)*prior_var`), so single-tick
    |z|-magnitude is asymptotically bounded near √(N-1). For N=10 that's
    ≈ 3.0; we deliberately pick `threshold_fire=2.5` so a strong outlier
    produces |z| > fire on a single tick without requiring multi-tick warmup
    of the sliding variance estimator. Threshold_fire here is the z-score
    fire boundary, NOT a raw-value boundary.
    """
    now = datetime(2026, 5, 4, 12, 0, 0)
    rule = _make_rule(
        kind="anomaly",
        threshold_fire=2.5,
        threshold_clear=1.0,
        min_samples=10,
        cooldown_seconds=300,
        params_json={"window_kind": "sliding", "window_n": 10},
        created_at=_ago(now, hours=48),
    )

    # (a) firing → clear: |z| < threshold_clear=1.0 → CLEAR.
    # mean=50, var=4 (stddev=2). value=51 → |z|≈0.5 < 1.0 floor.
    firing_state = _make_state(
        state="firing",
        sample_count=20,
        fired_at=_ago(now, seconds=600),
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig_clear, _ = evaluate_anomaly(rule, 51.0, firing_state, now=now)
    assert sig_clear == AlertSignal.CLEAR

    # (b) clear → pending_fire on |z| > threshold_fire=2.5 when fired_at is None.
    # mean=50, var=4, value=80 → recurrence:
    #   diff = 80 - 50 = 30
    #   new_mean = 0.1*80 + 0.9*50 = 53
    #   new_var  = 0.1*(30)² + 0.9*4 = 93.6
    #   |z|     = |80 - 53| / √93.6 ≈ 27/9.674 ≈ 2.79  →  > 2.5 fire
    clear_state = _make_state(
        state="clear",
        sample_count=20,
        fired_at=None,
        params_json={"ewma_mean": 50.0, "ewma_var": 4.0},
    )
    sig_pending, _ = evaluate_anomaly(rule, 80.0, clear_state, now=now)
    assert sig_pending == AlertSignal.PENDING_FIRE


def test_anomaly_unknown_window_kind_defaults_to_ewma():
    """`_resolve_alpha` defensive default: unknown / missing window_kind →
    alpha = 2/(N+1) (EWMA, v1.0 behavior). Defense in depth: the API-side
    validator rejects unknown values up front, so this defensive branch only
    fires for rules persisted before Phase 21 without a migration.
    """
    from cmc.alerts.detector import _resolve_alpha

    # Unknown value → ewma alpha
    rule_garbage = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        params_json={"window_kind": "garbage"},
    )
    assert _resolve_alpha(rule_garbage, 50) == 2.0 / (50 + 1.0)

    # Missing key → ewma alpha (preserves v1.0 default for legacy rules)
    rule_missing = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        params_json={"window_n": 50},
    )
    assert _resolve_alpha(rule_missing, 50) == 2.0 / (50 + 1.0)

    # Empty params_json → ewma alpha
    rule_empty = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        params_json={},
    )
    assert _resolve_alpha(rule_empty, 100) == 2.0 / (100 + 1.0)

    # Sliding sanity check (positive control)
    rule_sliding = _make_rule(
        kind="anomaly",
        threshold_fire=3.0,
        params_json={"window_kind": "sliding"},
    )
    assert _resolve_alpha(rule_sliding, 50) == 1.0 / 50.0
