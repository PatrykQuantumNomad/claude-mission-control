#!/usr/bin/env bash
# SETUP-01: one-command Mission Control installer for macOS.
#
# Order of operations (locked):
#   1. Parse flags (--install / --prefix=PATH / --dry-run)
#   2. Detect Python ≥3.12 (homebrew-bin first, then PATH; reject <3.12 with brew hint)
#   3. Choose mode: install (DEST=~/.command-centre) vs dev (DEST=$REPO_ROOT)
#   4. mkdir layout (bin, logs, data, LaunchAgents)
#   5. Create venv (idempotent)
#   6. pip install backend (-e in dev mode, regular in install mode)
#   7. rsync source files into DEST (install mode only) with Q4 LOCKED excludes
#      (never blow away data/cmc.db on re-install)
#   8. Render 4 launchd plists into ~/Library/LaunchAgents/
#   9. Write the cmc shim (~/.local/bin or /usr/local/bin)
#  10. Copy start.sh + stop.sh into DEST/bin/
#  11. Print next-steps
#
# Idempotent re-runs are safe: venv is reused, rsync skips identical files,
# data/cmc.db is preserved.
#
# Usage:
#   bash scripts/install.sh                 # dev mode (use repo as DEST)
#   bash scripts/install.sh --install       # install to ~/.command-centre
#   bash scripts/install.sh --install --prefix=/tmp/cc-test
#   bash scripts/install.sh --dry-run       # print plan, do nothing

set -euo pipefail

# ---------- args ----------
INSTALL_MODE=0
PREFIX="$HOME/.command-centre"
DRY_RUN=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --install) INSTALL_MODE=1; shift ;;
        --prefix=*) PREFIX="${1#--prefix=}"; INSTALL_MODE=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help)
            echo "Usage: $0 [--install] [--prefix=PATH] [--dry-run]"
            exit 0
            ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

# ---------- detect python ≥3.12 ----------
detect_python() {
    local cand v major minor
    for cand in \
        /opt/homebrew/bin/python3.13 \
        /opt/homebrew/bin/python3.12 \
        /usr/local/bin/python3.13 \
        /usr/local/bin/python3.12 \
        python3.13 \
        python3.12 \
        python3; do
        if command -v "$cand" >/dev/null 2>&1; then
            v="$("$cand" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo 0.0)"
            major="${v%%.*}"
            minor="${v##*.}"
            if [[ "$major" -gt 3 ]] || { [[ "$major" -eq 3 ]] && [[ "$minor" -ge 12 ]]; }; then
                command -v "$cand"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON_BIN="$(detect_python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
    echo "✗ Python ≥3.12 not found." >&2
    echo "  Install with: brew install python@3.13" >&2
    exit 1
fi
echo "✓ Python: $PYTHON_BIN"

# ---------- mode selection ----------
if [[ "$INSTALL_MODE" -eq 1 ]]; then
    DEST="$PREFIX"
    VENV="$DEST/venv"
    echo "✓ Mode: install (DEST=$DEST)"
else
    DEST="$REPO_ROOT"
    VENV="$REPO_ROOT/backend/.venv"
    echo "✓ Mode: dev (DEST=$DEST)"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY-RUN: would create venv at $VENV"
    echo "DRY-RUN: would copy to $DEST"
    echo "DRY-RUN: would render 4 plists in $LAUNCH_AGENTS"
    echo "DRY-RUN: would write cmc shim (and remove any stale cc shim)"
    exit 0
fi

# ---------- layout ----------
mkdir -p "$DEST/bin" "$DEST/logs" "$DEST/data" "$LAUNCH_AGENTS"

# ---------- venv ----------
if [[ ! -x "$VENV/bin/python" ]]; then
    echo "→ Creating venv at $VENV"
    "$PYTHON_BIN" -m venv "$VENV"
else
    echo "✓ venv exists at $VENV"
fi
"$VENV/bin/python" -m pip install --upgrade pip --quiet

# ---------- pip install ----------
if [[ "$INSTALL_MODE" -eq 1 ]]; then
    echo "→ pip install $REPO_ROOT/backend"
    "$VENV/bin/pip" install "$REPO_ROOT/backend" --quiet
else
    echo "→ pip install -e $REPO_ROOT/backend"
    "$VENV/bin/pip" install -e "$REPO_ROOT/backend" --quiet
fi

# ---------- rsync (install mode only) ----------
if [[ "$INSTALL_MODE" -eq 1 ]]; then
    echo "→ rsync $REPO_ROOT/backend → $DEST/backend"
    # Q4 LOCKED excludes; data/cmc.db preserved across re-installs
    rsync -a \
        --exclude='.venv/' --exclude='.git/' --exclude='.planning/' \
        --exclude='tests/' --exclude='node_modules/' \
        --exclude='__pycache__/' --exclude='*.pyc' \
        --exclude='data/cmc.db' \
        "$REPO_ROOT/backend/" "$DEST/backend/"

    if [[ -d "$REPO_ROOT/frontend/dist" ]]; then
        echo "→ rsync $REPO_ROOT/frontend/dist → $DEST/ui/dist"
        rsync -a --delete "$REPO_ROOT/frontend/dist/" "$DEST/ui/dist/"
    fi

    if [[ -d "$REPO_ROOT/skills" ]]; then
        echo "→ rsync $REPO_ROOT/skills → $DEST/skills"
        rsync -a --delete "$REPO_ROOT/skills/" "$DEST/skills/"
    fi

    if [[ -d "$REPO_ROOT/backend/migrations" ]]; then
        echo "→ rsync $REPO_ROOT/backend/migrations → $DEST/migrations"
        rsync -a --delete "$REPO_ROOT/backend/migrations/" "$DEST/migrations/"
    fi

    # .env stub — only created if absent (preserve user-edited .env on re-install)
    if [[ ! -f "$DEST/.env" ]]; then
        cat > "$DEST/.env" <<EOF
# Mission Control config — fill in TELEGRAM_* via \`cmc setup telegram\`
EOF
        echo "✓ Wrote $DEST/.env stub"
    else
        echo "✓ Preserved existing $DEST/.env"
    fi
fi

# ---------- render 4 plists ----------
# Uniform `python -m cmc.<x>.plist_render` form. The dispatcher renderer's
# CLI entry point was retrofitted in Task 1 (additive, non-behavior-breaking).
echo "→ Rendering 4 launchd plists into $LAUNCH_AGENTS"
"$VENV/bin/python" -m cmc.app.plist_render \
    "$VENV/bin/python" "$DEST" > "$LAUNCH_AGENTS/com.cmc.server.plist"
"$VENV/bin/python" -m cmc.dispatcher.plist_render \
    "$VENV/bin/python" "$DEST" > "$LAUNCH_AGENTS/com.cmc.dispatcher.plist"
"$VENV/bin/python" -m cmc.telegram.plist_render --variant notifier \
    "$VENV/bin/python" "$DEST" > "$LAUNCH_AGENTS/com.cmc.telegram-notifier.plist"
"$VENV/bin/python" -m cmc.telegram.plist_render --variant handler \
    "$VENV/bin/python" "$DEST" > "$LAUNCH_AGENTS/com.cmc.telegram-handler.plist"

# ---------- cmc shim ----------
# Renamed from `cc` because /usr/bin/cc (clang) shadows it on macOS.
# Clean up any stale `cc` shim from older installs to avoid confusion.
for stale in "$HOME/.local/bin/cc" "/usr/local/bin/cc"; do
    [[ -f "$stale" ]] && rm -f "$stale" 2>/dev/null && echo "→ removed stale shim $stale"
done

SHIM_TARGET=""
if mkdir -p "$HOME/.local/bin" 2>/dev/null && [[ -w "$HOME/.local/bin" ]]; then
    SHIM_TARGET="$HOME/.local/bin/cmc"
elif [[ -w "/usr/local/bin" ]]; then
    SHIM_TARGET="/usr/local/bin/cmc"
fi
if [[ -n "$SHIM_TARGET" ]]; then
    cp "$REPO_ROOT/scripts/cmc" "$SHIM_TARGET"
    chmod +x "$SHIM_TARGET"
    echo "✓ cmc shim installed at $SHIM_TARGET"
    # Pitfall P7 hint: warn if ~/.local/bin not on PATH
    if [[ "$SHIM_TARGET" == "$HOME/.local/bin/cmc" ]]; then
        case ":$PATH:" in
            *":$HOME/.local/bin:"*) ;;
            *) echo "⚠ $HOME/.local/bin is not on \$PATH; add it to your shell rc"; ;;
        esac
    fi
else
    echo "⚠ Could not write cmc shim — manually run $REPO_ROOT/scripts/cmc" >&2
fi

# ---------- start.sh / stop.sh into DEST/bin ----------
cp "$REPO_ROOT/scripts/start.sh" "$DEST/bin/start.sh"
cp "$REPO_ROOT/scripts/stop.sh"  "$DEST/bin/stop.sh"
chmod +x "$DEST/bin/start.sh" "$DEST/bin/stop.sh"

# ---------- next steps ----------
echo
echo "Next:"
echo "  cmc doctor             # 8-check health report"
echo "  cmc setup otel         # add OTEL env to ~/.claude/settings.json"
echo "  cmc setup telegram     # optional Telegram pager"
echo "  cmc start              # bring up server + dispatcher (+ telegram if configured)"
