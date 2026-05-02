"""Render com.cmc.server.plist.j2 with per-machine paths.

Mirrors the dispatcher/telegram plist_render pattern (string.Template, NOT
Jinja2). The .j2 suffix is convention only — adding Jinja2 just for 3
substitutions would inflate the runtime dependency graph.

install.sh invokes this via the CLI entry below:
    python -m cmc.app.plist_render <python_path> <repo_root>

Output is written to ~/Library/LaunchAgents/com.cmc.server.plist by
install.sh.

Pitfall reminder: secrets are intentionally absent from the template's
EnvironmentVariables. The plist only sets CMC_ENV=install; Settings then reads
~/.command-centre/.env at process startup. Baking secrets into a plist would
persist them in plain text on disk inside ~/Library.
"""

from importlib.resources import files
from pathlib import Path
from string import Template


def render_plist(python_path: str | Path, repo_root_path: str | Path) -> str:
    """Render the LaunchAgent plist for the FastAPI server (uvicorn).

    Args:
        python_path: absolute path to the venv python interpreter (used to
                     locate the sibling `uvicorn` console-script in the same
                     bin directory; NOT /usr/bin/python3).
        repo_root_path: absolute path to the install/repo root for
                        WorkingDirectory + StandardOut/ErrorPath log
                        placement.

    Returns:
        XML plist as a string. Caller writes to
        ~/Library/LaunchAgents/com.cmc.server.plist.
    """
    # NOTE: use absolute() (NOT resolve()) so we keep the user-supplied
    # bin directory. resolve() follows symlinks and drops us into homebrew's
    # Cellar/.../Frameworks/.../bin, where the uvicorn console-script lives
    # in a different bin (the homebrew/venv `bin/` that holds the symlink).
    # The plist needs `${python_path_dir}/uvicorn` to point at the SIBLING
    # console-script of the python binary the operator passed in.
    py = Path(python_path).absolute()
    rr = Path(repo_root_path).absolute()
    tmpl_text = (
        files("cmc.app.templates") / "com.cmc.server.plist.j2"
    ).read_text()
    return Template(tmpl_text).safe_substitute(
        python_path=str(py),
        python_path_dir=str(py.parent),
        repo_root=str(rr),
    )


def main() -> None:
    """CLI entry: `python -m cmc.app.plist_render <python> <root>`."""
    import argparse
    import sys

    ap = argparse.ArgumentParser(
        prog="cmc.app.plist_render",
        description="Render a launchd plist for the FastAPI server (uvicorn).",
    )
    ap.add_argument("python_path")
    ap.add_argument("repo_root")
    args = ap.parse_args()
    sys.stdout.write(render_plist(args.python_path, args.repo_root))


if __name__ == "__main__":
    main()
