# Independent CLI prepared views

Verified on Linux on 2026-10-19, using the Contoso Retail model and the committed `sales-yoy-calculation.json` and `sales-yoy-relationships.json` examples.

## Automated checks

- `npm test`: 32 passed.
- `npm run test:interactive`: 10 passed, including regressions first observed failing for empty annotation controls, absent library Close, controls covering formulas, and collapsed relationship endpoint cards.
- `npm run test:browser`: 11 passed, including repeatable real-viewer captures, walkthroughs, imported results, proposals and Power Query.
- `cd vscode-extension && npm test`: 707 passed, including shared viewer runtime and snapshot compatibility.

## Fresh installation and manual browser exercise

Packed the project with `npm pack`, installed the tarball into a separate empty directory, and used its installed `smv` executable to inspect the bundled model, serve both bundled examples, and export each authored view as HTML. This verifies local package installation, not publication to an npm registry.

Opened the returned URLs in T3's native browser as two independent tabs. The files and sessions were unmodified CLI output: no custom tab wrapper, injected styles, iframe bridge or bespoke renderer. The calculation view rendered all four chain members (Total Sales, Sales LY, Sales YoY and Sales YoY %) and the Sales YoY/Sales LY formulas. Browse opened the library; its Close button restored Sales YoY. The relationship view selected the active Order Date relationship with both Date and Sales expanded. At 1280 and 728 pixels, the pair's horizontal center matched the canvas center and both cards remained visible in Cards mode. The controls occupied their own space below the workspace. Neither plain view offered empty annotation controls.

The browser is the baseline presentation. Inline chat embedding is host-dependent and was not required for this workflow. Cross-platform CI and the owner's visual acceptance remain separate from this local verification. Existing manual acceptance tracking must not be closed on the basis of these checks alone.
