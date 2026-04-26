"""Phase 4 HITL request/response schemas — HITL-01..07.

Wave 1 plan 04-02 router consumes these as already-defined contracts.

DTOs that wrap ORM rows inherit ORMBase (Pitfall 5: needs from_attributes=True).
Plain BaseModel only for request bodies and synthetic responses.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase


# ---- Decisions (HITL-01..03) ----


class DecisionListItem(ORMBase):
    """Decision row projection for list responses."""

    id: int
    session_id: Optional[str]
    task_id: Optional[int]
    dedup_key: str
    prompt: str
    options: list[Any]
    status: str
    answer: Optional[str]
    answered_at: Optional[datetime]
    answered_by: Optional[str]
    created_at: datetime


class DecisionListResponse(BaseModel):
    items: list[DecisionListItem]
    total: int


class DecisionCreate(BaseModel):
    session_id: Optional[str] = None
    task_id: Optional[int] = None
    dedup_key: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=10000)
    options: list[Any] = Field(default_factory=list)


class DecisionAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=10000)
    # Per RESEARCH A7: Literal beats free-text for cleaner UI typing.
    answered_by: Literal["dashboard", "telegram", "cli"] = "dashboard"


class DecisionAnswerResponse(BaseModel):
    answered: bool
    decision_id: int
    queue_path: str


# ---- Inbox (HITL-04..07) ----


class InboxListItem(ORMBase):
    """Inbox row projection for list responses."""

    id: int
    session_id: Optional[str]
    task_id: Optional[int]
    subject: Optional[str]
    body: str
    read: bool
    read_at: Optional[datetime]
    reply: Optional[str]
    replied_at: Optional[datetime]
    created_at: datetime


class InboxListResponse(BaseModel):
    items: list[InboxListItem]
    total: int


class InboxCreate(BaseModel):
    session_id: Optional[str] = None
    task_id: Optional[int] = None
    subject: Optional[str] = Field(default=None, max_length=200)
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
