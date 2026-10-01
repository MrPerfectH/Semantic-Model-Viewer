# Semantic Model Viewer for VS Code

Explore Power BI semantic models from local TMDL / PBIP files or `model.bim`. Build a
working canvas from a table library, inspect relationships and filter direction, and trace
measure dependencies alongside the complete DAX expression. The viewer needs no Power BI
Desktop, Fabric connection, or Python. Python is only needed for the optional cleaner tool.

## Open a model

1. Open a workspace containing a `*.SemanticModel` folder or `model.bim`.
2. Select a model in the **Semantic Models** Activity Bar view. You can also run
   **Semantic Model Viewer: Open Model…**, or right-click a model folder or `model.bim`
   and choose **Open in Semantic Model Viewer**.
3. Use the viewer's model menu to switch between models in the workspace.

The extension refreshes models when their definition files change. Layouts and viewer
settings are saved in VS Code workspace state; table workspaces and saved views belong to
their model.

## Explore and share

- **Tables:** start with a blank canvas, add or drag tables from the library, and expand
  related tables by incoming filters, outgoing filters, or all connections. Choose direct
  relationships or follow indirect paths. Focus and pin tables, save views, and use the
  minimap to navigate larger diagrams.
- **Measures:** search the library, inspect dependencies and dependents, and compare the
  graph with full DAX in graph, split, or DAX views.
- **Domains:** inspect model groups and expand their member tables.
- **Matrix:** compare fact tables with their related tables.
- **Save snapshot:** create one self-contained HTML file containing the complete model
  metadata and DAX, plus the current workspace and view. The recipient opens it in a
  browser without VS Code, the repository, or a model connection. Changes in an opened
  snapshot remain in that tab; save another snapshot to keep them.

Snapshots include analytical names, schema information, and DAX. They omit source
connection endpoints, raw partition queries, and repository handles. Review the model
metadata and formulas before sharing: DAX can itself contain sensitive text. Snapshot
files make no network requests. The extension package includes no sample business model
or report-usage dataset.

## Optional report usage from Semantic Model Cleaner

Report-usage information appears only after loading an analysis from
[Semantic Model Cleaner](https://github.com/MrPerfectH/Semantic-Model-Cleaner). An absent
analysis does not mean a measure is unused.

With a model open, run **Semantic Model Viewer: Load Semantic Model Cleaner Analysis…**
and choose an existing cleaner JSON export or run the cleaner locally. To use the latter,
install `semantic-model-cleaner` in your Python environment and make `smc` available on
PATH, or configure its full executable path. Automatic runs are disabled by default.

Model browsing is available in Restricted Mode. Running the cleaner requires a trusted
workspace; its executable, arguments, reports path, and automatic-run setting are restricted
until workspace trust is granted. Loading an existing analysis does not run a subprocess.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `semanticModelViewer.defaultModel` | `""` | Model folder or `model.bim` path, absolute or relative to the workspace. |
| `semanticModelViewer.exclude` | `[]` | Additional model-discovery glob exclusions, such as `**/Archive/**`. Hidden folders and `node_modules` are skipped. |
| `semanticModelViewer.cleaner.command` | `"smc"` | Local cleaner executable. |
| `semanticModelViewer.cleaner.reportsPath` | `""` | Reports folder; empty uses the workspace folder. |
| `semanticModelViewer.cleaner.extraArgs` | `[]` | Additional cleaner command arguments. |
| `semanticModelViewer.cleaner.autoRun` | `false` | Run the cleaner when a model opens or refreshes. |

The command palette also provides **Refresh Model** and **Refresh Model List**. PNG export
is unavailable in the VS Code webview; use an interactive HTML snapshot to share a view.

## Development and local packaging

Use Node.js 22 or later for the packaging tools. From the repository root:

```bash
cd vscode-extension
npm ci
npm test
npm run package
```

The package is `semantic-model-viewer-<version>.vsix`. This command builds locally; it does not
publish or install the extension. Pushing a `vX.Y.Z` tag (matching `package.json`) makes the
GitHub release workflow build, test and attach the `.vsix` to a GitHub Release, which is the
supported way to install it until a Marketplace listing exists.

To test interactively, open either the repository root or `vscode-extension/` in VS Code
and press F5 using **Run Semantic Model Viewer extension**. The pre-launch task syncs the
viewer and the development host opens `tests/fixtures`. To install a package manually,
use **Extensions: Install from VSIX…** and select the generated file.

The canonical viewer is `Models/tools/viewer/` at the repository root. `npm run sync-viewer`
copies its HTML, CSS, and JavaScript into generated, ignored `vscode-extension/media/`.
It includes `host-vscode.js`, `usage-adapter.js`, and `snapshot.js`; model JSON, usage JSON,
Python scripts, and fixtures are excluded. `npm run check-viewer` verifies exact runtime
file contents and rejects missing or unexpected files. `npm test` syncs and checks these
assets, then runs the shared viewer, extension, and usage-adapter regressions.

The extension host is plain CommonJS in `src/`. Its VS Code adapter connects the shared
viewer to workspace discovery, model reading, persistence, and export. Edit the canonical
viewer rather than generated `media/`.

## Provenance

Version 0.2.0 integrates the VS Code extension work recovered from
`origin/claude/model-viewer-vsc-plugin-dfmn8c` with the current shared viewer. It supersedes
the earlier 0.1.0 package, which targeted the former `viewer/` source directory.
