#!/usr/bin/env bash
# Installs Semantic Model Viewer as a Mac app:
#   - an app icon in ~/Applications you can drag to the Dock
#   - it runs scripts/mac/launch.sh: starts the local app (scripts/serve.py, which reads
#     model folders for the viewer so the browser never asks for folder permission) and
#     opens the viewer window. The local app stops itself when the window is closed.
#
# Needs Python 3 (python.org, or `xcode-select --install`).
#
# The app window uses its OWN, separate Chrome/Edge profile (never your regular
# browsing profile) so it never picks up - or leaves behind - unrelated
# browsing data. Clicking the icon opens a viewer window, even if the browser is
# still running in the background. Your saved models and layouts live in that profile.
#
# Usage:
#   Models/tools/viewer/scripts/mac/install-app.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(cd "$HERE/../.." && pwd)"
APP="$HOME/Applications/Semantic Model Viewer.app"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

# Earlier versions ran a server at login; the app now starts on demand.
OLD_PLIST="$HOME/Library/LaunchAgents/com.smv.viewer.plist"
if [ -f "$OLD_PLIST" ]; then
  launchctl unload "$OLD_PLIST" 2>/dev/null || true
  rm -f "$OLD_PLIST"
  echo "Removed the old background server (no longer needed)."
fi

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys' >/dev/null 2>&1; then
  echo "Python 3 was not found. Install it from https://python.org (or run: xcode-select --install), then open the app." >&2
fi
if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "/Applications/Microsoft Edge.app" ]; then
  echo "Chrome or Edge was not found, so the app will open in your default browser." >&2
fi

mkdir -p "$HOME/Applications" "$PROFILE_DIR"
rm -rf "$APP"
chmod +x "$HERE/launch.sh"

# The applet just runs launch.sh, which starts the local app and opens the window.
osacompile -o "$APP" <<APPLESCRIPT
do shell script quoted form of "$HERE/launch.sh"
APPLESCRIPT

cp "$HERE/SMV.icns" "$APP/Contents/Resources/applet.icns"
touch "$APP"
# Copying the icon changed the bundle after osacompile signed it; sign it again (ad hoc).
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true

echo "Installed: $APP"
echo "  Runs:    $HERE/launch.sh  (local app on http://localhost:8931, this computer only)"
echo "  Profile: $PROFILE_DIR (separate from your everyday browser)"
echo "Drag it from ~/Applications to your Dock. To update, run 'git pull' in the repo and reopen the app."
open "$APP"
