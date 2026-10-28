---
name: explain
description: Explains a Power BI model or measure through the Semantic Model Viewer CLI using focused browser views and annotated walkthroughs. Use when asked for a visual model explanation.
argument-hint: "[model path] [question about the model]"
disable-model-invocation: true
---

Use `smv` on PATH or `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"` from the host-provided plugin root. No `--where` call is needed for ordinary work; it is diagnostic only. Never construct a versioned cache path. `/semantic-model-viewer:setup` installs the stable terminal command once.

Answer the user's question in $ARGUMENTS. Read `${CLAUDE_PLUGIN_ROOT}/skills/smv-explain/SKILL.md` and follow its CLI workflow. The executable is `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"`; use shell commands and generated files throughout.

Resolve models from the user's project. Use `discover .` when the model is unknown, then focused `relations` and `dependents` for a known table. Reserve `inspect` for broad schema/query inventories. Prefer `show ... --related --dependents` for the common table question. Show the exact local source and confirm backup-looking paths. Do not claim that these files match the published service model.

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs"` for gitignored output paths and existing session records. Reuse a matching live session where appropriate. Never write generated files into the plugin installation. Read `${CLAUDE_PLUGIN_ROOT}/docs/cli-plugin-workflow.md` for live sessions and `${CLAUDE_PLUGIN_ROOT}/docs/visual-explanations.md` for walkthroughs, external results and proposal contracts.

Prefer one focused browser view for exploration, an annotated image for a compact explanation, or a reproducible walkthrough to keep. Separate structural evidence from your interpretation. The CLI does not run DAX, SQL or M and cannot prove numerical correctness or performance. Use file attachments or links as supported by the host; respect its publication rules. Stop temporary sessions explicitly after use.
