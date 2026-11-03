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

## Target and evidence

Selected target: the first generated mockup, reference library with object tabs.
Source: `/home/harry/.codex/generated_images/01a16970-5e0c-7f31-be71-72c5235bc489/exec-1393bcac-ba6d-4d80-9997-d06eed61762d.png`.
Implementation: `/tmp/smv-reference-review/reference.png`, captured by the real
Chrome offline acceptance test at 1440 × 1024. Source is 1488 × 1058, essentially
the same aspect ratio; comparison rendered both at equal width in one HTML image.
Both show Reference / Sales / Overview with Sales in search. The implementation
uses the full synthetic demo model rather than the smaller invented mockup
inventory. The screenshot fixture supplies a synthetic Sales description.

## Findings and corrections

- P2: the initial five-column overview crowded the relationship and source
  summaries below the initial viewport. Changed the preview to three rows and
  made the heading explicitly report the preview/total count.
- P2: full relationship endpoint strings crowded the overview comparison. The
  summary now shows related table, cardinality and active status; the Relationships
  tab retains full endpoints and filter behavior.
- P2: documentation table text was smaller than intended. Increased it to 14px,
  widened the library to 310px and increased the object heading to 32px.
- P2: indirect consumers obscured direct references in the short summary. Direct
  references now sort first, with indirect consumers retained in the full list.

The revised implementation was recaptured and compared side by side with the
source after these corrections. No outstanding P0/P1/P2 layout findings.

## Surface review

- Typography: existing IBM Plex Sans/system fallback, monospace for expressions;
  14px documentation tables, 32px object heading, lower emphasis for metadata.
- Layout: persistent library and independently scrolling reading page, contextual
  tabs, paired relationship/measure summaries, source section, responsive single
  column below 650px. No horizontal workspace overflow at 1440px or 600px.
- Colors: existing cobalt accent, muted blue-gray text, white surfaces and pale
  workspace. New styling uses existing theme tokens. The app's existing brand
  asset is reused; no new decorative raster assets are required.
- Content: source-derived names and counts replace invented mockup values;
  absent descriptions remain explicit. Measure home-table membership is separate
  from detected references. Capture/opening provenance is distinguished from
  snapshot creation.
- Interaction: search/type filter, expression search, tabs, object links, Back,
  measure dependencies, model reset, offline re-export and restoration verified
  by `tests/reference.browser.cjs` and `tests/reference.test.cjs`.
- Safety: model text is rendered as text nodes; hostile description fixture is
  not interpreted as HTML. Snapshot metadata remains allowlisted.

## Minor follow-ups

- P3: object icons from the concept are omitted in favor of explicit type labels.
- P3: query search results can be long for large models; results are paginated
  in batches of 100 rather than virtualized.
- P3: the full demo has more content than the illustrative target; lower sections
  require reading-page scrolling. No data is concealed to mimic mockup counts.

This is a visual and feature QA result, not a claim that every existing repository
regression test passes. The final test-suite result is reported separately.

## Tables DAX dependencies — 2026-10-31

final result: passed

Approved visual sources:
- `/home/harry/.codex/artifacts/smv-tables-dax-dependencies-20261031/field-parameter-under-tables.png`
- `/home/harry/.codex/artifacts/smv-tables-dax-dependencies-20261031/calculation-group-under-tables.png`

The user's subsequent instruction supersedes the mockups' dark code background:
DAX must use the existing light Measures presentation. The implementation shares
Measures' formatter, syntax renderer, folding, and card styles. Reference is outside
this change's implementation scope; its existing navigation remains unchanged.

Rendered evidence:
- `/home/harry/.codex/artifacts/smv-tables-dax-implementation-20261031/field-parameter.png`
- `/home/harry/.codex/artifacts/smv-tables-dax-implementation-20261031/calculation-group.png`
- Combined source/implementation comparison: `/home/harry/.codex/artifacts/smv-tables-dax-implementation-20261031/design-comparison.png`

Viewport and density: source and implementation are 1586 × 992 pixels; browser
captures use 1586 × 992 CSS pixels at device scale 1. Both sides were displayed at
the same width in the combined comparison. Additional layout checks ran at 1000 ×
800 and 720 × 900. States: Tables / Metric Selector / DAX dependencies, and Tables /
Time Intelligence / YTD. The browser fixture adds a format expression to YTD to
exercise independent expression scopes; the supplied `try-tables-dax.html` demo
uses the unmodified Contoso model.

Comparison history:
1. Initial capture revealed overlapping edge captions, unstyled SVG edges, and a
   selected table outside the library's visible scroll area. These were P2 issues.
2. Corrected SVG class attributes, widened input spacing, moved captions to each
   input's row, and scrolled the selected library entry into view. Restored the
   calculation-group container and added field-reference column labels.
3. Fresh browser captures and the combined comparison show those issues resolved.
   No actionable P0/P1/P2 issues remain. Focused region comparison was unnecessary:
   the full-resolution captures show the graph labels and light DAX cards clearly,
   and browser assertions check card background, code font, and panel bounds.

Primary interactions checked: relationship/dependency switching; field choices;
measure expansion and comparison; item selection; independent dynamic-format
references; original/long/short formatting parity with Measures; wrapping; copying;
flow orientation; zoom retention when wrapping; narrow layouts; hiding the library;
offline export/reopen; model reset. Browser runtime exceptions: none.

Verification: new unit/browser checks 8/8 passed; existing Measures/layout/parser
browser and unit checks passed. Extension assets synchronized and verified.
The complete repository suite has 767 passes and two pre-existing saved-view
assertion failures (`explorer.test.js`, lines 409 and 438), reproduced with the
unmodified HEAD versions of the test and its source dependencies in a temporary
directory. These failures are unrelated to this feature.

P3 follow-up: visual density follows the shipped application rather than the
larger typography in generated mockups. Graphs disclose their 80-node/160-edge/
eight-level display limits; dependency analysis remains static.

## Calculated consumers in Measures — 2026-10-31

final result: passed

The user's revised architecture supersedes the Tables dependency mode reviewed
above. Tables now displays only model relationships. Calculated objects open a
reader in Measures, and optional consumer cards point from referenced measures or
columns toward the calculated object. Field parameter links say Selectable field;
SELECTEDMEASURE remains contextual and creates no invented fixed links.

Visual baseline: the shipped Measures presentation, captured at
`/home/harry/.codex/artifacts/smv-dax-dependencies-20261031/current-measures.png`.
Final evidence is in `/home/harry/.codex/artifacts/smv-calculated-consumers-20261031/`:
`measure-calculated-consumers.png`, `tables-field-parameter.png`,
`field-parameter-reader.png`, `calculation-group-reader.png`, and
`calculated-column-reader.png`. Captures use 1586 × 992 CSS pixels at density 1;
layout checks also cover 1000 and 720 pixels. The gallery was rendered and inspected.
The interactive `preview.html` uses the original bundled Contoso model.

The first consumer curve crossed unrelated measure nodes. Routing now reserves a
band above the measure graph; the final capture shows a clear Order Count to
Metric Selector connection. Shared Measures cards preserve the light background,
syntax highlighting, formatting, folding, and wrapping. Imported tables retain
Power Query; calculated columns have their own DAX action. No actionable P0/P1/P2
visual findings remain. Browser runtime exceptions: none.

Validation: 13 focused unit/browser checks, 72 root tests, and 15 Measures/Reference
browser regression checks pass. The complete extension suite reports 774 tests,
772 passes and the same two baseline saved-view failures described above.
Snapshot export/reopen, item and format scope selection, copying, responsive
layouts, graph direction in all orientations, bounded consumer rendering, and
model reset were checked. Extension asset verification and diff checks pass.

## Unified table cards — 2026-10-31

final result: passed

Per the user's refinement, calculated consumers now use the existing
`mv-source-card`, `mv-source-header`, and `mv-source-column` styles, including the
model table colour and 34-pixel rows. Parameter tables display their columns;
calculated columns/items appear beneath their table header. Removed the separate
green consumer-card style and retained incoming dependency direction.

Evidence: `/home/harry/.codex/artifacts/smv-unified-table-cards-20261031/measure-calculated-consumers.png`,
1586 × 992 CSS pixels at density 1. Reviewed the source and consumer cards in the
same capture and checked the inline rendering. No actionable visual issues remain.
All 13 focused checks pass, including browser style parity, navigation, snapshot
round-trip, and bounds for all graph orientations. Asset sync/check and diff check
pass. The broader suite results above predate this styling refinement.

## Smooth consumer connections — 2026-10-31

final result: passed

Replaced orthogonal consumer links with joined cubic curves, preserving horizontal
tangents at both cards and routing above intervening measures. Inspected the
1586 × 992 density-1 capture at
`/home/harry/.codex/artifacts/smv-smooth-consumer-links-20261031/measure-calculated-consumers.png`
and the inline preview. The curve clears the other cards and retains the model
table colour and incoming arrow. All 13 focused checks and asset verification pass.

## Standard dependency curves — 2026-10-31

final result: passed

The previous arch is superseded. Calculated consumers now occupy the next
dependency column, with collision-free card placement and the same 96-pixel gap
and single cubic curve formula as table-to-measure connections. No overhead route
or additional waypoints remain. Reviewed the density-1 browser capture at
`/home/harry/.codex/artifacts/smv-standard-consumer-links-20261031/measure-calculated-consumers.png`
and a magnified inline graph crop. All 13 focused checks, asset verification and
diff checks pass. Broader suite results are unchanged from the earlier run.

## Bottom anchor for lower calculated consumers — 2026-10-31

final result: passed

For lower calculated consumers in the horizontal flow, links now leave the
measure's bottom centre with a downward tangent and enter the table header from
the left. Other measure links retain their side anchor. Reviewed the density-1
1586 × 992 capture and magnified graph preview at
`/home/harry/.codex/artifacts/smv-bottom-consumer-link-20261031/measure-calculated-consumers.png`.
Order Count's green link stays below the blue branches without crossing them.
All 13 focused checks and asset/diff verification pass.

## One Measures workspace for calculated objects — 2026-11-02

final result: passed

The user's attached screenshot and revised instructions supersede the separate
calculated-object reader. Calculated objects now use Measures' buildSelectedMain,
layered graph, graph interactions, resizable split, formulaCard, and referenceSection.
TableDaxView holds selection and metadata; it renders no separate workspace.
Parameter and calculation-item consumers use one named row, without automatic
column rows. Selection retains split position, panel shares, orientation, wrapping,
and formatting. Field choices use the standard measure-reference chips; the
special selectable-fields grid and its nested scrollbar are removed.

Final evidence: `/home/harry/.codex/artifacts/smv-unified-workspace-20261102/`:
`measure-calculated-consumers.png`, `field-parameter-selected.png`,
`field-parameter-beside.png`, `field-parameter-comparison.png`, and
`calculation-group-selected.png`. Captures use 1586 × 992 CSS pixels at density 1;
browser checks also cover 1000 and 720 pixels. Inspected both split positions and
the inline gallery. No actionable visual findings remain. The interactive
`selected-preview.html` uses the original bundled Contoso model.

Validation: 16 focused unit/browser checks pass; 50 Measures/calculation unit
checks, 75 root tests, and 15 Measures/Reference browser checks pass. The complete
extension suite reports 777 tests, 775 passes and the two pre-existing saved-view
assertion failures described above. Snapshot reopening preserves selected item,
expression scope, comparison, graph state and shared preferences. Browser runtime
exceptions: none. Extension asset verification and diff checks pass.
