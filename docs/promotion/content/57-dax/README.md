# #57 — What feeds this measure?

Status: recorded and captioned; owner editorial and phone-size review pending. See [shared QA](../QA.md). Release v0.3.9 web ZIP, locally served in T3 Chromium, 1280 × 800, 2026-10-18. Synthetic built-in Contoso Retail; no customer data.

## Rehearsed screen actions / script

1. Preparation: choose Contoso Retail; Measures; search `Gross Margin`; select `Gross Margin %` under Name matches. Leave Original DAX selected; do not enable Inline measures. Use Fit all (accessible label: Fit entire dependency graph).
2. 0–6 seconds: start with the useful result already visible: Gross Margin % and its upstream graph. Caption: “What feeds Gross Margin %? Follow the purple upstream measures.”
3. 6–14 seconds: single-click the Gross Profit graph node. Hold the original formula and COMPARING · UPSTREAM panel together. Caption: “Select Gross Profit to compare its DAX. Gross Margin % stays in view.”
4. 14–18 seconds: hold. Caption: “Static inspection. No DAX execution.”
5. 18–end: hold. Caption: “Explore the demo’s Measures view. Link in the post.”

Verified formulas: `DIVIDE ( [Gross Profit], [Total Sales] )`; Gross Profit is `[Total Sales] - [Total Cost]`. Do not call this performance analysis, complete report impact analysis or automatic report-usage scanning. The synthetic report-page badge is incidental, not evidence for any such claim. Downstream impact is reserved for another story; no inlining or context-transition claim.

## Assets

- [Captioned MP4](assets/dax-captioned.mp4), about 21 seconds; silent, burned-in captions; [SRT](captions.srt) doubles as optional voiceover script.
- [Thumbnail](assets/thumbnail.png) and [comparison source](assets/02-compare.png).
- `raw.mp4` is the original browser recording. `01-inputs.png` is an earlier rehearsal still; the final recording uses Fit all.

## LinkedIn draft

What feeds Gross Margin %?

In this synthetic Contoso model, select the measure in Semantic Model Viewer, follow its purple upstream branch, then select Gross Profit. Its DAX appears beside the original formula, so you can read both without losing your starting point.

This is static dependency inspection—not DAX execution, performance analysis or a complete report-impact check.

Explore the demo’s Measures view: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## X draft

What feeds Gross Margin %? Select Gross Profit in the dependency graph to compare both DAX formulas. Static inspection; no DAX execution.

Explore Measures in the demo: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## Release / host QA

Graph selection and comparison passed on the published v0.3.9 web asset. Demo destination loaded successfully, but its DAX JS differs from the release; do not label the public site v0.3.9. Recording shows the pinned local release. Final mobile playback, owner wording approval and platform upload preview remain pending. No publishing or issue closure performed.
