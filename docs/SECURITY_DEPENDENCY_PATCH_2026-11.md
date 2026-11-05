# ECHOLOG Dependency Security Patch — 6 November 2026

## Findings and remediation

### Next.js

- Previous locked version: `next@16.0.10`
- Manifest target: `next@16.4.5`
- Advisory: [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) — critical unauthenticated RCE in affected App Router Cache Components.
- Advisory: [CVE-2026-96889 / GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — critical RCE in Image Optimization SVG processing on glibc-based Linux.
- Advisory: [CVE-2026-23864 / GHSA-h25m-26qc-wcjf](https://github.com/vercel/next.js/security/advisories/GHSA-h25m-26qc-wcjf) — high-severity Server Components denial of service.
- Fixed release line: Next.js 16.4.1; repository target is the newer stable 16.4.5.
- Next.js 16.4.5 declares optional `sharp: ^0.35.5`; lockfile verification must confirm `sharp@0.35.5` or later is selected.

### Fastify

- Previous locked version: `fastify@5.12.7`
- Manifest target: `fastify@5.12.8`
- Advisory: [CVE-2026-120216 / GHSA-3qgw-9275-xf8w](https://github.com/fastify/fastify/security/advisories/GHSA-3qgw-9275-xf8w) — process-crash denial of service for streaming responses when a non-zero `handlerTimeout` is configured.
- Fixed release: 5.12.8.
- ECHOLOG currently creates Fastify without a custom `handlerTimeout` (default is zero), so the advisory's required timeout condition was not configured in the inspected server source. The dependency is still upgraded because ECHOLOG has a long-lived SSE route and should not retain the affected package version.

### React

- Locked `react` and `react-dom`: 19.3.1.
- React Server Components October 2026 advisories list 19.3.1 as a patched release; no React version change was needed in this pass.

## Repository changes

- Root `package.json`: Fastify range raised to `^5.12.8`.
- `apps/api/package.json`: Fastify range raised to `^5.12.8`.
- `apps/web/package.json`: Next.js pinned to `16.4.5`.
- CI lockfile refresh step added for main-branch dependency changes.
- CI now asserts the lock contains Next.js 16.4.5, Fastify 5.12.8, and sharp 0.35.5 before running typecheck/build/test.

## Verification state

**Do not consider this remediation complete until all of the following are true:**

1. CI regenerates and commits `pnpm-lock.yaml`.
2. The lockfile contains `next@16.4.5`, `fastify@5.12.8`, and `sharp@0.35.5` (or a later patched sharp release).
3. `pnpm install --frozen-lockfile` succeeds.
4. `pnpm typecheck`, `pnpm build`, `pnpm test`, and the Docker image/readiness job pass.
5. The deployed frontend/API images are rebuilt from the patched lockfile.

At the time of writing, GitHub Actions jobs were queued. Manifest changes are committed, but lockfile regeneration and runtime verification are pending. Do not report the deployed environment as patched until it has been rebuilt and its installed dependency tree is verified.


## Additional API hardening (2026-11-06)

The experimental route surface was reviewed and hardened in the follow-up API pass:

- Realtime SSE stream and event broadcast require administrator or service credentials.
- Analytics overview and manual scrub require administrator or service credentials.
- OpenAI-compatible model, embeddings, and chat endpoints require an authenticated principal.
- Embeddings accept at most 32 text inputs of at most 8192 characters each.
- Chat accepts at most 64 messages and 32768 total content characters.
- Global response headers now include HSTS, nosniff, frame denial, strict-origin referrer policy, restrictive permissions policy, and same-origin resource policy.
- Integration tests cover anonymous denial, member privilege denial, authorized admin calls, and payload limits.

These code changes are committed, but the CI run is still the authority for typecheck/build/test confirmation. Dependency CVE remediation remains incomplete until the lockfile is regenerated and the pinned-version assertions pass.
