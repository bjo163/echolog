# ECHOLOG — Product & Technical Blueprint
## D19 · Evidence Preservation Layer of MoonWitness XV

**Status:** Product direction and staged technical blueprint.  
**Authority:** MoonWitness XV ADR-0007, docs/architecture/ECHOLOG.md, and owner-approved XV domain boundaries.  
**Rule:** This blueprint proposes evolution; it does not silently amend upstream ADRs or certify current implementation.

## 1. Product definition

ECHOLOG is a **preservation control plane over immutable digital objects**. Its job is to keep original bytes, their content identity, storage protection state, and verifiable preservation history inspectable across time and storage changes.

It is not primarily a generic S3 server. S3 is one interoperability surface. The core product lifecycle is:

**Deposit → Identify → Receipt → Protect → Verify → Package → Recover → Migrate**

A MoonWitness domain can deposit an original, retain a compact reference, later verify that stored bytes still match, and export or restore the object with enough machine-readable evidence to inspect the preservation operation independently.

## 2. Users

- **Domain applications:** Corpus, Witness, Research/MIZAN, Story/SHADOW, Dock and future approved consumers.
- **Storage custodians:** operators responsible for service health, retention, verification and recovery.
- **Reviewers/auditors:** authorized people inspecting receipts and verification results with least privilege.
- **Developers:** teams integrating through typed contracts, REST, SDK and bounded S3/OCI surfaces.

## 3. Architecture in MoonWitness

~~~text
MoonWitness XV
├── ARSY / D00 — single Hub, identity, authorization and canonical run state
├── Domain applications — meaning, source links, rights, consent, editorial state
└── ECHOLOG / D19
    ├── Object core — exact bytes, SHA-256 identity, write-once publication
    ├── Protection — retention, legal hold, privacy, scoped grants
    ├── Preservation — receipts, fixity checks, event history, packages
    ├── Recovery — backup verification, restore, migration
    └── Protocol adapters — REST, bounded S3, optional OCI
~~~

ECHOLOG owns no global identity, consumer-domain semantics, AI runtime, durable queue, or canonical ecosystem workflow. ARSY remains the Hub. The XV ADR-0007 stateless/no-SQL rule remains authoritative for integrated mode. The standalone SQLite identity store is an extraction deviation and must remain isolated unless the upstream owner ratifies a change.

## 4. Core contracts

### Existing object reference — keep stable

~~~ts
export interface EchologObjectRef {
  object_key: string
  digest: string
  size: number
  content_type: string
}
~~~

### Proposed receipt envelope — future, versioned

~~~ts
export interface PreservationReceiptV1 {
  schema: "echolog.receipt.v1"
  object: EchologObjectRef
  received_at: string
  receipt_id: string
  authenticated_principal_ref: string
  policy_version: string
  digest_algorithm: "sha-256"
  ingest_result: "accepted"
  service_key_id: string
  signature?: { algorithm: string; key_id: string; value: string }
}
~~~

### Proposed fixity report — future

~~~ts
export interface FixityReportV1 {
  schema: "echolog.fixity-report.v1"
  object: EchologObjectRef
  checked_at: string
  checker_id: string
  expected_digest: string
  observed_digest?: string
  result: "verified" | "mismatch" | "unavailable" | "not_checked"
  method: "full_read_sha256"
  report_id: string
}
~~~

These are proposals, not current API contracts. Receipts must not contain personal identity, witness narrative, consent decisions, source interpretation, or sensitive domain metadata. Use opaque principal references and keep identity resolution in D00/ARSY.

## 5. Capability layers

### A — Immutable object core
- Stream upload to a temporary object.
- Enforce size, MIME, quota and authorization limits.
- Calculate SHA-256 while receiving bytes.
- Atomically publish object and sidecar.
- Identical re-upload is idempotent; conflicting bytes are rejected.
- Stream authorized retrieval.
- Apply retention/legal hold fail-closed.
- Keep private-witness denial consistent across protocol aliases.
- Never mutate original bytes after publication.

### B — Preservation evidence
- Versioned ingest receipts.
- Append-oriented event history for deposit, access-policy change, retention/hold change, fixity check, export, restore and migration.
- Signed receipt/checkpoint support with key IDs and rotation history.
- Optional Merkle transparency checkpoints.
- External witness/monitor integration to detect checkpoint inconsistency or omitted entries.
- Clear distinction between service assertion, cryptographic proof, and independent verification.

Do not start with blockchain. A signed append-only log with public verification and independent monitoring is a more bounded first experiment. Blockchain does not solve trusted time, completeness, availability, privacy, or operator governance automatically.

### C — Long-term preservation and portability
- BagIt-compatible export packages with SHA-256/SHA-512 manifests.
- OCFL evaluation for structured object/version layout; do not claim conformance until validators pass.
- PREMIS-inspired preservation events and agents, without taking ownership of consumer-domain rights semantics.
- Export includes original bytes, object reference, manifest, receipt if available, fixity reports, and minimal storage metadata.
- Package validation works offline and outside ECHOLOG.
- Restore to a new storage root and verify every object before promotion.
- Backend migration preserves object identity and records migration events.

### D — Operational trust
- Scheduled fixity scans with bounded concurrency and resource budgets.
- Scrubber reports corruption before attempting repair.
- Quarantine is non-destructive; never overwrite a damaged object automatically.
- Repair only from an independently verified replica or backup and preserve the damaged original for investigation.
- RPO/RTO are declared from measured restore drills.
- Storage health reports real capacity, read/write failures, last verification, backup age and restore evidence.

### E — Interoperability
- REST remains the canonical application API.
- Bounded S3 remains a compatibility adapter, not the product definition.
- OCI remains optional and independently gated.
- TypeScript SDK and CLI provide stable developer workflows.
- Storage drivers may target filesystem, S3-compatible backends or archival destinations only after a portability interface and conformance suite are designed.

## 6. Strategic features, ranked

| Priority | Feature | Why it matters | Gate |
|---|---|---|---|
| P0 | Default-deny authorization | Prevents data exposure | Security tests |
| P0 | Private-witness alias consistency | Prevents side-channel disclosure | Cross-protocol negative tests |
| P0 | Off-host backup + restore drill | Makes persistence recoverable | Exact restore evidence |
| P0 | GC/reference lifecycle safety | Prevents deletion of live objects | Consumer contract |
| P1 | Reliable fixity verification | Detects silent corruption | Full-read digest tests |
| P1 | Preservation receipt v1 | Explains what was accepted | Schema, signing and threat model |
| P1 | Portable BagIt export | Escapes service lock-in | Independent validator |
| P1 | Operator console | Makes operations inspectable | Real API data only |
| P2 | OCFL compatibility | Long-term portability | Official validator + ADR |
| P2 | Merkle checkpoint + independent monitor | Detects later tampering/inconsistency | Cryptographic review |
| P2 | Multi-backend migration | Reduces provider lock-in | Re-hash + rollback proof |
| P3 | Remote proof-of-possession | Stronger remote-copy assurance | Benchmark + independent research |
| P3 | Preservation dependency closure | Keeps manifests/keys/context reachable | Consumer-led use case |

## 7. Out-of-the-box directions

1. **Evidence Receipt Passport:** portable JSON receipt that travels with an object reference and can be verified without logging into the console.
2. **Independent Witness Checkpoints:** publish signed Merkle roots to a second administrative domain with consistency monitoring. No blockchain dependency required.
3. **Preservation Flight Recorder:** append-oriented record of storage events, verification outcomes, migrations and restore drills. Not a global audit log.
4. **Archive Escape Hatch:** one-click export of a BagIt-style package that remains useful if ECHOLOG is shut down.
5. **Recovery Rehearsal Mode:** restore a sample or full archive to an isolated target, re-hash it, and produce a signed report.
6. **Copy Diversity Map:** show independent failure domains, ownership, last fixity and last restore proof. Never expose private object existence to unauthorized viewers.
7. **Format Obsolescence Watch:** record file-format identification and risk without silently converting originals. A conversion creates a derivative with its own digest and event history.
8. **Verification Budget Scheduler:** schedule checks based on age, media class, last successful check, storage errors and I/O budget. A risk score is not a guarantee.
9. **Evidence Dependency Closure:** package manifests, signatures, public keys, schema versions and verification instructions alongside the original.
10. **Cold-Archive Portability Drill:** periodically export a sample and validate it with tools independent of ECHOLOG.

These are research directions, not current features.

## 8. Explicitly rejected product drift

Do not promote global IAM, SQL Studio, generic database hosting, Postgres wire server, agent runtime, model gateway, generic chat/embeddings, durable queues, cron, workflow engine, CDC, generic collaboration drive, truth scoring, witness credibility scoring, legal-admissibility verdicts, or blockchain/token economy into D19 core without a separate owner decision.

Existing experimental modules should be secured, isolated, disabled, or retired unless a concrete D19 use case justifies them.

## 9. Security and privacy invariants

- Default deny for every route and protocol adapter.
- Validate D00/ARSY identity and authorization in MoonWitness mode.
- Fail closed when canonical authorization is unavailable for protected operations.
- Standalone credentials are local and never masquerade as D00 principals.
- No secrets in browser bundles, URLs, logs, receipts, or export packages.
- Private-witness existence is hidden across REST, S3, OCI, tools, aliases and search.
- Retention/legal-hold checks run at every deletion/GC path.
- Scrubber and repair are non-destructive by default.
- Signed receipts/checkpoints include key IDs, algorithm agility and compromise procedures.
- Minimize personal data in receipts and event records.

## 10. Change control and definition of success

Any change to statelessness, SQL ownership, the four-field reference, identity, storage ownership, or D19 responsibility requires explicit review and an ADR amendment in MoonWitness XV. This standalone blueprint cannot ratify it.

ECHOLOG succeeds when an approved consumer can deposit an original, retrieve it only through authorized access, inspect what the service recorded at ingest, verify byte integrity later, export a portable package, restore to a separate host with every byte checked, and migrate storage without changing content identity — without ECHOLOG claiming authority over meaning or truth.

**The wow factor is not more tabs. It is an archive that can explain and verify its own preservation work — and can leave its current host without losing its identity.**
