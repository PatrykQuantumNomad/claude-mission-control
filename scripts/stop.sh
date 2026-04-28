#!/usr/bin/env bash
# SETUP-03 (stop): bootout all 4 Mission Control daemons under launchd.
# Falls back to launchctl unload when bootout fails (Pitfall P1).
#
# Invoked by cc stop when present at $ROOT/bin/stop.sh.
set -euo pipefail

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

for L in com.cmc.server com.cmc.dispatcher com.cmc.telegram-notifier com.cmc.telegram-handler; do
    launchctl bootout "gui/$UID/$L" 2>/dev/null \
        || launchctl unload "$LAUNCH_AGENTS/$L.plist" 2>/dev/null \
        || echo "(skip) $L not loaded"
done
echo "✓ stop complete"
