# Independent Power Query acceptance (#38)

## Verdict

**Repaired candidate `234dfae6b5588364ef49d559b72a3235204655d0` passes the
independent checks recorded here, with the evidence boundaries below.** User review
and explicit approval before merge remain outstanding. No merge or release was
performed. Original `7cc9175d229182eb0e11dd86ddd6aa3695c634ce` failed service TMDL
CRLF fidelity; that failure is retained. The integration owner's minimal correction
was independently verified; no feature source was edited by #38.

## Revision and environment

Worktree: `/Users/przemek.harazny/.t3/worktrees/Semantic-Model-Viewer/feat-pq-verification`.
Branch: `feat/pq-verification`. Checks started from clean tracked source; pre-existing
untracked acceptance plan was preserved. Candidate was cherry-picked in supplied order:

| Supplied commit | Local patch-equivalent commit |
| --- | --- |
| b81669452cadc175d7d94e9b3094e197f2ee5b7d | 89e0e2d |
| b4a37a0238017c67500847da0b18699cea08cec4 | d68abb5 |
| 9cef3cb952eff5fe77cd6a3a4ad33c96a2dcc758 | 822dd49 |
| 77510b9a63064abf3426a7eddc04e754862ff5e7 | 18ef2bd |
| 5376569df1c05c57eb5961e60936866462194e10 | fa7ea25 |
| 6158abb1e22a450840934f41bf784e996ff5a3fb | cdc91be |
| 9ed883c77ca125ac4655f33be5b013850eb3c318 | b1f2135 |
| 7cc9175d229182eb0e11dd86ddd6aa3695c634ce | 0af24fa12f263b172bf049850bc2b4cb75387836 |

Both final tracked trees: `b1c6085cc1e03831247404534290365f045f7927`;
`git diff 7cc9175 HEAD --stat` was empty before acceptance changes.
Repair mapping: `234dfae6b5588364ef49d559b72a3235204655d0` → local
`a8191f98c625c1c02c04229e2b812fba9333ffdf`; both tracked trees
`618695dd0258e396fdf359700b6717686db2bf83`. The patch touched only `serve.py`,
its service regression and a base64 synthetic fixture. Final checks used this tree
plus separately recorded owned acceptance additions.
Machine: Apple M5 Pro arm64, macOS 27.0.1 (26A434), Node v24.15.0.
Registered T3 preview: HeadlessChrome 154.0.8037.92, CSS viewports 1280×800 and 760×800.
Native package: regular VS Code 1.140.0, revision
`07f806f999227108933c2e30515b26eecc1fda74`, arm64, Restricted Mode.
Insiders 1.139.0-insider CLI installed the package in a separate profile, but native
automation selected the user's existing Insiders window; that was not used for
acceptance. Regular VS Code provided the isolated rendered host instead.

## Evidence by gate

| Matrix rows | Observed result | Evidence / boundary |
| --- | --- | --- |
| A01 | Pass for original and repaired candidates | Identical tracked trees above; owned acceptance additions recorded separately |
| A02 | Repaired candidate + owned tests pass | `npm test` in `vscode-extension`: 265 pass, 0 fail/skip, exit 0; [final log](evidence/final-repaired-full-corrected.log). Original candidate: 259 pass; isolated owned tests before repair: 264 pass |
| A03 | Package/sync pass | 24 assets; 36-file 192.27 KB VSIX; all three PQ modules byte-match canonical source; no BIM/TMDL/fixtures bundled; [package log](evidence/package.log) |
| A04 | Repaired service/metadata/render/copy argument pass | Raw HTTP preserves all 19 CRLF; parsed/rendered/forwarded clipboard argument all match exact 86-byte oracle hash; [final fidelity](pq38-repaired-fidelity.json), [transport log](evidence/transport-repaired.log). Original [failure](evidence/transport-failed.log) preserved |
| A05 | Pass for observed states | Registered controls show explicit calculated/non-M, missing source and no-partition states; empty selector disabled |
| A06 | Representative library pass | 12 shared expressions; parameter marker and inferred function provenance; library search selects one function, code search highlights two occurrences; copy UI reports success |
| A07–08 | Representative analysis pass | Independent scope/string/comment/quoted-name oracles and dynamic/unresolved cases; two-node cycle detected; static uncertainty displayed; [owned tests](../../tests/pq38-acceptance.test.cjs) |
| A09/A17 | Registered navigation pass | Expanded Base Query, ArrowUp/Enter opened exact `let Source = CycleA in Source`; root remained Main, three nodes retained; Other partition had two nodes and Main restored three; large graph scroll remained exactly 160 after code navigation |
| A10/A19 | Measured; limits disclosed | 300/301/350/1000 expression traces; 40 references/page; 1000-input expansion reached 51 nodes/160 edges and displayed limit; full inspector exposed cycle-work-limit uncertainty; no general performance guarantee |
| A11 | Observed reset/views pass | Replacement model library only `Replacement`, exact code `Replacement`, two-node graph; Measures displayed Acceptance Total, Matrix displayed no-connected-fact state, Tables Show all restored two fixture tables |
| A12 | Representative inventory pass | BIM/TMDL: four partitions + twelve expressions = 16 distinct IDs; code/state compared to independent oracle |
| A13 | Actual exports/offline pass | Original preview/native exports pass [offline checks](evidence/offline.log); fresh repaired TMDL export also passes [offline check](evidence/repaired-offline.log), raw-code sentinel exclusion and metadata omission |
| A14 | Fixture integrity verified with limits | All 12 fixture/config/oracle files byte-match fresh deterministic generation after interactions; [hash manifest](pq38-fixture-sha256.json). No M evaluator/connector/data query invoked or source write control used. See discovery exception below |
| A15 | Packaged native workflow observed | Installed exact VSIX, discovered synthetic BIM/TMDL, opened both, selected table/partition, expanded/navigated cycle code, Copy M→paste into Search M code yielded exact single-line `CycleB`, Escape returned focus, Refresh Model completed, native snapshot saved |
| A18 | Registered responsive checks pass | 760×800 dialog/lineage had no horizontal overflow, h4 labels 16px; Escape removed overlay and returned focus to Power Query; [1280 screenshot](evidence/registered-1280.png), [760 screenshot](evidence/registered-760.png) |
| A16 | Pending user review/approval | Supported-input limitations below; coordinator owns integrated PR and user approval; no merge/release performed |

## Package and exported artifact identity

Original VSIX SHA-256:
`b804215a346c57fa2c9aac9b26d1008f4a7569168b923da8aebcc48557921657`.
Local artifact: `vscode-extension/semantic-model-viewer-0.3.3.vsix` (ignored).
Installed via isolated `/tmp/pq38-code-user` and `/tmp/pq38-code-extensions`.
Candidate installation log: [regular Code](evidence/code-install.log),
[Insiders CLI only](evidence/vscode-install.log).
Repair changes no runtime JS/CSS/index, extension source or package payload inputs.
Python service is excluded from VSIX. Post-repair generated-asset check still verifies
24 assets; existing VSIX PQ module contents match repaired canonical source exactly.
Native package observations therefore cover the same runtime payload. No new package
build/install was required for the Python-only transport repair.

Actual preview download: 580949 bytes, SHA-256
`c2386eb0af0887950dde64f9bc27429fe25c8d30262a7184ccc13934d09378d7`.
Native TMDL export `/tmp/pq38-native-snapshot.html`: 580560 bytes, SHA-256
`9ec3f9d245329518e26e35a5b2d6b190763d809fe3de72a7e2a46577484fe8a8`.
Inspection receipts: [preview](pq38-snapshot-inspection.json),
[native](pq38-native-snapshot.json). Raw exported HTML is not committed; logs and
digests identify the exact tested files. Offline re-exports were 581143/580677 bytes.
Fresh repaired TMDL export identity/privacy: [receipt](pq38-repaired-snapshot.json).

T3 preview rejected `file:` with `unsupported-protocol`; therefore the owned
offline Chrome check used exact downloaded/native files in disposable profiles,
with networking disabled and fetch/XHR/localStorage access trapped. It navigated
Power Query, Measures, Domains, Matrix, Tables and re-exported through Save snapshot.
PQ explicitly explained that M is excluded. This fallback establishes offline-file
behavior, separately from registered T3 import/navigation acceptance.

## Performance method and limits

[Raw samples/environment](pq38-performance.json),
[reproducible control timing expression](../../tests/pq38-performance-expression.js).
Actual synthetic BIM imports/update controls were used; metadata was not injected.
Timing starts immediately before activating the actual inspector/navigation control,
ends after two animation frames, and includes synchronous full-inspector analysis.
Six stateful rounds per input: one initial open, five warm reopens, code navigation,
available expansion and reference-page actions. State evolves; per-sample node counts
are retained. File selection/import time and MCP transport overhead are excluded.
Two frames approximate paint readiness; this is not instrumented input latency tracing.

At 1000 expressions / 1004 total metadata nodes: cold open 68.3 ms; warm opens
71.8–79.6 ms; code navigation 62.2–73.2 ms; expansion 27.6–33.5 ms.
Warm-open median 73.0 ms/max 79.6; navigation median 65.65 ms/max 73.2;
expansion median 30.6 ms/max 33.5. All input-size summaries and expected edge counts
are in the JSON. The service repair changes none of the measured inspector runtime.
These synthetic results do not establish performance for arbitrary code/graph shapes.
The inspector's dependency hook calls lexical `graph(metadata)` on each code render;
the lineage view's progressive mode/caps do not bound that work. The first timing
trace tried wrapping exported `graph`; it cannot intercept the lexical hook call.
Its recorded graphCalls values are invalid and explicitly excluded from conclusions.
The inspector surfaced the cycle-analysis work limit on the 1000-expression DAG.
Visible expansion hit the 160-edge cap after 46 actions (51 nodes); no inference that
the 80-node cap alone ensures overall responsiveness is made.

## Supported inputs and limitations observed

- Synthetic TMDL quoted declarations, multiple partitions, fenced CRLF, trailing
  whitespace/blanks; BIM string and LF-joined expression-array metadata. Original
  local service broke CRLF fidelity at the original revision; repaired service,
  direct parser and BIM string retain it.
- Shared queries, syntactically marked parameters, inferred functions and scalar
  expressions are accessible. Classification is metadata/syntax provenance, not M execution.
- Static analysis is explicitly partial; missing/dynamic/environment references
  and cycles do not establish complete lineage or execution order. Large inputs
  can surface cycle-analysis work limits and visual truncation.
- Calculated/missing/absent partition metadata has explicit states. Snapshots omit
  PQ metadata/raw M entirely; they cannot inspect code or connect to original inputs.
- These fixtures do not establish full TOM/TMDL conformance, PBIX/PBIT/mashup support,
  service metadata acquisition, refresh-policy M, every Unicode/indentation variant,
  arbitrary browser compatibility or all keyboard/screen-reader behavior.

## Preserved failures and boundaries

The owned first TMDL test oracle expected LF for a CRLF partition: corrected to the
independently authored format-specific CRLF expectation; both [initial](evidence/independent.log)
and [corrected](evidence/independent-corrected.log) results preserved.
The first whole-suite run with owned fixtures under `tests/fixtures/pq38` failed the
existing fixed two-model discovery assertion (263 pass/1 fail). Fixture bytes were
moved outside that inventory to `tests/acceptance-fixtures/pq38`; the existing test
was not weakened. A fixture-local `.gitattributes` marks TMDL as `-text` so clones
preserve the raw CRLF oracle bytes. The exact-byte Sales fixture is marked `-diff`
because trailing spaces/blank lines and CRLF are intentional test data; its raw
SHA-256 and generated text remain reviewable. Historical receipts retain original paths. Original fixture bytes
were also preserved at `/tmp/pq38-initial-fixtures` for the loader owner.

A rejected preview locator initially left the folder picker at home, and Use folder
started a read-only home directory discovery. It was disconnected and isolated tab
storage reset before continuing. No discovered business model was opened, no model
data query ran, and no source file was edited; subsequent acceptance used synthetic
inputs only. This exception prevents claiming the entire session's directory
discovery was restricted to the fixture folder.

Preview clipboard read returned `Read permission denied`; successful write status
does not establish OS clipboard byte equality. Native copy/paste verified exact
single-line CycleB. Repaired Copy M forwarded the exact 86-byte expression to the
original clipboard.writeText method, matching parsed/rendered M hash and reporting
Copied. Instrumentation was restored. Full CRLF OS clipboard readback remains
unverified; the captured write argument is a separate evidence state.
Native UI evidence was directly observed through computer-use AX/screenshots;
persistent native screenshot artifact was not available from that API. The package
workflow is not proof of signing, publication, installation on other machines or
user acceptance. Worker/coordinator logs were supporting leads only.

## Remaining action and owner

#38's independent raw transport→metadata→registered render/copy-argument correction
check is complete at repaired candidate `234dfae6b5588364ef49d559b72a3235204655d0`.
Coordinator: review the evidence/limitations, register the integrated PR and obtain
user approval before merge. Full CRLF OS clipboard readback and cross-machine/user
acceptance are not claimed. No main merge, release, source-model edit or new session
is authorized here.
