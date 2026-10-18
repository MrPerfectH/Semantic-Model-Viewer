# Capture, release and destination QA

Checked 2026-10-18. This records preparation evidence, not acceptance approval.

## Source authority and branch

Read GitHub epic #113 and issues #118, #57, #58, #56, #59, #119, #60 and #121 on this date. Their current briefs govern these packages. No issue state was changed. Starting branch was at e1f9cae; fetched origin and safely fast-forwarded to main 6f39e5b before adding content. All authored changes are confined to docs/promotion/content/. No app source edits.

## Released recording host

Downloaded `semantic-model-viewer-web-0.3.9.zip` from the published v0.3.9 release (published 2026-10-14). SHA-256:

`d4d554f2aaa544deea193f3bffcf35ebb030c0941fef035333ed454147e61a72`

Release tag resolves to `341b11240b4e0de2c3f69c2d36cfd60f3c58b037`. Extracted outside the worktree and served unchanged at localhost:8947 using Python http.server. This is a static-web host, not a test of the installed desktop launcher. Chose the built-in synthetic Contoso Retail model. Capture viewport: 1280 × 800 CSS pixels; T3 raw video is 2560 × 1600, normalized to 1280 × 800 plus an external 100-pixel caption band. No captions obscure the UI. Final MP4s are silent H.264/yuv420p with faststart; SRT files also supply optional narration.

T3 collaborative browser user agent: Linux x86_64 Chrome/154.0.0.0. Owned tabs were opened separately and every browser call targeted their tab IDs. No human-owned tab was used. Screenshots are actual app captures; cards add captions and enlarged crops from the same screenshot. No generative imagery or fabricated UI.

DAX, focused relationships, Power Query, Matrix and snapshot export were rehearsed on this release asset. First-model was separately rehearsed and recorded on the public demo because #118 requires it. VS Code was subsequently downloaded and verified in an isolated native Linux host; see below.

## Public-demo version distinction

The live demo loaded synthetic Contoso successfully. It is a deployed public host, but must not be labelled v0.3.9: downloaded public `index.html` and `js/measures.js` differ from the tag, while `js/power-query.js` and `model-data.json` match. Public SHA-256 values on capture date:

- index.html: `075247d1f05905846b05c90ea40b411c58f851f3bfa4d5f3c614b97e5a874d64`
- js/measures.js: `e227b13512e933edb4ea144ef53e507eb505c7016008969270db9467d34e1585`
- js/power-query.js: `89f493d091fd4040324b57b83077a8039ece3afa4a1f99e71811b6ed72ef77b5`
- model-data.json: `1fc96c8939072275a9cffbd507a1252a58ef18e261819199df9ff02d31cc07d5`

No onboarding from #114/#115/#116 is represented as released. First-model shows an explicitly prepared view, not the fresh-page default. Recheck the deployed demo before publishing.

## Fixture checks

The built-in model contains 43 tables, 68 relationships and 88 measures. Names were selected from the actual UI, not the issue's illustrative Margin/Revenue fixture brief.

- Gross Margin % = `DIVIDE ( [Gross Profit], [Total Sales] )`.
- Gross Profit = `[Total Sales] - [Total Cost]`.
- Sales[Product Key] relates many-to-one to Product[ProductKey]; Product filters Sales. The separate Sales Ship Date → Date relationship is inactive. Include inactive relationships remains visible in relationship captures; do not call all displayed paths active.
- Matrix cell descriptions confirm active Product relationships with Sales, Purchases and Returns. Matrix says five non-fact relationships are omitted.
- Sales references StageSales. StageSales M references RawSales, Environment and StartYear; StartYear is `2019 meta [IsParameterQuery=true, Type="Number", IsParameterQueryRequired=true]`. StageSales also has two unconfirmed links; screenshots retain this uncertainty. The first Open Power Query cold load did not retain the intended flow; selecting Sales in the loaded library recovered it. This is recorded, not silently described as a seamless automatic selection.

## Snapshot export / recipient proof

The final capture exported `Contoso Retail snapshot 2026-10-18.html` at 12:05:55 UTC. Copied the exact downloaded bytes into `56-snapshots/assets/contoso-snapshot.html` (934748 bytes). SHA-256:

`b6272bd0db744c99c87c544ff42af2d88bb18630f597eb9d7d81a64d8f2945d5`

T3 direct-file open failed with `Invalid preview URL (unsupported-protocol: file:; input length 158)`. Only this unsupported file operation used a standalone browser fallback: Playwright, Chromium 156.0.0.0 on Linux, fresh context, `offline: true`, 1280 × 800. It opened the exact exported file via file://, then Measures → Gross Margin % → Gross Profit. Verified comparison DAX and payload counts (43 tables, 68 relationships, available M). The recipient recording is a real fresh-context capture, joined to the export footage with a visible cut. It is not a simulated OS file-picker recording. No general “all browsers” compatibility claim. M payload presence was verified; recipient M navigation is not part of this short clip.

Snapshot scope: all loaded analytical metadata, including hidden objects, DAX and available exact M. Presentation focus does not restrict scope. Not a full backup: no imported rows, raw source files or separate connection settings. Literal M may contain source addresses and parameter values. No refresh, DAX/M execution, source connection or automatic report scan.

## Verified destinations

HTTP 200 on 2026-10-18 for:

- Demo / CTA: https://MrPerfectH.github.io/Semantic-Model-Viewer/
- Pinned release / VSIX CTA: https://github.com/MrPerfectH/Semantic-Model-Viewer/releases/tag/v0.3.9
- Installation instructions: https://github.com/MrPerfectH/Semantic-Model-Viewer/blob/v0.3.9/vscode-extension/README.md

GitHub release API confirms the distributed VSIX asset `semantic-model-viewer-0.3.9.vsix`, 281707 bytes, SHA-256 `1a2af0c9ecc8c1f7826bdea9a7f7058ef99fb2bf119fa89f15444cf13eb09f80`. The subsequent native Linux installation test below also passed. No Marketplace claim. Each social draft has one primary CTA; use the installation instructions as supporting context, not a second competing action.

## Publication gates still open

- Owner editorial approval of each asset, copy and account-specific upload preview.
- Target LinkedIn/X upload preview and real-device readability. All twelve actual cards were reviewed at 390 px rendered width and improved as described below; this is not real-device/platform acceptance.
- #60: owner/platform/real-device review and #114 setup wording. Native Linux install/discovery/comparison and video/SRT/thumbnail are now complete; Windows/macOS are untested.
- #118/#60: revalidate setup-dependent wording against #114; do not show new onboarding until #116 releases and verifies it.
- #117 baseline and tracking readiness; #120 approval/rules before any community contribution. No analytics are invented.
- The user-reported 23-second average on a two-minute launch video is only a baseline. The 15–30-second format is an experiment, not evidence of an optimal duration.

No social posting, messages, scheduler automation, testimonials, issue closure or acceptance sign-off occurred.

## Final artifact validation

Seven package README files contain separate LinkedIn and X drafts. Twelve annotated 1080 × 1350 PNGs decoded successfully, and all local Markdown links resolved. The CSV has 16 rows (eight story slots × two channels), no published URLs and explicit review gates. Final H.264 MP4 durations: DAX 21.60 s; first-model 20.37 s; snapshots 20.03 s. Each is 1280 × 900 including the caption band. Sparse browser recordings were converted to 30 fps before burning timed captions; representative comparison frames were visually inspected after rendering. PNG detail crops and representative final cards were inspected. This is desktop artifact QA, not owner/native-platform/real-phone acceptance. File hashes and dimensions are in asset-manifest.json. No application tests were needed because no application source changed.

## Native Linux VS Code follow-up (#60)

Verified 2026-10-18 in the existing content worktree on `t3/prepare-launch-content-packages`, continuing 6b02e45. Official Linux x64 archive downloaded from `https://update.code.visualstudio.com/latest/linux-x64/stable` into `/tmp/smv-native-126/editor`. CLI reports VS Code **1.142.0**, commit `6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`, x64. OS: Omarchy (Arch family), kernel `7.2.5-3-omarchy`, live Hyprland Wayland desktop. This is Linux coverage only.

Installed the actual GitHub v0.3.9 asset with `--user-data-dir /tmp/smv-native-126/user-data --extensions-dir /tmp/smv-native-126/extensions --install-extension /tmp/smv-native-126/semantic-model-viewer-0.3.9.vsix`. SHA-256 matched the release digest above. CLI returned successful installation; `--list-extensions --show-versions` returned `mrperfecth.semantic-model-viewer@0.3.9`. Release destination was rechecked HTTP 200. No user's installed editor or settings were changed. Temporary settings disabled telemetry, updates and AI features, selected Light Modern, and pretrusted this synthetic-only workspace.

Fixture was extracted with `git archive v0.3.9 'Models/demo/Contoso Retail.SemanticModel'`. The native Semantic Models activity view discovered Contoso Retail. Selecting it opened an actual extension webview in an editor tab: 43 tables / 68 relationships; Measures showed 88 measures. Search Gross Margin → Gross Margin % → click Gross Profit graph node → Fit all displayed the original two formulas recorded in fixture checks. A 1440 × 1040 window gave both DAX panels sufficient height. No source editing, refresh, DAX execution, Power BI connectivity or Windows/macOS coverage is claimed. Installation was CLI preparation, not part of the clip; trust was preconfigured, so this is not clean-user onboarding acceptance.

Captured only the editor window through `grim` on the actual Wayland compositor. Native pointer/keyboard automation performed the actions. 51 timed compositor captures over 24 seconds were encoded with their original elapsed durations, then normalized to 30 fps; this duplicates frames (approximately 2-fps source under load), not smooth 30-fps source video. No browser recording or invented UI was substituted. Retained `60-vscode/assets/raw.mp4` is 1440 × 1040; final captioned MP4 and thumbnail are 1440 × 1140 with an external 100-pixel caption band. Reviewed representative raw and final frames, including full comparison and CTA. The capture uses the original released host UI, not the other agent's onboarding changes.

## 390-pixel card review follow-up

Rendered every one of the twelve actual 1080 × 1350 cards at 390 × 488 and visually inspected them in three groups. Original 300-pixel-high detail areas made tall relationship controls and query provenance too small. Reduced the overview to 800 × 500 and expanded the authentic detail area to 440 pixels high. Tightened the Power Query input crop around Environment / StartYear / RawSales → StageSales, and the parameter crop around the literal 2019. All original full captures remain unchanged and retain context, including unconfirmed-link evidence. Reviewed all final cards again at 390 px, including the revised Power Query crops. Captions and key detail labels are improved; overview text is intentionally contextual and still requires opening the image for fine detail. This is a rendered-size artifact check, not a physical-phone or social-platform test.

All seven packages now have visuals: four captioned videos and twelve annotated cards. Regenerated manifest includes new native assets and all SRT hashes. Owner/editorial/platform gates remain open; nothing was published, scheduled or merged. No application source changed, so application tests were not run.
