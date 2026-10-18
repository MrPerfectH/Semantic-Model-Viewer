# Onboarding candidate validation — #113 / #114 / #115 / #116

Status: implementation candidate, not released. **#116 remains open. No human newcomer sessions have taken place.** No posts, outreach, telemetry, merges, Marketplace publishing, or production releases were performed.

## Baseline and scope

The isolated branch `t3/onboarding-setup-tour` began at `e1f9cae` with a clean worktree. Fetch showed it 128 commits behind stable `origin/main`; it was fast-forwarded to `6f39e5b`. There were no setup-generated edits to preserve. Source viewer, installation/start guidance, extension host preference handling, tests, and this checklist are the scope.

#114: demo-first README and host-specific Start here state; Marketplace plus VSIX alternatives; prerequisites and supported formats; actionable empty workspace/import guidance. A PBIP project folder with TMDL definitions or `model.bim` is supported; a `.pbip` or `.pbix` file alone is not sufficient.

#115: optional welcome followed by contextual Tables, relationship, Measures, and sharing tips. Automatic tips do not take focus. Close/Skip and Help restart are keyboard accessible; Escape inside help returns focus to the opener (or Help if the opener was replaced). Tips use viewport-clamped, scrollable panels and tolerate missing/hidden targets. Only explicitly opting in enables contextual tips. Progress is kept in `smv_onboarding_v1`: browser origin/profile storage, or VS Code profile `globalState`, separate from workspace model/layout settings. Denied persistence still suppresses repeats within the current session; a fresh session cannot remember a dismissal if the host refuses storage. No model/layout navigation is applied by help. Offline snapshots neither construct onboarding nor show Help.

## #100 reuse decision

The issue text still calls #100 unmerged, but PR #108 was actually merged into **develop** on 2026-10-17. It is absent from this stable `main` baseline and from the verified stable distribution. Its authored walkthrough applies declarative workspace states and captions; first-use tips must preserve the user's current model, selection, and layout. Reuse the existing viewer controls, `U.el`, and host-backed `U.store`, not that unreleased walkthrough runtime. No new library, custom authored tour format, or dependency on #100 is introduced. Integration with develop must retain this separation, including its snapshot/walkthrough startup paths.

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
- [ ] Integrate the candidate into develop, rerun regression/browser/package checks against that exact commit, including authored walkthrough/snapshot compatibility if present.
- [ ] Owner approves release/version and follows CONTRIBUTING.md's develop → main release workflow.
- [ ] Install the actual distributed Marketplace/VSIX version in a clean profile; verify demo and desktop/source routes against the released commit, not the local package.
- [ ] Record release URL/version, host versions, verification date and remaining limitations before marking #116 complete or promoting onboarding.
