# Changelog

## Unreleased

- Inspect read-only Power Query partition M and shared queries, parameters and functions.
- Explore all Power Query objects in a peer model workspace with input-to-consumer
  references, exact source navigation, Back history, connectivity filters and minimap.
- Build static analysis in a cancellable background worker; disclose uncertainty,
  cycles and unavailable metadata without claiming complete lineage.
- Keep raw M excluded from shared snapshots; no M evaluation or source-data reads.
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
