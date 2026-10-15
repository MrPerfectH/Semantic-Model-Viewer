# Interactive viewer validation

Feature #93, implementation tickets #94–#107. Branch: `feature/interactive-viewer`, based on `96f13da` from `feature/visual-explanations` (PR #92). The implementation stays on its own branch; owner acceptance is required before merge.

## Implemented paths

- CLI opens native Tables and Measures workspaces with validated qualified focus, visible context and an initial bounded dependency neighborhood.
- Semantic annotations track targets through interaction; hidden targets can be revealed and the authored view reset. Relevant table context remains readable.
- Revisioned session updates validate before publication. User exploration requires Apply/Keep exploring. Selection feedback distinguishes authored focus from the current user selection.
- Authored/current exports stage output, verify fresh acknowledgements where needed and recheck actual source/revision before publication. Existing artifacts survive a failed export. Current-state export covers Tables and Measures.
- Generated `interactive.html` walkthroughs navigate one actual offline viewer. Optional supplied numeric evidence uses the existing provenance-aware renderer.
- MCP tools use the same services, restrict paths to `SMV_ROOT` and own their sessions. The MCP Apps resource contains the actual viewer with the official bundled bridge, not a custom diagram. The bridge exchanges state through host tool calls without direct localhost access.
- Inline actions support host fullscreen, retained-model offline saving, explicit selection-context sharing, host light/dark tokens and disconnected guidance.

## Local evidence

- 30 CLI/contract/session/MCP tests passed.
- 11 real-browser capture tests passed, including repeated exact-image comparison.
- 6 interactive real-browser tests passed: semantic annotation movement, native focus, explored state/reset, bounded context plus explicit expansion, pending updates, offline step navigation, narrow light/dark usability, and official AppBridge integration.
- 701 viewer/extension regression tests passed after review fixes.
- Extension VSIX packaging passed; the bundled agent skill validated.
- Final npm package installed in an isolated directory. Installed stdio MCP tools opened the real demo model and returned the packaged MCP Apps resource.
- Synthetic Contoso walkthrough built using only the CLI and a declarative specification.
- Git whitespace checks passed.

The official AppBridge browser test runs the actual UI in a sandboxed iframe with the actual MCP tools behind a test relay. It verifies actual-model synchronization, dark theme tokens, fullscreen requests and an offline download retaining Contoso model metadata and explanation state. This is protocol/integration evidence, not a claim that every vendor host was exercised.

## Independent review

| Axis | Findings fixed | Follow-up |
| --- | --- | --- |
| Standards/correctness | Source changes during export with watching disabled; outdated security statements about host data transfer and POST sessions | No remaining material objections. Reviewer independently ran 6 relevant contract/session/MCP tests. |
| Specification | Opening dependency cap blocked expansion; missing inline expand/recovery controls; ineffective host-theme handler | No remaining material objections. Reviewer independently ran 5 interactive browser tests before the additional narrow-viewport test. |

Additional regression tests reproduce mid-capture source mutation and preservation of prior output. The source fingerprint and session revision are checked again before a staged artifact is renamed into place.

## Outstanding acceptance and limitations

- Linux/macOS/Windows GitHub Actions validation of the new branch is pending.
- Actual vendor-native MCP Apps host smoke tests remain unverified. The T3 browser-pane path was exercised; T3 custom HTML rendering is not treated as MCP Apps compatibility evidence.
- MCP Apps support is host-dependent. Unsupported/remote hosts use a reachable browser or exported HTML/PNG; local models are never automatically published to force embedding.
- The viewer rejects duplicate measure names rather than guessing. Source revision changes require reopening the session. Current-state export is limited to Tables and Measures; authored export remains available for other supported modes.
- Owner review of the full generated experience remains required. Issues stay open and no automatic merge is enabled.
