# Changelog

## 0.6.0 (30 October 2026)

Stable release. It includes everything since 0.4.3, from this list and from the 0.7 and 0.5 pre-releases below. Release notes: `docs/releases/0.6.0.md` in the repository.

- Fix `smv show --new-session` occasionally failing with a JSON error when it read a session file before the file was fully written (#193).

- Make diagrams readable without zooming (#187, #190):
  - Table and measure names render at 11px or larger when a view opens.
  - The new **Focus** button shows a table's direct neighbourhood, arranged, and pressing it again restores the layout. Focus stays on its table while you click around inside it.
  - On a short window or a squeezed canvas, the legend and overview map step aside and the bar stays on one line, with display switches behind **View**.
  - In the Measures view, the header fits one row. In a narrow pane the dependency flow runs top to bottom with tidy right-angle links (**Auto** direction), and inspecting a measure puts its DAX below the graph.
- Show full table cards, with every relationship's cardinality badge, when the pane has room (#192). After Arrange or Focus, spare height or width goes to the gaps between tables. When the star layout can't show full cards with every badge, the top-to-bottom layout is used instead. A layout or detail level picked under Display is kept.
- Agent answer views (`smv show`) open on the diagram alone; the agent gives the answer in the conversation. **Tools** brings back the table library, toolbar, legend and map. Unrelated tables fade once you start exploring.
- The side-by-side agent workspace shows one view per pane without pickers, and switches to named tabs below 1100px window width.
- Direction and DAX-position choices are buttons, and drop-down lists open inside embedded panes.

- Keep the Power BI Desktop connection and External Tools button in pre-release builds only until they pass Windows testing; stable builds hide them behind a switch in `src/features.js`.
- Fix Windows external CLI launchers in Unicode installation paths under legacy console code pages; restore the original code page and CLI exit status after execution.
- Lead CLI help and agent guidance with the live interactive viewer; confirm static PNG and offline HTML exports on stderr while preserving JSON stdout (#179).
- Add an accessible Measure library toggle, collapse it in focused explanations, and preserve its snapshot state (#180).
- Include real renderer workspace, viewport and node counts in native editor acceptance evidence.

- Keep matrix columns within usable widths on supported Windows VS Code hosts; retain horizontal scrolling for dense models.
- Preserve Power Query context on same-model refresh and clear stale refresh messages when opening models.
- Improve inspector theme contrast, matrix and measure readability, and short-window scrolling.
- Group cached Fabric metadata under On this device and expose workspace discovery exclusions.

- Put Fabric connection controls directly in the Semantic Models sidebar, with the account, tenant ID, Switch account and Sign out above an expandable workspace/model tree.
- Keep account controls visible when workspace discovery fails; refresh the sidebar after sign-in and sign-out.
- Replace the Fabric-only pre-release introduction with the complete feature summary and explain the CLI’s separate setup.

## 0.7.295 — pre-release (26 October 2026)

- Connect to Fabric, browse workspace models, and save metadata for offline reopening.
- Edit colours by source or table folder, with distinct fact and dimension styling and per-model persistence.
- Add a compact, collapsible legend and always-accessible Source / Table folder switch.
- Move disconnected-table and overview-map switches beside Fit and Center selected in the bottom canvas bar. Show Edit colours when the legend is open.
- Preserve zoom and position when selecting tables.
- Reduce relationship badge size beside compact tables while retaining cardinality, filter direction, and click targets.
- Follow VS Code light, dark, and high-contrast themes; fix inherited backgrounds in Power Query code.
- Preserve disconnected-table visibility in saved views and snapshots; remember Fabric colour preferences across workspaces for the same model.
- Require VS Code 1.101 or later.

The companion CLI and Claude plugin provide model-opening, focused views, snapshots, interactive sessions, and Fabric definition fetching. They have separate installation and authentication requirements and are **not bundled in the VS Code extension**.

## Earlier Fabric development work (included in the 0.7 pre-release)

- Require VS Code 1.101 or later for the Fabric host runtime.
- Integrate Fabric into develop pre-releases with all six native helpers and component notices. Main promotion still requires final acceptance.
- An additional enterprise workspace passed login/discovery but denied XMLA opens for all 16 models; effective Build permissions and XMLA configuration remain unconfirmed.

- Add work-account sign-in, workspace/model browsing, and explicit XMLA or Fabric definition API metadata access.
- Cache metadata for offline reopening and support refresh, account switching, sign-out, removal, and existing HTML snapshots.
- Keep authentication in the extension host with VS Code SecretStorage.
- Add native Fabric → workspace → model browsing, workspace-scoped searchable lists, and compact metadata status.
- Package self-contained XMLA helpers with component notices; use metadata-only consumer fallback when full definitions are unavailable.
- Reject token renewal into a different tenant and require explicit selection when multiple cached accounts are present.
- Standard login and live XMLA opening tested on macOS, Linux x64 and Windows x64. Controlled permission/fidelity checks and public standalone distribution acceptance remain open.

## 0.4.3

- Keep cardinality and filter-direction labels visible on parallel relationships when there is space elsewhere along the line, including inactive relationships. Preserve collision avoidance and the compact arrow view at low zoom.

## 0.4.2

- Add animated workflow GIFs, video links, and the illustrated VS Code guide to the extension README shown in VS Code and Marketplace.

## 0.4.1

- Keep the Measures overview visible while searching or filtering. Open matching formulas in an optional dialog with the same syntax colors and reference navigation as the Measures workspace.

## 0.4.0

- Analyze a table or column to find directly and indirectly dependent measures. Filter to direct references, search the results, and inspect a formula while keeping the source selected.
- Follow colored table, column and measure reference chips from original or inlined DAX. Each formula card shows its own references.
- Browse filtered measures with a formula overview.
- Preserve source analysis, inspected formula, display preferences and graph viewport in interactive HTML snapshots. Snapshots without saved Explore settings start with directly connected tables, including inactive relationships.
- Keep table cards the same height on hover so relationship lines stay attached.
- Keep at least 240 pixels of graph canvas in stacked Measures layouts, with DAX reachable by scrolling and an accurate narrow-layout label.
- Unify the Spellbook palette across workspaces and simplify the Tables toolbar.

Dependency analysis reads static DAX references; it does not execute DAX or follow calculated-column/table defining expressions or relationship filter propagation. The existing snapshot CLI remains available. Guided onboarding, agent sessions and visual explanations, MCP/inline apps, and Power BI External Tools installation are not part of this release.
## Unreleased

- Follow the active VS Code light, dark, and high-contrast theme, including live changes. Browser and snapshot Classic/Spellbook appearances stay unchanged.
- Keep at least 240 pixels of dependency graph canvas in stacked split view. When the window is too short for both panels, scroll the workspace to reach DAX instead of compressing the graph.
- Show “DAX below graph (narrow view)” when the layout automatically stacks. Restore the saved beside layout and its label when the window is wide enough.

## 0.5.173 — pre-release

This development preview includes the following changes since the last documented release:

- Analyze a table or column to find its direct and indirect dependent measures. Use **Direct only** to narrow the list, then inspect a formula while keeping the source selected.
- Navigate from colored table and column references in formula cards into dependency analysis. Inlined DAX shows the references in the expanded formula.
- Browse and search measures with a formula overview and clearer source navigation.
- Use optional first-run and contextual guidance; skip the tips when you do not need them.
- Preserve analysis state in interactive HTML snapshots, including the selected source, inspected formula, filters and layout preferences.
- Add interactive viewer sessions and visual explanations for model exploration.
- Verify the new Power BI External Tools registration content before reporting installation success; an older file no longer counts as a successful update.

Known limitations: dependency analysis is static and does not execute DAX or Power Query. The Power BI External Tools button opens the viewer; it does not automatically connect to the active Desktop model. This preview can compress the graph excessively in narrow split views; the fix is listed under Unreleased above.

## 0.3.9

- Add an optional Spellbook theme with parchment surfaces and burgundy accents. Use the Classic dropdown in the top toolbar to select Spellbook.
- Remember the selected theme and preserve it in offline snapshots.
- Include Power Query definitions and workspace state in offline snapshots.

## 0.3.8

- Find SemanticModel folders before reading repository imports to avoid freezing on unrelated JSON dumps.
- Show clear errors when a model transfer fails.
- Release the diagram transform hint after panning or zooming.
- Include all Power Query styles in the web demo release.

## 0.3.7

- Organize the Marketplace page into Measures, Tables, Power Query and Additional sections, with eight screenshots.
- Include Power Query metadata in the built-in demo model.

## 0.3.6

- Include the license in the extension package, so the Marketplace page shows it.

## 0.3.5

- **Power Query lineage.** The new **Power Query** tab shows how queries, parameters, functions and
  table partitions feed each other, as a flow from input to consumer.
- Pick any object to read its M in a read-only, line-numbered panel. Click a reference to jump to the
  query it uses. **Open full query** opens a wide reader and **Copy M** copies the text exactly.
- Follow the flow upstream (**Inputs**) or downstream (**Used by**). Filter connected or disconnected
  objects, and use **Back** to return to where you were.
- Read M statically in a cancellable background worker. Nothing is run and no source data is read.
  Links the viewer cannot confirm, cycles and missing metadata are shown instead of guessed.
- Keep raw M out of shared snapshots. Works with TMDL partitions and shared expressions, and with `model.bim`.
- Remove the Semantic Model Cleaner integration.

## 0.3.4

- Add toolbar toggles on the Tables canvas to hide the table library (left) and the table
  inspector (right), giving the model canvas the full width. The choice is remembered.
- Inline measures in the DAX view: the analyzed measure shows its DAX with every referenced measure replaced by that measure's DAX, one colour per level. Fold any inlined measure or nested call with the arrows in the left margin. Switch between SQLBI-style long and short lines, view the result as plain text, and copy it as DAX or as an `EVALUATE ROW` query.
- Drop the TMDL ``` fences from multi-line measure expressions, including in models imported earlier.
- Let the DAX card fill the panel; the referenced columns list sits at the bottom.
- Route straight relationship lines around table cards, choosing each collapsed card’s connection side from its position and proportions, with separate ordered ports. Expanded cards keep their column anchors.

- Keep measures, columns and tables whose names contain an apostrophe (`measure 'Owner''s Total'`). They were silently dropped before.
- Stop the hosted demo from probing for the local app, which logged a 404 in the browser console.

## 0.3.3

- Refuse requests to the local server that use a foreign host name, which closes a DNS-rebinding gap.
- Reopen the Mac app window after the viewer window is closed.
- List measure name matches before DAX-only matches in measure search.

## 0.3.2

- Show cardinality and filter direction together in one pill (`* ◂ 1`) on every relationship, so lines no longer hide their cardinality behind stacked markers.
- Leave room between cards in the focused view so those pills fit.

## 0.3.1

- Make the Muted palette's table accent colours clearly visible.
- Web app: Refresh re-reads a model imported from a folder without asking for the folder again.

## 0.3.0

- Add the MIT license.
- Replace the built-in sample with a synthetic "Contoso Retail" demo model.
- Ship the same viewer as an installable web app (PWA) hosted on GitHub Pages.
- Release `.vsix` packages through GitHub Releases.

## 0.2.1

- Combine star, constellation and layered layouts with the current desktop viewer.
- Keep table labels readable at overview scale and center measure dependency graphs.
- Group large dependent lists and improve view switching.
- Correct unnamed TMDL database imports and preserve per-model layout scale.
- Start new web profiles without a selected model; restore an explicitly chosen model.
- Harden desktop launcher paths and local server startup checks.

## 0.2.0

- Integrate the extension with the canonical `Models/tools/viewer` application.
- Add the table library, blank canvas, relationship expansion, saved views, and minimap.
- Include the redesigned measure workspace and complete DAX inspection.
- Support self-contained HTML snapshots for offline model sharing.
- Package all required viewer CSS and JavaScript, including the VS Code host, cleaner
  usage adapter, and snapshot runtime. Exclude sample model and report datasets.
- Run the shared viewer and extension regression suites together and verify generated
  assets before packaging.

## 0.1.0

- First release: open any `*.SemanticModel` folder or `model.bim` from the workspace in the
  Semantic Model Viewer (graph canvas, clusters, relationship matrix, measure dependency
  flow).
- **Semantic Models** view in the Activity Bar listing every model in the workspace.
- Explorer context menu entry on `*.SemanticModel` folders and `model.bim` files.
- `semanticModelViewer.defaultModel` setting to open a model without picking.
- Live refresh when TMDL files change on disk.
- Optional report-usage badges from a Semantic Model Cleaner analysis (run it from the
  viewer or load an existing `smc --format json` export).

## Unreleased

- Add a Windows Power BI Desktop ribbon registration that launches installed VS Code directly, reads the exact Desktop model (including unsaved metadata), and rereads it on Refresh Model.
- Explain registration changes before Windows approval, support Common Files folder lookup without inherited environment variables, and bundle the official model client for Store installations.
