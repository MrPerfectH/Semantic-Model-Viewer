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

Input may be one TMDL `.SemanticModel` folder, its `definition` folder containing
`model.tmdl`, or a `.bim` file. Relative paths resolve from the current working directory.

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

For focused browser views, revisioned session updates, selection feedback and cleanup, see [CLI plugin workflow](cli-plugin-workflow.md).

## Focused inspection and filter paths

Use `smv --where` to print the resolved executable path. Plugin skills use the
host-provided plugin root rather than a hardcoded cache version.

```sh
smv inspect "Model.SemanticModel" --table IFLO
smv filters-by "Model.SemanticModel" IFLO
smv filters-by IFLO --model "Model.SemanticModel" --direction incoming --direct
```

The first query returns the table, its relationships, and direct/indirect DAX
measure users. The second lists active outgoing filter paths with direction and
many-to-many evidence. See [CLI plugin workflow](cli-plugin-workflow.md) for
inactive relationships, live table focus, banner options and explicit Apply control.

Subcommands support `--help`, including `inspect --help` and `session update --help`.
New authored table views use a compact layout and explore incoming plus outgoing
filter paths by default. Saved positions remain unchanged. Use `smv session update ... --wait 5` to wait for a browser acknowledgement; check `confirmed` rather than
assuming an accepted update has appeared. For quick previews, prefer standalone
HTML snapshots; live views can also be exported as an offline fallback.
