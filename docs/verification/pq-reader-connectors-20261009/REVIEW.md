# Wide M reader and straight PQ connectors — implementation evidence

Implemented in the actual `feat-power-query-metadata-lineage` integration worktree from clean baseline `8fb0dcc6fea84334e78f04a6e7aa2cbb69363c96`, for PR [#40](https://github.com/MrPerfectH/Semantic-Model-Viewer/pull/40). This directory is new evidence. All prior evidence, fixtures and frozen reviews remain untouched. Local commit only; parent independent gate, user acceptance and native VS Code blank remain OPEN.

## Visible result

- `Open full query` is a prominent sticky entry immediately under the selected query heading, before canvas-focus controls. Before, `Expand M` began at y=793.88 and the 364px code area at y=838.88 in a 1280×800 viewport. After, the new entry begins at y=241.99 and is immediately visible.
- The existing dialog now uses the available viewport (16px margins), without the previous 1100×860 cap. Actual source area: 1212×627px at 1280×800; 1372×727px at 1440×900. Code is 14px in the dialog, 13px in the inspector. Same code/reference DOM, exact source, original terminators, wrap preference, clipboard input and history contract remain intact. No formatter or M execution was added.
- Thin orthogonal connectors replace curves; small open chevrons use fixed model-space marker dimensions rather than scaling with selection stroke weight. Wide 14px hit paths remain aligned. Routes retain input→consumer semantics when cards move left or vertically; opposing cycle links have separate vertical ports. Long links detour around intervening visible cards. Manual overlaps are not silently rearranged; where no clear port exists the exact endpoints/positions win over obstacle clearance.

Runtime changes: `Models/tools/viewer/js/power-query-{canvas,inspector}.js`, their two CSS files, and four cache hashes in `index.html`. Documentation: README. Tests: the two dedicated module test files and `tests/pq-reader-connectors.browser.cjs`. Generated media is ignored by Git but was synchronized, checked and verified inside the new package.

## Registered T3 browser evidence

T3 `preview_status` initially returned no tab; `preview_open` succeeded. Original live URL: `http://localhost:8945/?review=8fb0dcc6fea84334e78f04a6e7aa2cbb69363c96`. Candidate URL: **http://localhost:8945/?review=pq-reader-connectors-20261009**.

The actual Tables built-in graph and Measures/Total Sales view were opened and played with before implementation. The only imported model was this directory's made-up `synthetic.bim`; its 41-line M source is independently retained as exact bytes in `exact-source.m`. No user model, source data, credentials, source connection, M or DAX execution was accessed.

Saved screenshots, copied without modification from T3 `preview_snapshot(save=true)`:

- [Before selection](beforeInspector.png) → [After selection](afterInspector.png): discoverable entry and straight selected paths.
- [Before reader](beforeReader.png) → [After reader](afterReader.png): wider source at 1280×800.
- [Before graph](beforeGraph.png) → [After graph](afterGraph.png): matching selected-query overview.
- [1440 reader](afterReader1440.png), [640 CSS reader](afterReader640.png), [cycles](afterCycles.png).
- Original T3 screenshot paths are retained in `t3-screenshots.json`.

Observed registered-browser checks:

1. Actual source DOM equals all 6890 UTF-16 units of `exact-source.m`, including 40 CRLF pairs, emoji and trailing spaces. Copy received that exact string at `navigator.clipboard.writeText` (argument evidence, not OS clipboard ownership).
2. Opening/closing preserves identical code and reference DOM. Escape closes only the reader, preserves inspector selection, and focuses `Open full query`.
3. Unwrapped source scrolls horizontally (1203px client width, 1790px scroll width; scrollLeft=180).
4. Trusted Enter on each reference verifies independent source-derived UTF-16 intervals 102–114, 129–141 and 157–168. Each navigates to Sales Raw/Sales Raw/Environment, closes the old reader, and Back restores full captured navigation equality, including expanded=true, wrap=false, codeX=180, codeY=125 and exact occurrence focus.
5. At 1440 CSS width the source is 1372×727 with 14px type and no wrapped horizontal overflow. At 640×450 the dialog is contained at (16,16), 608×418; source is 572×277 with 14px type and no wrapped horizontal overflow. These are CSS viewport checks, **not true browser 200% zoom**.
6. All seven edge paths contain only M/L segments; their hit paths match and measure 14px stroke. Native click on the Prepared Sales→Sales connector opens `Prepared Sales is referenced by Sales` and `Line 1, column 1 · #"Prepared Sales"`.
7. Both cycle directions are visibly distinct. Actual T3 drag moves only Cycle B, to (528.0042553191489, 290.97142333984374), preserving serialized graph semantics.

The T3 host disconnected during the subsequent Undo attempt and returned an explicit unavailable error with “Do not retry.” No further T3 browser calls were made after that batch. This is recorded in `failures-and-boundaries.md`. Drag itself has no layout-history callback in the unchanged baseline shell: the attempted drag Undo was an invalid expectation, not accepted evidence. Supported membership/Arrange Undo remains the contract and was verified separately below.

## Supplemental isolated browser

After that explicit unavailability, the authorized fallback used a fresh temporary headless Chrome profile via the existing repository CDP transport, then closed it. It did not use the user browser or installed VS Code. Fresh receipts are `fallback-receipt.json` and `fallback.log`; executable journey is `tests/pq-reader-connectors.browser.cjs`.

**7/7 scopes PASS**, zero runtime exceptions: explicit BIM group/visible-only minimap/induced edge; viewport placement with supported membership Undo; Center and category visibility; exact reader source/disclosures/scroll/Back plus late clipboard completion after suspension; actual Tables and Measures UI transitions with unchanged PQ layout; actual downloaded snapshot excluding M/PQ/group fields; queued reader restore canceled by generation invalidation. The exact downloaded synthetic-only snapshot is retained under `download/` with SHA256 in the receipt.

These supplemental checks are distinct from the registered T3 proof above. No current true browser-zoom, offline, independent-review, native-blank, installed-extension or user-acceptance claim is made.

## Node 22 and package

Only `/tmp/pq-graph-native-diagnosis-20261008/node-v22.23.3-darwin-arm64/bin/node` was used for tests/build. System Node 24 was not retried.

- Existing canvas/inspector tests: **38/38**, `node22-targeted-initial.log`.
- New module tests: **41/41**, `node22-targeted-corrected.log`. The retained initial new-test failure in `node22-targeted.log` is diagnosed below.
- Full appropriate repository suite: **408/408**, `node22-full.log`. Exact command: `node --test --test-concurrency=1 tests/*.test.cjs tests/extension.test.js tests/usage-adapter.test.js Models/tools/viewer/tests/*.test.js`.
- `sync-viewer.js --check`: all 33 runtime assets match; cache SHA256 prefixes match the referenced bytes.
- Package: `/tmp/pq-reader-connectors-20261009.vsix`, **45 entries**, build log `package-corrected.log`. `runtime-package-proof.json` retains package SHA256, complete ZIP inventory and SHA256 for every runtime asset. All 33 packaged runtime files equal canonical and generated media bytes; no tests, models or verification evidence is bundled.

## Preserved failures

See `failures-and-boundaries.md`. No old receipt was relabeled or overwritten. The only failed new assertion was a harness API mistake (`contains` absent), corrected to an equivalent supported ancestor check; production code did not change in response. Package first failed because this checkout lacked `vsce`; Node22 `npm ci` installed the lockfile dependencies, then the package succeeded. Runtime files stayed unchanged throughout final browser, full suite and package verification.
