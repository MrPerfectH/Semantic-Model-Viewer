# CLI plugin workflow

Every operation is an ordinary command executed through the host's shell tool.
In the installed Claude plugin, replace `smv` below with:

```sh
node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"
```

The host substitutes `${CLAUDE_PLUGIN_ROOT}` when it loads the skill. Run from the
user's project and quote all source, state, view and output paths as individual
arguments. Model names and paths are data, not shell syntax.

## Prepare paths and find a model

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs"
smv --where
smv discover .
smv inspect 'Sales.SemanticModel'
```

The workspace helper returns `cliPath` (the resolved executable), `projectRoot`, `artifactsDir`, `newSessionFile`,
`newViewFile`, `newExportFile` and recorded `sessions`. It creates a self-ignored
`.smv-artifacts` directory, leaving the project's root ignore file unchanged.
The returned paths are unique; use them rather than a fixed root-level test file.
The helper lists session records without assuming their servers are alive.

Discovery returns canonical local model paths. Show the selected path; do not
silently choose a backup, a demo, or the first of several matching models. Inspect
metadata before choosing table, measure or query identifiers. These are local
files, not the published Power BI service model. No data queries are executed.

## Focused model queries

```sh
smv inspect 'Sales.SemanticModel' --table 'IFLO'
smv filters-by 'Sales.SemanticModel' 'IFLO'
smv filters-by 'IFLO' --model 'Sales.SemanticModel' --direction both
```

Focused inspection returns one table (including its columns and home measures),
incident relationships, and `measuresUsingTable` with qualified identities, DAX,
and a `direct` flag. It includes downstream measure dependencies, excludes measures
that merely live in the table, and does not simulate filter propagation or queries.
Omitting `--table` preserves full-model inspection.

`filters-by` defaults to outgoing, active filter reachability, including transitive
paths. Use `--direct` for one hop or `--include-inactive` to explore inactive edges
as a hypothetical graph. Each table includes distance and one shortest path with
relationship evidence, filter direction, cardinalities and `manyToMany` flags.
All incident edges are also returned, so parallel relationships remain visible.
Unknown/automatic direction is reported as unresolved, never assumed to propagate.
`--direction both` returns the union of incoming and outgoing filter paths. It
does not follow an undirected route through a parent into unrelated sibling tables.
Incoming paths are traversed in reverse order to actual filter propagation.
DAX, ambiguity resolution and RLS can change evaluation behavior.

## Browser layout defaults

Authored table sets open in a compact star layout around their selected focus,
with the fit calculated after the inspector is visible. Clicked tables explore
active filter paths in **both directions**, direct and indirect, by default.
This changes exploration, not model relationship metadata. The inspector can
still select incoming, outgoing, all connected, inactive edges or shorter paths.
Saved layouts and explicitly saved exploration settings are preserved.

## Start and reuse a live view

```sh
smv serve 'Sales.SemanticModel' --background --session '<newSessionFile>' --json
```

Omitting `--view` opens the default version 2 graph. A supplied view JSON must
include `version`; an empty JSON object is not a CLI view specification. For
example, write the following to the helper's `newViewFile` path and add
`--view '<newViewFile>'` when starting:

```json
{"version":2,"mode":"graph","tables":["Sales","Date"]}
```

A measure view uses its actual inspected home table and name:

```json
{
  "version":2,
  "mode":"measures",
  "focus":{"kind":"measure","table":"Measures","name":"Total Sales"},
  "context":{"direction":"up","depth":1,"limit":25}
}
```

Measures mode also accepts a table or column focus and opens its dependency view:

```json
{"version":2,"mode":"measures","focus":{"kind":"table","name":"Sales"},"banner":false}
```

Plain live views hide the explanation banner. Views with highlights, callouts or
proposals show it by default; `banner: true|false` overrides that default.
`chrome: false` separately hides the app's navigation panels. Pending Apply controls
and connection errors remain visible even when the explanation banner is hidden.

The start response includes the source path, session URL, source revision and
requested view revision. Use the local URL in a browser that can reach the CLI
machine. `smv open <model> --session <state.json>` also launches the machine's
browser; `serve` lets the host choose its browser pane. No protocol or inline app
resource is involved. Do not equate a browser/file pane with inline chat.

Read `session status` for an existing record before opening a duplicate. Source
files are snapshotted at open time; use explicit `--watch` for local file watching
and reload the browser when the source changes.

## Update and read selection

```sh
smv session status '<state.json>' --json
smv session update '<state.json>' --revision 1 --view '<next-view.json>' --wait 5 --json
smv session selection '<state.json>' --json
```

Use the current requested revision from status, not the example number. Write an
update to a new file rather than editing the original source view file behind a
running session. `awaiting-viewer` means the update was requested, not applied.
Status includes `application.state`, `application.browserAcknowledged` and a
plain-language `application.message`. `session update --wait 5` polls for up to
five seconds and returns `confirmed: true` only after fresh browser receipts at
the requested source/view revision. `--client` selects whose acknowledgement to
wait for; it does not limit which tabs receive the update. A timeout returns
`confirmed: false`, `timedOut: true`; the update remains accepted.

A background or closed pane can stop sending receipts. Stale clients remain in
status with `fresh: false`, `lastAcknowledgedRevision` and `lastSeenAt`; their
current display is **unconfirmed**. Fetching HTML alone never acknowledges a view.
Run any subcommand with `--help` for its exact options and examples.
`waiting-for-apply` means **waiting for Apply click in the viewer**. When the user
explicitly wants agent-driven control, `session update ... --apply` lets the viewer
apply that revision even during exploration. It still returns `awaiting-viewer`
until a browser acknowledges it; it does not bypass source/revision checks or open
a browser. Without `--apply`, respect Apply/Keep exploring. A selection needs a fresh browser acknowledgement;
with several tabs, pass `--client <clientId>`. The host must respect human-owned
tabs; the CLI cannot detect the host's browser ownership state.

## Export and stop

```sh
smv snapshot 'Sales.SemanticModel' --out '<newExportFile>'
smv session export '<state.json>' --basis authored --revision 2 --out '<view.html>' --json
smv session export '<state.json>' --basis current --revision 2 --out '<explored.html>' --json
smv session stop '<state.json>' --json
```

A normal snapshot needs no live server. Current-state export requires a fresh
acknowledgement and currently supports Tables and Measures. The output file is a
portable full-metadata viewer, not a filtered data extract. HTML export uses no
browser automation or runtime npm packages. PNG export and `shot` require
Chrome/Chromium; `SMV_BROWSER` selects its executable.

For a quick preview, prefer `snapshot`: it keeps working after the browser pane
or conversation closes. For live exploration, also export the authored HTML as
a fallback and give both the browser URL and file link. Any browser that can
reach the local server works; a particular host Browser pane is not required.

Use a host-native file attachment or link. Do not paste megabytes of HTML into
the conversation or bypass file-inspection/publication rules. If a host cannot
publish the file, state that limit and offer an allowed local artifact or browser
link. Creating the file does not upload it.

CLI background sessions outlive a conversation. Stop temporary sessions explicitly;
`/semantic-model-viewer:stop` lists the helper's recorded files and uses these same
CLI controls. State files are removed when their server stops; exported HTML and
ignored log files remain. Report stale records instead of deleting them blindly
or killing unrelated processes.
