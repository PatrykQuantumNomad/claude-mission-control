"""system_state table — generic key-value store for system-level flags.

Per 01-01-SCHEMA.md (table 14). Drives SAPI-02,03 / ESTOP-03,04 / DISP-02.

NOTE: SCHEMA flags `value` + `value_json` two-column shape as
[NEEDS USER CONFIRMATION] — accepted as-is per APPROVED 2026-04-25
(both columns retained for flexibility).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from cmc.core.time import now_utc


class SystemState(SQLModel, table=True):
    __tablename__ = "system_state"

    key: str = Field(primary_key=True)
    value: str | None = None
    value_json: dict[str, Any] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    updated_at: datetime = Field(default_factory=now_utc)
