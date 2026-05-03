"""Phase 13 doctor checks #9-14 — unit tests against ephemeral DBs.

Exercises the 6 new checks added in Plan 05. Existing checks 1-8 are not
re-tested here (they have their own coverage via /api/health smoke).
"""
import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from cmc.cli.doctor import (
    _check_otel_log_tool_details,
    _check_pricing_freshness,
    _check_pricing_json_hash_drift,
    _check_session_id_null_count,
    _check_unmapped_otel_models,
    _check_unpriced_tokens,
)


def _utcnow_iso() -> str:
    """Naive-UTC isoformat string — matches the on-disk DATETIME column shape."""
    return datetime.now(UTC).replace(tzinfo=None).isoformat()


def _bootstrap_db(db_path: Path) -> sqlite3.Connection:
    """Minimal schema for the doctor checks: pricing, token_usage, otel_events."""
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE pricing (
            id INTEGER PRIMARY KEY,
            model TEXT NOT NULL,
            input_per_mtok NUMERIC,
            output_per_mtok NUMERIC,
            cache_read_per_mtok NUMERIC,
            cache_create_5m_per_mtok NUMERIC,
            cache_create_1h_per_mtok NUMERIC,
            effective_from DATETIME NOT NULL,
            effective_until DATETIME,
            source_url TEXT,
            loaded_at DATETIME,
            seed_hash TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE token_usage (
            id INTEGER PRIMARY KEY,
            day DATE NOT NULL,
            model TEXT NOT NULL,
            source TEXT NOT NULL,
            tokens_input INTEGER DEFAULT 0,
            tokens_output INTEGER DEFAULT 0,
            tokens_cache_read INTEGER DEFAULT 0,
            tokens_cache_create INTEGER DEFAULT 0,
            tokens_cache_create_5m INTEGER DEFAULT 0,
            tokens_cache_create_1h INTEGER DEFAULT 0,
            sessions_count INTEGER DEFAULT 0,
            updated_at DATETIME
        );
        CREATE TABLE otel_events (
            id INTEGER PRIMARY KEY,
            ts DATETIME NOT NULL,
            event_name TEXT NOT NULL,
            session_id TEXT,
            body TEXT NOT NULL,
            attrs_mcp_server TEXT,
            attrs_mcp_tool TEXT,
            attrs_skill_name TEXT,
            otel_event_id INTEGER,
            received_at DATETIME NOT NULL
        );
        """
    )
    return conn


_PRICING_INSERT = (
    "INSERT INTO pricing (model, effective_from, effective_until, source_url, "
    "loaded_at, input_per_mtok, output_per_mtok, cache_read_per_mtok, "
    "cache_create_5m_per_mtok, cache_create_1h_per_mtok, seed_hash) "
    "VALUES (?, ?, ?, '', ?, 0, 0, 0, 0, 0, ?)"
)
_TOKEN_USAGE_INSERT = (
    "INSERT INTO token_usage (day, model, source, tokens_input, sessions_count, "
    "updated_at) VALUES (?, ?, ?, ?, ?, ?)"
)


class _StubSettings:
    def __init__(self, db_path: Path):
        self.db_path = db_path


# -------------------------------------------------------- check 9: pricing freshness


def test_pricing_freshness_warn_at_30d(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    old = (date.today() - timedelta(days=45)).isoformat()
    conn.execute(
        _PRICING_INSERT,
        ("claude-opus-4-7", old, None, _utcnow_iso(), "deadbeef"),
    )
    conn.commit()
    conn.close()
    c = _check_pricing_freshness(settings=_StubSettings(db))
    assert c.status == "warn", c
    assert "old" in c.message


def test_pricing_freshness_ok_when_recent(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    recent = (date.today() - timedelta(days=2)).isoformat()
    conn.execute(
        _PRICING_INSERT,
        ("claude-opus-4-7", recent, None, _utcnow_iso(), "deadbeef"),
    )
    conn.commit()
    conn.close()
    c = _check_pricing_freshness(settings=_StubSettings(db))
    assert c.status == "ok", c


def test_pricing_freshness_fail_when_empty(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.close()
    c = _check_pricing_freshness(settings=_StubSettings(db))
    assert c.status == "fail"
    assert "empty" in c.message


# ------------------------------------------------------- check 10: unpriced tokens


def test_pricing_unpriced_warn(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    today = date.today().isoformat()
    # token_usage row with a model NOT in pricing.
    conn.execute(
        _TOKEN_USAGE_INSERT,
        (today, "claude-foo-bar", "claude-code", 1000, 1, _utcnow_iso()),
    )
    conn.commit()
    conn.close()
    c = _check_unpriced_tokens(settings=_StubSettings(db))
    assert c.status == "warn"
    assert "claude-foo-bar" in c.message


def test_pricing_unpriced_ok_when_all_priced(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    today = date.today().isoformat()
    conn.execute(
        _PRICING_INSERT,
        ("claude-opus-4-7", today, None, _utcnow_iso(), "deadbeef"),
    )
    conn.execute(
        _TOKEN_USAGE_INSERT,
        (today, "claude-opus-4-7", "claude-code", 1000, 1, _utcnow_iso()),
    )
    conn.commit()
    conn.close()
    c = _check_unpriced_tokens(settings=_StubSettings(db))
    assert c.status == "ok"


# ----------------------------------------------- check 11: pricing.json hash drift


def test_pricing_json_hash_drift_ok_when_match(tmp_path, monkeypatch):
    """on-disk hash equals DB seed_hash on most-recent active row -> ok."""
    from cmc import pricing as pricing_mod

    fake_json = tmp_path / "pricing.json"
    fake_json.write_text(
        '{"published_at":"2026-05-03","source_url":"x","models":{}}'
    )
    monkeypatch.setattr(pricing_mod, "_PRICING_JSON", fake_json)
    expected_hash = pricing_mod.pricing_json_hash()

    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.execute(
        _PRICING_INSERT,
        (
            "claude-opus-4-7",
            date.today().isoformat(),
            None,
            _utcnow_iso(),
            expected_hash,
        ),
    )
    conn.commit()
    conn.close()
    c = _check_pricing_json_hash_drift(settings=_StubSettings(db))
    assert c.status == "ok", c
    assert "matches" in c.message


def test_pricing_json_hash_drift_warn_when_mismatch(tmp_path, monkeypatch):
    """on-disk hash != DB seed_hash -> warn (user edited pricing.json sans restart)."""
    from cmc import pricing as pricing_mod

    fake_json = tmp_path / "pricing.json"
    fake_json.write_text(
        '{"published_at":"2026-05-03","source_url":"x","models":{}}'
    )
    monkeypatch.setattr(pricing_mod, "_PRICING_JSON", fake_json)

    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    # Stale hash that does NOT match the current pricing.json.
    stale = "stalehash" * 7 + "stale"
    conn.execute(
        _PRICING_INSERT,
        (
            "claude-opus-4-7",
            date.today().isoformat(),
            None,
            _utcnow_iso(),
            stale,
        ),
    )
    conn.commit()
    conn.close()
    c = _check_pricing_json_hash_drift(settings=_StubSettings(db))
    assert c.status == "warn", c
    assert "edited" in c.message or "drift" in c.message or "on-disk" in c.message


def test_pricing_json_hash_drift_fail_when_missing(tmp_path, monkeypatch):
    """data/pricing.json missing -> fail (true unblocker, not drift)."""
    from cmc import pricing as pricing_mod

    monkeypatch.setattr(pricing_mod, "_PRICING_JSON", tmp_path / "does-not-exist.json")
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.close()
    c = _check_pricing_json_hash_drift(settings=_StubSettings(db))
    assert c.status == "fail"
    assert "missing" in c.message


def test_pricing_json_hash_drift_fail_when_invalid_json(tmp_path, monkeypatch):
    """data/pricing.json present but unparseable -> fail (true unblocker)."""
    from cmc import pricing as pricing_mod

    bad_json = tmp_path / "pricing.json"
    bad_json.write_text("{ not valid json")
    monkeypatch.setattr(pricing_mod, "_PRICING_JSON", bad_json)
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.close()
    c = _check_pricing_json_hash_drift(settings=_StubSettings(db))
    assert c.status == "fail"
    assert "invalid" in c.message.lower()


def test_pricing_json_hash_drift_warn_when_no_seed_hash(tmp_path, monkeypatch):
    """Empty pricing table -> warn (delegates the empty-table fail to check #9)."""
    from cmc import pricing as pricing_mod

    fake_json = tmp_path / "pricing.json"
    fake_json.write_text(
        '{"published_at":"2026-05-03","source_url":"x","models":{}}'
    )
    monkeypatch.setattr(pricing_mod, "_PRICING_JSON", fake_json)
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.close()
    c = _check_pricing_json_hash_drift(settings=_StubSettings(db))
    assert c.status == "warn"
    assert "no seed_hash" in c.message


# --------------------------------------------- check 12: session_id NULL detector


def test_session_id_null_warn(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.execute(
        "INSERT INTO otel_events (ts, event_name, session_id, body, received_at) "
        "VALUES (?, ?, NULL, '{}', ?)",
        (_utcnow_iso(), "api_request", _utcnow_iso()),
    )
    conn.commit()
    conn.close()
    c = _check_session_id_null_count(settings=_StubSettings(db))
    assert c.status == "warn"
    assert "NULL session_id" in c.message


def test_session_id_null_ok_when_zero(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.execute(
        "INSERT INTO otel_events (ts, event_name, session_id, body, received_at) "
        "VALUES (?, ?, 'sess-1', '{}', ?)",
        (_utcnow_iso(), "api_request", _utcnow_iso()),
    )
    conn.commit()
    conn.close()
    c = _check_session_id_null_count(settings=_StubSettings(db))
    assert c.status == "ok"
    assert "0 rows" in c.message


# ------------------------------------------- check 13: unmapped models in otel_events


def test_unmapped_otel_models_ok_empty(tmp_path):
    db = tmp_path / "doc.db"
    conn = _bootstrap_db(db)
    conn.close()
    c = _check_unmapped_otel_models(settings=_StubSettings(db))
    assert c.status == "ok"


# ------------------------------------------- check 14: OTEL_LOG_TOOL_DETAILS env var


def test_otel_log_tool_details_warn_when_unset(monkeypatch):
    monkeypatch.delenv("OTEL_LOG_TOOL_DETAILS", raising=False)
    c = _check_otel_log_tool_details()
    assert c.status == "warn"


def test_otel_log_tool_details_ok_when_set(monkeypatch):
    monkeypatch.setenv("OTEL_LOG_TOOL_DETAILS", "1")
    c = _check_otel_log_tool_details()
    assert c.status == "ok"
