#!/usr/bin/env bash
set -euo pipefail
# Cross-published Mach-O bundles must be signed on macOS before distribution.
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Run this script on macOS after building the Mac helpers.' >&2
  exit 1
fi
xmla_dir="$(cd "$(dirname "$0")" && pwd)"
for architecture in arm64 x64; do
  executable="$xmla_dir/publish/darwin-$architecture/Smv.Fabric.Xmla"
  [[ -f "$executable" ]] || { echo "Missing helper: $executable" >&2; exit 1; }
  codesign --force --sign "${SMV_MAC_SIGN_IDENTITY:--}" "$executable"
  codesign --verify --strict "$executable"
done
