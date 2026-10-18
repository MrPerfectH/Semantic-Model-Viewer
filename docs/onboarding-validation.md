# Onboarding candidate validation — #113 / #114 / #115 / #116

Status: implementation candidate, not released. **#116 remains open. No human newcomer sessions have taken place.** No posts, outreach, telemetry, merges, Marketplace publishing, or production releases were performed.

## Baseline and scope

The isolated branch `t3/onboarding-setup-tour` began at `e1f9cae` with a clean worktree. Fetch showed it 128 commits behind stable `origin/main`; it was fast-forwarded to `6f39e5b`. There were no setup-generated edits to preserve. Source viewer, installation/start guidance, extension host preference handling, tests, and this checklist are the scope.

#114: demo-first README and host-specific Start here state; Marketplace plus VSIX alternatives; prerequisites and supported formats; actionable empty workspace/import guidance. A PBIP project folder with TMDL definitions or `model.bim` is supported; a `.pbip` or `.pbix` file alone is not sufficient.

#115: optional welcome followed by contextual Tables, relationship, Measures, and sharing tips. Automatic tips do not take focus. Close/Skip and Help restart are keyboard accessible; Escape inside help returns focus to the opener (or Help if the opener was replaced). Tips use viewport-clamped, scrollable panels and tolerate missing/hidden targets. Only explicitly opting in enables contextual tips. Progress is kept in `smv_onboarding_v1`: browser origin/profile storage, or VS Code profile `globalState`, separate from workspace model/layout settings. Denied persistence still suppresses repeats within the current session; a fresh session cannot remember a dismissal if the host refuses storage. No model/layout navigation is applied by help. Offline snapshots neither construct onboarding nor show Help.

## #100 reuse decision

The issue text still calls #100 unmerged, but PR #108 was actually merged into **develop** on 2026-10-17. It was absent from the original stable `main` baseline and verified stable distribution; it is now present in the integrated candidate described below. Its authored walkthrough applies declarative workspace states and captions; first-use tips must preserve the user's current model, selection, and layout. Reuse the existing viewer controls, `U.el`, and host-backed `U.store`, not the authored walkthrough state-application runtime. No new library, custom authored tour format, or dependency on #100 is introduced. Integration with develop must retain this separation, including its snapshot/walkthrough startup paths.

## Distribution and host evidence (2026-10-18)

- Live demo: https://MrPerfectH.github.io/Semantic-Model-Viewer/ opened in the collaborative browser, reporting Contoso Retail, 43 tables, loaded successfully.
- Marketplace: https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer returned HTTP 200; listing metadata reports 0.3.9. Installation into a native VS Code instance was not performed here.
- GitHub stable release: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9. Downloaded its `semantic-model-viewer-0.3.9.vsix`; ZIP inspection confirms publisher `MrPerfectH`, extension `semantic-model-viewer`, version `0.3.9`, and packaged viewer HTML. The release also lists `semantic-model-viewer-web-0.3.9.zip`. Desktop instructions deliberately use a repository checkout/ZIP, which includes installer scripts; the web ZIP is not presented as a desktop installer.
- Candidate local server: Python `serve.py --port 8932` on Linux, fresh Start here → Try the demo → optional welcome → Tables/Measures tips. Collaborative browser import through Choose files parsed synthetic fixture TMDL and Add model opened Fact Sales with two tables/two relationships. No console errors observed in those inspected flows.
- Candidate browser automation: real Chromium loads shipped HTML/CSS/JS, exercises skip/reload/restart, Escape and focus restoration, contextual tips, 360×480 geometry, missing targets, denied storage, and exact table workspace preservation. The same test loads the **real host-vscode adapter** with a simulated `acquireVsCodeApi` message transport, including no-model guidance and storage isolation/reload. This is not a native extension-host usability session.
- Snapshot automation downloads actual HTML files through Save snapshot, opens them offline with storage/network unavailable, tests all starting views, re-export and CLI output, and asserts no Help/tour controller appears.
- Native Windows/macOS installers, browser permission renewal on those platforms, screen-reader speech output, and a packaged extension running in native VS Code remain **pending**. There is no `code` executable in this environment. Linux source serving, model parser/server APIs, host message handling, browser behavior, and VSIX packaging are verified separately.

## Reproducible checks

Requires Node 22+ and Python 3; browser checks need Chrome/Chromium (`CHROME_PATH` optional).

```sh
npm ci --prefix vscode-extension
npm test --prefix vscode-extension
node --test tests/onboarding.browser.cjs tests/snapshot.browser.cjs
npm run package --prefix vscode-extension
```

The regular suite includes onboarding controller tests and profile-vs-workspace persistence tests; existing parser/server, model isolation, extension adapter, layout, and snapshot tests remain included. The candidate package is a local build with the baseline version number, not a published replacement for stable 0.3.9. The release owner must choose the release version through the normal workflow.

## Develop integration and follow-up verification (2026-10-18)

Fetched `origin/develop` at `9fcc5a27977290341eb0516ae8c2e4647ed9c7de` and merged it into the existing feature branch with merge commit `87be234`. The merge was conflict-free and preserves `7f781e8` and shared history. Only the existing isolated onboarding worktree was used. This supersedes the original stable-baseline validation; it does not mean the PR has merged into develop.

On the integrated runtime:

- `npm test --prefix vscode-extension`: **705 passed, zero failures/skips** on Linux, Node 26.8.2; includes viewer synchronization and extension checks.
- `node --test tests/onboarding.browser.cjs tests/snapshot.browser.cjs tests/explanations.browser.cjs tests/interactive-view.browser.cjs`: **25 passed, zero failures/skips**, Chromium 152.0.7977.82. Includes repeated captures, authored walkthrough generation/navigation, interactive views, official MCP bridge, browser/simulated VS Code onboarding, real downloaded offline snapshots and re-export.
- Repeated the full regression suite using the required Node 22 via `npm exec --yes --package=node@22 -- node --test --test-concurrency=1 tests/*.test.cjs tests/extension.test.js Models/tools/viewer/tests/*.test.js`: **705 passed, zero failures/skips**.
- Added explicit runtime assertions that authored interactive views and walkthrough step navigation do not initialize onboarding or expose Help, and actual Tab-key checks for Show tips → Skip tour. Reran both affected browser suites: **7 passed, zero failures/skips**.
- Node 22 browser verification exposed `ENOTEMPTY` while deleting Chromium temporary profiles after process exit in both onboarding and existing snapshot test helpers. The onboarding cleanup exception also left its HTTP server open. Added bounded profile-deletion retries, guarded already-exited child cleanup, and guaranteed onboarding HTTP teardown with `finally`/`closeAllConnections`. This test-harness fix is separate from macOS CLI `EPERM`.
- Parent follow-up reproduced profile deletion `ENOTEMPTY` despite bounded synchronous retries. Browser helpers now request graceful CDP `Browser.close`, use a five-second forced-exit fallback, then remove the profile asynchronously with bounded retries. The final Node 22 run of onboarding, snapshot, and interactive-view browser suites passed **14 tests, zero failures/skips**. This does not resolve the separate macOS CLI process-group failure.
- `npm run package --prefix vscode-extension`: succeeded, local `semantic-model-viewer-0.3.9.vsix`, 49 files. No version change or publication.
- Functional/accessibility code review covered opt-in/dismissal persistence, snapshot startup, automatic focus behavior, keyboard dismissal, missing targets, viewport clamping, and model/layout preservation. No runtime regression was found. Browser keyboard checks are not screen-reader verification.

### Existing macOS CI failure

[Run 39125866228, job 117670737268](https://github.com/MrPerfectH/Semantic-Model-Viewer/actions/runs/39125866228/job/117670737268) completed and its log was retrieved. The failing capture reports `error: 'kill EPERM'`, `process.kill` → `signal` (`capture.cjs:59`) → `stopBrowser` (`:64`) → `capture` (`:101`), during the first explanation screenshot's browser cleanup. The CLI/data/session step passed all 30 tests; Linux and Windows jobs in this same run succeeded. Annotations additionally report Node action deprecation and macOS runner capacity, but neither establishes the cause of `EPERM`.

The implicated CLI capture module is byte-identical to fetched develop (SHA-256 `d55e0309088b30746a7c2430d27ec7e92be7e2e7df4e75cdbff9c3fc5717d312`); onboarding does not edit it. The prior head did not contain that module; checkout logs confirm PR CI tested merge `8c78d49` (onboarding `7f781e8` into develop `9fcc5a2`). Evidence locates this failure in inherited macOS browser-process cleanup, not an onboarding assertion. The precise OS permission/process-group cause is **unresolved**, not proven to be GitHub infrastructure. No speculative cleanup change was made without a macOS reproduction; Linux passing cannot certify a macOS fix. New-head CI must be considered separately.

## Human newcomer checklist for #116 — not yet executed

Recruit three willing participants with different setup familiarity (for example: browser-only Power BI author, VS Code user, local-app newcomer). Obtain permission for observation and for any notes/recordings. Use Contoso or synthetic fixtures, never confidential business models. Give the goal without coaching: “Open a model and show one relationship or measure dependency.” Let the participant choose a route.

For **each** participant, record:

- Anonymous participant ID, permission scope/date, setup familiarity; OS, browser/VS Code version, profile, exact candidate commit/package version and entry link.
- Start time, model-open time, time to first useful action, completion status and the specific relationship/dependency found.
- Whether they found the demo, chose a setup, identified a supported model folder, and recovered from an unsupported/missing model.
- Every assistance/intervention, confusion, blocked action and workaround. Distinguish observed behavior from interpretation.
- Whether welcome/Skip/Close/Help are discoverable, tips occur in context, and restarting preserves their canvas. Test keyboard-only use, focus restoration, zoom/narrow window, and profile reload.
- Whether Save snapshot's scope is understood; recipient opens the saved file offline without unexpected onboarding.
- Blocker issue link, severity, owner, fix or explicit deferral rationale, and recheck evidence. Do not replace missing observations with estimated times.

Session records: participant 1 **not scheduled**; participant 2 **not scheduled**; participant 3 **not scheduled**. Completion/time/assistance/obstacles: **unavailable** for all three.

## Release gate — requires owner approval

- [ ] Complete all three consented newcomer sessions and record actual results.
- [ ] Fix or explicitly defer each blocker and rerun affected journeys.
- [ ] Verify native Windows and macOS setup, native VS Code profile persistence across workspaces, and keyboard/screen-reader behavior.
- [x] Merge develop into the candidate and rerun regression/browser/package checks, including authored walkthrough/snapshot compatibility (merge `87be234`; evidence above). PR merge remains pending.
- [ ] Owner approves release/version and follows CONTRIBUTING.md's develop → main release workflow.
- [ ] Install the actual distributed Marketplace/VSIX version in a clean profile; verify demo and desktop/source routes against the released commit, not the local package.
- [ ] Record release URL/version, host versions, verification date and remaining limitations before marking #116 complete or promoting onboarding.
