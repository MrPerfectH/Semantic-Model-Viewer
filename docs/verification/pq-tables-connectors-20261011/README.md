# PQ lines and arrows: Tables drawing reuse

Candidate branch: `fix/pq-tables-connectors-20261011`, based on `7ba3abe52ad8fa6dedd35de2ee798971d4b4a471`. The final candidate hash and bundle receipt are external at `/home/harry/pq-tables-connectors-20261011/results/candidate.json` to avoid a self-referential commit hash.

PQ directly calls `GraphCanvas.prototype.orthoPath(points, 9)` and `edgeArrow`, the same rounded orthogonal path and open chevron methods used by Tables. Tables' `edgeGeom` already calls that path helper with radius 9. `orthoPath`, `edgeGeom`, and `edgeArrow` are byte-for-byte unchanged as functions from baseline. The only Tables edit extracts its existing width calculation into `edgeStrokeWidth`, consumed by both canvases; the formula and all Tables call arguments are preserved. The audit compares the methods and the exact remaining `renderLines` source with baseline. No Tables routing/layout change or relationship-state import occurs.

PQ retains its router, reciprocal ports/channels, obstacle rails, self-loops, exact node positions, graph identity, selection callbacks, viewport, hidden-edge projection, map, scoped dimming and source-role/provider presentation. It removes duplicate/collinear waypoints only for drawing. Straight runs remain straight; actual bends use Tables' quadratic corner rounding. Visible path, white active/hover underlay and hit path have identical geometry. Parameter dashes retain 6/4 screen pixels; color remains scoped to the edge. The existing 14 screen-pixel hit width and stable edge ID are preserved.

The old shrinking `marker-end` is replaced by Tables' 6px zoom-scaled open chevron (1.15 active boost), seated on a clear straight run. The argument called `toA` in Tables receives PQ's input-to-consumer segment sign; `{both:false}` is fixed. No filter-direction interpretation or cardinality glyph is imported. Seats are checked against visible cards, including source and consumer, with chevron stroke clearance. Changing zoom recomputes width/seat without routing or moving nodes; panning alone does not rebuild arrows.

## Verification

- Focused routing/rendering, Tables interaction/layout/relationship tests: **96 passed**, zero failures/skips.
- Full extension Node 22 suite on Linux: **633 passed**, zero failures/skips (627 baseline cases plus six owned current-geometry tests). All four mocked Mac launcher tests passed on Linux; no tests ran on macOS.
- Geometry tests cover 47/37/30/85/100/200%, all four directions, near vertical ports, self-loops, the reported fractional reciprocal drag, detours, rounded hit corridors, independent reciprocal click identity, hover, parameter dash size, state preservation and no chevrons under visible cards.
- Only the owned canvas tests' superseded literal `M/L` assertions were updated. Historical browser fixtures, frozen oracles and historical artifacts are untouched. Initial failures and every subsequent log remain external. The round9 generated receipt is preserved externally and its exact tracked original bytes restored.
- Fresh VSIX: **45 ZIP entries, 33 runtime assets**. Canonical/media/staged Git/ZIP bytes match; every cache key is a current SHA-256 prefix. No tests, docs directory, evidence, fixtures, source models, report data or node_modules bundled. Standard extension README/changelog metadata remains in the package.
- Canonical, media and generated offline snapshot helper load order and PQ mount pass in the deterministic DOM/VM harness. A synthetic snapshot excludes raw-M and credential sentinel values. The existing full-suite privacy tests also pass.

Runtime manifest SHA-256: `6d9298931bf04e29fa9b67fffacec6a3d0ac8bee57209a0f7c1136c218648eed` (sorted `asset + NUL + sha256 + newline` records).

VSIX SHA-256: `de1c2f78710356d4be10d1c607ca49d73bef6417f3d17304628d9b621f8e6f28`.

[verification.json](verification.json) contains runtime file hashes, counts and original-log hashes. Logs, full audit outputs, original/generated round9 copies, VSIX and `repair.bundle` live outside the worktree under `/home/harry/pq-tables-connectors-20261011/`.

## Reproduce

Prepend `/home/harry/pq-tables-connectors-20261011/node-v22.23.3-linux-x64/bin` to PATH for each process only. System Node is unchanged.

```sh
node --test tests/power-query-canvas.test.cjs tests/canvas-interactions.test.cjs tests/layouts.test.cjs Models/tools/viewer/tests/relationships.test.js
npm test --prefix vscode-extension
npm run package --prefix vscode-extension -- --out /path/to/candidate.vsix
npm run check-viewer --prefix vscode-extension
node docs/verification/pq-tables-connectors-20261011/audit-runtime.cjs
python3 docs/verification/pq-tables-connectors-20261011/audit-package.py /path/to/candidate.vsix HEAD
```

Before a full-suite rerun, back up `docs/verification/pq-redesign/round9-963638a/independent-analysis-graph.json`; preserve its generated result externally, then restore the original bytes. Generated extension media is ignored by Git and is reproduced by the sync/prepublish scripts. No new runtime registration or snapshot allowlist entry is needed: both already load Tables before PQ.

## Limits and handoff

These are unit/VM/static-package results, not browser hit testing, native UI or visual acceptance. No browser job was run; MAIN independently reviews visuals/hits and performs any later push. Fully overlapping manually placed cards, or extreme smaller zooms with no clear run, can leave no legal arrow seat; PQ preserves positions and omits that head rather than drawing it beneath a card. No source models/data were inspected, no M executed, no credentials/auth/global configuration edited, and no other worktree, subagent, push, merge, release or PR comment was used.
