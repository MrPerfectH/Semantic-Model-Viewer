# Independent cycle repair review — scoped PASS

Exact released candidate: `62a4bcd30673449d4a0d3bf85365e4e9e83aaabf`, parent `9c3b836ecfcbf36a6888b576b5b8eba9f16886cd`. [PR40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40) linked; no push/merge. Independent app-bound worktree started at evidence commit `093fdd9da4eb4fe78bfd10a0c85a15439a599d08`. That commit's HOLD report, original failures, fixtures and frozen script remain unchanged.

**The strict opposing-cycle hit-identity gate passes on this exact runtime.** The unchanged frozen script performed the actual card drag, landing CycleB at exactly `(581.456005859375,395.031982421875)` from `(0,300)`. CycleA and every other stored position were unchanged; serialized graph was unchanged. B→A had 191/199 accessible own samples and A→B 199/199. Actual trusted clicks opened both respective semantic headings. The old failure is resolved within the tested routing scope; this is not native or A10 acceptance.

## Frozen script and actual evidence

Script: `tests/pq-redesign-independent-reader-connectors-cycle-hit.scenarios.cjs` at repository root. Its bytes equal `093fdd9`; SHA256 is recorded in [independent-assertions.json](independent-assertions.json). No oracle edits, changed fixture, hidden failed assertion or owner receipt substitution.

- [Final unchanged-script receipt](frozen-replay-chunked/receipt.json).
- [Actual before/after graph, all positions, paths and 199 hit samples per edge](frozen-replay-chunked/observed.json).
- [Own hit counts](frozen-replay-chunked/identity-oracle.json) and [actual semantic clicks](frozen-replay-chunked/semantic-clicks.json).
- Trusted CSS click `(1137.5419921875,744.2899780273438)` opened `CycleB is referenced by CycleA`; `(734.778076171875,280.5)` opened `CycleA is referenced by CycleB`. These are newly sampled own-hit coordinates on repaired routes. The frozen model-space drag coordinates match the original failure exactly.

Three setup/transport attempts remain preserved separately. `frozen-replay/` timed out because the initial model-picker backdrop covered Open model. Inspection identified the actual hit target as the fixed z-index58 backdrop. Escape did not dismiss it (`frozen-replay-ready/` retains the second timeout); read-only inspection of unchanged topbar.js identified its click dismissal. A trusted backdrop click cleared it and exposed Open model. `frozen-replay-unobstructed/` then reached the actual drag but could not transfer its complete graph plus 398 point records through T3's 64000-byte evaluate result limit. The final run uses the **same script**, with a lossless JSON-chunk transport wrapper saved as `tests/pq-redesign-independent-cycle-chunk-transport.cjs`. It transfers the exact original evaluated value in 12000-character pieces. This changes transport only, not the oracle or browser actions. No failed attempt is relabelled a passing runtime test.

## Independent additional routing and minimal regression

`tests/pq-redesign-independent-cycle-repair-62a4bcd.scenarios.cjs` executed fresh against the registered T3 app. [Receipt](supplementary/receipt.json) and [raw routing evidence](supplementary/routing.json) cover eight layouts: exact frozen diagonal, horizontal right/left, vertical down/up, vertical diagonal, horizontal diagonal left and reciprocal obstacle detour. Each edge has an independently accessible hit region; two sampled locations per edge were clicked, totaling 32 additional trusted clicks. Every click opened its own input→consumer heading and `Line 1, column 9` reference detail. Graph and **all** prepared layout positions remained unchanged through each pair's inspection.

All visible paths are orthogonal M/L segments with exactly matching 14px hit paths. Markers remain 8×8, open chevrons, automatic orientation. Independent geometry assertions verify the final segment enters the consumer boundary in the correct direction for all 16 directional routes. Reciprocal detours do not intersect the intervening card. Exact visible node IDs equal minimap IDs throughout the eight cases. [Assertions](independent-assertions.json) retain derived checks separately from raw observations. [Diagonal screenshot](repaired-diagonal.png) and [obstacle screenshot](reciprocal-obstacle.png) were visually inspected: separated straight corridors and small directed arrows are visible.

Fresh minimal shell regression selected the explicit Landing/SQL folder and checked library, canvas and minimap membership (`FarA`, `Sales Raw`), then reset filters and opened OccurrenceProbe's wide reader. Exact source equality, same code DOM, viewport-minus32 dialog width, and Escape return to Open full query passed. [Evidence](supplementary/minimal-regression.json). API calls prepared deterministic positions; actual T3 tools performed import, card drag, clicks, selection and Escape. Setup APIs are not represented as pointer actions.

## Runtime, tests and package

[runtime-mapping.json](runtime-mapping.json) independently maps 33 exact Git blobs to served copies, actual integration canonical files and generated media. Only `index.html` and `js/power-query-canvas.js` differ from 9c; the other 31 are byte-identical. This is runtime equivalence, not a claim that the independent evidence branch is the integration tree. No source models/data were checked out or read; only the existing synthetic fixture was imported. The own service used port54091.

Fresh independent Node `v22.23.3`, exact-candidate canvas/inspector tests and harness mapped into `node-mapped/`: **42/42 pass, exit0**, [log](node22-targeted.log). Owner full409/409 remains owner evidence, not our execution. Owner review/package/browser files are copied with `owner-` prefixes and are not counted as independent acceptance.

Fresh independent audit of `/tmp/pq-cycle-routing-20261009.vsix`: SHA256 `fd454aff0defbbb9353aab42af9f32cc0ee6b55c265db2cde76ed2aee4c846a7`; all 33 runtime entries equal mapped candidate bytes, all 45 entries enumerated, no fixtures/models/tests/docs/evidence/data. [Package proof](package-proof.json). All 31 index cache hashes independently match their assets: [cache proof](cache-proof.json). Package equality establishes bytes, not installed operation.

## Carried evidence and explicit limits

The 9c wide-reader/long exact CRLF+UTF16/copy/full Back/lifecycle tests, true Chrome200%1280/1440 orientation transitions, downloaded snapshot/offline/helper/privacy and Tables/Measures checks remain historical results in `../reader-connectors-9c3b836/`. Their owning implementation assets (inspector JS/CSS, workspace JS/CSS, app/parser/graph, snapshot/helper/Measures/Tables and other styles) are byte-identical here. Index changed only the canvas cache hash. Those semantic paths were not broadly rerun or restamped. The new routing assertions and minimal folder/reader check above provide proportionate fresh integration coverage for the changed canvas runtime; they do not turn all old journeys into fresh candidate executions.

T3 status reported no attached tab and T3 open succeeded. All browser work used the registered T3 tab; no Chrome fallback or native application was used. Native blank investigation, installed/native acceptance and A10 user product acceptance remain open. No large-model, broad lifecycle/privacy, cross-platform or old A1–A9 verdict is newly claimed. The original9c HOLD remains historically correct. No production edits, source/M execution, credentials, new jobs/chats or watchers.

Owned preview closed and own server terminated; [cleanup](cleanup.json). This completes the scoped independent review. The parent owns any next integration/user acceptance decision.
