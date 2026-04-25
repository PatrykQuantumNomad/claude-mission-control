"""tasks table — Mission Control task queue.

Per 01-01-SCHEMA.md (table 6). Drives TASK-01..07 / DISP-01,02,04..06,10,11 /
ESTOP-01,03 / TPNL-01,02.

TASK-02 columns required: priority, quadrant, approval, risk, dry_run, model,
execution_mode, skill, scheduled_for. All present below.

NOTE: SCHEMA flags `quadrant` enum and `skill` FK-vs-text as [NEEDS USER
CONFIRMATION]. Accepted as-is per APPROVED 2026-04-25 — `skill` declared as
free-text reference (no FK enforcement) and `quadrant` as Optional[str] free-text.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field, Index, SQLModel


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = Field(default="")
    status: str = Field(default="pending")  # pending / running / done / failed / awaiting_approval
    priority: int = Field(default=3)  # 1=high
    quadrant: Optional[str] = None  # do / plan / delegate / drop
    approval: str = Field(default="auto")  # auto / awaiting_approval
    risk: Optional[str] = None  # low / medium / high
    dry_run: bool = Field(default=False)
    model: Optional[str] = None
    execution_mode: str = Field(default="interactive")  # interactive / classic / stream
    skill: Optional[str] = None  # free-text ref to skills.name (no enforced FK per SCHEMA decision)
    scheduled_for: Optional[datetime] = None
    schedule_id: Optional[int] = Field(
        default=None,
        sa_column=Column(
            Integer,
            ForeignKey("schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    pid: Optional[int] = None
    stdout_path: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None

    __table_args__ = (
        Index("idx_tasks_status_priority_scheduled", "status", "priority", "scheduled_for"),
        Index("idx_tasks_quadrant_status", "quadrant", "status"),
        Index("idx_tasks_schedule_id", "schedule_id"),
        Index("idx_tasks_pid", "pid"),
    )
