# Round 7: restore zoom chrome and navigate readable long flows

Implementation branch `fix/pq-readable-flow-round7`, based on `0d964fc97273cca8626e3cc4e9b39f73620b7e24`, in `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/t3-bea3fe03`. Integration and independent-review checkouts were read-only. PR [40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40) is linked, open, unwatched. No push, merge, release or installation.

## Result and contract

- Shell `restoreViewport` is the single restoration path for Undo, Back and Reset filters. It calls the existing silent `Canvas.setViewport`, then refreshes the zoom label from **actual `getViewport()`**, including the guarded post-inspector restoration. Existing generation/navigation epoch checks remain. Rejected viewport input does not display the requested value.
- Automatic initial/Arrange/Hide/Trace/Show-all framing first computes the existing fit. Below 25% (where existing compact labels stop being readable), it centers the selected visible object at at least 85%; without a selection it chooses an actual visible terminal node, or the first visible object in a cycle. No new selection, root, membership, direction, depth, edge or position is invented.
- Explicit **Fit overview** and canvas **F** retain full projection fit, including 2.923% for this 52-node chain. The notice explains this is overview and how to return to readable detail. At readable scale it says the objects are retained and the user can pan/follow references; it does not claim all objects are onscreen.
- Flow-bar **Follow input / Follow consumer** uses exact supplied adjacency IDs, existing navigation/history and source/generation gates. Branches offer a compact chooser instead of expanding many buttons. The stable flow target remains separate from the inspected node.
- Below-docked layouts reserve the measured flow-header height plus 420px canvas height. This keeps centered card titles clear of navigation and minimap; the existing scrollable below inspector remains reachable. Map position/routing logic is unchanged.
- Canvas public API and silent notification semantics are unchanged (only its keyboard help text now names overview). Parser, analyzer, graph model, inspector, source ranges, clipboard, snapshots, Tables and Measures sources are unchanged. Cache keys updated; derived media synced.

## Before and after evidence

Fresh baseline normal imports reproduced both findings before source edits, using the independent synthetic fixtures copied byte-for-byte into `tests/acceptance-fixtures/pq-round7/`.

| Observation | Before | Final implementation |
| --- | --- | --- |
| Center → Arrange → Undo | k=.85/85% → k=.3157582938/32% → k=.85/**32%** | k=.85/85% → k=.3157582938/32% → k=.85/**85%**, exact x/y, positions, root |
| Initial 52-object canvas | 5.156% / effective title .696px | 85% / 11.475px |
| 52-object Hide + Arrange | 2.923% / effective title .395px | 85% / 11.475px; local area visible, all 52 retained |
| Explicit Fit overview | 52 cards in view at 2.923% | Still 52 cards at 2.923%, now explicitly labeled overview |
| Full chain navigation | Manual navigation available | All 51 input hops to Parameter and 51 consumer hops back to FinalChain pass, preserving root and per-ID positions |

[Before screenshot](before/chain-overview.png), [readable final](after/chain-readable-final.png), [readable parameter](after/chain-readable-parameter.png), [640px readable card](after/chain-readable-640.png).

Baseline [Undo data](before/arrange-undo.json), [chain geometry](before/chain.json), [receipt](before/receipt.json). Final automated [navigation](after/navigation.json), [branch chooser](after/branch-navigation.json), [chain geometry](after/chain.json), [receipt](after/receipt.json). Final registered T3 [Undo exact equality](t3-final-undo.json), [52-chain navigation](t3-final-chain.json), [screenshot](t3-final-chain.png). T3 used normal import/update, actual tool clicks and read-only evaluation; no state injection or M execution.

## Checks

- Known executable `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node`, v22.23.3 only. No Node24 retry.
- Final full appropriate suite: **419/419 pass**, zero skipped/failed, [log](logs/full-final.log). Three new meaningful unit regressions cover silent/accepted restoration across paths, superseded async Undo, and readable framing without membership changes. Existing canvas silent restoration and generation tests remain intact.
- Browser harness `tests/pq-round7.browser.cjs`: fresh isolated Chrome 154.0.8037.99, normal file chooser imports, trusted controls, read-only geometry/state assertions. [Final browser log](logs/browser-responsive-final.log). Actual 85→32→85 case; exact layout/root; Back/reset/Blank Undo; branch chooser; all 102 chain hops; 1280, 760, 640 CSS-pixel views. Title-center hit testing added after visual review found occlusion. These widths are **not** a fresh true-browser-200% acceptance claim.
- T3 `preview_status` then `preview_open` used first; own tab `tab_4_a0d1d832-9389-42c1-bd1c-8b8de950c5a2`. Both requested cases were replayed again after final source changes and cache update on `http://127.0.0.1:8947/Models/tools/viewer/?round7=final`.
- Final sync/check: **33 assets**. Local VSIX `/tmp/pq-round7-0.3.3.vsix`, **45 files**, version0.3.3. [Final proof](package-final-proof.json) contains SHA256 and all33 source = HTTP = package byte comparisons; all31 HTML cache hashes verified. [Package log](logs/package-final.log). Earlier package proof is historical, superseded by final proof.
- Read the independent `flow-0d964fc/REVIEW.md`. Frozen independent test and its failure evidence are unaltered; [read-only reference/hash](frozen-reference.json). Parent owns replay on the new exact commit. Historical 77/77, true200%, offline and parent416 counts are not restamped as fresh independent passes.

## Preserved failures and limits

1. Initial T3 upload calls returned `invalid locator` and `invalid selector`; later snapshot exposed the actual strict-mode ambiguity: `input[type=file]` resolved to two elements. A picker-less call then reported no open picker. Isolated Chrome workflow proceeded after the two same-step failures. T3 subsequently worked through **Choose files → upload**, and both final journeys passed there. This was not a claim that T3 was unavailable. One invalid role selector `[exact=true]` was corrected after the explicit parser error.
2. Baseline browser helper initially expected the first-run Import button after a model was loaded. Timeout retained in `logs/baseline.log` and `before-attempt1/`; helper changed to use normal Open model for subsequent imports. The successful reproduction is `before/` and `logs/baseline-replay.log`.
3. Numerical responsive assertions initially passed despite occlusion. Visual inspection caught the navigation overlay, preserved as `after/occluded-*-before-fix.png`. First height adjustment left minimap over the title; new hit test failed and evidence remains in `minimap-occlusion-before-fix.png`, `minimap-occlusion-receipt.json`, `logs/browser-readable-responsive.log`. Final reserved height passes both screenshots and hit test. No failed receipt was relabeled a pass.
4. Static preview helper `/api/ping` returns404 as expected from Python's static server; no page exceptions occurred in the final automated journey. Port8945/user preview was not stopped. Port8947 serves this isolated checkout.
5. This is a limited readable-navigation solution, not a readable all-52-in-one-screen view. Full overview intentionally remains tiny. User acceptance is still required by the parent's long-flow gate. The separate native/installed blank-view investigation remains OPEN and was not tested or changed here.

Parent next action: replay the untouched independent changed-zoom Arrange/Undo repro on this exact commit, inspect the final/parameter screenshots and actual navigation, then conduct the user's long-flow acceptance. No new workers, recursive jobs or chats were created.
