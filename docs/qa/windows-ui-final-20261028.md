# Windows UI acceptance, 28 October 2026

The UI-audit integration merged through #174 was tested on MSI using a separate VS Code 1.105.1 Windows x64 host, an isolated profile and the synthetic Contoso Retail model (43 tables, 68 relationships). Its source tree matches develop merge `13371db`. The earlier test window belonged to another Fabric harness; it was not evidence of this UI build opening successfully.

## Matrix defect and correction

The native Windows run exposed a cyclic intrinsic-width calculation: a `width:100%` table inside a `width:max-content` container produced fact columns wider than 44,000 pixels. Headers and relationship markers were consequently outside the visible viewport. This escaped the original browser assertion, which checked a minimum width without bounding the result.

Give the padded matrix container `width:100%`; retain the table's explicit minimum width to support horizontal scrolling. Regression assertions now bound the container, table and fact-column widths.

The corrected source was synchronized into the isolated Windows extension and the viewer was closed and reopened. Actual Windows measurements:

| Effective viewport width | Available section | Table width | Fact-column width | Result |
| --- | ---: | ---: | ---: | --- |
| 1440 | 1377 | 1328.7 | 72.5 | Fits |
| 1280 | 1217 | 1168.7 | 61.8 | Fits |
| 700 | 637 | 1140 | 59.9 | Scrolls horizontally |

## Acceptance evidence

Twenty-four native-host checks covered model opening, all five view switches, table selection, multiple selection, custom colors, saved views, legend and overview-map preferences, native metadata refresh preserving the selected Power Query flow and viewport, actual host theme contrast, matrix sizing and navigation, a short scrollable viewport, zoom rendering and the measure library.

Inspector source/statistic tiles exceeded 4.5:1 in all four built-in themes: minimum ratios 10.55 (light), 10.15 (dark), 18.49 (high contrast dark), and 14.55 (high contrast light). These are tile measurements, not a claim of whole-product accessibility compliance. A native 200% zoom capture confirmed the measure workspace changes to DAX-below-graph layout with vertical scrolling. An initial capture combining emulated viewport metrics with workbench zoom was rejected and replaced by a native capture.

Keyboard Space on Gross Profit opened the comparison DAX while Total Sales remained the analyzed measure. Synthetic expressions and references were displayed correctly. Screen-reader speech and color-vision simulation were not tested.

Relationship inspection showed the exact synthetic endpoints `Sales[Product Key]` and `Product[ProductKey]`, many-to-one cardinality, and `Product filters Sales`.

Screenshots and machine-readable results are retained in the local validation artifact directory, `~/.local/share/smv-validation/2026-10-28/`, including before/after matrix captures. All screenshots use synthetic data.

## Automated validation

- UI-audit, measure-layout and snapshot browser suites: 33 passed.
- Full extension suite: 866 passed, 2 skipped, one wall-clock layout-performance assertion failed at 322 ms under concurrent validation load. No layout source was changed. A focused rerun of the layout suite passed all 36 tests; the timing threshold was not weakened.
- After integrating #176, the full suite completed with 879 passed, 3 skipped, and the same existing timing assertion failed at 431 ms against its 300 ms limit. Focused Power BI/extension integration checks passed 14 tests with one Windows-only test skipped on Linux. These results disclose a load-sensitive timing gate; they are not an all-green local full-suite claim.
- Required pull-request CI must pass before merge.

## Release limitations

The pre-existing focused-star fit at 1280×720 remains below its 50% zoom target. Read-only P&G Fabric acceptance was checked separately in the existing signed-in Windows host: fresh workspace/model discovery and two XMLA opens succeeded in another workspace on 28 October. This is successful live metadata-read evidence; native refresh-state preservation was tested with the synthetic model in the isolated updated UI host. Earlier permission-denied model requests in GroomingDH remain access limitations.

During verification, develop added the Power BI Desktop integration through #176. Its source was merged into this fix branch without conflicts. Native External Tools checks and their version/provenance limits are recorded in `docs/verification/powerbi-external-tool-windows.md`; they are not silently attributed to this UI run. No stable version was published by this validation.
