# Fabric implementation verification — 2026-10-13

Historical record. For current implementation and live platform status, see [the October 26 acceptance record](../fabric-20261026/acceptance.md). The outstanding items below describe October 13, not the current preview.

This is implementation evidence for the unmerged `feature/fabric-connect` branch and issues #64–#72. It is not live-tenant acceptance.

## Checks completed

- `node --test tests/*.test.cjs tools/fabric/tests/*.test.cjs Models/tools/viewer/tests/*.test.js tests/extension.test.js`: **712 passed, 0 failed, 0 skipped** on Linux, Node.js 26.8.2. Includes Fabric auth/transport/host/cache/provenance tests and existing viewer/extension regressions.
- `node --test tests/snapshot.browser.cjs`: **7 passed**, including actual downloaded offline snapshot exploration and re-export in a fresh browser document.
- Shared runtime synchronization and byte checks completed using `vscode-extension/scripts/sync-viewer.js`.
- .NET 8 SDK compilation/self-contained publication completed for Windows, macOS, and Linux, each x64 and ARM64. This establishes compilation only; execution on Windows/macOS is not verified.
- Published Linux XMLA helper invalid-request smoke test passed: sanitized JSON error, no access token/stack/path output.
- `npm ci --prefix vscode-extension` completed with no reported vulnerabilities. The VS Code preview package was built with `npm run package --prefix vscode-extension -- --out /tmp/semantic-model-viewer-fabric-preview.vsix`.
- ZIP inspection verified the native-host service, MSAL dependency, and all six helper platform directories; no source models or test fixtures were packaged. The preview package is unconfigured for live Microsoft sign-in.
- `git diff --check` passed.

See [UI browser evidence](ui.md) for actual unconfigured-state checks and explicitly synthetic browse/open/refresh/offline/remove checks.

## Integration safeguards

The Python server requires a per-process nonce, JSON content type, valid local Host, and same-origin requests for Fabric operations. A persistent native helper retains standalone credentials only in memory. VS Code uses SecretStorage and keeps authentication/network operations outside the webview. Cancellation and account generation checks prevent late model/discovery results from populating a new session. Definition paths, response size, remote continuation origins, and helper payloads are validated. Read-only XMLA is the standard path; editor REST access is an explicit choice and does not silently request broader consent.

Cache/source fields and snapshots use allowlists. Snapshot provenance includes fetch time, method, coverage, and warnings; tenant/account/workspace/model IDs and authentication state are excluded. Coverage warnings survive native opening, caching, refreshing, and offline re-export.

## Outstanding acceptance

1. Provision a publisher-owned multitenant Entra public-client application and validate the loopback redirect and exact delegated scopes against tenant policy. No user setup or borrowed third-party client ID is implemented.
2. Exercise real workspace/model discovery and metadata retrieval using an editor and a Read + Build account, including consent/MFA/Conditional Access, capacity/XMLA settings, and encrypted-label failure.
3. Verify Import, DirectQuery, and Direct Lake metadata fidelity against synthetic source definitions. Microsoft restricts internal metadata for Build users; full formulas/partitions/M cannot be promised for that persona.
4. Run installed standalone and packaged extension workflows on supported Windows/macOS platforms; review dependency redistribution/signing and delivery of standalone Node/MSAL/native runtime prerequisites.
5. Complete maintainer review under #72 before release or any main merge.

All feature tickets remain open. Synthetic passing tests do not satisfy these external checks.
