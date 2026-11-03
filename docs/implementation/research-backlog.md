# Research after the corrective release

Track real-user validation in [issue #116](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/116), and feature decisions in [SMV-16 / #219](https://github.com/MrPerfectH/Semantic-Model-Viewer/issues/219). Agent walkthroughs are simulated perspectives, not interviews or proof of demand.

Preserve local metadata exploration and existing saved views, Reference, comparisons and interactive snapshots. Pilot two sessions, then recruit approximately eight participants across model learners, DAX developers, ETL authors and consultants, including keyboard and magnification users. Use consented/synthetic models and record correctness, assistance, recovery, confidence and descriptive completion times.

Tasks: explain inactive Sales filtering, assess a measure change, trace StageSales and a parameter with uncertainty, import/recover by keyboard, share/reopen and explain snapshot contents, and frame a larger model. Compare focused flows against overview tasks. A serious correctness failure needs fixing even if observed once.

| Candidate | Evidence needed before implementation | Prototype acceptance |
|---|---|---|
| Custom display grouping | Source-derived groups fail a recurring navigation task | Group without modifying semantic definitions; preserve snapshots |
| Model/snapshot comparison | Existing measure comparison and CLI inspection do not answer a concrete review task | Stable object identity, explicit missing evidence, no inferred runtime effects |
| Curated handoff | Saved views/explanations do not preserve review intent | Recipient recovers scope and context; full-model content is disclosed |
| Diagnostic exports | Users repeatedly transcribe findings | Reproducible identities and static-analysis caveats accompany each item |
| RLS/perspectives reference | Read-only inspection is needed beyond existing Reference coverage | Distinguish metadata from actual effective permissions; no simulation claim |
| Sanitized export | Concrete sharing policy and removal rules exist | Explicit removal preview and verified residual content; no automatic safety promise |
| Storage migration | Fault or volume evidence exceeds current recovery behavior | Reversible migration, old records retained until verified |

Schedule new features only after the task gap, prototype and acceptance criteria are reviewed. This is the agreed research-gated part of the plan, not an omitted crash fix.
