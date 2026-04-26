"""Phase 4 Schedule request/response schemas — SCHD-01..06.

Wave 1 plan 04-04 router consumes these as already-defined contracts.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase
from cmc.api.schemas.tasks import TaskListItem


class ScheduleListItem(ORMBase):
    """Schedule row projection — all 9 Schedule columns."""

    id: int
    name: str
    cron: str
    enabled: bool
    next_run_at: Optional[datetime]
    last_run_at: Optional[datetime]
    task_template: dict[str, Any]
    skill: Optional[str]
    created_at: datetime
    updated_at: datetime


class ScheduleListResponse(BaseModel):
    items: list[ScheduleListItem]
    total: int


class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    cron: str = Field(min_length=1, max_length=100)
    enabled: bool = True
    task_template: dict[str, Any] = Field(default_factory=dict)
    skill: Optional[str] = Field(default=None, max_length=100)


class ScheduleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    cron: Optional[str] = Field(default=None, min_length=1, max_length=100)
    enabled: Optional[bool] = None
    task_template: Optional[dict[str, Any]] = None
    skill: Optional[str] = Field(default=None, max_length=100)


class ScheduleRunsResponse(BaseModel):
    """SCHD-05: last N tasks materialized from this schedule."""

    items: list[TaskListItem]
    total: int


class NLCronRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)


class NLCronResponse(BaseModel):
    cron: str
    description: str  # echo back the input
