# r10 implementation handoff

Implemented the direct 2026-10-10 selection/lock, readability, compact-layout and source-type request in the sole-owner integration worktree. Base **e662a214d1621dc8c43b6310df57bfa504b146fc**; final runtime **209c226c62a431522650104ded8011a73e8391f3** (implementation commits15509b4 and209c226). Later evidence-only commits do not change runtime. PR40 is linked to this thread. No push, merge, release, installation, source model modification, connector request or M execution was performed. Independent parent review remains the release gate.

## What changed

- Removed the top flow strip, target selector and Follow/Trace buttons. Ordinary click selects and inspects with exact viewport/position preservation. Unlocked focus follows selection; an explicit inspector lock freezes the root. Its pressed state, accessible label, native keyboard activation and tooltip explain release. Input/consumer buttons and exact M links remain direct navigation with Back. Hide/dim/direction/depth use the locked root or current selection. Reset preserves focus settings; Blank/Show all/root removal release the lock. The [replacement contract](../../power-query-redesign/selection-lock-contract.md) documents superseded behavior and legacy-history compatibility.
- Fixed white fact titles on pale headers in both canvas and inspector. Selected cards remain fully opaque even outside a locked root. Other cards dim to65%, edges to55%; non-scaling1.8px strokes retain parameter dashes and reciprocal directed hit identity. Fixed secondary fonts retaining huge sizes across tiny-overview→85% transitions. At overview scale cards show title/kind; provider details remain in tooltip/inspector, with provider footers at detail scale.
- Fit preserves positions. For2–8 visible queries, **Arrange compact** beside Fit makes distant inherited coordinates a one-action repair. It uses the visible induced graph, retains hidden coordinates, and Undo restores exact per-ID coordinates and numeric viewport. No filter silently changes manual placement.
- Added independent model/kind and provider axes: Model table from partition/table association; Parameter from metadata; Source query and Inline table from scoped direct-call evidence; Intermediate query from resolved inputs; otherwise unknown. Dataflow, Databricks, SQL Server and other explicitly cataloged calls have distinct provider labels/colors/icons. Mixed is explicit. The same M parser respects local/function/model shadowing, duplicates and incomplete syntax. Call arguments are not retained in evidence; no query names or physical/executed lineage are inferred. The original12 builtins/model-precedence behavior is unchanged.

## Current evidence

| Gate | Result / receipt |
| --- | --- |
| Full Node22 extension/CLI/viewer suite | **485/485**,0 failures/skips; `full-final-node22.log` |
| Selection/lock, outside-root fact contrast, trusted Enter, Back/unlock, two far-origin nodes, Fit/Arrange/Undo, exact47/85% edges, raw reader/ref navigation, source kinds | **4/4** outer1280/1440 × true100/200%; `browser-6/receipt.json` and per-case JSON/screenshots |
| Right/Bottom, actual resize keyboard/pointer, exact ordinary-selection viewport/body, repeatable Center, same reader DOM | **8/8**, unchanged r9 script; `frozen-final/docs/verification/pq-selection-docking-r9/zoom-docking-complete/receipt.json` |
| Long52-node flow Hide/Arrange immediate title own-hit | **2/2** true200%; `final-r7.log` |
| Deliberate framing, later wheel, six rapid trusted Back→separator/ArrowLeft ownership trials | PASS; `final-r8.log` |
| Arrange/Undo exact per-ID positions, numeric viewport, displayed zoom | PASS, unchanged script; `final-arrange.log` |
| Exact CRLF/UTF16 Copy M argument, repeated references, expanded Back/disclosures/wrap/codeXY/source focus, stale callbacks | PASS, unchanged T3 r9 scenario after explicit lock preparation; `t3-reader/receipt.json` |
| Strict body123px/canvas123,87,1.3/source focus and keyboard Arrange/Undo | PASS, unchanged T3 scenario; `t3-body-history-final/receipt.json` |
| Reciprocal edge identity after trusted horizontal drag | PASS: each edge has independent interior hits,14px hit width and correct trusted-click details, graph immutable; `cycles-browser/` |
| Fresh T3 snapshot, actual network-offline open, Measures formats, PQ honestly unavailable, private offline re-export | PASS; `final-offline.log` and `frozen-final/docs/verification/pq-redesign/round9-963638a/offline/` |
| Source/Git/media/HTTP8945/HTTP54093/VSIX | **33/33 byte-equal**,31 cache hashes valid; `package-runtime-proof.json`; sync check passed |
| Previous evidence/fixtures | **2,771 files hash-unchanged**, including all frozen originals; `historical-hashes.json` + package proof |

Exact binary: `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node` (v22.23.3). Node24 was not used. Package: `/tmp/smv-pq-selection-lock-r10-final.vsix`,45 files; package hash recorded in proof. Generated media are ignored build outputs, verified rather than committed.

## Browser and test provenance

All three supplied user screenshots were inspected directly. T3 `preview_status` then `preview_open` established own tab on8945. `before-runtime.json` confirms33 source/Git-baseline HTTP assets before edits. Fresh baseline Tables/Measures/PQ screenshots are in this directory. Normal synthetic import used the actual importer: an early file-input attempt used File/DataTransfer through its change handler after selector errors; subsequent imports used trusted Choose files and successful T3 file chooser upload. No user source models or credentials were opened. `t3-final-runtime.json` registers current loaded asset URLs and31 live fetched runtime hashes; full33 comparison includes index and the VS Code host adapter in package proof. T3 remains on parent-owned8945; the temporary own54093 service is stopped at handoff.

`browser-6/` contains the final current-runtime screenshots. In particular `1440-2-locked-fact.png`, all `*-compact.png` and `*-edge-0.47.png` show current typography/contrast. Earlier browser folders retain failures and intermediate visuals; they are not final acceptance. `after-tables.png`, `after-measures.png`, `after-databricks.png` are fresh T3 captures. The84-object after fixture adds source/role probes and disconnected items to the prior14-object synthetic source; it is not the user's real model.

Frozen scripts are preserved. `frozen-final-provenance.json` maps exact33 runtime hashes and original/adapted script hashes. Only user-superseded entry behavior is adapted for r7/r8: explicit inputs/all distance replaces auto-first-root; direct Inspect input replaces top Follow; removed Trace action is omitted; removed flow-bar diagnostics are omitted. All remaining semantic/geometry/focus assertions are unchanged. r9 docking, source/body scenarios, Arrange/Undo and offline scripts execute unchanged. Old candidate IDs and obsolete unavailable-browser text in raw frozen receipts are historical script constants, not current runtime identity or current capability evidence.

## Diagnosed failures retained

- Two old unit assertions expected automatic first-root locking; changed explicitly per the user request. New tests cover unlocked/locked history and stale callbacks.
- The new fact probe initially had1 column and2 measures, so the existing structural role correctly classified it as a measures table. Added synthetic columns; no production role heuristic changed.
- New layout comparisons initially compared Map insertion order rather than per-ID positions; corrected the oracle to sort IDs. All coordinates had restored exactly.
- The new edge-width assertion initially used Number on a CSS `px` string; corrected to parseFloat. A compact-scale assertion now accounts for actual browser zoom, so physical card size is evaluated honestly.
- Source/kind lines overlapped at overview; detail footer hides there. Visual review then caught huge secondary fonts after tiny→85% transitions despite initial semantic checks; fixed with an explicit typography regression. Final screenshots were re-inspected. The47% edge scenario now asserts exact47%, rather than accidentally invoking readable85% Center.
- The first strict body-history preparation had no scroll range after toolbar removal. Prepared legal ephemeral650px bottom height, ran unchanged assertions, restored420px without persisting a preference.
- T3 reciprocal-edge payload exceeded64000 bytes twice (including graph-hash wrapper). Final isolated Chrome repeats199 samples per edge and returns compact own-hit counts plus trusted click details; it is not mislabeled as T3 acceptance.
- The first unchanged r9 docking mirror completed8 cases but failed receipt hashing because its mirrored source directory was absent. Added exact33 source files and reran under a fresh output directory; final8/8 receipt includes hashes. The orphaned test Chrome process was stopped.

## Remaining boundaries

The provider catalog is intentionally bounded. Complex unsupported M (including some generated Enter Data type syntax), unknown connectors, or a provider reachable only through another query can remain Unknown. Recognized calls are syntactic evidence and may not execute. The graph remains query-reference-only. Source/privacy and UI/browser evidence do not establish actual model refresh, real-provider behavior, VS Code/native installation, publication or user acceptance. Parent independent review and any later release/install gate remain separate.
