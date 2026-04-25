"""Base SQLModel re-export. Plan 05 will populate `cmc.db.models` with table classes
that inherit from SQLModel. Alembic env.py imports this module to access metadata.
"""
from sqlmodel import SQLModel

__all__ = ["SQLModel"]
