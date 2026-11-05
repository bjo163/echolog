# ECHOLOG — Capability Matrix
## Evidence-based repository snapshot · 6 November 2026

This matrix separates code presence, accepted D19 scope and production readiness. A route or class existing is not proof of security, durability, interoperability or certification.

**Status vocabulary:** Implemented (bounded), Partial, Experimental, Planned, Blocked / review required.

## 1. Current core

| Capability | Evidence | Status | Limitation |
|---|---|---|---|
| Filesystem content-addressed object store | apps/api/src/core/driver/fs.ts | Implemented (bounded) | Single configured storage volume |
| SHA-256 identity and write-once semantics | Core object routes/tests | Implemented (bounded) | Byte integrity only |
| REST object API | modules/objects | Implemented (bounded) | Exact route/policy coverage still needs P0 verification |
| Retention and legal hold | Sidecars and routes | Implemented (bounded) | Audit every deletion/GC path |
| Private-witness marker | Object access policy | Implemented (bounded) | Cross-surface denial remains a release gate |
| Bounded S3-compatible subset | modules/s3 | Implemented (bounded) | Not full S3; no multipart/versioning/ACL/Object Lock |
| Upload limits, MIME allow-list, quota | Config and tests | Implemented (bounded) | Deployment-specific |
| Short-lived download grants | Grant module | Implemented (bounded) | Grant is a temporary capability |
| Optional ARSY federation | Auth/config | Implemented (bounded) | Verify against target XV contract |
| Standalone SQLite operator identity | SQLite modules | Implemented (bounded) | Deviation from XV ADR-0007 stateless mode |
| OCI Distribution surface | modules/oci | Partial / experimental | Independent protocol/security acceptance required |
| Audit event writer | Audit helper | Implemented (bounded) | ECHOLOG events only |
| Next.js 16 operator console | apps/web | Partial prototype | Not complete operator product |
| Shared UI, contracts and TS SDK | packages/ui, contract, sdk | Foundation / partial | Coverage and versioning incomplete |

## 2. Experimental extensions — not accepted D19 guarantees

| Capability | Current behavior | Status |
|---|---|---|
| PGlite + pgvector | Embedded auxiliary index | Experimental |
| Text extraction | Limited MIME extraction | Experimental |
| Embedding generation | Deterministic hash/trigram projection | Prototype; not semantic model |
| Semantic search | Vector similarity over indexed text | Prototype; quality and ACL filtering unproven |
| OpenAI-compatible embeddings/chat | Deterministic vectors/template context assembly | Prototype; not provider-backed inference |
| Realtime SSE | In-process EventEmitter | Experimental; no durable replay |
| Branching | In-memory map/digest arrays | Experimental; no durable snapshots |
| Shape sync | In-memory ring buffer | Experimental; no durable peer/conflict protocol |
| Honeypot/canary | In-memory state | Experimental |
| Bit scrubber | Manual scan/recovery hook | Experimental; correctness review required |
| Analytics overview | Runtime/audit summary | Experimental; authorization review required |
| PostgreSQL wire gateway | Custom wire protocol | Blocked pending P0 decision |

## 3. Strategic capabilities — proposed, not implemented

| Capability | Product value | Acceptance evidence |
|---|---|---|
| Preservation receipt v1 | Portable record of what was accepted | Offline signature verification |
| Full-read fixity scheduler | Detect byte drift over time | Repeatable checks + failure states |
| Signed transparency checkpoints | Detect later log tampering/inconsistency | Inclusion/consistency proofs + independent monitor |
| BagIt export | Portable independently checkable package | External validator |
| OCFL compatibility | Rebuildable/versioned archive layout | Official validator + round trip |
| PREMIS-inspired events | Preservation history vocabulary | Schema mapping + export test |
| Off-host restore | Actual recoverability | Separate-host restore + re-hash all objects |
| Storage migration | Reduce provider lock-in | Identity-preserving migration + rollback |
| Multi-failure-domain copy map | Operational visibility | Verified independent copies and fixity |
| Proof of retrievability | Advanced remote-storage assurance | Feasibility benchmark and threat model |

## 4. Open P0/P1 work inherited from issue tracker

| Issue | Scope | Priority |
|---:|---|---|
| #10–11 | Docker build and runtime scripts | P1 |
| #12 | Default-deny API authorization | P0 |
| #13 | Realtime/analytics/scrubber security | P0 |
| #14 | OpenAI-compatible endpoint security | P0 |
| #15 | PostgreSQL wire gateway decision | P0 |
| #16 | Scrubber correctness | P1 |
| #33 | Durable object reference/lifecycle and GC roots | P0/P1 |
| #45 | Backup/restore/PITR | P0 |
| #48 | Production observability | P1 |

Other platform-expansion issues (#17–#44, #46–#47) must be re-triaged against the D19 boundary; they are not automatically core roadmap commitments.

## 5. Production-readiness rule

No capability may be labeled production-ready until applicable tests cover success, denial, malformed input, limits, concurrency, restart and failure; authorization is default-deny; recovery is demonstrated; docs match routes; exact-SHA CI is green; and MoonWitness boundaries are respected.

## 6. Snapshot limitation

This is a source-level review of the repository's main branch, not a live deployment inspection, full penetration test, or current passing-CI attestation. Verify latest commit and CI before making release claims.
