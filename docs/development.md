# Developer guide

For installation, see [installation and updates](installation.md). For contributions
and the branch/release process, see [CONTRIBUTING](../CONTRIBUTING.md).

## About the app

The app is a static, dependency-light vanilla JS/HTML/CSS app. No build step, no bundler,
no npm install. The live app uses Google Fonts for IBM Plex Sans/Mono (cached after the
first visit; the system font is used if they cannot be loaded) and loads the PNG export
library on demand. Interactive snapshots bundle their own scripts/styles, use system fonts,
and run entirely offline.

Use the **Appearance** selector in the top bar to switch between **Classic** and
**Spellbook**, a parchment theme with burgundy controls and book-inspired headings.
Spellbook uses a coordinated olive, muted-plum and antique-gold palette across all five
views, including table badges, measure dependencies and Power Query. The Classic
Muted/Vivid palette preference is retained when switching back.
The choice is remembered in your browser or VS Code workspace. Interactive snapshots
include the chosen theme and its artwork; changing it in a snapshot stays in that tab.

```
Models/tools/viewer/
├── index.html            entry point
├── js/                   app code (see below)
├── sw.js, manifest.webmanifest, icons/   installable-app (PWA) support
├── model-data.json       built-in sample dataset — the synthetic "Contoso Retail" demo
├── report-usage.json     built-in sample dataset — synthetic report scan
└── scripts/              the two data-pipeline build scripts (Python)
Models/demo/              TMDL source of the demo model
```

## Data pipeline

```
TMDL sources                      Reports (PBIR)
Models/<Model>.SemanticModel/     Reports/<Report>.Report/
  definition/*.tmdl                 definition/pages/*/visuals/*/visual.json
        │                                 │
        ▼ (build step 1)                  ▼ (build step 2)
  model-data.json                  report-usage.json
        └────────────┬────────────────────┘
                     ▼
              Viewer (static app)
```

Both scripts live in `Models/tools/viewer/scripts/` and run standalone with `python3`
(stdlib only, no dependencies):

```bash
# build step 1 — TMDL -> model-data.json
python3 Models/tools/viewer/scripts/tmdl_to_model_data.py \
    "Models/demo/Contoso Retail.SemanticModel" \
    -o Models/tools/viewer/model-data.json

# build step 2 — PBIR reports -> report-usage.json (+ report-health.json)
python3 Models/tools/viewer/scripts/scan_report_usage.py Reports \
    --model-data Models/tools/viewer/model-data.json \
    -o Models/tools/viewer/report-usage.json
```

`tmdl_to_model_data.py` is a line-by-line port of the browser parser
(`js/tmdl-parser.js`) — same regexes, same role/domain heuristics, same output — so
in-repo snapshots and drag-and-drop imports agree. Keep the two in sync when either
changes.

### Wiring into your own repo

Both JSON files are derived artefacts; the point of the scripts is that nobody hand-edits
them. Two options, in order of preference:

* **Pre-commit hook** — regenerate whenever model or report definitions change, so the
  committed JSON always matches the TMDL in the same commit:

  ```yaml
  # .pre-commit-config.yaml
  - repo: local
    hooks:
      - id: viewer-model-data
        name: viewer — rebuild model-data.json
        entry: python3 Models/tools/viewer/scripts/tmdl_to_model_data.py "Models/demo/Contoso Retail.SemanticModel" -o Models/tools/viewer/model-data.json
        language: system
        pass_filenames: false
        files: '^Models/.*\.SemanticModel/definition/.*\.tmdl$'
      - id: viewer-report-usage
        name: viewer — rebuild report-usage.json
        entry: python3 Models/tools/viewer/scripts/scan_report_usage.py Reports --model-data Models/tools/viewer/model-data.json -o Models/tools/viewer/report-usage.json
        language: system
        pass_filenames: false
        files: '^Reports/.*\.Report/definition/.*\.json$'
  ```

* **CI job** — run both scripts and fail the build if `git diff --exit-code` shows the
  committed JSON is stale. Same commands; this catches commits made without the hook
  installed and is the safer belt-and-braces option if the repo already runs CI on PRs.

If the repo prefers not to commit derived JSON at all, publish the viewer folder plus the
two generated files as a CI artefact (or to the docs site) instead — nothing in the app
depends on them being in git.

### Report health

`scan_report_usage.py` also writes `report-health.json` next to its output, listing measure
names referenced by visuals or filters that no longer exist in the model (broken report
references). It prints them to stderr too, which makes it
easy to turn into a CI warning.

### Where a table's data comes from

Partitions rarely name their connector — a partition says `Source = VerticaPath` and the
real `Vertica.Database(...)` call sits in a shared expression. The parser therefore follows
the first `Source =` reference (through shared expressions *and* other tables' partitions)
until it finds a connector call, then reports the connector, the object, the host and the
shared query it came through. Recognised: Databricks, Vertica, SQL Server, Oracle,
PostgreSQL, MySQL, Snowflake, Synapse, Fabric/Lakehouse, Analysis Services, SAP, ODBC,
Dataflows, SharePoint, Azure Storage, Salesforce, Folder, Excel, CSV, Web and OData, plus
`manual` (inline rows), `calculated` (DAX) and `parameter` (query parameters). Anything
else stays `Other`. Both parsers implement this — keep `js/tmdl-parser.js` and
`scripts/tmdl_to_model_data.py` in step.

### How a table gets its role (fact / dim)

Every table gets a `role`; the graph, matrix and sidebar all read it. Calc groups, field
parameters and measure-only tables are fixed (`calcgroup`, `fieldparam`, `measures`). For
everything else an ordered **rule list** decides — the first rule whose conditions all hold
wins, and a rule with no conditions catches the rest. The built-in rules:

| # | Role | When |
|---|---|---|
| 1 | fact | source table name matches `(^|[._])(fact|fct)_` |
| 2 | dim | source table name matches `(^|[._])dim_` |
| 3 | helper | manual table, no relationships |
| 4 | helper | calculated table, no relationships |
| 5 | standalone | no relationships |
| 6 | fact | only on the many side of its relationships |
| 7 | dim | only on the one side |
| 8 | fact | more many-side than one-side relationships |
| 9 | dim | more one-side than many-side relationships |
| 10 | dim | everything else (ties) |

Each rule can test the name (regex against source table + table name), the relationship
sides, whether the table has measures, and its source kind (source / manual / calculated).
**Roles › Rules** in the top bar opens the editor: reorder, edit, add or remove rules, see how
many tables each one decides, reset to the defaults. Edits apply at once and live in
`localStorage`. **Copy JSON** exports the set so the build script can use the same rules:

```bash
python3 Models/tools/viewer/scripts/tmdl_to_model_data.py "<model>.SemanticModel" --rules my-rules.json -o model-data.json
```

Two things sit above the rules:

* **`annotation SMV_Role = fact | dim | helper | standalone`** on a table in TMDL pins the role
  in the model itself. It beats every rule, in the viewer and in the build script. Power BI
  Desktop's TMDL view, Tabular Editor 2/3 or a text editor all work, and the annotation
  survives deploy and round-trip. In `.bim` it is `"annotations": [{"name": "SMV_Role", "value": "fact"}]`.

  ```tmdl
  table Sales
  	lineageTag: 9a48bea0-e5fb-40fa-9e81-f61288e31a02

  	annotation SMV_Role = fact
  ```

* **A per-table pick** in the table panel (Fact / Dimension / Helper) saves `SMV_Role`
  directly into the table's `.tmdl` file when opened through **Connect repo folder** in
  Chrome/Edge (including the Mac launcher). The browser requests write access on the first
  change. **Auto** removes the annotation. The panel shows the saved file or an error;
  failed writes do not change the role. Commit and push the TMDL change to share it through Git.
  Repo models ignore old browser-only role overrides, so the shared annotation wins.
  Disconnected repo caches must be reconnected before editing. Other imports and the VS Code
  viewer still use explicitly labelled browser-local picks. Automatic write-back currently
  requires TMDL, not BIM/JSON.

The engine lives in `js/roles.js` and is mirrored in `scripts/tmdl_to_model_data.py` — keep
`DEFAULT_RULES` identical in both.

## Source layout

| File | Role |
| --- | --- |
| `js/util.js` | DOM/SVG helpers, localStorage wrapper, inline SVG icon set |
| `js/tmdl-parser.js` | TMDL/BIM → model JSON, used for in-browser import (including `isHidden` on measures and connector detection) |
| `js/canvas.js` | Table cards, pan/zoom, level-of-detail, relationship edges, selection/highlighting, fit, presets |
| `js/layouts.js` | Arrange algorithms (star / constellation / layered / grid / galaxy / star columns / waterfall) and cluster mode |
| `js/matrix.js` | Relationship matrix |
| `js/dax-format.js` | Local DAX formatter (SQLBI short/long layout) and measure inliner |
| `js/measures.js` | Measures rail, dependency DAG layout, DAX tokenizer, DAX cards |
| `js/sidebar.js` | Table detail drawer |
| `js/topbar.js` | Top bar, model menu, legend, hint chip, import modal |
| `js/app.js` | State, model loading, usage data, import, repo connection |

State that persists in `localStorage`: `lsa_model_layout_v1` (built-in model card
positions), `smv_layout_<id>` / `smv_presets_<id>` (imported models), `smv_models_v1`,
`smv_current_v1`, `smv-detail`, `smv-layout`, `smv-lines`, `smv-mvw`, `smv_repo_name`,
`smv_repo_cache`, `smv-measures-workspace-v1`.

### Table and column references in measure dependencies

The Measures graph defaults to measures only. Enable **Show table and column references**
to add source tables, using the same colors as the Tables canvas. Cards contain only the
columns connected to measures visible in the graph. A dashed **Whole table** link attaches
to the table header (for example, `COUNTROWS(Sales)`); a solid column link attaches to its
row (for example, `SUM(Sales[Amount])`). A measure's home table does not imply a dependency.

In the left library, choose **Table or column**. Expand a table and choose **Use whole
table** or any column; the picker includes columns with no detected consumers. The library
then lists direct references first, followed by indirect dependents. Change the source to
return to the picker. You can also select a source table header in the graph to find
measures referencing that table or any of its columns.
Select a column row to narrow the source. The table details drawer also provides
**Find dependent measures**, and each column has **Find measures**. Source analysis includes
indirect dependents through measures, a **Direct only** filter, and searchable results.
Selecting a dependent measure inspects its DAX without changing the source; **Analyze this
measure** returns to measure analysis. Source selection, graph settings, and inspected DAX
are preserved in interactive snapshots.

Each formula card owns its reference summary. Original DAX shows direct references only;
**Inline measures** shows references resolved from the expanded expression, including
columns introduced by inlined measures. Comparison cards retain their own reference scope.
The DAX pane opens when a dependent measure is inspected; before that, the graph uses
the available width. Inline, formatting and source library settings also survive snapshots.

This is static DAX reference detection, not complete engine lineage. Calculated columns
and calculated tables can be sources, but their defining expressions are not expanded.
Relationship filter propagation and calculation-item expressions are not traced. Qualified
column references and explicit table references are resolved against the model; unqualified
bracket names resolve to measures first, then columns in the measure's home table. Ambiguous
row-context references outside that table and virtual columns are not fully resolved.
Graphs are limited to 500 measures and 200 source table/column rows, with visible notices;
dependent-measure lists show up to 120 matches at once and can be narrowed by search.

## Regression checks

No installation is needed. With Node.js available:

```bash
node vscode-extension/scripts/sync-viewer.js
node --test tests/*.test.cjs Models/tools/viewer/tests/*.test.js tests/extension.test.js
```

The tests cover relationship traversal, canvas membership/persistence, dependency parsing, model isolation, storage failures, measure controls, matrix behavior and escaped tooltip content. These fixtures do not establish full parser or browser compatibility.

Working-canvas membership lives in `smv_workspace_v1_<modelKey>`; named views include membership, positions, viewport, selection, pinned/locked roots, hide-unrelated focus, and card display settings. Older presets without membership restore the tables present in their positions. Undo history lasts for the current model session.

Real Chrome layout checks (Node.js 22+, installed Chrome; optionally set `CHROME_PATH`):

```bash
node --test tests/star-layout.browser.cjs tests/measures-layout.browser.cjs tests/snapshot.browser.cjs
```

These use a disposable browser profile and the shipped CSS/JS. The measures checks cover wide-screen formula sizing, split placement, resizing, orientation and preferences; `star-layout.browser.cjs` opens the bundled model at 1440x900, runs Show all and Fit, and asserts against real DOM rects that no two cards are drawn on top of each other and that every table name stays between 11 and 13 CSS pixels.
