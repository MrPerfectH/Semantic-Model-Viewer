# Reference-aware renaming (#31, unreleased)

This feature is developed separately on `feature/reference-aware-renaming`. The wider formula/metadata/relationship editing story #44 remains deferred. The supported first rename path edits original repository TMDL and bound repository-local PBIR report definitions together, after a source review. It does not rename Fabric models, standalone BIM, imported caches, or offline snapshots.

## Use

In the standalone Python app, connect the repository folder containing the semantic model and report folders, open a model, then choose **Rename object…**. Node.js 22 or later must be available to run the private source helper. In desktop VS Code, open the same repository workspace and model, then choose **Rename object…** in the viewer or **Semantic Model Viewer: Rename Object and Report References…** from the command palette.

Select an original table, column, or measure identity and a new name. Preview shows the model and report files that will change. Review their before/after source or native VS Code diffs, then explicitly apply. Canceling the review changes no source files. Dirty VS Code documents, source changes, report membership changes, collisions, ambiguous references, and unsupported formats block saving. The viewer refreshes from disk and remaps supported selections, table positions, and saved table views after a successful rename.

The semantic model and reports are source files, not live Power BI objects. External reports, Excel connections, and queries outside the selected repository are not covered. Passing source checks is not a claim that the model compiles or that a report renders equivalently in Power BI; those validations still require the model/report tools and representative acceptance.

## Supported references

The planner uses original declarations and source offsets. It does not serialize the viewer projection or globally replace matching text. TMDL coverage includes table/column/measure declarations, resolved DAX references in supported expressions and calculated partitions, `NAMEOF` field parameters, dynamic format expressions, role filters, relationship endpoints, hierarchy levels, sort bindings, and model table/permission references. Comments, string literals, source column names, and Power Query M remain unchanged. Ambiguous virtual-table columns or local variable scopes block saves.

PBIR report binding must resolve `definition.pbir`'s `datasetReference.byPath.path` to the selected model. Reports bound to another local model remain unchanged. Supported typed references, semantic query aliases, projection/query references, standard aggregation wrappers, and hierarchy references are updated using exact JSON string token offsets. Original formatting, key order, BOM, and display labels are preserved.

Unsupported cases are explicitly blocking: model.bim, perspectives/translations and enumerated unfamiliar name-bearing TMDL constructs; PBIR-Legacy, external/missing report bindings, unknown matching query/reference forms, report-embedded DAX, and ambiguous aliases. This is bounded syntax support, not a promise of complete coverage for arbitrary future TMDL/PBIR schema extensions. Review the supported scope against real project files before release.

## Multi-file save and recovery

A review binds to original bytes and the discovered model/report file set. Before writing, the native helper validates the review again and persists private original-byte backups in `.smv-rename-recovery`. Each replacement is staged and flushed before atomic per-file replacement. A failed operation attempts rollback. An interrupted process leaves the journal available for an explicit **Restore originals** action before another rename.

Recovery refuses to overwrite a file whose bytes match neither the original nor the planned replacement; it retains backups for manual review. Hashes are checked again before replacement, but the operating system does not provide an atomic multi-file compare-and-swap against arbitrary simultaneous external writers. Stop external source-writing tools during apply/recovery. Journal backups contain the same potentially sensitive source metadata as the project; do not commit them or share them casually.

The standalone source endpoint requires same-origin/local-host JSON requests and a per-server nonce. Only opaque private review tokens can apply a plan; browser/webview callers cannot supply arbitrary source patches. Native VS Code plans and source diffs stay in the extension host. Snapshots have no source write capability.

## Before public demonstration/release

Complete actual standalone and installed-extension rename/cancel checks, realistic synthetic model/report fixtures, source-conflict/recovery tests, and representative model-engine/report-rendering acceptance. Document unsupported inputs accurately. Keep #31 open until its accepted release scope has passed those checks. No LinkedIn publication is authorized by this implementation work.
