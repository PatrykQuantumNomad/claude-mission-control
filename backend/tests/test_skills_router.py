"""Skills router tests (SKILL-*).

Every SKILL-* test lives in this file.
"""

from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy import insert, text


def test_skills_schemas_importable() -> None:
    """Wave-0 smoke: SKILL response DTOs are importable from cmc.api.schemas.skills."""
    from cmc.api.schemas.skills import (  # noqa: F401
        SkillAutonomyPatch,
        SkillAutonomyResponse,
        SkillListResponse,
        SkillRow,
        SkillSyncResponse,
    )


# ---- Helpers -------------------------------------------------------------


def _write_skill(dir_path: Path, name: str, frontmatter: dict, body: str = "body") -> Path:
    """Write a SKILL.md file under <dir_path>/<name>/SKILL.md.

    `frontmatter` is rendered as `---\\n<key: value>\\n---\\n` followed by
    `body`. Returns the path to the file written.
    """
    skill_dir = dir_path / name
    skill_dir.mkdir(parents=True, exist_ok=True)
    md = skill_dir / "SKILL.md"

    yaml_lines = []
    for k, v in frontmatter.items():
        if isinstance(v, bool):
            yaml_lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, (int, float)):
            yaml_lines.append(f"{k}: {v}")
        else:
            yaml_lines.append(f"{k}: {v}")

    md.write_text(
        "---\n" + "\n".join(yaml_lines) + "\n---\n" + body + "\n",
        encoding="utf-8",
    )
    return md


# ---- Test 1: scanner finds skills, skips symlinks -----------------------


def test_find_skill_files_skips_symlinks_and_one_level_only(tmp_path: Path) -> None:
    """find_skill_files: returns only one-level-deep dirs with SKILL.md, no symlinks."""
    from cmc.skills.scanner import find_skill_files

    # Real skill dir.
    _write_skill(tmp_path, "skill_a", {
        "name": "skill_a",
        "environment": "personal",
        "user_invocable": True,
        "description": "test skill a",
    })

    # Symlinked skill dir → must be skipped (Pitfall 5).
    elsewhere = tmp_path / "_outside"
    elsewhere.mkdir()
    _write_skill(elsewhere, "real_skill", {"name": "real_skill"})
    sym_target = tmp_path / "linked_skill"
    sym_target.symlink_to(elsewhere / "real_skill")

    # Dir with no SKILL.md → must be skipped.
    (tmp_path / "no_md").mkdir()

    # Nested two-levels-deep skill → must be skipped (one-level-deep only).
    nested = tmp_path / "outer" / "inner_skill"
    nested.mkdir(parents=True)
    (nested / "SKILL.md").write_text("---\nname: inner\n---\nbody\n", encoding="utf-8")

    found = list(find_skill_files(tmp_path))
    found_names = sorted(f.parent.name for f in found)
    # Only `skill_a` is a real one-level dir with SKILL.md and not a symlink.
    # `outer` is a real dir but has no top-level SKILL.md.
    assert found_names == ["skill_a"]


# ---- Test 2: scanner parses frontmatter ---------------------------------


def test_parse_skill_extracts_frontmatter(tmp_path: Path) -> None:
    """parse_skill returns dict with name/environment/user_invocable/description/path."""
    from cmc.skills.scanner import parse_skill

    md = _write_skill(tmp_path, "skill_a", {
        "name": "skill_a",
        "environment": "personal",
        "user_invocable": True,
        "description": "test skill a",
    })
    parsed = parse_skill(md)
    assert parsed is not None
    assert parsed["name"] == "skill_a"
    assert parsed["environment"] == "personal"
    assert parsed["user_invocable"] is True
    assert parsed["description"] == "test skill a"
    assert parsed["path"] == str(md)
    assert parsed["frontmatter"]["name"] == "skill_a"


# ---- Test 3: scan_all enforces 1000 cap ---------------------------------


def test_scan_all_caps_at_max_skills(tmp_path: Path) -> None:
    """scan_all caps results at MAX_SKILLS=1000 (Pitfall 5 defense)."""
    from cmc.skills.scanner import scan_all

    user_dir = tmp_path / "user"
    user_dir.mkdir()
    # Create 1010 dirs.
    for i in range(1010):
        _write_skill(user_dir, f"skill_{i:04d}", {
            "name": f"skill_{i:04d}",
            "environment": "personal",
            "user_invocable": True,
        })
    out = scan_all(user_dir)
    assert len(out) == 1000


# ---- Test 4: SKIL-02 sync upserts via mocked scan_all -------------------


async def test_skills_sync_upserts_with_mocked_scan(seeded_app, monkeypatch) -> None:
    """SKIL-02: POST /api/skills/sync upserts; idempotent re-run reports unchanged."""
    app, cm = seeded_app
    fixtures = [
        {
            "name": "alpha",
            "environment": "personal",
            "user_invocable": True,
            "autonomy": "manual",
            "description": "alpha skill",
            "frontmatter": {"name": "alpha", "extra": "x"},
            "path": "/tmp/fake/alpha/SKILL.md",
        },
        {
            "name": "beta",
            "environment": "project",
            "user_invocable": False,
            "autonomy": "review",
            "description": None,
            "frontmatter": {"name": "beta"},
            "path": "/tmp/fake/beta/SKILL.md",
        },
    ]
    # Patch scan_all in the route module's namespace so the route picks
    # up our fixture without touching the filesystem.
    import cmc.api.routes.skills as skills_mod

    monkeypatch.setattr(skills_mod, "scan_all", lambda *a, **k: fixtures)

    async with cm:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            resp = await ac.post("/api/skills/sync")
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["status"] == "ok"
            assert body["found"] == 2
            assert body["upserted"] == 2
            assert body["unchanged"] == 0
            assert body["errors"] == 0

            # Re-POST: idempotent → unchanged=2, upserted=0.
            resp2 = await ac.post("/api/skills/sync")
            assert resp2.status_code == 200
            body2 = resp2.json()
            assert body2["found"] == 2
            assert body2["upserted"] == 0
            assert body2["unchanged"] == 2


# ---- Test 4b: SKIL-02 end-to-end filesystem→DB --------------------------


async def test_skills_sync_end_to_end_real_filesystem(
    seeded_app, monkeypatch, tmp_path: Path,
) -> None:
    """SKIL-02 end-to-end: real SKILL.md files under tmp_path, parsed and upserted.

    Validates the full chain: route -> scan_all -> find_skill_files ->
    parse_skill -> DB upsert. Per checker WARNING 5.
    """
    app, cm = seeded_app

    # Two fake roots under tmp_path.
    user_root = tmp_path / "personal_skills"
    project_root = tmp_path / "project_skills"
    user_root.mkdir()
    project_root.mkdir()

    # Personal: skill-beta with autonomy=review.
    _write_skill(user_root, "skill-beta", {
        "name": "skill-beta",
        "environment": "personal",
        "user_invocable": True,
        "autonomy": "review",
        "description": "beta",
    })

    # Project: skill-alpha (env override via frontmatter).
    _write_skill(project_root, "skill-alpha", {
        "name": "skill-alpha",
        "environment": "project",
        "user_invocable": True,
        "description": "alpha",
    })

    # Project: skill with no frontmatter → parse_skill returns None.
    bad_dir = project_root / "no-frontmatter"
    bad_dir.mkdir()
    (bad_dir / "SKILL.md").write_text("just a body, no front matter at all\n", encoding="utf-8")

    # Patch the path resolution inside the route module to point at our
    # tmp dirs. We patch repo_root to return tmp_path/.. so repo_root() /
    # 'skills' resolves below; cleaner: patch Path('~/.claude/skills')
    # via patching expanduser by way of patching Path itself in the route
    # module is ugly. Simplest: patch the two Path constants the route
    # builds at request time by replacing scan_all's path inputs through
    # a lambda that sees the fixed roots.
    import cmc.api.routes.skills as skills_mod

    real_scan = skills_mod.scan_all

    def fake_scan(_user, _proj, **kwargs):
        # Always scan our tmp roots regardless of what the route passed.
        return real_scan(user_root, project_root, **kwargs)

    monkeypatch.setattr(skills_mod, "scan_all", fake_scan)

    async with cm:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            resp = await ac.post("/api/skills/sync")
            assert resp.status_code == 200, resp.text
            body = resp.json()
            # 2 parseable + 1 unparseable (silently skipped per scanner contract).
            assert body["found"] == 2
            assert body["upserted"] == 2
            assert body["errors"] == 0

            list_resp = await ac.get("/api/skills")
            assert list_resp.status_code == 200
            items = list_resp.json()["items"]
            assert len(items) == 2
            by_name = {i["name"]: i for i in items}
            assert by_name["skill-alpha"]["environment"] == "project"
            assert by_name["skill-beta"]["environment"] == "personal"
            assert "skill-beta" in by_name["skill-beta"]["path"]

            # Idempotent.
            resp_again = await ac.post("/api/skills/sync")
            body_again = resp_again.json()
            assert body_again["unchanged"] == 2


# ---- Test 5: SKIL-01 list with filters ----------------------------------


async def test_skills_list_with_filters(seeded_app) -> None:
    """SKIL-01: GET /api/skills supports environment + user_invocable filters."""
    from cmc.db.models.skills import Skill

    app, cm = seeded_app
    async with cm:
        sessionmaker = app.state.sessions
        async with sessionmaker() as db:
            now = datetime.now(UTC)
            for n, env, ui in [
                ("personal-only", "personal", True),
                ("project-only", "project", True),
                ("non-invocable", "personal", False),
            ]:
                await db.execute(insert(Skill.__table__).values(
                    name=n,
                    environment=env,
                    user_invocable=ui,
                    autonomy="manual",
                    description=None,
                    frontmatter={},
                    path=f"/tmp/{n}/SKILL.md",
                    updated_at=now,
                ))
            await db.commit()

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            r_all = await ac.get("/api/skills")
            assert r_all.status_code == 200
            assert len(r_all.json()["items"]) == 3

            r_personal = await ac.get("/api/skills?environment=personal")
            personal_names = sorted(i["name"] for i in r_personal.json()["items"])
            assert personal_names == ["non-invocable", "personal-only"]

            r_invocable_false = await ac.get("/api/skills?user_invocable=false")
            ui_false = sorted(i["name"] for i in r_invocable_false.json()["items"])
            assert ui_false == ["non-invocable"]


# ---- Test 6: SKIL-03 PATCH autonomy -------------------------------------


async def test_skills_patch_autonomy(seeded_app) -> None:
    """SKIL-03: PATCH /api/skills/{name}/autonomy validates name + enum."""
    from cmc.db.models.skills import Skill

    app, cm = seeded_app
    async with cm:
        sessionmaker = app.state.sessions
        async with sessionmaker() as db:
            now = datetime.now(UTC)
            await db.execute(insert(Skill.__table__).values(
                name="my-skill",
                environment="personal",
                user_invocable=True,
                autonomy="manual",
                description=None,
                frontmatter={},
                path="/tmp/my-skill/SKILL.md",
                updated_at=now,
            ))
            await db.commit()

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            # Happy path.
            r_ok = await ac.patch(
                "/api/skills/my-skill/autonomy",
                json={"autonomy": "auto"},
            )
            assert r_ok.status_code == 200, r_ok.text
            assert r_ok.json()["autonomy"] == "auto"
            # Verify DB.
            async with sessionmaker() as db:
                row = (await db.execute(
                    text("SELECT autonomy FROM skills WHERE name='my-skill'")
                )).scalar_one()
                assert row == "auto"

            # 404 — unknown skill.
            r_404 = await ac.patch(
                "/api/skills/not-a-real-skill/autonomy",
                json={"autonomy": "auto"},
            )
            assert r_404.status_code == 404

            # 400 — invalid name (path traversal).
            r_400 = await ac.patch(
                "/api/skills/has..dotdot/autonomy",
                json={"autonomy": "auto"},
            )
            assert r_400.status_code == 400

            # 422 — invalid autonomy enum value.
            r_422 = await ac.patch(
                "/api/skills/my-skill/autonomy",
                json={"autonomy": "invalid-value"},
            )
            assert r_422.status_code == 422
