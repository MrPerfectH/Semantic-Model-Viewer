# Model editing preview

The feature is isolated on `t3/edit-model-context` and draft PR #39. Do not merge or publish before user verification.

## Available flows

- Existing measure DAX: select the measure, choose Edit DAX, change the formula, review before/after, save to its original source, and reload its dependencies.
- Measure metadata: description, display folder and static format string. Only changed fields are patched; an empty value removes that field. Metadata-only edits preserve the original expression.
- Relationships: create or modify endpoints, cardinalities, filter direction and active status. Existing relationship identities stay fixed; new objects get a UUID.
- Standard local app: folder-backed TMDL models support the same review/save dialogs through the local Python server, without browser filesystem permission prompts. Loose-file imports remain read-only until linked through Browse folder.
- Browser: the same reviewed source edits are available for a live connected repository through browser file handles. Imports, cached disconnected models, the demo and HTML snapshots do not expose source editing.

Names remain fixed. The [rename proposal](model-editing-renames.md) defines the follow-up investigation.

## Supported source boundary

The preview targets ordinary tab-indented UTF-8 table and relationship TMDL in a standard model definition folder. It patches source sections and preserves unrelated bytes, including BOM and untouched line endings. It rejects duplicate declarations, unsupported layouts and linked source files instead of reconstructing an entire model.

Fenced expressions are not supported for DAX editing; metadata-only changes can preserve them. A static format change is refused when a dynamic format definition exists. Nested child metadata never belongs to the displayed measure formula.

Relationships require existing endpoints and a supported complete raw relationship set. Nested or annotation layouts are refused; scalar unknown properties are preserved. One-direction filtering means To filters From; supported single-direction one-to-many edits use the many side as From. One-to-one requires both directions. The active-path check is conservative and may refuse configurations an engine could accept. Key uniqueness, column-type compatibility, DAX compilation and engine ambiguity are not validated here. See [Microsoft relationship guidance](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand).

VS Code and the standard local app can create the first canonical `definition/relationships.tmdl` using exclusive file creation. Local app saves require a same-origin capability and recheck raw bytes, file identities, and full model inventory before atomic replacement. Concurrent external source writers remain a final race limitation. Browser editing requires that canonical file already exist; missing targets are refused without creating a file during review. Browser file handles do not provide compare-and-swap, so source checks cannot eliminate the final external-writer race. Avoid simultaneous source writers while committing an edit.

## Save and failure behavior

Review does not write. Cancel and changed drafts invalidate pending browser edits. Save checks review identity, model selection, source contents and consulted file inventory. Native saves also check dirty source documents through physical-path aliases. Relationship reviews consult all model files used to validate endpoints and existing relationships.

Source is refreshed after saving. If source commits but reload/cache refresh fails, the error explicitly says Source saved; the browser adapter disables further edits for that model revision until it is reopened. A refresh error is not reported as an unwritten source change.

## Verification before merge

Use a disposable model copy and inspect Git diffs after each successful save.

1. Change a measure formula, review and save. Confirm only its expression changed and the viewer shows the saved formula and dependencies.
2. Cancel a DAX edit. Confirm no source changed.
3. Change a multiline description, folder and static format, save, and verify the decoded values in the viewer. Clear one property and verify removal.
4. On a measure with dynamic-format/annotation children, confirm displayed DAX excludes those children and metadata edits preserve them.
5. Create an inactive relationship, save, then change its settings while retaining its identity. Confirm the diagram reloads.
6. Change a consulted source after review, or leave its source editor dirty. Confirm save refuses and preserves the external edit.
7. In the standard app, open a model through Browse folder or Connect repo folder; verify DAX, metadata, and relationships save without a browser filesystem prompt. In a browser, connect a real repository, test denied and granted write permissions, and inspect the actual filesystem after a save. Missing canonical relationship files must be refused.
8. Open an exported HTML snapshot and confirm no source edit controls exist.
9. Load the edited model through its actual engine and inspect dependent report behavior before claiming semantic/report acceptance.

Automated tests exercise real temporary native TMDL writes and mocked browser file handles. Rendered browser forms have also been exercised with simulated repository handles. Those checks are separate from installed VS Code and real-browser filesystem acceptance.
