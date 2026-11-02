# Audit implementation — review branch

Implementation tracker: [#203](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/203). Branch: `fix/audit-improvements-20261102`, based on fetched develop `dc3505145a49d06eeede34f4a7a4a1413a4aa10d`. Integration commit `408ed39` preserves the existing Reference and calculated-object work. The original dirty `wip/model-reference` checkout is retained; its patch, untracked source copies and hashes are under `/home/harry/Reports/smv-implementation-2026-11-02/baseline/`.

This branch is for user review, not merged or released. Targeted implementation evidence below is distinct from the final gate and independent review, which are still in progress.

| Task | Implemented scope | Verification / remaining scope |
|---|---|---|
| [SMV01 #204](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/204) | Develop baseline, preserved original, forward-ported Reference/calculated objects | Canonical gate966passed,3environment skips; packaged assets synchronized |
| [SMV02 #205](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/205) | Candidate validation before adoption, safe identifier maps across roles/layouts/readers, storage recovery, Fabric validation before cache replacement | Unit faults and browser reserved-name load/reload; independent review found/fixed roles and Fabric gaps; multi-import source associations now wait for persistence |
| [SMV03 #206](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/206) | Nearest visible hit, deterministic coincident-route cycling, keyboard glyphs, tooltip cleanup | Real125% inactive Sales→Date click with geometry retained; separated-route and tie tests |
| [SMV04 #207](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/207) | Named modal, focus entry/trap/restoration, Escape, preserved input drafts/nested chooser | Desktop and390px browser journeys in both themes |
| [SMV05 #208](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/208) | No invisible full-context routing at initialization, bounded route work | Large1000 browser inventory ready about1s; focused4nodes/6edges succeeds; full overview explicitly defers3056connections |
| [SMV06 #209](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/209) | Measured panel/overlay exclusions, usable bottom dock, manual/auto framing |36 StageSales app/snapshot combinations across1920/1440/1024, both themes, three dock states; manual viewport preserved |
| [SMV07 #210](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/210) | Exact curated Table.SelectRows/Date.Year classification | Model/local shadowing and unknown-name controls; static caveat retained |
| [SMV08 #211](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/211) | Quoted missing-table DAX evidence, named ingestion omissions, preserved parallel relationships, strict CLI reasons | Browser import/adoption/reload/Reference; Python/JS semantic parity; snapshots retain diagnostics |
| [SMV09 #212](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/212) | Full-width library/reader switching below800px, reachable navigation, calculated-kind labels |390/768/1024 readers, both themes, resize preference; narrow Tables toolbar/popover bounds and automatic analysis pane selection verified |
| [SMV10 #213](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/213) | Separate relationship actions, stable keyboard action focus, confirmed contrast samples, named controls | Real Enter/Tab relationship journey and retained computed samples; no screen-reader certification |
| [SMV11 #214](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/214) | Licensed local PNG library, offline cache, hidden-node filtering, correct viewport/Measures export, snapshot disclosure | Retained/opened Tables, Measures, Matrix PNGs; external requests blocked for Tables; full host execution remains limited |
| [SMV12 #215](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/215) | Focused calculated routes avoid unrelated cards; bounded dense Tables routing preserves paths/endpoints with visible limit notice | Exact sampled geometry, cycles/orientations,68-edge demo and8-edge focused Sales; dense overview is not promised crossing-free |
| [SMV13 #216](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/216) | Profile-led routing bounds and repeated benchmark harness | Stress browser render361–471ms in sampled runs after prior multi-second obstacle routing; timing test retained, earlier load-sensitive failure disclosed |
| [SMV14 #217](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/217) | Python/browser diagnostic parity, generation docs and privacy correction, coverage inventory | No generated tests deleted; demo regenerated including Power Query enrichment; asset hashes, host parity and packaged PNG asset checks pass |
| [SMV15 #218](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/218) | Contextual Help, narrow tips away from search, completed add-table suppression, stale tooltip/export status cleanup | Help Escape/focus and snapshot disclosure keyboard tested; late snapshot completion regression |
| [SMV16 #219](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/219) | Research-gated feature/study plan, reuse real-user study #116 | [Research backlog](research-backlog.md); simulated agent perspectives are not user interviews |

## Evidence and gate policy

Implementation evidence lives at `/home/harry/Reports/smv-implementation-2026-11-02/`: `canvas/`, `geometry/`, `pq/`, `import-dialog/`, `narrow/`, `png/`, `diagnostics/`, `adoption/`, `adoption-review/`. Original audit evidence remains at `/home/harry/Reports/smv-evaluation-2026-11-01/`.

Canonical unit/host gate: `cd vscode-extension && npm test` after root/extension `npm ci`. This syncs and checks extension assets and runs the broad viewer/host/CLI suite. Root `npm test` is a narrower delivery subset. Browser gates are separate; CI's browser selection and feature-specific browser tests must be stated explicitly. See [test inventory](test-inventory-20261102.json); assertion-site counts are inventory, not a coverage score.

Initial full run during implementation:943 tests,919 pass,21 fail,3skip. Failures included stale plugin/demo artifacts, missing installed dependencies, a snapshot test harness missing the newly used parser, runtime fingerprints changing while implementation was active, and a load-sensitive layout threshold. This is retained evidence, not a release pass. Resolve and rerun on stable sources. Do not add overlapping suite counts.

Host limits: this Linux environment does not establish Windows portable, macOS launcher, actual assistive-technology output or real high browser zoom acceptance. DOM/focus/contrast checks and protocol tests are narrower claims. Source models are never changed by the viewer's static analysis. Snapshot sharing includes captured metadata beyond the selected view; no redaction guarantee is made.

## Release-candidate gate

The stable canonical rerun passes **966 / 969 tests**, with three explicit environment
skips: the unbuilt published XMLA helper, .NET8 consumer-mapping fixture, and Windows
registration on Linux. No failures. Log: `viewer-gate-release-candidate.log` in the
evidence directory. Earlier failed runs are retained; they are not combined with
this count. The browser gate and independent Fable review are recorded separately.

Additional final corrections: narrow selection now opens the analysis pane while
keeping the desktop library preference; search-dialog Escape restores the current
opener after rerender. Relationship glyphs use a single roving tab stop, and a
Skip to table library action precedes canvas cards. The background repository
refresh reports invalid candidates without replacing the previous model.

Original-checkout preservation check: all4,058 baseline hashes match.

Browser release-candidate gate: **48 / 48 passed**, no skips. This includes the CI
browser selection plus calculated objects, Reference, measure comparison and Power
Query snapshots. Actual standalone `file://` snapshot navigation/re-export runs with
network access blocked; this is stronger than an HTTP-only reopen. Evidence:
`browser-gate-release-candidate.log`. Live UI verification matrices, exported PNGs
and manual keyboard actions remain separately documented in the evidence reports.
