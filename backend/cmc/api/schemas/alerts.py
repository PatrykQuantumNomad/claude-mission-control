"""Phase 15 Plan 02 — /api/alerts request/response schemas.

ALRT-09 — full CRUD on alert rules + events history + ack endpoint.

Decimal-as-JSON-string lock from Phase 13: NEVER pipe these through
fastapi.encoders.jsonable_encoder (would lose precision on Decimal values).
None of these schemas use Decimal — all numeric values are float / int —
but the discipline carries: response models use Pydantic v2 default JSON
serialization end-to-end.

Frontend lock (Plan 15-04 already shipped): the TypeScript interfaces in
frontend/src/lib/api.ts mirror these field-by-field. Any rename or type
change here MUST be paralleled in the frontend or the cadence-bucket tests
in queries.test.ts will fail at runtime.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cmc.alerts.scopes import is_known_metric
from cmc.api.schemas.common import ORMBase, UTCDatetime

# D-04: 4-tier range Literal — same shape as cost.py:CostRange. Separate
# symbol so future expansion is decoupled but identical members for v1.0.
AlertRange = Literal["1d", "7d", "14d", "30d"]
AlertKind = Literal["threshold", "anomaly"]


# ---- AlertRuleCreate ------------------------------------------------------


class AlertRuleCreate(BaseModel):
    """POST /api/alerts/rules body.

    Validators (Pydantic v2 model_validator(mode='after')):
      - kind == 'threshold' requires threshold_fire (else 422)
      - threshold_clear < threshold_fire when both set (else 422)
      - is_known_metric(metric) (else 422)
    """

    name: str = Field(..., min_length=1, max_length=120)
    kind: AlertKind
    metric: str
    threshold_fire: float | None = None
    threshold_clear: float | None = None
    min_dwell_seconds: int = Field(0, ge=0)
    min_samples: int = Field(1, ge=1)
    cooldown_seconds: int = Field(0, ge=0)
    enabled: bool = True
    spec_version: int = 1
    params_json: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_thresholds_and_metric(self) -> AlertRuleCreate:
        if self.kind == "threshold" and self.threshold_fire is None:
            raise ValueError(
                "threshold rules require threshold_fire to be set"
            )
        if (
            self.threshold_clear is not None
            and self.threshold_fire is not None
            and self.threshold_clear >= self.threshold_fire
        ):
            raise ValueError(
                "threshold_clear must be < threshold_fire (hysteresis floor)"
            )
        if not is_known_metric(self.metric):
            raise ValueError(f"unknown metric: {self.metric}")
        return self


# ---- AlertRulePatch -------------------------------------------------------


class AlertRulePatch(BaseModel):
    """PATCH /api/alerts/rules/{rule_id} body — partial update.

    Not patchable: kind, metric, spec_version, rule_id (those would invalidate
    the alert_state machine entirely; user must DELETE+POST).

    Validators only fire when a threshold field is being patched. Patching
    threshold_fire alone is fine; patching both inverts the hysteresis check.
    """

    name: str | None = Field(None, min_length=1, max_length=120)
    enabled: bool | None = None
    threshold_fire: float | None = None
    threshold_clear: float | None = None
    min_dwell_seconds: int | None = Field(None, ge=0)
    min_samples: int | None = Field(None, ge=1)
    cooldown_seconds: int | None = Field(None, ge=0)
    params_json: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _validate_thresholds(self) -> AlertRulePatch:
        if (
            self.threshold_clear is not None
            and self.threshold_fire is not None
            and self.threshold_clear >= self.threshold_fire
        ):
            raise ValueError(
                "threshold_clear must be < threshold_fire (hysteresis floor)"
            )
        return self


# ---- AlertRuleRow ---------------------------------------------------------


class AlertRuleRow(ORMBase):
    """Response shape for one AlertRule — mirrors backend AlertRule columns."""

    rule_id: int
    name: str
    kind: str
    metric: str
    threshold_fire: float | None
    threshold_clear: float | None
    min_dwell_seconds: int
    min_samples: int
    cooldown_seconds: int
    enabled: bool
    spec_version: int
    params_json: dict[str, Any]
    created_at: UTCDatetime
    updated_at: UTCDatetime


class AlertRuleListResponse(BaseModel):
    items: list[AlertRuleRow]
    total: int


# ---- AlertEvent / AlertEventsResponse -------------------------------------


class AlertEvent(BaseModel):
    """One row of firing history. Joins decisions WHERE dedup_key LIKE 'alert:%'
    to alert_rules in Python (SQLite SUBSTR/INSTR is fragile — the join is
    cheap because events are ≤500/day in v1.0).
    """

    decision_id: int
    rule_id: int
    rule_name: str
    scope_key: str
    fired_at: UTCDatetime
    cleared_at: UTCDatetime | None
    status: str  # 'pending' (still firing) | 'answered' (auto-resolved or acked)
    last_value: float | None


class AlertEventsResponse(BaseModel):
    range: AlertRange
    items: list[AlertEvent]
    total: int


# ---- AlertAckRequest ------------------------------------------------------


class AlertAckRequest(BaseModel):
    """POST /api/alerts/_ack body.

    scope_hash is sha256(scope_key)[:8] — 8-char hex. Plan 03 wires the
    Telegram callback that hits this endpoint with the truncated hash because
    Telegram inline callback_data is capped at 64 bytes (Pitfall 9).
    """

    model_config = ConfigDict(extra="forbid")

    rule_id: int = Field(..., gt=0)
    scope_hash: str = Field(
        ..., min_length=8, max_length=8, pattern=r"^[0-9a-f]{8}$"
    )


# ---- AlertRule NL parse + metrics endpoints (Phase 21 / ALRT-14) ----------


class AlertRuleParseRequest(BaseModel):
    """POST /api/alerts/parse-nl body — natural-language alert rule description."""

    model_config = ConfigDict(extra="forbid")
    description: str = Field(..., min_length=1, max_length=1000)


class AlertRuleParseResponse(BaseModel):
    """POST /api/alerts/parse-nl response on successful parse + validation.

    Mirrors NLCronResponse (schemas/schedules.py:58-60) — echoes the input
    description back so the frontend preview modal can show "you typed: ...".
    On hallucination / missing API key, the route emits 503 (NOT a null-rule
    envelope) per V11 collapsed-failure-mode contract.
    """

    rule: AlertRuleCreate
    description: str


class AlertMetricsResponse(BaseModel):
    """GET /api/alerts/metrics response — canonical metric vocabulary.

    Body is sorted(_SCOPE_EXTRACTORS.keys()) for deterministic ordering
    (consumed by the frontend useAlertMetrics query AND by Plan 21-03's
    test_alerts_metrics_sync drift guard).
    """

    metrics: list[str]
