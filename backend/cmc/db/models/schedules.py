"""schedules table — cron-driven recurring task templates.

Per 01-01-SCHEMA.md (table 7). Drives SCHD-01..06 / DISP-01 / TPNL-03,04.

NOTE: SCHEMA flags `name` UNIQUE and `skill` FK as [NEEDS USER CONFIRMATION].
Accepted as-is per APPROVED 2026-04-25 — `name` is UNIQUE and `skill` is
free-text (no enforced FK).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Index, SQLModel


class Schedule(SQLModel, table=True):
    __tablename__ = "schedules"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    cron: str  # 5-field unix cron expression
    enabled: bool = Field(default=True)
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    task_template: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    skill: Optional[str] = None  # free-text ref to skills.name
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("name", name="uq_schedules_name"),
        Index("idx_schedules_enabled_next_run", "enabled", "next_run_at"),
    )
