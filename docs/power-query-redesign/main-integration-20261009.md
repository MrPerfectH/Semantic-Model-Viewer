# Main integration — 2026-10-09

Feature parent: ab7a758fac9c6203d5695511da39d557782c1605. Incoming main: 3848dc95f3e44988219ac5d291ea5d704a9ce346 (#43). This merges main into the feature branch only; no main merge or release.

Four conflicts resolved: index combines PQ registration with DAX formatter, snapshot runtime includes both asset sets while keeping raw-M exclusion, TMDL parser keeps PQ metadata extraction and accepts main strict options, changelog keeps both entries. Index cache hashes regenerated from actual canonical bytes; 32 generated assets synced. Automatic shared app/sidebar/explorer/canvas changes reviewed: PQ route viewport and Escape guards retained; incoming DAX preparation, table routing and CLI preserved. PQ workspace, worker, graph, canvas and inspector module bytes unchanged from a8fc.

Node 22.23.3 full extension regression: 375/375, zero failures, /tmp/pq-main-merge-node22.log. Independent browser compatibility replay pending before push. Historical failed candidates and native evidence remain intact.

Native investigation remains open on the existing isolated regular Code instance. Preserved logs: /tmp/pq-native-diagnosis-20261009/logs-before. Read-only active-frame console confirms ready=complete, app=true, loaded model, DOM text and nonce-bearing external scripts; panel is nevertheless visibly blank. No viewer/CSP exception established, no restart/trust/security toggle. User A10 remains open.
