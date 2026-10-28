---
name: smv-explain
description: Illustrate semantic-model explanations with the Semantic Model Viewer CLI using annotated model views, external results, and proposed changes. Use when a user wants to understand model logic, discuss a suspected issue, or see a modeling idea.
---

Use the package-local CLI: `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv"` on macOS/Linux, or `"${CLAUDE_PLUGIN_ROOT}/bin/smv.cmd"` on Windows. It includes a private runtime in complete release packages; no PATH command, setup skill, npm or separate Node installation is required. In commands below, `smv` means this bundled launcher, never a PATH lookup. Never construct a versioned cache path.

# Illustrate a model explanation

When loaded through the Claude Code plugin, use `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv"` from the user's project, and read guides under `${CLAUDE_PLUGIN_ROOT}/docs/`. Always use the bundled executable for plugin requests; do not switch to a global command. `smv --help` lists commands. Lead with the live interactive viewer for exploration and explanations: omit --out. Use static images only when the user needs documentation or a snapshot. Store generated artifacts in the user's project, not the plugin installation.

For a known table diagram, start with ONE `smv show <model-path> --table "<name>" --related --dependents` call. For metadata-only questions use `smv relations <model-path> --table "<name>"` and `smv dependents <model-path> --table "<name>"`; add `--details` for formulas or path evidence. Use `smv inspect <model-path>` only for a broader schema/query-ID inventory. Inputs are a TMDL model folder or a BIM file. Do not guess identifiers from labels. `smv discover <folder>` lists model paths if needed.

For documentation images or an explicitly requested snapshot, create a version 2 JSON view. For example:

```json
{
  "version": 2,
  "mode": "graph",
  "tables": ["Sales", "Date"],
  "highlights": [{"kind": "table", "name": "Date"}],
  "callouts": [{"object": {"kind": "table", "name": "Date"}, "text": "The date context we are discussing."}],
  "chrome": false,
  "crop": "highlights"
}
```

Column and measure references also require `table`. A relationship's `name` is its source identifier; a query's `name` is its metadata ID from inspect. `mode: "measures"` accepts a measure, table or column `focus`; without focus a v2 view opens the overview. Other modes are `matrix`, `clusters`, and `power-query`. Matrix annotations target tables; query views target queries.

Run `smv shot <model-path> --view view.json --out image.png --json`, inspect the image, and revise context, dimensions, or labels when needed. Capture requires Chrome/Chromium; set `SMV_BROWSER` to the executable if discovery fails. Unknown, invisible, or clipped objects are errors to resolve, not reasons to omit the visual silently.

For a sequence, write an explanation containing `version: 1`, `title`, `model`, and `steps`. Each step has a unique simple `id`, a `caption`, and one `view`, `result`, or `calculation`. Paths resolve relative to the explanation file. Run `smv explain validate explanation.json`, then `smv explain build explanation.json --out <new-directory> --json`. Inspect the resulting images before presenting them.

External tools can supply datasets; this CLI never runs DAX, SQL, or M. Preserve the source tool, query, execution time, filters, and model identity when known. Keep unknown provenance unknown and label invented values `illustrative`. Calculations are limited arithmetic over those inputs. Consult the repository's `docs/visual-explanations.md` for result, calculation, and proposal contracts when using those features.

Proposals illustrate suggestions; they do not edit the source or simulate model behavior. Explain the distinction between the visible model structure and your interpretation where it matters to the user's question.

Present the PNG with the host's supported image mechanism. For multi-step HTML in T3, use its available HTML preview/render tools; otherwise provide artifact links or Markdown images. Do not assume every host can embed HTML. Local publishing or sending artifacts to another service is a separate action governed by the user's request.

Prefer the actual interactive viewer for exploration. Consult `docs/cli-plugin-workflow.md` for version 2 dependency context, revisioned session updates, current selection and export basis. Never recreate the viewer in answer-specific HTML, SVG or JavaScript. Use CLI-generated artifacts and the app's own interactions.

Use `smv serve <model> --view view.json --background --session state.json --json` to obtain a local view URL without choosing a browser for the host. Use the harness's native browser/right pane if the URL is reachable. `smv open <model> --view view.json --session state.json` also launches the machine's browser. Check host ownership before operating a user's tab. Do not infer that remote hosts can reach localhost.

Use `smv session status` to read the current requested revision. Send `smv session update <state.json> --revision <n> --view <file> --json`; `awaiting-viewer` is not an applied acknowledgement. Respect Apply/Keep exploring. Read `smv session selection <state.json> --json` to identify “this one”; use `--client` when several tabs are active. Do not guess from labels. Export with an explicit `--basis authored|current` and the current `--revision`.

Use shell CLI commands for every operation. In the Claude Code plugin, run `/bin/sh "${CLAUDE_PLUGIN_ROOT}/bin/smv" workspace` from the user's project for gitignored artifact paths and existing session records. Show the exact local source; confirm backup-looking folders before relying on them. Reuse matching sessions and stop temporary ones explicitly. Browser panes and exported files are the presentation routes; do not promise inline chat. Use native file attachments or links without pasting full HTML or bypassing host publication rules. Read `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` in the plugin, or `docs/cli-plugin-workflow.md` in a checkout.

`smv explain build` produces an `interactive.html` walkthrough with actual viewer steps as well as static outputs. Stop sessions started for temporary work with `smv session stop state.json`. Source watching refreshes the served artifact; reload the browser to see the new view.

For the common table explanation, prefer `smv show <model> --table "<name>" --related --dependents`: one managed server, a combined workspace, and independent view URLs. Version 2 view files also support `tables:{"relatedTo":"<table>"}`, `arrange:true` and `banner:false`. See the CLI workflow document. The explanation walkthrough envelope remains version 1; its embedded view specifications use version 2.


## Start with a question diagram

For a relationship between two tables run `smv show <model> --table "<A>" --with "<B>"`. For upstream tables use `--related --direction incoming`; downstream tables use `--related --direction outgoing`; calculation dependencies use `--dependents`. Give the diagram URL first and explain what its arrows mean. `--out diagram.png` exports a static image and starts no server; omit `--out` to launch the live interactive viewer instead. Use it only for docs or snapshots. `--out diagram.html` exports a standalone interactive snapshot, also without a server. HTML contains the full model metadata and DAX. PNG needs Chrome/Chromium. Use qualified endpoint names and inactive-edge evidence from `relations`; use the `via` chain from `dependents` to explain an indirect calculation. A physical connection through intermediate tables does not necessarily propagate filters; follow the reported filter direction rather than inferring from proximity.

For two-measure questions, use one `smv compare <model> --measure "<A>" --with "<B>"` call. Open `views[0].url`, or use `--out comparison.html` for a portable file. It reuses the native Measures workspace and shows source references and inline DAX. Read `docs/measure-comparison.md` for scope and color semantics. Preserve the distinction between shared objects and extra connections. Do not claim numeric equivalence or relationship-context simulation from static references.
