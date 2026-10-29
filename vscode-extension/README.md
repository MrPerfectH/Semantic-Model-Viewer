# Semantic Model Viewer for VS Code

**Explore your measures, model relationships, and Power Query flow in one place.**

Open local TMDL / PBIP files or `model.bim` in VS Code. Trace a measure through its DAX,
build a focused table canvas, and see how queries feed your tables. No Power BI Desktop,
Fabric connection, or Python is required for local model files. On Windows, use
**Connect to Power BI Desktop** in the Semantic Models view title bar or Command Palette
to connect to an open Desktop model and open its metadata in the viewer. If several models
are open, choose one from the list. This action runs from VS Code and requires no
administrator approval; it reads model metadata and does not execute DAX.

[Try the live demo](https://MrPerfectH.github.io/Semantic-Model-Viewer/) before installing.
The screenshots below use only the synthetic **Contoso Retail** demo. Select an image to
open it at full size.

## Install and start

Install [Semantic Model Viewer](https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer) in VS Code **1.85 or newer**. Alternatively, download the `.vsix` from [GitHub Releases](https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/latest) and run **Extensions: Install from VSIX…**. Marketplace installations update through VS Code; VSIX installations can be updated by installing a newer VSIX.

Open your PBIP project **folder**, then select a model under **Semantic Models** in the Activity Bar. Supported models are `*.SemanticModel` folders with TMDL definitions and `model.bim`; a `.pbix` or `.pbip` file alone is not supported. If none appear, check the folder and exclusion settings, then run **Semantic Model Viewer: Refresh Model List**. Hidden directories are skipped.

Use **+** in Tables to add a table, or select a measure in Measures. Optional first-use tips can be skipped and restarted through **Help**; the preference is saved in your VS Code profile without modifying model files. The browser demo is separate from the extension and needs no workspace.

## Power BI Desktop External Tools button (Windows)

1. In the VS Code Command Palette, run **Semantic Model Viewer: Add to Power BI External Tools**.
2. Choose **Add button** and approve Windows administrator access if requested. No installer is needed.
3. Restart Power BI Desktop. Click **Semantic Model Viewer (VS Code)** in its **External Tools** ribbon.

The button opens this extension in VS Code with the model from the Desktop window you
clicked. It reads the running model, including unsaved model changes; it does not need a
PBIP export. When Desktop supplies no model, the viewer opens empty. **Refresh Model**
rereads the connected model. Desktop must remain open; there is no continuous live sync.
The connection reads metadata without executing DAX or M or changing the Desktop model.
Report definitions and report usage are not included, and automatic date tables are omitted.

Registration is optional and normally needs administrator approval once because Power BI
stores ribbon entries in a machine-wide folder. Daily use runs as your normal user.
Company policies can restrict External Tools or PowerShell. VS Code may ask you to allow
the extension launch link on first use. Use the same VS Code profile where the extension
is installed; standard VS Code and VS Code Insiders are supported.

Run **Semantic Model Viewer: Remove from Power BI External Tools** before uninstalling
the extension to remove its button, then restart Desktop. Extension updates preserve the
registration. If VS Code moves, run **Add to Power BI External Tools** again. This button
is separate from any older standalone Viewer button.

## Measures

Follow the logic behind a measure. Trace what feeds it and what depends on it, then compare the DAX without losing your place.

- Search by name, folder, home table, or DAX; spot hidden measures and report usage.
- Switch between dependencies, DAX, and split view. Select a related measure to compare formulas.

| Dependency flow | DAX comparison |
| --- | --- |
| [![Gross Margin % dependency flow at 100% zoom, with upstream measures in purple and a downstream measure in blue](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-flow.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-flow.png) | [![Gross Margin % and Gross Profit formulas beside their dependency graph](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-dax.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-dax.png) |

## Tables

Build a canvas around the tables you care about. Read cardinality and filter direction on the relationship lines, and inspect the selected table beside the diagram.

- Add tables from the library or follow direct and indirect filter paths to related tables.
- Arrange, focus, and pin tables; save named views and navigate with the minimap.

| Relationship canvas | Table inspector |
| --- | --- |
| [![Sales and seven dimensions with cardinality pills, filter arrows, and a dashed inactive Date relationship](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/tables.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/tables.png) | [![A closer Sales neighborhood with the table source and relationship details in the inspector](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/table-inspector.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/table-inspector.png) |

## Power Query

See how queries, parameters, functions, and table partitions feed each other. Follow a flow from input to consumer and read the M behind it.

- Select a query for **Inputs** or a parameter for **Used by**. Inspect references and use **Back** to return.
- Read line-numbered M beside the flow, jump through highlighted references, or use **Open full query** and **Copy M**.

| Input flow | M and query details |
| --- | --- |
| [![Environment, StartYear, and RawSales feed StageSales, with ServerName upstream of RawSales](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/power-query-flow.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/power-query-flow.png) | [![StageSales input flow beside its inputs, consumer, and complete read-only M expression](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/power-query-inspector.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/power-query-inspector.png) |

Links come from static analysis of M. No query runs and no source data is read. Unconfirmed links remain explicit; snapshots include available query definitions.

## Additional (Domains and Matrix)

Step back to see the model as a whole. **Domains** groups related tables into a map you can expand; **Matrix** compares fact tables with their related tables across the model.

| Domains | Fact relationship matrix |
| --- | --- |
| [![All eleven Contoso Retail domains with table counts and connections between domains](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/domains.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/domains.png) | [![Fact tables across the matrix with related tables down the rows and active, bidirectional, and multiple relationship indicators](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/matrix.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/matrix.png) |

## Open a model

1. Open a workspace containing a `*.SemanticModel` folder or `model.bim`.
2. Select a model in the **Semantic Models** Activity Bar view. You can also run
   **Semantic Model Viewer: Open Model…**, or right-click a model folder or `model.bim`
   and choose **Open in Semantic Model Viewer**.
3. Use the viewer's model menu to switch between models in the workspace.

The extension lists models from **every folder** in the workspace. In a multi-root
workspace, each model shows its workspace folder name before its path. If a model comes
from a folder you do not want (for example this viewer's own repository), remove that
folder from the workspace or add a pattern such as `**/Archive/**` to
`semanticModelViewer.exclude`. `semanticModelViewer.defaultModel` only picks which model
opens first. It does not hide other models.

The extension refreshes models when their definition files change. Layouts and viewer
settings are saved in VS Code workspace state; table workspaces and saved views belong to
their model.

## Share an interactive snapshot

Use **Save snapshot** to create one self-contained HTML file with the model metadata,
DAX, available Power Query definitions, and current workspace and view. The recipient opens it in a browser without VS Code,
the repository, or a model connection. Changes in an opened snapshot remain in that tab;
save another snapshot to keep them.

Snapshots include analytical names, schema information, DAX and exact available M.
Endpoint strings and parameter values written in M are included; separate connection
settings and repository handles are omitted. Share definitions with their intended audience. Snapshot
files make no network requests. The extension package includes no sample business model
or report-usage dataset.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `semanticModelViewer.defaultModel` | `""` | Model folder or `model.bim` path, absolute or relative to the workspace. |
| `semanticModelViewer.exclude` | `[]` | Additional model-discovery glob exclusions, such as `**/Archive/**`. Hidden folders and `node_modules` are skipped. |

The command palette also provides **Refresh Model** and **Refresh Model List**. PNG export
is unavailable in the VS Code webview; use an interactive HTML snapshot to share a view.

<details>
<summary>Development and local packaging</summary>

Use Node.js 22 or later for the packaging tools. From the repository root:

```bash
cd vscode-extension
npm ci
npm test
npm run package
```

The package is `semantic-model-viewer-<version>.vsix`. This command builds locally; it does not
publish or install the extension. Pushing a `vX.Y.Z` tag (matching `package.json`) makes the
GitHub release workflow build, test and attach the `.vsix` to a GitHub Release for
manual installation.

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

### Provenance

Version 0.2.0 integrates the VS Code extension work recovered from
`origin/claude/model-viewer-vsc-plugin-dfmn8c` with the current shared viewer. It supersedes
the earlier 0.1.0 package, which targeted the former `viewer/` source directory.

</details>

### Connected repository Reports

The Semantic Models sidebar automatically discovers local `*.Report/definition.pbir` files in the open workspace. Expand a model to see Reports whose `datasetReference.byPath` points to that model; click a Report to open its definition. Model clicks still open the viewer. Use **Refresh Model List** after adding, removing, or changing Report bindings. Model discovery exclusions also apply to Reports. Published service connections are not shown as confirmed local connections.
