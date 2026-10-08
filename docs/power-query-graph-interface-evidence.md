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
