"""SavedView — server-persisted, per-route, URL-shareable filter combinations.

Phase 25 / VIEW-02. state_json is OPAQUE to the backend — validation lives in
the route's validateSearch on the frontend (REQUIREMENTS.md VIEW-02 lock,
ROADMAP.md Phase 25 success criterion 5).
"""
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="")
    # e.g. "/", "/activity", "/skills", "/skills/$name", "/cost", "/alerts", "/sessions/compare"
    route: str
    state_json: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False),
    )
    schema_version: int = Field(default=1)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_saved_views_route", "route"),
        UniqueConstraint("route", "name", name="uq_saved_views_route_name"),
    )
