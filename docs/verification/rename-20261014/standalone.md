# Standalone rename verification — 2026-10-14

T3 collaborative browser, real Python server on port 8945, synthetic repository `/tmp/smv-rename-browser-fixture`. No source/helper responses were mocked.

- Connected the synthetic repository using the actual folder chooser and opened its TMDL model.
- Selected original measure `Sales[Total Sales]` and new name `Revenue` through Rename object.
- Actual source preview showed both the TMDL and bound PBIR visual JSON. Apply remained disabled until both comparisons were opened.
- Applied through the real session-protected POST endpoint and private Node helper. Disk inspection confirmed declaration `'Revenue'`, dependent `[Revenue]` DAX, typed report property `Revenue`, and queryRef `Sales.Revenue`. Report display title `Total Sales` remained unchanged.
- Viewer reparsed source and displayed `Revenue` plus `Margin`, whose dependencies now resolve to `Revenue`.
- Reloaded the final runtime with rename state remapping, prepared `Amount → Value`, then closed the preview. Disk inspection confirmed no column or formula changes from that canceled operation.
- Review screenshot: `/home/harry/.t3/userdata/browser-artifacts/browser-screenshot-localhost-mv80dbr4-2134bb0f.png`.

Automated transaction/service tests also verify cancellation, expired tokens, source/membership conflict refusal, rollback after an interrupted multi-file apply, external-write protection, symlink/path rejection, unsupported report bindings, and localhost session protection. These checks do not prove Power BI engine compilation or report-rendering equivalence.
