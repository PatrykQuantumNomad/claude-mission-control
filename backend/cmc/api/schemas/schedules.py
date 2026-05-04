"""Schedule request/response schemas."""

from typing import Any

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime
from cmc.api.schemas.tasks import TaskListItem


class ScheduleListItem(ORMBase):
    """Schedule row projection — all 9 Schedule columns."""

    id: int
    name: str
    cron: str
    enabled: bool
    next_run_at: UTCDatetime | None
    last_run_at: UTCDatetime | None
    task_template: dict[str, Any]
    skill: str | None
    created_at: UTCDatetime
    updated_at: UTCDatetime


class ScheduleListResponse(BaseModel):
    items: list[ScheduleListItem]
    total: int


class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    cron: str = Field(min_length=1, max_length=100)
    enabled: bool = True
    task_template: dict[str, Any] = Field(default_factory=dict)
    skill: str | None = Field(default=None, max_length=100)


class ScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    cron: str | None = Field(default=None, min_length=1, max_length=100)
    enabled: bool | None = None
    task_template: dict[str, Any] | None = None
    skill: str | None = Field(default=None, max_length=100)


class ScheduleRunsResponse(BaseModel):
    """SCHD-05: last N tasks materialized from this schedule."""

    items: list[TaskListItem]
    total: int


class NLCronRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)


class NLCronResponse(BaseModel):
    cron: str
    description: str  # echo back the input
