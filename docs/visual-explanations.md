# Agent visual explanations

Use `smv` to illustrate model logic, a suspected issue, or a proposed idea. The tool renders the agent's explanation; it does not diagnose the model or certify a conclusion. It never executes DAX, M, or SQL and never edits source models.

## Setup

Requires Node.js 22 or newer. Run `node bin/smv.cjs` from this checkout, or install with `npm install --global .` and use `smv`. There is no published npm release.

PNG capture uses an installed Chrome or Chromium through its local DevTools protocol. No browser npm package or bundler is required. Set `SMV_BROWSER` (or `--browser` for capture/build) to the executable if automatic discovery fails. On Windows, Chrome in Program Files or LocalAppData is discovered; on macOS, Google Chrome in Applications; on Linux, common Chromium/Chrome paths. Install the browser separately if needed. Snapshot, validation, result import, and local serving do not require a headless browser.

Optional report scanning requires Python 3. Set `SMV_PYTHON` if its executable is not named `python3`.

The bundled [agent skill](../skills/smv-explain/SKILL.md) can be linked into your agent's skills directory. It is not installed automatically.

## Start with one image

```bash
smv inspect "Sales.SemanticModel" > model.json
smv discover ./Models
smv shot "Sales.SemanticModel" --view view.json --out explanation.png --json
```

Discovery emits absolute paths and IDs derived from canonical paths. Pass the returned path to rendering commands. IDs remain stable while that path stays the same. Model names are not used to guess which folder to render.

A view uses actual model object names. Inspect includes formulas, relationship source names, and Power Query metadata IDs.

```json
{
  "version": 1,
  "mode": "graph",
  "tables": ["Sales", "Date"],
  "highlights": [{"kind": "column", "table": "Sales", "name": "Net Amount"}],
  "callouts": [{"object": {"kind": "table", "name": "Date"}, "text": "Discuss the date context here."}],
  "width": 1440,
  "height": 1000,
  "scale": 2,
  "chrome": false,
  "crop": "highlights"
}
```

Supported modes are `graph`, `measures`, `matrix`, `clusters`, and `power-query`. Graph and cluster views target tables and expanded columns; graph views can target relationships by source name. Measures require a `focus` such as `{"kind":"measure","table":"Measures","name":"Sales LY"}`. Matrix highlights target table headers. Power Query focus uses `{"kind":"query","name":"<metadata ID>"}`.

`tables` selects the starting table workspace. Cluster and matrix modes retain their own overview semantics. `focus`, `highlights`, and callout objects must resolve and be visible. The tool rejects unsupported, unknown, ambiguous, or clipped targets. Reduce context or increase dimensions when the selected object cannot fit. Width and height range from 400 to 4096 CSS pixels; scale is 1 or 2. Captures use a clean in-memory snapshot session and do not read or change the ordinary viewer workspace.

`chrome: false` hides the top bar and graph side panels. `crop: "highlights"` crops around targets and labels with a margin; the default is the viewport. Captures use the classic viewer theme. Walkthrough pages support light and dark appearance, while embedded viewer images retain their captured appearance.

Annotations belong to the initial captured view. Exploring, scrolling, or resizing an offline view clears annotations rather than leaving them attached to the wrong coordinates. Reopen the artifact to restore them. `window.smv.ready()` resolves after view setup and returns capture bounds; failures are reported through the promise and `body.dataset.smvError`.

Pixel repeatability is tested within a fixed browser, font, operating system, viewport, and scale environment. It is not promised across different platforms or browser versions.

## Build a walkthrough

```bash
smv explain validate examples/explanations/sales-walkthrough.json
smv explain build examples/explanations/sales-walkthrough.json --out artifacts/sales --json
```

The example uses the synthetic Contoso model, illustrative numbers, and a calculated difference. A smaller explanation needs only these fields:

```json
{
  "version": 1,
  "title": "How this measure uses dates",
  "model": "../Sales.SemanticModel",
  "steps": [{
    "id": "formula",
    "caption": "This is the formula we are discussing; no query has been executed.",
    "view": {"version": 1, "mode": "measures", "focus": {"kind": "measure", "table": "Measures", "name": "Sales LY"}}
  }]
}
```

Each step has a unique ID containing letters, digits, underscores or hyphens, a caption, and exactly one `view`, `result`, or `calculation`. `summary` is optional. Paths inside the specification resolve relative to that file. `report` can name one explicit `.Report` folder bound to the selected model; the existing scanner supplies usage context to measure views. `shot` also accepts `--report`.

Output includes `explanation.html`, `explanation.md`, `explanation.json`, `source.json`, `images/`, and `views/`. The HTML contains embedded images and numeric evidence; its reading content works as one offline file. Interactive view links need the companion `views/` directory. Markdown uses relative image links. The manifest retains complete supplied result data, calculation provenance, model hash, effective views, and browser version, and renderer source hash. Source JSON records an absolute model path for rebuilding on the same machine; update it when moving the source.

Build validates before capture and publishes the directory only after every step succeeds. Use a new directory for each revision. `shot --force` explicitly replaces an image; walkthrough builds never replace an existing directory.

## Import numbers from existing tools

A dataset contains typed columns and rows. Decimal strings preserve exact input precision. Numeric cells may also be finite JSON numbers. Null is a missing value, not zero.

```json
{
  "version": 1,
  "columns": [{"name":"Stage","type":"string"},{"name":"Amount","type":"number","unit":"PLN"}],
  "rows": [["Ordered","100.10"],["Delivered","85.05"]],
  "origin": {"kind":"illustrative","executedAt":null,"scope":{"year":2026}}
}
```

Origin kinds are `query` (results supplied by another tool), `imported` (saved values), and `illustrative`. Optional origin fields include `tool`, `query`, `executedAt`, `scope`, `model`, and `modelRevision`. Preserve supplied metadata; execution time defaults to unknown. Importing a query string does not execute it.

```bash
smv results import result.json --out normalized.json
query-tool | smv results import -
smv results import result.csv --format csv --metadata columns.json --out normalized.json
```

CSV metadata contains `columns` and `origin`; headers must match columns in order. Empty numeric/boolean cells become null; empty strings stay strings. Booleans are `true` or `false`. JSON output is written to stdout unless `--out` is supplied; output files are never silently overwritten.

With `--json`, capture and build failures emit `{ok:false,error:{code,message,details}}` on stderr and exit nonzero. Validation, inspection, discovery, and result-import errors use that envelope by default. Codes distinguish `VIEW_INVALID`, `JSON_INVALID`, `DATASET_INVALID`, `CALCULATION_INVALID`, `CAPTURE_FAILED`, and other invalid input or filesystem errors. Unknown object errors include the object reference; JSON parse errors include the file path.

In an explanation, add `datasets: {"amounts":"normalized.json"}` or use an inline dataset. A result step names `result: "amounts"` and `render: "table"`, `"scalar"`, or `"bars"`. Scalar requires one cell. Bars require a string label column followed by a numeric column, with negative values drawn to the left of zero.

The default display limit is 30 rows, configurable from 1 to 100 with `limit` on the step. Truncation is labeled and the manifest keeps all supplied rows. Dataset files are limited to 8 MiB and datasets to 10,000 rows; aggregate large query results upstream.

## Explain calculations

Add a `calculations` object and a step naming `calculation`. For example:

```json
{
  "gap": {
    "op": "subtract",
    "inputs": [{"dataset":"amounts","row":1,"column":"Amount"},{"dataset":"amounts","row":0,"column":"Amount"}],
    "decimals": 2
  }
}
```

Supported operations are `sum`, `subtract`, `multiply`, `divide`, `ratio`, and `percentChange`. Sum accepts one or more inputs; others require two. Percentage change treats the first input as old and the second as new: `(new - old) / old * 100`.

An input can reference a dataset cell, another calculation (`{"calculation":"gap"}`), or an illustrative constant (`{"kind":"illustrative","value":"100.00","unit":"PLN"}`). Calculation inputs use plain decimal notation; convert exponent notation upstream when needed.

Arithmetic uses exact integer fractions. Rounding occurs only for display, half away from zero, at 0–12 decimal places (default 2). Chained calculations use unrounded values; input details retain the exact fraction. Null propagates to a null result. Division by zero, cycles, and missing inputs fail validation.

Sum, subtraction, ratio, and percentage change require matching units. Multiplication supports at most one dimensional input. Division supports equal units or a dimensionless divisor. A ratio is dimensionless; percentage change produces `%`. This is arithmetic over supplied numbers, not a DAX or filter-context engine.

## Illustrate proposals

A view's optional `proposals` array supports `relationship`, `formula`, `note`, `removal`, `arrow`, and `group`. Every proposal needs explanatory `text`. Formulas, notes, and removals have an `object` reference. A relationship has `from` and `to` column references and requires graph mode.

```json
{"kind":"relationship","from":{"kind":"column","table":"Sales","name":"Order Date"},"to":{"kind":"column","table":"Date","name":"Date"},"text":"Discuss this candidate relationship; it has not been applied."}
```

General arrows use `from` and `to` object references and have arrowheads. Groups use an `objects` array of at least two references and a dashed enclosure.

Relationships appear as dashed purple overlays. Other proposals appear as labeled callouts; a formula's text is displayed without evaluation. The proposal toggle hides their overlays to reveal the underlying model. None of these operations modifies model files or changes the snapshot's model metadata. For concept lessons, use a small synthetic BIM file such as [the concept example](../examples/explanations/concept.bim).

## Local exploration

```bash
smv serve "Sales.SemanticModel" --view view.json --watch
smv serve "Sales.SemanticModel" --view view.json --watch --background --session session.json --json
smv open "Sales.SemanticModel" --view view.json --session session.json
smv session status session.json
smv session stop session.json
```

The server binds to loopback and serves the generated view, not the source directory. Its URL contains a local access token. The session file is created with restrictive permissions where supported. Do not publish the session URL as a portable artifact.

Matching session files reuse an existing server. Different inputs or watch settings require a different session file. An unreachable session produces an error; inspect and remove a stale session file before restarting. Stopping uses the live server's token rather than killing an arbitrary PID.

Watch checks source and view files every second. Reload the browser to see a refreshed artifact. Invalid or stale object references produce an error page and status instead of silently showing the previous explanation. Fixing the source or view restores serving. Foreground sessions stop with Ctrl+C; background sessions stop with the session command.

## Agent presentation and verification

Inspect generated images before presenting them. T3 Code can preview and render the HTML using its native tools; use Markdown images or artifact links in hosts without HTML embedding. No host integration is required for offline browser viewing. Host appearance and embedding support should be checked in the actual host before claiming compatibility.

Run `npm test` for CLI and contract tests, `npm run test:browser` for capture tests, and the extension's `npm test` for the complete existing regression suite and viewer synchronization. Browser tests fail on CI if Chrome is unavailable. The cross-platform explanation workflow exercises Linux, Windows, and macOS; its results, rather than local Linux tests alone, establish platform validation.
