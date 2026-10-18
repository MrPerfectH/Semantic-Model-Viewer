# Promotion content preparation — epic #113

Seven concrete production packages, prepared 2026-10-18. **Six have actual visual assets; VS Code is scripted but awaits host capture. None has editorial acceptance or publication approval.**

| Package | Deliverable present | Remaining gate |
|---|---|---|
| [#57 DAX](57-dax/README.md) | Rehearsed chain, captioned ~21 s MP4, SRT, thumbnail source, separate posts | Owner/platform/phone review |
| [#58 focused relationships](58-focused-relationships/README.md) | Four annotated PNG cards plus original captures, actions, separate posts | Owner/platform/phone review |
| [#59 Power Query](59-power-query/README.md) | Five annotated PNG cards plus original captures, resolved reference and retained uncertainty, separate posts | Owner/platform/phone review |
| [#119 Matrix](119-matrix/README.md) | Three annotated PNG cards plus original captures, shared Product example, separate posts | Owner/platform/phone review |
| [#118 first model](118-first-model/README.md) | Public-demo rehearsal, ~20 s captioned MP4, SRT, thumbnail, separate posts | #114 entry-path acceptance; recheck deployment; no new onboarding |
| [#56 snapshots](56-snapshots/README.md) | Real export + exact-file offline replay, ~20 s captioned MP4, SRT, actual HTML and stills, separate posts | Owner/platform/phone review |
| [#60 VS Code](60-vscode/README.md) | Exact proposed 22 s script, verified distribution destination, separate draft posts | Actual VSIX host rehearsal, MP4, captions and thumbnail; #114 guidance |

[Release/host QA, link checks and limitations](QA.md) · [Four-week queue](editorial-queue.csv) · [Editorial operating notes](editorial-plan.md) · [Asset manifest](asset-manifest.json)

DAX was prepared first. Assets are authentic synthetic Contoso app captures. v0.3.9 web release was used for feature captures; #118 intentionally uses the separately identified public demo. A browser-only capture does not establish VS Code or installed desktop host behavior. No invented UI, telemetry, testimonials or publication outcomes.

Reproduce card formatting with `python render-cards.py` (Pillow required); reproduce video edits with `bash render-videos.sh` (FFmpeg/libass required). Scripts operate only on the retained real captures. Final assets are committed; tools used for capture were installed outside the repository. Raw recordings remain available to revise timing or framing.

The approved acceptance criteria still require owner review. Do not close the issues based on preparation alone. No posting, outreach or scheduler automation has run.
