"""Render telegram-notifier.plist OR telegram-handler.plist.

Mirrors cmc.dispatcher.plist_render (string.Template, NOT Jinja2). The .j2
suffix is convention only — adding Jinja2 just for 3 substitutions would
inflate the runtime dependency graph.

install.sh invokes this via the CLI entry below:
    python -m cmc.telegram.plist_render --variant notifier <python_path> <repo_root>
    python -m cmc.telegram.plist_render --variant handler  <python_path> <repo_root>

Output is written to ~/Library/LaunchAgents/com.cmc.telegram-notifier.plist
and com.cmc.telegram-handler.plist by install.sh.

Pitfall reminder: TELEGRAM_BOT_TOKEN is intentionally absent from the
templates' EnvironmentVariables. install.sh writes it to
~/.command-centre/.env which the daemons load via cmc.config.Settings.
Baking the token into a plist would persist it in plain text on disk
inside ~/Library.
"""

from importlib.resources import files
from pathlib import Path
from string import Template

_VARIANTS = {
    "notifier": "com.cmc.telegram-notifier.plist.j2",
    "handler": "com.cmc.telegram-handler.plist.j2",
}


def render_plist(
    variant: str,
    python_path: str | Path,
    repo_root_path: str | Path,
) -> str:
    """Render the LaunchAgent plist for the given variant.

    Args:
        variant: 'notifier' (oneshot, StartInterval=30) or 'handler'
                 (long-running, KeepAlive=true).
        python_path: absolute path to the venv python interpreter
                     (NOT /usr/bin/python3 — TELE-07 requirement; the system
                     python lacks the cmc package).
        repo_root_path: absolute path to the repo root for WorkingDirectory
                        + StandardOut/ErrorPath log placement.

    Returns:
        XML plist as a string. Caller writes to
        ~/Library/LaunchAgents/com.cmc.telegram-{variant}.plist.

    Raises:
        ValueError: when `variant` is not 'notifier' or 'handler'.
    """
    if variant not in _VARIANTS:
        raise ValueError(
            f"unknown variant {variant!r}; expected one of {list(_VARIANTS)}"
        )
    # absolute() (NOT resolve()) — resolve() follows the venv python symlink
    # into homebrew's Cellar, which has no `cmc` module. See app/plist_render.py.
    py = Path(python_path).absolute()
    rr = Path(repo_root_path).absolute()
    tmpl_text = (
        files("cmc.telegram.templates") / _VARIANTS[variant]
    ).read_text()
    return Template(tmpl_text).safe_substitute(
        python_path=str(py),
        python_path_dir=str(py.parent),
        repo_root=str(rr),
    )


def main() -> None:
    """CLI entry: `python -m cmc.telegram.plist_render --variant notifier <python> <root>`."""
    import argparse
    import sys

    ap = argparse.ArgumentParser(
        prog="cmc.telegram.plist_render",
        description="Render a launchd plist for the Telegram notifier or handler.",
    )
    ap.add_argument("--variant", choices=list(_VARIANTS.keys()), required=True)
    ap.add_argument("python_path")
    ap.add_argument("repo_root")
    args = ap.parse_args()
    sys.stdout.write(render_plist(args.variant, args.python_path, args.repo_root))


if __name__ == "__main__":
    main()
