# Bundled agent delivery acceptance — 2026-10-27

Candidate engine/plugin version: 0.6.0. Source changes are prepared for develop; no marketplace publication or user installation upgrade was performed.

## Observed locally on Omarchy / Linux x64

- A complete Claude package and a separately generated Codex package carried official Node 22.23.4 with the pinned archive checksum and full upstream LICENSE.
- Both native host CLIs installed those packages into fresh, isolated configurations with an empty PATH. Neither a global `smv` nor system Node/npm was available to those child installers or to the packaged CLI. The Codex CLI emitted a helper-alias warning for its temporary test configuration; plugin installation and execution still passed.
- Both packages ran `show <model> --table Sales --related --dependents`, returned two views, reused the session on repetition, exported a 1,064,521-byte HTML snapshot and receipt, and stopped their isolated session.
- While each original plugin directory was renamed aside, the cached server still returned its view over HTTP. Its assets and Node executable remained in a content-addressed private generation. A read-only package installation also passed the complete CLI test.
- VS Code 1.101.0 ran the new native tools in its actual Node 22.15.1 extension host. Both editor panes acknowledged application, occupied different editor groups, preserved exploration on repeat, and acknowledged new revisions after a synthetic model edit. These tests did not require Copilot account access or a language-model request: they exercised native registration, worker analysis, the editor webviews and real renderer acknowledgements directly.
- The synthetic Sales question returned 12 tables / 15 relationships on its table canvas, and 34 statically dependent calculations: 6 direct, 28 indirect. The Measures background canvas contains the whole model; its count scope is explicitly labeled.
- An intermittent editor startup issue was reproduced in the real host: asset evaluation could precede snapshot data discovery, yielding an empty model. Editor views now explicitly initialize the prepared snapshot after document boot, then apply and acknowledge the authored view. CLI/standalone HTML retains its original startup behavior.
- Source-only Git payloads are deliberately distinguished from complete portable releases. The new launcher fails clearly without a private runtime instead of finding an unrelated global CLI. An explicit SMV_NODE override remains available for source development.

## Automated coverage

The regression suites cover parser/relationship parity between filesystem and record input; TMDL precedence over sibling BIM caches; query/view output; no automatic backup selection; workspace trust; cancellation; worker execution; paired view reuse; stale acknowledgement rejection; retry after rendering failure; source refresh; portable HTML save; corrupt runtime rejection; managed engine-identity compatibility; and old-plugin/new-checkout launcher regressions. Existing viewer/extension and real-Chrome explanation suites were also run.

The bundled-delivery CI adds native no-Node startup/session/export tests for Linux glibc x64/arm64, macOS x64/arm64 and Windows x64, then builds size-limited universal ZIPs with file digests, runtime notices and archive checksums. A separate CI job runs actual VS Code host acceptance. CI results, not this local report, establish the cross-platform status of the final PR head.

## Release boundaries

No real Fabric tenant, published model, Chromium provisioning, Python provisioning, native Windows ARM64, Linux musl, browser-only vscode.dev, remote localhost reachability, or public plugin-directory submission was validated by these tests. PNG, report usage and terminal Fabric auth retain explicit optional dependencies.

Complete package binaries are CI/release artifacts, not committed blobs. Node integrity uses pinned HTTPS release checksums; independent PGP verification and SMV binary signing are not claimed. Downloaded macOS Gatekeeper / Windows security acceptance remains a release qualification step.

Claude can consume a checksum-pinned archive catalog when the real immutable archive URL is published. Codex's generated portable package was validated through its local marketplace installer; public directory distribution is a separate release action. The existing public marketplace branch and global launcher were unchanged. Owner worktree changes were preserved.
