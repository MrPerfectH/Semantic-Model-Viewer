# Epic: Help Power BI users discover, try, and adopt Semantic Model Viewer

Status: approved and published on 2026-10-18. Parent epic: [#113](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/113).

## Outcome

A Power BI developer can understand the app's value from one short example, choose a suitable setup, open a model, and complete a useful first action without personal assistance. Over four weeks, publish practical examples, participate in relevant communities, and use feedback to improve the starting experience.

Primary audience: Power BI developers and consultants exploring, maintaining, or handing over semantic models.

## Agreed direction and working assumptions

- LinkedIn is the primary publishing channel; X is a smaller experiment using adapted versions of the same material.
- Each content item answers one question and demonstrates one result.
- Start with 15–30-second clips, or 3–5 annotated screenshots where readers need time to inspect details. The reported 23-second average viewing time on the two-minute launch video is a baseline, not proof of the ideal duration.
- Proposed pace: two core stories per week, adapted for both platforms. Adjust to production capacity and results.
- Use synthetic Contoso model content and the actual released app. Verify feature availability before recording.
- A content package contains its brief, exact actions, visual asset, LinkedIn copy, X copy, one call to action, and a rehearsal record naming release and host.
- Public posts, outreach, and testimonials need the owner's editorial involvement. This plan does not send messages or publish content.
- No paid advertising or new in-app telemetry is included. Use available aggregate metrics and voluntary feedback; record unavailable metrics as unavailable.

## Existing work to reuse

- [#56 — HTML snapshot](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/56)
- [#57 — Measure dependencies and DAX](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/57)
- [#58 — Focused table relationships](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/58)
- [#59 — Power Query inputs](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/59)
- [#60 — VS Code workflow](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/60)

The existing video tickets have been revised: retain their verified workflow and claim boundaries, narrow each initial deliverable to one short story, and allow images where more suitable. Longer scripts are retained as optional tutorial material. The old snapshot-first production dependency has been replaced with the order below.

[#100](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/100) covers authored interactive walkthroughs under a separate feature. Assess reusable navigation/caption behavior when implementing first-use help; do not duplicate that feature or assume unmerged work is available in the release.

## User stories

- S1: As a newcomer, I can choose a setup and open a demo or my own supported model.
- S2: As a first-time user, I can discover a useful workflow and reopen guidance later.
- S3: As a prospective user, I can see a concrete benefit in a short clip or image sequence.
- S4: As a community member, I can find a relevant example and get an honest answer about suitability.
- S5: As the maintainer, I can learn which content brings interested users and where they get stuck.

## Tasks

AFK means preparation or implementation can proceed independently within the approved scope. HITL means owner input is needed for usability feedback, editorial decisions, publishing, or access to account analytics. Dependencies below are hard dependencies; the weekly order is a scheduling suggestion.

### T01 — Provide one clear path from discovery to an opened model

Type: AFK. Blocked by: none. Stories: S1.

Build a consistent Start here experience across the README, installation guidance, and app empty state. Offer Try the demo first for evaluation, then concise setup guidance appropriate to VS Code, local desktop, or browser. Keep alternative setups discoverable.

Acceptance criteria:
- [ ] Verify current release/install/demo links and reconcile inconsistent setup instructions, including Marketplace versus VSIX availability.
- [ ] A newcomer can follow each supported route from its entry point to an opened model; document prerequisites and supported model formats.
- [ ] Guidance reflects the current host and explains the next action when no compatible model is found.
- [ ] Verify the demo route and each supported setup route; record any unavailable platform validation explicitly.

### T02 — Deliver optional first-use guidance inside the app

Type: AFK. Blocked by: T01. Stories: S2.

Introduce a brief welcome and contextual guidance for Tables, Measures, and sharing. Show a short explanation beside the relevant control when that workflow is first opened, rather than forcing a user through every feature at launch.

Acceptance criteria:
- [ ] A newcomer can discover adding a table, exploring a relationship, selecting a measure, and saving a snapshot through concise prompts.
- [ ] Guidance offers Skip/Close and can be restarted through Help; dismissal persists per host/profile without modifying model files.
- [ ] Keyboard navigation, focus restoration, and small-window positioning work; unavailable targets or missing model objects do not trap the user.
- [ ] Guidance preserves existing model/layout state, degrades safely if persistence is unavailable, and does not repeatedly interrupt returning users.
- [ ] Validate in browser/local app and the VS Code webview. Offline snapshots remain usable and do not unexpectedly launch onboarding.
- [ ] Assess reuse from #100 and record the decision; implementation must not require users to install an unreleased feature.

### T03 — Validate and release the starting experience

Type: HITL. Blocked by: T01, T02. Stories: S1, S2, S5.

Observe three willing users with differing setup familiarity trying the released candidate: open a model and find one relationship or measure dependency. Record assistance needed and resolve the main blockers before promoting onboarding.

Acceptance criteria:
- [ ] Record completion, time to first useful action, and observed obstacles for each session, with participant permission.
- [ ] Fix or explicitly defer each blocker; recheck affected journeys.
- [ ] Publish/package the approved change through the normal release workflow and verify the actual distributed version.

### T04 — Establish a baseline and weekly results log

Type: HITL. Blocked by: none. Stories: S5.

Create a small tracking sheet/document with the launch post as the baseline. Obtain account-only metrics from the owner; do not invent missing numbers.

Acceptance criteria:
- [ ] Record the reported two-minute duration and 23-second average watch time as user-provided values; add dated reach, clicks, and install totals where available.
- [ ] Define fields for story, format, platform, publication URL/date, impressions, clicks, video completion/watch time, and meaningful feedback.
- [ ] Record available install/download trends separately from attributed post clicks; do not imply causation from coincident changes.
- [ ] Compare posts at consistent observation windows, such as seven days after publishing. Missing analytics are marked unavailable.

### T05 — Produce the first-model content package

Type: HITL. Blocked by: T01. Stories: S1, S3.

Question: “How can I try this without setting anything up?”
Format: 15–25-second clip. Action: open the demo, select a table, inspect one relationship. Result: an immediately explorable model. CTA: Try the demo.

Acceptance criteria:
- [ ] Deliver the shared content package with readable labels, captions, and working links.
- [ ] Show the useful result in the opening seconds; avoid a long logo introduction.
- [ ] Rehearse on the public demo. Do not show onboarding until T03 has released it.

### T06 — Produce the DAX dependency content package (reuse #57)

Type: HITL. Blocked by: none. Stories: S3.

Question: “What feeds this measure?”
Format: 20–30-second clip. Action: select a known measure, reveal its inputs, select one input to compare DAX. Result: the dependency and its formula visible together. CTA: Explore the demo's Measures view.

Acceptance criteria:
- [ ] Deliver the shared content package using a rehearsed dependency chain.
- [ ] Focus on upstream dependencies and one comparison; reserve downstream impact for a later post.
- [ ] Describe static inspection accurately; do not imply DAX execution or complete report impact analysis.

### T07 — Produce the focused-model content package (reuse #58)

Type: HITL. Blocked by: none. Stories: S3.

Question: “How do I understand just this part of a large model?”
Format: 3–4 annotated screenshots. Action: show the broad view, select a fact table, focus on related tables, inspect a relationship. Result: a readable local view of the model. CTA: Try the same workflow.

Acceptance criteria:
- [ ] Deliver the shared content package; screenshots are legible on a phone and available as individual image files.
- [ ] Each image has one action or observation, with explicit before/after context.
- [ ] Explain that visual focus does not delete model tables or simulate DAX filtering.

### T08 — Produce the offline-sharing content package (reuse #56)

Type: HITL. Blocked by: none. Stories: S3.

Question: “How do I let a colleague explore this model?”
Format: 20–30-second clip. Action: save a snapshot, open that exact HTML file in a separate window, interact with it. Result: an explorable handover without installing the app. CTA: Try Save snapshot.

Acceptance criteria:
- [ ] Deliver the shared content package, including a real export/open rehearsal.
- [ ] Show the recipient interaction rather than spending most of the clip on setup.
- [ ] Copy explains that the snapshot is a frozen copy containing full model metadata, DAX, and available M; a focused starting view does not limit export scope.

### T09 — Produce the Power Query content package (reuse #59)

Type: HITL. Blocked by: none. Stories: S3.

Question: “Which query feeds this table?”
Format: 3–5 annotated screenshots; choose a short clip only if the flow is clearer in motion. Action: select a table, open its Power Query view, follow one shared query or parameter, show its M reference. CTA: Inspect your model's query definitions.

Acceptance criteria:
- [ ] Deliver the shared content package on a verified released host with available M definitions.
- [ ] Use a simple resolved example and retain any uncertainty indicators.
- [ ] State that definitions are inspected without running queries or proving a live source connection.

### T10 — Produce the model-overview content package

Type: HITL. Blocked by: none. Stories: S3.

Question: “Which dimensions connect these fact tables?”
Format: 3 annotated screenshots. Action: open Matrix, identify a shared dimension, navigate to its related table view. Result: a concrete cross-model relationship understood. CTA: Explore the Matrix view.

Acceptance criteria:
- [ ] Deliver the shared content package with a fixture that clearly demonstrates the relationship.
- [ ] Keep Domains as a separate reserve story rather than squeezing two workflows into the same post.

### T11 — Produce the VS Code content package (reuse #60)

Type: HITL. Blocked by: T01. Stories: S1, S3.

Question: “Can I inspect my semantic model inside VS Code?”
Format: 15–25-second clip. Action: open the model from the extension and inspect one measure beside its graph. Result: exploration inside the editor. CTA: Install through the verified current distribution link.

Acceptance criteria:
- [ ] Deliver the shared content package using the actual distributed extension.
- [ ] Start from an installed extension; link installation guidance rather than compressing setup into the same clip.
- [ ] Keep source editing/refresh as an optional follow-up story; do not imply editing happened inside the viewer.

### T12 — Research communities and prepare useful contributions

Type: AFK. Blocked by: none. Stories: S4.

Research Microsoft Fabric/Power BI forums, r/PowerBI, Power BI/Fabric user groups, and relevant existing conversations. Clarify the user's “SPARBI” reference before adding it as a confirmed channel.

Acceptance criteria:
- [ ] Produce a shortlist of 6–10 destinations or relevant threads with URLs, audience, recent activity, promotion rules, and date checked.
- [ ] Recommend the top three based on relevance and permitted contribution type, not membership size alone.
- [ ] Prepare an appropriate draft for each: tutorial, disclosed creator feedback request, helpful answer, or organiser demo proposal.
- [ ] Do not post repetitive product links or treat a support board as an advertising channel; do not send outreach during research.

Research starting points (recheck before use):
- https://community.fabric.microsoft.com/category/powerbi
- https://www.reddit.com/r/PowerBI/
- https://techcommunity.microsoft.com/category/usergroups

### T13 — Run the four-week publishing and community pilot

Type: HITL. Blocked by: T04 and the relevant content package for each post; T12 for community contributions. Stories: S3, S4, S5.

Maintain a publishing queue with story, channel, asset, copy, CTA, owner, planned date, approval state, and published URL. Publish ready packages progressively; completion of every asset is not a prerequisite.

Acceptance criteria:
- [ ] Plan two core stories per week with separate LinkedIn and X wording; move dates when material or release validation is not ready.
- [ ] Publish only owner-approved material with explicit authorization to use the relevant account; record public URLs.
- [ ] Make three tailored community contributions or organiser approaches where permitted and approved.
- [ ] Respond to substantive feedback and capture setup problems, feature requests, and possible user examples.

### T14 — Review results and choose the next cycle

Type: HITL. Blocked by: T04 and sufficient published results from T13. Stories: S5.

Review results weekly and close the pilot with a decision on the next four weeks. Compare short video and images without treating small, differently distributed samples as a controlled experiment.

Acceptance criteria:
- [ ] Summarise results by story, format, and channel after comparable observation windows.
- [ ] Identify the three most actionable setup/product problems and create or reference follow-up work.
- [ ] Decide what to repeat, adjust, or stop, including the effort assigned to X.
- [ ] Draft one feedback-led follow-up story; use quotations or user examples only with permission. If none is available, use an observed question or a shipped improvement.

## Suggested sequence

Week 1: T01/T02 onboarding work; T04 baseline; T12 research. Prepare and publish the first-model and DAX stories if their relevant paths are ready. Content about existing functionality does not wait for onboarding release.

Week 2: T03 usability validation and release, subject to fixes. Publish focused relationships and offline sharing. Begin contributions to the best-matched communities.

Week 3: Publish Power Query and VS Code stories. Continue community replies and collect early-user feedback.

Week 4: Publish Matrix and one feedback-led story. Complete T14 and choose the next cycle.

Dates are provisional until production capacity and release readiness are known. This is a manual plan, not an automation or posting schedule already activated.

## Epic completion criteria

- [ ] Starting guidance and optional first-use help released and checked on supported hosts.
- [ ] Three newcomer sessions completed and major blockers resolved or explicitly tracked.
- [ ] Seven core content packages plus one feedback-led follow-up prepared; planned posts published or explicitly deferred with a reason.
- [ ] Community shortlist checked and three approved, tailored contributions/approaches completed.
- [ ] Four-week results review completed, with next-cycle priorities based on available evidence.

## Publication record

Approved by the owner on 2026-10-18. Published in the existing GitHub tracker with native sub-issue relationships, parent references, acceptance criteria, and dependency links. Existing enhancement/documentation labels are used; no new readiness labels were introduced.

- T01: [#114 — Provide one clear path from discovery to an opened model](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/114)
- T02: [#115 — Deliver optional first-use guidance inside the app](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/115)
- T03: [#116 — Validate and release the starting experience](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/116)
- T04: [#117 — Establish a baseline and weekly results log](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/117)
- T05: [#118 — Produce the first-model content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/118)
- T06: [#57 — Produce the DAX dependency content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/57)
- T07: [#58 — Produce the focused-model content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/58)
- T08: [#56 — Produce the offline-sharing content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/56)
- T09: [#59 — Produce the Power Query content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/59)
- T10: [#119 — Produce the model-overview content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/119)
- T11: [#60 — Produce the VS Code content package](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/60)
- T12: [#120 — Research communities and prepare useful contributions](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/120)
- T13: [#121 — Run the four-week publishing and community pilot](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/121)
- T14: [#122 — Review results and choose the next cycle](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/122)
