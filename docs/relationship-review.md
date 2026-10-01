# Relationship exploration review

Reviewed 2026-09-07 against the isolated `codex/model-explorer-ux` worktree. This is an implementation recommendation, with the data contract checked against official Microsoft documentation.

## What the current app can support

The viewer relationship shape is `{from, fromCol, to, toCol, fromCard, toCard, inactive, both}`. Both the browser importer (`Models/tools/viewer/js/tmdl-parser.js`) and Python converter produce it. The bundled model contains 51 tables, 110 relationships, 63 many-to-one relationships, and 47 many-to-many relationships. All bundled relationships are active and single direction. Therefore the bundled model cannot validate inactive or bidirectional behavior; synthetic fixtures are necessary.

`GraphCanvas.distMap()` currently follows relationships in either direction, including inactive relationships. It works as a structural neighborhood. It is unsuitable for directional filtering actions. The edge chips already correctly show a single filter arrow from `to` to `from`. However, the edge color identifiers `out` and `in` currently describe lookup endpoints rather than filter flow. Reusing those labels in the new UI would invert user expectations.

## Semantics and user-facing language

TOM's `OneDirection` means `to → from`, including many-to-many relationships. `BothDirections` adds `from → to`. `Automatic` is engine-resolved, so a metadata viewer should preserve and surface it instead of silently claiming a direction. Cardinality and inferred fact/dimension roles must not replace the actual direction metadata. [Microsoft CrossFilteringBehavior enum](https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.crossfilteringbehavior?view=analysisservices-dotnet)

Active relationships propagate ordinary filters; inactive relationships require a calculation to activate them. Default filtering exploration to active relationships. An optional “Include inactive relationships” control can show potential paths, with an explanatory label. [Microsoft active and inactive relationship guidance](https://learn.microsoft.com/en-us/power-bi/guidance/relationships-active-inactive)

Recommended action labels:

| Action | Traversal | Default |
| --- | --- | --- |
| Connected tables | Undirected relationship graph | Direct; inactive can be included explicitly |
| Tables that filter this table | Reverse filter arcs, starting at selection | Direct; active only |
| Tables filtered by this table | Forward filter arcs, starting at selection | Direct; active only |
| Direct / All levels | Maximum distance 1 / unrestricted | Explicit control |

“Dependent tables” is ambiguous: it may mean relationships, calculated-table DAX dependencies, or Power Query lineage. Use “Connected tables” for this feature. Reserve “Dependencies” for expression references. Actions should add matching tables to the current canvas; offer a separate focus action if replacing visible membership is desired. Keep the root visible even when it has no neighbors. Connected-table results should not disappear because a disconnected-table display toggle is off.

## Pure graph API

Implemented `Models/tools/viewer/js/relationships.js`, a dependency-free module independent of DOM and canvas positions. It exposes browser global `RelationshipGraph` and CommonJS exports:

```js
RelationshipGraph.traverse(model, rootNames, {
  direction: 'connected', // 'incoming' | 'outgoing'
  maxDepth: 1,            // Infinity for all levels (API default)
  includeInactive: false  // active-only API default for every direction
})
// => {
//   names: Set<tableName>,
//   distances: Map<tableName, minimumHopDistance>,
//   predecessors: Map<tableName, {table, relationship, index}>,
//   unresolved: Array<relationship>,
//   explanation: string
// }
RelationshipGraph.pathTo(result, tableName)
// => [{from, to, relationship, index}, ...], [] for root, null if unreachable
RelationshipGraph.explanation // reusable model-level limitation text
```

The caller sets the inactive policy explicitly. The implementation uses `Map`/`Set` so names such as `__proto__` are safe. It builds adjacency once per call. For each valid relationship, it adds both arcs for connected mode; otherwise it adds `to → from`, and adds the reverse arc only when `both` is true (or the retained raw behavior is `bothDirections`). It reverses the arcs for incoming mode. It ignores dangling table endpoints and seeds only valid roots. Queue-based breadth-first search with a visited map has `O(tables + relationships)` complexity. The result preserves shortest hop distances, deduplicates tables, and terminates on cycles without mutating model metadata.

The predecessor is an explanation of one shortest metadata path, not proof of the path the DAX engine will choose. `pathTo()` returns steps in traversal order; incoming traversal runs opposite to actual filter propagation. Retained `automatic` or unknown raw behavior is returned in `unresolved` and excluded from directional traversal, but remains usable for connected traversal. Unresolved collects all eligible unknown edges in the model, not only those near the selected root.

## Tests that protect real behavior

Implemented 12 regression tests using Node's built-in test runner; no new production dependency is needed. Run `node --test Models/tools/viewer/tests/relationships.test.js`. All 12 passed on 2026-09-07; `node --check Models/tools/viewer/js/relationships.js` also passed. The canvas integration criterion remains the parent implementation's responsibility.

1. Chain `Category → Product → Sales`: incoming direct from Sales is Product; all levels also includes Category. Outgoing all levels from Category reaches Product and Sales. Incoming Category and outgoing Sales contain the root only.
2. Fork `Product → Sales ← Date`: outgoing Product must not reach Date. Connected Product reaches Date in two hops.
3. Bidirectional `Bridge ↔ Customer → Sales`: incoming/outgoing traverse both directions over the bridge and obey the single direction at Sales.
4. Inactive `ShipDate → Sales`: excluded from ordinary filter traversal; included when the option is enabled; connected mode can include it.
5. Many-to-many single-direction relationship: direction remains `to → from`, regardless of cardinality or assigned table role.
6. Cycle and duplicate parallel relationships: traversal terminates and each table is returned once at shortest distance.
7. Disconnected table, empty root list, missing root, dangling relationship endpoint: safe empty or root-only results.
8. Multiple roots: compute the union with minimum distances. A table already supplied as a root remains distance zero.
9. Root/table name `__proto__`, non-ASCII characters, apostrophes: no object-key collisions or name truncation in traversal.
10. Canvas integration: blank layout contains zero cards/edges; adding roots and traversal results reveals only edges whose endpoints are visible; current canvas membership survives save/restore.

## Data and scope limitations

- Browser and Python importers reduce cross-filter behavior to `both`; they currently lose `automatic`. Preserve the raw enum in a future schema revision and retain `both` for backward compatibility. Explicit automatic values should be marked unresolved or excluded from definite directional results.
- Neither importer retains `securityFilteringBehavior`. RLS propagation is a separate metadata property; the new UI must not describe ordinary filter reachability as an RLS simulator. [Microsoft relationship object schema](https://learn.microsoft.com/en-us/analysis-services/tmsl/relationships-object-tmsl?view=sql-analysis-services-2025)
- Graph reachability describes potential paths in the loaded model. DAX can modify relationship behavior with `USERELATIONSHIP` and `CROSSFILTER`, or create virtual filtering with `TREATAS`. Engine ambiguity resolution uses path priority and weights. A simple BFS should not promise the exact effective context of a measure. A compact helper text such as “Follows the model’s active filter directions” is sufficient. [Microsoft model relationships](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand)
- The parsers omit relationship names, table storage modes/source groups, and calculated-table expressions. These omissions limit stable edge IDs, composite-model classification, and expression dependency analysis.
- TMDL quoted identifier parsing does not handle escaped apostrophes correctly. The relationship parser and the measure reference scanner use simplistic quoted-name regular expressions.
- `App.prepareModel()` treats every qualified `Table[Name]` reference as a column, even when it names a measure. Its comment stripping precedes string handling, so comment-like text in strings can also distort dependency extraction. This should be treated as a separate measure-analysis correction; do not claim complete semantic dependency resolution from the current regex index.

## Acceptance criteria for the first implementation

Provide a discoverable blank canvas action, a searchable table catalog with an add button (keyboard accessible) and optional drag-and-drop, the three exploration actions above, a direct/all-levels selector, and visible canvas membership counts. Save membership with positions per model and named layout. A minimap should follow the same visible membership as the canvas and show the viewport rectangle. Keyboard/button navigation must remain available alongside minimap dragging. No model-file changes are required for any of these view operations.

## Independent explorer implementation review

Reviewed the new explorer and canvas integration without browser automation. Added `Models/tools/viewer/tests/explorer.test.js`, which loads the real explorer/canvas methods with minimal DOM, storage, and canvas stubs. The tests assert outcomes rather than DOM markup.

The review found five issues that were corrected by the parent implementation: drop placement did not persist positions; undo did not persist restored positions; adding another table rearranged existing manually placed tables; restoring a preset retained focus on tables absent from the new membership; and removing an endpoint or clearing the layout could leave an obsolete relationship popover open.

All 15 explorer tests now pass. They cover model-scoped saved membership, deleted-table cleanup, add/remove/undo, persisted drop coordinates under pan/zoom, position persistence after undo, stable existing placement, cleared hidden selections, obsolete popovers, directional relationship expansion, minimap click coordinates, canvas membership visibility, and named presets including an empty canvas. Together with the 12 graph tests, all 27 tests pass with:

```sh
node --test Models/tools/viewer/tests/explorer.test.js Models/tools/viewer/tests/relationships.test.js
```

These tests do not validate real layout dimensions, touch gesture behavior, browser drag event delivery, or visual rendering. The parent browser review covers those integration surfaces.
