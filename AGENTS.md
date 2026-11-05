# AGENTS.md — ECHOLOG Engineering Governance
## MoonWitness XV · D19 Object Memory & Evidence Integrity

This repository is the standalone implementation home for ECHOLOG, a bounded storage service in the MoonWitness ecosystem. All autonomous agents must preserve the product and architecture boundaries below.

## 1. Product identity

**ECHOLOG is the Memory Layer of MoonWitness.**  
**Domain:** D19 — Object Memory & Evidence Integrity.  
**Tagline:** Preserve the Original. Prove the Integrity. Protect the Witness.

ECHOLOG preserves original object bytes and storage-level integrity/lifecycle metadata. It does not decide truth, witness meaning, rights, consent, editorial status, or consumer-domain relationships.

## 2. Authority and ownership

- ARSY is the single MoonWitness Hub and canonical ecosystem run-state owner.
- D00/ARSY remains the canonical ecosystem identity and authorization authority.
- ECHOLOG is not a second Hub, global IAM, agent runtime, durable queue, or universal database platform.
- Standalone local SQLite identity exists as an extraction/deployment accommodation. Keep it isolated from global MoonWitness identity.
- Consumer domains own their own metadata, source relationships, witness meaning, rights, consent, and editorial decisions.
- Consumers store only `{ object_key, digest, size, content_type }`; never persist bytes, grant URLs, ECHOLOG secrets, or searchable sidecar mirrors.

## 3. Core invariants

1. Preserve original bytes. Never mutate an existing content-addressed object.
2. SHA-256 identity must be checked at ingest and during verification.
3. Same bytes at the same key are idempotent; different bytes at an existing immutable key are rejected.
4. Retention and legal holds fail closed.
5. Unauthorized private-witness access must not disclose object existence; preserve 404 privacy semantics across every alias.
6. Service credentials, grant secrets, S3 secrets, and session tokens never enter browser bundles, source control, or logs.
7. Download grants are short-lived capabilities and are never durable references.
8. Garbage collection must not delete live consumer references, legal holds, or retained objects.
9. Derivatives are new immutable objects with explicit source-digest lineage.
10. A digest proves byte consistency only; never describe it as proof of authorship, truth, consent, or legal admissibility.
11. Do not claim backup, replication, durable CDC, self-healing, semantic AI, or production readiness without reproducible evidence.
12. No feature may bypass human/domain governance.

## 4. Scope control

D19 core includes:
- Filesystem CAS object storage.
- REST object API.
- Bounded S3-compatible surface.
- Storage-level digest, retention, legal hold, private-witness protection, grants, quota, and GC.
- ECHOLOG-specific health, metrics, and service audit events.
- Approved object consumer contracts and operator tooling.

The repository currently contains experimental PGlite/pgvector, AI routes, realtime SSE, branching, shape sync, honeypot, scrubber, OCI, and custom PostgreSQL wire gateway modules. Their presence does not automatically make them D19 core or production-ready.

Before extending any experimental module, state:
- Which D19 need it serves.
- Why the capability cannot belong to ARSY, LUMEN, or a consumer domain.
- Its data owner and source of truth.
- Authorization and privacy model.
- Persistence/recovery model.
- Failure and rollback behavior.
- Exact tests and production acceptance evidence.

Global IAM, SQL Studio, generated application APIs, message queues, cron, serverless functions, and agent execution require explicit owner-approved architecture decisions; do not implement them as assumed ECHOLOG scope.

## 5. MoonWitness integration

- Treat XV `docs/architecture/ECHOLOG.md` and ADR-0007 as upstream contracts.
- The standalone SQLite identity deviation must remain documented. Do not silently rewrite or claim ADR-0007 has changed.
- In federated mode, validate ARSY bearer identity according to the upstream contract and fail closed on authorization unavailability.
- Never forward a local standalone credential to ARSY as a Hub subject.
- Never place ECHOLOG service credentials in consumers or browser code.
- Any change to upstream identity, object reference, or domain ownership must be accompanied by an owner-reviewed XV architecture/ADR update.

## 6. Engineering workflow

- Inspect the existing implementation, tests, manifests, route registration, and docs before changing code.
- Make small, reviewable changes with explicit acceptance criteria.
- Prefer additive migrations and backward-compatible API changes.
- Never weaken security tests to make a build pass.
- Keep README, capability matrix, roadmap, TODO, API contracts, and runtime scripts synchronized.
- Update the capability matrix whenever a feature changes maturity.
- Do not close GitHub issues until their acceptance criteria are demonstrated.
- Do not invent endpoints, scripts, environment variables, or successful operations.

## 7. Required quality gates

Run the exact root-supported commands from a clean dependency install:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Also run relevant subsystem integration tests and Docker build/readiness checks. If a command is unavailable or cannot be executed, report it as unverified rather than claiming success.

## 8. Security review checklist

- Route inventory includes REST, S3, OCI, tools, AI, realtime, analytics, health, admin, and wire protocol.
- Every route declares public, authenticated, role-scoped, or service-only access.
- Private-witness behavior is consistent across aliases.
- Inputs, uploads, filenames, MIME types, sizes, and quotas are validated.
- No secret values appear in logs, telemetry, browser storage, or error messages.
- Destructive operations require explicit authorization and fail-closed lifecycle checks.
- Scrubber and recovery routines cannot follow symlinks or silently report success after incomplete traversal.
- Automatic quarantine is bounded, auditable, reversible, and supported by a reviewed policy.

## 9. Product language

Use: **object memory**, **original object**, **content identity**, **byte integrity**, **private-witness protection**, **retention**, **legal hold**, **evidence receipt**.

Avoid: “truth engine,” “unbreakable,” “permanent forever,” “fully S3 compatible,” “production AI,” “durable CDC,” “self-healing,” or “compliance certified” unless the specific claim is independently proven.
