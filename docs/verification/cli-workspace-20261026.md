# CLI workspace workflow — merge acceptance

## Scope

This branch integrates the released CLI-only Claude plugin with `develop` and
adds a separate Fabric definition-fetch adapter, explicit opening controls and
source/renderer/artifact receipts. It does not merge the unrelated live Fabric
connection preview, publish a marketplace update, or modify the owner's dirty
working checkout. The intended feature PR base is `develop`, following
CONTRIBUTING.md. Main/stable promotion remains a later release step.

## Automated evidence

On Omarchy:

- CLI suite: 70 tests passed.
- Full viewer/extension suite: 766 tests passed.
- Real-Chrome interactive suite: 16 tests passed, including source-focused
  Measures round trips, quiet Apply controls and authored question paths.
- Native Claude marketplace installer: plugin installs with six skills, zero
  MCP servers, and no runtime npm dependencies.
- PNG diagram generation and receipt writing passed using the bundled viewer.
- New synthetic transport/CLI tests cover workspace pagination, asynchronous
  definition retrieval, retry bounds, unsafe endpoints and part paths, duplicate
  names, credential redaction, existing output preservation, source-change
  detection, and end-to-end workspace-to-diagram output.

The GitHub workflows exercise the CLI/installer and browser flows on Linux,
macOS and Windows with Node.js 22. Their PR checks are authoritative for the
final commit; local completion is not a claim that remote checks have passed.

## Integration fixes

Develop's viewport-aware controls, closable library, host action feedback and
expanded relationship endpoints are preserved. Source-focused Measures views
retain their table/column source while applying the newer graph preferences.
Tests for saved/empty layouts now include the released CLI's explicit `both`
active-direction defaults. The optional repository MCP adapter remains available
for existing development integrations; it is excluded from the CLI plugin.

## Live acceptance still required

No Azure CLI installation or authenticated Fabric account is available in this
environment. Tests use synthetic API responses and mocked token acquisition, not
a live Microsoft tenant. Neither live Azure CLI token acquisition on the three
operating systems nor production-model fidelity is claimed.

Before claiming live Fabric acceptance, an authorized user should sign in with
Azure CLI, choose a model for which they have read/write access, fetch it by UUID
and unique name, compare key model metadata with the original, generate an HTML
and PNG diagram, and verify the receipt's workspace/model IDs and fetch time.
Read + Build alone is insufficient for the definition API; encrypted sensitivity
labels and organization policy can block it. This limitation is documented in
[the user workflow](../cli-workspace-fetch.md).
