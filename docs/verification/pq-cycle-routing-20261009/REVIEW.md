# Reciprocal Power Query connector repair

Implementation-owner evidence for [PR #40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40). Clean starting integration HEAD: `9c3b836ecfcbf36a6888b576b5b8eba9f16886cd`. Worktree: `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-power-query-metadata-lineage`.

## Narrow repair

Reciprocal references now use direction-specific ports and middle channels, separated by 24 model pixels. Obstacle detours also separate the rail and approach distances. The reverse-edge lookup is built once per geometry update. Nonreciprocal routing, self-loop routing, straight M/L segments, matching 14px hit paths, open arrows, manual positions, graph semantics and public canvas API remain intact. Runtime changes are only `js/power-query-canvas.js` and its cache hash in `index.html`. All other 31 runtime assets match the baseline byte-for-byte, including reader, source analysis, graph model, history, groups and minimap styles.

The old regression compared forward/reverse SVG strings, which differ even when they describe exactly the same geometry. The new regression rejects a reversed identical polyline and checks independently hittable corridors, directed event identity, all four cardinal orientations, diagonal orientations, the exact reported drag, paint-order invariance and reciprocal obstacle detours. Browser hit testing is recorded separately from the deterministic DOM harness.

## Before and after at the exact failure coordinates

CycleA remains (0,0); CycleB is (581.456005859375,395.031982421875).

Before B→A:
```
M581.456005859375,443.031982421875 L416.7280029296875,443.031982421875 L416.7280029296875,48 L252,48
```
A→B is its exact reverse. The preserved reviewer JSON/PNG and a fresh owner T3 reproduction both show B→A's middle hit resolving to A→B. Trusted click opens only “CycleA is referenced by CycleB”.

After B→A:
```
M581.456005859375,431.031982421875 L404.7280029296875,431.031982421875 L404.7280029296875,36 L252,36
```
After A→B:
```
M252,60 L428.7280029296875,60 L428.7280029296875,455.031982421875 L581.456005859375,455.031982421875
```
Each middle hit resolves to its own edge; trusted clicks open its respective directed details and source occurrence.

## Registered T3 browser

`preview_status` reported no attached tab; `preview_open` succeeded. All browser verification used that registered T3 tab, with the actual app served from canonical source at `http://localhost:8951/`, and the synthetic-only `cycles.bim` imported through the normal UI. No fallback browser was used. `tests/pq-cycle-routing.browser.js` contains the reusable preparation and hit-probe helpers; it uses existing public canvas APIs to prepare exact layouts, then samples real SVG paths with `elementFromPoint`. Actual clicks and drag were issued by T3 tools.

`t3-receipt.json` retains geometry, hit identities, directed details, trusted click flags, layout and graph equality for horizontal right/left, vertical up/down, vertical diagonal and the exact horizontal diagonal failure. Both directions passed in all six layouts (12 trusted clicks), in addition to the two exact-coordinate midpoint clicks. The subsequent trusted drag from CycleB (0,300) landed at (581.4500122070312,395.030029296875) due to browser coordinate quantization; this is distinct from the exact-coordinate API replay and deterministic pointer regression. After that drag, two separated portions of each direction opened the correct details (four additional trusted clicks), and graph serialization was unchanged. CycleA and the hidden synthetic table retained their positions.

Screenshots: `before.png`, `afterExact.png`, `afterDrag.png`. Original T3 paths are in the receipt. The reviewer failure JSON and PNG are copied byte-for-byte with the `reviewer-` prefix; the reviewer's checkout was not edited.

## Tests, cache, sync and package

All commands used Node `v22.23.3` at `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node`.

- `node22-before.log`: 20 existing canvas tests pass, the new regression fails on exact reverse geometry before the repair.
- `node22-targeted-final.log`: **42/42** canvas/inspector tests pass, preserving the previous 41.
- `node22-full-final.log`: **409/409** pass using `node --test --test-concurrency=1 tests/*.test.cjs tests/extension.test.js tests/usage-adapter.test.js Models/tools/viewer/tests/*.test.js`.
- `sync-check.log`: all **33** generated viewer assets match.
- `runtime-package-proof.json`: all **31** HTML cache hashes match source bytes; all **33** canonical/media/served/packaged runtime assets match; public API/version unchanged; other **31** runtime assets equal the baseline.
- `package.log`: **45-entry** local VSIX, no tests, model fixtures or verification evidence bundled.
- Package: `/tmp/pq-cycle-routing-20261009.vsix`
- SHA256: `fd454aff0defbbb9353aab42af9f32cc0ee6b55c265db2cde76ed2aee4c846a7`

Earlier runs remain separate: `node22-targeted.log` and `node22-full.log` passed before adding paint-order and detour test assertions; final runs cover those assertions too. No production change occurred after the recorded browser proof or package build.

## Preserved failures and boundary

The new red regression is retained. T3 rejected an unsupported `[exact=true]` role-locator attribute and one evaluate string with surrounding whitespace; correcting those arguments allowed the same tool operations. Evaluate attempts before the asynchronous PQ workspace reached ready had no result and were repeated after readiness. These are harness sequencing/argument mistakes, not acceptance evidence. The static server's expected `/api/ping` 404 is unrelated to local BIM import.

No reader/zoom/offline browser acceptance was replayed or relabeled. No independent acceptance, installed-extension acceptance or release claim is made. The independent reviewer owns replay of the unchanged failure against the returned clean commit. Local commit only; no push, merge, PR mutation or release.
