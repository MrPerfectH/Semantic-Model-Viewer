# #34 / #35 prerequisite evidence — 2026-10-08

Checkout: `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-power-query-metadata-lineage`.
Branch: `feat/power-query-metadata-lineage`, based on `cf28982`.

## Automated verification

- `npm test --prefix vscode-extension`: **235 passed, 0 failed**. This includes
  five metadata/snapshot tests, existing app, extension host/viewer, relationships,
  DAX/measures, canvas, layout and offline snapshot regressions.
- `node --test tests/power-query.test.cjs tests/snapshot.test.cjs`: **16 passed**.
- `node vscode-extension/scripts/sync-viewer.js --check`: **21 runtime assets
  byte-matched** against this checkout; no model/report data bundled.
- `git diff --check`: passed.
- The first full run found a snapshot re-export failure (new CSS was not embedded).
  Fixed the CSS embedding to use the runtime CSS allowlist; the regression now passes.

Metadata tests cover BIM exact strings/arrays, multiline and quoted M, multiple
partitions, declared kind vs inferred classification, missing/non-M states,
stable IDs independent of file order, TMDL structural indentation/fences/CRLF,
and default snapshot exclusion of raw M/parameter markers.

## T3 preview browser verification

Server started from this checkout with
`python3 Models/tools/viewer/scripts/serve.py --port 8943`.
Tab: `tab_14_9fb37a1a-9d5e-4eca-a366-3aa050ab491f`.
URL: `http://localhost:8943/`, viewport 1280×800.

Used the real import modal → Choose files → upload
`tests/fixtures/power-query/model.bim` → Add model → Power Query → select Sales.
This synthetic fixture has four partitions and three shared expressions.

Observed:

- Current M displayed with exact multiline/escaped quote content.
- Searching `quoted` created two marks without changing the code text.
- Copy M reported `Copied` (clipboard API/fallback success status; independent
  clipboard-content verification remains with #38).
- Calculated partition displayed its explicit non-M state, with no M code panel.
- Missing M partition displayed `M source metadata is missing.`
- Transform Sales opened `(input as table) as table => input` and showed
  `function · inferred from syntax`.
- Filtering the library for Environment left one result; opening it showed exact
  parameter M with `M metadata marker (not evaluated)`.
- Calling the app's existing `loadModel('builtin')` replacement path removed the
  dialog and switched to Contoso Retail; no stale M inspector remained.
- Snapshot export allowlist is verified by automated tests, including offline
  re-export. No M evaluation, data fetch or source-model edits occurred.

One automation click used an invalid locator; corrected the locator and continued.
The dependent select timed out while the dialog was closed. These were automation
argument/state errors, not acceptance evidence; successful checks above followed.

## Boundary and remaining owners

#34/#35 source, automated checks and browser inspection are verified. Packaged VS
Code/native workflow, independent review and full combined end-to-end acceptance
are **not claimed** here; #38 owns those gates after #36/#37 integration. The
existing extension host/viewer harness passed but is not installed-native evidence.
The original thread owns dependency handoffs. User review and explicit merge
approval remain required. Nothing has merged to main or been released.
