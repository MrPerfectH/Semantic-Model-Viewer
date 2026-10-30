# #56 — Hand over an explorable frozen copy

Question: “How do I let a colleague explore this model?” Approximately 20-second clip combining actual export and exact-file recipient footage. Status: export/open/offline interaction passed; editorial review pending.

## Exact actions and captions

1. 0–5.5 s: start with the prepared Product view in the released app. Click Save snapshot; retain the actual saved-file notification. Caption: “Save snapshot: one interactive HTML file. Full model metadata, DAX and available M.”
2. 5.5–9 s: editorial cut to a fresh browser context opening that exact downloaded HTML via file://, networking disabled. Caption: “Open that exact file in a fresh browser context. Network disabled for this rehearsal.”
3. 9–16 s: Measures → search Gross Margin → select Gross Margin % → click Gross Profit → Fit all. Caption: “Select a measure and compare its DAX. The recipient can explore the frozen copy.”
4. 16–end: hold the comparison. Caption: “Focused view does not limit export scope. Try Save snapshot in the demo.”

The browser recorder captures content, not operating-system file selection. The export/open transition is an explicit cut, not a staged continuous click. The exact file and its hash are supplied for independent replay.

## Assets and accessibility

`assets/snapshot-captioned.mp4`; `captions.srt`; raw export MP4 and recipient WebM; `recipient-open.png` and `recipient-dax.png`; actual `contoso-snapshot.html`. Use `assets/thumbnail.png` as the thumbnail. The HTML is synthetic but contains full metadata, not merely a screenshot.

The numbered captions above also serve as image alt descriptions / silent-video script. Captures use synthetic Contoso data. Annotated cards preserve the original screenshot and add a labelled crop; they do not redraw the UI. Owner editorial approval, phone-size review and platform upload preview are still required.

## LinkedIn draft

A model handover can be explorable.

Save a snapshot, then open the HTML file in a browser. This example opens the exact export in a fresh context with networking disabled and compares two DAX formulas.

It is a frozen copy containing full model metadata, DAX and available M—including hidden objects. A focused starting view does not restrict export scope. Exact M can contain source addresses and parameter values. Imported rows, raw source files and separate connection settings are not packaged; this is not a full model backup. It does not refresh or run DAX/M.

Try Save snapshot in the demo: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## X draft

Share an explorable HTML snapshot: a frozen copy of full model metadata, DAX and available M, including hidden objects. A focused view does not limit export scope. No data rows or query execution.

Try Save snapshot: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## Claim boundaries

All loaded tables, columns, measures and relationships are exported via the analytical-metadata allowlist, including hidden objects. Layout membership/filters only define presentation. Not a full semantic-model backup: no imported data rows, raw source files or separate connection settings. Exact M includes literal source addresses and parameter values. Snapshot is point-in-time and does not refresh, execute DAX/M, connect to sources or scan reports. Available M can be inspected in newer snapshots; regenerate old snapshots lacking definitions. Share only after reviewing metadata scope.

## Release / host QA

Exported from published v0.3.9 web ZIP in T3 Chromium. T3 cannot open file:// (“Invalid preview URL (unsupported-protocol: file:; input length 158)”), so exact-file recipient QA used standalone Playwright Chromium 156 on Linux, fresh context, offline=true. The downloaded file was copied without modification; SHA-256 is in shared QA. Verified 43 tables, 68 relationships, M payload and Gross Profit comparison with networking disabled. This does not establish support in every browser. Offline M interaction is not shown in this clip; only payload presence was checked here.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
