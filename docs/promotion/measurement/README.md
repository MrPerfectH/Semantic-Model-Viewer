# Baseline and weekly measurement

Prepared 2026-10-18 for [#117](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/117), [#121](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/121) and [#122](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/122), under [approved epic #113](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/113). This is preparation, not completion of the four-week pilot. No analytics account access, new app telemetry, posts, outreach or issue closures are implied.

## What we know now

- [LinkedIn launch post](https://www.linkedin.com/posts/przemyslaw-harazny_powerbi-dax-semanticmodels-activity-7516511461960220672-hqjP): **120-second duration and 23-second mean watch time are user-provided**, not independently verified analytics. Their reporting period and view denominator are unknown. 23/120 is about 19.2% of duration; that is NOT a completion rate or a retention curve, and does not prove 23 seconds is the optimal video length.
- Guest-access web extraction on 2026-10-18 showed “2d”, five visible comment entries and a “See more comments” link. Thus five is a visible subset/lower bound, not the post's total comment count. Comments express encouragement and intended use, not independently verified adoption. No reliable reactions, reposts, impressions, reach, clicks, video views or completion total was exposed. Exact publication time remains owner input; do not infer it from the relative label or URL ID.
- [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=MrPerfectH.semantic-model-viewer): **14 installs**, retrieved directly from public HTML on 2026-10-18. The page labels these unique installations excluding updates; this is the platform's aggregate, not a verified count of active people or opened models. Web extraction failed for this URL, but a read-only HTTP GET succeeded. No private publisher dashboard was accessed.
- [GitHub releases API](https://api.github.com/repos/MrPerfectH/Semantic-Model-Viewer/releases?per_page=100): **28 asset download events across 10 releases/20 assets: 18 VSIX and 10 ZIP**. The latest v0.3.9 accounts for one VSIX download and zero ZIP downloads. Counts span asset lifetimes, not seven days. Source archives/clones/browser demo visits are not included. Repeated downloads and maintainer/automation downloads may be present; do not equate these events with installations.
- [Repository API](https://api.github.com/repos/MrPerfectH/Semantic-Model-Viewer): **6 stars, 0 forks, 1 subscriber** at capture. Context only; none measures successful first use.

Machine-readable evidence: [public-baseline.json](public-baseline.json) records exact retrieval time, source endpoints and aggregates; [release-assets-baseline.csv](release-assets-baseline.csv) records each immutable asset ID, release, publication date, count and URL. No time trend can be calculated from this single snapshot. Marketplace and GitHub totals overlap and must not be added as “users”.

## Working files

- [post-results.csv](post-results.csv): one row per post observation; append, do not overwrite the launch baseline. Separate LinkedIn and X rows even for the same story. No X post or result is invented.
- [weekly-review-template.md](weekly-review-template.md): copy for each review and final four-week decision.
- [feedback-log.csv](feedback-log.csv): observed issue, actionable classification and permission state. The seed row is a research signal, not a confirmed app defect or testimonial.
- [community shortlist](../research/community-shortlist.md) and [drafts](../research/contribution-drafts.md): eight researched destinations with permission limits; nothing sent.

## Observation protocol

1. Owner records publication timestamp with timezone, exact URL, story issue, format, duration, CTA, release/host and approved copy/asset reference. T0 is actual publication, not the planned date. An organiser proposal's response date is separate from any eventual event date.
2. For each published post, observe at **T0 + 168 hours**. Store target time and actual capture time. Use platform analytics for the first 168 hours if available; otherwise capture cumulative totals near that point and label exact post age. Late or early lifetime snapshots must not be relabeled as seven-day totals. Allow a practical ±6-hour capture tolerance but record deviation; compare exact windows where exports support them. Anything outside tolerance is a noncomparable snapshot until a matching period is available.
3. Record an optional T0 + 24-hour operational check separately; never compare it with another post's seven-day result. A launch baseline with unknown age stays contextual until the owner provides timestamp and comparable analytics.
4. At a consistent weekly UTC time (first proposed follow-up: **2026-10-25 11:58 UTC**, not an activated schedule), re-read Marketplace and GitHub aggregate counts. Preserve asset IDs and snapshot time. Compute same-asset count differences; flag replacement/deletion/reset instead of silently treating a negative difference as negative downloads. Track new assets separately. Add only known counters; removed assets make whole-repository comparisons incomplete.
5. Review mature posts once weekly for four weeks. If the pilot starts after 2026-10-18, shift its calendar; observation windows remain publication-relative. Week-four posts may need a fifth calendar-week capture to reach seven days. Do not conclude early merely to fit a four-week meeting date.

## Metric definitions and missing data

Use numeric zero only when a source actually reports zero. `unavailable` means absent/inaccessible; `unknown` means the time/definition is not known; `not_applicable` means the metric does not fit the format. Preserve source definitions and evidence timestamps. Never fill missing clicks from likes, public comments or download changes.

- **Impressions:** platform-reported displays, potentially repeat exposures. **Reach:** platform-reported unique members/accounts; keep separate.
- **Link clicks:** clicks to the named CTA destination when analytics identifies them. Keep generic post clicks and outbound link clicks separate; record the definition verbatim or in an evidence note. CTR = link clicks / impressions only when both cover the same post/window and clicks use that definition. If denominator is zero or unknown, CTR is unavailable. Tagged links alone do not measure clicks without an existing read-only analytics source; this plan adds no telemetry or link service.
- **Video:** mean watch seconds, views and their threshold definition, completed views and completion-rate definition. Compute completed views / eligible views only when the platform supplies a compatible denominator. Images have video metrics `not_applicable`.
- **Meaningful feedback:** a concrete setup blocker, question, reproducible defect, workflow request or voluntary example. General praise is not a validated use case. Preserve a short paraphrase and source; do not store private models or copy testimonials without permission.
- **Adoption signals:** Marketplace install-count delta, per-asset download delta, optional owner-provided aggregate GitHub traffic/referrers. These are ecosystem trends, not attribution to a post. No model-open/success/retention counts are available. Distinguish “reported trying” from “observed successful task”.
- **Effort:** production and response minutes, captured by owner, supports deciding whether X is worth continuing even if counts are small.

## Owner analytics/input request

Provide the launch publication timestamp/timezone, original duration confirmation, and the analytics period/definition behind the reported 23-second mean. At seven days, provide aggregate impressions, reach, destination link clicks (or clarify only generic clicks are available), views, mean watch time, completed views/retention if the platform exposes them, and reactions/comments/reposts. Supply a dated export or redacted screenshot; no credentials or personal viewer lists are needed. If a field is unavailable in the account, keep it unavailable.

For Marketplace, optionally supply dated publisher acquisition/install aggregates and metric definitions; public installs already provide a starting point. For GitHub, optionally supply traffic/clones/referrers while history remains available. Do not assume those private sources are accessible or require them to start the pilot. Record owner-known test downloads/releases as confounders without subtracting guessed amounts.

## Decisions supported today

Prepare one 20–30-second DAX dependency story (#57) and a 3–5-image focused-model story (#58) with legible results. These are feasible experiments, not a controlled duration test. Keep story, channel, posting time, audience distribution, asset age and release differences in the review. Use matched seven-day observations and describe small samples without statistical superiority claims.

Prioritise first-use questions and concrete feedback over reaction totals. The public launch comments do not yet establish the top three product problems. A future feedback-led story can answer the observed distinction between diagram clutter and model correctness, using synthetic material rather than quoting the Reddit author. Keep LinkedIn primary; test adapted X wording only within owner capacity and approval. After two comparable weekly cohorts, adjust X effort based on substantive responses/clicks where available and time spent; no unsupported numeric success target is imposed.

No issue should be closed on the basis of these artifacts alone: #117 needs owner analytics or explicitly acknowledged unavailability; #121 needs approved actual publication/contribution records; #122 needs sufficiently mature results and an owner decision. #120's research is prepared, with SPARBI clarification and some organiser policies still outstanding.
