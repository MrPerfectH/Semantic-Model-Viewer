---
name: snapshot
description: Exports a Power BI model as standalone interactive HTML using the Semantic Model Viewer CLI. Use when asked to save or share an offline model view.
argument-hint: "[model path] [output.html] [optional starting table or measure]"
disable-model-invocation: true
---

Use the package-local CLI: `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv"` on macOS/Linux, or `"${CLAUDE_PLUGIN_ROOT}/bin/smv.cmd"` on Windows. It includes a private runtime in complete release packages; no PATH command, setup skill, npm or separate Node installation is required. In commands below, `smv` means this bundled launcher, never a PATH lookup. Never construct a versioned cache path.

Create an HTML snapshot for $ARGUMENTS using shell commands from the user's project.

1. Resolve the model with `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv" discover .` if needed. Ask the user to choose among matches and confirm backup-looking paths. The export command validates requested names. Do not run full inspect first for known inputs; use `inspect "<model>" --table "<name>"` only for focused clarification. This reads local metadata, not the published model.
2. Use the user's explicit output path, or run `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv" workspace` for a unique `newExportFile` under the gitignored `.smv-artifacts` directory. Quote paths as literal arguments. Run `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv" snapshot "<model>" --out "<output.html>"`. Add `--measure "<exact-name>"` for a measure, or repeat `--table "<exact-name>"` for starting tables. Do not combine the focus modes or add `--force` unless replacement was requested. A normal snapshot needs no live server.
3. If the user explicitly wants an existing session's explored state, run `session status "<session-file>" --json`, then `session export "<session-file>" --basis current --revision <current-revision> --out "<output.html>" --json` with the same CLI. Use a client ID if needed. A fresh viewer acknowledgement is required; never silently substitute authored state. Use `--basis authored` only when that is the requested basis.
4. Provide a clickable file link or a supported host attachment. Do not paste megabytes of HTML into conversation or bypass inspection/publication requirements. If a host cannot publish the file, explain its limit and offer an allowed local file/browser link. A side panel is not inline chat. Explain that the HTML contains the full parsed metadata, DAX and available Power Query text even when focused.

Snapshots need Node.js 22+ and a browser to explore; exporting HTML requires no extra packages or browser automation. Source files are unchanged and no model queries run. See `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` and `${CLAUDE_PLUGIN_ROOT}/docs/cli.md`.

For relative table selection or authored layouts, write a version 2 view and use `smv snapshot "<model>" --view "<v2.json>" --out "<file.html>"`. Example: `{"version":2,"tables":{"relatedTo":"Cost Center"},"arrange":true,"banner":false}`. PNG verification uses the same view with `smv shot`; no live browser session is required, but Chrome/Chromium must be available for PNG capture. Start known-table metadata questions with `relations` or `dependents`, not full inspect.
