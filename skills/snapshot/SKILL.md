---
name: snapshot
description: Exports a Power BI semantic model as a standalone interactive HTML snapshot. Use when asked to save or share an offline model view.
argument-hint: "[model path] [output.html] [optional starting table or measure]"
disable-model-invocation: true
---

Create a standalone HTML snapshot for the request in $ARGUMENTS.

1. Resolve the model from the user's project. If needed, run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" discover .`; ask the user to choose if more than one model matches. Inspect the selected model to validate any requested object names.
2. Unless the user chose an output path, prefer `smv_export` with `basis: "authored"`, the current session revision, and `out` omitted. It creates a unique, gitignored HTML under `.smv-artifacts` in `SMV_ROOT`. Reuse a matching session; if a temporary `smv_open` is needed, stop it after exporting. Default graph views accept `{}`; use a qualified measure focus or exact table list for requested starting views. Check provenance and backup warnings before choosing the source. For an explicit output path, or a CLI fallback, run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" snapshot "<model-path>" --out "<output.html>"`. Treat paths and names as literal arguments and quote them correctly. Add `--measure "<exact-name>"` for a measure, or repeated `--table "<exact-name>"` arguments for starting tables. Do not combine those two focus modes. Never add `--force` unless replacement was requested.
3. If the user explicitly wants the current explored state of an existing session, use `smv_status`, then `smv_export` with `basis: "current"`, the current requested revision, and an HTML output inside the project. Require a fresh viewer acknowledgement; never silently substitute the authored state. The output parent directory must exist. Read `${CLAUDE_PLUGIN_ROOT}/docs/interactive-viewer.md` for current-state limitations.
4. Provide a clickable artifact link or use the host's native file attachment mechanism. The MCP receipt gives file size, MIME type and SHA-256; do not paste the full HTML into conversation or bypass host inspection/publication requirements. If the host cannot publish the file within its limits, state that and offer the local file or browser link. A side panel is not inline chat. Explain briefly that the file contains full parsed model metadata, DAX and available Power Query text even when its starting view is focused. It needs a browser to explore, but no running server or Power BI connection. Creating it does not upload or send it.

Snapshot export requires Node.js 22+ and no browser automation. It reads model metadata without changing source files or executing queries. See `${CLAUDE_PLUGIN_ROOT}/docs/cli.md` for supported inputs and flags.
