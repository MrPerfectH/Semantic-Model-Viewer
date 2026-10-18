# Directional Power Query Flow and Canvas verification

Runtime revision: 559c6092c15f2e0df8d4fb3748981c5ae4384538
Runtime Git tree: ba2017775fb3e37a5fc801877be29b1114b5100a
Base: b94826f39c0c2b4c0c20aab304ec72e837098f1f

## Implementation

- Flow exposes Inputs / Used by, recursively walking only that direction. Parameters default to Used by; other queries default to Inputs.
- Inspected selection is independent of the analyzed root. Analyze full flow, library double-click/Enter, and card double-click/Enter explicitly analyze. Back and per-mode snapshots retain direction.
- Canvas membership, custom positions, viewport, filters and reader remain preserved on inspection and mode roundtrips.
- Explicit Arrange moves short inputs next to their consumers, centers layers, and orders connected neighbors. Opening Flow retains Fit framing instead of subsequently centering and cropping the ancestors.
- Unknown providers no longer create generic card footers. Known role, source evidence and model table colors remain; parameters use purple with a P badge and text. Missing source identification remains plain-language inspector evidence.
- Toolbar groups override the shared library segment spacing. Display supports toggle, outside pointer/focus dismissal, Escape with focus return, keyboard opening, map visibility, and query-panel docking. Its overlay stays within the viewport.

## Linux verification

Node v22.23.3, Linux workstation, no private model copied:
- npm test --prefix vscode-extension: 666 passed, zero failed/cancelled/skipped (29.810 seconds).
- Includes three added mode regressions: recursive parameter consumers excluding merge co-inputs; Canvas analyze/Back exact placement; short-input compact placement without hidden-card movement.
- Existing exact source, reference range, UTF-16/CRLF, stale-generation, delayed reader, directed edge routing/hits, hidden lock, docking and snapshot/privacy tests remain passing.
- sync-viewer.js --check: 33 runtime assets.
- Package audit: 45 ZIP entries; all 33 assets equal canonical source, media, Git and ZIP; 31 cache keys match SHA-256; data/model/evidence exclusion and original round-nine evidence preservation pass.
- See linux-full-tests.log and package-audit.json.

## Mac local browser acceptance

T3 collaborative preview, local server port 8945, integration checkout fast-forwarded from the Linux bundle. Authorized TMDL model read only in the Mac browser. Private screenshots stay outside this repository.

Observed with real DOM and trusted browser clicks:
- Complete upstream example: 13 nodes, 16 drawn edges, no omissions. Every card is inside the canvas at 1280x800 (46.08% Fit) and 1440x900 (53.92% Fit).
- Parameter example: 26 recursively resolved Used by objects; direct consumer count one. Independent traversal of the graph matched the visible set. Switching to Inputs shows the root only while retaining its real consumer count; Back restores Used by.
- Previously accepted nine-object upstream example still matches its exact expected set.
- Seven-card manual Canvas: ordinary library selection changes neither membership, positions nor viewport; Analyze full flow opens all 13 objects; returning to Canvas restores the exact prior membership, layout and viewport.
- Card single-click preserves analyzed root, viewport, all positions and body scroll. Native double-click analyzes the selected intermediate query. Library double-click analyzes from Canvas.
- No generic Unknown card/footer labels. Parameters have purple header tint and white P on #79519f; known source badges remain.
- Toolbar child centers align at both desktop widths, without body horizontal overflow. At 780x900 the toolbar wraps and Display remains on screen and hit-testable.
- Display open/close toggle, map hide/show, outside click, ArrowDown opening, Escape focus return, and bottom/right docking passed. Persisted docking preferences contain only dock/width/height.

Boundary: two of the 16 visible connections report crowded ports at overview scale; all 16 are drawn. The warning remains visible. This is local browser acceptance, not installed VS Code, cross-platform native, release, independent-review or human-fit acceptance. No push, merge or release performed.
