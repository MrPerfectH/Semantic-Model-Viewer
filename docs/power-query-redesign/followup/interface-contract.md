# User follow-up: visible layout, explicit groups and readable query controls

Baseline feature29ae00b / runtime6b352ca. No source-model access, M execution, connector fetch or persistence expansion.

UI owner owns Canvas/Inspector modules and dedicated tests. Integration owns parser, shell/group filter/toolbar, registration/cache/generated assets. Existing evidence remains immutable. User supersedes the earlier complete-registry minimap policy: map objects/edges/bounds now follow the visible canvas projection; internal graph registry stays complete.

Canvas additive APIs: `placeAdded(id,{visibleIds,anchorId?,position?}) -> {x,y}|false`, silent positions-only. Integration calls only for new layout members before selecting them, captures layout Undo first, relocates that member near visible selected anchor else viewport center, preserves other/manual positions. Finite explicit drop position is exact. `center(id,{readable:true}) -> boolean` centers a visible existing selection even when already onscreen; missing/hidden false. Existing reveal remains navigation semantics.

Inspector owns visible primary neighborhood controls and a module-owned expanded M reading dialog moving the same code DOM. Default wrap true, explicit saved wrap false preserved. Additive `expanded` state and expand/reader-close focus descriptors are opaque to shell. Escape closes reader first and stops propagation; lifecycle reset/suspend/destroy cancels/removes stale reader DOM. Shell owns no reader geometry.

Groups: extract actual BIM model.queryGroups and partition/expression queryGroup string references; TMDL queryGroup declarations/folder properties and partition/expression queryGroup properties. Folder values remain exact nested path strings; absent group uses Unassigned. Explicit references without definitions retain their declared group name, not a guessed path. Unknown annotation payloads do not infer membership. Arbitrary group annotations are not claimed as supported grouping schemas. Logical association uses node metadata only, never query/table labels. Group filter intersects category/membership/focus projection and library search/list facet; full inventory/connectivity counts remain independent. Reset/Show all/lifecycle clear group filter; Back/Undo restore it; reference navigation clears obstructing group filter. Snapshot model export still excludes all PQ/group metadata.

Metadata references: Microsoft QueryGroup logical Folder and partition JSON queryGroup string:
https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.querygroup?view=analysisservices-dotnet
https://learn.microsoft.com/en-us/openspecs/sql_server_protocols/ms-ssas-t/8ec005fd-4901-4fb5-b71d-33e742fe05c0
