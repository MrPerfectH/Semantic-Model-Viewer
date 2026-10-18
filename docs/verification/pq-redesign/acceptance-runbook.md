# Independent A1–A9 fixture/oracle handoff

Only synthetic metadata exists under `tests/acceptance-fixtures/pq-redesign/`. Generation and self-checks import no production code and do not execute M. Existing `pq38` and other fixtures are immutable. `build.cjs` authors source using explicit reference fragments; it does not scan names or derive expected edges from a production analyzer. `oracle.json` is checked in and regenerated only with this new corpus.

| Gate | Fixture and required independent observation |
| --- | --- |
| A1 | `a1-disconnected`: six SQL queries share server/database/schema plus one semantic relationship. First PQ entry shows six valid nodes, zero edges, closed inspector; selecting each shows its own M. No server/semantic edge. |
| A2 | `a2-parameter`: nine objects, one Server, exactly five consumer arrows; local let, function parameter, string/comment and record field yield none. Selecting Server highlights five consumers. |
| A3 | `a3-results`: six objects, exactly Q1/Q2→MergeResult and MergeResult/Q3→AppendResult. Disconnected remains. Read arrowheads, input/consumer counts and all NestedJoin/Combine inputs in actual UI. |
| A4 | `a4-occurrences`: five exact clickable occurrence spans including repeats, escaped/doubled quotes, UTF-16 after emoji and CRLF. Test each occurrence, target reveal and Back's selection/viewport/code-scroll restoration. Compare displayed/copied source to `exact-source.m`; negative tokens cannot navigate. |
| A5 | Use A3/A4 for mouse/keyboard, F, arrows, zoom, search, last match, Enter, Escape from inspector, Back, focus rings and Tab exit. Test blank click versus drag, input keys, resizing/collapse, 1280/1440 at actual 100%/200% browser zoom and narrow split. Record screenshots and geometry; changing device scale alone is not browser zoom proof. |
| A6 | `a6-disconnected-300/301/350/1000` contain exactly those totals. `a6-fanout-250` has 251 objects/250 arrows. Verify registry and overview/minimap, last object/consumer reachability, progress completeness and no cap/mandatory expand. Record entry/Fit/search times; capture long tasks/responsiveness and actual pending cancellation. |
| A7 | `a7-uncertainty`: 19 metadata records plus one no-partition status object (20 displayed objects). Two distinct Sales partitions reference RangeStart; table-name reference is ambiguous. Duplicate expression metadata ID and table/expression name collision remain inspectable and unresolved. Missing/non-M/dynamic/unresolved/unsupported/parse-failure reasons; CycleA↔CycleB and SelfCycle statuses. No inferred partition union or ownership edges. |
| A8 | `a8-reset-a`→`a8-reset-b` reuse IDs with different sentinel code. Test model replacement, metadata-only replacement and same metadata object on a new model. While 1000-object analysis is pending, replace it; release delayed callbacks and verify no old paint. Then `a8-without-m`/default exported snapshot: no stale M, nodes/history/cache/search/selection/labels; useful unavailable explanation. Tables state preserved. If synchronous work prevents pending import, record that limitation; do not fake asynchronous acceptance. |
| A9 | `a9-privacy`, A2 and A4: XSS stays text, default export excludes all raw M/PQ metadata/parameter sentinels, Copy M preserves bytes. Start complete network capture before import and classify source requests; local asset requests are allowed. Inspect code paths/trace for no M evaluation, credential reads or source writes. Compare fenced TMDL exact bytes. Run `node vscode-extension/scripts/sync-viewer.js --check` on exact candidate, without rewriting media during independent verification. Installed/package checks remain separate. |

## Commands and evidence gates

Safe authoring checks, already executed in this isolated worktree:

```sh
node tests/acceptance-fixtures/pq-redesign/build.cjs --check
node --test tests/pq-redesign-independent-fixtures.test.cjs
node --check tests/pq-redesign-independent-candidate.oracle.cjs
node --check tests/pq-redesign-independent-browser.oracle.cjs
```

After the parent supplies an exact redesigned integration SHA, apply the independent fixture commit into the agreed isolated candidate worktree. Record the resulting reviewed integration SHA from the parent; do not substitute baseline or silently test another HEAD. `PQ_REDESIGN_INTEGRATION_SHA` must equal that checkout's full HEAD and production assets must be clean. Then run the candidate oracle with the provided SHA. No example value is prepopulated to avoid accidentally approving a historical commit.

The candidate oracle checks complete graph metadata inventory/edge direction, occurrence ranges, dependency compatibility, issue ownership, cycle detection, exact fenced source and default snapshot exclusion. It is written against the **proposed**, not yet frozen, `PowerQueryGraphModel.build` contract. It must be reconciled openly with the final schema; do not weaken semantic expectations to make it pass. It does not establish browser rendering, progress UX, focus, history/reset lifecycle, performance suitability or product acceptance.

`pq-redesign-independent-browser.oracle.cjs` consumes fresh integrated-UI observations, **not a driver or a fabricated receipt generator**. Use T3 preview as the first browser transport and bind locators to actual integrated UI after contract freeze. No candidate DOM collector is claimed complete while that UI is held. Keep raw interaction traces, screenshots, network capture and command receipts; attach SHA-256 hashes. Collect the fields named in the oracle from those observations, never by copying expected fixture values. A passing observation validator requires independent human inspection of the artifacts; booleans alone are not evidence.

Record exact candidate/worktree/URL/asset hashes, browser version, viewport/actual zoom, start/end times, fixture hashes, all failures and limits. Do not replay a production run after failure without diagnosis. Do not rewrite a receipt after an implementation change; create a new run directory keyed to the new SHA. The full browser oracle never runs by the default unit-test glob and cannot adopt a historical receipt automatically.

A10 is absent from automated pass logic by design. Parent must obtain the user's product-fit review on a representative model. No watcher is registered by this handoff.
