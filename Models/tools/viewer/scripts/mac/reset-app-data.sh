#!/usr/bin/env bash
# Clears the app's own saved models/layouts (the isolated Chrome profile
# install-app.sh created) without removing the app icon or the login
# service. Use this to start over from a clean state - it only touches the
# app's own profile, never your regular Chrome.
set -euo pipefail
PROFILE_DIR="$HOME/Library/Application Support/Semantic Model Viewer/chrome-profile"

if pgrep -f "$PROFILE_DIR" >/dev/null 2>&1; then
  echo "Quit the Semantic Model Viewer app window first (its browser process is still running), then re-run this script." >&2
  exit 1
fi

rm -rf "$PROFILE_DIR"
echo "Cleared. Next time you open it, it will show 'No model selected' until you choose one."
