"""alert_state table — Phase 15 (ALRT-02) hysteresis + dedup tracking.

One row per (rule_id, scope_key) — scope_key is the dimension key the rule fires on
(e.g. "model:claude-opus-4-7" for a per-model cost rule).
"""
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class AlertState(SQLModel, table=True):
    __tablename__ = "alert_state"

    id: int | None = Field(default=None, primary_key=True)
    rule_id: int = Field(foreign_key="alert_rules.rule_id", index=True)
    scope_key: str = Field(index=True)
    state: str = Field(default="clear")  # "firing" | "clear" | "acked" | "insufficient_data"
    last_value: float | None = None
    last_evaluated_at: datetime = Field(default_factory=datetime.utcnow)
    fired_at: datetime | None = None
    cleared_at: datetime | None = None
    acked_until: datetime | None = None  # ack suppresses re-notify until this ts
    sample_count: int = Field(default=0)

    __table_args__ = (
        UniqueConstraint("rule_id", "scope_key", name="uq_alert_state_rule_scope"),
        Index("idx_alert_state_state", "state"),
    )
