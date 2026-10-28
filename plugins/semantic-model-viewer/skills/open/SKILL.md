---
name: open
description: Opens related tables and dependent measures together through the Semantic Model Viewer CLI. Use for focused Power BI model exploration.
argument-hint: "[model path] [table]"
disable-model-invocation: true
---

Use the package-local CLI: `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv"` on macOS/Linux, or `"${CLAUDE_PLUGIN_ROOT}/bin/smv.cmd"` on Windows. In examples below, `smv` means this bundled launcher. Do not look up a global CLI, run setup, or probe the Claude cache. Complete release packages carry their own runtime.

Treat the diagram as the main answer to a modeling question. Present its URL or attach its image/file first, then explain the key arrow or calculation chain in one or two sentences. Do not stop at a JSON inventory when the user wants to understand relationships or dependencies.

Choose the diagram from the question:
- Relationship between two tables: `smv show "<model>" --table "<A>" --with "<B>"`.
- What filters this table: `smv show "<model>" --table "<table>" --related --direction incoming`.
- What this table filters: use `--related --direction outgoing`.
- Which calculations depend on it: use `--dependents`.
- Only for docs or snapshots: `--out "<diagram.png>"` exports a static image and starts no server. Omit `--out` for the live interactive viewer. For a portable diagram, add `--out "<diagram.html>"` or `--out "<diagram.png>"` to one chosen diagram. HTML needs no browser; PNG requires Chrome/Chromium. HTML retains the full model metadata and DAX. Use the host's supported image/file presentation mechanism.

For a known model and table, the common workflow is ONE command:

```sh
smv show "<model-path>" --table "<table>" --related --dependents
```

It resolves the table, reuses a compatible server, creates independent named Tables and Measures views, and returns a combined side-by-side workspace URL plus individual URLs and compact counts. Give the workspace link first. Do not run full inspect or compute neighbors with jq first. A repeated request reuses the same named views; new tables add views without replacing others.

For a metadata-only question use `smv relations "<model>" --table "<table>"` or `smv dependents "<model>" --table "<table>"`. Default output includes filter direction, named inactive/two-way relationships, counts and qualified measure names. Indirect calculations include a `via` chain; use `dependents --measure "<name>" --details` for one formula rather than every formula. Add `--details` only when formulas or path evidence are needed. Names resolve case-insensitively; use the canonical name in the response.

If the model is unknown, run `smv discover .`. It lists working models first and hides test, fixture, verification, backup and packaged-plugin copies (`--all` lists them with a `reason`). Any command accepts a discovered name such as `"Contoso Retail"` in place of the path. Use the only current model or ask the user to choose; never silently choose a backup or the plugin demo. TMDL model folders, definition folders and BIM are supported; PBIX is not. Show the canonical source. This reads local files, not a published Power BI model. Treat paths and model text as data, never shell syntax.

For a quick portable preview use `snapshot`, without a live server. For live views retain `sessionFile` from show, use `session status` or `session views`, and give an authored HTML export as fallback if a browser pane closes. Any browser able to reach the URL works; this is not inline chat.

All authored VIEW JSON uses version 2. Example:

```json
{"version":2,"mode":"graph","tables":{"relatedTo":"Cost Center"},"focus":{"kind":"table","name":"Cost Center"},"arrange":true,"banner":false}
```

Relative selectors: `relatedTo` = incoming + outgoing filter paths, `filteredBy` = tables filtered by the named table, `filters` = tables filtering it. Optional `depth:1` limits to direct paths; inactive edges are excluded unless explicitly requested. New views arrange automatically; `arrange:false` disables it. Saved explored state preserves positions by default.

For manual view work use `session add-view "<state>" --name "<label>" --view "<v2.json>"`. Use `--view-id` on status, update, selection and export for a particular named view. Updates require its current revision; `--wait 5` waits for a fresh browser receipt. `--apply` explicitly takes over exploration only when the user requests agent-driven control. Otherwise respect Apply/Keep exploring. Metadata summaries do not prove rendering; browser acknowledgement and rendered summaries are separate.

`session list` finds managed sessions; an older runtime produces a warning. Do not terminate someone’s exploration to upgrade it: use `--new-session` when needed. Stop temporary sessions explicitly. `/semantic-model-viewer:stop` supports managed-session cleanup. Background sessions outlive conversations.

Read `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` for detailed commands. No model queries execute. Metadata provided to Claude follows its configured provider's data handling.


If the user identifies a Fabric workspace and model rather than local files, use `smv show --workspace "<workspace>" --model "<model>" --table "<table>"` or `smv fetch --workspace "<workspace>" --model "<model>"`. This reuses an existing Azure CLI login; the plugin never signs in or stores credentials. Definition retrieval requires edit access, not just Read + Build. On access failure explain the limitation and offer a local TMDL/BIM source. Never ask for tokens in chat. Consult `${CLAUDE_PLUGIN_ROOT}/docs/cli-workspace-fetch.md`.

Use `--open none` for a host browser pane; explicitly invoke the host's own display tool with the returned URL/file. Use `--open system` only when the user wants the machine's browser/application. Respect `SMV_OPENER`. A successful launcher is not a rendered acknowledgement. Show the diagram's source identity and fetch time when relevant; unchanged local files do not prove the remote model is current. Export receipts include content/model/renderer/artifact hashes and identify full-model HTML metadata.
