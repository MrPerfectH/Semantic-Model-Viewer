# Viewer build scripts

Two standalone Python 3 scripts (stdlib only) that regenerate the viewer's data files from
the repo, so nothing is hand-maintained.

| Script | In | Out |
| --- | --- | --- |
| `tmdl_to_model_data.py` | `*.SemanticModel` folder (or its `definition` folder, or a `model.bim`) | `model-data.json` |
| `scan_report_usage.py` | folder containing `*.Report` (PBIR) folders | `report-usage.json` + `report-health.json` |

```bash
python3 tmdl_to_model_data.py "Models/demo/Contoso Retail.SemanticModel" -o ../model-data.json
python3 scan_report_usage.py Reports --model-data ../model-data.json -o ../report-usage.json
```

Add `--indent 1` for a diff-friendly (larger) file; the default is compact, matching the
committed snapshots.

## Status

Both scripts are a direct port of the parsing logic in `js/tmdl-parser.js` (same regexes,
same role/domain heuristics, same output shape). They are checked against the synthetic
demo model in `Models/demo/` and against synthetic TMDL/PBIR fixtures covering: hidden
measures (`h: 1`), multi-line DAX, display folders, Databricks/manual/calculated partition
sources, fact/dim/measures/calcgroup/fieldparam role detection, duplicate and inactive
relationships, page order from `pages.json`, projections vs filters vs conditional
formatting, and broken references.

When pointing them at your own repository, run both scripts once and open the result in
the viewer before you rely on it. Please report any model they get wrong.

## Notes on the interpretation of the spec

* `h: 1` is emitted only when a measure carries `isHidden` in TMDL. The original
  `tmdl-parser.js` did not read that flag; both the Python script and the shipped JS parser
  now do, because the hidden badge depends on it.
* Databricks/SQL sources are emitted as `{"kind","schema","table"}` (what the viewer's
  `srcMeta()` reads and what the committed snapshot contains), not the flattened
  `{"kind","detail"}`.
* Report-level filters apply to every page, so a measure referenced by one is counted once
  per page (`f`). Page-level and visual-level filters and conditional-formatting
  expressions count against the page they are on.
* `queryRef` projections also carry columns, so an unknown name there is only reported as a
  broken reference when its entity is a table that hosts measures. `Measure`-shaped
  references (filters, conditional formatting) are unambiguous — an unknown name there is
  always reported.
* With more than one matching report, each usage entry gains `"r": "<report name>"`, the
  multi-report extension.
