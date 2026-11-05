# ECHOLOG
## The Evidence Preservation Layer of MoonWitness

**D19 — Object Memory, Evidence Integrity & Digital Preservation**

> **Preserve the Original. Verify the Bytes. Keep the Record Inspectable.**

ECHOLOG is the bounded object-memory and evidence-preservation service of MoonWitness XV. It preserves the original digital material behind knowledge, research, stories, creative works, and human witness.

ECHOLOG is more than a place to upload files, but deliberately less than a universal platform. It gives each stored object a stable content identity, protects original bytes from silent replacement, records storage-level preservation events, supports independent integrity checks, and provides controlled retrieval and export.

It does not decide what is true, who is right, what a witness means, whether a claim is justified, or whether material is legally admissible. Those judgments belong to source-owning domains, authorized reviewers, and humans.

## The product idea

A file upload is not yet preservation. A checksum is not yet a chain of custody. A backup is not yet a verified restore.

ECHOLOG's long-term direction is to make each preserved object independently inspectable through a compact evidence package:

- **Original:** exact bytes, never silently overwritten.
- **Identity:** SHA-256 content digest and stable object reference.
- **Receipt:** what ECHOLOG accepted, when, under which service identity and policy version.
- **Fixity:** repeatable checks comparing current bytes with the recorded digest.
- **History:** append-oriented storage events and signed checkpoints where implemented.
- **Recovery:** exportable preservation packages and independently tested restore paths.
- **Access:** scoped authorization and short-lived retrieval grants.

The existing consumer reference remains intentionally small:

~~~ts
{ object_key: string, digest: string, size: number, content_type: string }
~~~

A future signed preservation receipt is a separate, versioned artifact. It must not silently change the existing consumer contract.

## Position in MoonWitness XV

~~~text
MOONWITNESS XV
└── ARSY / D00 — single Hub, canonical identity and authorization
    ├── source, witness, research, story and creative domains
    │   └── own meaning, provenance relationships, rights and consent
    └── ECHOLOG / D19 — object memory and evidence integrity
        ├── original bytes + content identity
        ├── storage lifecycle + fixity verification
        ├── preservation receipts + export/recovery
        └── REST / bounded S3 / optional OCI surfaces
~~~

ARSY remains the only MoonWitness Hub. D00 remains the canonical identity and authorization authority. ECHOLOG is not a second Hub, global IAM, agent runtime, workflow engine, message broker, or universal database.

The standalone extraction currently includes a local SQLite operator identity store. This is a deployment accommodation and a documented deviation from the original XV ADR-0007 stateless contract. It does not amend that upstream decision. In MoonWitness mode, ARSY/D00 remains canonical.

## What exists today

The repository contains a filesystem content-addressed store, SHA-256 identity, write-once behavior, sidecars, REST API, bounded S3-compatible subset, optional ARSY federation, short-lived grants, retention/legal-hold checks, OCI surface, an operator console prototype, SDK/contracts foundations, and experimental extensions.

**Source presence is not production certification.** The Next.js console is a partial prototype. PGlite/vector search, deterministic hash embeddings, OpenAI-compatible prototypes, in-process SSE, in-memory branching/sync, honeypot/canary, scrubber, and custom PostgreSQL wire gateway are not accepted D19 core guarantees. See the capability matrix.

## Strategic differentiation

ECHOLOG should not compete head-on with RustFS, SeaweedFS, Ceph, Garage, or cloud object stores on raw S3 breadth, distributed throughput, or storage economics. Those systems are storage engines and infrastructure platforms.

Its differentiated role is the **preservation and evidence layer above storage engines**:

1. content identity and immutable originals;
2. verifiable ingest receipts with explicit limits;
3. scheduled fixity checks and transparent verification history;
4. preservation packages that can be exported and validated outside ECHOLOG;
5. migration and restore verification across storage backends;
6. MoonWitness-native boundaries for privacy, source ownership, rights, and human review.

The strategic direction is informed by OCFL, BagIt, PREMIS, transparency-log designs, proof-of-retrievability research, and digital-preservation practice. These are design inputs, not claims of conformance. See Research & Competitive Landscape.

## Core guarantees and honest limits

- SHA-256 identifies exact bytes; it does not prove truth, authorship, consent, or provenance.
- Write-once object keys reject different bytes at an existing key.
- Retention and legal-hold deletion checks fail closed in supported paths.
- Private-witness access must be denied consistently across every protocol alias.
- REST and S3 support are bounded; ECHOLOG is not a full AWS S3 replacement.
- A local filesystem volume is not replication, off-site backup, or disaster recovery.
- A receipt proves what the service recorded at receipt time, not that the uploader's claims were true.
- A signed checkpoint can make later alteration detectable; it does not prevent a dishonest operator from omitting events unless independent witnesses/monitors are used.
- No feature is production-ready until exact implementation, security, recovery, and CI evidence are verified.

## Product documents

- Master Narrative: docs/MASTER_NARRATIVE.md
- Vision & Mission: docs/VISION_MISSION.md
- Product Blueprint: BLUEPRINT.md
- Architecture & Domain Boundaries: docs/ARCHITECTURE.md
- Capability Matrix: docs/CAPABILITY_MATRIX.md
- Research & Competitive Landscape: docs/RESEARCH_LANDSCAPE.md
- Product Roadmap: docs/ROADMAP.md
- Frontend Product Brief: docs/FRONTEND_PRODUCT_BRIEF.md
- Execution TODO: TODO.md

## MoonWitness upstream authority

- MoonWitness XV Master Vision Narrative: https://github.com/bjo163/moonwitnessxv/blob/main/docs/vision/MASTER_VISION_NARRATIVE_XV.md
- MoonWitness XV ECHOLOG architecture contract: https://github.com/bjo163/moonwitnessxv/blob/main/docs/architecture/ECHOLOG.md
- MoonWitness XV ADR-0007: https://github.com/bjo163/moonwitnessxv/blob/main/docs/decisions/ADR-0007-echolog-storage.md

These upstream documents remain authoritative for the integrated MoonWitness architecture. This repository records the standalone extraction and its deviations; it does not silently amend XV ADRs.

**ECHOLOG — Preserve the Original. Verify the Bytes. Keep the Record Inspectable.**
