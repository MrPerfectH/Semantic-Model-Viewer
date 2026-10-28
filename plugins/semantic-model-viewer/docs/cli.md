# Semantic Model Viewer CLI

Requires Node.js 22+. The Claude plugin includes the runtime and needs no extra npm
packages, MCP server, separate app or VS Code extension.

In Claude, run `/semantic-model-viewer:setup` once for a stable `smv` command on PATH.
From a checkout, run `node bin/smv.cjs install` or invoke `node bin/smv.cjs` directly.
There is no published npm release. A checkout install stays bound to that checkout; plugin setup follows Claude plugin upgrades. Use `install --source checkout|plugin` to choose explicitly. `smv --where --json` reports the active executable, version, selection and warnings; `smv --version` prints the version. Existing launchers must be reinstalled once to adopt this policy. Updating a checkout or plugin is a separate action; diagnostics perform no network checks.

```sh
smv show 'Sales.SemanticModel' --table 'Cost Center' --related --dependents
smv relations 'Sales.SemanticModel' --table 'Cost Center'
smv dependents 'Sales.SemanticModel' --table 'Cost Center'
smv snapshot 'Sales.SemanticModel' --out model.html
smv session list
smv session stop --all
smv --help
```

`show` returns one reusable side-by-side Tables/Measures workspace and independent
view URLs. Focused queries return small counts and names; use `--details` for DAX
or relationship evidence. Full `inspect` remains available for broad inventories.

Inputs are one TMDL model folder, its definition folder, or a BIM file. Relative paths
resolve from the current project. Commands read local metadata, never execute DAX/M/SQL
or change model files, and do not read the published Power BI service model.

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


New view JSON uses **version 2**, including relative table sets and layout controls:

```json
{"version":2,"tables":{"relatedTo":"Cost Center"},"arrange":true,"banner":false}
```

Use it with `snapshot --view`, `shot --view`, or named live views. HTML snapshots work
offline without a server; PNG capture requires Chrome/Chromium. Snapshots retain all
parsed model metadata and formulas behind the starting view. See [snapshot contents](snapshots.md).

Read [CLI plugin workflow](cli-plugin-workflow.md) for the complete command and view
contract, managed-session reuse/cleanup, version warnings, stable PATH setup, named
views, and computed versus browser-applied counts. Every subcommand supports `--help`.

All snapshots retain the full Viewer model metadata, DAX and available Power Query
definitions, including objects outside the starting view. Exact M includes any endpoint
strings or parameter values written in the queries. The `snapshot` command omits
separate connection settings and report usage. The opener's optional `--report`
adds report usage as described above.
They are exploration artifacts, not backups of every TMDL property. See
[snapshot contents](snapshots.md) for details.


[Visual explanations](visual-explanations.md) covers annotated images, walkthroughs,
external results and proposals. The walkthrough envelope and imported dataset formats
remain version 1; their embedded **view specifications use version 2**.

Compare two calculations with `smv compare <model> --measure "<A>" --with "<B>"`. This opens one native paired Measures view, with inline DAX and source references; use `--out comparison.html` for a portable file. See [measure comparison](measure-comparison.md) for colors, scope limits and saved state.
