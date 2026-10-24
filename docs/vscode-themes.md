# VS Code themes

The extension follows VS Code's light, dark, high-contrast dark and high-contrast
light themes. Theme changes update the open panel, including switches between two
themes of the same kind. VS Code's body classes and color variables are observed
by `host-vscode.js`; `ViewerTheme.syncHost()` refreshes diagram colors without
writing `smv-theme` or changing model selection, layouts, or palette preferences.

`panel.js` adds the explicit `data-host="vscode"` scope and loads
`vscode-theme.css` after the canonical styles under the existing CSP. The stylesheet
is copied into extension media by `scripts/sync-viewer.js`. It is deliberately absent
from the canonical HTML and snapshot asset list: browser viewers and snapshots
continue to use their saved Classic/Spellbook appearance. The Appearance picker is
available there; VS Code owns the extension's appearance.

No tests were added or run for this implementation, as requested. Future automated
verification should cover initial theme detection, live class and token changes,
observer cleanup, preservation of `smv-theme`, and host-free snapshot assets.
The existing theme and extension-host suites are relevant starting points.

Manual theme-switch review remains to be performed in the extension development host:

1. Open the synthetic demo model. Switch between two light themes, two dark themes,
   High Contrast and High Contrast Light while keeping the panel open.
2. Review Tables and Domains cards, expanded columns, relationship labels and
   selected lines, the minimap, Matrix, and navigation. Confirm positions and selection
   survive each switch.
3. Review Measures graph, source cards, DAX, reference chips, and Power Query
   library, graph, inspector and full-query dialog. Check menus, rules and Help.
4. Use Tab to check focus borders and selected controls in both high-contrast modes.
5. Export and reopen a snapshot. Confirm Classic/Spellbook still works offline,
   independently of the VS Code theme, and retains the saved portable preference.
