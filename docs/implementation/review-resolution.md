# Independent acceptance review and final corrections

Fable reviewed integration commit `1a5be4b` independently using real browser journeys,
retained downloads, offline snapshots, source inspection and adversarial adoption
probes. It found no blockers, three medium findings and four low findings. The
coordinator implemented the follow-up corrections below. These corrections were
verified by the coordinator and automated regression tests, not a second Fable review.

| Finding | Resolution | Evidence |
|---|---|---|
| M1: PNG contains relationship popover and routing notice | Exclude transient canvas chrome and declared overlays from the export filter | Real PNG generated with both overlays visible on screen, retained and visually inspected; filter regression |
| M2: demo Show all exhausts routing budget | Calibrate per-edge and total work bounds using obstacle count; retain honest dense-model fallback | Demo 43 tables/68 relationships completes without refinement limit, sampled 66–71 ms line renders; stress 160/274 retains all paths, sampled 208–218 ms, limit disclosed |
| M3: bottom query inspector overflows at 1440×900 | Constrain displayed height to available body space while preserving preferred height; recalculate after flow text changes | Browser checks at 1440×900 and 1024×900; at 1440, body client/scroll heights both755, inspector bottom870, effective height338.5, preference400 |
| L1: new reader assets lack fingerprints | Fingerprint every local JS/CSS entry and check its actual bytes | Complete asset-entry regression includes Reference and calculated readers |
| L2: narrow measure subject can be out of view | Explicit library selection resets opening placement even when reselecting the same measure; passive resize and snapshots retain camera behavior | 390px regression pans away, reselects Total Sales, and verifies the subject is visible; existing viewport/snapshot tests pass |
| L3: hover promises overlap cycling everywhere | Neutral relationship-details instruction; document cycling only for exact ties | Source change and existing nearest-path/tie interaction tests |
| L4: missing navigation/export guidance | Document keyboard glyph navigation, skip link, modal behavior, narrow reader, dense overview and snapshot disclosure | Updated viewer guide |

The demo remains a dense diagram: a sampled unrelated-card crossing count decreased
from Fable's19/68 to10/68 in Show all → Fit. This is an improvement, not a promise
of crossing-free global routing. The earlier geometry report's demo result described
its snapshot starting layout and must not be generalized to Show all. The stress
model still reaches its bounded routing budget. Focused views are the supported way
to read detailed relationships; all274 stress relationships remain represented
(274 visible paths plus274 hit paths). Timing samples describe this Linux machine,
not a universal interaction-latency guarantee.

## Verification

- Canonical viewer/host/CLI gate: **967 passed,3 environment skips,0 failures** (970 total).
- Combined browser gate: **51 passed,0 failures,0 skips**, including offline `file://`
  snapshot reopening with networking blocked and the feature-specific readers.
- After the final bottom-inspector ARIA minimum correction, relevant unit tests and
  the UI browser suite were rerun separately. Do not add overlapping suite totals.
- Original dirty checkout: all4,058 baseline file hashes still match.
- Viewer asset hashes, extension synchronization and packaged plugin assets checked.

Evidence root: `/home/harry/Reports/smv-implementation-2026-11-02/`.
Independent report: `fable-final-review/REPORT.md`. Follow-up evidence:
`post-review/` (gate logs, probes.json, tables-export.png, pq-bottom-1440.png,
preservation.json). Earlier failed runs are retained and superseded by the stated
passing runs; the initial follow-up browser harness had a repeated top-level `const`
which was fixed before the passing run.

## Acceptance boundaries

The branch is ready for product review; it is not merged or released. Windows
portable/Power BI, macOS launcher, actual VS Code host execution, screen-reader
output and real high browser zoom remain host acceptance checks. Browser semantics,
computed contrast and simulated personas do not substitute for real-user interviews.
Research-only ideas and the real-user study remain in the linked research backlog
and issue #116; this change implements the confirmed corrective scope, not every
speculative feature from the audits. Very short windows retain scrollable minimum
panes rather than shrinking every control until it is unusable.
