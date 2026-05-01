"""HITL request/response schemas.

DTOs that wrap ORM rows inherit ORMBase so Pydantic can validate from ORM attributes.
Plain BaseModel only for request bodies and synthetic responses.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase

# ---- Decisions (HITL-01..03) ----


class DecisionListItem(ORMBase):
    """Decision row projection for list responses."""

    id: int
    session_id: str | None
    task_id: int | None
    dedup_key: str
    prompt: str
    options: list[Any]
    status: str
    answer: str | None
    answered_at: datetime | None
    answered_by: str | None
    created_at: datetime


class DecisionListResponse(BaseModel):
    items: list[DecisionListItem]
    total: int


class DecisionCreate(BaseModel):
    session_id: str | None = None
    task_id: int | None = None
    dedup_key: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=10000)
    options: list[Any] = Field(default_factory=list)


class DecisionAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=10000)
    # Literal beats free-text for cleaner UI typing.
    answered_by: Literal["dashboard", "telegram", "cli"] = "dashboard"


class DecisionAnswerResponse(BaseModel):
    answered: bool
    decision_id: int
    queue_path: str


# ---- Inbox (HITL-04..07) ----


class InboxListItem(ORMBase):
    """Inbox row projection for list responses."""

    id: int
    session_id: str | None
    task_id: int | None
    subject: str | None
    body: str
    read: bool
    read_at: datetime | None
    reply: str | None
    replied_at: datetime | None
    created_at: datetime


class InboxListResponse(BaseModel):
    items: list[InboxListItem]
    total: int


class InboxCreate(BaseModel):
    session_id: str | None = None
    task_id: int | None = None
    subject: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=10000)


class InboxReadResponse(BaseModel):
    id: int
    read: bool
    read_at: datetime


class InboxReplyRequest(BaseModel):
    reply: str = Field(min_length=1, max_length=10000)


class InboxReplyResponse(BaseModel):
    replied: bool
    inbox_id: int
    queue_path: str
