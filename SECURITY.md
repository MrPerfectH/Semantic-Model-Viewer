# Security Policy

## Report a vulnerability

Please report security problems **privately**. Do not open a public issue.

1. Go to the [Security tab](https://github.com/MrPerfectH/Semantic-Model-Viewer/security).
2. Choose **Report a vulnerability**.
3. Describe the problem and how to reproduce it.

This opens a private report that only the maintainer can see. I will reply as soon as I can.
This is a personal project, so there is no fixed response time.

Only the latest release and the current `main` branch get fixes.

## How the app handles your data

The following defaults describe the standalone browser viewer and its Python local server.
The optional agent CLI sessions and MCP integration have additional behavior described below.

- **The standalone viewer does not upload models.** It has no automatic model upload feature. The hosted demo parses a model you import inside your browser.
- **The local app listens on this computer only.** `Models/tools/viewer/scripts/serve.py`
  binds to `127.0.0.1`, port 8931 by default.
- **The local app is read-only.** It answers `GET` requests only. It has no write,
  delete or upload endpoint.
- **It reads model files only.** The model reader returns `.tmdl`, `.bim` and `.json` files.
  The folder browser lists folder names only. It can reach any folder your user account
  can read, because you choose the folder in the viewer.
- **It refuses other websites.** A request to `/api/` is rejected (HTTP 403) when the
  browser marks it as coming from another origin or another site (`Origin` or
  `Sec-Fetch-Site` header). Tools that send neither header, such as `curl` on the same
  computer, are accepted.
- **It stops by itself.** The installed app starts the server with `--idle-exit 180`, so it
  stops about three minutes after the window closes. Nothing runs at login.

## VS Code Power BI Desktop connection

The optional Windows connection uses PowerShell and Desktop's local Tabular Object Model
libraries to read model metadata. It does not run DAX or M, process data, or save changes
to the Desktop model. A temporary BIM export is deleted after the extension reads it;
metadata remains in the viewer and can be included in snapshots you save. Power Query
definitions can contain endpoint strings or sensitive parameter values.

The optional External Tools command writes a dedicated machine-wide Power BI registration
file, requesting administrator approval only when folder permissions require it. It launches
VS Code as the normal user; it does not elevate the viewer. Its launch-link handler accepts
only localhost/127.0.0.1 endpoints and never accepts file paths, remote servers, or output
destinations from a link. This is a local metadata reader, not a restricted credential for
the Desktop model. PowerShell's process-level execution policy flag does not override
organization policies. Remove the registration through the extension before uninstalling it.

## Agent CLI sessions and MCP integration

The CLI reads local metadata and can start a separate loopback-only session server. Its random-token URLs authorize access to that session. It accepts authenticated POST requests for view updates, viewer acknowledgements, selection reads, exports and shutdown; cross-origin browser mutations are rejected. These operations affect the session and generated artifacts, not the source TMDL/BIM files. Background CLI sessions run until explicitly stopped.

The optional local MCP adapter scopes input/output paths to `SMV_ROOT` and owns its session IDs. It sends requested model metadata, formulas, selections and artifacts to the MCP host so that the host can display the real viewer and give the agent context. The host may have its own storage and network behavior. Model inspection is returned as tool data; inline viewer metadata is supplied to the host through tool-result metadata. This is a deliberate trust boundary, not an upload-free guarantee for MCP usage.

MCP Apps communicate through the host bridge rather than opening unrestricted access to localhost. No public model hosting is enabled automatically. Stopping the MCP connection stops its owned sessions. Exported HTML contains the full metadata even when the opening view includes only a few tables.

## What the app does load from the internet

The live app loads IBM Plex fonts from Google Fonts, and loads the PNG export library on
demand. Interactive snapshots (`Save snapshot`) bundle their own scripts and styles and run
offline. A snapshot contains the full model metadata and DAX, so share it with care.

## Scope

In scope: the local server, the viewer code, snapshot export, and the VS Code extension.
Out of scope: problems in your browser, your operating system, or other software.
