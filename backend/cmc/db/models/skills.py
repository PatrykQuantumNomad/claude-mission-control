"""skills table — local skill registry.

Per 01-01-SCHEMA.md (table 13). Drives SKIL-01..03 / DISP-04,10,11 / SKLP-02,04.

NOTE: SCHEMA flags `environment` enum as [NEEDS USER CONFIRMATION] —
accepted as-is per APPROVED 2026-04-25 (free-text storing personal/project/mcp).
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Index, SQLModel


class Skill(SQLModel, table=True):
    __tablename__ = "skills"

    name: str = Field(primary_key=True)
    environment: str  # personal / project / mcp
    user_invocable: bool = Field(default=True)
    autonomy: str = Field(default="manual")  # auto / review / manual
    description: str | None = None
    frontmatter: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    path: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_skills_env_user_invocable", "environment", "user_invocable"),
        Index("idx_skills_autonomy", "autonomy"),
    )
