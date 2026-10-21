---
name: smv-explain
description: Illustrate semantic-model explanations with the Semantic Model Viewer CLI using annotated model views, external results, and proposed changes. Use when a user wants to understand model logic, discuss a suspected issue, or see a modeling idea.
---

# Explore a model in the browser

Use the installed `smv` command, or `node bin/smv.cjs` from a checkout. The default is the actual interactive viewer in the harness's integrated browser. MCP is optional and is not required for this workflow. Do not create answer-specific HTML wrappers, tabs, SVG diagrams or injected presentation scripts.

## Start and retain a session

1. Run `smv inspect <model-path>` to obtain actual qualified names, relationship identifiers and formulas. Use `smv discover <folder>` when the model path is unknown. Never guess identifiers from labels.
2. Write a versioned view JSON selecting the question's objects. Consult `docs/interactive-viewer.md` and the packaged `examples/explanations/sales-yoy-calculation.json` and `sales-yoy-relationships.json`. Include dependencies and source relationship endpoints needed to explain the calculation. Focus alone needs no callouts or highlights; add them only when they supply useful information.
3. Run `smv serve <model-path> --view view.json --background --session state.json --json`. Retain the absolute session-file path and returned URL for follow-up turns.
4. Open that URL with the harness's native browser tool. Retain its tab ID and respect browser ownership. Confirm that the page is interactive and `smv session status state.json --json` reports a fresh acknowledged browser revision before claiming it is ready.

`smv open` also launches the machine's browser when no integrated browser is available. A remote harness browser might not reach the CLI machine's localhost. Report that specific limitation and offer a local browser or portable HTML; never label a screenshot interactive. The session file and URL contain credentials: do not commit them.

## Continue in the same browser

Reuse the live session and tab for the same model. Read `smv session status state.json --json`, then send `smv session update state.json --revision <current-requested-revision> --view next-view.json --json`. Do not rebuild screenshots or start another server for each question. Open another ordinary browser tab only when the user needs simultaneous perspectives.

`awaiting-viewer` is not an applied acknowledgement. While the user explores, the viewer offers Apply or Keep exploring. Respect that choice and check status before describing an update as visible. Do not reload or force navigation to bypass it. Reset returns to the authored view.

Read `smv session selection state.json --json` when the user asks about “this one”; it returns a qualified object and revisions. Use `--client <clientId>` when several tabs are active. A missing or stale selection is not evidence of what the user sees. A changed source revision requires reopening the view. Keep the server running while the user reviews it; stop temporary sessions with `smv session stop state.json` when no longer needed.

## Optional artifacts and evidence

Export only when needed: `smv session export state.json --basis authored|current --revision <n> --out view.html --json`. Current-state export requires a fresh acknowledgement. HTML includes the actual viewer and model metadata and opens offline. PNG capture needs Chrome/Chromium (`SMV_BROWSER` selects an executable); inspect captures before presenting them. `smv shot` and `smv explain build` remain available for requested images and walkthroughs; see `docs/visual-explanations.md`.

The CLI never executes DAX, SQL or M. External tools may supply numeric results; retain their source, query, execution time, filters and model identity when known. Label invented numbers illustrative. Proposals illustrate suggestions without modifying the source or simulating model behavior.

The existing MCP adapter is an optional integration for hosts that require it. Do not configure MCP or create embedded chat cards for the standard CLI/browser flow. Host-specific embedding is not a prerequisite for exploring the model.
