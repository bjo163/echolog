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
- [x] Disable the experimental PostgreSQL wire gateway until client authentication and TLS are implemented.
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

- Operator console now has a web test suite: 38 tests across failure classification, formatting, table behaviour, navigation, upload validation, and the shared primitives rendered to static markup. `pnpm test` runs api 98 + web 38, 0 failures.
- Three API suites that predated the experimental-surface hardening were corrected, not weakened: `v2-expansions.test.ts` now presents an administrator key to the service-only OpenAI-compatible and analytics routes, and `nextgen-all.test.ts` no longer starts the retired PostgreSQL wire gateway. The anonymous `401`, member `403`, and request-size limits remain asserted in `experimental-routes-auth.test.ts`.
- `pnpm test` replays Turborepo cache results, so it can report green without executing the API suite. Run `pnpm --filter @echolog/api build` then `pnpm --filter @echolog/api test` when the API result matters.
- Operator console build fixed: `components/ui/primitives.tsx` and `components/ui/layout.tsx` contained JSX attribute values that were not quoted (`className=fine`, `aria-hidden=true`), which made the web app fail to parse. Attributes are now valid JSX.
- Operator console verification run locally: `pnpm typecheck` (9/9 tasks), `pnpm --filter @echolog/web build`, `pnpm --filter @echolog/api test`, and `pnpm --filter @echolog/web test` all succeed on this revision.
- Operator console: pathname routes, object detail, readiness state, alias search/sort, responsive shell, theme support, and initial accessibility announcements are implemented.
- The console now follows the operating system colour-scheme preference when no saved theme exists, and records the last successful full refresh so stale values are distinguishable from current ones.
- The console intentionally keeps the previous value of a panel whose endpoint failed and reports the failure in a console-level notice; it does not clear a panel to an empty state, because "the collection is empty" and "the endpoint could not be read" are different claims.
- Disabled the experimental PostgreSQL wire gateway at server construction because its prototype sends AuthenticationOk without validating credentials and binds to all interfaces. A regression test now asserts that enabling the unsafe listener is rejected.
- API security pass: experimental realtime, analytics, and OpenAI-compatible surfaces now enforce authentication and privilege boundaries; request sizes are bounded.
- Browser security headers: HSTS, nosniff, frame denial, referrer policy, permissions policy, and same-origin resource policy are emitted globally.
- Frontend checklist (`docs/FRONTEND_PRODUCT_BRIEF.md`) re-audited against source: 35 items already implemented but unmarked were checked, moving it to 168 checked and 232 open. The remaining open items are browser/CI verification or backend capabilities that do not yet exist; those screens show explicit unavailable/planned states rather than inert controls.
- Still unverified: browser interaction, responsive layouts at real viewport widths, screen-reader behaviour, contrast measurement, Docker build/readiness, and CI. Dependency CVE remediation is incomplete until the pnpm lockfile contains the patched versions and a frozen install passes in CI.
