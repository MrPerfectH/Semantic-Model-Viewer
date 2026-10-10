# Independent scoped main-integration replay

Verdict: **PASS for the requested merged browser-runtime scope**, candidate `e61726d4b10c798ec7b68fc329a03c54bc1983ca`. This is fresh registered-app browser evidence, not native acceptance or a new broad A1–A9 verdict. A10 remains open.

## Exact mapping and ownership

Candidate parents: `ab7a758fac9c6203d5695511da39d557782c1605` and main `3848dc95f3e44988219ac5d291ea5d704a9ce346`. Read the candidate integration note and inspected the changed shell/formatter/snapshot code. Candidate's 32 sync-viewer allowlisted runtime assets were copied byte-exact from Git blobs to this owned `served/` evidence directory. `runtime-mapping.json` records each blob and SHA-256. The runner reverified all 32 against the candidate before and after execution.

The app-bound worktree remains based on evidence commit `b5bf1df8ab7daa4c64875139b5055c58cc04e523`, whose feature runtime equals reviewed a8fc. This is **runtime-asset equivalence, not full checkout-tree equivalence**: candidate source-model/data changes were deliberately never checked out, read, or served. No production files, previous fixtures, or historical evidence changed. The additive combined fixture copies the immutable a4 expressions and adds a synthetic standalone table and two DAX measures. Neither M nor DAX was executed.

Fresh Chrome 154.0.8037.99, isolated profile, 1440×1000 CSS viewport, actual registered app served from own loopback port60907. Previously authorized CDP fallback used; lost T3 host transport was not retried. Browser and server closed after collection.

## Fresh results

`browser-02/receipt.json`: **5/5 passed**, zero runtime exceptions, zero failed network requests. All observations were newly collected on this candidate.

1. **Tables → PQ → Tables / Escape.** Public canvas methods prepared a deliberate viewport `{x:137,y:93,k:0.9}`, table position, selected table, and marked set. Trusted nav clicks and PQ Escape retained all four exactly. Escape closed the PQ inspector and focused its selected node without clearing Tables marks or selection. See `tables-route.json` and `tables-retained.png`.
2. **Frozen filter and history.** Authored expected registry five, connected four, disconnected one; three unique resolved edges. Disconnected plus search retained hidden consumer selection/code, displayed the banner, kept the standalone partition visible, and showed zero library results. Trusted Enter on the exact M link cleared filters and selected its target. Back atomically restored category/search/selection/viewport/inspector scroll and reference focus. Reset retained code/selection/history/viewport/inspector state at its actual activation boundary. See `filter-history.json`, `filter-reset.json`.
3. **Exact CRLF.** The merged parser and inspector preserved the immutable source bytes, including emoji, repeated quoted references, escaped spelling, local shadowing, and CRLF. All five occurrence links navigated to the independently authored targets; Back restored exact context each time. Actual Copy M clipboard text equalled the original source. See `exact-crlf.json`.
4. **Main Measures compatibility.** Actual Measures entry selected Formatted Probe; Original, Long lines, and Short lines produced distinct expected DAX presentations, including the clickable Base Amount reference. Returning through Tables to PQ retained exact M context. See `measures-online.json/.png`.
5. **Snapshot privacy and offline formatter.** Actual default Save snapshot produced the retained HTML. Payload excluded powerQuery/raw M/synthetic private markers and retained DAX. No source request or model-data.json fetch occurred. With network forced offline, the saved file booted, Measures displayed all three formatting modes, and PQ showed metadata unavailable with no query nodes or code. See `snapshot-export.json`, `measures-offline.json/.png`, `snapshot-offline.json/.png`, and the actual download.

Screenshots were visually inspected: PQ exact source/line numbers/reference links, readable Measures formula/graph and explicit offline snapshot state. This replay did not repeat scale or zoom acceptance because those components are unchanged and outside this requested proportionate scope.

## Preserved failures and diagnosis

`browser-01/` and its log/runner remain unchanged. Initial harness errors were diagnosed before the single corrected fresh replay: Tables pos is an object; a shared select CSS class targeted pane orientation rather than DAX layout; pointer Reset transfers active focus before its handler. The corrected runner targets the exact DAX aria-label and captures Reset's true keyboard activation boundary. Frozen Back focus and reset viewport/scroll/code/history requirements remain strict. See `browser-01/DIAGNOSIS.md`. Initial runtime mapping count assertion is separately preserved in `preflight-diagnosis.md`.

## Boundaries and release criteria

No remaining blocking defect found within this scoped browser replay. The parent-reported 375/375 Node22 and 32 synced assets were not rerun or relabeled as independent full-checkout tests. Exact runtime bytes were independently verified; this is not a new VSIX build/install/native pass. Static serving does not exercise extension host integration, CLI source-folder loading, or real source connections. The separate native blank investigation remains unresolved here.

Parent owns integration/release decisions. Any changed runtime candidate requires a new exact-byte map and proportionate replay. Native workflow must be resolved and verified by its owner before native acceptance is claimed; user A10 remains the final product gate. No push, merge, release, watcher, new job, or native-session interference occurred.
