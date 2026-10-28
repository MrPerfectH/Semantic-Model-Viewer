# Bundled CLI and agent delivery

The existing two-pane diagram experience is preserved. A complete agent package contains the application, its renderer and a private Node runtime; agents call its own launcher. A global `smv` command and the setup skill are optional. Runtime/application selection never probes another installed plugin.

## VS Code and Copilot

The extension contributes discovery, inspection, relationships, dependent calculations, diagram and snapshot tools through VS Code's native language-model tool API. Install the extension, enable its tools in Copilot, then ask for a diagram. No system Node, terminal setup, localhost session or MCP server is required for those editor actions. Existing model commands remain available without Copilot.

Analysis runs in a cancellable worker using VS Code's Node host. Model records are read through `workspace.fs`; their URI identity is retained. A TMDL definition takes precedence over sibling BIM caches, matching the CLI. The tool only selects models discovered in the open trusted workspace. It never silently selects a backup. Two diagram panels appear beside each other. Repeating an unchanged question reveals those panels and preserves exploration. Changed source records replace the frozen snapshot. Status remains `awaiting-viewer` until that revision acknowledges application; this is distinct from computed counts. HTML export asks the user for a destination and includes the full parsed model and formulas.

This is a desktop Node extension. It does not claim browser-only vscode.dev support. Remote model records retain URI identities, but the existing Fabric UI and source-file navigation retain their own remote limitations. These new tools do not establish full remote-extension acceptance.

### Terminal CLI bundled with the VS Code extension

Platform release VSIXs contain the complete CLI and a private Node runtime for macOS x64/arm64, Linux glibc x64/arm64, or Windows x64. VS Code selects the matching Marketplace package. The extension verifies and copies its CLI into user storage, creates an executable launcher, and adds that stable directory to PATH for new integrated terminals through the terminal environment collection. Activation runs after startup; existing terminals may need to be reopened. No global Node, npm, CLI setup or runtime download is required.

For terminals outside VS Code, **Semantic Model Viewer: Install CLI for External Terminals** writes a managed launcher into the user's bin directory. This optional action copies a verified, immutable package into extension global storage. It preserves other smv commands and does not modify shell startup files or system PATH. If the user's bin directory is not on PATH, the command reports that clearly. Once explicitly installed, later extension activations update the launcher; old package generations remain available for sessions. Remote VS Code terminals are outside this local desktop CLI guarantee.

Development builds without `cli/build-info.json` retain native tools but do not advertise a bundled terminal CLI. Release packaging verifies all payload hashes and the VSIX target before packaging.

## Claude Code and Codex

Complete release payloads use `/bin/sh <plugin-root>/bin/smv` (macOS/Linux) or `bin/smv.cmd` (Windows x64). They include unchanged upstream Node binaries and full Node licenses. No first-use download or npm install runs. If an archive extractor strips executable bits, the POSIX launcher verifies the binary checksum and restores execution in its own cache without modifying the installation. `SMV_NODE` is an explicit developer override for source-only builds, never an implicit PATH fallback.

Claude skills use the host-provided plugin root. Codex receives a separate generated package with portable `plugin.json`, a compatibility `.codex-plugin/plugin.json`, and adapted skills that resolve resources relative to their loaded location. [Codex setup and local catalog format](codex-plugin.md) are documented separately from Claude. Neither agent workflow requires PATH setup. Codex's package is not represented as a Claude-only manifest.

Live terminal sessions copy the verified application plus the current platform's runtime into an immutable content-addressed user cache before starting. Upgrading or removing the plugin copy does not remove a running session's assets. Cache generations are retained; stop sessions before manually removing unused generations. Models and generated artifacts are not stored in the plugin package.

PNG capture additionally needs Chromium. Report usage additionally needs Python. Terminal Fabric definition fetching uses an existing Azure CLI login. These optional dependencies do not block local HTML diagrams or metadata queries. Cloud agents need filesystem access to the model and a supported way to present artifacts; a local URL does not imply access from another machine.

## Release assembly

`runtime/node-lock.json` pins official Node 22 archive URLs and SHA-256 values retrieved from Node's HTTPS release checksum manifest. Review/update this lock for security releases; no consumer auto-update is performed. Archive integrity is checked before extraction, then binary and LICENSE hashes are recorded. This is HTTPS plus pinned-hash verification; it is not a claim of independent PGP signature verification or signing by SMV.

Build each target on a compatible release runner:

```sh
node scripts/vendor-node.cjs --target linux-x64 --out dist/runtimes/linux-x64
npm run build:portable -- --host claude --targets linux-x64 --runtime-root dist/runtimes --out dist/claude-linux --zip dist/claude-linux.zip
npm run build:portable -- --host codex --targets linux-x64 --runtime-root dist/runtimes --out dist/codex-linux --zip dist/codex-linux.zip
```

The release workflow assembles a universal package from macOS x64/arm64, Linux glibc x64/arm64 and Windows x64 runtimes. Windows ARM64 and Linux musl/Alpine are not qualified. Binary and archive checksums, engine/renderer file digests, upstream notices and artifact sizes accompany builds. The package build rejects unknown/corrupt runtime inputs; no system protections are disabled. Native platform jobs qualify actual runtime startup; downloaded macOS Gatekeeper and Windows security behavior still need release acceptance on user machines.

Source-only `build:plugin` and Git marketplace payloads do not include runtime binaries and must not be advertised as no-Node installations. Complete archives are published by the stable tag workflow after native runtime, installed-host and no-Node acceptance. Claude supports a checksum-pinned archive source; the release workflow changes the public `claude-marketplace` catalog to the actual immutable release URL only after publishing the archive and downloading it again for a byte comparison. Other catalog entries are preserved. Organization-sync restrictions differ from direct Claude Code archive installs.

Codex supports portable plugin uploads/local catalogs and Git-backed catalogs. This implementation tests a complete package through an isolated local catalog. The release includes `smv-codex-marketplace.zip`: extract it, then add that folder as a Codex marketplace and install the plugin. This is plugin installation, not separate CLI setup. The complete plugin ZIP is also published for compatible upload interfaces. Public plugin-directory submission remains a separate external action; pointing at a source-only Git tree does not make runtime binaries appear. Do not publish placeholder URLs or claim public distribution is complete from source changes alone.

References: [VS Code tools](https://code.visualstudio.com/api/extension-guides/ai/tools), [extension hosts](https://code.visualstudio.com/api/advanced-topics/extension-host), [Claude archive sources](https://code.claude.com/docs/en/plugins/marketplace-reference), [Claude limits](https://code.claude.com/docs/en/plugins/host-marketplace), [Codex packaging](https://developers.openai.com/plugins/build/plugins), [Node downloads and verification](https://nodejs.org/en/download).

Prepared archive catalogs can be generated with `node scripts/write-portable-marketplace.cjs --archive <actual-zip> --url <immutable-published-https-url> --out <new-catalog.json>`. This writes a checksum-pinned catalog; it neither uploads nor publishes it.

## Stable release sequence

The release tag must match the extension version and point to `main`. The reusable delivery workflow qualifies five private runtimes, builds platform VSIX CLI payloads, tests a packaged VSIX in a real VS Code host (including a terminal with empty PATH), installs complete Claude/Codex packages using their actual managers, and builds universal agent archives. The stable release uploads platform VSIXs, agent archives, checksums, installation instructions, and a checksum-pinned Claude catalog as one draft, then publishes it. It updates the existing Claude catalog and publishes each target VSIX to Marketplace when `VSCE_PAT` is configured. Pre-release VSIX publication uses the same platform payloads, but does not promote stable agent catalogs.

The extension and plugin have independent version numbers; release artifacts record the engine version, renderer digest, runtime version and source commit. Creating source changes or CI artifacts alone is not a stable release. A successful public release and catalog publication are the final delivery evidence.
