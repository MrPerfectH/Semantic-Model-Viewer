# Semantic Model Viewer for VS Code

![Semantic Model Viewer: build a table canvas, follow a measure through its DAX, browse domains and the fact matrix](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/demo.gif)

Explore Power BI semantic models from local TMDL / PBIP files or `model.bim`. Build a
working canvas from a table library, inspect relationships and filter direction, and trace
measure dependencies alongside the complete DAX expression, and see how Power Query queries,
parameters and functions feed each table. The viewer needs no Power BI Desktop, Fabric
connection, or Python.

## Power Query lineage

See how your queries feed each other. The **Power Query** tab draws parameters, functions, shared queries and every table's partition as a flow from input to consumer.

![Walkthrough: pick a query, follow its inputs and consumers, read its M and jump to a referenced query](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/power-query.gif)

- **Follow the flow.** Pick any query, parameter, function or table. See everything it reads from (**Inputs**) and everything that uses it (**Used by**).
- **Read the M.** A read-only panel shows the code with line numbers. Click a reference inside the code to jump to the query it uses. **Open full query** gives a wide reader, and **Copy M** copies the text exactly.
- **Stay oriented.** Search, filter connected or disconnected objects, and use **Back** to return to where you were.
- **Nothing runs.** Links come from reading the M text only. No query is executed and no source data is read. Links the viewer cannot confirm are listed, not guessed. Raw M stays out of shared snapshots.

![Inputs of a query: two parameters and a source query flow into Stage Sales](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/power-query-flow.png)

![The M of a query, with its inputs and consumers beside it](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/power-query-inspector.png)

## What you get

**Tables.** Start from a blank canvas and add only the tables you care about.

![A canvas of fact and dimension tables with their relationships](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/tables.png)

**Table inspector.** See a table's columns and relationships, and add its related tables by filter direction.

![The table inspector next to the canvas](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/table-inspector.png)

**Measures.** Follow a measure through everything that feeds it and everything built on it, next to its full DAX.

![The dependency flow of a measure](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/measure-flow.png)

**Domains and matrix.** Group tables into domains, and compare every fact table with the tables around it.

![Model domains](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/domains.png)

![The fact relationship matrix](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/main/docs/img/matrix.png)

Want to look first? [Try the live demo](https://MrPerfectH.github.io/Semantic-Model-Viewer/) in your browser. It needs no install.

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
  minimap to navigate larger diagrams. Hide the table library or the table inspector from
  the canvas toolbar when you want the full width for the diagram.
- **Measures:** search the library, inspect dependencies and dependents, and compare the
  graph with full DAX in graph, split, or DAX views.
- **Power Query:** follow queries, parameters, functions and table partitions from input to
  consumer, and read their M next to the flow.
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

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `semanticModelViewer.defaultModel` | `""` | Model folder or `model.bim` path, absolute or relative to the workspace. |
| `semanticModelViewer.exclude` | `[]` | Additional model-discovery glob exclusions, such as `**/Archive/**`. Hidden folders and `node_modules` are skipped. |

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
It includes `host-vscode.js` and `snapshot.js`; model JSON, usage JSON,
Python scripts, and fixtures are excluded. `npm run check-viewer` verifies exact runtime
file contents and rejects missing or unexpected files. `npm test` syncs and checks these
assets, then runs the shared viewer and extension regressions.

The extension host is plain CommonJS in `src/`. Its VS Code adapter connects the shared
viewer to workspace discovery, model reading, persistence, and export. Edit the canonical
viewer rather than generated `media/`.

## Provenance

Version 0.2.0 integrates the VS Code extension work recovered from
`origin/claude/model-viewer-vsc-plugin-dfmn8c` with the current shared viewer. It supersedes
the earlier 0.1.0 package, which targeted the former `viewer/` source directory.
