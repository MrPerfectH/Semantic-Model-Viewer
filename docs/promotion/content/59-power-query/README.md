# #59 — Which query feeds Sales?

Five-image story: inspect Sales → StageSales → StartYear and read the M reference. Status: captured and annotated; editorial review pending.

## Exact actions and captions

1. Select Sales in Tables. Caption: “Sales identifies StageSales as its query input.” Click Open Power Query. On the first cold load in this rehearsal the flow remained empty after analysis completed; select Sales in the Power Query library to continue. Do not promise automatic focus on every cold load.
2. Select `Sales · Model table` in Power Query. Inputs displays six resolved objects. Caption: “Follow resolved inputs from Sales.”
3. Single-click StageSales in the flow. Caption: “StageSales has three resolved inputs: RawSales, Environment and StartYear.” Keep “Links the viewer could not confirm · 2” visible; do not describe the entire analysis as fully resolved.
4. Click the highlighted StartYear reference in StageSales M (or Inspect input StartYear), then Open full query. Caption: “StartYear is a parameter with the value 2019.” The final image is the wide read-only reader, a readability improvement over the narrow inspector.
5. Close expanded reader; select StageSales again; Open full query. Caption: “Line 4 references StartYear in the row-selection expression.” Read `Date.Year([order_date]) >= StartYear` in context. No query or connection was run.

## Assets and accessibility

Publish the five individual PNGs in `assets/cards/` in numeric order. Raw screenshots remain beside the cards. The last card enlarges the exact M reference from the screenshot; the full expression remains in the context image.

The numbered captions above also serve as image alt descriptions / silent-video script. Captures use synthetic Contoso data. Annotated cards preserve the original screenshot and add a labelled crop; they do not redraw the UI. Owner editorial approval, phone-size review and platform upload preview are still required.

## LinkedIn draft

Which query feeds this table?

In synthetic Contoso, Sales references StageSales. Its resolved inputs include RawSales and the StartYear parameter. Open the M reader to see where StartYear appears in the expression.

Semantic Model Viewer inspects definitions without running queries. Analysis is partial: the uncertainty indicators stay visible, and source hints do not prove a live connection or complete lineage.

Inspect your model’s query definitions—start with the demo: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## X draft

Sales → StageSales → StartYear: follow a resolved input, then read its M reference. Static, partial analysis; queries are not run and source hints do not prove a connection.

Inspect query definitions: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## Claim boundaries

Available definitions only. Dynamic/unresolved references remain uncertain. No M execution, source connection validation or complete lineage claim. New snapshots retain available M; old snapshots without M require regeneration from the original model.

## Release / host QA

Passed on published v0.3.9 web ZIP, T3 Chromium, 2026-10-18. Built-in Contoso includes the same M definitions as the released TMDL fixture. The specific StartYear reference resolves, while two other StageSales links remain uncertain. Cold-load selection caveat is recorded above. No live Databricks connection was tested.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
