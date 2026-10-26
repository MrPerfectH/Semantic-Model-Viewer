# Fabric transport helper

This is implementation on the unmerged Fabric feature branch. See [current acceptance evidence](../../docs/verification/fabric-20261026/acceptance.md); platform execution and synthetic checks are recorded separately.

## Host interface

`createAuth({clientId, openBrowser, loadTokens, saveTokens})` in `auth.cjs` uses the official Microsoft MSAL Node library. `loadTokens` and `saveTokens` exchange serialized MSAL cache strings (or null), and must use host credential storage, never viewer data or a plaintext file. Methods: `status`, `signIn`, `getAccessToken(audience, purpose?)`, `signOut`, `cancel`. Valid access tokens are reused in process memory, keyed by account, tenant and requested scopes, with a 60-second expiry margin. Discovery and XMLA share the same token for the default Microsoft identity. Expired tokens return to MSAL for renewal; custom API resources and permission sets remain separate. Sign-out removes all local accounts/cache; it does not log the browser out of Microsoft.

`createFabricClient({getAccessToken, xmlaReader, fetch?})` in `client.cjs` exposes `listWorkspaces({search, signal})`, `listModels(workspaceId, {search, signal})`, and `getModelDefinition(workspaceId, modelId, {workspaceName, transport, signal})`. Definitions return `{transport, parts:[{path, content}]}`. Discovery exhausts bounded pagination and searches locally. Network redirects and foreign continuation origins are rejected. Operations use cancellation and deadlines. Only metadata-reading endpoints are used; REST getDefinition happens to use POST.

With an XMLA reader installed, `auto` defaults to XMLA: this serves both editors and Read + Build accounts without requesting model write scopes. XMLA errors remain visible. Editors can explicitly choose `rest` when XMLA capacity/settings are unavailable. REST is not an automatic upgrade to broader consent. If REST returns 403 and a helper exists, XMLA can be attempted. Never treat discovery as proof of definition access.

## Authentication configuration

The default is Power BI Desktop public client `ea0616ba-638b-4df5-95b9-636659ae5121`, requesting `https://analysis.windows.net/powerbi/api/.default` with an ephemeral root localhost callback. This matches the approach documented by [Tabular Editor](https://docs.tabulareditor.com/en/features/te-cli/te-cli-auth.html). For this identity both Fabric REST and XMLA use the Power BI token; actual REST access is subject to live validation. Arbitrary token audiences remain rejected. No token contents are sent to the viewer.

`SMV_FABRIC_CLIENT_ID` or the host's explicit `clientId` can select a publisher-owned registration. Custom registrations retain resource-specific discovery/definition scopes and `/callback` redirect. The previously provisioned publisher registration is `d68a809b-913e-405c-b608-e95303378adc` in `haraznygmail.onmicrosoft.com`; its first external-tenant test required administrator approval. Neither identity bypasses tenant policy. No guarantee of approval-free sign-in or Microsoft support for third-party reuse is claimed. Keep the feature off main until the complete #72 acceptance gate is recorded.

Built-in TOM interactive sign-in is Windows-only and requires the .NET Desktop runtime according to Microsoft's client-library documentation. This helper instead uses browser authorization code + PKCE via MSAL for both Windows and macOS, then passes a Power BI audience access token to TOM through stdin. No tokens are placed in process arguments or logs. The bridge passes the discovered workspace and semantic model names to TOM: the workspace URL uses the workspace name, and Initial Catalog uses the model name. REST model IDs are retained for discovery, cache identity and database lookup; they are not used as catalog names.

## Build/package

Run `npm ci --prefix tools/fabric` and build `xmla/publish.sh` with .NET 8 SDK. It publishes self-contained platform/architecture packages; end users do not install .NET. Include the appropriate `xmla/publish/<node-platform>-<node-arch>` directory in standalone and VS Code release artifacts. `createXmlaReader({executable?})` may receive an explicit bundled executable location; `SMV_FABRIC_XMLA_HELPER` is a developer override. VS Code must execute in a local extension host: remote/web extension support is not established. No generated binaries or credentials are committed.

TOM and ADOMD NuGet packages are pinned to 19.118.3; MSAL Node is pinned to 7.0.1. The publish script includes component licenses/notices from `xmla/notices` in every helper directory. Public redistribution and signing review remain release requirements. XMLA requires eligible capacity/PPU, enabled XMLA/tenant settings and Read + Build permission; Read + Build accounts are database readers: Microsoft's documentation explicitly says they cannot see internal semantic model metadata. Full DAX/Power Query/partition coverage for that persona is therefore not established and may be impossible without Write permission. Object/row restrictions may further affect exposed metadata. Encrypted labels block the REST definition API. Authorized editors use TOM serialization of the selected database to BIM. If TOM metadata discovery is denied, ADOMD reads fixed INFO.VIEW metadata queries, with catalog-restricted consumer schema fallback. That result is marked consumer-metadata and warns that internal definitions, partitions and Power Query are unavailable; it is not a complete source export. No queries against model data rows are executed.

## Validation

`node --test tools/fabric/tests/*.test.cjs` tests discovery pagination, origin protection, LRO retrieval, malformed definition rejection, permission/token error routing and unconfigured sign-in. The TOM helper compiles with .NET 8 on Linux. Compilation and synthetic tests do not prove live tenant sign-in or full Import/DirectQuery/Direct Lake fidelity. Windows/macOS signed-package testing, both permission personas, tenant policies, platform architecture coverage, semantic metadata comparison and maintainer acceptance remain required under issue #65 before release.

Official references:

- [Fabric workspace discovery](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/list-workspaces)
- [Semantic model discovery](https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/list-semantic-models)
- [Definition permissions, labels and payload format](https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/get-semantic-model-definition)
- [Long-running operation state](https://learn.microsoft.com/en-us/rest/api/fabric/core/long-running-operations/get-operation-state)
- [Analysis Services client libraries and platform restrictions](https://learn.microsoft.com/en-us/analysis-services/client-libraries)
- [XMLA connectivity and permissions](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-premium-connect-tools)
- [Microsoft loopback redirect rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)

Capacity diagnostics use existing Power BI permissions to detect a suspended capacity before opening XMLA. When capacity visibility is unavailable, the diagnostic is skipped and XMLA remains authoritative. No capacity is resumed or changed by the viewer.

Mac single-file helpers must be signed after cross-publishing: run `tools/fabric/xmla/sign-macos.sh` on macOS before packaging. It uses an ad hoc signature for local previews, or the maintainer-provided `SMV_MAC_SIGN_IDENTITY`. `publish.sh` runs it automatically when building on macOS. Public distribution still requires the appropriate publisher signing/notarization checks.
