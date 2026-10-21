---
name: smv-explain
description: Illustrate semantic-model explanations with the Semantic Model Viewer CLI using annotated model views, external results, and proposed changes. Use when a user wants to understand model logic, discuss a suspected issue, or see a modeling idea.
---

# Illustrate a model explanation

When loaded through the Claude Code plugin, use `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"` from the user's project, and read guides under `${CLAUDE_PLUGIN_ROOT}/docs/`. Otherwise use an installed `smv` command, or `node bin/smv.cjs` from the Semantic Model Viewer checkout. `smv --help` lists commands. Keep scope with the user's question: one useful image is sufficient when a walkthrough adds no value. Store generated artifacts in the user's project, not the plugin installation.

Use `smv inspect <model-path>` to obtain actual object names, relationship names, formulas, and query IDs. Inputs are a TMDL model folder or a BIM file. Do not guess identifiers from labels. `smv discover <folder>` lists model paths if needed.

Create a version 1 JSON view. For example:

```json
{
  "version": 1,
  "mode": "graph",
  "tables": ["Sales", "Date"],
  "highlights": [{"kind": "table", "name": "Date"}],
  "callouts": [{"object": {"kind": "table", "name": "Date"}, "text": "The date context we are discussing."}],
  "chrome": false,
  "crop": "highlights"
}
```

Column and measure references also require `table`. A relationship's `name` is its source identifier; a query's `name` is its metadata ID from inspect. `mode: "measures"` requires a measure `focus`. Other modes are `matrix`, `clusters`, and `power-query`. Matrix annotations target tables; query views target queries.

Run `smv shot <model-path> --view view.json --out image.png --json`, inspect the image, and revise context, dimensions, or labels when needed. Capture requires Chrome/Chromium; set `SMV_BROWSER` to the executable if discovery fails. Unknown, invisible, or clipped objects are errors to resolve, not reasons to omit the visual silently.

For a sequence, write an explanation containing `version: 1`, `title`, `model`, and `steps`. Each step has a unique simple `id`, a `caption`, and one `view`, `result`, or `calculation`. Paths resolve relative to the explanation file. Run `smv explain validate explanation.json`, then `smv explain build explanation.json --out <new-directory> --json`. Inspect the resulting images before presenting them.

External tools can supply datasets; this CLI never runs DAX, SQL, or M. Preserve the source tool, query, execution time, filters, and model identity when known. Keep unknown provenance unknown and label invented values `illustrative`. Calculations are limited arithmetic over those inputs. Consult the repository's `docs/visual-explanations.md` for result, calculation, and proposal contracts when using those features.

Proposals illustrate suggestions; they do not edit the source or simulate model behavior. Explain the distinction between the visible model structure and your interpretation where it matters to the user's question.

Present the PNG with the host's supported image mechanism. For multi-step HTML in T3, use its available HTML preview/render tools; otherwise provide artifact links or Markdown images. Do not assume every host can embed HTML. Local publishing or sending artifacts to another service is a separate action governed by the user's request.

Prefer the actual interactive viewer for exploration. Consult `docs/interactive-viewer.md` for version 2 dependency context, revisioned session updates, current selection, export basis and MCP setup. Never recreate the viewer in answer-specific HTML, SVG or JavaScript. Use CLI-generated artifacts and the app's own interactions.

Use `smv serve <model> --view view.json --background --session state.json --json` to obtain a local view URL without choosing a browser for the host. Use the harness's native browser/right pane if the URL is reachable. `smv open <model> --view view.json --session state.json` also launches the machine's browser. Check host ownership before operating a user's tab. Do not infer that remote hosts can reach localhost.

Use `smv session status` to read the current requested revision. Send `smv session update <state.json> --revision <n> --view <file> --json`; `awaiting-viewer` is not an applied acknowledgement. Respect Apply/Keep exploring. Read `smv session selection <state.json> --json` to identify “this one”; use `--client` when several tabs are active. Do not guess from labels. Export with an explicit `--basis authored|current` and the current `--revision`.

In an MCP harness, use the corresponding `smv_*` tools. Inline UI requires MCP Apps capability support, not merely MCP support. Use the actual UI resource when supported; otherwise use a screenshot plus a reachable open-view link or offline artifact. The MCP App selection-context action is explicit. Closing the MCP connection stops its owned sessions. Do not disable protections or publish local models to force embedding.

An advertised MCP Apps capability is not evidence of a visible inline view. Try it once, then reuse the same session for an explicit browser/artifact fallback. Never label a side panel as inline chat. `smv_open` accepts an omitted view or `{}`; `smv_sessions` lists owned sessions and `SMV_ROOT`. Inspect returned source provenance and backup warnings before relying on local metadata. Default `smv_export` outputs are gitignored under `.smv-artifacts` and return size/hash receipts. Use file attachments or links; respect host publication/inspection limits rather than pasting full HTML or claiming inline publication. See `${CLAUDE_PLUGIN_ROOT}/docs/mcp-usage.md` when in the Claude plugin, or `docs/mcp-usage.md` in a checkout.

`smv explain build` produces an `interactive.html` walkthrough with actual viewer steps as well as static outputs. Stop sessions started for temporary work with `smv session stop state.json`. Source watching refreshes the served artifact; reload the browser to see the new view.
