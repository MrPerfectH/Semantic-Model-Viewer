# Fabric connection (unreleased)

This feature is developed on `feature/fabric-connect` under GitHub issues #64–#72. It must not merge into `main` before the complete-feature acceptance gate in #72. The implementation is available for development; production Microsoft application provisioning and live-tenant verification are still required.

## User journey

In the standalone app, choose **Connect to Fabric**. In desktop VS Code, use **Semantic Model Viewer: Connect to Fabric…**, or the viewer's Connect button. Sign in with a Microsoft work account, browse/search workspaces and semantic models, and open a model. No user-created application registration, client ID, secret, or copied access token is part of this journey.

The standard connection uses XMLA and requires an eligible capacity/PPU and an enabled XMLA endpoint. The optional Fabric definition API connection requires model edit permissions and may request additional Microsoft consent. Both paths read metadata only: they do not execute DAX data queries or M, change models, or trigger model data refreshes. **Refresh Fabric** downloads metadata again.

Read + Build access does not guarantee complete internal metadata. Microsoft describes these users as database readers who cannot see internal semantic model metadata. Formulas, expressions, and partitions may be unavailable or retrieval may fail. XMLA models carry a permission-dependent coverage notice. Missing metadata must not be interpreted as proof that the source model has no such objects. The definition API is blocked for encrypted sensitivity labels.

Saved models contain a local metadata copy and fetch timestamp. Reopening works offline; manual refresh requires the original account/tenant and current access. Layouts survive successful metadata replacement where objects still exist. Failed refresh leaves the last good copy. Sign-out ends the viewer session but retains saved model metadata; remove each saved model to delete its copy. System Microsoft browser sessions may remain signed in.

Offline snapshots contain model metadata according to the existing snapshot policy, never Microsoft credentials or live connection handles. Inspect the full model/formulas before sharing; a cached copy may contain sensitive business metadata even after access is revoked.

## Maintainer setup and development

The publisher must provision its own multitenant Microsoft Entra public-client registration and approved loopback redirect. Microsoft consent, MFA, Conditional Access, and tenant restrictions still apply. This build deliberately has no borrowed application ID. An unconfigured build displays an unavailable sign-in message.

For standalone development, install Node.js 22 or later in addition to Python, run `npm ci --prefix tools/fabric`, and build the self-contained XMLA helpers using the .NET 8 SDK and `tools/fabric/xmla/publish.sh`. Set `SMV_FABRIC_CLIENT_ID` in the native host environment to the publisher-owned registration's public client ID, then launch the existing Python server. These are maintainer/developer steps; packaged distributions must provision the ID and runtime dependencies before release. Standalone tokens remain in the helper process memory, so reopening the process may require Microsoft sign-in. VS Code uses SecretStorage for the MSAL cache.

The VS Code packaging sync includes the shared native-host JavaScript and any published XMLA helpers outside webview resource roots. Production MSAL is bundled by the extension. The extension runs in the desktop UI host; VS Code web is unsupported. Cross-platform binaries can be compiled here, but successful compilation does not establish Windows/macOS behavior.

See [transport details](../tools/fabric/README.md) for scopes, supported endpoints, dependency versions, build instructions, and authoritative Microsoft references.

## Verification status

Automated tests cover transport pagination/LROs, safe origins and paths, authentication cancellation/account isolation, localhost session protection, model cache/refresh races, snapshot regressions, and extension-host integration. Browser checks exercise the actual unconfigured state and synthetic workspace/model responses; those are not live Fabric connectivity evidence.

Still required before release/main merge: publisher application provisioning, real sign-in/consent behavior, editor and Read + Build metadata coverage, Import/DirectQuery/Direct Lake fidelity, Windows/macOS installed-app and packaged-extension checks, and maintainer acceptance. The feasibility and final acceptance tickets remain open.
