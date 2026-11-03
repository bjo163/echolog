# AGENTS.md — Autonomous Engineering Governance & Multi-Agent Architecture
## ECHOLOG Engineering Organization Guidelines

> [!IMPORTANT]
> This repository is governed by the **APEE X (Autonomous Project Evolution Engine)** charter. All participating AI agents and autonomous engineering roles operate under these directives.

---

## 1. Core Principles & Philosophy

1. **Autonomous Responsibility**: Think independently, plan independently, organize independently, execute independently, verify independently, and improve continuously.
2. **Quality Gates Authority**: Remote GitHub Actions CI is the primary quality verification executor. Local tests and typechecks serve as immediate pre-flight validation.
3. **Fail-Closed Security**: Data integrity, immutable CAS properties, authentication, authorization, and cryptographic correctness take precedence over convenience.
4. **Zero-Ops Footprint**: Single-process Node.js footprint without requiring external Docker services or multi-gigabyte memory consumption.

---

## 2. Monorepo Organization

- **`apps/api` (`@echolog/api`)**: Fastify 5 core backend service:
  - WORM Content-Addressable Storage (CAS)
  - S3-compatible XML/REST Gateway
  - OCI Distribution v1.1 Registry
  - In-process PostgreSQL WASM (`@electric-sql/pglite` + `pgvector`)
  - Postgres Wire Protocol Gateway v3 (`:5432`)
  - Local-first P2P Shape Sync
  - Zero-Copy Bucket Branching
  - Autonomous Honeypot Canary & Quarantine Engine
  - OpenAI-Compatible Gateway (`/v1/models`, `/v1/embeddings`, `/v1/chat/completions`)
  - Real-Time CDC Server-Sent Events (`/api/v1/realtime/stream`)
  - Autonomous Bit-Scrubber & Self-Healing Engine
- **`apps/web` (`@echolog/web`)**: Next.js 16 App Router + React 19 + Turbopack Web Dashboard.
- **`packages/contract` (`@echolog/contract`)**: Shared TypeScript data models, request/response types, and RPC contracts.
- **`packages/sdk` (`@echolog/sdk`)**: Official TypeScript client library with type-safe namespaces (`storage`, `ai`, `branches`, `security`, `tools`, `realtime`, `analytics`, `openai`).
- **`packages/ui` (`@echolog/ui`)**: Moonframe design system UI component library with Tailwind CSS v4.
- **`packages/shared` (`@echolog/shared`)**: Shared helpers and utility functions.
- **`packages/config` (`@echolog/config`)**: Monorepo TypeScript configuration bases.

---

## 3. Autonomous Workforce Roles

| Functional Role | Focus Area |
|---|---|
| **Commander** | Master orchestration, backlog synthesis, roadmap alignment, release coordination |
| **Architect** | Engine design, protocol gateways, low-overhead in-process adapters |
| **Developer** | High-density clean implementation, Antislop compliance |
| **QA / Reviewer** | Test coverage, edge-case analysis, regression checks, fault injection |
| **Security Auditor** | Fail-closed guarantees, cryptographic audits, honeypot defenses, access controls |
| **DevOps Engineer** | Docker multi-stage builds, Turborepo caching, GitHub Actions workflows |

---

## 4. Git & Branching Strategy

- **Development Branch**: Daily development commits land on `main` or active feature branches with clear commit prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- **Verification Loop**:
  1. Local verify: `pnpm typecheck && pnpm test && pnpm build`
  2. Commit & Push: `git push origin main`
  3. GitHub Actions Validation: Inspect remote workflow run with `gh run view <id> --log-failed`
  4. Instant Self-Healing: Fix any root causes immediately upon failure detection.
