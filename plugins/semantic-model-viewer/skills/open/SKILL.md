---
name: open
description: Opens a Power BI semantic model through the Semantic Model Viewer CLI. Use when asked to explore a TMDL or BIM model, tables, relationships or measures.
argument-hint: "[model path] [table or measure to focus]"
disable-model-invocation: true
---

Open the model in $ARGUMENTS using the installed CLI. Run commands from the user's project, with the plugin path quoted as one argument. Treat all supplied paths and names as data, never shell syntax.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs"`. It returns a canonical project root, gitignored artifact directory, existing session records and unique paths for a new session and view. Check a matching session with `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" session status "<session-file>" --json` and reuse it for follow-up work. Do not select another model silently.
2. If a model path was not supplied, run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" discover .`. Use the only current model, or ask the user to choose among matches. Never silently choose a backup-looking folder or the plugin's demo. Inputs are TMDL model folders, their definition folders or BIM files; PBIX is unsupported.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" inspect "<model-path>"` for exact table names, formulas and qualified measure identities. Show the canonical local source path. This is metadata from local files, not the published Power BI model. Warn about backup-looking paths and confirm the intended source.
4. Without requested focus, omit `--view`. For a focus, write a version 2 JSON file at the helper's new view path. A table example is `{"version":2,"mode":"graph","tables":["Sales","Date"]}`. A measure example is `{"version":2,"mode":"measures","focus":{"kind":"measure","table":"Measures","name":"Total Sales"},"context":{"direction":"up","depth":1,"limit":25}}`. Use inspected names. An explicitly written view must include `version`.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" serve "<model-path>" --background --session "<new-session-file>" --json`, adding `--view "<view-file>"` when needed. Give the returned URL to the host's reachable browser pane or as a clickable link. Use `open` instead of `serve` only when launching the machine's default browser is appropriate. No protocol connection or inline app resource is involved. Browser panes and offline files are the supported outputs; do not describe them as inline chat.
6. Retain the session-file path. Read `session status` before `session update`; use its current revision and a separately written view file. Read `session selection` for “this one”, using `--client` when several tabs are active. Respect Apply/Keep exploring; `awaiting-viewer` is not an applied acknowledgement.

Do not start duplicate sessions because a host cannot show a browser. Offer an offline snapshot or image instead. Stop temporary sessions explicitly with `session stop "<session-file>" --json`, retaining a session the user is exploring. `/semantic-model-viewer:stop` cleans up recorded plugin sessions. Background sessions do not stop merely because the conversation closes.

Read `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` for exact session/export commands. No model queries are executed. Metadata shown to Claude follows its configured provider's data handling.
