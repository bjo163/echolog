# Implementation Plan

## Overview
This plan proposes structured improvements and new features for the ECHOLOG content-addressed object storage system, building on its existing architecture of SQLite identity store, filesystem-backed object storage, S3-compatible API, OCI registry support, and console UI. The improvements focus on enhancing developer experience, security, observability, and new capabilities while maintaining backward compatibility.

## Scope & Context
ECHOLOG is a standalone service (Node >=24 <25) providing content-addressed object storage with bounded S3 and OCI subsets. The codebase is well-structured with clear separation of concerns: `src/` contains the server, core drivers, modules (objects, admin, session, s3, oci, tools), and `test/` contains comprehensive tests covering REST, S3, OCI, federation, console client, and e2e round trips. The project uses TypeScript, Zod for config validation, Fastify for HTTP, and Smithy for S3 SigV4.

## Implementation Order

1. **Step 1**: Add type definitions (`src/types/rate-limit.ts`, `src/types/metrics.ts`, `src/types/logging.ts`)
2. **Step 2**: Create middleware files (`rate-limit.middleware.ts`, `metrics.middleware.ts`, `request-id.middleware.ts`)
3. **Step 3**: Update config schema (`src/config.ts`) with new optional fields
4. **Step 4**: Implement rate limiting in `src/server.ts` and `src/auth.ts`
5. **Step 5**: Implement metrics system in `src/server.ts`
6. **Step 6**: Add audit service (`src/services/audit-service.ts`)
7. **Step 7**: Add format extensions (`src/lib/format-extensions.ts`)
8. **Step 8**: Create test files (`test/rate-limit.test.ts`, `test/metrics.test.ts`, etc.)
9. **Step 9**: Run full test suite (`pnpm test`) and typecheck (`pnpm typecheck`)
10. **Step 10**: Document new features in README and update `.env.example`

## Summary

This implementation plan adds three major capability areas to ECHOLOG:

1. **Rate limiting** - Prevents abuse and DoS attacks on all surfaces (REST, S3, OCI, tools)
2. **Observability** - Metrics exposure and structured logging for operational monitoring
3. **Developer experience** - Request ID tracking, format helpers, and improved audit logging

All changes are additive with feature flags, maintaining the project's backward compatibility and test-first philosophy. The plan is designed to be implemented incrementally, with each step passing `pnpm typecheck && pnpm test` before proceeding.

---
Refer to @implementation_plan.md for a complete breakdown.