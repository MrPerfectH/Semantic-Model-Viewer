# Compare two measures

Use the existing Measures workspace to compare static calculation structure and written DAX:

```sh
smv compare "Retail.SemanticModel" --measure "Sales Amount" --with "Gross Margin LY"
smv compare "Retail.SemanticModel" --measure "Sales Amount" --with "Gross Margin LY" --out comparison.html
```

The first command starts or reuses a compatible local session and returns a single named comparison view URL. Open `views[0].url`. Use `--open system` to open it locally. Repeating the ordered pair reuses its named view and preserves exploration. HTML export works without a server or browser and includes **full-model metadata and DAX**, beyond the starting comparison. PNG capture requires Chrome/Chromium; a screenshot captures the visible viewport, so use tabs or scroll the interactive view to inspect everything.

In VS Code, Copilot can invoke `smv_compare` with `measure`, `with`, and optionally the model ID returned by `smv_discover`. It calls the same engine in a worker and opens one editor panel. Claude Code and Codex use the packaged launcher; no separate CLI installation is required in complete portable packages.

For manual entry, open **Measures → Compare measures**, choose the first and second calculations, and click **Start comparison**. This is available from the Measures overview and from an analyzed measure. The picker requires two distinct choices instead of choosing an arbitrary second measure. Change the roots later with the comparison selectors. Each row retains the native graph and library; one toolbar at the top controls both rows. Dependency selection inspects its formula without replacing either root. Table/column references are on by default. Desktop always shows both graph/DAX rows. Narrow windows automatically use measure tabs. Shared settings include Split view/DAX/Dependencies, DAX position, graph direction, table/column references, wrapping, inlining, Compact and formula layout. Resizing the graph/DAX split also updates both rows. Pan, zoom, copying and inspecting individual calculations remain local. Both comparison roots stay visibly marked wherever they appear in either graph. Shared coordinates are aligned for the bounded left-to-right upstream graphs. Other native orientations remain available with independent layout.

- Blue identifies a shared model object.
- Pink identifies the same written measure definition contributing to both sides.
- Amber identifies side-specific written logic or a connection. A column can be shared while an additional edge from that column to a different calculation is amber.
- Names, tooltips and the legend explain these classifications alongside color.

The compact inlined DAX is an inspection aid. It shows the common inner definition inside different outer syntax, rather than coloring common tokens such as `SUM` indiscriminately. Turn **Compact** off for native fold controls, or choose **Loaded original** for the loaded formula without expansion. Original formulas are preserved in analysis output. The source parser can normalize TMDL fences and whitespace; this is not a byte-exact source-file extract.

This comparison does not execute DAX, prove numeric equivalence or simulate relationship propagation. Inlining can lose implicit context transition. Equal formula text on different measure identities is reported separately, rather than called a shared calculation. Static analysis follows up to 200 calculations on each side; expansion has depth, occurrence and text budgets and leaves residual references at a cycle or limit. Unresolved references and incomplete analysis are explicit; absence from a truncated scope does not establish uniqueness. Unsupported formatting falls back to the loaded original.

Native **Save snapshot**, explored-view export and reopening preserve the pair, active tab, shared display preferences, independent inspection/formula folds and camera context. Session acknowledgements count graph nodes for both rows. `awaiting-viewer` does not claim that a browser rendered anything. Source-change checks and the Apply/Keep exploring protocol continue to apply.

An authored comparison is one version 2 Measures view:

```json
{
  "version": 2,
  "mode": "measures",
  "banner": false,
  "comparison": {
    "version": 1,
    "left": {"kind": "measure", "table": "Measures", "name": "Sales Amount"},
    "right": {"kind": "measure", "table": "Measures", "name": "Gross Margin LY"},
    "maxMeasures": 200
  }
}
```

`maxMeasures` accepts 1–200. The read-only engine API exposes `compare(loaded, {measure, with, maxMeasures})`, returning analysis and one authored view plan. Ordered roots and bounds are part of view identity. This feature explains model structure; it does not rank, delete or optimize model objects.
