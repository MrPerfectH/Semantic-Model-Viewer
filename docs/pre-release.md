# Semantic Model Viewer pre-release

The 0.5.173 pre-release is a development preview of features beyond the current stable 0.3.9 release. Compared with the stable version, it adds:

- **Table and column impact analysis:** find direct and indirect dependent measures, and follow references from DAX formulas into the analysis.
- **Measure overview:** browse and search measures alongside their formulas, with clearer navigation to their sources.
- **Interactive sharing and explanations:** retain analysis state in HTML snapshots and use interactive viewer sessions and visual explanations to explore a model.
- **Optional guidance:** use first-run and contextual tips when needed.

Dependency analysis is static: it does not execute DAX or Power Query. Version 0.5.173 can compress the graph excessively in narrow split views. See the [changelog](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/develop/vscode-extension/CHANGELOG.md#05173--pre-release) for details.

For instructions on downloading and installing a development preview, see [Test a develop build](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/develop/CONTRIBUTING.md#test-a-develop-build). The [main README](https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/main/README.md) describes the standard version.
