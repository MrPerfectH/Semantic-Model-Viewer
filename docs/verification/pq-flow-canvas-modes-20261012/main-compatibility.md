# Main compatibility integration

Merge `5171a8e31244fa000a0471f3f10781d0cdebe637` has parents feature `edc22c289c85a872ff4495d259de3c9b03ffb28a` and canonical main `66b766e0da9a6b6f06637075f0d6e1c7d4cb3650`.

One conflict, in the changelog, retained both entries. New Tables library/inspector toggles and extension0.3.4 are retained. Runtime changes versus the verified mode candidate are limited to explorer.css, index, app, explorer, sidebar and snapshot; all Power Query modules are byte-identical.

Fresh Linux full regression **663/663** passed with no skips/failures. New VSIX audit:45 files,33 canonical runtime assets,31 cache keys. SHA256 `aaa74f822ed283db778e420f2f01085a964a90528537eb4347c2004f67c1daab`.

Fresh proportional T3 browser replay passes:
- Tables library and inspector hide/show retain selected table, exact viewport and all positions.
- Returning Tables after PQ retains the same state.
- Flow includes nine upstream objects; Canvas two-card manual state survives the mode roundtrip exactly.
- Trusted double-click on a near-right ancestor changes root to its seven-object flow with the reader closed.

See [replay receipt](main-compatibility.json), [package audit](main-package-audit.json) and [live33asset audit](main-live-http-audit.json). Earlier mode evidence remains scoped to its tested candidate; unchanged-PQ byte provenance supports its carry, not a claim of broad fresh replay. No installed/native or user acceptance and no main merge/release.
