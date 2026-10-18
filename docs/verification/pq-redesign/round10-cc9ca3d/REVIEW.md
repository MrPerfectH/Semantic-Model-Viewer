# Independent r10 review — BLOCKER, partly verified

Candidate: `cc9ca3dbc0bd5967240e0d10b0f521d8bf5adcc7`. Reported runtime: `209c226c62a431522650104ded8011a73e8391f3`. PR: https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40 . This is new independent evidence; owner 485 results and older review receipts are not restamped.

## P2: a filtered-out locked root is not explained

The ordinary selected object remains visible, but its locked focus root is hidden by Disconnected. The inspector still says “Locked focus · FinalOutput” and “4 objects in flow”, with no indication that FinalOutput is excluded by the active filter. The selected-hidden banner is empty because Standalone, the inspected object, is visible. This violates the requested hidden-lock explanation and makes the active flow scope misleading.

Frozen executable: `tests/pq-redesign-independent-round10-hidden-lock.scenarios.cjs`. Actual fresh registered importer result: [receipt](hidden-lock-frozen/receipt.json), [full state and trusted coordinates](hidden-lock-frozen/observed.json), [screenshot](hidden-lock-frozen/hidden-lock.png).

Repro: import owned `round10-cc9ca3d/model.bim`; select FinalOutput in the library; activate its lock; select Standalone; choose Disconnected in the native connectivity select. FinalOutput is retained as `flowRootId`, excluded from visible IDs, while Standalone remains visible. Trusted pointerdown coordinates were FinalOutput (118.89,751.73), lock (1398,590.99), Standalone (118.89,843.43), at that actual layout; use script locators when replaying. The filter used the T3 select tool. The script asserts these preconditions before failing the explanation oracle. No manual visibility concession, runtime edit, or guessed selection was used.

Proposed repair freeze: retain lock, selected identity, numeric viewport, body scroll, and positions; explicitly name the hidden locked root and explain the active exclusion. Reset filters must reveal it without silently unlocking/reframing. Include connectivity and group exclusions, Back/Undo restoration, and model-generation clearing. Replay this frozen failure against a newly released exact SHA; the existing candidate stays blocked.

## Fresh registered/browser results

| Scope | Current evidence and outcome |
|---|---|
| Provider structural risk | `provider-ui/receipt.json`: PASS in actual importer/worker/inspector. 56 direct/local/function/unknown/dynamic/mixed/transitive/incomplete/quoted cases; all 14 source-name model collisions plus two standard-name collisions; duplicate partition ambiguity. No guessed dependencies or arguments retained in source evidence. Definitive table association checked. This is browser integration evidence, not the pending Node suite. |
| Selection and lock | `lock-history-trusted/receipt.json`: PASS unlocked selection, trusted click/Enter lock toggles, no viewport/layout/body jump, removed top strip, direct neighbor Back, filter reset, Blank/Undo. `stale-lock-removal.json`: stale detached callback ignored; root removal clears lock and Undo restores it. Stale callback injection is programmatic; live controls are trusted. |
| Contrast and compact | `selection-lock-prepared/contrast*.json`, `fact-0.47.png`, `fact-0.85.png`, `compact.json`: selected fact outside locked scope fully opaque; white type on dark Tables-style fact header, unrelated cards .65, edges .55 with non-scaling 1.8px stroke. Effective text sizing and own title hit measured at 47/85%. Fit retained far-origin positions; explicit two-object compact tightened layout, retained hidden positions; Undo restored per-ID layout and navigation. Compact fit was ~84.34%, not an automatic-85% requirement. Visual product acceptance remains the user's. |
| Reader and history | `reader/receipt.json`, `body-history/receipt.json`: PASS exact 17,953-byte CRLF/UTF16 source, repeated reference ranges, raw copy argument, trusted Enter→Back expanded/wrap/scroll/disclosures/focus equality; body123 and viewport123,87,1.3 restored; one-argument legacy restore and Arrange/Undo. Clipboard proof is the actual copy API argument, not a system-paste assertion. |
| Lifecycle and shared routes | `lifecycle/receipt.json`: PASS stale navigation/copy completion guards, replacement clears M DOM/history/lock; Tables viewport137,93,.9 and selection/positions retained; Measures original/long/short formatter and reader suspend. |
| True zoom, docking, wide reader | `zoom200-reader-resizer/receipt.json`: eight fresh isolated Chrome cases at outer1280/1440, actual browser zoom2→1, Right/Bottom; captured setting, CSS viewport/DPR, pointer target, resizer key/ARIA and same code DOM/reader close. Explicitly authorized capability fallback while T3 available; headless Chrome is not installed/native VS Code evidence. |
| Frozen geometry | `zoom200-auto-framing-prepared/receipt.json`: PASS both true200 widths, strict immediate own-title hit, 52 registry/51 edges/52 visible/85% retained. `zoom-input-ownership-prepared/receipt.json`: PASS both framing/wheel groups and six trusted rapid Back→separator ownership trials. `arrange-undo-prepared/receipt.json`: fresh PASS restored exact viewport/layout and displayed85%. See adapter ledger for user-superseded entry changes and pending hash audit. |
| Directed edges | `cycle/receipt.json`: unchanged reciprocal-hit scenario PASS actual drag, two distinct own hit regions and both semantic headings, graph/other anchor preservation. Original file unchanged; fresh results belong only to this candidate mapping. |
| Snapshot/offline | `offline/receipt.json`: fresh actual T3 download opened with network offline, helper/Measures worked, raw-M-free PQ unavailable honestly, actual re-export stayed private. `offline/network.json` contains one local file request, zero HTTP(S) attempts and no captured runtime exception. Source provider/evidence fields/private arguments excluded from exported model payload. Snapshot hashes remain pending off Mac. |

The visible-only minimap is exercised in rendered journeys, but no new comprehensive folder/placement/Center matrix or all lock/filter permutations is claimed. No old UX verdict is carried as a current overall PASS.

## Runtime identity and machine boundary

Own service used port54103, serving only 33 explicit `git show cc9…:Models/tools/viewer/<asset>` outputs. [Provenance](browser-service-provenance.json) records each actual Git blob ID and separately labels owner-reported SHA256. No user source models were checked out/read. The changed-path inspection identified index, Canvas JS/CSS, analyzer, graph model, Inspector JS/CSS, workspace JS versus r9. Browser receipts are bound to these extracted files. Runtime equivalence to the reported209c, canonical/media byte equality, index cache keys and VSIX equality are NOT independently certified yet.

The new Work-off-Mac instruction was honored. T3 environment/catalog discovery exposed Darwin/arm64 and no Linux/Windows execution-routing selector. No new job, guessed SSH target, generic Node test run, package computation, or SHA audit ran on Mac. Actual Mac browser work and its synthetic service continued within the explicit authorization. See [machine boundary](machine-boundary.json).

Pending Linux/Windows work: `tests/pq-redesign-independent-round10-analysis.test.cjs` (124 intended independent assertions, unexecuted), `tests/pq-redesign-independent-round10-portable-audit.py` (Darwin guard, unexecuted), appropriate owner Node22 analyzer/UI suites, exact runtime/media/cache-key/VSIX audit. The portable audit covers 33 served Git blobs/ZIP bytes, 45 files and original/adapted script SHA256; canonical/media and all31 cache keys still require an explicit check. Do not infer these passed from browser success.

Package only owner-reported here: `/tmp/smv-pq-selection-lock-r10-final.vsix`, SHA256 `7d8547b60538ae96e61f2e2f2a8bdf7469152a9984b9d3c02ec5f3834aa37293`. [Owner proof](owner-package-runtime-proof.json) is attribution, not independent package acceptance.

## Privacy boundary and unresolved interaction observations

The existing `smv_models_v1` cache contains imported synthetic raw M (observed49,227 characters and private-M sentinel), but no `sourceEvidence`; `smv_current_v1` has no M. This predates r10. Dock preferences contain only dock/width/height. Default snapshots and their offline re-export exclude raw M and derived source-call evidence. A global “M is not stored” claim is false; a broader no-local-M-storage requirement is not accepted as satisfied by this review.

T3 Display/close/select interactions had 15-second timeouts during an intermediate Bottom-dock journey. Subsequent close and Escape succeeded; no pointerdown target was captured for the original timeouts, so cause remains unresolved. The eight fresh isolated Chrome dock cases passed, but they do not erase those T3 observations. See [failure ledger](failures-and-boundaries.md).

Acceptance stays HOLD for the P2 hidden-root explanation, plus the off-Mac generic prerequisite. Native installation/blank investigation, cross-machine acceptance, final user fit and A10 remain OPEN. No feature edits, source-data access, M execution, push, merge, release or native app interference occurred.
