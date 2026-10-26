# Semantic Model Viewer for VS Code

**Explore your measures, model relationships, and Power Query flow in one place.**

Open local TMDL / PBIP files or `model.bim` in VS Code. Trace a measure through its DAX,
build a focused table canvas, and see how queries feed your tables. No Power BI Desktop,
Fabric connection, or Python is required for local files.

[Try the live demo](https://MrPerfectH.github.io/Semantic-Model-Viewer/) before installing.
The screenshots below use only the synthetic **Contoso Retail** demo. Select an image to
open it at full size.

## Fabric connection (development preview)

Requires desktop VS Code 1.101 or later for its Node.js 22 extension host.

Open **Semantic Models** in the Activity Bar. The expanded **Fabric** section shows
**Sign in to Fabric…** when signed out. When signed in, it shows your account, tenant ID,
**Switch account…**, and **Sign out of Fabric**. Expand **Workspaces**, then a workspace
to load its semantic models; click a model to open it. Use Refresh on the Fabric row
to reload discovery. Account actions stay available if workspace discovery fails.
Saved models remain in the Semantic Models list for offline access.

The existing **Semantic Model Viewer: Connect to Fabric…** command also remains available.
The sidebar uses the standard XMLA path, which requires Read + Build permission and an enabled
XMLA endpoint on supported capacity. The command’s optional **Fabric definition API** path
requires model edit access. Both paths read metadata without model writes or data refreshes.
The consumer metadata fallback uses fixed INFO.VIEW metadata queries; definitions may be
unavailable depending on permissions.

Users do not need to register an application or supply credentials to the viewer. Microsoft
sign-in happens in the browser, and tenant consent, MFA, and Conditional Access still apply.
The package must include MSAL and a published .NET XMLA helper for the host platform.

The extension runs on the desktop UI host, including when the workspace is remote. VS Code
for the Web is unsupported. XMLA helper support depends on the binaries included in the build;
source builds require the .NET SDK to publish the helper before packaging.

Saved metadata opens offline and displays its fetch time. **Refresh Model** downloads a new
copy using the same connection method and account; a failed refresh preserves the saved copy.
**Switch Fabric Account…** and **Sign Out of Fabric** control the session. Tokens stay in VS Code
SecretStorage and never enter the viewer webview or snapshots. Signing out retains offline
metadata; **Remove Saved Fabric Model…** removes the saved metadata and associated viewer layout.
HTML snapshots can be shared without a Fabric connection and contain the model metadata you
choose to export, including available definitions.

## Watch the workflows

[Full illustrated VS Code guide](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/main/docs/vscode-guide.md). These recordings use the synthetic Contoso Retail model. Select a video link to watch it in your browser.

### Install and open a model

[Watch installation — 10 seconds](https://MrPerfectH.github.io/Semantic-Model-Viewer/media/vscode-guide/install-extension.mp4) · [Watch opening a model and exploring DAX — 35 seconds](https://MrPerfectH.github.io/Semantic-Model-Viewer/media/vscode-guide/vscode-to-dax-v4.mp4)

![Find the extension, install it, and choose a model](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/install-extension.gif)

### Focus the table canvas

[Watch the table workflow — 24 seconds](https://MrPerfectH.github.io/Semantic-Model-Viewer/media/vscode-guide/focus-tables.mp4)

![Select a table and dim unrelated tables](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/dim-and-switch.gif)

![Hide unrelated tables and arrange the focused canvas](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/hide-and-arrange.gif)

### Follow a table into its measures and DAX

![Find direct and indirect measures that depend on Sales](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/table-to-dependent-measures-v2.gif)

![Inspect a dependent measure and double-click to analyze it](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/select-dependent-measure-v3.gif)

![Expand referenced measures with Inline measures](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/1bdb507f88d4c16df39b04f341e918a60cd4a940/docs/media/vscode-guide/inline-dax-v2.gif)

The installation recording shows 0.3.9; its installation steps still apply. Feature recordings were made during development and demonstrate features available in stable 0.4.0 and newer.
## Install and start

Install [Semantic Model Viewer](https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer) in VS Code **1.101 or newer**. Alternatively, download the `.vsix` from [GitHub Releases](https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/latest) and run **Extensions: Install from VSIX…**. Marketplace installations update through VS Code; VSIX installations can be updated by installing a newer VSIX.

Open your PBIP project **folder**, then select a model under **Semantic Models** in the Activity Bar. Supported models are `*.SemanticModel` folders with TMDL definitions and `model.bim`; a `.pbix` or `.pbip` file alone is not supported. If none appear, check the folder and exclusion settings, then run **Semantic Model Viewer: Refresh Model List**. Hidden directories are skipped.

Use **+** in Tables to add a table, or select a measure in Measures. Optional first-use tips can be skipped and restarted through **Help**; the preference is saved in your VS Code profile without modifying model files. The browser demo is separate from the extension and needs no workspace.

## Measures

Follow the logic behind a measure. Trace what feeds it and what depends on it, then compare the DAX without losing your place.

- Search by name, folder, home table, or DAX; spot hidden measures and report usage.
- Switch between dependencies, DAX, and split view. Select a related measure to compare formulas.

| Dependency flow | DAX comparison |
| --- | --- |
| [![Gross Margin % dependency flow at 100% zoom, with upstream measures in purple and a downstream measure in blue](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-flow.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-flow.png) | [![Gross Margin % and Gross Profit formulas beside their dependency graph](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-dax.png)](https://raw.githubusercontent.com/MrPerfectH/Semantic-Model-Viewer/70ed5cdc473812c586874efc6e4ff00f4aeb2700/docs/img/marketplace/measure-dax.png) |

Select **Table or column** in the Measures library, or **Find dependent measures** in the table inspector, to analyze a source. Inspecting a result keeps that source selected. Colored reference chips beneath each formula open the corresponding analysis. Use **Direct only** to exclude indirect dependent measures. This is static DAX reference analysis; calculated-column/table defining expressions and relationship filter propagation are outside its scope.

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

Every successful push to `develop` publishes the tested extension to the **pre-release**
channel of the existing Marketplace listing. In VS Code, open **Semantic Model Viewer**
in Extensions and select **Switch to Pre-Release Version**. With auto-update enabled,
subsequent develop builds arrive automatically. Select **Switch to Release Version**
to return to stable. Pre-releases are public and available to anyone who opts in.

The CI workflow can also be run manually against `develop` to publish its current commit.
Publishing requires the repository's `VSCE_PAT` secret with Marketplace publishing access;
pull requests never publish or receive this secret.

CI assigns a unique numeric preview version only in its build checkout. It uses the next
odd minor above the committed version and the CI run number as the patch: committed
`0.3.9` produces `0.5.<run number>`, leaving `0.4.*` available for stable releases.
Future stable releases should use even minor versions (`0.4.*`, `0.6.*`, etc.). When
stable advances to `0.6.*`, develop previews advance to `0.7.*`. Re-running a CI run
keeps the same version and skips an already-published package. Stable publishing
continues through the existing release workflow on `main`.

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
