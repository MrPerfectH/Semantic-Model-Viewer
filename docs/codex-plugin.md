# Semantic Model Viewer for Codex

The complete plugin includes the CLI, viewer and a private runtime. Users install the plugin once; agents invoke its packaged launcher directly. A global `smv`, separate Node/npm setup, the Viewer desktop app and an MCP server are not required.

Ask: **“Show Sales, its related tables, and the calculations depending on it.”** The agent uses one `show` command and presents the existing paired Tables/Measures workspace. Relationships, dependency chains, focused metadata queries and portable HTML use the same engine as the Claude plugin and VS Code tools. Model metadata is parsed locally; returned metadata follows the configured agent provider's data handling. No DAX, M or SQL is executed.

This plugin has not been submitted to the public plugin directory. Complete binary packages are release artifacts; the Git source tree alone is not a no-Node installation. Public installation instructions must point to the published complete package rather than asking users to assemble a CLI.

## Install from a stable release

Download `smv-codex-marketplace.zip` from the GitHub release, verify its sibling SHA-256 checksum, and extract it into a permanent user-owned folder. Add the extracted folder with `codex plugin marketplace add <folder>`, then install `semantic-model-viewer@semantic-model-tools` through the plugin UI or `codex plugin add`. The archive already includes the catalog, plugin, CLI and private runtime. No CLI assembly or Node installation is needed. The release also includes a standalone Codex plugin ZIP for compatible plugin-upload interfaces.

## Authoring and local acceptance

`npm run build:portable -- --host codex --targets <targets> --runtime-root <verified-runtimes> --out <new-directory>` generates portable root `plugin.json`, a compatibility `.codex-plugin/plugin.json`, adapted skills and runtime assets. Source-only development packages can be generated with `npm run build:codex-plugin`; they require an explicit developer runtime or direct Node invocation.

Codex skills resolve package paths from their loaded filesystem location, not a Claude environment variable or a guessed cache version. On macOS/Linux they invoke `/bin/sh <plugin-root>/bin/smv`; on Windows x64 they invoke `<plugin-root>/bin/smv.cmd`. The host must provide local filesystem and shell access. Browser-only/cloud clients without that access are not implied to support local execution or localhost URLs.

For a supported local catalog, place the complete package at `plugins/semantic-model-viewer` under a catalog root and write `.agents/plugins/marketplace.json`:

```json
{
  "name": "semantic-model-tools",
  "plugins": [{
    "name": "semantic-model-viewer",
    "source": {"source": "local", "path": "./plugins/semantic-model-viewer"},
    "policy": {"installation": "AVAILABLE", "authentication": "ON_USE"},
    "category": "Productivity"
  }]
}
```

Register the catalog through Codex's plugin UI or `codex plugin marketplace add <catalog-root>`. The native CLI installer accepts `codex plugin add semantic-model-viewer@semantic-model-tools`. These are host/plugin installation commands, not a second CLI installation. `node scripts/test-agent-install.cjs codex <complete-package>` performs this acceptance in an isolated temporary configuration and then cleans up.

PNG, report-usage scanning and Fabric authentication retain their optional dependencies. Local metadata queries and HTML diagrams do not need them. See [bundled delivery, platforms and release boundaries](bundled-agent-delivery.md) and [official Codex packaging](https://developers.openai.com/plugins/build/plugins).
