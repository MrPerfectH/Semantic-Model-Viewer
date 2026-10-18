# Power Query acceptance — issue #38

Execution update: independent checks completed at repaired candidate
`234dfae6b5588364ef49d559b72a3235204655d0`; see
[evidence report](pq38-evidence-report.md). Preparation notes below retain their
original checkpoint and are not the final acceptance status.

Parent: https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/33
Gate: https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/38

## Status and scope

Prepared 2026-10-08. **Waiting for the coordinator's integrated #34–37 candidate hash.**
Discovery checkout: `cf2898233bbbca02907b0f83042c093901a60595`.
This document is a plan, not an acceptance result. No feature acceptance, regression
run, VSIX package, or installed-host verification has been performed for the candidate.

Own acceptance fixtures/checks and evidence only. Do not modify feature slices,
source models, or generated viewer sources to fix failures. Do not evaluate M,
connect to model endpoints, retrieve rows, merge main, or publish a release.
Use newly created synthetic test inputs only; preserve existing fixture files.
No new parser/UI interface is prescribed here. Bind checks to the actual integrated
interfaces after the candidate arrives.

## Acceptance matrix

All rows below are pending. Each needs its own observed result and evidence reference.

| ID | Gate | Independent check | Required evidence |
| --- | --- | --- | --- |
| A01 | Revision | Record full candidate hash, prerequisite hashes, branch, worktree, UTC time and clean/dirty state before checks; record acceptance commit separately | Git output and diff; distinguish candidate bytes from added acceptance tests |
| A02 | Regression | Run complete documented viewer/extension suite, plus candidate PQ tests; reject skipped required checks as passes | Commands, exit codes, test totals, failures/skips and full logs |
| A03 | Distribution | Sync canonical viewer, check exact generated assets, package locally, inspect VSIX contents | Sync/check logs, VSIX SHA-256, manifest version; packaging alone does not establish host behavior |
| A04 | #34 text fidelity | Import equivalent TMDL and BIM inputs; select every partition; compare displayed/copied M with fixture oracle | Exact string assertions and browser observations; document serialization/deindent and newline conventions |
| A05 | #34 states | Select M, calculated/non-M, empty and missing source cases; switch tables and models | Explicit states, no stale code; screenshots and interaction sequence |
| A06 | #35 library | Search/open shared queries, declared parameters, inferred parameters and functions; name collisions and repeated imports | Accessible entries, classification provenance, stable distinct identities and exact code |
| A07 | #36 analysis | Verify direct edges against independently authored oracle for quoted names, comments, strings, local scope and functions | Positive and negative edge assertions; no regex-only inferred oracle |
| A08 | #36 uncertainty | Missing names, dynamic references, unsupported syntax and cycles remain represented without certainty claims | Unknown/unresolved markers, bounded analysis, user-visible explanations |
| A09 | #37 graph | Select table/partition, expand upstream nodes, open node code, follow cycle/missing nodes, navigate by keyboard | Actual browser interaction, focus trace, screenshots; bounded graph expansion |
| A10 | #37 readability | Generated synthetic large graph and long identifiers; fit/zoom/pan, readable labels and keyboard reachability | Recorded fixture counts, viewport, timing, screenshot and observed limits |
| A11 | Isolation | Switch fixture models with overlapping names; return to relationships, DAX and matrix; refresh same fixture | No prior model code/graph state; original views still function |
| A12 | Metadata completeness | Compare parsed inventory to authored input inventory: all tables, partitions, shared expressions, kind and text | Counts plus per-item comparisons; missing metadata reported rather than guessed |
| A13 | Snapshot privacy | Save actual HTML from PQ views; inspect payload and whole HTML for raw-M and endpoint sentinels; reopen offline and re-export | Export bytes/hash, sentinel assertions, no stale raw M, explicit unavailable metadata state |
| A14 | Read-only | Hash synthetic source files before/after browser and VS Code steps; observe network and host operations | Same source hashes, request observations; local metadata reads distinguished from model data access |
| A15 | Packaged VS Code | Install exact candidate VSIX in isolated editor profile; open synthetic workspace, select TMDL/BIM, inspect PQ/library/graph, refresh, snapshot | Editor executable/version, profile, VSIX hash, rendered UI and actual interactions |
| A16 | Documentation/review | List observed input support, text normalization, unsupported analysis, snapshot policy and remaining gates | Evidence report and reviewable PR; coordinator/user owns approval before merge |
| A17 | #37 focus/navigation | Pan/zoom graph, keyboard-open code, return/expand; verify viewport survives focus changes, exact opened code, partition isolation and model reset | Before/after viewport and scroll values, active focus, expected code oracle; verify reported `preventScroll` repair independently |
| A18 | #37 responsive controls | Exercise widths 1280 and 760 CSS pixels with recorded height; navigate by keyboard and close using Escape | Screenshots, readable labels/code, focus destination and Escape behavior at each width |
| A19 | Whole-inspector performance | Measure inspector open, dependency navigation and expansion on large synthetic metadata, including above 300 nodes | Per-action timings, environment and metadata counts; inspect actual full-analysis path independently of visible graph caps |

## Representative fixture catalog

Prepare independent synthetic inputs under an owned acceptance-fixture directory after
release to implement. Do not reuse private/business models or overwrite existing fixtures.
Keep an input inventory and exact expected decoded M strings outside parsed output;
record SHA-256 for every input. Equivalent BIM uses both string and line-array expression
representations. TMDL uses tabs and spaces, quoted declaration names and multiline blocks
where supported by the format. Report unsupported valid formats as limitations/failures.

| Fixture | Contents and oracle |
| --- | --- |
| F01 Fidelity | Two M partitions on `Acceptance Sales`, quoted partition names, multiline let/in, blank lines, indentation, comments, doubled quotes, Unicode and CRLF/LF variants; compare semantic expression text with explicit deindent/newline rules, never trim each line |
| F02 Shared metadata | `Base Query`, `Quoted Query`, scalar `pRegion` with declared parameter metadata, an unannotated scalar, `(x as number) as number => x + 1`, unused query; preserve all entries and distinguish declared/inferred classification |
| F03 Scope | Shared `SharedValue`; `let SharedValue = 1 in SharedValue` has no shared edge; `let x = SharedValue in x` does; function parameter named `SharedValue` shadows it; nested scopes and record-field selectors do not create spurious shared edges |
| F04 Lexical | `#"Base Query"` resolves; `// Base Query`, `/* Base Query */` and `"Base Query"` do not; escaped quote identifiers and forward references resolve only where supported |
| F05 Uncertainty | Missing shared name, dynamic `Expression.Evaluate`, `#shared` lookup, unsupported construct, self-cycle and two-query cycle; no evaluation, no silent complete-lineage claim, expansion terminates |
| F06 Absent/mixed | Calculated partition, non-M source type, empty expression, missing source, no partitions and no shared expressions; explicit states without fabricated M |
| F07 Identity/reset | Same names in table and shared-query namespaces, multiple partitions, two models with overlapping names but different code; repeat import and model switch detect collisions and stale state |
| F08 Scale | Deterministically generate a declared count of queries, long labels, branching DAG, disconnected nodes and cycle; capture actual counts and observed navigation limits |
| F09 Privacy | Unique synthetic markers only in partition/shared M and endpoint metadata: `PQ_RAW_ONLY_38`, `PQ_SHARED_ONLY_38`, `https://pq-private-38.invalid/`, `PQ_CREDENTIAL_ONLY_38`; default snapshots must exclude them from payload and full HTML, including after navigation/search/copy/re-export |

Example dependency oracles (static text, never executed):

```text
let Source = #"Base Query", Result = Source in Result
  expected direct shared dependency: Base Query
let SharedValue = 1, Result = SharedValue in Result
  expected direct shared dependencies: none
(SharedValue as number) => SharedValue + 1
  expected direct shared dependencies: none
let Result = Expression.Evaluate("Base Query", #shared) in Result
  expected: dynamic/unsupported uncertainty, no asserted resolved Base Query edge
```

## Execution once the candidate is supplied

1. Inspect delivered commit and prerequisite ancestry without merging main. Preserve
   other edits; coordinate before applying candidate commits to this isolated worktree.
2. Inspect actual PQ interfaces and worker fixtures, then add only independent acceptance
   fixtures/tests needed to cover this matrix. Record any working-tree additions in the
   evidence so results are attributable to exact bytes.
3. Capture logs for the documented suite (`npm test` in `vscode-extension`) and
   `node vscode-extension/scripts/sync-viewer.js --check`. `npm test` syncs generated
   ignored assets; do not treat a pre-sync check as post-sync evidence. Run candidate PQ
   checks explicitly if the suite's file patterns omit them.
4. Use T3 collaborative preview: `preview_status`, open if needed, navigate to the
   candidate served locally, then interact with actual controls. Do not claim script
   harness checks establish manual navigation or installed VS Code behavior.
5. Run documented real-browser regressions when reachable. Their optional skips are
   recorded as skips. They are supplementary to PQ navigation acceptance.
6. Package via the repository's `npm run package`; inspect included runtime assets and
   absence of fixture/model datasets. Record package digest before host installation.
7. Use reachable VS Code or VS Code Insiders with isolated user-data/extensions folders
   and synthetic workspace. Preserve the user's existing installation and profile.
   CLI availability is preparation evidence only; confirm rendered installed-package UI.
8. Download/reopen/re-export snapshots offline, inspect bytes and privacy markers, and
   compare source-input hashes. Never click source annotation/write-back controls or run
   Semantic Model Cleaner. Do not fetch connector endpoints or execute fixture M.
9. Report each gate as pass/fail/blocked/not-run, with exact candidate revision, commands,
   logs, browser evidence, package hash and limitations. Commit only verified owned
   acceptance changes when released to implement; report exact commit hash. Leave
   feature remediation, integrated PR coordination and merge approval to the coordinator.

## Preparation evidence and outstanding gates

- Read live issues #33–38 and repository contributing/development/snapshot guidance.
- No `AGENTS.md` found in this worktree or its parent worktree directory tree.
- Discovered documented CI test/package commands and existing synthetic TMDL fixtures.
- Current snapshot code uses a metadata allowlist; this is baseline source inspection,
  not proof that the integrated PQ state or downloaded snapshots preserve privacy.
- Node available: `v24.15.0`; `code` and `code-insiders` CLIs available. Actual packaged
  host UI has not been checked. T3 preview currently has no attached tab; availability
  will be tested by opening it when candidate browser acceptance begins.
- Blocker: coordinator has not supplied the integrated #34–37 candidate hash or release
  to implement final acceptance. No candidate success is claimed from worker reports.
- Next owner/action: coordinator supplies integrated candidate hash and prerequisite
  hashes; #38 then executes the independent matrix. User approval remains a merge gate.

## Coordinator addendum — pending independent verification

The coordinator reports that #37 browser work discovered and fixed focus-induced
auto-scroll using `preventScroll`. This is a regression lead, not an accepted result.
A17 must verify viewport preservation through code navigation and expansion, partition
state isolation, model reset, and byte-exact code opened from the keyboard. A18 covers
1280/760-width readability and Escape, with viewport height and scale recorded.

Reported supplementary worker Chrome coverage uses 350 expressions, 40 references
per page, and an 80-node/160-edge visible graph cap. Reproduce relevant boundary cases
on the exact final candidate; do not adopt worker results as #38 evidence. Cover cap
boundaries and disclosed truncation, including metadata inventories above 300 nodes.

The reported lineage view bounds visible analysis above 300 nodes, while dependency
inspector rendering calls full `graph(metadata)`. Inspect that path on the delivered
revision and measure the entire inspector interaction, not only graph drawing. For
A19, use deterministic synthetic inventories at 300, 301, 350 and a larger recorded
size (initial target 1000 expressions), with fixed fan-out and recorded edge counts.
Measure cold open, warm reopen, navigation to another query and each expansion/page
action separately. Start timing at the actual control activation and stop when the
new content is painted and responsive to the next interaction. Retain raw repeated
measurements (at least five warm samples), median and maximum, plus cold timing;
record browser/editor version, OS/hardware, viewport, fixture digest, candidate hash,
instrumentation and any timeout or unresponsive interval. Report observed timing
without inventing a product performance threshold. A bounded graph cannot establish
bounded full-inspector analysis, and a timing result alone cannot establish its cause.

Final browser acceptance must use the candidate's registered integration via T3
preview and the actual model-opening workflow. Transient metadata injection/loading
and worker Chrome harness results are supplementary only. Record how the candidate
is registered, served and loaded; direct test injection must not substitute for import,
host integration or final navigation acceptance. No final checks are released by this
addendum; the integrated candidate hash remains pending.
