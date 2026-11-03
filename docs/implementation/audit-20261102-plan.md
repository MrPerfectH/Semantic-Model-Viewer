# Semantic Model Viewer — final evaluation and implementation brief

Status: implementation authorized on 2 November 2026; see the GitHub tracking issue and progress log. Audit decisions below retain their original evidence dates.

This is the authoritative synthesis after two independent audits and two critical cross-reviews. It supersedes the priorities and disputed conclusions in [the initial synthesis](/home/harry/Reports/smv-evaluation-2026-11-01/EVALUATION.md). Original reports remain unchanged for traceability: [Astra audit](/home/harry/Reports/smv-evaluation-2026-11-01/astra/report.md), [Fable audit](/home/harry/Reports/smv-evaluation-2026-11-01/fable/REPORT.md), [Astra cross-review](/home/harry/Reports/smv-evaluation-2026-11-01/cross-review/astra/REPORT.md), [Fable cross-review](/home/harry/Reports/smv-evaluation-2026-11-01/cross-review/fable/REPORT.md). Neither agreement nor the number of reports is independent proof. Evidence strength determines the disposition below.

## Product judgment

Preserve local, account-free metadata exploration; focused filter/impact workflows; complementary Tables/Measures/Power Query/Matrix/Reference views; honest static-analysis caveats; current calculated-object functionality; and interactive snapshots. These are the application's strongest features. Classic and Spellbook provide coherent foundations rather than a reason for wholesale redesign.

Improve trustworthy model adoption, relationship selection, query completion, keyboard access, panel geometry and diagnostic accuracy first. Dense visualization and performance work should use measured fixtures. New features belong behind task research. No P0 defect was demonstrated, no real users were interviewed, and no accessibility/security certification is supported.

## Important baseline correction

The audits evaluated `wip/model-reference`, HEAD `e6307599be0d43da43b028b5f10c40d8fa7b33a8`, plus uncommitted table-DAX and other changes. They did not evaluate the latest integrated application. Fable's cross-review found substantial divergence from the locally available `origin/develop` and verified that several defect sites also exist there and on main.

At the parent's final read-only check, locally stored `origin/develop` was `dc3505145a49d06eeede34f4a7a4a1413a4aa10d`, and `git rev-list --left-right --count HEAD...origin/develop` returned **2 / 185**. Fable earlier observed 179 develop-only commits. Counts are snapshots of local tracking references, not evidence of today's remote freshness, and can change. This is divergence, not a simple fast-forward.

Parent inspection confirmed that commit `9f9d508` updates the two failing explorer expectations to include path defaults and the empty-view depth of 1,000,000. Commit `14374ce` on the audited branch changes explorer defaults without those test updates. Retire the earlier proposal to invent new saved-view semantics. Reconcile the branch/test history and then run the actual gate. Do not claim the current develop suite was executed merely because its expectations match.

Fable's recommendation to “merge develop first” is too prescriptive as an automatic action on this dirty working copy. First select and record the implementation target, preserve tracked and untracked work, and assess integration conflicts. Merge, rebase or forward-port are implementation choices after that assessment. Do not discard the existing calculated-object feature. Existing audit status comparisons establish status consistency; they do not prove historical byte identity for every untracked file. Astra separately hashed 4,058 files during its cross-review.

Tables layout/Fit/cardinality findings must be remeasured on the chosen baseline because those modules changed upstream. The reviews report the reserved-identifier adoption, competing hit corridors, import-dialog semantics and relevant PQ modules still present on develop/main; preserve those high-priority tickets, with regression checks on the actual implementation target.

## Evidence decisions

| Topic | Final disposition | Basis and consequence |
|---|---|---|
| Reserved names and model adoption | Keep and strengthen | Both cross-reviews reran reserved-name probes. Astra additionally demonstrated same-name stored replacement before preparation. Protect stored records, selected key and usable UI, not just the final selection write |
| Wrong relationship selected | Keep; capture exact reproduction before patch | Screenshot and listener ordering support competing hit corridors. Exact original click trace was not preserved. Coincident lines need a defined ambiguity policy; nearest-path selection alone cannot identify intent for identical geometry |
| 1,000-query completion | Keep, with stronger localized performance evidence | Retained browser symptom plus real-module Node reproduction/profile. Do not infer permanent nontermination or a masked browser exception without a completion trace |
| PQ arrows absent | Reject | Both cross-reviews confirm visible arrow geometry. No `<marker>` elements was an invalid absence test. Keep direction/visibility tests, including routes with no usable arrow seat |
| 1024 px passes/fails | Amend to exact tasks/hosts | Tables inspector sampled successfully; PQ app resize and exported-snapshot bottom-inspector/Fit have separate failures. Record host, docking, framing mode and transitions |
| Two explorer test failures | Amend to branch integration mismatch | Upstream expectations already reflect the implementation defaults. Fable's passing subset did not include this suite. Do not add overlapping test counts |
| PNG CDN dependency | Keep, P2 | Runtime script request/offline dependency, not demonstrated model exfiltration. Snapshots disable PNG export. Retain and inspect the output when validating the fix |
| Snapshot offline claims | Narrow | HTTP reopen/CSP/no-resource observations are valuable; disconnected literal file launch remains unverified |
| M warning noise | Keep, narrow remedy | Current warning already allows unknown library/external names. Use exact known-name classification after local/model binding, not prefix guessing or an unverified completeness claim |
| Domains/schema-only claim | Reject universal claim; keep research question | Role/source/manual paths also exist. Single-schema stress grouping is unhelpful, but custom domains are a hypothesis |
| Storage migration and generated-test deletion | Defer | Existing import paths surface several save errors; quota failure not exercised. Generated files contain distinct opt-in and regression coverage. Inventory before relocation; no blanket deletion/history cleanup |
| Inline M fragment fixture | Needs grammar confirmation | Noncanonical hand-written expression reproduced. Do not change grammar or add keyword-only warnings without supported-format positive/negative controls |
| Contrast/tab-order measurements | Partially supported | Astra retains a specific contrast sample; Fable's raw per-sample/action logs are missing. Regenerate affected-state evidence before claiming exact counts or compliance |

## New scale evidence and its limits

Fable's [pipeline output](/home/harry/Reports/smv-evaluation-2026-11-01/cross-review/fable/evidence/pq-large-1000-pipeline.json) executes actual modules with the repository DOM harness. It records 1,005 graph nodes and 3,094 edges; graph build takes approximately 148 ms, while `canvas.setContext` takes approximately 146 seconds. A separate profiled run takes approximately 159 seconds, with 98.7% inclusive sampled time attributed to `routeEdges`. See [profile summary](/home/harry/Reports/smv-evaluation-2026-11-01/cross-review/fable/evidence/pq-large-1000-profile-summary.txt) and retained probe/profile in the same folder.

This strongly prioritizes initial full-context routing and route-search work. It does not measure browser responsiveness, establish a universal latency, or prove the exact cause of the browser's final pending/disabled state. No comparison proves the harness time is an upper bound for all browsers. Trace the browser completion handler, error handling and cancellation next. Prefer avoiding unnecessary initial routing of invisible content and bounded work before choosing a new renderer. No original automated test was found referencing the large-1000 fixture.

## Implementation backlog

Use **SMV-01…SMV-16** below as final IDs. The two cross-reviews reuse CROSS-* for different tickets, so those IDs must always be qualified by reviewer. Efforts are provisional engineer-days for an engineer familiar with the code, including targeted validation; investigation may change scope. P1 means next corrective work or immediate investigation, P2 following iterations, P3 research/deferred. No dates or summed delivery commitment are implied.

### SMV-01 — Establish the implementation baseline and release gate

**P1 prerequisite; 1–3 days assessment, integration separately sized.** Source: both cross-reviews' gate work, especially Fable's branch-history discovery. Record target commit, working-tree patch/untracked inventory and preservation hashes; compare relevant upstream changes; choose integration method and remeasure obsolete findings. Likely areas: branch integration, package/CI commands, explorer tests and current table-DAX work. Exclude automatic merge/reset, changing defaults solely to satisfy stale tests, or removing timing coverage to get green.

Acceptance: current work is recoverable and preserved; target agreed/documented; historical test expectations reconciled; canonical viewer gate distinguished from root CLI/plugin subset; deterministic failures resolved or explicitly blocking; timing variance tracked separately under a meaningful benchmark policy. State/snapshot round-trip and relevant table-DAX checks execute on the resulting baseline. Review integration separately from behavioral fixes so it can be inspected or reverted independently.

### SMV-02 — Safe identifiers and transactional model adoption

**P1; 2–5 days; after SMV-01 target assessment.** Affects all importers. Reproduce with Astra's `name-collision.bim`/`reproduce-probes.cjs`, including constructor/toString/__proto__, a normal control, malformed candidate, and a same-name replacement. Likely areas: app preparation, reverse references, import confirmation, storage and current-model selection.

Prepare/validate before replacing stored model records, selected keys or usable UI. Use safe arbitrary-name lookup structures and preserve existing adapters/diagnostics. Cover import, refresh and restoring an already bad saved selection. Acceptance: valid special names load and reload; preparation/storage failures leave prior selected and same-name stored models usable, show actionable errors, and permit retry. Test real preparation plus storage faults and browser import/reload. Preserve source files; no migration that deletes users' stored models. Regression/rollback risk: data-shape changes across views and snapshots; retain compatible reads and round-trip fixtures.

### SMV-03 — Relationship hit identity and tooltip lifecycle

**P1 identity, P2 lifecycle; 2–5 days; after baseline recheck.** Affects learners and reviewers reading relationship properties. Reproduce Fable screenshot 05 on the chosen baseline: inactive Sales→Date area at 125% graph zoom, with actual click coordinates, visible geometry and candidate identities retained. Likely canvas event/selection/tooltip code.

Define nearest-visible-path behavior plus an explicit accessible tie policy for coincident routes. Do not let a preferred selected edge override a clearly nearer different line. Acceptance: separated visible strokes select their own identity across tested scales; overlapping/coincident cases follow the documented policy; metadata cardinality/activity/direction match selected identity. Tooltip disappears when its anchor is removed, rerendered or context changes. Test click geometry and actual browser interaction, including inactive/bidirectional cases. Exclude a routing rewrite in this ticket.

### SMV-04 — Accessible import dialog

**P1; 1–3 days.** Reproduce Open model → Tab/Shift+Tab/Escape, including parsing/error and folder-chooser states. Likely topbar/chooser code; reuse successful M-reader behavior where appropriate. Acceptance: named modal semantics, focus enters, stays within the modal, Escape dismisses appropriately, named Close and focus restoration work at desktop and 390 px. Underlying controls must not receive modal navigation. Verify accessibility tree and browser keyboard sequence; later AT session remains separate. Avoid redesigning import content.

### SMV-05 — Large-query completion, responsiveness and bounded routing

**P1 diagnosis/fix; 3–10 days initial scope; performance expansion separately sized.** Use `tests/acceptance-fixtures/pq38/large-1000/model.bim`, the retained pipeline probe/profile, and a small control. Likely PQ workspace completion and canvas setContext/visibility/routing code. Capture analysis/render/finalization timings, error trace, search/status state and cancellation behavior in a browser.

Make inventory independent of unnecessary invisible-graph construction where verified safe; bound aggregate work and make final status coherent. Avoid adopting a worker/renderer architecture before the trace warrants it. Acceptance has two separate gates: **recovery** means no indefinitely contradictory ready/pending or disabled controls without explanation, with retry/cancel and preserved previous state; **large-fixture support** means successful usable inventory/search and focused flow under an agreed measured budget. An error satisfies only recovery. Verify reload, view switch, model switch during work, cancellation, focused graph and snapshot restore. Add fixture-driven deterministic work/state assertions without making a multi-minute harness run the default unit gate. Rollback must preserve saved view membership and pending selection semantics.

### SMV-06 — Panel-aware Fit and framing modes

**P1 desktop occlusion; 2–5 days; sequence shared PQ changes after SMV-05.** Reproduce app 1920→1024 resize separately from exported snapshot StageSales Inputs → bottom inspector → Fit at 1024×768. Likely PQ fit/dock/resize code. Measure live toolbar/minimap/inspector exclusions rather than assuming fixed bottom reserve. Acceptance: explicit Fit contains the sampled five-node flow in usable space for open/closed/right/bottom inspector; auto-fit follows resizing, manual pan/zoom stays intentional and is recoverable. Test 1920/1440/1024, both themes, ordinary app and snapshot. No unconditional recenter-on-resize.

### SMV-07 — Exact M library classification

**P1 bounded trust correction; 1–3 days.** StageSales Table.SelectRows/Date.Year are positive controls; unknown query, local binding, dotted model query and library-shadowing cases are negative controls. Likely dependency scanner and inspector. Curate known names with provenance/version and preserve local/model resolution precedence. Unknown names remain uncertain; any library-unverified category must not hide a possible query. Acceptance: known functions avoid missing-query noise without suppressing real missing/dynamic diagnostics or changing resolved edges. No M execution or scraped completeness claim.

### SMV-08 — DAX uncertainty and ingestion diagnostics

**P2; 3–7 days; after SMV-02.** Reproduce `COUNTROWS('Gone')` and controls; dangling relationship import across browser/CLI. Likely DAX reference scanner, preparation and CLI validation. Acceptance: unresolved whole-table evidence remains visible; functions/variables are not spuriously classified; accepted/rejected counts and reasons are explicit. Hosts may deliberately differ in strictness but must explain omissions. Split scanner and ingestion changes if they require different contracts; no mandatory shared-schema rewrite.

### SMV-09 — Narrow reading and current calculated-object polish

**P2; 3–7 days.** Reproduce ~88 px reader at 390×844 with library open, then closed/reopened after resize; test 768 px too. Likely table-DAX/measures CSS/reader/nav. Acceptance: readable full-width detail or explicit pane switching, reachable navigation and controls, accurate calculation-item/column/table names, current calculated-object functionality preserved. Verify both themes and snapshot state. Do not require a full mobile canvas editor or settle for a warning alone.

### SMV-10 — Keyboard journey, contrast and semantic controls

**P2; 3–7 days in bounded patches.** Preserve the existing sidebar relationship selection path and working PQ/Matrix keyboard behavior. Improve library access before large canvas tab sequences, focus stability on rerender, kind/object labels and separate chevron actions. Regenerate contrast samples with computed foreground/background/state; fix Astra's specific 3.60:1 legend pair and other confirmed text failures. Likely explorer/sidebar/measures/focus and theme tokens. Acceptance: core search/select/relationship/details tasks complete without pointer, dialog focus is stable, text samples meet applicable contrast requirements in both themes and non-color cues remain. Retain raw evidence; AT/actual zoom validation required before broader claims. Avoid hundreds of extra edge tab stops and a wholesale icon replacement.

### SMV-11 — Export integrity and content clarity

**P2; 1–3 days per separate PNG/snapshot patch.** Pin/bundle licensed PNG dependency instead of a runtime CDN request, honoring asset/CSP/host policies and the snapshot export guard. Retain/open an offline-produced PNG. Add a concise snapshot contents explanation: full metadata, DAX, available M, endpoint strings and parameters; selected view is not redaction. Relevant checks: asset synchronization, cold-cache blocked-network PNG, snapshot round-trip and literal file reopen with network disconnected. Host runtime validation follows asset/CSP changes. No claim that a CDN request sent model content or that automatic sanitization guarantees safety.

### SMV-12 — Diagram geometry and readable focused paths

**P2; baseline measurement then 1–3 weeks selected fixes.** Recheck changed Tables/Fit/LOD behavior after SMV-01, retaining metric implementation and sampling assumptions. Likely layouts/canvas/measures/calculated-object routing. Test selected paths first: unrelated-card intersections, arrow direction/attachment, cardinality/activity, clipping and label occlusion across zoom/pan/panel states, with long labels/cycles and demo/stress fixtures. Acceptance: targeted focused defects corrected with exact geometric/semantic checks; Fit contains bounds or explains its readable-overview limit. Dense overview crossings alone do not mandate a replacement router, edge bundling or arbitrary global zero-crossing target. Do not run simultaneous hit-testing/Fit/routing refactors in the same canvas files.

### SMV-13 — Reproducible performance policy

**P1 baseline investigation; 2–5 days, optimization separately sized.** Use demo, retained 160-table generator and large-query fixtures. Store environment, cold/warm phase timings, settle versus CPU cost, input delay and distributions from repeated runs. Preserve CPU profile evidence and choose deterministic operation bounds where appropriate; retain independent performance checks instead of silently deleting load-sensitive assertions. Acceptance: repeatable benchmark command and documented agreed budgets; one profile-led optimization per patch with correctness/state checks. No universal 100-table cliff or mandatory virtualisation/WebGL/framework rewrite.

### SMV-14 — Build parity and evidence-preserving test inventory

**P2; 2–5 days per bounded subtask.** Document full existing generation/enrichment path, correct stale raw-M privacy comment and compare supported semantic fields across browser/Python/CLI fixtures, including available PQ definitions. Separately map generated tests to unique assertions, entry points and dependencies before any relocation. Acceptance: documented regeneration retains expected PQ objects/definitions, asset check passes, canonical test command is clear and any moved coverage still executes. No prefix-based deletion, git-history rewrite or repository media migration bundled into corrective work.

### SMV-15 — Contextual help and transient status

**P2 help/lifecycle, P3 copy; 2–4 days.** Provide task-oriented legend/shortcut help, explain low-zoom labels and static uncertainty, avoid tips covering targets or requesting already completed steps. Clear status from a previous model while preserving actionable errors; do not blanket-auto-dismiss all messages. Acceptance: help is keyboard accessible; current context matches visible messages; users can distinguish inactive links, hidden labels and unresolved analysis. No extra analysis surface required.

### SMV-16 — Research-gated feature backlog

**P3; scope after study.** Candidates: custom display grouping for weak source-derived domains; model/snapshot comparison with impact; curated handoff using existing saved views/explanations; impact/diagnostic exports; read-only RLS/perspectives; explicit sanitized export; storage migration if fault/volume evidence warrants it. Check existing CLI/Reference/explanation functionality and related tools first. Define stable identity/schema and uncertainty before comparison. No runtime RLS/DAX/M simulation or automatic safe-sharing promise. Each candidate needs a clear task gap, demand evidence, prototype and acceptance criteria before scheduling.

## Delivery sequence and completion policy

**First corrective batch:** SMV-01 baseline work, then SMV-02 adoption and SMV-04 import dialog; capture SMV-03's exact hit fixture and ship its bounded fix next. Start SMV-05 browser tracing and SMV-13 measurement separately so known large-query cost is not deferred behind polish. SMV-07 can be a small independent patch after binding controls are specified.

**Second batch:** SMV-05 successful completion work, SMV-06 panel geometry, SMV-08 diagnostics, SMV-09 narrow reader and small SMV-10 accessibility patches. Then SMV-11 exports and selected SMV-12 routing. Order within this batch follows measured impact and shared-file dependencies.

**Later:** performance optimizations justified by profiles, SMV-14 build/test improvements and SMV-15 help; SMV-16 only after research. Low-cost contrast/label fixes can move earlier when touching those areas, but do not accumulate every optional improvement into the first release.

Limit work in progress to two tickets, with one owner/change stream for app/model state and one for canvas geometry. Do not parallelize conflicting canvas or PQ completion/docking refactors merely because multiple models are available. Original week estimates are rough capacity assumptions; baseline integration and investigations can change them.

Each implementation patch must demonstrate the defect, include a meaningful positive/negative regression check, pass relevant deterministic gates and show the actual changed UI journey. Then broaden testing only for shared code/host risks. Scope changes and unresolved failures stay explicit. Implementation is tracked separately; this document records the agreed acceptance scope.

## UI and host release checklist

- Record host/theme/CSS viewport, selected model/object, library/inspector state, actual dock and framing mode for each result. Screenshots complement behavior checks; they do not certify arrows, accessibility or speed alone.
- Test affected features at 1920×1080, 1440×900 or 1366×768, 1024×768; test import/navigation/detail fallback around 390×844 in both themes. Do not label an untested cross-product passed.
- Repeat load/search/select → inspector open/close/right/bottom → resize → explicit Fit → manual pan/zoom → resize → Back/view switch → save/reopen at another width. Preserve identity, focus, usable bounds and manual/auto framing intent.
- Import cases: normal/reserved identifiers, malformed candidate, same-name replacement, storage denied, preparation failure, old bad selected key and reload. Verify previous stored data remains usable.
- Diagrams: endpoints, filter/input direction, cardinality, inactive/bidirectional encodings, selected hit identity, route/card/chrome intersections, labels and arrow-seat visibility. Test long labels, cycles and empty/budget-limited states.
- Query scale: inventory/search success, coherent status, cancellation/retry, no stale generation after model switch, focused visibility and snapshot state. Recovery is not scale support.
- Export: keep/open actual PNG and HTML files; separate HTTP reopen from disconnected file launch. Check bundled runtime asset parity. Run actual VS Code/portable/other relevant hosts when their assets, focus/CSP or delivery behavior changes; manifest/unit checks alone do not prove those hosts fixed.
- Complete actual 200%/400% browser zoom and screen-reader task checks before accessibility claims. These, cross-browser/touch, storage-quota runtime, service-worker delivery and full host runtime remain incomplete in current audits.

## Real-user validation

After the first corrective batch, run two pilot sessions and approximately eight main sessions, 45–60 minutes, across learners, DAX developers, ETL authors and consultants, with overlapping keyboard/magnification/screen-reader experience. Use synthetic or consented sanitized models and participants' normal tools. Screen recordings can expose definitions; obtain consent.

Tasks: explain Sales filtering/inactive link, assess a Net Amount change, trace StageSales/ServerName and uncertainty, import/recover without pointer, share/reopen a snapshot and explain its contents, and frame a larger model. Record correctness, recovery, assistance, ease/confidence and descriptive times; no arbitrary threshold of three affected users is needed for a severe error. Simulated audit personas are not participants.

The study should choose between focused-path/text-list versus overview routing investment, narrow reading scope, help wording, comparison versus custom grouping, snapshot disclosure and task-performance budgets. It must not delay known crash/focus fixes. Recheck changed journeys with several returning/new users; keep assistive-technology defect verification explicit.

## What to implement next

Begin SMV-01 by establishing the target and preserving current work. Then implement SMV-02 and SMV-04 as small corrective changes, with SMV-03 reproduction/fix next and SMV-05/13 diagnosis underway. Keep originals and cross-review evidence linked to every ticket. This plan is usable for implementation without treating every original report recommendation as correct.
