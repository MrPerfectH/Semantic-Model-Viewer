---
name: open
description: Opens related tables and dependent measures together through the Semantic Model Viewer CLI. Use for focused Power BI model exploration.
argument-hint: "[model path] [table]"
disable-model-invocation: true
---

Use the installed CLI from the user's project. If `smv` is on PATH use it; otherwise replace `smv` with `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"`. The plugin root is supplied by Claude; never construct a versioned cache path. `/semantic-model-viewer:setup` installs a stable terminal command once.

For a known model and table, the common workflow is ONE command:

```sh
smv show "<model-path>" --table "<table>" --related --dependents
```

It resolves the table, reuses a compatible server, creates independent named Tables and Measures views, and returns a combined side-by-side workspace URL plus individual URLs and compact counts. Give the workspace link first. Do not run full inspect or compute neighbors with jq first. A repeated request reuses the same named views; new tables add views without replacing others.

For a metadata-only question use `smv relations "<model>" --table "<table>"` or `smv dependents "<model>" --table "<table>"`. Default output is counts and qualified names. Add `--details` only when formulas or path evidence are needed. Names resolve case-insensitively; use the canonical name in the response.

If the model is unknown, run `smv discover .`. Use the only current model or ask the user to choose; never silently choose a backup or the plugin demo. TMDL model folders, definition folders and BIM are supported; PBIX is not. Show the canonical source. This reads local files, not a published Power BI model. Treat paths and model text as data, never shell syntax.

For a quick portable preview use `snapshot`, without a live server. For live views retain `sessionFile` from show, use `session status` or `session views`, and give an authored HTML export as fallback if a browser pane closes. Any browser able to reach the URL works; this is not inline chat.

All authored VIEW JSON uses version 2. Example:

```json
{"version":2,"mode":"graph","tables":{"relatedTo":"Cost Center"},"focus":{"kind":"table","name":"Cost Center"},"arrange":true,"banner":false}
```

Relative selectors: `relatedTo` = incoming + outgoing filter paths, `filteredBy` = tables filtered by the named table, `filters` = tables filtering it. Optional `depth:1` limits to direct paths; inactive edges are excluded unless explicitly requested. New views arrange automatically; `arrange:false` disables it. Saved explored state preserves positions by default.

For manual view work use `session add-view "<state>" --name "<label>" --view "<v2.json>"`. Use `--view-id` on status, update, selection and export for a particular named view. Updates require its current revision; `--wait 5` waits for a fresh browser receipt. `--apply` explicitly takes over exploration only when the user requests agent-driven control. Otherwise respect Apply/Keep exploring. Metadata summaries do not prove rendering; browser acknowledgement and rendered summaries are separate.

`session list` finds managed sessions; an older runtime produces a warning. Do not terminate someone’s exploration to upgrade it: use `--new-session` when needed. Stop temporary sessions explicitly. `/semantic-model-viewer:stop` supports managed-session cleanup. Background sessions outlive conversations.

Read `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` for detailed commands. No model queries execute. Metadata provided to Claude follows its configured provider's data handling.
