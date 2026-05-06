"""sessions table — one row per Claude Code session.

Per 01-01-SCHEMA.md (table 1). Drives SESS-01..07 / OBSV-01,03,06,07 / ACTV-05.
"""

from datetime import datetime

from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    session_id: str = Field(primary_key=True, max_length=64)
    started_at: datetime
    ended_at: datetime | None = None
    synced_at: datetime = Field(default_factory=now_utc)
    jsonl_mtime: datetime
    jsonl_path: str
    cwd: str | None = None
    project_hash: str | None = None
    # Phase 19 SKLP-08: sha1[:12] of realpath(cwd.rstrip('/')); '' for empty cwd.
    # Set on insert by cmc.ingest.scheduler via cmc.core.project_key.compute_project_key,
    # backfilled by migration 0003. NEVER expose `cwd` in API responses; use this.
    project_key: str = Field(
        default="",
        max_length=12,
        nullable=False,
        sa_column_kwargs={"server_default": ""},
        index=True,
    )
    model: str | None = None
    # source enum values flagged [NEEDS USER CONFIRMATION] in 01-01-SCHEMA.md;
    # accepted as-is per APPROVED 2026-04-25 — stored as free-text for now.
    source: str | None = None
    outcome: str | None = None
    tokens_input: int = Field(default=0)
    tokens_output: int = Field(default=0)
    tokens_cache_read: int = Field(default=0)
    tokens_cache_create: int = Field(default=0)
    tokens_cache_create_5m: int = Field(default=0)
    tokens_cache_create_1h: int = Field(default=0)
    tool_call_count: int = Field(default=0)
    message_count: int = Field(default=0)
    error_message: str | None = None

    __table_args__ = (
        Index("idx_sessions_started_at_desc", "started_at"),
        Index("idx_sessions_cwd", "cwd"),
        Index("idx_sessions_model", "model"),
        Index("idx_sessions_ended_at", "ended_at"),
        Index("idx_sessions_synced_at", "synced_at"),
    )
