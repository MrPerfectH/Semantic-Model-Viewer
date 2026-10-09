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

## UI registration checkpoint — 2026-10-09

Owned UI ce2760576e57057ecf4354c21be15be35a561ec9 was picked as 4a5e4f6 (eight new owned files only). Both JS modules precede the workspace coordinator; both CSS modules and all four snapshot runtime assets are registered. Local JS/CSS URL cache hashes were refreshed from actual canonical bytes. Generated media is integration-owned and sync verifies 31 assets.

Node22 registered regression passed 342/342, exit0, in /tmp/pq-v2-registered-node22.log. The UI owner's earlier 305-test / 14 ENOENT failure remains preserved at /tmp/pq-ui-node22-20261009.tap; module synthetic evidence is /tmp/pq-ui-owned-20261009/evidence.json and does not establish registered acceptance.

Fresh T3 reload at localhost:8944 restored the synthetic a3-results model and reported the workspace constructor present. Power Query click verification did not complete: an initial locator syntax error was corrected, then the valid role locator timed out and preview_evaluate reported no automation host connected, explicitly instructing not to retry. Browser worker/lifecycle/history/filter/resize/CRLF/Escape retention acceptance remains OPEN, as do installed and independent A1–A9 acceptance. No legacy acceptance reused, no push/merge/release.
