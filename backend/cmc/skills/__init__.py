"""Skill scanner package — walks ~/.claude/skills/ and project skills/.

The scanner is symlink-safe, one-level deep, and capped at MAX_SKILLS=1000
entries.

Public surface:
    find_skill_files(root)          -> Iterator[Path]
    parse_skill(path, default_env)  -> Optional[dict]
    scan_all(user_dir, project_dir) -> list[dict]
    MAX_SKILLS                      -> int constant (1000)
"""
