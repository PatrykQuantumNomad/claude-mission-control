"""alert_rules table — Phase 15 (ALRT-01) final-shape schema landed in Phase 13.

Columns are the verbatim union of REQUIREMENTS.md ALRT-01 structural fields plus
params_json overflow for kind-specific config.
"""
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"

    rule_id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    kind: str            # "threshold" | "anomaly" — Phase 15 enforces enum
    metric: str          # e.g. "cost_usd_24h", "skill_p95_latency_ms"
    threshold_fire: float | None = None     # nullable for anomaly rules
    threshold_clear: float | None = None    # hysteresis floor
    min_dwell_seconds: int = Field(default=0)
    min_samples: int = Field(default=1)
    cooldown_seconds: int = Field(default=0)
    enabled: bool = Field(default=True)
    spec_version: int = Field(default=1)
    params_json: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_alert_rules_enabled", "enabled"),
        Index("idx_alert_rules_kind", "kind"),
    )
