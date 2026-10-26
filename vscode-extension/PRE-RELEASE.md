# What's new in the pre-release

The 0.7 pre-release brings more than Fabric connectivity:

- **Connect to Fabric from the sidebar:** see your signed-in account and tenant, switch accounts or sign out, browse workspaces and semantic models, and reopen saved metadata offline.
- **Edit group colours:** choose colours by source or table folder, with distinct fact and dimension styling. Colour choices are remembered per model.
- **Read the colour legend:** show or hide the compact legend and switch between Source and Table folder colouring from the bottom bar, even with the legend hidden.
- **Control the canvas:** find Fit, Center selected, disconnected-table visibility, and the overview map together at the bottom. Edit colours appears when the legend is open.
- **Keep your place:** selecting a table preserves the current zoom and position. Compact tables now have smaller relationship badges while retaining cardinality and filter direction.
- **Match VS Code’s appearance:** the viewer follows light, dark, and high-contrast themes, including live theme changes. Power Query code also respects the host background.
- **Keep your view:** disconnected-table visibility is preserved in saved views and HTML snapshots; Fabric colour preferences are remembered across workspaces for the same model.

Requires **desktop VS Code 1.101 or newer**. In Extensions, choose **Switch to Pre-Release Version**; if already on a pre-release, check for extension updates.

## CLI and Claude Code — separate companion

The project also provides a CLI for opening local models, creating focused table and
measure views, exporting offline snapshots, and working with interactive viewer sessions.
An agent such as Claude Code can call it to open the model and view you ask for.
The CLI can also fetch a Fabric model definition using an existing Azure CLI login,
subject to the definition API’s permissions.

**Installing this VS Code extension does not install the CLI or Claude plugin.**
See the [CLI guide](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/develop/docs/cli.md)
and [Claude plugin setup](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/develop/docs/cli-plugin-workflow.md)
for their separate setup and requirements.

