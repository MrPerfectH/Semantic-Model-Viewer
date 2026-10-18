# PQ connector lanes

Baseline: `737eae446e51604b2b1175376973d0f6110f07c4`. Branch: `fix/pq-tables-connectors-20261011`. Final commit, changed-file list and bundle verification are recorded externally in `/home/harry/pq-tables-connectors-20261011/lanes-results/candidate.json`.

The reported four-input convergence now receives distinct input/output ports and reserved orthogonal channels. Allocation considers only displayed endpoints, orders sides by the other endpoint and stable edge ID, reserves endpoint stubs before routing, and rejects coincident positive-length straight segments. Point crossings are allowed. Self-loops prefer less occupied adjacent sides. Every candidate checks all straight segments and a conservative box around each rounded corner against nearby cards. Hide/show reallocates ports; pan does not. Zoom can change spacing without moving a card or changing the graph, selection, history or viewport.

Tables' `assignRelationshipPorts`, outward stubs and orthogonal channel conventions guided the routing. The actual Tables drawing reuse remains: PQ still calls `GraphCanvas.prototype.orthoPath`, `edgeStrokeWidth` and `edgeArrow`; `canvas.js` is byte-identical to baseline. PQ arrows still follow input → consumer and have no cardinality or relationship-filter semantics. Visible line, underlay and click path share one `d` value. Parameter styling, dimming, provider/role colors and edge callbacks remain intact.

The ordinary spacing target is `max(24 world units, 8 screen pixels)`, constrained by card-side capacity. The four-input fixture maintains at least 8 screen pixels between consumer ports at 58/47/37/30/85/100/200%, allowing SVG rounding. Its synthetic positions are `(0,-230)`, `(0,-80)`, `(0,220)`, `(0,370)` and consumer `(730,70)`; the four edges run from each source to that consumer. This reproduces the reported topology, not unprovided screenshot pixel coordinates.

## Whole-model retention and bounded work

There is **no total-edge cutoff or shared routing budget**. Static bounding-volume trees index cards and endpoint stubs; small batches of accepted route segments are indexed as routing proceeds. Ordinary disjoint links query nearby geometry rather than scanning every card/reservation. Search/selection/focus reuse allocation when visible positions, graph context and zoom have not changed.

The per-edge fallback has a bounded 48×48 visibility grid, 8,000 segment checks and 50,000 detailed collision checks. Only that edge can exhaust the search. A genuinely blocked port or exhausted local search has an empty drawing path, retains its semantic graph/map membership, and produces an explicit count in the canvas. `data-route-status` distinguishes `no-clear-route` and `routing-limit`. No overlap fallback is painted.

Dense sides use distinct compressed ports/channels and report `crowded-ports`; the warning does not hide those links. All 250 fan-out edges render at every requested zoom with zero coincident straight segments, despite insufficient room for an 8px pitch. Dense crowding still limits visual separation and hit comfort; it is not represented as a readable 8px result. At extreme shape-only Fit scales or within very short gaps, an arrow may have no clear seat while its line remains drawn.

## Results

- Focused Tables/PQ routing, rendering, interactions, layout and relationships: **104 passed**, zero failures/skips (`focused-route-cache.log`).
- Final complete extension suite, Linux task-local **Node v22.23.3**: **641 passed**, zero failures/skips (`full-node22-route-cache.log`), 633 baseline plus eight new lane tests. The four mocked Mac launcher tests passed on Linux; no tests ran on macOS.
- New geometry coverage: four-input fan-in; fan-out; diamonds; multi-degree nodes; reciprocal cycles; self-loops; rotated directions; visible obstacles; all requested zooms; entire straight-segment and rounded-corner clearance; arrow direction/clearance; exclusive hit regions and edge callbacks; order stability; drag; hide/show; exact graph/position/viewport preservation; explicit crowded/blocked cases.
- **1,000 nodes / 999 chain edges:** all 999 routes and arrows at 47/85%, no warnings or route issues, no shared segments, 7,992 local collision checks per pass.
- **250-consumer fan-out:** all 250 links at 58/47/37/30/85/100/200%, no missing routes, explicit crowding, no shared straight segments. An impossible first edge cannot starve later disjoint routes.
- 300/301/350/1,000-record measurements each retain all 250 supplied links, all nodes, exact positions and graph, and last-object search/reveal. Final Node DOM/VM samples: mount/layout 384–439ms, Fit 0.26–0.73ms, search/reveal 130–142ms. These are observations, not browser long-task, cancellation or native responsiveness acceptance.
- Fresh VSIX: **45 ZIP entries / 33 runtime assets**. Canonical, generated media, staged Git and ZIP bytes match; all cache keys match content hashes. Tests, docs directory, evidence, fixtures, models, report data and node_modules are excluded. Normal extension README/changelog metadata remains.
- Canonical/media/offline-snapshot helper load order and mount pass in the deterministic VM harness. The synthetic snapshot excludes raw-M and credential sentinels. Full-suite privacy/history/reader/lock/provider regressions pass.

Final runtime-manifest SHA-256: `f6d7183288564f828967f618116585a974a7312ae10f6c38edce8c7fa9bf03a1` (sorted `asset + NUL + SHA-256 + newline` records).

Final VSIX SHA-256: `be377b5f74b2647f4324cb4bec0ff65d9d44fc3eb802a489f3d35ced7cd6407d`.

## Preserved failure history

All logs remain under `/home/harry/pq-tables-connectors-20261011/lanes-logs/`, including the initial shared-trunk failure, the stopped slow router run, intermediate geometry failures, and the interrupted first full suite. MAIN's cutoff finding is reproduced in `red-chain.log`: the abandoned global-budget version retained only 82/999 edges at 47%. That cutoff/global-budget policy has been removed. `spatial-1.log` preserved the short-gap stub failure; the ray lookup was expanded to include cards within three stub lengths. `spatial-2.log` preserved a test's incorrect assumption that coincident cards were always unroutable; the fixture now has a port actually inside another card.

The owned older detour assertion now checks clearance instead of requiring exactly an 18-unit offset. The owned helper-reuse fixture moved its test node above standalone cards so it tests drawing reuse without unintended overlaps. No historical frozen fixture, browser scenario or oracle was changed. Every generated round9 receipt was saved externally and the tracked original restored byte-for-byte. The preliminary pre-cache VSIX and receipts are also preserved; only the final package/hash above is the handoff candidate.

## Reproduce and handoff

Prepend `/home/harry/pq-tables-connectors-20261011/node-v22.23.3-linux-x64/bin` to each command's PATH. System Node and repository URLs were not changed.

```sh
node --test tests/power-query-lanes.test.cjs tests/power-query-canvas.test.cjs tests/canvas-interactions.test.cjs tests/layouts.test.cjs Models/tools/viewer/tests/relationships.test.js
npm test --prefix vscode-extension
node docs/verification/pq-connector-lanes-20261011/measure-routing.cjs
npm run package --prefix vscode-extension -- --out /path/to/candidate.vsix
npm run check-viewer --prefix vscode-extension
node docs/verification/pq-tables-connectors-20261011/audit-runtime.cjs
python3 docs/verification/pq-tables-connectors-20261011/audit-package.py /path/to/candidate.vsix HEAD
```

Before rerunning the full suite, back up `docs/verification/pq-redesign/round9-963638a/independent-analysis-graph.json`, save the generated copy externally, and restore the original bytes afterward. Generated media is ignored by Git and reproduced by sync/prepublish. [verification.json](verification.json) records artifact/log hashes and exact measurements.

No source model/data inspection, M execution, credential/auth/global-config change, other worktree edit, agent, browser job, push, merge or PR comment was performed. MAIN still owns actual T3 visual/hit review on Mac and any push. This candidate makes no browser/native acceptance claim.
