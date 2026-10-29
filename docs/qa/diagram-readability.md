# Diagram readability bar

A diagram is readable when a person can read it on first open, without zooming.
This bar applies to the views that `smv show` and the other answer views open, and to
the focused views reached from the main app.

## The bar

1. **Names are 11px or larger on screen.** This covers every table name on the Tables
   canvas and every measure name in a Measures dependency flow, at the zoom the view
   opens at. The measured value is the computed font size of the element that carries
   the name, multiplied by the zoom it is drawn at.
2. **The focus and its direct neighbours are on screen.** Tables: every table in the
   answer is inside the visible canvas, and no two cards overlap. Measures: the analyzed
   measure or source table is fully visible. Its direct dependents are framed with it
   when they fit, and anything further away is a scroll away.
3. **The diagram gets the space.** An answer view opens with no answer banner, legend,
   overview map, table library, inspector or status line. The Tables canvas takes at
   least 75% of the pane height, and the Measures graph at least 60%.

Zoom % is reported but is not part of the bar. Below 82% zoom (70% in the main app),
tables are drawn as name chips, which keeps names at 11–13px whatever the zoom. Full
cards appear once their 13.5px titles are at least 11px on screen.

The bar is checked at 1280×720, in a 1100×800 side-by-side workspace, and at
1920×1080.

## Whole-model overviews

A whole-model overview may open zoomed out. For a large model, names below 11px are
acceptable there. The way to a readable view is one click: select a table, then press
**Focus** in the canvas bar. Focus hides everything except that table and its direct
neighbours, and arranges them for the visible canvas. Pressing Focus again undoes it.

## How it is achieved

- **Answer views open compact.** The CLI's answer views show only the diagram. In the
  Tables view, the canvas bar keeps zoom, Fit, Center and Focus. **Tools** brings back
  the editing toolbar, legend, map and colour options. The Measures header is one row,
  and the graph has one toolbar.
- **Auto detail in answer views.** A fit that lands below the card threshold draws
  name chips. Fit never settles on a card zoom that only chips would fit.
- **The star turns to fit.** When another start angle fits a single-hub star into the
  visible canvas at a zoom at least 8% larger, the ring uses that angle.
- **Measures fit has a floor.** An answer view never fits a flow below the zoom at
  which measure names are 11px. If the flow is larger than that, the view opens on the
  analyzed node and its direct neighbours, and **Fit all** still shows everything. The
  layout's fixed outer margins are trimmed to 28px, and a source table sits level with
  the measures it feeds.

## Regression tests

- `tests/diagram-readability.browser.cjs` opens `smv show` for Contoso Retail
  Inventory, a chain-shaped star with a three-layer flow, and Sales, a dense flow.
  It opens both the side-by-side workspace and the single views at the sizes above,
  then asserts every part of the bar.
- `tests/star-layout.browser.cjs` checks the main-app Focus path at 1440×900 and
  1280×720.
