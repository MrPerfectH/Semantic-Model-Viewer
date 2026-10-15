# Visual explanations development plan

Draft for discussion, 15 October 2026.

Build an agent-operated tool that helps people understand semantic models, discuss suspected problems, and explore ideas. The agent chooses what to show and what to say. The viewer renders that explanation against actual model objects, with optional numbers and proposed elements. A successful output makes the agent's reasoning easy to inspect and challenge; it does not certify that reasoning.

This plan replaces the comparison-led direction in the supplied case-files spec. Model comparison, automatic diagnosis, and query execution are outside this feature. Existing external tools can supply query results. The feature supports one model per explanation, multiple views of it, and illustrative proposals.

## Product experience

A user asks, “Why might this measure be wrong?” The agent inspects the model, selects the measure and relevant relationships, and produces an annotated image alongside its answer. When the explanation needs more context, the agent creates a sequence of views. It can attach results obtained through another tool, show arithmetic on those results, and illustrate a proposed relationship or formula without modifying the source model.

The same workflow supports teaching concepts, explaining existing logic, and presenting a design idea. Numbers, conclusions, and multiple steps are optional. A single useful image is a complete result.

## Architecture and defaults

- Extend the existing Node.js `smv` entry point in `bin/smv.cjs` and `Models/tools/viewer/scripts/cli/`. Preserve `smv snapshot` and its dependency-free export path.
- Reuse the shipped parser, model preparation, layout, and snapshot code. Add a shared view specification consumed by the viewer and CLI rather than a second rendering implementation.
- Keep the viewer vanilla JavaScript. Image capture uses installed Chrome/Chromium through the local DevTools protocol, with actionable missing-browser errors. No browser npm package is needed.
- Use versioned JSON for explanation, view, and result contracts initially. Agents can write JSON directly; YAML can be an optional adapter later.
- Keep artifacts local and source models read-only. Publishing is a separate agent action.
- Preserve snapshot mode and the VS Code host. Capture settings apply to the explanation session, not the user's saved workspace.
- Use qualified object references: kind, table where applicable, and name. Relationships need an identifier that distinguishes multiple edges between the same tables. Missing or ambiguous references produce errors, never a highlight on a guessed object.

The current CLI accepts TMDL folders and exports offline HTML with table or measure focus. The browser parser also supports BIM; exposing that through the CLI is a later input extension. Relevant starting points are [CLI usage](cli.md), [snapshot behavior](snapshots.md), `scripts/cli/model.cjs`, `js/snapshot.js`, and the viewer's existing graph and measure components.

## Shared contracts

An explanation contains a schema version, title, one model source, and ordered steps. Each step has a stable ID, a caption, and a view, result, calculation, or proposal reference. An optional summary expresses the agent's conclusion. There are no mandatory correctness verdicts.

A view specifies the existing viewer mode, focused objects, visible context, highlights, callouts, and capture options. Object resolution and rendering use the same contract in a live view and in exported artifacts. URL parameters are a convenient subset; complex specifications travel through a JSON file rather than a long URL.

A result dataset contains typed columns and rows, units where known, and origin metadata. Origin distinguishes externally executed queries, imported saved results, and illustrative values. Capture the source tool, query text if available, execution time if known, filter scope, and model identity or revision if available. Missing provenance stays unknown; importing a file does not mean its query ran now.

A calculation names its inputs, operation, output unit, and formatting. It preserves links to source values. A proposal contains temporary visual changes and an explicit label. An explanation manifest records source identity, renderer version, applied view settings, artifact paths, and diagnostics so another agent can reproduce or revise it.

Paths inside an explanation resolve relative to its file. CLI path arguments resolve from the working directory. Schema versions reject unsupported future versions with an actionable error. JSON stdout is reserved for machine-readable results when requested; progress goes to stderr.

## Phase 1 One annotated model view

Deliver the smallest useful loop: an agent can show a focused measure or relationship view from a local TMDL model.

1. Add command dispatch without changing existing snapshot arguments or behavior.
2. Define and validate the first view schema, including qualified table, column, measure, and relationship references.
3. Apply view state through a shared viewer adapter. Start with graph and measure views, including selected formula text and dependency context.
4. Add semantic DOM hooks and an asynchronous readiness contract. Readiness includes model loading, view application, fonts, layout, and annotation placement; failures reject with a reason.
5. Render highlights, context fading, and anchored callouts in the viewer. Cropping includes annotations and enough context to understand the selection.
6. Add `smv shot <model> --view view.json --out image.png` and optional JSON diagnostics. Capture uses an isolated storage session, fixed viewport, theme, scale, fonts, and browser version. Disable animations during capture.

Acceptance: an agent can capture a selected measure, a table column, and a specific relationship without manual browser actions. Unknown objects fail clearly. Two runs in the same pinned environment produce identical images. Ordinary viewer use and existing snapshot output still work.

Verification: schema and resolution tests, annotation placement browser tests, repeated capture comparison, and existing CLI and snapshot regressions. Use synthetic fixtures with punctuation and duplicate column names across tables.

## Phase 2 Explanations with multiple steps

Build on Phase 1 to support a sequence that an agent can refine after inspecting the output.

1. Add the explanation schema and `smv explain build explanation.json --out <directory>`.
2. Compose view steps with captions and optional summary. Allow a single step; do not require a diagnosis or numbers.
3. Export self-contained HTML, Markdown with relative image links, images, and a machine-readable manifest. Preserve the input specification for later editing.
4. Add validation and inspection commands with structured errors. Build into a temporary location and publish completed artifacts together; preserve existing output unless replacement is explicit.
5. Support a narrow chat column and a full browser page, light and dark themes, accessible captions, and readable formula text. Use self-contained theme fallbacks rather than requiring host CSS variables.
6. Include a view specification for reopening a step. Offer live links only when a live server is available; static exports remain useful without it.

Acceptance: three annotated steps explain a synthetic filter-path problem offline. Editing one caption or highlight and rebuilding works without manual UI actions. An ordinary browser can read the HTML; Markdown consumers can display the images. Host-specific inline rendering is verified separately for available hosts and falls back to images and links.

Target: a three-step build in under 60 seconds after browser setup on a documented reference machine. Report measured timing; first-time dependency downloads are excluded.

## Phase 3 Numbers supplied by other tools

Add numbers without requiring the viewer to authenticate to Power BI, Fabric, or any database.

1. Define the result dataset schema and validators for types, nulls, units, and provenance.
2. Accept inline datasets or JSON files referenced by the explanation. Support stdin for a normalization command so agents can pipe results from existing tools. Add CSV import with explicit column types and separate metadata.
3. Render a scalar value, result table, or bar chart. Let captions connect results to highlighted model objects. Support negative values and display units without changing the underlying values.
4. Show whether values are imported, query results supplied by another tool, or illustrative. Expose query and scope details on demand. Do not infer equal scopes from similar labels.
5. Define limits for rows and artifact size. Any display truncation is explicit; complete supplied data can be a separate local artifact selected by the author.

Acceptance: an agent can attach an external tool's saved result to a measure explanation without a login or network connection. A result with unknown execution time renders as unknown. Null and zero remain distinct. A malformed dataset fails with the field and reason.

Start with a generic JSON adapter. Add adapters for actual query-tool outputs only after collecting representative output examples. The supplied GSV cache is a useful local adapter example, but its placeholder query and different model snapshot dates must remain visible in provenance. Do not make that cache a universal result format.

## Phase 4 Explain calculations

Add transparent arithmetic over imported values and small illustrative datasets. External tools remain responsible for executing DAX, M, and SQL.

1. Define named calculation inputs referencing dataset cells or earlier calculation outputs, plus explicitly illustrative constants.
2. Implement a small allowlisted operation set: sum, subtraction, multiplication, division, ratio, and percentage change. Use structured operations rather than executable JavaScript or arbitrary expression evaluation.
3. Define decimal precision, rounding, units, null propagation, division by zero, and dependency-cycle errors before implementation. Use a maintained decimal arithmetic dependency if exact decimal behavior is required; make that decision part of this phase's design review.
4. Render the formula, substituted values, and result so users can see how the number was produced. Preserve input provenance and precision; rounding applies at the declared stage.
5. Allow the author to show alternative assumptions in a small table without presenting the alternatives as executed model results.

Acceptance: imported delivered and ordered amounts can produce a visible difference and ratio. Rebuilding reproduces the arithmetic. Missing inputs and incompatible units do not produce plausible-looking numbers. An illustrative calculation is visibly distinguishable from a model query result.

## Phase 5 Proposed changes and concept illustrations

Let an agent show an idea without editing the user's model. This is a proposed later capability, not a requirement for the first release.

1. Add an overlay layer for a suggested relationship, a proposed formula, a marked removal, and agent-authored arrows or grouping labels.
2. Use text labels and visual styling to distinguish existing objects from proposals. Provide a toggle to inspect the underlying model.
3. Add synthetic mini-models for teaching concepts independently of a user's files, using the same rendering contract.
4. Keep overlays in the explanation artifact and out of model export or save operations. Do not simulate filter propagation or imply a proposed formula has executed.

Acceptance: an agent can illustrate a suggested Date-to-Sales relationship and a replacement formula. The proposal is labeled in HTML and screenshots. Source files and the underlying model remain unchanged. A concept-only explanation works with a tiny synthetic model.

## Phase 6 Complete viewer coverage and local exploration

Extend the same authoring contract to the remaining useful viewer surfaces.

1. Add matrix, cluster, and Power Query lineage views, followed by report-usage context where the existing viewer exposes it. Specify focus, highlights, callouts, and readiness for each surface.
2. Add BIM input and explicit report association, reusing existing parsers and scanners. Avoid guessing between multiple possible report matches.
3. Add `smv open` and a local `smv serve` for exploration and reopening explanation steps. Bind locally and serve only intended viewer artifacts.
4. Add model discovery with stable IDs and unambiguous selection. Start with a foreground server; add background reuse, status, stop, and watching as a separate increment with lifecycle tests.
5. On source refresh, detect stale object references and mark explanations requiring rebuild. Do not silently redirect references after a rename.

Acceptance: each supported surface can be opened and captured through the same contract. An agent can reopen a step, inspect it, revise the specification, and rebuild. A model change produces an explicit refresh or stale-reference result. Server shutdown leaves no orphan browser process.

## Phase 7 Agent workflow and release

Make the feature dependable across sessions and supported environments. Documentation and tests grow in every phase; this phase completes integration and distribution.

1. Document installation, browser setup, command contracts, output inspection, error recovery, and examples for teaching, investigation, and proposed changes.
2. Add a short agent skill: inspect the model, choose a useful view, write the specification, render, inspect the image, revise if necessary, and present it with the explanation. Add optional external-result import and calculations to that workflow.
3. Add host guidance for T3 Code, Codex, and ordinary browsers. Keep host APIs out of the core artifact format. Verify each available integration before claiming it works.
4. Validate on Linux, macOS, and Windows using a documented runtime matrix. Test long paths, Unicode names, no-network export, and missing browser prerequisites.
5. Run snapshot and VS Code regression checks, including the repository's viewer synchronization workflow. Escape captions, labels, and imported cell values; do not execute content supplied in result files.
6. Ship synthetic examples for a filter explanation, a result table, arithmetic, a proposed relationship, and a concept lesson. Keep the supplied business fixtures outside public commits unless separately authorized; synthetic examples should be sufficient for repeatable tests.

Acceptance: a new agent session can produce and revise a useful visual explanation using only the documented CLI and skill. Each output is readable without the original development server. Query execution is optional and remains with the user's existing tools.

## Delivery order and boundaries

Phases 1 and 2 form the first usable release. Phase 3 adds externally supplied numbers. Phase 4 depends on Phase 3. Phase 5 depends on the view and explanation contracts, so it can be prioritized before calculations if visual proposals prove more useful. Phase 6 broadens coverage after the basic workflow works. Phase 7 completes the full release.

Within each phase, implement and validate one end-to-end example before expanding coverage. Each numbered work item is a candidate implementation task; split it further where one task spans multiple viewer surfaces. Every phase should leave an independently usable capability.

The original spec's comparison UI, `smv diff`, automatic lint cases, and built-in authenticated query runners are removed from this roadmap. They can be separate future features if requested. Multi-step visual explanations, model navigation, highlighting, offline artifacts, attached numbers, and an agent skill are retained.

## Decisions to resolve during development

- Which external query tools should receive first-class import adapters? Generic JSON works before this is decided.
- Which viewer surface follows graph and measures: Power Query lineage, matrix, or clusters? Prioritize using real explanation requests.
- Are exact currency calculations required in the first calculation release? Resolve before choosing numeric representation.
- Should proposed changes or numeric calculations come first after result import? Both are planned; sequencing can follow user demand.
- Which host environments can be exercised for inline rendering? Support portable images and HTML regardless of host availability.

These decisions do not block the first annotated-view implementation. No application code is changed by this plan.

## Implementation tracker

Parent feature: https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/78

Branch: `feature/visual-explanations`. Tasks remain open until the complete feature is reviewed for merge.

- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/79 — Capture an annotated graph view from the CLI
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/80 — Capture annotated measure explanations
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/81 — Build portable walkthrough artifacts
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/82 — Attach results from external query tools
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/83 — Explain arithmetic over supplied results
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/84 — Illustrate proposed relationships and formulas
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/85 — Capture matrix and cluster explanations
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/86 — Capture Power Query and report usage explanations
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/87 — Open BIM and discover models for explanations
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/88 — Serve and reopen explanation views locally
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/89 — Refresh local explanation sessions safely
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/90 — Document and package the agent explanation workflow
- https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/91 — Validate the complete feature before main merge

Implementation for tasks #79–#90 is present on the feature branch. Task #91 remains in validation pending cross-platform CI and owner review. See [validation evidence](verification/visual-explanations.md).
