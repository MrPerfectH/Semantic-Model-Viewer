# Standalone Fabric preview

Extract the complete archive to a permanent folder. It includes the viewer, MSAL and six self-contained XMLA helpers. It does not include your models or Microsoft session.

Requirements: Python 3, Node.js 22 or later, and a modern browser. Both `python3` (or Windows `py -3`) and `node` must be available to the app process. No .NET installation or user-created Entra app registration is needed.

From the extracted `semantic-model-viewer` folder:

```sh
python3 Models/tools/viewer/scripts/serve.py --port 8931
```

On Windows use `py -3` in place of `python3`. Open http://localhost:8931 and choose **Connect to Fabric → Sign in with Microsoft**. On macOS, the existing `Models/tools/viewer/scripts/mac/install-app.sh` can install the app launcher; Windows shortcut installation is under `scripts/windows/install-shortcuts.ps1`.

An XMLA-enabled eligible capacity and model access are required. Tenant policy may restrict sign-in. Read + Build metadata may omit internal definitions. **Refresh Fabric** downloads metadata; it does not refresh model data. The consumer fallback executes fixed metadata-only INFO.VIEW DAX queries, never business-row queries or M.

Saved metadata stays on this computer after sign-out until explicitly removed. Offline snapshots contain model metadata and supported formulas, not authentication credentials. Review them before sharing.

Mac helpers in the preview build are ad hoc signed, not publisher notarized. Public app signing/notarization and the full permission/source coverage matrix remain acceptance work. Component terms are under `tools/fabric/xmla/publish/<platform>/notices` and the bundled JavaScript dependency directories.
