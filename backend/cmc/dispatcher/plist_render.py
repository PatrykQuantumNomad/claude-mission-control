"""DISP-12: render the launchd LaunchAgent plist with per-machine paths.

Runs at install time (manual or scripted via Phase 9). Output is written to
~/Library/LaunchAgents/com.cmc.dispatcher.plist by the operator after
inspection.

Why string.Template (not Jinja2): adding Jinja2 just for a few placeholders
would inflate the runtime dependency graph. The template only needs three
substitutions (python_path, python_path_dir, repo_root); string.Template's
$var syntax covers it without escaping headaches inside the XML.

The template file uses the .j2 suffix as a CONVENTION — it is NOT processed
by Jinja2. (Renaming to .tmpl would be cleaner; left as .j2 to match the
file_modified contract in the plan.)

Pitfall 8 reminder: ANTHROPIC_API_KEY is intentionally absent from the
template's EnvironmentVariables. Operators set it via `launchctl setenv` if
the skill router needs it; baking it into the plist would persist the key in
plain text on disk inside ~/Library.
"""

from importlib.resources import files
from pathlib import Path
from string import Template


def render_plist(python_path: str | Path, repo_root_path: str | Path) -> str:
    """Render the LaunchAgent plist with the given paths.

    Args:
        python_path: absolute path to the venv python interpreter
                     (NOT /usr/bin/python3 — DISP-12 requirement; the system
                     python lacks the cmc package).
        repo_root_path: absolute path to the repo root for WorkingDirectory
                        + StandardOut/ErrorPath log placement.

    Returns:
        XML plist as a string. Caller writes to
        ~/Library/LaunchAgents/com.cmc.dispatcher.plist.

    Notes:
        - safe_substitute is used (not substitute) so missing variables do not
          raise; they pass through as literals. In practice all three vars
          are always provided, but defensive substitution avoids brittle
          installer scripts.
        - Path.absolute() is used (NOT resolve()) so we keep the user-supplied
          venv bin directory. resolve() follows symlinks into homebrew's Cellar,
          which then defeats the venv's `cmc` import path.
    """
    py = Path(python_path).absolute()
    rr = Path(repo_root_path).absolute()
    tmpl_text = (
        files("cmc.dispatcher.templates") / "com.cmc.dispatcher.plist.j2"
    ).read_text()
    return Template(tmpl_text).safe_substitute(
        python_path=str(py),
        python_path_dir=str(py.parent),
        repo_root=str(rr),
    )


def main() -> None:
    """CLI entry: `python -m cmc.dispatcher.plist_render <python> <root>`.

    Phase-9 deviation against Plan 08-02 (additive, non-behavior-breaking):
    existing `from cmc.dispatcher.plist_render import render_plist` callers
    are unaffected. The retrofit gives Phase 9 install.sh a uniform
    `python -m cmc.<x>.plist_render` CLI surface across all four renderers
    (server, dispatcher, telegram-notifier, telegram-handler).
    """
    import sys

    if len(sys.argv) != 3:
        print(
            "usage: python -m cmc.dispatcher.plist_render <python_path> <repo_root>",
            file=sys.stderr,
        )
        sys.exit(2)
    sys.stdout.write(render_plist(sys.argv[1], sys.argv[2]))


if __name__ == "__main__":
    main()
