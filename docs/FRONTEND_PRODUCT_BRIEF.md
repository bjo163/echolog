# ECHOLOG — Frontend Product Brief
## Next.js App Router · MoonWitness D19 Operator Console

**Product identity:** ECHOLOG — The Memory Layer of MoonWitness.  
**Domain:** D19 — Object Memory & Evidence Integrity.  
**Tagline:** Preserve the Original. Prove the Integrity. Protect the Witness.

## Product experience

Build a premium operator console for storage custodians and infrastructure operators. This is not a generic SaaS admin template, cloud drive, file manager, database studio, or Supabase clone.

The interface should feel like a **Futuristic Archive / Dark Editorial / Tactical Operator Console**: mature, calm, technical, precise, and unmistakably part of MoonWitness.

### Visual system

- Dark-first, with a complete light theme.
- Deep charcoal surfaces, warm ivory typography, moonlight silver, and restrained electric cyan or muted teal accents.
- Strong editorial typography hierarchy and dense but readable data layouts.
- Fine borders, subtle grid/grain, precise status indicators, and restrained glow.
- Avoid excessive rounded cards, neon cyberpunk clichés, purple gradients, and decorative glassmorphism.
- Responsive desktop-first design with tablet support.
- Accessible keyboard navigation, visible focus, reduced-motion support, and consistent spacing.

## Information architecture

1. Overview
2. Objects
3. Collections (only if backed by a real API; otherwise planned)
4. Integrity
5. Evidence Vault
6. Retention & Legal Holds
7. Access & Credentials
8. Storage Health
9. Activity
10. Settings

Global utilities: search/command palette, notifications, operator identity/role, ARSY connection state, theme switcher, help.

## Screens

### Overview
Show only real API-backed values: object count, logical/physical bytes, upload/download activity, integrity status, retained objects, legal holds, protected private-witness count, storage health, API availability, ARSY federation state, and recent service events. If a value is unavailable, show unavailable/unknown — never invent a metric.

### Objects
Search by key or digest; filter by MIME, size, date, retention, and privacy only when API supports it. Provide table/grid view, object detail, copy digest/reference, authorized download, and integrity verification only when supported.

### Object detail
Show object key, SHA-256, size, content type, ingest time, retention deadline, hold state, privacy state, verification state, and authorized access. Explain that digest verification proves byte consistency, not authorship or truth.

### Integrity
Show verification history, failed objects, run progress, digest comparison, and recovery guidance. Scheduled scrubbing and repair remain Planned until actually implemented and tested.

### Evidence Vault
Privacy-first. Never disclose a private object's existence to unauthorized users. ECHOLOG preserves bytes; the owning domain remains responsible for consent, witness meaning, and case context.

### Retention & Legal Holds
Show deadlines, active holds, deletion eligibility, GC preview, and why deletion is blocked. Destructive actions require explicit confirmation and backend success.

### Access & Credentials
Reflect the actual operating mode: standalone local identity or ARSY-federated MoonWitness identity. Show key metadata, roles, expiry/revocation state where supported. Never reveal an existing secret or place secrets in browser storage.

### Storage Health
Show filesystem volume status, used/available capacity, errors, and backup/restore state only when real integrations exist. Replication is Planned until implemented.

### Activity
Show only events actually returned by the backend. Do not imply this is the ecosystem-wide audit log.

## MoonWitness relationship

Make the relationship visible but subordinate to the single Hub architecture:

`MoonWitness XV → ARSY / D00 (Hub, identity, authorization) → ECHOLOG / D19 (object memory and integrity) → approved consumer domains`

ECHOLOG is not a second Hub, identity authority, agent runtime, or semantic truth engine.

## Technical requirements

- Inspect the existing `apps/web`, API routes, packages, contracts, SDK, and auth flow before changing code.
- Keep Next.js 16 App Router, React 19, TypeScript, and existing workspace conventions.
- Use typed API/service clients; do not scatter ad hoc fetch calls across views.
- Never invent endpoints or backend capabilities.
- Do not expose service secrets in browser code.
- Use real API state and explicit loading, empty, stale, partial, unauthorized, and error states.
- Do not claim success before the backend confirms it.
- Preserve typecheck, build, and test workflows.
- Build reusable design tokens and UI primitives; complete dark and light themes.
- Mark experimental modules clearly and do not present prototype AI, realtime, sync, branching, or wire-gateway features as production services.

## Deliverables

- Application shell and navigation.
- Overview / Command Center.
- Object Explorer and Object Detail.
- Integrity Center.
- Evidence Vault.
- Retention & Legal Holds.
- Access & Credentials.
- Storage Health.
- Activity and Settings.
- Dark/light themes, responsive layouts, reusable primitives, accessible interactions, and complete loading/empty/error states.

## Final impression

“This is where MoonWitness preserves the original digital memory behind its knowledge, research, stories, and witnesses. I can inspect object identity, verify integrity, understand protection boundaries, and operate storage with confidence.”

**ECHOLOG — The Memory Layer of MoonWitness.**
