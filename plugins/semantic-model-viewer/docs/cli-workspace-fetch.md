# Fetch a workspace model and explain it with a diagram

This CLI workflow downloads one model definition, then uses the local offline
viewer. It does not establish a live Fabric connection, run DAX/M queries, modify
remote models, or manage Microsoft sign-in. It is separate from the standalone
app's Fabric connection preview.

## Requirements

Local models still need only Node.js 22+. Workspace fetching additionally needs
an existing Azure CLI login, or a bearer token supplied on stdin by your own
credential provider. The plugin does not install Azure CLI or store tokens.

Sign in using your organization's normal Azure CLI procedure (`az login`). Then:

```sh
smv fetch --workspace "Finance" --model "Retail"
```

The receipt returns the canonical local `path`, workspace/model IDs, fetch time,
and a content hash. Run `smv show` against that path for later offline questions.
An optional `--out /path/to/Retail.SemanticModel` selects a **new** destination.
An existing destination is never overwritten. The default is a unique directory
under `~/.cache/semantic-model-viewer/fabric`; `SMV_CACHE_DIR` overrides that root.
Downloads remain there until you delete them. Refresh by fetching a new copy.

Use UUIDs when names are duplicated, or to avoid listing workspaces/items:

```sh
smv fetch --workspace <workspace-UUID> --model <model-UUID> --out Retail.SemanticModel
```

Names match exactly, ignoring case. Ambiguous names return candidate IDs instead
of choosing a workspace or model. `--tenant <UUID>` or `FABRIC_TENANT` directs
Azure CLI token acquisition to the intended tenant. The API audience is
`https://api.fabric.microsoft.com`.

For other authentication providers, `--token-stdin` reads one bearer token from
stdin. Supply it privately through your provider's standard mechanism; do not
put credentials in command arguments, source files, receipts or chat. No token
is saved in the fetched model or plugin configuration.

## One command from a workspace to a diagram

```sh
smv show --workspace "Finance" --model "Retail" --table "Date" --with "Sales"
smv show --workspace "Finance" --model "Retail" --table "Sales" --dependents --out calculations.html --open none
```

Every workspace request fetches a fresh definition into a new local folder.
Later `show <returned-local-path>` calls reuse compatible local sessions.
Definition retrieval can take time: pagination, asynchronous Fabric operations,
and throttling retries are handled with bounded waits. Failed downloads leave no
completed model and preserve existing copies. The API response is validated
before publishing the local folder.

**Access limitation:** Microsoft's `getDefinition` API requires read and write
permission on the semantic model, despite this operation only reading metadata.
Read + Build alone is insufficient. Encrypted sensitivity labels can block this
API. This CLI does not use XMLA or work around those permissions. Definitions
also do not include the sensitivity label itself. See Microsoft's
[getDefinition reference](https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/get-semantic-model-definition),
[workspace listing](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/list-workspaces), and
[Azure CLI token reference](https://learn.microsoft.com/en-us/cli/azure/account#az-account-get-access-token).

## Choose where the diagram opens

`show`, `serve`, `snapshot`, `shot` and `session export` return a URL/file by default.
`open` launches the system default application by default. Use the same controls:

```sh
smv show Retail.SemanticModel --table Date --with Sales --open system
smv open Retail.SemanticModel --open none --json
smv snapshot Retail.SemanticModel --out view.html --open system --opener firefox
```

`--open none` leaves display to the agent's host application. The CLI cannot open
an integrated T3/Claude browser pane itself. `--open system` invokes the system
launcher; `--opener` selects one executable and receives the URL as a single
argument, without a shell. A path containing spaces is supported when quoted.
For a persistent preference set `SMV_OPENER=none`, `system`, or an executable.
Explicit `--open none` wins over that environment preference. Custom opener
arguments are not supported; configure the browser separately.

JSON `opening.launched` confirms only that the launcher exited successfully, not
that a browser rendered the page. If launching fails, the generated artifact or
session remains usable and the receipt reports the failure. Browser
acknowledgement still comes from `session status`.

## Know what you are viewing

Each `show --out`, `snapshot`, `shot`, or `session export` writes a sibling
`<artifact>.receipt.json`, also returned by `--json`. It records:

- The exact local source path and content hash.
- Workspace/model IDs and fetch time for downloaded definitions.
- Whether local files are unchanged since the fetch.
- The parsed model hash, renderer hash, and plugin version.
- The diagram scope and artifact SHA-256/size.

Live session status returns `sourceIdentity` alongside the requested revision.
Hashes identify the captured local definition and renderer. They do **not** prove
the remote published model is unchanged now. Fetch again to obtain its current
definition. Local edits produce a changed content hash and
`unchangedSinceFetch:false`; the original fetch identity remains visible.

The viewer and HTML artifacts retain full model metadata/DAX behind the focused
diagram. Receipts contain provenance, not credentials or evaluated model data.
Inspect metadata before sharing an artifact. The source `.smv-source.json` record
is excluded from the content hash to avoid a self-referential checksum.

## Validation scope

Automated tests use synthetic Fabric responses, including pagination, long-running
operations, access denial, throttling, unsafe URLs/paths, interrupted downloads,
credential redaction, and an end-to-end download-to-diagram command. They do not
establish live access to a tenant or every semantic model type. A signed-in
Microsoft account with suitable model permissions is required for that final
live-tenant acceptance check.
