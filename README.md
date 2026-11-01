# ECHOLOG

Content-addressed object storage as a standalone service: one filesystem volume, two
surfaces (a small REST API and a bounded S3-compatible endpoint), and its own operator
identity store. No Hub, no Postgres, no message queue, no shared UI library — `pnpm
install --frozen-lockfile` resolves everything from public npm or Node builtins.

Objects are addressed by their SHA-256 digest and are **write-once**: re-uploading the
same bytes is an idempotent no-op that returns the original key, while different bytes at
an existing key are refused with `409`. Retention deadlines and legal holds are decided at
ingest and enforced fail-closed on delete.

## Requirements

- **Node `>=24 <25`** — the identity store uses the builtin `node:sqlite`, so there is no
  native dependency and no database container.
- pnpm `10.33.4` (declared in `package.json` under `packageManager`; enable it with
  `corepack enable`).

## Quick start

```bash
pnpm install --frozen-lockfile
cp .env.example .env            # then fill in the grant secret and, for production, S3
pnpm user:add --login operator-1 --role admin --key   # first account, or set the bootstrap pair
pnpm dev                        # http://127.0.0.1:3006
curl -s http://127.0.0.1:3006/health/ready
```

On the very first boot the service refuses to start unless accounts exist: either
`ECHOLOG_ADMIN_LOGIN` + `ECHOLOG_ADMIN_PASSWORD` are set together (the password needs at
least 12 characters), or `pnpm user:add` is run against an empty store.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Run from source with reload, reading `.env` if present. |
| `pnpm build` | `tsc -b` the service into `dist/`. |
| `pnpm start` | Run the built service, reading `.env` if present. |
| `pnpm test` | The whole suite on a throwaway temp volume — no external service needed. |
| `pnpm typecheck` | Service, tests and console types. |
| `pnpm user:add` | Add an operator account (and optionally one API key) to the store. |
| `pnpm client:dev` | Console dev server on `127.0.0.1:3106`, proxying `/api` and `/health` to `:3006`. |
| `pnpm build:client` | Static console bundle into `dist/client/`. |

## Configuration

Every value is an environment variable; `--port` may also be passed on the command line.

| Variable | Default | Notes |
| --- | --- | --- |
| `ECHOLOG_HOST` | `127.0.0.1` | Loopback is the intended binding; expose via a proxy. |
| `ECHOLOG_PORT` | `3006` | |
| `NODE_ENV` | `development` | `production` turns on the required-value checks below. |
| `ECHOLOG_DATABASE_PATH` | `./data/echolog/echolog.db` | Identity store: users, sessions, API keys. |
| `ECHOLOG_STORAGE_ROOT` | `./data/echolog` | Resolved to an absolute path at startup. |
| `ECHOLOG_STORAGE_QUOTA_BYTES` | `10737418240` | Over quota answers `507 quota_exceeded`. |
| `ECHOLOG_MAX_UPLOAD_BYTES` | `52428800` | Larger streams answer `413 too_large`. |
| `ECHOLOG_ALLOWED_MIME_TYPES` | 13-type list | Comma-separated; anything else answers `415`. |
| `ECHOLOG_SESSION_TTL_HOURS` | `168` | Capped at 90 days. |
| `ECHOLOG_COOKIE_SECURE` | `auto` | `auto` means `Secure` only in production. |
| `ECHOLOG_ADMIN_LOGIN` / `ECHOLOG_ADMIN_PASSWORD` | empty | First-boot bootstrap admin; both or neither. |
| `ECHOLOG_GRANT_SECRET` | empty | ≥ 32 characters. **Required in production.** |
| `ECHOLOG_SERVICE_KEY` | empty | Optional `x-echolog-key` daemon credential, 32-256 characters. |
| `ECHOLOG_ARSY_URL` | empty | Optional Hub base URL; see *Hub federation*. |
| `ECHOLOG_S3_BUCKET` | empty | One bucket. **Required in production.** |
| `ECHOLOG_S3_REGION` | `us-east-1` | |
| `ECHOLOG_S3_ACCESS_KEY_ID` / `ECHOLOG_S3_SECRET_ACCESS_KEY` | empty | Both or neither; max 128 / 256 characters. |

## Authentication

Two credential kinds, both verified against the local SQLite store — there is no outbound
call on the request path, so an unreachable identity provider cannot take storage down:

- `Authorization: Bearer ecl_…` — a machine API key. Only its SHA-256 hash is stored, next
  to a 12-character display prefix; `kind: key` principals carry the key's name as uploader.
- `Cookie: echolog_session=…` — an operator session from `POST /api/v1/session`. The token
  is random, stored only as a SHA-256 hash, expires server-side, and is deleted on logout.
  Sign-in is rate limited to 10 attempts per login name per 60 seconds; passwords are
  scrypt (`N=16384`, 64-byte key).

Roles are `admin` and `member`. Admin is required to sweep GC, to set `x-echolog-legal-hold`
while uploading, to read the metadata or a grant of a private-witness digest, and to confirm
a marker for an object that the caller did not upload.

## Hub federation (optional)

By default this service answers for itself. Two environment variables switch on an
integration with a MoonWitness Hub, and both are off when empty:

| Kind | Header | Resolved by |
| --- | --- | --- |
| `key` | `Authorization: Bearer ecl_…` | this instance (hashed, revocable) |
| `session` | `Cookie: echolog_session=…` | this instance (hashed, expiring) |
| `service` | `x-echolog-key: …` (`ECHOLOG_SERVICE_KEY`) | shared secret, constant-time compare |
| `arsy` | `Authorization: Bearer <hub session>` (`ECHOLOG_ARSY_URL`) | the Hub's own `GET /api/v1/auth/me`, cached 2 s |

When `ECHOLOG_ARSY_URL` is set, a bearer that is not an `ecl_` key is handed to the Hub and
the returned `login`/`role` becomes the principal — this is the shape ARSY's witness client
(`packages/moonql-witness` upstream) speaks. For **Hub subjects**, reading a private-witness
digest requires the Hub's `POST /api/v1/witness/private-media-authorize` to answer 204; a
refusal is `404` and an unreachable Hub is `503`, never an implicit yes. Credentials of this
instance keep this instance's rule and are **never forwarded to the Hub as a subject**, so
enabling federation cannot leak a local key into a Hub call.

A `service` principal may upload, set legal hold and sweep GC, and may not read
private-witness bytes, manage operator accounts or issue API keys.

## REST surface

| Route | Purpose |
| --- | --- |
| `POST /api/v1/objects` | Upload raw bytes. `Content-Type` from the allow-list, optional `x-filename`, `x-echolog-retention-until`, `x-echolog-legal-hold: true` (admin), `x-echolog-private-witness: true`. `201` returns the sidecar. |
| `GET /api/v1/objects/sha256/:digest/meta` | Full sidecar (admin for a marked digest). |
| `GET /api/v1/objects/sha256/:digest` | A download grant: `{ url, expires_at }`, valid at most 5 minutes (admin for a marked digest). |
| `DELETE /api/v1/objects/sha256/:digest` | `409 legal_hold` / `409 retention_active` while protected. |
| `POST /api/v1/objects/sha256/:digest/private-witness` | Confirm the irreversible private marker for a digest. |
| `POST /api/v1/gc` | Admin sweep of expired, unreferenced objects; reports `deleted`, `held`, `bytes_freed`. |
| `POST /api/v1/session` · `GET /api/v1/session` · `DELETE /api/v1/session` | Sign in, inspect, sign out. |
| `GET /api/v1/me` | Current principal (`login`, `role`, `kind`). |
| `GET /api/v1/keys` · `POST /api/v1/keys` · `DELETE /api/v1/keys/:prefix` | Admin credential list, issue (secret shown once), revoke. |
| `GET /api/v1/users` · `PATCH /api/v1/users/:login` | Admin account list; `disabled` toggles lock-out and deletes that account's live sessions. |
| `GET /health` · `GET /health/ready` | Liveness and a real storage write/read probe. |

Two self-lockout guards exist on purpose: the API key authenticating a request cannot revoke
itself, and an account cannot disable itself — each answers `409 self_lockout`.

Error bodies are always `{ "error": { "code", "message" } }`, with `400`
(`invalid_body`, `invalid_retention`, `invalid_header`), `401` (`unauthorized`,
`auth_unavailable`), `403`, `404`, `409`, `413`, `415`, `503` and `507 quota_exceeded`.
Request logging is disabled and every response carries an HSTS header, so signatures,
keys and tokens never reach the logs.

Consumers persist **only** the four reference fields `{ object_key, digest, size,
content_type }` — never a byte copy, never a grant URL, never a searchable metadata mirror.

## Bounded S3-compatible endpoint

Path-style, one configured bucket, SigV4 `AWS4-HMAC-SHA256` **Authorization-header**
requests with a signed payload and five-minute clock tolerance, using `ECHOLOG_S3_*`
credentials. Supported: `HeadBucket`, single-request `PutObject`, `GetObject`,
`HeadObject`, `DeleteObject`, `ListObjectsV2` (prefix, delimiter, `max-keys` 0–1000,
continuation token, `start-after`, UTF-8 byte order). `ETag` is the payload MD5;
`x-amz-meta-echolog-digest` carries the SHA-256 content address; retention and hold travel
as signed `x-amz-meta-echolog-retention-until` / `x-amz-meta-echolog-legal-hold`.

Explicitly refused: multipart and batch delete, browser POST policy, versions, ACLs,
object lock, presigned or query-string signatures, `UNSIGNED-PAYLOAD`, chunked signatures,
virtual-hosted style, and keys with dot segments or percent-encoded separators. This is not
full AWS S3 compatibility — treat it as a protocol subset.

A private-witness digest is hidden across **every** S3 alias: get/head/delete answer `404`,
listings omit it, and GC protects the bytes — so a SigV4 bucket credential cannot read
media that its per-record ACL forbids.

## On-disk layout

`ECHOLOG_STORAGE_ROOT` holds `objects/` (bytes named by digest), `metadata/` (sidecars),
`s3-keys/` (the S3 key → digest index), `private-witness/` (marker files), and `tmp/`
(in-flight uploads). Everything is plain filesystem state: stop the service, copy the
volume, start again — the M39-12 round-trip test asserts exactly that, including that the
credential store survives next to the objects and that holds still refuse deletes after a
restart. Back up the SQLite file with `sqlite3 <path> ".backup '<target>'"` or while the
service is stopped (WAL mode leaves `-wal`/`-shm` companions that must travel together).

## Operator console

`client/` is a static React app built on **shadcn/ui** (neutral base, dark by default, Geist
shipped through `@fontsource-variable`) with Vite and Tailwind v4. Start the service on
`:3006` and run `pnpm client:dev` for the console on `127.0.0.1:3106`; the dev server proxies
`/api` and `/health` so the session cookie stays first-party and no CORS surface is needed.
`pnpm build:client` produces `dist/client/`, which any static host can serve in front of the
service.

Four tabs: **Objects** (digest lookup, sidecar, five-minute grant, delete, watchlist, admin
garbage collection), **Upload** (content address preview, allow-list type, retention, legal
hold, private-witness marker), **Credentials** and **Accounts** (admin only).

The rules the console keeps:

- It authenticates with the operator's own session cookie or `ecl_` API key. The
  grant-signing secret and the S3 SigV4 pair never reach the browser bundle.
- `@moonwitness/moonui` is a monorepo package and must not be imported here; shadcn/ui is the
  only UI system in this repository.
- Views never choose a color. `client/lib/format.ts` decides what a state *means* (`scan:
  skipped` is never rendered as scanned) and `client/lib/tone.ts` is the only place a tone
  becomes a theme token.
- The watchlist persists only `{ object_key, digest, size, content_type }` — names, uploaders
  and tokens are projected away before anything reaches `localStorage`.
- A server refusal is shown verbatim. `409 legal_hold` and `409 self_lockout` arrive in the
  service's own words, and the console never retries a refusal.

Layers that need no browser are tested in the normal suite (`test/console-lib.test.ts`):
cookie-only credential calls, the verbatim failure pass-through, and the tone table.

## Provenance and the one contract deviation

This service was extracted from the MoonWitness XV monorepo (`apps/echolog`,
`@moonwitness/echolog`), where the upstream contract in `docs/architecture/ECHOLOG.md` /
ADR-0007 declares ECHOLOG stateless: "owns no tables and imports no SQL driver", "D00 stays
in ARSY… no cookies, no login endpoint". The standalone build deliberately inverts that:
it owns three SQLite tables (`users`, `sessions`, `api_keys`) and its own login, because a
service published on its own cannot depend on somebody else's identity provider. Everything
else — the storage model, write-once keys, hold semantics, the S3 subset, the private-witness
rules and the four-field consumer reference — is unchanged from that contract.

The same extraction also means this repository can serve the Hub it came out of: set
`ECHOLOG_ARSY_URL` and `ECHOLOG_SERVICE_KEY` and it speaks ARSY's bearer-federation and
service-key contract (see *Hub federation*), which is what makes withdrawing `apps/echolog`
from the monorepo possible without taking D06 private-media protection down with it.

Known gap: object-level key rotation is available through the console and the REST routes, but
the CLI only creates accounts (`pnpm user:add`).

## Checks

`pnpm typecheck && pnpm build && pnpm build:client && pnpm test` must pass. The suite covers
the filesystem driver, size/MIME/quota limits, key authentication and grants, the S3 SigV4
verifier, the upload limiter, admin credential and account routes, the operator client layer,
the REST routes, and the end-to-end round trip that restarts the service on a live volume.
