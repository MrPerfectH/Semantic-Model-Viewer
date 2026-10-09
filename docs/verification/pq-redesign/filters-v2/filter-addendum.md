# Frozen filter addendum — pq-workspace/2

Source: parent/user steering to this independent thread, 2026-10-09. User approved revised v2 as a first draft and released UI implementation; original integration owns shared shell. This document records that later authorization and filter policy. The archived final contract's earlier “approval pending” header is historical and is superseded by this steering. Neither design approval nor this addendum is runtime acceptance.

- Canvas `setVisibleIds(ReadonlySet<string>|null)`; null means All. Silent projection, induced edges only when both endpoints visible. Complete registry/layout/analysis retained. Whole-model minimap remains, hidden nodes muted, visible/total indicated. Hidden nodes are not selectable until shell clears the filter. `reveal`/`focusNode` return false for excluded IDs.
- All / Connected / Disconnected counts use COMPLETE resolved incident edges, before search. Disconnected includes zero-incident status and parameter nodes. Semantic relationships and SQL/source co-location never count. No edge does not prove independence.
- Category hides canvas and library rows. Library search intersects the category. `setMatches` dims nonmatching visible category nodes; search does not remove canvas nodes or edges.
- Hidden selection preserves stable selected ID and inspector code/context. Show an explicit **Hidden by filter** banner and **Show all** action. Never force invisible reveal/focus or choose a guessed replacement.
- Show all preserves selection, clears category and search, reveals/focuses the selected target without automatic Fit and retains layout.
- Resolved M reference/library navigation to an excluded target clears category/search to All, announces **Filters cleared to show referenced query**, then selects/reveals/focuses the target. History captures prior category/search/viewport/selection/inspector scroll and focus. Back restores those atomically; an excluded prior selection gets the banner. Search exclusion means exclusion from the library result set; it is still only dimming in the canvas.
- Reset filters changes only category to All and search to empty. Model/layout/selection/inspector stay. Model or metadata generation reset clears selection/M DOM/history/category/search and cancels stale work.
- Empty category/search is an explicit zero-result state, not empty model. Shell owns filter state, counts, history, banner and announcements. UI modules own projection/muted minimap. Filtering does not recompute analysis or edit M/source.

Production execution remains HOLD until parent supplies the exact redesigned integration SHA. No new jobs/chats/production changes are authorized in this independent slice.
