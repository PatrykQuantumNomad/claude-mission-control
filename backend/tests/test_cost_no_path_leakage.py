"""Structural path-leakage guard for /api/cost/breakdown?dim=project.

LOAD-BEARING for ROADMAP Phase 20 success criterion #3 (per-project card
populated from /api/cost/breakdown?dim=project) — the response shape MUST
NOT carry raw filesystem paths.

Mirrors backend/tests/test_skills_router.py::test_skill_projects_no_path_leakage
(Phase 19 Plan 02). The two tests together pin the path-leakage invariant
across both per-project endpoints in the API surface.

Adversarial-mutation verified: swapping cost.py's _BREAKDOWN_BY_PROJECT_SQL
back to COALESCE(s.cwd, '<unknown>') AS key MUST fail this test (RED).
"""
from __future__ import annotations

from sqlalchemy import insert

from cmc.core.project_key import compute_project_key
from cmc.core.time import now_utc

# Recognizable seed path — a substring of this string MUST NOT appear in
# any field of the response. The path is intentionally long & specific
# (multiple distinctive segments) so any partial leak is caught.
_LEAKY_CWD = "/tmp/super/secret/leakage/path"


async def _seed_leaky_session(app) -> str:
    """Insert one sessions row with a recognizable cwd. Returns its project_key.

    Direct engine insert (mirrors test_cost_router.py::_seed_session_for_cost)
    because conftest.make_session_row predates Phase 19's project_key column.
    """
    from cmc.db.base import SQLModel

    pk = compute_project_key(_LEAKY_CWD)
    started = now_utc()
    engine = app.state.engine
    table = SQLModel.metadata.tables["sessions"]
    async with engine.begin() as conn:
        await conn.execute(insert(table).values(
            session_id="sess-leakage-guard",
            started_at=started,
            ended_at=None,
            synced_at=started,
            jsonl_mtime=started,
            jsonl_path="/tmp/sess-leakage-guard.jsonl",
            cwd=_LEAKY_CWD,
            project_key=pk,
            model="claude-opus-4-7",
            source="claude-code",
            outcome=None,
            tokens_input=1000,
            tokens_output=500,
            tokens_cache_read=0,
            tokens_cache_create=0,
            tokens_cache_create_5m=0,
            tokens_cache_create_1h=0,
            tool_call_count=0,
            message_count=0,
            error_message=None,
        ))
    return pk


async def test_cost_breakdown_project_no_path_leakage(client) -> None:
    """ANLY-07 structural guard: /api/cost/breakdown?dim=project leaks no paths.

    Seeds one session with a deeply-nested cwd that would be unmistakable if
    leaked, then calls the endpoint and scans every row's keys AND values for
    filesystem-shape leakage.

    Catches:
      1. Any key named cwd / path / display_path / cwd_path
      2. Any string value that starts with '/' (filesystem-shape)
      3. Any string value containing a seeded path fragment
    """
    app = client._transport.app  # type: ignore[attr-defined]
    pk = await _seed_leaky_session(app)

    r = await client.get("/api/cost/breakdown?dim=project&range=7d")
    assert r.status_code == 200, r.text
    payload = r.json()

    rows = payload["rows"]
    assert len(rows) >= 1, "expected at least one project row from seeded session"

    BANNED_KEYS = {"cwd", "path", "display_path", "cwd_path"}
    SEED_FRAGMENTS = ("/tmp/super", "/secret/leakage", "leakage/path")

    for row in rows:
        leaked_keys = BANNED_KEYS.intersection(row.keys())
        assert not leaked_keys, (
            f"row leaked path-shaped keys: {leaked_keys}; row={row!r}"
        )

        for k, v in row.items():
            if isinstance(v, str):
                assert not v.startswith("/"), (
                    f"row[{k!r}]={v!r} starts with '/' — looks like a filesystem path"
                )
                for frag in SEED_FRAGMENTS:
                    assert frag not in v, (
                        f"row[{k!r}]={v!r} contains seeded path fragment {frag!r}"
                    )

    # Confirm the keyed row IS present — i.e. we're not vacuously passing
    # because the response is empty.
    keys_seen = {row["key"] for row in rows}
    assert pk in keys_seen, (
        f"seeded project key {pk!r} missing from rows; got {keys_seen!r}"
    )
    # And the project_key shape: 12 lowercase hex chars.
    assert len(pk) == 12
    assert all(c in "0123456789abcdef" for c in pk)
