# CLI plugin workflow (0.3)

Requires Node.js 22+. The plugin is CLI-only, with no runtime npm dependencies or
MCP server. Model inputs are a local TMDL `.SemanticModel` folder, its `definition`
folder, or a BIM file. Commands never modify model files or execute DAX, M or SQL.

## One-time terminal setup

Invoke `/semantic-model-viewer:setup` inside Claude. It runs:

```sh
node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs" install
```

The stable `smv` launcher normally lives in `~/.local/bin` (Windows:
`%LOCALAPPDATA%/SemanticModelViewer/bin`). It reads Claude's installed-plugin
registry every time, so plugin cache version changes require no launcher update.
The installer reports whether that directory is on PATH. `--bin-dir` can select
an existing user PATH directory. Shell startup files are not modified and unrelated
commands are never replaced. `smv --where` reports the selected runtime for diagnosis.
Agents can always run the bundled CLI using the host-provided plugin root above;
they never need to guess a cache path or run `--where` before each operation.

## Common task: one command

```sh
smv show 'Sales.SemanticModel' --table 'Cost Center' --related --dependents
```

The JSON response contains compact counts, `sessionFile`, a combined `workspaceUrl`
and individual view URLs. Tables and Measures run side by side in ONE server.
The workspace offers a Tabs mode for more space, and selectors for each pane.
Each view retains its own selection, camera, revision and browser receipts.
Repeat the same request to reuse the session and views. A different table adds
named views without replacing the previous ones. With neither `--related` nor
`--dependents`, both are shown; with one flag, only that view is created.

`--direct` limits relationship neighbors to one hop. `--include-inactive` includes
hypothetical paths through inactive relationships. Default exploration combines
active incoming and outgoing filter paths, excluding unrelated siblings reached
only by changing direction midway through an undirected walk. Actual model filter
directions are unchanged. DAX can change filter behavior during evaluation.

## Short answers first

```sh
smv relations 'Sales.SemanticModel' --table 'Cost Center'
smv dependents 'Sales.SemanticModel' --table 'Cost Center'
smv dependents 'Cost Center' --model 'Sales.SemanticModel' --details
```

`relations` returns table names, distances and counts for direct/indirect related
tables, incident relationships, many-to-many edges, inactive edges and unresolved
direction. `--direction incoming|outgoing|both` selects the traversal (default both).
`dependents` returns qualified measure names, direct flags and direct/indirect
counts. It follows static DAX table/column references and downstream measure chains;
merely storing a measure in the table does not imply use. `--details` adds path
and relationship evidence or DAX. These are metadata summaries, not executed results.
A lone table argument auto-discovers only when the current folder contains exactly
one non-backup model; otherwise supply its path explicitly.

For a broad inventory, `inspect <model>` remains available. `inspect <model>
--table <name>` returns that table, its relationships and measure-user formulas.
`filters-by` preserves its previous outgoing default and detailed path output.
No full inspection or jq preprocessing is needed before `show` or the short queries.

## One consistent view contract: version 2

```json
{
  "version": 2,
  "mode": "graph",
  "tables": {"relatedTo": "Cost Center", "depth": 1},
  "focus": {"kind": "table", "name": "Cost Center"},
  "arrange": true,
  "banner": false
}
```

`tables` accepts an array or exactly one relative selector:

| Selector | Result, including the root |
|---|---|
| `relatedTo` | Tables filtering the root or filtered by it |
| `filteredBy` | Tables filtered by the root |
| `filters` | Tables filtering the root |

`depth` is optional (default direct + indirect; 1 is direct). `includeInactive`
defaults false. Relative root names resolve case-insensitively; invalid or ambiguous
selectors fail explicitly. The same resolver is used by live views, snapshots,
walkthroughs and PNG captures. Watched sessions reevaluate relative sets when the
model changes.

New graph table sets arrange compactly by default. `arrange:false` disables automatic
arrangement; `arrange:true` explicitly rearranges even restored positions. Capturing
explored state sets arrange false so saved cameras and positions survive restoration.
`banner:false` hides explanation controls while keeping pending Apply and connection
errors available. `chrome:false` separately hides app navigation panels.

Measures accepts a table, column or measure focus. A version 2 Measures view without
focus opens its overview. For example:

```json
{"version":2,"mode":"measures","focus":{"kind":"table","name":"Cost Center"},"banner":false}
```

Legacy version 1 views remain readable, but new views use version 2. The explanation
walkthrough ENVELOPE and imported result-data formats remain version 1; embedded
`view` objects inside walkthroughs use version 2. These are different contracts.

## Portable preview and visual verification

```sh
smv snapshot 'Sales.SemanticModel' --view view.json --out model.html
smv shot 'Sales.SemanticModel' --view view.json --out check.png --json
```

Snapshots need no server or browser automation and remain interactive after chat
closes. PNG capture needs Chrome/Chromium (`SMV_BROWSER` selects its executable).
Both accept version 2 relative selectors, arrange and banner controls. HTML files
retain the whole parsed model, DAX and available Power Query metadata even when
focused; they are not filtered data extracts. Creating a file does not upload it.
Respect host file-publication rules; don't paste megabytes of HTML into chat.

## Managed sessions and named views

```sh
smv serve 'Sales.SemanticModel' --background --json
smv session list
smv session views '<state.json>'
smv session add-view '<state.json>' --name 'Dates' --view date-view.json
smv session status '<state.json>' --view-id '<id>' --json
smv session update '<state.json>' --view-id '<id>' --view next-view.json --revision 1 --wait 5 --json
smv session selection '<state.json>' --view-id '<id>' --json
smv session export '<state.json>' --view-id '<id>' --basis authored --revision 2 --out view.html --json
smv session stop '<state.json>' --json
smv session stop --all --model 'Sales.SemanticModel'
```

Without an explicit state file, `serve`, `open` and `show` reuse a compatible managed
session for the same canonical model, report and watch settings. State is kept in
`~/.local/state/semantic-model-viewer`; `SMV_STATE_DIR` selects another managed registry.
`--new-session` starts a separate runtime. A mismatched plugin version is reported
as a warning; no existing user exploration is terminated to upgrade it. Explicit
session files retain their existing compatibility checks. Old unregistered 0.2.x
sessions can still be addressed explicitly; `show` requires the new named-view protocol.

`session list` includes running/stale records and versions. `session stop --all`
stops only identity-checked SMV-managed servers in this registry, optionally restricted
to a model. It never kills arbitrary PIDs or stops unrelated applications. Stale
records are reported, not blindly acted on. Background servers outlive conversations.

`--view-id` selects an independent named view for status, updates, selection and exports;
omit it for the default view. `session views` prints per-view URLs and a workspace URL.
At most 32 named views are kept in one server; start a new session for more.

## What was computed versus actually displayed

Root status includes `workspaceApplication` with the number of named views, acknowledged views and fresh clients; the default view's own clients can be empty while named views are active. Use `--view-id` for a pane.

Status includes `authoredSummary` and each named view's `summary`: counts computed
from the current local model and authored view. These exist before any browser opens.
`application.browserAcknowledged` becomes true only after fresh matching browser
receipts. Each client's `appliedSummary` describes its validated reported current
view; `renderedSummary` reports its actual table-canvas and measure-graph node counts.
A successful HTTP fetch, an export or a metadata count is not a rendered acknowledgement.

`session update --wait 5` waits up to five seconds for browser application. It returns
`confirmed:true` only after receipts at the requested source/view revision. Timeout
returns `confirmed:false,timedOut:true`; the update remains accepted. `--client`
selects whose acknowledgement to wait for, not which tabs receive the update.
Without it, all fresh clients of that named view must acknowledge.

Normal updates respect human exploration. `waiting-for-apply` means waiting for the
Apply click. Use `--apply` only when explicitly taking over the view. Stale/background
clients stay visible with `fresh:false`, last revision and last-seen time; their
current display is unconfirmed. Source changes require reload. `--watch` watches
local source files explicitly; it does not contact the published Power BI service.

Any reachable browser works; a particular host Browser pane is not required. Give
an authored offline HTML export as fallback when a live pane closes. Use the bundled
project helper for unique self-ignored artifact paths if needed:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs"`.

Every subcommand supports `--help` and errors include command-specific usage guidance.


## Answer modeling questions with a diagram

The agent should lead with a diagram and a short explanation, rather than a metadata dump.

```sh
smv show Retail.SemanticModel --table Date --with Sales
smv show Retail.SemanticModel --table Sales --related --direction incoming
smv show Retail.SemanticModel --table Date --related --direction outgoing
smv show Retail.SemanticModel --table Sales --dependents
smv show Retail.SemanticModel --table Date --with Sales --out date-sales.html
smv show Retail.SemanticModel --table Sales --dependents --out calculations.png
```

`--with` shows the two endpoints and one shortest connecting path, including intermediate tables when necessary. It reports disconnected endpoints honestly, and distinguishes a physical connection from a directed filter path. Parallel relationships between visible tables remain available in the viewer, including inactive edges. `--include-inactive` permits potential paths through inactive edges; it does not activate them in Power BI. `--direct` restricts the search to one hop. The diagram inspector receives the same direction, depth and inactive settings used to build the answer. Live view identities distinguish different questions about the same table.

`--out` produces one diagram without starting a session: HTML is interactive, PNG is an image requiring Chrome/Chromium. With no view selector, portable output defaults to the relationship diagram. Choose one view instead of combining `--related --dependents` with `--out`. The JSON receipt identifies the question, answer, diagram counts, file size and content scope. HTML contains full-model metadata/DAX behind the focused starting view. `snapshot --json` also returns a content/size receipt.

Compact `relations` reports `filtersRoot` and `filteredByRoot` for each neighbour. `incoming` means tables that filter the root; `outgoing` means tables filtered by it. `counts.relationships`, `inactive` and `manyToMany` describe all incident edges, independently of traversal options. `countScope` documents that scope; `traversed` counts the union of one shortest path per result, which may omit parallel/alternative edges. `specialRelationships` names inactive incident relationships and bidirectional edges incident to the root or used on the selected shortest paths, without requesting full details.

Compact `dependents` returns one shortest `via` chain per indirect measure, ending at a direct reference to the selected table; other chains may exist. `dependents --table Sales --measure "Gross Margin %" --details` returns only that calculation and its DAX. Counts cover all dependents while `returned` counts the selected results. These are static references, not evaluated DAX or relationship propagation.

The Measures view's table/relationship counts describe its background table canvas, not the calculation graph. `dependentMeasures` describes its selected source; `renderedSummary.measureGraphNodes` counts measure nodes and excludes the virtual table/column source card. Zero dependent measures is a valid result; `show` explains why that diagram is nearly empty.


## Workspace downloads, opening preferences and receipts

See [fetching a workspace model](cli-workspace-fetch.md). `smv fetch --workspace <name|UUID> --model <name|UUID>` downloads a definition for offline use. `show --workspace … --model … --table …` combines the fetch and diagram. Use `--open none|system`, `--opener <executable>`, or `SMV_OPENER` to control presentation. Exported diagrams have a sibling provenance receipt with source, renderer and artifact hashes.
