# 0.7.306 UI audit implementation

Scope: synthetic fixtures and local automation only. Base: develop de5feb5, which includes the Local tree added for 0.7.306. No publication, tenant requests, customer model changes, credential changes, or profile changes.

## Plan

1. Preserve Power Query snapshot state on same-model refresh, reusing the existing generation-safe restore and missing-ID filtering. Clear model-scoped success/error status on opening a model; suppress late refresh messages after switching models.
2. Give inspector source and summary tiles explicit host-theme surfaces and foregrounds, scoped to VS Code. Check computed contrast in light, Tokyo Night dark, and both high contrast polarities.
3. Clarify offline discovery as “On this device”; place cached Fabric metadata under a named subgroup. Expose workspace exclusion settings in the tree and title toolbar and refresh discovery when exclusions change.
4. Improve matrix sizing/labels, initial measure readability, and group metadata. Preserve a usable scrollable workspace at extreme split heights. Keep explicit Fit and zoom controls for dense table overviews rather than silently crop the model.
5. Run refresh regressions, discovery/model-opening tests, theme/layout browser checks, saved views/colour/map/legend/snapshot checks, and the extension suite. Record exact results and remaining manual work below.

## Findings and decisions

- Host refresh captured tables, measures, groups and matrix, but reset Power Query without capturing it. Its existing portable snapshot format already serializes both Flow and Canvas modes, selection, layout, viewport, inspector and display state and removes missing IDs on restore.
- Refresh success text was global state; opening a different model did not clear it. A cancelled refresh after model switching could also publish success despite not applying metadata.
- Inspector tiles used translucent white inline backgrounds. Matching the background and foreground to host tokens fixes the contrast pair without changing portable/browser styles or custom group colours.
- Matrix used fixed 52px columns and a fixed overall width. It can expand into available width while retaining horizontal scrolling for dense/narrow models. Existing omitted-relationship explanation is retained.
- Dense table overviews necessarily trade legibility for scope; existing zoom, Center selected, table filtering and layout controls remain the deliberate way to focus. No automatic overview cropping is introduced.

## Validation and remaining work

Completed checks:

- `npm test --prefix vscode-extension`: **859 passed, 2 skipped, 0 failed** (861 total); includes extension message adapter, opening/discovery/exclusions, missing-object handling, view switching, colour storage, and portable snapshots. Initial run lacked root MCP dependencies; `npm ci --ignore-scripts` installed the lockfile dependencies and the full rerun passed.
- `node --test tests/ui-audit.browser.cjs tests/measures-layout.browser.cjs tests/snapshot.browser.cjs`: **33 passed, 0 skipped/failed**. Complete-viewer real-worker refresh preserved selected/analyzed Power Query flow and exact viewport, including refresh while inactive. Colour editing, legend/map toggles, saved-view restore and model reopen passed. Computed source-tile/summary-tile text contrast exceeded 4.5:1 using representative light, Tokyo Night dark, HC dark and HC light host variables. Matrix expanded at 1440px and scrolled at 700px; a 335px-high viewport retained a scrollable 360px workspace. Offline export/reopen/re-export and Fabric provenance stripping passed.
- The new refresh integration and late-success tests were run against unmodified develop sources and failed with the reported missing restore and stale success message, then passed with the fixes.
- Additional `tests/star-layout.browser.cjs` exploration: **12 passed, 2 failed** (one failed nested assertion plus its parent). At 1280×720, an eight-table focused star fits at 39.5%, below the test's 50% expectation. Repeated against unmodified develop rendering sources with the same result; 1440×900 achieves 56%. Updated the stale demo-button selector so this test reaches its actual layout assertions. This limitation remains visible rather than weakening the threshold.

Unaddressed overview work: prototype a more compact focused-star arrangement using the actual usable canvas rectangle (including inspector/footer/legend), then require ≥50% zoom, no overlaps, and all eight focused tables within bounds at 1280×720. Also assess long-title wrapping at sub-25% whole-model overview. Keep Fit exhaustive; do not enforce a minimum camera zoom that silently crops the model.

Remaining manual acceptance: installed VS Code Tokyo Night with real host variables, keyboard and screen-reader walkthrough, OS/browser text zoom at 200%, Windows/macOS, colour vision simulation, and read-only tenant reconnect/refresh with permission to access that tenant. Existing workspace XMLA permission/capacity errors are not classified as product defects.

Concrete follow-up: run the synthetic Contoso model in an extension development host on each OS at 1280×720 and 640×360 effective viewport; select a table and measure, check focus order and announcements, round-trip saved views and offline snapshots, then repeat dark/light/high-contrast. With tenant authorization, select a Power Query flow, refresh unchanged metadata, verify root/selection/viewport, and repeat after a safe synthetic metadata removal. Do not claim blanket stable readiness from automated tests.

## Changed files

- Viewer refresh/state: `Models/tools/viewer/js/app.js`, `js/fabric.js`.
- Inspector theme: `Models/tools/viewer/js/sidebar.js`, `vscode-theme.css`.
- Readability/layout: `Models/tools/viewer/js/matrix.js`, `js/measures.js`, `js/layouts.js`, `explorer.css`.
- Discovery/exclusions: `vscode-extension/src/tree.js`, `src/extension.js`, `package.json`.
- Regression coverage: `tests/extension-viewer.test.cjs`, `fabric-viewer.test.cjs`, `power-query-workspace.test.cjs`, `fabric-tree.test.cjs`, `extension.test.js`, `vscode-mock.js`, `measures.test.cjs`, `ui-audit.browser.cjs`, `star-layout.browser.cjs`.

Final targeted measure/refresh rerun: **57 passed**. Generated extension media was synchronized and checked; generated files remain ignored, as usual.

## Integration verification (28 October 2026)

Reapplied commit `63154ef` onto current `origin/develop` at `41cae20`. Resolved only the exclusion-setting description conflict; retained the newer agent tools and bundled delivery contributions. The assigned branch's unrelated commits were left intact on that branch. Added user-facing changelog notes and included `ui-audit.browser.cjs` in the existing CI browser job.

- Chromium: `tests/ui-audit.browser.cjs`, `tests/measures-layout.browser.cjs`, `tests/snapshot.browser.cjs`, and `tests/demo-initial-viewport.browser.cjs`: **39 passed, 0 failed/skipped**.
- Local prerelease VSIX packaging succeeded (`npm run package --prefix vscode-extension -- --pre-release --out /tmp/smv-ui-audit-integration.vsix`). This is a local build, not a stable publication.
- Focused-star exploration: **12 passed, 2 failed** (one nested assertion and its parent); the 1280×720 focused star still fits at **39.5%**, below the existing 50% requirement. Re-running the same test (with the corrected demo-button selector) against an archived current `origin/develop` viewer reproduced the identical 39.5% failure. The threshold remains unchanged.
- MSI installation and live-tenant acceptance are separate checks, not validated by these synthetic UI regressions. No live tenant requests were made.
- Develop CI currently builds and publishes prereleases automatically. This integration does not change main, create stable release tags, or publish a stable release.
