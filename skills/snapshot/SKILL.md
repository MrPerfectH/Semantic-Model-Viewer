---
name: snapshot
description: Exports a Power BI semantic model as a standalone interactive HTML snapshot. Use when asked to save or share an offline model view.
argument-hint: "[model path] [output.html] [optional starting table or measure]"
disable-model-invocation: true
---

Create a standalone HTML snapshot for the request in $ARGUMENTS.

1. Resolve the model from the user's project. If needed, run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" discover .`; ask the user to choose if more than one model matches. Inspect the selected model to validate any requested object names.
2. Use the user's output path, or choose a new descriptive file under `artifacts/` in their project. Treat paths and names as literal arguments and quote them correctly. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" snapshot "<model-path>" --out "<output.html>"`. Add `--measure "<exact-name>"` for a measure, or repeated `--table "<exact-name>"` arguments for starting tables. Do not combine those two focus modes. Never add `--force` unless replacement was requested.
3. If the user explicitly wants the current explored state of an existing session, use `smv_status`, then `smv_export` with `basis: "current"`, the current requested revision, and an HTML output inside the project. Require a fresh viewer acknowledgement; never silently substitute the authored state. The output parent directory must exist. Read `${CLAUDE_PLUGIN_ROOT}/docs/interactive-viewer.md` for current-state limitations.
4. Provide a clickable artifact link. Explain briefly that the file contains the full parsed model metadata, DAX and available Power Query text even when its starting view is focused. It needs a browser to explore, but no running viewer server or Power BI connection. Creating it does not upload it or send it to anyone.

Snapshot export requires Node.js 22+ and no browser automation. It reads model metadata without changing source files or executing queries. See `${CLAUDE_PLUGIN_ROOT}/docs/cli.md` for supported inputs and flags.
