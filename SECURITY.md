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

Facts below come from the code in this repo.

- **Models are not uploaded.** The viewer has no upload feature and sends no model data to
  any server. The hosted demo parses a model you import inside your browser.
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

## What the app does load from the internet

The live app loads IBM Plex fonts from Google Fonts, and loads the PNG export library on
demand. Interactive snapshots (`Save snapshot`) bundle their own scripts and styles and run
offline. A snapshot contains the full model metadata and DAX, so share it with care.

## Scope

In scope: the local server, the viewer code, snapshot export, and the VS Code extension.
Out of scope: problems in your browser, your operating system, or other software.
