# ECHOLOG — Architecture & Domain Boundaries
## D19 Object Memory & Evidence Integrity

**Baseline:** 6 November 2026.  
**Parent contract:** MoonWitness XV `docs/architecture/ECHOLOG.md` and ADR-0007.  
**Important:** This document records the current standalone implementation and proposes boundaries for its next evolution. It does not silently amend MoonWitness XV ADRs.

## 1. Logical architecture

```text
MoonWitness XV
└── ARSY / D00 — single Hub, ecosystem identity and authorization
    ├── approved consumer domains
    │   └── own domain records, meaning, rights, consent and provenance relations
    └── ECHOLOG / D19
        ├── Object core
        │   ├── filesystem CAS bytes
        │   ├── JSON sidecars and S3 key index
        │   ├── SHA-256 identity and write-once semantics
        │   ├── retention / legal hold / private-witness markers
        │   └── quota, grants and garbage collection
        ├── Protocol surfaces
        │   ├── REST API
        │   ├── bounded S3-compatible subset
        │   └── OCI Distribution surface (additional capability; readiness gated)
        ├── Operator / integration
        │   ├── local standalone identity store (SQLite)
        │   ├── optional ARSY federation
        │   ├── SDK and shared contracts
        │   └── Next.js operator console
        └── Experimental extensions (not D19 core guarantees)
            ├── PGlite + pgvector indexing
            ├── OpenAI-compatible prototype routes
            ├── in-memory SSE event bus
            ├── in-memory branch manager
            ├── in-memory shape-sync primitives
            ├── in-memory honeypot canary manager
            └── bit-scrubber prototype
```

## 2. Ownership boundaries

| Concern | Owner | ECHOLOG rule |
|---|---|---|
| Ecosystem Hub and canonical run state | ARSY | Never create a second Hub |
| Global identity and authorization | D00 / ARSY | Federation is the MoonWitness mode |
| Standalone operator accounts | ECHOLOG deployment | Local-only accommodation; not global IAM |
| Original bytes and content digest | ECHOLOG D19 | Canonical storage owner |
| Retention, legal hold, storage quota | ECHOLOG D19 | Enforce fail-closed |
| Source/witness/research/story semantics | Consumer domain | Do not mirror as ECHOLOG truth |
| Rights and consent | Owning domain / governance | ECHOLOG must not infer or decide |
| AI model execution | LUMEN / approved AI gateway boundary | ECHOLOG does not become an agent runtime |
| Durable messaging and workflow | ARSY / approved workflow domain | In-process event bus is not a durable queue |
| Human approval | Headquarters / 100CENTER | No autonomous bypass |

## 3. Object contract

A canonical object is identified by SHA-256 of its exact bytes. The object key returned by REST is content-addressed; an S3 namespace key is caller-selected and must be persisted exactly as sent.

Consumer reference:

`{ object_key, digest, size, content_type }`

Consumers own the relationship between the reference and their domain records. They do not store object bytes, durable grant URLs, ECHOLOG credentials, or searchable mirrors of ECHOLOG sidecars.

### Immutable derivatives

Future previews, thumbnails, transcodes, OCR outputs, or normalized representations must be new objects with their own digest. A derivative must carry an explicit source-digest relationship in a suitable provenance contract. Never mutate or replace original bytes to produce a derivative.

## 4. Storage and protocol boundaries

### Filesystem CAS
The current service stores object bytes under a filesystem storage root and uses sidecars and indexes for storage metadata. Uploads are streamed through a temporary path, hashed, limited, and committed as immutable objects.

### REST
The REST API is the primary ECHOLOG object contract for MoonWitness integration. Consumers must honor typed errors and short-lived download grants.

### S3-compatible subset
The S3 surface is deliberately bounded and must not be advertised as full AWS S3. The currently documented subset includes HeadBucket, single-request PutObject, GetObject, HeadObject, DeleteObject, and ListObjectsV2. Unsupported operations must fail explicitly.

### OCI
The repository contains an OCI Distribution implementation with upload sessions, manifests, tags, and blob access. It is an additional artifact distribution capability, not a replacement for the D19 object contract. Its persistence, auth coverage, protocol compatibility, and lifecycle guarantees require dedicated acceptance evidence before production claims.

## 5. Identity and standalone mode

The original XV ADR-0007 requires ECHOLOG to be stateless, own no tables, and use ARSY/D00 identity. The standalone extraction deliberately introduced local SQLite tables for users, sessions, and API keys so the service can bootstrap and operate independently.

This is a documented deviation, not an invisible rewrite of ADR-0007.

Required direction:
- In MoonWitness federation mode, ARSY/D00 is the canonical ecosystem identity and authorization authority.
- ECHOLOG local credentials remain scoped to the standalone deployment and must not be forwarded to ARSY as a user identity.
- Service credentials and S3 secrets stay server-side.
- No ECHOLOG credential may enter a browser bundle, consumer database, logs, or public docs.
- Any proposal to make ECHOLOG a global identity provider requires explicit owner ratification and a new/updated XV architecture decision.

## 6. Experimental extension boundary

The current codebase contains additional modules that go beyond the original D19 storage contract. They are documented here for transparency, not automatically endorsed as core product scope.

| Extension | Current implementation shape | Boundary / maturity |
|---|---|---|
| PGlite + pgvector | Embedded database adapter and vector index | Experimental auxiliary index; not canonical object metadata |
| Semantic search | Text extraction and deterministic hash-based 384-dimensional projection | Prototype retrieval, not production semantic intelligence |
| OpenAI-compatible API | Models/embeddings/chat route shapes | Prototype; chat response is template/context assembly, not a configured LLM provider |
| Realtime SSE | Process-local EventEmitter | Ephemeral notifications; not durable CDC |
| Branching | In-memory branch map and digest arrays | Prototype; not durable branch snapshots |
| Shape sync | In-memory change log with bounded ring buffer | Prototype; not durable peer replication |
| Honeypot | In-memory canary registry and trigger logic | Experimental; quarantine actions require security review |
| Bit scrubber | Filesystem traversal and digest check with local recovery hook | Experimental; traversal and repair correctness need dedicated audit |
| Analytics | Process/storage/audit summaries | Operational prototype; authorization and data minimization must be verified |
| PostgreSQL wire gateway | Custom protocol server | Not production-approved; P0 review/retire decision required |

These modules must not be used to claim a general-purpose Supabase-like backend, durable queue, production AI gateway, durable CDC, self-healing storage, multi-tenant isolation, or database platform.

## 7. Security and privacy invariants

1. Default deny: every route and protocol surface must declare its access policy.
2. Private-witness objects remain indistinguishable from missing objects to unauthorized principals across all aliases.
3. Retention and legal hold block deletion; no force-delete bypass.
4. Credentials are hashed or held in server-side secret stores; never logged or returned after initial creation.
5. Grants are short-lived capabilities and must not be persisted by consumers.
6. Inbound bytes and filenames are untrusted.
7. Object integrity failures must be surfaced; never report a scrub as clean when traversal or verification failed.
8. Automated quarantine must not silently lock out legitimate users without an approved, tested policy and recovery path.
9. No dashboard metric may be fabricated or labeled live when it is unavailable or stale.
10. No UI action may report success before backend confirmation.

## 8. Durability and recovery

The filesystem volume is the current canonical byte store. A same-host copy is not an off-host backup. Production readiness requires:
- Consistent backup of object bytes, sidecars, key indexes, private-witness markers, and required identity/index state.
- Explicit snapshot/consistency boundary.
- Off-host backup destination.
- Restore into a separate target.
- Full digest verification after restore.
- Documented RPO/RTO and failure handling.
- Periodic restore drills.

Replication is a future feature and must not be treated as backup unless independent recovery has been demonstrated.

## 9. Change control

Any change that adds a new system-of-record responsibility, changes the four-field consumer reference, changes identity authority, introduces cross-domain metadata, or promotes an experimental extension to a core guarantee must first update this architecture and receive explicit owner approval. Changes that alter MoonWitness XV boundaries also require the corresponding XV ADR/contract update.
