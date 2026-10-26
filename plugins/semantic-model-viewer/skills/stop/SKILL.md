---
name: stop
description: Lists and stops Semantic Model Viewer managed sessions, including multi-view workspaces.
argument-hint: "[all | model path | session file]"
disable-model-invocation: true
---

Use `smv` on PATH or `node "${CLAUDE_PLUGIN_ROOT}/bin/smv.cjs"`. Never guess a versioned plugin cache path.

Run `session list` first. It reports only SMV-managed records, including source, runtime version, named views, running/stale state and browser acknowledgements. Keep unrelated work the user is exploring.

For an explicit session file, run `session stop "<state.json>" --json`. For all sessions of a requested model, run `session stop --all --model "<model>"`. If the user explicitly requests all Viewer sessions, run `session stop --all`. This sends token-authenticated stop requests only to identity-checked managed servers; it does not kill arbitrary PIDs. Report stale records or errors accurately.

Legacy 0.2.x session files not in the managed registry can still be stopped explicitly. The project helper at `${CLAUDE_PLUGIN_ROOT}/scripts/claude-workspace.cjs` lists old project artifact records when needed. Do not delete stale files or kill processes blindly. HTML exports remain usable after stopping a session.
