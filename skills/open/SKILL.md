---
name: open
description: Opens a Power BI semantic model in the actual interactive Semantic Model Viewer. Use when asked to open or visually explore a TMDL or BIM model, its tables, or a measure.
argument-hint: "[model path] [table or measure to focus]"
disable-model-invocation: true
---

Open the model requested in $ARGUMENTS using the existing viewer, with the narrowest useful initial focus.

1. Treat arguments as user input, never as shell syntax. If no model path was provided, run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" discover .` from the user's project. Use the only discovered model, or ask the user to choose if several match. Do not silently use the plugin's demo. Inputs are TMDL model folders, their definition folders, or BIM files; PBIX is unsupported.
2. Use this plugin's `smv_inspect` MCP tool on the selected model to obtain exact table names, qualified measures, relationship identifiers and formulas. The server is `plugin:semantic-model-viewer:viewer`; tool names may be prefixed by the host. Paths must be inside the project where Claude Code started.
3. Call `smv_open` with the model path and a version 2 view. For tables, use `{"version":2,"mode":"graph","tables":["Sales","Date"]}` with actual names. For a measure, use `{"version":2,"mode":"measures","focus":{"kind":"measure","table":"Measures","name":"Total Sales"},"context":{"direction":"up","depth":1,"limit":25}}` with its inspected home table and name. Without a requested focus, use a graph view of the inspected tables. Do not invent annotations or diagnoses.
4. Present the returned local URL as a clickable link. Use the host's browser if available and reachable. Use the provided MCP App only when the response reports inline support; a terminal session ordinarily uses a separate browser. Opening the MCP session starts a local server, not the system browser. Do not promise inline rendering.
5. Retain the returned session ID and revision for follow-up questions. Read `smv_selection` for “this one”; use a client ID when multiple tabs are active. Before `smv_update`, read `smv_status` and pass the current revision. An update is requested until the viewer acknowledges it; respect Apply/Keep exploring.

If MCP is unavailable, read `${CLAUDE_PLUGIN_ROOT}/docs/interactive-viewer.md` and use the CLI fallback with the absolute plugin CLI path and a session file under the user's project. Report the MCP error. Do not configure a second MCP server automatically. Stop temporary CLI sessions explicitly; MCP sessions stop when their connection closes. Keep a live session available while the user is exploring it.

For portable output, use `/semantic-model-viewer:snapshot`. Models are read without executing DAX, SQL or M. Parsed metadata supplied to Claude is subject to the user's Claude provider settings; local parsing does not mean the conversation stays on the machine.
