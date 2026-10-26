# Fabric acceptance — 2026-10-26

This supersedes the outstanding-status list in the October 13 implementation record. It records an implemented preview, not completion of the full #65/#72 acceptance gate. No merge to main is authorized by this document.

## Implementation and verification

| Slice | Current evidence | Remaining acceptance |
| --- | --- | --- |
| #65 feasibility | Standard Microsoft browser sign-in and live XMLA opening on macOS, Linux x64 and Windows x64; all six helpers compile | Controlled permission/source fidelity matrix; complete public distribution review |
| #66 standalone | Live Mac standard browser sign-in, 36 workspaces and Direct Lake opening; synthetic browsing/search/failure coverage | Cross-platform standalone distribution acceptance remains under #72 |
| #67 VS Code | Installed desktop previews on Mac, Omarchy and MSI; native Fabric tree, workspace-scoped models and real model opening | Integrated 0.5.0 package installed and live-open verified on Windows x64 |
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

The earlier **0.3.9** VSIX was transferred to MSI with a matching SHA-256 and installed in an isolated normal VS Code profile (without extension test mode). After live sign-in and model loading, a full restart restored `signedIn: true` and one saved model. Live opening worked again without another login. The extension lifecycle harness passed again on that installed 0.3.9 runtime. These are historical lifecycle results; the integrated 0.5.0 preview is checked separately below.

## Live REST/XMLA fidelity comparison

The same authorized Direct Lake model was retrieved through the actual standalone bridge using both explicit transports. Both parsed results contain **22 tables, 103 semantic columns, 64 measures and 28 relationships**. Sorted identities, column types/hidden/calculated flags, measure DAX/format strings, and relationship endpoints/cardinality/filtering/active state match exactly. Only sanitized counts and booleans are recorded in `parity.json`.

This comparison discovered 22 engine-maintained TOM `rowNumber` columns that TMDL omits. The parser now excludes that explicit system type while retaining ordinary columns named RowNumber and hidden business columns. This establishes parity between these two service representations of one model, not the complete source/permission matrix.

## Automated checks in this acceptance pass

- Full repository/extension regression with .NET SDK enabled: **762 passed, zero failures, zero skips**.
- Consumer metadata helper tests: **4 passed**, including native invalid-request sanitization and 15 mapping checks through the real viewer parser.
- Real downloaded snapshot browser checks: **8 passed**, including Fabric XMLA/REST provenance export and offline re-export. These provenance cases are synthetic, not additional live REST service evidence.
- New account-isolation regressions prove that interactive renewal rejects another tenant even for the same home account ID, and ambiguous restored account caches require explicit sign-in.
- Native preview packaging now requires every helper binary and bundled AMO, ADOMD and .NET license/notice files. Package metadata identifies 0.3.9 as a pre-release when built using `npm run package:preview`.

## Standalone distribution

An allowlisted standalone ZIP now bundles the viewer/server, MSAL production dependencies and all six self-contained XMLA helpers. It excludes source models, cached models and credentials. Python 3 and Node.js 22+ remain documented prerequisites; this is a portable distribution, not an installer that provisions those runtimes.

`tools/fabric/verify-preview.py` extracted the actual archive and passed native-helper execution, viewer assets, localhost bridge availability and fresh signed-out MSAL initialization on **Linux x64 and MSI Windows x64**. These smoke checks do not claim an additional live Microsoft sign-in. The Mac test installation already has live evidence; the build workflow additionally signs both Mac helpers and smoke-tests a fresh signed archive on its Mac runner.

Both local Mac preview helpers have also been ad hoc signed and their signatures verified on macOS; the signed ARM64 helper passed native invalid-request startup. The new preview workflow builds helpers, signs Mac bundles, runs regression tests, builds both distributions and tests the portable archive. The tag-release workflow reuses those jobs instead of packaging an extension without its helpers. The [multi-platform CI run](https://github.com/MrPerfectH/Semantic-Model-Viewer/actions/runs/40328665116) at `c4c134a` passed all helper, Mac-signing and package jobs, including a fresh Darwin ARM64 standalone smoke check, 762 regression tests and eight snapshot browser checks. It produced both distribution artifacts. No public release or publisher notarization is implied by those checks.

## Current-main integration

The feature branch now includes `origin/main` at `06982ee` (stable 0.4.3), preserving the stable relationship-label, theme, layout, DAX and report-opening fixes. Merge conflicts were resolved by combining Fabric provenance/controls with theme support, retaining both snapshot asset sets, and keeping the stable changelog/video documentation. The preview version advances to **0.5.0**, avoiding a downgrade from stable 0.4.3. MSI installed the hash-verified 0.5.0 VSIX, reused the existing session, discovered 99 workspaces and opened the 21-table/11-relationship live model. All 21 canvas tables rendered, the compact header and theme control fit, and clicking a relationship confirmed its endpoints, cardinality and filter direction. No feature changes were merged into main.

The integrated renderer passed **762 regression tests**, **8 downloaded snapshot browser checks**, and **5 fresh-launch/report tests** against the committed integration checkout. Both Linux and Windows portable smoke tests also pass on the hash-verified 0.5.0 archive. Current build/package receipts identify the 0.5.0 artifacts; earlier 0.3.9 installed-host evidence is retained as historical evidence for unchanged connection/lifecycle code.

## Reproduction

Run `SMV_DOTNET=/path/to/dotnet npm test --prefix vscode-extension` with a .NET 8 SDK; run `node --test tests/snapshot.browser.cjs` with Chrome/Chromium installed. Publish native helpers with `tools/fabric/xmla/publish.sh`, sign Mac helpers on macOS, then run `npm run package:preview --prefix vscode-extension -- --out /absolute/output.vsix`.

The native lifecycle runner is intended only for an isolated installed-extension test profile after opening an authorized test model. It signs out and removes that selected test model. It returns sanitized assertions and does not write definitions or tokens into its evidence.

## Remaining full-story gate

1. Obtain a known test source and a verified editor and Read + Build-only identity. Compare available table/column/measure/relationship definitions, DAX and Power Query across Import, DirectQuery and Direct Lake. Do not infer effective permissions from successful discovery or a fallback result.
2. Complete the maintainer distribution review of declared prerequisites, bundled-component terms, tested architecture limits and ad hoc signing. A publisher-notarized standalone Mac installer is not claimed or produced.
3. Record maintainer acceptance in #72. Keep #64/#65/#68/#72 open until the relevant evidence exists. Do not mark the story complete merely because the main sign-in/open journey works.

## Develop integration

The Fabric branch incorporates develop at `0e4fd77718557858135aba993f338306b2f3c1d3`, preserving its VS Code theme support, onboarding, authored views, MCP app bridge and CLI workflows. This integration targets develop pre-releases only; the final main acceptance gate remains open.

Local validation passed 805 regression tests and 41 CLI/session tests. Browser checks passed snapshots, onboarding, measure layouts/search and the authored/MCP workflows. Integration exposed a conflict between prepared-view formula browsing and the normal viewer's optional search-results dialog; the prepared context retains immediate browsing while normal search retains the overview. The failing authored browser case passed after correction, along with the normal search browser case and 53 targeted measure/interactive/snapshot regressions.

Develop publishing now waits for the six-target helper build, macOS signing/smoke check, packaged preview validation and regression checks before uploading the pre-release to Marketplace. No stable release or main merge is authorized by this integration.

The additional enterprise-tenant test discovered 16 models but opened none through XMLA (`XmlaAccessDenied` for all 16). Dedicated capacity was confirmed; effective Build rights and the XMLA setting remain unconfirmed. It is denied-access evidence, not a passing Read + Build case. See issues #68 and #72 for the recorded outstanding gate.
