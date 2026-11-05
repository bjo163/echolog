# ECHOLOG — Frontend Transformation Checklist
## 0.dev Execution Specification · MoonWitness XV · Domain D19

> **Execution mode:** inspect → plan → implement → validate → document → repeat until all feasible tasks are complete.
>
> **Product:** ECHOLOG — The Evidence Preservation Layer of MoonWitness XV.
>
> **Promise:** Preserve the Original. Verify the Bytes. Keep the Record Inspectable.
>
> **Important:** This is an implementation checklist, not a moodboard. Treat every unchecked item as work to perform. Do not stop after generating a visual concept, a static mockup, or a task plan.

---

# 0. Mission, boundaries, and definition of done

## 0.1 Mission

Transform the existing `apps/web` into a coherent, premium, responsive operator console for operating ECHOLOG's real preservation capabilities. The console must help an operator answer:

1. What objects are stored?
2. What is known about each object's integrity?
3. What preservation actions have actually happened?
4. What is protected by retention or legal hold?
5. What storage and recovery capabilities are genuinely configured?
6. Which capabilities are unavailable, experimental, or planned?
7. Can an object and its evidence be exported and independently inspected?

## 0.2 Product positioning

ECHOLOG is MoonWitness XV's D19 object-memory and evidence-preservation domain. It stores bytes, content identity, storage-level metadata, lifecycle state, and supported evidence records.

Architecture boundary:

`MoonWitness XV → ARSY / D00 → ECHOLOG / D19 → approved consumer domains`

- ARSY is the single Hub and canonical identity/authorization authority in federated mode.
- ECHOLOG is not a second Hub, global IAM, truth engine, general-purpose drive, workflow engine, agent runtime, durable queue, or universal database.
- Consumer domains own meaning, source relationships, consent, rights, and editorial state.
- The consumer-facing object reference remains the four-field contract: `{ object_key, digest, size, content_type }`.
- A digest establishes byte identity/consistency relative to the digest. It does **not** prove truth, authorship, origin, consent, or legal admissibility.
- Standalone local identity and ARSY-federated identity must be shown as distinct operating modes.

## 0.3 Non-negotiable execution rules

- [ ] Inspect the current repository before changing anything: `apps/web`, shared packages, API routes, schemas/contracts, SDK, auth middleware, environment configuration, tests, and existing design tokens.
- [ ] Preserve working routes, features, contracts, and integrations unless a verified defect requires a change.
- [ ] Reuse existing components and contracts where sound; do not create duplicate API types or a parallel data layer.
- [ ] Every visible data point must be sourced from a real API response, existing configuration, or explicitly labeled local UI state.
- [ ] Never invent API endpoints, response fields, events, metrics, object records, chart data, storage capacity, backup status, verification results, or success messages.
- [ ] If backend support is absent, build a truthful unavailable/planned/experimental state. Do not make a fake functional button.
- [ ] Never expose service secrets, bearer tokens, signing keys, raw credentials, or private object existence to unauthorized users.
- [ ] Keep ARSY/D00 as canonical identity authority in federated mode.
- [ ] Keep the UI honest about uncertainty: distinguish `verified`, `mismatch`, `not_checked`, `unavailable`, `stale`, and `unknown`.
- [ ] Do not represent a successful HTTP request as a completed preservation guarantee unless the backend response confirms the specific operation.
- [ ] Do not use a green integrity indicator without a real verification result and timestamp.
- [ ] Do not imply replication, backup, durability, restore readiness, or independent failure domains from configuration names alone.
- [ ] Do not silently change backend architecture or MoonWitness upstream ADRs to make a frontend screen easier.
- [ ] Do not add dependencies without checking whether the current stack already provides the capability.
- [ ] Work in small, reviewable steps. Keep the app runnable after each phase.
- [ ] When a task cannot be completed because backend capability or credentials are missing, document the exact blocker, leave the UI safe, and continue with independent tasks.

## 0.4 Definition of done

The transformation is complete only when:

- [ ] The app has one consistent visual system and navigation model.
- [ ] The primary operator flows work against real supported APIs.
- [ ] Every page has loading, empty, error, unauthorized, stale, and unavailable handling where relevant.
- [ ] Every action has a real implementation or is visibly disabled with a reason.
- [ ] Desktop, tablet, and mobile layouts are usable.
- [ ] Keyboard navigation, visible focus, semantic markup, and reduced-motion behavior work.
- [ ] Dark and light themes are complete and persist correctly.
- [ ] No fake data or misleading product claims remain.
- [ ] Type checking, linting, tests, and production build pass, or exact pre-existing failures are documented separately.
- [ ] Route/API mapping, known limitations, screenshots, and handoff notes are updated.
- [ ] The final report lists completed tasks, blocked tasks, commands run, test outcomes, and remaining backend dependencies.

---

# 1. Phase A — Repository discovery and baseline

## A1. Inventory

- [x] A1.1 Inspect the root package manager, workspace configuration, scripts, and lockfile.
- [x] A1.2 Inspect the complete `apps/web` route tree and identify existing pages, layouts, loading files, error boundaries, and route handlers.
- [x] A1.3 Inspect the existing UI/component package and identify reusable primitives.
- [x] A1.4 Inspect current CSS, theme tokens, fonts, icons, and responsive breakpoints.
- [ ] A1.5 Inspect API client code, SDK, OpenAPI/schema files, shared contracts, and generated types.
- [x] A1.6 Inspect authentication, authorization, session handling, middleware, and standalone/federated mode detection.
- [x] A1.7 Inspect current API endpoints and record their actual request/response shapes.
- [ ] A1.8 Inspect tests, fixtures, mocks, and existing CI commands.
- [x] A1.9 Identify existing frontend behavior that must not regress.
- [ ] A1.10 Produce a concise baseline inventory before implementation.

**Acceptance criteria**
- [ ] Every existing route is listed with its current purpose and status.
- [ ] Every proposed UI action is mapped to a verified API/SDK method or marked unavailable.
- [ ] No endpoint or response field is assumed based on naming alone.
- [ ] Existing build/test failures are recorded before modifications.

## A2. Capability mapping

Create and maintain a route-to-capability matrix with these columns:

`Screen | User task | API/SDK source | Auth requirement | Implemented? | UI state | Blocker | Test`

- [x] A2.1 Map object listing, object detail, object upload/deposit, object download, and metadata operations.
- [ ] A2.2 Map digest/fixity verification and verification history.
- [x] A2.3 Map retention, legal hold, and deletion behavior.
- [x] A2.4 Map audit/activity events and their actual scope.
- [x] A2.5 Map storage volume/configuration and capacity reporting.
- [x] A2.6 Map backup, restore, export, and import capabilities.
- [x] A2.7 Map standalone identity and ARSY federation.
- [ ] A2.8 Map experimental endpoints separately from production-ready capabilities.
- [x] A2.9 Mark each unsupported action as `NOT_AVAILABLE`, not as implemented.
- [x] A2.10 Save the matrix in the repository, preferably `apps/web/ROUTE_API_MATRIX.md` or the established docs location.

**Acceptance criteria**
- [ ] No visible action lacks an implementation mapping or an explicit unavailable state.
- [ ] Experimental APIs are not presented as stable production features.

---

# 2. Phase B — Design system foundation

## B1. Visual identity

**Design direction:** Futuristic Archive / Dark Editorial / Precision Instrument.

The product should feel like a high-trust archival instrument: precise, quiet, technical, and human. It must not look like a generic admin template, crypto dashboard, cloud drive, or sci-fi game HUD.

- [ ] B1.1 Define the ECHOLOG wordmark treatment using existing brand assets if available.
- [x] B1.2 Define a restrained palette: deep charcoal, graphite, warm ivory, moonlight silver, and controlled cyan/teal.
- [x] B1.3 Define semantic colors: success/verified, warning/stale, danger/mismatch, neutral/unknown, disabled/unavailable.
- [x] B1.4 Use amber for caution and red only for destructive or failed states.
- [x] B1.5 Define typography scale for page title, section title, body, labels, metadata, and monospace identifiers.
- [ ] B1.6 Use tabular numerals for sizes, timestamps, counters, and digest fragments.
- [x] B1.7 Define spacing, layout widths, border weights, radii, shadows, and density.
- [ ] B1.8 Define data-table density modes where useful.
- [x] B1.9 Define icon style and a consistent icon library; avoid emoji as core interface icons.
- [ ] B1.10 Use subtle texture/grid only where it improves hierarchy; never reduce readability.
- [x] B1.11 Avoid purple gradients, neon overload, excessive glassmorphism, oversized rounded cards, and decorative fake charts.
- [x] B1.12 Create a small set of reusable visual patterns rather than styling each page independently.

## B2. Theme and accessibility

- [x] B2.1 Implement complete dark theme.
- [x] B2.2 Implement complete light theme; do not simply invert colors.
- [x] B2.3 Add a theme switcher with persisted preference using the project's existing preference mechanism.
- [ ] B2.4 Respect system preference when no explicit preference exists.
- [ ] B2.5 Verify text and control contrast.
- [x] B2.6 Add visible keyboard focus to all interactive controls.
- [x] B2.7 Ensure all controls have accessible names and labels.
- [x] B2.8 Use semantic headings, landmarks, tables, dialogs, and form labels.
- [ ] B2.9 Support keyboard-only navigation and logical tab order.
- [x] B2.10 Respect `prefers-reduced-motion`.
- [x] B2.11 Ensure status is never communicated by color alone.
- [ ] B2.12 Test screen-reader labels for digest, object key, status, and destructive actions.

## B3. Shared component inventory

Build or adapt reusable components only after checking the current component library.

- [x] B3.1 App shell and responsive navigation.
- [x] B3.2 Page header with title, description, breadcrumbs, and contextual actions.
- [x] B3.3 Status badge with explicit semantic variants.
- [x] B3.4 Metric display that supports unknown/unavailable values.
- [ ] B3.5 Data table with sorting, pagination, selection, empty state, and responsive fallback.
- [x] B3.6 Search field and filter controls.
- [x] B3.7 Digest display with truncation, full-value reveal, and copy action.
- [x] B3.8 Object-key display with safe copy behavior.
- [x] B3.9 Timestamp display with timezone clarity.
- [x] B3.10 Byte-size formatter.
- [ ] B3.11 Verification result panel.
- [ ] B3.12 Event timeline.
- [ ] B3.13 Retention and legal-hold indicator.
- [ ] B3.14 Privacy classification indicator that does not reveal unauthorized object existence.
- [x] B3.15 Empty, loading/skeleton, error, stale, unavailable, and unauthorized state components.
- [x] B3.16 Confirmation dialog for destructive or irreversible operations.
- [x] B3.17 Toast/inline feedback that reflects actual server outcomes.
- [x] B3.18 Copy-to-clipboard feedback.
- [ ] B3.19 Code/JSON viewer with safe truncation and no secret leakage.
- [ ] B3.20 Responsive side panel or detail drawer where appropriate.

**Acceptance criteria**
- [ ] Components use shared tokens and consistent behavior.
- [ ] No page introduces a one-off status color or interaction pattern without justification.
- [ ] Components work in both themes and at narrow viewport widths.

---

# 3. Phase C — Application shell and navigation

## C1. Global shell

- [x] C1.1 Create a stable application shell with a clear content hierarchy.
- [x] C1.2 Show ECHOLOG identity and the D19 designation without overwhelming the interface.
- [ ] C1.3 Show environment (local/development/staging/production) only when reliably known.
- [x] C1.4 Show current identity mode: standalone or ARSY-federated.
- [ ] C1.5 Show service connectivity based on a real health check; distinguish unknown from offline.
- [x] C1.6 Add responsive primary navigation.
- [ ] C1.7 Add global search only if a real searchable resource exists; otherwise omit or scope it clearly.
- [ ] C1.8 Add command palette only for real navigation/actions already supported.
- [x] C1.9 Add theme control.
- [x] C1.10 Add account/identity menu without exposing credentials.
- [ ] C1.11 Add notification surface only if backed by real events; otherwise do not fabricate notifications.
- [ ] C1.12 Add help/about and version/build information when available.
- [x] C1.13 Preserve deep-link navigation and browser back/forward behavior (implemented with Next.js App Router pathname routes).
- [ ] C1.14 Ensure mobile navigation is accessible and does not hide critical actions.

## C2. Navigation map

Use the following information architecture, but only expose screens that can be implemented honestly:

1. Overview
2. Objects
3. Integrity
4. Preservation Packages (staged if unsupported)
5. Storage & Recovery (staged if unsupported)
6. Retention & Legal Holds
7. Access & Identity
8. Activity
9. Diagnostics / Settings

- [x] C2.1 Give each active navigation item a working route (dedicated Next.js App Router paths).
- [ ] C2.2 Do not expose dead-end links.
- [ ] C2.3 Mark future areas as planned only if a roadmap preview is useful; do not make them look operational.
- [ ] C2.4 Add breadcrumbs or clear back navigation for nested detail pages.
- [x] C2.5 Implement direct route restoration for workspace and object-detail paths (runtime refresh verification remains pending).

---

# 4. Phase D — Primary operator flows

Implement these in order. A flow is complete only when it works with actual API data and handles all relevant states.

## D1. Overview

**Purpose:** provide a truthful operational snapshot, not a decorative analytics dashboard.

- [ ] D1.1 Show service health from a verified health endpoint.
- [x] D1.2 Show object count only if the backend returns an authorized, correctly scoped count.
- [x] D1.3 Show stored bytes/capacity only if the source and units are defined.
- [ ] D1.4 Show verification backlog only if a real queue/status API exists.
- [ ] D1.5 Show last successful fixity check only if recorded by the backend.
- [ ] D1.6 Show backup age/status only if a real backup subsystem reports it.
- [ ] D1.7 Show last restore proof only if a restore drill record exists.
- [x] D1.8 Show recent storage events only from the actual ECHOLOG event source.
- [x] D1.9 Clearly label stale and unavailable metrics.
- [ ] D1.10 Link each metric to the relevant detail view where possible.
- [x] D1.11 Add an explanatory first-run state when no data exists.
- [x] D1.12 Do not show invented charts, percentages, uptime, growth, savings, or risk scores.

**Acceptance criteria**
- [ ] Every metric can be traced to a response field or configuration source.
- [ ] Unknown metrics display “Not available” or equivalent, not zero.
- [ ] The page remains useful with partial API availability.

## D2. Object Explorer

- [ ] D2.1 Build a searchable object list using the real list endpoint.
- [x] D2.2 Support only filters that the API actually supports or can safely apply client-side to the authorized result set.
- [x] D2.3 Show object key, digest, size, content type, ingest time, retention/hold, and privacy state when returned.
- [ ] D2.4 Add pagination/cursor handling according to the actual API contract.
- [ ] D2.5 Preserve search/filter state in the URL when appropriate.
- [ ] D2.6 Add sorting only for fields with supported ordering or safe client-side sorting.
- [ ] D2.7 Add table and compact-list modes only if both improve usability.
- [x] D2.8 Implement empty, loading, stale, unauthorized, and error states.
- [x] D2.9 Avoid leaking private-witness objects through totals, autocomplete, suggestions, or error messages.
- [x] D2.10 Ensure object rows link to a stable detail route (digest-addressable pathname).
- [x] D2.11 Add safe copy for object key and digest.
- [x] D2.12 Add authorized download only if the backend supports it and authorization is enforced server-side.
- [ ] D2.13 Do not add bulk delete or bulk mutation unless the backend contract explicitly supports safe authorization and confirmation.

**Acceptance criteria**
- [ ] Search and pagination behave according to the backend contract.
- [ ] Unauthorized users cannot infer private object existence.
- [ ] Every row's displayed fields are real response values.

## D3. Object Detail

- [x] D3.1 Create a stable detail route keyed by the canonical object identifier (SHA-256 digest in the pathname).
- [x] D3.2 Show the four-field consumer reference: `object_key`, `digest`, `size`, `content_type`.
- [x] D3.3 Show ingest timestamp and storage-level metadata when available.
- [x] D3.4 Show retention and legal-hold state when available.
- [ ] D3.5 Show privacy/access state without disclosing protected metadata.
- [ ] D3.6 Show verification history only when actual records exist.
- [ ] D3.7 Show receipt details only when a real receipt format/API exists.
- [x] D3.8 Add authorized download with server-side access control.
- [x] D3.9 Add copy-reference action that copies exactly the supported four-field contract.
- [x] D3.10 Explain that SHA-256 confirms byte-level consistency against a known digest, not truth or authorship.
- [ ] D3.11 Show derivative/related objects only when a real relationship exists.
- [x] D3.12 Provide clear not-found and unauthorized behavior that does not leak protected existence.
- [x] D3.13 Prevent accidental display of secrets or internal filesystem paths.

**Acceptance criteria**
- [ ] Detail data matches the API response.
- [ ] Copy-reference output is schema-correct and tested.
- [ ] The page makes no unsupported claims about provenance or legal evidence.

## D4. Deposit / ingest flow

Only implement if the current API supports object creation/upload.

- [x] D4.1 Confirm the actual upload protocol, size limits, content-type behavior, and authorization.
- [x] D4.2 Build a clear file selection/drop area.
- [ ] D4.3 Validate constraints before upload where possible; preserve server-side validation as authoritative.
- [ ] D4.4 Show upload progress only when measurable.
- [x] D4.5 Handle interrupted, rejected, duplicate, and failed uploads.
- [x] D4.6 Show the server-issued object key and digest after confirmed success.
- [x] D4.7 Generate a copyable four-field reference from the confirmed response.
- [x] D4.8 Do not claim preservation receipt issuance unless the backend returns a receipt.
- [x] D4.9 Do not retry non-idempotent uploads blindly.
- [ ] D4.10 Add tests for success, rejection, timeout, and duplicate/idempotency behavior.

**Acceptance criteria**
- [ ] A successful UI state appears only after a confirmed server response.
- [ ] Failure leaves no misleading object reference.
- [ ] Upload behavior matches the backend contract exactly.

## D5. Integrity Center

- [x] D5.1 Inspect the existing fixity verification implementation and contract first.
- [x] D5.2 Show only real verification records.
- [ ] D5.3 Display timestamp, object reference, checker/source, expected digest, observed digest, and result when available.
- [ ] D5.4 Normalize outcomes into explicit labels: verified, mismatch, unavailable, not_checked; preserve raw backend status in diagnostics where safe.
- [ ] D5.5 Make mismatch visually distinct and accessible.
- [ ] D5.6 Show verification age and stale state only using defined policy.
- [ ] D5.7 Add manual verification action only if a real authorized endpoint exists.
- [ ] D5.8 Show progress only if the backend exposes a job/progress resource.
- [ ] D5.9 Show quarantine/repair only if actual backend workflows exist.
- [ ] D5.10 Never imply a mismatch was repaired merely because it was acknowledged.
- [ ] D5.11 Add filters for outcome/time only when supported.
- [x] D5.12 Explain what a digest check can and cannot establish.

**Acceptance criteria**
- [ ] No fabricated green checks or verification history.
- [ ] A mismatch cannot be hidden behind a generic success toast.
- [ ] All verification actions are permission-checked and auditable.

## D6. Retention & Legal Holds

- [x] D6.1 Inspect current retention and legal-hold contracts.
- [ ] D6.2 Display current retention policy and expiry where available.
- [ ] D6.3 Display hold state and reason only to authorized roles.
- [ ] D6.4 Show which actions are blocked by a hold.
- [x] D6.5 Explain consequences before any destructive action.
- [x] D6.6 Require explicit confirmation for destructive or irreversible operations.
- [ ] D6.7 Require typed confirmation for high-impact actions if consistent with existing UX patterns.
- [x] D6.8 Show the server's final result and updated state.
- [ ] D6.9 Handle stale data and concurrent policy changes safely.
- [x] D6.10 Do not imply legal validity or compliance certification.

**Acceptance criteria**
- [ ] The UI never bypasses backend policy.
- [ ] Destructive operations cannot be triggered by a casual click.
- [ ] Legal language remains factual and non-certifying.

## D7. Access & Identity

- [ ] D7.1 Detect standalone versus ARSY-federated mode from trusted server-side configuration/session data.
- [ ] D7.2 Clearly identify ARSY/D00 as canonical authority in federated mode.
- [x] D7.3 Show local standalone identity separately and avoid presenting it as MoonWitness-wide identity.
- [x] D7.4 Display current principal and effective scope only when safe and authorized.
- [x] D7.5 Show credential IDs/status/expiry only if safely returned by the API.
- [ ] D7.6 Never display secret material after creation or retrieval.
- [x] D7.7 Add credential creation/rotation/revocation only if real secure APIs exist.
- [x] D7.8 Explain permission-denied behavior without revealing protected object existence.
- [x] D7.9 Ensure all privileged UI actions are enforced by backend authorization, not just hidden in the browser.

**Acceptance criteria**
- [ ] No client-side secret exposure.
- [ ] UI role checks are supplementary; backend authorization remains authoritative.
- [ ] Identity mode is never guessed from a display name.

## D8. Activity

- [x] D8.1 Inspect the actual audit/event source and retention behavior.
- [x] D8.2 Display only ECHOLOG events available to the current principal.
- [ ] D8.3 Distinguish event time, ingestion time, and display time if the schema provides them.
- [x] D8.4 Show actor/action/target/result only when present in the event schema.
- [ ] D8.5 Add filters only for supported fields.
- [ ] D8.6 Show whether the log is durable or in-process/non-durable if relevant.
- [x] D8.7 Do not label the feed as a complete MoonWitness-wide audit trail.
- [ ] D8.8 Do not fabricate real-time updates if the event stream is not durable or available.

**Acceptance criteria**
- [ ] Every event row can be traced to an actual event.
- [ ] Scope and durability limitations are visible.

## D9. Storage & Recovery

- [x] D9.1 Inspect actual storage configuration and health APIs.
- [ ] D9.2 Show configured storage target(s) without implying independent copies.
- [x] D9.3 Show capacity/free-space only when measured and returned by a trusted source.
- [ ] D9.4 Show backup destination/status only when a real backup process reports it.
- [ ] D9.5 Show last successful backup time only from a verified backup record.
- [ ] D9.6 Show restore history only from actual restore operations/drills.
- [ ] D9.7 Show RPO/RTO only after measured restore evidence exists.
- [ ] D9.8 Distinguish same-host copy, off-host backup, and independent failure domain.
- [ ] D9.9 Do not present multiple configured paths as replication.
- [x] D9.10 Do not show a “healthy” badge merely because a volume is mounted.
- [x] D9.11 If no recovery API exists, show a clear not-yet-supported state and link to documentation.

**Acceptance criteria**
- [ ] No backup/recovery claim without evidence.
- [ ] Storage health and recoverability are separate concepts.

## D10. Preservation Packages

This area is future-facing until export/import and validators exist.

- [x] D10.1 Inspect whether any package/export endpoint already exists.
- [ ] D10.2 If unsupported, build an informational planned state only.
- [x] D10.3 Do not simulate BagIt export or validation.
- [ ] D10.4 If supported later, show package manifest, checksums, validation report, and package version.
- [ ] D10.5 Show independent validation outcome separately from ECHOLOG's own generation outcome.
- [ ] D10.6 Preserve original object bytes; derivatives must be separate objects with explicit relationships.
- [ ] D10.7 Add export/import history only from real backend records.

**Acceptance criteria**
- [ ] No package download button unless a real downloadable package exists.
- [ ] No “portable/validated” claim without an independent validation result.

## D11. Diagnostics & Settings

- [ ] D11.1 Show app version/build identifier only when available.
- [ ] D11.2 Show API connectivity with timestamp and error class, without leaking internals.
- [ ] D11.3 Show safe runtime configuration only; redact secrets and sensitive paths.
- [ ] D11.4 Show feature availability and experimental labels.
- [ ] D11.5 Keep settings that mutate backend state behind proper authorization and confirmation.
- [ ] D11.6 Provide a safe diagnostics export if supported; scrub tokens, secrets, private object identifiers, and sensitive paths.
- [ ] D11.7 Do not add arbitrary configuration controls that have no backend effect.

---

# 5. Phase E — Advanced product surfaces (only after primary flows)

These ideas differentiate ECHOLOG from generic object storage. Build the UI only when the backend contract and evidence model exist. Until then, keep them in roadmap documentation, not fake interactive screens.

## E1. Evidence Receipt Passport

- [ ] E1.1 Define the receipt schema with backend owners before UI implementation.
- [ ] E1.2 Include only verifiable facts: object key, digest algorithm/value, size, content type, receipt time, issuer/key ID, and schema version where supported.
- [ ] E1.3 Make the receipt exportable and independently verifiable offline.
- [ ] E1.4 Show signature verification separately from digest verification.
- [ ] E1.5 Clearly state what the receipt does not prove: truth, authorship, consent, or legal admissibility.
- [ ] E1.6 Add QR/shareable verification only if privacy-safe and backed by a public verification policy.
- [ ] E1.7 Never expose private object metadata through public receipt lookup.

## E2. Preservation Flight Recorder

- [ ] E2.1 Define append-oriented event semantics and durability guarantees.
- [ ] E2.2 Show ingest, verification, retention, migration, export, and restore events only when recorded.
- [ ] E2.3 Distinguish immutable evidence from mutable operational annotations.
- [ ] E2.4 Show gaps or unavailable periods rather than implying complete history.
- [ ] E2.5 Add exportable event bundle only after schema/versioning and integrity rules are defined.

## E3. Independent Witness Checkpoints

- [ ] E3.1 Define checkpoint format and signing authority.
- [ ] E3.2 Define key rotation, revocation, and verification policy.
- [ ] E3.3 Define Merkle inclusion/consistency proof format if adopted.
- [ ] E3.4 Display checkpoint timestamp, signer/key ID, root digest, and proof status only when cryptographically verified.
- [ ] E3.5 Separate independent witness verification from local database claims.
- [ ] E3.6 Do not market a transparency log as tamper-proof without a threat model and independent monitoring.

## E4. Archive Escape Hatch

- [ ] E4.1 Define an open export format and versioned manifest.
- [ ] E4.2 Ensure export includes original bytes and required verification metadata.
- [ ] E4.3 Provide a standalone verifier that does not require a running ECHOLOG instance.
- [ ] E4.4 Test import/export round trips.
- [ ] E4.5 Document how consumers can leave ECHOLOG without losing access to their originals.
- [ ] E4.6 Show compatibility/version warnings without blocking access to valid older packages.

## E5. Recovery Rehearsal

- [ ] E5.1 Define restore drill records and safe test environment requirements.
- [ ] E5.2 Show scheduled/last drill only when a scheduler and record exist.
- [ ] E5.3 Show restore duration, recovered object count, and post-restore fixity only from measured evidence.
- [ ] E5.4 Distinguish successful backup creation from successful restore.
- [ ] E5.5 Show failed drills prominently and link to actionable diagnostics.

## E6. Copy Diversity Map

- [ ] E6.1 Define failure-domain vocabulary (host, disk, site, provider, account, region).
- [ ] E6.2 Record copy identity and verification time.
- [ ] E6.3 Prove independence before showing copies as independent.
- [ ] E6.4 Visualize verified copy topology only from real metadata.
- [ ] E6.5 Warn when all copies share a failure domain.
- [ ] E6.6 Never infer geographic or administrative independence from different path strings.

## E7. Format Obsolescence Watch

- [ ] E7.1 Define a format identification source and versioned signature database.
- [ ] E7.2 Show detected format and confidence/source.
- [ ] E7.3 Distinguish format identification from format validity.
- [ ] E7.4 Show risk signals and source date.
- [ ] E7.5 Never auto-convert or modify original bytes.
- [ ] E7.6 Treat migration derivatives as new objects with explicit lineage and validation records.

## E8. Evidence Dependency Closure

- [ ] E8.1 Define the dependency manifest for schemas, keys, algorithms, manifests, and verifier versions.
- [ ] E8.2 Identify which dependencies are required to verify an exported package.
- [ ] E8.3 Bundle public verification material safely; never bundle private keys.
- [ ] E8.4 Show missing dependencies and verification limitations.
- [ ] E8.5 Test offline verification in a clean environment.

---

# 6. Phase F — Interaction, resilience, and security

## F1. Data and request behavior

- [ ] F1.1 Use typed request/response contracts from the existing codebase.
- [ ] F1.2 Centralize API error parsing and safe error messages.
- [ ] F1.3 Handle request cancellation on route changes where appropriate.
- [ ] F1.4 Prevent stale responses from overwriting newer search/filter results.
- [ ] F1.5 Use pagination/cursor semantics exactly as defined by the API.
- [ ] F1.6 Avoid unnecessary polling; respect backend rate limits.
- [ ] F1.7 Use SSE only if the actual event stream is available and its durability limitations are disclosed.
- [ ] F1.8 Do not add client-side caching that can leak data across identities or modes.
- [ ] F1.9 Invalidate/refetch relevant data after mutations.
- [ ] F1.10 Make retries safe and idempotent where possible.

## F2. Security and privacy

- [ ] F2.1 Verify server-side authorization on every protected data path.
- [ ] F2.2 Keep secrets on the server; never ship them in client bundles.
- [ ] F2.3 Avoid logging tokens, private object metadata, or raw sensitive payloads.
- [ ] F2.4 Prevent private-witness existence leaks in list, count, search, suggestions, and errors.
- [ ] F2.5 Validate untrusted URL/query parameters.
- [ ] F2.6 Sanitize rendered user-controlled text and metadata.
- [ ] F2.7 Protect state-changing requests against the applicable CSRF/session risks in the existing architecture.
- [ ] F2.8 Ensure downloads use authorized server-mediated access or safe signed URLs with bounded lifetime.
- [ ] F2.9 Redact sensitive fields from diagnostics and client error reports.
- [ ] F2.10 Review dependency additions for security and maintenance risk.
- [ ] F2.11 Ensure logout/session expiry clears sensitive in-memory UI state.
- [ ] F2.12 Test cross-user and cross-mode data isolation.

## F3. Resilience

- [x] F3.1 Add route-level loading boundaries.
- [x] F3.2 Add route-level error boundaries with safe recovery actions.
- [ ] F3.3 Handle API timeout and service-unavailable states.
- [ ] F3.4 Handle partial service failure without blanking unrelated screens.
- [ ] F3.5 Handle empty first-run state.
- [ ] F3.6 Handle stale data and show last-updated timestamp.
- [ ] F3.7 Prevent duplicate submission for mutation forms.
- [ ] F3.8 Preserve user input after recoverable failures.
- [ ] F3.9 Avoid optimistic updates for destructive or evidence-sensitive operations.
- [ ] F3.10 Provide clear retry behavior without hiding the original failure.

---

# 7. Phase G — Responsive and visual QA

## G1. Responsive layouts

- [ ] G1.1 Verify wide desktop layout (1440px and above).
- [ ] G1.2 Verify standard laptop layout (1280px).
- [ ] G1.3 Verify tablet layout (768px–1024px).
- [ ] G1.4 Verify mobile layout (360px–430px).
- [ ] G1.5 Ensure tables have a deliberate mobile treatment (responsive columns, horizontal scroll, or card transformation).
- [ ] G1.6 Ensure dialogs fit small screens.
- [ ] G1.7 Ensure long object keys and digests wrap/truncate safely without losing copy access.
- [ ] G1.8 Ensure navigation and primary actions remain reachable.
- [ ] G1.9 Avoid horizontal page overflow.
- [ ] G1.10 Check both themes at every major breakpoint.

## G2. Visual quality

- [ ] G2.1 Verify consistent alignment, spacing, typography, and density across pages.
- [ ] G2.2 Verify information hierarchy prioritizes operational truth over decoration.
- [ ] G2.3 Verify status colors and labels are consistent.
- [ ] G2.4 Verify tables remain readable with long values and empty columns.
- [ ] G2.5 Verify loading skeletons resemble actual content layout.
- [ ] G2.6 Verify empty states explain the next legitimate action.
- [ ] G2.7 Verify errors are specific enough to help but do not disclose internals.
- [ ] G2.8 Verify no placeholder lorem ipsum, fake activity, fake avatars, fake charts, or template filler remains.
- [ ] G2.9 Verify no dead buttons, dead links, or inert controls remain.
- [ ] G2.10 Capture screenshots of primary routes in dark and light themes.

---

# 8. Phase H — Testing and release readiness

## H1. Automated checks

- [ ] H1.1 Run the repository's documented install command.
- [ ] H1.2 Run formatter/check formatting if configured.
- [ ] H1.3 Run lint.
- [ ] H1.4 Run TypeScript typecheck.
- [ ] H1.5 Run unit tests.
- [ ] H1.6 Run component tests if configured.
- [ ] H1.7 Run integration tests against the supported API test environment.
- [ ] H1.8 Run production build.
- [ ] H1.9 Add tests for every new critical UI state and mutation flow.
- [ ] H1.10 Record exact command, exit code, and relevant output for each check.

## H2. Required scenario tests

- [ ] H2.1 Fresh install / first-run with no objects.
- [ ] H2.2 Healthy API with existing objects.
- [ ] H2.3 API unavailable.
- [ ] H2.4 API returns partial data.
- [ ] H2.5 Unauthorized user.
- [ ] H2.6 Standalone identity mode.
- [ ] H2.7 ARSY-federated mode.
- [ ] H2.8 Private-witness object access denied without existence leakage.
- [ ] H2.9 Object digest verified.
- [ ] H2.10 Object digest mismatch.
- [ ] H2.11 Object not checked / verification unavailable.
- [ ] H2.12 Retention blocks destructive action.
- [ ] H2.13 Legal hold blocks destructive action.
- [ ] H2.14 Upload succeeds, if supported.
- [ ] H2.15 Upload rejected or interrupted, if supported.
- [ ] H2.16 Download denied and download succeeds, if supported.
- [ ] H2.17 Session expires during an operation.
- [ ] H2.18 Narrow mobile viewport and keyboard-only navigation.

## H3. Release checklist

- [ ] H3.1 Verify all active navigation routes.
- [ ] H3.2 Verify no broken imports or console errors.
- [ ] H3.3 Verify no secrets in built client assets.
- [ ] H3.4 Verify all API calls use the intended server/client boundary.
- [ ] H3.5 Verify no mock data is enabled in production paths.
- [ ] H3.6 Verify the frontend does not overstate backend capabilities.
- [ ] H3.7 Update route-to-API matrix.
- [ ] H3.8 Update frontend README or developer docs with setup and environment variables.
- [ ] H3.9 Capture final screenshots.
- [ ] H3.10 Produce a completion report with completed, blocked, deferred, and failed tasks.
- [ ] H3.11 Do not mark the transformation complete while any P0 security or privacy issue remains in the frontend path.

---

# 9. Suggested execution order for 0.dev

Do not attempt to build every screen at once. Execute in dependency order and keep the app runnable:

1. **Discovery:** Phase A; no visual redesign until route/API/auth inventory is complete.
2. **Foundation:** Phase B; tokens, shell primitives, accessibility, theme.
3. **Navigation:** Phase C; route structure and responsive shell.
4. **Core value:** D1 Overview → D2 Object Explorer → D3 Object Detail.
5. **Core preservation operations:** D4 Deposit (if supported) → D5 Integrity → D6 Retention/Holds.
6. **Trust and operations:** D7 Identity → D8 Activity → D9 Storage/Recovery.
7. **Future surfaces:** D10 Packages → D11 Diagnostics; advanced E-series only when backend-ready.
8. **Hardening:** Phase F security/resilience.
9. **Quality:** Phase G responsive/visual QA.
10. **Release:** Phase H tests, docs, screenshots, handoff.

At the end of each phase:
- [ ] Update this checklist with completed tasks.
- [ ] Run the narrowest relevant checks.
- [ ] Fix regressions before continuing.
- [ ] Record blockers with file/route/API references.
- [ ] Do not mark a task complete based only on generated code; verify behavior.

---

# 10. 0.dev autonomous execution instruction

You are responsible for carrying this transformation through, not merely proposing it.

1. Read this document completely.
2. Inspect the actual repository and current application before editing.
3. Create a granular implementation plan from the task IDs above. You may split a task into smaller subtasks, but do not remove its acceptance criteria.
4. Execute all tasks that are feasible with the current repository and backend.
5. When backend support is missing, implement a truthful unavailable/planned state and record the dependency; continue with other tasks.
6. Prefer existing stack, conventions, and dependencies. Do not rewrite the application or replace architecture without evidence that it is necessary.
7. Keep the app buildable after each phase.
8. Add/update tests as you implement behavior.
9. Update checkboxes only after verification, not after intention or code generation.
10. Do not stop after the first screen or after producing a mockup. Continue through the execution order until all feasible tasks are complete.
11. Do not fabricate data, endpoints, integrations, verification, backup, restore, or security guarantees.
12. Before finishing, run the full available validation suite and provide the exact results.
13. Provide a final handoff containing:
    - completed task IDs;
    - blocked task IDs and exact backend/API dependency;
    - deferred advanced ideas and why they are deferred;
    - routes/screens implemented;
    - route-to-API matrix location;
    - commands executed and pass/fail results;
    - screenshots or preview links if supported;
    - remaining risks and next recommended tasks.

**Completion standard:** a working, tested, truthful ECHOLOG operator console—not just a beautiful dashboard.

---

# 11. Product language and microcopy guardrails

Use concise, precise language. Prefer:

- “Digest verified” over “Authenticity proven”.
- “Bytes match recorded digest” over “This file is true”.
- “Backup configured” only when configuration is confirmed; “Backup verified” only after a successful restore/fixity check.
- “Not checked” instead of “Healthy” when no check exists.
- “Unavailable” instead of fabricated zero.
- “Standalone identity” versus “ARSY-federated identity”.
- “ECHOLOG storage events” instead of “MoonWitness audit trail” unless the latter is actually integrated and complete.

Avoid:
- “Tamper-proof”, “unhackable”, “permanent forever”, “legally certified”, “authentic source”, or “truth verified” without a precisely defined and independently substantiated guarantee.
- Fake percentages, decorative analytics, invented user counts, or placeholder events.
- Claims that a content hash proves authorship, truth, consent, or legal admissibility.

# 12. Final product experience

The finished console should feel like a precision archive instrument. It should make evidence status understandable without turning technical complexity into decoration. The operator should be able to move from an object to its digest, preservation history, access policy, and recovery evidence with minimal ambiguity.

**ECHOLOG does not ask users to trust a green badge. It gives them the information and tools to inspect what actually happened.**


## Implementation progress — pass 2 (6 November 2026)

The console now supports dedicated Next.js App Router paths for all nine workspace sections, digest-addressable object-detail paths, direct route restoration, browser back/forward synchronization, improved labels for key controls, safer delayed download URL cleanup, a configurable Next.js API proxy origin through `ECHOLOG_API_INTERNAL_URL`, and App Router loading, error, and not-found recovery surfaces. These are source-level implementation updates; runtime/browser verification remains pending. The pathname routes reuse the same authenticated console component; they do not add backend capabilities or bypass authorization.

## Implementation progress — pass 1 (6 November 2026)

The first working console pass is committed in `main`. The checklist above is updated only for tasks implemented or verified by source inspection. The UI currently supports standalone session login/logout, storage statistics, visible S3 alias browsing, object metadata/detail, copy-reference, grant-based download, deposit, retention/hold summaries, quota display, administrator GC, user/API-key administration, and standalone audit-log display. Unsupported fixity, preservation-package, backup, and restore capabilities remain unavailable/planned. See [route/API matrix](../apps/web/ROUTE_API_MATRIX.md) and [implementation handoff](FRONTEND_IMPLEMENTATION_HANDOFF.md).

**Validation is still pending:** no local pnpm execution or browser test has been run for this pass. Do not mark Phase H, visual QA, or the overall definition of done complete until CI/build and browser verification pass.


**Checklist snapshot after pass 2:** 108 items checked and 292 still open. Checked items include implementation/source-inspection tasks; this is not an end-to-end test pass. The GitHub Actions run for the latest recorded `main` revision was queued when this note was recorded; consult the repository Actions page for the current run. Local typecheck/build and browser checks remain unverified.