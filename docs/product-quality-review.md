# Product quality review

Reviewed on 7 September 2026 against the original worktree baseline `2897f3e`, followed by the focused application fixes listed below. This review covers code behavior; the coordinating agent owns the live browser walkthrough and visual evidence. The bundled fixture contains 51 tables, 110 relationships and 336 measures in a 271 KB JSON file. It is useful for evaluating the current UI, but is not evidence of large-model performance.

The application has a strong foundation for a free tool: static hosting, local parsing, readable source, useful relationship metadata and a built-in example. The main release risk is presenting an incomplete analysis with the visual confidence of a complete one. Navigation improvements should ship together with correctness, model isolation and explicit scope.

## Fixes completed during this review

These changes are in `Models/tools/viewer/js/app.js`; they have focused regressions in `tests/app.test.cjs`.

| Original defect | Evidence and consequence | Implemented behavior |
| --- | --- | --- |
| Qualified measure references were lost | `prepareModel` classified every `Sales[Base]` as a column reference, even when `Base` was a measure. The dependency graph omitted the edge and the consumer count was wrong. | Resolve names against the referenced table's measures before columns; resolve DAX identifiers case-insensitively. |
| Strings could erase real DAX references | Comment removal preceded string handling. `"https://example.invalid" & [Base]` and `"/*" & [Base] & "*/"` both produced no dependency on `Base`. | A lexical pass skips strings and comments correctly, including escaped quotes, apostrophes in quoted table names and escaped closing brackets. |
| Late requests could contaminate another model | The built-in usage callback only compared the fetched report's model name with an earlier captured name. Selecting an imported model before completion allowed the built-in report's badges to appear on it. A delayed built-in model fetch or repository read could also replace a newer selection. | Request identity and active model guards prevent stale model, report usage and repository refresh results from taking over. |
| An import could disappear after browser storage failed | `setStore` alerted but returned no success state. `confirmImport` cleared the preview and called `loadModel` for an ID that was never stored; the loader fell back to the built-in model. | Storage operations report success; failed imports retain their preview and retry action. Multi-model import, deletion and repository refresh preserve the existing stored model on failure. |
| Dropping inside the import modal could parse twice | The modal called `app.onDrop`, then the event bubbled to the root handler and called it again. | The handler stops propagation. Root import ignores internal table drag payloads and text-only drops. |

Validation: `node --test tests/app.test.cjs` passes 11 tests. `node --check Models/tools/viewer/js/app.js` and targeted `git diff --check` also pass. These tests validate application methods; they do not replace browser interaction checks.

Subsequent integrated review also fixed matrix role/relationship cache invalidation, the no-fact-table empty state and empty button tab stops. The matrix now uses semantic table markup, states its fact-centered scope and opens selected tables in the diagram. Imported table/column names are escaped in individual and aggregated relationship tooltips before HTML rendering. Five regressions in `tests/view-quality.test.cjs` cover those behaviors, including hostile markup in model names. The combined application and view suite passes 16 tests. Domain-card label escaping is coordinated separately with the parent implementation.

## Prioritized remaining findings

Priority 1 means fix before describing the affected analysis as reliable for public use. Priority 2 means polish or a bounded follow-up, with the limitation visible until addressed. Items marked “redesign” belong to the current table/measures work; “release gate” should be completed before a public launch, without expanding this redesign into an entire new analytics engine.

### P1 — Imported model completeness needs diagnostics (release gate)

`tmdl-parser.js:parseTableText` uses `'[^']+'` for quoted measure and column names. A reproducible fixture containing `measure 'Owner''s Total' = 42` silently omits that measure while successfully returning the rest of the table. `parseRelText`/`parseRef` use similarly limited quoted-identifier patterns. `finalize` and `app.js:prepareModel` silently filter relationships whose tables are missing; `handleFiles` silently skips files that cannot be read. A multi-model folder import discards the names of models that failed whenever at least one succeeded.

Show a parse summary with imported and skipped objects/files, actionable warnings and model provenance. Support escaped names in both browser and Python parsers, using the same fixtures. An import with missing tables or relationships must not present its totals as a complete model. The current `parseAny` viewer-JSON shape check is also too weak: it accepts tables with a domain but no source, although `srcKeyOf` immediately dereferences `t.source.kind`. Validate and normalize imported JSON before changing the current model.

### P1 — Relationship reachability must be distinct from DAX lineage (redesign)

The original `canvas.js:distMap` traverses every relationship in both directions and includes inactive relationships. This is a neighborhood query, and cannot directly implement “tables that filter this table.” New directional actions need the relationship direction, active state and a visited set. They must keep physical relationship connectivity separate from what a measure does with `USERELATIONSHIP`, `CROSSFILTER`, `TREATAS` or other expression-specific behavior. See `docs/relationship-review.md` for the dedicated traversal design.

Use separate actions for related tables, upstream filtering tables and downstream filtered tables. State whether direct or transitive links are included. Inactive relationships should be explicitly optional, and the result should explain which scope was used. Saving a diagram must preserve its chosen table set as well as its positions; original `canvas.js:savePreset` only stores `pos` and `view`.

### P1 — Do not imply that the measure graph is full engine lineage (redesign + release gate)

`prepareModel` indexes bracket references in measure DAX. `parseBIM` records a calculated column's `isCalc` flag but discards its expression. Both parser paths reduce calculation groups to a structural flag and do not retain calculation-item DAX. A table-level expression such as `COUNTROWS(Sales)` has no bracket reference, so its table dependency is not present in `_cols`.

Describe the current diagram as static measure references, and expose the separately detected column references. Report usage must say “direct usage in the scanned report” and show report identity/freshness; `tipFlags` currently says “no report usage” for any absent measure once a usage file is loaded. A measure without a direct report reference may still feed a used measure. Full column, calculation group, relationship-activation and report lineage is a later feature with its own parser contract and fixtures.

### P1 — Keyboard access and focus should be part of the new layout (redesign)

Original table selection lives inside `canvas.js:bindCardDrag`'s `mousedown`/`mouseup` handlers; table headers are not keyboard controls. Panning and resizing use mouse events only. The import panel in `topbar.js:ImportModal.update` has no dialog role, focus placement, focus trap, restoration or Escape handling. Search inputs remove outlines, and the original stylesheet defines hover states without an equivalent explicit focus style.

The new table inventory should provide a keyboard route to every table, an Add/Remove button as an alternative to drag-and-drop, and focus/fit actions that work without a pointer. Give selected tabs, expanded folders, labeled inputs and icon buttons appropriate semantics. Keep visible focus on the control used after filtering, selecting or rerendering. Add modal focus handling and keyboard zoom/navigation. Touch/pointer support can be a separate compatibility follow-up, but the launch should declare and verify its supported input devices.

### P1 — State and cached rendering need cross-view verification (redesign)

`app.js:setViewMode` keeps the selected table when entering Measures, while the original sidebar update has no view-mode guard; the coordinating agent reproduced the drawer covering the measure workspace. `matrix.js:update` caches only model key, color mode and table count. `assignRole` and `setRules` originally rebuilt the canvas without invalidating that matrix key, so changing Fact/Dimension classification could leave stale matrix columns. When there are no fact tables, `MatrixView.build` returns `null`; `update` clears the matrix host and returns, revealing the graph underneath a selected Matrix tab.

Each view should own its controls and surface a meaningful empty state. Verify selected table → Measures → Matrix → Graph, role changes in Matrix, model switches with identical table names, and opening a table from DAX. The explorer's chosen table subset, pinned measure and saved diagram must remain scoped to the correct model.

### P1 — Connected repositories can collide in storage (release gate)

`openRepoModel` builds IDs from `'repo:' + rm.path`; `scanRepo` records paths relative to the connected root. Two different folders with the same `Models/Sales.SemanticModel` path therefore target the same cached model, layouts, presets and role overrides. `forgetRepo` removes the directory handle/name/list but deliberately keeps cached models. Those cached entries subsequently merge by that path in `repoRows`.

Use a persistent connection identity as part of the model key and migrate existing records. Clearly distinguish “Disconnect folder” from “Remove cached model/data.” Include two repositories with matching relative model paths in release verification. Do not infer that identical table names or filenames identify the same model.

### P1 — Privacy copy should match persistence and dependencies (release gate)

The import panel accurately states that parsing is local, but does not tell users that parsed DAX and source metadata are retained in `smv_models_v1`. `deleteModel` removes the model, layout and presets but leaves its table-name overrides under `smv_role_overrides_v1`; `forgetRepo` leaves cached models. `index.html` requests Google Fonts, and `app.js:loadHtmlToImage` dynamically runs a third-party CDN script for PNG export. README's statement that fonts are the only external asset is therefore incomplete. This review found no code that uploads imported model payloads; external asset requests should not be described as a demonstrated leak.

Add concise retention wording and a complete “Clear local data” path. Bundle export code and fonts, or accurately describe the network dependency and verify requests during import/export. The built-in sample is now the synthetic `Contoso Retail` demo model, so the shipped app contains no organization-specific data.

### P2 — Large-model performance is unmeasured (redesign verification + follow-up)

`canvas.js:bindCardDrag` calls `renderLines` on every mousemove; `renderLines` rebuilds relationship paths and hit targets. `spreadForExpanded` runs up to 90 rounds of pairwise collision checks. Original `measures.js:buildRows` scans the whole model and recreates visible rows after each query/selection; `gLayout` traverses reachable measures before applying its 500-node cap. All parsing and localStorage serialization run on the UI thread. The existing 51-table fixture does not exercise these limits.

Measure import, first paint, search, pan, drag, fit and dependency selection with representative synthetic fixtures (for example 50/250/1,000 tables and 300/2,000/10,000 measures). Record browser, hardware and timings; do not claim an untested capacity. Prefer drawing the chosen subset, frame-coalesced edge updates and cached adjacency indexes first. Add worker parsing or virtualization when measured latency warrants it. A capped graph must show the cap and a useful route to hidden nodes.

### P2 — Import and export errors need recoverable, specific states (release gate)

Initial `loadModel` fetch failure logs to the console and substitutes an empty “No model loaded” model; HTTP status is not checked before parsing JSON. Import file reads have no progress/cancellation state. `exportPNG` maps every failure to a library-loading error, although rendering/export can fail after the script loads; `_h2iP` caches a rejected loading promise until reload.


Show loading, parsing, ready and error states distinctly. Keep the current model available during a failed replacement. Explain whether export failed to load, render or download, and permit retry. Test invalid JSON, an unsupported folder, a partially readable repo, network failure, denied directory permission, unavailable clipboard and exhausted storage. The newly added quota handling covers one of these failure classes.

## Release acceptance checklist

### Current redesign

- [ ] A new user can choose the built-in example or import a model, identify the current model and understand where its data stays.
- [ ] Start blank → find table → add via button or drag → add related/upstream/downstream tables → inspect a relationship → save diagram → reload restores membership and positions.
- [ ] Direct and transitive filtering actions produce the exact expected result on a fixture with one-way, bidirectional, inactive, disconnected and cyclic relationships; they disclose scope.
- [ ] Minimap viewport matches the real viewport after drag, wheel zoom, fit, sidebar resize and table removal; clicking it navigates predictably.
- [ ] Table → Measures → Matrix → Graph does not retain an overlapping drawer, stale controls or the wrong view's content.
- [ ] A measure can be found by name/folder/table, analyzed, compared and re-rooted with keyboard controls; DAX and diagram selection remain synchronized.
- [ ] Qualified references, escaped identifiers, comments, strings and mixed-case references produce correct dependency and consumer counts; `node --test tests/app.test.cjs` passes.
- [ ] A stale model/usage/repository response cannot replace a newer model selection or add another model's report badges.
- [ ] Browser storage failure retains a usable import preview and current model, shows a recoverable error and succeeds on retry after storage becomes writable.
- [ ] Keyboard focus is visible and retained; all important actions have a button alternative to drag, double-click or hover. Dialogs support Escape, focus containment and focus restoration.
- [ ] Narrow desktop widths and 200% browser zoom keep the selected view usable without essential controls being clipped; longer real-world table/measure names remain discoverable.
- [ ] Performance measurements are recorded for the baseline and at least one substantially larger model, with no silent graph truncation.

### Public launch gates beyond this layout pass

- [ ] TMDL/BIM/browser/Python fixture parity includes escaped identifiers, one-to-one relationships, calculation-group metadata and unsupported-object diagnostics.
- [ ] Imported schema validation rejects or normalizes missing fields before replacing the current model; partial imports report every skipped file/object.
- [ ] Two repositories with identical relative model paths retain separate models, roles, diagrams and refresh behavior.
- [ ] Report identity and scan time are visible; absent direct usage is never labeled proof that a measure is unused.
- [ ] Disconnect, remove model and clear local data have documented, verified effects on all localStorage and IndexedDB entries.
- [ ] Network inspection confirms the documented privacy behavior during import, exploration and export; bundled sample data is approved for public sharing.
- [ ] Chrome/Edge folder connection and alternative file/folder import in the declared supported browsers have been exercised, including denied permissions and offline behavior.
- [ ] Public build has a deliberate fallback for no model, no measures, no fact tables, parse failure and export failure, with a working retry or next action.

This checklist is a definition of readiness, not a claim that all items passed. The current review's automated evidence covers the eleven application regressions above; browser, accessibility, privacy-network and scale evidence should be recorded by the coordinating agent before release.
