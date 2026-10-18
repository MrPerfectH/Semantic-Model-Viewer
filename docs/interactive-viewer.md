# Interactive viewer controlled by agents

The CLI and MCP tools prepare the actual Semantic Model Viewer. Agents choose real objects and supply a versioned specification. Tables, measure dependencies, formulas, navigation and rendering come from the shipped app. No answer-specific HTML, SVG or JavaScript is required.

## Install and start

Node.js 22 or newer is required. From a checkout, run `npm ci`, then use `node bin/smv.cjs`. An installed package provides `smv`. Snapshot/HTML export uses no browser; PNG capture requires Chrome/Chromium. `SMV_BROWSER` selects its executable.

```sh
smv inspect 'Models/demo/Contoso Retail.SemanticModel'
smv serve 'Models/demo/Contoso Retail.SemanticModel' \
  --view examples/explanations/interactive-tables.json \
  --background --session /tmp/smv-session.json --json
```

Open the returned URL in a browser on the CLI machine. In T3, use its native browser preview with that URL. `smv open` additionally launches the machine's browser; `serve` lets a harness decide where to open it. The session is loopback-only and requires its token. A cloud-hosted browser may not reach a local machine's URL: export a file instead. Do not publicly expose the model just to embed it.

The view has native relationship selection, readable columns, attention highlights, annotations, Hide/Show annotations and Reset explanation. Panning and expanding keep annotations attached. Hidden/offscreen objects are reported with a Reveal action. Hidden targets are not redirected to similarly named objects.

## One prepared view per question

The supported starting point is the shipped viewer in a browser, with a JSON specification selecting the content. No agent-created HTML wrapper, tabs, injected CSS or iframe bridge is needed. When two perspectives help, open two independent viewer URLs or exports using the harness's ordinary browser tabs.

For Contoso Sales YoY, these specifications are included in the installed package:

```sh
smv serve 'Models/demo/Contoso Retail.SemanticModel' \
  --view examples/explanations/sales-yoy-calculation.json \
  --background --session /tmp/smv-yoy-calculation.json --json
smv serve 'Models/demo/Contoso Retail.SemanticModel' \
  --view examples/explanations/sales-yoy-relationships.json \
  --background --session /tmp/smv-yoy-relationships.json --json
```

From a checkout, replace `smv` with `node bin/smv.cjs`. Resolve the model and example paths relative to the checkout or installed package; they are not relative to an arbitrary working directory. Open each returned URL with the harness's native browser tool. The calculation view shows Sales YoY, Sales LY, Total Sales and Sales YoY %, with actual DAX and selectable dependencies. The relationship view expands both endpoint cards and fits the available canvas. It keeps cards readable rather than forcing name strips. Use DAX, Dependencies or Split view to choose the measure workspace layout.

Prepared views reserve space for their controls. Browse measures opens the library and overview; Close measures, the library's Close button, or Escape returns to the prior analysis. Selecting a result analyzes it and closes the library. Short formula cards use their content height. Views without explicit highlights, callouts or proposals omit annotation controls and rings; focus and dependency context alone do not add annotations.

To share a portable view instead of a live URL:

```sh
smv session export /tmp/smv-yoy-calculation.json \
  --basis authored --revision 1 --out /tmp/sales-yoy.html --json
```

The exported HTML contains the actual viewer and model metadata. Open that file directly in a browser. Inline chat display depends on the host's HTML/MCP Apps support; opening a browser is the baseline workflow. A static image is a fallback, not an interactive view. Stop a live session when it is no longer needed; keep it running while the user explores it.

## View specification

Versions 1 and 2 are accepted. Version 2 adds explored-state capture and supports widths down to 320 pixels. Existing version 1 files remain valid. Unsupported versions fail explicitly.

```json
{
  "version": 2,
  "mode": "measures",
  "focus": {"kind": "measure", "table": "Measures", "name": "Sales LY"},
  "context": {"direction": "up", "depth": 1, "limit": 25},
  "highlights": [{"kind": "measure", "table": "Measures", "name": "Total Sales"}],
  "callouts": [{
    "object": {"kind": "measure", "table": "Measures", "name": "Sales LY"},
    "text": "Inspect the date context and the underlying Total Sales formula."
  }],
  "chrome": false
}
```

The graph uses the real dependency expansion controls; bounded context specifies the initial neighborhood. Hidden branches remain indicated by the viewer. Table focus may select a table, column or named relationship. Multiple same-named measures are rejected by the current viewer input contract rather than opening an ambiguous measure.

For a set of measures, use the library filters and an unselected Measures snapshot rather than choosing one measure as the whole answer. `examples/explanations/date-dependent-measures.json` opens all seven Contoso formulas containing `Date[Date]`. Each result shows its DAX and opens the native measure workspace when selected. Browse measures returns to this filtered overview at every viewport width; changing the library filters also refreshes the overview. This text filter is a formula search, not a complete transitive dependency query. `annotationsVisible: false` initially hides explanation text, highlights and hidden-target reminders.

Attention is purple, proposals are amber and explicitly labelled. Selection is not a diagnosis. Native active/inactive relationship details remain available. A focused table list limits the opening canvas, not the metadata included in the artifact. The library and source metadata remain available for exploration.

## Update and read selection

```sh
smv session status /tmp/smv-session.json --json
smv session update /tmp/smv-session.json --revision 1 \
  --view examples/explanations/interactive-measure.json --json
smv session selection /tmp/smv-session.json --json
```

An update returns `awaiting-viewer` with a requested revision. It is not proof the browser applied it. Status lists fresh clients and their acknowledged revisions. While the user is exploring, the viewer offers Apply or Keep exploring. Reset returns to the authored starting state. Updates require the current revision and validate atomically before replacing the requested view.

Selection returns the qualified object, workspace, source/view revisions and selection time; the authored focus is separate. With several open tabs, pass `--client <clientId>`. A missing, old or unacknowledged browser fails clearly instead of inventing a selection. The CLI cannot detect a harness-level human/agent tab ownership state; harness adapters must respect that host's ownership rules.

Source watching checks for metadata changes. A source revision change requires reopening the view; the UI reports the mismatch. Missing references stay errors. Views never edit the TMDL/BIM source. Source changes during update/export are rejected.

## Capture and portable output

```sh
smv session export /tmp/smv-session.json --basis authored --revision 2 --out /tmp/authored.html --json
smv session export /tmp/smv-session.json --basis current --revision 2 --out /tmp/explored.png --json
smv explain build examples/explanations/interactive-walkthrough.json --out /tmp/explanation --json
smv session stop /tmp/smv-session.json --json
```

`authored` exports the requested starting view. `current` requires a fresh viewer acknowledgement and exports its selection, visible tables, viewport, table display/expansion, measure workspace and annotation visibility. Current-state export supports Tables and Measures; other workspaces can use authored-state export. Exports re-render the acknowledged state at its recorded viewport rather than taking control of the user's tab. Concurrent source/requested revision changes cause an error. The returned receipt identifies the captured basis and revisions.

`interactive.html` in a walkthrough is one actual viewer with Previous/Next and Reset. It works offline using the supplied model metadata. PNG/Markdown and the earlier static HTML summary remain available. The manifest and source specification make the artifact reproducible. Artifacts include full metadata, including formulas; they are not filtered data extracts.

Numeric evidence is optional. The same walkthrough can attach existing typed datasets/calculations in a collapsible evidence panel. Labels and source/scope details distinguish illustrative, imported and externally supplied results. Selecting a relationship never recalculates those results. The CLI does not execute DAX, M or SQL, and the core example requires no numbers.

## MCP setup

The MCP adapter calls the same parser, view contract, session controller and capture/export services. It does not introduce another renderer. Configure a local stdio MCP server in a compatible harness:

```json
{
  "mcpServers": {
    "semantic-model-viewer": {
      "command": "node",
      "args": ["/absolute/path/to/checkout/bin/smv.cjs", "mcp"],
      "env": {"SMV_ROOT": "/absolute/path/to/your/project"}
    }
  }
}
```

Use the harness's supported configuration location; the outer format can differ. `SMV_ROOT` scopes model input and export output paths (default: server working directory). Exports require an existing parent directory inside that root. Symlinks are resolved before checking. Only sessions owned by this MCP connection are addressable. Closing the MCP connection stops its sessions; CLI background sessions have their own explicit lifecycle.

Tools: `smv_inspect`, `smv_open`, `smv_status`, `smv_update`, `smv_selection`, `smv_export`, `smv_stop`. Export returns PNG image content when applicable. Files remain local unless explicitly shared through the harness.

## Inline MCP Apps

A host must advertise the `io.modelcontextprotocol/ui` extension and `text/html;profile=mcp-app` MIME type. Ordinary MCP tool support is insufficient. `smv_open` reports support and supplies the model to the UI through tool-result metadata. The `ui://smv/viewer.html` resource loads the actual viewer and the bundled official MCP Apps bridge.

Embedded state synchronizes through the host's app-only `smv_app_sync` tool. It does not fetch a localhost URL from the sandbox. Expand workspace requests fullscreen where the host offers it. Save offline view packages the retained real model and explanation through the host download API, including when the live session is no longer available. If that host blocks downloads or fullscreen, the UI gives an explicit export/open-browser fallback. Disconnected state preserves local exploration and tells the user how to recover. Host light/dark preferences set shared viewer color tokens; they do not select the Classic/Spellbook appearance.

An explicit Use selection in conversation action sends qualified selection context through the bridge. It does not trigger a new agent action on every click. A message view is a live session while its MCP connection exists; save an export for a durable historical view. Opening a different session requires a separate view so existing exploration is not silently replaced.

Tested bridge libraries are pinned in the root lockfile. Source references: [MCP Apps](https://apps.extensions.modelcontextprotocol.io/) and [TypeScript MCP stdio](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio). Rebuild the bundled app bridge with `npm run build:mcp-app`; `npm pack` also rebuilds it. CLI commands load no MCP SDK unless `smv mcp` is invoked.

## Presentation compatibility

| Environment | Supported path | Verification |
| --- | --- | --- |
| Shell-capable agent with Node/model access | CLI → browser, HTML artifact or PNG | CLI and browser integration tests |
| T3 native preview | Real local viewer in browser pane | Exercised in this development environment |
| MCP host without Apps | Tools plus URL/export/image fallback | Official SDK client integration tests |
| MCP Apps host | Actual viewer resource and host bridge | Official AppBridge browser harness; individual vendor hosts require smoke tests |
| Remote browser unable to reach CLI loopback | Exported interactive HTML or PNG | Explicit reachability fallback; no automatic publication |
| Inline UI unsupported or blocked | PNG plus open-view/offline artifact link | Portable artifact path; host must support the chosen attachment type |

Generated views include an **About this view** disclosure: model content comes from parsed metadata; focus, highlights, annotations and step captions come from the authored specification. The specification itself is inspectable. The CLI packages these instructions with the real viewer and does not execute DAX, SQL or M.

No claim is made that every harness embeds interactive HTML or that T3's custom HTML renderer proves MCP Apps compatibility. Prefer a persistent browser pane for exploration and a focused inline view only when the host supports it. The shipped skill documents that choice. Additional vendor-native installation/host verification is a release limitation to report, not a reason to recreate the viewer by hand.
