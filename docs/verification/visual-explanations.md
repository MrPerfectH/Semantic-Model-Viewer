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
