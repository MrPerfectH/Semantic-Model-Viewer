# MCP inputs, presentation and source identity

`smv_open` reads one explicit local TMDL/BIM source. A minimal request is:

```json
{"model":"PMRA_POC.SemanticModel"}
```

An empty `view: {}` also selects the default version 2 table graph. The tool's
input schema documents versions, modes, qualified object references and dependency
context. For example, a measure view is:

```json
{
  "model":"PMRA_POC.SemanticModel",
  "view":{
    "version":2,
    "mode":"measures",
    "focus":{"kind":"measure","table":"Measures","name":"Total Sales"},
    "context":{"direction":"up","depth":1,"limit":25}
  }
}
```

Use `smv_inspect` to find actual names; the example is not a promise that a model
has those objects. Missing references and unsupported versions remain errors.

## Inline chat, browser and file artifacts

`inline.available` is retained for compatibility and means the host advertised
MCP Apps. `inline.advertised` makes that meaning explicit. Neither proves the
host displayed an inline view. `inline.status: "advertised-unconfirmed"` is the
initial state. A successful app sync changes it to `"viewer-acknowledged"` and
records the acknowledgement time; that proves initialization, not user visibility.
The adapter does not force a host to render a card.

The agent should try the host's real app once if appropriate, then clearly explain
when it cannot provide inline chat. Reuse the same session's browser URL or export
instead of opening repeated sessions. Browser panes and artifact side panels are
useful fallbacks, but are distinct from inline chat.

`presentation.preferred` is a routing hint based on advertised and observed
capabilities, not a command to ignore a working browser. `live.reachability` starts
as `"not-observed-by-server"`. It becomes `"viewer-acknowledged"` after a fresh
HTTP browser acknowledgement. Read `smv_status` after the viewer has loaded to
refresh this evidence. A missing acknowledgement is not a failed reachability
probe. Embedded app receipts are tracked separately from HTTP browser receipts.

HTML exports can be megabytes because they contain the actual viewer and full
parsed metadata. `smv_export` returns a small `artifact` receipt with the path,
MIME type, byte count and SHA-256, not the raw HTML body. Use the host's native
file attachment/download mechanism or an allowed local file link. These receipts
do not waive a host rule requiring file inspection before publication. If the
host's limits prevent publication, say so; keep the file/browser fallback and
do not claim that anything was published inline.

## Source provenance and freshness

Open, inspect and status responses identify `provenance.path`, the canonical
local path, `modelName`, `contentHash` and `capturedAt`. `kind` is `"local-files"`
and `publishedModelChecked` is false. The plugin does not inspect the deployed
Power BI service model or run data queries. Display the source path when explaining
which model the viewer represents.

Backup-looking path components produce a `BACKUP_PATH` warning. Explicit backup
paths remain supported, but must not be selected silently as the current model.
Confirm the intended source if both current and backup copies are present.

MCP sessions capture the local files at open time. `smv_status` reports
`provenance.filesChangedSinceOpen`; reopen when it is true. Export and update
operations reject a stale source. Watching and published-service refresh are
not implicitly enabled.

## Output locations and session cleanup

`smv_sessions` returns the active sessions owned by this MCP connection, the
resolved `scope.root` (`SMV_ROOT`) and `scope.defaultExportDirectory`. Its entries
include session IDs and source provenance, so an agent can reuse a matching
session or stop an extra one with `smv_stop`.

Omit `out` on `smv_export` for a unique `.html` file under `.smv-artifacts` inside
that root; use `format: "png"` for an image instead. The default directory gets
its own `*` ignore rule, including the ignore file itself, so exports do not appear
as untracked Git files. The project root's `.gitignore` is unchanged. The default
directory cannot be a symlink and a custom existing ignore rule is not overwritten.
Explicit output paths still work inside `SMV_ROOT`, with an existing parent
directory. Exports never replace an existing file.

Export files persist after stopping sessions and are not automatically uploaded.
Keep only the live sessions the user is exploring. Closing the MCP connection
also stops its sessions. Sessions from a different connection are not addressable.
