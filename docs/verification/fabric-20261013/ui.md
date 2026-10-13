# Fabric viewer UI verification

Verified with the T3 collaborative browser on the standalone Python server at localhost:8942, 2026-10-13.

- Real, unconfigured host: Connect to Fabric opens the dialog, shows the publisher-registration requirement, and disables Sign in with Microsoft. Screenshot: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv6ze54z-f8ed00ee.png`.
- A synthetic bridge was injected only into the browser tab (not application code or native service). Workspace browsing, model browsing, and opening a one-table model succeeded. Stored identity contained tenant/workspace/model/account IDs and fetch timestamp.
- Synthetic refresh preserved the exact canvas positions (`Orders: x=333, y=444`) and viewport (`x=88, y=99, k=0.75`). Screenshot: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv6zel41-befde182.png`.
- Reload removed the synthetic bridge, while the cached model reopened without authentication or a model fetch.
- With the real unconfigured host restored, the dialog displayed explicit XMLA/REST transport choices and the cached model. Screenshot: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv6zfnpf-f4c4dcc9.png`.
- Remove Synthetic Fabric model deleted cached metadata, cleared the remembered model, and returned to the empty viewer.

This verifies browser workflows and local caching, not live Microsoft sign-in, tenant discovery, XMLA access, or REST metadata access. Those require the configured application registration and real tenant acceptance tests.

Automated checks: eight tests in `tests/fabric-viewer.test.cjs` cover allowlisted source identity, account isolation, source response credential exclusion, cancellation and switching races, failed refresh retaining metadata, snapshot isolation, and coordinated native removal. Existing snapshot tests also passed (35 tests combined after the final additions).
