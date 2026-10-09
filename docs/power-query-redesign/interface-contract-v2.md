# Power Query presentation contract v2 — frozen design handoff

2026-10-08. Contract version pq-workspace/2. This document freezes design decisions and module boundaries; it does NOT authorize production implementation. Parent b8dc28d5-93a0-4d03-9c78-db418da2e4bc owns approval, integration and final SHA. User proposal approval is pending; A10 representative-model approval remains separate. No PR40 changes.

## 1. Graph boundary — actual API, not a replacement

Production reference: graph implementation c4d938638d8ea64887111f81bcb3b757c2b00a13; documentation clarification 8bbb4d6635d19bc58162a6f4c62d7c583797e7be. Source read in feat-pq-redesign-graph-contract-20261008. Graph owner confirmed mapping in existing thread; no new implementation requested.

```ts
PowerQueryGraphModel.build(model, {signal, generation, isCurrent, onProgress})
// synchronous return, NOT Promise or stream
Graph = {nodes, edges, issues, generation, analysisProgress}
Node = {id, metadataId, label, subtitle, kind, table, partition, state}
Edge = {id, inputId, consumerId, referenceOccurrences: {id,name,at,end}[]}
Issue = {consumerId: string|null, kind, message, componentIds?: string[]}
Progress = {analyzed, total, complete, generation}
isCurrent(generation, model, capturedMetadata): boolean
```

All metadata records retained. Unique node IDs equal metadata IDs; duplicate display IDs are collision-safe JSON ['metadata-occurrence',metadataId,ordinalWithinId], with suffix on collision. Rebuild/unrelated insertion is stable; duplicate reorder or replacement invalidates generation. Never interpret ordinal as resolver preference. Duplicate metadata edges suppressed in both directions. Table-status IDs use collision-safe ['table-status',tableName], metadataId null, state no-partitions. No-partitions means missing partition metadata, not a source-system fact.

Kinds: partition; shared query/parameter/function hints, otherwise expression; table-status. Source classification, basis, type and exact M remain metadata fields, not graph fields. First capturedMetadata.nodes.length graph rows correspond one-for-one IN ORDER to capturedMetadata.nodes; status rows follow. This order guarantee is explicitly confirmed by graph owner for this version. Coordinator pairs ONCE by index before sorting any presentation list, checks metadataId equality, and retains row references keyed by graph ID. No ID decoding, name matching, Map(metadataId) overwrites, or per-inspector analyzer calls. Inventory is immutable through build/publication; mutations require revision/generation invalidation.

Graph already reverses legacy consumer→input once. Canvas consumes inputId→consumerId without another reversal. Edge ID is JSON ['reference',inputId,consumerId]. Occurrence.id is unique target metadata ID, equal to graph target ID for emitted edges. Presentation adds targetId=edge.inputId explicitly. All repeated occurrences survive. Explicit references to missing/non-M targets can have edges; target source unavailability does not invalidate a resolved name reference. No speculative edges for strings, SQL location, semantic relationships, ambiguous identities/partitions, or table ownership. Implicit [Field] legacy '_' without real range produces no edge and no-reference-range issue; legacy API remains unchanged.

Cycles are issues on each member, componentIds sorted. Canvas lays out strongly connected members as a group with visible Cycle badge; no execution ordering claim. Styling derives from input node kind (parameter dashed lavender), selection blue, ordinary query slate. Merge/append captions may be supplied only by supported syntax evidence; graph does not currently supply operation classification, so baseline UI says referenced by.

## 2. Coordinator presentation context and issues

```ts
Context = {version: 2, generation, graph,
  byNodeId: ReadonlyMap<string, {
    node, metadataRow: object|null,
    code: string|null, classification: string|null, basis: unknown|null,
    type: string|null, state: string,
    occurrences: {targetId:string,name:string,at:number,end:number}[],
    issues: Issue[], inputIds:string[], consumerIds:string[]
  }>, globalIssues: Issue[]}
```

Local only, never serialized into snapshot/export/telemetry. Node.code in older prose meant metadataRow.code; graph nodes do NOT carry code. Coordinator builds counts and occurrence lists from edges with matching consumerId. Validate integral UTF-16 offsets 0≤at<end≤code.length, target existence and no overlap; invalid spans render plain source and a presentation diagnostic (review severity), never guessed navigation. Exact lexeme is code.slice(at,end), including #"", doubled quotes and escapes. Inclusive @ remains outside identifier range per actual analyzer. Source string remains unchanged including CRLF, surrogate pairs and trailing whitespace. Line numbers are separate DOM; Copy uses original code, never reconstructed DOM text. Text nodes only; no imported HTML interpolation. Syntax coloring grants no navigation authority.

Issue ownership: consumerId is graph ID or null global. UI severity mapping is a presentation rule, not analyzer semantics: metadata-unavailable/no-partitions/non-M = neutral status; metadata-warning = review; duplicate-identity/no-reference-range = review; cycle = informative cycle state; analysis-notice = global informational caveat shown once; analysis-uncertainty = neutral 'Static analysis details' disclosure with exact message, not a universal amber failure. Unknown kinds get neutral details. No regex classification of dynamic/ambiguous/library-symbol strings. Current graph has NO structured dynamic/ambiguous subtype. Prototype's authored headings illustrate desired specific messages; production keeps exact opaque message beneath general details, and offers 'Inspect source / metadata' where available. Unsupported syntax/parse failure must not be relabeled as proven independence. No-edge text: 'No query references resolved.'

## 3. Module API, ownership and callback payloads

```ts
Canvas.mount(host, {context, onSelect, onViewport, onEdge})
// returns:
setContext(context|null)
setSelection(nodeId|null)
setMatches(ReadonlySet<string>|null)
reveal(nodeId, {readable:true})
fit()
zoomBy(factor, anchor?: {x,y})
getViewport(): {x,y,k}
setViewport({x,y,k}) // silent restore; no callback, Fit or reveal
focusNode(nodeId): boolean
captureLayout(): ReadonlyMap<nodeId,{x,y}>
restoreLayout(layout) // generation-local; silent
suspend(boolean)
destroy()

Inspector.mount(host, {context,onNavigate,onClose})
// returns:
setContext(context|null)
select(nodeId|null, {open:boolean})
captureViewState(): {codeX,codeY,inspectorX,inspectorY,wrap,focus}
restoreViewState(state): Promise<void>
focus(descriptor): boolean
suspend(boolean)
destroy()
```

Callbacks: onSelect({generation,nodeId:null|string,origin:'node'|'blank'|'keyboard'}); onViewport({generation,viewport}); onEdge({generation,edgeId,anchor:{x,y}}); onNavigate({generation,sourceId,targetId,occurrence:{at,end}}); onClose({generation,reason:'escape'|'close'}). Anchor is canvas-host CSS pixels. All callbacks close over/carry generation and coordinator validates before changing state. focus descriptor is {kind:'reference',nodeId,at,end} or {kind:'code'|'close'|'wrap'|'copy',nodeId}; no DOM reference retention. Missing focus destination falls back to selected canvas node then canvas host.

Canvas owns layout geometry, node drag, background-pan threshold 4 CSS px, pointer-centered wheel/pinch zoom, keyboard pan, roving node focus, minimap, edge hit testing and resize observation of its own host. Coordinate convention: screenPoint=worldPoint*k+{x,y}, translation in host CSS pixels. k finite and positive. Fit uses all component bounds and actual unobscured host; defer at zero size/hidden. Ordinary resize keeps world center/scale; never silently Fits over restored state. Reveal centers target only as needed at readable scale, leaves registry/other components intact. Minimap covers entire graph; viewport culling is rendering only. Node roving ArrowLeft/Right moves focus; canvas-background arrows pan, Enter selects. Code/input controls do not feed canvas shortcuts. Blank click clears selection; drag does not.

Coordinator owns shell library, search input, toolbars/zoom labels, resizer/docking/library collapse, empty/loading/error/cancel states, and nonmodal edge-detail popover. Edge details say 'A is referenced by B' and list occurrence line/column derived from exact consumer source; activating one selects consumer and focuses its occurrence. Canvas does not own M popover DOM. Coordinator gives canvas a host excluding inspector/library; no global Tables overlay queries. 400px default inspector on wide layouts; dock below when remaining usable canvas becomes too narrow. 13px M, min12px; visible Queries toggle at every width; no concealed-only library. Resizer keyboard support belongs to coordinator. Canvas/Inspector files remain UI owner's four modules plus dedicated new tests. Shell/coordinator worker owns app/topbar/sidebar/index/snapshot/registration/sync; none assigned by this revision.

## 4. Lifecycle and responsive work

Coordinator state machine: idle → scheduled → building → ready | error | cancelled. On model identity, metadata identity, explicit metadata revision, duplicate reorder or destroy: increment generation FIRST, abort old controller/terminate old worker, cancel pending RAF/timers/layout/clipboard UI continuations, close edge details, setContext(null) on both modules, clear source lookups/history/search/layout/selection/progress and all code DOM. No hidden retained old M. setContext(newGeneration) performs the same module-local invalidation; same-generation update preserves layout/scroll where selected ID remains. destroy is idempotent and releases listeners, observers, cached ranges/source, jobs and DOM. Tab switching within same immutable model uses suspend and preserves PQ-only state; a model reset while suspended still clears it. Tables state is separate.

Graph build checks abort/current synchronously at checkpoints and throws AbortError without partial graph. It does NOT yield to the browser, support mid-expression cancellation, or make progress paint automatically. Progress counts inspected metadata rows including non-M/unavailable, excluding placeholders. complete means inspection finished, not complete M semantics. onProgress does not publish graph. After return/messages/deferred DOM restores, gate generation + original model + original metadata + revision + alive; abort alone is insufficient. Error leaves neutral inventory/loading failure explanation, no stale edges. Cancel does not claim no dependencies.

UI-scale decision: coordinator-owned worker scheduling is required if promising interactive cancellation/progress at A6 scale; a setTimeout around synchronous build is NOT sufficient. Proposed worker receives immutable serializable model snapshot, generation and job ID, calls unchanged synchronous build, posts throttled row progress and final graph. Main coordinator binds job ID to original model/metadata/revision; identity checks occur on main publication, not across cloned object identities. Cancel terminates worker, permitting cancellation even during an expression without claiming graph API changed. Guard queued messages after termination. Worker errors/unsupported packaging must be reported; do not silently fall back to blocking build while showing cancellable UI. Worker shipping/CSP/assets and scale responsiveness require coordinator implementation and fresh browser evidence, not established by this prototype. Worker can send complete inventory before analysis only via a separately reviewed inventory phase; actual build currently returns graph atomically. Baseline loading copy therefore 'Inspecting metadata — links pending'; whole inventory/overview appears atomically on ready. This explicitly supersedes v1's unimplemented progressive graph promise.

No numeric performance budgets invented. Record build/layout/Fit/search durations, long tasks and cancellation latency on 300/301/350/1000 records and parameter+250 consumers. All inventory/components appear on ready, minimap totals whole registry, last object reachable via search/reveal, no arbitrary caps or mandatory expansion. Until worker/runtime validation, responsive scale/cancellation gate remains OPEN.

## 5. Navigation/history

Coordinator owns generation-scoped history: {generation,selectedId,inspectorOpen,viewport,inspectorView,focusReturn}. Store stable node ID, never array index. Before reference/library navigation capture exact viewport and both inspector/code scroll axes plus wrap and focused occurrence. Select target; open inspector; reveal at readable scale. Back validates generation/ID, selects and renders prior inspector, silently sets stored viewport, awaits layout then restores scroll/focus with current-generation gate. It never pushes history, calls Fit or reveal. Preserve layout on same-generation navigation; layout is captured separately for tab suspend, not rolled back on Back. If host dimensions changed, same numeric viewport remains the restore contract; only unavoidable DOM scroll bounds may clamp and must be observable.

Escape/Close closes inspector but keeps selection and returns focus to its canvas node. Blank-click clears selection and inspector. Reset empties history and retained code; late restore promises cannot repaint. Search filters library/dims nonmatches only, never graph membership/counts; typing does not rebuild inspector or move focus. Library navigation reveals at readable scale. Switching model invalidates all search/history even when IDs match.

## 6. Gates and evidence

Original independent B1–B6 and A1–A9 are still acceptance requirements, not satisfied by this contract. Parent owns user proposal approval before UI work; final A10 requires representative model in implemented UI. Independent candidate runners remain UNEXECUTED against integrated UI. No source/network M execution, credential access, snapshot allowlist change or production changes in design v2.

Updated graph owner/parent messages report supported Node22 20/20 focused and 285/285 full, native exit0, source/contract prerequisite accepted. That report is not rerun here; Node24 V8 GC crash preserved unresolved. This revision does not claim browser/runtime/product verification of graph.

### Prototype boundary

proposal.html is an authored miniature of this design, not an implementation of these module APIs. It uses SVG viewBox, fixed fixture geometry and explicit authored occurrence fragments; the production viewport contract remains {x,y,k}. Prototype does not establish worker progress, scale, minimap, resizer, node drag, wheel/pinch, metadata lifecycle, source parser correctness, export/privacy or installation. Its late-callback guard demonstrates intent only. Real 200% browser zoom remains an acceptance capture; 640px reflow is labeled an equivalent-width example, not actual zoom proof.
