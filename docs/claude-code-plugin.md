# Claude Code plugin

The `semantic-model-viewer` plugin runs the Semantic Model Viewer CLI through
Claude's shell tools. It includes the viewer runtime and five skills: open,
explain, snapshot, stop and the automatically selected model explanation skill.
Version 0.2.2 is CLI-only: it registers no MCP server and needs no runtime npm
packages. Users do not install the separate Viewer app or VS Code extension.

## Install through Claude

Requires Claude Code with plugin support, Node.js 22+ and Git on the machine
running Claude. Add the marketplace once inside a Claude Code session:

```text
/plugin marketplace add MrPerfectH/Semantic-Model-Viewer#claude-marketplace
/plugin install semantic-model-viewer@semantic-model-tools
```

Choose **Install for you**, and reload if Claude asks. Start Claude normally in
your Power BI project after installation. Users do not need a ZIP, a manual clone,
a `--plugin-dir` flag or an `npm ci` step.

In a local Claude Desktop **Code** session, the plugin browser can install
**Semantic Model Viewer** after the marketplace has been registered. This is our
own `semantic-model-tools` marketplace, not an Anthropic directory listing. The
same catalog can list a separate Semantic Model Cleaner plugin later.

```text
/semantic-model-viewer:open Sales.SemanticModel
/semantic-model-viewer:explain Sales.SemanticModel how does Sales LY use dates?
/semantic-model-viewer:snapshot Sales.SemanticModel
/semantic-model-viewer:stop all
```

The first four skills run when invoked. `/semantic-model-viewer:smv-explain` can
also load automatically for model explanation requests. Claude requests its normal
shell/file permissions when running CLI commands. No MCP connection or tool
configuration is needed.

## CLI workflow

The skills call `node <plugin-root>/bin/smv.cjs` from the user's project. They
use `discover` and `inspect` for local metadata, `serve --background --session`
for browser views, `session` commands for revisions, selection and exports, and
`snapshot` for standalone HTML. See [the exact CLI workflow](cli-plugin-workflow.md).

A small bundled workspace helper creates `.smv-artifacts` in the current project
with its own ignore rule. It returns unique file paths and recorded session
locations. Generated view specifications, session files, logs and snapshots go
there unless the user explicitly chooses another output path. It does not alter
the project root's `.gitignore` or overwrite an existing custom ignore file.

CLI sessions are explicit background processes. Keep and reuse their state-file
paths; they do not depend on a protocol connection and do not stop when chat
closes. Use `/semantic-model-viewer:stop` or `smv session stop <state.json>` when
finished. Offline exports remain usable after stopping the server.

The CLI presents the actual viewer in a reachable browser pane or through a local
URL. Snapshots are standalone HTML files; images and walkthroughs are also
available. Displaying a file in a side panel is distinct from inline chat. The
plugin does not promise an embedded chat view or bypass host publication rules.
PNG capture needs Chrome/Chromium; HTML export needs no browser automation.

## Source identity

Models are TMDL `.SemanticModel` folders, their definition folders, or BIM files.
PBIX files and live Power BI service connections are unsupported. The commands
identify the selected local source and ask before relying on backup-looking
folders. The viewer represents parsed metadata, not a deployed service model or
executed DAX, SQL or M. Source changes are checked during session updates/exports;
`--watch` is an explicit option for local source watching.

Paths resolve from the current project. CLI file access uses ordinary filesystem
permissions and the user's authorized paths. The plugin contains no `SMV_ROOT`
server boundary. Show the canonical source reported by discovery/session status.
Models and exports stay local until the user shares them, while metadata returned
to Claude follows the configured provider's data handling. HTML retains full
parsed metadata and formulas even when the starting view is focused.

## Update from earlier versions

Run in a terminal:

```sh
claude plugin marketplace update semantic-model-tools
claude plugin update semantic-model-viewer@semantic-model-tools
```

Restart Claude Code to unload the older server and load the CLI-only skills.
Viewer should no longer appear as a plugin MCP server. If a copy was manually
configured separately, inspect `/mcp` and remove that specific Viewer entry from
its original configuration; the plugin update does not edit unrelated settings.
Old MCP session IDs are not CLI state-file paths. The new stop skill handles the
CLI records it creates, not arbitrary processes or historical protocol sessions.

If commands are missing, check `/plugin` for the installed version and loading
errors. Avoid loading an older checkout with `--plugin-dir` at the same time.
If a shell command cannot find Node, install Node.js 22+ on that machine. If the
browser cannot reach the local URL, export an offline file rather than exposing
the model publicly. Paths on another computer cannot be used locally.

## Develop and verify

Developers can load the checkout directly with `claude --plugin-dir <checkout>`.
Running the plugin's CLI needs no npm install. Repository development and legacy
adapter tests have dev dependencies; use `npm ci` to run the full test suite.

`npm run test:plugin` tests the Viewer CLI from a separate project, using an
isolated runtime with no `node_modules` or adapter directory. It covers discovery,
inspection, live browser access, revision updates, current selection, exports and
explicit session cleanup. It also checks that the plugin has no MCP registration
or runtime dependencies.

`npm run test:marketplace` invokes the actual Claude installer with a fresh
`CLAUDE_CONFIG_DIR`, checks five skills and zero MCP servers, and repeats the
CLI integration tests. It does not modify the developer's Claude settings or
make an LLM request. To verify the published source:

```sh
npm run test:marketplace -- MrPerfectH/Semantic-Model-Viewer#claude-marketplace
```

`npm run build:plugin -- --out <new-directory>` creates a self-contained plugin
payload from the package's file list. It omits the repository's adapter code,
development dependencies and marketplace catalog, and writes a dependency-free
package manifest. The catalog installs `plugins/semantic-model-viewer` from the
dedicated `claude-marketplace` branch, so Claude does not install the repository's
development packages alongside the plugin.

CI runs the checks on Linux, macOS and Windows. Publish the source changes and a
freshly built `plugins/semantic-model-viewer` payload together, with a new plugin
manifest version. Build releases from a clean checkout so unrelated work is not
included in viewer assets. Shell-command behavior in an interactive Claude
session still needs a user smoke test.
