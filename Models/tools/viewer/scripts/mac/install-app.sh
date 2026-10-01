#!/usr/bin/env bash
# Installs Semantic Model Viewer as an always-on Mac app:
#   - a LaunchAgent that serves this viewer folder and restarts it if it ever dies
#   - an app icon in ~/Applications you can drag to the Dock
#
# The app window uses its OWN, separate Chrome profile (never your regular
# browsing profile) so it never picks up - or leaves behind - unrelated
# browsing data, and clicking the icon again reuses that one window instead
# of piling up new ones.
#
# Usage:
#   Models/tools/viewer/scripts/mac/install-app.sh [port]
# Default port is 8931.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(cd "$HERE/../.." && pwd)"
PORT="${1:-8931}"
LABEL="com.smv.viewer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="$HOME/Applications/Semantic Model Viewer.app"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

PYBIN="$(command -v python3 || true)"
if [ -z "$PYBIN" ]; then
  echo "python3 not found. Install it (e.g. 'brew install python3') and re-run this script." >&2
  exit 1
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  BROWSER_APP="Google Chrome"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  BROWSER_APP="Microsoft Edge"
else
  BROWSER_APP=""
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Applications" "$PROFILE_DIR"

# plistlib escapes paths containing XML characters (for example '&').
"$PYBIN" - "$PLIST" "$LABEL" "$PYBIN" "$PORT" "$VIEWER_DIR" <<'PYPLIST'
import plistlib
import sys
path, label, python, port, viewer = sys.argv[1:]
if not port.isdigit() or not 1 <= int(port) <= 65535:
    raise SystemExit("Port must be between 1 and 65535")
with open(path, "wb") as handle:
    plistlib.dump({
        "Label": label,
        "ProgramArguments": [python, "-m", "http.server", port,
                             "--bind", "127.0.0.1", "--directory", viewer],
        "RunAtLoad": True,
        "KeepAlive": True,
        "StandardOutPath": "/tmp/smv-viewer.log",
        "StandardErrorPath": "/tmp/smv-viewer.log",
    }, handle)
PYPLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

# Fail before opening a browser if startup failed or another service owns the port.
"$PYBIN" - "$PORT" "$VIEWER_DIR/index.html" <<'PYREADY'
import pathlib
import sys
import time
import urllib.request
port, index = sys.argv[1:]
expected = pathlib.Path(index).read_bytes()
for attempt in range(25):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/index.html", timeout=1) as response:
            if response.status == 200 and response.read() == expected:
                break
    except OSError:
        pass
    time.sleep(0.2)
else:
    raise SystemExit(f"Viewer did not start on port {port}, or another service owns it. Check /tmp/smv-viewer.log or choose another port.")
PYREADY

rm -rf "$APP"

# The applet body: if our dedicated Chrome profile is already running, just
# bring it forward (no duplicate window); otherwise launch it fresh. Checking
# by profile path - not just "is Chrome running" - is what keeps this
# separate from the user's own, regular Chrome windows.
if [ -n "$BROWSER_APP" ]; then
  osacompile -o "$APP" <<APPLESCRIPT
set profileDir to "$PROFILE_DIR"
set alreadyRunning to (do shell script "pgrep -f " & quoted form of profileDir & " >/dev/null 2>&1 && echo yes || echo no") is "yes"
if alreadyRunning then
	tell application "$BROWSER_APP" to activate
else
	do shell script "open -na '$BROWSER_APP' --args --user-data-dir=" & quoted form of profileDir & " --app=http://localhost:$PORT --new-window"
end if
APPLESCRIPT
else
  osacompile -o "$APP" <<APPLESCRIPT
do shell script "open http://localhost:$PORT"
APPLESCRIPT
fi

cp "$HERE/SMV.icns" "$APP/Contents/Resources/applet.icns"
touch "$APP"

echo "Installed."
echo "  Server:  http://localhost:$PORT (auto-starts at login, restarts if it ever stops)"
echo "  App:     $APP"
echo "  Profile: $PROFILE_DIR (separate from your everyday Chrome - safe to delete any time)"
echo "Drag it from ~/Applications to your Dock, or open it now:"
open "$APP"
