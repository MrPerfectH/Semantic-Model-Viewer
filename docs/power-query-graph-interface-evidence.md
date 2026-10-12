# Power Query graph prerequisite — 2026-10-08

Baseline: open [PR40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40)
at `f45f69605b8620d39495d96b8d04a7ed4cdf70ae`. Isolated prerequisite only;
no UI integration, push, release or product acceptance. Read CONTRIBUTING.md,
the existing metadata contract and `/tmp/pq-redesign-20261008/design-plan.md`;
inspected synthetic `proposal.html` in T3 preview (1280×800). No applicable
AGENTS.md/CLAUDE.md was found. Existing fixtures/evidence remain unchanged.

## Interface and identity

Load dependencies before graph model. `PowerQueryGraphModel.build(model, options?)`:

```js
{nodes, edges, issues, generation,
 analysisProgress: {analyzed, total, complete: true, generation}}
// node: {id, metadataId, label, subtitle, kind, table, partition, state}
// edge: {id, inputId, consumerId, referenceOccurrences: [{id,name,at,end}]}
// issue: {consumerId, kind, message, componentIds?}
```

All metadata rows remain, including disconnected/missing/non-M. Unique rows keep
`id === metadataId === original ID`. Partition IDs remain explicit; `partition`
is its name. Labels are `Table` or `Table / Partition`. Shared kinds use existing
query/parameter/function hints, otherwise expression; partitions stay partition.
State is unchanged; classification provenance is accessed through metadata.

Duplicates retain every row and original metadataId. UI ID is JSON
`['metadata-occurrence', metadataId, ordinalWithinThatId]`, with integer suffix
on collision. Stability is tested across rebuilds and unrelated-row insertion.
Duplicate reorder/content replacement requires generation invalidation; identity
cannot be inferred. Duplicate identity edges are suppressed in both directions.
Duplicate names/multiple partitions/shared-expression–table collisions retain
resolver ambiguity. No guessed partition or name target is chosen.

Tables without partition metadata get collision-safe JSON `['table-status',name]`
IDs, metadataId null, kind table-status, state no-partitions. This states a metadata
limitation, not actual source partition absence. Placeholders never resolve edges.
Graph output contains no raw M; snapshot allowlist remains unchanged.

Edges reverse legacy consumer→input **once**, yielding input→consumer. ID is JSON
`['reference',inputId,consumerId]`. Every real occurrence is retained. SQL locations,
semantic relationships, strings/comments and partition ownership create no edges.
Explicit name references to missing/non-M metadata remain valid static edges;
those targets' sources contribute no analyzed dependencies.

Opaque analyzer strings use analysis-uncertainty; its terminal generic notice is
emitted once as analysis-notice. Extraction warnings use metadata-warning; absent
metadata uses metadata-unavailable. Duplicate-identity/no-reference-range/cycle
issues come from actual identities/ranges/emitted edges, without regex guesses.
Iterative SCC detects self/cyclic components; sorted componentIds appear per member.

## Source ranges and compatibility

Analyze additively returns references from the **existing scope walk**. Parse
failure clears references AND dependencies. UTF-16 offsets are end-exclusive and
cover exact quoted spelling, escaped quotes/sequences, repeats and surrogate pairs.
Consumers render `node.code.slice(at,end)`, never decoded `name`. CRLF is untouched.
Inclusive `@Identifier` ranges cover the identifier, excluding @.

Dependencies retain dedup, first-reference location and `{id,name,at}` shape.
API version 1, graph `{from:consumer,to:input,name,at}` and render semantics remain.
Reviewed/approved exception: implicit `[Field]` creates a legacy synthetic `_`
dependency without an identifier spelling. No navigable occurrence is invented;
adapter omits its edge with no-reference-range. Explicit `_`, when present, supplies
only its real ranges. This issue was reported before coding and approved in steering.

## Cancellation and caller ownership

Options: `{signal, generation, isCurrent, onProgress}`. Generation defaults to null.
`isCurrent(generation,model,capturedMetadata)` tests caller-owned active model,
metadata, generation and destroyed state. AbortSignal/stale gate/same-model metadata
replacement throws AbortError with no partial graph. Checkpoints surround work,
rows, callbacks, component traversal and return. Progress counts inspected metadata
rows, including unavailable/non-M, excluding placeholders. Complete means inspection
finished, not complete M semantics. Callbacks receive zero, each row and completion,
with generation; they must not publish graphs. Final-callback cancellation also
prevents return.

Build is synchronous: no browser yielding or mid-expression interruption. The
coordinator owns controller, generation and lifecycle; on model/metadata switch or
destroy, abort/increment/clear state. Before any publication, including queued/late
results, recheck result generation AND captured model/metadata identities AND alive
state. No module state/async work is retained; no destroy method is needed. Tests
cover abort, switch, metadata replacement, destroy and late-generation rejection.
Actual shell lifecycle/worker scheduling remains integration-owned.

## Evidence and caveats

Node v24.15.0, isolated worktree. Exact commands/results:

- `node --test tests/power-query-graph-model.test.cjs tests/power-query-reference-ranges.test.cjs tests/power-query-dependencies.test.cjs tests/power-query.test.cjs tests/power-query-lineage.test.cjs`: initial 48/48 pass, before metadata-replacement test addition.
- `node --test --test-concurrency=1 tests/*.test.cjs Models/tools/viewer/tests/*.test.js tests/extension.test.js tests/usage-adapter.test.js`: final **285/285 pass**, 13.09 seconds; transcript `/tmp/pq-graph-contract-final-20261008.log`. Earlier passing run preserved at `/tmp/pq-graph-contract-full-20261008.log`.
- `node --check Models/tools/viewer/js/power-query-graph-model.js`, `node --check Models/tools/viewer/js/power-query-dependencies.js`, `git diff --check`: pass.

Coverage includes exact 300/301/350/1000 disconnected inventories, fanout with
300/301/350/1000 consumers, 1000-node cycle, ambiguity/shadowing, comments/strings,
quoted/repeated/CRLF/surrogate ranges, malformed syntax, legacy API and snapshot exclusion.

Initial full run failed with `ENOENT ... vscode-extension/media/index.html` because
fresh ignored media was absent. The later extension.test.js automatically generated
it through the existing sync script. `node vscode-extension/scripts/sync-viewer.js --check`
then verified 25 assets at that intermediate revision. Failure remains in the tool
transcript. Ignored media is not committed/integrated; coordinator must regenerate
and check the final integrated revision. Only five owned files are committed.

Partial analyzer syntax/work/depth/code limits remain. Inventory lookup per row and
synchronous building are not UI performance evidence. No parser/source-loader/shell
edits, source data reads, M execution or credential access occurred. Consumers must
coordinate this written contract before implementation. UI registration, lifecycle,
accessibility/browser/installed-app checks and A10 user acceptance remain separate
coordinator/user gates. This thread has no integration assignment.

## Independent-run diagnosis and presentation clarification

The independent c4d9386 two-file run failed at graph-file level (239.313459 ms),
with seven reference tests passing. `/tmp/pq-parent-graph-contract-review.log`
is preserved. Its shell wrapper returned tail's status, so the original Node
exit code, signal and PID were not captured. This failure is not reclassified
as a pass by later successful probes; the prerequisite review gate remains open.

A matching macOS report, `~/Library/Logs/DiagnosticReports/node-2026-10-08-182404.ips`,
records /usr/local/bin/node PID77216/parent77215, capture 18:24:03.7234 +0200,
EXC_BAD_ACCESS/SIGSEGV at address 0xe. Native lifetime is 237.99 ms, matching the
file-level duration and log modification second. Top frame is
`v8::internal::ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`, followed
by GC root iteration/MarkCompact. This strongly correlates the failure with a
native Node/V8 GC crash. Original-PID correlation and the exact triggering V8
defect remain unproven; concurrency, OOM and source assertions are not established
causes. No production/test fix is justified by this evidence alone.

Bounded diagnostics changed one variable at a time, without pass-seeking loops.
All used unchanged c4d9386 source/tests, the same isolated cwd, arm64 macOS, and
otherwise unset NODE_OPTIONS/UV_THREADPOOL_SIZE:

- Exact `node --test tests/power-query-graph-model.test.cjs tests/power-query-reference-ranges.test.cjs`, with external process-event preload: 20/20, root exit0, both children exit0/signal null. Graph child maxRSS344240 KiB. This instrumented result changes timing and is not a native-crash fix.
- Same command without preload: 20/20, actual Node exit0, 388.72 ms test duration.
- Instrumented baseline plus `--max-old-space-size=128` (earlier-GC diagnostic only): 20/20, root/children exit0 with no signal. Not evidence of an original memory limit or a supported workaround.
- Same two-file command using temporary official Node v22.23.3 (V8 12.4.254.21-node.57): 20/20, actual exit0, 408.67 ms. System Node remains v24.15.0 (V8 13.6.233.17-node.48). This checks CONTRIBUTING.md's Node22 requirement; it does not prove the Node24 failure fixed.

Receipts, process events, stdout/stderr, original crash extract and verified Node22
archive checksum are preserved under `/tmp/pq-graph-native-diagnosis-20261008/`.
To reproduce supported-runtime validation without replacing system Node:

```sh
/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node --test tests/power-query-graph-model.test.cjs tests/power-query-reference-ranges.test.cjs > /tmp/pq-graph-review-new.log 2>&1
test_status=$?
tail -n 25 /tmp/pq-graph-review-new.log
exit "$test_status"
```

Preserving Node status is the verification-wrapper correction; it does not repair
the native crash. Diagnostic scripts are explicitly marked outside production;
tests and implementation are unchanged. UI remains HOLD; independent verification
and any runtime-defect escalation belong to the coordinator.

Presentation mapping guarantee for c4d9386: the first `metadata.nodes.length`
graph nodes pair one-to-one with the same captured metadata inventory **in order**;
placeholders follow. Build never reorders nodes. A pure graph-ID→metadata-row Map
by index handles duplicate rows without decoding IDs; assert metadataId matches
the paired row ID. Keep the captured inventory immutable through build/publication.
Unique resolved occurrence IDs equal metadata IDs and graph IDs. Dynamic/name/
multipartition ambiguity has no structured subtype beyond opaque
analysis-uncertainty; duplicate-identity is a distinct identity finding. Code,
classification and basis can be read through this captured presentation lookup.
