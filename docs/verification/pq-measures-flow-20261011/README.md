# Power Query: Measures flow, Tables canvas

Runtime: `95dc83d1ea78dc62918246610b89a5ba4a619e47` (on `c1c81aa9ea11208ef660d94c406bb8c60da7b4b4`). Baseline: `7748239e804dd0e4b7f4c09f7df250b73259f131`.

## Observed problem and change

The actual Measures tab keeps an analyzed measure stable while a graph click compares another expression. Its upstream and downstream traversals are separate. The previous PQ view instead followed every inspected selection, defaulted to the full registry, and could switch direction mid-traversal, including shared-source co-consumers and merge siblings.

- A library name now analyzes that query's upstream and downstream flow. A card or M reference inspects within it without silently replacing the analyzed root. **Analyze this query** explicitly starts another flow; the optional lock keeps the current flow even when selecting other library rows.
- Directed walks never switch direction midway. A parameter's downstream flow does not include unrelated sibling parameters just because they feed the same consumer. Graph extraction, IDs, M source and reference occurrences are unchanged.
- Opening a flow compacts its members left-to-right; a large flow starts at a readable root. Explicit Fit overview still fits every retained member. Hide unrelated compacts only the visible set. Back and Undo restore positions as well as membership, filters, root, inspector, viewport and body scroll.
- Tables-style +/−, Blank layout, Show all, Dim/Hide, related-object additions/removal and Undo remain. Show all rebuilds a coherent full overview when leaving an analyzed flow, but does not rearrange an ordinary custom diagram. Full metadata inventory and filters remain available.
- Existing shared Tables path/arrow/stroke primitives and the repaired non-overlap router are unchanged. Exact M reader, docking and provider classifications remain.

## Fresh verification

- Linux task-local Node 22.23.3: **650/650**, zero failures/skips, full `npm test --prefix vscode-extension` at runtime above. Focused flow tests exercise sibling/co-input exclusion, stable inspection, lock, explicit reroot, exact Back layout, membership Undo, Show all and readable framing. Inspector tests cover the new action and stale callbacks.
- Actual registered local TMDL model browser, 84 objects / 77 resolved edges: **six workflow groups passed**. Full overview renders all 77 paths. Two-object flow fits at ~110%, horizontally aligned 276-pixel cards. Parameter flow retains 26 directed objects, excludes sibling parameters and starts at 85%; direct Hide produces the parameter and its consumer. Card selection retains the numeric viewport and positions. Explicit Analyze/Back, remove/Undo, lock/library/Back, Show all, Blank/manual additions, compact Arrange and wide exact-code reader pass. See `browser-summary.json`.
- Initial T3 actual-model two-object flow passed. Two consecutive snapshots timed out (`Preview automation snapshot timed out after 15000ms`), then click/evaluate reported no automation host. Remaining checks used a fresh isolated Chrome profile, actual trusted pointer controls and the registered app. Import preparation used the app's file handler on the authorized local model; this is not native folder-chooser acceptance. One distance-selector change used a DOM change event; the tested Hide action was trusted input.
- Package: 45 entries, 33 runtime assets, 31 valid cache keys. Canonical, generated media, live Mac HTTP and VSIX bytes match. No model/test/fixture/evidence payload. SHA256 `0c01580371214fa1f0ee6e82c9ef7ab665c88496eac5f37d2cc2a5d86a878f40`. See `package-runtime-audit.json`.

## Retained diagnostics and boundaries

Initial focused run 65/66 failed because the association test stub intercepted the old navigate method; it now intercepts the new explicit analyze method and retains the exact partition-selection assertions. Initial browser setup omitted showing the import dialog; the second run compared Map insertion order instead of ID→position equality; the third used an unscoped selector matching the hidden Tables button. Raw diagnostic logs remain in the task-local `/tmp/pq-measures-flow-*` files; the final driver sorts ID-keyed positions and scopes PQ controls. No product failure was waived by those corrections.

Actual model files, raw M and actual-model screenshots are not added to repository evidence. Local screenshot review confirmed the compact pair, direct parameter connection and readable inspector; browser receipts record exact-source equality as booleans. Existing imported-model cache behavior is unchanged; shared snapshot exclusion does not mean M is never stored locally.

No new installed/native VS Code acceptance, independent reviewer verdict or user product-fit approval is claimed. Prior 200%/large-model/source-privacy evidence remains historical, not rerun under this change. No main merge or release.
