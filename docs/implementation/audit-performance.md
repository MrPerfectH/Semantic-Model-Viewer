# Audit performance and geometry checks

Run independently of the deterministic test suite:

```sh
node scripts/benchmark-audit.cjs > demo-benchmark.json
node scripts/benchmark-audit.cjs --stress > stress-benchmark.json
node scripts/benchmark-audit.cjs --model /path/to/Example.SemanticModel > own-model-benchmark.json
```

The stress option uses Python3 and the retained Fable audit generator (2026-11-01, seed7):40 facts,120 dimensions,274 relationships,400 measures. A temporary fixture is generated and removed automatically. To retain one for browser checks:

```sh
PYTHONHASHSEED=0 python3 scripts/generate-audit-stress.py /tmp/Stress.SemanticModel
node bin/smv.cjs snapshot /tmp/Stress.SemanticModel --out /tmp/stress.html --open none --json
```

The generator deliberately preserves the original synthetic fixture, including the audit's noncanonical inline `RawBase` M expression. It is suitable for table-layout measurements, not a standard for M parser correctness. Its lineage identifiers are reproducible when `PYTHONHASHSEED=0` is set.

The benchmark reports six fresh VM/model samples and machine metadata. It separates runtime setup, file reading+parsing+preparation, and pure Star arrangement. First sample is cold runtime setup; the remaining five use warm filesystem cache. Geometry must be finite. These numbers exclude browser routing, painting, event-loop delay and host integration. Do not compare them directly with end-to-end browser timings.

For browser measurements, record model counts, renderer receipt hash, viewport, graph scale and layout. Repeat render or interaction measurements five times, distinguishing synchronous CPU time from the next timer callback and two-animation-frame settlement. Keep raw samples and record concurrent machine load. Graph edge identities, finite paths and preserved manual positions are correctness criteria independent of timing.

Tables obstacle routing uses deterministic work bounds:16,384 search expansions per edge and an obstacle-count-adjusted render budget (7,680,000 divided by obstacle count, bounded between24,000 and192,000 expansions), after cheap clear-channel candidates. When refinement is exhausted, every edge remains visible with its original endpoints, and the viewer explains the dense-overview limitation. Focusing a table reduces the diagram scope. Calculated-consumer routing has a12,000-expansion fallback bound. These are operation bounds, not cross-platform latency promises.

The existing layout timing assertion remains in `tests/layouts.test.cjs`. Shared-machine runs can exceed it; retain failures and rerun separately to distinguish load from regression. This change does not delete or weaken that assertion, and benchmark output is not added to the deterministic gate.

Selected calculated-flow validation checks unrelated-node intersections for Order Count, Total Sales, Gross Profit and Gross Margin %, each in left-to-right, top-to-bottom and bottom-to-top orientations. Preserve source/target identity and arrow attachment while inspecting long labels, panels and Fit-all limits. A zero-intersection result for these cases does not establish universal dense-graph quality.
