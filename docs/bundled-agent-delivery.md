# Bundled agent delivery (0.6.0 candidate)

The existing two-pane diagram experience is preserved. A complete agent package contains the application, its renderer and a private Node runtime; agents call its own launcher. A global `smv` command and the setup skill are optional. Runtime/application selection never probes another installed plugin.

## VS Code and Copilot

The extension contributes discovery, inspection, relationships, dependent calculations, diagram and snapshot tools through VS Code's native language-model tool API. Install the extension, enable its tools in Copilot, then ask for a diagram. No system Node, terminal setup, localhost session or MCP server is required for those editor actions. Existing model commands remain available without Copilot.

Analysis runs in a cancellable worker using VS Code's Node host. Model records are read through `workspace.fs`; their URI identity is retained. A TMDL definition takes precedence over sibling BIM caches, matching the CLI. The tool only selects models discovered in the open trusted workspace. It never silently selects a backup. Two diagram panels appear beside each other. Repeating an unchanged question reveals those panels and preserves exploration. Changed source records replace the frozen snapshot. Status remains `awaiting-viewer` until that revision acknowledges application; this is distinct from computed counts. HTML export asks the user for a destination and includes the full parsed model and formulas.

This is a desktop Node extension. It does not claim browser-only vscode.dev support. Remote model records retain URI identities, but the existing Fabric UI and source-file navigation retain their own remote limitations. These new tools do not establish full remote-extension acceptance.

## Claude Code and Codex

Complete release payloads use `bin/smv` (macOS/Linux) or `bin/smv.cmd` (Windows x64). They include unchanged upstream Node binaries and full Node licenses. No first-use download or npm install runs. `SMV_NODE` is an explicit developer override for source-only builds, never an implicit PATH fallback.

Claude skills use the host-provided plugin root. Codex receives a separate generated package with portable `plugin.json`, a compatibility `.codex-plugin/plugin.json`, and adapted skills that resolve resources relative to their loaded location. Neither agent workflow requires PATH setup. Codex's package is not represented as a Claude-only manifest.

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

Source-only `build:plugin` and Git marketplace payloads do not include runtime binaries and must not be advertised as no-Node installations. Complete archives are separate release artifacts. Claude supports a checksum-pinned archive source; the public catalog must be changed to that actual immutable release URL only when the artifact is published. Organization-sync restrictions differ from direct Claude Code archive installs.

Codex supports portable plugin uploads/local catalogs and Git-backed catalogs. This implementation tests a complete package through an isolated local catalog. Public plugin-directory submission or another supported binary distribution channel remains a separate release action; pointing at a source-only Git tree does not make runtime binaries appear. Do not publish placeholder URLs or claim public distribution is complete from source changes alone.

References: [VS Code tools](https://code.visualstudio.com/api/extension-guides/ai/tools), [extension hosts](https://code.visualstudio.com/api/advanced-topics/extension-host), [Claude archive sources](https://code.claude.com/docs/en/plugins/marketplace-reference), [Claude limits](https://code.claude.com/docs/en/plugins/host-marketplace), [Codex packaging](https://developers.openai.com/plugins/build/plugins), [Node downloads and verification](https://nodejs.org/en/download).

Prepared archive catalogs can be generated with `node scripts/write-portable-marketplace.cjs --archive <actual-zip> --url <immutable-published-https-url> --out <new-catalog.json>`. This writes a checksum-pinned catalog; it neither uploads nor publishes it.
