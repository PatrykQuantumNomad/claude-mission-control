"""v1.1 alerts and skills — single migration for Phase 13 cost + ingest foundation.

Revision ID: 0002_v1_1_alerts_and_skills
Revises: 0001_initial
Create Date: 2026-05-03

Adds (atomic):
  1. otel_events.attrs_skill_name (indexed) + otel_events.otel_event_id +
     (session_id, otel_event_id) UNIQUE — INGST-11 + INGST-13.
  2. sessions.tokens_cache_create_5m / _1h — cache TTL split (CONTEXT.md locked).
  3. token_usage.tokens_cache_create_5m / _1h — daily rollup parity.
  4. pricing table (model, *_per_mtok, effective_from, effective_until, source_url,
     loaded_at, seed_hash).
  5. alert_rules table — final ALRT-01 schema (Phase 15 ships ZERO migration).
  6. alert_state table — final ALRT-02 schema.
  7. Backfill BUG-B: re-extract session_id from otel_events.body for NULL rows.
  8. Backfill cache TTL split: legacy sessions/token_usage tokens_cache_create
     all migrates into _1h (pessimistic — locked decision).

NOT in this migration (lives in Plan 03 code edits):
  - JSONL parser cache split (Python edit).
  - Ingest BUG-B prospective fix (cmc/api/routes/ingest.py:103 read-side).

The BUG-A read-side fix at observability.py is landed in this same plan
(Plan 02) but lives in the Python source — not in the migration itself.
"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers
revision: str = "0002_v1_1_alerts_and_skills"
down_revision: str | None = "0001_initial"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # === 1. otel_events column adds + indexes + UNIQUE ===
    with op.batch_alter_table("otel_events") as batch_op:
        batch_op.add_column(
            sa.Column("attrs_skill_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch_op.add_column(sa.Column("otel_event_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            "idx_otel_events_attrs_skill_name", ["attrs_skill_name"], unique=False
        )
        batch_op.create_index(
            "uq_otel_events_session_seq",
            ["session_id", "otel_event_id"],
            unique=True,
        )

    # === 2. sessions cache TTL split columns ===
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "tokens_cache_create_5m", sa.Integer(), nullable=False, server_default="0"
            )
        )
        batch_op.add_column(
            sa.Column(
                "tokens_cache_create_1h", sa.Integer(), nullable=False, server_default="0"
            )
        )

    # === 3. token_usage cache TTL split columns ===
    with op.batch_alter_table("token_usage") as batch_op:
        batch_op.add_column(
            sa.Column(
                "tokens_cache_create_5m", sa.Integer(), nullable=False, server_default="0"
            )
        )
        batch_op.add_column(
            sa.Column(
                "tokens_cache_create_1h", sa.Integer(), nullable=False, server_default="0"
            )
        )

    # === 4. pricing table ===
    op.create_table(
        "pricing",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("model", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("input_per_mtok", sa.Numeric(10, 4), nullable=False),
        sa.Column("output_per_mtok", sa.Numeric(10, 4), nullable=False),
        sa.Column("cache_read_per_mtok", sa.Numeric(10, 4), nullable=False),
        sa.Column("cache_create_5m_per_mtok", sa.Numeric(10, 4), nullable=False),
        sa.Column("cache_create_1h_per_mtok", sa.Numeric(10, 4), nullable=False),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("effective_until", sa.DateTime(), nullable=True),
        sa.Column("source_url", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("loaded_at", sa.DateTime(), nullable=False),
        # SHA-256 of the data/pricing.json contents that produced this row.
        # Read by Plan 05's doctor `_check_pricing_json_hash_drift` for drift
        # detection — compares on-disk hash to the seed_hash of the
        # highest-effective_from currently-active row.
        sa.Column("seed_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "model", "effective_from", name="uq_pricing_model_effective_from"
        ),
    )
    with op.batch_alter_table("pricing") as batch_op:
        batch_op.create_index(
            "idx_pricing_model_effective_from", ["model", "effective_from"], unique=False
        )
        batch_op.create_index("ix_pricing_model", ["model"], unique=False)

    # === 5. alert_rules table — final ALRT-01 shape ===
    op.create_table(
        "alert_rules",
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("kind", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("metric", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("threshold_fire", sa.Float(), nullable=True),
        sa.Column("threshold_clear", sa.Float(), nullable=True),
        sa.Column("min_dwell_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_samples", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cooldown_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("spec_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("params_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("rule_id"),
    )
    with op.batch_alter_table("alert_rules") as batch_op:
        batch_op.create_index("idx_alert_rules_enabled", ["enabled"], unique=False)
        batch_op.create_index("idx_alert_rules_kind", ["kind"], unique=False)
        batch_op.create_index("ix_alert_rules_name", ["name"], unique=False)

    # === 6. alert_state table — final ALRT-02 shape ===
    op.create_table(
        "alert_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("scope_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "state",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="clear",
        ),
        sa.Column("last_value", sa.Float(), nullable=True),
        sa.Column("last_evaluated_at", sa.DateTime(), nullable=False),
        sa.Column("fired_at", sa.DateTime(), nullable=True),
        sa.Column("cleared_at", sa.DateTime(), nullable=True),
        sa.Column("acked_until", sa.DateTime(), nullable=True),
        sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["rule_id"], ["alert_rules.rule_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rule_id", "scope_key", name="uq_alert_state_rule_scope"),
    )
    with op.batch_alter_table("alert_state") as batch_op:
        batch_op.create_index("idx_alert_state_state", ["state"], unique=False)
        batch_op.create_index("ix_alert_state_rule_id", ["rule_id"], unique=False)
        batch_op.create_index("ix_alert_state_scope_key", ["scope_key"], unique=False)

    # === 7. BUG-B backfill: re-extract session_id from body.record.attributes ===
    # Production: ~13,818 of 13,818 otel_events rows have NULL session_id (count
    # at planning time was 9,359; growth is explained by ongoing ingest before
    # the fix lands) because cmc/api/routes/ingest.py:103 reads session_id
    # (underscore) but Claude Code 2.1.116 emits session.id (dotted). The
    # dotted value lives in body.record.attributes as an array element
    # ([{key, value}] OTLP shape per SPIKE.md LOCK-1). Use json_each to walk
    # the array and pull the stringValue for the matching key.
    op.execute(
        """
        UPDATE otel_events
        SET session_id = (
            SELECT json_extract(value, '$.value.stringValue')
            FROM json_each(json_extract(body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'session.id'
            LIMIT 1
        )
        WHERE session_id IS NULL
          AND body IS NOT NULL
        """
    )

    # === 8. Cache TTL backfill: pessimistic — all legacy aggregate -> _1h ===
    # Per CONTEXT.md locked decision: legacy tokens_cache_create lands entirely
    # in tokens_cache_create_1h; tokens_cache_create_5m starts at 0.
    # The legacy `tokens_cache_create` column STAYS — it's the read-side
    # source of truth for pre-Phase-13 sessions until Plan 03's JSONL re-parse.
    op.execute(
        "UPDATE sessions SET tokens_cache_create_1h = tokens_cache_create "
        "WHERE tokens_cache_create > 0"
    )
    op.execute(
        "UPDATE token_usage SET tokens_cache_create_1h = tokens_cache_create "
        "WHERE tokens_cache_create > 0"
    )


def downgrade() -> None:
    # Reverse order: drop dependent FK tables first.
    with op.batch_alter_table("alert_state") as batch_op:
        batch_op.drop_index("ix_alert_state_scope_key")
        batch_op.drop_index("ix_alert_state_rule_id")
        batch_op.drop_index("idx_alert_state_state")
    op.drop_table("alert_state")

    with op.batch_alter_table("alert_rules") as batch_op:
        batch_op.drop_index("ix_alert_rules_name")
        batch_op.drop_index("idx_alert_rules_kind")
        batch_op.drop_index("idx_alert_rules_enabled")
    op.drop_table("alert_rules")

    with op.batch_alter_table("pricing") as batch_op:
        batch_op.drop_index("ix_pricing_model")
        batch_op.drop_index("idx_pricing_model_effective_from")
    op.drop_table("pricing")

    with op.batch_alter_table("token_usage") as batch_op:
        batch_op.drop_column("tokens_cache_create_1h")
        batch_op.drop_column("tokens_cache_create_5m")

    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_column("tokens_cache_create_1h")
        batch_op.drop_column("tokens_cache_create_5m")

    with op.batch_alter_table("otel_events") as batch_op:
        batch_op.drop_index("uq_otel_events_session_seq")
        batch_op.drop_index("idx_otel_events_attrs_skill_name")
        batch_op.drop_column("otel_event_id")
        batch_op.drop_column("attrs_skill_name")

    # NOTE: BUG-B backfill is NOT reversed (session_id was always NULL
    # pre-migration; leaving it populated post-downgrade is a strict
    # improvement and the column is nullable on 0001).
