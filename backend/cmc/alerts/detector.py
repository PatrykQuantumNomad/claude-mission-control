"""Phase 15 Plan 01 — pure-function alert detector primitives.

ALRT-03 + ALRT-05.

Two pure functions (no IO, no DB, no network):

- evaluate_threshold(rule, current_value, state, *, now) -> AlertSignal
  Hysteresis-aware threshold comparator with min_dwell + cooldown windows.

- evaluate_anomaly(rule, current_value, state, *, now) -> tuple[AlertSignal, dict]
  EWMA z-score anomaly detector + 24h warm-up gate (ALRT-05). Returns the
  signal AND the updated EWMA state dict; caller (Plan 02 dispatcher) is
  responsible for persisting the dict back into AlertState.params_json and
  AlertState.sample_count.

Stdlib math ONLY: `import math` is the only numerical library import. No
numpy / scipy / pandas / statistics.

The detector ignores `state.acked_until` — ack precedence is the dispatcher's
responsibility per Plan 01 D-02 (RESEARCH.md Open Q #2). The detector also
does NOT mutate `state` — it returns a signal (and for anomaly, a state dict)
and lets the caller persist.
"""
from __future__ import annotations

import math
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cmc.db.models.alert_rules import AlertRule
    from cmc.db.models.alert_state import AlertState


# ---- Constants ------------------------------------------------------------

# Prevents math.sqrt(0) division when EWMA variance hasn't yet diverged from
# the seed sample. Tiny enough that any real variance dominates immediately.
EPSILON = 1e-9

# ALRT-05: anomaly rules suppress notifications during a 24h warm-up window
# after rule.created_at — even if min_samples is satisfied. This prevents
# "false positive on first hour after rule creation" failure mode.
WARMUP_SECONDS = 86400

# Default EWMA window if rule.params_json doesn't specify one.
# alpha = 2 / (N + 1) → N=50 gives alpha ≈ 0.0392 (modest smoothing).
_DEFAULT_WINDOW_N = 50


class AlertSignal(StrEnum):
    """Detector verdict — Plan 02 dispatcher maps these to actions.

    - FIRING: emit decision + telegram (subject to cooldown + ack at dispatcher).
    - CLEAR: auto-resolve (find pending decision, mark answered).
    - PENDING_FIRE: candidate; min_dwell not yet satisfied — no emit.
    - HOLD: firing-state but cooldown OR ack window suppresses re-emit.
    - INSUFFICIENT: anomaly only; warm-up or min_samples gate not satisfied.
    """

    FIRING = "firing"
    CLEAR = "clear"
    PENDING_FIRE = "pending"
    HOLD = "hold"
    INSUFFICIENT = "insufficient_data"


# ---- evaluate_threshold ---------------------------------------------------


def evaluate_threshold(
    rule: AlertRule,
    current_value: float,
    state: AlertState,
    *,
    now: datetime,
) -> AlertSignal:
    """Hysteresis-aware threshold comparator. Returns one of:
    {FIRING, CLEAR, PENDING_FIRE, HOLD}.

    State machine:

      state.state == "clear" or "acked":
        if value > rule.threshold_fire:
          if state.fired_at is None:           return PENDING_FIRE
          elif (now - fired_at) >= min_dwell:  return FIRING
          else:                                return PENDING_FIRE
        else:                                  return CLEAR

      state.state == "firing":
        clear_floor = threshold_clear if not None else threshold_fire
        if value < clear_floor:                return CLEAR
        if fired_at and (now - fired_at) < cooldown_seconds:
                                               return HOLD
        return FIRING  (re-emit after cooldown)

      state.state == "insufficient_data":      return CLEAR
        (Defensive — threshold rules never set this state in production;
        anomaly rules use it.)

    Float arithmetic only — values come from SQL aggregates as floats per
    scope extractors. The caller MUST NOT pass Decimal here.
    """
    fire = rule.threshold_fire
    # Defensive: a threshold rule with no threshold_fire is a Plan 02
    # validation error, but we degrade gracefully rather than crash.
    if fire is None:
        return AlertSignal.CLEAR

    if state.state in ("clear", "acked"):
        if current_value > fire:
            if state.fired_at is None:
                return AlertSignal.PENDING_FIRE
            elapsed = (now - state.fired_at).total_seconds()
            if elapsed >= rule.min_dwell_seconds:
                return AlertSignal.FIRING
            return AlertSignal.PENDING_FIRE
        return AlertSignal.CLEAR

    if state.state == "firing":
        clear_floor = rule.threshold_clear if rule.threshold_clear is not None else fire
        if current_value < clear_floor:
            return AlertSignal.CLEAR
        # Cooldown gate: if fired_at is recent, hold the alert.
        if state.fired_at is not None:
            elapsed = (now - state.fired_at).total_seconds()
            if elapsed < rule.cooldown_seconds:
                return AlertSignal.HOLD
        return AlertSignal.FIRING

    if state.state == "insufficient_data":
        # Threshold rules don't use warm-up — defensive return for malformed input.
        return AlertSignal.CLEAR

    # Unknown state — defensive CLEAR.
    return AlertSignal.CLEAR


# ---- evaluate_anomaly (EWMA z-score + warm-up + hysteresis) ---------------


def _read_anomaly_state(state: AlertState) -> tuple[float, float, int]:
    """Defensively pull (ewma_mean, ewma_var, sample_count) from state.

    state.params_json is a JSON column on AlertRule per the schema, but
    Plan 01 D-03 lifts the EWMA dict onto AlertState.params_json (attached
    by the dispatcher caller, or by the test factory). If parsing fails for
    any reason (corrupt hand-edit, missing keys, type errors), we degrade
    gracefully by treating this as a fresh seed (returns (0.0, 0.0, 0)) —
    the anomaly path's first-sample short-circuit will then re-seed cleanly.
    """
    pj = getattr(state, "params_json", None) or {}
    sc = getattr(state, "sample_count", 0) or 0
    try:
        mean = float(pj.get("ewma_mean", 0.0))
        var = float(pj.get("ewma_var", 0.0))
        return mean, var, int(sc)
    except (ValueError, TypeError):
        return 0.0, 0.0, 0


def _resolve_window_n(rule: AlertRule) -> int:
    """Pull window_n from rule.params_json, defaulting to 50.

    Defensive int() conversion guards against hand-edited JSON (T-15-01-01).
    """
    pj = rule.params_json or {}
    try:
        n = int(pj.get("window_n", _DEFAULT_WINDOW_N))
    except (ValueError, TypeError):
        n = _DEFAULT_WINDOW_N
    return max(n, 1)  # alpha = 2/(N+1); N=0 would div-zero, clamp to 1.


def evaluate_anomaly(
    rule: AlertRule,
    current_value: float,
    state: AlertState,
    *,
    now: datetime,
) -> tuple[AlertSignal, dict[str, float]]:
    """EWMA z-score anomaly detector + 24h warm-up gate (ALRT-05).

    Returns (signal, ewma_dict) where ewma_dict has keys:
      - ewma_mean: float — updated mean after this sample
      - ewma_var:  float — updated variance after this sample
      - sample_count: float (int-valued) — sample count after this sample

    Caller (Plan 02 dispatcher) MUST persist:
      - state.params_json = {**state.params_json, "ewma_mean": m, "ewma_var": v}
      - state.sample_count = int(sample_count)

    Math (per RESEARCH.md detector math section):
      alpha = 2 / (N + 1) where N = rule.params_json.get("window_n", 50)
      Seed (sample_count == 0):
        new_mean = current_value
        new_var  = 0.0
        signal   = INSUFFICIENT  (no baseline; can't compute z)
      Subsequent (sample_count >= 1):
        new_mean = alpha * x + (1 - alpha) * prior_mean
        new_var  = alpha * (x - prior_mean)^2 + (1 - alpha) * prior_var
        z        = (x - new_mean) / sqrt(new_var + EPSILON)

    Warm-up gate (ALRT-05):
      sample_count_new < rule.min_samples         -> INSUFFICIENT
      now - rule.created_at < WARMUP_SECONDS      -> INSUFFICIENT
    Otherwise the same hysteresis state machine as evaluate_threshold but on
    |z| vs (threshold_fire / threshold_clear) instead of raw value.
    """
    n = _resolve_window_n(rule)
    alpha = 2.0 / (n + 1.0)
    prior_mean, prior_var, prior_sc = _read_anomaly_state(state)

    # ---- Seed sample (no prior baseline) ----
    if prior_sc == 0:
        new_mean = float(current_value)
        new_var = 0.0
        new_sc = 1
        return AlertSignal.INSUFFICIENT, {
            "ewma_mean": new_mean,
            "ewma_var": new_var,
            "sample_count": float(new_sc),
        }

    # ---- EWMA recurrence (Welford-style, numerically stable) ----
    diff = float(current_value) - prior_mean
    new_mean = alpha * float(current_value) + (1.0 - alpha) * prior_mean
    new_var = alpha * (diff * diff) + (1.0 - alpha) * prior_var
    new_sc = prior_sc + 1

    ewma = {
        "ewma_mean": new_mean,
        "ewma_var": new_var,
        "sample_count": float(new_sc),
    }

    # ---- Warm-up + min_samples gates (ALRT-05) ----
    if new_sc < rule.min_samples:
        return AlertSignal.INSUFFICIENT, ewma
    age_seconds = (now - rule.created_at).total_seconds()
    if age_seconds < WARMUP_SECONDS:
        return AlertSignal.INSUFFICIENT, ewma

    # ---- Compute z-score ----
    fire = rule.threshold_fire
    if fire is None:
        # Anomaly rule with no threshold_fire: degrade to CLEAR (Plan 02 validates).
        return AlertSignal.CLEAR, ewma
    z = (float(current_value) - new_mean) / math.sqrt(new_var + EPSILON)
    abs_z = math.fabs(z)

    # ---- Hysteresis state machine (mirrors evaluate_threshold but on |z|) ----
    if state.state in ("clear", "acked", "insufficient_data"):
        if abs_z > fire:
            if state.fired_at is None:
                return AlertSignal.PENDING_FIRE, ewma
            elapsed = (now - state.fired_at).total_seconds()
            if elapsed >= rule.min_dwell_seconds:
                return AlertSignal.FIRING, ewma
            return AlertSignal.PENDING_FIRE, ewma
        return AlertSignal.CLEAR, ewma

    if state.state == "firing":
        clear_floor = (
            rule.threshold_clear if rule.threshold_clear is not None else fire
        )
        if abs_z < clear_floor:
            return AlertSignal.CLEAR, ewma
        if state.fired_at is not None:
            elapsed = (now - state.fired_at).total_seconds()
            if elapsed < rule.cooldown_seconds:
                return AlertSignal.HOLD, ewma
        return AlertSignal.FIRING, ewma

    # Unknown state — defensive CLEAR.
    return AlertSignal.CLEAR, ewma
