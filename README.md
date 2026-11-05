# ECHOLOG
## The Memory Layer of MoonWitness

**D19 — Object Memory & Evidence Integrity**

> **Preserve the Original. Prove the Integrity. Protect the Witness.**

ECHOLOG is the object-memory and evidence-integrity layer of the **MoonWitness ecosystem**. It preserves original digital objects behind knowledge, research, stories, creative works, and human witness.

It provides content-addressed object identity, write-once storage, controlled retrieval, retention and legal-hold enforcement, private-witness protection, and interoperable service interfaces.

ECHOLOG preserves bytes. It does **not** decide what is true, who is right, what a witness means, or whether a claim is justified. The owning MoonWitness domain remains responsible for meaning, source relationships, rights, consent, and editorial decisions.

## Position in MoonWitness

```text
MOONWITNESS XV
└── ARSY / D00 — single Hub, ecosystem identity and authorization
    └── ECHOLOG / D19 — object memory and evidence integrity
        └── approved consumer domains
            ├── Corpus
            ├── Witness
            ├── Research / MIZAN
            ├── Story / SHADOW
            ├── Dock
            └── other approved applications
```

ECHOLOG is a bounded service, not a second Hub, global identity provider, agent runtime, or universal database platform.

The service can run standalone. The current standalone extraction includes a local SQLite operator identity store. In MoonWitness mode, ARSY/D00 remains the canonical ecosystem identity and authorization authority through the optional federation integration. This local identity store is a documented deviation from the original XV ADR-0007 stateless contract; it does not silently amend that upstream decision.

## Core guarantees

- SHA-256 content-addressed objects.
- Write-once object keys: identical bytes are idempotent; different bytes at an existing key are rejected.
- Filesystem-backed object bytes and sidecar metadata.
- Retention and legal holds enforced fail-closed on deletion.
- Private-witness protection across supported aliases, with unauthorized reads hidden.
- Short-lived download grants.
- Upload limits, MIME allow-list, quota enforcement, rate limiting, request IDs, and optional Prometheus metrics.
- REST API and a deliberately bounded S3-compatible subset.
- Optional ARSY federation.
- OCI Distribution surface exists as an additional capability; see capability matrix for its maturity.

**Digest integrity proves byte consistency against a recorded digest. It does not prove authorship, truth, consent, provenance, or legal admissibility.**

## Current repository capabilities

The repository has expanded beyond the original storage service. The following are present in source code, but not all are production-certified:

| Area | Current state |
|---|---|
| Filesystem CAS + REST | Implemented, bounded |
| S3-compatible subset | Implemented, bounded; not full AWS S3 |
| SQLite standalone operator identity | Implemented, bounded |
| Optional ARSY federation | Implemented, bounded |
| OCI registry | Partial / experimental |
| Audit log and short-link tools | Implemented, bounded |
| Next.js 16 operator console | Partial prototype |
| Shared UI, contracts, TypeScript SDK | Foundation / partial |
| PGlite + pgvector | Experimental auxiliary index |
| Semantic search | Prototype; deterministic hash embeddings, not trained semantic model |
| OpenAI-compatible API | Prototype; chat route is not a provider-backed LLM gateway |
| Realtime SSE | Experimental, in-process and non-durable |
| Branching and shape sync | Experimental, in-memory |
| Honeypot and quarantine | Experimental; requires security review |
| Bit scrubber | Experimental; correctness review required |
| Custom PostgreSQL wire gateway | Blocked pending P0 security/protocol decision |

See [Capability Matrix](docs/CAPABILITY_MATRIX.md) for source-level details and limitations.

## Architecture boundaries

| Concern | Owner |
|---|---|
| MoonWitness Hub, canonical run state, ecosystem identity | ARSY / D00 |
| Original bytes, digest, storage lifecycle, grants | ECHOLOG / D19 |
| Source/witness/research/story semantics | Owning consumer domain |
| Rights, consent, and human decisions | Domain owners and human governance |
| Agent execution | Approved LUMEN / AI runtime boundary |
| Durable workflows and messaging | ARSY / approved workflow domain |

Consumers persist only:

```ts
{
  object_key: string
  digest: string
  size: number
  content_type: string
}
```

Consumers must not persist object bytes, long-lived grant URLs, ECHOLOG service secrets, or searchable copies of ECHOLOG sidecars.

## Technology and requirements

- Node.js `>=24 <25`
- pnpm `10.33.4`
- Fastify 5 API
- TypeScript workspace managed by Turborepo
- Filesystem object store
- SQLite standalone identity store
- Optional PGlite/pgvector experimental index
- Next.js 16 App Router and React 19 operator console

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Run individual workspaces with pnpm filters after checking their package scripts. The API and web console have separate workspace scripts; see their package manifests. Do not assume an old root-level `pnpm user:add` or `pnpm client:dev` command exists unless the current root scripts define it.

## Runtime configuration

Copy `.env.example` to `.env` and configure the required values for the chosen operating mode. Production must use strong grant/service secrets, a dedicated S3 key pair, a persistent storage volume, a protected reverse proxy, and an off-host backup plan.

Key settings include:
- `ECHOLOG_HOST`, `ECHOLOG_PORT`
- `ECHOLOG_STORAGE_ROOT`, `ECHOLOG_STORAGE_QUOTA_BYTES`
- `ECHOLOG_MAX_UPLOAD_BYTES`, `ECHOLOG_ALLOWED_MIME_TYPES`
- `ECHOLOG_GRANT_SECRET`
- `ECHOLOG_SERVICE_KEY`
- `ECHOLOG_ARSY_URL`
- `ECHOLOG_S3_BUCKET`, `ECHOLOG_S3_REGION`, `ECHOLOG_S3_ACCESS_KEY_ID`, `ECHOLOG_S3_SECRET_ACCESS_KEY`
- `ECHOLOG_METRICS_ENABLED`, `ECHOLOG_METRICS_ENDPOINT`, `ECHOLOG_METRICS_TOKEN`

Consult `.env.example` and the current config parser for exact defaults and production requirements.

## Important protocol limits

The S3 endpoint is a bounded subset, not general AWS S3 compatibility. The documented supported operations are HeadBucket, single-request PutObject, GetObject, HeadObject, DeleteObject, and ListObjectsV2. Multipart, batch delete, versions, ACLs, object lock, presigned/query signatures, chunked signatures, and virtual-hosted style are not supported.

The OCI implementation is an additional artifact distribution surface and has its own compatibility and security acceptance gates.

## Product documents

- [Master Narrative](docs/MASTER_NARRATIVE.md)
- [Vision & Mission](docs/VISION_MISSION.md)
- [Architecture & Domain Boundaries](docs/ARCHITECTURE.md)
- [Capability Matrix](docs/CAPABILITY_MATRIX.md)
- [Product Roadmap](docs/ROADMAP.md)
- [Frontend Product Brief](docs/FRONTEND_PRODUCT_BRIEF.md)
- [Execution TODO](TODO.md)

## MoonWitness upstream references

- [MoonWitness XV Master Vision Narrative](https://github.com/bjo163/moonwitnessxv/blob/main/docs/vision/MASTER_VISION_NARRATIVE_XV.md)
- [MoonWitness XV ECHOLOG architecture contract](https://github.com/bjo163/moonwitnessxv/blob/main/docs/architecture/ECHOLOG.md)
- [MoonWitness XV ADR-0007](https://github.com/bjo163/moonwitnessxv/blob/main/docs/decisions/ADR-0007-echolog-storage.md)

These upstream documents remain authoritative for MoonWitness XV. This repository documents the standalone extraction and its current deviations; it does not silently amend upstream architecture.

## Quality and production-readiness

A source module or route is not proof of production readiness. Current open P0 issues include authorization coverage, realtime/analytics/scrubber security, OpenAI endpoint security, and the custom PostgreSQL wire-gateway decision. Clean Docker build/runtime evidence and scrubber correctness also remain tracked.

No production-ready claim should be made until applicable security, persistence, recovery, integration, tests, and exact-commit CI gates pass.

**ECHOLOG — The Memory Layer of MoonWitness.**
