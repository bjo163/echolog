# Frontend Implementation Handoff

## Pass 7 — Web test suite

The web package now runs its own tests instead of relying on source inspection. Six suites, 38 tests, executed with `tsx --test` under Node 24:

| Suite | What it holds the console to |
|---|---|
| `test/api-client.test.ts` | Failure classification and remedies; a private-witness 404 explains the privacy rule; a digest conflict is reported as key immutability |
| `test/format.test.ts` | "Not available" never becomes `0`; timestamps carry a timezone and their ISO value; maturity wording is never upgraded |
| `test/table.test.ts` | Sorting, filtering, pagination clamping, selection counting; missing values sort last in both directions |
| `test/nav.test.ts` | Section ids are unique, hrefs resolve back to their section, unknown paths fall back to the overview |
| `test/upload-validate.test.ts` | Every rejection names the limit it broke; a near-full quota warns without blocking; a legal hold is surfaced before commit |
| `test/primitives.test.tsx` | Primitives rendered to static markup: tone classes, `role="alert"` only for a failed notice, a "Not available" value shown verbatim |

Validation executed on this revision:

| Command | Result |
|---|---|
| `pnpm typecheck` | Passed, 9/9 tasks |
| `pnpm --filter @echolog/web build` | Passed, routes `/`, `/_not-found`, `/[section]`, `/objects/[digest]` |
| `pnpm test` | Passed, 136 tests (api 98, web 38), 0 failures |

`apps/web/tsconfig.json` changed `"jsx": "preserve"` to `"react-jsx"` for the test run. Next.js compiles JSX with SWC regardless of this field; `preserve` left the classic transform in place under `tsx`, which made every component test fail with `React is not defined`. `next build` compiles and typechecks cleanly with the new value and leaves the file untouched. The `tsx` transform cache is keyed by file content rather than by this setting, so a cache written before the change replays the old output — delete the `tsx-*` directory in the OS temp folder if component tests fail with that error.

Integration tests against a live API (H1.7) were not run. Browser interaction, real viewport widths, keyboard traversal, screen readers, contrast, Docker readiness and CI remain unverified.

Running the API tests directly — rather than through the Turborepo cache — exposed three suites left behind by the experimental-surface hardening pass:

- `v2-expansions.test.ts` called `/v1/models`, `/v1/embeddings`, `/v1/chat/completions` and `/api/v1/analytics/overview` anonymously and expected `200`. Those routes are now service-only, so the suites assert the secure behaviour by issuing an administrator key; the anonymous `401`, the member `403` and the request-size limits stay asserted in `experimental-routes-auth.test.ts`.
- `nextgen-all.test.ts` started the server with `pgWirePort`, which now throws, and then spoke the PostgreSQL startup protocol over TCP. The wire gateway is retired and `echolog.test.ts` already asserts that enabling it is refused, so the TCP section is removed and the suite keeps the auto-ingestion and shape-sync coverage.

The API suite is 98 tests. `pnpm test` runs it through Turborepo, which replays cached results, so a green `pnpm test` is not by itself evidence that the API suite was executed — compare against `pnpm --filter @echolog/api test` after `pnpm --filter @echolog/api build` when the result matters.

## Pass 6 — Checklist reconciliation

Every open item in `docs/FRONTEND_PRODUCT_BRIEF.md` was re-audited against the current source. The console already implemented more than the checklist recorded, so 35 source-verified items are now marked: the shared data table, verification panel, event timeline, privacy indicator, JSON viewer and detail drawer; global search and the command palette; the diagnostics surface; retention and hold display, identity-mode reporting, audit filtering, the storage target, the package planned-state, the pre-upload validation and progress; and the request-behaviour items the console already satisfies. The checklist now records 168 checked and 232 open.

Nothing in the remaining open set is missing frontend code. The items are either browser/CI verification (contrast, keyboard traversal, screen-reader labels, real viewport widths, the visual pass, lint/format, component and integration tests, the release checklist) or capabilities the backend does not yet expose (durable verification history, quarantine/repair, receipts, packages, backup/restore, RPO/RTO, witness checkpoints, copy diversity, format watch, credential rotation, and every Phase E surface). For the latter the console shows an explicit unavailable or planned state rather than a control that cannot work.

## Pass 5 — Build repair and truthfulness corrections

Implemented in `main`:
- Repaired `components/ui/primitives.tsx` and `components/ui/layout.tsx`. Both files carried JSX attributes whose values were not quoted (`className=fine`, `role=status`, `aria-hidden=true`). The web app could not parse them, so the console had never been built from this revision.
- `lib/ui/json-viewer.tsx`'s `isExpandable` is now a type predicate, which removes the last remaining TypeScript error in the web package.
- The console follows the operating system colour-scheme preference when no saved `echolog-theme` value exists, and only persists a preference the operator actually chose.
- The shell shows when every core endpoint last answered together; a partial refresh does not update it.
- Corrected the Pass 3 claim about clearing failed panels. The console keeps the previous value of a panel whose endpoint failed and reports the failure in a console-level notice. It does not clear a panel to an empty state, because "the collection is empty" and "the endpoint could not be read" are different claims.

Validation executed on this revision:

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed (installed `lucide-react`, `cn`, PGlite patched versions) |
| `pnpm typecheck` | Passed, 9/9 tasks |
| `pnpm --filter @echolog/web build` | Passed, routes `/`, `/_not-found`, `/[section]`, `/objects/[digest]` |
| `pnpm test` | Passed, 96 tests, 0 failures |

Still unverified: browser interaction, responsive layouts at real viewport widths, keyboard-only traversal, screen-reader behaviour, contrast measurement, Docker build/readiness, and CI.

## Pass 4 — Readiness, preference, and data legibility

Implemented in `main`:
- Added a real `/health/ready` probe to the overview and service health surface.
- The UI distinguishes checking, ready, and unavailable; it does not infer health from storage statistics.
- System color preference is used when the browser has no saved ECHOLOG theme preference.
- Operational numeric values use tabular numerals for easier comparison.

## Pass 3 — Pathname routes and resilience

Implemented in `main`:
- Replaced hash-only workspace navigation with dedicated Next.js App Router paths for all nine sections.
- Added `/objects/<sha256-digest>` object detail routes with digest validation and session-aware metadata loading.
- Added a 15-second API timeout and safe network-unavailable messages.
- Isolated partial API failures and retained successful panels. A panel whose endpoint failed keeps its previous value and the failure is reported in the console-level notice; no panel is silently cleared to an empty state.
- Added a last-successful-refresh timestamp and a visible refresh action.
- Added client-side alias sorting (key, size, last modified), URL-persisted alias search (`?q=`), and explicit back-to-object-list navigation from detail pages.
- Prevented duplicate API-key and user administrator mutations.

Validation remains pending: the GitHub Actions queue has not returned a result, and no local pnpm or browser test was executed.

## Pass 2 — Navigation and deployment boundary

Implemented in `main`:
- Added real App Router pathname routes for all nine workspace areas and digest-addressable object details (`/objects/<sha256-digest>`).
- Added direct route restoration and browser back/forward through Next.js App Router. Object metadata loads only after session restoration.
- Added accessible labels to key icon-only and filter controls, plus `aria-current` for active navigation.
- Delayed download object-URL revocation to avoid racing the browser's download start.
- Made the Next.js API/health rewrite target configurable through `ECHOLOG_API_INTERNAL_URL`.
- Added App Router loading, error, and not-found fallbacks with safe recovery copy; error details are not exposed to the user.

Navigation status: workspace sections and object details now have distinct Next.js pathname routes while reusing the shared authenticated console component. Alias search state is preserved in the URL; pagination remains unavailable because the backend has no cursor contract.

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

## Security dependency remediation

Manifest updates target Next.js 16.4.5, Fastify 5.12.8, and the Next.js optional sharp dependency 0.35.5 or later. See [security patch report](SECURITY_DEPENDENCY_PATCH_2026-11.md). The lockfile refresh is CI-driven and remains unverified until the lockfile commit and version assertions succeed.

## Validation status

Passes 1 to 4 were committed without a local Node/pnpm execution environment, so typecheck, tests and the production build were **not verified** for that revision. Pass 5 supplies the missing evidence: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm --filter @echolog/web build` and `pnpm test` all pass locally, and the build-parsing defect they uncovered is fixed. Browser interaction, responsive screenshots, keyboard-only traversal, screen-reader behaviour, contrast measurement, Docker readiness and CI remain **unverified**. Do not treat this pass as release-certified until browser and CI checks run against this revision.

## Next verification
1. Exercise login, upload, alias list, detail, download, deletion denial under hold, GC authorization, key issuance/revocation and logout against a running API.
2. Verify desktop/tablet/mobile and dark/light.
3. Measure text and control contrast, and confirm keyboard-only traversal and screen-reader labels.
4. Confirm CI and the Docker build/readiness check on the current revision.
5. Resolve deployment topology: current minimal Coolify Compose deploys API/storage only. Separate frontend deployment needs a same-origin API proxy or carefully configured internal API origin.
