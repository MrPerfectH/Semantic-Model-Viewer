#!/usr/bin/env bash
# Undoes install-app.sh: stops the server, removes the LaunchAgent, the app
# icon, and the app's own (isolated) Chrome profile.
set -euo pipefail
LABEL="com.smv.viewer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="$HOME/Applications/Semantic Model Viewer.app"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
rm -rf "$APP"
rm -rf "$PROFILE_DIR"
echo "Removed the LaunchAgent, the app icon, and the app's own Chrome profile. The viewer folder itself is untouched."
