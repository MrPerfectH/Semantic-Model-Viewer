# Power BI Desktop External Tool: MSI Windows validation

The original `semantic-model-viewer-powerbi-trial.vsix` was verified before installation (SHA-256 `57B3F8D5E4F372063EB1C10D7D43841699847A1DE79ECA0E7F384E0957DDB855`). Only disposable, newly created Desktop models were modified.

## Observed on Windows

- Registration command reached UAC and, after approval, created the separate `Semantic Model Viewer VS Code.pbitool.json` file. Existing tools were preserved.
- After opening Desktop, the actual External Tools ribbon launched installed stable Code.exe with its URI, without elevation.
- Two simultaneous unsaved Desktop models, containing `TrialAlpha` and `TrialBeta`, each opened their own model through the ribbon. Switching back selected Alpha again.
- Alpha's new, unsaved `TrialMeasure = 123` appeared after Refresh Model and on a later ribbon launch.
- A URI without server/database opened an empty viewer and cleared the previous model.
- Original Desktop-library discovery failed on the Microsoft Store installation. The official NuGet TOM client read the same models successfully. The current source connector was run against both active Desktop endpoints and read Alpha's unsaved measure.
- Source registration/removal passed using Windows PowerShell against an isolated temporary Common Files fixture, preserving another tool's registration. The protected-folder removal now reaches UAC; final approval and confirmation of deletion are still pending.

## Compatibility and provenance

The original trial is 0.3.9. Its source was recovered from the supplied VSIX and merged into current develop without replacing the newer Fabric/agent implementation or canonical viewer assets. The original Linux test file was not in the VSIX; focused regression tests were recreated here.

Stable VS Code on this laptop is 1.98.2. Current develop already requires VS Code >=1.101.0, so its source-built 0.5.0 package cannot be installed in that stable editor. The compatible 0.3.9 trial was used for the ribbon UI checks; the current source connector and mocked extension/panel tests were checked separately. Updating VS Code is required to install the current develop extension.

The client is restored at build time with a checked-in NuGet lock file; no DLL copied from another application is committed. Packaged component notices and license declarations accompany the client. No application installer, model write operation, Marketplace publication, or release was performed by this validation.
## Automated validation

On the current develop integration, the extension test suite completed with **871 passed, 12 skipped, 0 failed** (883 tests). The Power BI focused tests include actual Windows PowerShell registration/removal in a temporary folder, exact-window URI parsing, local-only URI validation, rereading Desktop on refresh, and clearing the previous model for an empty launch. The build restored its pinned client packages and produced a VSIX successfully.

The laptop required a task-local `python3` alias for its existing Python installation, restoration of canonical repository line endings for byte-exact fixtures/demo TMDL, and restoring the existing .NET fixture through nuget.org instead of the machine's offline-only source. These test-environment adjustments are not part of the source change.
