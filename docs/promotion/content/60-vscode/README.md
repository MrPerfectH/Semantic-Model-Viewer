# #60 — Inspect a model inside VS Code

Question: “Can I inspect my semantic model inside VS Code?” Status: native Linux host rehearsed; 24-second captioned video, SRT and thumbnail prepared. Owner editorial acceptance remains open.

## Rehearsed actions and captions

Installed the published v0.3.9 VSIX in official VS Code 1.142.0 for Linux x64, with isolated temporary user-data and extension directories. Opened a workspace containing only the synthetic `Models/demo/Contoso Retail.SemanticModel` from tag v0.3.9. Installation happens before the clip.

1. 0–4.5 s: select discovered Contoso Retail in Semantic Models; hide the editor sidebar to give the viewer room.
2. 4.5–8 s: Measures → search Gross Margin → select Gross Margin %.
3. 8–14 s: hold the measure and its upstream graph.
4. 14–20 s: select Gross Profit in the graph; Fit all. Compare `DIVIDE ( [Gross Profit], [Total Sales] )` with `[Total Sales] - [Total Cost]`.
5. 20–24 s: hold the comparison with the release CTA caption.

## Assets and accessibility

- [Captioned MP4](assets/vscode-captioned.mp4), silent H.264, 1440 × 1140, 24 seconds.
- [Timed captions / narration](captions.srt).
- [Thumbnail](assets/thumbnail.png) and [native rehearsal comparison](assets/rehearsal-comparison.png).
- [Uncaptioned native capture](assets/raw.mp4), 1440 × 1040.

Alt description: In Linux VS Code, the Semantic Models sidebar discovers Contoso Retail. The viewer opens in an editor tab. Measures search finds Gross Margin %. Selecting its Gross Profit graph node displays both original DAX expressions in the comparison pane.

The video samples the actual compositor-rendered editor window (51 frames over 24 seconds, approximately 2 fps under capture load), preserving capture timing, then encodes at 30 fps with duplicated frames. It is not a browser mock, simulated interaction, or 30-fps source capture. The recording has no audio. Captions sit below the entire editor window. See shared QA for exact host and fixture evidence. Platform upload preview and real-device readability remain owner gates.

## LinkedIn draft

Working with semantic model files in VS Code?

Semantic Model Viewer can open a discovered model in the editor, where you can select a measure and inspect its dependency graph alongside the DAX. This Linux VS Code recording uses synthetic Contoso and compares Gross Margin % with Gross Profit.

Install the released VSIX: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9



## X draft

Inspect a semantic model inside VS Code: select a measure, follow its inputs, compare the DAX. Synthetic Contoso example.

Install the released VSIX: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9

## Claim boundaries

No claim of in-viewer source editing, live Power BI Service synchronization, automatic report scanning or a Marketplace listing. A source edit would happen in VS Code’s text editor and is a separate follow-up. Automatic refresh was not rehearsed and is not promoted here.

## Release / host QA

Passed: published VSIX installation, installed-version listing, workspace discovery, webview opening, measure search, graph-node selection and DAX comparison on Linux. No Windows/macOS test, refresh test, clean-user onboarding acceptance or installation UI video is claimed. The isolated synthetic workspace was pretrusted for capture; normal workspace trust/setup decisions are outside this clip. #114 guidance still needs owner review.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
