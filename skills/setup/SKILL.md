---
name: setup
description: Installs a stable smv CLI command on the user's PATH that follows Semantic Model Viewer plugin upgrades.
disable-model-invocation: true
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" install` once. This creates a managed `smv` launcher, normally in `~/.local/bin` (Windows: `%LOCALAPPDATA%/SemanticModelViewer/bin`). It resolves Claude's installed plugin registry on each invocation and keeps working when cache versions change. It never overwrites an unrelated command or changes a shell startup file.

Inspect the returned `onPath` field. If true, run `smv --where` to verify resolution. If false, tell the user the returned directory must be added to their user PATH and the terminal reopened; do not claim the command is ready. An explicit `install --bin-dir "<existing-user-PATH-directory>"` can install it directly in a suitable user-owned PATH directory. Do not use a system directory requiring administrator access.

Then demonstrate `smv show "<model>" --table "<table>" --related --dependents` for known model/table arguments. Do not guess or choose a backup model. No MCP or runtime npm packages are installed.
