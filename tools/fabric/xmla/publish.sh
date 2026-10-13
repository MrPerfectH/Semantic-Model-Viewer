#!/usr/bin/env bash
set -euo pipefail
# Build on a maintainer machine; no .NET installation is required by end users.
xmla_dir="$(cd "$(dirname "$0")" && pwd)"
for pair in 'win-x64 win32-x64' 'win-arm64 win32-arm64' 'osx-x64 darwin-x64' 'osx-arm64 darwin-arm64' 'linux-x64 linux-x64' 'linux-arm64 linux-arm64'; do
  read -r rid destination <<< "$pair"
  dotnet publish "$xmla_dir/Smv.Fabric.Xmla.csproj" -c Release -r "$rid" --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "$xmla_dir/publish/$destination"
done
