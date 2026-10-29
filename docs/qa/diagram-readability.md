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

## The app and the CLI: room decides, not the entry point

Rules driven by screen size apply everywhere. The CLI's answer views add only what
follows from opening on an answer.

| Behaviour | Main app | CLI answer view | Trigger |
|---|---|---|---|
| Legend dock and overview map step aside; their switches show what is on screen, and switching one on keeps it on | yes | yes (closed on open) | window under 820px tall, or canvas under 760px wide |
| Status line hidden | yes | yes | window under 820px tall |
| Canvas bar: short labels, display switches behind **View** (app) or **Tools** (CLI) | yes | yes | as above |
| Measures header in one row, graph controls in one toolbar | yes | yes | window under 1280px wide or 800px tall (always in the CLI) |
| Measures direction **Auto**: top to bottom with rows wrapped to the pane | yes | yes | graph pane under 760px wide, or portrait |
| **Focus** button for a selected table | yes | yes | always |
| No answer sentence above the diagram | — | yes | answer views |
| Table library, inspector and editing toolbar closed on open (**Tools** brings them back) | — | yes | answer views |
| Measures fit floor at 11px names, framed on the analyzed node | — | yes | answer views (the app opens at 100%) |
| No per-pane view pickers when each view has its own pane | — | yes | side-by-side workspace |

## Top to bottom in a narrow pane

Each dependency layer is a band whose measures wrap into rows no wider than the
pane. Rows are left-aligned, so the gaps between columns form gutters. Links are drawn
with right angles through open space only:

- out of a node's bottom, or out of its side when another node sits below it;
- along the channel between bands, and down a gutter through any band they skip;
- into the target's top, or, below a band's first row, across the gap just above it.

A node's links leave from one point and split in the channel. The +N expanders sit on
the node's corners, upstream above and downstream below, so the gutters stay clear.
Auto chooses left to right only when that already fits the pane whole at a readable
size. **Fit all** and the direction menu still override it.

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
  In narrow panes it also checks for top to bottom, no sideways scrolling and no link
  crossing a measure it does not connect. A second test opens the main app at 1280×720
  and checks the size rules above. Left-to-right flows still let a link that skips a
  layer curve over the boxes in between; the test reports those crossings but does not
  fail on them.
- `tests/star-layout.browser.cjs` checks the main-app Focus path at 1440×900 and
  1280×720.
