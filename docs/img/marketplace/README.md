# Marketplace screenshots

Captured on 2026-10-12 through the T3 collaborative preview at `http://localhost:8931/`,
using only the built-in synthetic **Contoso Retail** model. Viewer source:
`791f8c4` (extension version `0.3.6`). These are browser captures of the shared viewer,
not screenshots of an installed VS Code extension or of the published Marketplace page.
The PNGs are unmodified screenshots; no labels, data, or relationship signs were added.

| Pair | Capture setup |
| --- | --- |
| Measures | 1280 × 1000. Gross Margin %, top-to-bottom dependencies at 100%; split view at 71% with Gross Profit selected for DAX comparison. |
| Tables | 1280 × 800. Sales and seven dimensions at 96%; five-table neighborhood at 101% with the Sales inspector scrolled to relationships. Library hidden in both; inspector hidden in the overview. |
| Power Query | 1280 × 1000. StageSales Inputs flow at 96%; same flow at 67% beside a 540px inspector showing complete wrapped M. Library hidden in the inspector capture. |
| Additional | 1280 × 800. All 11 collapsed domains, zoomed out once to preserve margins; Matrix at its initial scroll position, showing the fact columns and first related-table rows. |

Table relationship glyphs use the current canvas renderer: cardinality pills above 50%
zoom where a clear label position exists, otherwise an open filter-direction arrow.
The dashed Sales–Date connection is the demo's inactive Ship Date relationship.
Power Query chevrons represent resolved M references, not semantic relationships.

The served table canvas, measures renderer, Power Query canvas, and demo JSON were
byte-compared with the checkout during capture. Each image was visually inspected.
Both documentation pages use the same eight images; image links open the full-size PNG.
The extension README pins its image URLs to the screenshot commit so review and later
packages keep the same captures. Earlier images and GIFs remain historical assets.
