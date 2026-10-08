# Reference-aware renaming: design proposal (#31)

Status: proposal for review, outside the first editing release. Object names stay fixed in the current editing UI. This document does not authorize a rename implementation or claim engine/report validation.

## What the current viewer can prove

The viewer parses tables, columns, measures and a relationship projection. Its dependency view resolves references from measure DAX and indexes objects by name. It does not retain a complete semantic-model syntax tree. The TMDL relationship projection filters missing endpoints and deduplicates endpoint pairs. Neither projection is sufficient to drive a lossless rename.

The demo already contains another reference source: calculated field-parameter partitions use `NAMEOF('Product'[Product Name])`. A rename that only rewrites measures would leave these references behind. The report-usage scanner documents report visual/filter references, but those usage results are analysis evidence, not a complete rewrite plan.

Source evidence: `js/tmdl-parser.js` (`parseTableText`, `finalize`), `js/app.js` (`prepareModel`, `daxReferences`), the demo Dimension Selector table, and the README Report health workflow.

## Required inventory before implementing a rename

Resolve objects by type, containing table and exact source identity. Build a coverage inventory from original files, never from display labels or a global string replacement.

- Expressions: measure formulas, calculated columns/tables, calculation items, dynamic format expressions, field parameters and role-filter expressions. Lex identifiers; preserve strings and comments. Distinguish qualified column references from qualified measures and context-dependent bare identifiers.
- Structural model metadata: relationship endpoints, hierarchy levels, sort-by bindings, perspectives, cultures/translations, model table references and any additional name-bearing constructs found during full source parsing. Unsupported constructs block the transaction until a deliberate policy exists.
- Reports: bind supported report-definition references to the selected model, enumerate supported formats and rewrite typed references. A missing report folder is an unknown coverage state, not proof that no reports depend on the model.
- External consumers: reports or queries outside the opened repository cannot be inferred to be covered. A repo-local rename must disclose that boundary explicitly.
- Viewer state and analysis: remap per-object selections and labels after a successful reparse. Recompute dependencies and invalidate Cleaner analysis bound to the old names; cached citations/status must not be reused as current validation.

## Proposed interaction and save contract

The user selects one object and proposes a new name. Validate quoting, case-insensitive collisions and identity first. Show every affected source file and a source diff, grouped by model/report reference kind. List unsupported constructs and missing coverage separately. No write is enabled while a required local reference cannot be resolved.

Review binds to original bytes of every consulted source file and the discovered file set. Any source or membership change invalidates the review. Capture dirty editor documents before planning and before saving. For a rename touching multiple files, define a durable transaction journal, staged writes, recovery after interruption and an explicit rollback contract before enabling Save. Ordinary per-file atomic replacement is not a multi-file transaction.

After saving, reparse the complete model and rerun reference checks. Engine compilation and loading supported report definitions remain separate acceptance gates. Do not label source-reference checks as semantic or visual equivalence.

## Suggested future sequence

1. Implement a read-only rename impact preview with a documented syntax/reference coverage matrix and unresolved-reference reporting.
2. Support measure renames only after complete local expression coverage and a multi-file save/recovery contract exist.
3. Add column/table renames with structural metadata and supported report-definition rewrites.

Before implementation, the user chooses whether the feature promises repo-local model coverage or model-plus-report coverage. External-consumer impact stays explicitly outside either promise. This choice remains pending; current DAX, metadata and relationship editing can proceed independently.

## Acceptance examples for that future work

- Rename a measure referenced by qualified and unqualified formulas without rewriting matching strings/comments.
- Rename a column used in a relationship, sort-by binding, hierarchy and `NAMEOF` calculated partition; account for every reference.
- Reject duplicate/case-only ambiguity and unsupported references without writing any file.
- Change one consulted file after review and refuse the save.
- Interrupt between staged file operations and demonstrate deterministic recovery without losing unrelated edits.
- Load the changed model and supported reports through their actual engines/tools before declaring those gates passed.
