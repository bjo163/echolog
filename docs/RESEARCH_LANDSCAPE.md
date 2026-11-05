# ECHOLOG — Research & Competitive Landscape
## Research baseline: 6 November 2026

This is a strategic scan, not a benchmark report or security certification. Repository stars and feature matrices are moving signals, not proof of production quality. Verify release status, license, compatibility and security advisories before selecting dependencies.

## 1. Market map

| Category | Projects / standards | What they do well | ECHOLOG response |
|---|---|---|---|
| S3/object storage engines | RustFS, SeaweedFS, Ceph RGW, Garage, AWS S3, Cloudflare R2 | Storage, S3 APIs, scale, replication, lifecycle | Possible backends or alternatives; do not compete on raw throughput |
| Content-addressed networks | IPFS, Filecoin | Content-derived addressing, distribution, storage proofs | Learn portability and verifiability; protect MoonWitness privacy |
| Digital preservation platforms | Archivematica, Preservica, DSpace/Samvera | Ingest workflows, archival metadata, format preservation | Focus on developer-first preservation service and MoonWitness contracts |
| Preservation specifications | OCFL, BagIt, PREMIS | Portable layouts, packaging, checksums, preservation events | Adopt compatible export/import after conformance work |
| Transparency systems | Sigstore Rekor, Trillian | Append-only logs, signed checkpoints, Merkle proofs | Optional proof layer for receipts and checkpoints |
| Data versioning / lineage | lakeFS, Dolt, immudb | Version history and tamper-evident structures | Borrow precise history semantics; avoid becoming a database platform |
| Research concepts | Proofs of Retrievability, Proofs of Data Possession, fixity surveys | Auditing remote data availability/integrity | Research only after full-read fixity and recovery work |

## 2. Competitor analysis

### Direct infrastructure competitors
- **RustFS:** fast-moving Rust object-storage platform with broad S3 and storage features. Direct alternative when a buyer only needs an S3-compatible server. It is not the same product proposition as MoonWitness preservation receipts, portable evidence history and domain boundaries.
- **SeaweedFS:** distributed storage optimized for very large file counts and multiple interfaces, with lakehouse integrations. Strong infrastructure competitor, different product layer.
- **Ceph RGW:** mature unified storage infrastructure with significant operational complexity; relevant for larger deployments.
- **Garage:** lightweight geo-distributed S3-compatible storage with a narrower protocol surface and different replication model.
- **AWS S3 / Cloudflare R2:** managed infrastructure with operational and ecosystem advantages. They can be storage providers beneath a preservation layer.

### Preservation and evidence references
- **Archivematica:** open-source digital preservation workflow platform. Study ingest, normalization, preservation planning and archival packaging; do not clone its full institutional scope.
- **Preservica:** commercial digital preservation platform and competitor for institutional preservation workflows.
- **IPFS / Filecoin:** relevant to content addressing, distributed availability and verifiable storage. Public distribution is not automatically appropriate for private witness evidence.
- **Sigstore Rekor / Trillian:** reference designs for append-only transparency logs and Merkle proofs. They prove inclusion/consistency under a trust model, not payload truth.
- **lakeFS:** data-lake versioning and branch/commit workflows. Useful comparison, not a reason to add a database branch engine to D19.

### Competitive thesis
**Do not build MinIO/RustFS/SeaweedFS again. Build the preservation layer that can sit above one or more storage engines.**

The defensible product position is the combination of original-byte identity, honest ingest receipts, repeatable fixity history, portable exports, verified recovery, and MoonWitness-specific privacy/domain boundaries. This is a differentiated product thesis, not a claim that competitors lack every individual feature.

## 3. GitHub momentum and implications

A November 2026 scan of public GitHub topic/trending aggregations shows RustFS and SeaweedFS with strong visibility in object storage; Ceph and Garage are also prominent. RustFS describes broad S3-compatible features. SeaweedFS emphasizes scale, small-file efficiency, S3 and lakehouse integrations. This makes "we also support S3" an insufficient differentiator.

Starting points:
- https://github.com/topics/object-storage
- https://github.com/topics/storage
- https://github.com/rustfs/rustfs
- https://github.com/seaweedfs/seaweedfs
- https://github.com/ocfl/spec

## 4. Research that changes the design

### Fixity is a lifecycle, not a one-time upload hash
The 2025 NDSA Fixity Survey reports that 94% of respondents use fixity information and 96% use checksums as at least one fixity method, while practices vary substantially. ECHOLOG should expose when checks happened, what was checked and what happened on failure — not just show a green SHA-256 badge.
Source: https://zenodo.org/records/22099730

### Merkle trees can make integrity checks more efficient
The FAST '25 paper, On Scalable Integrity Checking for Secure Cloud Disks, studies storage-level hash-tree overhead and proposes Dynamic Merkle Trees, reporting up to 2.2x throughput/latency improvement over the compared state of the art in its evaluated settings. Study this for large collections; do not add custom trees before workload measurements justify them.
Source: https://www.usenix.org/conference/fast25/presentation/burke

### Proof of retrievability is an advanced assurance
USENIX Security research on dynamic Proofs of Retrievability explores audits that can provide evidence that remote data remains retrievable without downloading the entire object each time. Filecoin's 2025 Proof of Data Possession launch is another practical reference. Start with full-read SHA-256 verification, independent copies and restore drills before considering cryptographic storage proofs.
Sources:
- https://www.usenix.org/conference/usenixsecurity21/presentation/anthoine
- https://fil.org/blog/introducing-proof-of-data-possession-pdp-verifiable-hot-storage-on-filecoin

### Portability needs formats, not just APIs
OCFL is designed for application-independent, rebuildable digital objects, versioning, robustness and storage diversity. BagIt (RFC 8493) defines portable payload/tag packages with checksum manifests and independent validation. PREMIS describes preservation metadata around objects, events, rights and agents. Prototype standard-aligned export before inventing a proprietary archive format.
Sources:
- https://ocfl.io/
- https://www.rfc-editor.org/rfc/rfc8493
- https://www.loc.gov/standards/premis/v3/

### Transparency logs help detect later tampering — with limits
Sigstore Rekor uses an append-only transparency log and verifiable data structures. Inclusion and consistency proofs allow independent verification of log state. A single operator-controlled log cannot prove completeness against that same operator; transparency does not prove content truth.
Sources:
- https://docs.sigstore.dev/logging/overview/
- https://docs.sigstore.dev/about/security/

### Durable storage needs independent copies and dependency closure
UN Transparency Protocol guidance separates availability, integrity and economic sustainability. Content-addressed identifiers help integrity checks, but availability still depends on reachable copies and related verification material. Include manifests, public keys, schemas and verification instructions in preservation packages.
Source: https://untp.unece.org/docs/design-patterns/DurableStorage/

## 5. What not to build because it is fashionable

- No blockchain or token economy as a substitute for independent copies and recovery.
- No vector database or AI search as a substitute for preservation.
- No AI evidence-authenticity score.
- No proprietary archive format before testing BagIt/OCFL.
- No custom Merkle implementation before threat model, signing, consistency, monitoring and scale are defined.
- No multi-cloud orchestration before one reliable off-host restore exists.
- No generic database, IAM, workflow, queue or agent platform.

## 6. Research backlog

| ID | Question | Small experiment | Exit evidence |
|---|---|---|---|
| R-01 | Can a receipt be verified outside the service? | Canonical JSON + detached signature + public CLI | Offline verifier test |
| R-02 | Can an archive escape ECHOLOG? | BagIt export for synthetic collection | Independent validator |
| R-03 | Can a repository be rebuilt from exported files? | OCFL prototype | Official validator + round trip |
| R-04 | Can checkpoint tampering be detected? | Signed Merkle checkpoint | Inclusion + consistency tests |
| R-05 | Can independent copies be trusted operationally? | Two failure domains + re-hash | Restore drill + failure injection |
| R-06 | Is proof-of-retrievability worth the complexity? | Benchmark existing PoR/PDP implementation | Cost, bandwidth, threat-model report |
| R-07 | What format risks matter to MoonWitness? | Identify formats and record risk | Reproducible format report |

No research prototype becomes production until threat model, operator burden, failure behavior, privacy impact, maintenance cost and measurable benefit are documented.
