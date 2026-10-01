#!/usr/bin/env bash
# Starts the local app (scripts/serve.py) if it is not already running, then opens the
# viewer as its own window. The app icon that install-app.sh creates runs this script.
#
# The window uses its OWN, separate Chrome/Edge profile (never your regular browsing
# profile), and opening it again brings the existing window forward instead of piling
# up new ones. The server listens on this computer only and stops by itself a few
# minutes after the window is closed.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="$(cd "$HERE/../.." && pwd)"
PORT="${SMV_PORT:-8931}"
URL="http://localhost:$PORT"
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"
LOG="/tmp/smv-viewer.log"

alert() { osascript -e "display alert \"Semantic Model Viewer\" message \"$1\"" >/dev/null 2>&1 || echo "$1" >&2; }
ping() { curl -s --max-time 1 "http://127.0.0.1:$PORT/api/ping" 2>/dev/null | grep -q '"ok": *true'; }

if ! ping; then
  PYBIN="$(command -v python3 || true)"
  # /usr/bin/python3 is only a stub until the Command Line Tools are installed.
  if [ -z "$PYBIN" ] || ! "$PYBIN" -c 'import sys' >/dev/null 2>&1; then
    alert "Python 3 is needed to run the viewer. Install it from python.org (or run xcode-select --install in Terminal), then open the app again."
    exit 1
  fi
  nohup "$PYBIN" "$VIEWER_DIR/scripts/serve.py" --port "$PORT" --idle-exit 180 >"$LOG" 2>&1 &
  for _ in $(seq 1 50); do ping && break; sleep 0.2; done
  if ! ping; then
    alert "The viewer could not start on port $PORT. Details are in $LOG."
    exit 1
  fi
fi

if [ -d "/Applications/Google Chrome.app" ]; then BROWSER_APP="Google Chrome"
elif [ -d "/Applications/Microsoft Edge.app" ]; then BROWSER_APP="Microsoft Edge"
else BROWSER_APP=""; fi

if [ -n "$BROWSER_APP" ]; then
  mkdir -p "$PROFILE_DIR"
  if pgrep -f "$PROFILE_DIR" >/dev/null 2>&1; then
    osascript -e "tell application \"$BROWSER_APP\" to activate" >/dev/null 2>&1
  else
    open -na "$BROWSER_APP" --args --user-data-dir="$PROFILE_DIR" --no-first-run --no-default-browser-check --app="$URL" --new-window
  fi
else
  open "$URL"
fi
