"""sessions table — one row per Claude Code session.

Per 01-01-SCHEMA.md (table 1). Drives SESS-01..07 / OBSV-01,03,06,07 / ACTV-05.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import Field, Index, SQLModel


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    session_id: str = Field(primary_key=True, max_length=64)
    started_at: datetime
    ended_at: Optional[datetime] = None
    synced_at: datetime = Field(default_factory=datetime.utcnow)
    jsonl_mtime: datetime
    jsonl_path: str
    cwd: Optional[str] = None
    project_hash: Optional[str] = None
    model: Optional[str] = None
    # source enum values flagged [NEEDS USER CONFIRMATION] in 01-01-SCHEMA.md;
    # accepted as-is per APPROVED 2026-04-25 — stored as free-text for now.
    source: Optional[str] = None
    outcome: Optional[str] = None
    tokens_input: int = Field(default=0)
    tokens_output: int = Field(default=0)
    tokens_cache_read: int = Field(default=0)
    tokens_cache_create: int = Field(default=0)
    tool_call_count: int = Field(default=0)
    message_count: int = Field(default=0)
    error_message: Optional[str] = None

    __table_args__ = (
        Index("idx_sessions_started_at_desc", "started_at"),
        Index("idx_sessions_cwd", "cwd"),
        Index("idx_sessions_model", "model"),
        Index("idx_sessions_ended_at", "ended_at"),
        Index("idx_sessions_synced_at", "synced_at"),
    )
