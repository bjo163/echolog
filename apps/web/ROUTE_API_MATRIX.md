# ECHOLOG Frontend Route / API Matrix

Implementation pass 2 · updated against current source.

| Screen | API source | Auth | UI status | Limitation |
|---|---|---|---|---|
| Sign in/session/logout | POST/GET/DELETE /api/v1/session | Public login/session | Implemented | HttpOnly cookie |
| Overview | GET /api/v1/storage/stats | Required | Implemented | No physical disk or backup metrics |
| Object explorer | GET /api/v1/s3-keys | Required | Implemented | Alias list is not full CAS inventory |
| Object detail | GET /api/v1/objects/sha256/:digest/meta | Required | Implemented | Hidden objects return not found |
| Download | GET /api/v1/objects/sha256/:digest then grant URL | Required | Implemented | Short-lived grant |
| Delete | DELETE /api/v1/objects/sha256/:digest | Required | Implemented | Server enforces retention/hold |
| Deposit | POST /api/v1/objects | Required | Implemented | Server allow-list and size limits |
| Retention | GET /api/v1/storage/stats and /api/v1/s3-keys | Required | Implemented | Per-object view only for visible aliases |
| Storage/GC | GET /api/v1/storage/stats, POST /api/v1/gc | GC admin | Implemented | Quota is not disk capacity |
| Users/API keys | GET /api/v1/users, GET /api/v1/keys, PATCH /api/v1/users/:login, POST/DELETE /api/v1/keys | Admin | Implemented | No create-user/password-reset route |
| Activity | GET /api/v1/audit-logs?limit=100 | Admin | Implemented | Standalone service audit only |
| Integrity | No fixity endpoint | — | Unavailable state | No durable fixity API |
| Packages/recovery | No export/restore endpoints | — | Deferred | Backend capability absent |
| Settings | Browser theme preference | Session | Implemented | No server settings mutation |

## Navigation and deployment

- Workspace sections are addressable by hash: `#overview`, `#objects`, `#deposit`, `#integrity`, `#retention`, `#storage`, `#access`, `#activity`, and `#settings`.
- Hash changes support direct opening, refresh, and browser back/forward. These are section deep links inside the single-page console, not separate Next.js pathname routes; object details do not yet have their own URL.
- Next.js rewrites `/api/*` and `/health/*` to `ECHOLOG_API_INTERNAL_URL` when set. Default is `http://127.0.0.1:3006` for local development. In Coolify, set it to the API service's internal DNS URL, for example `http://echolog-api:3006`, on a shared private network.

## Safety
- Calls use same-origin /api routes and browser credentials.
- No service secret or API key is embedded in client code.
- The object list is labelled S3 aliases, not complete CAS inventory.
- No verification badge is shown because no fixity report endpoint exists.
- Identity mode is explicitly labelled standalone.
