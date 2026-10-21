---
name: snapshot
description: Exports a Power BI model as standalone interactive HTML using the Semantic Model Viewer CLI. Use when asked to save or share an offline model view.
argument-hint: "[model path] [output.html] [optional starting table or measure]"
disable-model-invocation: true
---

Resolve the installed executable with `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" --where` (the workspace helper also returns `cliPath`). Use that path or `${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs`; never construct a plugin cache path with a version number.

Create an HTML snapshot for $ARGUMENTS using shell commands from the user's project.

1. Resolve the model with `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" discover .` if needed. Ask the user to choose among matches and confirm backup-looking paths. Use `inspect "<model>"` to validate requested object names. This reads local metadata, not the published model.
2. Use the user's explicit output path, or run `node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs"` for a unique `newExportFile` under the gitignored `.smv-artifacts` directory. Quote paths as literal arguments. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" snapshot "<model>" --out "<output.html>"`. Add `--measure "<exact-name>"` for a measure, or repeat `--table "<exact-name>"` for starting tables. Do not combine the focus modes or add `--force` unless replacement was requested. A normal snapshot needs no live server.
3. If the user explicitly wants an existing session's explored state, run `session status "<session-file>" --json`, then `session export "<session-file>" --basis current --revision <current-revision> --out "<output.html>" --json` with the same CLI. Use a client ID if needed. A fresh viewer acknowledgement is required; never silently substitute authored state. Use `--basis authored` only when that is the requested basis.
4. Provide a clickable file link or a supported host attachment. Do not paste megabytes of HTML into conversation or bypass inspection/publication requirements. If a host cannot publish the file, explain its limit and offer an allowed local file/browser link. A side panel is not inline chat. Explain that the HTML contains the full parsed metadata, DAX and available Power Query text even when focused.

Snapshots need Node.js 22+ and a browser to explore; exporting HTML requires no extra packages or browser automation. Source files are unchanged and no model queries run. See `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` and `${CLAUDE_PLUGIN_ROOT}/docs/cli.md`.
