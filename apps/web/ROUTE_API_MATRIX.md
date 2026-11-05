# ECHOLOG Frontend Route / API Matrix

Updated in implementation pass 9 (6 November 2026) and verified against the client functions the console actually calls in `@echolog/shared`, not against endpoint names.

| Screen | API source | Auth | UI status | Limitation |
|---|---|---|---|---|
| Sign in / session / logout | POST and DELETE `/api/v1/session`; GET `/api/v1/me` | Public login; session required afterwards | Implemented | httpOnly cookie; no token is kept in state, storage or a bundle |
| Service readiness | GET `/health/ready` | Public | Implemented | API and storage readiness probe; not a subsystem health or SLO report |
| Instance facts | GET `/api/v1/console/runtime` | Required | Implemented | Identity mode, environment, version and capability set come from the answering instance, never from a label |
| Overview | GET `/api/v1/storage/stats` | Required | Implemented | No physical disk or backup metrics; readiness and runtime facts are shown separately |
| Object explorer | GET `/api/v1/s3-keys` | Required | Implemented | Alias list is not full CAS inventory |
| Object detail | GET `/api/v1/objects/sha256/:digest/meta` | Required | Implemented | A private-witness object answers with the same not-found response as a missing one |
| Download | GET `/api/v1/objects/sha256/:digest` for a grant, then the grant URL | Required | Implemented | Short-lived grant, never a durable reference |
| Delete | DELETE `/api/v1/objects/sha256/:digest` | Required | Implemented | Server enforces retention and legal hold |
| Deposit | POST `/api/v1/objects` | Required | Implemented | Server allow-list and size limits; retention and hold travel as headers |
| Retention | GET `/api/v1/storage/stats` and `/api/v1/s3-keys` | Required | Implemented | No per-object retention policy endpoint; the per-object view covers visible aliases only |
| Storage / GC | GET `/api/v1/storage/stats`, POST `/api/v1/gc` | GC is admin only | Implemented | Quota is not disk capacity |
| Users / API keys | GET `/api/v1/users`, GET `/api/v1/keys`, PATCH `/api/v1/users/:login`, POST and DELETE `/api/v1/keys` | Admin | Implemented | No create-user or password-reset route |
| Activity | GET `/api/v1/audit-logs?limit=100` | Admin | Implemented | Standalone ECHOLOG service audit only |
| Integrity | GET `/api/v1/analytics/overview` for the last aggregate scan, POST `/api/v1/analytics/scrub` to re-hash now | Admin | Aggregate only | Real byte-level re-hash, but the report is aggregate and in-process; no durable per-object verification history |
| Experimental realtime stream | GET `/api/v1/realtime/stream` | Admin or service credential | Authenticated | Privileged operators only; event-level ACL not implemented |
| Experimental realtime broadcast | POST `/api/v1/realtime/broadcast` | Admin or service credential | Authenticated | Privileged event publication only |
| Experimental analytics scrub | POST `/api/v1/analytics/scrub` | Admin or service credential | Authenticated | Administrative action; recorded, not reversible |
| OpenAI-compatible models / embeddings / chat | `/v1/models`, `/v1/embeddings`, `/v1/chat/completions` and their `/api/v1` aliases | Authenticated principal | Authenticated | Bounded request sizes; not an external model provider |
| Packages / recovery | No export or restore endpoints | — | Deferred | Backend capability absent |
| Settings | Browser theme preference | Session | Implemented | No server settings mutation route |

## Navigation and deployment

- Workspace sections use real App Router paths: `/`, `/overview`, `/objects`, `/deposit`, `/integrity`, `/retention`, `/storage`, `/access`, `/activity`, and `/settings`.
- Object details use `/objects/<sha256-digest>` and validate the digest shape before rendering.
- Direct route loads restore the correct section; browser back/forward uses Next.js App Router.
- Object metadata is fetched only after the operator session has been restored.
- Alias search is preserved in `?q=`; safe client-side sorting supports alias, size, and last-modified time. No server pagination is claimed, because the API exposes no cursor contract.
- The Overview health indicator reads `/health/ready`; it does not infer health from statistics success.
- These routes reuse the same authenticated console component; they do not introduce new API capabilities or bypass backend authorization.
- Next.js rewrites `/api/*` and `/health/*` to `ECHOLOG_API_INTERNAL_URL` when set. Default is `http://127.0.0.1:3006` for local development. In Coolify, set it to the API service's internal DNS URL, for example `http://echolog-api:3006`, on a shared private network.

## Safety

- Calls use same-origin `/api` routes and browser credentials.
- No service secret or API key is embedded in client code.
- Experimental realtime, analytics, and OpenAI-compatible routes authenticate requests; privileged telemetry, scrub, stream, and broadcast actions require administrator or service authority. `apps/api/test/experimental-routes-auth.test.ts` asserts the anonymous `401`, the member `403`, and the bounded request sizes.
- The object list is labelled S3 aliases, not complete CAS inventory.
- No verification badge is claimed beyond what the aggregate scan actually reports; there is no per-object fixity endpoint.
- Identity mode is reported by `/api/v1/console/runtime`, never guessed from a display name.
