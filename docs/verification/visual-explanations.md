# Visual explanations validation

Implementation: `feature/visual-explanations`, feature #78 and tasks #79–#91.

## Local results

- Existing extension regression suite: 690 tests passed, zero failures or skips.
- CLI, explanation contracts and session suite: 20 tests passed.
- Real Chromium explanation suite: 10 tests passed. Covers repeatable captures, graph/relationship/measure/matrix/cluster/Power Query views, proposals, offscreen matrix focus, walkthrough results and calculations, atomic failure, renderer identity and exported source validation.
- Existing snapshot browser regression: 7 tests passed.
- Extension VSIX package built successfully.
- Final npm package installed in an isolated directory; packaged four-step walkthrough validated successfully.
- Four-step example built successfully. Mobile HTML preview at 360px loaded both images and had no horizontal overflow (scroll width 360px).
- Bundled agent skill validated; git whitespace checks passed.

## Independent reviews

| Review | Findings addressed | Follow-up |
| --- | --- | --- |
| Standards | Offscreen matrix target; malformed URL could terminate local session | No remaining material objections; reviewer ran 15 relevant tests |
| Specification | Matrix targeting, input cell provenance, structured CLI errors, renderer identity, generic arrows/groups | No remaining material objections after inspection of fixes and tests |

These reviews are scoped evidence, not a guarantee of correctness.

## Merge gate

Linux, macOS and Windows GitHub Actions runs remain pending. The draft PR stays isolated until CI succeeds and the owner reviews the complete feature. No merge or automatic merge is enabled. Tasks stay open until complete-feature review.

Captures illustrate an authored explanation; they do not certify the model or execute DAX/M. External query tools supply actual results. Chromium is required for image capture, and Python is required for optional report-usage scanning.

## First CI follow-up

- macOS passed. Ubuntu failed during Chromium sandbox initialization; the Linux job now explicitly selects the runner's system Google Chrome, retaining its sandbox.
- Windows reported an allocation error. Screenshot comparisons now use SHA-256 strings instead of formatting entire image buffers on failure, and CI uploads capture artifacts for diagnosis.
- A repeated-capture mismatch was reproduced locally after incorporating main. Captures now wait for final queued frames, disable LCD text rasterization, use sRGB and run compositor stages before drawing. The real-browser suite passed after these changes; Windows confirmation remains pending.
- Merged main's theme update into the feature branch while retaining semantic object hooks. All 691 regression tests and 20 CLI tests passed after conflict resolution.

## Second CI follow-up

On `46766f5`, Windows and macOS explanation jobs passed and the required repository check passed. Ubuntu still timed out during browser startup. The PR was mergeable, but the feature validation gate remained unmet.

Startup now accepts Chrome's `DevToolsActivePort` file as well as the stderr banner, allows 30 seconds, and includes bounded stderr diagnostics on timeout. Unit coverage verifies silent startup, partial endpoint files, stderr startup, timeout diagnostics and early browser exit. The previous timeout did not include diagnostics, so its underlying cause is not yet confirmed; another Ubuntu run is required.

## Third CI follow-up

On `0219bbb`, macOS and Windows passed again. Ubuntu reached the browser captures, but temporary profile removal failed with `ENOTEMPTY`: browser descendants were still writing after the launcher exited.

Capture cleanup now requests `Browser.close`, waits for graceful exit, and terminates the capture's dedicated POSIX process group before asynchronous profile removal with bounded retries. A process-tree regression test verifies that a descendant cannot keep writing after its launcher exits and cleanup runs. No unrelated browser process is targeted.

## Fourth CI follow-up

On `4826eb8`, Ubuntu and macOS passed. Windows failed one capture when reading `DevToolsActivePort` returned `EBUSY` during Chrome's write. Endpoint-file polling now retries temporary file-lock/access errors within the existing startup deadline and includes the last file error in timeout diagnostics. A regression test covers recovery from a lock and bounded failure for a persistent lock.

## Fifth CI follow-up

On `785d4ed`, Ubuntu and macOS passed. Windows completed startup and cleanup but failed byte-for-byte cluster capture repeatability. Downloaded artifacts show the same layout with rasterization differences across the transformed canvas.

The canvas promotes its rendering layer during Fit, then releases it on a 160ms gesture timer. Explanation readiness now explicitly releases that layer and flushes frames before capture. The regression test extends the timer to keep it pending deterministically, checks it is cleared at readiness, and compares immediate and delayed captures. Exact image equality remains required.
