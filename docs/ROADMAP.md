# ECHOLOG — Product Roadmap
## D19 · MoonWitness Object Memory & Evidence Integrity

This roadmap separates the D19 mission from experimental platform extensions already present in the repository. Issue numbers are retained as traceability references; an issue's existence does not mean its scope is approved for the D19 core.

## North-star outcome

A MoonWitness operator and an approved consumer can store an original object, receive a stable four-field reference, verify its byte integrity, enforce its protection lifecycle, retrieve it through an authorized path, and restore it from a verified backup.

## Stage 0 — Align scope and establish truthful baseline
**Goal:** make the product boundary, code status, and operating model unambiguous.

- [x] Publish the ECHOLOG master narrative.
- [x] Publish vision and mission.
- [x] Publish architecture and domain boundaries.
- [x] Publish evidence-based capability matrix.
- [x] Publish roadmap and frontend product brief.
- [ ] Reconcile README, runtime commands, and Docker deployment evidence (EL-002/003).
- [ ] Reconcile ECHOLOG standalone identity deviation with the MoonWitness XV ADR-0007 owner.
- [ ] Review and triage all 48 open issues against the D19 boundary.
- [ ] Mark platform-extension issues as separate-scope proposals where appropriate.
- [ ] Add an automated documentation/capability consistency check.

**Exit:** documentation is internally consistent; no production claims exceed exact evidence.

## Stage 1 — Secure the current service
**Goal:** resolve existing P0 security and correctness gates before new capabilities.

- [ ] EL-004 / #12: default-deny authorization for every route and protocol surface.
- [ ] EL-005 / #13: secure realtime, analytics, and manual scrub endpoints.
- [ ] EL-006 / #14: secure OpenAI-compatible routes or disable them until safe.
- [ ] EL-007 / #15: audit custom PostgreSQL wire gateway; retire it if full protocol/security guarantees cannot be proven.
- [ ] EL-008 / #16: repair scrubber traversal, metadata pairing, symlink safety, and corruption reporting.
- [ ] Add cross-surface private-witness denial tests for REST, S3, OCI, tools, and all aliases.
- [ ] Verify service and S3 secrets never enter browser assets, logs, or client storage.
- [ ] Verify standalone local credentials cannot be confused with ARSY principals.

**Exit:** security tests pass, all route policies are inventoried, no unresolved P0 issue remains.

## Stage 2 — Make storage recoverable and reference-safe
**Goal:** turn filesystem persistence into an operationally trustworthy archive.

- [ ] EL-037 / #45: define backup manifest and consistency boundary.
- [ ] Back up objects, sidecars, S3 key index, private-witness markers, and required local identity/index state.
- [ ] Implement off-host backup destination.
- [ ] Restore into an isolated target volume.
- [ ] Re-hash every restored object and compare sidecar digest/size.
- [ ] Document RPO/RTO and operator recovery procedure.
- [ ] EL-025 / #33: define durable object-reference lifecycle and GC roots.
- [ ] Ensure GC cannot remove objects referenced by approved consumer records.
- [ ] Run a scheduled restore drill before any durability claim.

**Exit:** independently reproducible restore with digest verification and safe GC behavior.

## Stage 3 — Formalize MoonWitness integration
**Goal:** make ECHOLOG a first-class D19 service without creating a second Hub.

- [ ] Ratify the standalone-vs-federated identity mode with the XV owner.
- [ ] Verify ARSY bearer validation against the target XV contract.
- [ ] Define service credential rotation and deployment secret ownership.
- [ ] Publish versioned REST and S3 integration examples.
- [ ] Add consumer contract tests for `{object_key, digest, size, content_type}`.
- [ ] Add an integration example for one approved consumer without copying bytes.
- [ ] Verify private-witness authorization fail-closed behavior during ARSY outage.
- [ ] Publish a consumer onboarding and rollback runbook.

**Exit:** one consumer completes upload, reference persistence, authorized retrieval, and rollback tests against a real ECHOLOG instance.

## Stage 4 — Improve object and evidence lifecycle
**Goal:** improve preservation without changing the original object.

- [ ] Evidence receipt: object key, digest, size, content type, ingest timestamp, and authenticated principal reference.
- [ ] Integrity verification API with explicit verified / failed / unknown states.
- [ ] Integrity scrubber with reliable traversal, bounded work, and non-destructive default behavior.
- [ ] Quarantine workflow that preserves original bytes and requires reviewed recovery policy.
- [ ] Immutable derivative contract for thumbnails, previews, OCR, and transcodes.
- [ ] Link each derivative to its source digest without storing consumer-domain semantics.
- [ ] Resumable uploads with final digest verification (EL-023 / #31).
- [ ] Storage namespace and quota isolation only after tenant model and authorization are accepted (EL-021 / #29).

**Exit:** object lifecycle and derivative provenance are testable and do not weaken original-byte integrity.

## Stage 5 — Operator console aligned to D19
**Goal:** build a truthful operational interface for storage custodians.

- [ ] Replace the current single-page experimental console with a coherent Next.js App Router shell.
- [ ] Overview with real service/storage health and clear stale/unavailable states.
- [ ] Object Explorer and object detail with digest, size, MIME, retention, hold, and access state.
- [ ] Integrity Center with real verification results.
- [ ] Private Witness Vault with privacy-preserving behavior.
- [ ] Retention & Legal Holds with destructive-action confirmation.
- [ ] Credentials view that never reveals existing secrets.
- [ ] Storage Health and Activity views based only on actual API data.
- [ ] Dark/light theme, responsive behavior, keyboard accessibility, and command palette.
- [ ] Planned/experimental features must be visibly labeled and non-actionable until supported.

**Exit:** every visible action is wired to a verified API or explicitly marked unavailable/planned; no fake metrics or controls.

## Stage 6 — Optional extensions (separate approval required)
These are not assumed to be part of D19 core. Each requires a separate product/architecture decision and ownership review with MoonWitness XV.

- [ ] Evaluate PGlite/pgvector as a disposable auxiliary index, not a canonical metadata database.
- [ ] Move semantic retrieval and model inference to the approved AI/LUMEN boundary unless a bounded storage-local need is demonstrated.
- [ ] Retain SSE only as ephemeral operational notifications unless a durable event owner is explicitly approved.
- [ ] Replace in-memory branch/sync prototypes with durable, signed, conflict-aware protocols only if a real consumer requires them.
- [ ] Keep SQL Studio, generated APIs, queues, functions, cron, and global IAM outside D19 unless the ecosystem architecture explicitly assigns them.
- [ ] OCI remains an optional artifact distribution surface, subject to independent protocol/security acceptance.

**Exit:** no extension is promoted by implication; owner, data model, security boundary, and rollback are approved first.

## Priority rule

Backup/recovery, authorization, private-witness protection, reference lifecycle, and ARSY integration take precedence over adding new platform breadth. A new protocol or UI module is not a substitute for these foundations.
