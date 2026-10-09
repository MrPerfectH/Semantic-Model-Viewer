# Approved pq-workspace/2 filter addendum — 2026-10-09

User approved the Astra v2 first draft and requested standalone/disconnected filtering.
This addendum is approved implementation scope; historical proposal HOLD text remains
preserved in the copied contract as design history, superseded by that authorization.

Canvas `setVisibleIds(ReadonlySet<string>|null)` is a silent visibility projection.
Null is All. Edges show only when both endpoints are visible. The complete registry,
layout and analysis remain intact. The whole-model minimap mutes hidden nodes and
reports visible/total; hidden nodes cannot be selected until filters are cleared.

All/Connected/Disconnected counts derive from COMPLETE resolved incident-edge sets
before search. Disconnected includes status/parameter nodes with zero resolved
incident edges. Zero edges never proves independence; uncertainty remains explicit.
Category hides canvas and library rows. Library search intersects category;
`setMatches` dims visible canvas nonmatches and does not change canvas membership.

Hidden selection retains its stable ID and inspector source/context. A visible
“Selected object hidden by filter” banner offers Show all. That action clears category
and search, then reveals/focuses the selected target without Fit or layout reset.

Resolved reference/library navigation to an excluded target clears category/search
to All and announces “Filters cleared to show referenced query.” Back records and
restores PRIOR category/search/viewport/selection/inspector scroll and focus atomically.
A restored hidden selection receives the banner; it is never forcibly revealed.

Reset filters sets All/empty search only, preserving model/layout/selection/inspector.
Model or metadata generation reset clears selection, source DOM, history, search and
filters, terminates jobs and invalidates late messages/restores. Empty filter/search
shows 0 results rather than falsely claiming an empty model.

Ownership: shell controls, counts, history and announcements belong to integration;
visibility projection and muted whole-model minimap belong to the canvas owner.
No M execution, source edits or analysis recomputation is introduced by filtering.
