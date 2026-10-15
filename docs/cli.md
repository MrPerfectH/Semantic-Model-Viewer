# Semantic Model Viewer CLI

Export a semantic model as one offline, interactive HTML file. Recipients can
explore it in a browser without installing the Viewer or connecting to Power BI.
The snapshot represents one version of the model; it is not a change report.

## Usage

Requires **Node.js 22 or newer**, with no extra dependencies or browser needed to export.
Run from a checkout:

```bash
node bin/smv.cjs snapshot "Models/demo/Contoso Retail.SemanticModel" --out snapshot.html
node bin/smv.cjs --help
```

Or install from this repository with `npm install --global .` to use `smv`.
There is no published npm release.

Input must be one TMDL `.SemanticModel` folder or its `definition` folder containing
`model.tmdl`. Relative paths resolve from the current working directory.

```bash
smv snapshot "Sales.SemanticModel" --out artifacts/model.html
smv snapshot "Sales.SemanticModel/definition" --tables Sales,Customer,Date --out artifacts/sales.html
smv snapshot "Sales.SemanticModel" --measure "Total Sales" --out artifacts/measure.html
```

- `--tables`: comma-separated starting tables, or repeat `--table` for names containing commas.
- `--measure`: open on the selected measure, instead of selecting starting tables.
- `--name`: override the displayed model name.
- `--force`: replace an existing output file. Without it, existing files are preserved.

All snapshots retain the full Viewer model metadata, DAX and available Power Query
definitions, including objects outside the starting view. Exact M includes any endpoint
strings or parameter values written in the queries. Separate connection settings and
usage analysis are omitted.
They are exploration artifacts, not backups of every TMDL property. See
[snapshot contents](snapshots.md) for details.

Open the generated HTML directly in a browser. You can save it in the repository
or attach it as a build artifact for reviewers. The CLI does not commit, upload,
or attach files to a PR. It does not modify the TMDL source or execute M or DAX.

## Visual explanations

Use `smv shot` for an annotated image, `smv explain build` for a walkthrough, and `smv results import` to attach numbers from existing tools. Calculations, proposed changes, and local exploration are described in [the visual explanations guide](visual-explanations.md). These commands extend the existing snapshot CLI; they do not execute model queries.
