# Table and column dependency QA

Date: 2026-10-18

## Visual truth and scope

Accepted expanded-graph concept:
`/home/harry/.codex/generated_images/01a14f33-746b-7303-babc-4770f08478f9/exec-5d702bb6-5a75-42fd-8f7c-44728389435f.png`

Accepted column-selection concept:
`/home/harry/.codex/generated_images/01a14f33-746b-7303-babc-4770f08478f9/exec-d1019c6b-fb78-4118-ae8e-f32609f51f28.png`

The user requested the existing application colors and only columns required by
the visible dependency links. The conceptual graph, rather than the generated
screen's invented metadata or icons, is the implementation target. The existing
application shell, fonts, graph renderer, DAX panel, split positions and icons are
retained. Calculated-column expressions remain outside the traversal scope.

## Browser evidence

Implementation URL: `http://localhost:8765/?dependencies-preview=final`.
The preview uses the production application with a small illustrative model,
loaded in browser memory. Revenue uses Sales[Amount], Sales Rows uses the whole
Sales table, and Average Sale uses both measures. Quantity and Unused exist in
the model but are omitted from the source card.

Expanded graph:
`/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvdxt3ok-9c2c311a.png`

Final selected Amount, inspecting Revenue:
`/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvdxu3e3-289d80f5.png`

Narrow source view:
`/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mvdxtnnb-59748a46.png`

Desktop CSS viewport: 1440 × 1024. T3 saves the desktop captures at 1280 × 910;
the capture service scales the rendered output. Expanded reference pixels:
1586 × 992. Full views were compared at equal display widths without stretching;
focused implementation views were also inspected at the saved image's full width.
The mock and implementation have different aspect ratios and illustration data,
so this is a functional composition comparison, not a pixel-diff assertion.

Both source and implementation were placed together in the same `html_preview`
comparison input, with an additional scrollable full-width detail. Expanded and
selected-column states were compared independently. A local copy of the initial
expanded comparison is `/tmp/smv-dependency-qa-comparison.html`.

## Comparison history and findings

- P2, opening readability: fitting the source graph made column labels too small
  in the split panel. Source graphs now start at 100%, focusing the source;
  Fit all remains explicit. The final captures show readable source and measure
  labels, with panning for diagrams wider than the panel.
- P2, selected-row contrast: palette colors can be too pale for small text.
  Selected source rows now use dark text, a palette-colored inset stripe and a
  subtle tint. Whole-table edge labels use neutral text. The final selected-column
  comparison was captured after this correction.
- No remaining actionable P0/P1/P2 findings in the verified states.

## Required fidelity surfaces

- Typography: canonical IBM Plex Sans/Mono styles are reused; source labels have
  full-name accessible labels and tooltips when visually truncated.
- Spacing/layout: existing beside/below split and adjustable divider remain.
  The comparison uses the supported below layout so the entire example fits at
  readable scale. At 900 × 800 both panels remain inside the analysis body;
  graph panning and DAX scrolling handle overflow within their own panels.
- Colors: source accents and edges use `app.tableColor`, including palette and
  color-by cache invalidation. Measure upstream/downstream colors stay unchanged.
  Whole-table references are distinguished with a dashed edge and text, rather
  than depending on color alone.
- Assets: application icons and the existing DOM/SVG graph renderer are reused.
  No generated raster interface or placeholder artwork ships in the application.
- Copy: table/column source, direct/indirect counts, Whole table, empty results,
  search limits and display-cap notices describe the implemented behavior.

Intentional differences from the mock: unreferenced columns and unrelated
measures are omitted when narrowing the source; home-table membership does not
create an edge; inspecting DAX uses the existing DAX workspace. Static reference
limits are documented in README.md and the source analysis panel.

## Interaction and regression verification

- Existing measures-only graph and the optional source-reference switch.
- Whole-table edges attach to headers; column edges attach to their own rows.
- Selecting a table includes its column and whole-table references.
- Selecting Amount excludes Sales Rows and retains indirect Average Sale.
- Direct-only filtering, dependent-measure search, DAX inspection and reanalysis.
- Table drawer and per-column entry actions; empty source results.
- All graph orientations, expansion, grouped measures and readable initial zoom.
- Snapshot source/selection/preferences/viewport round-trip and legacy snapshots.
- Calculated-column sources, escaped/case-insensitive names, strings/comments,
  variable names, unresolved references, cycles and model isolation.
- Complete regression run: 246 passed, none failed or skipped, including browser
  and snapshot export checks. The final CSS correction was followed by the
  13-check browser suite, all passed. VS Code's 19 runtime assets are synchronized.
- Browser runtime error collection stayed empty during the interactive preview.

## Follow-up polish

Long whole-table reference paths can cross column paths; header/row attachment,
dash pattern and text keep their meaning explicit. Further routing refinement is
optional. Large-model performance has not been benchmarked; no capacity claim is
made beyond the displayed graph limits.

final result: passed

## Follow-up: approved source library and formula ownership

The 2026-10-19 implementation and visual QA for all four approved refinements are
recorded in [the current QA report](../design-qa.md). This earlier report covers
the initial table/column graph implementation.
