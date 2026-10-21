# CLI and integrated browser verification

2026-10-21, Linux / T3 native browser, Contoso Retail demo.

The supported default is CLI + persistent integrated browser. MCP and embedded chat cards are optional; further work on them is deferred.

Verified using `node bin/smv.cjs` and the packaged Sales YoY examples:

- Background `serve` started in approximately 0.32 seconds. Opened its returned HTTP URL directly in the integrated browser at 1280 × 800. This timing measures server startup, not total agent response time.
- Calculation workspace showed the four related measures and real DAX, with no console errors reported by the browser snapshot.
- CLI selection returned qualified Measures[Sales LY], separately from authored focus Measures[Sales YoY].
- Clicking Total Sales changed the comparison formula to `SUM ( Sales[Net Amount] )`.
- Updating the same session to relationships returned `awaiting-viewer` revision 2. The original calculation remained visible with Apply / Keep exploring.
- Before Apply, CLI selection correctly rejected the old revision with `VIEW_NOT_APPLIED`.
- Applying the update displayed expanded Sales and Date cards and the active Order Date relationship inspector in the same browser tab. CLI selection acknowledged revision 2 with the relationship identifier.

No MCP connection, custom wrapper, screenshot presentation, injected CSS or standalone browser automation was required. The live server is kept running for review. These checks verify the workflow, not user acceptance of the visual design.
