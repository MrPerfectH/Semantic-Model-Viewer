# Independent v2 filter acceptance additions — 2026-10-09

Read the complete final `/tmp/pq-redesign-20261008-v2/interface-contract.md` and `revision-review.md`, then the frozen filter addendum supplied by parent. The earlier B1–B6 design objections are superseded at **design contract level only**. User approval releases UI implementation and original integration owns the shared shell. No exact redesigned integration SHA was supplied to this independent thread, so no production execution took place.

**No remaining interface incompatibility was found after the filter addendum.** In particular, `setVisibleIds` fills the visibility gap without changing graph construction; hidden selection, clear/reveal, Back and reset policies are now explicit. Graph connectivity is computed from the complete resolved incident edge set. It includes input-only parameters and self-cycle nodes, and explicit resolved edges to missing/non-M source objects. It does not include semantic relationships, source co-location, or speculative dynamic/ambiguous references. Uncertainty stays opaque and visible; “Disconnected” is not a claim of independence.

Also read integration's published `docs/power-query-redesign/filter-addendum.md` in `feat-power-query-metadata-lineage`. It matches the received semantics. Its banner copy is “Selected object hidden by filter” and announcement includes a final period; the oracle explicitly accepts those and the earlier steering's “Hidden by filter”/no-period form. This copy variation is not a behavior incompatibility. Hash-pinned copies preserve both the final v2 contract and integration's written addendum.

One **historical oracle-schema mismatch** remains intentionally archived: `57056e2`'s `progressOracle` asks for partial-edge labels on intermediate progress. Final v2 explicitly publishes the graph atomically on ready, so that old field must not be fabricated. The additive `atomicReady` validator replaces this requirement with pending-links/no premature graph or final category counts, then complete overview at ready. Analyzer progress totals count metadata rows, excluding status placeholders; the A7 fixture therefore finishes 19/19 inspected rows with 20 display objects. Original tests, corpus and evidence are byte-preserved, not rewritten to restamp a pass. The old complete browser receipt runner is not a drop-in v2 runtime gate without openly adapting its progress schema.

## Explicit expected sets/counts

`tests/acceptance-fixtures/pq-redesign/filters-v2/expected.json` contains complete display-ID sets, not just totals. Sets are independently authored and checked against the original explicit edge oracle; no production classifier is used. Duplicate metadata records have distinct display IDs. The two new BIM inputs are additive; all 14 original scenarios remain intact.

| Scenario | All | Connected | Disconnected | Bug exposed |
| --- | ---: | ---: | ---: | --- |
| Six same-SQL tables + semantic relationship | 6 | 0 | 6 | Invented source/semantic edges |
| Five parameter consumers + scope negatives | 9 | 6 | 3 | Input-only parameter omitted or local names counted |
| Merge/append plus standalone | 6 | 5 | 1 | Search-induced reclassification |
| Quoted/repeated reference probe | 4 | 4 | 0 | Occurrences counted as extra nodes |
| Parameter + 250 consumers | 251 | 251 | 0 | Fanout caps, count edges instead of incident objects |
| Ambiguity/cycles/missing/non-M/status | 20 | 6 | 14 | Status loss, self-cycle omission, guessed duplicate edges |
| Each scale case 300/301/350/1000 | N | 0 | N | Arbitrary caps or overview-only counting |
| New explicit unavailable inputs + standalone/unused parameter | 8 | 4 | 4 | Treating unavailable source as unresolvable target |
| Original reset A/B | 2 | 2 | 0 | Same IDs survive metadata replacement |
| New same-ID replacement without edge | 2 | 0 | 2 | Stale incidence/count cache on model change |
| Original no-M replacement | 1 | 0 | 1 | Placeholder incorrectly omitted |

## Frozen workflow expectations

The additive oracle and tests cover three authored multi-step workflows plus generation changes:

1. **Combined search/category:** select MergeResult, search Q1, change to Connected. Canvas still has five connected nodes/four edges; library has Q1 alone, other visible nodes dimmed. Counts remain 6/5/1. Change to Disconnected while search Q1: canvas has the standalone node, library has zero, complete registry/minimap retain six; selected MergeResult and exact code stay behind the banner.
2. **Show all:** clears search/category, keeps selection, reveals/focuses it at readable zoom, no automatic Fit or layout reset. A dimmed selected node from search alone is not “Hidden by filter”; only category exclusion shows that banner.
3. **Reference/library navigation and Back:** capture filter/search, viewport, code and inspector x/y scroll, wrap and focus; navigate to excluded Q1 and announce filter clearing; Back restores the prior state atomically, including hidden selection/banner. A library target excluded at callback time can be exercised through the actual shell navigation path with a captured pending event; do not click a fabricated visible result or count a direct handler invocation as full trusted-input evidence.
4. **Reset filters:** All + empty search, retaining selected ID, exact inspector source, scroll, viewport, model, layout and history. It is not a model reset. Hidden standalone selection reappears without analysis recomputation.
5. **All-disconnected and fanout:** exercise zero Connected on the six-table fixture; then Disconnected/search/selected-hidden/Show all. Search `Fan249` within Connected leaves all 251 category nodes and 250 edges in the canvas, one library match. Search `Server` must not reclassify the parameter just because consumers no longer match search. Disconnected is empty, not an empty model.
6. **Minimap/methods:** whole registry remains in minimap; hidden category nodes muted/unselectable, visible/total accurate. Probe `reveal`/`focusNode` for excluded IDs and assert false/no selection callback. `setVisibleIds` remains silent; test trusted mouse/keyboard minimap behavior separately from API probes.
7. **Model/metadata reset:** start selected with search and category, then replace with the new same-ID/no-edge fixture. Generation increases first; old M/history/search/selection/projection/counts are cleared, pending work cancelled, and All is the default. Ready counts become 2/0/2. Release genuinely queued old worker/restore continuations and capture no repaint. Cover new model identity, new metadata identity and replacement while PQ is suspended. Tables state stays separate.

Actual `setVisibleIds` null/default and callback silence, keyboard accessibility and no reanalysis require the integrated candidate; this authoring run does not claim them tested.

## Artifacts and execution boundary

- `filters-v2/build.cjs` writes only this new subdirectory. `expected.json` pins category sets/counts/workflow steps; `v2-unavailable-incidence/model.bim` and `v2-same-ids-no-edge/model.bim` are new synthetic metadata.
- `tests/pq-redesign-independent-filters-v2.oracle.cjs` validates captured category/library/canvas/minimap/selection/edge states, full workflow restores, lifecycle invalidation and atomic publication.
- `tests/pq-redesign-independent-filters-v2.test.cjs` uses explicitly synthetic observations to test the **oracles themselves**, including mutations for stale counts, hidden selection loss, lost Back state, leaked old M and selectable hidden minimap nodes. These are not candidate/browser receipts.
- `tests/pq-redesign-independent-filters-v2.browser.oracle.cjs` is a fresh receipt validator, **not a DOM driver**. Requires a supplied full integration SHA, matching asset provenance, all category/workflow/lifecycle observations and hash-addressed screenshots/raw events. It remains unexecuted against production. Passing it would still require human review of evidence and separate A1–A9/A10 gates.

Self-check commands use the available repository-required Node 22.23.3 binary at `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node`; no runtime download, credential access or production source loading. Capture the actual Node exit status before printing a log. `first-self-check.txt` preserves the initial nine passing checks; `final-self-check.txt` records lifecycle/provenance checks and the unchanged original self-checks. `final-copy-compatible-self-check.txt` additionally verifies both explicit copy forms against the published addendum. No browser, package/media sync or production test command was executed.

Parent next: integrate owned commits and implementation, then provide the exact redesigned SHA and clean served asset provenance. Independent runtime collection starts only after that handoff. No new delegated jobs/chats/watchers, no PR push/merge/release. V1 defect reports and the original `57056e2` artifacts remain historical evidence; no runtime acceptance is inherited from design approval.
