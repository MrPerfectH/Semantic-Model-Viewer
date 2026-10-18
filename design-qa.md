# Spellbook palette and compact toolbar verification

Date: 2026-10-14

final result: passed

## Approved scope

Use the shared burgundy, olive, muted-plum and antique-gold palette across Tables,
Measures, Power Query, Domains and Matrix. Use the compact Tables toolbar direction.
Keep the existing Measures layout. Its floating-controls alternative is tracked in
[backlog issue #76](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/76).

Visual reference: `/home/harry/.codex/generated_images/01a134a7-d6ee-7f92-89dc-caa30aad5909/exec-3b506a58-acd2-4a02-bbbc-deb9edaf8f45.png`.
Compared this concept with the actual Tables capture in one combined T3 HTML preview.
The concept is illustrative and uses a different model; geometry and invented diagram
contents were not treated as implementation requirements. Existing zoom controls stay
in their established lower-left location. Measures geometry is explicitly excluded
from the concept target by the user's instruction.

## Visual checks and fixes

- Consistent pigments now cover badges, source names, graph nodes/edges, legends,
  selection/focus, minimaps, code references, Matrix cells and domain groups.
- Tables toolbar groups the existing actions with light separators and a single Save
  view primary action. Existing actions and popovers remain available.
- P2: inspector toggle overflowed the toolbar at 850px. Hide its redundant title below
  1000px. Post-fix bounds check: no overflowing controls.
- P2: wrapped toolbar overlapped the canvas by 5px at 580px. Allocate 72px to the row
  and align the canvas/inspector offsets. Post-fix toolbar bottom equals canvas top,
  with no controls overflowing horizontally or vertically.
- Retained darker gold for small badge text contrast; lighter gold remains an accent.
- No remaining P0/P1/P2 findings in the requested scope.

## Evidence

Browser viewport 1672 × 940; browser saves fitted screenshots at 1280 × 720.

- Tables: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv81vlwc-c1d0b18a.png`.
- Measures: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv81wdor-43a9370e.png`.
- Power Query: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv81srlm-d3f582fe.png`.
- Domains: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv81tdhs-323dba19.png`.
- Matrix inspected directly in the collaborative browser.
- Narrow-toolbar post-fix bounds verified at 850px and 580px.

## Functional verification

- 675 tests passed, including a regression for palette-axis preservation, numeric
  RGB colors, non-mutation and restoration of the saved Classic palette preference.
- Extension packaging passed; 34 runtime assets verified without business data.
- Browser: theme switching preserved Tables layout and saved palette preference,
  Measures snapshot state, Power Query viewport/positions/selection/history, and
  expanded Domains state and coordinates (after pending fit animations settled).
- Exercised all five views. No uncaught application errors in the instrumented pass.
- Real exported snapshot loads 43 demo tables in an embedded browser preview;
  navigated all five tabs, including Power Query worker analysis. No application
  errors or HTTP resource requests from the snapshot.
- Preview is standalone HTML, uses only the demo model, and needs no extension install.

## Limits

No manual VS Code GUI session or PNG-export check. No Marketplace release or merge.
Generated concept labels are not model truth; original roles and relationships remain.
