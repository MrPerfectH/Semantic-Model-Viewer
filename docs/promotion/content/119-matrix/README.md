# #119 — Which dimensions connect these facts?

Three-image story. Result: Product is shared by Sales, Purchases and Returns. Status: captured and annotated; editorial review pending. Domains remains a reserve story.

## Exact actions and captions

1. Open Matrix. Caption: “Compare fact tables across the full model.” The release shows 15 fact tables × 17 related tables and 63 relationships, with five non-fact relationships omitted.
2. Read the Product row under Sales, Purchases and Returns; hover the Sales cell if desired. Caption: “Product is an active related dimension for all three.” The screenshot detail enlarges those actual cells, with column headings retained.
3. Click Product’s row label (“Open related table Product in the diagram”). In Tables, choose “Tables filtered by this table”, Direct only; keep Hide unrelated; Arrange and Fit. Caption: “Open Product to explore its seven related fact tables.” This is an explicit direction change from the Sales rehearsal; otherwise incoming paths would show only Product Category.

## Assets and accessibility

Publish `assets/cards/01-matrix.png`, `02-shared-product.png`, `03-product-view.png`. Raw PNGs are preserved in `assets/`.

The numbered captions above also serve as image alt descriptions / silent-video script. Captures use synthetic Contoso data. Annotated cards preserve the original screenshot and add a labelled crop; they do not redraw the UI. Owner editorial approval, phone-size review and platform upload preview are still required.

## LinkedIn draft

Which dimensions connect your fact tables?

The Matrix view makes one example easy to spot: Product connects to Sales, Purchases and Returns in synthetic Contoso. Select Product to open its table view and inspect the related facts.

Matrix is independent of the current diagram layout. It summarises fact-to-table relationships; this example explicitly omits five relationships between non-fact tables.

Explore Matrix in the demo: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## X draft

Product connects Sales, Purchases and Returns in this synthetic model. Spot the shared dimension in Matrix, then open Product’s table view. Matrix is independent of the canvas layout.

Explore Matrix: https://MrPerfectH.github.io/Semantic-Model-Viewer/

## Claim boundaries

No claim that Matrix displays every relationship: non-fact connections are omitted and the UI says so. No inferred DAX evaluation or bidirectional filtering from a shared dimension. Do not add Domains to this story.

## Release / host QA

Passed on published v0.3.9 web ZIP, T3 Chromium, 2026-10-18. Accessible cell descriptions identify active Product relationships with all three facts. Product has seven fact-table connections and one Product Category relationship; the outgoing view shows the seven facts.

See [shared QA and link checks](../QA.md). Nothing has been posted and this issue remains open for acceptance/editorial review.
