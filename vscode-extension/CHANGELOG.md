# Changelog

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
