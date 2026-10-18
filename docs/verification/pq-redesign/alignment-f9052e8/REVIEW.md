# Independent Tables-alignment review — f9052e8

**Historical verdict: blocked by exact Back restoration at1280×800.** The subsequent repair has a separate report at `../alignment-6b352ca/REVIEW.md`; it does not rewrite this verdict or any failed receipt.

Exact candidate `f9052e8f269cd097f687eb7a9428b7b105a2803d`; ordered shell `0a4fe2d833545acf8990f1b68a60262dd101286c`, UI pick `fc18edf0b21191aa6995286687736a7c0bb4124d`, registration/geometry f9052e8. Read the full copied implementation contract and inspected Tables01 and target04 before testing. The 33 runtime assets in `served/` match candidate Git blobs and SHA256s in `runtime-mapping.json`. This is runtime equivalence, not full checkout equivalence: app-bound review checkout stayed at d8f6e9e plus owned new evidence, preserving b5/712/d8 and all existing fixtures. No source models/data were checked out, read, fetched, or executed.

## Confirmed blocker and cause

At1280×800: select OccurrenceProbe; Hide unrelated / Inputs / Selected only; remove Sales Raw; On canvas; Disconnected + search Occurrence. Focus the original exact M reference and retain viewport123,87,1.3. Trusted Enter navigates to Sales Raw; Back must restore full captureNavigation.

`back-diagnostic-1280/back-after.json` confirms inspector scroll325→48. Before reference activation the reference disclosure is open, root969px high/client644px/maxScroll325. On Back it is already closed **before restoreViewState**, root692/client644/maxScroll48. The attempted restore clamps325→48. Focus and final applyFilters leave48 unchanged. T3 separately observed318→39; fresh Chrome repeated325→48. The root cause is missing disclosure state before scroll restoration; moving only the final shell filter call cannot restore the missing range. The strict full-state oracle was not relaxed. The1440×900 no-scroll pass is explicitly insufficient to clear this1280 regression.

## Fresh alignment scope results

| Scope | Fresh evidence | Outcome |
|---|---|---|
| Tables visual authority and PQ shell | browser-02/01-tables-1280.png,02-pq-1280.png,03-tables-1440.png,04-pq-1440.png; visual-membership.json | Passed. Same268px library,62px toolbar, compact rows, shared252px card treatment and actual associated-table color. White M card and mono reference links visually inspected. Ordinary readable selection can leave inputs outside viewport; Fit gives overview, consistent with specified behavior. |
| Membership and layout history | browser-02/visual-membership.json | +/− keyboard activation, Available facet/stable focus, hide vs removal, Blank/Undo, visible-only Arrange/Undo, Show all preserves positions/source/history. Tables selection/marks/positions/137,93,.9 restored after PQ Escape/roundtrip. |
| Neighborhoods, search, cycle | browser-01/neighborhoods.json,cycle.json; also T3 receipt | Authored expectations for input/consumer/connected at0/1/2/all; bounded cycle; Add related/Remove unrelated; search dims without shrinking canvas; full registry/count/map/layout/generation retained. |
| Exact partitions/crosslinks | browser-01/crosslinks.json | Unique table→exact partition→table; Sales multipartition explicit Current/History chooser with no guessed selection; selected History returns Sales; no-partition explanation; shared expression has no invented table. |
| Exact M/filter/history | browser-02/exact-back.json | CRLF, emoji, all five repeated/escaped reference targets and exact clipboard pass at1440.1280 full Back scroll FAIL as above. Reset preserves membership/focus/viewport/code/history; Show all is distinct. |
| Disconnected and keyboard removal/cancel | disconnected-keyboard/receipt.json | Six same-SQL partitions + semantic relationship produce zero PQ edges; All6/Connected0/Disconnected6. Empty category explicit0, full map muted; search does not hide canvas. Delete in search preserves membership; selected-card Delete removes only membership; Undo restores. Actual cancellation clears code/history and rejects released stale work. |
| Model/metadata lifecycle | reset-complete/reset-stale.json | Selection/M DOM/both history stacks/filter/focus/membership reset; suspended metadata revision handled; actual held Worker ready message rejected after reset. |
| Scale geometry | scale-isolated/*.json/.png |1000 disconnected and251 parameter/fanout nodes; complete map/registry, all bounds within fitted overview, final target readable and visible. No new broad parser analysis test inferred. |
| Actual browser200% and transitions | zoom-transitions plus zoom-1440-cached-replay | Browser settings zoom2→1→2 at outer1280/1440; measured CSS640/720 and DPR2 (visualViewport.scale1). Both docking orientations: keyboard +20/+40, pointer +40. Actual pointerdown DIV.pqw-resizer, trusted coordinates, visualViewport and all scroll offsets recorded. Cached zero-table model picker dismissed via actual click before nav. One1440 step had loopback ERR_CONNECTION_RESET; targeted1440 replay3/3 passed after harness-server stabilization. |
| Privacy/offline/helper | privacy/receipt.json and download | Actual default snapshot excludes raw M/private markers; offline file boots shared WorkspaceUI and Measures formatting; PQ explicit unavailable with no M DOM. No source/model-data request. |
| Package | package-proof.json | Exact VSIX d4ab750a…:33 runtime entries match candidate; no model/report/fixture data. Static artifact check only. |

## Preserved harness failures and boundaries

T3 boot/import/interactions worked, then explicit lost-host/do-not-retry response required authorized fresh Chrome fallback. `transport-boundary.md` retains the boundary. All partial T3 evidence and both browser attempts remain.

Documented harness issues: missing initial screenshot directory; comparing Map iteration order rather than ID→position; loopback connection reset while loading an asset; stale held-worker hook after that failure; returning Worker.prototype by value from CDP cleanup. Corrections were targeted and recorded before reruns. No production patch or relaxed source/viewport oracle.

Keyboard-only native SELECT default-action remains **unverified** in the headless transport: Arrow/Enter did not commit option changes, and plain HTML select reproduced the anomaly outside the product. See `native-key-boundary.md`; earlier hypothesis that Enter alone would resolve it was falsified. Trusted keyboard row membership, exact-reference Enter, Back, Escape, Delete, and resizer interactions passed separately. Do not call event-driven select changes a complete keyboard-only acceptance pass.

Parent385/385 Node22 is reported build evidence, not an independent full-checkout rerun. Native blank/installed workflow and A10 remain open. No push, merge, release, source modification, native interference, new job, or watcher.
