"""Pydantic schemas for saved_views CRUD.

Phase 25 / VIEW-03. state_json is intentionally `dict[str, Any]` — opaque to
the backend, validated client-side via the route's validateSearch on read
(VIEW-02 lock).
"""
from typing import Any

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime


class SavedViewListItem(ORMBase):
    id: int
    name: str
    description: str
    route: str
    state_json: dict[str, Any]
    schema_version: int
    created_at: UTCDatetime
    updated_at: UTCDatetime


class SavedViewListResponse(BaseModel):
    items: list[SavedViewListItem]
    total: int


class SavedViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    route: str = Field(min_length=1, max_length=200)
    state_json: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)


class SavedViewUpdate(BaseModel):
    """All fields optional. state_json is REPLACED WHOLESALE, NOT deep-merged.

    NOTE: `route` is deliberately NOT patchable — a view's route is intrinsic
    to its identity; renaming would silently move it between menu lists. If
    "move route" becomes a UX, expose a separate explicit endpoint.
    """
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    state_json: dict[str, Any] | None = None
    schema_version: int | None = Field(default=None, ge=1)
