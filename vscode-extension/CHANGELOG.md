# Changelog

## Next pre-release

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
