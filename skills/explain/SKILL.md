---
name: explain
description: Explains a Power BI model or measure using real metadata and the Semantic Model Viewer's focused views and annotated walkthroughs. Use when asked for a visual model explanation.
argument-hint: "[model path] [question about the model]"
disable-model-invocation: true
---

Answer the user's model question in $ARGUMENTS. Read `${CLAUDE_PLUGIN_ROOT}/skills/smv-explain/SKILL.md` and follow its workflow using this plugin's MCP tools or `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"`.

Resolve model paths from the user's project, not the plugin directory. When needed, discover models with the plugin CLI's `discover .` command; ask the user to choose if multiple models match. Inspect the actual metadata before choosing objects or interpreting formulas. Read advanced contracts from `${CLAUDE_PLUGIN_ROOT}/docs/visual-explanations.md` and `${CLAUDE_PLUGIN_ROOT}/docs/interactive-viewer.md` as needed. Write generated view specifications and artifacts under the user's project, never inside the plugin installation.

Prefer one focused real viewer session for interactive questions. Use an annotated image or a reproducible walkthrough when the user needs an explanation to keep. Describe structural evidence and your interpretation separately. Do not claim that dependency metadata proves numerical correctness, performance, or complete report usage; no DAX, SQL or M is executed. Reuse an existing connected session when appropriate, respect user exploration, and link the returned local URL when inline UI is unsupported.
