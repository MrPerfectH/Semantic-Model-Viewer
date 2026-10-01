# Measures workflow review

Code review of the isolated UX worktree, 7 September 2026. This document records implementation evidence; it does not claim browser or visual verification. The parent agent owns the interactive audit. No applicable `AGENTS.md` was present in this worktree.

## Existing capabilities to preserve

- Searchable display-folder hierarchy; folders may be nested or shared.
- Upstream and downstream dependency DAG, capped at 500 nodes, with expansion and hover path emphasis.
- Analyzed and pinned DAX cards, syntax highlighting, and clickable bare measure references.
- Hidden-measure flags, optional direct report-usage badges, and navigation to the home table.
- Browser-local operation and no new service requirement.

## Highest-impact findings

| Priority | Evidence | User consequence | Bounded change |
|---|---|---|---|
| High | `measures.js`, `buildSelectedMain`: graph is above DAX and has a 340px minimum height plus a viewport-derived maximum. DAX follows after header, legend, and graph. | A selected measure's primary artifact can require page scrolling; comparison also appears below the graph. | Put a clearly titled DAX workspace before the graph, or offer visible Overview / DAX / Dependencies modes. Keep comparison adjacent to the selected formula. |
| High | `buildSelectedMain`: DAX uses `minmax(430px,1fr)` while main pane width is remaining viewport width after a 230–600px rail. | A narrow main pane cannot shrink cards to fit. | Use `minmax(min(100%, 360px),1fr)` or responsive workspace CSS, preserving one-column cards on narrow widths. |
| High | `buildRows`: query matches measure name and folder only. `renderRail` emits an empty fragment for zero results. | Analysts cannot locate a measure by table or DAX function and receive no recovery action when search fails. | Search names, home tables, folder paths, and DAX; add table and visibility filters; show matching / total count and a clear-filters empty state. |
| High | `buildSelectedMain` / `renderFlow`: graph can only be scrolled or dragged; global zoom controls are hidden in measures mode (`topbar.js`, `zoomOn`). | Large flows are difficult to survey and the analyzed measure is difficult to recover after panning. | Add Fit, 100%, zoom in/out, and Center analyzed controls. Scale canvas and its scroll footprint together; center using scaled coordinates. |
| High | `renderMain` rebuilds DAX DOM without resetting `_daxKey`; `renderDax` key excludes `modelKey`. | If a main rebuild preserves the same measure/pin/usage key, `renderDax` can return while the new DAX grid remains empty. | Reset `_daxKey` when rebuilding main; include model identity in the DAX key. |
| Medium | `buildGraph` uses delayed single-click pinning and double-click rerooting. DAX card only exposes Unpin. | An important action depends on a pointer gesture explained in low-emphasis helper copy; keyboard users have no equivalent explicit reroot action. | Add an “Analyze this measure” button to the comparison header; use Enter to analyze and Space to pin on graph buttons with accessible labels. |
| Medium | Rail button state is represented in style only; folder buttons lack `aria-expanded`; search has only a placeholder and explicitly removes outline; node badges depend on titles. | Selection and folder expansion are not announced; keyboard focus in search is weak. | Add input label, `aria-current` for analyzed row, `aria-expanded` for folders, descriptive badge labels, and shared focus-visible styling. Preserve focused rail item across rerenders where possible. |
| Medium | DAX body uses 11px text, wraps anywhere, has a fixed 320px maximum, and offers no copy action. Parsed `fmt` is not displayed. | Analysts have little control over formula reading and copying. | Use 12–13px monospace with adjustable wrapping, Copy DAX with clear success/failure status, semantic pre/code content, and a format-string metadata chip. |
| Medium | Empty state uses only keys in `msrUsedBy`, so models with measures but no inter-measure references show no starter choices. The copy always promises “Most referenced”. | A valid simple model appears less useful and an empty model receives misleading copy. | Show measure count; list most referenced if present, otherwise first measures; explain “no measures” separately. |
| Medium | `buildRows` combines measure and column dependency counts in one `→` value while graph statistics contain only measures. | Library and graph counts are difficult to reconcile. | Use explicit “uses N measures / used by N” tooltips or labels, and separate column references in detail metadata. |

## Reliability boundaries requiring a separate parser change

`app.js:prepareModel` explicitly classifies all table-qualified references as columns. A qualified measure such as `'Metrics'[Revenue]` is therefore missing from the measure dependency index. Its tokenizer in `measures.js:daxToks` makes the same simplification. Regex stripping also runs comment removal before string handling. A string containing `//` or `--` can consequently truncate real references after the string. These issues affect trust in the graph and should be handled with focused parser fixtures, ideally by sharing a token stream between dependency extraction and syntax rendering.

The graph remains a static reference map, not an execution plan or proof of report usage. Direct report-usage data must not be relabeled as “unused”: a measure without direct usage may feed a used measure. In particular, the “no report usage” tooltip currently hardcodes Analytics Overview and should use the imported report name or neutral wording.

## Proposed first implementation slice

Keep changes within `measures.js` and a dedicated measures stylesheet, with small shared CSS additions only if coordinated with the parent.

1. Establish a stronger library header, search across available fields, table/visibility controls, explicit counts, and no-results recovery.
2. Make DAX immediately available with readable typography, Copy DAX, wrap control, comparison action, and responsive cards.
3. Add graph navigation controls and a graph title clarifying direction. Keep the existing DAG algorithm and pin behavior to limit regression surface.
4. Fix render-cache invalidation; add accessible control labels, selected/folder states, and input focus treatment.
5. Verify actual UI at desktop and narrow viewport sizes; select a deeply connected measure, pin a dependency, analyze it, return to the original measure, and check both DAX cards. Test search by name/table/DAX, zero matches, empty/simple models, and switching two models with a shared measure name.

Later work can add a dependency table alternative, minimap, analysis history/bookmarks, validated DAX reference parsing, dependency scope/depth controls, and report-health summaries. Those additions should follow evidence from the first usable workspace rather than expanding the initial patch indefinitely.

## Implemented in this worktree

The first slice is now implemented in `Models/tools/viewer/js/measures.js` and `Models/tools/viewer/measures.css`. It provides a library with search across names/folders/tables/DAX, visibility and home-table filters, explicit matching counts, and no-result recovery. An overview supplies model counts and starter measures, including models without inter-measure references.

The analysis workspace keeps dependency graph and DAX visible together, with dedicated DAX and Dependencies modes. It includes source-preserving syntax highlighting, qualified/escaped measure reference links, copy feedback, line wrapping, readable formula text, explicit comparison analysis/clear actions, format metadata, and expandable column references. Graph navigation starts at readable 100% centered on the analyzed measure; Fit all is an explicit overview action. Keyboard Enter analyzes a graph node, while click/Space compares. Focus states and selected/folder labels are exposed for keyboard and assistive technology use.

Cache invalidation now includes model identity and resets when the analysis DOM is rebuilt. `tests/measures.test.cjs` contains six focused checks covering search/filter behavior, multi-folder counts, exact DAX source preservation with escaped/qualified references, model-switch cache invalidation, and graph fit/center coordinate behavior. All six pass under `node --test tests/measures.test.cjs`; `node --check` and `git diff --check` also pass. Browser verification is performed by the parent agent.

The separate application correctness agent repaired the dependency-index issues described above; those baseline findings are retained to explain why the fixes matter. Full DAX semantic analysis, report-health validation, and the broader TMDL parser edge cases still need their own release validation.
