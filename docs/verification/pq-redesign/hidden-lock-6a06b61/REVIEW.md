# Independent hidden-lock repair browser gate — scoped PASS

Exact browser candidate: `6a06b616b5385de3fd3c3fc1f6b453bb321fbca4`; implementation `99f605b759a23d159f1f03ce7d0515b2e7eb3a46`. PR40 remains linked: https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40 . The later coordinator-reported integration `163cb81c8e6a7ce562378848f381022dd36d7040` changes documentation only; no browser claim is made for an uninspected runtime revision.

**The r10 P2 hidden-lock explanation is resolved in this exact browser candidate.** The unchanged frozen scenario passed after the initial model menu was closed. It imported the existing synthetic69-object fixture through the real importer, selected FinalOutput, trusted-clicked Lock, selected Standalone, and selected Disconnected. The status banner explicitly names FinalOutput, the Disconnected exclusion and retained lock, with Reset filters. Root stays excluded and Standalone visible. [Fresh receipt](frozen-prepared/receipt.json), [state/trusted coordinates](frozen-prepared/observed.json), [screenshot](frozen-prepared/hidden-lock.png).

## Fresh bounded regressions

All five new browser groups passed: [receipt](recovery/receipt.json), [trusted event log](recovery/trusted-events.json).

- Connectivity recovery used trusted Enter on the new banner recovery button. Numeric viewport `{x:137,y:93,k:.47}`, every per-ID position, locked root and selection stayed exact; body scroll stayed123. Filter cleared, root returned, notice disappeared. `recovery/connectivity-reset.json`.
- Unassigned group exclusion named the group reason. A recovery callback detached by ordinary navigation could not reset the new state. Current recovery retained exact viewport/layout/lock/selection/body. `recovery/group-reset.json`.
- Back restored full navigation including category, root, inspection, body and inspector state, plus the hidden-root banner. Trusted Blank followed by Undo restored the complete captured navigation and layout. `recovery/history.json`.
- Trusted keyboard unlock removed the obsolete notice without framing; relock pinned the inspected query. When the locked selected query itself was excluded by group, the notice remained explicit; recovery cleared it. `recovery/keyboard-lock.json`.
- Actual importer replacement with the existing synthetic collision fixture advanced generation, cleared selection/lock/history/filter/M DOM, and ignored the retained old-model recovery callback. `recovery/model-replacement.json`.

Pointer/keyboard/select interactions used T3 tools. Numeric viewport/body and focus preparation used browser evaluation to establish the measured state; detached callback `.click()` was deliberately programmatic to test stale guards. Bottom docking was chosen through the real Display select and height650 through trusted separator End. No M execution or source-model access occurred.

The banner has `role=status`. At body scroll123 the group notice can be above the current scroll viewport: preserving scroll is intentional in this contract. The right-docked initial screenshot visibly shows the repaired message/recovery. This is not a claim of a new sticky-banner requirement or broad visual acceptance.

## Identity and execution boundary

Own server54104 served33 explicit Git blobs from exact6a06. [Provenance](provenance.json) lists every source ref and Git object ID. Git path comparison versus cc9 shows only `index.html` and `js/power-query-workspace.js` changed; the other31 runtime paths are unchanged. Actual loaded workspace URL used cache key `318589acb5`. No current8945 preview or user model was used.

Frozen `tests/pq-redesign-independent-round10-hidden-lock.scenarios.cjs` remains untouched, Git blob `66e63cfec8f4594e9df5318ec03cbb6845800b87` at1336c15. Existing cfg.candidate/out arguments mapped it to the new runtime; no assertion adaptation. Historical1336c15 and its P2 failure remain intact. New regression script is `tests/pq-redesign-independent-hidden-lock-6a06b61.scenarios.cjs`.

This session ran only Mac-owned T3 browser interaction and its synthetic service/preparation. No generic Node tests, SHA calculation, package commands/audit, Chrome fallback, source-model checkout, M execution, feature edit, new chat/job, push or merge. No full r10 UX acceptance was restamped. Native/user-fit/A10 remain open.

## Preserved setup/interaction failures

`frozen/receipt.json` and `frozen-replay/receipt.json` preserve two timeouts on the first Open model action before import. Both raw errors: `Preview automation click timed out after 5000ms.` Inspection found `app.state.showModelMenu===true`; `elementFromPoint(1200,30)` returned `<div style="position: fixed; inset: 0px; z-index: 58;"></div>`. Escape did not dismiss it. A trusted click at1000,200 closed that initial menu; subsequent inspection returned the Open model button. Only then was the unchanged script rerun into `frozen-prepared`. No failed receipt was replaced.

During Bottom setup, Close display settings also timed out5000ms. The menu still had a real close button at1041,347,206x32; original hit target was not captured, so cause is unresolved. Separator click/End worked and Escape closed the menu. This narrow result does not certify the Display-close interaction or erase the older related observations. No broad retry/fallback was used.

The plain synthetic service omits optional service-worker/API endpoints, producing startup404 diagnostics; all33 runtime assets loaded. Online web fonts loaded. This was not an offline/network/privacy replay.

## Windows evidence is separate

Read actual [owner review](owner-review.md): Windows124 independent analyzer and110 focused tests passed; runtime/package audit reported33assets/31keys/45files. Its initial full result was620pass/2CRLF fixture failures/5skips. Coordinator subsequently reports exact fixture Git-byte restoration only, unchanged full-suite rerun627total/622pass/0fail/5skip, exit0 in `/repair-logs/full-suite-02.log` and `.status`, documentation163cb81. This report has not independently executed or inspected those external Windows logs. The627 includes transported, untracked124 authored independent cases; it is not a committed-only503 result. Failed Windows run remains preserved.

No additional browser repair is requested by this scoped gate. Main retains ownership of evidence integration, Windows completion/package verdict, final user acceptance and any push authorization. Own service and T3 tab are stopped/closed at handoff; PR40 is unwatched.
