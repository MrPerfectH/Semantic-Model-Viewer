# #58 — Understand one part of a large model

Question: “How do I understand just this part of a large model?” Four-image story. Result: Sales and its direct dimensions are readable. Status: captured and annotated; editorial review pending.

## Exact actions and captions

1. **Before — broad model.** Tables → Show all. Caption: “43 tables. Choose one question.” The broad shot establishes scale; do not expect every table label to be read at phone size.
2. **Select Sales.** Search `Sales` in the table library; choose `Sales · Fact · 12 columns`. Caption: “Choose the fact table you want to understand.”
3. **After — focused view.** Click Hide unrelated. Choose “Tables that filter this table”, Direct only. Keep Include inactive relationships visibly enabled; the UI explicitly calls these potential paths. Arrange; hide the table library; Fit. Caption: “Focus on the tables that filter Sales. All 43 model tables remain.”
4. **Inspect evidence.** Click the Sales–Product edge badge. Caption: “Product filters Sales: Sales[Product Key] → Product[ProductKey], many to one.” The popover shows the join columns, cardinality and direction. This relationship is active in the fixture; do not label the separate inactive Date relationship active.

## Assets and accessibility

Publish the four individual PNGs in `assets/cards/`, in numeric order. Originals: `assets/01-broad.png` through `04-relationship.png`. The detail crop on card 4 makes the relationship popover readable.

The numbered captions above also serve as image alt descriptions / silent-video script. Captures use synthetic Contoso data. Annotated cards preserve the original screenshot and add a labelled crop; they do not redraw the UI. Owner editorial approval, phone-size review and platform upload preview are still required.

## LinkedIn draft

A large model is easier to read one question at a time.

Here I select Sales in synthetic Contoso, hide unrelated tables, and inspect its relationship with Product. The join columns and many-to-one cardinality are visible together.

This changes the view, not the model. Filter paths follow metadata; they do not simulate DAX or RLS. Inactive paths remain explicitly identified.

Try the same workflow: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## X draft

43 tables, one question: what connects to Sales? Select Sales, hide unrelated tables, then inspect the Product relationship. Visual focus preserves the model; it does not simulate DAX/RLS.

Try it: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## Claim boundaries

Hiding or removing a table from the layout does not delete it from the model. No diagnosis of incorrect results from the diagram alone. No claim that metadata paths evaluate measures or enforce RLS.

## Release / host QA

Passed on the published v0.3.9 web ZIP served locally, T3 Chromium, 1280 × 800, 2026-10-18. Verified 7 direct related tables; Sales–Product matches fixture metadata. Screenshot 2 precedes the incoming-direction change; screenshot 3 follows it. Capture retains the inactive-path warning.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
