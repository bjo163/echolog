# ECHOLOG — Frontend Product Brief
## For 0.dev · Operator Console · D19

Build a premium, production-minded operator console for **ECHOLOG — the Evidence Preservation Layer of MoonWitness**.

This is not a generic SaaS dashboard, cloud drive, file manager, database studio, crypto wallet, or Supabase clone. It is an instrument for operating a preservation service: calm, precise, inspectable, privacy-aware, and honest about evidence.

## Product promise
**Preserve the Original. Verify the Bytes. Keep the Record Inspectable.**

Make the preservation lifecycle visible:
Deposit → Identify → Receipt → Protect → Verify → Package → Recover → Migrate.

Do not invent functionality or API responses. Inspect existing app routes, contracts, SDK, auth and API before wiring controls. If an operation does not exist, show an unavailable/planned state rather than a fake button.

## Relationship to MoonWitness
Show this architecture in a compact context panel:

MoonWitness XV → ARSY / D00 (single Hub, canonical identity and authorization) → ECHOLOG / D19 (object memory and preservation) → approved consumer domains.

ECHOLOG is not the Hub or identity provider. In federated mode, ARSY/D00 owns canonical identity. Standalone mode may show its local operator identity as a separate mode.

## Visual direction
**Futuristic Archive / Dark Editorial / Precision Instrument.**

- Mature, restrained, high-contrast, technical and human.
- Dark-first with a complete light theme.
- Deep charcoal, graphite, warm ivory, moonlight silver; restrained cyan/teal for active verification, amber for caution, red only for failures.
- Strong editorial typography, clear data hierarchy, fine borders, subtle grid/film grain and precise spacing.
- Avoid neon cyberpunk, purple gradients, excessive glassmorphism, giant rounded cards, glowing sci-fi clutter, fake 3D charts and generic template-dashboard styling.
- Use motion only when it explains progress or state.

## Information architecture

1. **Overview:** service health, storage capacity, verification backlog, last successful fixity check, backup age, last restore proof. Show unavailable if API does not provide a metric.
2. **Objects:** searchable object explorer with digest, size, type, ingest time, retention, hold and privacy state.
3. **Object Detail:** original metadata, four-field reference, receipt if implemented, fixity history, access state and derivative links.
4. **Integrity Center:** scan queue, verification outcomes, mismatches, unavailable objects and quarantine. Never show a green integrity badge without a real check result.
5. **Preservation Packages:** export, package validation, restore and import history. Keep disabled/planned until real APIs exist.
6. **Storage & Recovery:** configured volume, real capacity, backup destination, independent copies, restore evidence and RPO/RTO only when measured.
7. **Retention & Legal Holds:** policy state, expiry, hold and destructive-action confirmation.
8. **Access & Identity:** standalone vs ARSY-federated mode, scoped principals and credentials. Never reveal stored secrets.
9. **Activity:** ECHOLOG storage events only, not ecosystem-wide audit.
10. **Settings / Diagnostics:** safe operational configuration and build metadata.

Global shell: product mark, environment badge, identity/mode indicator, global search/command palette, notifications, theme, help and service connectivity.

## Key behavior

- **Overview:** real API values only. Distinguish current, stale, unavailable and unknown. No fabricated percentages, storage savings, uptime or backup health.
- **Object explorer:** respect authorization and private-witness hiding. Never expose private-object existence through counts, suggestions, snippets or error details.
- **Object detail:** show object key, SHA-256 digest, size, content type, ingest timestamp, retention, legal hold, privacy and authorized access. Explain that digest verifies byte consistency, not truth or authorship.
- **Integrity center:** show actual records with timestamp, checker, expected/observed digest and result: verified, mismatch, unavailable, not_checked.
- **Preservation packages:** future UI for BagIt export, independent validation, restore and import. Non-interactive until APIs and validators exist.
- **Storage/recovery:** do not imply replication from multiple paths or volumes. Show failure domains and copies only when independence and fixity are verified. Show RPO/RTO only after restore drills.
- **Retention/holds:** explain consequences before destructive operations, require explicit confirmation and show server result.
- **Access/identity:** never expose service keys or signing secrets. Show key IDs/status/rotation dates only if safely available.

## Technical constraints
- Existing stack: Next.js 16 App Router, React 19, TypeScript.
- Reuse existing typed contracts and SDK where correct; do not duplicate API types.
- Keep all service secrets server-side.
- Respect ARSY/D00 auth boundary and private-witness policy.
- Implement loading, empty, stale, unavailable, unauthorized and error states.
- Accessible keyboard navigation, focus states, semantic tables, responsive layout and reduced-motion support.
- Dark/light theme must be complete.
- No fake chart data or placeholder success toast.
- Experimental capabilities must be labeled and disabled unless actually supported.

## Deliverables
- Complete responsive operator shell and navigation.
- Overview, object explorer, object detail and integrity center as first usable flows.
- Preservation package and recovery surfaces clearly staged for future APIs.
- Reusable components for status, digest display, event timeline, verification result, retention/hold, copy reference and confirmation.
- Consistent empty/error/loading states.
- README/screenshots and route-to-API mapping showing which UI actions are implemented.

## Quality bar
A user should immediately understand what is stored, what was checked, what is protected, what is unavailable, and what recovery evidence exists. The UI must never look more certain than the backend.
