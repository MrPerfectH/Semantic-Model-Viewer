#!/usr/bin/env bash
# Installs Semantic Model Viewer as a Mac app:
#   - an app icon in ~/Applications you can drag to the Dock
#   - it opens this viewer folder's index.html directly from disk, so there is
#     no server, no Python and nothing running in the background
#
# The app window uses its OWN, separate Chrome/Edge profile (never your regular
# browsing profile) so it never picks up - or leaves behind - unrelated
# browsing data, and clicking the icon again reuses that one window instead
# of piling up new ones. Your saved models and layouts live in that profile.
#
# Usage:
#   Models/tools/viewer/scripts/mac/install-app.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(cd "$HERE/../.." && pwd)"
APP="$HOME/Applications/Semantic Model Viewer.app"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

# Earlier versions ran a Python server at login; it is no longer needed.
OLD_PLIST="$HOME/Library/LaunchAgents/com.smv.viewer.plist"
if [ -f "$OLD_PLIST" ]; then
  launchctl unload "$OLD_PLIST" 2>/dev/null || true
  rm -f "$OLD_PLIST"
  echo "Removed the old background server (no longer needed)."
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  BROWSER_APP="Google Chrome"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  BROWSER_APP="Microsoft Edge"
else
  BROWSER_APP=""
  echo "Chrome or Edge was not found, so the app will open in your default browser." >&2
  echo "Install Chrome or Edge and re-run this script to open model folders directly and use Refresh." >&2
fi

# file:// URL of index.html; percent-encode the characters that would break it
encode() { local s="$1"; s="${s//%/%25}"; s="${s// /%20}"; s="${s//#/%23}"; s="${s//\?/%3F}"; s="${s//\"/%22}"; s="${s//\'/%27}"; printf '%s' "$s"; }
URL="file://$(encode "$VIEWER_DIR/index.html")"

mkdir -p "$HOME/Applications" "$PROFILE_DIR"
rm -rf "$APP"

# The applet body: if our dedicated profile is already running, just bring it
# forward (no duplicate window); otherwise launch it fresh. Checking by profile
# path - not just "is Chrome running" - is what keeps this separate from the
# user's own, regular Chrome windows.
if [ -n "$BROWSER_APP" ]; then
  osacompile -o "$APP" <<APPLESCRIPT
set profileDir to "$PROFILE_DIR"
set alreadyRunning to (do shell script "pgrep -f " & quoted form of profileDir & " >/dev/null 2>&1 && echo yes || echo no") is "yes"
if alreadyRunning then
	tell application "$BROWSER_APP" to activate
else
	do shell script "open -na '$BROWSER_APP' --args --user-data-dir=" & quoted form of profileDir & " --no-first-run --no-default-browser-check --app=" & quoted form of "$URL" & " --new-window"
end if
APPLESCRIPT
else
  osacompile -o "$APP" <<APPLESCRIPT
do shell script "open " & quoted form of "$URL"
APPLESCRIPT
fi

cp "$HERE/SMV.icns" "$APP/Contents/Resources/applet.icns"
touch "$APP"

echo "Installed: $APP"
echo "  Opens:   $VIEWER_DIR/index.html"
echo "  Profile: $PROFILE_DIR (separate from your everyday browser)"
echo "Drag it from ~/Applications to your Dock. To update, run 'git pull' in the repo and reopen the app."
open "$APP"
