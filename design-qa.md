# Measures source workflow verification

Date: 2026-10-19

final result: passed

## Visual truth and scope

Approved concepts (directory `/home/harry/.codex/generated_images/01a14f33-746b-7303-babc-4770f08478f9/`):

- Inline: `exec-6a190836-0a61-4a99-abf7-915b5915f5b0.png`.
- Source, graph and inspector roles: `exec-a99a3177-b3ac-4928-97dc-53cace89e7cd.png`.
- Card-owned references: `exec-ad9c70a1-9578-4880-9442-2ea7d615065e.png`.
- Table/column source picker: `exec-a4547f28-8a32-4095-811b-eab93495af4e.png`.

The approved interaction model is implemented in the existing application. Existing
fonts, graph rendering, formatting/folding controls, semantic theme tokens and
responsive card stacking remain authoritative. Generated mock data, invented icons,
line numbers and larger type are not changes to the production design system.

## Evidence

Browser: T3 collaborative preview, `http://100.115.251.31:8765/`.
Artifact directory: `/home/harry/.t3/userdata/browser-artifacts/`.

- Source inspection, Credit Amount → Operating Expenses, top-to-bottom, Fit all:
  `browser-screenshot-100-115-251-31-mvee4xtj-2e38beac.png`.
- Original Operating Expenses / Operating Profit, DAX view:
  `browser-screenshot-100-115-251-31-mvee3sio-627a9058.png`.
- Expanded Operating Expenses / original Operating Profit:
  `browser-screenshot-100-115-251-31-mvee3vz4-35d77394.png`.
- Same expanded comparison in Spellbook:
  `browser-screenshot-100-115-251-31-mvee4gh7-5cc0ea77.png`.
- Whole-table source retained while browsing all model tables:
  `browser-screenshot-100-115-251-31-mvee60ei-b6065395.png`.
- Filtered picker with all seven GL Entries columns:
  `browser-screenshot-100-115-251-31-mvee5256-6fd2586c.png`.
- Narrow source inspection, 900 × 720 CSS pixels:
  `browser-screenshot-100-115-251-31-mvee69ww-15c368c6.png`.

Desktop captures used 1920 × 1080 CSS pixels, saved at 1280 × 720 pixels
(scale 2/3). Narrow capture is 1280 × 1024 pixels (scale 1280/900).
Source mock dimensions: 1686 × 933 for roles/references, 1586 × 992 for picker.
Compared complete views in a combined 1600px T3 HTML preview, preserving aspect
ratios and equal displayed width. Used a second combined preview with enlarged
reference-summary and left-navigation crops to inspect readable controls and labels.
The picker crop was also checked against the filtered picker capture so its expanded
GL Entries columns were visible. DAX-only is the explicit mode for comparing the two
full-width cards; narrow split inspectors use the existing stacked layout.

## Comparison history and findings

- [P2, fixed] Inspecting a dependent measure could leave its node outside the viewport
  after the graph narrowed. Inspection now centers the selected node while keeping
  the source unchanged. Post-fix: `mvee3d6u-2fbce673` capture and browser workflow.
- [P2, fixed] Vertical source graphs retained a redundant virtual-root layer, producing
  an unnecessarily large first gap. Reclaimed that layer before positioning measures.
  Post-fix: source inspection/Fit capture `mvee4xtj-2e38beac`.
- No remaining actionable P0/P1/P2 findings in the approved desktop workflow.

Required fidelity surfaces:

- **Typography:** existing IBM Plex Sans and Mono retained; native library labels,
  formula text, chips and metadata maintain their production hierarchy. Mock images
  use larger illustrative text; preserving native density is intentional.
- **Spacing/layout:** source summary, picker and impact rows share library spacing.
  Results appear once, on the left. Each formula includes its own footer. Cards
  stack below the existing 760px inspector threshold; wide DAX mode compares columns.
  Source graph fills the available width before inspection in Split view.
- **Colors/tokens:** Classic blue/purple/teal and Spellbook burgundy/olive/cream are
  supplied by existing tokens. Source cards retain Tables colors; no independent palette.
- **Assets:** existing app logo/icons and native dependency graph retained. No new
  illustrative raster assets are needed in this analytical UI.
- **Copy/content:** explicit original/expanded scopes; separate Measures and Columns
  counts. Operating Expenses original has Account[Is Revenue]; Operating Profit
  original has no direct columns. Expanded Expenses adds GL Entries credit/debit
  columns and does not leak them into the comparison card. Whole-table references
  have a separate group.

## Interaction and verification

- Start from table or column in Measures, including tables hosting no measures.
- Picker includes unused columns; graph includes only linked columns and an explicitly
  selected unused column in the empty state.
- Direct-first results, search, Direct only, change/cancel source.
- Inspection keeps source; explicit Analyze this measure changes analysis root.
- Inline, format, folding, comparison and independent reference scopes.
- Snapshots preserve source, inspector, library, viewport and formula-display state.
- All three graph directions, fit/zoom, narrow fallback, Classic and Spellbook.
- Browser console errors: none observed. Narrow document horizontal overflow: false.
- Full suite: 741 passed, 0 failed, 0 skipped, including browser and snapshot checks.
- VS Code: synchronized 37 runtime assets; asset hashes refreshed.

## Follow-up polish

Long graphs retain native readable zoom and scrolling; Fit all provides an overview.
On short/narrow windows, users can choose Dependencies or DAX to give that pane the
available height. Graph spacing and a separate mobile redesign are outside this change.

## Implementation checklist

- [x] Inline retained on latest develop baseline.
- [x] One dependent-measure list in the left library.
- [x] Original/expanded references inside each owning card.
- [x] Whole-table and column source selection inside Measures.
- [x] Browser workflow, snapshot, layout and regression checks passed.

Prior palette verification is preserved in `docs/design-qa-spellbook.md`.

## Reference chip color refinement — 2026-10-19

User feedback: the reference footer looked like a flow of text. Column and whole-table
chips now use the source table's graph color as a solid left border and tinted fill;
measure chips use the existing upstream color. Larger 12px labels, more padding,
stronger section headings and visible keyboard focus separate each clickable reference.

Browser evidence (1280 × 800 CSS/screenshot pixels):
- Classic, expanded Budget Attainment: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-100-115-251-31-mvf5ojwh-bb3346ec.png`.
- Spellbook, same state: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-100-115-251-31-mvf5p2pl-b8fb31d6.png`.

Both inspected visually; teal Budget and blue Sales references are distinct, readable,
and retain their full table[column] labels. No browser errors observed. Existing
measure/layout/browser suite: 48 passed, 0 failed, 0 skipped. Runtime hashes refreshed
and VS Code assets synchronized. No remaining actionable findings for this refinement.
