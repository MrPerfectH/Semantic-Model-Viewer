# #60 — Inspect a model inside VS Code

Question: “Can I inspect my semantic model inside VS Code?” Target 22-second clip. Status: complete production script and copy; distributed-extension host rehearsal and video PENDING. No VS Code executable is installed in this environment. Do not publish as a demonstrated result yet.

## Exact actions and captions

Preparation: download the v0.3.9 VSIX from the verified release; install using Extensions: Install from VSIX…; open a workspace containing the released `Models/demo/Contoso Retail.SemanticModel`. Start with the extension already installed. This preparation is documented but NOT rehearsed here.

1. 0–4 s: open Semantic Models in the Activity Bar; select discovered Contoso Retail. Caption: “Explore your semantic model inside VS Code.” Expected result: viewer webview. PENDING host verification.
2. 4–9 s: Measures → search Gross Margin → choose Gross Margin %. Caption: “Select a measure to inspect its inputs.” Exact measure/formula verified in the v0.3.9 browser host; editor navigation remains PENDING.
3. 9–17 s: select Gross Profit in the graph; use Fit all if needed. Caption: “Read the original DAX beside its dependency.” Expected comparison must be verified in the distributed VSIX before recording.
4. 17–22 s: hold. Caption: “Install the released extension. Link in the post.”

Record at 1280 × 800 or larger, using a synthetic-only workspace. Keep source editing and refresh out of this initial clip. Capture a comparison thumbnail and burn captions from these timings after host rehearsal.

## Assets and accessibility

No invented VS Code screenshot or substitute browser video is supplied. `assets/` is reserved for the actual host capture. Remaining deliverables: 15–25 s captioned MP4, SRT, thumbnail, VS Code version/OS and installed-extension version evidence, model-discovery and graph-selection rehearsal.

The numbered captions above also serve as image alt descriptions / silent-video script. Captures use synthetic Contoso data. Annotated cards preserve the original screenshot and add a labelled crop; they do not redraw the UI. Owner editorial approval, phone-size review and platform upload preview are still required.

## LinkedIn draft

Working with semantic model files in VS Code?

Semantic Model Viewer can open a discovered model in the editor, where you can select a measure and inspect its dependency graph alongside the DAX. The planned example uses synthetic Contoso and compares Gross Margin % with Gross Profit.

Install the released VSIX: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9



## X draft

Inspect a semantic model inside VS Code: select a measure, follow its inputs, compare the DAX. Synthetic Contoso example.

Install the released VSIX: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9

## Claim boundaries

No claim of in-viewer source editing, live Power BI Service synchronization, automatic report scanning or a Marketplace listing. A source edit would happen in VS Code’s text editor and is a separate follow-up. Automatic refresh was not rehearsed and is not promoted here.

## Release / host QA

GitHub release API confirms semantic-model-viewer-0.3.9.vsix exists (281707 bytes; digest recorded in QA). The current README documents VSIX installation. No actual VS Code installation, discovery, refresh or webview interaction tested here. #114 guidance-dependent claims remain pending. Do not silently convert the planned instructions into a “passed” record.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
