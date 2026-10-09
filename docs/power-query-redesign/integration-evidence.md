# Power Query workspace redesign integration — 2026-10-09

Scope: user-approved Astra v2 first draft, pq-workspace/2 plus the approved
[filter addendum](filter-addendum.md). Original PR40 baseline f45f696 and all original
acceptance/failure evidence remain preserved; they do not establish redesigned UI
acceptance. User representative-model review and explicit final merge approval remain
separate gates. No main merge, release, M execution, data fetching or source-model edits.

Graph prerequisite c4d9386 is integrated as ca2aceb; diagnosis documentation 8bbb4d6
as 358680c. Independent corpus 57056e2 is integrated unchanged as d39c238. UI owner
retains Canvas/Inspector four modules and dedicated tests; shell owner retains app,
workspace, host CSP, registration/runtime allowlist, generated sync and integration.

Shell builds graph in a real Blob Worker using canonical dependency/graph source bytes
loaded through the existing runtime-assets loader (web) or snapshotAssets host bridge
(VS Code). Worker source never imports connectors or evaluates M. Package CSP adds
worker-src blob:, preserving nonce script-src and connect-src none. Worker failure or
unavailability is an explicit error, with no synchronous blocking fallback. Cancellation
terminates the worker; generation/job/model/metadata/revision/inventory gates reject
queued progress/ready messages and deferred navigation. Ready graph publication is atomic.

Captured metadata pairs once with initial graph rows by position, checking metadataId;
no name matching, ID decoding or overwrite by duplicate metadata identity. Exact UTF16
ranges are validated; overlaps/invalid ranges render plain source with a diagnostic.
Connectivity counts use the complete resolved incident-edge set before filtering/search.
History keeps generation-local stable IDs and viewport/inspector state, never raw source
or DOM refs. Model reset clears source lookup/history/selection/search/filter and module
DOM even when suspended. PQ state is not added to snapshot/export persistence.

Initial shell-only automated run (before the UI modules are supplied): supported
Node v22.23.3 via temporary /tmp/pq-graph-native-diagnosis-20261008 runtime; system Node
is unchanged. Fourteen focused shell checks cover identity/range/duplicate mapping,
connectivity, exact Back filter/view/scroll, same-generation restore races, canonical
worker build, cancellation/stale messages and unavailable-worker error. Full Node22
suite checkpoint 321/321 exit0, no skips: /tmp/pq-v2-shell-commit-node22.log.
Additive filter corpus c4950e2 is integrated unchanged as 3143109; its historical
partialEdgesLabeled v1 oracle remains archived and is superseded by atomicReady v2. This is a shell
checkpoint, NOT registered redesigned browser/package/native acceptance. Historical
Node24 V8 native GC crash remains preserved and unresolved in graph diagnosis docs.

Next: integrate owned UI commit; register all four assets and sync; fresh full suite,
registered T3 preview, worker scale/cancel/CSP/privacy/package checks; then exact-SHA
independent A1–A9 release. A10 remains user-owned. No old acceptance receipt is reused.
