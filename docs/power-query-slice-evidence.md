# #34 / #35 prerequisite evidence — 2026-10-08

Checkout: `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-power-query-metadata-lineage`.
Branch: `feat/power-query-metadata-lineage`, based on `cf28982`.

## Automated verification

- The earlier **235 passed, 0 failed** claim for `b816694` is retracted. That run
  preceded adding the discoverable BIM fixture and therefore did not verify the
  committed state. Independent babysitter verification at exact
  `b81669452cadc175d7d94e9b3094e197f2ee5b7d` produced **234 passed, 1 failed**;
  `/tmp/pq-babysit-prerequisite-tests-20261008.log` preserves the failure.
- Root cause: the new `tests/fixtures/power-query/model.bim` correctly adds a second
  discovered model, but `tests/extension.test.js` assumed only one throughout tree,
  archive exclusion, init handshake and listModels assertions. The correction keeps
  the BIM discoverable, asserts the exact complete TMDL/BIM set, and verifies BIM
  host-protocol delivery and exact M parsing. No discovery filters were weakened.
- First correction commit `b4a37a0238017c67500847da0b18699cea08cec4` still failed
  **234 passed, 1 failed** in the existing refresh assertion. The new BIM protocol
  check left that model active; the later TMDL refresh assertion therefore saw one
  BIM file. Log: `/tmp/pq-prerequisite-b4a37a0238017c67500847da0b18699cea08cec4.log`.
  The follow-up explicitly reopens/asserts the TMDL model before its analysis/refresh
  lifecycle checks, preserving both BIM coverage and the original refresh checks.
- The corrected commit requires a fresh full `npm test --prefix vscode-extension`
  and generated-asset `--check` at its exact hash. Results and hashes are recorded
  in the #34/#35 correction comments after that run.
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

#34/#35 browser inspection is recorded above; the original committed full-suite
claim was invalidated and requires the corrected-commit run described above. Packaged VS
Code/native workflow, independent review and full combined end-to-end acceptance
are **not claimed** here; #38 owns those gates after #36/#37 integration. The
existing extension host/viewer harness passed but is not installed-native evidence.
The original thread owns dependency handoffs. User review and explicit merge
approval remain required. Nothing has merged to main or been released.
