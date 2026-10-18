# Final independent browser gate — a8fc1b8

**Verdict: scoped synthetic browser A1–A9 + frozen-filter gate passes.** The three independently observed product failures are repaired. The parent's combined zoom-session failure is diagnosed and reproduced as an intercepted harness input; it is not erased or relabeled as a successful resize. Package integrity and isolated CLI installation pass. **Installed-native interaction and A10 user product acceptance remain open.** No merge/release approval is implied.

Exact integration candidate: `a8fc1b85de05a269bcb019932f86eb3bbf78d19a`.
Independent local prerequisite HEAD: `f429399a88ce656f530c2bde0cc90264cdb2ee8c`.
Identical full Git tree before adding owned evidence: `cf27bc2c79ef6bd007f98983f576a968c79972ea`.
See [mapping](mapping.json). Only the parent-released a8fc1b8 shell commit was picked after the exact 29fc2fc tree. All reviewer changes are new independent tests or verification artifacts; no feature edits, push, merge, source models, connector fetch, M execution, credentials, delegation, new chats or watchers.

## What is freshly verified at a8fc1b8

- Node22 **346/346**, no failures or skips: [log](full-node22.log).
- Real Chrome Settings page zoom **200%→100%→200%** at each outer width **1280 and1440**, all six actual-input cases pass: [receipt](zoom-transitions/receipt.json). This uses no device emulation. At200%, CSS width is640/720, DPR2 and visualViewport.scale1. Both original A5 failures are replayed: below-docked inspector now has actual height400→440 by keyboard→480 by trusted pointer drag; the separator is the actual pointerdown target and the inspector remains open. At100%, side width400→420→460. ARIA matches actual dimensions.
- Same-browser **cached-model** route, with its initial picker dismissed by actual pointer input, also passes all six200%→100%→200% cases: [receipt](zoom-cached-transitions/receipt.json), [cached-picker state](zoom-cached-transitions/cached-picker-1440.json). No reimport on the100% return path. These are distinct from fresh isolated passes.
- Each drag records separator rectangle, actual trusted pointerdown target/client/page/screen coordinates, buttons, pointer ID, visualViewport offsets/scale, document/body/PQ/inspector scroll, ARIA, selection and before/after dimensions. Example [1440 cached transition](zoom-cached-transitions/transition-1440-1-1.json).
- Source Wrap, exact reference→target→Back remains usable after resizing in both orientations. Actual screenshots were inspected: [1280 at200% source](zoom-transitions/source-reachable-1280-0-2.png), [1440 at200% source](zoom-transitions/source-reachable-1440-0-2.png), [1440 at100% side inspector](zoom-transitions/transition-1440-1-1.png). The below layout now allocates a usable code pane and scrolls the shell; the canvas is reachable above it, rather than covering the separator.
- Both preserved viewport failures, all three frozen filter workflows, model/metadata/suspended resets, actual late worker callback rejection, and actual default snapshot download/offline privacy rechecked: **six checks, zero fail**, [receipt](regression-lifecycle-privacy/receipt.json). [Reset filters](regression-lifecycle-privacy/reset-filter-diagnosis.json), [Tables roundtrip](regression-lifecycle-privacy/tables-viewport.json), [real late worker event](regression-lifecycle-privacy/stale-worker.json), [snapshot export](regression-lifecycle-privacy/privacy-export.json), [offline state](regression-lifecycle-privacy/offline-snapshot.json).
- Fresh VSIX: all31 runtime assets byte-equal to the exact candidate, including changed index/workspace JS/CSS; no fixtures, model-data or synthetic raw-M markers in package. [Integrity and SHA256](package-integrity.json), [build log](package.log), [new isolated CLI install](vscode-install.log). Missing-LICENSE packaging warning is preserved, not newly introduced by the redesign.

## Combined-session failure: proven cause, preserved evidence

The earlier parent failure had width420→420 and a blank-class hit before the pointer action, followed by a resizer hit afterward. The parent's script uses DOM `.click()` for nav and library selection after returning from Chrome Settings. For a cached expressions-only fixture, `App.init()` loads the model and then opens the model picker because `model.tables.length===0`. Programmatic clicks bypass that overlay, leaving it open over Power Query.

The independent narrow diagnostic reproduced those exact observable conditions on a8fc1b8:

- `showModelMenu=true`, PQ view rendered behind a fullscreen `<div style="position: fixed; inset: 0px; z-index: 58;"></div>`.
- Actual trusted pointerdown at client **(1016.5,566.75)** lands on that **DIV with empty class**, not `.pqw-resizer`.
- Width remains420. The pointer action closes the picker (`showModelMenu=false`), after which the same point hits `.pqw-resizer`.
- Visual viewport and scroll values are captured alongside the event; no speculation about browser zoom coordinates is needed.

[Raw causal record](parent-overlay-diagnosis/picker-overlay-causal.json), [diagnostic receipt](parent-overlay-diagnosis/receipt.json). The parent's three original logs and script are copied unchanged with provenance under [parent-preserved](parent-preserved/provenance.json). The diagnostic's programmatic UI bypass is explicitly a reproduction technique, **not** user-flow acceptance. Normal actual-input dismissal and subsequent resizing pass in the cached transition run above. No source repair was needed for this harness failure.

## A1–A9 evidence accounting

This is an incremental exact-candidate review, not a claim that every earlier screenshot was captured again on a8fc1b8. The full [29fc2fc review](../runtime-29fc2fc/REVIEW.md) records fresh16-fixture inventories/category counts, graph/occurrence checks and18 browser checks. It also identifies the prior d3d8360 independent evidence for parameter highlighting, uncertainty inspectors, keyboard input and worker/scale behavior. The graph, dependency resolver, canvas and inspector modules remain byte-identical across this review chain; [mapping](unchanged-module-mapping.json). Changed shell behavior and packaging were rechecked at the final candidate as listed above. No PR36–38 acceptance or rejected baseline verdict was reused.

- A1: complete whole-model inventory, valid all-disconnected6/zero-edge same-SQL model despite semantic relationship; no invented links.
- A2: shared parameter fanout, correct input→consumer arrows and highlighting;250-consumer scale registry retained.
- A3/frozen filter: complete resolved incident-edge counts before search; category hiding, search dimming, muted whole-model minimap, hidden selection, Show all, exact ref and queued library navigation, Back and reset; no reanalysis/layout loss.
- A4: exact source spelling/CRLF, five repeated/quoted/escaped source ranges, trusted keyboard navigation and Back, exact clipboard copy, no local/string/comment links.
- A5: normal keyboard/mouse interaction, focus, line numbers/13px code, real200% and both orientation transitions now pass. Historical product and harness failures remain in their original directories.
- A6:300/301/350/1000 inventory, complete overview/minimap, readable last-object reveal, parameter fanout, actual worker progress/atomic ready and cancellation. No legacy `partialEdgesLabeled` value is fabricated.
- A7: deliberate multipartition and duplicate identity, exact associated code, cycles, dynamic/unresolved/unsupported/missing/non-M/status explanations. All20 uncertainty inspectors checked.
- A8: both repaired viewport invariants plus model/generation reset, stale real ready event rejection, suspended metadata replacement, selection/history/M DOM clearing.
- A9: synthetic XSS remains text; actual default snapshot excludes raw M metadata and markers, opens offline with explicit PQ unavailability; no fixture-domain/source or bundled-model request observed in capture window.

## Remaining boundaries and freeze criteria

1. **Installed-native gate remains open.** VSIX installation is verified, but native webview/host messaging, native worker CSP, clipboard/export and200% behavior are not established. CUA resolved an unrelated existing Code Insiders instance, so no interaction with it was attempted. See [native boundary](../runtime-29fc2fc/native-boundary.json). Parent owns arranging a safely targeted native check or explicitly carrying that limitation forward.
2. **A10 remains open and user-only.** The user still judges whole-model canvas usefulness, visual hierarchy, multipartition meaning, source spelling and uncertainty on a representative model. First-draft design approval and passing tests do not close it.
3. Freeze the reviewed feature tree and package hash. Any further feature change needs an exact new candidate and proportionate independent replay; do not apply these results to a moving branch or different packaged payload.
4. Retain raw failure logs and diagnostic provenance. Proposed product blockers from d3d8360/29fc2fc are closed only by the cited exact-candidate replays. Preserve native/browser/package/user distinctions in the parent report.
5. Original owned corpus remains immutable:38 files from57056e2 plus18 fromc4950e2, [proof](immutable-corpus.json). No historical evidence was overwritten. The 29fc2fc MANIFEST is a historical pre-a8 staging-time record; the final a8fc1b8 manifest is the current integrity index.
