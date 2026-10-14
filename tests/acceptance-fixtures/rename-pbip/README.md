# Reference rename Power BI Desktop acceptance fixture

**Status: schema validated and source-smoke tested; NOT Power BI engine verified.**
A successful JSON-schema check proves structure only. Do not mark #31 engine/report
acceptance complete until this project loads, refreshes and renders on Windows.

Open **`Rename Acceptance.pbip`** in a current Power BI Desktop version supporting
TMDL and enhanced PBIR. The model contains only literal synthetic `DATATABLE`
calculated partitions. It requires no network data source, credentials or Fabric.

The report uses Microsoft enhanced PBIR schemas (visualContainer 2.0.0,
visualConfiguration 2.0.0, semanticQuery 1.3.0, report 3.1.0, page 2.0.0).
The report's `definition.pbir` binds by relative path to the sibling model.
It contains real card and clustered-column-chart role projections, sort metadata,
typed measure/column expressions and `Sum(Sales.Amount)` query references.

## Windows test procedure

1. Copy this entire project folder to a disposable local directory. Keep an untouched
   baseline copy. Open its parent project folder in VS Code so discovery includes
   both `.SemanticModel` and `.Report` siblings. Use the candidate extension VSIX.
2. Open the PBIP in Power BI Desktop, refresh, and record Desktop version, extension
   version, load/refresh errors and a screenshot of the report page. Baseline:
   - Total Sales card: **60.00**.
   - Margin card: **48.00** (costs total 12).
   - Sales by Product chart: **Alpha 40**, **Beta 20**.
   - Amount by Month chart: **January 10**, **February 20**, **March 30**, in that order.
   - Model: Sales.DateKey → Date.DateKey relationship; Date.Calendar hierarchy has
     Month level, and Month sorts by MonthOrder.
3. Close Power BI Desktop before changing source files. Do not let a Desktop save
   overwrite externally edited files. In VS Code open the semantic model in the
   viewer, then use **Rename** or command **Semantic Model Viewer: Rename Object
   and References…**. Rename measure **Sales[Total Sales] → Revenue**. Inspect every
   native diff: model declaration/dependent Margin DAX and both report references
   change; existing report display-name overrides remain unchanged. Apply explicitly.
4. Reopen PBIP, refresh and verify all baseline totals and visuals remain unchanged;
   confirm Revenue exists and Total Sales no longer exists in the model. Close Desktop.
5. Rename column **Sales[Amount] → Net Amount** using the same reviewed flow.
   Reopen/refresh and verify all visuals/totals. The physical calculated-table
   `sourceColumn: [Amount]` and DATATABLE's literal source name intentionally remain
   Amount; the semantic declaration/DAX and chart's typed column/queryRef change.
   This step specifically tests the real engine accepts that source mapping. Close Desktop.
6. Rename table **Sales → Orders**. Reopen/refresh and verify totals/visuals again,
   Orders replaces Sales, relationship `fromColumn` refers to Orders.DateKey,
   dependent DAX uses Orders and PBIR SourceRef/queryRefs use Orders. The model folder
   and source file/partition names need not change. Report display labels stay intact.
7. Optional structural coverage: rename **Date[MonthOrder] → Sort Order** and verify
   Month still sorts January/February/March. Rename **Orders[DateKey] → OrderDateKey**
   and verify relationship and cross-filtering remain valid after reopen/refresh.
8. Record cancellation evidence: create a preview, cancel final apply, and verify
   source bytes are unchanged. Repeat with an unsaved model/report document: saving
   must be blocked until it is saved or reverted. Keep screenshots/error messages.

If any baseline visual fails, first record the fixture-load error as **fixture not
accepted**; do not treat later rename results as evidence of compatibility. Power BI
may normalize source files on save; review those changes separately from rename.
Successful source planning does not establish Power BI engine/report correctness.

## Development checks

From repository root:

```sh
node tests/acceptance-fixtures/rename-pbip/source-smoke.cjs
npm install --prefix /tmp/smv-pbir-validation ajv@8 --no-audit --no-fund
NODE_PATH=/tmp/smv-pbir-validation/node_modules node tests/acceptance-fixtures/rename-pbip/validate-schemas.cjs
```

Source smoke copies the project to a temporary directory, applies the three renames
through the shared service/transaction and removes the copy. It never edits this
baseline fixture. Schema validation downloads primary Microsoft schemas and all
transitive schema references; Ajv is an isolated optional development dependency.
The initial validation passed all **10** JSON/PBIP/PBIR/PBISM documents.

Primary references:

- [Microsoft PBIP project documentation](https://learn.microsoft.com/power-bi/developer/projects/projects-overview)
- [Microsoft PBIR report folder documentation](https://learn.microsoft.com/power-bi/developer/projects/projects-report)
- [Microsoft report JSON schemas](https://github.com/microsoft/json-schemas/tree/main/fabric/item/report)
- [Microsoft semantic query schema](https://github.com/microsoft/json-schemas/blob/main/fabric/item/report/definition/semanticQuery/1.3.0/schema.json)
- [Microsoft semantic-model properties schema](https://github.com/microsoft/json-schemas/blob/main/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json)
