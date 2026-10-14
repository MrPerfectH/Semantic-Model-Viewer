# Fresh installed Power Query acceptance — 2026-10-14

Host: Omarchy/Arch Linux x64 Wayland, downloaded VS Code 1.141.1 revision
`7baac39ec3ca969dab74ac12c097f6a486e46593`. Isolated configuration, extensions,
synthetic workspace, logs and artifacts: `/tmp/smv-pq38-native`. User configuration
and real source models untouched. Source base `origin/main` 341b112.

Actual released v0.3.9 VSIX SHA256:
`1a2af0c9ecc8c1f7826bdea9a7f7058ef99fb2bf119fa89f15444cf13eb09f80`.
CLI installed it; native model tree opened synthetic BIM. Flow, inspector, expanded
reader, Copy M and native snapshot save worked, but source was dark text on dark
background: [before](before-code-contrast.jpg).

Root cause: native VS Code pre/index.html injects global `code` background
`var(--vscode-textPreformat-background)` and 4px radius. `.pqi-source-line` owned
foreground/padding but not background/radius. Scoped transparent background and
zero radius resolve the leak. No other host styles overridden. Real browser
cascade regression with exact original packaged CSS [fails](theme-before.log),
then passes both light/dark host variables with [repaired CSS](theme-after.log).

Fixed candidate VSIX SHA256:
`a57c5a4de8c0aec67bd2aab644beb106b1cc03fbd09f00a0867eafe6a8e072bc`.
Version 0.3.9 retained for disposable testing; **not a published repaired release**.
Force installed and fully restarted the native app. Fresh results:

- BIM and TMDL discovered/opened via real installed extension model tree.
- BIM Report flow displayed 7 objects; Merged Query inspector/expanded reader
  readable in dark host: [dark reader](after-dark-reader.jpg).
- Actual Prepared source reference navigated inspector without replacing flow.
  Actual Copy M OS clipboard (`wl-paste`) exactly
  `let Source = #"Raw West" in Source`: [navigation](after-navigation-copy.jpg).
- Disposable profile changed to Default Light Modern. PQ38 TMDL displayed 16
  objects; CycleA/CycleB flow and cycle annotation worked. Expanded reader readable
  and OS clipboard Copy M exactly `CycleB`: [light reader](after-light-reader.jpg).
- Actual Refresh Model command invoked through native command palette; 16 objects
  retained and flow selection reset: [refresh](after-refresh.jpg).
- Real native Save dialogs exported BIM/TMDL HTML snapshots. SHA256 BIM:
  `2bf05847e55809a23a839c84ce4925fc74986705cf10859fae46523831670338`;
  fixed TMDL: `077a2eba723e14d810f55f4585f5d12c5d2d1e1ea0ce72ac8b6750510e366814`.
- Both exact exports reopened/re-exported with documented
  `tests/pq38-snapshot.browser.cjs`: networking disabled and fetch/XHR/storage
  trapped, metadata unchanged, **zero network/storage calls/errors**:
  [offline log](offline.log). T3 preview first rejected `file:` with
  `unsupported-protocol`; existing Chromium file workflow used.
- Focused inspector tests **26/26**, no skips: [log](inspector-tests.log).

This proves fresh native Linux behavior and exact offline exports. No fresh
Windows/macOS test or repaired release publication claimed. Close acceptance after
repair integration, preserving the released-package defect rather than claiming
v0.3.9 flawless. No Fabric work or main merge performed.
