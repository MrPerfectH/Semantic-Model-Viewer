# Tailored drafts — not sent

Destination IDs and source/rule checks: [shortlist](community-shortlist.md). Story issue numbers below are internal preparation references, not links to paste into community replies. Use synthetic Contoso examples. Owner must edit and verify technical details against the actual target question and released host before posting. For Fabric answers preserve an honest AI-assistance disclosure; do not claim verification until it is done. Do not add product links to support answers or Reddit drafts.

## D1 / C1 — inherited report reply (#58)

> A crowded diagram alone doesn't tell you whether the underlying model is wrong. I would first make a separate layout for one fact table and its related dimensions, write down that fact's grain, and inspect the cardinality, active relationships and filter directions. Then check one report result against the expected business definition before changing relationships. That separates a layout problem from a modeling problem and gives you a small first task instead of a full rewrite.
>
> Disclosure: I create Semantic Model Viewer, so model inspection is an area I work on. These steps can be done in Power BI Desktop without my tool.

Gate: existing replies already cover per-fact layouts. Post only if the grain/validation sequence adds useful context; otherwise skip. No request to test a product or provide feedback.

## D2 / C2 — Hyderabad educational proposal (#118, #58)

**Title:** Read an inherited Power BI model: one fact table, one useful explanation

> I am the creator of Semantic Model Viewer and would like to propose a 30-minute beginner session using a synthetic Contoso model. We will identify one fact table's grain, inspect its related dimensions, and explain one filter path. Participants leave with a repeatable model-reading checklist. I'll show the native model view and, if suitable for your programme, a clearly disclosed example using my viewer. The session is about reading metadata; it does not execute DAX or prove a model is correct. There is no lead capture or sales pitch. Would this fit your live-demo format, and is remote delivery possible?

Owner must provide speaker biography, availability and verified demo release; organiser must accept scope. Submission through the open call, not member outreach.

## D3 / C3 — Desktop relationship answer (#58)

Use only for a matching question; replace introductory reference to the person's exact symptom during review.

> For the relationship you are trying to explain, start with one fact table and include only its connected dimensions in a separate layout. Check which side is unique, whether the relationship is active, and which direction filters travel. Keep an inactive relationship distinct from the active path. A diagram shows metadata; the actual measure and filter context still need testing against your expected result. A small synthetic example with the two table keys and expected result would help narrow this down.
>
> Disclosure: I create Semantic Model Viewer. This answer was prepared with AI assistance and needs to be checked against your model's details; it is not a diagnosis from the diagram alone.

Replace “needs to be checked” with an accurate account of the owner's actual verification before publication. Do not imply an untested answer was validated. No viewer CTA.

## D4 / C4 — Power Query source-inspection reply (#59)

> To document where this query gets its input, inspect the Source step and any referenced queries or parameters, then follow those references back to their definitions. Keep that source map separate from refresh diagnostics: a reference in M does not show that credentials work or that a refresh succeeds. If a source is constructed dynamically, include that expression and a redacted parameter example when explaining it.
>
> Disclosure: I create Semantic Model Viewer and work on static model inspection. This draft was prepared with AI assistance; the exact M in the question needs verification before drawing conclusions.

Use on a source-documentation question only. Validate/redraft the disclosure after owner review. Do not claim complete lineage, run M, or offer the viewer as a refresh fix.

## D5 / C5 — London organiser enquiry (#56)

> Hello London Fabric & Power BI organisers — I create Semantic Model Viewer. Would a practical session on handing over a semantic model fit a future meeting? Using synthetic Contoso content, I would show how to prepare a focused starting view, save an interactive HTML snapshot and open that exact file as the recipient. The key lesson is what travels with it: a frozen copy of full model metadata, DAX and available M, even when the starting view shows only a few tables. I can adapt the length to your agenda and disclose my creator role throughout. Please let me know whether a creator-led educational demo fits your speaker guidelines.

Requires organiser policy confirmation, owner availability and real export/open rehearsal. No private company examples.

## D6 / C6 — Denmark future-cycle enquiry (#57, #56)

> I saw that your 2026 speaker call has closed. For a future programme, would a 50-minute practical session on reading and handing over an inherited semantic model be useful? I create Semantic Model Viewer. The proposed session follows one measure's inputs, compares its DAX with one dependency, then demonstrates a frozen model snapshot for a colleague. It would use synthetic data, include limitations of static inspection, and leave time for Q&A. I would be happy to follow your next call rather than seek a slot in the closed programme.

Hold unless owner authorizes an enquiry; no assumption of a current slot.

## D7 / C7 — PBIG monthly evening enquiry (#58, #119)

> Hello PBIG speaker team — I create Semantic Model Viewer and am interested in an educational contribution to a monthly evening session. My proposed topic is “From an unreadable model diagram to one explainable relationship”: start with one fact table, inspect its dimensions, then place that example in the wider relationship matrix. I would use synthetic Contoso content and make the creator relationship explicit. Could you advise whether this fits the evening programme and what language, length and creator-demo guidelines apply?

Use published speaker contact only with owner approval. This is not a late conference-call submission. Matrix behavior must be rehearsed before promising it.

## D8 / C8 — Next Step future-call abstract (#57)

> **What feeds this measure? A reproducible model-reading workflow.** Start from a measure in a synthetic semantic model, trace its upstream references and compare one dependency's DAX. Explain where static inspection stops: it does not evaluate DAX, measure performance or guarantee complete report-impact coverage. I am the creator of Semantic Model Viewer and would disclose that role while demonstrating the workflow and discussing alternatives. Participants leave with a checklist for separating formula structure from runtime behavior.

Hold for a verified future call and adjust duration/depth to its requirements. No current submission authorized.
