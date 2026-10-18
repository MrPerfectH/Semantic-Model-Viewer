# #37 registered integration evidence — 2026-10-08

Checkout: `feat-power-query-metadata-lineage`, branch `feat/power-query-metadata-lineage`.
Prerequisite: `5376569df1c05c57eb5961e60936866462194e10` (independently verified).
Owned worker commit: `d1f87479997fcae75683f4ef42ad3a4c0676b78d`, cherry-picked here
as `6158abb` (only lineage module, CSS and focused/supplementary fixture tests).

Registration loads dependency analysis, then lineage, then the shared inspector.
Both lineage JS/CSS are included in the offline snapshot runtime allowlist. Model
export remains unchanged and excludes raw M. Canonical runtime assets sync from
`Models/tools/viewer` into generated extension media; the expected count is 24.

## Source/reset review and preserved failure

Graph roots use table + selected partition; inspected shared code is a highlight,
not a root change. Graph state is scoped by app/model/metadata identity and partition,
with host-owned listeners. Duplicate roots, missing/non-M partitions and changed
metadata are explicit. Focus restoration uses `preventScroll`.

A registered T3 browser probe found a shared-inspector stale callback defect:
retain an old graph Open code button, replace the model, open a newer inspector,
then click the retained button. Before correction, the newer dialog was closed
(`before: true`, `after: false`). The hook's old `openCode` callback called a dismiss
closure that unconditionally closed the app's current overlay.

Fixed in the owned shared inspector: code navigation checks captured model,
metadata identity and overlay ownership. Old callbacks remove only their old overlay
and never close or focus a newer inspector. Regression failure preserved in
`/tmp/pq37-stale-callback-regression-before.log`; corrected focused run in
`/tmp/pq37-stale-callback-regression-after.log` (6/6). No graph worker files were edited.

## Registered T3 browser / large-model measurements

URL `http://localhost:8943/`, T3 tab
`tab_14_9fb37a1a-9d5e-4eca-a366-3aa050ab491f`, viewport 1280×800.
The actual registered app loaded the prior synthetic BIM via its existing model
loader. Table Sales / Current displayed two graph nodes and one upstream reference,
exact partition M, dependency navigation and visible partial-analysis notices.

Performance baseline measured whole `PowerQuery.open` synchronous work, including
unchanged #36 `render` (which internally calls full `graph(metadata)`) and #37
render, rather than timing only the bounded graph. Synthetic inputs were injected
through the real BIM parser and app `_applyModel` without persistence or source edits.
These are browser DOM/work timings, not native VS Code or frame-presentation proof.

- 351 expressions + one partition, chain: 45.7–51.0 ms total; 44.1–49.0 ms in #36.
- 351 expressions + one partition, 20-edge cyclic fan-out: 23.9–28.0 ms total;
  22.4–26.5 ms in #36.
- 701 expressions + one partition, chain: 58.4–58.6 ms total; 56.9–57.1 ms in #36.
- 701 expressions + one partition, 20-edge cyclic fan-out: 39.2–40.8 ms total;
  37.5–39.4 ms in #36.
- Wide root with 351 direct references / 352 metadata nodes: 21.6 ms total,
  10.9 ms in #36; 351 dependency buttons, 41 visible graph nodes, 40/page paging.

#36 dominates work and is uncached, but these representative measured opens did not
justify a targeted caching repair. The chain/cyclic inputs reached its cycle-work
limit and displayed explicit uncertainty; cycle analysis is not claimed complete.
Graph display caps alone are not the basis of this performance conclusion. More
complex/large real models may differ and are an independent acceptance concern.

## Verification boundary

The worker's 258/258 and 1/1 supplementary Chrome results predate this registration
and shared-inspector correction; they are not this candidate's registered acceptance.
The final integrated commit must receive a fresh full suite, `sync --check`, clean/diff
checks and registered T3 navigation/reset checks. Exact final hashes/results are sent
to the coordinator and recorded on #37 after those runs. #38 remains the independent
combined/browser/package/native acceptance gate. No main merge or release.
