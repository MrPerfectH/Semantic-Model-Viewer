# Portable Windows build

On Windows, run from the project checkout:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-portable.ps1
```

The builder creates `dist/semantic-model-viewer-windows-portable.zip`. Extract it
to a writable folder and double-click `Run Semantic Model Viewer.cmd`. Python
does not need to be installed. The launcher prefers the bundled
`Models/tools/viewer/runtime/python.exe`, then falls back to installed Python
when run from a checkout without a bundled runtime.

The package includes the viewer assets, local server, Windows launcher scripts,
demo models, project license, and the official Python 3.13.17 Windows x64
embeddable distribution (including its license). The builder verifies the Python
ZIP SHA-256 before extraction:

```text
9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38
```

Use `-PythonZip C:\path\python-3.13.17-embed-amd64.zip` to build with an already
downloaded runtime; the same hash verification applies. `-OutputPath` selects a
different destination ZIP. Building does not publish a release.

The app serves only this computer at `http://127.0.0.1:8931/`; its health endpoint
is `/api/ping`. Use Open model and Browse folder to load a local semantic model.
The launcher accepts `-Port 8932` if another application occupies the default port.

This ZIP supports local models. Fabric sign-in requires the separate Fabric
distribution, which includes its Node.js and XMLA helpers.
