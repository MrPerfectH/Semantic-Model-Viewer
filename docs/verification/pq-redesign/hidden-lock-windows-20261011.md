# Hidden focus lock: Windows repair and bounded verification

Baseline: `cc9ca3dbc0bd5967240e0d10b0f521d8bf5adcc7`. Tested implementation: `99f605b759a23d159f1f03ce7d0515b2e7eb3a46`, branch `fix/pq-hidden-lock-windows-20261011`. This later documentation commit does not change runtime. The existing independent round10 failure and review remain historical evidence; this is a separate repair receipt.

The shell now names a locked root excluded from the canvas and explains connectivity/group filters or missing membership independently of the inspected object. Reset filters retains the lock, selection, numeric viewport, body scroll and positions. A membership exclusion offers Show all and explains its existing unlock behavior. Search/library facets do not hide canvas objects; Hide includes its root. Generation/navigation guards reject stale recovery callbacks. Back/Undo recompute the notice. Projection, graph, analyzer, canvas and inspector code are unchanged.

Windows execution: host `MSI`, Windows 11 Enterprise `10.0.26200`, `win32/x64`; observed Node process PID `5144`, parent PowerShell PID `32336`, at `2026-10-11T13:41:26.112Z`. Executable `C:\Users\PrzemekHarazny\pq-r10-windows\node-v22.23.3-win-x64\node.exe`, version `v22.23.3`, with that directory first in each Node/npm process PATH. Python `3.13.2`. System Node and global/auth settings were not changed.

Logs and audit runners are outside the repository in `C:\Users\PrzemekHarazny\pq-r10-windows\repair-logs`:

| Check | Result / log |
| --- | --- |
| Pending frozen independent analysis, before repair | 124/124 PASS; `independent-analysis.log` |
| Frozen portable audit of original `r10.vsix` | PASS, 45 files/33 runtime; `portable-audit.log`, `portable-audit-executed.json`. Only its output destination was redirected outside historical evidence. |
| Baseline canonical/Git/media/VSIX/cache | PASS, 33 byte-equal assets/31 keys; `baseline-runtime.json`. Initial `baseline-runtime.log` failed on Windows CRLF checkout conversion; verified unchanged runtime files were restored to LF Git bytes, then media regenerated. No Git configuration changed. |
| New deterministic hidden-lock regressions before fix | 18 failures, including the empty banner; `hidden-lock-before.log` |
| Node22 hidden-lock/workspace/canvas/inspector focused suite | 110/110 PASS; `focused-01.log`, including all 18 new tests |
| Node22 `npm test --prefix vscode-extension` | **620 PASS, 2 FAIL, 5 SKIP** of 627; exit 1, `full-suite-01.log`. This includes the transported 124 independent cases. |
| Full-suite failure diagnosis | Both failures are older generated-fixture byte comparisons: `pq-redesign-independent-fixtures.test.cjs:13` and `pq-redesign-independent-filters-v2.test.cjs:13`. Of 20 artifacts, 18 differ only by checkout CRLF; the two already-exact artifacts retain their intentional bytes. `fixture-line-endings-recheck.log` verifies this without modifying fixtures. This diagnostic is not a full-suite PASS. |
| Windows skips | One symlink-creation test needs Developer Mode/elevation; four Mac launcher cases require POSIX. No settings/elevation changes attempted. |
| Generated sync and source diff | PASS; `repair-sync-check.log`, committed runtime comparison in `committed-runtime.json`; authored diff passes `git diff --check`. |
| Packaging and repaired runtime audit | PASS; `package.log`, `repair-runtime.json`, `committed-runtime.json`; 45 files/33 exact committed canonical/media/VSIX assets/31 cache keys. Only `index.html` and `js/power-query-workspace.js` changed among runtime assets. |

The legacy round9 analysis test unexpectedly rewrote `independent-analysis-graph.json`. Its output was identical to baseline Git content; the original CRLF checkout bytes were restored, and regenerated output was saved only under external logs. See `round9-receipt-restoration.log`. No historical evidence is included in the repair commits. The transported corpus and pre-existing modifications remain uncommitted.

Original package SHA256: `7d8547b60538ae96e61f2e2f2a8bdf7469152a9984b9d3c02ec5f3834aa37293`. Repaired package: `C:\Users\PrzemekHarazny\pq-r10-windows\repair.vsix`, SHA256 `a837f35af0a2277298451c9d55cc2b9a80f8c328fa191111128dbad34d340754`. Repaired workspace SHA256 starts `318589acb5` and matches its cache key. The archive path allowlist matches the original 45-file package; no model, fixture, test, verification-doc or data payload was added. Nine non-media text entries differ from the old package only by checkout line endings; details are in `committed-runtime.json`.

Privacy remains scoped: the pre-existing `smv_models_v1` import cache retains raw M. Shared snapshots exclude it. The repair adds no persistence, source evidence, credentials, network access or M execution; existing dock preferences contain only geometry. Full-suite snapshot and source-evidence checks passed, but this is no claim that M is never stored.

No browser jobs or native installation were run. Deterministic DOM tests do not certify browser scroll/layout/accessibility behavior. Separate Mac-only independent replay of the frozen hidden-lock scenario against the integrated exact SHA, native Windows acceptance, and final user acceptance remain open. No push, main merge or release was performed. The feature PR receives a progress comment explicitly distinguishing this local bundle from its remote head.

## Coordinator exact-byte follow-up

On Windows MSI, the coordinator restored only historical fixture checkout files to exact HEAD Git blob bytes after confirming CRLF-only conversion. No tracked fixture, builder, assertion or global Git setting was changed. The original failed full-suite-01.log is preserved externally. A fresh Node22 v22.23.3 full run at 6a06b616b5385de3fd3c3fc1f6b453bb321fbca4 then passed: 627 tests, 622 pass, zero fail, five skip, captured process exit 0 (repair-logs/full-suite-02.log and .status). This includes the transported pending 124-case independent analysis file; do not label it the smaller committed-only suite. Four skips are Mac-only launcher harness cases; the fifth is Windows symlink permission. No security setting was changed. A round9 test-written receipt was saved externally then restored to exact tracked bytes.

Browser frozen gate remains separate and pending; runtime is unchanged from 99f605b. No main merge/release.
