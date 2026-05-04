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


# ---- evaluate_anomaly (Task 2 — stub for now) -----------------------------


def evaluate_anomaly(
    rule: AlertRule,
    current_value: float,
    state: AlertState,
    *,
    now: datetime,
) -> tuple[AlertSignal, dict[str, float]]:
    """EWMA z-score anomaly detector with 24h warm-up gate.

    Returns (signal, {"ewma_mean": float, "ewma_var": float,
                      "sample_count": float}). Caller persists.

    Task 2 implementation lands in the next commit.
    """
    # Use math import to avoid the unused-import lint when this stub is shipped.
    _ = math.sqrt(EPSILON)
    raise NotImplementedError(
        "evaluate_anomaly is implemented by Task 2 (next commit)"
    )
