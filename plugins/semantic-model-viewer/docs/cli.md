# Semantic Model Viewer CLI

Requires Node.js 22+. The Claude plugin includes the runtime and needs no extra npm
packages, MCP server, separate app or VS Code extension.

In Claude, run `/semantic-model-viewer:setup` once for a stable `smv` command on PATH.
From a checkout, run `node bin/smv.cjs install` or invoke `node bin/smv.cjs` directly.
There is no published npm release. The launcher follows installed plugin upgrades.

```sh
smv show 'Sales.SemanticModel' --table 'Cost Center' --related --dependents
smv relations 'Sales.SemanticModel' --table 'Cost Center'
smv dependents 'Sales.SemanticModel' --table 'Cost Center'
smv snapshot 'Sales.SemanticModel' --out model.html
smv session list
smv session stop --all
smv --help
```

`show` returns one reusable side-by-side Tables/Measures workspace and independent
view URLs. Focused queries return small counts and names; use `--details` for DAX
or relationship evidence. Full `inspect` remains available for broad inventories.

Inputs are one TMDL model folder, its definition folder, or a BIM file. Relative paths
resolve from the current project. Commands read local metadata, never execute DAX/M/SQL
or change model files, and do not read the published Power BI service model.

New view JSON uses **version 2**, including relative table sets and layout controls:

```json
{"version":2,"tables":{"relatedTo":"Cost Center"},"arrange":true,"banner":false}
```

Use it with `snapshot --view`, `shot --view`, or named live views. HTML snapshots work
offline without a server; PNG capture requires Chrome/Chromium. Snapshots retain all
parsed model metadata and formulas behind the starting view. See [snapshot contents](snapshots.md).

Read [CLI plugin workflow](cli-plugin-workflow.md) for the complete command and view
contract, managed-session reuse/cleanup, version warnings, stable PATH setup, named
views, and computed versus browser-applied counts. Every subcommand supports `--help`.

[Visual explanations](visual-explanations.md) covers annotated images, walkthroughs,
external results and proposals. The walkthrough envelope and imported dataset formats
remain version 1; their embedded **view specifications use version 2**.
