# MCP connection verification

Verified locally on 2026-10-20 on Linux, on branch `fix/prepared-view-presentation`.

## Executed checks

- The actual `node bin/smv.cjs mcp` subprocess was launched using the official SDK's stdio client transport, rather than an in-memory server transport. Both tools-only and UI-capable clients completed initialization, listed tools, inspected Contoso, opened Sales YoY and stopped the session.
- The tools-only client received `presentation.inline.available: false` and no UI model payload.
- The MCP Apps client received `presentation.inline.available: true`, the actual Sales YoY model/view payload, and the registered `ui://smv/viewer.html` resource with `text/html;profile=mcp-app` MIME type. The resource contained the real viewer and bridge and no localhost session fetch configuration.
- The existing browser integration test with the official MCP Apps AppBridge passed: actual model loading and state synchronization, sandbox messaging, host appearance, fullscreen request and offline download.
- The stdio cases are committed in `tests/mcp-viewer.test.cjs` and run under `npm test`.

The initial browser run failed because the machine's default temporary storage returned write error -122. Re-running with a writable temporary directory passed. No application behavior was changed to disguise this environment failure.

## Target T3 status: native chat verification pending

The installed T3 server reported version `0.1.1-nightly.20261019.3360`. Its installed client assets contain an MCP Apps renderer and protocol handlers. That establishes the presence of host code, not a completed integration with this provider session.

Registered `semantic-model-viewer` through `codex mcp add`, with `SMV_ROOT` scoped to this checkout and a writable local cache temporary directory. `codex mcp get semantic-model-viewer --json` confirmed the registration was enabled. This is a development-machine configuration outside the repository, not an installer shipped to other computers.

The current running tool connection did not reload the server: `resources/list` returned `unknown MCP server 'semantic-model-viewer'`, and no `smv_*` tool was exposed in the turn's tool catalog. The final native T3 test must be run after that connection is refreshed. Call the newly exposed `smv_open` tool directly, inspect its negotiated UI capability, and verify user interaction with the native MCP App card. Do not substitute `html_render`, a custom loader, SDK test-host screenshots, or a locally simulated capability for this final check.

No claim of end-to-end T3 inline acceptance is made by these tests.

## Repeat setup on another development machine

Use the supported Codex registration command, adjusting both paths:

```sh
codex mcp add semantic-model-viewer \
  --env SMV_ROOT=/absolute/path/to/models \
  -- node /absolute/path/to/semantic-model-viewer/bin/smv.cjs mcp
codex mcp get semantic-model-viewer --json
```

The host must load the new connection and support MCP Apps for an inline panel. A tools-only host uses the viewer URL or exported artifact fallback. See the [official MCP setup documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and `docs/interactive-viewer.md`.
