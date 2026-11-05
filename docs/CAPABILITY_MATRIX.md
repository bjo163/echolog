# ECHOLOG — Capability Matrix
## Evidence-based repository snapshot · 6 November 2026

This matrix distinguishes source-code presence from production readiness. A route or class existing is not proof of security, durability, interoperability, or production certification.

**Status vocabulary**
- **Implemented (bounded):** code path and supporting tests/docs exist for the stated narrow behavior.
- **Partial:** useful implementation exists, but important acceptance criteria remain.
- **Experimental:** prototype or process-local implementation; not a production guarantee.
- **Planned:** tracked in issues or future roadmap; not implemented.
- **Blocked / review required:** a P0 security or correctness decision must be resolved first.

## 1. Core D19 capabilities

| Capability | Repository evidence | Status | Notes |
|---|---|---|---|
| Filesystem content-addressed object store | `apps/api/src/core/driver/fs.ts` | Implemented (bounded) | SHA-256 objects, filesystem persistence, sidecars |
| Write-once object semantics | Core object routes/tests | Implemented (bounded) | Same bytes idempotent; conflicting bytes refused |
| REST object API | `modules/objects` | Implemented (bounded) | Upload, metadata, grants, delete, GC |
| Retention and legal hold | Object sidecars and routes | Implemented (bounded) | Ingest-time policy, fail-closed delete |
| Private-witness marker | Object access policy and cross-surface checks | Implemented (bounded) | Unauthorized access hidden with 404 |
| Bounded S3-compatible subset | `modules/s3` | Implemented (bounded) | Not full S3; unsupported operations rejected |
| Quota and MIME/upload limits | Config, limits, tests | Implemented (bounded) | Deployment-specific limits |
| Local standalone operator identity | SQLite users/sessions/API keys | Implemented (bounded) | Deviation from XV stateless ADR; local mode only |
| Optional ARSY federation | Authenticator/config | Implemented (bounded) | Must be tested against target ARSY deployment |
| Short-lived download grants | Grant module | Implemented (bounded) | TTL is limited; grant URLs are capabilities |
| Audit event writer | Database audit helper and tests | Implemented (bounded) | ECHOLOG service events, not ecosystem-wide audit |
| Admin GC | Admin route and filesystem driver | Implemented (bounded) | Needs reference/lifecycle correctness for broader consumers |
| OCI Distribution | `modules/oci` | Partial / experimental | Protocol surface exists; production compatibility and durability require proof |
| Operator console | `apps/web` Next.js 16 | Partial | Current page is a tab-based prototype, not complete operator product |
| Shared UI package | `packages/ui` | Implemented (foundation) | Reusable component foundation |
| Typed contract package | `packages/contract` | Implemented (foundation) | Coverage and versioning need review |
| TypeScript SDK | `packages/sdk` | Partial | Initial SDK exists; full API coverage is planned |

## 2. Experimental extensions

| Capability | Current code behavior | Status | Why not production-ready |
|---|---|---|---|
| PGlite + pgvector | Embedded vector index adapter | Experimental | Must define index lifecycle, authorization, recovery, and isolation |
| Text extraction | Text-like MIME extraction with bounded snippet | Experimental | Limited formats and extraction guarantees |
| Embedding generation | Deterministic hash/trigram projection, 384 dimensions | Prototype | Not a trained semantic embedding model |
| Semantic search | Vector similarity over indexed text | Prototype | Search quality and permission-aware retrieval not certified |
| OpenAI-compatible embeddings | Returns deterministic local vectors | Prototype | Compatibility is limited; not provider-backed inference |
| OpenAI-compatible chat | Assembles document snippets into a template response | Prototype | Not an LLM inference gateway |
| Realtime SSE | In-process EventEmitter | Experimental | Events disappear on restart; no durable replay/checkpoints |
| Bucket branching | In-memory branch map/digest arrays | Experimental | No durable snapshots or copy-on-write reference graph |
| Shape sync | In-memory ring buffer and limited apply handler | Experimental | No durable peer identity, replay protection, or conflict protocol |
| Honeypot canary | In-memory canary state and trigger | Experimental | State is volatile; automated account disabling needs reviewed policy |
| Bit scrubber | Manual scan and recovery hook | Experimental / blocked | Traversal, sidecar pairing, symlink safety, and recovery correctness require audit |
| Analytics overview | Runtime and audit summary | Experimental / blocked | Authorization and information exposure must be verified |
| PostgreSQL wire gateway | Custom wire-protocol server | Blocked / review required | P0 issue requires protocol/security review or retirement decision |

## 3. Planned capabilities

| Capability | Tracking issue | Status |
|---|---:|---|
| Product charter and capability matrix completion | [#9 / EL-001](https://github.com/bjo163/echolog/issues/9) | Documentation baseline created; runtime verification remains |
| Docker workspace build | [#10 / EL-002](https://github.com/bjo163/echolog/issues/10) | Open; clean-build evidence required |
| Unified runtime scripts | [#11 / EL-003](https://github.com/bjo163/echolog/issues/11) | Open; command paths need reconciliation |
| Default-deny API authorization | [#12 / EL-004](https://github.com/bjo163/echolog/issues/12) | P0 security gate |
| Realtime/analytics/scrubber authorization | [#13 / EL-005](https://github.com/bjo163/echolog/issues/13) | P0 security gate |
| OpenAI endpoint security | [#14 / EL-006](https://github.com/bjo163/echolog/issues/14) | P0 security gate |
| PostgreSQL wire gateway decision | [#15 / EL-007](https://github.com/bjo163/echolog/issues/15) | P0 review gate |
| Scrubber correctness | [#16 / EL-008](https://github.com/bjo163/echolog/issues/16) | P1 correctness gate |
| Organization/project/environment model | [#17 / EL-009](https://github.com/bjo163/echolog/issues/17) | Planned; requires scope decision |
| Unified database persistence | [#18 / EL-010](https://github.com/bjo163/echolog/issues/18) | Planned; requires scope decision |
| Migration engine | [#19 / EL-011](https://github.com/bjo163/echolog/issues/19) | Planned |
| Unified identity/JWT | [#20 / EL-012](https://github.com/bjo163/echolog/issues/20) | Planned; must not supersede ARSY for MoonWitness |
| OAuth/OIDC/MFA | [#21 / EL-013](https://github.com/bjo163/echolog/issues/21) | Planned; global IAM is out of D19 core |
| RLS/RBAC/ABAC policy engine | [#22 / EL-014](https://github.com/bjo163/echolog/issues/22) | Planned; integrate with ARSY policy boundaries |
| Scoped keys and secrets | [#23 / EL-015](https://github.com/bjo163/echolog/issues/23) | Planned |
| Native PostgreSQL connectivity | [#24 / EL-016](https://github.com/bjo163/echolog/issues/24) | Planned; not D19 core by default |
| Generated REST / GraphQL / RPC / SQL Studio | [#25–#28 / EL-017–020](https://github.com/bjo163/echolog/issues/25) | Planned; platform expansion, owner decision required |
| Multi-tenant buckets and namespaces | [#29 / EL-021](https://github.com/bjo163/echolog/issues/29) | Planned; scoped storage tenancy may fit D19 |
| Unified storage policy | [#30 / EL-022](https://github.com/bjo163/echolog/issues/30) | Planned; high priority |
| Resumable uploads | [#31 / EL-023](https://github.com/bjo163/echolog/issues/31) | Planned |
| Media transformation | [#32 / EL-024](https://github.com/bjo163/echolog/issues/32) | Planned; derivative objects must remain immutable |
| Durable object references/lifecycle | [#33 / EL-025](https://github.com/bjo163/echolog/issues/33) | Planned; high priority |
| Durable CDC, WebSocket, functions, queues, cron | [#34–#38 / EL-026–030](https://github.com/bjo163/echolog/issues/34) | Planned platform capabilities; not D19 core |
| Real embedding providers and hybrid search | [#39–#40 / EL-031–032](https://github.com/bjo163/echolog/issues/39) | Planned; prefer consumer/AI platform ownership |
| Production model gateway | [#41 / EL-033](https://github.com/bjo163/echolog/issues/41) | Planned; not ECHOLOG's agent/model authority |
| Durable database/storage branches and replication | [#42–#44 / EL-034–036](https://github.com/bjo163/echolog/issues/42) | Planned; scope review required |
| Backup/restore/PITR | [#45 / EL-037](https://github.com/bjo163/echolog/issues/45) | Planned; critical for storage trust |
| Unified dashboard | [#46 / EL-038](https://github.com/bjo163/echolog/issues/46) | Planned |
| Complete SDK/CLI | [#47 / EL-039](https://github.com/bjo163/echolog/issues/47) | Planned |
| Production observability | [#48 / EL-040](https://github.com/bjo163/echolog/issues/48) | Planned |

## 4. Production-readiness rule

No capability may be labeled production-ready until all applicable gates are satisfied:
- Tests cover success, denial, malformed input, limits, restart, and failure paths.
- Authorization is default-deny and consistent across protocol aliases.
- Persistence and recovery semantics are explicit.
- Observability reports real state and failures.
- Documentation matches the registered routes and actual runtime.
- CI is green on the exact commit being claimed.
- MoonWitness integration boundaries are respected.

## 5. Snapshot limitations

This is a repository-source audit based on the visible `main` tree and recent commit history. It is not a live deployment inspection, a full route-by-route penetration test, or a passing CI attestation. The last visible main commit at review time is `d1e40cdc3ad61619b21b37f02db74332fe11a0cf` (3 November 2026).
