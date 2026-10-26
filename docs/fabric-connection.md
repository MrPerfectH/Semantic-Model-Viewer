# Fabric connection (unreleased)

This feature is integrated into the `develop` pre-release under GitHub issues #64–#72. It must not merge into `main` before the complete-feature acceptance gate in #72. The implementation is available as a Fabric preview. Standard browser sign-in and live XMLA model opening have passed on macOS, Linux x64 and Windows x64. See the [current acceptance record](verification/fabric-20261026/acceptance.md) for exact evidence and remaining limits.

## User journey

In the standalone app, choose **Connect to Fabric → Sign in with Microsoft**. The same browser navigates to Microsoft and returns to the viewer after authentication; it does not launch a browser on a remote host. In desktop VS Code, open **Semantic Models** in the Activity Bar, expand **Fabric**, and choose **Sign in to Fabric…**. Expand a workspace and click a semantic model to open it in a viewer tab. Workspace and model lists load on demand; use the Fabric section’s Refresh action to reload them. The existing **Semantic Model Viewer: Connect to Fabric…** command and viewer Connect button remain available. Sign in with a Microsoft work account, browse/search workspaces and semantic models, and open a model. No user-created application registration, client ID, secret, or copied access token is part of this journey. If a passkey window is unavailable (for example in a remote browser), choose **Sign in using a code**, open Microsoft sign-in in your regular browser and enter the displayed short-lived code. Closing the connection dialog cancels the pending login.

The standard connection uses XMLA and requires an eligible capacity/PPU and an enabled XMLA endpoint. The optional Fabric definition API connection requires model edit permissions and may request additional Microsoft consent. Both paths read metadata only: they do not execute DAX data queries or M, change models, or trigger model data refreshes. **Refresh Fabric** downloads metadata again.

Read + Build access does not guarantee complete internal metadata. Microsoft describes these users as database readers who cannot see internal semantic model metadata. Formulas, expressions, and partitions may be unavailable or retrieval may fail. If TOM discovery is denied, the viewer tries ADOMD consumer metadata via fixed INFO.VIEW metadata queries and restricted schema rowsets. The result carries a limited consumer-metadata notice and never fabricates Power Query or partitions. Other XMLA models carry a permission-dependent coverage notice. Missing metadata must not be interpreted as proof that the source model has no such objects. The definition API is blocked for encrypted sensitivity labels.

Saved models contain a local metadata copy and fetch timestamp. Reopening works offline; manual refresh requires the original account/tenant and current access. Layouts survive successful metadata replacement where objects still exist. Failed refresh leaves the last good copy. Sign-out ends the viewer session but retains saved model metadata; remove each saved model to delete its copy. System Microsoft browser sessions may remain signed in.

Offline snapshots contain model metadata according to the existing snapshot policy, never Microsoft credentials or live connection handles. Inspect the full model/formulas before sharing; a cached copy may contain sensitive business metadata even after access is revoked.

## Maintainer setup and development

The default sign-in uses the Power BI Desktop public-client identity (`ea0616ba-638b-4df5-95b9-636659ae5121`) and Power BI `.default` permissions, following the authentication approach documented by [Tabular Editor](https://docs.tabulareditor.com/en/features/te-cli/te-cli-auth.html). Users do not register an application. A publisher-owned registration remains available through the developer override. Microsoft consent, MFA, Conditional Access and tenant restrictions still apply; the shared identity does not guarantee access. Standard sign-in and XMLA access have live evidence; the optional REST definition path also passed a live Direct Lake comparison against XMLA. This does not establish all model modes or permission personas.

For standalone development, install Node.js 22 or later in addition to Python, run `npm ci --prefix tools/fabric`, and build the self-contained XMLA helpers using the .NET 8 SDK and `tools/fabric/xmla/publish.sh`. Launch the existing Python server. `SMV_FABRIC_CLIENT_ID` remains an optional developer override. These are maintainer/developer steps; packaged distributions must provision the ID and runtime dependencies before release. Standalone tokens remain in the helper process memory, so reopening the process may require Microsoft sign-in. VS Code uses SecretStorage for the MSAL cache.

Desktop VS Code 1.101 or later is required for the Node.js 22 host runtime ([VS Code release notes](https://code.visualstudio.com/updates/v1_101)).

The VS Code packaging sync includes the shared native-host JavaScript and any published XMLA helpers outside webview resource roots. Production MSAL is bundled by the extension. The extension runs in the desktop UI host; VS Code web is unsupported. Cross-platform binaries can be compiled here, but successful compilation does not establish Windows/macOS behavior.

See [transport details](../tools/fabric/README.md) for scopes, supported endpoints, dependency versions, build instructions, and authoritative Microsoft references.

## Verification status

Automated tests cover transport pagination/LROs, safe origins and paths, authentication cancellation/account isolation, localhost session protection, model cache/refresh races, snapshot regressions, and extension-host integration. Browser checks exercise the actual unconfigured state and synthetic workspace/model responses; those are not live Fabric connectivity evidence.

Before full acceptance/main merge, complete controlled editor versus Read + Build source comparisons, the Import/DirectQuery/Direct Lake fidelity matrix, remaining installed-host lifecycle checks, public standalone distribution/signing review, and maintainer acceptance. The six compiled helper targets are not six verified runtime targets. The current acceptance record distinguishes completed live checks from remaining checks; the October 13 verification record is historical.

A suspended Fabric capacity cannot serve its models. The viewer reports this state when its existing permissions allow capacity diagnostics; it never resumes a capacity or changes billing.

## Enterprise denied-access check

An additional enterprise tenant was tested on the installed Windows x64 0.5.0 preview. Standard sign-in, account switching, workspace discovery and listing all 16 semantic models succeeded. All 16 metadata-only XMLA opens returned `XmlaAccessDenied`. Existing-permission probes confirmed dedicated capacity, but did not establish its XMLA setting or the account's effective Build rights. This is a denied-access result, not a passing Read + Build test or proof of a particular tenant-policy cause. Detailed safe diagnostics and a controlled permission test remain outstanding. No remote model, permissions or capacity settings were changed.
