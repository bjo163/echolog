# Deploy ECHOLOG on Coolify

ECHOLOG is deployed as **one container** from the repository Dockerfile. Coolify handles the public domain, TLS, reverse proxy and isolated application network.

## Coolify setup

1. Create a new **Docker Compose** resource from this repository and select the desired branch (normally `main`).
2. Use the repository root as the Compose file location: `docker-compose.yml`.
3. Add a domain to the `echolog` service and set the container port to **3006**.
4. Add the required environment variables below in the Coolify resource.
5. Deploy. No host port mapping, custom Docker network, database service, or extra proxy container is required.

## Required environment variables

| Variable | Value |
|---|---|
| `ECHOLOG_ADMIN_LOGIN` | Initial administrator login |
| `ECHOLOG_ADMIN_PASSWORD` | Initial password; at least 12 characters |
| `ECHOLOG_GRANT_SECRET` | Random secret; at least 32 characters |
| `ECHOLOG_S3_BUCKET` | One valid bucket name |
| `ECHOLOG_S3_ACCESS_KEY_ID` | S3 access key ID |
| `ECHOLOG_S3_SECRET_ACCESS_KEY` | S3 secret access key |

Generate a grant secret with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The S3 bucket and credentials are required by the current production configuration validator. They must refer to a compatible S3 endpoint configured for ECHOLOG's supported deployment; do not leave them blank.

## Optional environment variables

- `ECHOLOG_S3_REGION` — defaults to `us-east-1`.
- `ECHOLOG_ARSY_URL` — MoonWitness ARSY Hub URL when federation is enabled.
- `ECHOLOG_SERVICE_KEY` — optional shared daemon credential; if set, use at least 32 characters.

Keep secrets in Coolify's environment configuration. Do not commit a production `.env` file.

## Networking

- The application listens on `0.0.0.0:3006` inside its container.
- Compose uses `expose: 3006`, not `ports:`. The service is reachable through Coolify's internal application network and reverse proxy.
- Do not publish `3006` directly on the host.
- Do not declare or manage a separate Docker network; Coolify attaches the resource to its managed network.
- Set the Coolify domain target to service `echolog`, port `3006`, HTTP scheme.

## Persistence and health

- Named volume `echolog-data` is mounted at `/data`.
- Both object storage and the SQLite operator database live under `/data/echolog`.
- The Dockerfile's readiness health check calls `/health/ready`.
- Back up the persistent volume and test restores independently. A named Docker volume is persistence, not an off-host backup.

## First deployment and administrator

On an empty volume, ECHOLOG creates the first administrator from `ECHOLOG_ADMIN_LOGIN` and `ECHOLOG_ADMIN_PASSWORD`. After the first successful boot, create/manage users through the supported user administration workflow and remove the bootstrap credentials from the Coolify environment. Changing bootstrap variables does not reset an existing administrator.

## Important deployment boundary

This Compose file deploys the **API/storage service only**. The Next.js operator console is not included in the current Dockerfile/runtime image and must not be assumed to be served by port 3006.
