# Fabric acceptance — 2026-10-26

This supersedes the outstanding-status list in the October 13 implementation record. It records an implemented preview, not completion of the full #65/#72 acceptance gate. No merge to main is authorized by this document.

## Implementation and verification

| Slice | Current evidence | Remaining acceptance |
| --- | --- | --- |
| #65 feasibility | Standard Microsoft browser sign-in and live XMLA opening on macOS, Linux x64 and Windows x64; all six helpers compile | Controlled permission/source fidelity matrix; complete public distribution review |
| #66 standalone | Live Mac standard browser sign-in, 36 workspaces and Direct Lake opening; synthetic browsing/search/failure coverage | Cross-platform standalone distribution acceptance remains under #72 |
| #67 VS Code | Installed desktop previews on Mac, Omarchy and MSI; native Fabric tree, workspace-scoped models and real model opening | Final 0.3.9 package installed and live-open verified on Windows x64 |
| #68 Read + Build | ADOMD consumer fallback implemented and exercised on a TOM-denied live model; 15 mapper assertions | Independently establish effective Read + Build-only permissions and compare to known source; full source definitions cannot be promised |
| #69 cache/refresh | Automated cache/refresh/race checks in both hosts; installed Windows live refresh and signed-out cached reopening | No missing implementation identified; normal Windows profile restart retains credentials and model cache |
| #70 lifecycle | Installed Windows sign-out, denied signed-out calls, wrong-account/wrong-tenant refresh rejection, cache retention and removal | Earlier Mac live tenant switch recorded in PR #149; strengthened isolation regressions pass |
| #71 snapshots | Actual offline browser export/reopen/re-export, Fabric fetch date/coverage preservation and identity/token exclusion | No missing implementation identified |
| #72 final gate | Regression, browser, packaging and native evidence below | Permission/source matrix, distribution review and maintainer acceptance |

## Recorded live platform results

No private model definitions, account names, tenant IDs, tokens or connection IDs are stored in this report.

- macOS: standard browser login and real model loading in standalone and desktop VS Code. Earlier live full-definition model: 21 tables, 211 columns (including engine row ordinals before their exclusion), 28 measures, 11 relationships. A TOM-denied model opened through consumer metadata: 24 tables, 227 columns, 55 measures, 11 relationships.
- Omarchy Linux x64: installed preview activation, standard browser login, 36 workspaces; selected workspace contained 2 models versus 5 in a different workspace. Direct Lake model loaded with 22 tables and 28 relationships. Navigation did not require repeated login. A separate device-code attempt was blocked by tenant Conditional Access; standard browser login succeeded.
- MSI Windows 11 x64 / VS Code Insiders: standard Arc login, 99 workspaces; selected workspaces returned 2 versus 10 distinct model entries. Two models loaded through bundled Windows XMLA with 21 and 24 tables, each with 11 relationships. Canvas and compact header rendered correctly; Explore all rendered the first model's 21 cards.
- Windows installed-host lifecycle harness (`tests/native-fabric.acceptance.cjs`) passed seven checks: live refresh, wrong-tenant rejection, wrong-account rejection, cleared credentials on sign-out, rejected signed-out discovery, cached reopening while signed out, selected cache removal. Only the isolated test profile was changed.
- An earlier remote resize operation left an Insiders test window unresponsive. A fresh maximized test window with onboarding disabled passed rendering and interaction. Root cause is unproven; this is not evidence that arbitrary resizing is reliable.

All six native targets are compiled and packaged; this is not runtime acceptance of Windows ARM64, Linux ARM64 or macOS x64. Desktop local extension hosts are supported; VS Code web/remote extension hosts are outside current acceptance. No model writes, model data refreshes, capacity resumes or billing changes were performed.

The final **0.3.9** VSIX was transferred to MSI with a matching SHA-256 and installed in an isolated normal VS Code profile (without extension test mode). After live sign-in and model loading, a full restart restored `signedIn: true` and one saved model. Live opening worked again without another login. The extension lifecycle harness passed again on this installed 0.3.9 runtime. The final archive’s Windows runtime hashes match that installed/tested runtime.

## Live REST/XMLA fidelity comparison

The same authorized Direct Lake model was retrieved through the actual standalone bridge using both explicit transports. Both parsed results contain **22 tables, 103 semantic columns, 64 measures and 28 relationships**. Sorted identities, column types/hidden/calculated flags, measure DAX/format strings, and relationship endpoints/cardinality/filtering/active state match exactly. Only sanitized counts and booleans are recorded in `parity.json`.

This comparison discovered 22 engine-maintained TOM `rowNumber` columns that TMDL omits. The parser now excludes that explicit system type while retaining ordinary columns named RowNumber and hidden business columns. This establishes parity between these two service representations of one model, not the complete source/permission matrix.

## Automated checks in this acceptance pass

- Full repository/extension regression with .NET SDK enabled: **735 passed, zero failures, zero skips**.
- Consumer metadata helper tests: **4 passed**, including native invalid-request sanitization and 15 mapping checks through the real viewer parser.
- Real downloaded snapshot browser checks: **8 passed**, including Fabric XMLA/REST provenance export and offline re-export. These provenance cases are synthetic, not additional live REST service evidence.
- New account-isolation regressions prove that interactive renewal rejects another tenant even for the same home account ID, and ambiguous restored account caches require explicit sign-in.
- Native preview packaging now requires every helper binary and bundled AMO, ADOMD and .NET license/notice files. Package metadata identifies 0.3.9 as a pre-release when built using `npm run package:preview`.

## Standalone distribution

An allowlisted standalone ZIP now bundles the viewer/server, MSAL production dependencies and all six self-contained XMLA helpers. It excludes source models, cached models and credentials. Python 3 and Node.js 22+ remain documented prerequisites; this is a portable distribution, not an installer that provisions those runtimes.

`tools/fabric/verify-preview.py` extracted the actual archive and passed native-helper execution, viewer assets, localhost bridge availability and fresh signed-out MSAL initialization on **Linux x64 and MSI Windows x64**. These smoke checks do not claim an additional live Microsoft sign-in. The Mac test installation already has live evidence; the build workflow additionally signs both Mac helpers and smoke-tests a fresh signed archive on its Mac runner.

Both local Mac preview helpers have also been ad hoc signed and their signatures verified on macOS; the signed ARM64 helper passed native invalid-request startup. The new preview workflow builds helpers, signs Mac bundles, runs regression tests, builds both distributions and tests the portable archive. The tag-release workflow reuses those jobs instead of packaging an extension without its helpers. CI execution of the new workflow remains pending until its results are recorded. Neither workflow publication nor notarization is implied by the local smoke tests.

## Reproduction

Run `SMV_DOTNET=/path/to/dotnet npm test --prefix vscode-extension` with a .NET 8 SDK; run `node --test tests/snapshot.browser.cjs` with Chrome/Chromium installed. Publish native helpers with `tools/fabric/xmla/publish.sh`, sign Mac helpers on macOS, then run `npm run package:preview --prefix vscode-extension -- --out /absolute/output.vsix`.

The native lifecycle runner is intended only for an isolated installed-extension test profile after opening an authorized test model. It signs out and removes that selected test model. It returns sanitized assertions and does not write definitions or tokens into its evidence.

## Remaining full-story gate

1. Obtain a known test source and a verified editor and Read + Build-only identity. Compare available table/column/measure/relationship definitions, DAX and Power Query across Import, DirectQuery and Direct Lake. Do not infer effective permissions from successful discovery or a fallback result.
2. Record the new multi-platform distribution workflow result, including its fresh signed-Mac archive smoke check. Portable Linux/Windows runtime smoke tests pass; runtime acceptance of all six architectures is not claimed.
3. Verify final public standalone runtime delivery/signing/notarization and applicable bundled-component distribution requirements. Bundled license texts are now present; this does not itself complete the distribution review.
4. Record maintainer acceptance in #72. Keep #64/#65/#68/#72 open until the relevant evidence exists. Do not mark the story complete merely because the main sign-in/open journey works.
