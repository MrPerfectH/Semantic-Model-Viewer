# Power Query: separate Flow and Canvas modes

Runtime: `7c973673d1dc1d4e50d5d8967aa863cd6f8bd309`, based on `379b534e78ff944bf07623a6f15cc36407ea643c`.

## Behavior

- Flow is the default. Choose a library query to see that query and **every recursively resolved upstream input**. No direct-only cutoff and no downstream co-consumers. Cycles are retained safely.
- Single click / Space inspects without replacing the root or moving the viewport. Double-click / Enter opens the clicked query's complete flow. The inspector also exposes Analyze this query.
- Flow initially closes the inspector so the complete path has the full stage. Ordinary pointer selection is immediate; opening a previously closed reader waits 500ms so it cannot cover the second click of a double-click. Navigation, another pointer action, keys, dragging, or generation changes invalidate pending opening.
- Flow filters affect the library only. The root caption remains visible; filtering does not silently remove ancestors. Its library marks the root, while the graph and reader mark the inspected query.
- Canvas retains Tables-style membership, dim/hide, related additions/removal, Blank, Show all, Arrange, and manual layout.
- Switching modes restores each mode's saved membership, positions, filters, selection, inspector state, viewport and body scroll. Back restores navigation; Undo applies only to Canvas edits, including dragging. Model generation reset clears saved modes.

## Verification

Linux Node22: **662/662 full tests**, no failures/skips; **135/135 focused**. Full log retained at Linux /tmp/pq-modes-final-full.log. New modes regressions cover ancestor closure versus sibling/consumer traversal, cycles, filters, independent mode state, navigation, stale reader opening and Canvas-only undo.

Fresh T3 browser on the authorized actual local TMDL model:
- Example target with four direct inputs displays **nine objects in the full upstream flow**, including indirect parameters. All nine card titles are individually hit-testable at 1280x800 and 1440x900. Initial/explicit-fit scale ~64%/~79%, with the reader closed.
- Ordinary inspection preserves exact numeric viewport, all stored positions and membership. Near-right double-click reroots correctly; Enter from Canvas opens seven upstream objects in the tested second target.
- Manual Canvas pair survives Flow roundtrip with exact state equality. Back, remove/Undo, and actual drag/Undo restore the expected positions and viewport.
- Disconnected library filtering retains the complete Flow. Expanded native-dialog M reader remains exact to captured metadata source.
- Three observed implementation failures were repaired and replayed; see [browser receipt](browser-summary.json). No historical evidence was changed.

[Package audit](package-runtime-audit.json):45 files,33 runtime assets,31 valid cache hashes; no model/test/fixture/docs payload. Canonical/generated/VSIX equality is independently checked on Linux, and [live HTTP audit](live-http-audit.json) verifies all33 served assets through the Mac preview against Linux canonical and VSIX.
VSIX SHA256: `c224403c60a64c3ee68fd67bf22f08f5a4efc4757dc36095fa78bfd0637a0363`.

No new installed-native, true200%, OS clipboard or user-fit acceptance is claimed. Shared snapshots still exclude raw M; existing imported-model local storage can retain it. No main merge or release.
