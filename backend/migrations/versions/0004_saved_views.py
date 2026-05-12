"""Add saved_views table.

Revision ID: 0004_saved_views
Revises: 0003_project_key
Create Date: 2026-05-12

Phase 25 (VIEW-02) — server-persisted per-route view state. state_json is
opaque to the backend; validation is the route's validateSearch on read.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0004_saved_views"
down_revision: str | None = "0003_project_key"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("route", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("state_json", sa.JSON(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.create_index("idx_saved_views_route", ["route"], unique=False)
        batch_op.create_unique_constraint("uq_saved_views_route_name", ["route", "name"])


def downgrade() -> None:
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.drop_constraint("uq_saved_views_route_name", type_="unique")
        batch_op.drop_index("idx_saved_views_route")
    op.drop_table("saved_views")
