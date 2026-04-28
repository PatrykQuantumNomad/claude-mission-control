"""Phase 4 Task request/response schemas — TASK-01..07.

Wave 1 plan 04-03 router consumes these as already-defined contracts.

NOTE: TaskTriggerRequest is intentionally NOT defined — the trigger
endpoint takes NO body in v1. The handler signature should omit any body
parameter entirely rather than declaring an empty Pydantic model (which
would force callers to send `{}` and 422 on missing).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase


class TaskListItem(ORMBase):
    """Task row projection for list responses — all 19 Task columns."""

    id: int
    title: str
    description: str
    status: str
    priority: int
    quadrant: Optional[str]
    approval: str
    risk: Optional[str]
    dry_run: bool
    model: Optional[str]
    execution_mode: str
    skill: Optional[str]
    scheduled_for: Optional[datetime]
    schedule_id: Optional[int]
    pid: Optional[int]
    stdout_path: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    approved_at: Optional[datetime]


class TaskListResponse(BaseModel):
    items: list[TaskListItem]
    total: int


class TaskCreate(BaseModel):
    """User-supplied task fields per TASK-02."""

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: int = Field(default=3, ge=1, le=5)
    quadrant: Optional[Literal["do", "plan", "delegate", "drop"]] = None
    approval: Literal["auto", "awaiting_approval"] = "auto"
    risk: Optional[Literal["low", "medium", "high"]] = None
    dry_run: bool = False
    model: Optional[str] = Field(default=None, max_length=100)
    execution_mode: Literal["interactive", "classic", "stream"] = "interactive"
    skill: Optional[str] = Field(default=None, max_length=100)
    scheduled_for: Optional[datetime] = None
    schedule_id: Optional[int] = None


class TaskUpdate(BaseModel):
    """All fields optional; status validated by transitions matrix in router."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=1, le=5)
    quadrant: Optional[Literal["do", "plan", "delegate", "drop"]] = None
    approval: Optional[Literal["auto", "awaiting_approval"]] = None
    risk: Optional[Literal["low", "medium", "high"]] = None
    dry_run: Optional[bool] = None
    model: Optional[str] = Field(default=None, max_length=100)
    execution_mode: Optional[Literal["interactive", "classic", "stream"]] = None
    skill: Optional[str] = Field(default=None, max_length=100)
    scheduled_for: Optional[datetime] = None
    schedule_id: Optional[int] = None
    status: Optional[str] = None  # validated by transitions matrix in router
    error_message: Optional[str] = None


class TaskApproveResponse(BaseModel):
    id: int
    status: str
    approved_at: datetime


class TaskRerunResponse(BaseModel):
    id: int
    status: str


class TaskRejectResponse(BaseModel):
    id: int
    status: str


class TaskTriggerResponse(BaseModel):
    triggered: bool
    pid: int
