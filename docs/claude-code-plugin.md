# Claude Code plugin

The `semantic-model-viewer` plugin packages the existing Semantic Model Viewer CLI,
MCP server and model explanation skill. It uses the same parser and viewer as the
standalone app and VS Code extension.

## Install through Claude

Requires Claude Code with plugin support, Node.js 22+, npm and Git on the machine
running Claude. Node is a runtime prerequisite; users do not need the separate
Viewer desktop app or VS Code extension. Network access to GitHub and the npm
registry is required for installation.

Inside a Claude Code session, add the marketplace once:

```text
/plugin marketplace add MrPerfectH/Semantic-Model-Viewer#claude-marketplace
/plugin install semantic-model-viewer@semantic-model-tools
```

Choose **Install for you** to use the plugin across your projects. Run
`/reload-plugins` if Claude requests it. Once installed, start Claude normally;
no `--plugin-dir` flag, manual ZIP download, repository clone or `npm ci` is needed.
Claude fetches the plugin and installs the exact dependencies from its lockfile.

In a local session in Claude Desktop's **Code** tab, use **+ → Add plugins**
(or **Plugins → Browse plugins**) and install **Semantic Model Viewer** from
**semantic-model-tools** after registering the marketplace. Menu labels depend
on the Claude version. This integration targets Claude Code local sessions;
ordinary Chat and Cowork have different component and local-tool support.

Check `/mcp` for `plugin:semantic-model-viewer:viewer`, then run:

```text
/semantic-model-viewer:open
```

The catalog is published on the dedicated `claude-marketplace` branch, separately
from the app's main release branch. The marketplace name leaves room for a
separate Semantic Model Cleaner entry later; installing Viewer does not install
Cleaner. This is our own marketplace, not an Anthropic directory listing.

Avoid loading a checkout copy with `--plugin-dir` while testing an installed copy
with the same name. Avoid separately configuring the same MCP server unless you
intentionally want independent viewer sessions.

## Develop from a checkout

For plugin development only, install dependencies in the Viewer checkout and load
it from a terminal in your Power BI project:

```sh
npm --prefix /absolute/path/to/Semantic-Model-Viewer ci
cd /absolute/path/to/your-power-bi-project
claude --plugin-dir /absolute/path/to/Semantic-Model-Viewer
```

Paths must be on the same computer where Claude runs. A `/home/...` Linux path
cannot load a plugin in a macOS session under `/Users/...`.

## Commands

```text
/semantic-model-viewer:open Sales.SemanticModel
/semantic-model-viewer:open Sales.SemanticModel focus on Total Sales
/semantic-model-viewer:explain Sales.SemanticModel how does Sales LY depend on dates?
/semantic-model-viewer:snapshot Sales.SemanticModel artifacts/sales.html
```

Paths resolve from your project. Without a model path, the commands discover local
models and ask you to choose when several match. The existing `smv-explain` skill
is also available as `/semantic-model-viewer:smv-explain` and can load automatically for
model explanation requests. The three commands above run only when invoked.

Opening creates a live local viewer and returns a browser link. Follow-up questions
can use its current selection and request a revised focus. Users retain the
viewer's Apply/Keep exploring choice. A terminal session uses a separate browser;
inline rendering is used only if the host advertises MCP Apps support.

Snapshots are standalone HTML files. PNG captures and image walkthroughs additionally
require Chrome/Chromium; use `SMV_BROWSER` to select an executable. Models can be
TMDL `.SemanticModel` folders, their definition folders, or BIM files. PBIX files
and live Power BI connections are unsupported.

## Scope and lifecycle

For minimal tool inputs, inline capability diagnostics, exact source provenance,
gitignored export defaults and session cleanup, see [MCP usage](mcp-usage.md).

The plugin declares its MCP server in the standard root `.mcp.json` file.
The plugin launches `node <plugin-root>/bin/smv.cjs mcp` and sets `SMV_ROOT` to
`${CLAUDE_PROJECT_DIR}`. The MCP server permits model reads and exports only inside
that project, resolving symlinks before checking. Start Claude Code in a common
parent project if the relevant models live in several subfolders. The plugin
installation itself can be elsewhere. Generated files belong in your project.

The tools inspect metadata, open/update views, read selection, export and stop
sessions. They do not edit model sources or execute DAX, SQL or M. The MCP process
stops its sessions when disconnected; temporary CLI sessions require explicit
`smv session stop`. Local URLs require a browser that can reach the same machine.
Use offline output when a remote browser cannot reach loopback.

Model parsing and viewer hosting run locally. Metadata returned to Claude enters
the conversation and follows your configured provider's data handling. Exported
HTML retains full parsed metadata and formulas, including off-canvas objects and
available Power Query text. Sharing a generated file is a separate user action.

## Update and troubleshoot

Update a marketplace install with `/plugin marketplace update semantic-model-tools`,
then `/plugin update semantic-model-viewer@semantic-model-tools`, and reload when
Claude asks. Custom marketplaces do not necessarily auto-update; enable that in
Claude's marketplace settings if desired. Developers loading a checkout use
`npm ci` after pulling dependency changes.

If commands are missing, inspect `/plugin` for loading errors and confirm that
**Semantic Model Viewer** is installed and enabled. The prefix is
`/semantic-model-viewer:`; `powerbi-authoring` is another plugin. If the MCP server
fails, check Node's version and Claude's dependency-install warning. Installing
again requires access to the npm registry. If a model is outside `SMV_ROOT`,
restart Claude in the intended project root.

See [Interactive viewer](interactive-viewer.md) and [CLI](cli.md) for schemas and
session controls. Metadata is sent to the configured Claude provider when tools
return it, even though parsing and browser hosting run locally.

## Maintainer verification and releases

Run `npm test`, then `npm run test:marketplace`. The latter creates a clean git
marketplace without `node_modules`, installs it using the real Claude CLI in a
fresh temporary `CLAUDE_CONFIG_DIR`, verifies dependency installation and command
discovery, and exercises the cached MCP server, live viewer and HTML export from
a separate project. It never modifies the developer's Claude settings or runs
an LLM request. The test requires the Claude CLI, Git, npm and registry access.

Verify the public source with:

```sh
npm run test:marketplace -- MrPerfectH/Semantic-Model-Viewer#claude-marketplace
```

The dedicated plugin CI runs this installer test on Linux, macOS and Windows.
Bump `.claude-plugin/plugin.json`'s version for every marketplace release; Claude
caches versioned plugins. Publish only reviewed runtime and plugin files to
`claude-marketplace`, preserving `.claude-plugin/marketplace.json`, the plugin
manifest, `package.json` and `package-lock.json` together. Keep dependencies pinned
and registry based so Claude's dependency installer can handle them without
lifecycle scripts. The MCP App bridge is shipped prebuilt.

The automated tests cover installation and tool wiring. Vendor-host inline UI
and model-driven command behavior still need an interactive Claude Code smoke
test; terminal-only hosts can use browser links and exports.

The layout follows the [Claude Code plugin documentation](https://code.claude.com/docs/en/plugins/create),
[marketplace publication guide](https://code.claude.com/docs/en/plugins/publish)
and [automatic dependency installation](https://code.claude.com/docs/en/plugins/loading#nodejs-package-dependencies).
