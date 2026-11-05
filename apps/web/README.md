# ECHOLOG Web Console

Next.js 16 / React 19 operator console.

## Local development

Run the ECHOLOG API on port 3006, then from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @echolog/web dev
```

The web app listens on port 3106. By default, Next.js proxies `/api/*` and `/health/*` to `http://127.0.0.1:3006`.

## API proxy configuration

Set `ECHOLOG_API_INTERNAL_URL` to the API's reachable base URL when the API is not on the same host/network namespace as the frontend.

- Local default: `http://127.0.0.1:3006`
- Coolify example: `http://echolog-api:3006`

The frontend and API containers must share a private network for the Coolify example to resolve. Configure this value in the frontend build environment so the generated Next.js rewrite manifest contains the intended destination. Never expose service credentials or API keys to browser variables such as `NEXT_PUBLIC_*`.

## Validation

```bash
pnpm --filter @echolog/web typecheck
pnpm --filter @echolog/web build
```

See [the route/API matrix](./ROUTE_API_MATRIX.md) and [the implementation handoff](../../docs/FRONTEND_IMPLEMENTATION_HANDOFF.md) for supported capabilities and backend limitations.
