---
name: smv-explain
description: Illustrate semantic-model explanations with the Semantic Model Viewer CLI using annotated model views, external results, and proposed changes. Use when a user wants to understand model logic, discuss a suspected issue, or see a modeling idea.
---

# Illustrate a model explanation

Use an installed `smv` command, or `node bin/smv.cjs` from the Semantic Model Viewer checkout. `smv --help` lists commands. Keep scope with the user's question: one useful image is sufficient when a walkthrough adds no value.

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

Use `smv open <model> --view view.json --session state.json` only when a live view helps. Stop sessions started for temporary work with `smv session stop state.json`. Source watching refreshes the served artifact; reload the browser to see the new view.
