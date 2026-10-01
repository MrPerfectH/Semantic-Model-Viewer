#!/usr/bin/env bash
# Undoes install-app.sh: removes the app icon and the app's own (isolated)
# browser profile, including the models and layouts saved in it.
set -euo pipefail
OLD_PLIST="$HOME/Library/LaunchAgents/com.smv.viewer.plist"
APP="$HOME/Applications/Semantic Model Viewer.app"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

launchctl unload "$OLD_PLIST" 2>/dev/null || true
rm -f "$OLD_PLIST"
rm -rf "$APP"
rm -rf "$PROFILE_DIR"
echo "Removed the app icon and the app's own browser profile. The viewer folder itself is untouched."
