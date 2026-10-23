# Fabric transport helper

This is implementation on the unmerged Fabric feature branch, not live-tenant acceptance evidence.

## Host interface

`createAuth({clientId, openBrowser, loadTokens, saveTokens})` in `auth.cjs` uses the official Microsoft MSAL Node library. `loadTokens` and `saveTokens` exchange serialized MSAL cache strings (or null), and must use host credential storage, never viewer data or a plaintext file. Methods: `status`, `signIn`, `getAccessToken(audience, purpose?)`, `signOut`, `cancel`. Sign-out removes all local accounts/cache; it does not log the browser out of Microsoft.

`createFabricClient({getAccessToken, xmlaReader, fetch?})` in `client.cjs` exposes `listWorkspaces({search, signal})`, `listModels(workspaceId, {search, signal})`, and `getModelDefinition(workspaceId, modelId, {workspaceName, transport, signal})`. Definitions return `{transport, parts:[{path, content}]}`. Discovery exhausts bounded pagination and searches locally. Network redirects and foreign continuation origins are rejected. Operations use cancellation and deadlines. Only metadata-reading endpoints are used; REST getDefinition happens to use POST.

With an XMLA reader installed, `auto` defaults to XMLA: this serves both editors and Read + Build accounts without requesting model write scopes. XMLA errors remain visible. Editors can explicitly choose `rest` when XMLA capacity/settings are unavailable. REST is not an automatic upgrade to broader consent. If REST returns 403 and a helper exists, XMLA can be attempted. Never treat discovery as proof of definition access.

## Maintainer setup still required

There is no borrowed Microsoft or third-party application ID. The native host bundles publisher-owned public client ID `d68a809b-913e-405c-b608-e95303378adc`, registered for organizational accounts in publisher directory `haraznygmail.onmicrosoft.com` (tenant `c461f764-c0ef-4775-bbeb-f30369ac2905`). The registration has delegated Workspace.Read.All, SemanticModel.Read.All, SemanticModel.ReadWrite.All and Dataset.Read.All permissions and the desktop callback below. Publisher verification and real cross-tenant access remain pending validation. Users do not configure an app, secret, token, or client ID. Register a desktop loopback redirect URI `http://localhost/callback`; the actual port is ephemeral. Discovery requests delegated Fabric `Workspace.Read.All` and `SemanticModel.Read.All`; editor REST definition additionally requests `SemanticModel.ReadWrite.All`; XMLA requests Power BI `Dataset.Read.All`. Tenant consent, Conditional Access and MFA remain Microsoft policy. No implementation can promise approval-free access across arbitrary tenants.

Built-in TOM interactive sign-in is Windows-only and requires the .NET Desktop runtime according to Microsoft's client-library documentation. This helper instead uses browser authorization code + PKCE via MSAL for both Windows and macOS, then passes a Power BI audience access token to TOM through stdin. No tokens are placed in process arguments or logs.

## Build/package

Run `npm ci --prefix tools/fabric` and build `xmla/publish.sh` with .NET 8 SDK. It publishes self-contained platform/architecture packages; end users do not install .NET. Include the appropriate `xmla/publish/<node-platform>-<node-arch>` directory in standalone and VS Code release artifacts. `createXmlaReader({executable?})` may receive an explicit bundled executable location; `SMV_FABRIC_XMLA_HELPER` is a developer override. VS Code must execute in a local extension host: remote/web extension support is not established. No generated binaries or credentials are committed.

TOM NuGet package is pinned to 19.118.3; MSAL Node is pinned to 7.0.1. Their licenses/notices must be included and redistribution reviewed for release. XMLA requires eligible capacity/PPU, enabled XMLA/tenant settings and Read + Build permission; Read + Build accounts are database readers: Microsoft's documentation explicitly says they cannot see internal semantic model metadata. Full DAX/Power Query/partition coverage for that persona is therefore not established and may be impossible without Write permission. Object/row restrictions may further affect exposed metadata. Encrypted labels block the REST definition API. Retrieval uses TOM serialization of the selected database to BIM, retaining metadata represented by TOM, rather than manually reconstructing it from a handful of DMVs.

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
