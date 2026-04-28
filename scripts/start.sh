#!/usr/bin/env bash
# SETUP-03 (start): bootstrap all 4 Mission Control daemons under launchd.
# Falls back to launchctl load -w when bootstrap fails (Pitfall P1).
#
# Invoked by cmc start when present at $ROOT/bin/start.sh.
set -euo pipefail

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

for L in com.cmc.server com.cmc.dispatcher com.cmc.telegram-notifier com.cmc.telegram-handler; do
    P="$LAUNCH_AGENTS/$L.plist"
    if [[ ! -f "$P" ]]; then
        echo "⚠ skip $L (plist missing at $P)"
        continue
    fi
    launchctl bootstrap "gui/$UID" "$P" 2>/dev/null \
        || launchctl load -w "$P" \
        || echo "✗ failed to load $L"
done
echo "✓ start complete"
