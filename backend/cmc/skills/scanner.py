"""Skill filesystem scanner — Pitfall 5 hardened (no symlinks, 1-level deep, capped).

Frontmatter format: ``---\\nyaml\\n---\\n<body>`` (matches the SKILL.md
convention used by Claude's skills system).

Hardening per Plan 03-05 threat model:
  - find_skill_files skips symlinks at BOTH the directory AND the SKILL.md
    file levels (defense against symlink-pointing-at-/etc/passwd attacks).
  - Only one-level deep: <root>/<skill_name>/SKILL.md. Nested skills are
    intentionally out of scope (avoids unbounded recursion).
  - scan_all caps total results at MAX_SKILLS=1000 (defense against a
    user-mode skill dir with thousands of stale entries).
"""

import re
from collections.abc import Iterator
from pathlib import Path

import yaml

MAX_SKILLS = 1000

# Matches the leading `---\nYAML\n---\n` block. Re-flags:
#   DOTALL    -> `.` matches newlines inside the YAML body
#   MULTILINE -> `^---$` anchors line-by-line
_FRONTMATTER_RE = re.compile(r"^---\s*$(.*?)^---\s*$", re.DOTALL | re.MULTILINE)


def find_skill_files(root: Path) -> Iterator[Path]:
    """Yield Path objects for every <root>/<skill_name>/SKILL.md found.

    Hardening:
      - Skips dirs that are symlinks (Pitfall 5).
      - Skips SKILL.md files that are themselves symlinks.
      - One-level deep only — does NOT recurse into nested directories.
      - Yields nothing if `root` is not a directory (no error raised).
    """
    if not root.is_dir():
        return
    for entry in sorted(root.iterdir()):
        if entry.is_symlink() or not entry.is_dir():
            continue
        skill_md = entry / "SKILL.md"
        if skill_md.is_file() and not skill_md.is_symlink():
            yield skill_md


def parse_skill(path: Path, default_env: str = "personal") -> dict | None:
    """Parse a SKILL.md file and return its metadata as a dict.

    Returns None on:
      - File read errors (OSError).
      - Missing frontmatter block.
      - YAML parse errors (yaml.safe_load only — never yaml.load, per V12).
      - Non-mapping frontmatter (e.g. a YAML list at the top level).

    The returned dict has these keys (every value is JSON-serializable so
    it can flow straight into the DB upsert):
      - name (str): from `name` frontmatter key, falling back to the
        directory name (so a skill without an explicit name still gets one).
      - environment (str): from `environment` key, default `default_env`.
      - user_invocable (bool): from `user_invocable` key, default True.
      - autonomy (str): from `autonomy` key, default "manual".
      - description (Optional[str]): from `description` key.
      - frontmatter (dict): the raw parsed YAML block.
      - path (str): absolute path to the SKILL.md file.
    """
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    m = _FRONTMATTER_RE.search(content)
    if not m:
        return None

    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        return None

    if not isinstance(meta, dict):
        return None

    name = meta.get("name") or path.parent.name
    return {
        "name": str(name),
        "environment": str(meta.get("environment") or default_env),
        "user_invocable": bool(meta.get("user_invocable", True)),
        "autonomy": str(meta.get("autonomy") or "manual"),
        "description": meta.get("description"),
        "frontmatter": meta,
        "path": str(path),
    }


def scan_all(
    user_dir: Path,
    project_dir: Path | None = None,
    max_skills: int = MAX_SKILLS,
) -> list[dict]:
    """Scan the user + project skill roots and return parsed dicts.

    `default_env` for parse_skill is set per-root:
      - user_dir   -> "personal"
      - project_dir -> "project"
    The scanner respects an explicit `environment` key in the frontmatter
    over the default.

    Caps total results at `max_skills` (Pitfall 5 defense). When the cap
    is reached, returns immediately without scanning further roots.
    """
    out: list[dict] = []
    for root, env in [(user_dir, "personal"), (project_dir, "project")]:
        if root is None:
            continue
        for f in find_skill_files(root):
            if len(out) >= max_skills:
                return out
            parsed = parse_skill(f, default_env=env)
            if parsed is None:
                # Silently skip unparseable files — caller treats absence
                # as "not present" rather than as an error.
                continue
            out.append(parsed)
    return out
