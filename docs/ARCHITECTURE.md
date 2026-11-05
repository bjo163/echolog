# ECHOLOG — Architecture & Domain Boundaries
## D19 · Evidence Preservation Layer

**Baseline:** 6 November 2026.  
**Upstream authority:** MoonWitness XV docs/architecture/ECHOLOG.md and ADR-0007.  
**This records standalone implementation and future direction; it does not amend XV decisions.**

## 1. Logical architecture

~~~text
MoonWitness XV
├── ARSY / D00 — single Hub, canonical identity and authorization
├── approved consumer domains
│   └── own meaning, provenance relationships, rights, consent and editorial state
└── ECHOLOG / D19
    ├── Object core: filesystem CAS, SHA-256, write-once publication, sidecars
    ├── Protection: retention, legal hold, privacy, scoped grants
    ├── Protocol adapters: REST, bounded S3, optional OCI
    ├── Preservation plane (future): receipts, fixity, event history, checkpoints
    ├── Recovery plane (future): portable packages, restore, migration
    ├── Operator surface: Next.js console prototype
    └── Experimental: PGlite/vector, OpenAI prototypes, SSE, branching/sync,
        honeypot/canary, scrubber and custom PostgreSQL wire gateway
~~~

## 2. Ownership boundaries

| Concern | Owner | ECHOLOG rule |
|---|---|---|
| Ecosystem Hub and canonical run state | ARSY | Never create a second Hub |
| Global identity and authorization | D00 / ARSY | Canonical authority in federated mode |
| Standalone operator accounts | Standalone deployment | Local-only extraction accommodation |
| Original bytes and digest | ECHOLOG D19 | Canonical object owner |
| Retention, legal hold, quota and grants | ECHOLOG D19 | Enforce fail-closed |
| Source/witness/research/story semantics | Consumer domain | Do not mirror as ECHOLOG truth |
| Rights and consent | Domain owner / governance | ECHOLOG does not infer or decide |
| AI execution | LUMEN / approved AI Gateway | ECHOLOG is not an agent runtime |
| Durable messaging/workflow | ARSY / approved owner | In-process SSE is not a durable queue |
| Human approval | Headquarters / 100CENTER | No autonomous bypass |

## 3. Object and reference contract

The object key is content-addressed from the exact byte sequence using SHA-256. Existing object keys are write-once: identical bytes are idempotent; conflicting bytes are rejected.

Consumer reference remains:

~~~ts
{ object_key: string; digest: string; size: number; content_type: string }
~~~

Do not add source title, witness identity, rights, consent, editorial status, claims, tags or narrative semantics to the canonical ECHOLOG sidecar. The consumer domain owns those.

## 4. Proposed preservation records

Future contracts requiring schema review, privacy review and upstream approval where they affect XV integration:

- **Receipt:** object reference, receipt ID, receipt time, opaque authenticated principal reference, policy version, digest algorithm, service key ID and optional detached signature.
- **Fixity report:** object reference, check time, checker ID, expected/observed digest and explicit result.
- **Preservation event:** minimal event type, object reference, time, actor reference, policy version and outcome.
- **Checkpoint:** signed commitment to a batch of event records, with inclusion/consistency proofs and independent monitoring.

Receipts must not contain witness narratives, personal identity claims, consent decisions or consumer-domain semantics. Receipt time is a service observation, not proof of capture time or truth.

## 5. Storage and preservation model

### Current
Filesystem-backed content-addressed bytes; JSON sidecars and S3 key index; SHA-256 identity and write-once semantics; REST and bounded S3 surfaces; retention/legal hold and short-lived grants; optional ARSY federation; standalone SQLite identity deviation.

### Proposed
Scheduled full-read fixity checks; non-destructive quarantine; BagIt-style portable export; OCFL compatibility evaluation; PREMIS-inspired event vocabulary; off-host backup and verified restore; storage adapter/migration contract after portability tests.

A filesystem volume alone is not a backup. A backup job alone is not a restore proof.

## 6. Integrity, transparency and trust model

SHA-256 provides byte comparison against a known digest. Signed receipts can make the service's statement tamper-evident after signing. Merkle checkpoints can make inclusion and append-only consistency independently checkable.

Limits:
- a service can omit an event before it enters a log;
- a compromised signing key can create misleading attestations;
- a timestamp is only as trustworthy as its time source and signing process;
- a proof does not make a source true;
- integrity does not guarantee availability.

Any transparency design must include key custody, rotation, compromise response, canonical serialization, checkpoint frequency, independent monitors and privacy-safe commitments. No blockchain is required.

## 7. Security invariants

- Default-deny for every route and protocol surface.
- MoonWitness identity and authorization remain with D00/ARSY.
- Fail closed for protected operations when canonical authorization is unavailable.
- Standalone credentials never masquerade as MoonWitness principals.
- Secrets never enter browser bundles, URLs, logs, receipts or export packages.
- Private-witness existence is hidden across REST, S3, OCI, tools, aliases, previews and search.
- Retention/legal hold is checked on every delete and GC path.
- Scrubber is non-destructive by default; repair requires verified source copy and explicit policy.
- Untrusted outbound fetches use the MoonWitness egress guard.
- Receipts and events minimize personal data and use opaque principal references.

## 8. Experimental modules

PGlite/vector search, text extraction, deterministic embeddings, OpenAI-compatible routes, in-process SSE, in-memory branching/sync, honeypot/canary, bit scrubber and custom PostgreSQL wire gateway are not accepted D19 core guarantees. Each must be secured, isolated, disabled or retired unless a concrete D19 use case and owner-approved boundary justify it.

The PostgreSQL wire gateway remains blocked pending the P0 security/protocol decision. No generic database platform is implied.

## 9. Production acceptance

A capability is production-ready only when tests cover success, denial, malformed input, limits, concurrency, restart and failure paths; authorization is default-deny; recovery semantics are demonstrated; metrics are real and privacy-safe; docs match routes; exact-SHA CI is green; and MoonWitness integration/rollback are demonstrated where applicable.

## 10. Upstream change control

Changes to statelessness, SQL ownership, D00 identity, the four-field consumer reference, storage ownership or D19 domain scope require explicit review and amendment in MoonWitness XV. This standalone repository cannot ratify those changes.
