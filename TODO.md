# ECHOLOG — 10-task hardening plan

Status is updated as each task lands. Every task must leave `pnpm typecheck && pnpm build && pnpm build:client && pnpm test` green.

- [ ] **1. P0 — Restore a green baseline**
  - Fix `src/config.ts`, remove duplicated middleware implementations, repair `src/server.ts`, register the request-id plugin.
  - Done when typecheck/build/client build/test all pass and the service boots against a temp volume.

- [ ] **2. P0 — One authorization policy for every surface**
  - Extract a digest-access policy and use it in REST, S3 key listing, OCI blob/manifest reads, tools and telemetry.
  - Done when private-witness digests are hidden from members on every surface and admins keep access.

- [ ] **3. P0 — Close anonymous writes and stored XSS**
  - Tools and dropzone require authentication, respect MIME allow-list, filename sanitising, size and quota limits.
  - Escape every value interpolated into `/p/:slug` HTML and send a strict CSP.
  - Done when anonymous uploads are 401 and HTML injection renders as text.

- [ ] **4. P1 — Make short links a first-class feature**
  - Add `created_by`, owner-scoped list/delete, conflict-safe slugs, GC roots for live links, atomic burn-after-reading, expiry cleanup.
  - Done when two users cannot see or delete each other's links, GC keeps referenced objects, and a burn link is consumable once.

- [ ] **5. P1 — A correct rate limiter**
  - Single implementation, env-backed config, credential/IP buckets, `trustProxy`, health/metrics exemptions, bounded store, standard headers, real HTTP tests.
  - Done when N requests pass, N+1 returns 429 with `Retry-After`, and health never returns 429.

- [ ] **6. P1 — Valid observability**
  - Real Fastify metrics plugin with Prometheus histogram buckets, protected `/metrics`, working request-id header, and sidecar-only storage stats.
  - Done when `/metrics` parses as Prometheus text and telemetry never reads object bytes.

- [ ] **7. P1 — Trustworthy audit log**
  - One writer (`db.recordAuditLog`), best-effort writes, upload/delete/hold/private-witness/GC/key/account events, real SQLite tests.
  - Done when audit failures cannot fail the primary operation and the endpoint is admin-only.

- [ ] **8. P1 — OCI that real clients can use**
  - Nested repositories, Basic auth, Content-Range, bounded upload sessions, digest verification before commit, atomic tags, delete + pagination, protocol tests.
  - Done when the OCI lifecycle tests pass with real hashes and range-validated chunks.

- [ ] **9. P2 — Remove the second design system**
  - Drop `@moonwitness/moonframe`, its CSS, `ThemeProvider`, selectors and `MetricGrid`; replace with shadcn primitives and delete the dependency.
  - Done when `rg moonwitness client package.json` is empty and the console builds.

- [ ] **10. P2 — Docs, env, CI and schema versioning**
  - Update README/`.env.example`, remove the stale plan, add `PRAGMA user_version` migrations, document new tables and endpoints.
  - Done when docs match code and an existing volume upgrades in place.
