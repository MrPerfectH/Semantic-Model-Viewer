# Installation and updates

Choose the browser viewer for a quick start, the VS Code extension for project work,
or the local desktop app for a separate window. The browser and local app parse
model metadata on your computer without uploading it.

- **Browser:** [open the viewer](https://MrPerfectH.github.io/Semantic-Model-Viewer/), then choose **Open model**. No installation is required.
- **VS Code:** [install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer), open your project folder, then select a model in **Semantic Models**. No Python is required.
- **Windows portable:** extract the portable ZIP and run the launcher; no installation or separate Python setup is required. See package availability below.
- **Mac / source:** use the repository setup below with Python 3.

## Supported input

Open a `*.SemanticModel` folder containing TMDL definitions, a PBIP project folder,
or `model.bim`. A `.pbip` file alone is not the model; `.pbix` files cannot be opened
directly. Save your project as PBIP with TMDL definitions in Power BI Desktop, or
export BIM with your model tooling.

If no model appears, check for `definition/*.tmdl` or `model.bim` in the selected
folder. In VS Code, use **Refresh Model List**. In the browser or local app, retry
**Open model** with the model folder itself.

## Windows portable version

The portable Windows app is an extract-and-run ZIP with its own Python runtime.
It does not need an installer or a separate Python installation.

Look for `Semantic-Model-Viewer-Windows-<version>.zip` on the
[Releases page](https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/latest).
A portable build is already available in the development checkout at
`dist/semantic-model-viewer-windows-portable.zip`. It has not yet been attached to
the latest public release (v0.4.3). Until a release includes the portable asset,
use the browser, VS Code, or repository setup below for publicly downloadable options. The `semantic-model-viewer-web-<version>.zip` is a static
web bundle, not the Windows portable app.

When available, extract the Windows portable ZIP and double-click `Run Semantic Model Viewer.cmd`. It carries its own
64-bit Python runtime, creates no shortcuts, and needs no Python installation. Chrome or Edge is
recommended. To remove the app, close it and delete the extracted folder; saved models and
layouts remain in your Windows user profile.

## Run from a repository checkout

This route needs **Python 3** and **Chrome or Edge** (other browsers work in a normal tab).

1. Get the repo: `git clone https://github.com/MrPerfectH/Semantic-Model-Viewer.git`
   (or **Code → Download ZIP** on GitHub and unzip it).
2. Install Python 3 if you do not have it: [python.org](https://www.python.org/downloads/)
   (Windows: tick **Add python.exe to PATH**; Mac: python.org, or `xcode-select --install`).
3. Double-click the installer in the repo folder:
   - **Mac:** `Install on Mac.command`. It adds **Semantic Model Viewer** to
     `~/Applications`; drag it to the Dock.
   - **Windows:** `Install on Windows.cmd`. It adds a Desktop icon and a Start menu entry,
     and a **Semantic Model Viewer** button in the **External Tools** ribbon of Power BI
     Desktop (restart Power BI Desktop to see it). Windows asks for administrator approval
     once for that button. The button opens the app; it does not load the open model yet.
4. The app opens in its own window. Use **Open model → Import model → Browse folder…**
   or **Connect repo folder…** and pick a `*.SemanticModel` folder, a `.pbip` repo folder
   (every model inside is found) or a folder holding `model.bim`. Dragging a folder onto the
   window still works too.

If you downloaded the ZIP, macOS or Windows may warn about the installer the first time
because it came from the internet. On Mac, right-click `Install on Mac.command` → **Open**;
on Windows, choose **More info → Run anyway**. Cloning with git avoids the warning.

**What the local app does:** it listens on `http://localhost:8931` on this computer only,
only ever reads files (`.tmdl`, `.bim`, `.json`), refuses requests from other websites
open in your browser, and stops itself a few minutes after you close the window.
Nothing runs at login.

**Updating:** run `git pull` in the repo folder (or download the ZIP again into the same
place) and reopen the app. Your saved models and layouts are kept.

**Uninstalling:** `Models/tools/viewer/scripts/mac/uninstall-app.sh` or
`Models\tools\viewer\scripts\windows\uninstall-shortcuts.ps1`. On Mac,
`Models/tools/viewer/scripts/mac/reset-app-data.sh` clears just the saved models and layouts.

The app window uses its **own, separate browser profile**, never your regular one, so it
keeps its saved models apart from your everyday browsing. On Mac, opening the app again
opens a viewer window using that same profile; if a viewer window is already open, this
can create another one. Close extra windows normally; your saved models and layouts are kept.

## VS Code

Install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer), or download `semantic-model-viewer-<version>.vsix` from the
[Releases page](https://github.com/MrPerfectH/Semantic-Model-Viewer/releases), then in VS Code run
**Extensions: Install from VSIX…** from the Command Palette (or
`code --install-extension <file>.vsix`). Details: [vscode-extension/README.md](../vscode-extension/README.md).
Marketplace installations update through VS Code. For a manual VSIX installation,
install the newer `.vsix`.

On Windows, run **Semantic Model Viewer: Add to Power BI External Tools** in VS Code
to add an optional ribbon button. Approve administrator access if requested, then restart
Power BI Desktop. The button opens the current Desktop model in VS Code; no EXE
installer or PBIP export is needed. See [ribbon setup and removal](../vscode-extension/README.md#power-bi-desktop-external-tools-button-windows).

## Online demo

<https://MrPerfectH.github.io/Semantic-Model-Viewer/> opens the same viewer with the
built-in synthetic "Contoso Retail" model already loaded, so you can look around before
installing. You can import your own model there as well; it is parsed in your browser and
not uploaded. The browser can ask for permission to read the folder and may ask again
in a later session. With the Python local app, its folder picker reads folders through
the local server instead.

## Run it from source

```bash
python3 Models/tools/viewer/scripts/serve.py --open
# Semantic Model Viewer: http://localhost:8931
```

That is all the installers do (plus opening it as an app window). `--idle-exit 180` makes
it stop after the window has been closed for three minutes; `--port` picks another port.

Without the local app, `Models/tools/viewer/index.html` also opens straight from disk or
from any static host (`python3 -m http.server` in that folder works). Folders are then read
by the browser itself, which asks for folder permission (which may need renewal), and the built-in demo
model needs a web server to load.

A fresh browser profile starts with **No model selected** (the hosted demo opens the sample
instead). Import your model or connect a repository; once chosen, the model is restored on
reload.

## Advanced agent integrations

### Claude Code

Load the `semantic-model-viewer` plugin to open models, ask for visual explanations, and
save offline snapshots from Claude Code. It runs the existing CLI through Claude's shell tools.
Install from inside Claude Code:

```text
/plugin marketplace add MrPerfectH/Semantic-Model-Viewer#claude-marketplace
/plugin install semantic-model-viewer@semantic-model-tools
```

Run `/semantic-model-viewer:setup` once for a stable `smv` command, then use `/semantic-model-viewer:open`. `smv show <model> --table "Cost Center" --related --dependents` opens a reusable side-by-side Tables/Measures workspace; `relations` and `dependents` give short metadata answers. Requires Node.js 22+ and Git. The plugin CLI has no runtime npm dependencies. No separate Viewer app installation is needed.
See [plugin setup and commands](claude-code-plugin.md).

For the optional MCP integration, see [MCP usage](mcp-usage.md). Requested metadata and formulas are sent to the connected host; see [Security](../SECURITY.md#agent-cli-sessions-and-mcp-integration).
