# ECHOLOG — Execution TODO
## D19 · MoonWitness Object Memory & Evidence Integrity

**Last reviewed:** 6 November 2026  
**Source of truth for product direction:** `docs/MASTER_NARRATIVE.md`  
**Architecture boundaries:** `docs/ARCHITECTURE.md`  
**Verified code snapshot:** `docs/CAPABILITY_MATRIX.md`  
**Sequencing:** `docs/ROADMAP.md`

> This TODO records the next work. It does not claim the current implementation is production-certified. Existing GitHub issues EL-001–EL-040 remain traceability references; update their scope/status only after evidence is available.

## A. Documentation baseline — completed in this commit

- [x] Master product narrative aligned to MoonWitness XV / D19.
- [x] Vision and mission published.
- [x] Architecture and ownership boundaries documented.
- [x] Capability matrix separates code presence from production readiness.
- [x] Product roadmap prioritizes security, recovery, ARSY integration, and evidence integrity.
- [x] Frontend product brief prepared for `apps/web` redesign.
- [x] README and agent governance aligned with the D19 boundary.

## B. Immediate P0/P1 engineering gates

- [ ] **EL-002 / #10** — Prove a clean frozen-lockfile Docker build and readiness check.
- [ ] **EL-003 / #11** — Reconcile root scripts, API scripts, Next.js scripts, Docker entrypoint, and README.
- [ ] **EL-004 / #12** — Inventory and enforce default-deny authorization across every route/protocol.
- [ ] **EL-005 / #13** — Secure realtime, analytics, and manual scrub routes.
- [ ] **EL-006 / #14** — Secure OpenAI-compatible endpoints or disable them until safe.
- [ ] **EL-007 / #15** — Audit custom PostgreSQL wire gateway and retire if protocol/security guarantees cannot be proven.
- [ ] **EL-008 / #16** — Repair scrubber traversal and verification; no silent success on traversal errors.
- [ ] **EL-022 / #30** — Unify object access policy across REST, S3, OCI, tools, grants, and aliases.
- [ ] **EL-025 / #33** — Define durable consumer references and GC roots.

## C. D19 durability and integration

- [ ] **EL-037 / #45** — Implement consistent backup and restore with off-host destination.
- [ ] Run a full restore drill and verify every restored digest.
- [ ] Ratify standalone identity deviation against XV ADR-0007.
- [ ] Verify ARSY federation and fail-closed private-witness authorization.
- [ ] Publish consumer contract tests for `{ object_key, digest, size, content_type }`.
- [ ] Integrate one approved MoonWitness consumer end-to-end.
- [ ] Add evidence receipt and explicit integrity verification contracts.
- [ ] Add immutable derivative provenance without mutating original objects.

## D. Frontend

- [ ] Use `docs/FRONTEND_PRODUCT_BRIEF.md` as the authoritative design/UX brief.
- [ ] Audit real API support before wiring each screen.
- [ ] Replace current tab prototype with D19 operator information architecture.
- [ ] Ensure all values are API-backed and unavailable states are explicit.
- [ ] Complete accessibility, responsive behavior, and dark/light themes.

## E. Scope governance

- [ ] Review EL-009–EL-020 before implementing database, global IAM, generated API, or SQL Studio features.
- [ ] Review EL-026–EL-030 before implementing durable CDC, WebSocket, functions, queues, or cron.
- [ ] Review EL-031–EL-033 before promoting AI indexing or model gateway features.
- [ ] Review EL-034–EL-036 before promoting database/storage branching or peer replication.
- [ ] Keep platform extensions outside D19 core unless owner and MoonWitness XV architecture explicitly ratify the boundary.

## Completion policy

A task is complete only when code, tests, documentation, and exact-commit CI evidence agree. Do not close an issue because a class, route, or screen exists. Do not describe a prototype as production-ready. Do not silently change MoonWitness XV ADR-0007; submit a corresponding owner-reviewed change there when needed.
