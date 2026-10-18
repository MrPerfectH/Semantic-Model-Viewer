# TMDL snapshot CLI

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

## Open a fresh local view

```bash
node scripts/open-model.cjs "/absolute/path/Sales.SemanticModel"
```

This opens a newly generated offline snapshot using this checkout's renderer.
It never reuses an HTTP server. Each launch has a unique output folder and a
`launch.json` receipt recording the source, renderer revision, dirty state,
table/relationship counts and HTML SHA-256. Incomplete relationship endpoints
or a checkout behind cached `origin/main` fail before opening a browser.
Use `--no-open` for generation/validation only, `--output-dir` to choose the
parent output folder, or `--viewer-root` to select a stable configured checkout.
Fetch and update that checkout separately when newer upstream code is wanted;
the launcher itself performs no network update. Run again after editing TMDL.

Existing report-aware launchers can preserve PBIR usage with
`--report "/absolute/path/Sales.Report"` (requires Python 3). The report must
be bound to the selected model; an unavailable or mismatched report fails
without opening a stale fallback. The snapshot includes usage and its launch
folder retains the scanner's report-health output.

For a stable installed command on macOS/Linux, run from the stable checkout:

```bash
chmod +x scripts/open-model.cjs
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/scripts/open-model.cjs" "$HOME/.local/bin/smv-open-model"
```

If that command already exists, inspect it before replacing it. The symlink
runs the checkout's script directly, so updating the checkout updates both
the launcher and the renderer. Keep the checkout at a stable path.

In the browser, relationship pills show cardinalities and filter direction.
Hover or click a line for exact column pairs, or select a table for its inspector.

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
strings or parameter values written in the queries. The `snapshot` command omits
separate connection settings and report usage. The opener's optional `--report`
adds report usage as described above.
They are exploration artifacts, not backups of every TMDL property. See
[snapshot contents](snapshots.md) for details.

Open the generated HTML directly in a browser. You can save it in the repository
or attach it as a build artifact for reviewers. The CLI does not commit, upload,
or attach files to a PR. It does not modify the TMDL source or execute M or DAX.
