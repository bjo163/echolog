# ECHOLOG — Execution TODO
## D19 · Evidence Preservation Layer

Product scope and technical boundaries are in BLUEPRINT.md; product identity is in docs/MASTER_NARRATIVE.md; upstream authority remains MoonWitness XV ADR-0007.

**Rule:** do not implement future capabilities merely because they appear in the blueprint. Complete security and recovery foundations first. Every task should be independently testable and produce evidence.

## P0 — Secure the existing service
- [ ] Inventory every REST route and its authorization policy.
- [ ] Inventory every S3 operation and its authorization policy.
- [ ] Inventory every OCI route and its authorization policy.
- [ ] Inventory every tools/admin/analytics route and its authorization policy.
- [ ] Add default-deny tests for unknown routes and methods.
- [ ] Add cross-surface private-witness denial tests.
- [ ] Verify private object existence is not exposed through list/count/search/error aliases.
- [x] Secure experimental realtime stream and broadcast endpoints (admin/service only).
- [x] Secure experimental analytics overview and scrub endpoints (admin/service only).
- [x] Require authentication for OpenAI-compatible endpoints and bound request sizes.
- [ ] Decide whether to retire the custom PostgreSQL wire gateway.
- [ ] Audit scrubber traversal and symlink behavior.
- [ ] Make scrubber report-only and non-destructive by default.
- [ ] Verify secrets never appear in browser assets, URLs or logs.

## P0 — Recoverability and reference safety
- [ ] Define backup consistency boundary for bytes, sidecars and indexes.
- [ ] Create an off-host backup destination.
- [ ] Restore a synthetic collection to an isolated host.
- [ ] Re-hash every restored object.
- [ ] Produce a machine-readable restore report.
- [ ] Define measured RPO/RTO from restore drills.
- [ ] Inventory every consumer reference and GC root.
- [ ] Prevent GC from deleting referenced objects.
- [ ] Test delete/retention/legal-hold races.

## P1 — Fixity and receipts
- [ ] Define fixity report schema v1.
- [ ] Add full-read SHA-256 verification for one object.
- [ ] Add explicit verified/mismatch/unavailable/not_checked states.
- [ ] Test byte corruption detection with synthetic fixtures.
- [ ] Add bounded scan pagination and concurrency.
- [ ] Add scan checkpoint/restart behavior.
- [ ] Define preservation receipt schema v1.
- [ ] Canonicalize receipt serialization.
- [ ] Threat-model detached signatures and key rotation.
- [ ] Add offline receipt verifier CLI.

## P1 — Portable preservation
- [ ] Prototype BagIt export for one object.
- [ ] Validate export with an independent BagIt implementation.
- [ ] Include object reference and manifest in package.
- [ ] Include receipt and fixity report when available.
- [ ] Prototype import into a clean ECHOLOG instance.
- [ ] Evaluate OCFL compatibility in a disposable fixture.
- [ ] Map event vocabulary to PREMIS concepts.

## P1 — MoonWitness integration
- [ ] Reconcile standalone identity deviation with XV ADR-0007 owner.
- [ ] Verify ARSY/D00 auth against current XV contract.
- [ ] Add consumer contract tests for the four-field object reference.
- [ ] Integrate one approved consumer end-to-end.
- [ ] Verify rollback when ECHOLOG is unavailable.
- [ ] Publish consumer onboarding runbook.

## P2 — Operator console
- [ ] Map every existing API route to typed client methods.
- [x] Implement real overview health states from `/health/ready` (source implemented; runtime QA pending).
- [x] Implement visible-alias explorer and digest detail routes (source implemented; runtime QA pending).
- [ ] Implement integrity center from actual fixity API.
- [x] Implement retention/legal-hold summaries from existing stats and alias APIs (source implemented; runtime QA pending).
- [ ] Add preservation package screen only when APIs exist.
- [ ] Add storage/recovery view based on verified evidence.
- [ ] Complete dark/light, responsive and accessibility checks.

## P3 — Research only
- [ ] Prototype signed Merkle checkpoints.
- [ ] Prototype independent consistency monitor.
- [ ] Benchmark remote proof-of-retrievability options.
- [ ] Explore storage adapter and migration contract.
- [ ] Explore format-obsolescence metadata.
- [ ] Explore evidence dependency closure.

## Definition of done
Each task has code change, focused positive and negative tests, documentation update, exact commit SHA, CI evidence, and rollback note. Never mark an operational guarantee complete based only on source presence.


## Progress snapshot — 2026-11-06

- API security pass: experimental realtime, analytics, and OpenAI-compatible surfaces now enforce authentication and privilege boundaries; request sizes are bounded.
- Browser security headers: HSTS, nosniff, frame denial, referrer policy, permissions policy, and same-origin resource policy are emitted globally.
- Operator console: pathname routes, object detail, readiness state, alias search/sort, responsive shell, theme support, and initial accessibility announcements are implemented.
- Verification is still pending: GitHub Actions run #84 is queued/pending and has not produced typecheck, test, build, or Docker evidence.
- Dependency CVE remediation is incomplete until the pnpm lockfile contains the patched versions and frozen install passes.
