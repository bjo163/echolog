# Frontend Implementation Handoff

## Pass 2 — Navigation and deployment boundary

Implemented in `main`:
- Added shareable section hash links for all nine workspace areas and digest-addressable object detail links (`#object/<digest>`).
- Added browser back/forward synchronization and direct hash restoration on page load.
- Added accessible labels to key icon-only and filter controls, plus `aria-current` for active navigation.
- Delayed download object-URL revocation to avoid racing the browser's download start.
- Made the Next.js API/health rewrite target configurable through `ECHOLOG_API_INTERNAL_URL`.
- Added App Router loading, error, and not-found fallbacks with safe recovery copy; error details are not exposed to the user.

Navigation limitation: workspace and object details are addressable by URL hashes inside the existing single-page console. They are not separate Next.js pathname routes.

Deployment note: local default remains `http://127.0.0.1:3006`. For Coolify, set `ECHOLOG_API_INTERNAL_URL` on the frontend service to the API container's private service URL (for example `http://echolog-api:3006`) and attach both services to the same private network. Do not point a separate frontend container at its own `127.0.0.1`.

## Pass 1 — Core operator console

Implemented:
- Replaced the semantic-search prototype with an authenticated operator console.
- Added responsive sidebar, page shell, dark/light theme.
- Added sign-in, session restore, and logout using existing session routes.
- Added storage metrics and visible S3 alias explorer.
- Added object metadata detail, four-field reference copy, short-lived-grant download, and delete flow.
- Added upload using the existing byte-stream endpoint.
- Added retention/legal-hold summary.
- Added storage quota and administrator-only garbage collection.
- Added administrator user/API-key management and audit activity.
- Added truthful unavailable state for fixity verification.
- Added product-boundary/service information and route/API matrix.

Backend-dependent items not implemented:
- Durable fixity scans/history and repair workflows.
- Signed preservation receipts, BagIt export/import, OCFL validation.
- Backup inventory, restore drill, RPO/RTO evidence.
- ARSY federation discovery in browser session endpoint.
- User creation/password reset endpoint.

## Validation status
Changes were committed through GitHub repository APIs without a local Node/pnpm execution environment. Typecheck, tests, production build, browser interaction and responsive screenshot checks are **not verified**. The latest GitHub Actions run was queued at the last status check; no passing CI result is available yet. Check the repository Actions page for the current revision's result. Do not treat this pass as release-certified until CI/build and browser tests run against this revision.

## Next verification
1. pnpm install --frozen-lockfile
2. pnpm --filter @echolog/web typecheck
3. pnpm --filter @echolog/web build
4. Run root typecheck and API tests.
5. Exercise login, upload, alias list, detail, download, deletion denial under hold, GC authorization, key issuance/revocation and logout.
6. Verify desktop/tablet/mobile and dark/light.
7. Resolve deployment topology: current minimal Coolify Compose deploys API/storage only. Separate frontend deployment needs a same-origin API proxy or carefully configured internal API origin.
