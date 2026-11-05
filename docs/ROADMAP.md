# ECHOLOG — Product Roadmap
## D19 · Evidence Preservation Layer of MoonWitness

The roadmap prioritizes trustworthiness before breadth. Issue references are traceability aids; an issue is not automatically approved D19 scope.

## North-star outcome
An approved MoonWitness consumer can deposit an original, retain a four-field reference, inspect what ECHOLOG recorded, verify the bytes later, export a portable preservation package, and restore it to an independent host with all bytes re-verified.

## Stage 0 — Product and scope finalization
- [x] Align ECHOLOG with MoonWitness XV D19 and ARSY/D00 boundaries.
- [x] Publish narrative, vision/mission, architecture and capability matrix.
- [x] Publish research and competitive landscape.
- [x] Publish product blueprint and final frontend brief.
- [ ] Confirm standalone identity deviation with XV owner; do not silently amend ADR-0007.
- [ ] Triage platform-expansion issues against D19 boundary.
- [ ] Add automated checks preventing capability docs from overstating implementation.
**Exit:** product identity, upstream authority and actual capability status are clear.

## Stage 1 — Security and operational baseline (P0)
- [ ] Default-deny authorization across REST, S3, OCI, tools and every alias.
- [ ] Private-witness cross-surface denial tests; no existence leakage.
- [ ] Secure or disable realtime, analytics, scrubber and OpenAI-compatible prototype routes.
- [ ] Resolve custom PostgreSQL wire gateway decision; retire if protocol/security claims cannot be proven.
- [ ] Fix scrubber traversal, sidecar pairing, symlink handling and non-destructive reporting.
- [ ] Confirm secrets stay out of browser assets, URLs and logs.
- [ ] Verify fail-closed behavior during ARSY outage for protected operations.
**Exit:** no unresolved P0 exposure; all surfaces have explicit authorization policy.

## Stage 2 — Recoverability before advanced proofs (P0)
- [ ] Define backup consistency boundary for bytes, sidecars and indexes.
- [ ] Create off-host backup destination with least-privilege credentials.
- [ ] Restore into a separate isolated host/volume.
- [ ] Re-hash every restored object and compare digest/size.
- [ ] Document measured RPO/RTO and recovery runbook.
- [ ] Make GC reference-aware; prove it cannot delete live consumer objects.
- [ ] Run repeatable restore drills and retain exact evidence.
**Exit:** independently verified off-host restore, not merely successful backup execution.

## Stage 3 — Fixity and preservation receipts
- [ ] Implement full-read SHA-256 verification with verified/mismatch/unavailable/not_checked states.
- [ ] Add bounded scheduler, resumable scan state and resource budget.
- [ ] Make scrubber report-only first; quarantine damaged objects non-destructively.
- [ ] Define versioned receipt schema and canonical serialization.
- [ ] Add detached signature and key rotation model after threat-model review.
- [ ] Record minimal preservation events without duplicating ecosystem audit ownership.
- [ ] Add offline receipt verification CLI.
**Exit:** operator can prove what the service recorded and independently check receipt and bytes.

## Stage 4 — Portable preservation packages
- [ ] Prototype BagIt export with SHA-256/SHA-512 manifests.
- [ ] Validate packages using an independent BagIt implementation.
- [ ] Define export of originals, references, receipts, fixity reports and verification dependencies.
- [ ] Evaluate OCFL layout and official validation in a disposable fixture.
- [ ] Map preservation events to PREMIS-inspired vocabulary.
- [ ] Demonstrate import/restore into a fresh ECHOLOG instance.
- [ ] Publish format and compatibility policy.
**Exit:** package remains verifiable outside ECHOLOG and can be re-imported without changing original digest identity.

## Stage 5 — MoonWitness integration
- [ ] Confirm ARSY/D00 federated auth contract.
- [ ] Version REST and SDK consumer contracts.
- [ ] Keep consumer reference exactly { object_key, digest, size, content_type }.
- [ ] Integrate one approved consumer end-to-end.
- [ ] Demonstrate upload, reference persistence, authorized retrieval and rollback.
- [ ] Test private-witness denial when ARSY is unavailable.
- [ ] Publish consumer onboarding and operational runbook.
**Exit:** one real consumer uses ECHOLOG without copying bytes or taking over identity/semantics.

## Stage 6 — Operator console and developer experience
- [ ] Replace tabbed prototype with a focused Next.js operator console.
- [ ] Overview: real health, capacity, verification backlog, backup age and last restore proof.
- [ ] Object Explorer and detail with digest, receipt, retention, hold and access state.
- [ ] Integrity Center with real checks, mismatches, quarantine and scan controls.
- [ ] Preservation Packages: export, validate and restore job history.
- [ ] Storage topology: show only verified independent copies and last fixity.
- [ ] Access & policy: mode-aware standalone/ARSY identity and safe secret management.
- [ ] Activity: storage events only, not a second ecosystem audit console.
- [ ] Responsive dark/light UI, accessibility and honest unavailable states.
**Exit:** every visible action maps to a real API or is explicitly unavailable/planned.

## Stage 7 — Advanced research (optional, gated)
- [ ] Signed Merkle checkpoints and external consistency monitors.
- [ ] Proof-of-retrievability / proof-of-data-possession feasibility study.
- [ ] Multi-backend replication and migration adapters.
- [ ] Format-obsolescence risk metadata and derivative workflows.
- [ ] Evidence dependency-closure packages.
- [ ] Risk-aware verification scheduling.
**Exit:** measured value exceeds complexity, operational cost and privacy risk.

## Separate-scope proposals
Global IAM, SQL Studio, database hosting, Postgres wire gateway, model inference, semantic search, queues, workflows, CDC, cron, generic collaboration drive and agent runtime require separate product ownership and explicit MoonWitness approval.

## Priority rule
Security → verified recovery → fixity → receipts → portable packages → consumer integration → operator UX → advanced proofs. More features do not compensate for an archive that cannot be restored.
