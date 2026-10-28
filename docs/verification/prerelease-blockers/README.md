# Develop pre-release fixes: #179 and #180

Base: `origin/develop` at `1f68b9327ec4947b605841a4b25aacbac34e55ea`.
Work was isolated from the parent checkout. Source extension version remains
`0.5.0`; preview stamping and stable publication policy are unchanged.

## Actual viewer flow

Command: `smv show 'Models/demo/Contoso Retail.SemanticModel' --table Inventory --related --dependents --open none`.
The screenshots come from the actual managed side-by-side workspace, using this
checkout's renderer, not a synthetic layout fixture. Temporary sessions were stopped.

- [Before, 1440 × 1000](before-inventory-1440.png): focused library was already hidden by the interactive adapter, but its Browse control was also hidden with the footer. The adapter forced Top → bottom.
- [After, 1440 × 1000](after-inventory-1440.png).
- [After, 1100 × 1000](after-inventory-1100.png): a 536px dependency pane keeps its whole width for the explanation.
- [Measured geometry and keyboard results](flow-checks.json): actual Enter opens the library and focuses search; Escape closes it and restores focus to the toggle. No document horizontal overflow at either width.

New focused explanations use Left → right. Explicit Top → bottom and Bottom → top,
including saved orientations, remain available. This change does not claim to
repair all vertical edge routing. Native Measures browsing retains its expanded
library default and remembers the user's collapse preference. Snapshot state
includes the library visibility, with existing searches, source, and camera state.

## Validation

- Viewer/extension suite: 899 tests, 898 passed, no failures, one Windows-only registration check skipped on Linux (97.4 seconds).
- Browser suite: 38 checks passed across `interactive-view.browser.cjs`, `measures-layout.browser.cjs`, and `measure-comparison.browser.cjs`; the added real PNG export regression also passed. Final focused rerun passed all four library/export checks.
- Parent review found the Git Marketplace plugin's committed copies still had the old guidance and focused-view runtime. Those ten files were synchronized with the canonical sources. A new parity regression failed against the stale copies, then all four plugin tests passed after synchronization, including live sessions and HTML exports without node_modules. Full PR CI must pass for this follow-up commit as well.
- Fabric helper built with .NET 8; all 25 Fabric tests passed, including native Linux helper validation.
- Linux private Node 22.23.4 runtime was downloaded and checksum-verified. The complete CLI was rebuilt from the candidate source and exercised with the portable/VS Code CLI acceptance scripts.
- The rebuilt packaged and extracted Linux VSIX was exercised with actual VS Code 1.101.0 under Xvfb. The assertions retain the original 25-second deadline and now additionally require visible, sized renderer acknowledgements with nonzero table/measure node counts. [Recorded native result](native-host.json). Acceptance includes terminal CLI execution with Node absent from PATH, adjacent editor groups, reuse, comparison, source refresh, and metadata queries.

## Outstanding release gate: original CI failure

The baseline VSIX from the exact develop source passed on Wayland, Xvfb, five
cold Xvfb profiles, and five further cold profiles constrained to one CPU core.
CDP inspection confirmed loaded real webview documents and rendered node counts.
The original missing second acknowledgement in
[CI run 40774077399](https://github.com/MrPerfectH/Semantic-Model-Viewer/actions/runs/40774077399)
was **not reproduced**. No verified root-cause fix for that intermittent failure
is claimed. Native editor status now records panel visibility/column and renderer
workspace, viewport and node counts; failure logs are retained as a CI artifact.
Assertions and deadlines were not weakened or extended.

The current workflow still validates private runtimes on Linux x64/arm64,
macOS x64/arm64, and Windows x64. Distribution joins native-runtime acceptance,
macOS helper signing and platform packaging before the Marketplace pre-release
job. Local Linux acceptance does not replace that matrix. Parent must inspect
PR CI, merge only verified changes to develop, and verify successful distribution
and pre-release publication. Stable publication remains on hold.

Local candidate VSIX: `dist/verified.vsix`, SHA-256
`d46f809cb6b133d818d9a24a38d13d88ae5d50dfd4025f9acbe971e81d9adc0e`.
