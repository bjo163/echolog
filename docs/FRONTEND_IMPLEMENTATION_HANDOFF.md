# Frontend Implementation Handoff

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
Changes were committed through GitHub repository APIs without a local Node/pnpm execution environment. Typecheck, tests, production build, browser interaction and responsive screenshot checks are **not verified**. Do not treat this pass as release-certified until CI/build and browser tests run against this revision.

## Next verification
1. pnpm install --frozen-lockfile
2. pnpm --filter @echolog/web typecheck
3. pnpm --filter @echolog/web build
4. Run root typecheck and API tests.
5. Exercise login, upload, alias list, detail, download, deletion denial under hold, GC authorization, key issuance/revocation and logout.
6. Verify desktop/tablet/mobile and dark/light.
7. Resolve deployment topology: current minimal Coolify Compose deploys API/storage only. Separate frontend deployment needs a same-origin API proxy or carefully configured internal API origin.
