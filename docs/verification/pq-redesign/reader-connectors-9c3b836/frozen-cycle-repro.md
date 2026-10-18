# Frozen independent blocker reproduction

Exact rejected connector candidate: `9c3b836ecfcbf36a6888b576b5b8eba9f16886cd`.

Executable future replay: `tests/pq-redesign-independent-reader-connectors-cycle-hit.scenarios.cjs`. It is a T3 async function, evaluated with tools and `{root,out,tabId,candidate}` after exact runtime mapping and own-service registered boot. It imports only the new synthetic fixture. The script was frozen from the observed live reproduction, not replayed after the coordinator's strict HOLD instruction. Wait for a new released exact SHA before running it.

Fixture: `tests/acceptance-fixtures/pq-redesign/reader-connectors-9c3b836/model.bim`. Reciprocal expressions: `CycleA = let x = CycleB in x`, `CycleB = let x = CycleA in x`; no execution.

At1440×900 CSS, put only CycleA/CycleB/SelfLoop in layout, place A(0,0),B(0,300),SelfLoop(450,150), selectA with inspector closed and Fit. RemoveSelfLoop through its actual membership button, retaining viewport. Use actual T3 drag from `.pqc-node[data-node-id='["expression","","CycleB"]'] .pqc-node-title` to `.pqc-map-label`. This enters horizontal routing with disjoint cards. Exact observed B became(581.456005859375,395.031982421875); A stayed(0,0), all other positions and serialized graph unchanged. The script asserts that the drag enters the horizontal branch, rather than mistaking a failed setup for the product failure.

Observed paths:

```
B→A M581.456005859375,443.031982421875 L416.7280029296875,443.031982421875 L416.7280029296875,48 L252,48
A→B M252,48 L416.7280029296875,48 L416.7280029296875,443.031982421875 L581.456005859375,443.031982421875
```

They are precisely the same geometry traversed in opposite directions. Their14px hit paths coincide. All sampled interior points of both shapes return only the later A→B hit element. The earlier B→A has zero accessible samples. This is not a manual-overlap case: card rectangles are disjoint, and only these two nodes are visible.

Actual trusted clicks at CSS(936.1600341796875,738.7974853515625) and(866.091552734375,265.5), on separate segments toward each end, both opened:

`CycleA is referenced by CycleB` / `Line 1, column 9 · CycleA`.

B→A detail `CycleB is referenced by CycleA` is inaccessible through its connector. `horizontal-cycle-failure.json` retains before/after graph/layout, both paths,21samples per path and actual click results; `horizontal-cycle-failure.png` is the unmodified T3 screenshot.

Freeze criterion: every opposing semantic edge must retain an independently reachable interior hit region after this horizontal drag, and actual trusted clicks must open that edge's own input→consumer heading and exact reference. The future script samples199interior points and then clicks one own hit per edge. Merely preserving graph edges, showing two arrowheads, using opposite SVG path traversal, passing vertical cycle tests, or weakening the oracle does not satisfy this gate.

Read-only cause evidence: `served/js/power-query-canvas.js` edgePath offsets vertical ports by±12, while horizontal start/end ports both use center y+H/2 and the same middle channel. No repair was attempted here; the coordinator assigned the existing Astra repair round.
