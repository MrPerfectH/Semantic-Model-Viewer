# MCP connection verification

Verified locally on 2026-10-20 on Linux, on branch `fix/prepared-view-presentation`.

## Executed checks

- The actual `node bin/smv.cjs mcp` subprocess was launched using the official SDK's stdio client transport, rather than an in-memory server transport. Both tools-only and UI-capable clients completed initialization, listed tools, inspected Contoso, opened Sales YoY and stopped the session.
- The tools-only client received `presentation.inline.available: false` and no UI model payload.
- The MCP Apps client received `presentation.inline.available: true`, the actual Sales YoY model/view payload, and the registered `ui://smv/viewer.html` resource with `text/html;profile=mcp-app` MIME type. The resource contained the real viewer and bridge and no localhost session fetch configuration.
- The existing browser integration test with the official MCP Apps AppBridge passed: actual model loading and state synchronization, sandbox messaging, host appearance, fullscreen request and offline download.
- The stdio cases are committed in `tests/mcp-viewer.test.cjs` and run under `npm test`.

The initial browser run failed because the machine's default temporary storage returned write error -122. Re-running with a writable temporary directory passed. No application behavior was changed to disguise this environment failure.

## Target T3 status: native MCP App created; visual acknowledgement pending

The installed T3 server reported version `0.1.1-nightly.20261019.3360`. After a subsequent turn loaded the new registration, the running Codex tool catalog exposed `semantic-model-viewer.smv_open` and the other viewer tools.

Called the real `smv_open` tool in this conversation with the committed Sales YoY calculation view. It returned `presentation.inline.available: true` and `ui://smv/viewer.html`. T3's durable tool output recorded a `t3McpApp` attachment with server `semantic-model-viewer`, tool `smv_open`, and the correct resource URI. This proves native MCP App packaging in the actual target host, rather than a custom `html_render` loader.

The MCP session remained alive, but its client list was empty during observation. An independent browser could reach T3 but was stopped at its pairing screen; short-lived verification tokens were revoked and their temporary files removed afterward. The owner subsequently supplied a screenshot showing the real Sales YoY heading and viewer controls in a roughly 100-pixel frame. Native mounting is confirmed, but the canvas was clipped and interaction has not been accepted.

The live test also exposed inconsistent diagnostics: `smv_open` reported negotiated UI support while `smv_status` returned the CLI session's generic unsupported value. The MCP adapter now applies its negotiated UI capability to both responses, with a failing-then-passing real-stdio regression check. This reporting fix does not itself prove that a UI has mounted; the client acknowledgements remain the evidence for that.

Registered `semantic-model-viewer` through `codex mcp add`, scoped to this checkout with a writable local temporary directory. This is a development-machine configuration outside the repository, not an installer shipped to other computers.

## Repeat setup on another development machine

Use the supported Codex registration command, adjusting both paths:

```sh
codex mcp add semantic-model-viewer \
  --env SMV_ROOT=/absolute/path/to/models \
  -- node /absolute/path/to/semantic-model-viewer/bin/smv.cjs mcp
codex mcp get semantic-model-viewer --json
```

The host must load the new connection and support MCP Apps for an inline panel. A tools-only host uses the viewer URL or exported artifact fallback. See the [official MCP setup documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and `docs/interactive-viewer.md`.

## Native card height regression

The fixed-position viewer contributes no document-flow height. The SDK automatic resize therefore reported zero, collapsing the native card and producing snapshots below the view schema’s 320-pixel minimum. The official AppBridge test now starts its sandboxed iframe at 100 pixels and applies actual MCP size-change notifications. It reproduced the failure before the fix.

The app disables automatic document sizing and explicitly requests a bounded workspace height (480–1000 pixels, default 900) on connection and view delivery. It skips synchronization while the host viewport is below the schema minimum. The rebuilt bridge passes all 10 interactive browser checks, including resizing from the small initial frame and state synchronization; all 35 core tests also pass.

Opened another native Sales YoY card using the rebuilt resource in T3. This is a real MCP tool call, without an agent HTML wrapper. Visual acceptance in T3 remains pending the owner’s check of the new card.
