"""Task request/response schemas.

NOTE: TaskTriggerRequest is intentionally NOT defined — the trigger
endpoint takes NO body in v1. The handler signature should omit any body
parameter entirely rather than declaring an empty Pydantic model (which
would force callers to send `{}` and 422 on missing).
"""

from typing import Literal

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime


class TaskListItem(ORMBase):
    """Task row projection for list responses — all 19 Task columns."""

    id: int
    title: str
    description: str
    status: str
    priority: int
    quadrant: str | None
    approval: str
    risk: str | None
    dry_run: bool
    model: str | None
    execution_mode: str
    skill: str | None
    scheduled_for: UTCDatetime | None
    schedule_id: int | None
    pid: int | None
    stdout_path: str | None
    error_message: str | None
    created_at: UTCDatetime
    started_at: UTCDatetime | None
    ended_at: UTCDatetime | None
    approved_at: UTCDatetime | None


class TaskListResponse(BaseModel):
    items: list[TaskListItem]
    total: int


class TaskCreate(BaseModel):
    """User-supplied task fields per TASK-02."""

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: int = Field(default=3, ge=1, le=5)
    quadrant: Literal["do", "plan", "delegate", "drop"] | None = None
    approval: Literal["auto", "awaiting_approval"] = "auto"
    risk: Literal["low", "medium", "high"] | None = None
    dry_run: bool = False
    model: str | None = Field(default=None, max_length=100)
    execution_mode: Literal["interactive", "classic", "stream"] = "interactive"
    skill: str | None = Field(default=None, max_length=100)
    scheduled_for: UTCDatetime | None = None
    schedule_id: int | None = None


class TaskUpdate(BaseModel):
    """All fields optional; status validated by transitions matrix in router."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: int | None = Field(default=None, ge=1, le=5)
    quadrant: Literal["do", "plan", "delegate", "drop"] | None = None
    approval: Literal["auto", "awaiting_approval"] | None = None
    risk: Literal["low", "medium", "high"] | None = None
    dry_run: bool | None = None
    model: str | None = Field(default=None, max_length=100)
    execution_mode: Literal["interactive", "classic", "stream"] | None = None
    skill: str | None = Field(default=None, max_length=100)
    scheduled_for: UTCDatetime | None = None
    schedule_id: int | None = None
    status: str | None = None  # validated by transitions matrix in router
    error_message: str | None = None


class TaskApproveResponse(BaseModel):
    id: int
    status: str
    approved_at: UTCDatetime


class TaskRerunResponse(BaseModel):
    id: int
    status: str


class TaskRejectResponse(BaseModel):
    id: int
    status: str


class TaskTriggerResponse(BaseModel):
    triggered: bool
    pid: int
