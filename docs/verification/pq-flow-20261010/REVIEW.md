# Flow implementation and direct audit — 2026-10-10

Implemented locally for PR [40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40). Baseline: `362c6783c13ae7c3604bd832554579b0efa4a00a`, initially clean. Checkout: `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-power-query-metadata-lineage`. The commit containing this report is the candidate; `package-runtime-proof.json` and `final-runtime.json` identify its exact runtime bytes independently of the commit's evidence files.

## Concrete changes

- First query selection establishes a separate flow target. Inspecting cards, source references, inputs or consumers retains it. Direction/depth and related membership actions operate on that target. Inputs default to all resolved ancestors; sources without resolved inputs default to consumers. Neither choice asserts complete dependency analysis.
- Target has a purple outline and persistent label. The inspected branch uses stronger blue edges derived by intersecting directed reachability; merge siblings and co-consumers are not mislabeled as a path to the target. Cycles terminate and retain their uncertainty.
- Inputs and consumers are real, keyboard-accessible navigation buttons, validated against the current generation and supplied graph IDs. Source occurrence navigation still validates the exact supplied ranges separately.
- Inspect target, Trace this query and Clear flow distinguish inspection from choosing a new target. Back and layout Undo retain the target independently. Blank, Show all, model replacement and removal of the target clear it deliberately. Inspecting an unrelated object is labeled outside the current flow.
- Fixed disabled Undo after Arrange, stale overview-toggle accessible name, Display Escape closing the inspector instead of the menu, and the reader's decorative arrow changing its accessible name. M reader remains exact and 14px; legend no longer occupies the zoom-control corner.

## Actual baseline observations

Own T3 tab `tab_2_a0d1d832-9389-42c1-bd1c-8b8de950c5a2`, normal Choose files → Add model import of `flow.bim`, no application-state injection. Browser started at `http://localhost:8945/?review=flow-20261010`. Before screenshots and raw snapshots are preserved here.

- Tables: selecting Sales adds its card, shows table relationships and the table inspector; its library is 268px and toolbar 62px. This shell is retained.
- Measures: Net Amount remains the analyzed measure when its `[Total Amount]` reference is clicked. A separate comparison opens with Analyze this measure and Clear actions. This demonstrated the useful distinction between a stable subject and the inspected object.
- PQ: Sales → Merged Sales → Prepared Sales with Hide unrelated changes focus to each inspected object. At Prepared Sales, visible nodes are Environment, Sales Raw, Prepared Sales and Merged Sales: final Sales is gone. `before-lost-final.png` is the reproduced failure of task continuity.
- PQ input/consumer counts exist but have no direct navigation buttons. Only source references navigate upstream; consumers require finding another card/library entry or an edge.
- T3 Open full query attempt timed out. Subsequent host response explicitly reported **“No preview automation host is available … Do not retry.”** Remaining work used an isolated Chrome/Playwright session, never the parent's tab. The decorative reader arrow was later isolated as an accessible-name issue and an explicit label fixed the exact-name action.

The exhaustive control replay below is after implementation. It does not claim every control was independently exercised at the baseline. Arrange/Undo, overview-label and Display/Escape defects were discovered during this replay; the affected baseline implementations were unchanged before those fixes.

## Control audit matrix

| Area / controls | Observed outcome at candidate | Evidence / limit |
|---|---|---|
| Tables select/add, Show all, Blank, Undo, Arrange, search and membership filters | Pass | `controls.json`, `tables-reference.png`; existing table behavior unchanged |
| Measures inline reference, comparison Clear, DAX/Dependencies/Split, orientation, zoom/Fit/Center | Pass; analyzed Net Amount stays fixed | `measures-reference.png`, `controls.json` |
| PQ library selection and first + from blank | Establishes target; + is undoable | `final-runtime.json`, final smoke log; regression |
| M reference and direct input/consumer navigation | Stable target; exact IDs; return through Back | `history-reader.json`, `edges-keyboard.json` |
| Inspect target / Trace this query / Clear flow | Explicit inspection versus reroot; Back restores prior target | controls and final smoke logs |
| Input/consumer/connected direction and 0/1/2/all depth | Applied to target independently of inspected query | controls log; full traversal regression |
| Dim / Hide unrelated | 10 vs 6 visible objects for Sales; final target retained through upstream inspection | `after-chain.png`, `after-1280.png` |
| Add related / Remove unrelated | Membership changes follow target's configured neighborhood; Undo restores | controls log |
| Remove selected / library minus / Undo | Pass; removing target clears it; Undo restores selection and root | final smoke, controls, focused regression |
| Blank / Show all / Undo | Separate layout history; source navigation history retained | controls log and tests |
| Arrange / Undo | Input → consumer x-order; manual positions restored. Fixed disabled Undo after empty stack | `edges-keyboard.json`, focused regression |
| Search / category / explicit group / All / On canvas / Available / Reset | Exact membership filters; Reset preserves selected source and numeric viewport | controls log; group schema unchanged |
| Zoom +/- / Fit / Center selected | Functional; Center genuinely recenters; Fit follows visible projection | controls log |
| Map / legend | Only visible objects/edges. Toggle accessible name now changes with state | controls; moved legend captured in screenshots |
| Display open / close / Escape | Escape now closes menu and preserves inspector | `before-display-escape.json` reproduces old behavior; controls verifies fix |
| Queries library toggle / inspector keyboard resize | Functional and responsive | controls log |
| Open full query / Copy M / Wrap / Escape | Exact CRLF text and clipboard match fixture; wide reader and 14px typography retained | `history-reader.json`, `after-reader.png`, `after-760-reader.png` |
| Metadata/provenance and analysis disclosures | Preserved with exact scroll/wrap/focus across keyboard reference → Back | `edges-keyboard.json` |
| Close inspector / Escape / reopen | Selection and target retained; reader Escape closes reader first | controls log |
| Reciprocal edges / details / close | Each edge independently hits its own popup after diagonal drag; only M/L path commands | `reciprocal-dragged.png`, `edges-keyboard.json` |
| Cycles / disconnected / outside-flow inspection | Bounded; cycle retained; no resolved reference does not claim independence | `after-cycle.png`, controls log |
| Tables ↔ PQ / Open table | PQ state retained; table relationship view remains separate | controls log |
| 1,000 objects / 250 direct consumers / long chain | All 1,000 available; 301 reachable from parameter; 52-node final ancestor chain | `scale-offline.json`, large screenshots |
| Model replacement | Clears target, selection and both histories; generation advances | scale script and lifecycle tests |
| Cancel inspection / retry / stale worker messages | Existing focused scheduler tests pass; transient Cancel not clicked in this browser replay | 416-test full log; do not promote to browser proof |
| Default snapshot / offline reopening | No raw-M or group sentinels; offline PQ explicitly unavailable; zero query cards | `scale-offline.json`, `offline-snapshot.png`, exported HTML |
| Responsive 1440×900, 1280×800, 760×800 | Browser journeys and screenshots pass | CSS viewport checks, not true Chrome 200% zoom |
| Source-edit, repo connection, Rules/role writeback, live M execution | Not invoked | Outside read-only synthetic task scope |
| Native VS Code / true browser 200% zoom | Not verified in this run | Separate existing native blank-view investigation remains open |

Fit still reduces labels on long chains (30% in the 1280px screenshot); users can zoom, center, hide the library, resize/close the inspector or use the wide reader. This is an explicit remaining usability tradeoff for the user gate, not a claim of user acceptance. Layout remains left-to-right; no new orientation selector or inferred execution order was introduced.

## Verification and provenance

- Node executable: `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node`, **v22.23.3**. No Node 24 native-GC retry.
- Final appropriate full suite: **416/416 pass, zero skipped/failed**, `logs/pq-flow-final-full.log`. Includes seven new regressions and the frozen reciprocal, snapshot, parser, worker, history, and layout tests.
- Browser fallback: installed **Chrome 154.0.8037.99**, isolated temporary profile, Playwright from the existing Codex runtime dependency installation. Trusted clicks/keys/pointer drag and normal file import. Evaluation used read-only state/geometry/hash assertions, plus clipboard read and animation-frame settling; no fixture injection into the app and no M execution.
- **13 grouped UI journeys pass**, plus exact-source/history, reciprocal-drag/keyboard, large-model/reset/offline, and final runtime smoke. Browser scripts are in `scripts/`; raw failures remain in `browser-failures.jsonl` and numbered logs. `browser-runtime.json` records actual requests and no page errors.
- Large fixture observations: cold PQ open **300ms**, parameter selection **493ms**, single samples. They are observations, not an agreed latency threshold or multi-run benchmark.
- Sync/check passed: **33 assets**, no model/report bundled. VSIX **45 files**, version **0.3.3**, local only. SHA-256: `baa2465928493571a8103b6a5a60ae45b909e8069a2f93453a0df4907b1c598d`.
- Every packaged runtime asset compared byte-for-byte with canonical source and current HTTP response: `package-runtime-proof.json`. Canonical parser, dependency analyzer, graph model and snapshot policy are unchanged.
- Failure handling: reader-name selector failure fixed with an explicit accessible label; initial interactive terminal harness discarded after its input/state became uncertain. A new test queried a control after clearing its context and was corrected. Measures harness asserted an unrelated DOM absence and was corrected to assert the analyzed heading. Arrange history comparison was corrected from Map insertion order to exact per-ID coordinates. Final smoke attempted the intentionally disabled reroot button on the current root; corrected to Hide unrelated. These are separately recorded from the three real control defects above. All affected journeys were replayed only after diagnosing the cause.

## Handoff

No push, merge, release, installed-host claim or user-fit acceptance. Parent owns independent review of this exact candidate and the user's parameter → intermediate → final-table workflow gate. No subagents or parallel feature owners were started.

## Additive UI contract

`PowerQueryCanvas.setFlow(rootId, branchIds)` accepts supplied display IDs only. It
changes target/branch styling without moving cards, changing routes or mutating graph
metadata. Context replacement clears it. `PowerQueryInspector.onInspectRelated` emits
`{generation, sourceId, targetId}` separately from source-occurrence navigation. The
workspace validates the current source and direct supplied adjacency before navigating.
`setFocusControls` accepts optional `rootLabel` for the focus heading; history stores
`flowRootId` with navigation/layout state, and generation reset clears it. Existing
source-range, reciprocal-route, placement, reader and snapshot contracts remain intact.
